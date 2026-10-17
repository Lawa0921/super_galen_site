import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { DISMANTLE, ENHANCE_COST, ENHANCE_SUCCESS, ENHANCE_MAX } from '../../data/forge';
import { dismantle, dismantleYield, enhance, reroll } from './forge';
import { enhanceChance, enhanceCost, rerollCost, rerollRange, swapPool } from './cost';
import { AFFIXES, ROLL_FLOOR, affixRange } from '../../data/gear';
import { REGION_AFFIX_GROUP, REROLL } from '../../data/forge';
import { itemSlot } from '../loot/item';
import { statsOf } from '../party';
import type { GameState } from '../state';
import { STARTING_RECRUITS } from '../party';
import type { ItemInstance, Rarity } from '../types';

const at = (rarity: Rarity, uid: number): ItemInstance => ({ ...plainItem('moss-charm', uid), rarity });
const sum = (rs: Rarity[]) => {
  const out: Record<string, number> = {};
  for (const r of rs) for (const [k, v] of Object.entries(DISMANTLE[r])) out[k] = (out[k] ?? 0) + v;
  return out;
};
const withBag = (bag: ItemInstance[]) => ({ ...newGame(), bag, nextUid: 100 });

describe('dismantle', () => {
  it('dismantling yields DISMANTLE by rarity and removes the items', () => {
    const s = withBag([at('common', 1), at('rare', 2), at('set', 3)]);
    s.inventory = {};
    const r = dismantle(s, [1, 2, 3]);
    const expected = sum(['common', 'rare', 'set']);
    expect(r.ok && r.out.essences).toEqual(expected);
    expect(dismantleYield(s.bag)).toEqual(expected);
    expect(r.ok && r.state.bag).toEqual([]);
    expect(r.ok && r.state.inventory).toEqual(expected);
    expect(s.bag).toHaveLength(3);
  });
  it('dismantling only the marked items leaves the rest', () => {
    const s = withBag([at('magic', 1), at('rare', 2), at('common', 3)]);
    const r = dismantle(s, [1, 3]);
    expect(r.ok && r.state.bag.map((i) => i.uid)).toEqual([2]);
    expect(r.ok && r.out.essences).toEqual(sum(['magic', 'common']));
  });
  it('a worn uid or a duplicate is refused and nothing changes', () => {
    const s = withBag([at('magic', 1)]);
    s.party.roster[STARTING_RECRUITS[0]].equip.ring1 = at('rare', 2);
    const before = structuredClone(s);
    expect(dismantle(s, [2])).toEqual({ ok: false, reason: 'stock' });
    expect(dismantle(s, [1, 2])).toEqual({ ok: false, reason: 'stock' });
    expect(dismantle(s, [1, 1])).toEqual({ ok: false, reason: 'invalid' });
    expect(dismantle(s, [])).toEqual({ ok: false, reason: 'invalid' });
    expect(dismantle(s, [999])).toEqual({ ok: false, reason: 'stock' });
    expect(s).toEqual(before);
  });
});

const lv = (n: number, uid = 1): ItemInstance => ({ ...plainItem('moss-charm', uid), enhance: n });
const rich = (it: ItemInstance): GameState => {
  const s = withBag([it]);
  s.gold = 1_000_000;
  s.inventory = {};
  for (const c of ENHANCE_COST) for (const [k] of Object.entries(c.mats)) s.inventory[k] = 100;
  return s;
};
const constRng = (v: number) => () => v;

