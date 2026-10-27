import { CONDITIONS, type ConditionId } from '../../data/conditions';
import { AFFIXES, SETS, SPECIALS, STARLIT_RARITIES, generalLegendaries, regionSpecials, type SpecialDef } from '../../data/gear';
import { ENEMIES } from '../../data/enemies';
import { OWN_UNIQUE_SHARE } from '../../data/forge';
import { ROSTER_LIVE } from '../../data/monsters';
import type { RegionId } from '../../data/regions';
import { depthLevel } from '../levels';
import type { Run } from '../dungeon/run';
import { mulberry32, pick, type Rng } from '../rng';
import type { ItemInstance, Pos } from '../types';
import { itemLevel, itemSlot, rollItem, rollValue, starlitItem, tierItemLevel, type DropSource } from './item';
import { tierOf, type TierDef } from '../../data/difficulty';
import type { Difficulty } from '../battle';

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
  /** The difficulty the drop is paid at (difficulty plan Task 4): read through `tierOf`, so Normal and none roll as before. */
  difficulty?: Difficulty;
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

/**
 * The chance, among legendary-tier drops from `source` on `depth`, that the piece is starlit; on a higher `tier` the
 * chance and its cap both times `starlitMul` (ruling 11).
 */
export function starlitChance(source: DropSource, depth: number, tier?: TierDef): number {
  const c = STARLIT_CHANCE[STARLIT_ROW[source]];
  if (tier) return Math.min(c.cap * tier.starlitMul, (c.base + c.perDepth * (Math.max(1, depth) - 1)) * tier.starlitMul);
  return Math.min(c.cap, c.base + c.perDepth * (Math.max(1, depth) - 1));
}

/**
 * Plan 5g: a legendary, unique or set drop becomes starlit on its own stream, keyed by the run seed and the item's uid
 * (like chestHasGear), so no other rng is drawn. The stream's first number decides; the rest pick the extra affix.
 */
export function applyStarlit(it: ItemInstance, ctx: Pick<DropCtx, 'seed' | 'source' | 'depth' | 'difficulty'>): ItemInstance {
  if (ctx.seed === undefined || !STARLIT_RARITIES.includes(it.rarity)) return it;
  const r = mulberry32(mix(ctx.seed ^ STARLIT_SALT, it.uid));
  const t = tierOf(ctx.difficulty);
  return r() < (t ? starlitChance(ctx.source, ctx.depth, t) : starlitChance(ctx.source, ctx.depth)) ? starlitItem(it, r) : it;
}

/**
 * Relative weights of the five rarity tiers; `depthLv` is the depth's level (not the depth). Epic is cut from rare last.
 * With a higher `tier` (difficulty plan ruling 10), after that: rare and epic times `rarityMul`, and the legendary weight
 * set so its share of the whole is the Normal share times `legendaryShareMul` (at most `legendaryCap`), from every
 * source alike; without one, the weights as before.
 */
export function rarityWeights(source: DropSource, depthLv: number, cond: ConditionId, bossRepeat = false, tier?: TierDef): Record<Tier, number> {
  return tier ? tierWeights(normalWeights(source, depthLv, cond, bossRepeat), tier) : normalWeights(source, depthLv, cond, bossRepeat);
}

/** The highest legendary share any tier may set, whatever its `legendaryCap`. */
const MAX_LEGENDARY_SHARE = 0.99;

/** Ruling 10 on Normal weights `w`: p' = min(cap, p x mul); rare and epic x rarityMul; legendary = p' x rest / (1 - p'). */
function tierWeights(w: Record<Tier, number>, tier: TierDef): Record<Tier, number> {
  const total = w.common + w.magic + w.rare + w.epic + w.legendaryTier;
  const p = total > 0 ? w.legendaryTier / total : 0;
  // Under 1 whatever the row says (T4-T5 review): a share of 1 would divide by zero below.
  const share = Math.min(tier.legendaryCap, MAX_LEGENDARY_SHARE, p * tier.legendaryShareMul);
  const out = { ...w, rare: w.rare * tier.rarityMul, epic: w.epic * tier.rarityMul };
  const rest = out.common + out.magic + out.rare + out.epic;
  out.legendaryTier = (share * rest) / (1 - share);
  return out;
}

