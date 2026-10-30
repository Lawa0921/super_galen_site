import type { GameState } from '../engine/state';
import type { MaterialDef } from '../engine/types';
import type { Cost } from './forge';
import type { RegionId } from './regions';

/**
 * Gathering (採集; gathering spec §0, §5-§7): its switch, its stream's salt, the kinds of point, each region's lean, the
 * fourteen gathered materials, the spot rules, the noise, the tools, the second recipes and the pin. Data and pure
 * arithmetic only; the rules live in engine/dungeon/gather.ts (placing) and engine/gather.ts (gathering). The numbers are
 * the spec's starting proposals (【起始提案】).
 */

/**
 * The switch (spec §0 item 13), as GUILD_SWITCH: `live` is GATHER_LIVE, on since the gathering plan's PR D; `open` is the
 * unlock, the prologue's first return seen. Shipped code never changes either; tests go through `withGatherLive` and
 * `withGatherOff` (engine/testing.ts).
 */
export const GATHER_SWITCH: { live: boolean; open: (s: GameState) => boolean } = { live: true, open: (s) => s.story.seen.includes('first-return') };

/** The one predicate: every entry of the engine, the screens and the save that reads or writes gathering asks this. */
export const gatherOpen = (s: GameState): boolean => GATHER_SWITCH.live && GATHER_SWITCH.open(s);

/**
 * Spec §0 item 15: the points' stream, SHA-256's fourth round constant K[3] (K[0] is WARDEN_SALT, K[1] TROPHY_SALT, K[2]
 * GUILD_SALT). Used once, by `floorOf`'s last line.
 */
export const GATHER_SALT = 0xe9b5dba5;

export type GatherType = 'vein' | 'herb' | 'fungus' | 'crystal' | 'spot';
/** The four ordinary kinds of point. */
export type GenericType = Exclude<GatherType, 'spot'>;
/** The ordinary kinds in the spec's order (§5.1): the order the weights are walked in. */
export const GENERIC_TYPES: readonly GenericType[] = ['vein', 'herb', 'fungus', 'crystal'];
/** The regions that have a spot of their own: all but the main road. */
export type SpotRegion = Exclude<RegionId, 'mainline'>;
/** The spot regions in REGIONS' order. */
export const SPOT_REGIONS: readonly SpotRegion[] = ['blaze', 'frost', 'storm', 'mire', 'shade', 'iron'];

/** Spec §5.3: each region's weights for the ordinary kinds (a weight of 0 is never drawn). */
export const REGION_WEIGHTS: Record<RegionId, Record<GenericType, number>> = {
  mainline: { vein: 3, herb: 3, fungus: 2, crystal: 2 },
  blaze: { vein: 5, herb: 1, fungus: 1, crystal: 3 },
  frost: { vein: 2, herb: 2, fungus: 1, crystal: 5 },
  storm: { vein: 4, herb: 2, fungus: 1, crystal: 3 },
  mire: { vein: 1, herb: 4, fungus: 5, crystal: 0 },
  shade: { vein: 1, herb: 2, fungus: 5, crystal: 2 },
  iron: { vein: 6, herb: 1, fungus: 1, crystal: 2 },
};

/** Spec §5.2: a region's point is its spot this often (checked before the weights); never on the main road. */
export const SPOT_CHANCE = 0.35;
/** Spec §0 item 4: a rich point, two more goods and fifteen more noise. */
export const RICH_CHANCE = 0.15;
export const RICH_BONUS = 2;
export const RICH_NOISE = 15;
/** From this depth an ordinary point yields its deep material. */
export const DEEP_AT = 15;
/** Spec §5.2 step 1: one roll below the first cut is one point, below the second two, else three. */
export const COUNT_CUTS: readonly [number, number] = [0.25, 0.75];
/** Spec §5.2 step 2.4: a point's goods, from a roll of 1 or 2 and the depth (capped at 60). */
export const gatherQty = (roll12: number, depth: number): number => roll12 + Math.floor(Math.min(depth, 60) / 20);

