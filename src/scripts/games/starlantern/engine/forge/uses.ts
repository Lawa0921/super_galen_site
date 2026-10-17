import { BASE_RECIPES, CONSUMABLE_RECIPES, ENHANCE_COST, ESSENCE_OF, FUSE_SLOT_COST, REGION_AFFIX_GROUP, REROLL, SET_RECIPE } from '../../data/forge';
import { EQUIPMENT } from '../../data/equipment';
import { SETS } from '../../data/gear';
import { REGIONS, type RegionId } from '../../data/regions';
import type { GearSlot } from '../types';

export type MaterialUse =
  | { kind: 'enhance'; level: number }
  | { kind: 'reroll'; tier: 'magic' | 'rare' | 'legendary' }
  | { kind: 'legendaryReroll' }
  | { kind: 'regionReroll'; region: RegionId }
  | { kind: 'fuseSlot'; target: 'magic' | 'rare' | 'legendary' }
  | { kind: 'consumable'; item: string }
  | { kind: 'base'; slot: GearSlot }
  | { kind: 'set'; set: string }
  | { kind: 'unlock'; base: string };

const TIERS = ['magic', 'rare', 'legendary'] as const;

/** Everything a material is good for, in a fixed order: enhance, reroll, region reroll, fuse, consumables, bases, sets, unlocks. */
export function materialUses(id: string): MaterialUse[] {
  const out: MaterialUse[] = [];
  ENHANCE_COST.forEach((c, i) => { if (c.mats[id]) out.push({ kind: 'enhance', level: i + 1 }); });
  // Common gear has no affixes, so the common essence has no reroll.
  for (const tier of TIERS) if (ESSENCE_OF[tier] === id) out.push({ kind: 'reroll', tier });
  if (id === REROLL.legendaryMat) out.push({ kind: 'legendaryReroll' });
  for (const r of Object.values(REGIONS)) if (r.material === id && REGION_AFFIX_GROUP[id]) out.push({ kind: 'regionReroll', region: r.id });
  for (const target of TIERS) if (FUSE_SLOT_COST[target][id]) out.push({ kind: 'fuseSlot', target });
  for (const [item, c] of Object.entries(CONSUMABLE_RECIPES)) if (c.mats[id]) out.push({ kind: 'consumable', item });
  for (const [slot, m] of Object.entries(BASE_RECIPES)) if (m[id]) out.push({ kind: 'base', slot: slot as GearSlot });
  for (const s of Object.values(SETS)) if (REGIONS[s.region].material === id || SET_RECIPE.rare === id) out.push({ kind: 'set', set: s.id });
  for (const e of Object.values(EQUIPMENT)) if (e.unlock?.some((u) => u.mat === id)) out.push({ kind: 'unlock', base: e.id });
  return out;
}
