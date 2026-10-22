import { describe, expect, it } from 'vitest';
import { RUNE_BUY, RUNE_FUSE_IN, RUNE_SELL, RUNE_STOCK } from '../data/runeEconomy';
import type { RuneRef } from '../data/runes';
import { PERKS } from '../data/story/fragments';
import { STANDARD_LINEUP } from './party';
import { buyRune, fuseCostOf, fuseRunes, runeBuyMax, runeBuyPrice, runeSellMax, runeSellPrice, runeStock, sellRunes } from './runeTrade';
import { bagCount } from './sockets';
import { newGame, type GameState } from './state';

const spread: RuneRef = { id: 'spread', tier: 'common' };
const spreadMagic: RuneRef = { id: 'spread', tier: 'magic' };

/** A game with runes open (unless `open` is false), this much gold and this bag. */
const game = (gold: number, runes: Record<string, number> = {}, open = true): GameState => {
  const s = newGame(undefined, 0, STANDARD_LINEUP);
  return { ...s, gold, runes, ...(open ? { runesOpen: true as const } : {}) };
};
const ok = (r: ReturnType<typeof buyRune>): GameState => {
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.state;
};
/** `n` of `r` socketed on Noel's skills (counts only; a test of the stack, not of the sockets' rules). */
const socketed = (s: GameState, r: RuneRef, n: number): GameState => {
  const noel = { ...s.party.roster.noel, sockets: Object.fromEntries(Array.from({ length: n }, (_, i) => [`skill-${i}`, [r]])) };
  return { ...s, party: { ...s.party, roster: { ...s.party.roster, noel } } };
};

