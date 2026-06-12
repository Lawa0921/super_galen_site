import { describe, it, expect } from 'vitest';
import { tryFormMatch, MATCH_WINDOW_MS, type QueueEntry } from './matchmaking';

function entry(id: string, joinedAt: number): QueueEntry {
  return { id, name: `name-${id}`, rating: 1000, joinedAt };
}

const NOW = 100_000;

describe('tryFormMatch', () => {
  it('空池回 null', () => {
    expect(tryFormMatch([], NOW)).toBeNull();
  });

  it('只有 1 人回 null（即使等很久）', () => {
    expect(tryFormMatch([entry('a', NOW - 60_000)], NOW)).toBeNull();
  });

  it('2 人但最早者等待 <10 秒回 null（窗邊界 9999ms）', () => {
    const waiting = [
      entry('a', NOW - (MATCH_WINDOW_MS - 1)),
      entry('b', NOW - 5_000),
    ];
    expect(tryFormMatch(waiting, NOW)).toBeNull();
  });

  it('2 人且最早者剛好等滿 10 秒 → 1v1（窗邊界 10000ms 含）', () => {
    const waiting = [entry('a', NOW - MATCH_WINDOW_MS), entry('b', NOW - 1_000)];
    const m = tryFormMatch(waiting, NOW);
    expect(m).not.toBeNull();
    expect(m!.mode).toBe('1v1');
    expect(m!.players.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('3 人 → FFA 取全部 3 人', () => {
    const waiting = [
      entry('a', NOW - 20_000),
      entry('b', NOW - 15_000),
      entry('c', NOW - 1_000),
    ];
    const m = tryFormMatch(waiting, NOW);
    expect(m!.mode).toBe('ffa');
    expect(m!.players.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('8 人 → FFA 取全部 8 人', () => {
    const waiting = Array.from({ length: 8 }, (_, i) => entry(`p${i}`, NOW - 20_000 + i * 100));
    const m = tryFormMatch(waiting, NOW);
    expect(m!.mode).toBe('ffa');
    expect(m!.players).toHaveLength(8);
  });

  it('9 人 → FFA 只取最早 8 人，最晚者不入選', () => {
    const waiting = Array.from({ length: 9 }, (_, i) => entry(`p${i}`, NOW - 20_000 + i * 100));
    const m = tryFormMatch(waiting, NOW);
    expect(m!.mode).toBe('ffa');
    expect(m!.players).toHaveLength(8);
    expect(m!.players.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  });

  it('輸入未排序也依 joinedAt 升冪取人，且不改動原陣列', () => {
    const waiting = [
      entry('late', NOW - 1_000),
      entry('early', NOW - 30_000),
      entry('mid', NOW - 12_000),
    ];
    const snapshot = waiting.map((e) => e.id);
    const m = tryFormMatch(waiting, NOW);
    expect(m!.players.map((p) => p.id)).toEqual(['early', 'mid', 'late']);
    expect(waiting.map((e) => e.id)).toEqual(snapshot);
  });

  it('同 joinedAt 以 id 次序決勝，撮合結果穩定', () => {
    const t = NOW - 20_000;
    const a = [entry('zzz', t), entry('aaa', t), entry('mmm', t)];
    const b = [entry('mmm', t), entry('zzz', t), entry('aaa', t)];
    const ma = tryFormMatch(a, NOW)!;
    const mb = tryFormMatch(b, NOW)!;
    expect(ma.players.map((p) => p.id)).toEqual(['aaa', 'mmm', 'zzz']);
    expect(mb.players.map((p) => p.id)).toEqual(ma.players.map((p) => p.id));
  });

  it('窗檢查看排序後的最早者，而非陣列第一個元素', () => {
    // 陣列第一個元素等不到 10 秒，但排序後的最早者已等 12 秒 → 成立
    const waiting = [entry('fresh', NOW - 2_000), entry('old', NOW - 12_000)];
    const m = tryFormMatch(waiting, NOW);
    expect(m).not.toBeNull();
    expect(m!.mode).toBe('1v1');
    expect(m!.players.map((p) => p.id)).toEqual(['old', 'fresh']);
  });

  it('windowMs 可注入覆寫預設常數', () => {
    const waiting = [entry('a', NOW - 3_000), entry('b', NOW - 1_000)];
    expect(tryFormMatch(waiting, NOW)).toBeNull();
    const m = tryFormMatch(waiting, NOW, 2_000);
    expect(m).not.toBeNull();
    expect(m!.mode).toBe('1v1');
  });
});
