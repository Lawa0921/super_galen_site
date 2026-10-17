// frost.ts — 地表水結冰 / 融化（每天換日、讀檔、debug 改日期時跑一次）：
//   每欄從地表上方往下找第一個「實心或液體」格；是露天（沒背牆、上方沒有屋頂）的水 → 那格標 frozen
//   （薄膜 < FREEZE_THIN 時連下面一格一起），碰撞算實心、液體模擬不動它（world.frozen / liquid.ts）。
//   哪幾欄結冰由曆法 freezeSeason（季節 × 生態區 × 欄位雜湊 → 冰面逐日擴大、逐日融化）決定。
import type { World } from './world';
import type { LiquidSim } from './liquid';
import { LIQ } from './liquidKind';
import { SOLID_LUT } from './tiles';
import { freezeSeason } from './calendar';

/** 從地表往上多少格開始掃（高於樹冠） */
export const FREEZE_SCAN_UP = 64;
/** 往地表下多少格內的冰算「地表冰」（融化時清這段） */
const FREEZE_SCAN_DOWN = 12;
/** 湖面那格的水比這少 → 連下面一格一起結冰（不留一層浮在冰上的薄水） */
export const FREEZE_THIN = 128;

/** 欄位雜湊（8 欄一組 → 冰面一塊一塊地擴大） */
export function freezeHash(x: number): number {
  let h = Math.imul((x >> 3) ^ 0x2c1b3c6d, 0x297a2d39);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  return (((h ^ (h >>> 13)) >>> 0) % 10000) / 10000;
}

/**
 * 依第 dayIndex 天更新整個世界的地表冰。blocked(x, y) = 那格有人（不要把人凍在冰裡）。
 * 回傳 { frozen, thawed } 格數。
 */
export function updateFreeze(w: World, sim: LiquidSim | null, dayIndex: number, blocked?: (x: number, y: number) => boolean): { frozen: number; thawed: number } {
  const F = w.frozen, L = w.liquid, LT = w.liquidType, fg = w.fg, W = w.width;
  let frozen = 0, thawed = 0;
  for (let x = 0; x < W; x++) {
    const surf = w.surface[x];
    const y0 = Math.max(0, surf - FREEZE_SCAN_UP), y1 = Math.min(w.height - 1, surf + FREEZE_SCAN_DOWN);
    const want = freezeSeason(dayIndex, w.biome[x], freezeHash(x));
    const set = (y: number): void => {
      const i = y * W + x;
      if (F[i] || LT[i] !== LIQ.WATER || !L[i] || w.wall[i] !== 0 || blocked?.(x, y)) return;
      F[i] = 1; frozen++;
      w.touchLiquid(i);
    };
    // 已經結冰但這欄不該結冰（或冰面上方被蓋了屋頂）→ 先全部融掉，再重找湖面
    let top = -1;
    for (let y = y0; y <= y1; y++) {
      const i = y * W + x;
      if (SOLID_LUT[fg[i]] === 1) break;
      if (L[i] || F[i]) { top = y; break; }
    }
    for (let y = y0; y <= y1; y++) {
      const i = y * W + x;
      if (!F[i]) continue;
      const keep = want && (y === top || y === top + 1);
      if (keep) continue;
      F[i] = 0; thawed++;
      w.touchLiquid(i);
      sim?.wake(x, y);
    }
    if (!want || top < 0) continue;
    const i = top * W + x;
    if (LT[i] !== LIQ.WATER) continue;
    set(top);
    if (F[i] && L[i] < FREEZE_THIN && top + 1 < w.height && LT[i + W] === LIQ.WATER) set(top + 1);
  }
  return { frozen, thawed };
}

export function frozenCount(w: World): number {
  let n = 0;
  for (let i = 0; i < w.frozen.length; i++) n += w.frozen[i];
  return n;
}
