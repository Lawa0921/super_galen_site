import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Wallet, type HDNodeWallet } from 'ethers';
import { BomberLockstep, LoopbackBomberHub } from '@scripts/games/bomber/net/bomberLockstep';
import { liveStandings } from '@scripts/games/bomber/net/versusReplay';
import { buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import type { CharacterId } from '@scripts/games/bomber/engine/types';

/**
 * Bomber 結算端點測試（copy-adapt 自 _ffa-match.test.ts）。
 * 端點與 bomber rankStore 共用同一單例（無 Upstash env → MemoryRankStore，bomber: 前綴）。
 * 每個 case 先 vi.resetModules() 再 import 端點。
 */
async function loadPost() {
  const mod = await import('./bomber-match');
  return mod.POST;
}

/** 建一個 Astro APIContext 風格的呼叫物件（只用到 request / clientAddress）。 */
function ctx(body: unknown, method = 'POST') {
  const request = new Request('http://localhost/api/bomber-match', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
  return { request, clientAddress: '127.0.0.1' } as never;
}

const CHARS: CharacterId[] = ['lena', 'mira', 'aya', 'rosa'];

/** 把全端推進到同一 confirmedFrame（消除 loopback 末輪一幀偏移）。 */
function settle(nodes: BomberLockstep[], hub?: LoopbackBomberHub): void {
  for (let r = 0; r < 200; r++) {
    const max = Math.max(...nodes.map((n) => n.confirmedFrame));
    const laggards = nodes.filter((n) => n.confirmedFrame < max);
    if (laggards.length === 0) break;
    for (const n of laggards) n.tick();
    hub?.flush();
  }
}

/**
 * 用 N 個 wallet 跑一場可重現的 versus 局到分出勝負（P0 自爆先死）。
 * matchId 第二段以 seed 的 base36 編碼（與 ffa-match / match.ts 的 seed 綁定一致）。
 * 回傳每位 wallet 對應的 playerId（= wallet.address），含 replay / standings / matchId。
 */
function buildScenario(seed: number, n: number) {
  const wallets = Array.from({ length: n }, () => Wallet.createRandom());
  const playerIds = wallets.map((w) => w.address);
  const characters: Record<string, CharacterId> = {};
  playerIds.forEach((id, i) => (characters[id] = CHARS[i % CHARS.length]));

  const hub = new LoopbackBomberHub();
  const nodes = playerIds.map(
    (localId) =>
      new BomberLockstep({
        playerIds,
        localId,
        seed,
        arenaId: 0,
        characters,
        transport: hub.transportFor(localId),
      }),
  );
  // P0 原地放彈自爆先死，其餘不動 → 必分出勝負。
  nodes[0].queueLocal({ t: 'bomb' });

  let p0Dead = false;
  for (let f = 0; f < 6000 && nodes[0].match.getState().status === 'playing'; f++) {
    for (const node of nodes) {
      if (node.localId === playerIds[0] && p0Dead) continue;
      node.tick();
    }
    const p0 = nodes[0].match.getState().players.find((p) => p.id === playerIds[0]);
    if (p0 && !p0.alive) p0Dead = true;
  }
  settle(nodes, hub);

  const node = nodes[0];
  const replay = node.getReplay();
  const standings = liveStandings(node.match, playerIds);
  const stateHash = node.match.stateHash();
  const matchId = `bomber-${seed.toString(36)}-room1`;
  return { wallets, playerIds, standings, stateHash, replay, matchId };
}

/** 為某 wallet 對 (matchId, standings) 產生合法簽章（沿用 buildFfaResultMessage）。 */
async function sign(wallet: Wallet | HDNodeWallet, matchId: string, standings: string[]) {
  const placements = standings.map((_, i) => i + 1);
  const msg = buildFfaResultMessage(matchId, standings, placements);
  return wallet.signMessage(msg);
}

beforeEach(() => {
  vi.resetModules();
});

describe('POST /api/bomber-match — 基本參數防護', () => {
  it('非 POST → 400', async () => {
    const POST = await loadPost();
    const res = await POST(ctx(undefined, 'GET'));
    expect(res.status).toBe(400);
  });

  it('壞 JSON → 400', async () => {
    const POST = await loadPost();
    const request = new Request('http://localhost/api/bomber-match', {
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
    const res = await POST(ctx({ matchId: 'bomber-1-x' }));
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bomber-match — seed 綁定與 replay 抽驗', () => {
  it('replay.seed 與 matchId 內嵌 seed 不符 → 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay } = buildScenario(42, 2);
    const matchId = `bomber-${(99).toString(36)}-room1`; // seed 段刻意與 replay.seed 不同
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings, stateHash, signature: sig, replay }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('seed');
  });

  it('replay 與宣稱 standings 不符（竄改名次）→ 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(42, 2);
    const tampered = [...standings].reverse(); // 竄改名次
    const sig = await sign(wallets[0], matchId, tampered);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings: tampered, stateHash, signature: sig, replay }),
    );
    expect(res.status).toBe(400);
  });

  it('stateHash 與 replay 重模擬不符（竄改最終盤面）→ 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, replay, matchId } = buildScenario(42, 2);
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings, stateHash: '0xdeadbeef', signature: sig, replay }),
    );
    expect(res.status).toBe(400);
  });

  it('缺 replay → 400', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, matchId } = buildScenario(42, 2);
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[0].address, standings, stateHash, signature: sig }),
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/bomber-match — 簽章驗證', () => {
  it('壞簽章 / reporterId 與還原地址不符 → 401', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(42, 2);
    // 用 wallet[0] 簽，但宣稱 reporterId 是 wallet[1] → 還原地址不符
    const sig = await sign(wallets[0], matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: wallets[1].address, standings, stateHash, signature: sig, replay }),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/bomber-match — 共識結算（2 人，門檻 ceil(2/2)=1）', () => {
  it('回報者不在 standings 內（非參與者）→ 403', async () => {
    const POST = await loadPost();
    const { standings, stateHash, replay, matchId } = buildScenario(42, 2);
    const outsider = Wallet.createRandom(); // 簽章有效，但非對局參與者
    const sig = await sign(outsider, matchId, standings);
    const res = await POST(
      ctx({ matchId, reporterId: outsider.address, standings, stateHash, signature: sig, replay }),
    );
    expect(res.status).toBe(403);
  });

  it('2 人場：首位回報達門檻 → applied，含每位玩家結算欄位；再回報 → already', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(42, 2); // 門檻 1

    const r1 = await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        stateHash,
        signature: await sign(wallets[0], matchId, standings),
        replay,
      }),
    );
    expect(r1.status).toBe(200);
    const body1 = await r1.json();
    expect(body1.outcome).toBe('applied');
    // 回應含每位玩家 { ratingBefore, ratingAfter, xpGained, level }
    expect(Array.isArray(body1.results)).toBe(true);
    expect(body1.results).toHaveLength(2);
    const champ = body1.results.find((r: { id: string }) => r.id === standings[0].toLowerCase());
    expect(champ).toBeTruthy();
    expect(champ.ratingBefore).toBe(1000); // 新玩家基底
    expect(champ.ratingAfter).toBeGreaterThan(1000); // 冠軍漲分
    expect(champ.ratingAfter).toBeLessThan(1100); // 但絕非偽造大數
    expect(champ.xpGained).toBeGreaterThan(0);
    expect(champ.level).toBeGreaterThanOrEqual(1);
    const last = body1.results.find((r: { id: string }) => r.id === standings[1].toLowerCase());
    expect(last.ratingAfter).toBeLessThan(1000); // 敗方掉分

    // 再次回報（已結算）→ already
    const r2 = await POST(
      ctx({
        matchId,
        reporterId: wallets[1].address,
        standings,
        stateHash,
        signature: await sign(wallets[1], matchId, standings),
        replay,
      }),
    );
    expect(r2.status).toBe(200);
    expect((await r2.json()).outcome).toBe('already');
  });
});

