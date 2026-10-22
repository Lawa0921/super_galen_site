// frost.ts — 地表水結冰 / 融化（每天換日、讀檔、debug 改日期時跑一次）：
//   每欄從地表上方往下找第一個「實心或液體」格；是露天（沒背牆、上方沒有屋頂）的水 → 那格標 frozen
//   （薄膜 < FREEZE_THIN 時連下面一格一起），碰撞算實心、液體模擬不動它（world.isFrozen / liquid.ts）。
//   哪幾欄結冰由曆法 freezeSeason（季節 × 生態區 × 欄位雜湊 → 冰面逐日擴大、逐日融化）決定。
//   全部走座標 getter / setter（與儲存無關）；欄 x 由小到大處理。
//   中央以外（x < 0、x ≥ width）的冰只標重畫、不標「液體已修改」：外圍的結冰由日期重算（欄載入時 freezeColumns），
//   不必存檔 / 停放（走過結冰的湖不會讓欄被停放）。
import type { World, TileWindow } from './world';
import type { LiquidSim } from './liquid';
import { LIQ } from './liquidKind';
import { SOLID_LUT } from './tiles';
import { CHUNK } from './constants';
import { chunkOfX } from './coords';
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

/** 冰變動的那格：中央標液體 dirty + 已修改（存檔），外圍只標 dirty */
function touchIce(w: World, x: number, y: number): void {
  if (x >= 0 && x < w.width) w.touchLiquidAt(x, y);
  else w.markLiquidDirty(x, y);
}

/** 單一 tile 欄 x 的結冰 / 融化；結冰 / 融化格數累加進 acc */
function freezeColumn(w: World, sim: LiquidSim | null, dayIndex: number, x: number, acc: { frozen: number; thawed: number },
  blocked?: (x: number, y: number) => boolean, keepOpen?: Set<number>): void {
  const surf = w.surfaceAt(x);
  const y0 = Math.max(0, surf - FREEZE_SCAN_UP), y1 = Math.min(w.height - 1, surf + FREEZE_SCAN_DOWN);
  const want = freezeSeason(dayIndex, w.biomeAt(x), freezeHash(x));
  const set = (y: number): void => {
    if (w.isFrozen(x, y) || w.getLiquidType(x, y) !== LIQ.WATER || !w.getLiquid(x, y) || w.getWall(x, y) !== 0
      || blocked?.(x, y) || keepOpen?.has(w.idx(x, y))) return;
    w.setFrozen(x, y, true); acc.frozen++;
    touchIce(w, x, y);
  };
  // 已經結冰但這欄不該結冰（或冰面上方被蓋了屋頂）→ 先全部融掉，再重找湖面
  let top = -1;
  for (let y = y0; y <= y1; y++) {
    if (SOLID_LUT[w.getFg(x, y)] === 1) break;
    if (w.getLiquid(x, y) || w.isFrozen(x, y)) { top = y; break; }
  }
  for (let y = y0; y <= y1; y++) {
    if (!w.isFrozen(x, y)) continue;
    const keep = want && (y === top || y === top + 1);
    if (keep) continue;
    w.setFrozen(x, y, false); acc.thawed++;
    touchIce(w, x, y);
    sim?.wake(x, y);
  }
  if (!want || top < 0) return;
  if (w.getLiquidType(x, top) !== LIQ.WATER) return;
  set(top);
  if (w.isFrozen(x, top) && w.getLiquid(x, top) < FREEZE_THIN && top + 1 < w.height && w.getLiquidType(x, top + 1) === LIQ.WATER) set(top + 1);
}

/**
 * 依第 dayIndex 天更新地表冰。blocked(x, y) = 那格有人（不要把人凍在冰裡）。
 * cols = 要處理的區塊欄（chunk 欄 cx，每欄 32 個 tile 欄，夾在 [xMin, xMax)）；省略 = [xMin, xMax) 內所有欄。
 * 回傳 { frozen, thawed } 格數。
 */
export function updateFreeze(w: World, sim: LiquidSim | null, dayIndex: number, blocked?: (x: number, y: number) => boolean,
  /** 玩家敲開的冰洞（tile 鍵）：這一季不再結冰；那一欄融化的季節到了就從清單拿掉 */
  keepOpen?: Set<number>, cols?: Iterable<number>): { frozen: number; thawed: number } {
  const acc = { frozen: 0, thawed: 0 };
  let done: Set<number> | null = null;
  if (cols === undefined) {
    for (let x = w.xMin; x < w.xMax; x++) freezeColumn(w, sim, dayIndex, x, acc, blocked, keepOpen);
  } else {
    done = new Set<number>();
    for (const cx of [...cols].sort((a, b) => a - b)) {
      if (done.has(cx)) continue;
      done.add(cx);
      const x0 = Math.max(w.xMin, cx * CHUNK), x1 = Math.min(w.xMax, (cx + 1) * CHUNK);
      for (let x = x0; x < x1; x++) freezeColumn(w, sim, dayIndex, x, acc, blocked, keepOpen);
    }
  }
  if (keepOpen?.size) {
    for (const k of keepOpen) {
      const x = w.tileXY(k).x;
      if (done && !done.has(chunkOfX(x))) continue;
      if (!freezeSeason(dayIndex, w.biomeAt(x), freezeHash(x))) keepOpen.delete(k);
    }
  }
  return acc;
}

/**
 * 只處理 cols（區塊欄 cx）的結冰 / 融化（欄剛載入時依今天日期跑一次；每日換日跑常駐欄）。
 * 與 updateFreeze(w, sim, dayIndex, blocked, keepOpen, cols) 相同。
 */
export function freezeColumns(w: World, sim: LiquidSim | null, dayIndex: number, cols: Iterable<number>,
  blocked?: (x: number, y: number) => boolean, keepOpen?: Set<number>): { frozen: number; thawed: number } {
  return updateFreeze(w, sim, dayIndex, blocked, keepOpen, cols);
}

/** 全世界結冰格數（測試 / debug；逐 chunk 用 window 讀） */
export function frozenCount(w: World): number {
  let n = 0;
  let win: TileWindow | undefined;
  w.forEachChunk((cx, cy) => {
    win = w.window(cx * CHUNK, cy * CHUNK, CHUNK, CHUNK, win);
    // 世界外的格在 window 裡 frozen = 0，不用另外剪
    for (let k = 0; k < CHUNK * CHUNK; k++) n += win.frozen[k];
  });
  return n;
}
