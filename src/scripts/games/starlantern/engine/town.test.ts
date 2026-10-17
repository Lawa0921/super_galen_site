import { describe, it, expect } from 'vitest';
import { newGame, START_ITEMS } from './state';
import { buy, equip, innCost, isUnlocked, junkTotals, respec, respecCost, rest, revive, reviveCost, sell, sellGear, sellJunk, setAutoJunk, sortBagIn, toggleJunk, unequip, useFieldItem } from './town';
import { statsOf, LEGACY_LINEUP } from './party';
import { defaultTalents, defaultTree, newTree, raiseTalent, skillPointsLeft, talentPointsLeft, validBuild } from './progression';
import type { Member } from './types';
import { plainItem } from './testing';
import { BAG_SIZE, mintUid } from './loot/bag';
import { sellPrice } from './loot/item';
import { EQUIPMENT } from '../data/equipment';
import type { ItemInstance } from './types';

const withInv = (inv: Record<string, number>, gold = 150) => ({ ...newGame(undefined, 0, LEGACY_LINEUP), inventory: inv, gold });
const withBag = (bag: ItemInstance[]) => ({ ...newGame(undefined, 0, LEGACY_LINEUP), bag, nextUid: Math.max(0, ...bag.map((it) => it.uid)) + 1 });

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
    const s = newGame(undefined, 0, LEGACY_LINEUP);
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
    expect(rest({ ...newGame(undefined, 0, LEGACY_LINEUP), gold: 5 })).toEqual({ ok: false, reason: 'gold' });
  });
  it('revives a fallen member at full HP for a fee', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    s.party.roster.liz.hp = 0;
    const r = revive(s, 'liz');
    expect(r.ok && [r.state.gold, r.state.party.roster.liz.hp]).toEqual([150 - reviveCost(1), statsOf(s.party.roster.liz).hp]);
    expect(revive(newGame(undefined, 0, LEGACY_LINEUP), 'liz')).toEqual({ ok: false, reason: 'invalid' });
    expect(revive({ ...s, gold: 0 }, 'liz')).toEqual({ ok: false, reason: 'gold' });
  });
});

