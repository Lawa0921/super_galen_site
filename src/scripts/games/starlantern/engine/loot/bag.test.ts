import { describe, it, expect } from 'vitest';
import { BAG_SIZE, applyAutoJunk, sortBag } from './bag';
import type { ItemInstance, Rarity } from '../types';

const item = (uid: number, base: string, rarity: Rarity, ilvl: number): ItemInstance =>
  ({ uid, base, rarity, ilvl, affixes: [], enhance: 0 });

describe('bag', () => {
  it('holds sixty pieces', () => {
    expect(BAG_SIZE).toBe(60);
  });

  it('sorts by rarity, slot and item level, stable', () => {
    const bag = [
      item(1, 'copper-ring', 'common', 1),
      item(2, 'iron-sword', 'rare', 5),
      item(3, 'leather-cap', 'set', 9),
      item(4, 'wooden-staff', 'common', 9),
      item(5, 'cloth-robe', 'rare', 5),
      item(6, 'straw-sandals', 'legendary', 2),
    ];
    const uids = (b: ItemInstance[]) => b.map((it) => it.uid);
    expect(uids(sortBag(bag, 'rarity'))).toEqual([3, 6, 2, 5, 1, 4]);
    expect(uids(sortBag(bag, 'slot'))).toEqual([2, 4, 3, 5, 6, 1]);
    expect(uids(sortBag(bag, 'ilvl'))).toEqual([3, 4, 2, 5, 6, 1]);
    expect(uids(bag)).toEqual([1, 2, 3, 4, 5, 6]);          // the input is left alone
  });

  it('auto junk never marks legendary, unique or set', () => {
    const all: Rarity[] = ['common', 'magic', 'rare', 'legendary', 'unique', 'set'];
    const marked = (mode: 'off' | 'common' | 'magic') =>
      all.filter((r) => applyAutoJunk(item(1, 'iron-sword', r, 1), mode).junk === true);
    expect(marked('off')).toEqual([]);
    expect(marked('common')).toEqual(['common']);
    expect(marked('magic')).toEqual(['common', 'magic']);
    const kept = item(1, 'iron-sword', 'common', 1);
    expect(applyAutoJunk(kept, 'off')).toBe(kept);
  });
});