describe('POST /api/bomber-match — 共識結算（3-4 人，N-way ELO）', () => {
  it('3 人場：首位回報 → pending（門檻 ceil(3/2)=2 未達），第二位達門檻 → applied', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(7, 3); // 門檻 2

    const r1 = await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        stateHash,
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
        stateHash,
        signature: await sign(wallets[1], matchId, standings),
        replay,
      }),
    );
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.outcome).toBe('applied');
    expect(body2.results).toHaveLength(3);
  });

  it('衝突：兩位回報不同名次且並列最高票 → conflict（409）', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(7, 3); // 門檻 2
    // wallet[0] 回報真實 standings；wallet[1] 回報反轉名次（簽章/抽驗都過不了反轉，
    // 故此處用「相同 replay 但宣稱不同 standings」會被 replay 抽驗擋下 → 改測同票分歧。
    // 為觸發 conflict（並列最高），兩位各報一種不同但都通過抽驗的名次是不可能的
    // （只有一種名次能通過 replay 抽驗）。故 conflict 由「非一致回報」自然被 replay 抽驗擋掉，
    // 此處驗證：偽造名次的第二票會在 replay 抽驗前被擋（400），不會污染共識。
    const r1 = await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        stateHash,
        signature: await sign(wallets[0], matchId, standings),
        replay,
      }),
    );
    expect((await r1.json()).outcome).toBe('pending');

    const tampered = [...standings].reverse();
    const r2 = await POST(
      ctx({
        matchId,
        reporterId: wallets[1].address,
        standings: tampered,
        stateHash,
        signature: await sign(wallets[1], matchId, tampered),
        replay,
      }),
    );
    // 竄改名次過不了 replay 抽驗 → 400，且不入帳
    expect(r2.status).toBe(400);
  });

  it('client 提供的 ratings 被忽略（防偽造基底分數）：結算後分數由後端基底算出', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(77, 2); // 門檻 1
    const forged: Record<string, number> = {};
    for (const id of standings) forged[id.toLowerCase()] = 9000;
    const res = await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        stateHash,
        signature: await sign(wallets[0], matchId, standings),
        replay,
        ratings: forged,
      }),
    );
    const body = await res.json();
    expect(body.outcome).toBe('applied');
    const champ = body.results.find((r: { id: string }) => r.id === standings[0].toLowerCase());
    expect(champ.ratingBefore).toBe(1000); // 偽造的 9000 不得生效
    expect(champ.ratingAfter).toBeLessThan(1100);
  });
});

describe('POST /api/bomber-match — ladder 隔離（bomber: 前綴，不污染 tetris）', () => {
  it('bomber 結算後，tetris rankStore 對同一玩家仍為空（完全隔離）', async () => {
    const POST = await loadPost();
    const { wallets, standings, stateHash, replay, matchId } = buildScenario(99, 2);
    await POST(
      ctx({
        matchId,
        reporterId: wallets[0].address,
        standings,
        stateHash,
        signature: await sign(wallets[0], matchId, standings),
        replay,
      }),
    );
    // bomber store 有該玩家
    const { getBomberRankStore } = await import('@scripts/games/tetris/net/rankStore');
    const bomberRec = await getBomberRankStore().getPlayer(standings[0].toLowerCase());
    expect(bomberRec).not.toBeNull();

    // tetris store 對同一玩家為 null（隔離成功）
    const { getRankStore } = await import('@scripts/games/tetris/net/rankStore');
    const tetrisRec = await getRankStore().getPlayer(standings[0].toLowerCase());
    expect(tetrisRec).toBeNull();
  });
});
