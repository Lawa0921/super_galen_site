import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { DISMANTLE, ENHANCE_COST, ENHANCE_SUCCESS, ENHANCE_MAX } from '../../data/forge';
import { dismantle, dismantleYield, enhance, fuse, reroll } from './forge';
import { enhanceChance, enhanceCost, fuseCost, fuseSlots, rerollCost, rerollRange, swapPool } from './cost';
import { AFFIXES, GEAR_SLOTS, ROLL_FLOOR, SPECIALS, affixRange, generalLegendaries } from '../../data/gear';
import { FUSE_GOLD, FUSE_SLOT_COST, REGION_AFFIX_GROUP, REROLL } from '../../data/forge';
import { BAG_SIZE } from '../loot/bag';
import { itemSlot } from '../loot/item';
import { statsOf } from '../party';
import type { GameState } from '../state';
import { LEGACY_LINEUP } from '../party';
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
    s.party.roster[LEGACY_LINEUP[0]].equip.ring1 = at('rare', 2);
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
    const m = LEGACY_LINEUP[0];
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
    const [lo, hi] = rerollRange(it, 1)!;
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
      const [nlo, nhi] = rerollRange(it, 1)!;
      expect(r.out.after.value).toBeGreaterThanOrEqual(nlo);
      expect(r.out.after.value).toBeLessThanOrEqual(nhi);
      expect(r.state.forgeDraws).toBe(i + 2);
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
      const low = reroll(s, 1, 0, { swap: false }, constRng(0));
      expect(low.ok && low.out.after.value).toBe(rerollRange(gear({ rarity }), 0)![0]);
      const [alo, ahi] = affixRange('str', 20);
      const atFloor = Math.max(1, Math.round(alo + (ahi - alo) * ROLL_FLOOR[rarity]));
      expect(low.ok && low.out.after.value).toBe(atFloor);
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
    expect(rerollRange(gear(), 3)).toBeNull();
    expect(rerollRange(gear(), -1)).toBeNull();
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
    const m = LEGACY_LINEUP[0];
    const s = stocked(gear());
    s.bag = [];
    s.party.roster[m].equip.neck = gear({ affixes: [{ key: 'hp', value: 500 }, { key: 'str', value: 1 }, { key: 'spd', value: 1 }] });
    s.party.roster[m].hp = statsOf(s.party.roster[m]).hp;
    const full = s.party.roster[m].hp;
    const r = reroll(s, 1, 0, { swap: false }, constRng(0));
    if (!r.ok) throw new Error('refused');
    const worn = r.state.party.roster[m];
    expect(worn.equip.neck?.affixes[0].value).toBe(rerollRange(worn.equip.neck!, 0)![0]);
    expect(worn.hp).toBe(statsOf(worn).hp);
    expect(worn.hp).toBeLessThan(full);
    expect(s.party.roster[m].hp).toBe(full);
  });
});

