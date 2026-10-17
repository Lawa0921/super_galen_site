import type { RegionId } from '../data/regions';
import type { Portal } from './dungeon/run';
import type { AutoJunk } from './loot/bag';
import { newParty } from './party';
import { rollPortals } from './portals';
import { mulberry32, type Rng } from './rng';
import type { Element, ItemInstance, Party } from './types';

export const SAVE_VERSION = 6;

export interface DungeonProgress {
  /** Deepest depth reached in each region; 1 until a run goes deeper. Runs start at 1 or a multiple of 5 up to this. */
  reached: Record<RegionId, number>;
  bossDefeated: boolean;
  /** Boss kills per `${region}:${depth}`. */
  bossKills: Record<string, number>;
  /** The three gates open in town: the mainline first, then two regions. Rerolled on every arrival in town. */
  portals: Portal[];
}

export const newReached = (): Record<RegionId, number> => ({ mainline: 1, blaze: 1, frost: 1, storm: 1, mire: 1, shade: 1, iron: 1 });

export interface GameState {
  version: typeof SAVE_VERSION;
  gold: number;
  inventory: Record<string, number>;
  /** Gear only (at most BAG_SIZE); materials and consumables stay in `inventory`. */
  bag: ItemInstance[];
  /** The next item uid to hand out; above every uid in the bag or worn. */
  nextUid: number;
  sold: Record<string, number>;
  party: Party;
  dungeon: DungeonProgress;
  revealed: Record<string, Element[]>;
  /** Ids of the special items and sets found so far. */
  codex: string[];
  autoJunk: AutoJunk;
  /** Forge random draws used so far; seeds each craft, so reloading cannot reroll it. */
  forgeDraws: number;
}

/** A new game; its first gates come from `rng` (a fixed seed when none is given, so the result is deterministic). */
export function newGame(rng: Rng = mulberry32(0)): GameState {
  return {
    version: SAVE_VERSION, gold: 150, inventory: { potion: 3, 'return-lamp': 1 }, bag: [], nextUid: 1, sold: {}, party: newParty(),
    dungeon: { reached: newReached(), bossDefeated: false, bossKills: {}, portals: rollPortals(rng) }, revealed: {}, codex: [], autoJunk: 'off', forgeDraws: 0,
  };
}
