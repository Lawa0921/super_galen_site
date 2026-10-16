// noise.ts — 世界生成用的確定性值雜訊（只用整數雜湊 + 四則運算，跨引擎位元一致）。
import { xmur3 } from './rng';

/** 字串 / 數字種子 → 32-bit 整數 */
export function seedInt(seed: string | number, name: string): number {
  return xmur3(`${seed}:${name}`)() | 0;
}

/** 格點雜湊 → [0,1) */
export function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 2D 值雜訊（cell 格距、雙線性 + smoothstep），0..1 */
export function vnoise2(x: number, y: number, cell: number, s: number): number {
  const fx = x / cell, fy = y / cell;
  const gx = Math.floor(fx), gy = Math.floor(fy);
  const sx = smooth(fx - gx), sy = smooth(fy - gy);
  const a = hash2(gx, gy, s), b = hash2(gx + 1, gy, s), c = hash2(gx, gy + 1, s), d = hash2(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 1D 值雜訊，0..1 */
export function vnoise1(x: number, cell: number, s: number): number {
  const f = x / cell, g = Math.floor(f), t = smooth(f - g);
  const a = hash2(g, 0, s), b = hash2(g + 1, 0, s);
  return a + (b - a) * t;
}

/** 兩個八度的 2D 雜訊（大塊 + 細節），0..1 */
export function fbm2(x: number, y: number, cell: number, s: number): number {
  return vnoise2(x, y, cell, s) * 0.68 + vnoise2(x, y, cell * 0.4, s + 7) * 0.32;
}
