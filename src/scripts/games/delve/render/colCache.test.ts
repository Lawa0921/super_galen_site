// colCache.test.ts — 每欄數值的惰性快取：負 x、每個 chunk 欄只算一次、超過上限清掉重來。
import { describe, it, expect } from 'vitest';
import { ColumnCache, horizonSurfaceAt } from './colCache';
import { World } from '../engine/world';
import { OuterGen, SEA_W, type CentralFrame } from '../engine/chunkgen';

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

describe('horizonSurfaceAt（遠景地平線用的「看得到的地表」）', () => {
  const F: CentralFrame = { width: 64, height: 400, edgeL: 200, edgeR: 210, cavernY: 300, moltenY: 380 };
  const w = new World(64, 400, { bounds: 'infinite', source: new OuterGen('horizon', F) });
  w.surface.fill(205);
  const P = (w.source as OuterGen).profile;
  it('海上：是水面（不是海床），不會掉到水線以下', () => {
    for (const x of [64, 64 + 40, 64 + 200, 64 + SEA_W - 1, -1, -200, -SEA_W]) {
      const top = P.waterTopAt(x)!;
      expect(top).not.toBeNull();
      expect(w.surfaceAt(x)).toBeGreaterThan(top); // 海床在水面以下
      expect(horizonSurfaceAt(w, x)).toBeLessThanOrEqual(top);
    }
    // 海中央：深 ~46 格，地平線就是水面
    expect(horizonSurfaceAt(w, 64 + 240)).toBe(P.waterTopAt(64 + 240));
  });
  it('陸地與中央：就是 surfaceAt', () => {
    for (const x of [0, 10, 63, 64 + SEA_W + 50, -SEA_W - 50]) expect(horizonSurfaceAt(w, x)).toBe(w.surfaceAt(x));
    const legacy = new World(32, 64);
    legacy.surface.fill(20);
    expect(horizonSurfaceAt(legacy, 5)).toBe(20);
  });
});
