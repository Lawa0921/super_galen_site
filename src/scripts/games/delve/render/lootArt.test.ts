// lootArt.test.ts — 掉落物標記 / 光柱的像素：只用色票色（不透明）、優良 / 稀有有浮動標記、史詩光柱有白芯 + 描邊、神話光柱不是米白色。
import { describe, it, expect } from 'vitest';
import { beamPixels, beamColors, markerPixels, rarityColor, lootGlyphScale, LOOT_MIN_CSS_PER_PX } from './lootArt';
import { inPalette, hex } from './pixel';

describe('lootGlyphScale：縮小時標記 / 光柱整數倍加粗', () => {
  it('預設縮放（每美術像素 ≥ 2 CSS px）= 1；縮到 1 CSS px = 2；更小 = 更粗，最多 4；永遠是整數', () => {
    expect(lootGlyphScale(2)).toBe(1);
    expect(lootGlyphScale(3)).toBe(1);
    expect(lootGlyphScale(1.5)).toBe(2);
    expect(lootGlyphScale(1)).toBe(2);
    expect(lootGlyphScale(0.5)).toBe(4);
    expect(lootGlyphScale(0.1)).toBe(4);
    expect(lootGlyphScale(0)).toBe(1);
    for (const z of [0.4, 0.75, 1, 1.25, 2, 2.5, 4]) {
      const k = lootGlyphScale(z);
      expect(Number.isInteger(k)).toBe(true);
      if (k < 4) expect(k * z).toBeGreaterThanOrEqual(LOOT_MIN_CSS_PER_PX - 1e-9); // 在畫面上至少 2 CSS px 一個美術像素
    }
  });
});

describe('掉落物標記', () => {
  it('優良 / 稀有：5×5 菱形，有深色描邊、填稀有度色；隨時間上下浮動 1px', () => {
    for (const r of [1, 2]) {
      const a = markerPixels(r, 0), b = markerPixels(r, 0.5);
      expect(a.length).toBeGreaterThanOrEqual(12);
      expect(a.some((p) => p.c === '#0c0a12')).toBe(true);
      expect(a.some((p) => p.c === rarityColor(r, 0))).toBe(true);
      for (const p of a) expect(inPalette(hex(p.c))).toBe(true);
      expect(Math.min(...a.map((p) => p.y))).not.toBe(Math.min(...b.map((p) => p.y)));
    }
    expect(markerPixels(0, 0)).toEqual([]);
  });
  it('史詩光柱：白色芯 + 深色描邊（在亮的草地上也看得到）', () => {
    const px = beamPixels(28, 0);
    expect(px.some((p) => p.c === 2)).toBe(true);
    expect(px.some((p) => p.c === 3)).toBe(true);
    const cols = beamColors(3, 0);
    for (const c of cols) expect(inPalette(hex(c))).toBe(true);
    expect(cols[3]).toBe('#0c0a12');
  });
  it('神話光柱一直在飽和色之間流轉，不會是米白色', () => {
    for (let t = 0; t < 3; t += 0.05) {
      const [hi, lo] = beamColors(5, t);
      expect(hi).not.toBe('#fff4c0');
      expect(lo).not.toBe('#fff4c0');
    }
  });
});
