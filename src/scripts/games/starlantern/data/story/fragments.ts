import type { BuffStat, StatKey } from '../../engine/types';
import type { RegionId } from '../regions';

export type ShardGrade = 'dim' | 'clear' | 'vivid';
export const SHARD_IDS: Record<ShardGrade, string> = { dim: 'shard-dim', clear: 'shard-clear', vivid: 'shard-vivid' };
export const SHARD_NAMES: Record<ShardGrade, string> = { dim: '微光的碎片', clear: '清晰的碎片', vivid: '鮮明的碎片' };
export const SHARD_PRICE: Record<ShardGrade, number> = { dim: 30, clear: 80, vivid: 200 };
/** Drop chance per source; a boss always pays 1. */
export const SHARD_DROP = { boss: 1, elite: 0.5, chest: 0.08, vault: 0.5 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The grade of a shard found at `depth` for a roll in [0, 1). */
export function shardGrade(depth: number, roll: number): ShardGrade {
  const vivid = clamp((depth - 10) / 20, 0, 0.5);
  const clear = clamp((depth - 2) / 10, 0, 0.6);
  if (roll < vivid) return 'vivid';
  if (roll < vivid + clear) return 'clear';
  return 'dim';
}

export const ABSORB_CAP = 20;
const DIM: Record<StatKey, number> = { hp: 6, tp: 2, atk: 1, def: 1, mag: 1, res: 1, spd: 1 };
const times = (n: number): Record<StatKey, number> => ({
  hp: DIM.hp * n, tp: DIM.tp * n, atk: DIM.atk * n, def: DIM.def * n, mag: DIM.mag * n, res: DIM.res * n, spd: DIM.spd * n,
});
export const ABSORB_GAIN: Record<ShardGrade, Record<StatKey, number>> = { dim: times(1), clear: times(2), vivid: times(3) };

export type TownFragmentId = 'orik' | 'marta' | 'anna' | 'glen' | 'doran';
export type TownPerk = 'shop-discount' | 'inn-meal' | 'shard-price' | 'portal-reroll' | 'set-recipe';

export interface TownFragmentDef {
  id: TownFragmentId; item: string; npc: string; regions: RegionId[] | 'any'; minDepth: number;
  reward: { gold?: number; items?: Record<string, number> }; perk: TownPerk; questHook: string;
}

const tf = (d: Omit<TownFragmentDef, 'item'>): TownFragmentDef => ({ ...d, item: `tf-${d.id}` });

/** `npc` is the person's name; fragmentName reads "<npc>的記憶碎片". */
export const TOWN_FRAGMENTS: TownFragmentDef[] = [
  tf({ id: 'orik', npc: '歐里克', regions: ['shade'], minDepth: 4, reward: { gold: 300 }, perk: 'shop-discount', questHook: 'orik-hat' }),
  tf({ id: 'marta', npc: '瑪莎', regions: ['mainline'], minDepth: 5, reward: { items: { phoenix: 2 } }, perk: 'inn-meal', questHook: 'marta-diary' }),
  tf({ id: 'anna', npc: '安娜', regions: 'any', minDepth: 8, reward: { items: { 'star-tear': 1 } }, perk: 'shard-price', questHook: 'anna-name' }),
  tf({ id: 'glen', npc: '葛倫', regions: ['mainline'], minDepth: 15, reward: { gold: 500 }, perk: 'portal-reroll', questHook: 'glen-first' }),
  tf({ id: 'doran', npc: '多蘭', regions: ['iron'], minDepth: 4, reward: { items: { 'king-scale': 1 } }, perk: 'set-recipe', questHook: 'doran-master' }),
];

export const TOWN_DROP = { boss: 0.25, elite: 0.15, chest: 0.03, vault: 0.2 };
export const PERKS = { shopDiscountPct: 10, meal: { stat: 'def' as BuffStat, pct: 5 }, shardPriceMul: 1.25, setRecipeLess: 2 };
export const FRAGMENT_WEIGHT = 0.5;

const SHARD_GRADES = Object.keys(SHARD_IDS) as ShardGrade[];
const townFragmentOf = (id: string): TownFragmentDef | undefined => TOWN_FRAGMENTS.find((f) => f.item === id);

export const isFragmentItem = (id: string): boolean => SHARD_GRADES.some((g) => SHARD_IDS[g] === id) || townFragmentOf(id) !== undefined;

export function fragmentName(id: string): string | undefined {
  const grade = SHARD_GRADES.find((g) => SHARD_IDS[g] === id);
  if (grade) return SHARD_NAMES[grade];
  const f = townFragmentOf(id);
  return f ? `${f.npc}的記憶碎片` : undefined;
}
