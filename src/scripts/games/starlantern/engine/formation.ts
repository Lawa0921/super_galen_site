import type { Combatant } from './combatant';
import type { Row } from './types';

/** The party stands on a 3x3 grid: cells 0-2 front, 3-5 middle, 6-8 back; at most five members take the field. */
export const GRID_SIZE = 9;
export const MAX_ACTIVE = 5;
export const ROWS: Row[] = ['front', 'middle', 'back'];
/** Melee strength by the attacker's row. */
export const ROW_MELEE: Record<Row, number> = { front: 1, middle: 0.75, back: 0.5 };

export type Shape = 'row' | 'column' | 'cross';

export const rowOfCell = (cell: number): Row => ROWS[Math.floor(cell / 3)];

const alive = (cs: Combatant[]) => cs.filter((c) => c.alive);

/** Who an attack can pick: melee only reaches the frontmost row that still has someone standing; ranged and magic reach anyone. */
export function reachable(party: Combatant[], melee: boolean): Combatant[] {
  const standing = alive(party);
  if (!melee) return standing;
  for (const row of ROWS) {
    const inRow = standing.filter((c) => c.row === row);
    if (inRow.length) return inRow;
  }
  return standing;
}

/** Everyone standing inside the shape around the primary target: its row, its column, or it and its four neighbours. */
export function shapeTargets(party: Combatant[], primary: Combatant, shape: Shape): Combatant[] {
  const p = primary.cell ?? 0;
  const [pr, pc] = [Math.floor(p / 3), p % 3];
  return alive(party).filter((c) => {
    const cell = c.cell ?? 0;
    const [r, col] = [Math.floor(cell / 3), cell % 3];
    if (shape === 'row') return r === pr;
    if (shape === 'column') return col === pc;
    return Math.abs(r - pr) + Math.abs(col - pc) <= 1;
  });
}
