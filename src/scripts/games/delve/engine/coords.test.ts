// coords.test.ts — 座標鍵：中央沿用舊 tile / chunk index，外圍落在 T_BASE / C_BASE 以上，雙射。
import { describe, it, expect } from 'vitest';
import {
  X_LIMIT, T_BASE, C_BASE, tileKey, tileXY, chunkKey, chunkXY, isOuterChunkKey, defaultBounds, chunkOfX, localX,
} from './coords';

const W = 4200, CX = Math.ceil(W / 32);

describe('tileKey / tileXY', () => {
  it('中央格 = 舊 tile index（y*width + x）', () => {
    expect(tileKey(W, 5, 7)).toBe(7 * W + 5);
    expect(tileKey(W, 0, 0)).toBe(0);
    expect(tileKey(W, W - 1, 1199)).toBe(1199 * W + W - 1);
  });
  it('中央以外（負 x、x ≥ width）落在 T_BASE 以上', () => {
    expect(tileKey(W, -1, 0)).toBeGreaterThanOrEqual(T_BASE);
    expect(tileKey(W, W, 0)).toBeGreaterThanOrEqual(T_BASE);
    expect(tileKey(W, -X_LIMIT, 1199)).toBeGreaterThanOrEqual(T_BASE);
    expect(Number.isSafeInteger(tileKey(W, X_LIMIT - 1, 1199))).toBe(true);
  });
  it('tileXY(tileKey(x, y)) 往返', () => {
    for (const x of [-X_LIMIT, -33, -32, -1, 0, 31, 4199, 4200, 4223, X_LIMIT - 1]) {
      for (const y of [0, 1199]) expect(tileXY(W, tileKey(W, x, y))).toEqual({ x, y });
    }
  });
  it('不同座標的鍵兩兩不同（抽樣 10⁴ 點，含中央與外圍）', () => {
    let s = 12345;
    const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
    const seen = new Map<number, string>();
    for (let i = 0; i < 10_000; i++) {
      // 一半集中在中央附近（鍵段交界），一半散在整個 ±X_LIMIT
      const x = i & 1 ? rnd(W + 400) - 200 : rnd(2 * X_LIMIT) - X_LIMIT;
      const y = rnd(1200);
      const id = `${x},${y}`;
      const k = tileKey(W, x, y);
      const prev = seen.get(k);
      if (prev !== undefined) expect(prev).toBe(id);
      seen.set(k, id);
    }
    expect(seen.size).toBeGreaterThan(9000);
  });
});

describe('chunkKey / chunkXY', () => {
  it('中央 chunk = 舊 chunk index（cy*chunksX + cx）', () => {
    expect(chunkKey(CX, 3, 2)).toBe(2 * CX + 3);
    expect(isOuterChunkKey(chunkKey(CX, 131, 37))).toBe(false);
  });
  it('外圍 chunk 落在 C_BASE 以上', () => {
    expect(chunkKey(CX, -1, 0)).toBeGreaterThanOrEqual(C_BASE);
    expect(chunkKey(CX, CX, 0)).toBeGreaterThanOrEqual(C_BASE);
    expect(isOuterChunkKey(chunkKey(CX, -1, 0))).toBe(true);
    expect(isOuterChunkKey(chunkKey(CX, 132, 5))).toBe(true);
  });
  it('chunkXY(chunkKey(cx, cy)) 往返', () => {
    for (const cx of [-31250, -1, 0, 131, 132, 31249]) {
      for (const cy of [0, 37]) expect(chunkXY(CX, chunkKey(CX, cx, cy))).toEqual({ cx, cy });
    }
  });
  it('不同 chunk 座標的鍵兩兩不同（抽樣 10⁴ 點）', () => {
    let s = 777;
    const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s % n; };
    const seen = new Map<number, string>();
    for (let i = 0; i < 10_000; i++) {
      const cx = i & 1 ? rnd(CX + 20) - 10 : rnd(62500) - 31250;
      const cy = rnd(38);
      const id = `${cx},${cy}`;
      const k = chunkKey(CX, cx, cy);
      const prev = seen.get(k);
      if (prev !== undefined) expect(prev).toBe(id);
      seen.set(k, id);
    }
    expect(seen.size).toBeGreaterThan(5000);
  });
  it('chunkOfX / localX：負數向下取整（−1 → chunk −1、local 31），邊界值正確', () => {
    const cases: [number, number, number][] = [
      [-1, -1, 31], [-32, -1, 0], [-33, -2, 31], [0, 0, 0], [31, 0, 31], [32, 1, 0],
      [4199, 131, 7], [4200, 131, 8], [4223, 131, 31], [4224, 132, 0],
      [-X_LIMIT, -31250, 0], [X_LIMIT - 1, 31249, 31], [X_LIMIT, 31250, 0],
    ];
    for (const [x, c, l] of cases) {
      expect([x, chunkOfX(x), localX(x)]).toEqual([x, c, l]);
      expect(chunkOfX(x) * 32 + localX(x)).toBe(x);
    }
  });
});

describe('defaultBounds', () => {
  it('正式尺寸 = infinite；測試小世界 = legacy', () => {
    expect(defaultBounds(4200, 1200)).toBe('infinite');
    expect(defaultBounds(160, 100)).toBe('legacy');
    expect(defaultBounds(4200, 100)).toBe('legacy');
  });
});
