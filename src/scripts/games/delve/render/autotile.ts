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

// ── 裝飾物件外觀（圖集每個裝飾 tile 一列，欄 = style） ─────────────
export const CACTUS_STYLE = { MID: 0, TOP: 1, ARM_L: 2, ARM_R: 3, BASE: 4, SINGLE: 5 } as const;
export const VINE_END = 1;
/** 每個裝飾 tile 的 style 數（圖集欄數 ≤ FRAME_COLS） */
export const DECOR_STYLES: Record<number, number> = {
  [T.CHEST]: 1, [T.POT]: 3, [T.FLOWER]: 12, [T.TALL_GRASS]: 4, [T.MUSHROOM]: 2, [T.SMALL_ROCK]: 3, [T.BUSH]: 3,
  [T.PUMPKIN]: 2, [T.CACTUS]: 6, [T.DEAD_BUSH]: 3, [T.SNOW_SHRUB]: 3, [T.FERN]: 3, [T.VINE]: 3,
  [T.GLOW_MUSHROOM]: 3, [T.CRYSTAL]: 8, [T.STALACTITE]: 6, [T.STALAGMITE]: 6, [T.COBWEB]: 2, [T.BEAM]: 1,
  [T.WORKBENCH]: 1,
};

function cellHash(x: number, y: number): number {
  let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/** 裝飾物件在 (x,y) 用哪個 style：依鄰格（仙人掌節、藤蔓尖、水晶朝向…）或座標雜湊。 */
export function decorStyle(id: number, x: number, y: number, n: Neighbor): number {
  const h = cellHash(x, y);
  const solid = (dx: number, dy: number): boolean => SOLID_LUT[n(dx, dy)] === 1;
  switch (id) {
    case T.CACTUS: {
      const up = n(0, -1) === T.CACTUS, dn = n(0, 1) === T.CACTUS;
      if (!up && !dn) return CACTUS_STYLE.SINGLE;
      if (!up) return CACTUS_STYLE.TOP;
      if (!dn) return h % 3 === 0 ? CACTUS_STYLE.ARM_L : h % 3 === 1 ? CACTUS_STYLE.ARM_R : CACTUS_STYLE.BASE;
      const r = h % 6;
      return r === 0 ? CACTUS_STYLE.ARM_L : r === 1 ? CACTUS_STYLE.ARM_R : CACTUS_STYLE.MID;
    }
    case T.VINE: return n(0, 1) === T.VINE ? (h & 1 ? 2 : 0) : VINE_END;
    case T.CRYSTAL:
      if (solid(0, 1)) return h % 3;
      if (solid(0, -1)) return 3 + (h % 3);
      if (solid(-1, 0)) return 6;
      if (solid(1, 0)) return 7;
      return h % 3;
    case T.STALACTITE: return (n(0, -1) === T.ICE ? 3 : 0) + (h % 3);
    case T.STALAGMITE: return (n(0, 1) === T.ICE ? 3 : 0) + (h % 3);
    case T.COBWEB: return solid(-1, 0) ? 0 : solid(1, 0) ? 1 : h & 1;
    default: return h % (DECOR_STYLES[id] ?? 1);
  }
}
