// bgBlend.ts — 遠景的生態區混合（純邏輯 + 純資料 Bmp，無 DOM）：
//   · BiomeField：biomeAt(x) 逐欄加總（兩端按小數比例）→ 以鏡頭中心為準、半寬 half 格的盒狀濾波權重
//     （連續、無狀態 → 來回走不會跳；不預先建每欄陣列 → 無限世界、負 x 都能用）
//   · pair：視窗裡最重的兩區，依重心分左 / 右，u = 右區比例（0 = 全左、1 = 全右）
//   · 每個視差層用自己的半寬（遠山最寬 → 換得最慢，近林最窄 → 換得最快），天空更寬
//   · wipeFront：u → 螢幕上的垂直分界線（左邊畫左區、右邊畫右區），分界帶 WIPE_BAND px 用 1×1 Bayer 抖動
//   · 分界帶切成 WIPE_LEVELS 段，每段畫「預先烘好的該階抖動版圖層」的細長切片（levelMask：1×1 Bayer、圖層座標）
//     → 抖動格子黏在圖層上、不黏在螢幕上；每幀只有幾次 drawImage，沒有任何畫布合成或像素迴圈
import { Bmp, bayer } from './pixel';

/** 遠 / 中 / 近三層的混合半寬（格） */
export const LAYER_HALF: readonly [number, number, number] = [104, 68, 40];
/** 天空色調的混合半寬（格） */
export const SKY_HALF = 128;
/** 分界抖動帶寬度（美術 px） */
export const WIPE_BAND = 80;
const NB = 5;

export interface BiomePair { left: number; right: number; u: number; }

export class BiomeField {
  /** 這次視窗裡各區的覆蓋欄數與 x 矩（重用，不配置） */
  private cnt = new Float64Array(NB);
  private mom = new Float64Array(NB);
  /**
   * biomeAt(x) = 第 x 欄的生態區（呼叫端可自己快取）；[xMin, xMax) = 世界水平範圍（xMax 不含），視窗夾在裡面。
   * 每次 weights / pair 最多問 2·half + 1 欄（half ≤ 128 → 257 次）。
   */
  constructor(readonly biomeAt: (x: number) => number, readonly xMin: number, readonly xMax: number) {}
  /** 視窗 [lo, hi) 的各區欄數 / x 矩（部分覆蓋的欄按比例；矩以欄中心 x + 0.5 計，同舊前綴和的線性內插） */
  private scan(lo: number, hi: number): void {
    const cnt = this.cnt, mom = this.mom;
    cnt.fill(0); mom.fill(0);
    if (!(hi > lo)) return;
    const i0 = Math.floor(lo), i1 = Math.ceil(hi);
    for (let i = i0; i < i1; i++) {
      const f = Math.min(hi, i + 1) - Math.max(lo, i);
      if (f <= 0) continue;
      const b = Math.max(0, Math.min(NB - 1, this.biomeAt(i) | 0));
      cnt[b] += f;
      mom[b] += f * (i + 0.5);
    }
  }
  /** 視窗 [cx-half, cx+half]（夾在世界內）裡各區的比例 */
  weights(cx: number, half: number): number[] {
    const lo = Math.max(this.xMin, cx - half), hi = Math.min(this.xMax, cx + half);
    const span = Math.max(1e-6, hi - lo);
    this.scan(lo, hi);
    const out: number[] = [];
    for (let b = 0; b < NB; b++) out.push(this.cnt[b] / span);
    return out;
  }
  pair(cx: number, half: number): BiomePair {
    const w = this.weights(cx, half);
    let a = 0;
    for (let b = 1; b < NB; b++) if (w[b] > w[a]) a = b;
    let s = -1;
    for (let b = 0; b < NB; b++) if (b !== a && w[b] > 1e-9 && (s < 0 || w[b] > w[s])) s = b;
    if (s < 0) return { left: a, right: a, u: 0 };
    // weights 剛掃過同一個視窗：cnt / mom 還是這個視窗的
    const centroid = (b: number): number => (this.cnt[b] > 1e-9 ? this.mom[b] / this.cnt[b] : cx);
    const [left, right] = centroid(a) <= centroid(s) ? [a, s] : [s, a];
    const u = w[right] / (w[left] + w[right]);
    return { left, right, u: u < 1e-6 ? 0 : u > 1 - 1e-6 ? 1 : u };
  }
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
/** 右區比例 u → 分界線的螢幕 x（含抖動帶：u=0 時整條帶在右緣外，u=1 時在左緣外） */
export function wipeFront(u: number, W: number): number {
  const s = smooth(Math.max(0, Math.min(1, u)));
  return (W + WIPE_BAND) * (1 - s) - WIPE_BAND / 2;
}
/** 分界帶的抖動階數：帶切成這麼多段，每段 WIPE_BAND / WIPE_LEVELS px */
export const WIPE_LEVELS = 10;
/** 第 l 段的覆蓋率 */
export function levelKeep(l: number): number { return (l + 0.5) / WIPE_LEVELS; }
/** 分界帶各段（相對帶左緣的 x 範圍與階數；越右越密） */
export const BAND_SLICES: readonly { x0: number; x1: number; level: number }[] = Array.from({ length: WIPE_LEVELS }, (_, l) => ({
  x0: Math.round((l * WIPE_BAND) / WIPE_LEVELS), x1: Math.round(((l + 1) * WIPE_BAND) / WIPE_LEVELS), level: l,
}));
/**
 * 第 l 階的遮罩（w × h；1×1 Bayer，不透明 / 全透明）：用 destination-in 套在整張圖層上 → 烘出該階的抖動版圖層
 * （圖層座標 → 抖動格子黏在圖層上）。階數越高的遮罩是越低的超集。
 */
export function levelMask(l: number, w: number, h: number): Bmp {
  const b = new Bmp(w, h), on = 0xffffffff >>> 0, k = levelKeep(l);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bayer(x, y) < k) b.px[y * w + x] = on;
  return b;
}
