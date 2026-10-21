// colCache.test.ts — 每欄數值的惰性快取：負 x、每個 chunk 欄只算一次、超過上限清掉重來。
import { describe, it, expect } from 'vitest';
import { ColumnCache } from './colCache';

describe('ColumnCache', () => {
  it('值與原函式相同（含負 x、小數 x 取 floor）', () => {
    const fn = (x: number): number => ((x % 7) + 7) % 7 - 3;
    const c = new ColumnCache(fn);
    for (let x = -100; x < 100; x++) expect(c.at(x)).toBe(fn(x));
    expect(c.at(-0.5)).toBe(fn(-1));
    expect(c.at(31.9)).toBe(fn(31));
  });
  it('每個 chunk 欄只問一次原函式（整段 32 欄）', () => {
    let n = 0;
    const c = new ColumnCache((x) => { n++; return x & 3; });
    for (let k = 0; k < 3; k++) for (let x = -64; x < 64; x++) c.at(x);
    expect(n).toBe(4 * 32);
    expect(c.size).toBe(4);
  });
  it('超過 maxCols 清掉重來（記憶體有上限）', () => {
    const c = new ColumnCache((x) => x & 1, 4);
    for (let cx = 0; cx < 10; cx++) c.at(cx * 32);
    expect(c.size).toBeLessThanOrEqual(4);
    expect(c.at(5 * 32 + 1)).toBe(1);
  });
});
