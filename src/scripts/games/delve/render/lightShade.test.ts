// lightShade.test.ts
import { describe, it, expect } from 'vitest';
import { World } from '../engine/world';
import { T, W } from '../engine/tiles';
import { LightEngine, ambientReach } from '../engine/lighting';
import { shadeTiles, fillLightPixels, HUE_STEPS, HUE_SAT, DARK_RGB } from './lightShade';
import { LIGHT_LEVELS } from './lowres';

function secretRoomWorld(): World {
  const w = new World(100, 100);
  w.fg.fill(T.STONE);
  w.wall.fill(W.STONE_WALL);
  for (let y = 45; y < 55; y++) for (let x = 40; x < 60; x++) w.fg[w.idx(x, y)] = T.AIR;
  for (let y = 45; y < 55; y++) w.fg[w.idx(50, y)] = T.CRACKED_STONE;
  w.surfaceY = 0;
  return w;
}

describe('shadeTiles', () => {
  it('密室：玩家在牆這側，牆後的格完全不亮（輪廓微光不穿牆），走廊有微光', () => {
    const w = secretRoomWorld();
    const rect = { x0: 30, y0: 35, w: 40, h: 30 };
    const L = new LightEngine().compute(w, { x: rect.x0, y: rect.y0, w: rect.w, h: rect.h }, { sky: 0 });
    const reach = new Uint8Array(rect.w * rect.h);
    ambientReach(w, 46, 50, 13, { x: rect.x0, y: rect.y0, w: rect.w, h: rect.h }, reach);
    const out = new Float32Array(rect.w * rect.h * 3);
    shadeTiles(L, w, rect, { x: 46, y: 50 }, [0, 0, 0], reach, out);
    const at = (x: number, y: number): number => out[((y - rect.y0) * rect.w + (x - rect.x0)) * 3];
    expect(at(46, 50)).toBeGreaterThan(0.15);
    expect(at(49, 50)).toBeGreaterThan(0.1);
    for (let y = 45; y < 55; y++) for (let x = 51; x < 60; x++) expect(at(x, y)).toBe(0);
  });
  it('開放天空的格吃天空色（往白拉一半）', () => {
    const w = new World(20, 20);
    w.surfaceY = 15;
    const rect = { x0: 0, y0: 0, w: 20, h: 20 };
    const L = new LightEngine().compute(w, { x: 0, y: 0, w: 20, h: 20 }, { sky: 0.2 });
    const out = new Float32Array(400 * 3);
    shadeTiles(L, w, rect, { x: 5, y: 5 }, [0.1, 0.1, 0.3], new Uint8Array(400), out);
    const o = (5 * 20 + 5) * 3;
    expect(out[o]).toBeCloseTo(0.55, 5);
    expect(out[o + 2]).toBeCloseTo(0.65, 5);
  });
});

