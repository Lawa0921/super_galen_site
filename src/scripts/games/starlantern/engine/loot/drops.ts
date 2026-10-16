import { CONDITIONS, type ConditionId } from '../../data/conditions';
import { SETS, SPECIALS, generalLegendaries, regionSpecials, type SpecialDef } from '../../data/gear';
import type { RegionId } from '../../data/regions';
import { depthLevel } from '../levels';
import { pick, type Rng } from '../rng';
import type { ItemInstance } from '../types';
import { itemLevel, rollItem, type DropSource } from './item';

export type Tier = 'common' | 'magic' | 'rare' | 'legendaryTier';

export const GEAR_CHANCE = { monster: 0.08, chest: 0.35 };
export const BOSS_LEGENDARY = { first: 0.2, repeat: 0.1 };
export const RARE_MATERIALS = ['star-tear', 'ancient-gear', 'king-scale'];

export interface DropCtx {
  uid: () => number; depth: number; region: RegionId; condition: ConditionId; source: DropSource; bossRepeat?: boolean;
}

/** Relative weights of the four rarity tiers; `depthLv` is the depth's level (not the depth). */
export function rarityWeights(source: DropSource, depthLv: number, cond: ConditionId, bossRepeat = false): Record<Tier, number> {
  if (source === 'boss') {
    const p = bossRepeat ? BOSS_LEGENDARY.repeat : BOSS_LEGENDARY.first;
    return { common: 0, magic: 0, rare: 1 - p, legendaryTier: p };
  }
  const c = CONDITIONS[cond].rarityMul;
  const w: Record<Tier, number> = {
    common: 70,
    magic: 24 * (1 + depthLv / 40),
    rare: 5.5 * (1 + depthLv / 20) * c,
    legendaryTier: 0.5 * (1 + depthLv / 20) * c,
  };
  if (source === 'chest') { w.rare *= 1.5; w.legendaryTier *= 1.5; }
  if (source === 'elite') { w.common = 0; w.rare *= 3; w.legendaryTier *= 3; }
  if (source === 'vault') { w.common = 0; w.magic = 0; w.legendaryTier *= 3; }
  return w;
}

function rollTier(rng: Rng, w: Record<Tier, number>): Tier {
  const tiers = ['common', 'magic', 'rare', 'legendaryTier'] as const;
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
  const ilvl = itemLevel(ctx.depth, ctx.source);
  if (tier === 'legendaryTier') {
    const sp = pickSpecial(rng, ctx.region, ctx.source);
    return rollItem(rng, { uid: ctx.uid(), ilvl, rarity: sp.rarity, special: sp.id });
  }
  return rollItem(rng, { uid: ctx.uid(), ilvl, rarity: tier });
}

/** A boss drops two pieces: the first on boss odds, the second as an elite would. */
export function rollBossGear(rng: Rng, ctx: DropCtx): ItemInstance[] {
  return [rollGear(rng, { ...ctx, source: 'boss' }), rollGear(rng, { ...ctx, source: 'elite', bossRepeat: false })];
}

export const rollRareMaterial = (rng: Rng): string => pick(rng, RARE_MATERIALS);
