import type { RegionId } from '../data/regions';
import type { Portal } from './dungeon/run';
import type { AutoJunk } from './loot/bag';
import { newParty, START_LINEUP } from './party';
import { rollPortals } from './portals';
import { mulberry32, type Rng } from './rng';
import type { CharacterId, Element, ItemInstance, Party } from './types';

export const SAVE_VERSION = 7;

/** What a new game carries. */
export const START_ITEMS: Record<string, number> = { potion: 5, 'return-lamp': 1 };

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
  /**
   * Set once when the game starts and never changed: with forgeDraws it is the whole forge seed. Nothing else the player
   * can change (nextUid, gold, the bag) feeds the seed, so a reload after a failed save cannot steer a roll.
   */
  forgeSalt: number;
}

/**
 * A new game; its first gates come from `rng` (a fixed seed when none is given, so the result is deterministic).
 * `forgeSalt` is taken as given rather than drawn, so the rng sequence stays as it was.
 */
export function newGame(rng: Rng = mulberry32(0), forgeSalt = 0, start: CharacterId[] = START_LINEUP): GameState {
  return {
    version: SAVE_VERSION, gold: 150, inventory: { ...START_ITEMS }, bag: [], nextUid: 1, sold: {}, party: newParty(start),
    dungeon: { reached: newReached(), bossDefeated: false, bossKills: {}, portals: rollPortals(rng) }, revealed: {}, codex: [], autoJunk: 'off', forgeDraws: 0,
    forgeSalt,
  };
}
