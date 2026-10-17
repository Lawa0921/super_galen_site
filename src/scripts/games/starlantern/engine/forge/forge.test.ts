import { describe, it, expect } from 'vitest';
import { newGame } from '../state';
import { plainItem } from '../testing';
import { DISMANTLE } from '../../data/forge';
import { dismantle, dismantleYield } from './forge';
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
