// tileFamily.test.ts — 石 / 土的材質「家族」：低頻雜訊挑家族，大片區域不會看出重複格。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { FAMILIES, FAMILY_TILES, tileVariant, variantFamily } from './tileFamily';
import { VARIANTS } from './autotile';

describe('variantFamily', () => {
  it('值域 0..FAMILIES-1、同座標結果固定', () => {
    for (let i = 0; i < 500; i++) {
      const x = (i * 37) % 900, y = (i * 91) % 700;
      const f = variantFamily(x, y);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(FAMILIES);
      expect(variantFamily(x, y)).toBe(f);
    }
  });
  it('低頻：相鄰格大多同家族，但大範圍內每個家族都出現', () => {
    let same = 0, n = 0;
    const seen = new Set<number>();
    for (let y = 0; y < 200; y++) for (let x = 0; x < 200; x++) {
      const f = variantFamily(x, y);
      seen.add(f);
      if (x > 0) { n++; if (variantFamily(x - 1, y) === f) same++; }
    }
    expect(same / n).toBeGreaterThan(0.8);
    expect(seen.size).toBe(FAMILIES);
  });
  it('邊界會抖動交錯（不是一條直線切開）：跨界的一列裡家族來回切換不只一次', () => {
    let flips = 0;
    for (let y = 0; y < 400; y++) {
      let prev = variantFamily(0, y);
      let rowFlips = 0;
      for (let x = 1; x < 400; x++) { const f = variantFamily(x, y); if (f !== prev) rowFlips++; prev = f; }
      flips = Math.max(flips, rowFlips);
    }
    expect(flips).toBeGreaterThan(4);
  });
});

describe('tileVariant', () => {
  it('石 / 土：variant + VARIANTS × 家族；其他材質照舊', () => {
    for (const id of FAMILY_TILES) {
      const v = tileVariant(id, 10, 20, 2);
      expect(v % VARIANTS).toBe(2);
      expect(Math.floor(v / VARIANTS)).toBe(variantFamily(10, 20));
    }
    expect(tileVariant(T.SAND, 10, 20, 2)).toBe(2);
    expect(tileVariant(T.STONE, 10, 20, 5)).toBe(tileVariant(T.STONE, 10, 20, 2));
  });
});
