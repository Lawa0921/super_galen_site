// lighting.ts — 泰拉 Color 模式風格的可分離掃描光照（RGB 三通道，交錯存放 r,g,b）。
// 1) 寫入發光量（天空光：地表線以上、無背牆、不擋光的格吃 skyColor；天光井：地表直通下去的豎井上段吃漸淡的天光；
//    tile 光依 LIGHT_RGB_LUT 上色；動態光可帶色相）
// 2) 兩輪 blur：每輪對每欄做下→上、上→下，對每列做左→右、右→左；
//    每個通道各自攜帶 v：v<cell 取 cell，否則（v ≥ 門檻）寫回 cell；離開該格時 v *= 該格該通道的衰減
//    （空氣 0.91、實心 0.56 三通道相同；深水 / 深蜂蜜用各自的 RGB 三元組 → 越深越藍 / 越琥珀）。
// 液體：熔岩發紅橘光（量 / 128，最多 LAVA_LIGHT）；地表的水只有最上面那格（上方沒有液體）吃天空光。
// 只算視窗 + margin 外框。輸出 row-major：data[i] = 三通道最大值（揭露 / 舊呼叫端用）、rgb[i*3+k]。
import type { World } from './world';
import { BLOCKS_LIGHT_LUT, LIGHT_RGB_LUT, CRYSTAL_ALT_HUE, T } from './tiles';
import { LIQ } from './liquidKind';
import {
  LIGHT_AIR_DECAY, LIGHT_SOLID_DECAY, LIGHT_CUTOFF, LIGHT_MARGIN, DAY_LENGTH, LIGHT_WATER_DECAY, LIGHT_HONEY_DECAY, LAVA_LIGHT,
  SKY_SHAFT_LEN, SKY_SHAFT_K,
} from './constants';

export type LightRGB = readonly [number, number, number];
export interface LightRect { x: number; y: number; w: number; h: number; }
/** 動態點光源：v = 強度（最大通道），c = 色相（最大通道 1；省略 = 白光） */
export interface PointLight { x: number; y: number; v: number; c?: LightRGB; }
export interface LightOptions {
  /** 天空亮度 0..1（見 skyBrightness）；skyColor 省略時天空光 = (sky, sky, sky) */
  sky: number;
  /** 天空光 RGB（已含亮度，見 sky.ts skyColor） */
  skyColor?: LightRGB;
  margin?: number;
  lights?: readonly PointLight[];
}

/** 熔岩光色相 */
export const LAVA_HUE: LightRGB = [1, 0.5, 0.2];

export class LightMap {
  /** 交錯 RGB（i*3 + 通道） */
  readonly rgb: Float32Array;
  constructor(
    readonly x0: number, readonly y0: number,
    readonly w: number, readonly h: number,
    /** 每格三通道最大值 */
    readonly data: Float32Array,
    rgb?: Float32Array,
  ) {
    if (rgb) this.rgb = rgb;
    else {
      this.rgb = new Float32Array(data.length * 3);
      for (let i = 0; i < data.length; i++) this.rgb[i * 3] = this.rgb[i * 3 + 1] = this.rgb[i * 3 + 2] = data[i];
    }
  }
  get(tx: number, ty: number): number {
    const lx = tx - this.x0, ly = ty - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return 0;
    return this.data[ly * this.w + lx];
  }
  getRGB(tx: number, ty: number): [number, number, number] {
    const lx = tx - this.x0, ly = ty - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return [0, 0, 0];
    const i = (ly * this.w + lx) * 3;
    return [this.rgb[i], this.rgb[i + 1], this.rgb[i + 2]];
  }
}

export class LightEngine {
  private buf = new Float32Array(0);
  private decay = new Float32Array(0);
  private colEnd = new Int32Array(0);

