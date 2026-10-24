// structId.test.ts — 結構 id（i 13 | side 2 | region 5 | slot 5 | layer 3 bit）與 gen2 結構地區 id 的編解碼。
import { describe, it, expect } from 'vitest';
import { encodeStructureId, decodeStructureId, gen2SiteRegionId, isGen2SiteRegionId, siteOfRegionId, GEN2_SITE_BASE, LAYER_BITS } from './structId';
import { gen2RegionId, isGen2RegionId, isOuterRegionId } from '../discovery';

describe('structId', () => {
  it('encode / decode 往返（所有 layer、兩側、邊界值）', () => {
    for (const [side, i, region, slot, layer] of [[0, 0, 0, 0, 0], [1, 8191, 31, 31, 4], [-1, 1, 7, 3, 3], [1, 5, 2, 30, 1]] as const)
      expect(decodeStructureId(encodeStructureId(side, i, region, slot, layer))).toEqual({ side, i, region, slot, layer });
    for (const bad of [[1, 8192, 0, 0, 0], [1, 1, 32, 0, 0], [1, 1, 0, 32, 0], [1, 1, 0, 0, 5], [2, 1, 0, 0, 0]] as const)
      expect(() => encodeStructureId(...(bad as unknown as Parameters<typeof encodeStructureId>))).toThrow(RangeError);
    expect(encodeStructureId(1, 8191, 31, 31, 4)).toBeLessThan(2 ** 31);
    expect(LAYER_BITS).toBe(3);
  });
  it('decode 壞 id 丟 RangeError（負數、非整數、layer ≥ 5、side 欄位 3、超過 28 bit）', () => {
    const ok = encodeStructureId(1, 3, 2, 1, 0);
    for (const bad of [-1, 1.5, ok | 5, ok | 7, 3 << 13, 2 ** 28]) expect(() => decodeStructureId(bad), String(bad)).toThrow(RangeError);
  });
  it('結構地區 id：唯一、可反查、不撞地塊地區 id', () => {
    const a = gen2SiteRegionId(encodeStructureId(1, 3, 2, 20, 0), 0), b = gen2SiteRegionId(encodeStructureId(1, 3, 3, 0, 0), 0);
    expect(a).not.toBe(b); expect(siteOfRegionId(gen2SiteRegionId(12345, 9))).toEqual({ sid: 12345, part: 9 });
    expect(isGen2SiteRegionId(a)).toBe(true); expect(isGen2RegionId(a)).toBe(false); expect(isGen2SiteRegionId(gen2RegionId(1, 2, 0, 0))).toBe(false);
    expect(() => gen2SiteRegionId(1, 64)).toThrow(RangeError);
  });
  it('M1 溢位的位置：地區 r 的 slot 21 結構不撞地區 r + 1 的任何 id（舊的 sub = slot × 3 + layer + 1 在這裡撞）', () => {
    // 舊編法在這裡確實會撞（釘住這個案例有意義）
    expect(gen2RegionId(1, 3, 2, 21 * 3 + 0 + 1)).toBe(gen2RegionId(1, 3, 3, 0));
    for (const side of [-1, 1] as const) for (const r of [0, 2, 30]) for (const slot of [20, 21, 31]) for (const layer of [0, 1, 2, 3, 4] as const) {
      const id = gen2SiteRegionId(encodeStructureId(side, 3, r, slot, layer), 0);
      expect(isGen2RegionId(id)).toBe(false);
      for (let sub = 0; sub < 64; sub++) expect(id).not.toBe(gen2RegionId(side, 3, r + 1, sub));
    }
  });
  it('結構地區 id 的範圍：[GEN2_SITE_BASE, GEN2_SITE_BASE + 2 ** 34)，不撞外圍 id；超出範圍的 sid / part 丟 RangeError', () => {
    expect(GEN2_SITE_BASE).toBe(2 ** 33);
    const top = gen2SiteRegionId(encodeStructureId(1, 8191, 31, 31, 4), 63);
    expect(top).toBeLessThan(GEN2_SITE_BASE + 2 ** 34); expect(isGen2SiteRegionId(top)).toBe(true); expect(isOuterRegionId(top)).toBe(false);
    expect(gen2SiteRegionId(0, 0)).toBe(GEN2_SITE_BASE);
    expect(isGen2SiteRegionId(GEN2_SITE_BASE - 1)).toBe(false); expect(isGen2SiteRegionId(GEN2_SITE_BASE + 2 ** 34)).toBe(false);
    expect(isGen2SiteRegionId(GEN2_SITE_BASE + 0.5)).toBe(false);
    for (const [sid, part] of [[-1, 0], [2 ** 28, 0], [1, -1], [1.5, 0], [1, 0.5]]) expect(() => gen2SiteRegionId(sid, part), `${sid},${part}`).toThrow(RangeError);
    expect(() => siteOfRegionId(GEN2_SITE_BASE - 1)).toThrow(RangeError);
  });
});
