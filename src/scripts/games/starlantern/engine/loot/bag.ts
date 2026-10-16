import { GEAR_SLOTS, RARITY_RANK } from '../../data/gear';
import type { ItemInstance, Rarity } from '../types';
import { itemSlot } from './item';

/** The town bag holds gear only; materials and consumables stay in `inventory`. */
export const BAG_SIZE = 60;

/** Which rarities new drops are marked as junk at: none, commons, or commons and magic items. */
export type AutoJunk = 'off' | 'common' | 'magic';

const JUNK_AT: Record<AutoJunk, Rarity[]> = { off: [], common: ['common'], magic: ['common', 'magic'] };

/** A sorted copy of the bag: rarity and item level high to low, slot in GEAR_SLOTS order; ties keep their order. */
export function sortBag(bag: ItemInstance[], by: 'rarity' | 'slot' | 'ilvl'): ItemInstance[] {
  const key = (it: ItemInstance): number =>
    by === 'rarity' ? -RARITY_RANK[it.rarity] : by === 'ilvl' ? -it.ilvl : GEAR_SLOTS.indexOf(itemSlot(it));
  return bag.map((it, i) => ({ it, i, k: key(it) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.it);
}

/** Marks an item as junk when the mode covers its rarity; legendary, unique and set items are never marked. */
export function applyAutoJunk(it: ItemInstance, mode: AutoJunk): ItemInstance {
  return JUNK_AT[mode].includes(it.rarity) ? { ...it, junk: true } : it;
}
