import { CONDITIONS, type ConditionId } from '../../data/conditions';
import { SETS, SPECIALS, STARLIT_RARITIES, generalLegendaries, regionSpecials, type SpecialDef } from '../../data/gear';
import type { RegionId } from '../../data/regions';
import { depthLevel } from '../levels';
import type { Run } from '../dungeon/run';
import { mulberry32, pick, type Rng } from '../rng';
import type { ItemInstance, Pos } from '../types';
import { itemLevel, rollItem, starlitItem, type DropSource } from './item';

export type Tier = 'common' | 'magic' | 'rare' | 'epic' | 'legendaryTier';

export const GEAR_CHANCE = { monster: 0.08, chest: 0.35 };
export const BOSS_LEGENDARY = { first: 0.2, repeat: 0.1 };
/**
 * Plan 5g: the share of the rare weight that rolls epic instead; tuned against balance band 10 (only `monster` reaches the sim).
 * Carved from the end of the rare band in the same rollTier draw, so no other tier's odds move.
 */
export const EPIC_SHARE: Record<DropSource, number> = { monster: 0.15, chest: 0.15, elite: 0.3, vault: 0.3, boss: 0.3 };
export const RARE_MATERIALS = ['star-tear', 'ancient-gear', 'king-scale'];

export interface DropCtx {
  uid: () => number; depth: number; region: RegionId; condition: ConditionId; source: DropSource; bossRepeat?: boolean;
  /** Item level to roll at instead of the source's own (a boss's second piece keeps the boss level). */
  ilvl?: number;
  /** The run seed: keys the starlit stream (plan 5g). Without it nothing is ever starlit. */
  seed?: number;
}

/** Plan 5g: the salt of the starlit stream (an unused SHA-256 initial value; see the other salts in this engine). */
export const STARLIT_SALT = 0xa54ff53a;
/**
 * Plan 5g: the chance that a legendary-tier drop is starlit, by source row; a test may overwrite it for a moment.
 * Not a balance knob: the sim swaps the legendary tier for rare and never calls rollGear.
 */
export const STARLIT_CHANCE: Record<'drop' | 'elite' | 'boss', { base: number; perDepth: number; cap: number }> = {
  drop: { base: 0.03, perDepth: 0.002, cap: 0.08 },
  elite: { base: 0.05, perDepth: 0.003, cap: 0.12 },
  boss: { base: 0.08, perDepth: 0.004, cap: 0.16 },
};
const STARLIT_ROW: Record<DropSource, keyof typeof STARLIT_CHANCE> = { monster: 'drop', chest: 'drop', elite: 'elite', vault: 'elite', boss: 'boss' };

/** The chance, among legendary-tier drops from `source` on `depth`, that the piece is starlit. */
export function starlitChance(source: DropSource, depth: number): number {
  const c = STARLIT_CHANCE[STARLIT_ROW[source]];
  return Math.min(c.cap, c.base + c.perDepth * (Math.max(1, depth) - 1));
}

/**
 * Plan 5g: a legendary, unique or set drop becomes starlit on its own stream, keyed by the run seed and the item's uid
 * (like chestHasGear), so no other rng is drawn. The stream's first number decides; the rest pick the extra affix.
 */
export function applyStarlit(it: ItemInstance, ctx: Pick<DropCtx, 'seed' | 'source' | 'depth'>): ItemInstance {
  if (ctx.seed === undefined || !STARLIT_RARITIES.includes(it.rarity)) return it;
  const r = mulberry32(mix(ctx.seed ^ STARLIT_SALT, it.uid));
  return r() < starlitChance(ctx.source, ctx.depth) ? starlitItem(it, r) : it;
}

