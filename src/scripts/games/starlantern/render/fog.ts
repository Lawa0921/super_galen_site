import type { Pos } from '../engine/types';

export type FogState = 'hidden' | 'memory' | 'visible';

/** Never revealed: hidden. Revealed and within one step of the party: visible. Otherwise remembered (drawn dimmed). */
export function fogState(explored: ReadonlySet<string>, pos: Pos, x: number, y: number): FogState {
  if (!explored.has(`${x},${y}`)) return 'hidden';
  return Math.max(Math.abs(x - pos.x), Math.abs(y - pos.y)) <= 1 ? 'visible' : 'memory';
}