describe('enhance', () => {
  it('+1 through +5 always succeed and draw no random number', () => {
    let calls = 0;
    const rng = () => { calls++; return 0.999; };
    let s = rich(lv(0));
    for (let i = 0; i < 5; i++) {
      const r = enhance(s, 1, rng);
      expect(r.ok && r.out).toEqual({ success: true, level: i + 1 });
      if (r.ok) s = r.state;
    }
    expect(calls).toBe(0);
    let t = rich(lv(0));
    for (let i = 0; i < 5; i++) {
      const r = enhance(t, 1);
      if (r.ok) t = r.state;
    }
    expect(t.bag[0].enhance).toBe(5);
    expect(t.forgeDraws).toBe(0);
  });
  it('the step to +6 draws once', () => {
    const s = rich(lv(5));
    const r = enhance(s, 1);
    expect(r.ok && r.state.forgeDraws).toBe(s.forgeDraws + 1);
  });
  it('from +5 the step to +6 can fail; a failure keeps the level and still pays', () => {
    const s = rich(lv(5));
    const c = ENHANCE_COST[5];
    const f = enhance(s, 1, constRng(0.999));
    expect(f.ok && f.out).toEqual({ success: false, level: 5 });
    if (!f.ok) throw new Error('refused');
    expect(f.state.bag[0].enhance).toBe(5);
    expect(f.state.gold).toBe(s.gold - c.gold);
    for (const [k, n] of Object.entries(c.mats)) expect(f.state.inventory[k]).toBe(s.inventory[k] - n);
    const w = enhance(s, 1, constRng(0));
    expect(w.ok && w.out).toEqual({ success: true, level: 6 });
    expect(w.ok && w.state.bag[0].enhance).toBe(6);
    expect(s.bag[0].enhance).toBe(5);
  });
  it('at +ENHANCE_MAX enhance is refused and costs nothing', () => {
    const s = rich(lv(ENHANCE_MAX));
    const before = structuredClone(s);
    expect(enhance(s, 1)).toEqual({ ok: false, reason: 'max' });
    expect(enhanceCost(s.bag[0])).toBeNull();
    expect(s).toEqual(before);
  });
  it('success at +6 happens about ENHANCE_SUCCESS[5] of the time', () => {
    const p = ENHANCE_SUCCESS[5];
    const n = 4000;
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const s = rich(lv(5));
      s.forgeDraws = i;
      const r = enhance(s, 1);
      if (r.ok && r.out.success) wins++;
    }
    expect(Math.abs(wins / n - p)).toBeLessThan(4 * Math.sqrt((p * (1 - p)) / n));
  });
  it('the cost and chance come from the tables', () => {
    for (let l = 0; l < ENHANCE_MAX; l++) {
      expect(enhanceCost(lv(l))).toEqual(ENHANCE_COST[l]);
      expect(enhanceChance(lv(l))).toBe(ENHANCE_SUCCESS[l]);
    }
    expect(ENHANCE_COST[7].mats['ancient-gear']).toBe(1);
    expect(ENHANCE_COST[9].mats['king-scale']).toBe(1);
  });
  it('a worn item is enhanced in place on its wearer', () => {
    const s = rich(lv(2, 7));
    s.bag = [];
    const m = STARTING_RECRUITS[0];
    s.party.roster[m].equip.ring1 = lv(2, 7);
    const r = enhance(s, 7);
    expect(r.ok && r.state.party.roster[m].equip.ring1?.enhance).toBe(3);
    expect(s.party.roster[m].equip.ring1?.enhance).toBe(2);
  });
  it('lacking gold or materials is refused and forgeDraws stays', () => {
    const poor = rich(lv(5));
    poor.gold = 0;
    expect(enhance(poor, 1)).toEqual({ ok: false, reason: 'gold' });
    const bare = rich(lv(7));
    bare.inventory = {};
    expect(enhance(bare, 1)).toEqual({ ok: false, reason: 'mats' });
    expect(bare.forgeDraws).toBe(rich(lv(7)).forgeDraws);
    const noGear = rich(lv(7));
    delete noGear.inventory['ancient-gear'];
    expect(enhance(noGear, 1)).toEqual({ ok: false, reason: 'mats' });
  });
  it('an unknown uid is refused', () => {
    expect(enhance(rich(lv(0)), 99)).toEqual({ ok: false, reason: 'stock' });
  });
});