describe('fuse', () => {
  const trio = (rarity: Rarity, ilvls: number[]): ItemInstance[] => ilvls.map((l, i) => ({ ...at(rarity, i + 1), ilvl: l }));
  const funded = (bag: ItemInstance[]): GameState => {
    const s = withBag(bag);
    s.gold = 1000;
    s.inventory = { 'essence-common': 10, 'essence-magic': 10, 'king-scale': 10 };
    return s;
  };

  it('three commons become one magic item at their floored average level and cost FUSE_GOLD.magic', () => {
    const s = funded(trio('common', [3, 4, 4]));
    const r = fuse(s, [1, 2, 3]);
    if (!r.ok) throw new Error('refused');
    expect(r.out.item.rarity).toBe('magic');
    expect(r.out.item.ilvl).toBe(Math.floor((3 + 4 + 4) / 3));
    expect(r.out.item.uid).toBe(100);
    expect(r.state.nextUid).toBe(101);
    expect(r.state.gold).toBe(1000 - FUSE_GOLD.magic);
    expect(r.state.inventory).toEqual(s.inventory);
    expect(r.state.bag).toEqual([r.out.item]);
    expect(s.bag).toHaveLength(3);
  });
  it('three magics become a rare; a chosen slot costs FUSE_SLOT_COST.rare on top and is honoured', () => {
    const s = funded(trio('magic', [10, 10, 10]));
    for (const slot of GEAR_SLOTS) {
      const r = fuse(s, [1, 2, 3], slot);
      if (!r.ok) throw new Error('refused');
      expect(r.out.item.rarity).toBe('rare');
      expect(itemSlot(r.out.item)).toBe(slot);
      expect(r.state.gold).toBe(s.gold - FUSE_GOLD.rare);
      expect(r.state.inventory['essence-magic']).toBe(10 - FUSE_SLOT_COST.rare['essence-magic']);
    }
    expect(fuseCost('rare', 'head')).toEqual({ gold: FUSE_GOLD.rare, mats: FUSE_SLOT_COST.rare });
    expect(fuseCost('rare')).toEqual({ gold: FUSE_GOLD.rare, mats: {} });
  });
  it('three rares become a general legendary; a chosen slot also costs FUSE_SLOT_COST.legendary', () => {
    const general = new Set(generalLegendaries().map((g) => g.id));
    const s = funded(trio('rare', [20, 21, 22]));
    const free = fuse(s, [1, 2, 3]);
    if (!free.ok) throw new Error('refused');
    expect(general.has(free.out.item.special ?? '')).toBe(true);
    expect(free.out.item.rarity).toBe('legendary');
    expect(free.out.item.ilvl).toBe(21);
    expect(free.state.gold).toBe(s.gold - FUSE_GOLD.legendary);
    expect(free.state.inventory['king-scale']).toBe(10);
    expect(free.state.codex).toEqual([free.out.item.special]);
    for (const slot of fuseSlots('legendary')) {
      const r = fuse(s, [1, 2, 3], slot);
      if (!r.ok) throw new Error('refused');
      expect(itemSlot(r.out.item)).toBe(slot);
      expect(SPECIALS[r.out.item.special ?? ''].slot).toBe(slot);
      expect(general.has(r.out.item.special ?? '')).toBe(true);
      expect(r.state.inventory['king-scale']).toBe(10 - FUSE_SLOT_COST.legendary['king-scale']);
    }
  });
  it('fusion never yields a region-limited special, over many draws', () => {
    const general = new Set(generalLegendaries().map((g) => g.id));
    const seen = new Set<string>();
    for (let i = 0; i < 80; i++) {
      const s = funded(trio('rare', [5, 5, 5]));
      s.forgeDraws = i;
      const r = fuse(s, [1, 2, 3]);
      if (!r.ok) throw new Error('refused');
      expect(general.has(r.out.item.special ?? '')).toBe(true);
      seen.add(r.out.item.special ?? '');
    }
    expect(seen.size).toBeGreaterThan(1);
  });
  it('the codex does not repeat an id', () => {
    const s = funded(trio('rare', [5, 5, 5]));
    const r = fuse(s, [1, 2, 3], 'ring');
    if (!r.ok) throw new Error('refused');
    const again = { ...r.state, bag: trio('rare', [5, 5, 5]), forgeDraws: 0 };
    const r2 = fuse(again, [1, 2, 3], 'ring');
    if (!r2.ok) throw new Error('refused');
    expect(r2.state.codex.length).toBeGreaterThan(0);
    expect(new Set(r2.state.codex).size).toBe(r2.state.codex.length);
  });
  it('body is never a legendary fusion slot', () => {
    expect(fuseSlots('legendary')).not.toContain('body');
    expect(fuseSlots('legendary').length).toBe(GEAR_SLOTS.length - 1);
    expect(fuseSlots('magic')).toEqual(GEAR_SLOTS);
    expect(fuseSlots('rare')).toEqual(GEAR_SLOTS);
    const s = funded(trio('rare', [5, 5, 5]));
    const before = structuredClone(s);
    expect(fuse(s, [1, 2, 3], 'body')).toEqual({ ok: false, reason: 'invalid' });
    expect(s).toEqual(before);
  });
  it('mixed rarities, two items, a worn uid or a set piece are refused and nothing changes', () => {
    const s = funded([...trio('common', [3, 3, 3]), { ...at('magic', 4) }, { ...at('legendary', 5) }, { ...at('set', 6) }, { ...at('unique', 7) }, { ...at('common', 8) }]);
    s.party.roster[LEGACY_LINEUP[0]].equip.ring1 = at('common', 50);
    const before = structuredClone(s);
    expect(fuse(s, [1, 2, 4])).toEqual({ ok: false, reason: 'invalid' });
    expect(fuse(s, [1, 2])).toEqual({ ok: false, reason: 'invalid' });
    expect(fuse(s, [1, 2, 3, 8])).toEqual({ ok: false, reason: 'invalid' });
    expect(fuse(s, [1, 1, 2])).toEqual({ ok: false, reason: 'invalid' });
    expect(fuse(s, [1, 2, 50])).toEqual({ ok: false, reason: 'stock' });
    expect(fuse(s, [1, 2, 999])).toEqual({ ok: false, reason: 'stock' });
    expect(fuse(s, [5, 6, 7])).toEqual({ ok: false, reason: 'invalid' });
    const sets = funded([at('set', 1), at('set', 2), at('set', 3)]);
    expect(fuse(sets, [1, 2, 3])).toEqual({ ok: false, reason: 'invalid' });
    const uniq = funded([at('unique', 1), at('unique', 2), at('unique', 3)]);
    expect(fuse(uniq, [1, 2, 3])).toEqual({ ok: false, reason: 'invalid' });
    const legs = funded([at('legendary', 1), at('legendary', 2), at('legendary', 3)]);
    expect(fuse(legs, [1, 2, 3])).toEqual({ ok: false, reason: 'invalid' });
    expect(fuse(s, 'x' as unknown as number[])).toEqual({ ok: false, reason: 'invalid' });
    expect(s).toEqual(before);
  });
  it('lacking gold or the slot materials is refused and nothing changes', () => {
    const poor = funded(trio('common', [3, 3, 3]));
    poor.gold = FUSE_GOLD.magic - 1;
    expect(fuse(poor, [1, 2, 3])).toEqual({ ok: false, reason: 'gold' });
    const bare = funded(trio('common', [3, 3, 3]));
    bare.inventory = {};
    const before = structuredClone(bare);
    expect(fuse(bare, [1, 2, 3], 'ring')).toEqual({ ok: false, reason: 'mats' });
    expect(fuse(bare, [1, 2, 3]).ok).toBe(true);
    expect(bare).toEqual(before);
  });
  it('fusing with a full bag works: 3 out, 1 in', () => {
    const filler = Array.from({ length: BAG_SIZE - 3 }, (_, i) => at('rare', 1000 + i));
    const s = funded([...trio('common', [3, 3, 3]), ...filler]);
    expect(s.bag).toHaveLength(BAG_SIZE);
    const r = fuse(s, [1, 2, 3]);
    if (!r.ok) throw new Error('refused');
    expect(r.state.bag).toHaveLength(BAG_SIZE - 2);
    expect(r.state.bag.some((it) => [1, 2, 3].includes(it.uid))).toBe(false);
    expect(r.state.bag.filter((it) => it.uid === r.out.item.uid)).toHaveLength(1);
  });
  it('forgeDraws advances exactly once per fusion, and not at all when refused or given an rng', () => {
    const s = funded(trio('rare', [5, 5, 5]));
    const r = fuse(s, [1, 2, 3]);
    expect(r.ok && r.state.forgeDraws).toBe(s.forgeDraws + 1);
    const m = fuse(funded(trio('common', [5, 5, 5])), [1, 2, 3], 'weapon');
    expect(m.ok && m.state.forgeDraws).toBe(1);
    const bad = funded(trio('common', [5, 5, 5]));
    bad.gold = 0;
    fuse(bad, [1, 2, 3]);
    expect(bad.forgeDraws).toBe(0);
    const own = fuse(funded(trio('common', [5, 5, 5])), [1, 2, 3], undefined, () => 0.5);
    expect(own.ok && own.state.forgeDraws).toBe(0);
  });
  it('fusing three rares with a full bag works on the legendary path too', () => {
    const filler = Array.from({ length: BAG_SIZE - 3 }, (_, i) => at('common', 1000 + i));
    const s = funded([...trio('rare', [5, 5, 5]), ...filler]);
    const r = fuse(s, [1, 2, 3], 'ring');
    if (!r.ok) throw new Error('refused');
    expect(r.state.bag).toHaveLength(BAG_SIZE - 2);
    expect(r.out.item.rarity).toBe('legendary');
  });
  it('a prototype-key rarity is refused, not thrown', () => {
    for (const rarity of ['__proto__', 'toString', 'constructor']) {
      const s = funded([1, 2, 3].map((u) => ({ ...at('common', u), rarity: rarity as Rarity })));
      const before = structuredClone(s);
      expect(fuse(s, [1, 2, 3])).toEqual({ ok: false, reason: 'invalid' });
      expect(s).toEqual(before);
    }
  });
});
