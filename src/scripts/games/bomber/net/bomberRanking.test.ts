import { describe, it, expect, vi } from 'vitest';
import {
  buildBomberMatchId,
  reportBomberRanked,
  type BomberRankReport,
} from './bomberRanking';
import { buildFfaResultMessage } from '@scripts/games/tetris/net/auth';
import type { VersusReplay } from './versusReplay';
import { BomberLockstep, LoopbackBomberHub } from './bomberLockstep';
import type { CharacterId } from '../engine/types';

// ── 共用：跑一場決定性的 2 人 loopback 局，得到真實 replay/standings ──────────
const CHARS: Record<string, CharacterId> = { A: 'lena' as CharacterId, B: 'mira' as CharacterId };

/** 建一個 host 端 lockstep，把它推進到分出勝負，回傳 { lockstep, replay, standings }。 */
function playToFinish(seed: number): { lockstep: BomberLockstep; replay: VersusReplay } {
  const hub = new LoopbackBomberHub();
  const a = new BomberLockstep({
    playerIds: ['A', 'B'], localId: 'A', seed, arenaId: 0, characters: CHARS, transport: hub.transportFor('A'),
  });
  const b = new BomberLockstep({
    playerIds: ['A', 'B'], localId: 'B', seed, arenaId: 0, characters: CHARS, transport: hub.transportFor('B'),
  });
  // 直接讓 B 自爆：B 放炸彈站著不動，A 走開 → B 先死 → A 冠軍。
  // 為了測試只要「局會結束」即可（用 forfeit 收斂，最穩定、與 seed 無關）。
  // 推進若干幀以累積一些已確認幀，再 forfeit B（各端同一幀）。
  for (let i = 0; i < 20; i++) { a.tick(); b.tick(); }
  const f = a.lastInputFrame('B') + 1;
  a.forfeit('B', f); b.forfeit('B', f);
  for (let i = 0; i < 30; i++) { a.tick(); b.tick(); }
  return { lockstep: a, replay: a.getReplay() };
}

describe('buildBomberMatchId', () => {
  it('格式為 bomber-<seed.toString(36)>-<roomId>（與 Task 14 endpoint 解析相符）', () => {
    expect(buildBomberMatchId(0, 'ABCDE')).toBe('bomber-0-ABCDE');
    expect(buildBomberMatchId(35, 'R1')).toBe('bomber-z-R1');
    expect(buildBomberMatchId(1296, 'XY')).toBe('bomber-100-XY'); // 36^2
  });

  it('endpoint 由 matchId.split("-")[1] 以 base36 解析出的 seed 必須等於原 seed', () => {
    const seed = 1234567;
    const matchId = buildBomberMatchId(seed, 'ROOM7');
    const parsed = parseInt(matchId.split('-')[1] ?? '', 36);
    expect(parsed).toBe(seed);
  });
});

describe('reportBomberRanked — claim 組裝 / 簽章訊息 / POST', () => {
  it('無 signMessage（casual）→ 不送、回 outcome:null', async () => {
    const { replay } = playToFinish(0x1111);
    const fetchFn = vi.fn();
    const r = await reportBomberRanked({
      seed: replay.seed, roomId: 'RM', reporterId: 'A', replay, fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.outcome).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('有 signMessage → POST /api/bomber-match，body 含正確 matchId/standings/stateHash/signature/replay/reporterId', async () => {
    const { replay } = playToFinish(0x2222);
    const signMessage = vi.fn(async (m: string) => `sig(${m})`);
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: 'pending' }), { status: 200 }),
    );
    await reportBomberRanked({
      seed: replay.seed, roomId: 'RM5', reporterId: 'A', replay, signMessage,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/bomber-match');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;

    const matchId = buildBomberMatchId(replay.seed, 'RM5');
    expect(body.matchId).toBe(matchId);
    expect(body.reporterId).toBe('A');
    // standings：冠軍在前，這場 A 勝 B 敗
    expect(body.standings).toEqual(['A', 'B']);
    expect(typeof body.stateHash).toBe('string');
    expect((body.stateHash as string).length).toBeGreaterThan(0);
    expect(body.replay).toBeTruthy();
    // 簽章訊息：buildFfaResultMessage(matchId, standings, [1..N])
    const expectedMsg = buildFfaResultMessage(matchId, ['A', 'B'], [1, 2]);
    expect(signMessage).toHaveBeenCalledWith(expectedMsg);
    expect(body.signature).toBe(`sig(${expectedMsg})`);
  });

  it('seed 內嵌進 matchId 後，endpoint 的 split("-")[1] base36 解析 == replay.seed', async () => {
    const { replay } = playToFinish(0xfeed);
    const signMessage = vi.fn(async (m: string) => `sig(${m})`);
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ outcome: 'pending' }), { status: 200 }),
    );
    await reportBomberRanked({
      seed: replay.seed, roomId: 'ZZ', reporterId: 'A', replay, signMessage,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    const body = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string) as { matchId: string };
    const seedFromMatch = parseInt(body.matchId.split('-')[1] ?? '', 36);
    expect(seedFromMatch).toBe(replay.seed);
  });
});

describe('reportBomberRanked — 回應解析', () => {
  const mkReply = () => playToFinish(0x3333);

  async function runWith(json: unknown, status = 200): Promise<BomberRankReport> {
    const { replay } = mkReply();
    const signMessage = async (m: string) => `sig(${m})`;
    const fetchFn = vi.fn(async () => new Response(JSON.stringify(json), { status }));
    return reportBomberRanked({
      seed: replay.seed, roomId: 'RM', reporterId: 'A', replay, signMessage,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
  }

  it('applied → 回傳 outcome:applied + results 陣列', async () => {
    const results = [
      { id: 'A', placement: 1, ratingBefore: 1200, ratingAfter: 1216, xpGained: 35, level: 1 },
      { id: 'B', placement: 2, ratingBefore: 1200, ratingAfter: 1184, xpGained: 10, level: 1 },
    ];
    const r = await runWith({ outcome: 'applied', results });
    expect(r.outcome).toBe('applied');
    expect(r.results).toEqual(results);
  });

  it('pending → outcome:pending、無 results', async () => {
    const r = await runWith({ outcome: 'pending' });
    expect(r.outcome).toBe('pending');
    expect(r.results).toBeUndefined();
  });

  it('already → outcome:already', async () => {
    const r = await runWith({ outcome: 'already' });
    expect(r.outcome).toBe('already');
  });

  it('conflict（409）→ outcome:conflict', async () => {
    const r = await runWith({ outcome: 'conflict' }, 409);
    expect(r.outcome).toBe('conflict');
  });

  it('fetch 失敗（reject）→ outcome:null（不丟例外）', async () => {
    const { replay } = mkReply();
    const fetchFn = vi.fn(async () => { throw new Error('network'); });
    const r = await reportBomberRanked({
      seed: replay.seed, roomId: 'RM', reporterId: 'A', replay,
      signMessage: async (m) => `sig(${m})`,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.outcome).toBeNull();
  });

  it('壞 JSON 回應 → outcome:null', async () => {
    const { replay } = mkReply();
    const fetchFn = vi.fn(async () => new Response('not json', { status: 200 }));
    const r = await reportBomberRanked({
      seed: replay.seed, roomId: 'RM', reporterId: 'A', replay,
      signMessage: async (m) => `sig(${m})`,
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(r.outcome).toBeNull();
  });
});
