// lightShade.test.ts
import { describe, it, expect } from 'vitest';
import { World } from '../engine/world';
import { T, W } from '../engine/tiles';
import { LightEngine, ambientReach } from '../engine/lighting';
import { shadeTiles, fillLightPixels, depthCurve, HUE_STEPS, HUE_SAT, DARK_RGB, GAIN } from './lightShade';
import { LIGHT_DEEP_START, LIGHT_DEEP_FULL } from '../engine/constants';
import { lightLevel } from './lowres';
import { LIGHT_LEVELS } from './lowres';

function secretRoomWorld(): World {
  const w = new World(100, 100);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, T.STONE); w.setWall(x, y, W.STONE_WALL); }
  for (let y = 45; y < 55; y++) for (let x = 40; x < 60; x++) w.setFg(x, y, T.AIR);
  for (let y = 45; y < 55; y++) w.setFg(50, y, T.CRACKED_STONE);
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

describe('depthCurve：地下的暗部曲線（未照到的地方更暗、光源附近照樣亮）', () => {
  it('地表附近（深度 ≤ LIGHT_DEEP_START）完全不變', () => {
    for (const m of [0, 0.1, 0.33, 0.6, 1]) for (const d of [-20, 0, LIGHT_DEEP_START]) expect(depthCurve(m, d)).toBe(m);
  });
  it('深處：0 與 1 不變、中間被壓暗；越深越暗（到 LIGHT_DEEP_FULL 封頂）；對亮度單調', () => {
    const deep = LIGHT_DEEP_FULL + 10;
    expect(depthCurve(0, deep)).toBe(0);
    expect(depthCurve(1, deep)).toBe(1);
    expect(depthCurve(0.3, deep)).toBeLessThan(0.3 * 0.75);
    expect(depthCurve(0.3, deep)).toBeLessThan(depthCurve(0.3, LIGHT_DEEP_START + 4));
    expect(depthCurve(0.3, deep)).toBe(depthCurve(0.3, deep + 100));
    let last = 0;
    for (let m = 0; m <= 1.0001; m += 0.05) { const v = depthCurve(m, deep); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
  it('shadeTiles 套用曲線：同樣的引擎光，深處的格比地表附近暗、色相不變', () => {
    const w = new World(40, 120);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setWall(x, y, W.STONE_WALL);
    w.surface.fill(10);
    w.surfaceY = 0;
    const rect = { x0: 0, y0: 0, w: 40, h: 120 };
    const L = new LightEngine().compute(w, { x: 0, y: 0, w: 40, h: 120 }, { sky: 0 });
    L.rgb.fill(0);
    const put = (y: number): void => { const i = ((y - L.y0) * L.w + (5 - L.x0)) * 3; L.rgb[i] = 0.4; L.rgb[i + 1] = 0.3; L.rgb[i + 2] = 0.2; };
    put(12); put(100);
    const out = new Float32Array(40 * 120 * 3);
    shadeTiles(L, w, rect, { x: 30, y: 60 }, [0, 0, 0], new Uint8Array(40 * 120), out);
    const at = (y: number): number[] => [...out.subarray((y * 40 + 5) * 3, (y * 40 + 5) * 3 + 3)];
    const near = at(12), deep = at(100);
    expect(near[0]).toBeCloseTo(0.4 * GAIN, 5);
    expect(deep[0]).toBeLessThan(near[0] * 0.75);
    expect(deep[1] / deep[0]).toBeCloseTo(near[1] / near[0], 5);
  });
  /** 深處的一條走廊，(70, row) 放火把（tile）或手持火把（動態光 0.85）；回傳每格距離的亮度階 */
  function poolLevels(held: boolean): number[] {
    const w = new World(140, 200);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, T.STONE); w.setWall(x, y, W.STONE_WALL); }
    w.surface.fill(20);
    w.surfaceY = 0;
    const row = 150;
    for (let x = 10; x < 130; x++) for (let y = row - 6; y <= row; y++) w.setFg(x, y, T.AIR);
    if (!held) w.setFg(70, row, T.TORCH);
    const rect = { x0: 20, y0: row - 20, w: 100, h: 30 };
    const L = new LightEngine().compute(w, { x: rect.x0, y: rect.y0, w: rect.w, h: rect.h }, { sky: 0, lights: held ? [{ x: 70, y: row, v: 0.85 }] : [] });
    const out = new Float32Array(rect.w * rect.h * 3);
    shadeTiles(L, w, rect, { x: 0, y: 0 }, [0, 0, 0], new Uint8Array(rect.w * rect.h), out);
    return Array.from({ length: 30 }, (_, d) => lightLevel(out[((row - rect.y0) * rect.w + (70 + d - rect.x0)) * 3], 0, 0));
  }
  it('手持火把在深處：亮核約 2.5–3 格、光的邊緣約 14 格（第一次玩也看得清楚）', () => {
    const lv = poolLevels(true);
    const core = lv.findIndex((v) => v < 5), edge = lv.findIndex((v) => v === 0);
    expect(core).toBeGreaterThanOrEqual(2);
    expect(core).toBeLessThanOrEqual(4);
    expect(edge).toBeGreaterThanOrEqual(13);
    expect(edge).toBeLessThanOrEqual(16);
  });
  it('深處火把的光池：亮度階隨距離一階一階往下（階梯式），十幾格外全暗', () => {
    const w = new World(140, 200);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) { w.setFg(x, y, T.STONE); w.setWall(x, y, W.STONE_WALL); }
    w.surface.fill(20);
    w.surfaceY = 0;
    const row = 150;
    for (let x = 10; x < 130; x++) for (let y = row - 6; y <= row; y++) w.setFg(x, y, T.AIR);
    w.setFg(70, row, T.TORCH);
    const rect = { x0: 20, y0: row - 20, w: 100, h: 30 };
    const L = new LightEngine().compute(w, { x: rect.x0, y: rect.y0, w: rect.w, h: rect.h }, { sky: 0 });
    const out = new Float32Array(rect.w * rect.h * 3);
    shadeTiles(L, w, rect, { x: 0, y: 0 }, [0, 0, 0], new Uint8Array(rect.w * rect.h), out);
    const lv = (x: number): number => lightLevel(out[((row - rect.y0) * rect.w + (x - rect.x0)) * 3], 0, 0);
    const levels = Array.from({ length: 30 }, (_, d) => lv(70 + d));
    for (let d = 1; d < levels.length; d++) expect(levels[d]).toBeLessThanOrEqual(levels[d - 1]);
    expect(levels[0]).toBeGreaterThanOrEqual(6);
    expect(new Set(levels).size).toBeGreaterThanOrEqual(5); // 看得到好幾階
    const dark = levels.findIndex((v) => v === 0);
    expect(dark).toBeGreaterThanOrEqual(14); // 插著的火把光池半徑約 15 格
    expect(dark).toBeLessThanOrEqual(18); // 18 格內就全暗（舊的 0.91 衰減、沒有暗部曲線要 35 格）
  });
});

