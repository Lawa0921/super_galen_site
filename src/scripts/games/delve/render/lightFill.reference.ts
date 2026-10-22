// lightFill.reference.ts — 測試專用：光照遮罩填像素的「原始版」（逐像素、一次填完），
// 用來驗證最佳化 / 分幀版（lightShade.ts 的 LightFiller）輸出逐像素完全相同。不要在遊戲程式裡 import。
import { LIGHT_LEVELS, PLATEAU } from './lowres';
import { bayer } from './pixel';
import { HUE_STEPS, HUE_SAT, DARK_RGB } from './lightShade';

const H1 = HUE_STEPS + 1;
/** 光色表：lv × hr × hg × hb → 不透明 RGBA（ABGR uint32） */
const COLOR_LUT = new Uint32Array(LIGHT_LEVELS * H1 * H1 * H1);
for (let lv = 0; lv < LIGHT_LEVELS; lv++) {
  const k = lv / (LIGHT_LEVELS - 1);
  for (let r = 0; r < H1; r++) for (let g = 0; g < H1; g++) for (let b = 0; b < H1; b++) {
    const R = Math.round(255 * k * (r / HUE_STEPS)), G = Math.round(255 * k * (g / HUE_STEPS)), B = Math.round(255 * k * (b / HUE_STEPS));
    COLOR_LUT[((lv * H1 + r) * H1 + g) * H1 + b] = ((255 << 24) | (B << 16) | (G << 8) | R) >>> 0;
  }
}
const BLACK_PX = (255 << 24) >>> 0;
/** 每階的暗色補色：DARK × (1 − 亮度) → 輸出 = 色票色 × 光 + 暗色 × (1 − 光)，暗處收斂到 #0c0a12 而不是純黑 */
const ADD_LUT = new Uint32Array(LIGHT_LEVELS);
for (let lv = 0; lv < LIGHT_LEVELS; lv++) {
  const k = 1 - lv / (LIGHT_LEVELS - 1);
  ADD_LUT[lv] = ((255 << 24) | (Math.round(DARK_RGB[2] * k) << 16) | (Math.round(DARK_RGB[1] * k) << 8) | Math.round(DARK_RGB[0] * k)) >>> 0;
}
const BAYER_T = Float32Array.from({ length: 16 }, (_, i) => bayer(i & 3, i >> 2));

/** 取樣表快取（只跟寬 / 高有關） */
interface Axis { i0: Int32Array; i1: Int32Array; wt: Float32Array; /** 最近的格 */ near: Int32Array; }
const axisCache = new Map<string, Axis>();
function axis(n: number, sub: number): Axis {
  const key = `${n}:${sub}`;
  let a = axisCache.get(key);
  if (a) return a;
  const m = n * sub;
  a = { i0: new Int32Array(m), i1: new Int32Array(m), wt: new Float32Array(m), near: new Int32Array(m) };
  for (let x = 0; x < m; x++) {
    const f = (x + 0.5) / sub - 0.5;
    const x0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
    a.i0[x] = x0; a.i1[x] = Math.min(n - 1, x0 + 1); a.wt[x] = Math.max(0, Math.min(1, f - x0));
    a.near[x] = a.wt[x] < 0.5 ? a.i0[x] : a.i1[x];
  }
  if (axisCache.size > 64) axisCache.clear();
  axisCache.set(key, a);
  return a;
}

/** 每格亮度 / 色相索引的工作區 */
let TM = new Float32Array(0), TH = new Int32Array(0), COLV = new Float32Array(0);
/** 每格色相各通道的整數階（0..HUE_STEPS），與每列沿 y 內插後的值 */
let THR = new Int32Array(0), THG = new Int32Array(0), THB = new Int32Array(0);
let COLR = new Float32Array(0), COLG = new Float32Array(0), COLB = new Float32Array(0);
/** 色相抖動用的 Bayer 相位（和亮度錯開，兩者的抖動點不會疊在同一格上） */
const HUE_BX = 2, HUE_BY = 1;
/** 3×3 鄰格完全相同、而且落在平台上（不抖動）的格（TF = 1）：整塊 sub×sub 直接填同一色 TU / TUA */
let TF = new Uint8Array(0), TU = new Uint32Array(0), TUA = new Uint32Array(0);

/**
 * 每格光色 A（3 float / 格，lw×lh）→ 遮罩像素 pix（multiply 用）與 add（暗色補色，'lighter' 用），
 * 兩者皆 (lw*sub)×(lh*sub) 個不透明像素。ox / oy = 遮罩左上角的世界小格座標（Bayer 錨定世界）。
 * 亮度（最大通道）雙線性取樣後分階 + 階界抖動；色相每格算一次（吸附成 HUE_STEPS 階），取樣點取最近的格。
 */