  compute(world: World, view: LightRect, opts: LightOptions): LightMap {
    const margin = opts.margin ?? LIGHT_MARGIN;
    const x0 = Math.max(0, Math.floor(view.x) - margin);
    const y0 = Math.max(0, Math.floor(view.y) - margin);
    const x1 = Math.min(world.width, Math.ceil(view.x + view.w) + margin);
    const y1 = Math.min(world.height, Math.ceil(view.y + view.h) + margin);
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    const n = w * h, n3 = n * 3;
    if (this.buf.length < n3) { this.buf = new Float32Array(n3); this.decay = new Float32Array(n3); }
    if (this.colEnd.length < w) this.colEnd = new Int32Array(w);
    const L = this.buf, D = this.decay, CE = this.colEnd;
    const { fg, wall, width: WW, liquid: LQ, liquidType: LT, variant: VAR, surface: SURF } = world;
    const surf = world.surfaceY;
    const sc = opts.skyColor ?? [opts.sky, opts.sky, opts.sky];
    const sr = sc[0], sg = sc[1], sb = sc[2];
    const skyOn = sr > 0 || sg > 0 || sb > 0;

    // ── 天光井：每欄從世界頂端往下走到第一個擋光 / 有液體的格（只在視窗靠近地表時需要）──
    for (let lx = 0; lx < w; lx++) {
      const x = x0 + lx, s = SURF[x] ?? 0;
      CE[lx] = -1;
      if (!skyOn || y0 > s + SKY_SHAFT_LEN) continue;
      const yEnd = Math.min(y1, s + SKY_SHAFT_LEN);
      let y = 0;
      for (; y < yEnd; y++) {
        const wi = y * WW + x;
        if (BLOCKS_LIGHT_LUT[fg[wi]] === 1 || LQ[wi] > 0) break;
      }
      CE[lx] = y;
    }

    // ── Scan：發光 + 衰減遮罩 ──
    for (let ly = 0; ly < h; ly++) {
      const y = y0 + ly;
      const row = y * WW;
      const canSky = y <= surf;
      for (let lx = 0; lx < w; lx++) {
        const wi = row + x0 + lx;
        const id = fg[wi];
        const i = (ly * w + lx) * 3;
        const solid = BLOCKS_LIGHT_LUT[id] === 1;
        const d = solid ? LIGHT_SOLID_DECAY : LIGHT_AIR_DECAY;
        D[i] = d; D[i + 1] = d; D[i + 2] = d;
        const t3 = id * 3;
        let er = LIGHT_RGB_LUT[t3], eg = LIGHT_RGB_LUT[t3 + 1], eb = LIGHT_RGB_LUT[t3 + 2];
        if (id === T.CRYSTAL && (VAR[wi] & 1) === 1) {
          const v = Math.max(er, eg, eb);
          er = v * CRYSTAL_ALT_HUE[0]; eg = v * CRYSTAL_ALT_HUE[1]; eb = v * CRYSTAL_ALT_HUE[2];
        }
        const lq = LQ[wi];
        let under = false;
        if (lq) {
          const lt = LT[wi];
          if (lt === LIQ.LAVA) {
            const le = LAVA_LIGHT * Math.min(1, lq / 128);
            if (le * LAVA_HUE[0] > er) er = le * LAVA_HUE[0];
            if (le * LAVA_HUE[1] > eg) eg = le * LAVA_HUE[1];
            if (le * LAVA_HUE[2] > eb) eb = le * LAVA_HUE[2];
          } else if (lq > 128 && !solid) {
            const dd = lt === LIQ.WATER ? LIGHT_WATER_DECAY : LIGHT_HONEY_DECAY;
            D[i] = dd[0]; D[i + 1] = dd[1]; D[i + 2] = dd[2];
          }
          under = wi >= WW && LQ[wi - WW] > 0;
        }
        if (skyOn && !solid && !under) {
          let k = 0;
          if (canSky && wall[wi] === 0) k = 1;
          else if (y < CE[lx] || (y === CE[lx] && lq > 0)) {
            // 天光井：地表之上（無牆）全亮；地表之下（可以有背牆）往下線性變淡
            const s = y - SURF[x0 + lx];
            k = s <= 0 ? (wall[wi] === 0 ? 1 : 0) : SKY_SHAFT_K * Math.max(0, 1 - s / SKY_SHAFT_LEN);
          }
          if (k > 0) {
            if (sr * k > er) er = sr * k;
            if (sg * k > eg) eg = sg * k;
            if (sb * k > eb) eb = sb * k;
          }
        }
        L[i] = er; L[i + 1] = eg; L[i + 2] = eb;
      }
    }
    if (opts.lights) {
      for (const p of opts.lights) {
        const lx = Math.floor(p.x) - x0, ly = Math.floor(p.y) - y0;
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
        const i = (ly * w + lx) * 3, c = p.c;
        const r = p.v * (c ? c[0] : 1), g = p.v * (c ? c[1] : 1), b = p.v * (c ? c[2] : 1);
        if (r > L[i]) L[i] = r;
        if (g > L[i + 1]) L[i + 1] = g;
        if (b > L[i + 2]) L[i + 2] = b;
      }
    }

    // ── Blur：兩輪四向掃描（三通道同一趟） ──
    for (let pass = 0; pass < 2; pass++) {
      for (let lx = 0; lx < w; lx++) {
        blurLine3(L, D, lx, w, h);                       // 上 → 下
        blurLine3(L, D, lx + (h - 1) * w, -w, h);        // 下 → 上
      }
      for (let ly = 0; ly < h; ly++) {
        blurLine3(L, D, ly * w, 1, w);                   // 左 → 右
        blurLine3(L, D, ly * w + w - 1, -1, w);          // 右 → 左
      }
    }
    const data = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 3) {
      const r = L[j], g = L[j + 1], b = L[j + 2];
      data[i] = r > g ? (r > b ? r : b) : (g > b ? g : b);
    }
    return new LightMap(x0, y0, w, h, data, L.slice(0, n3));
  }
}

