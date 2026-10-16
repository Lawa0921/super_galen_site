import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../rng';
import { AFFIXES, AFFIX_COUNT, GEAR_SLOTS, IMPLICIT_PER_ILVL, ROLL_FLOOR, SPECIALS, affixRange } from '../../data/gear';
import { EQUIPMENT } from '../../data/equipment';
import type { GearSlot, Rarity } from '../types';
import { baseFor, implicitStats, itemLevel, itemName, itemSlot, itemStats, itemWeight, rollItem, sellPrice } from './item';
import { depthLevel } from '../levels';

const rarities: Rarity[] = ['common', 'magic', 'rare', 'legendary'];

describe('rollItem', () => {
  it('same seed, same item', () => {
    for (const rarity of rarities) {
      const a = rollItem(mulberry32(7), { uid: 1, ilvl: 20, rarity });
      const b = rollItem(mulberry32(7), { uid: 1, ilvl: 20, rarity });
      expect(a).toEqual(b);
    }
  });

  it('affix counts follow the rarity', () => {
    for (const rarity of rarities) {
      for (let seed = 1; seed <= 500; seed++) {
        const it = rollItem(mulberry32(seed), { uid: seed, ilvl: 25, rarity });
        const range = rarity === 'common' ? [0, 0] : AFFIX_COUNT[rarity as 'magic' | 'rare' | 'legendary'];
        expect(it.affixes.length, `${rarity}#${seed}`).toBeGreaterThanOrEqual(range[0]);
        expect(it.affixes.length, `${rarity}#${seed}`).toBeLessThanOrEqual(range[1]);
        expect(it.rarity).toBe(rarity);
        expect(it.enhance).toBe(0);
      }
    }
  });

  it('random affixes stay in their slot pool and never repeat', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rarity = rarities[seed % 4];
      const it = rollItem(mulberry32(seed), { uid: seed, ilvl: 1 + (seed % 60), rarity });
      const slot = itemSlot(it);
      const keys = it.affixes.map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const k of keys) expect(AFFIXES[k].slots, `${k} on ${slot}`).toContain(slot);
    }
  });

  it('a unique or set rarity without a special item is refused', () => {
    expect(() => rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'unique' })).toThrow(/special/);
    expect(() => rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'set' })).toThrow(/special/);
    expect(rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'set', special: 'set-blaze-ring' }).rarity).toBe('set');
  });

  it('uniques and set pieces carry exactly their fixed affixes', () => {
    const fixedOnes = Object.values(SPECIALS).filter((s) => s.fixed);
    expect(fixedOnes.length).toBeGreaterThan(0);
    for (const s of fixedOnes) {
      const it = rollItem(mulberry32(3), { uid: 1, ilvl: 20, rarity: 'rare', special: s.id });
      expect(it.special).toBe(s.id);
      expect(it.rarity).toBe(s.rarity);
      expect(itemSlot(it)).toBe(s.slot);
      expect(it.affixes.map((a) => a.key)).toEqual(s.fixed);
    }
  });

  it('values follow the roll formula', () => {
    const check = (it: ReturnType<typeof rollItem>) => {
      const f = ROLL_FLOOR[it.rarity];
      for (const a of it.affixes) {
        const [lo, hi] = affixRange(a.key, it.ilvl);
        const min = Math.max(1, Math.round(lo + (hi - lo) * f));
        expect(a.value, `${it.rarity} ${a.key}`).toBeGreaterThanOrEqual(min);
        expect(a.value, `${it.rarity} ${a.key}`).toBeLessThanOrEqual(Math.max(1, Math.round(hi)));
        expect(Number.isInteger(a.value)).toBe(true);
      }
    };
    for (const rarity of rarities) for (let seed = 1; seed <= 300; seed++) check(rollItem(mulberry32(seed), { uid: 1, ilvl: 1 + (seed % 50), rarity }));
    for (const s of Object.values(SPECIALS)) for (let seed = 1; seed <= 40; seed++) check(rollItem(mulberry32(seed), { uid: 1, ilvl: 30, rarity: 'rare', special: s.id }));
  });

  it('rare averages above magic', () => {
    const mean = (rarity: Rarity) => {
      let sum = 0; let n = 0;
      for (let seed = 1; seed <= 500; seed++) {
        const it = rollItem(mulberry32(seed), { uid: 1, ilvl: 40, rarity, slot: 'weapon' });
        for (const a of it.affixes) { const [lo, hi] = affixRange(a.key, 40); sum += (a.value - lo) / (hi - lo); n++; }
      }
      return sum / n;
    };
    expect(mean('rare')).toBeGreaterThan(mean('magic') + 0.05);
  });

  it('base option picks that base', () => {
    const it = rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'magic', base: 'star-saber', slot: 'ring' });
    expect(it.base).toBe('star-saber');
    expect(itemSlot(it)).toBe('weapon');
  });

  it('a special uses the best base of its slot', () => {
    const it = rollItem(mulberry32(1), { uid: 1, ilvl: 12, rarity: 'legendary', special: 'lg-noel' });
    const best = Math.max(...Object.values(EQUIPMENT).filter((e) => e.slot === 'ring').map((e) => e.ilvl));
    expect(EQUIPMENT[it.base].ilvl).toBe(best);
  });

  it('draws the slot from GEAR_SLOTS when none is given', () => {
    const seen = new Set<GearSlot>();
    for (let seed = 1; seed <= 200; seed++) seen.add(itemSlot(rollItem(mulberry32(seed), { uid: 1, ilvl: 10, rarity: 'common' })));
    expect(seen.size).toBe(GEAR_SLOTS.length);
  });
});

