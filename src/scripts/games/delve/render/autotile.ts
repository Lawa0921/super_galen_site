// autotile.ts — 自動接邊的純邏輯（無 DOM）：4 鄰外緣遮罩 → 框線影格欄、斜角內角、材質滲透、草邊。
import { SOLID_LUT, T } from '../engine/tiles';

/** 外緣（該側鄰格是開口）位元 */
export const EDGE = { UP: 1, RIGHT: 2, DOWN: 4, LEFT: 8 } as const;
/** 內角（兩側正交鄰格實心、斜角開口）位元 */
export const CORNER = { TL: 1, TR: 2, BR: 4, BL: 8 } as const;
/** 混合用材質群 */
export const MAT = { NONE: 0, DIRT: 1, SAND: 2, STONE: 3 } as const;
export type Mat = (typeof MAT)[keyof typeof MAT];

export const VARIANTS = 3;
/** 圖集中每個 tile 列的欄數：16 種外緣 × 3 變體 */
export const FRAME_COLS = 16 * VARIANTS;

/** 鄰格查詢：(dx, dy) ∈ [-1,1]² → tile id */
export type Neighbor = (dx: number, dy: number) => number;

export function isOpen(tile: number): boolean { return SOLID_LUT[tile] !== 1; }

export function edgeMask(n: Neighbor): number {
  let m = 0;
  if (isOpen(n(0, -1))) m |= EDGE.UP;
  if (isOpen(n(1, 0))) m |= EDGE.RIGHT;
  if (isOpen(n(0, 1))) m |= EDGE.DOWN;
  if (isOpen(n(-1, 0))) m |= EDGE.LEFT;
  return m;
}

export function innerCornerMask(n: Neighbor): number {
  const s = (dx: number, dy: number): boolean => !isOpen(n(dx, dy));
  let m = 0;
  if (s(0, -1) && s(-1, 0) && !s(-1, -1)) m |= CORNER.TL;
  if (s(0, -1) && s(1, 0) && !s(1, -1)) m |= CORNER.TR;
  if (s(0, 1) && s(1, 0) && !s(1, 1)) m |= CORNER.BR;
  if (s(0, 1) && s(-1, 0) && !s(-1, 1)) m |= CORNER.BL;
  return m;
}

export function blendMat(tile: number): Mat {
  switch (tile) {
    case T.DIRT: case T.GRASS: return MAT.DIRT;
    case T.SAND: return MAT.SAND;
    case T.STONE: case T.COPPER_ORE: case T.IRON_ORE: return MAT.STONE;
    default: return MAT.NONE;
  }
}

/** neighbor 的材質是否滲入 self 那一側（優先序：石 > 沙 > 土）；回傳要疊的材質或 NONE。 */
export function blendOverlay(self: number, neighbor: number): Mat {
  const a = blendMat(self), b = blendMat(neighbor);
  if (a === MAT.NONE || b === MAT.NONE || b <= a) return MAT.NONE;
  return b;
}

export function frameColumn(mask: number, variant: number): number {
  return (mask & 15) * VARIANTS + (variant % VARIANTS);
}

export function grassEdges(tile: number, mask: number): { top: boolean; left: boolean; right: boolean } {
  const top = tile === T.GRASS && (mask & EDGE.UP) !== 0;
  return { top, left: top && (mask & EDGE.LEFT) !== 0, right: top && (mask & EDGE.RIGHT) !== 0 };
}