/** Relative weights of the five rarity tiers; `depthLv` is the depth's level (not the depth). Epic is cut from rare last. */
export function rarityWeights(source: DropSource, depthLv: number, cond: ConditionId, bossRepeat = false): Record<Tier, number> {
  const carveEpic = (w: Record<Tier, number>): Record<Tier, number> => {
    w.epic = w.rare * EPIC_SHARE[source];
    w.rare -= w.epic;
    return w;
  };
  if (source === 'boss') {
    const p = bossRepeat ? BOSS_LEGENDARY.repeat : BOSS_LEGENDARY.first;
    return carveEpic({ common: 0, magic: 0, rare: 1 - p, epic: 0, legendaryTier: p });
  }
  const c = CONDITIONS[cond].rarityMul;
  const w: Record<Tier, number> = {
    common: 70,
    magic: 24 * (1 + depthLv / 40),
    rare: 5.5 * (1 + depthLv / 20) * c,
    epic: 0,
    legendaryTier: 0.5 * (1 + depthLv / 20) * c,
  };
  if (source === 'chest') { w.rare *= 1.5; w.legendaryTier *= 1.5; }
  if (source === 'elite') { w.common = 0; w.rare *= 3; w.legendaryTier *= 3; }
  if (source === 'vault') { w.common = 0; w.magic = 0; w.legendaryTier *= 3; }
  return carveEpic(w);
}

export function rollTier(rng: Rng, w: Record<Tier, number>): Tier {
  const tiers = ['common', 'magic', 'rare', 'epic', 'legendaryTier'] as const;
  const total = tiers.reduce((s, t) => s + w[t], 0);
  let r = rng() * total;
  for (const t of tiers) {
    if (r < w[t]) return t;
    r -= w[t];
  }
  return [...tiers].reverse().find((t) => w[t] > 0) ?? 'common';
}

const canDrop = (s: SpecialDef, source: DropSource): boolean =>
  s.source === 'any' || (s.source === 'elite' && (source === 'elite' || source === 'boss')) || (s.source === 'boss' && source === 'boss');

/** Which special item a legendary-tier roll becomes. */
function pickSpecial(rng: Rng, region: RegionId, source: DropSource): SpecialDef {
  const general = () => pick(rng, generalLegendaries());
  if (region === 'mainline') return general();
  const r = rng();
  let cand: SpecialDef | undefined;
  if (r < 0.5) {
    cand = rng() < 0.4 ? pick(rng, regionSpecials(region).filter((s) => s.rarity === 'legendary')) : general();
  } else if (r < 0.75) {
    cand = pick(rng, regionSpecials(region).filter((s) => s.rarity === 'unique'));
  } else {
    const set = Object.values(SETS).find((s) => s.region === region);
    cand = set ? SPECIALS[pick(rng, set.pieces)] : undefined;
  }
  return cand && canDrop(cand, source) ? cand : general();
}

export function rollGear(rng: Rng, ctx: DropCtx): ItemInstance {
  const tier = rollTier(rng, rarityWeights(ctx.source, depthLevel(ctx.depth), ctx.condition, ctx.bossRepeat));
  const ilvl = ctx.ilvl ?? itemLevel(ctx.depth, ctx.source);
  if (tier === 'legendaryTier') {
    const sp = pickSpecial(rng, ctx.region, ctx.source);
    return applyStarlit(rollItem(rng, { uid: ctx.uid(), ilvl, rarity: sp.rarity, special: sp.id }), ctx);
  }
  return rollItem(rng, { uid: ctx.uid(), ilvl, rarity: tier });
}

/** A boss drops two pieces: the first on boss odds, the second on elite odds; both at the boss item level. */
export function rollBossGear(rng: Rng, ctx: DropCtx): ItemInstance[] {
  const ilvl = itemLevel(ctx.depth, 'boss');
  return [rollGear(rng, { ...ctx, source: 'boss', ilvl }), rollGear(rng, { ...ctx, source: 'elite', bossRepeat: false, ilvl })];
}

export const rollRareMaterial = (rng: Rng): string => pick(rng, RARE_MATERIALS);

/** A fixed 32-bit mix of two numbers. */
export function mix(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x632be5ab) | 0, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** A fresh rng for one loot draw of this run; every gear-related roll in the labyrinth comes from here, never from `game.rng`. */
export function lootRng(run: Run): Rng {
  return mulberry32(mix(run.seed, run.lootDraws++));
}

/** Whether the chest at `at` on `depth` holds gear: fixed by the run seed, the depth and the spot; changes nothing. */
export function chestHasGear(run: Run, depth: number, at: Pos): boolean {
  return mix(mix(mix(run.seed ^ 0x3c6ef372, depth), at.x), at.y) / 2 ** 32 < GEAR_CHANCE.chest;
}
