import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { buy, equip, innCost, isUnlocked, rest, revive, reviveCost, sell, unequip } from './town';
import { statsOf } from './party';

const withInv = (inv: Record<string, number>, gold = 150) => ({ ...newGame(), inventory: inv, gold });

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
  it('equips from inventory and returns the old piece', () => {
    const a = equip(withInv({ 'iron-sword': 1, 'thorn-spear': 1 }), 'scarlet', 'iron-sword');
    if (!a.ok) throw new Error('equip failed');
    expect(a.state.party.roster.scarlet.equip.weapon).toBe('iron-sword');
    expect(a.state.inventory['iron-sword'] ?? 0).toBe(0);
    const b = equip(a.state, 'scarlet', 'thorn-spear');
    expect(b.ok && b.state.inventory['iron-sword']).toBe(1);
  });
  it('refuses missing stock and unknown gear', () => {
    expect(equip(withInv({}), 'scarlet', 'iron-sword')).toEqual({ ok: false, reason: 'stock' });
    expect(equip(withInv({ potion: 1 }), 'scarlet', 'potion')).toEqual({ ok: false, reason: 'invalid' });
  });
  it('unequips and clamps HP to the new maximum', () => {
    const a = equip(withInv({ 'moss-charm': 1 }), 'scarlet', 'moss-charm');
    if (!a.ok) throw new Error('equip failed');
    a.state.party.roster.scarlet.hp = 63;
    const b = unequip(a.state, 'scarlet', 'accessory');
    expect(b.ok && [b.state.party.roster.scarlet.hp, b.state.inventory['moss-charm']]).toEqual([48, 1]);
    expect(unequip(b.ok ? b.state : a.state, 'scarlet', 'accessory')).toEqual({ ok: false, reason: 'invalid' });
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
