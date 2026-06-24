/**
 * Foot-shadow geometry — render-only helper shared by EntityView (single-player
 * player + enemies) and VersusEntityView (versus players).
 *
 * A flattened dark translucent ellipse drawn UNDER each living character/monster
 * at its feet (bottom-centre of its cell) so sprites lift off the floor and are
 * easier to identify. Pure / deterministic: position is derived from the same
 * interpolated grid coords the sprite uses; no Math.random / Date.now.
 */

/** Shadow tuning constants (cell-relative). */
export const SHADOW_FILL = 0x000000;
export const SHADOW_ALPHA = 0.28;
/** Vertical offset (cell units) from cell top to the shadow centre — at the feet. */
export const SHADOW_FOOT_FRAC = 0.8;
/** Horizontal radius as a fraction of cell (× per-entity size multiplier). */
export const SHADOW_RX_FRAC = 0.3;
/** Vertical radius as a fraction of cell (× per-entity size multiplier) — flattened. */
export const SHADOW_RY_FRAC = 0.12;

export interface ShadowGeom {
  /** Ellipse centre x (screen px). */
  cx: number;
  /** Ellipse centre y (screen px) — near the sprite's feet. */
  cy: number;
  /** Horizontal radius (px). */
  rx: number;
  /** Vertical radius (px) — flattened. */
  ry: number;
}

/**
 * Compute the foot-shadow ellipse for an entity at interpolated grid coords
 * (rx, ry) within a layout of cell size `cell` and grid origin (ox, oy).
 *
 * @param sizeMul per-entity display-size multiplier (1 for player; per-kind for
 *   enemies so larger enemies cast larger shadows).
 */
export function footShadowGeom(
  rx: number,
  ry: number,
  cell: number,
  ox: number,
  oy: number,
  sizeMul: number,
): ShadowGeom {
  return {
    cx: ox + rx * cell + cell / 2,
    cy: oy + ry * cell + cell * SHADOW_FOOT_FRAC,
    rx: cell * SHADOW_RX_FRAC * sizeMul,
    ry: cell * SHADOW_RY_FRAC * sizeMul,
  };
}
