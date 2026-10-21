// column.test.ts — 區塊欄（B2）的索引與 chunk 連續性
import { describe, it, expect } from 'vitest';
import { Column, li, variantHash } from './column';
import { CHUNK } from './constants';

describe('Column', () => {
  it('每層長度 32*height；variant 是與扁平世界相同的座標雜湊（負 x 也是）', () => {
    const c = new Column(-2, 70);
    for (const a of [c.fg, c.wall, c.liquid, c.liquidType, c.frozen, c.half, c.variant]) expect(a.length).toBe(CHUNK * 70);
    expect(c.cx).toBe(-2);
    expect(c.height).toBe(70);
    for (const [x, y] of [[-64, 0], [-33, 5], [-40, 69], [-50, 33]]) expect(c.variant[li(x, y)]).toBe(variantHash(x, y));
    expect(c.fg.every((v) => v === 0)).toBe(true);
  });

  it('li = (y << 5) | (x & 31)：同一欄內 x 連續、負 x 取低 5 bit', () => {
    expect(li(0, 0)).toBe(0);
    expect(li(31, 0)).toBe(31);
    expect(li(32, 1)).toBe(32);
    expect(li(-1, 2)).toBe(2 * 32 + 31);
    expect(li(-32, 3)).toBe(3 * 32);
  });

  it('一個 chunk = 欄內連續的 1024 bytes（ly*32 + lx）', () => {
    const c = new Column(3, 96);
    const x = 3 * 32 + 7, y = 32 + 5;
    c.fg[li(x, y)] = 9;
    const chunk = c.fg.subarray(CHUNK * CHUNK, 2 * CHUNK * CHUNK);
    expect(chunk[5 * CHUNK + 7]).toBe(9);
  });
});