function blurLine3(L: Float32Array, D: Float32Array, start: number, stride: number, count: number): void {
  let vr = 0, vg = 0, vb = 0;
  let i = start * 3;
  const s3 = stride * 3;
  for (let k = 0; k < count; k++, i += s3) {
    const cr = L[i], cg = L[i + 1], cb = L[i + 2];
    if (vr < cr) vr = cr; else if (vr >= LIGHT_CUTOFF) L[i] = vr;
    if (vg < cg) vg = cg; else if (vg >= LIGHT_CUTOFF) L[i + 1] = vg;
    if (vb < cb) vb = cb; else if (vb >= LIGHT_CUTOFF) L[i + 2] = vb;
    vr *= D[i]; vg *= D[i + 1]; vb *= D[i + 2];
  }
}

/**
 * 玩家身邊「輪廓微光」可以照到的格：從玩家格出發，經由不擋光的格 4 向擴散（半徑 r 內），
 * 再加上與這些格 4 鄰相接的擋光格（看得到的牆面）。牆後的封閉空間（密室）不會被標到。
 * out 為 rect 範圍的 row-major（1 = 可照），先清 0。
 */
export function ambientReach(world: World, px: number, py: number, r: number, rect: LightRect, out: Uint8Array): void {
  out.fill(0);
  const { x: rx, y: ry, w: rw, h: rh } = rect;
  px = Math.floor(px); py = Math.floor(py);
  if (px < rx || py < ry || px >= rx + rw || py >= ry + rh || !world.inBounds(px, py)) return;
  const fg = world.fg, WW = world.width, r2 = r * r;
  const queue = REACH_Q.length >= rw * rh ? REACH_Q : (REACH_Q = new Int32Array(rw * rh));
  let head = 0, tail = 0;
  const start = (py - ry) * rw + (px - rx);
  out[start] = 2;
  queue[tail++] = start;
  while (head < tail) {
    const li = queue[head++];
    const lx = li % rw, ly = (li - lx) / rw;
    const x = lx + rx, y = ly + ry;
    if (BLOCKS_LIGHT_LUT[fg[y * WW + x]] === 1 && li !== start) continue; // 牆面：標記但不往裡擴散
    for (let k = 0; k < 4; k++) {
      const nx = lx + NB_X[k], ny = ly + NB_Y[k];
      if (nx < 0 || ny < 0 || nx >= rw || ny >= rh) continue;
      const ni = ny * rw + nx;
      if (out[ni]) continue;
      const wx = nx + rx, wy = ny + ry;
      if (wx < 0 || wy < 0 || wx >= WW || wy >= world.height) continue;
      const dx = wx - px, dy = wy - py;
      if (dx * dx + dy * dy > r2) continue;
      out[ni] = 2;
      queue[tail++] = ni;
    }
  }
  for (let i = 0; i < out.length; i++) if (out[i]) out[i] = 1;
}
let REACH_Q = new Int32Array(0);
const NB_X = [1, -1, 0, 0], NB_Y = [0, 0, 1, -1];

/**
 * 天空亮度：t 為遊戲內經過秒數，一天 DAY_LENGTH 秒；t=0 為午夜、0.5 天為正午。
 * 分段線性（不用三角函數）：夜 0.12，清晨 0.2~0.3 天漸亮，黃昏 0.7~0.8 天漸暗。
 * （天空光的「顏色」見 sky.ts skyColor）
 */
export function skyBrightness(t: number): number {
  const NIGHT = 0.12;
  let p = (t % DAY_LENGTH) / DAY_LENGTH;
  if (p < 0) p += 1;
  if (p < 0.2 || p >= 0.8) return NIGHT;
  if (p < 0.3) return NIGHT + (1 - NIGHT) * ((p - 0.2) / 0.1);
  if (p < 0.7) return 1;
  return 1 - (1 - NIGHT) * ((p - 0.7) / 0.1);
}
