/**
 * Character mechanics in a fight (spec §8, §11; plan 8a Task 4): the state a member's mechanic keeps on `Combatant.mech`,
 * and the party's barriers on `BattleState.barriers`. The old roster has neither, so nothing here acts on it yet. Roster
 * plans may add fields to these types; they never rename one or change what it means.
 */
import type { Combatant } from './combatant';

/** The gauges a `spend-at` rule can read. */
export type MechGauge = 'heat' | 'coins' | 'aim' | 'embers';

/** A device a member has set up: its skill, its upgrade level, the turns it has left. */
export interface Device { skill: string; level: number; turns: number }

/** The barriers Chizuru raises (spec §8.2): the guard (def and res for the party) and the purifying one. */
export type BarrierKind = 'guard' | 'purify';

/**
 * A barrier over the party: the skill that raised it, its kind and power (a guard's percent), the turns it has left, who
 * raised it (the ledger credits what it prevents to them) and its boost (the great barrier's multiplier; absent reads 1).
 */
export interface Barrier { skill: string; kind: BarrierKind; power: number; turns: number; src: string; boost?: number }

/** `beat.last` is the previous round's skill id, `'attack'`, `'defend'` or `'ultimate'`. */
export type MechState =
  | { kind: 'heat'; heat: number }
  | { kind: 'coins'; coins: number }
  | { kind: 'aim'; target: string | null; stacks: number }
  | { kind: 'embers'; embers: number }
  | { kind: 'beat'; beat: number; last: string | null }
  | { kind: 'devices'; devices: Device[]; cap: number }
  | { kind: 'mark'; marks: string[]; cap: number }
  | { kind: 'barrier' };

/** The value of gauge `g` on `c` (`aim` reads its stacks); undefined when `c` keeps no such gauge. */
export function mechGauge(c: Combatant, g: MechGauge): number | undefined {
  const m = c.mech;
  if (!m || m.kind !== g) return undefined;
  switch (m.kind) {
    case 'heat': return m.heat;
    case 'coins': return m.coins;
    case 'aim': return m.stacks;
    case 'embers': return m.embers;
  }
  return undefined;
}
