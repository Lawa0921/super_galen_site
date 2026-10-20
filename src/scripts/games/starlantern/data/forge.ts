import type { AnyStat, GearSlot, Rarity } from '../engine/types';

export interface Cost { gold: number; mats: Record<string, number> }

export const ESSENCE_IDS = ['essence-common', 'essence-magic', 'essence-rare', 'essence-legendary'];
export const ESSENCE_OF: Record<Rarity, string> = {
  common: 'essence-common', magic: 'essence-magic', rare: 'essence-rare', epic: 'essence-rare',
  legendary: 'essence-legendary', unique: 'essence-legendary', set: 'essence-legendary',
};

/** What dismantling a piece of gear yields. */
export const DISMANTLE: Record<Rarity, Record<string, number>> = {
  common: { 'essence-common': 1 },
  magic: { 'essence-magic': 1, 'essence-common': 1 },
  rare: { 'essence-rare': 1, 'essence-magic': 1 },
  epic: { 'essence-rare': 2 },
  legendary: { 'essence-legendary': 1, 'essence-rare': 1 },
  unique: { 'essence-legendary': 1, 'essence-rare': 1 },
  set: { 'essence-legendary': 1, 'essence-rare': 1 },
};

export const ENHANCE_MAX = 10;
export const ENHANCE_STEP = 0.08;
/** Index t - 1 is the cost of reaching +t. */
export const ENHANCE_COST: Cost[] = [
  { gold: 20, mats: { 'essence-common': 2 } },
  { gold: 40, mats: { 'essence-common': 3 } },
  { gold: 60, mats: { 'essence-common': 4 } },
  { gold: 100, mats: { 'essence-magic': 2 } },
  { gold: 140, mats: { 'essence-magic': 3 } },
  { gold: 200, mats: { 'essence-magic': 4 } },
  { gold: 280, mats: { 'essence-rare': 2 } },
  { gold: 380, mats: { 'essence-rare': 3, 'ancient-gear': 1 } },
  { gold: 500, mats: { 'essence-legendary': 1, 'essence-rare': 2, 'ancient-gear': 1 } },
  { gold: 700, mats: { 'essence-legendary': 2, 'king-scale': 1 } },
];
export const ENHANCE_SUCCESS: number[] = [1, 1, 1, 1, 1, 0.8, 0.7, 0.6, 0.5, 0.4];
/** The enhance level a party is expected to have reached at a depth. */
export const expectedEnhance = (depth: number): number => Math.min(ENHANCE_MAX, Math.floor(depth / 2));

export const REROLL = {
  gold: (ilvl: number) => 20 + 2 * ilvl,
  essence: { value: 1, swap: 2 },
  regionQty: 1,
  legendaryMat: 'star-tear',
  legendaryQty: 1,
};

/** The affixes a region material pins when rerolling. */
export const REGION_AFFIX_GROUP: Record<string, AnyStat[]> = {
  'blaze-core': ['fireDmg', 'fireRes', 'atk', 'str'],
  'frost-heart': ['iceDmg', 'iceRes', 'mag', 'int'],
  'storm-stone': ['thunderDmg', 'thunderRes', 'spd', 'agi'],
  'mire-gland': ['poisonRes', 'sleepRes', 'hp', 'heal', 'wil'],
  'shade-crystal': ['crit', 'critDmg', 'vuln', 'multi', 'evasion'],
  'iron-shard': ['armor', 'def', 'block', 'meleeDR', 'rangedDR', 'res'],
};

export const FUSE_NEXT = { common: 'magic', magic: 'rare', rare: 'legendary' } as const;
export const FUSE_GOLD: Record<'magic' | 'rare' | 'legendary', number> = { magic: 30, rare: 80, legendary: 200 };
/** Paid on top when the fused piece's slot is chosen. */
export const FUSE_SLOT_COST: Record<'magic' | 'rare' | 'legendary', Record<string, number>> = {
  magic: { 'essence-common': 2 },
  rare: { 'essence-magic': 2 },
  legendary: { 'king-scale': 1 },
};

export const CONSUMABLE_RECIPES: Record<string, Cost> = {
  potion: { gold: 6, mats: { moss: 2 } },
  antidote: { gold: 3, mats: { moss: 1 } },
  ether: { gold: 10, mats: { 'bat-wing': 2, 'crystal-shell': 1 } },
  'return-lamp': { gold: 10, mats: { 'star-stone': 1, 'thorn-fang': 1 } },
  phoenix: { gold: 25, mats: { 'dusk-cloth': 1, 'ice-crystal': 2, 'lizard-scale': 1 } },
};

export const BASE_RECIPES: Record<GearSlot, Record<string, number>> = {
  weapon: { 'thorn-fang': 3, 'star-stone': 1 },
  offhand: { 'crystal-shell': 3 },
  head: { 'lizard-scale': 2, 'bat-wing': 1 },
  body: { 'dusk-cloth': 2, 'lizard-scale': 1 },
  hands: { 'thorn-fang': 2, moss: 2 },
  feet: { 'bat-wing': 3 },
  neck: { 'ice-crystal': 2, moss: 1 },
  ring: { 'star-stone': 2 },
};
/** Rises faster than a magic piece's sell price (4 G per item level), so no crafted base outsells its recipe at any item level. */
export const baseGold = (ilvl: number): number => 20 + 4 * ilvl;
export const CRAFT_MAGIC_CHANCE = 0.25;

export const SET_RECIPE = { regionQty: 8, rare: 'star-tear', rareQty: 1 };
/** A set piece's gold at item level `ilvl`: rises with a set piece's sell price (16 G per item level), so no crafted piece outsells its recipe. About 300 G in the first floors. */
export const setGold = (ilvl: number): number => 200 + 16 * ilvl;