export function referenceFillLightPixels(A: Float32Array, lw: number, lh: number, sub: number, ox: number, oy: number, pix: Uint32Array, add: Uint32Array): void {
  const n = lw * lh, cw = lw * sub, ch = lh * sub, top = LIGHT_LEVELS - 1, HN = H1 * H1 * H1;
  if (TM.length < n) { TM = new Float32Array(n); TH = new Int32Array(n); THR = new Int32Array(n); THG = new Int32Array(n); THB = new Int32Array(n); }
  if (COLV.length < lw) { COLV = new Float32Array(lw); COLR = new Float32Array(lw); COLG = new Float32Array(lw); COLB = new Float32Array(lw); }
  // 每格：亮度 + 色相索引（色相往最大通道拉近 HUE_SAT：看得出顏色，但不會把畫面壓得太暗 / 太髒）
  for (let t = 0, j = 0; t < n; t++, j += 3) {
    const R = A[j], G = A[j + 1], B = A[j + 2];
    const m = R > G ? (R > B ? R : B) : (G > B ? G : B);
    TM[t] = m > 1 ? 1 : m;
    if (m <= 1e-6) { TH[t] = (HUE_STEPS * H1 + HUE_STEPS) * H1 + HUE_STEPS; THR[t] = THG[t] = THB[t] = HUE_STEPS; continue; }
    const inv = HUE_STEPS / m;
    const hr = ((m - (m - R) * HUE_SAT) * inv + 0.5) | 0, hg = ((m - (m - G) * HUE_SAT) * inv + 0.5) | 0, hb = ((m - (m - B) * HUE_SAT) * inv + 0.5) | 0;
    TH[t] = (hr * H1 + hg) * H1 + hb;
    THR[t] = hr; THG[t] = hg; THB[t] = hb;
  }
  if (TU.length < n) { TF = new Uint8Array(n); TU = new Uint32Array(n); TUA = new Uint32Array(n); }
  for (let ty = 0; ty < lh; ty++) {
    for (let tx = 0; tx < lw; tx++) {
      const t = ty * lw + tx, m = TM[t], h = TH[t];
      let same = true;
      for (let dy = -1; dy <= 1 && same; dy++) {
        const yy = ty + dy < 0 ? 0 : ty + dy >= lh ? lh - 1 : ty + dy;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = tx + dx < 0 ? 0 : tx + dx >= lw ? lw - 1 : tx + dx, q = yy * lw + xx;
          if (TM[q] !== m || TH[q] !== h) { same = false; break; }
        }
      }
      TF[t] = 0;
      if (!same) continue;
      const v = m * top;
      let lv = v | 0;
      const f = v - lv;
      if (lv >= top) lv = top;
      else if (f > 1 - PLATEAU) lv++;
      else if (f >= PLATEAU) continue; // 抖動帶：逐像素
      TF[t] = 1;
      TU[t] = lv === 0 ? BLACK_PX : COLOR_LUT[lv * HN + h];
      TUA[t] = ADD_LUT[lv];
    }
  }
  const ax = axis(lw, sub), ay = axis(lh, sub);
  const X0 = ax.i0, X1 = ax.i1, WX = ax.wt;
  const invSpan = 1 / (1 - 2 * PLATEAU), hiP = 1 - PLATEAU;
  for (let y = 0; y < ch; y++) {
    const y0 = ay.i0[y], y1 = ay.i1[y], wy = ay.wt[y];
    const r0 = y0 * lw, r1 = y1 * lw;
    for (let x = 0; x < lw; x++) {
      const a = r0 + x, b = r1 + x;
      COLV[x] = TM[a] + (TM[b] - TM[a]) * wy;
      COLR[x] = THR[a] + (THR[b] - THR[a]) * wy;
      COLG[x] = THG[a] + (THG[b] - THG[a]) * wy;
      COLB[x] = THB[a] + (THB[b] - THB[a]) * wy;
    }
    const brow = ((oy + y) & 3) * 4, hrow = ((oy + y + HUE_BY) & 3) * 4, row = y * cw, trow = ((y / sub) | 0) * lw;
    for (let tx = 0, x = 0; tx < lw; tx++) {
      const t = trow + tx;
      if (TF[t]) { const o = row + x; pix.fill(TU[t], o, o + sub); add.fill(TUA[t], o, o + sub); x += sub; continue; }
      for (const xe = x + sub; x < xe; x++) {
        const x0 = X0[x], wx = WX[x], c0 = COLV[x0];
        const v = (c0 + (COLV[X1[x]] - c0) * wx) * top;
        let lv = v | 0;
        const f = v - lv;
        if (lv >= top) lv = top;
        else if (f > hiP) lv++;
        else if (f >= PLATEAU && BAYER_T[brow + ((ox + x) & 3)] < (f - PLATEAU) * invSpan) lv++;
        const o = row + x;
        add[o] = ADD_LUT[lv];
        if (lv === 0) { pix[o] = BLACK_PX; continue; }
        // 色相：兩格色階內插後抖動到相鄰整數階（同一格內 / 兩格同色時內插值是整數 → 不抖動）
        const ht = BAYER_T[hrow + ((ox + x + HUE_BX) & 3)], x1 = X1[x];
        const vr = COLR[x0] + (COLR[x1] - COLR[x0]) * wx, vg = COLG[x0] + (COLG[x1] - COLG[x0]) * wx, vb = COLB[x0] + (COLB[x1] - COLB[x0]) * wx;
        let qr = vr | 0, qg = vg | 0, qb = vb | 0;
        if (vr - qr > ht) qr++;
        if (vg - qg > ht) qg++;
        if (vb - qb > ht) qb++;
        pix[o] = COLOR_LUT[lv * HN + (qr * H1 + qg) * H1 + qb];
      }
    }
  }
}
