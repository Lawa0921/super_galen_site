// enemy.ts
import type { Grid, Enemy, Dir, Vec, Bomb } from './types';
import { isWalkable } from './board';
import { dirDelta } from './player';

const DIRS: Dir[] = ['up', 'down', 'left', 'right'];

function open(grid: Grid, x: number, y: number, bombs: Bomb[]): boolean {
  if (!isWalkable(grid, x, y)) return false;
  return !bombs.some((b) => b.x === x && b.y === y);
}

function openDirs(grid: Grid, e: Enemy, bombs: Bomb[]): Dir[] {
  return DIRS.filter((d) => { const v = dirDelta(d); return open(grid, e.x + v.x, e.y + v.y, bombs); });
}

/** 決定敵人這次嘗試移動的方向；無路可走回傳 null。 */
export function chooseEnemyDir(grid: Grid, e: Enemy, player: Vec, bombs: Bomb[], rng: () => number): Dir | null {
  const opts = openDirs(grid, e, bombs);
  if (opts.length === 0) return null;

  if (e.kind === 'chaser') {
    let best: Dir = opts[0];
    let bestDist = Infinity;
    for (const d of opts) {
      const v = dirDelta(d);
      const dist = Math.abs(e.x + v.x - player.x) + Math.abs(e.y + v.y - player.y);
      if (dist < bestDist) { bestDist = dist; best = d; }
    }
    return best;
  }

  // wander：能直走就直走，否則隨機挑一個開放方向
  if (opts.includes(e.dir) && rng() < 0.8) return e.dir;
  return opts[Math.floor(rng() * opts.length)];
}