describe('baseFor', () => {
  it('with no fitting base takes the lowest', () => {
    expect(baseFor(mulberry32(1), 'neck', 1)).toBe('moss-charm');
  });
  it('with exactly one candidate takes it', () => {
    expect(baseFor(mulberry32(1), 'offhand', 3)).toBe('wooden-buckler');
  });
  it('only returns bases at or under the item level', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const id = baseFor(mulberry32(seed), 'weapon', 12);
      expect(EQUIPMENT[id].slot).toBe('weapon');
      expect(EQUIPMENT[id].ilvl).toBeLessThanOrEqual(12);
    }
  });
});

describe('item numbers', () => {
  it('implicit grows with item level', () => {
    const it = { uid: 1, base: 'star-saber', rarity: 'common' as Rarity, ilvl: 42, affixes: [], enhance: 0 };
    // star-saber: atk 15 at item level 10.
    expect(implicitStats(it).atk).toBe(Math.round(15 * (1 + IMPLICIT_PER_ILVL * 32)));
    expect(implicitStats({ ...it, ilvl: 10 }).atk).toBe(15);
    expect(implicitStats({ ...it, ilvl: 3 }).atk).toBe(15);
  });

  it('itemStats adds affixes to the implicit', () => {
    const it = { uid: 1, base: 'star-saber', rarity: 'magic' as Rarity, ilvl: 10, affixes: [{ key: 'atk' as const, value: 5 }, { key: 'crit' as const, value: 2 }], enhance: 0 };
    expect(itemStats(it)).toMatchObject({ atk: 20, crit: 2 });
  });

  it('names, slots and weights', () => {
    const plain = rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'common', base: 'star-saber' });
    expect(itemName(plain)).toBe(EQUIPMENT['star-saber'].name);
    expect(itemWeight(plain)).toBe(6);
    const sp = rollItem(mulberry32(1), { uid: 1, ilvl: 10, rarity: 'legendary', special: 'lg-noel' });
    expect(itemName(sp)).toBe(SPECIALS['lg-noel'].name);
    expect(itemWeight(sp)).toBe(3);
  });

  it('prices by rarity', () => {
    const mk = (rarity: Rarity) => ({ uid: 1, base: 'star-saber', rarity, ilvl: 10, affixes: [], enhance: 0 });
    expect(sellPrice(mk('common'))).toBe(30);
    expect(sellPrice(mk('magic'))).toBe(60);
    expect(sellPrice(mk('rare'))).toBe(120);
    expect(sellPrice(mk('legendary'))).toBe(300);
    expect(sellPrice(mk('unique'))).toBe(300);
    expect(sellPrice(mk('set'))).toBe(240);
  });

  it('itemLevel adds the source bonus', () => {
    expect(itemLevel(3, 'monster')).toBe(depthLevel(3));
    expect(itemLevel(3, 'chest')).toBe(depthLevel(3));
    expect(itemLevel(3, 'elite')).toBe(depthLevel(3) + 2);
    expect(itemLevel(3, 'vault')).toBe(depthLevel(3) + 2);
    expect(itemLevel(3, 'boss')).toBe(depthLevel(3) + 4);
  });

  it('itemLevel(50, boss) is 202 and its items are finite integers', () => {
    expect(itemLevel(50, 'boss')).toBe(202);
    for (const rarity of rarities) {
      for (let seed = 1; seed <= 100; seed++) {
        const it = rollItem(mulberry32(seed), { uid: 1, ilvl: 202, rarity });
        for (const a of it.affixes) { expect(Number.isFinite(a.value)).toBe(true); expect(Number.isInteger(a.value)).toBe(true); }
        for (const v of Object.values(itemStats(it))) { expect(Number.isFinite(v)).toBe(true); expect(Number.isInteger(v)).toBe(true); }
      }
    }
  });

  it('survives an item level below 1', () => {
    const it = rollItem(mulberry32(1), { uid: 1, ilvl: 0, rarity: 'rare' });
    for (const a of it.affixes) { expect(Number.isFinite(a.value)).toBe(true); expect(a.value).toBeGreaterThanOrEqual(1); }
  });
});
