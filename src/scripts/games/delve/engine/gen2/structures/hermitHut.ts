// hermitHut.ts — gen2 荒野大陸的隱士小屋（M2a Task 18，Q20b；spec §4.1「荒野大陸的結構以遺跡、地城、小屋、礦坑、隱士為主」）：
// 大陸的 hermit_hut 錨點建構器（SURFACE 層，每片荒野大陸 1 座，anchors.continentAnchors）。Task 20 的隱士島共用 buildHermitHutBp / drawHermitHut（不複製），
// 燈塔島共用整平（levelSite / flattestX / levelRows / medianFloor，structures/island.ts）。
//   · drawHermitHut：寬 w（建構器擲 9–11）的木屋，畫法 = 村屋（draw/village.ts 的 buildHouse，role 'home'：門、窗、床、桌椅、牆上火把、茅草屋頂），
//     門朝哪側擲一次 chance(2)；屋子兩側各 SIDE 欄的地面整平（levelSite：屋外緩坡接回原地表，同村莊的坡地規則）、往上清 CLEAR_UP 列、往下補到
//     max(地面 + FILL_DOWN, 原地表 + 3)（只補「讀到不是實心」的格——BpCanvas 的回退讀取把天然格當實心，所以建構器要用 solid 蓋住整個外框）。
//     回傳隱士站的格 at = 屋內中央、地板上一格。
//   · buildHermitHutBp：站在 c.profile 地表（SURFACE 層不讀 groundAt，Q4）；屋子的 x = 可用範圍裡屋子連兩側緩坡起伏最小的位置（平手取離中點近的、再取 x 小的），
//     地面 = 屋子各欄地表的中位數；外框 = 屋子 ± SIDE 欄 × 清空的頂到補土的底，整個外框併進 solid（不挖洞穴、不當地表入口）、ground 覆寫外框各欄。
//     site = { kind: 'hermit', key: 's' + id, rot: 0, at }（folk.ts 放 1 位 `${key}:hermit`）；小屋不算「大東西」。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { HRng } from '../hrng';
import { BpCanvas } from '../draw/bpCanvas';
import { buildHouse } from '../draw/village';
import type { Canvas, RandomLike } from '../draw/canvas';
import type { Profile2 } from '../profile';
import { BP_SURFACE, SLOT_PAD, type Blueprint, type BpCtx } from '../bpcore';

// 屋寬 [lo, hi)（rng.int）；屋子兩側整平的欄數；地面往上清幾列（室內 5 + 屋頂最多 7 列）、往下至少補幾列
export const HUT_W: readonly [number, number] = [9, 12];
export const LEVEL_SIDE = 4;
const SIDE = LEVEL_SIDE, CLEAR_UP = 16, FILL_DOWN = 4, FILL_BELOW_SURFACE = 3;
// 外框寬上限（= anchors.ANCHOR_MAX_W.hermit_hut）：屋寬上限 11 + 兩側各 SIDE
export const HUT_MAX_W = HUT_W[1] - 1 + 2 * SIDE;

// 屋外第 k 欄（1..SIDE）的地面：floorY 往原地表 s0 漸變（k = SIDE + 1 時接回原地表）
const slopeTop = (floorY: number, s0: number, k: number): number => floorY + Math.trunc(((s0 - floorY) * k) / (SIDE + 1));
// 整平後第 x 欄的地面（建物欄 [x0, x1] 是 floorY）
const topAt = (s0: number, x: number, x0: number, x1: number, floorY: number): number => {
  const k = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  return k ? slopeTop(floorY, s0, k) : floorY;
};

