import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { DISMANTLE, ENHANCE_COST, ENHANCE_SUCCESS, ENHANCE_MAX } from '../../data/forge';
import { dismantle, dismantleYield, enhance } from './forge';
import { enhanceChance, enhanceCost } from './cost';
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
