import { AFFIXES, ROLL_FLOOR, affixRange } from '../../data/gear';
import { ENHANCE_COST, ENHANCE_MAX, ENHANCE_SUCCESS, ESSENCE_OF, REGION_AFFIX_GROUP, REROLL, type Cost } from '../../data/forge';
import { itemSlot } from '../loot/item';
import { mix } from '../loot/drops';
import { mulberry32, type Rng } from '../rng';
import type { GameState } from '../state';
import type { AnyStat, CharacterId, ItemInstance, Slot } from '../types';

/** Why a forge action was refused. `phase` is only ever returned by `Game`, never by the engine; `affixLocked` is not `T.reasons.locked`, which means "not unlocked yet" in the shop. */
export type ForgeFail = 'invalid' | 'stock' | 'gold' | 'mats' | 'max' | 'full' | 'affixLocked' | 'none' | 'phase';
export type ForgeResult<O> = { ok: true; state: GameState; out: O } | { ok: false; reason: ForgeFail };

/** What is missing for `c`, gold first; null when the state can pay. */
export function canPay(s: GameState, c: Cost): 'gold' | 'mats' | null {
  if (s.gold < c.gold) return 'gold';
  for (const [id, n] of Object.entries(c.mats)) if ((s.inventory[id] ?? 0) < n) return 'mats';
  return null;
}

/** Takes gold and materials (mutates `s`; call it on a copy after `canPay`). Never touches `sold`. */
export function pay(s: GameState, c: Cost): void {
  s.gold -= c.gold;
  for (const [id, n] of Object.entries(c.mats)) {
    const left = (s.inventory[id] ?? 0) - n;
    if (left > 0) s.inventory[id] = left;
    else delete s.inventory[id];
  }
}

export function addCost(a: Cost, b: Cost): Cost {
  const mats = { ...a.mats };
  for (const [id, n] of Object.entries(b.mats)) mats[id] = (mats[id] ?? 0) + n;
  return { gold: a.gold + b.gold, mats };
}

/** The item with `uid`: the bag first, then what recruited members wear. */
export function findItem(s: GameState, uid: number): { it: ItemInstance; member?: CharacterId; slot?: Slot } | null {
  const inBag = (s.bag ?? []).find((it) => it.uid === uid);
  if (inBag) return { it: inBag };
  for (const member of s.party?.recruited ?? []) {
    const equip = s.party.roster?.[member]?.equip ?? {};
    for (const slot of Object.keys(equip) as Slot[]) {
      const it = equip[slot];
      if (it && it.uid === uid) return { it, member, slot };
    }
  }
  return null;
}

export const FORGE_SALT = 0x2f6b1d3a;

/** A rng for the forge's random picks. Each call draws once and moves `s.forgeDraws` on (mutates `s`; build it on a copy); creating it draws nothing. */
export function forgeRng(s: GameState): Rng {
  return () => mulberry32(mix(s.forgeDraws++ ^ FORGE_SALT, s.nextUid))();
}

/** What reaching the next enhance level costs; null at the maximum. */
export function enhanceCost(it: ItemInstance): Cost | null {
  return it.enhance >= 0 && it.enhance < ENHANCE_MAX ? (ENHANCE_COST[it.enhance] ?? null) : null;
}

/** The chance the next enhance attempt succeeds (0 at the maximum). */
export function enhanceChance(it: ItemInstance): number {
  return it.enhance >= 0 && it.enhance < ENHANCE_MAX ? (ENHANCE_SUCCESS[it.enhance] ?? 0) : 0;
}

export type RerollOpts = { swap: boolean; mat?: string };

/** What one reroll costs: an essence of the item's rarity, gold (double to swap), the region material if any, a star tear for legendary. */
export function rerollCost(it: ItemInstance, o: RerollOpts): Cost {
  const mats: Record<string, number> = { [ESSENCE_OF[it.rarity]]: o.swap ? REROLL.essence.swap : REROLL.essence.value };
  const gold = REROLL.gold(it.ilvl) * (o.swap ? 2 : 1);
  let c: Cost = { gold, mats };
  if (o.mat) c = addCost(c, { gold: 0, mats: { [o.mat]: REROLL.regionQty } });
  if (it.rarity === 'legendary') c = addCost(c, { gold: 0, mats: { [REROLL.legendaryMat]: REROLL.legendaryQty } });
  return c;
}

/** The value range a reroll of affix `index` can land in (the same rounding as `rollValue`). */
export function rerollRange(it: ItemInstance, index: number): [number, number] {
  const [lo, hi] = affixRange(it.affixes[index].key, it.ilvl);
  const floor = ROLL_FLOOR[it.rarity];
  return [Math.max(1, Math.round(lo + (hi - lo) * floor)), Math.max(1, Math.round(hi))];
}

/** The keys a swap can choose: legal for the item's slot, not already on the item, and in the material's group when one is given. */
export function swapPool(it: ItemInstance, _index: number, mat?: string): AnyStat[] {
  const slot = itemSlot(it);
  const have = new Set(it.affixes.map((a) => a.key));
  const group = mat === undefined ? null : (REGION_AFFIX_GROUP[mat] ?? []);
  return (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot) && !have.has(k) && (!group || group.includes(k)));
}
