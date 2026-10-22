import { describe, expect, it } from 'vitest';
import { LOAD_COLS, PREFETCH_COLS, UNLOAD_COLS, UNLOAD_EVERY, planStreaming } from './streaming';
import { X_LIMIT } from './coords';

const INF = { xMin: -X_LIMIT, xMax: X_LIMIT };
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const tx = (cx: number): number => cx * 32 + 16;
const none = new Set<number>();

describe('planStreaming', () => {
  it('常數', () => {
    expect([LOAD_COLS, PREFETCH_COLS, UNLOAD_COLS, UNLOAD_EVERY]).toEqual([6, 8, 11, 60]);
  });

  it('單一 actor 在 cx 10 → load = 4..16 中沒常駐的；prefetch = 最近的一欄', () => {
    expect(planStreaming([tx(10)], none, none, INF, 1).load).toEqual(range(4, 16));
    const resident = new Set([5, 9, 10, 16]);
    const p = planStreaming([tx(10)], resident, none, INF, 1);
    expect(p.load).toEqual([4, 6, 7, 8, 11, 12, 13, 14, 15]);
    // 7..8 欄外：3 / 17 距離 7 → 同距離取較小的
    expect(p.prefetch).toBe(3);
    expect(p.unload).toEqual([]);
    const all = new Set(range(2, 18));
    expect(planStreaming([tx(10)], all, none, INF, 1)).toEqual({ load: [], prefetch: null, unload: [] });
  });

  it('負 x 的 actor 一樣以 chunk 欄計（−1 → cx −1）', () => {
    expect(planStreaming([-1], none, none, INF, 1).load).toEqual(range(-7, 5));
  });

  it('actor 移到 cx 30 → 4..18 在下一個 tick % 60 === 0 被列進 unload；pinned 永不 unload', () => {
    const resident = new Set(range(2, 18));
    const pinned = new Set([7]);
    expect(planStreaming([tx(30)], resident, pinned, INF, 61).unload).toEqual([]);
    const p = planStreaming([tx(30)], resident, pinned, INF, 120);
    expect(p.unload).toEqual(range(2, 18).filter((c) => c !== 7));
    expect(p.load).toEqual(range(24, 36));
    // 離 actor 剛好 UNLOAD_COLS 欄的不卸載
    expect(planStreaming([tx(30)], new Set([19, 18]), none, INF, 0).unload).toEqual([18]);
  });

  it('兩個 actor 在 cx −100 與 cx 280 → 兩段都 load、中間的不 load（Review Focus 2）', () => {
    const p = planStreaming([tx(-100), tx(280)], none, none, INF, 1);
    expect(p.load).toEqual([...range(-106, -94), ...range(274, 286)]);
    // 中間的常駐欄（離兩人都遠）卸載；任一人附近的留著
    const resident = new Set([...range(-106, -94), 0, 50, 100, ...range(274, 286)]);
    expect(planStreaming([tx(-100), tx(280)], resident, none, INF, 60).unload).toEqual([0, 50, 100]);
  });

  it('邊界：actor 在 xMax 旁 → load 不超出 floor((xMax − 1) / 32)；xMin 旁同理', () => {
    const top = Math.floor((X_LIMIT - 1) / 32);
    const p = planStreaming([X_LIMIT - 1], none, none, INF, 1);
    expect(Math.max(...p.load)).toBe(top);
    expect(p.load).toEqual(range(top - 6, top));
    expect(p.prefetch).toBe(top - 7);
    const q = planStreaming([-X_LIMIT], none, none, INF, 1);
    expect(Math.min(...q.load)).toBe(Math.floor(-X_LIMIT / 32));
    // 有界世界 [0, 160)：全部常駐 → 什麼都不做
    const legacy = new Set(range(0, 4));
    expect(planStreaming([10], legacy, legacy, { xMin: 0, xMax: 160 }, 0)).toEqual({ load: [], prefetch: null, unload: [] });
  });

  it('沒有 actor → 什麼都不做', () => {
    expect(planStreaming([], new Set([1, 2]), none, INF, 0)).toEqual({ load: [], prefetch: null, unload: [] });
  });
});
