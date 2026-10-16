import type { Party } from '../engine/types';
import { activeIds, statsOf } from '../engine/party';
import type { GameState } from '../engine/state';
import type { Run } from '../engine/dungeon/run';
import { EQUIPMENT } from './equipment';
import { ITEMS } from './items';
import { MATERIALS } from './materials';

const EQUIP_WEIGHT = { weapon: 6, armor: 8, accessory: 2 } as const;

/** Carry weight of one unit: items 1, materials 0.5 (the old-coin curio 1), gear by slot. */
export function weightOf(id: string): number {
  if (ITEMS[id]) return 1;
  if (MATERIALS[id]) return id === 'old-coin' ? 1 : 0.5;
  const e = EQUIPMENT[id];
  return e ? EQUIP_WEIGHT[e.slot] : 1;
}

/** What the party can carry into the labyrinth; plan 5 swaps attack for strength. */
export function capacity(party: Party): number {
  return 40 + activeIds(party).reduce((n, id) => n + statsOf(party.roster[id]).atk, 0) * 0.5;
}

/** A weight as shown to the player: at most one decimal place (32.5, 60). */
export function formatWeight(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Weight on the party's backs: the consumables brought along plus the run pack (none before departure). */
export function carried(state: GameState, run?: Run | null): number {
  let w = 0;
  for (const [id, n] of Object.entries(state.inventory)) if (ITEMS[id]) w += n * weightOf(id);
  for (const [id, n] of Object.entries(run?.loot.items ?? {})) w += n * weightOf(id);
  return w;
}
