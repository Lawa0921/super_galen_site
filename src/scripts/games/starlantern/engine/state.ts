import { newParty } from './party';
import type { Element, Party } from './types';

export const SAVE_VERSION = 2;

export interface DungeonProgress {
  reachedFloor: number;
  explored: Record<string, string[]>;
  opened: string[];
  bossDefeated: boolean;
}

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
    dungeon: { reachedFloor: 1, explored: {}, opened: [], bossDefeated: false }, revealed: {},
  };
}