describe('buying and selling runes (plan 8f Task 4)', () => {
  it('the shop sells four commons once runes are open', () => {
    const shut = game(1000, {}, false);
    expect(runeStock(shut)).toEqual([]);
    expect(buyRune(shut, spread)).toEqual({ ok: false, reason: 'closed' });
    expect(runeBuyPrice(shut, spread)).toBeUndefined();
    const open = game(1000);
    expect(runeStock(open)).toEqual(RUNE_STOCK.map((id) => ({ id, tier: 'common' })));
    expect(runeStock(open).map((r) => r.id)).toEqual(['spread', 'multistrike', 'thrift', 'extend']);
    expect(buyRune(open, spreadMagic)).toEqual({ ok: false, reason: 'invalid' });
    expect(buyRune(open, { id: 'bounce', tier: 'common' })).toEqual({ ok: false, reason: 'invalid' });
    expect(runeBuyPrice(open, { id: 'bounce', tier: 'common' })).toBeUndefined();
    for (const q of [0, 1.5, -1]) expect(buyRune(open, spread, q)).toEqual({ ok: false, reason: 'invalid' });
  });

  it("buying costs its price, with Orik's discount", () => {
    const s = game(150);
    const before = JSON.stringify(s);
    const one = ok(buyRune(s, spread));
    expect([one.gold, bagCount(one, spread)]).toEqual([50, 1]);
    expect(JSON.stringify(s)).toBe(before);
    const three = ok(buyRune(game(300), spread, 3));
    expect([three.gold, bagCount(three, spread)]).toEqual([0, 3]);
    const orik = game(300);
    orik.story = { ...orik.story, returned: ['orik'] };
    const price = Math.ceil(RUNE_BUY.common! * (100 - PERKS.shopDiscountPct) / 100);
    expect(price).toBe(90);
    expect(runeBuyPrice(orik, spread)).toBe(price);
    expect(ok(buyRune(orik, spread)).gold).toBe(300 - price);
    expect(buyRune(game(99), spread)).toEqual({ ok: false, reason: 'gold' });
    expect(buyRune(game(150), spread, 2)).toEqual({ ok: false, reason: 'gold' });
    const near = game(10000, { 'spread@common': 98 });
    expect(buyRune(near, spread, 2)).toEqual({ ok: false, reason: 'full' });
    expect(bagCount(ok(buyRune(near, spread, 1)), spread)).toBe(99);
    // The stack counts the socketed ones too.
    const worn = socketed(game(10000, { 'spread@common': 97 }), spread, 2);
    expect(buyRune(worn, spread)).toEqual({ ok: false, reason: 'full' });
  });

  it('the quantity box stops at the gold and the stack', () => {
    expect(runeBuyMax(game(450), spread)).toBe(4);
    const held = socketed(game(10000, { 'spread@common': 90 }), spread, 7);
    expect(runeBuyMax(held, spread)).toBe(2);
    expect(runeSellMax(held, spread)).toBe(90);
    expect(runeBuyMax(game(10000, {}, false), spread)).toBe(0);
    expect(runeBuyMax(game(10000), spreadMagic)).toBe(0);
    expect(runeBuyMax(game(10000, { 'spread@common': 99 }), spread)).toBe(0);
  });

  it('selling pays by tier and leaves the stack tidy', () => {
    expect(runeSellPrice(spreadMagic)).toBe(RUNE_SELL.magic);
    expect(runeSellPrice({ id: 'twin-cast', tier: 'legendary' })).toBe(500);
    const s = game(0, { 'spread@magic': 3, 'bounce@rare': 1 });
    const sold = ok(sellRunes(s, spreadMagic, 2));
    expect([sold.gold, sold.runes]).toEqual([120, { 'spread@magic': 1, 'bounce@rare': 1 }]);
    const all = ok(sellRunes(sold, spreadMagic, 1));
    expect(all.runes).toEqual({ 'bounce@rare': 1 });
    expect(all.gold).toBe(180);
    for (const q of [0, 1.5, -1]) expect(sellRunes(s, spreadMagic, q)).toEqual({ ok: false, reason: 'invalid' });
    expect(sellRunes(s, spreadMagic, 4)).toEqual({ ok: false, reason: 'stock' });
    // Selling needs no open runes: what is in the bag can always go.
    expect(ok(sellRunes(game(0, { 'bounce@rare': 1 }, false), { id: 'bounce', tier: 'rare' }, 1)).gold).toBe(150);
    // Orik's discount is for buying only.
    const orik = game(0, { 'spread@magic': 1 });
    orik.story = { ...orik.story, returned: ['orik'] };
    expect(ok(sellRunes(orik, spreadMagic, 1)).gold).toBe(60);
  });

  it('socketed runes are not for sale', () => {
    const s = socketed(game(0, {}), spreadMagic, 1);
    expect(sellRunes(s, spreadMagic, 1)).toEqual({ ok: false, reason: 'stock' });
    expect(runeSellMax(s, spreadMagic)).toBe(0);
    const both = socketed(game(0, { 'spread@magic': 1 }), spreadMagic, 1);
    expect(sellRunes(both, spreadMagic, 2)).toEqual({ ok: false, reason: 'stock' });
    const one = ok(sellRunes(both, spreadMagic, 1));
    expect(one.party.roster.noel.sockets).toEqual(both.party.roster.noel.sockets);
    expect(one.runes).toEqual({});
  });
});