describe('useFieldItem', () => {
  it('heals a living member and uses one item', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    s.party.roster.liz.hp = 5;
    const r = useFieldItem(s, 'potion', 'liz');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.party.roster.liz.hp).toBe(Math.min(statsOf(r.state.party.roster.liz).hp, 65));
    expect(r.state.inventory.potion).toBe(START_ITEMS.potion - 1);
    expect(s.party.roster.liz.hp).toBe(5);
  });
  it('revives only the fallen at half HP and refuses wrong targets or an empty stock', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
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

describe('buying and selling gear', () => {
  it('buying a base puts a common item of that base and level in the bag', () => {
    const s = { ...newGame(undefined, 0, LEGACY_LINEUP), nextUid: 7 };
    const r = buy(s, 'iron-sword');
    if (!r.ok) throw new Error('buy failed');
    expect(r.state.bag).toEqual([{ uid: 7, base: 'iron-sword', rarity: 'common', ilvl: EQUIPMENT['iron-sword'].ilvl, affixes: [], enhance: 0 }]);
    expect(r.state.nextUid).toBe(8);
    expect(r.state.gold).toBe(150 - EQUIPMENT['iron-sword'].price);
    expect(r.state.inventory['iron-sword']).toBeUndefined();
    expect(s.bag).toEqual([]);
    expect(s.nextUid).toBe(7);
  });
  it('a full bag refuses buying and charges nothing', () => {
    const s = withBag(Array.from({ length: BAG_SIZE }, (_, i) => plainItem('iron-sword', i + 1)));
    expect(buy(s, 'iron-sword')).toEqual({ ok: false, reason: 'full' });
    expect(buy(s, 'potion').ok).toBe(true);   // consumables do not use the bag
    expect(s.gold).toBe(150);
  });
  it('selling gear pays sellPrice and does not count toward unlocks', () => {
    const rare = { ...plainItem('iron-sword', 1), rarity: 'rare' as const, ilvl: 12 };
    const s = withBag([rare, plainItem('copper-ring', 2), plainItem('thorn-spear', 3)]);
    const r = sellGear(s, [1, 3]);
    if (!r.ok) throw new Error('sell failed');
    expect(r.state.gold).toBe(150 + sellPrice(rare) + sellPrice(plainItem('thorn-spear', 3)));
    expect(r.state.bag.map((it) => it.uid)).toEqual([2]);
    expect(r.state.sold).toEqual({});
    expect(sellGear(s, [1, 99])).toEqual({ ok: false, reason: 'stock' });
    expect(sellGear(s, [1, 1])).toEqual({ ok: false, reason: 'invalid' });
    expect(sellGear(s, [])).toEqual({ ok: false, reason: 'invalid' });
    expect(s.bag).toHaveLength(3);
  });
  it('junk toggles; sorting reorders the bag', () => {
    const s = withBag([plainItem('copper-ring', 1), { ...plainItem('iron-sword', 2), rarity: 'rare' as const }]);
    const a = toggleJunk(s, 1);
    if (!a.ok) throw new Error('toggle failed');
    expect(a.state.bag[0].junk).toBe(true);
    const b = toggleJunk(a.state, 1);
    if (!b.ok) throw new Error('toggle failed');
    expect(b.state.bag[0].junk).toBeFalsy();
    expect(toggleJunk(s, 99)).toEqual({ ok: false, reason: 'stock' });
    const m = setAutoJunk(s, 'magic');
    expect(m.ok && m.state.autoJunk).toBe('magic');
    expect(setAutoJunk(s, 'all' as never)).toEqual({ ok: false, reason: 'invalid' });
    const o = sortBagIn(s, 'rarity');
    expect(o.ok && o.state.bag.map((it) => it.uid)).toEqual([2, 1]);
  });
});

describe('respec', () => {
  const lv10 = (): Member => ({ ...newGame(undefined, 0, LEGACY_LINEUP).party.roster.scarlet, level: 10, tree: newTree('scarlet'), talents: {} });
  /** A Lv10 Scarlet who has spent every skill and talent point, on the default build. */
  const spent = (): Member => ({ ...lv10(), tree: defaultTree('scarlet', 10), talents: defaultTalents('scarlet', 10) });
  /** A Lv10 Scarlet whose only spent point is one rank of an hp talent. */
  const hpOnly = (): Member => {
    const r = raiseTalent(lv10(), 'scarlet-t01');
    if (!r.ok) throw new Error('no hp talent');
    return r.member;
  };
  const hpOnlyFull = (): Member => { const m = hpOnly(); m.hp = statsOf(m).hp; return m; };
  const gameWith = (m: Member, gold: number) => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    s.party.roster.scarlet = m;
    s.gold = gold;
    return s;
  };

  it('respec costs 25 G per level and refunds every point', () => {
    const m = spent();
    expect(Object.keys(m.tree).length).toBeGreaterThan(1);
    expect(Object.keys(m.talents).length).toBeGreaterThan(0);
    expect(skillPointsLeft(m)).toBe(0);
    const r = respec(gameWith(m, 300), 'scarlet');
    if (!r.ok) throw new Error('respec failed');
    const after = r.state.party.roster.scarlet;
    expect(respecCost(10)).toBe(250);
    expect(r.state.gold).toBe(300 - respecCost(10));
    expect(after.tree).toEqual(newTree('scarlet'));
    expect(after.talents).toEqual({});
    expect(skillPointsLeft(after)).toBeGreaterThan(0);
    expect(talentPointsLeft(after)).toBe(talentPointsLeft(lv10()));
  });
  it('respec clamps HP and TP to the lower maximum', () => {
    const base: Member = { ...newGame(undefined, 0, LEGACY_LINEUP).party.roster.noel, level: 10, tree: newTree('noel'), talents: {} };
    let m = base;
    for (const node of ['noel-t01', 'noel-t11']) {   // t11 is a tp talent, reached through t01
      const r = raiseTalent(m, node);
      if (!r.ok) throw new Error(`cannot raise ${node}: ${r.reason}`);
      m = r.member;
    }
    expect(statsOf(m).tp).toBeGreaterThan(statsOf(base).tp);
    m.hp = statsOf(m).hp; m.tp = statsOf(m).tp;
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    s.party.roster.noel = m;
    s.gold = 300;
    if (!s.party.recruited.includes('noel')) s.party.recruited.push('noel');
    const r = respec(s, 'noel');
    if (!r.ok) throw new Error('respec failed');
    const after = r.state.party.roster.noel;
    expect(statsOf(after).tp).toBeLessThan(m.tp);
    expect(after.tp).toBe(statsOf(after).tp);
    const h = respec(gameWith(hpOnlyFull(), 300), 'scarlet');
    if (!h.ok) throw new Error('respec failed');
    expect(h.state.party.roster.scarlet.hp).toBe(statsOf(h.state.party.roster.scarlet).hp);
    expect(statsOf(h.state.party.roster.scarlet).hp).toBeLessThan(hpOnlyFull().hp);
  });
  it('respec is refused without gold or with nothing spent, and costs nothing then', () => {
    const m = spent();
    const poor = gameWith(m, 249);
    expect(respec(poor, 'scarlet')).toEqual({ ok: false, reason: 'gold' });
    expect(poor.gold).toBe(249);
    expect(poor.party.roster.scarlet.talents).toEqual(m.talents);
    const fresh = newGame(undefined, 0, LEGACY_LINEUP);
    expect(respec(fresh, 'scarlet')).toEqual({ ok: false, reason: 'invalid' });
    expect(fresh.gold).toBe(150);
    expect(respec(gameWith(m, 999), 'nobody' as never)).toEqual({ ok: false, reason: 'invalid' });
  });
  it('skill ranks alone, without talents, count as spent', () => {
    const m = { ...spent(), talents: {} };
    const r = respec(gameWith(m, 300), 'scarlet');
    expect(r.ok && r.state.party.roster.scarlet.tree).toEqual(newTree('scarlet'));
    expect(respec(gameWith(hpOnly(), 300), 'scarlet').ok).toBe(true);   // talents alone count too
  });
  it('refuses a roster member who is not recruited', () => {
    const s = newGame(undefined, 0, LEGACY_LINEUP);
    const out = (Object.keys(s.party.roster) as (keyof typeof s.party.roster)[]).find((id) => !s.party.recruited.includes(id))!;
    s.party.roster[out].talents = { [`${out}-t01`]: 1 };
    expect(respec(s, out)).toEqual({ ok: false, reason: 'invalid' });
    expect(s.gold).toBe(150);
  });
  it('keeps equipment and the rest of the member, and the reset build is a legal one', () => {
    const m = spent();
    m.equip.weapon = plainItem('iron-sword', 1);
    const r = respec(gameWith(m, 300), 'scarlet');
    if (!r.ok) throw new Error('respec failed');
    const after = r.state.party.roster.scarlet;
    expect(after.equip).toEqual(m.equip);
    expect([after.level, after.exp]).toEqual([m.level, m.exp]);
    expect(validBuild('scarlet', after.level, after.tree, after.talents)).toBe(true);
  });
});

