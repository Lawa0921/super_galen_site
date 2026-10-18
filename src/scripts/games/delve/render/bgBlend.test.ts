// bgBlend.test.ts — 背景生態區混合（連續權重場 + 每層各自的抹過寬度 + 錨定在圖層上的抖動）。
import { describe, it, expect } from 'vitest';
import { BAND_SLICES, BiomeField, LAYER_HALF, SKY_HALF, WIPE_BAND, WIPE_LEVELS, levelKeep, levelMask, wipeFront } from './bgBlend';

// 0..299 森林、300..599 沙漠、600..899 雪原
const cols = Array.from({ length: 900 }, (_, x) => (x < 300 ? 0 : x < 600 ? 1 : 2));
const field = new BiomeField(cols);

describe('BiomeField.weights（盒狀濾波，連續）', () => {
  it('遠離邊界：只有本區', () => {
    const w = field.weights(150, 40);
    expect(w[0]).toBeCloseTo(1);
    expect(w[1]).toBeCloseTo(0);
  });
  it('剛好在邊界上：兩區各半；權重總和 = 1', () => {
    const w = field.weights(300, 40);
    expect(w[0]).toBeCloseTo(0.5);
    expect(w[1]).toBeCloseTo(0.5);
    for (const cx of [10, 280, 301.3, 640, 899]) {
      const s = field.weights(cx, 60).reduce((a, b) => a + b, 0);
      expect(s).toBeCloseTo(1);
    }
  });
  it('鏡頭每移 1 美術 px（1/16 格），權重只變一點點（不會跳）', () => {
    let prev = field.weights(240, 40)[1];
    for (let x = 240; x < 360; x += 1 / 16) {
      const w = field.weights(x, 40)[1];
      expect(Math.abs(w - prev)).toBeLessThan(0.002);
      prev = w;
    }
  });
});

describe('BiomeField.pair（左右兩區 + 右區比例）', () => {
  it('左 = 中心偏左的那區、右 = 偏右的那區；u 隨鏡頭往右單調增加', () => {
    const p = field.pair(300, 40);
    expect(p.left).toBe(0);
    expect(p.right).toBe(1);
    expect(p.u).toBeCloseTo(0.5);
    let prev = -1;
    for (let x = 250; x < 350; x += 0.5) {
      const q = field.pair(x, 40);
      if (q.left === q.right) continue;
      expect(q.u).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = q.u;
    }
  });
  it('走過邊界再走回來：同一個位置得到同一個結果（沒有狀態 → 不會來回跳）', () => {
    const a = field.pair(310.25, 64), b = field.pair(330, 64), c = field.pair(310.25, 64);
    expect(c).toEqual(a);
    expect(b.u).toBeGreaterThan(a.u);
  });
  it('遠處：u = 0 或 1（只畫一層）', () => {
    expect(field.pair(100, 40).u).toBe(0);
    expect(field.pair(100, 40).left).toBe(0);
    expect(field.pair(450, 40).u === 0 || field.pair(450, 40).u === 1).toBe(true);
  });
  it('每層的混合寬度不同：遠山最寬、近林最窄，天空更寬', () => {
    expect(LAYER_HALF[0]).toBeGreaterThan(LAYER_HALF[1]);
    expect(LAYER_HALF[1]).toBeGreaterThan(LAYER_HALF[2]);
    expect(SKY_HALF).toBeGreaterThanOrEqual(LAYER_HALF[0]);
    // 離邊界 50 格時：近林已經完全換成本區，遠山還在混
    expect(field.pair(250, LAYER_HALF[2]).u).toBe(0);
    expect(field.pair(250, LAYER_HALF[0]).u).toBeGreaterThan(0);
  });
});

describe('wipeFront（垂直抹過的分界線）', () => {
  it('u = 0 → 分界在右緣外（全畫左區）；u = 1 → 左緣外；中間連續', () => {
    expect(wipeFront(0, 480)).toBeGreaterThanOrEqual(480 + WIPE_BAND / 2);
    expect(wipeFront(1, 480)).toBeLessThanOrEqual(-WIPE_BAND / 2);
    let prev = Infinity;
    for (let u = 0; u <= 1; u += 0.01) { const f = wipeFront(u, 480); expect(f).toBeLessThanOrEqual(prev); prev = f; }
    // 每 1% 移動不超過 ~畫面 2%
    expect(Math.abs(wipeFront(0.5, 480) - wipeFront(0.51, 480))).toBeLessThan(12);
  });
});

describe('分界帶（WIPE_LEVELS 段、1×1 Bayer 遮罩、錨定圖層）', () => {
  it('各段剛好鋪滿 WIPE_BAND（夠寬、夠多階）、越右越密', () => {
    expect(WIPE_BAND).toBeGreaterThanOrEqual(64);
    expect(WIPE_LEVELS).toBeGreaterThanOrEqual(8);
    expect(BAND_SLICES[0].x0).toBe(0);
    expect(BAND_SLICES[BAND_SLICES.length - 1].x1).toBe(WIPE_BAND);
    for (let i = 1; i < BAND_SLICES.length; i++) {
      expect(BAND_SLICES[i].x0).toBe(BAND_SLICES[i - 1].x1);
      expect(levelKeep(BAND_SLICES[i].level)).toBeGreaterThan(levelKeep(BAND_SLICES[i - 1].level));
    }
    expect(levelKeep(0)).toBeLessThan(0.2);
    expect(levelKeep(WIPE_LEVELS - 1)).toBeGreaterThan(0.8);
  });
  it('遮罩：只有不透明 / 全透明、覆蓋率 ≈ 該階、高階是低階的超集', () => {
    for (let l = 0; l < WIPE_LEVELS; l++) {
      const m = levelMask(l, 32, 32);
      let n = 0;
      for (const v of m.px) { expect(v >>> 24 === 0 || v >>> 24 === 255).toBe(true); if (v) n++; }
      expect(Math.abs(n / m.px.length - levelKeep(l))).toBeLessThan(0.07);
      if (l > 0) { const lo = levelMask(l - 1, 32, 32); lo.px.forEach((v, i) => { if (v) expect(m.px[i]).not.toBe(0); }); }
    }
  });
  it('沒有 2×2 成簇的方塊（中間階）', () => {
    const m = levelMask(Math.floor(WIPE_LEVELS / 2), 32, 32), on = (x: number, y: number): boolean => m.px[y * 32 + x] !== 0;
    let blocks = 0, cells = 0;
    for (let y = 0; y < 32; y += 2) for (let x = 0; x < 32; x += 2) {
      cells++;
      const s = [on(x, y), on(x + 1, y), on(x, y + 1), on(x + 1, y + 1)];
      if (s.every((q) => q === s[0])) blocks++;
    }
    expect(blocks).toBeLessThan(cells / 4);
  });
  it('錨定在圖層：遮罩以 4 px 為週期（圖層捲動 4 px 圖樣不變、捲 1 px 會變）', () => {
    const m = levelMask(1, 16, 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) expect(m.px[y * 16 + x]).toBe(m.px[y * 16 + x + 4]);
    let diff = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 12; x++) if (m.px[y * 16 + x] !== m.px[y * 16 + x + 1]) diff++;
    expect(diff).toBeGreaterThan(0);
  });
});
