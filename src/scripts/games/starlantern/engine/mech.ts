/**
 * Character mechanics in a fight (spec §8, §11; plan 8a Task 4): the state a member's mechanic keeps on `Combatant.mech`,
 * and the party's barriers on `BattleState.barriers`. The old roster has neither, so nothing here acts on it yet. Roster
 * plans may add fields to these types; they never rename one or change what it means.
 */
import type { Combatant } from './combatant';

/**
 * Sylvie's aim (spec §8.4, plan 8c ruling 17; engine/mechanics/aim.ts): the stack cap, damage and crit points per stack on
 * the aimed foe, and what starfall makes of each stack. Kept here so combatant.ts reads it without the mechanics.
 * Task 4 tuning (retune.md): damage 15 → 10 a stack; crit 10 → 0 (any crit chance on a crit-less archer adds a draw to
 * every shot, and that alone moved her Lv 5 share by 12–20%).
 */
export const AIM = { cap: 3, dmgPct: 10, critPct: 0, consumePct: 50 } as const;

/**
 * Safira's beat (spec §8.7, engine/mechanics/beat.ts): the most beats, and the percent each adds to every hit of hers and to
 * her buffs. Kept here so combatant.ts reads it without the mechanics.
 */
export const BEAT = { max: 4, pctPer: 10 } as const;

/** Scarlet's embers (spec §8.5, engine/mechanics/embers.ts): the share of HP lost kept, and the cap, both in percent. */
export const EMBER = { sharePct: 50, capPct: 50 } as const;

/** The gauges a `spend-at` rule can read. */
export type MechGauge = 'heat' | 'coins' | 'aim' | 'embers';

/** Bobby's device kinds (engine/mechanics/devices.ts). */
export type DeviceKind = 'turret' | 'drone' | 'shield' | 'mine' | 'coil';

/** Bobby's devices (spec §8.8, plan 8c ruling 18): how many at once, the top level, +% a level, the coil's shock chance. */
export const DEVICE = { cap: 2, maxLevel: 3, levelPct: 25, coilShock: 0.3 } as const;

/** A device a member has set up: its skill and kind, its power, its upgrade level, the turns it has left. */
export interface Device { skill: string; kind: DeviceKind; power: number; level: number; turns: number }

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
  /** `lock`: round ends the hunter's mark still holds the aim on its target. */
  | { kind: 'aim'; target: string | null; stacks: number; lock?: number }
  | { kind: 'embers'; embers: number }
  | { kind: 'beat'; beat: number; last: string | null }
  | { kind: 'devices'; devices: Device[]; cap: number }
  /** `again`: 還有。 has been spent this round (engine/mechanics/mark.ts). */
  | { kind: 'mark'; marks: string[]; cap: number; again?: true }
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