describe('fillLightPixels', () => {
  const run = (rgb: [number, number, number], lw = 4, lh = 4, sub = 4): { pix: Uint32Array; add: Uint32Array } => {
    const A = new Float32Array(lw * lh * 3);
    for (let i = 0; i < lw * lh; i++) A.set(rgb, i * 3);
    const pix = new Uint32Array(lw * lh * sub * sub), add = new Uint32Array(lw * lh * sub * sub);
    fillLightPixels(A, lw, lh, sub, 0, 0, pix, add);
    return { pix, add };
  };
  const chans = (v: number): number[] => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, v >>> 24];
  it('每個像素都完全不透明（沒有半透明）', () => {
    const { pix, add } = run([0.4, 0.3, 0.2]);
    for (const v of pix) expect(v >>> 24).toBe(255);
    for (const v of add) expect(v >>> 24).toBe(255);
  });
  it('剛好在某階上 → 平台，沒有抖動；色相吸附到 HUE_STEPS 階', () => {
    const k = 3 / (LIGHT_LEVELS - 1);
    const { pix } = run([k, k * 0.74, k * 0.46]);
    expect(new Set(pix).size).toBe(1);
    const [r, g, b] = chans(pix[0]);
    expect(r).toBe(Math.round(255 * k));
    const q = (c: number): number => Math.round(255 * k * (Math.round((1 - (1 - c) * HUE_SAT) * HUE_STEPS) / HUE_STEPS));
    expect(g).toBe(q(0.74));
    expect(b).toBe(q(0.46));
    expect(b).toBeLessThan(g);
  });
  it('兩階正中間 → Bayer 抖動出兩種顏色（只有亮度不同）', () => {
    const k = 3.5 / (LIGHT_LEVELS - 1);
    const { pix } = run([k, k, k]);
    const set = [...new Set(pix)];
    expect(set.length).toBe(2);
    for (const v of set) { const [r, g, b] = chans(v); expect(r).toBe(g); expect(g).toBe(b); }
  });
  it('全暗 → multiply 純黑、add 補色票最暗色', () => {
    const { pix, add } = run([0, 0, 0]);
    expect(chans(pix[0]).slice(0, 3)).toEqual([0, 0, 0]);
    expect(chans(add[0]).slice(0, 3)).toEqual([...DARK_RGB]);
  });
  it('暗色補色隨亮度遞減：越暗補越多、不會讓暗處比微亮處亮', () => {
    const lum = (v: number): number => chans(v)[0] + chans(v)[1] + chans(v)[2];
    const k1 = 1 / (LIGHT_LEVELS - 1);
    const a0 = run([0, 0, 0]).add[0], a1 = run([k1, k1, k1]).add[0];
    expect(lum(a1)).toBeLessThan(lum(a0));
    expect(lum(a1)).toBeGreaterThan(0);
  });
  it('亮的地方 add 為黑（加 0 不變色）', () => {
    const { add } = run([1, 1, 1]);
    for (const v of add) expect(chans(v).slice(0, 3)).toEqual([0, 0, 0]);
  });
});

describe('fillLightPixels 色相交界抖動', () => {
  const lw = 8, lh = 4, sub = 4;
  const twoTone = (): { pix: Uint32Array } => {
    const A = new Float32Array(lw * lh * 3);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) A.set(x < lw / 2 ? [1, 0.55, 0.2] : [0.25, 0.6, 1], (y * lw + x) * 3);
    const pix = new Uint32Array(lw * lh * sub * sub), add = new Uint32Array(lw * lh * sub * sub);
    fillLightPixels(A, lw, lh, sub, 0, 0, pix, add);
    return { pix };
  };
  const W = lw * sub;
  it('遠離交界：整片同一色（不抖動）', () => {
    const { pix } = twoTone();
    const left = new Set<number>(), right = new Set<number>();
    for (let y = 0; y < lh * sub; y++) for (let x = 0; x < 6; x++) { left.add(pix[y * W + x]); right.add(pix[y * W + W - 1 - x]); }
    expect(left.size).toBe(1);
    expect(right.size).toBe(1);
  });
  it('交界附近：色相不是一刀切，而是逐欄抖動過渡（同一欄裡混著兩種以上的色）', () => {
    const { pix } = twoTone();
    const L = pix[0], R = pix[W - 1];
    let mixedCols = 0, inter = 0;
    for (let x = 0; x < W; x++) {
      const col = new Set<number>();
      for (let y = 0; y < lh * sub; y++) { const v = pix[y * W + x]; col.add(v); if (v !== L && v !== R) inter++; }
      if (col.size > 1) mixedCols++;
    }
    expect(mixedCols).toBeGreaterThanOrEqual(2);
    expect(inter).toBeGreaterThan(0); // 有中間色階
  });
  it('世界錨定：遮罩原點平移 4 個小格，抖動圖樣跟著世界走（同一世界像素同色）', () => {
    const A = new Float32Array(lw * lh * 3);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) A.set(x < lw / 2 ? [1, 0.55, 0.2] : [0.25, 0.6, 1], (y * lw + x) * 3);
    const p0 = new Uint32Array(W * lh * sub), p1 = new Uint32Array(W * lh * sub), add = new Uint32Array(W * lh * sub);
    fillLightPixels(A, lw, lh, sub, 0, 0, p0, add);
    fillLightPixels(A, lw, lh, sub, 4, 0, p1, add);
    expect([...p1]).toEqual([...p0]); // 4 的倍數 → Bayer 相位一樣
  });
});