describe('sellJunk', () => {
  it('sellJunk sells only junk and counts it as sold', () => {
    const r = sellJunk(withInv({ moss: 3, 'old-coin': 2 }));
    expect(r.ok && [r.state.gold, r.state.inventory.moss, r.state.inventory['old-coin'] ?? 0, r.state.sold['old-coin'], r.state.sold.moss]).toEqual([150 + 80, 3, 0, 2, undefined]);
  });
  it('sellJunk without junk is refused', () => {
    expect(sellJunk(withInv({ moss: 3 }))).toEqual({ ok: false, reason: 'stock' });
  });
  it('junkTotals counts each junk id, its units and its price, and nothing else', () => {
    expect(junkTotals(withInv({ moss: 3, 'old-coin': 2, potion: 1 }))).toEqual({ n: 2, g: 80, lines: [{ id: 'old-coin', n: 2, g: 80 }] });
    expect(junkTotals(withInv({ moss: 3, 'old-coin': 0 }))).toEqual({ n: 0, g: 0, lines: [] });
  });
  it('sellJunk pays exactly what junkTotals adds up', () => {
    const s = withInv({ moss: 3, 'old-coin': 5 });
    const r = sellJunk(s);
    expect(r.ok && r.state.gold - s.gold).toBe(junkTotals(s).g);
  });
});
