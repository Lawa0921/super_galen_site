import type { RegionId } from '../data/regions';
import { newParty } from './party';
import type { Element, Party } from './types';

export const SAVE_VERSION = 2;

export interface DungeonProgress {
  /** Deepest depth reached in each region; 1 until a run goes deeper. Runs start at 1 or a multiple of 5 up to this. */
  reached: Record<RegionId, number>;
  bossDefeated: boolean;
}

export const newReached = (): Record<RegionId, number> => ({ mainline: 1, blaze: 1, frost: 1, storm: 1, mire: 1, shade: 1, iron: 1 });

export interface GameState {
  version: typeof SAVE_VERSION;
  gold: number;
  inventory: Record<string, number>;
  sold: Record<string, number>;
  party: Party;
  dungeon: DungeonProgress;
  revealed: Record<string, Element[]>;
}

export function newGame(): GameState {
  return {
    version: SAVE_VERSION, gold: 150, inventory: { potion: 3, 'return-lamp': 1 }, sold: {}, party: newParty(),
    dungeon: { reached: newReached(), bossDefeated: false }, revealed: {},
  };
}
