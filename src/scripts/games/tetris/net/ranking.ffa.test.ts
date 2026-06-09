import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateRatingsNWay } from './ffaElo';
import { DEFAULT_RATING } from './elo';

/**
 * reportFfaResult 走 getRankStore() 單例（無 Upstash env → MemoryRankStore）。
 * 每個 case 用 vi.resetModules() 取得乾淨單例，避免跨測試污染。
 */
async function load() {
  const ranking = await import('./ranking');
  const rankStore = await import('./rankStore');
  const store = rankStore.getRankStore({}); // 無 env → Memory 單例
  return { reportFfaResult: ranking.reportFfaResult, store };
}

/** 產生 N 個玩家 id 與全 DEFAULT_RATING 的 ratings 物件。 */
function freshFfa(n: number): { ids: string[]; ratings: Record<string, number> } {
  const ids = Array.from({ length: n }, (_, i) => `0x${String(i + 1).padStart(2, '0')}`);
  const ratings: Record<string, number> = {};
  for (const id of ids) ratings[id] = DEFAULT_RATING;
  return { ids, ratings };
}

beforeEach(() => {
  vi.resetModules();
});

describe('reportFfaResult 共識門檻 = ceil(N/2)', () => {
  it.each([
    [3, 2],
    [4, 2],
    [5, 3],
    [8, 4],
  ])('N=%i 需 %i 票才 applied，未達為 pending', async (n, threshold) => {
    const { reportFfaResult } = await load();
    const { ids, ratings } = freshFfa(n);
    const standings = [...ids]; // 一致回報：index0=冠軍
    const matchId = `m-thr-${n}`;

    for (let i = 0; i < threshold - 1; i++) {
      const r = await reportFfaResult({ matchId, reporterId: ids[i], standings, ratings });
      expect(r).toBe('pending');
    }
    const last = await reportFfaResult({
      matchId,
      reporterId: ids[threshold - 1],
      standings,
      ratings,
    });
    expect(last).toBe('applied');
  });
});

describe('reportFfaResult 不一致 → conflict（兩派並列最高且皆達門檻）', () => {
  it('N=4 門檻 2：預灌 sA=2、sB=2 並列最高 → conflict、不結算', async () => {
    // 順序投票時，單一 standings 一達門檻即結算，無法形成「達門檻的平手」。
    // 因此以 setBRReport 直接灌入一個已平手的 tally，再由一次 reportFfaResult 觸發評估。
    const { reportFfaResult, store } = await load();
    const { ids, ratings } = freshFfa(4); // 門檻 ceil(4/2)=2
    const sA = [ids[0], ids[1], ids[2], ids[3]];
    const sB = [ids[1], ids[0], ids[2], ids[3]];
    const matchId = 'm-split';

    // 預灌：ids[0]、ids[1] 投 sA（=2，達門檻）；ids[2] 投 sB（=1）
    await store.setBRReport(matchId, ids[0], sA, 600);
    await store.setBRReport(matchId, ids[1], sA, 600);
    await store.setBRReport(matchId, ids[2], sB, 600);

    // ids[3] 這票投 sB → sB=2 與 sA=2 並列最高且皆達門檻 → conflict
    expect(await reportFfaResult({ matchId, reporterId: ids[3], standings: sB, ratings })).toBe('conflict');
    // 不結算
    expect(await store.getPlayer(ids[0])).toBeNull();
  });
});

describe('reportFfaResult 並發只結算一次', () => {
  it('達門檻後再呼叫 → already，rating/games 不二次套用', async () => {
    const { reportFfaResult, store } = await load();
    const { ids, ratings } = freshFfa(3); // 門檻 2
    const standings = [...ids];
    const matchId = 'm-once';
    expect(await reportFfaResult({ matchId, reporterId: ids[0], standings, ratings })).toBe('pending');
    expect(await reportFfaResult({ matchId, reporterId: ids[1], standings, ratings })).toBe('applied');
    const ratingAfter = (await store.getPlayer(ids[0]))!.rating;
    const gamesAfter = (await store.getPlayer(ids[0]))!.games;

    expect(await reportFfaResult({ matchId, reporterId: ids[2], standings, ratings })).toBe('already');
    expect((await store.getPlayer(ids[0]))!.rating).toBe(ratingAfter);
    expect((await store.getPlayer(ids[0]))!.games).toBe(gamesAfter);
  });
});

describe('reportFfaResult applied 後 rating/戰績正確', () => {
  it('冠軍漲分、墊底跌分（對照 updateRatingsNWay），games/top3/勝負更新', async () => {
    const { reportFfaResult, store } = await load();
    const n = 4;
    const { ids, ratings } = freshFfa(n); // 門檻 2
    const standings = [...ids]; // index0=冠軍
    const matchId = 'm-applied';
    await reportFfaResult({ matchId, reporterId: ids[0], standings, ratings });
    expect(await reportFfaResult({ matchId, reporterId: ids[1], standings, ratings })).toBe('applied');

    const expected = updateRatingsNWay(
      ids.map((id, i) => ({ id, rating: DEFAULT_RATING, placement: i + 1 })),
    );

    const champ = await store.getPlayer(ids[0]);
    const last = await store.getPlayer(ids[n - 1]);

    expect(champ!.rating).toBe(expected[ids[0]]);
    expect(last!.rating).toBe(expected[ids[n - 1]]);
    expect(champ!.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(last!.rating).toBeLessThan(DEFAULT_RATING);

    for (const id of ids) {
      expect((await store.getPlayer(id))!.games).toBe(1);
    }
    expect(champ!.top3).toBe(1);
    expect((await store.getPlayer(ids[1]))!.top3).toBe(1);
    expect((await store.getPlayer(ids[2]))!.top3).toBe(1);
    expect(last!.top3).toBe(0);

    expect(champ!.wins).toBe(1);
    expect(last!.losses).toBe(1);
  });
});
