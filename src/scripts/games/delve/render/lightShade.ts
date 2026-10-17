// lightShade.ts — 彩色光照遮罩的純邏輯（無 DOM）：
//   shadeTiles：引擎 LightMap（RGB）→ 每格最終光色（開放天空吃天空色、玩家附近「看得到」的格有輪廓微光）
//   fillLightPixels：每格光色 → 遮罩像素（每格 tile 切 sub×sub 小格，雙線性取樣）。
//     亮度（最大通道）分 LIGHT_LEVELS 階，只有兩階之間的過渡帶用世界錨定的 4×4 Bayer 抖動；
//     色相（各通道 / 最大通道）吸附到 HUE_STEPS 階、不抖動 → 光色是一個小的有限集合。
//   遮罩以 'multiply' 疊在畫面上（不透明像素，沒有 alpha 混色）：輸出色 = 色票色 × 有限光色表裡的某一色，
//   再以 'lighter' 加上「暗色 × (1 − 亮度階)」：全暗 = 純黑 + #0c0a12 = 色票最暗色，暗處不會比微亮處還亮。
import type { World } from '../engine/world';
import type { LightMap } from '../engine/lighting';
import { BLOCKS_LIGHT_LUT } from '../engine/tiles';
import { LIGHT_LEVELS, PLATEAU } from './lowres';
import { bayer } from './pixel';

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
  const W = world.width, surf = world.surfaceY, fg = world.fg, wall = world.wall, LQ = world.liquid;
  // 開放天空的格：天空色往白拉一半（背景天空本身已經畫了晝夜色）
  const or = 1 - (1 - sky[0]) * 0.5, og = 1 - (1 - sky[1]) * 0.5, ob = 1 - (1 - sky[2]) * 0.5;
  const rgb = L.rgb;
  for (let y = 0; y < h; y++) {
    const ty = y0 + y, dyp = ty - player.y;
    for (let x = 0; x < w; x++) {
      const tx = x0 + x, o = (y * w + x) * 3, wi = ty * W + tx;
      const under = LQ[wi] > 0 && wi >= W && LQ[wi - W] > 0;
      if (ty <= surf && BLOCKS_LIGHT_LUT[fg[wi]] === 0 && wall[wi] === 0 && !under) { out[o] = or; out[o + 1] = og; out[o + 2] = ob; continue; }
      const lx = tx - L.x0, ly = ty - L.y0;
      let r = 0, g = 0, b = 0;
      if (lx >= 0 && ly >= 0 && lx < L.w && ly < L.h) {
        const li = (ly * L.w + lx) * 3;
        r = Math.min(1, rgb[li] * GAIN); g = Math.min(1, rgb[li + 1] * GAIN); b = Math.min(1, rgb[li + 2] * GAIN);
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

/**
 * 每格光色 A（3 float / 格，lw×lh）→ 遮罩像素 pix（multiply 用）與 add（全暗補色，'lighter' 用），
 * 兩者皆 (lw*sub)×(lh*sub) 個不透明像素。ox / oy = 遮罩左上角的世界小格座標（Bayer 錨定世界）。
 */
export function fillLightPixels(A: Float32Array, lw: number, lh: number, sub: number, ox: number, oy: number, pix: Uint32Array, add: Uint32Array): void {
  const cw = lw * sub, ch = lh * sub, top = LIGHT_LEVELS - 1;
  const ax = axis(lw, sub), ay = axis(lh, sub);
  const X0 = ax.i0, X1 = ax.i1, WX = ax.wt;
  const span = 1 - 2 * PLATEAU;
  for (let y = 0; y < ch; y++) {
    const y0 = ay.i0[y], y1 = ay.i1[y], wy = ay.wt[y];
    const r0 = y0 * lw, r1 = y1 * lw;
    const brow = ((oy + y) & 3) * 4, row = y * cw;
    for (let x = 0; x < cw; x++) {
      const a = (r0 + X0[x]) * 3, b = (r0 + X1[x]) * 3, c = (r1 + X0[x]) * 3, d = (r1 + X1[x]) * 3, wx = WX[x];
      const tr = A[a] + (A[b] - A[a]) * wx, br = A[c] + (A[d] - A[c]) * wx;
      const tg = A[a + 1] + (A[b + 1] - A[a + 1]) * wx, bg = A[c + 1] + (A[d + 1] - A[c + 1]) * wx;
      const tb = A[a + 2] + (A[b + 2] - A[a + 2]) * wx, bb = A[c + 2] + (A[d + 2] - A[c + 2]) * wx;
      const R = tr + (br - tr) * wy, G = tg + (bg - tg) * wy, B = tb + (bb - tb) * wy;
      const m = R > G ? (R > B ? R : B) : (G > B ? G : B);
      const v = (m > 1 ? 1 : m) * top;
      let lv = v | 0;
      const f = v - lv;
      if (lv >= top) lv = top;
      else if (f > 1 - PLATEAU) lv++;
      else if (f >= PLATEAU && BAYER_T[brow + ((ox + x) & 3)] < (f - PLATEAU) / span) lv++;
      const o = row + x;
      add[o] = ADD_LUT[lv];
      if (lv === 0) { pix[o] = BLACK_PX; continue; }
      // 色相往最大通道拉近（SAT）：彩色光看得出顏色，但不會把畫面壓得太暗 / 太髒
      const inv = HUE_STEPS / m;
      const hr = ((m - (m - R) * HUE_SAT) * inv + 0.5) | 0, hg = ((m - (m - G) * HUE_SAT) * inv + 0.5) | 0, hb = ((m - (m - B) * HUE_SAT) * inv + 0.5) | 0;
      pix[o] = COLOR_LUT[((lv * H1 + hr) * H1 + hg) * H1 + hb];
    }
  }
}
