// caves.ts — gen2 每個地區的主坑道（spec §4.3「每個地區保證至少一條主坑道從地表通到洞穴層」，裁決 P4）。
// 坑道位置與形狀只由 (seed, 地區) 與 Profile2 的地表 / 層線決定（局部可算），任何一段 fill 都畫得出它與自己相交的部分。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2 } from '../noise';
import { li, type Column } from '../column';
import { T } from '../tiles';
import type { RegionInfo } from '../regionInfo';
import { VARIANT } from './layout';

// 坑道離地區兩端至少 min(SHAFT_MARGIN, 寬 / 4) 格、離出生點至少 SPAWN_GAP 格
const SHAFT_MARGIN = 120, SPAWN_GAP = 100;
// 三角波：每列水平移 1 格、振幅 AMP（週期 4 × AMP）
const AMP = 12, PERIOD = 4 * AMP;
// 每列挖寬 2（中心與 +1）、高 4；底端 deep + BOTTOM_BELOW 挖半徑 ROOM_R 的圓室
const CARVE_H = 4, BOTTOM_BELOW = 12, ROOM_R = 6;
// 起點被地表蓋住時往上延伸找出口，最多這麼多列
const MAX_RISE = 64;
// 坑道各列離 shaftX 最遠 SHAFT_HALF 格（中心 ± AMP、寬 2）；再加底端圓室半徑 = 整條坑道的水平觸及範圍
export const SHAFT_HALF = AMP + 1, SHAFT_REACH = SHAFT_HALF + ROOM_R;

// 地區的雜湊鍵：家鄉 0、東第 i 片 2i、西第 i 片 2i + 1
const regionKey = (r: RegionInfo): number => r.landmass * 2 + (r.side === -1 ? 1 : 0);

// 只有非沙灘的陸地地區有坑道（沙灘只有 70 格寬，P4 豁免）
export function hasShaft(r: RegionInfo): boolean {
  return (r.kind === 'home' || r.kind === 'culture' || r.kind === 'wild') && r.variant !== VARIANT.BEACH;
}

// 坑道的 x（地表入口那一欄）：[x0 + m, x1 − m)，m = min(120, floor(寬 / 4))；出生地區（中點 = 出生點）避開 ±SPAWN_GAP。沒有坑道 = NaN
export function shaftX(seed: number, r: RegionInfo): number {
  if (!hasShaft(r)) return NaN;
  const m = Math.min(SHAFT_MARGIN, Math.floor((r.x1 - r.x0) / 4));
  const a = r.x0 + m, b = r.x1 - m;
  if (b <= a) return NaN;
  const h = hash2(regionKey(r), r.index, seed);
  if (r.variant !== VARIANT.SPAWN) return a + Math.floor(h * (b - a));
  // 出生地區：可用的 x = [a, sp − GAP] ∪ [sp + GAP, b)
  const sp = (r.x0 + r.x1) >> 1;
  const lo = Math.max(0, Math.min(b, sp - SPAWN_GAP + 1) - a), hi = Math.max(0, b - Math.max(a, sp + SPAWN_GAP));
  if (lo + hi === 0) return NaN;
  const k = Math.floor(h * (lo + hi));
  return k < lo ? a + k : Math.max(a, sp + SPAWN_GAP) + k - lo;
}

// 坑道中心相對 shaftX 的水平偏移：三角波，相鄰列差 1、|偏移| ≤ 12；相位由 (seed, 地區) 決定
export function shaftOffset(seed: number, r: RegionInfo, y: number): number {
  const ph = Math.floor(hash2(regionKey(r), r.index + 7919, seed) * PERIOD);
  const p = (((y + ph) % PERIOD) + PERIOD) % PERIOD;
  return p < 2 * AMP ? p - AMP : 3 * AMP - p;
}

// 一條坑道的幾何：列 [top, bottom] 的中心 = sx + shaftOffset(y)
export interface Shaft { sx: number; top: number; bottom: number }

// 坑道從 surface(sx) − 1 挖到 deep(sx) + 12；起點那一列若被地表蓋住（兩格都在地下），沿同一條三角波往上延伸到露出地表為止
export function shaftOf(seed: number, r: RegionInfo, surfaceAt: (x: number) => number, deepAt: (x: number) => number): Shaft | null {
  const sx = shaftX(seed, r);
  if (Number.isNaN(sx)) return null;
  let top = surfaceAt(sx) - 1;
  for (let k = 0; k < MAX_RISE; k++) {
    const c = sx + shaftOffset(seed, r, top);
    if (top < surfaceAt(c) || top < surfaceAt(c + 1)) break;
    top--;
  }
  return { sx, top, bottom: deepAt(sx) + BOTTOM_BELOW };
}

// 把坑道與 [x0, x1) 相交的部分挖成空氣（之字形坡道 + 底端圓室）；牆不動
export function carveShaft(col: Column, x0: number, x1: number, seed: number, r: RegionInfo, sh: Shaft): void {
  const fg = col.fg, H = col.height;
  const dig = (x: number, y: number): void => { if (x >= x0 && x < x1 && y >= 0 && y < H) fg[li(x, y)] = T.AIR; };
  for (let y = sh.top; y <= sh.bottom; y++) {
    const c = sh.sx + shaftOffset(seed, r, y);
    if (c + 1 < x0 || c >= x1) continue;
    for (let dy = 0; dy < CARVE_H; dy++) { dig(c, y + dy); dig(c + 1, y + dy); }
  }
  const cb = sh.sx + shaftOffset(seed, r, sh.bottom);
  if (cb + ROOM_R < x0 || cb - ROOM_R >= x1) return;
  for (let dx = -ROOM_R; dx <= ROOM_R; dx++) for (let dy = -ROOM_R; dy <= ROOM_R; dy++) {
    if (dx * dx + dy * dy <= ROOM_R * ROOM_R) dig(cb + dx, sh.bottom + dy);
  }
}
