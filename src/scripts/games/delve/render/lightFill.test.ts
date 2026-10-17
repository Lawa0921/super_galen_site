// lightFill.test.ts — 光照遮罩填像素的最佳化 / 分幀版必須與原始版逐像素相同
import { describe, it, expect } from 'vitest';
import { fillLightPixels, LightFiller, rectCovers } from './lightShade';
import { referenceFillLightPixels } from './lightFill.reference';
import { LIGHT_LEVELS } from './lowres';

/** 可重現的亂數 */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

/**
 * 像遊戲的光場：大片全暗 / 全亮平台、火把的圓形漸層（暖色）、冷色水晶、剛好落在階上的格、隨機雜訊格
 */
function field(lw: number, lh: number, seed: number): Float32Array {
  const r = rng(seed), A = new Float32Array(lw * lh * 3);
  const lights = Array.from({ length: 6 }, () => ({ x: r() * lw, y: r() * lh, v: 0.4 + r() * 0.7, c: r() < 0.5 ? [1, 0.6, 0.3] : [0.3, 0.7, 1] }));
  for (let y = 0; y < lh; y++) {
    for (let x = 0; x < lw; x++) {
      const o = (y * lw + x) * 3;
      if (y < lh * 0.25) { A[o] = A[o + 1] = 0.8; A[o + 2] = 0.9; continue; } // 天空：同一色平台
      let R = 0, G = 0, B = 0;
      for (const l of lights) {
        const d = Math.hypot(x - l.x, y - l.y), k = Math.max(0, l.v - d * 0.08);
        R = Math.max(R, k * l.c[0]); G = Math.max(G, k * l.c[1]); B = Math.max(B, k * l.c[2]);
      }
      const u = r();
      if (u < 0.05) { const k = Math.floor(r() * LIGHT_LEVELS) / (LIGHT_LEVELS - 1); R = G = B = k; } // 剛好在階上
      else if (u < 0.08) { R = r(); G = r(); B = r(); } // 雜訊
      A[o] = R; A[o + 1] = G; A[o + 2] = B;
    }
  }
  return A;
}

const CASES: [number, number, number, number, number][] = [
  // lw, lh, sub, ox, oy
  [67, 41, 8, 1224 * 8, 280 * 8],
  [45, 31, 8, 13 * 8, 7 * 8],
  [12, 9, 4, 3, 5],
  [1, 1, 8, 0, 0],
  [5, 3, 8, 2, 1],
];

describe('fillLightPixels（最佳化版）與原始版逐像素相同', () => {
  for (const [lw, lh, sub, ox, oy] of CASES) {
    it(`${lw}×${lh} 格、sub ${sub}、原點 (${ox}, ${oy})`, () => {
      for (let seed = 1; seed <= 4; seed++) {
        const A = field(lw, lh, seed * 7 + lw);
        const n = lw * lh * sub * sub;
        const p0 = new Uint32Array(n), a0 = new Uint32Array(n), p1 = new Uint32Array(n), a1 = new Uint32Array(n);
        referenceFillLightPixels(A, lw, lh, sub, ox, oy, p0, a0);
        fillLightPixels(A, lw, lh, sub, ox, oy, p1, a1);
        expect(p1).toEqual(p0);
        expect(a1).toEqual(a0);
      }
    });
  }
});

describe('LightFiller：分好幾次填（分幀）結果與一次填完相同', () => {
  it('任意切點分段填列 → 與原始版相同', () => {
    const [lw, lh, sub, ox, oy] = CASES[0];
    const A = field(lw, lh, 99);
    const n = lw * lh * sub * sub;
    const p0 = new Uint32Array(n), a0 = new Uint32Array(n);
    referenceFillLightPixels(A, lw, lh, sub, ox, oy, p0, a0);
    const f = new LightFiller();
    const p1 = new Uint32Array(n), a1 = new Uint32Array(n);
    f.begin(A, lw, lh, sub, ox, oy, p1, a1);
    expect(f.rows).toBe(lh * sub);
    const r = rng(5);
    while (!f.done) f.fillRows(1 + Math.floor(r() * 40));
    expect(p1).toEqual(p0);
    expect(a1).toEqual(a0);
  });

  it('fillUntil：每次至少前進一個 tile 列，時間到就停；最後一次回傳 true', () => {
    const lw = 20, lh = 10, sub = 8;
    const A = field(lw, lh, 3);
    const n = lw * lh * sub * sub;
    const f = new LightFiller();
    f.begin(A, lw, lh, sub, 0, 0, new Uint32Array(n), new Uint32Array(n));
    // 假時鐘：每讀一次前進 1 ms → 截止時間已過，也要至少填一個 tile 列（sub 列）
    let t = 0;
    const now = (): number => (t += 1);
    expect(f.fillUntil(0, now)).toBe(false);
    expect(f.row).toBe(sub);
    // 不限時 → 一次填完
    expect(f.fillUntil(Infinity, now)).toBe(true);
    expect(f.done).toBe(true);
    expect(f.row).toBe(lh * sub);
  });

  it('LightFiller 自己的工作區：兩個 filler 交錯使用互不干擾', () => {
    const a = field(30, 20, 1), b = field(30, 20, 2), n = 30 * 20 * 64;
    const ref = (A: Float32Array): Uint32Array => { const p = new Uint32Array(n); referenceFillLightPixels(A, 30, 20, 8, 0, 0, p, new Uint32Array(n)); return p; };
    const fa = new LightFiller(), fb = new LightFiller();
    const pa = new Uint32Array(n), pb = new Uint32Array(n);
    fa.begin(a, 30, 20, 8, 0, 0, pa, new Uint32Array(n));
    fb.begin(b, 30, 20, 8, 0, 0, pb, new Uint32Array(n));
    while (!fa.done || !fb.done) { fa.fillRows(16); fb.fillRows(16); }
    expect(pa).toEqual(ref(a));
    expect(pb).toEqual(ref(b));
  });
});

describe('rectCovers', () => {
  it('光照遮罩（tile 矩形）是否蓋住整個畫面', () => {
    const lm = { x0: 10, y0: 20, w: 30, h: 15 };
    expect(rectCovers(lm, { x: 10, y: 20, w: 30, h: 15 })).toBe(true);
    expect(rectCovers(lm, { x: 12, y: 22, w: 20, h: 10 })).toBe(true);
    expect(rectCovers(lm, { x: 9, y: 22, w: 20, h: 10 })).toBe(false);
    expect(rectCovers(lm, { x: 12, y: 22, w: 29, h: 10 })).toBe(false);
    expect(rectCovers(lm, { x: 12, y: 19, w: 20, h: 10 })).toBe(false);
    expect(rectCovers(lm, { x: 12, y: 22, w: 20, h: 14 })).toBe(false);
    expect(rectCovers(null, { x: 0, y: 0, w: 1, h: 1 })).toBe(false);
  });
});
