// blast.ts
import type { Grid, Vec } from './types';
import { tileAt } from './board';

const STEP: Record<string, Vec> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

/**
 * 計算一顆炸彈的十字爆風涵蓋格。
 * - 中心永遠涵蓋。
 * - 每方向延伸最多 range 格：遇 wall 立即停（不涵蓋 wall）；
 *   遇 crate 涵蓋該格並記為破壞，然後停（不穿過）。
 */
export function computeBlast(grid: Grid, x: number, y: number, range: number): { cells: Vec[]; brokenCrates: Vec[] } {
  const cells: Vec[] = [{ x, y }];
  const brokenCrates: Vec[] = [];
  for (const dir of Object.keys(STEP)) {
    const d = STEP[dir];
    for (let i = 1; i <= range; i++) {
      const cx = x + d.x * i, cy = y + d.y * i;
      const t = tileAt(grid, cx, cy);
      if (t === 'wall') break;
      cells.push({ x: cx, y: cy });
      if (t === 'crate') { brokenCrates.push({ x: cx, y: cy }); break; }
    }
  }
  return { cells, brokenCrates };
}
