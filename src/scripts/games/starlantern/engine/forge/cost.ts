import { AFFIXES, GEAR_SLOTS, ROLL_FLOOR, affixRange, generalLegendaries } from '../../data/gear';
import { ENHANCE_COST, ENHANCE_MAX, ENHANCE_SUCCESS, ESSENCE_OF, FUSE_GOLD, FUSE_SLOT_COST, INSCRIBE_QTY, REGION_AFFIX_GROUP, REROLL, type Cost } from '../../data/forge';
import { ENEMIES } from '../../data/enemies';
import { MATERIALS } from '../../data/materials';
import { GATHER_PIN_QTY, spotRegionOf } from '../../data/gather';
import { REGIONS } from '../../data/regions';
import { itemSlot, maxValue } from '../loot/item';
import { mix } from '../loot/drops';
import { mulberry32, type Rng } from '../rng';
import type { GameState } from '../state';
import type { AnyStat, CharacterId, GearSlot, ItemInstance, Slot } from '../types';

/**
 * Why a forge action was refused. `phase` is only ever returned by `Game`, never by the engine; `affixLocked` is not
 * `T.reasons.locked`, which means "not unlocked yet" in the shop; `unbeaten`, an own unique whose owner was never felled
 * (roster plan Task C4); `locked`, the forge's gathering work while gathering is shut (gathering plan Task A4; only ever
 * returned by `Game`, and it is `T.reasons.locked`, not yet unlocked).
 */
export type ForgeFail = 'invalid' | 'stock' | 'gold' | 'mats' | 'max' | 'full' | 'affixLocked' | 'none' | 'phase' | 'unbeaten' | 'locked';
export type ForgeResult<O> = { ok: true; state: GameState; out: O } | { ok: false; reason: ForgeFail };

/** What is missing for `c`, gold first; null when the state can pay. */
export function canPay(s: GameState, c: Cost): 'gold' | 'mats' | null {
  if (s.gold < c.gold) return 'gold';
  for (const [id, n] of Object.entries(c.mats)) if ((s.inventory[id] ?? 0) < n) return 'mats';
  return null;
}

/** Takes gold and materials (mutates `s`; call it on a copy after `canPay`). Never touches `sold`. A cost the state
 * cannot meet is a caller bug: it throws and leaves `s` as it was, rather than going into debt. */
export function pay(s: GameState, c: Cost): void {
  const lacking = canPay(s, c);
  if (lacking) throw new Error(`pay: not enough ${lacking}`);
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

/**
 * A rng for the forge's random picks. Each call draws once and moves `s.forgeDraws` on (mutates `s`; build it on a copy); creating it draws nothing.
 * The seed is forgeDraws and the per-game forgeSalt only: nothing a player can change cheaply between a failed save and a reload.
 */
export function forgeRng(s: GameState): Rng {
  return () => mulberry32(mix(s.forgeDraws++ ^ FORGE_SALT, s.forgeSalt))();
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

/**
 * The affix group a pin `mat` steers a swap to: a region material's own, or (gathering spec §7.3) a spot's region's. Null
 * for anything else.
 */
export function pinGroup(mat: string): AnyStat[] | null {
  if (Object.prototype.hasOwnProperty.call(REGION_AFFIX_GROUP, mat)) return REGION_AFFIX_GROUP[mat];
  const r = spotRegionOf(mat);
  const own = r ? REGIONS[r].material : null;
  return own && Object.prototype.hasOwnProperty.call(REGION_AFFIX_GROUP, own) ? REGION_AFFIX_GROUP[own] : null;
}

/**
 * What one reroll costs: an essence of the item's rarity, gold (double to swap), the pin if any (a region material, or two of
 * a spot: GATHER_PIN_QTY), a star tear for legendary.
 */
export function rerollCost(it: ItemInstance, o: RerollOpts): Cost {
  const mats: Record<string, number> = { [ESSENCE_OF[it.rarity]]: o.swap ? REROLL.essence.swap : REROLL.essence.value };
  const gold = REROLL.gold(it.ilvl) * (o.swap ? 2 : 1);
  let c: Cost = { gold, mats };
  if (o.mat) c = addCost(c, { gold: 0, mats: { [o.mat]: spotRegionOf(o.mat) ? GATHER_PIN_QTY : REROLL.regionQty } });
  if (it.rarity === 'legendary') c = addCost(c, { gold: 0, mats: { [REROLL.legendaryMat]: REROLL.legendaryQty } });
  return c;
}

/** The value range a reroll of affix `index` can land in (the same rounding as `rollValue`); a starlit piece only ever holds the maximum. */
export function rerollRange(it: ItemInstance, index: number): [number, number] | null {
  const affix = it.affixes[index];
  if (!affix) return null;
  if (it.starlit) {
    const max = maxValue(affix.key, it.ilvl);
    return [max, max];
  }
  const [lo, hi] = affixRange(affix.key, it.ilvl);
  const floor = ROLL_FLOOR[it.rarity];
  return [Math.max(1, Math.round(lo + (hi - lo) * floor)), Math.max(1, Math.round(hi))];
}

/**
 * The keys a swap can choose: legal for the item's slot, not already on the item, and in the pin's group when one is given
 * (a spot pins its region's group, `pinGroup`).
 */
export function swapPool(it: ItemInstance, _index: number, mat?: string): AnyStat[] {
  const slot = itemSlot(it);
  const have = new Set(it.affixes.map((a) => a.key));
  const group = mat === undefined ? null : (pinGroup(mat) ?? []);
  return (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot) && !have.has(k) && (!group || group.includes(k)));
}

export type FuseTarget = 'magic' | 'rare' | 'legendary';

/** The slots a fusion into `target` can be steered to: all of them, except that a legendary needs a general legendary in the slot (so never body). */
export function fuseSlots(target: FuseTarget): GearSlot[] {
  if (target !== 'legendary') return [...GEAR_SLOTS];
  const have = new Set(generalLegendaries().map((g) => g.slot));
  return GEAR_SLOTS.filter((sl) => have.has(sl));
}

/** What one fusion into `target` costs: FUSE_GOLD gold, plus FUSE_SLOT_COST when the slot is chosen. */
export function fuseCost(target: FuseTarget, slot?: GearSlot): Cost {
  const base: Cost = { gold: FUSE_GOLD[target], mats: {} };
  return slot === undefined ? base : addCost(base, { gold: 0, mats: { ...FUSE_SLOT_COST[target] } });
}

/** Roster plan Task C4 (ruling 16): an ordinary roster species' signature material (its `monster` material); none otherwise. */
export function signatureOf(species: string): string | undefined {
  if (!ENEMIES[species]?.inscribe) return undefined;
  return Object.values(MATERIALS).find((m) => m.owner === species && m.kind === 'monster')?.id;
}

/**
 * The affix that holds a piece's inscription (its species' key), or -1: none, or a mark with no affix of its own (the slot
 * could not take the key). A new inscription replaces this one in place (PR C review L3).
 */
export function inscriptionAffix(it: ItemInstance): number {
  const key = it.inscription ? ENEMIES[it.inscription]?.inscribe : undefined;
  return key ? it.affixes.findIndex((a) => a.key === key) : -1;
}

/** What inscribing `species`' key on `it` costs (ruling 16): INSCRIBE_QTY of its signature and a reroll's gold; null when it has none. */
export function inscribeCost(it: ItemInstance, species: string): Cost | null {
  const sig = signatureOf(species);
  return sig ? { gold: REROLL.gold(it.ilvl), mats: { [sig]: INSCRIBE_QTY } } : null;
}