describe('fusing runes (plan 8f Task 5)', () => {
  /** A game with this bag, gold and essences (runes need not be open to fuse). */
  const forge = (runes: Record<string, number>, gold: number, essences: Record<string, number> = {}): GameState => {
    const s = game(gold, runes, false);
    return { ...s, inventory: { ...s.inventory, ...essences } };
  };
  const fused = (r: ReturnType<typeof fuseRunes>) => {
    if (!r.ok) throw new Error(`refused: ${r.reason}`);
    return r;
  };

  it('three of a kind make one of the next tier', () => {
    expect(RUNE_FUSE_IN).toBe(3);
    const s = forge({ 'spread@common': 4 }, 100, { 'essence-common': 2 });
    const before = JSON.stringify(s);
    const r = fused(fuseRunes(s, spread));
    expect(r.made).toEqual(spreadMagic);
    expect(r.state.runes).toEqual({ 'spread@common': 1, 'spread@magic': 1 });
    expect([r.state.gold, r.state.inventory['essence-common']]).toEqual([70, 1]);
    expect(JSON.stringify(s)).toBe(before);
    // The last essence goes from the inventory; three of three leave no key behind.
    const rare = fused(fuseRunes(forge({ 'bounce@rare': 3 }, 250, { 'essence-rare': 1 }), { id: 'bounce', tier: 'rare' }));
    expect(rare.made).toEqual({ id: 'bounce', tier: 'epic' });
    expect([rare.state.gold, rare.state.inventory['essence-rare'], rare.state.runes]).toEqual([50, undefined, { 'bounce@epic': 1 }]);
    const magic = fused(fuseRunes(forge({ 'focus@magic': 3 }, 80, { 'essence-magic': 1 }), { id: 'focus', tier: 'magic' }));
    expect([magic.made, magic.state.gold]).toEqual([{ id: 'focus', tier: 'rare' }, 0]);
    expect(fuseCostOf(spread)).toEqual({ to: spreadMagic, gold: 30, essence: 'essence-common' });
    expect(fuseCostOf({ id: 'spread', tier: 'epic' })).toBeUndefined();
    expect(fuseCostOf({ id: 'twin-cast', tier: 'legendary' })).toBeUndefined();
  });

  it('fusion refuses with a reason', () => {
    const cases: [GameState, RuneRef, string][] = [
      [forge({ 'spread@epic': 3 }, 9999, { 'essence-rare': 9 }), { id: 'spread', tier: 'epic' }, 'top'],
      [forge({ 'twin-cast@legendary': 3 }, 9999, { 'essence-legendary': 9 }), { id: 'twin-cast', tier: 'legendary' }, 'top'],
      [forge({ 'spread@common': 2 }, 9999, { 'essence-common': 9 }), spread, 'stock'],
      [forge({ 'spread@common': 3 }, 29, { 'essence-common': 9 }), spread, 'gold'],
      [forge({ 'spread@common': 3 }, 9999, {}), spread, 'essence'],
      [forge({ 'spread@common': 3, 'spread@magic': 99 }, 9999, { 'essence-common': 9 }), spread, 'full'],
    ];
    for (const [s, r, reason] of cases) {
      const before = JSON.stringify(s);
      expect(fuseRunes(s, r), reason).toEqual({ ok: false, reason });
      expect(JSON.stringify(s)).toBe(before);
    }
    // Socketed ones of the next tier count toward its 99.
    const worn = socketed(forge({ 'spread@common': 3, 'spread@magic': 98 }, 9999, { 'essence-common': 9 }), spreadMagic, 1);
    expect(fuseRunes(worn, spread)).toEqual({ ok: false, reason: 'full' });
  });

  it('fusion takes from the bag only', () => {
    const s = socketed(forge({ 'spread@common': 2 }, 9999, { 'essence-common': 9 }), spread, 1);
    expect(fuseRunes(s, spread)).toEqual({ ok: false, reason: 'stock' });
    const more = socketed(forge({ 'spread@common': 3 }, 9999, { 'essence-common': 9 }), spread, 2);
    const r = fused(fuseRunes(more, spread));
    expect(r.state.runes).toEqual({ 'spread@magic': 1 });
    expect(r.state.party.roster.noel.sockets).toEqual(more.party.roster.noel.sockets);
  });

  it('fusion draws nothing', () => {
    const s = { ...forge({ 'spread@common': 6 }, 100, { 'essence-common': 2 }), forgeDraws: 7, forgeSalt: 1234 };
    const a = fused(fuseRunes(s, spread));
    const b = fused(fuseRunes(s, spread));
    expect(a).toEqual(b);
    expect([a.state.forgeDraws, a.state.forgeSalt]).toEqual([7, 1234]);
  });
});