// 整平：建物欄 [x0, x1]（含）= floorY，兩側各 SIDE 欄緩坡接回原地表；往上清 CLEAR_UP 列、往下補土、地面那格鋪草、記進地面覆寫
export function levelSite(cv: Canvas, x0: number, x1: number, floorY: number): void {
  for (let x = x0 - SIDE; x <= x1 + SIDE; x++) {
    if (!cv.inBounds(x, floorY)) continue;
    const s0 = cv.surfaceAt(x), top = topAt(s0, x, x0, x1, floorY);
    for (let y = Math.max(1, Math.min(floorY, top) - CLEAR_UP); y < top; y++) { cv.setFg(x, y, T.AIR); cv.setWall(x, y, W.NONE); cv.clearLiquid(x, y); }
    for (let y = top; y < Math.max(top + FILL_DOWN, s0 + FILL_BELOW_SURFACE); y++) if (!cv.isSolid(x, y)) cv.setFg(x, y, T.DIRT);
    cv.setFg(x, top, T.GRASS);
    cv.setSurface(x, top);
  }
}
// 外框 [bx, bx + Wd) 在 [lo, hi] 裡起伏（profile 地表的最大 − 最小）最小的 bx（平手取離 mid 近的、再取 x 小的）
export function flattestX(p: Profile2, lo: number, hi: number, Wd: number, mid: number): number {
  let bx = lo, best = Infinity;
  for (let x = lo; x <= hi; x++) {
    let a = Infinity, b = -Infinity;
    for (let q = x; q < x + Wd; q++) { const s = p.surfaceAt(q); a = Math.min(a, s); b = Math.max(b, s); }
    const rough = b - a;
    if (rough < best || (rough === best && Math.abs(x - mid) < Math.abs(bx - mid))) { best = rough; bx = x; }
  }
  return bx;
}
// 建物欄 [x0, x0 + w) 的地面 = 各欄地表的中位數
export function medianFloor(p: Profile2, x0: number, w: number): number {
  const surf: number[] = [];
  for (let x = x0; x < x0 + w; x++) surf.push(p.surfaceAt(x));
  return [...surf].sort((a, b) => a - b)[w >> 1];
}
// levelSite 在外框 [bx, bx + Wd) 會寫到的列 [y0, y1)：每欄整平後的地面 top，往上清到 min(floorY, top) − CLEAR_UP、往下補到 max(top + FILL_DOWN, 原地表 + 3)
export function levelRows(p: Profile2, bx: number, Wd: number, x0: number, w: number, floorY: number): { y0: number; y1: number } {
  let y0 = Infinity, y1 = -Infinity;
  for (let x = bx; x < bx + Wd; x++) {
    const s0 = p.surfaceAt(x), top = topAt(s0, x, x0, x0 + w - 1, floorY);
    y0 = Math.min(y0, Math.max(1, Math.min(floorY, top) - CLEAR_UP));
    y1 = Math.max(y1, Math.max(top + FILL_DOWN, s0 + FILL_BELOW_SURFACE));
  }
  return { y0, y1 };
}

export function drawHermitHut(cv: Canvas, o: { x0: number; w: number; floorY: number }, rng: RandomLike): { at: { x: number; y: number } } {
  const { x0, w, floorY } = o, x1 = x0 + w - 1;
  const door = rng.chance(2) ? x0 : x1;
  // 整平：屋子各欄 = floorY，兩側緩坡接回原地表
  levelSite(cv, x0, x1, floorY);
  buildHouse(cv, x0, x1, floorY, door, 'home', rng);
  return { at: { x: x0 + (w >> 1), y: floorY - 1 } };
}

export function buildHermitHutBp(c: BpCtx): Blueprint {
  // ctx.ver 0 的規則
  const p = c.profile, rng = new HRng(c.s, c.id), w = rng.int(HUT_W[0], HUT_W[1]), W_ = w + 2 * SIDE;
  // 屋子連兩側緩坡（外框 [bx, bx + W_)）起伏最小的 bx
  const lo = c.slotX0 + SLOT_PAD, hi = c.slotX1 - SLOT_PAD - W_, mid = c.slotX0 + ((c.slotX1 - c.slotX0 - W_) >> 1);
  if (hi < lo) throw new RangeError(`gen2: hermit_hut ${c.id} does not fit [${c.slotX0}, ${c.slotX1})`);
  const bx = flattestX(p, lo, hi, W_, mid), x0 = bx + SIDE, floorY = medianFloor(p, x0, w);
  const { y0, y1 } = levelRows(p, bx, W_, x0, w, floorY);
  const cv = new BpCanvas({ x: bx, y: y0, w: W_, h: y1 - y0 }, p);
  const { at } = drawHermitHut(cv, { x0, w, floorY }, rng);
  // 免挖洞箱 = 整個外框（BpBox 是外接矩形，兩個角就夠）
  cv.fillNatural(bx, y0); cv.fillNatural(bx + W_ - 1, y1 - 1);
  return cv.toBlueprint(c.id, 'hermit_hut', BP_SURFACE, { floors: [{ ...at }], site: { kind: 'hermit', key: 's' + c.id, rot: 0, at } });
}