/** The Normal weights (the function as it was before the tiers). */
function normalWeights(source: DropSource, depthLv: number, cond: ConditionId, bossRepeat: boolean): Record<Tier, number> {
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

/** Which special item a legendary-tier roll becomes (exported for the roster's pool tests). */
export function pickSpecial(rng: Rng, region: RegionId, source: DropSource): SpecialDef {
  // A roster unique (`owner`) is never a candidate (roster plan ruling 14); the lists hold none today, so no draw moves.
  const pool = (list: SpecialDef[]) => list.filter((s) => !s.owner);
  const general = () => pick(rng, pool(generalLegendaries()));
  if (region === 'mainline') return general();
  const r = rng();
  let cand: SpecialDef | undefined;
  if (r < 0.5) {
    cand = rng() < 0.4 ? pick(rng, pool(regionSpecials(region)).filter((s) => s.rarity === 'legendary')) : general();
  } else if (r < 0.75) {
    cand = pick(rng, pool(regionSpecials(region)).filter((s) => s.rarity === 'unique'));
  } else {
    const set = Object.values(SETS).find((s) => s.region === region);
    cand = set ? SPECIALS[pick(rng, set.pieces)] : undefined;
  }
  return cand && canDrop(cand, source) ? cand : general();
}

export function rollGear(rng: Rng, ctx: DropCtx): ItemInstance {
  const t = tierOf(ctx.difficulty);
  const tier = rollTier(rng, t ? rarityWeights(ctx.source, depthLevel(ctx.depth), ctx.condition, ctx.bossRepeat, t) : rarityWeights(ctx.source, depthLevel(ctx.depth), ctx.condition, ctx.bossRepeat));
  // A higher tier's item level only where the source's own is taken (ruling 11): a given `ilvl` is kept.
  const ilvl = ctx.ilvl ?? (t ? tierItemLevel(ctx.depth, ctx.source, t) : itemLevel(ctx.depth, ctx.source));
  if (tier === 'legendaryTier') {
    const sp = pickSpecial(rng, ctx.region, ctx.source);
    return applyStarlit(rollItem(rng, { uid: ctx.uid(), ilvl, rarity: sp.rarity, special: sp.id }), ctx);
  }
  return rollItem(rng, { uid: ctx.uid(), ilvl, rarity: tier });
}

/** A boss drops two pieces: the first on boss odds, the second on elite odds; both at the boss item level (a tier's, once). */
export function rollBossGear(rng: Rng, ctx: DropCtx): ItemInstance[] {
  const t = tierOf(ctx.difficulty);
  const ilvl = t ? tierItemLevel(ctx.depth, 'boss', t) : itemLevel(ctx.depth, 'boss');
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

/**
 * Roster plan Task C1 (spec §7.5): the salt of the trophy stream, SHA-256's second round constant (all eight initial words
 * and the first round constant, WARDEN_SALT, are in use).
 */
export const TROPHY_SALT = 0x71374491;

/**
 * A fresh rng for one trophy draw of this run (spec §7.5): a roster species' inscription, or a roster boss's or warden's
 * own unique. Drawn only after the loot stream is done with the piece, so no `lootRng` draw ever moves.
 */
export function trophyRng(run: Run): Rng {
  return mulberry32(mix(run.seed ^ TROPHY_SALT, run.trophyDraws++));
}

/**
 * Roster plan ruling 16 (spec §7.2): the piece with one affix turned into `species`' inscription key, its value rolled in
 * the same range a drop of that rarity and item level rolls (`rng`, the trophy draw the chance came from). The count and
 * the ranges never change: a piece with no affix, a slot that cannot take the key, or one that already carries it keeps
 * its affixes and only takes the mark.
 */
export function inscribe(it: ItemInstance, species: string, rng: Rng): ItemInstance {
  const key = ENEMIES[species]?.inscribe;
  if (!key) throw new Error(`no inscription: ${species}`);
  const out: ItemInstance = { ...it, affixes: it.affixes.map((a) => ({ ...a })), inscription: species };
  if (!out.affixes.length || !AFFIXES[key].slots.includes(itemSlot(it)) || out.affixes.some((a) => a.key === key)) return out;
  const i = Math.floor(rng() * out.affixes.length);
  out.affixes[i] = { key, value: rollValue(rng, key, it.ilvl, it.rarity) };
  return out;
}

/**
 * Roster plan ruling 14 (spec §7.3, §11.1): the own unique of a roster boss or warden gone live; none for a foe that is
 * not live, or that has none.
 */
export function ownUniqueOf(enemyId: string): SpecialDef | undefined {
  if (!ROSTER_LIVE.has(enemyId)) return undefined;
  return Object.values(SPECIALS).find((s) => s.owner === enemyId);
}

/**
 * Roster plan Task C2 (spec §7.3, ruling 15): a live owner's fight, once the loot stream is done with its gear. Each
 * legendary-tier piece (a special) in turn takes one trophy draw (`trophy` hands out a fresh one) and, under
 * OWN_UNIQUE_SHARE, becomes `own`: rolled on that same draw, its uid and item level kept, then starlit or not as any drop
 * of its source (`sources[i]`, keyed by the uid). At most one piece of a fight is swapped, so a special never becomes
 * more likely: only which special it is changes.
 */
export function ownUniqueSwap(
  gear: ItemInstance[], sources: DropSource[], own: SpecialDef, trophy: () => Rng, ctx: Pick<DropCtx, 'seed' | 'depth' | 'difficulty'>,
): ItemInstance[] {
  const out = [...gear];
  for (let i = 0; i < out.length; i++) {
    const it = out[i];
    if (!it.special) continue;
    const t = trophy();
    if (t() >= OWN_UNIQUE_SHARE) continue;
    out[i] = applyStarlit(rollItem(t, { uid: it.uid, ilvl: it.ilvl, rarity: own.rarity, special: own.id }), { ...ctx, source: sources[i] ?? 'boss' });
    break;
  }
  return out;
}
