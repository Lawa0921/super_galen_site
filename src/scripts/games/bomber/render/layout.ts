// layout.ts
import { GRID_COLS, GRID_ROWS } from '../engine/constants';

export interface Layout {
  cell: number;
  ox: number;
  oy: number;
}

/** 依畫面尺寸算出格子大小 + 盤面左上角偏移，留出上方 HUD 空間。 */
export function computeLayout(w: number, h: number): Layout {
  const hudH = 56;
  const cell = Math.max(16, Math.floor(Math.min(
    (w * 0.96) / GRID_COLS,
    ((h - hudH) * 0.96) / GRID_ROWS,
  )));
  const ox = Math.round((w - cell * GRID_COLS) / 2);
  const oy = Math.round(hudH + (h - hudH - cell * GRID_ROWS) / 2);
  return { cell, ox, oy };
}

/** 線性插值。 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
