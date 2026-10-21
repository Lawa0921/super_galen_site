// lightShade.ts — 彩色光照遮罩的純邏輯（無 DOM）：
//   shadeTiles：引擎 LightMap（RGB）→ 每格最終光色（開放天空吃天空色、玩家附近「看得到」的格有輪廓微光）
//   fillLightPixels：每格光色 → 遮罩像素（每格 tile 切 sub×sub 小格，雙線性取樣）。
//     亮度（最大通道）分 LIGHT_LEVELS 階，只有兩階之間的過渡帶用世界錨定的 4×4 Bayer 抖動；
//     色相（各通道 / 最大通道）每格吸附到 HUE_STEPS 階 → 光色是一個小的有限集合；格與格之間色相不同時，
//     逐像素把兩格的色階做雙線性內插、同樣用世界錨定的 Bayer 抖動到相鄰的整數階（不會在格邊一刀切換色）。
//   遮罩以 'multiply' 疊在畫面上（不透明像素，沒有 alpha 混色）：輸出色 = 色票色 × 有限光色表裡的某一色，
//   再以 'lighter' 加上「暗色 × (1 − 亮度階)」：全暗 = 純黑 + #0c0a12 = 色票最暗色，暗處不會比微亮處還亮。
import type { TileWindow, World } from '../engine/world';
import type { LightMap } from '../engine/lighting';
import { BLOCKS_LIGHT_LUT } from '../engine/tiles';
import { LIGHT_LEVELS, PLATEAU } from './lowres';
import { bayer } from './pixel';
import { LIGHT_DEEP_START, LIGHT_DEEP_FULL } from '../engine/constants';
import { depthSurface } from '../engine/lighting';

/** 色相每通道幾階（0..HUE_STEPS） */
export const HUE_STEPS = 8;
/** 玩家附近的輪廓微光：近處（≤3 格）亮度、到 AMBIENT_R 格時降到 AMBIENT_FAR */
/** 引擎光 → 遮罩亮度的增益（稍微提亮，抵銷彩色光吃掉的亮度） */
export const GAIN = 1.15;
export const AMBIENT_NEAR = 0.2;
export const AMBIENT_FAR = 0.03;
export const AMBIENT_R = 13;
/** 色相飽和度（1 = 原色相、0 = 白光）：遮罩上的光色往白拉，避免暖光 / 冷光把亮度吃掉 */
export const HUE_SAT = 0.6;
/**
 * 地下的暗部曲線：亮度 m → m^γ，γ 從每欄地表下 LIGHT_DEEP_START 格的 1 線性升到 LIGHT_DEEP_FULL 格的 DEEP_GAMMA。
 * 光源附近（m ≈ 1）照樣亮、外圍的微光被壓到 0 → 洞穴裡是一個個邊界清楚的光池（亮度階仍由 LIGHT_LEVELS 分階）。
 */
export const DEEP_GAMMA = 1.5;
const GAMMA_LUT = Float32Array.from({ length: LIGHT_DEEP_FULL + 1 }, (_, d) =>
  d <= LIGHT_DEEP_START ? 1 : 1 + (DEEP_GAMMA - 1) * ((d - LIGHT_DEEP_START) / (LIGHT_DEEP_FULL - LIGHT_DEEP_START)));
export function depthGamma(depth: number): number {
  return depth <= LIGHT_DEEP_START ? 1 : depth >= LIGHT_DEEP_FULL ? DEEP_GAMMA : GAMMA_LUT[depth | 0];
}
export function depthCurve(m: number, depth: number): number {
  const g = depthGamma(depth);
  if (g === 1 || m <= 0) return m;
  return m >= 1 ? 1 : Math.pow(m, g);
}
/** 全暗格補上的色票最暗色（#0c0a12） */
export const DARK_RGB: readonly [number, number, number] = [12, 10, 18];

export interface ShadeRect { x0: number; y0: number; w: number; h: number; }

/**
 * 每格最終光色 → out（3 個 float / 格，0..1）。
 * reach：與 rect 同大小的「輪廓微光可照」遮罩（engine ambientReach）；sky：天空光 RGB。
 */
