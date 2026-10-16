import type { Pos } from '../engine/types';

export type FogState = 'hidden' | 'memory' | 'visible';

/**
 * Never revealed: hidden. Revealed and within `sight` steps of the party: visible. Otherwise remembered (drawn dimmed).
 * `sight` is the run condition's (0 under 濃霧: only the party's own cell is in sight).
 */
export function fogState(explored: ReadonlySet<string>, pos: Pos, x: number, y: number, sight = 1): FogState {
  if (!explored.has(`${x},${y}`)) return 'hidden';
  return Math.max(Math.abs(x - pos.x), Math.abs(y - pos.y)) <= sight ? 'visible' : 'memory';
}
