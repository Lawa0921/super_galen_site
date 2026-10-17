import { describe, it, expect } from 'vitest';
import { newGame, type GameState } from '../state';
import { plainItem } from '../testing';
import { BASE_RECIPES, CONSUMABLE_RECIPES, CRAFT_MAGIC_CHANCE, SET_RECIPE, baseGold } from '../../data/forge';
import { GEAR_SLOTS, SETS, SPECIALS } from '../../data/gear';
import { ITEMS } from '../../data/items';
import { MATERIALS } from '../../data/materials';
import { REGIONS } from '../../data/regions';
import { EQUIPMENT } from '../../data/equipment';
import { BAG_SIZE } from '../loot/bag';
import { MAX_ILVL, MAX_REACHED, depthLevel } from '../levels';
import { itemLevel, itemSlot } from '../loot/item';
import { isUnlocked, sell } from '../town';
import { craftBase, craftItem, craftLevel, craftSet, baseCost, itemRecipeCost, setCost } from './craft';

const stocked = (): Record<string, number> => Object.fromEntries(Object.keys(MATERIALS).map((m) => [m, 500]));
const rich = (): GameState => {
  const s = newGame();
  s.gold = 100000;
  s.inventory = stocked();
  return s;
};
const fullBag = (s: GameState): GameState => ({ ...s, bag: Array.from({ length: BAG_SIZE }, (_, i) => plainItem('moss-charm', i + 1)), nextUid: 1000 });
const piece = 'set-blaze-weapon';