export function shadeTiles(
  L: LightMap, world: World, rect: ShadeRect, player: { x: number; y: number },
  sky: readonly number[], reach: Uint8Array, out: Float32Array,
): void {
  const { x0, y0, w, h } = rect;
  // 多讀上面一列（水面下判斷要看上一格的液體）；世界外 = STONE（擋光）→ 走光照分支，同舊的越界讀取
  const win = world.window(x0, y0 - 1, w, h + 1, SHADE_WIN);
  SHADE_WIN = win;
  const surf = world.surfaceY, fg = win.fg, wall = win.wall, LQ = win.liquid;
  if (DEPTH_REF.length < w) DEPTH_REF = new Int32Array(w);
  const DS = DEPTH_REF;
  depthSurface((x) => world.surfaceAt(x), x0, w, DS);
  // 開放天空的格：天空色往白拉一半（背景天空本身已經畫了晝夜色）
  const or = 1 - (1 - sky[0]) * 0.5, og = 1 - (1 - sky[1]) * 0.5, ob = 1 - (1 - sky[2]) * 0.5;
  const rgb = L.rgb;
  for (let y = 0; y < h; y++) {
    const ty = y0 + y, dyp = ty - player.y;
    for (let x = 0; x < w; x++) {
      const tx = x0 + x, o = (y * w + x) * 3, wi = (y + 1) * w + x;
      const under = LQ[wi] > 0 && ty >= 1 && LQ[wi - w] > 0;
      if (ty <= surf && BLOCKS_LIGHT_LUT[fg[wi]] === 0 && wall[wi] === 0 && !under) { out[o] = or; out[o + 1] = og; out[o + 2] = ob; continue; }
      const lx = tx - L.x0, ly = ty - L.y0;
      let r = 0, g = 0, b = 0;
      if (lx >= 0 && ly >= 0 && lx < L.w && ly < L.h) {
        const li = (ly * L.w + lx) * 3;
        r = Math.min(1, rgb[li] * GAIN); g = Math.min(1, rgb[li + 1] * GAIN); b = Math.min(1, rgb[li + 2] * GAIN);
        // 地下：暗部曲線（對最大通道算，三通道等比縮放 → 色相不變）
        const dep = ty - DS[x];
        if (dep > LIGHT_DEEP_START) {
          const m = r > g ? (r > b ? r : b) : (g > b ? g : b);
          if (m > 0 && m < 1) { const k = depthCurve(m, dep) / m; r *= k; g *= k; b *= k; }
        }
      }
      if (reach[y * w + x]) {
        const dxp = tx - player.x, dist = Math.sqrt(dxp * dxp + dyp * dyp);
        const f = AMBIENT_NEAR + (AMBIENT_FAR - AMBIENT_NEAR) * Math.min(1, Math.max(0, (dist - 3) / (AMBIENT_R - 3)));
        if (r < f) r = f;
        if (g < f) g = f;
        if (b < f) b = f;
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b;
    }
  }
}

/** shadeTiles 的參考地表工作區 */
let DEPTH_REF = new Int32Array(0);
/** shadeTiles 的 tile 視窗（重用） */
let SHADE_WIN: TileWindow | undefined;

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
interface Axis { i0: Int32Array; i1: Int32Array; wt: Float32Array; }
const axisCache = new Map<string, Axis>();
function axis(n: number, sub: number): Axis {
  const key = `${n}:${sub}`;
  let a = axisCache.get(key);
  if (a) return a;
  const m = n * sub;
  a = { i0: new Int32Array(m), i1: new Int32Array(m), wt: new Float32Array(m) };
  for (let x = 0; x < m; x++) {
    const f = (x + 0.5) / sub - 0.5;
    const x0 = Math.max(0, Math.min(n - 1, Math.floor(f)));
    a.i0[x] = x0; a.i1[x] = Math.min(n - 1, x0 + 1); a.wt[x] = Math.max(0, Math.min(1, f - x0));
  }
  if (axisCache.size > 64) axisCache.clear();
  axisCache.set(key, a);
  return a;
}

/** 色相抖動用的 Bayer 相位（和亮度錯開，兩者的抖動點不會疊在同一格上） */
const HUE_BX = 2, HUE_BY = 1;
const TOP = LIGHT_LEVELS - 1, HN = H1 * H1 * H1;
const INV_SPAN = 1 / (1 - 2 * PLATEAU), HI_P = 1 - PLATEAU;
/** 格的填法：逐像素（亮度 + 色相抖動）／整塊同一色／逐像素只算亮度（3×3 鄰格同一色相） */
const FILL_PIXEL = 0, FILL_FLAT = 1, FILL_LUMA = 2;

/**
 * 每格光色 A（3 float / 格，lw×lh）→ 遮罩像素 pix（multiply 用）與 add（暗色補色，'lighter' 用），
 * 兩者皆 (lw*sub)×(lh*sub) 個不透明像素。ox / oy = 遮罩左上角的世界小格座標（Bayer 錨定世界）。
 * 亮度（最大通道）雙線性取樣後分階 + 階界抖動；色相每格吸附成 HUE_STEPS 階，格與格之間逐像素內插後抖動。
 *
 * 可以分好幾次填（begin → fillRows / fillUntil 直到 done）：渲染器把一次重算分散到幾幀，避免尖峰幀。
 * 每個 filler 有自己的工作區；輸出與一次填完、與原始逐像素版完全相同（lightFill.test.ts 對照）。
 */
export class LightFiller {
  /** 每格亮度、色相索引、色相三通道的整數階 */
  private TM = new Float32Array(0); private TH = new Int32Array(0);
  private THR = new Int32Array(0); private THG = new Int32Array(0); private THB = new Int32Array(0);
  /** 每格填法（FILL_*）與整塊格的顏色 */
  private TF = new Uint8Array(0); private TU = new Uint32Array(0); private TUA = new Uint32Array(0);
  /** 每列沿 y 內插後的亮度 / 色相 */
  private COLV = new Float32Array(0); private COLR = new Float32Array(0); private COLG = new Float32Array(0); private COLB = new Float32Array(0);
  private lw = 0; private sub = 1; private ox = 0; private oy = 0;
  private pix: Uint32Array = new Uint32Array(0); private add: Uint32Array = new Uint32Array(0);
  private ax: Axis = axis(1, 1); private ay: Axis = axis(1, 1);
  /** 已填到第幾列（像素列）／總列數 */
  row = 0; rows = 0;
  get done(): boolean { return this.row >= this.rows; }

  /** 準備一次填色：每格亮度 / 色相、每格的填法（O(格數)，便宜）；像素在 fillRows 才填 */
  begin(A: Float32Array, lw: number, lh: number, sub: number, ox: number, oy: number, pix: Uint32Array, add: Uint32Array): void {
    const n = lw * lh;
    this.lw = lw; this.sub = sub; this.ox = ox; this.oy = oy; this.pix = pix; this.add = add;
    this.row = 0; this.rows = lh * sub;
    this.ax = axis(lw, sub); this.ay = axis(lh, sub);
    if (this.TM.length < n) {
      this.TM = new Float32Array(n); this.TH = new Int32Array(n); this.THR = new Int32Array(n); this.THG = new Int32Array(n); this.THB = new Int32Array(n);
      this.TF = new Uint8Array(n); this.TU = new Uint32Array(n); this.TUA = new Uint32Array(n);
    }
    if (this.COLV.length < lw) { this.COLV = new Float32Array(lw); this.COLR = new Float32Array(lw); this.COLG = new Float32Array(lw); this.COLB = new Float32Array(lw); }
    const { TM, TH, THR, THG, THB, TF, TU, TUA } = this;
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
    // 每格的填法：雙線性只會取到 ±1 格，所以 3×3 鄰格（邊緣夾住）決定這格裡每個像素的取樣值
    for (let ty = 0; ty < lh; ty++) {
      const ya = ty > 0 ? ty - 1 : 0, yb = ty + 1 < lh ? ty + 1 : lh - 1;
      for (let tx = 0; tx < lw; tx++) {
        const t = ty * lw + tx, m = TM[t], h = TH[t];
        const xa = tx > 0 ? tx - 1 : 0, xb = tx + 1 < lw ? tx + 1 : lw - 1;
        let sameM = true, sameH = true;
        for (let yy = ya; yy <= yb && sameH; yy++) {
          for (let xx = xa; xx <= xb; xx++) {
            const q = yy * lw + xx;
            if (TH[q] !== h) { sameH = false; break; }
            if (TM[q] !== m) sameM = false;
          }
        }
        TF[t] = sameH ? FILL_LUMA : FILL_PIXEL;
        if (!sameH || !sameM) continue;
        const v = m * TOP;
        let lv = v | 0;
        const f = v - lv;
        if (lv >= TOP) lv = TOP;
        else if (f > HI_P) lv++;
        else if (f >= PLATEAU) continue; // 抖動帶：逐像素（只算亮度）
        TF[t] = FILL_FLAT;
        TU[t] = lv === 0 ? BLACK_PX : COLOR_LUT[lv * HN + h];
        TUA[t] = ADD_LUT[lv];
      }
    }
  }

  /** 再填 n 列像素（至少 1 列，不超過總列數） */
  fillRows(n: number): void {
    const end = Math.min(this.rows, this.row + Math.max(1, n));
    const { lw, sub, ox, oy, pix, add, TM, TH, THR, THG, THB, TF, TU, TUA, COLV, COLR, COLG, COLB } = this;
    const ay = this.ay, X0 = this.ax.i0, X1 = this.ax.i1, WX = this.ax.wt, cw = lw * sub;
    for (let y = this.row; y < end; y++) {
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
        const t = trow + tx, kind = TF[t];
        if (kind === FILL_FLAT) { const o = row + x; pix.fill(TU[t], o, o + sub); add.fill(TUA[t], o, o + sub); x += sub; continue; }
        if (kind === FILL_LUMA) {
          // 3×3 鄰格同一色相：內插後仍是同一個整數階（不抖動）→ 只算亮度
          const hb = TH[t];
          for (const xe = x + sub; x < xe; x++) {
            const c0 = COLV[X0[x]];
            const v = (c0 + (COLV[X1[x]] - c0) * WX[x]) * TOP;
            let lv = v | 0;
            const f = v - lv;
            if (lv >= TOP) lv = TOP;
            else if (f > HI_P) lv++;
            else if (f >= PLATEAU && BAYER_T[brow + ((ox + x) & 3)] < (f - PLATEAU) * INV_SPAN) lv++;
            const o = row + x;
            add[o] = ADD_LUT[lv];
            pix[o] = lv === 0 ? BLACK_PX : COLOR_LUT[lv * HN + hb];
          }
          continue;
        }
        for (const xe = x + sub; x < xe; x++) {
          const x0 = X0[x], wx = WX[x], c0 = COLV[x0];
          const v = (c0 + (COLV[X1[x]] - c0) * wx) * TOP;
          let lv = v | 0;
          const f = v - lv;
          if (lv >= TOP) lv = TOP;
          else if (f > HI_P) lv++;
          else if (f >= PLATEAU && BAYER_T[brow + ((ox + x) & 3)] < (f - PLATEAU) * INV_SPAN) lv++;
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
    this.row = end;
  }

  /** 一次填一個 tile 列（sub 列像素），直到 now() ≥ deadline 或填完；至少前進一個 tile 列。回傳是否填完。 */
  fillUntil(deadline: number, now: () => number): boolean {
    do this.fillRows(this.sub);
    while (!this.done && now() < deadline);
    return this.done;
  }
}

const shared = new LightFiller();
/** 一次填完（測試 / 單次呼叫用） */
export function fillLightPixels(A: Float32Array, lw: number, lh: number, sub: number, ox: number, oy: number, pix: Uint32Array, add: Uint32Array): void {
  shared.begin(A, lw, lh, sub, ox, oy, pix, add);
  shared.fillRows(shared.rows);
}

/** 光照遮罩（tile 矩形 x0,y0,w,h）是否完全蓋住畫面（tile 矩形 x,y,w,h） */
export function rectCovers(lm: ShadeRect | null, v: { x: number; y: number; w: number; h: number }): boolean {
  if (!lm) return false;
  return lm.x0 <= v.x && lm.y0 <= v.y && lm.x0 + lm.w >= v.x + v.w && lm.y0 + lm.h >= v.y + v.h;
}
