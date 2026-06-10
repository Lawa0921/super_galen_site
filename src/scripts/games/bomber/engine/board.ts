import type { Grid, Tile } from './types';

/** 取得 (x,y) 的 tile；界外視為 wall。 */
export function tileAt(grid: Grid, x: number, y: number): Tile {
  if (y < 0 || y >= grid.length || x < 0 || x >= grid[0].length) return 'wall';
  return grid[y][x];
}

/** (x,y) 是否可被實體踏入（僅 floor 可走；bomb 阻擋由 game 另外判斷）。 */
export function isWalkable(grid: Grid, x: number, y: number): boolean {
  return tileAt(grid, x, y) === 'floor';
}

/** 把 (x,y) 的 crate 變 floor，回傳新 grid（immutable）。 */
export function breakCrate(grid: Grid, x: number, y: number): Grid {
  const next = grid.map((row) => [...row]);
  if (tileAt(grid, x, y) === 'crate') next[y][x] = 'floor';
  return next;
}
