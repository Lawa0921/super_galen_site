// bomb.ts
import type { Grid, Bomb, Vec } from './types';
import { computeBlast } from './blast';

export interface ChainResult { cells: Vec[]; brokenCrates: Vec[]; consumed: Bomb[]; }

/** 解析連鎖爆炸：從 initial 觸發的炸彈開始，凡爆風涵蓋到的其他炸彈一併引爆。 */
export function resolveChain(grid: Grid, bombs: Bomb[], initial: Bomb[]): ChainResult {
  const consumed = new Set<Bomb>(initial);
  const queue: Bomb[] = [...initial];
  const cellKeys = new Set<string>();
  const cells: Vec[] = [];
  const brokenCrates: Vec[] = [];

  while (queue.length) {
    const b = queue.shift()!;
    const { cells: bc, brokenCrates: bk } = computeBlast(grid, b.x, b.y, b.range);
    for (const c of bc) {
      const k = `${c.x},${c.y}`;
      if (!cellKeys.has(k)) { cellKeys.add(k); cells.push(c); }
    }
    for (const c of bk) brokenCrates.push(c);
    // 連鎖：任何尚未消耗、位置落在爆風格內的炸彈，立即引爆
    for (const other of bombs) {
      if (consumed.has(other)) continue;
      if (cellKeys.has(`${other.x},${other.y}`)) { consumed.add(other); queue.push(other); }
    }
  }
  return { cells, brokenCrates, consumed: [...consumed] };
}