/** Spec §5.1: each ordinary kind's name and its shallow and deep material. */
export const GATHER_TABLE: Record<GenericType, { name: string; shallow: string; deep: string }> = {
  vein: { name: '礦脈', shallow: 'copper-ore', deep: 'silver-ore' },
  herb: { name: '藥草叢', shallow: 'stanch-herb', deep: 'moonbell-herb' },
  fungus: { name: '菇叢', shallow: 'cap-mushroom', deep: 'glow-mushroom' },
  crystal: { name: '晶脈', shallow: 'quartz-chip', deep: 'deep-quartz' },
};

/** Spec §5.3: each region's spot material. */
export const SPOT_OF: Record<SpotRegion, string> = {
  blaze: 'ember-glass', frost: 'rime-moss', storm: 'charged-ore', mire: 'bog-resin', shade: 'shade-silk', iron: 'scrap-iron',
};

/** Spec §7.1: the fourteen gathered materials, put last in MATERIALS. Only ever gathered. */
export const GATHER_MATERIALS: MaterialDef[] = [
  { id: 'copper-ore', name: '銅礦石', price: 8, kind: 'gather' },
  { id: 'silver-ore', name: '銀礦石', price: 24, kind: 'gather' },
  { id: 'stanch-herb', name: '止血草', price: 6, kind: 'gather' },
  { id: 'moonbell-herb', name: '月鈴草', price: 18, kind: 'gather' },
  { id: 'cap-mushroom', name: '灰帽菇', price: 6, kind: 'gather' },
  { id: 'glow-mushroom', name: '螢光菇', price: 18, kind: 'gather' },
  { id: 'quartz-chip', name: '石英碎晶', price: 10, kind: 'gather' },
  { id: 'deep-quartz', name: '深藍晶', price: 28, kind: 'gather' },
  { id: 'ember-glass', name: '焰琉璃', price: 24, kind: 'gather' },
  { id: 'rime-moss', name: '霜苔', price: 16, kind: 'gather' },
  { id: 'charged-ore', name: '帶電礦石', price: 22, kind: 'gather' },
  { id: 'bog-resin', name: '黑沼脂', price: 22, kind: 'gather' },
  { id: 'shade-silk', name: '影繭絲', price: 20, kind: 'gather' },
  { id: 'scrap-iron', name: '廢鐵塊', price: 18, kind: 'gather' },
];

/** The kind of point a gathered material comes from; undefined for any other id. */
export function gatherTypeOf(id: string): GatherType | undefined {
  for (const t of GENERIC_TYPES) if (GATHER_TABLE[t].shallow === id || GATHER_TABLE[t].deep === id) return t;
  return SPOT_REGIONS.some((r) => SPOT_OF[r] === id) ? 'spot' : undefined;
}

/** The region whose spot yields `id`; undefined for any other id. */
export function spotRegionOf(id: string): SpotRegion | undefined {
  return SPOT_REGIONS.find((r) => SPOT_OF[r] === id);
}

/** Whether `id` is an ordinary point's deep material. */
export function isDeep(id: string): boolean {
  return GENERIC_TYPES.some((t) => GATHER_TABLE[t].deep === id);
}

