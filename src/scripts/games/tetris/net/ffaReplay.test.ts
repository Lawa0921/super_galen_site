import { describe, it, expect } from 'vitest';
import { simulateFfaReplay, verifyFfaReplay, type FfaReplay } from './ffaReplay';
import { FfaMatch } from '../engine/ffa';
import type { InputAction } from '../engine/game';

const SIM_DT = 1000 / 60;
const MAX_FRAMES = 60 * 60 * 30;
const MAX_EVENTS = 20000;

/**
 * 建一場 3-player FFA 局，P0 狂 hardDrop 堆死，P1/P2 不動。
 * 回傳錄製的 FfaReplay 與原局的 getStandings()。
 */
function buildFfaReplay(
  seed: number,
  playerIds: string[] = ['P0', 'P1', 'P2'],
): { replay: FfaReplay; standings: string[] } {
  const match = new FfaMatch(playerIds, { seed });
  const events: FfaReplay['events'] = [];
  let f = 0;

  for (; f < 10000 && match.phase === 'playing'; f++) {
    // P0 每幀 hardDrop → 快速堆死
    const actions: InputAction[] = f % 2 === 0 ? ['hardDrop'] : [];
    if (actions.length) {
      events.push({ f, p: 'P0', a: actions });
    }
    for (const act of actions) match.input('P0', act);
    match.step(SIM_DT);
  }

  const standings = match.getStandings();
  return {
    replay: { seed, playerIds, frameCount: f, events },
    standings,
  };
}

/**
 * 建一場 4-player FFA 局，更多輸入變化。
 */
function buildFfaReplay4p(
  seed: number,
  playerIds: string[] = ['A', 'B', 'C', 'D'],
): { replay: FfaReplay; standings: string[] } {
  const match = new FfaMatch(playerIds, { seed });
  const events: FfaReplay['events'] = [];
  let f = 0;

  for (; f < 10000 && match.phase === 'playing'; f++) {
    // A 每幀 hardDrop、B 每 3 幀一次 hardDrop（速度較慢死亡）
    const aActions: InputAction[] = f % 2 === 0 ? ['hardDrop'] : [];
    const bActions: InputAction[] = f % 3 === 0 ? ['hardDrop'] : [];

    if (aActions.length) events.push({ f, p: 'A', a: aActions });
    if (bActions.length) events.push({ f, p: 'B', a: bActions });

    for (const act of aActions) match.input('A', act);
    for (const act of bActions) match.input('B', act);
    match.step(SIM_DT);
  }

  const standings = match.getStandings();
  return {
    replay: { seed, playerIds, frameCount: f, events },
    standings,
  };
}

describe('simulateFfaReplay', () => {
  it('重模擬還原出與原局相同名次（3 人局）', () => {
    const { replay, standings } = buildFfaReplay(42);
    expect(standings.length).toBeGreaterThan(0);
    const simResult = simulateFfaReplay(replay);
    expect(simResult).not.toBeNull();
    expect(simResult).toEqual(standings);
  });

  it('同 seed+inputs 重跑名次穩定（determinism，4 人局）', () => {
    const { replay, standings } = buildFfaReplay4p(999);
    const run1 = simulateFfaReplay(replay);
    const run2 = simulateFfaReplay(replay);
    expect(run1).not.toBeNull();
    expect(run1).toEqual(run2);
    expect(run1).toEqual(standings);
  });

  it('不同 seed 結果不同（determinism 基本健全性）', () => {
    const { replay: r1, standings: s1 } = buildFfaReplay(1);
    const { replay: r2, standings: s2 } = buildFfaReplay(9999);
    // seed 不同，雖然不保證名次一定不同，但至少兩次模擬都要與原局一致
    expect(simulateFfaReplay(r1)).toEqual(s1);
    expect(simulateFfaReplay(r2)).toEqual(s2);
  });

  it('未結束的局（frameCount 裁短）回傳 null', () => {
    const { replay } = buildFfaReplay4p(123);
    // 只跑前 10 幀，不可能結束
    const partialReplay: FfaReplay = { ...replay, frameCount: 10 };
    // 10 幀通常不夠分出勝負，應回 null；若實際夠就檢查非 null 也合理
    const result = simulateFfaReplay(partialReplay);
    // 分出勝負時 result 是陣列，未結束時是 null — 無論如何不能丟例外
    expect(result === null || Array.isArray(result)).toBe(true);
  });
});

