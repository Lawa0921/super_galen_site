// liquidArt.test.ts — 液體貼片：只用色票、不用半透明（抖動挖洞）、填充高度對齊美術像素、水面動畫、
// 貼片種類選擇（水面 / 內部 / 落下的水柱）、新 tile / 圖示 / 呼吸泡泡、地圖上的液體顏色
import { describe, it, expect } from 'vitest';
import { liquidTile, liquidPiece, breathBubble, texHive, texCrispy, texHiveWall, LIQUID_FRAMES } from './liquidArt';
import { inPalette, Bmp } from './pixel';
import { LIQ } from '../engine/liquidKind';
import { buildMapLut, paintMapChunkAt } from './mapModel';
import { World } from '../engine/world';
import { ExploredMap } from '../engine/explore';
import { CHUNK } from '../engine/constants';

const alpha = (b: Bmp): number[] => Array.from(b.px, (v) => v >>> 24);
function countOpaque(b: Bmp, y0 = 0, y1 = 16): number {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = 0; x < 16; x++) if (b.px[y * 16 + x] >>> 24) n++;
  return n;
}

describe('液體貼片', () => {
  it('每個像素要嘛全透明、要嘛不透明的色票色（不用半透明）', () => {
    for (const t of [LIQ.WATER, LIQ.LAVA, LIQ.HONEY]) for (const piece of ['surface', 'body', 'fall'] as const) for (let f = 0; f < LIQUID_FRAMES; f++) {
      const b = liquidTile(t, 16, f, piece);
      for (const v of b.px) {
        const a = v >>> 24;
        expect(a === 0 || a === 255).toBe(true);
        if (a) expect(inPalette(Bmp.unpack(v))).toBe(true);
      }
    }
  });
  it('水是抖動的（看得到後面），熔岩不透明，蜂蜜比水密', () => {
    const water = countOpaque(liquidTile(LIQ.WATER, 16, 0, 'body'));
    const honey = countOpaque(liquidTile(LIQ.HONEY, 16, 0, 'body'));
    const lava = countOpaque(liquidTile(LIQ.LAVA, 16, 0, 'body'));
    expect(water).toBeGreaterThan(64);
    expect(water).toBeLessThan(200);
    expect(honey).toBeGreaterThan(water);
    expect(lava).toBe(256);
  });
  it('填充高度：h 像素高的水面貼片，上面 16-h 排（扣掉 1 px 波浪）是空的', () => {
    for (const h of [2, 5, 8, 13]) {
      const b = liquidTile(LIQ.LAVA, h, 0, 'surface');
      expect(countOpaque(b, 0, Math.max(0, 16 - h - 1))).toBe(0);
      expect(countOpaque(b, 16 - h + 1, 16)).toBe(16 * (h - 1));
    }
  });
  it('水面會動（不同動畫格不一樣）、落下的水柱也會動', () => {
    const a = alpha(liquidTile(LIQ.WATER, 12, 0, 'surface')).join(), b = alpha(liquidTile(LIQ.WATER, 12, 1, 'surface')).join();
    expect(a).not.toBe(b);
    const fa = liquidTile(LIQ.WATER, 16, 0, 'fall').px.join(), fb = liquidTile(LIQ.WATER, 16, 2, 'fall').px.join();
    expect(fa).not.toBe(fb);
  });
  it('水面貼片左右可以無縫接起來（波浪週期 = 16 px）', () => {
    const b = liquidTile(LIQ.WATER, 10, 1, 'surface');
    // 最左欄與最右欄的水面高度差 ≤ 1
    const top = (x: number): number => { for (let y = 0; y < 16; y++) if (b.px[y * 16 + x] >>> 24) return y; return 16; };
    expect(Math.abs(top(0) - top(15))).toBeLessThanOrEqual(1);
  });
});

describe('liquidPiece：選貼片', () => {
  it('上方沒有液體 → 水面，高度 = 量 / 255 × 16（至少 1 px）', () => {
    expect(liquidPiece(255, false, false)).toEqual({ piece: 'surface', h: 16 });
    expect(liquidPiece(128, false, false)).toEqual({ piece: 'surface', h: 8 });
    expect(liquidPiece(3, false, false)).toEqual({ piece: 'surface', h: 1 });
  });
  it('上方有液體 → 內部（滿格）；下面還能流（正在落下，不管上方 / 量）→ 落下的水柱', () => {
    expect(liquidPiece(255, true, false)).toEqual({ piece: 'body', h: 16 });
    expect(liquidPiece(90, true, false)).toEqual({ piece: 'body', h: 16 });
    expect(liquidPiece(90, true, true)).toEqual({ piece: 'fall', h: 16 });
    expect(liquidPiece(90, false, true)).toEqual({ piece: 'fall', h: 16 });
    expect(liquidPiece(255, false, true)).toEqual({ piece: 'fall', h: 16 });
  });
});

describe('其他美術', () => {
  it('蜂巢殼 / 酥蜜塊 / 蜂巢牆：不透明色票色、三個變體不同', () => {
    for (const fn of [texHive, texCrispy, texHiveWall]) {
      const v = [0, 1, 2].map((k) => fn(k));
      for (const b of v) for (const p of b.px) { expect(p >>> 24).toBe(255); expect(inPalette(Bmp.unpack(p))).toBe(true); }
      expect(v[0].px.join()).not.toBe(v[1].px.join());
    }
  });
  it('呼吸泡泡：滿的比破的多像素', () => {
    const op = (b: Bmp): number => b.px.filter((v) => v >>> 24).length;
    expect(op(breathBubble(true))).toBeGreaterThan(op(breathBubble(false)) + 10);
  });
});

describe('地圖：液體顏色', () => {
  it('水 / 熔岩 / 蜂蜜畫成各自的顏色（覆蓋空氣 / 背景牆）', () => {
    const w = new World(CHUNK, CHUNK);
    w.surfaceY = 0;
    w.setLiquid(1, 1, 255, LIQ.WATER); w.setLiquid(2, 1, 255, LIQ.LAVA); w.setLiquid(3, 1, 255, LIQ.HONEY);
    const ex = new ExploredMap(CHUNK, CHUNK);
    ex.revealDisc(5, 5, 20);
    const lut = buildMapLut();
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(out, w, ex, 0, 0, lut);
    const c = [out[CHUNK + 1], out[CHUNK + 2], out[CHUNK + 3]];
    expect(new Set(c).size).toBe(3);
    expect(c).toEqual([lut.liquid[LIQ.WATER], lut.liquid[LIQ.LAVA], lut.liquid[LIQ.HONEY]]);
    expect(out[CHUNK + 5]).toBe(lut.cave);
  });
});
