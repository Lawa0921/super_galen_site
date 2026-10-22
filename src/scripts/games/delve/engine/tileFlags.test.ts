// tileFlags.test.ts — 每 chunk 一塊惰性配置的旗標（液體模擬的 inQ / kill）
import { describe, it, expect } from 'vitest';
import { TileFlags } from './tileFlags';

describe('TileFlags', () => {
  it('沒寫過的格讀回 0；寫入後讀回同值', () => {
    const f = new TileFlags(4);
    expect(f.get(5, 7)).toBe(0);
    f.set(5, 7, 3);
    expect(f.get(5, 7)).toBe(3);
    f.set(5, 7, 0);
    expect(f.get(5, 7)).toBe(0);
  });
  it('負座標（x < 0、y < 0）可讀寫，不和正座標混在一起', () => {
    const f = new TileFlags(4);
    f.set(-1, 0, 1); f.set(-32, 5, 2); f.set(-33, 5, 4); f.set(3, -1, 5);
    expect(f.get(-1, 0)).toBe(1);
    expect(f.get(-32, 5)).toBe(2);
    expect(f.get(-33, 5)).toBe(4);
    expect(f.get(3, -1)).toBe(5);
    expect(f.get(31, 0)).toBe(0); // -1 & 31 = 31：局部座標相同、chunk 不同
    expect(f.get(0, 5)).toBe(0);
    expect(f.get(3, 31)).toBe(0);
  });
  it('跨 chunk 邊界（31 | 32）與中央以外的 chunk（cx ≥ chunksX）', () => {
    const f = new TileFlags(4);
    f.set(31, 31, 7); f.set(32, 31, 8); f.set(31, 32, 9);
    f.set(4 * 32 + 1, 40, 10); f.set(1_000_000 - 1, 1199, 11); f.set(-1_000_000, 0, 12);
    expect(f.get(31, 31)).toBe(7);
    expect(f.get(32, 31)).toBe(8);
    expect(f.get(31, 32)).toBe(9);
    expect(f.get(4 * 32 + 1, 40)).toBe(10);
    expect(f.get(1_000_000 - 1, 1199)).toBe(11);
    expect(f.get(-1_000_000, 0)).toBe(12);
    expect(f.get(1, 40)).toBe(0);
  });
  it('不同 chunk 互不干擾（交錯讀寫，快取不會讀錯塊）', () => {
    const f = new TileFlags(2);
    for (let k = 0; k < 200; k++) { f.set(k * 13 - 900, (k * 7) % 300, (k % 250) + 1); }
    for (let k = 0; k < 200; k++) expect(f.get(k * 13 - 900, (k * 7) % 300)).toBe((k % 250) + 1);
    // 同局部座標、不同 chunk
    f.set(2, 2, 1); f.set(34, 2, 2); f.set(2, 34, 3); f.set(-30, 2, 4);
    expect([f.get(2, 2), f.get(34, 2), f.get(2, 34), f.get(-30, 2)]).toEqual([1, 2, 3, 4]);
  });
  it('dropColumn(cx) 後該欄所有 chunk 讀回 0，其他欄不受影響', () => {
    const f = new TileFlags(4);
    f.set(33, 0, 1); f.set(40, 500, 2); f.set(5, 3, 3); f.set(70, 3, 4); f.set(-5, 9, 5);
    expect(f.get(40, 500)).toBe(2); // 讓快取停在要丟的欄
    f.dropColumn(1);
    expect(f.get(33, 0)).toBe(0);
    expect(f.get(40, 500)).toBe(0);
    expect(f.get(5, 3)).toBe(3);
    expect(f.get(70, 3)).toBe(4);
    f.dropColumn(-1);
    expect(f.get(-5, 9)).toBe(0);
    // 丟掉後再寫會重新配置
    f.set(40, 500, 6);
    expect(f.get(40, 500)).toBe(6);
  });
});
