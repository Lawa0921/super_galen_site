// tileFamily.ts — 石 / 土的材質「家族」（純邏輯，無 DOM）：
//   每格原本只有 3 個變體（world.variant），大片石壁看得出格狀重複。這裡再用世界座標的低頻值雜訊
//   挑一個「家族」（同色票、不同肌理的整組變體），家族交界處加每格雜湊抖動 → 交界是參差的鋸齒而不是直線。
//   圖集：tile(id, variant + VARIANTS × 家族, mask)（textures.ts 依家族換列）。
import { T } from '../engine/tiles';
import { VARIANTS } from './autotile';

export const FAMILIES = 3;
/** 有家族變體的材質 */
export const FAMILY_TILES: readonly number[] = [T.STONE, T.DIRT];
const HAS = new Uint8Array(256);
for (const id of FAMILY_TILES) HAS[id] = 1;

function hash01(x: number, y: number, s: number): number {
  let h = Math.imul(x ^ Math.imul(s, 0x27d4eb2d), 0x85ebca6b) ^ Math.imul(y + 0x165667b1, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x9e3779b1);
  return (((h ^ (h >>> 13)) >>> 0) % 4096) / 4096;
}
/** 平滑值雜訊 0..1（cell 格一個格點） */
function vnoise(x: number, y: number, cell: number, s: number): number {
  const fx = x / cell, fy = y / cell, gx = Math.floor(fx), gy = Math.floor(fy);
  const tx = fx - gx, ty = fy - gy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash01(gx, gy, s), b = hash01(gx + 1, gy, s), c = hash01(gx, gy + 1, s), d = hash01(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 世界格 (x,y) 的家族 0..FAMILIES-1 */
export function variantFamily(x: number, y: number): number {
  // 兩個八度（大塊 + 中塊），再加每格 ±0.06 的抖動讓交界參差
  const n = vnoise(x, y, 22, 7) * 0.7 + vnoise(x, y, 9, 13) * 0.3 + (hash01(x, y, 29) - 0.5) * 0.12;
  // 值雜訊集中在中段 → 拉開後再切三段
  const t = Math.max(0, Math.min(0.9999, (n - 0.5) * 1.9 + 0.5));
  return Math.floor(t * FAMILIES);
}

/** 圖集用的變體編號：有家族的材質 = variant + VARIANTS × 家族 */
export function tileVariant(id: number, x: number, y: number, variant: number): number {
  const v = variant % VARIANTS;
  return HAS[id] ? v + VARIANTS * variantFamily(x, y) : v;
}
