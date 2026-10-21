// coords.ts — tile / chunk 座標 ↔ 數字鍵（雙射）。
// 中央（0 ≤ x < width、0 ≤ cx < chunksX）沿用舊的 row-major index：tile = y*width + x、chunk = cy*chunksX + cx，
// 所以存檔與角色檔裡既有的每個 tile / chunk 鍵都不用改寫。其他座標（負 x、x ≥ width）落在 T_BASE / C_BASE 以上的另一段。
// 鍵只是鍵：width 不是 CHUNK 的倍數時，最後一個中央 chunk 用舊 chunk 鍵，但它 x ≥ width 的格用外圍 tile 鍵。
import { WORLD_W, WORLD_H } from './constants';

/** 水平硬邊界：x ∈ [−X_LIMIT, X_LIMIT)（R3） */
export const X_LIMIT = 1_000_000;
/** 外圍 tile 鍵 = T_BASE + (x + T_OFF) * T_Y + y */
export const T_BASE = 2 ** 25, T_OFF = 2 ** 21, T_Y = 4096;
/** 外圍 chunk 鍵 = C_BASE + (cx + C_OFF) * C_Y + cy */
export const C_BASE = 2 ** 20, C_OFF = 2 ** 16, C_Y = 128;

export function tileKey(width: number, x: number, y: number): number {
  if (x >= 0 && x < width) return y * width + x;
  return T_BASE + (x + T_OFF) * T_Y + y;
}
export function tileXY(width: number, k: number): { x: number; y: number } {
  if (k < T_BASE) {
    const y = Math.floor(k / width);
    return { x: k - y * width, y };
  }
  const r = k - T_BASE;
  const y = r % T_Y;
  return { x: (r - y) / T_Y - T_OFF, y };
}

export function chunkKey(chunksX: number, cx: number, cy: number): number {
  if (cx >= 0 && cx < chunksX) return cy * chunksX + cx;
  return C_BASE + (cx + C_OFF) * C_Y + cy;
}
export function chunkXY(chunksX: number, k: number): { cx: number; cy: number } {
  if (k < C_BASE) {
    const cy = Math.floor(k / chunksX);
    return { cx: k - cy * chunksX, cy };
  }
  const r = k - C_BASE;
  const cy = r % C_Y;
  return { cx: (r - cy) / C_Y - C_OFF, cy };
}
/** 是不是外圍（中央 chunk 以外）的 chunk 鍵 */
export function isOuterChunkKey(k: number): boolean { return k >= C_BASE; }

/** 世界的水平邊界：legacy = [0, width)（左右實心牆）；infinite = ±X_LIMIT */
export type WorldBounds = 'legacy' | 'infinite';
/** 正式尺寸的世界一律無限；指定小尺寸的測試世界維持有界（B5） */
export function defaultBounds(width: number, height: number): WorldBounds {
  return width === WORLD_W && height === WORLD_H ? 'infinite' : 'legacy';
}