describe('湖岸 / 懸崖：地表一欄就差 24 格時，深度曲線不切出直線', () => {
  it('同樣的引擎光、同一列，相鄰兩欄的亮度差很小（參考地表在 ±8 欄內平滑）', () => {
    const w = new World(120, 160);
    for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setWall(x, y, W.STONE_WALL);
    for (let x = 0; x < 120; x++) w.surface[x] = x < 60 ? 40 : 64; // x = 60 是湖岸的落差
    w.surfaceY = 0;
    const rect = { x0: 0, y0: 0, w: 120, h: 160 };
    const L = new LightEngine().compute(w, { x: 0, y: 0, w: 120, h: 160 }, { sky: 0 });
    L.rgb.fill(0);
    const y = 70; // 左邊在地下 30 格（深）、右邊只有 6 格（淺）
    for (let x = 0; x < 120; x++) { const i = ((y - L.y0) * L.w + (x - L.x0)) * 3; L.rgb[i] = L.rgb[i + 1] = L.rgb[i + 2] = 0.35; }
    const out = new Float32Array(120 * 160 * 3);
    shadeTiles(L, w, rect, { x: 0, y: 0 }, [0, 0, 0], new Uint8Array(120 * 160), out);
    const v = (x: number): number => out[(y * 120 + x) * 3];
    let maxStep = 0;
    for (let x = 30; x < 90; x++) maxStep = Math.max(maxStep, Math.abs(v(x + 1) - v(x)));
    expect(v(30)).toBeLessThan(v(89)); // 深的那側比較暗
    expect(maxStep).toBeLessThan((v(89) - v(30)) / 6); // 沒有一刀切：至少分 6 欄以上慢慢過渡
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