describe('reroll', () => {
  const gear = (over: Partial<ItemInstance> = {}): ItemInstance => ({
    ...plainItem('moss-charm', 1), rarity: 'rare', ilvl: 20,
    affixes: [{ key: 'str', value: 5 }, { key: 'hp', value: 30 }, { key: 'spd', value: 2 }], ...over,
  });
  const stocked = (it: ItemInstance): GameState => {
    const s = withBag([it]);
    s.gold = 1_000_000;
    s.inventory = { 'essence-common': 50, 'essence-magic': 50, 'essence-rare': 50, 'essence-legendary': 50, 'star-tear': 5 };
    for (const m of Object.keys(REGION_AFFIX_GROUP)) s.inventory[m] = 50;
    return s;
  };

  it('a value reroll stays in rerollRange and locks that affix', () => {
    const it = gear();
    const [lo, hi] = rerollRange(it, 1);
    const lowR = reroll(stocked(it), 1, 1, { swap: false }, constRng(0));
    expect(lowR.ok && lowR.out.after).toEqual({ key: 'hp', value: lo });
    const [alo, ahi] = affixRange('hp', it.ilvl);
    const floor = ROLL_FLOOR[it.rarity];
    const expected = Math.max(1, Math.round(alo + (ahi - alo) * (floor + (1 - floor) * 0.9999)));
    const highR = reroll(stocked(it), 1, 1, { swap: false }, constRng(0.9999));
    expect(highR.ok && highR.out.after.value).toBe(expected);
    expect(expected).toBeLessThanOrEqual(hi);
    expect(highR.ok && highR.state.bag[0].locked).toBe(1);
    expect(it.locked).toBeUndefined();
  });
  it('after rerolling affix 1, affix 0 is refused as affixLocked and nothing is spent', () => {
    const first = reroll(stocked(gear()), 1, 1, { swap: false });
    if (!first.ok) throw new Error('refused');
    const before = structuredClone(first.state);
    expect(reroll(first.state, 1, 0, { swap: false })).toEqual({ ok: false, reason: 'affixLocked' });
    expect(reroll(first.state, 1, 0, { swap: true })).toEqual({ ok: false, reason: 'affixLocked' });
    expect(first.state).toEqual(before);
    expect(reroll(first.state, 1, 1, { swap: false }).ok).toBe(true);
  });
  it('a swap changes the key, keeps the index locked and never repeats a key on the item', () => {
    for (let i = 0; i < 100; i++) {
      const s = stocked(gear());
      s.forgeDraws = i;
      const r = reroll(s, 1, 1, { swap: true });
      if (!r.ok) throw new Error('refused');
      const it = r.state.bag[0];
      expect(r.out.after.key).not.toBe('hp');
      expect(it.locked).toBe(1);
      expect(new Set(it.affixes.map((a) => a.key)).size).toBe(3);
      expect(AFFIXES[r.out.after.key].slots).toContain(itemSlot(it));
      expect(it.affixes[1]).toEqual(r.out.after);
    }
  });
  it('a region material limits the new key to its group', () => {
    let tried = 0;
    for (const [mat, group] of Object.entries(REGION_AFFIX_GROUP)) {
      const it = gear();
      const pool = swapPool(it, 1, mat);
      if (pool.length === 0) continue;
      tried++;
      for (let i = 0; i < 200; i++) {
        const s = stocked(it);
        s.forgeDraws = i;
        const r = reroll(s, 1, 1, { swap: true, mat });
        if (!r.ok) throw new Error('refused');
        expect(group).toContain(r.out.after.key);
        expect(pool).toContain(r.out.after.key);
        expect(r.state.inventory[mat]).toBe(s.inventory[mat] - REROLL.regionQty);
      }
    }
    expect(tried).toBeGreaterThan(2);
    const c = rerollCost(gear(), { swap: true, mat: 'blaze-core' });
    expect(c.mats['blaze-core']).toBe(REROLL.regionQty);
    expect(c.gold).toBe(REROLL.gold(20) * 2);
    expect(c.mats['essence-rare']).toBe(REROLL.essence.swap);
    expect(rerollCost(gear(), { swap: false }).gold).toBe(REROLL.gold(20));
  });
  it('a value reroll draws once', () => {
    const s = stocked(gear());
    expect(s.forgeDraws).toBe(0);
    const r = reroll(s, 1, 0, { swap: false });
    expect(r.ok && r.state.forgeDraws).toBe(1);
  });
  it('a group with nothing left for the slot is refused as none and nothing is spent', () => {
    const it: ItemInstance = {
      ...plainItem('cloth-gloves', 1), rarity: 'rare', ilvl: 20, affixes: [{ key: 'atk', value: 5 }, { key: 'str', value: 5 }, { key: 'def', value: 2 }],
    };
    const s = stocked(it);
    const before = structuredClone(s);
    expect(swapPool(it, 0, 'blaze-core')).toEqual([]);
    expect(reroll(s, 1, 0, { swap: true, mat: 'blaze-core' })).toEqual({ ok: false, reason: 'none' });
    expect(s).toEqual(before);
  });
  it('uniques and set pieces reroll values only; a legendary also pays REROLL.legendaryMat', () => {
    for (const rarity of ['unique', 'set'] as const) {
      const s = stocked(gear({ rarity }));
      const before = structuredClone(s);
      expect(reroll(s, 1, 0, { swap: true })).toEqual({ ok: false, reason: 'invalid' });
      expect(s).toEqual(before);
      expect(reroll(s, 1, 0, { swap: false }).ok).toBe(true);
    }
    const s = stocked(gear({ rarity: 'legendary' }));
    const r = reroll(s, 1, 0, { swap: false });
    if (!r.ok) throw new Error('refused');
    expect(r.state.inventory['star-tear']).toBe(s.inventory['star-tear'] - REROLL.legendaryQty);
    expect(rerollCost(gear({ rarity: 'legendary' }), { swap: false }).mats[REROLL.legendaryMat]).toBe(REROLL.legendaryQty);
    expect(rerollCost(gear(), { swap: false }).mats[REROLL.legendaryMat]).toBeUndefined();
  });
  it('plain items, bad indexes, bad mats, unknown uids and poverty are refused without change', () => {
    const s = stocked(gear());
    const before = structuredClone(s);
    expect(reroll(s, 9, 0, { swap: false })).toEqual({ ok: false, reason: 'stock' });
    expect(reroll(s, 1, 3, { swap: false })).toEqual({ ok: false, reason: 'invalid' });
    expect(reroll(s, 1, -1, { swap: false })).toEqual({ ok: false, reason: 'invalid' });
    expect(reroll(s, 1, 0, { swap: false, mat: 'blaze-core' })).toEqual({ ok: false, reason: 'invalid' });
    expect(reroll(s, 1, 0, { swap: true, mat: 'moss' })).toEqual({ ok: false, reason: 'invalid' });
    expect(reroll(stocked(gear({ rarity: 'common', affixes: [] })), 1, 0, { swap: false })).toEqual({ ok: false, reason: 'invalid' });
    expect(s).toEqual(before);
    s.gold = 0;
    expect(reroll(s, 1, 0, { swap: false })).toEqual({ ok: false, reason: 'gold' });
    s.gold = 1_000_000;
    s.inventory = {};
    expect(reroll(s, 1, 0, { swap: false })).toEqual({ ok: false, reason: 'mats' });
    expect(s.forgeDraws).toBe(before.forgeDraws);
  });
  it('rerolling worn hp down holds HP at the new maximum', () => {
    const m = STARTING_RECRUITS[0];
    const s = stocked(gear());
    s.bag = [];
    s.party.roster[m].equip.neck = gear({ affixes: [{ key: 'hp', value: 500 }, { key: 'str', value: 1 }, { key: 'spd', value: 1 }] });
    s.party.roster[m].hp = statsOf(s.party.roster[m]).hp;
    const full = s.party.roster[m].hp;
    const r = reroll(s, 1, 0, { swap: false }, constRng(0));
    if (!r.ok) throw new Error('refused');
    const worn = r.state.party.roster[m];
    expect(worn.equip.neck?.affixes[0].value).toBe(rerollRange(worn.equip.neck!, 0)[0]);
    expect(worn.hp).toBe(statsOf(worn).hp);
    expect(worn.hp).toBeLessThan(full);
    expect(s.party.roster[m].hp).toBe(full);
  });
});