export type SpotRule = 'scald' | 'hush' | 'charge' | 'fumes' | 'hidden' | 'clang';
export interface SpotRuleDef {
  rule: SpotRule;
  /** The point's name (spec §5.3). */
  point: string;
  /** The rule's name (spec §5.3). */
  name: string;
  /** The noise is multiplied by this. */
  noiseMul: number;
  /** The goods are multiplied by this, after `qtyAdd`. */
  qtyMul: number;
  /** Added to the goods before `qtyMul`. */
  qtyAdd: number;
  /** Everyone alive loses ⌈trapDamage(hurt, depth) ÷ 2⌉ HP, never below 1. */
  hurt?: 'hurt' | 'poison';
  /** Everyone alive loses ⌊max TP × POISON_TP_LOSS_PCT ÷ 100⌋ TP, never below 0. */
  tp?: true;
  /** Seen only from next to it (spec §5.3: `run.spotted`). */
  hidden?: true;
}
/** Spec §5.3: each region's spot and its rule. Fixed numbers, nothing drawn; they hold whichever way it is gathered. */
export const SPOT_RULES: Record<SpotRegion, SpotRuleDef> = {
  blaze: { rule: 'scald', point: '琉璃結塊', name: '燙手', noiseMul: 1, qtyMul: 1, qtyAdd: 0, hurt: 'hurt' },
  frost: { rule: 'hush', point: '霜苔岩', name: '無聲', noiseMul: 0, qtyMul: 1, qtyAdd: 0 },
  storm: { rule: 'charge', point: '帶電礦脈', name: '帶電', noiseMul: 1, qtyMul: 1, qtyAdd: 1, tp: true },
  mire: { rule: 'fumes', point: '沼脂池', name: '毒氣', noiseMul: 1, qtyMul: 1, qtyAdd: 0, hurt: 'poison' },
  shade: { rule: 'hidden', point: '影繭', name: '藏在暗處', noiseMul: 0.5, qtyMul: 1, qtyAdd: 0, hidden: true },
  iron: { rule: 'clang', point: '廢鐵堆', name: '鏗鏘', noiseMul: 2, qtyMul: 2, qtyAdd: 0 },
};

export type GatherMode = 'light' | 'full';
/** Spec §0 item 2: the noise of a full gather (into the encounter gauge); the second tool lowers it. */
export const GATHER_NOISE = 30;
export const GATHER_NOISE_TOOL2 = 20;
/** A light gather takes ⌈goods × this⌉ and makes this share of the noise. */
export const LIGHT_SHARE = 0.5;

export interface ToolLevel {
  level: 1 | 2;
  name: string;
  cost: Cost;
  /** The tool level held before this one may be made (0: none). */
  needs: 0 | 1;
}
/** Spec §6.3: the gathering tools, made once each at the forge. */
export const TOOL_LEVELS: readonly ToolLevel[] = [
  { level: 1, name: '鐵鎬與鐮刀', cost: { gold: 150, mats: { 'copper-ore': 6, 'quartz-chip': 2 } }, needs: 0 },
  { level: 2, name: '精工採集工具', cost: { gold: 600, mats: { 'silver-ore': 6, 'deep-quartz': 2, 'ember-glass': 2, 'scrap-iron': 2 } }, needs: 1 },
];

/** Spec §7.2: the second recipe of five consumables, from gathered goods (the first, CONSUMABLE_RECIPES, is unchanged). */
export const GATHER_RECIPES: Record<string, Cost> = {
  potion: { gold: 4, mats: { 'stanch-herb': 2 } },
  antidote: { gold: 2, mats: { 'cap-mushroom': 1 } },
  ether: { gold: 8, mats: { 'moonbell-herb': 1, 'quartz-chip': 1 } },
  'return-lamp': { gold: 8, mats: { 'quartz-chip': 2, 'copper-ore': 1 } },
  phoenix: { gold: 20, mats: { 'moonbell-herb': 2, 'glow-mushroom': 1, 'deep-quartz': 1 } },
};

/** Spec §7.3: a spot pins its region's affixes at the forge for this many of it (a region material pins for one). */
export const GATHER_PIN_QTY = 2;

/** Spec §11 item 5: a floor's gathered goods, gathered fully with the first tool, are worth at most this (a guard rail). */
export const GATHER_FLOOR_CAP = (depth: number): number => 600 + 10 * Math.min(depth, 60);

/** The most of one gathered material a save may count (`gather.got`). */
export const GATHER_MAX = 1e9;

/**
 * Plan ruling 9: the gathered materials whose icon is published (PR E fills it). The art list (`allArtUrls`) takes a
 * gathered material's icon only from here, so a material added before its art never asks for a file that is not there.
 */
export const GATHER_ART: ReadonlySet<string> = new Set<string>();