describe('craftItem', () => {
  it('crafting potions takes the recipe times qty and adds to the inventory', () => {
    const s = newGame();
    s.gold = 100;
    s.inventory = { moss: 10, potion: 1 };
    const r = craftItem(s, 'potion', 3);
    const rec = CONSUMABLE_RECIPES.potion;
    expect(r.ok && r.state.gold).toBe(100 - rec.gold * 3);
    expect(r.ok && r.state.inventory.moss).toBe(10 - rec.mats.moss * 3);
    expect(r.ok && r.state.inventory.potion).toBe(4);
    expect(r.ok && r.out).toEqual({ id: 'potion', qty: 3 });
    expect(s.gold).toBe(100);
    expect(s.forgeDraws).toBe(0);
    expect(r.ok && r.state.forgeDraws).toBe(0);
  });
  it('refuses bad qty and unknown recipes as invalid, and what it cannot pay for', () => {
    const s = rich();
    const snap = structuredClone(s);
    for (const q of [0, -1, 1.5, NaN]) expect(craftItem(s, 'potion', q)).toEqual({ ok: false, reason: 'invalid' });
    expect(craftItem(s, 'nope', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(craftItem(s, 'toString', 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(craftItem({ ...s, gold: 0 }, 'potion', 1)).toEqual({ ok: false, reason: 'gold' });
    expect(craftItem({ ...s, inventory: {} }, 'potion', 1)).toEqual({ ok: false, reason: 'mats' });
    expect(itemRecipeCost('potion', 0)).toBeNull();
    expect(s).toEqual(snap);
  });
  it('every consumable recipe is cheaper than the shop, in gold and in selling value of the whole recipe', () => {
    for (const id of Object.keys(CONSUMABLE_RECIPES)) {
      const rec = itemRecipeCost(id, 1)!;
      const price = ITEMS[id].price;
      expect(itemRecipeCost(id, 3), id).toEqual({ gold: rec.gold * 3, mats: Object.fromEntries(Object.entries(rec.mats).map(([m, n]) => [m, n * 3])) });
      const matValue = Object.entries(rec.mats).reduce((sum, [m, n]) => sum + MATERIALS[m].price * n, 0);
      expect(rec.gold, id).toBeLessThan(price);
      expect(rec.gold + matValue, id).toBeLessThan(price);
    }
    expect(Object.keys(CONSUMABLE_RECIPES).sort()).toEqual(['antidote', 'ether', 'phoenix', 'potion', 'return-lamp']);
  });
});

describe('craftLevel', () => {
  it('follows the deepest depth reached in any region: itemLevel(max reached, monster)', () => {
    const s = newGame();
    expect(craftLevel(s)).toBe(2);
    expect(craftLevel(s)).toBe(itemLevel(1, 'monster'));
    s.dungeon.reached.frost = 10;
    s.dungeon.reached.mainline = 4;
    expect(craftLevel(s)).toBe(itemLevel(10, 'monster'));
    expect(craftLevel(s)).toBe(38);
    s.dungeon.reached.iron = 15;
    expect(craftLevel(s)).toBe(58);
  });
  it('is clamped to MAX_REACHED so a hostile reached value cannot inflate it', () => {
    const s = newGame();
    s.dungeon.reached.blaze = 1e9;
    expect(craftLevel(s)).toBe(depthLevel(MAX_REACHED));
    expect(craftLevel(s)).toBeLessThanOrEqual(MAX_ILVL);
    s.dungeon.reached.blaze = MAX_REACHED;
    expect(craftLevel(s)).toBe(depthLevel(MAX_REACHED));
    const set = craftSet({ ...rich(), dungeon: { ...s.dungeon } }, piece);
    expect(set.ok && set.out.item.ilvl).toBeLessThanOrEqual(MAX_ILVL);
  });
});

describe('craftBase', () => {
  it('costs BASE_RECIPES plus baseGold(craftLevel) and puts a minted-uid item in the bag', () => {
    const s = newGame();
    s.dungeon.reached.blaze = 10;
    s.nextUid = 77;
    s.gold = 1000;
    s.inventory = { 'thorn-fang': 5, 'star-stone': 1 };
    expect(baseCost(s, 'weapon')).toEqual({ gold: baseGold(38), mats: BASE_RECIPES.weapon });
    const r = craftBase(s, 'weapon');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.gold).toBe(1000 - baseGold(38));
    expect(r.state.inventory).toEqual({ 'thorn-fang': 2 });
    expect(r.out.item.uid).toBe(77);
    expect(r.state.nextUid).toBe(78);
    expect(r.state.bag).toEqual([r.out.item]);
    expect(r.out.item.ilvl).toBe(38);
    expect(itemSlot(r.out.item)).toBe('weapon');
    expect(s.bag).toEqual([]);
    expect(s.gold).toBe(1000);
  });
  it('craftLevel at depth 1 gives ilvl 2', () => {
    const r = craftBase(rich(), 'ring');
    expect(r.ok && r.out.item.ilvl).toBe(2);
  });
  it("crafting spends materials but never the shop's sold tally", () => {
    let s = rich();
    const sold = sell(s, 'thorn-fang', 5);
    if (!sold.ok) throw new Error('sell');
    s = sold.state;
    const before = isUnlocked(s, 'thorn-gauntlets');
    const r = craftBase(s, 'weapon');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.inventory['thorn-fang']).toBe(495 - BASE_RECIPES.weapon['thorn-fang']);
    expect(r.state.sold['thorn-fang']).toBe(5);
    expect(r.state.sold).toEqual(s.sold);
    expect(isUnlocked(r.state, 'thorn-gauntlets')).toBe(before);
    const c = craftItem(r.state, 'return-lamp', 1);
    expect(c.ok && c.state.sold).toEqual(s.sold);
  });
  it('a crafted base is common or magic, in the chosen slot, at craftLevel; magic about CRAFT_MAGIC_CHANCE of the time', () => {
    const N = 2000;
    let s = rich();
    s.dungeon.reached.storm = 6;
    let magic = 0;
    for (let i = 0; i < N; i++) {
      s.bag = [];
      s.gold = 100000;
      s.inventory = stocked();
      const slot = GEAR_SLOTS[i % GEAR_SLOTS.length];
      const r = craftBase(s, slot);
      if (!r.ok) throw new Error(r.reason);
      expect(['common', 'magic']).toContain(r.out.item.rarity);
      expect(itemSlot(r.out.item)).toBe(slot);
      expect(r.out.item.ilvl).toBe(craftLevel(s));
      if (r.out.item.rarity === 'magic') magic++;
      s = r.state;
    }
    expect(s.forgeDraws).toBe(N);
    const sigma = Math.sqrt(N * CRAFT_MAGIC_CHANCE * (1 - CRAFT_MAGIC_CHANCE));
    expect(Math.abs(magic - N * CRAFT_MAGIC_CHANCE)).toBeLessThan(4 * sigma);
    expect(magic).toBeGreaterThan(0);
  });
  it('moves forgeDraws exactly once, and not at all on a refusal or with an injected rng', () => {
    const s = rich();
    const r = craftBase(s, 'head');
    expect(r.ok && r.state.forgeDraws).toBe(1);
    expect(s.forgeDraws).toBe(0);
    const inj = craftBase(s, 'head', () => 0.9);
    expect(inj.ok && inj.state.forgeDraws).toBe(0);
    expect(inj.ok && inj.out.item.rarity).toBe('common');
    const mg = craftBase(s, 'head', () => 0.1);
    expect(mg.ok && mg.out.item.rarity).toBe('magic');
    const snap = structuredClone(s);
    const poor = { ...s, gold: 0 };
    const bare = { ...s, inventory: {} };
    expect(craftBase(poor, 'head')).toEqual({ ok: false, reason: 'gold' });
    expect(craftBase(bare, 'head')).toEqual({ ok: false, reason: 'mats' });
    expect(craftBase(s, 'bogus' as never)).toEqual({ ok: false, reason: 'invalid' });
    expect(poor.gold).toBe(0);
    expect(bare.inventory).toEqual({});
    expect(s).toEqual(snap);
    expect(s.forgeDraws).toBe(0);
  });
});

describe('craftSet', () => {
  it('a set piece costs setCost and enters the codex with its set', () => {
    const s = newGame();
    s.gold = 1000;
    s.inventory = { 'blaze-core': 9, 'star-tear': 2 };
    s.dungeon.reached.mainline = 5;
    s.nextUid = 50;
    expect(setCost(piece)).toEqual({ gold: SET_RECIPE.gold, mats: { 'blaze-core': SET_RECIPE.regionQty, 'star-tear': SET_RECIPE.rareQty } });
    const r = craftSet(s, piece);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.gold).toBe(1000 - 300);
    expect(r.state.inventory).toEqual({ 'blaze-core': 1, 'star-tear': 1 });
    expect(r.out.item).toMatchObject({ uid: 50, rarity: 'set', special: piece, ilvl: craftLevel(s) });
    expect(r.out.item.ilvl).toBe(18);
    expect(r.out.item.affixes.map((a) => a.key)).toEqual(SPECIALS[piece].fixed);
    expect(EQUIPMENT[r.out.item.base].slot).toBe(SPECIALS[piece].slot);
    expect(r.state.bag).toEqual([r.out.item]);
    expect(r.state.nextUid).toBe(51);
    expect(r.state.codex).toEqual([piece, 'set-blaze']);
    expect(r.state.forgeDraws).toBe(1);
    const again = craftSet({ ...r.state, inventory: { 'blaze-core': 9, 'star-tear': 2 }, gold: 1000 }, piece);
    expect(again.ok && again.state.codex).toEqual([piece, 'set-blaze']);
  });
  it('every set piece prices its own region material', () => {
    for (const set of Object.values(SETS)) for (const p of set.pieces) {
      expect(setCost(p)?.mats[REGIONS[set.region].material!]).toBe(SET_RECIPE.regionQty);
    }
  });
  it('setCost of a non-set id is null and craftSet refuses it as invalid', () => {
    const unique = Object.values(SPECIALS).find((x) => x.rarity === 'unique')!;
    for (const id of ['potion', 'set-blaze', 'nope', 'toString', '', unique.id]) {
      expect(setCost(id), id).toBeNull();
      expect(craftSet(rich(), id), id).toEqual({ ok: false, reason: 'invalid' });
    }
  });
  it('refuses what it cannot pay for, and accepts exactly enough', () => {
    const s = rich();
    const snap = structuredClone(s);
    expect(craftSet({ ...s, gold: 299 }, piece)).toEqual({ ok: false, reason: 'gold' });
    expect(craftSet({ ...s, inventory: { 'blaze-core': 8 } }, piece)).toEqual({ ok: false, reason: 'mats' });
    expect(craftSet({ ...s, inventory: { 'blaze-core': 7, 'star-tear': 1 } }, piece)).toEqual({ ok: false, reason: 'mats' });
    expect(s).toEqual(snap);
    expect(craftSet({ ...s, gold: 300, inventory: { 'blaze-core': 8, 'star-tear': 1 } }, piece).ok).toBe(true);
  });
});

describe('a full bag', () => {
  it('refuses craftBase and craftSet and spends nothing', () => {
    const s = fullBag(rich());
    const snap = structuredClone(s);
    expect(craftBase(s, 'weapon')).toEqual({ ok: false, reason: 'full' });
    expect(craftSet(s, piece)).toEqual({ ok: false, reason: 'full' });
    expect(craftSet({ ...s, gold: 0 }, piece)).toEqual({ ok: false, reason: 'full' });
    expect(craftSet(s, 'potion')).toEqual({ ok: false, reason: 'invalid' });
    expect(s).toEqual(snap);
    expect(craftBase({ ...s, gold: 0 }, 'weapon')).toEqual({ ok: false, reason: 'full' });
    expect(craftBase({ ...s, bag: s.bag.slice(1) }, 'weapon').ok).toBe(true);
  });
});
