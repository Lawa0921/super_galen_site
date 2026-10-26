import { BASE_RECIPES, CONSUMABLE_RECIPES, ENHANCE_COST, ESSENCE_OF, FUSE_SLOT_COST, REGION_AFFIX_GROUP, REROLL, SET_RECIPE } from '../../data/forge';
import { EQUIPMENT } from '../../data/equipment';
import { SETS, SPECIALS } from '../../data/gear';
import { MATERIALS } from '../../data/materials';
import { REGIONS, type RegionId } from '../../data/regions';
import type { GearSlot } from '../types';

export type MaterialUse =
  | { kind: 'enhance'; level: number }
  | { kind: 'reroll'; tier: 'magic' | 'rare' | 'epic' | 'legendary' }
  | { kind: 'legendaryReroll' }
  | { kind: 'regionReroll'; region: RegionId }
  | { kind: 'fuseSlot'; target: 'magic' | 'rare' | 'legendary' }
  | { kind: 'consumable'; item: string }
  | { kind: 'base'; slot: GearSlot }
  | { kind: 'set'; set: string }
  | { kind: 'unlock'; base: string }
  /** A roster signature: the forge inscribes that species' key on a piece (roster plan ruling 16; the action is plan C). */
  | { kind: 'inscribe'; species: string }
  /** A roster trophy or keepsake: the forge crafts its owner's own unique (ruling 15; the action is plan C). */
  | { kind: 'craft'; unique: string };

/** The rarities a reroll essence serves (common gear has no affixes; uniques and sets share the legendary essence's reroll). */
const REROLL_TIERS = ['magic', 'rare', 'epic', 'legendary'] as const;
/** The fusion targets: epic is never fused (plan 5g), so FUSE_SLOT_COST has no epic row. */
const FUSE_TARGETS = ['magic', 'rare', 'legendary'] as const;

/**
 * Everything a material is good for, in a fixed order: enhance, reroll, region reroll, fuse, consumables, bases, sets, unlocks,
 * and a roster material's inscription or craft.
 */
export function materialUses(id: string): MaterialUse[] {
  const out: MaterialUse[] = [];
  ENHANCE_COST.forEach((c, i) => { if (c.mats[id]) out.push({ kind: 'enhance', level: i + 1 }); });
  // Common gear has no affixes, so the common essence has no reroll.
  for (const tier of REROLL_TIERS) if (ESSENCE_OF[tier] === id) out.push({ kind: 'reroll', tier });
  if (id === REROLL.legendaryMat) out.push({ kind: 'legendaryReroll' });
  for (const r of Object.values(REGIONS)) if (r.material === id && REGION_AFFIX_GROUP[id]) out.push({ kind: 'regionReroll', region: r.id });
  for (const target of FUSE_TARGETS) if (FUSE_SLOT_COST[target][id]) out.push({ kind: 'fuseSlot', target });
  for (const [item, c] of Object.entries(CONSUMABLE_RECIPES)) if (c.mats[id]) out.push({ kind: 'consumable', item });
  for (const [slot, m] of Object.entries(BASE_RECIPES)) if (m[id]) out.push({ kind: 'base', slot: slot as GearSlot });
  for (const s of Object.values(SETS)) if (REGIONS[s.region].material === id || SET_RECIPE.rare === id) out.push({ kind: 'set', set: s.id });
  for (const e of Object.values(EQUIPMENT)) if (e.unlock?.some((u) => u.mat === id)) out.push({ kind: 'unlock', base: e.id });
  const m = MATERIALS[id];
  if (m?.owner && m.kind === 'monster') out.push({ kind: 'inscribe', species: m.owner });
  if (m?.owner && (m.kind === 'trophy' || m.kind === 'keepsake')) {
    const own = Object.values(SPECIALS).find((s) => s.owner === m.owner);
    if (own) out.push({ kind: 'craft', unique: own.id });
  }
  return out;
}
