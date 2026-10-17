import type { Party } from '../engine/types';
import { activeIds, sheetOf } from '../engine/party';
import type { GameState } from '../engine/state';
import type { Run } from '../engine/dungeon/run';
import { itemWeight } from '../engine/loot/item';
import { ITEMS } from './items';
import { MATERIALS } from './materials';
import { FRAGMENT_WEIGHT, isFragmentItem } from './story/fragments';

/** Carry weight of one unit: items 1, materials 0.5 (the old-coin curio 1). Gear is never a unit; it weighs `itemWeight`. */
export function weightOf(id: string): number {
  if (isFragmentItem(id)) return FRAGMENT_WEIGHT;
  if (ITEMS[id]) return 1;
  if (MATERIALS[id]) return id === 'old-coin' ? 1 : 0.5;
  return 1;
}

/** What the party can carry into the labyrinth: 40 plus half the active members' strength. */
export function capacity(party: Party): number {
  return 40 + activeIds(party).reduce((n, id) => n + sheetOf(party.roster[id]).str, 0) * 0.5;
}

/** A weight as shown to the player: at most one decimal place (32.5, 60). */
export function formatWeight(n: number): string {
  return String(Math.round(n * 10) / 10);
}

/** Weight on the party's backs: the consumables brought along plus the run pack, gear included (none before departure). Worn gear weighs nothing. */
export function carried(state: GameState, run?: Run | null): number {
  let w = 0;
  for (const [id, n] of Object.entries(state.inventory)) if (ITEMS[id]) w += n * weightOf(id);
  for (const [id, n] of Object.entries(run?.loot.items ?? {})) w += n * weightOf(id);
  for (const it of run?.loot.gear ?? []) w += itemWeight(it);
  return w;
}