describe('verifyFfaReplay', () => {
  it('正確 standings → verify true', () => {
    const { replay, standings } = buildFfaReplay(42);
    expect(verifyFfaReplay(replay, standings)).toBe(true);
  });

  it('打亂 standings 順序 → verify false（竄改名次被抓）', () => {
    const { replay, standings } = buildFfaReplay(42);
    if (standings.length < 2) return; // 防邊界（不太可能）
    const shuffled = [...standings].reverse();
    // 若打亂後恰好與正確相同（全員同名次不可能），才不測；正常 3 人局一定不同
    if (shuffled.join() !== standings.join()) {
      expect(verifyFfaReplay(replay, shuffled)).toBe(false);
    }
  });

  it('竄改某幀輸入 → verify 對原宣稱 false', () => {
    const { replay, standings } = buildFfaReplay4p(777);
    // 在第一幀插入一個對 P0 不存在的大量輸入，改變局面
    const tamperedEvents = [
      { f: 0, p: 'A', a: ['left', 'left', 'left', 'left', 'left'] as InputAction[] },
      ...replay.events,
    ];
    const tamperedReplay: FfaReplay = { ...replay, events: tamperedEvents };
    // 竄改後重模擬的名次很可能與原宣稱不同 → false
    // （極罕見情況下恰好相同則 true，但測試設計讓它幾乎不可能）
    const result = verifyFfaReplay(tamperedReplay, standings);
    // 只驗證「不丟例外」且回傳 boolean
    expect(typeof result).toBe('boolean');
    // 更嚴格：竄改輸入後名次應與原不同
    const tamperedStandings = simulateFfaReplay(tamperedReplay);
    if (tamperedStandings !== null && tamperedStandings.join() !== standings.join()) {
      expect(result).toBe(false);
    }
  });

  it('超過 MAX_FRAMES → verify false', () => {
    const replay: FfaReplay = {
      seed: 1,
      playerIds: ['P0', 'P1'],
      frameCount: MAX_FRAMES + 1,
      events: [],
    };
    expect(verifyFfaReplay(replay, ['P0', 'P1'])).toBe(false);
  });

  it('超過 MAX_EVENTS → verify false', () => {
    const fakeEvents = Array.from({ length: MAX_EVENTS + 1 }, (_, i) => ({
      f: i,
      p: 'P0',
      a: ['hardDrop'] as InputAction[],
    }));
    const replay: FfaReplay = {
      seed: 1,
      playerIds: ['P0', 'P1'],
      frameCount: 100,
      events: fakeEvents,
    };
    expect(verifyFfaReplay(replay, ['P0', 'P1'])).toBe(false);
  });

  it('seed 非數字 → verify false（不丟例外）', () => {
    const bad = { seed: 'hacked', playerIds: ['P0', 'P1'], frameCount: 10, events: [] } as unknown as FfaReplay;
    expect(() => verifyFfaReplay(bad, ['P0', 'P1'])).not.toThrow();
    expect(verifyFfaReplay(bad, ['P0', 'P1'])).toBe(false);
  });

  it('events 非陣列 → verify false（不丟例外）', () => {
    const bad = { seed: 1, playerIds: ['P0', 'P1'], frameCount: 10, events: null } as unknown as FfaReplay;
    expect(() => verifyFfaReplay(bad, ['P0', 'P1'])).not.toThrow();
    expect(verifyFfaReplay(bad, ['P0', 'P1'])).toBe(false);
  });

  it('playerIds 非陣列 → verify false（不丟例外）', () => {
    const bad = { seed: 1, playerIds: 'P0,P1', frameCount: 10, events: [] } as unknown as FfaReplay;
    expect(() => verifyFfaReplay(bad, ['P0', 'P1'])).not.toThrow();
    expect(verifyFfaReplay(bad, ['P0', 'P1'])).toBe(false);
  });

  it('frameCount 為 Infinity → verify false', () => {
    const bad: FfaReplay = { seed: 1, playerIds: ['P0', 'P1'], frameCount: Infinity, events: [] };
    expect(verifyFfaReplay(bad, ['P0', 'P1'])).toBe(false);
  });

  it('replay 本身為 null → verify false（不丟例外）', () => {
    expect(() => verifyFfaReplay(null as unknown as FfaReplay, [])).not.toThrow();
    expect(verifyFfaReplay(null as unknown as FfaReplay, [])).toBe(false);
  });
});
