import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../rng';
import { AFFIXES, AFFIX_COUNT, GEAR_SLOTS, IMPLICIT_PER_ILVL, RARITIES, ROLL_FLOOR, SPECIALS, affixRange } from '../../data/gear';
import { EQUIPMENT } from '../../data/equipment';
import { ENHANCE_MAX, ENHANCE_STEP } from '../../data/forge';
import type { AnyStat, GearSlot, Rarity } from '../types';
import { newMember, sheetOf, statsOf } from '../party';
import { STARLIT_SELL_MUL, baseFor, implicitStats, itemLevel, itemName, itemSlot, itemStats, itemWeight, maxValue, rollItem, rollValue, sellPrice, starlitItem } from './item';
import { depthLevel } from '../levels';

const rarities: Rarity[] = ['common', 'magic', 'rare', 'epic', 'legendary'];

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
        const range = rarity === 'common' ? [0, 0] : AFFIX_COUNT[rarity as keyof typeof AFFIX_COUNT];
        expect(it.affixes.length, `${rarity}#${seed}`).toBeGreaterThanOrEqual(range[0]);
        expect(it.affixes.length, `${rarity}#${seed}`).toBeLessThanOrEqual(range[1]);
        expect(it.rarity).toBe(rarity);
        expect(it.enhance).toBe(0);
      }
    }
  });

  it('random affixes stay in their slot pool and never repeat', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rarity = rarities[seed % rarities.length];
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
    expect(implicitStats(it).atk).toBeCloseTo(15 * (1 + IMPLICIT_PER_ILVL * 32), 9);
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

  it('every rarity has a sell price, and an epic sells between rare and legendary', () => {
    const special: Partial<Record<Rarity, string>> = { unique: Object.values(SPECIALS).find((s) => s.rarity === 'unique')!.id, set: 'set-blaze-ring' };
    const mk = (rarity: Rarity, ilvl = 10) => ({ uid: 1, base: 'star-saber', rarity, ilvl, affixes: [], enhance: 0, special: special[rarity] });
    for (const r of RARITIES) {
      const p = sellPrice(mk(r));
      expect(Number.isInteger(p), r).toBe(true);
      expect(p, r).toBeGreaterThan(0);
    }
    for (const ilvl of [1, 10, 30, 50]) {
      expect(sellPrice(mk('rare', ilvl))).toBeLessThan(sellPrice(mk('epic', ilvl)));
      expect(sellPrice(mk('epic', ilvl))).toBeLessThan(sellPrice(mk('legendary', ilvl)));
    }
    expect(sellPrice(mk('epic'))).toBe(Math.round(30 * 6));
  });

  it('itemLevel adds the source bonus', () => {
    expect(itemLevel(3, 'monster')).toBe(depthLevel(3));
    expect(itemLevel(3, 'chest')).toBe(depthLevel(3));
    expect(itemLevel(3, 'elite')).toBe(depthLevel(3) + 2);
    expect(itemLevel(3, 'vault')).toBe(depthLevel(3) + 2);
    expect(itemLevel(3, 'boss')).toBe(depthLevel(3) + 4);
  });

  it('itemLevel(50, boss) is 202; its affixes are finite integers and its base bonus is finite (fractional by design)', () => {
    expect(itemLevel(50, 'boss')).toBe(202);
    for (const rarity of rarities) {
      for (let seed = 1; seed <= 100; seed++) {
        const it = rollItem(mulberry32(seed), { uid: 1, ilvl: 202, rarity });
        for (const a of it.affixes) { expect(Number.isFinite(a.value)).toBe(true); expect(Number.isInteger(a.value)).toBe(true); }
        for (const v of Object.values(itemStats(it))) expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('survives an item level below 1', () => {
    const it = rollItem(mulberry32(1), { uid: 1, ilvl: 0, rarity: 'rare' });
    for (const a of it.affixes) { expect(Number.isFinite(a.value)).toBe(true); expect(a.value).toBeGreaterThanOrEqual(1); }
  });
});

describe('enhancement', () => {
  const base = EQUIPMENT['iron-sword'];
  const make = (enhance: number, ilvl = 20) => ({ uid: 1, base: 'iron-sword', rarity: 'magic' as Rarity, ilvl, affixes: [{ key: 'crit' as const, value: 3 }], enhance });

  it('enhancement scales the base bonus by ENHANCE_STEP per level and leaves affixes alone', () => {
    const ilvl = 20;
    const grow = 1 + IMPLICIT_PER_ILVL * Math.max(0, ilvl - base.ilvl);
    const raw = base.bonus.atk! * grow;
    expect(implicitStats(make(0, ilvl)).atk).toBeCloseTo(raw, 9);
    expect(implicitStats(make(5, ilvl)).atk).toBeCloseTo(raw * (1 + 5 * ENHANCE_STEP), 9);
    expect(implicitStats(make(5, ilvl)).atk).toBeGreaterThan(implicitStats(make(0, ilvl)).atk!);
    expect(make(5).affixes).toEqual(make(0).affixes);
    expect(itemStats(make(5)).crit).toBe(3);
    expect(itemStats(make(5)).atk).toBe(implicitStats(make(5)).atk);
  });

  it('an +ENHANCE_MAX item at item level 202 stays finite', () => {
    const stats = itemStats(make(ENHANCE_MAX, 202));
    for (const v of Object.values(stats)) expect(Number.isFinite(v)).toBe(true);
    expect(implicitStats(make(ENHANCE_MAX, 202)).atk).toBeCloseTo(base.bonus.atk! * (1 + IMPLICIT_PER_ILVL * (202 - base.ilvl)) * (1 + ENHANCE_MAX * ENHANCE_STEP), 9);
  });

  it('keeps the fraction, so every enhance level adds to a small base instead of rounding away', () => {
    const at = (e: number) => implicitStats(make(e, base.ilvl)).atk!;
    for (let e = 1; e <= ENHANCE_MAX; e++) expect(at(e)).toBeCloseTo(at(e - 1) + base.bonus.atk! * ENHANCE_STEP, 9);
    expect(at(2)).not.toBe(at(3));            // 鐵劍 +2 and +3 both read 6 attack when each item rounded
  });

  it('the member sheet floors the summed fractions once, so enhancement on two pieces adds up', () => {
    const m = newMember('scarlet');
    const sword = (e: number) => make(e, base.ilvl);
    const total = (e: number) => statsOf({ ...m, equip: { weapon: sword(e) } }).atk;
    const bare = sheetOf({ ...m, equip: {} }).atk;
    for (let e = 0; e <= ENHANCE_MAX; e++) expect(total(e)).toBe(Math.floor(bare + base.bonus.atk! * (1 + e * ENHANCE_STEP) + 1e-9));
    expect(total(ENHANCE_MAX)).toBeGreaterThan(total(0));
  });

  it('rollValue is exported and stays within the affix range', () => {
    const v = rollValue(mulberry32(3), 'atk', 20, 'rare');
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(1);
  });
});

describe('starlit (plan 5g)', () => {
  it('maxValue is the top of the roll range', () => {
    for (const key of Object.keys(AFFIXES) as AnyStat[]) {
      for (const ilvl of [1, 25, 50]) {
        const top = maxValue(key, ilvl);
        expect(top, `${key} ${ilvl}`).toBe(rollValue(() => 0.999999, key, ilvl, 'legendary'));
        expect(top, `${key} ${ilvl}`).toBe(Math.max(1, Math.round(affixRange(key, ilvl)[1])));
        for (let seed = 1; seed <= 40; seed++) expect(top).toBeGreaterThanOrEqual(rollValue(mulberry32(seed), key, ilvl, 'rare'));
      }
    }
  });

  it('a starlit item has every affix at max and one more', () => {
    let grew = 0;
    for (const sp of Object.values(SPECIALS)) {
      const it = rollItem(mulberry32(5), { uid: 41, ilvl: 30, rarity: sp.rarity, special: sp.id });
      const st = starlitItem(it, mulberry32(9));
      const slot = itemSlot(it);
      const cand = (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot) && !it.affixes.some((a) => a.key === k));
      expect(st.affixes, sp.id).toHaveLength(it.affixes.length + (cand.length > 0 ? 1 : 0));
      if (cand.length > 0) grew++;
      expect(st.affixes.slice(0, it.affixes.length).map((a) => a.key), sp.id).toEqual(it.affixes.map((a) => a.key));
      for (const a of st.affixes) expect(a.value, `${sp.id} ${a.key}`).toBe(maxValue(a.key, 30));
      // A special's fixed affixes are its own; only the added one must be legal for the slot.
      if (cand.length > 0) expect(cand, sp.id).toContain(st.affixes.at(-1)!.key);
      expect(new Set(st.affixes.map((a) => a.key)).size, sp.id).toBe(st.affixes.length);
      expect(st.starlit).toBe(true);
      expect({ uid: st.uid, base: st.base, rarity: st.rarity, ilvl: st.ilvl, special: st.special, enhance: st.enhance })
        .toEqual({ uid: it.uid, base: it.base, rarity: it.rarity, ilvl: it.ilvl, special: it.special, enhance: it.enhance });
    }
    expect(grew).toBeGreaterThan(0);
  });

  it('a starlit item whose slot pool is exhausted gains no affix but is still all max', () => {
    const base = rollItem(mulberry32(3), { uid: 7, ilvl: 20, rarity: 'legendary', special: 'lg-noel' });
    const slot = itemSlot(base);
    const pool = (Object.keys(AFFIXES) as AnyStat[]).filter((k) => AFFIXES[k].slots.includes(slot));
    expect(pool.length).toBeGreaterThan(0);
    const full = { ...base, affixes: pool.map((key) => ({ key, value: 1 })) };
    let draws = 0;
    const st = starlitItem(full, () => { draws++; return 0.5; });
    expect(st.affixes.map((a) => a.key)).toEqual(pool);
    for (const a of st.affixes) expect(a.value, a.key).toBe(maxValue(a.key, 20));
    expect(st.starlit).toBe(true);
    expect(draws).toBe(0);
  });

  it('starlitItem leaves its input alone and is deterministic', () => {
    const it = rollItem(mulberry32(3), { uid: 7, ilvl: 20, rarity: 'legendary', special: 'lg-noel' });
    const copy = structuredClone(it);
    const a = starlitItem(it, mulberry32(11));
    const b = starlitItem(it, mulberry32(11));
    expect(it).toEqual(copy);
    expect('starlit' in it).toBe(false);
    expect(a).toEqual(b);
    expect(a).not.toBe(it);
  });

  it('a starlit piece sells for twice its rarity', () => {
    expect(STARLIT_SELL_MUL).toBe(2);
    for (const id of ['lg-noel', 'set-blaze-ring']) {
      const it = rollItem(mulberry32(2), { uid: 1, ilvl: 15, rarity: SPECIALS[id].rarity, special: id });
      expect(sellPrice({ ...it, starlit: true })).toBe(2 * sellPrice(it));
    }
  });
});
