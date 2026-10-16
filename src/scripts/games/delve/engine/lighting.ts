// lighting.ts — 泰拉 Color 模式風格的可分離掃描光照（單通道）。
// 1) 寫入發光量（天空光：地表線以上、無背牆、不擋光的格；火把等 tile 光；動態光）
// 2) 兩輪 blur：每輪對每欄做下→上、上→下，對每列做左→右、右→左；
//    沿途攜帶 v：v<cell 取 cell，否則（v ≥ 門檻）寫回 cell；離開該格時 v *= 該格衰減（空氣 0.91、實心 0.56）。
// 只算視窗 + margin 外框。輸出 row-major Float32Array（i = (y-y0)*w + (x-x0)）。
import type { World } from './world';
import { BLOCKS_LIGHT_LUT, LIGHT_LUT } from './tiles';
import {
  LIGHT_AIR_DECAY, LIGHT_SOLID_DECAY, LIGHT_CUTOFF, LIGHT_MARGIN, DAY_LENGTH,
} from './constants';

export interface LightRect { x: number; y: number; w: number; h: number; }
export interface PointLight { x: number; y: number; v: number; }
export interface LightOptions {
  /** 天空亮度 0..1（見 skyBrightness） */
  sky: number;
  margin?: number;
  lights?: readonly PointLight[];
}

export class LightMap {
  constructor(
    readonly x0: number, readonly y0: number,
    readonly w: number, readonly h: number,
    readonly data: Float32Array,
  ) {}
  get(tx: number, ty: number): number {
    const lx = tx - this.x0, ly = ty - this.y0;
    if (lx < 0 || ly < 0 || lx >= this.w || ly >= this.h) return 0;
    return this.data[ly * this.w + lx];
  }
}

export class LightEngine {
  private buf = new Float32Array(0);
  private decay = new Float32Array(0);

  compute(world: World, view: LightRect, opts: LightOptions): LightMap {
    const margin = opts.margin ?? LIGHT_MARGIN;
    const x0 = Math.max(0, Math.floor(view.x) - margin);
    const y0 = Math.max(0, Math.floor(view.y) - margin);
    const x1 = Math.min(world.width, Math.ceil(view.x + view.w) + margin);
    const y1 = Math.min(world.height, Math.ceil(view.y + view.h) + margin);
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    const n = w * h;
    if (this.buf.length < n) { this.buf = new Float32Array(n); this.decay = new Float32Array(n); }
    // 每次回傳新陣列給呼叫端持有；內部 buf 只作工作區
    const L = this.buf, D = this.decay;
    const { fg, wall, width: WW } = world;
    const sky = opts.sky, surf = world.surfaceY;

    // ── Scan：發光 + 衰減遮罩 ──
    for (let ly = 0; ly < h; ly++) {
      const y = y0 + ly;
      const row = y * WW;
      const canSky = y <= surf;
      for (let lx = 0; lx < w; lx++) {
        const wi = row + x0 + lx;
        const id = fg[wi];
        const i = ly * w + lx;
        const solid = BLOCKS_LIGHT_LUT[id] === 1;
        D[i] = solid ? LIGHT_SOLID_DECAY : LIGHT_AIR_DECAY;
        let e = LIGHT_LUT[id];
        if (canSky && !solid && wall[wi] === 0 && sky > e) e = sky;
        L[i] = e;
      }
    }
    if (opts.lights) {
      for (const p of opts.lights) {
        const lx = Math.floor(p.x) - x0, ly = Math.floor(p.y) - y0;
        if (lx < 0 || ly < 0 || lx >= w || ly >= h) continue;
        const i = ly * w + lx;
        if (p.v > L[i]) L[i] = p.v;
      }
    }

    // ── Blur：兩輪四向掃描 ──
    for (let pass = 0; pass < 2; pass++) {
      for (let lx = 0; lx < w; lx++) {
        blurLine(L, D, lx, w, h);                       // 上 → 下
        blurLine(L, D, lx + (h - 1) * w, -w, h);        // 下 → 上
      }
      for (let ly = 0; ly < h; ly++) {
        blurLine(L, D, ly * w, 1, w);                   // 左 → 右
        blurLine(L, D, ly * w + w - 1, -1, w);          // 右 → 左
      }
    }
    return new LightMap(x0, y0, w, h, L.slice(0, n));
  }
}

function blurLine(L: Float32Array, D: Float32Array, start: number, stride: number, count: number): void {
  let v = 0;
  let i = start;
  for (let k = 0; k < count; k++, i += stride) {
    const c = L[i];
    if (v < c) v = c;
    else if (v >= LIGHT_CUTOFF) L[i] = v;
    v *= D[i];
  }
}

/**
 * 天空亮度：t 為遊戲內經過秒數，一天 DAY_LENGTH 秒；t=0 為午夜、0.5 天為正午。
 * 分段線性（不用三角函數）：夜 0.12，清晨 0.2~0.3 天漸亮，黃昏 0.7~0.8 天漸暗。
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
