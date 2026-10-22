import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '../state';
import {
  BASE_RECIPES, CONSUMABLE_RECIPES, DISMANTLE, FUSE_GOLD, FUSE_NEXT, FUSE_SLOT_COST, SET_RECIPE, baseGold, setGold,
} from '../../data/forge';
import { GEAR_SLOTS, SETS } from '../../data/gear';
import { EQUIPMENT } from '../../data/equipment';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import { REGIONS } from '../../data/regions';
import { MAX_ILVL, MAX_REACHED } from '../levels';
import { sellPrice } from '../loot/item';
import { buy, sell, sellJunk } from '../town';
import type { ItemInstance, Rarity } from '../types';
import { craftBase, craftItem, craftLevel, craftSet, setCost } from './craft';
import { dismantle, fuse } from './forge';

// Value invariants of the forge economy: no loop between the shop, crafting, fusion and dismantling may turn
// inputs into more gold or essence value than they cost. Materials are valued at their sell price.

const matValue = (mats: Record<string, number>): number => Object.entries(mats).reduce((t, [id, n]) => t + MATERIALS[id].price * n, 0);
const shell = (rarity: Rarity, ilvl: number): ItemInstance => ({ uid: 0, base: 'iron-sword', rarity, ilvl, affixes: [], enhance: 0 });
/** The most a piece of gear can be turned into: its sell price or its essences at their sell price. */
const gearValue = (it: ItemInstance): number => Math.max(sellPrice(it), matValue(DISMANTLE[it.rarity]));
const ilvls = Array.from({ length: MAX_ILVL }, (_, i) => i + 1);
const stocked = (): Record<string, number> => Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 5000]));
const rich = (): GameState => {
  const s = newGame();
  s.gold = 10_000_000;
  s.inventory = stocked();
  return s;
};
/** What a state change spent: gold plus materials at their sell price. */
const spent = (a: GameState, b: GameState): number =>
  a.gold - b.gold + Object.keys(MATERIALS).reduce((t, id) => t + MATERIALS[id].price * ((a.inventory[id] ?? 0) - (b.inventory[id] ?? 0)), 0);

describe('crafting never pays more than its inputs', () => {
  it('a set piece: gold plus materials is worth more than the piece at every item level', () => {
    for (const set of Object.values(SETS)) {
      const mats = { [REGIONS[set.region].material!]: SET_RECIPE.regionQty, [SET_RECIPE.rare]: SET_RECIPE.rareQty };
      for (const L of ilvls) {
        const inputs = setGold(L) + matValue(mats);
        expect(inputs > gearValue(shell('set', L)), `${set.id} ilvl ${L}: ${inputs} vs ${gearValue(shell('set', L))}`).toBe(true);
      }
    }
  });
  it('a base: gold plus materials is worth more than either outcome (common or magic) at every item level', () => {
    for (const slot of GEAR_SLOTS) for (const L of ilvls) for (const rarity of ['common', 'magic'] as const) {
      const inputs = baseGold(L) + matValue(BASE_RECIPES[slot]);
      expect(inputs > gearValue(shell(rarity, L)), `${slot} ${rarity} ilvl ${L}: ${inputs} vs ${gearValue(shell(rarity, L))}`).toBe(true);
    }
  });
  it('the real craft at every reachable depth spends more than the crafted piece is worth', () => {
    for (let d = 1; d <= MAX_REACHED; d++) {
      const s = rich();
      s.dungeon.reached.mainline = d;
      const pieceId = SETS['set-blaze'].pieces[0];
      expect(setCost(s, pieceId)!.gold).toBe(setGold(craftLevel(s)));
      const set = craftSet(s, pieceId);
      expect(set.ok).toBe(true);
      if (set.ok) expect(spent(s, set.state) > gearValue(set.out.item), `set depth ${d}`).toBe(true);
      const base = craftBase(s, GEAR_SLOTS[d % GEAR_SLOTS.length]);
      expect(base.ok).toBe(true);
      if (base.ok) expect(spent(s, base.state) > gearValue(base.out.item), `base depth ${d}`).toBe(true);
    }
  });
});

describe('the shop, consumables and fusion create no value either', () => {
  it('every shop base costs more than it sells or dismantles for', () => {
    const s = rich();
    s.sold = Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 999]));
    for (const e of Object.values(EQUIPMENT)) {
      if (e.price === undefined) continue;
      const r = buy({ ...s, bag: [] }, e.id);
      expect(r.ok, e.id).toBe(true);
      if (!r.ok) continue;
      const it = r.state.bag[0];
      expect(e.price > gearValue(it), `${e.id}: ${e.price} vs ${gearValue(it)}`).toBe(true);
      const d = dismantle(r.state, [it.uid]);
      expect(d.ok && matValue(d.out.essences) < e.price, e.id).toBe(true);
    }
  });
  it('a crafted consumable can never be sold back: crafting it turns no gold or essence out', () => {
    for (const id of Object.keys(CONSUMABLE_RECIPES)) {
      expect(ITEMS[id], id).toBeDefined();
      expect(MATERIALS[id], id).toBeUndefined();
      const s = rich();
      const r = craftItem(s, id, 1);
      expect(r.ok, id).toBe(true);
      if (!r.ok) continue;
      expect(spent(s, r.state) > 0, id).toBe(true);
      expect(sell(r.state, id, 1)).toEqual({ ok: false, reason: 'invalid' });
      const junk = sellJunk(r.state);
      expect(junk.ok && junk.state.inventory[id]).toBe(r.ok && r.state.inventory[id]);
    }
  });
  it('fusing three pieces is worth less than selling or dismantling them, at every item level, slot chosen or not', () => {
    for (const from of Object.keys(FUSE_NEXT) as (keyof typeof FUSE_NEXT)[]) {
      const to = FUSE_NEXT[from];
      for (const L of ilvls) {
        const inputs = FUSE_GOLD[to] + 3 * gearValue(shell(from, L));
        const out = gearValue(shell(to, L));
        expect(inputs > out, `${from} -> ${to} ilvl ${L}: ${inputs} vs ${out}`).toBe(true);
        expect(inputs + matValue(FUSE_SLOT_COST[to]) > out).toBe(true);
      }
    }
  });
  it('the real fusion never yields an item above its inputs\' level or worth more than they and its cost', () => {
    for (const from of Object.keys(FUSE_NEXT) as (keyof typeof FUSE_NEXT)[]) {
      for (const lv of [[1, 1, 1], [1, 2, 900], [37, 38, 39], [MAX_ILVL, MAX_ILVL, MAX_ILVL - 1]]) {
        const s = rich();
        s.bag = lv.map((ilvl, i) => ({ ...shell(from, ilvl), uid: i + 1 }));
        s.nextUid = 10;
        const r = fuse(s, [1, 2, 3]);
        expect(r.ok, `${from} ${lv}`).toBe(true);
        if (!r.ok) continue;
        expect(r.out.item.ilvl).toBeLessThanOrEqual(Math.max(...lv));
        expect(spent(s, r.state) + s.bag.reduce((t, it) => t + gearValue(it), 0) > gearValue(r.out.item), `${from} ${lv}`).toBe(true);
      }
    }
  });
});
