import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { buy, equip, innCost, isUnlocked, mintUid, rest, revive, reviveCost, sell, unequip, useFieldItem } from './town';
import { statsOf } from './party';
import { plainItem } from './testing';
import { BAG_SIZE } from './loot/bag';
import type { ItemInstance } from './types';

const withInv = (inv: Record<string, number>, gold = 150) => ({ ...newGame(), inventory: inv, gold });
const withBag = (bag: ItemInstance[]) => ({ ...newGame(), bag, nextUid: Math.max(0, ...bag.map((it) => it.uid)) + 1 });

describe('shop', () => {
  it('sells materials for gold and records the sale', () => {
    const r = sell(withInv({ moss: 3 }), 'moss', 2);
    expect(r.ok && [r.state.gold, r.state.inventory.moss, r.state.sold.moss]).toEqual([150 + 12, 1, 2]);
  });
  it('refuses to sell what you do not have, or non-materials', () => {
    const s = withInv({ moss: 1 });
    expect(sell(s, 'moss', 2)).toEqual({ ok: false, reason: 'stock' });
    expect(sell(s, 'potion', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(sell(s, 'moss', 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(s.inventory.moss).toBe(1);
  });
  it('unlocks equipment once enough materials were sold', () => {
    let s = withInv({ moss: 3 });
    expect(isUnlocked(s, 'moss-charm')).toBe(false);
    expect(isUnlocked(s, 'iron-sword')).toBe(true);
    const r = sell(s, 'moss', 3);
    if (!r.ok) throw new Error('sell failed');
    s = r.state;
    expect(isUnlocked(s, 'moss-charm')).toBe(true);
  });
  it('buys items and unlocked equipment', () => {
    const r = buy(withInv({}), 'potion');
    expect(r.ok && [r.state.gold, r.state.inventory.potion]).toEqual([130, 1]);
  });
  it('refuses locked gear, unknown ids and purchases you cannot afford, leaving state unchanged', () => {
    const s = withInv({}, 10);
    expect(buy(s, 'moss-charm')).toEqual({ ok: false, reason: 'locked' });
    expect(buy(s, 'nope')).toEqual({ ok: false, reason: 'invalid' });
    expect(buy(s, 'potion')).toEqual({ ok: false, reason: 'gold' });
    expect(s.gold).toBe(10);
  });
});

describe('equipment', () => {
  it('equips from the bag and returns the old piece', () => {
    const a = equip(withBag([plainItem('iron-sword', 1), plainItem('thorn-spear', 2)]), 'scarlet', 1);
    if (!a.ok) throw new Error('equip failed');
    expect(a.state.party.roster.scarlet.equip.weapon?.base).toBe('iron-sword');
    expect(a.state.bag.map((it) => it.uid)).toEqual([2]);
    const b = equip(a.state, 'scarlet', 2);
    expect(b.ok && b.state.bag.map((it) => it.base)).toEqual(['iron-sword']);
  });
  it('refuses missing stock and unknown gear', () => {
    expect(equip(withBag([]), 'scarlet', 1)).toEqual({ ok: false, reason: 'stock' });
    expect(equip(withBag([plainItem('iron-sword', 1)]), 'nobody' as never, 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(equip(withBag([{ ...plainItem('iron-sword', 1), base: 'nope' }]), 'scarlet', 1)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('unequips and clamps HP to the new maximum', () => {
    const a = equip(withBag([plainItem('moss-charm', 1)]), 'scarlet', 1);
    if (!a.ok) throw new Error('equip failed');
    a.state.party.roster.scarlet.hp = 63;
    const b = unequip(a.state, 'scarlet', 'neck');
    expect(b.ok && [b.state.party.roster.scarlet.hp, b.state.bag.map((it) => it.base)]).toEqual([48, ['moss-charm']]);
    expect(unequip(b.ok ? b.state : a.state, 'scarlet', 'neck')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('equip swaps through the bag; rings use defaultSlotFor unless a slot is given', () => {
    const r = (uid: number) => plainItem('copper-ring', uid);
    let s = withBag([r(1), r(2), r(3), plainItem('iron-sword', 4)]);
    const step = (res: ReturnType<typeof equip>) => { if (!res.ok) throw new Error(res.reason); return res.state; };
    s = step(equip(s, 'liz', 1));
    s = step(equip(s, 'liz', 2));
    expect([s.party.roster.liz.equip.ring1?.uid, s.party.roster.liz.equip.ring2?.uid]).toEqual([1, 2]);
    s = step(equip(s, 'liz', 3));                                 // both full: ring1 is swapped
    expect([s.party.roster.liz.equip.ring1?.uid, s.party.roster.liz.equip.ring2?.uid]).toEqual([3, 2]);
    expect(s.bag.map((it) => it.uid).sort()).toEqual([1, 4]);
    s = step(equip(s, 'liz', 1, 'ring2'));                        // the chosen slot is swapped
    expect([s.party.roster.liz.equip.ring1?.uid, s.party.roster.liz.equip.ring2?.uid]).toEqual([3, 1]);
    expect(s.bag.map((it) => it.uid).sort()).toEqual([2, 4]);
    expect(equip(s, 'liz', 4, 'ring1')).toEqual({ ok: false, reason: 'invalid' });   // a sword is not a ring
    expect(equip(s, 'liz', 2, 'neck')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('one uid cannot be worn twice', () => {
    const s = withBag([plainItem('copper-ring', 7)]);
    const a = equip(s, 'liz', 7, 'ring1');
    if (!a.ok) throw new Error('equip failed');
    expect(equip(a.state, 'liz', 7, 'ring2')).toEqual({ ok: false, reason: 'stock' });
    expect(equip(a.state, 'noel', 7)).toEqual({ ok: false, reason: 'stock' });
    expect(a.state.party.roster.liz.equip.ring2).toBeUndefined();
  });
  it('a full bag refuses unequip', () => {
    const fill = Array.from({ length: BAG_SIZE }, (_, i) => plainItem('iron-sword', 100 + i));
    const a = equip(withBag([plainItem('moss-charm', 1), ...fill.slice(1)]), 'scarlet', 1);
    if (!a.ok) throw new Error('equip failed');
    a.state.bag.push(fill[0]);
    expect(a.state.bag).toHaveLength(BAG_SIZE);
    expect(unequip(a.state, 'scarlet', 'neck')).toEqual({ ok: false, reason: 'full' });
    expect(a.state.party.roster.scarlet.equip.neck?.uid).toBe(1);
  });
  it('mints uids in order', () => {
    const s = withBag([]);
    expect([mintUid(s), mintUid(s), s.nextUid]).toEqual([1, 2, 3]);
  });
});

describe('inn', () => {
  it('charges by level and restores the living to full', () => {
    const s = newGame();
    s.party.roster.scarlet.hp = 3;
    s.party.roster.noel.tp = 0;
    s.party.roster.liz.hp = 0;
    expect(innCost(s.party)).toBe(20);
    const r = rest(s);
    if (!r.ok) throw new Error('rest failed');
    expect(r.state.gold).toBe(130);
    expect(r.state.party.roster.scarlet.hp).toBe(48);
    expect(r.state.party.roster.noel.tp).toBe(30);
    expect(r.state.party.roster.liz.hp).toBe(0);
  });
  it('refuses to rest without gold', () => {
    expect(rest({ ...newGame(), gold: 5 })).toEqual({ ok: false, reason: 'gold' });
  });
  it('revives a fallen member at full HP for a fee', () => {
    const s = newGame();
    s.party.roster.liz.hp = 0;
    const r = revive(s, 'liz');
    expect(r.ok && [r.state.gold, r.state.party.roster.liz.hp]).toEqual([150 - reviveCost(1), statsOf(s.party.roster.liz).hp]);
    expect(revive(newGame(), 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(revive({ ...s, gold: 0 }, 'liz')).toEqual({ ok: false, reason: 'gold' });
  });
});

describe('useFieldItem', () => {
  it('heals a living member and uses one item', () => {
    const s = newGame();
    s.party.roster.liz.hp = 5;
    const r = useFieldItem(s, 'potion', 'liz');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.party.roster.liz.hp).toBe(Math.min(statsOf(r.state.party.roster.liz).hp, 65));
    expect(r.state.inventory.potion).toBe(2);
    expect(s.party.roster.liz.hp).toBe(5);
  });
  it('revives only the fallen at half HP and refuses wrong targets or an empty stock', () => {
    const s = newGame();
    s.inventory.phoenix = 1;
    expect(useFieldItem(s, 'phoenix', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    s.party.roster.liz.hp = 0;
    const r = useFieldItem(s, 'phoenix', 'liz');
    expect(r.ok && r.state.party.roster.liz.hp).toBe(Math.floor(statsOf(s.party.roster.liz).hp * 0.5));
    expect(useFieldItem(s, 'potion', 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(useFieldItem({ ...s, inventory: {} }, 'potion', 'noel')).toEqual({ ok: false, reason: 'stock' });
    expect(useFieldItem(s, 'return-lamp', 'noel')).toEqual({ ok: false, reason: 'invalid' });
  });
});
