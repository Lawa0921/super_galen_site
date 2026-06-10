import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Wallet } from 'ethers';
import { FfaMatch } from '@scripts/games/tetris/engine/ffa';
import type { InputAction } from '@scripts/games/tetris/engine/game';
import { buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import type { FfaReplay } from '@scripts/games/tetris/net/ffaReplay';

/**
 * 取乾淨單例（無 Upstash env → MemoryRankStore），端點與 ranking 共用同一單例。
 * 每個 case 先 vi.resetModules() 再 import 端點。
 */
async function loadPost() {
  const mod = await import('./ffa-match');
  return mod.POST;
}

/** 建一個 Astro APIContext 風格的呼叫物件（只用到 request / clientAddress）。 */
function ctx(body: unknown, method = 'POST') {
  const request = new Request('http://localhost/api/ffa-match', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return { request, clientAddress: '127.0.0.1' } as never;
}

/**
 * 用 N 個 wallet 建一場可重現的 FFA 局：P0 狂 hardDrop 先死、其餘不動。
 * matchId 的第二段以 seed 的 base36 編碼（與 1v1 match.ts 的 seed 綁定一致）。
 */
function buildScenario(seed: number, n: number) {
  const wallets = Array.from({ length: n }, () => Wallet.createRandom());
  const playerIds = wallets.map((w) => w.address);

  const match = new FfaMatch(playerIds, { seed });
  const events: FfaReplay['events'] = [];
  let f = 0;
  for (; f < 10000 && match.phase === 'playing'; f++) {
    const actions: InputAction[] = f % 2 === 0 ? ['hardDrop'] : [];
    if (actions.length) events.push({ f, p: playerIds[0], a: actions });
    for (const act of actions) match.input(playerIds[0], act);
    match.step(1000 / 60);
  }
  const standings = match.getStandings();
  const replay: FfaReplay = { seed, playerIds, frameCount: f, events };
  const matchId = `ffa-${seed.toString(36)}-room1`;
  return { wallets, playerIds, standings, replay, matchId };
}

/** 為某 wallet 對 (matchId, standings) 產生合法簽章。 */
async function sign(wallet: Wallet, matchId: string, standings: string[]) {
  const placements = standings.map((_, i) => i + 1);
  const msg = buildFfaResultMessage(matchId, standings, placements);
  return wallet.signMessage(msg);
}

beforeEach(() => {
  vi.resetModules();
});

describe('POST /api/ffa-match — 基本參數防護', () => {
  it('非 POST → 400', async () => {
    const POST = await loadPost();
    const res = await POST(ctx(undefined, 'GET'));
    expect(res.status).toBe(400);
  });

  it('壞 JSON → 400', async () => {
    const POST = await loadPost();
    const request = new Request('http://localhost/api/ffa-match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    const res = await POST({ request, clientAddress: '127.0.0.1' } as never);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad json');
  });

  it('缺必要欄位 → 400', async () => {
    const POST = await loadPost();
    const res = await POST(ctx({ matchId: 'ffa-1-x' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ffa-match — seed 綁定與 replay 抽驗', () => {
  it('replay.seed 與 matchId 內嵌 seed 不符 → 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay } = buildScenario(42, 3);
    // matchId 的 seed 段刻意與 replay.seed 不同
    const matchId = `ffa-${(99).toString(36)}-room1`;
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings, signature: sig, replay }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('seed');
  });

  it('replay 與宣稱 standings 不符（竄改名次）→ 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(42, 3);
    const tampered = [...standings].reverse(); // 竄改名次
    const sig = await sign(wallets[0], matchId, tampered);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings: tampered, signature: sig, replay }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/ffa-match — 簽章驗證', () => {
  it('壞簽章 / reporterId 與還原地址不符 → 401', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(42, 3);
    // 用 wallet[0] 簽，但宣稱 reporterId 是 wallet[1] → 還原地址不符
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[1].address, standings, signature: sig, replay }),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/ffa-match — 共識結算', () => {
  it('首位回報 → pending（未達門檻）', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(42, 3); // 門檻 ceil(3/2)=2
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings, signature: sig, replay }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('pending');
  });

  it('達門檻一致回報 → applied，再次回報 → already', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(42, 3); // 門檻 2

    const r1 = await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        signature: await sign(wallets[0], matchId, standings),
        replay,
      }),
    );
    expect(r1.status).toBe(200);
    expect((await r1.json()).outcome).toBe('pending');

    const r2 = await POST(
      ctx({
        matchId,
        reporterId: wallets[1].address,
        standings,
        signature: await sign(wallets[1], matchId, standings),
        replay,
      }),
    );
    expect(r2.status).toBe(200);
    expect((await r2.json()).outcome).toBe('applied');

    // 第三位再回報（已結算）→ already
    const r3 = await POST(
      ctx({
        matchId,
        reporterId: wallets[2].address,
        standings,
        signature: await sign(wallets[2], matchId, standings),
        replay,
      }),
    );
    expect(r3.status).toBe(200);
    expect((await r3.json()).outcome).toBe('already');
  });

  it('client 提供的 ratings 被忽略（防偽造基底分數）：結算後分數由後端基底算出', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(77, 3); // 門檻 2
    // 兩位回報者都附上偽造 ratings（宣稱冠軍基底 9000 分）
    const forged: Record<string, number> = {};
    for (const id of standings) forged[id.toLowerCase()] = 9000;
    await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        signature: await sign(wallets[0], matchId, standings),
        replay,
        ratings: forged,
      }),
    );
    const res = await POST(
      ctx({
        matchId,
        reporterId: wallets[1].address,
        standings,
        signature: await sign(wallets[1], matchId, standings),
        replay,
        ratings: forged,
      }),
    );
    expect((await res.json()).outcome).toBe('applied');

    // 端點必須以後端讀到的基底（新玩家=DEFAULT_RATING）計分，偽造的 9000 不得生效
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    const { DEFAULT_RATING } = await import('@scripts/games/tetris/net/elo');
    const champ = await getRankStore().getPlayer(standings[0].toLowerCase());
    expect(champ).not.toBeNull();
    expect(champ!.rating).toBeGreaterThan(DEFAULT_RATING); // 冠軍漲分
    expect(champ!.rating).toBeLessThan(DEFAULT_RATING + 100); // 但絕非 9000 基底
  });

  it('回報者不在 standings 內（非參與者）→ 403', async () => {
    const POST = await loadPost();
    const { standings, replay, matchId } = buildScenario(42, 3);
    const outsider = Wallet.createRandom(); // 簽章有效，但不是對局參與者
    const sig = await sign(outsider, matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: outsider.address, standings, signature: sig, replay }),
    );
    expect(res.status).toBe(403);
  });

  it('standings 人數 < 3 → 400（2 人必須走 1v1 /api/match 雙方確認路徑）', async () => {
    const POST = await loadPost();
    const res = await POST(
      ctx({
        matchId: 'ffa-1-x',
        reporterId: '0x0000000000000000000000000000000000000001',
        standings: ['0xa', '0xb'],
        signature: '0xsig',
        replay: { seed: 1, playerIds: [], frameCount: 0, events: [] },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('player count');
  });

  it('standings 人數 > 8 → 400（超出對局人數上限）', async () => {
    const POST = await loadPost();
    const nine = Array.from({ length: 9 }, (_, i) => `0x${i}`);
    const res = await POST(
      ctx({
        matchId: 'ffa-1-x',
        reporterId: nine[0],
        standings: nine,
        signature: '0xsig',
        replay: { seed: 1, playerIds: [], frameCount: 0, events: [] },
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('player count');
  });

  it('未提供 ratings 時由後端讀現有分數，仍能結算', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(123, 3); // 門檻 2
    await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        signature: await sign(wallets[0], matchId, standings),
        replay,
      }),
    );
    const res = await POST(
      ctx({
        matchId,
        reporterId: wallets[1].address,
        standings,
        signature: await sign(wallets[1], matchId, standings),
        replay,
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).outcome).toBe('applied');
  });
});
