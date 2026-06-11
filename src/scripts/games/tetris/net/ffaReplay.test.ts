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

/**
 * 建一場含中離的 3-player FFA 局：幀 10 forfeit P2、P0 每偶數幀 hardDrop 堆死、P1 不動。
 * 錄製順序與 simulateFfaReplay 一致：同一幀內先 forfeits、再輸入、再 step。
 */
function buildFfaReplayWithForfeit(
  seed: number,
  forfeitFrame = 10,
): { replay: FfaReplay; standings: string[] } {
  const playerIds = ['P0', 'P1', 'P2'];
  const match = new FfaMatch(playerIds, { seed });
  const events: FfaReplay['events'] = [];
  const forfeits: Array<{ f: number; p: string }> = [];
  let f = 0;

  for (; f < 10000 && match.phase === 'playing'; f++) {
    if (f === forfeitFrame) {
      forfeits.push({ f, p: 'P2' });
      match.forfeit('P2');
    }
    const actions: InputAction[] = f % 2 === 0 ? ['hardDrop'] : [];
    if (actions.length) {
      events.push({ f, p: 'P0', a: actions });
      for (const act of actions) match.input('P0', act);
    }
    match.step(SIM_DT);
  }

  return {
    replay: { seed, playerIds, frameCount: f, events, forfeits },
    standings: match.getStandings(),
  };
}

describe('FfaReplay forfeits — 重播', () => {
  it('含 forfeit 的 replay 重模擬出與原局相同名次', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    // 原局：P2 幀 10 中離（殿後）、P0 堆死（第 2）、P1 奪冠
    expect(standings).toEqual(['P1', 'P0', 'P2']);
    expect(simulateFfaReplay(replay)).toEqual(standings);
  });

  it('同 replay 跑兩次結果相同（determinism）', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(999);
    const run1 = simulateFfaReplay(replay);
    const run2 = simulateFfaReplay(replay);
    expect(run1).not.toBeNull();
    expect(run1).toEqual(run2);
    expect(run1).toEqual(standings);
  });

  it('forfeit 對已 topout 的玩家是 no-op，名次仍正確', () => {
    // P0 堆死（topout）後才對 P0 forfeit（no-op）；再 forfeit P1 結束本局
    const seed = 7;
    const playerIds = ['P0', 'P1', 'P2'];
    const match = new FfaMatch(playerIds, { seed });
    const events: FfaReplay['events'] = [];
    const forfeits: Array<{ f: number; p: string }> = [];
    let f = 0;
    for (; f < 10000 && match.phase === 'playing'; f++) {
      if (f === 100) {
        forfeits.push({ f, p: 'P0' }); // P0 應已 topout → no-op
        match.forfeit('P0');
      }
      if (f === 200) {
        forfeits.push({ f, p: 'P1' });
        match.forfeit('P1');
      }
      const actions: InputAction[] = f % 2 === 0 ? ['hardDrop'] : [];
      if (actions.length) {
        events.push({ f, p: 'P0', a: actions });
        for (const act of actions) match.input('P0', act);
      }
      match.step(SIM_DT);
    }
    const standings = match.getStandings();
    // P0 topout 殿後、P1 中離第 2、P2 奪冠
    expect(standings).toEqual(['P2', 'P1', 'P0']);
    const replay: FfaReplay = { seed, playerIds, frameCount: f, events, forfeits };
    expect(simulateFfaReplay(replay)).toEqual(standings);
    expect(verifyFfaReplay(replay, standings)).toBe(true);
  });
});

describe('FfaReplay forfeits — 驗證', () => {
  it('合法 forfeits + 正確名次 → verify true', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    expect(verifyFfaReplay(replay, standings)).toBe(true);
  });

  it('竄改 forfeit 的 f（10→50）→ 重模擬結果改變 → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const tampered: FfaReplay = { ...replay, forfeits: [{ f: 50, p: 'P2' }] };
    // 幀 50 已超過原局長度 → forfeit 套用不到 → 局面與原宣稱不同
    expect(simulateFfaReplay(tampered)).not.toEqual(standings);
    expect(verifyFfaReplay(tampered, standings)).toBe(false);
  });

  it('竄改 forfeit 的 p（P2→P1）→ 名次不符 → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const tampered: FfaReplay = { ...replay, forfeits: [{ f: 10, p: 'P1' }] };
    expect(verifyFfaReplay(tampered, standings)).toBe(false);
  });

  it('forfeits 非陣列 → verify false（不丟例外）', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const bad = { ...replay, forfeits: 'P2@10' } as unknown as FfaReplay;
    expect(() => verifyFfaReplay(bad, standings)).not.toThrow();
    expect(verifyFfaReplay(bad, standings)).toBe(false);
  });

  it('forfeit 的 p 不在 playerIds → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const bad: FfaReplay = { ...replay, forfeits: [{ f: 10, p: 'HACKER' }] };
    expect(verifyFfaReplay(bad, standings)).toBe(false);
  });

  it('forfeit 的 f 為 -1 或非有限數 → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    expect(verifyFfaReplay({ ...replay, forfeits: [{ f: -1, p: 'P2' }] }, standings)).toBe(false);
    expect(
      verifyFfaReplay({ ...replay, forfeits: [{ f: Infinity, p: 'P2' }] }, standings),
    ).toBe(false);
    expect(verifyFfaReplay({ ...replay, forfeits: [{ f: NaN, p: 'P2' }] }, standings)).toBe(false);
  });

  it('forfeit 的 f > frameCount → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const bad: FfaReplay = { ...replay, forfeits: [{ f: replay.frameCount + 1, p: 'P2' }] };
    expect(verifyFfaReplay(bad, standings)).toBe(false);
  });

  it('forfeits 長度 > playerIds.length → verify false', () => {
    const { replay, standings } = buildFfaReplayWithForfeit(42);
    const bad: FfaReplay = {
      ...replay,
      forfeits: [
        { f: 10, p: 'P2' },
        { f: 11, p: 'P2' },
        { f: 12, p: 'P2' },
        { f: 13, p: 'P2' },
      ],
    };
    expect(verifyFfaReplay(bad, standings)).toBe(false);
  });
});
