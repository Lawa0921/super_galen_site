// tint.test.ts — 時裝物品的實例顏色（tint）：只有時裝能帶、跟著物品走過背包 / 箱子 / 掉落物 / 外觀欄 / 合成 / 存讀檔。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { FIXED_DT } from './constants';
import { VANITY_ITEMS, type ItemId } from './items';
import { isTintable, validTint, defaultTint } from './tint';
import { CLOTH_COLORS, OUTFITS } from './appearance';
import { saveSplitGame, restoreSplit, encodeWorld, decodeWorld } from '../save/worldSave';
import { encodeCharacter, decodeCharacter } from '../save/character';

const SMALL = { width: 160, height: 100 };
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'tint', ...SMALL, peaceful: true });
  g.levels.locked = true;
  const w = g.world;
  for (let i = 0; i < w.liquid.length; i++) { w.liquid[i] = 0; w.liquidType[i] = 0; }
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  g.teleport(60, 59);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void { for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT); }
const slotOf = (g: DelveGame, item: ItemId): number => g.inventory.slots.findIndex((s) => s?.item === item);
function saveLoad(g: DelveGame): DelveGame {
  const { world, character } = saveSplitGame(g, { id: 'c1', nick: 't', createdAt: 0, rev: 0 }, { worldId: 'w1', worldName: g.seed, visits: {} }, 1);
  const r = restoreSplit(decodeWorld(encodeWorld(world)), decodeCharacter(encodeCharacter(character)));
  if (!r.ok) throw new Error(r.message);
  return r.game;
}

describe('isTintable / validTint / defaultTint', () => {
  it('只有時裝能帶顏色', () => {
    for (const id of VANITY_ITEMS) expect(isTintable(id), id).toBe(true);
    expect(isTintable('iron_chestplate')).toBe(false);
    expect(isTintable('dirt')).toBe(false);
    expect(isTintable('wood_sword')).toBe(false);
  });
  it('validTint：兩個 CLOTH_COLORS 範圍內的整數', () => {
    expect(validTint([3, 7])).toEqual([3, 7]);
    expect(validTint([0, CLOTH_COLORS.length - 1])).toEqual([0, CLOTH_COLORS.length - 1]);
    for (const bad of [null, undefined, 3, [3], [3, 7, 1], [-1, 2], [1, CLOTH_COLORS.length], [1.5, 2], ['1', 2], {}]) expect(validTint(bad), JSON.stringify(bad)).toBeNull();
  });
  it('defaultTint：服裝 = 款式原色；不認得的 look = null', () => {
    expect(defaultTint('outfit:sailor')).toEqual(OUTFITS.find((o) => o.id === 'sailor')!.colors);
    expect(defaultTint('armor:iron')).toBeNull();
  });
});

describe('tint survives every move', () => {
  it('背包 → 箱子 → 取回 → 丟成掉落物 → 撿回 → 時裝欄穿上 → 脫下 → craft 無關配方 → 存檔來回，tint 仍是 [3, 7]', () => {
    const g = arena();
    const tintOf = (): unknown => g.inventory.slots[slotOf(g, 'sailor_top')]?.tint;
    expect(g.inventory.add('sailor_top', 1, undefined, [3, 7])).toBe(0);
    expect(tintOf()).toEqual([3, 7]);
    // 箱子
    g.world.setFg(62, 59, T.CHEST);
    expect(g.interact(62, 59)).toBe(true);
    expect(g.depositToChest(slotOf(g, 'sailor_top'))).toBe(true);
    expect(slotOf(g, 'sailor_top')).toBe(-1);
    const k = g.chestSlots()!.findIndex((s) => s?.item === 'sailor_top');
    expect(g.chestSlots()![k]!.tint).toEqual([3, 7]);
    expect(g.takeChestSlot(k)).toBe(true);
    expect(tintOf()).toEqual([3, 7]);
    g.closeChest();
    // 丟成掉落物 → 撿回
    const i = slotOf(g, 'sailor_top');
    expect(g.inventory.takeFromSlot(i, 1)).toBe(true);
    g.dropAtTile('sailor_top', 1, 63, 58, [3, 7]);
    const d = g.drops.list.find((x) => x.item === 'sailor_top')!;
    expect(d.tint).toEqual([3, 7]);
    run(g, 3);
    expect(g.drops.list.some((x) => x.item === 'sailor_top')).toBe(false);
    expect(tintOf()).toEqual([3, 7]);
    // 時裝欄穿上 → 紙娃娃用這個顏色 → 脫下
    expect(g.equipVanityFromInventory(slotOf(g, 'sailor_top'))).toBe(true);
    expect(g.vanity.getStack('body')!.tint).toEqual([3, 7]);
    expect(g.doll().look.body!.tint).toEqual([3, 7]);
    expect(g.unequipVanity('body')).toBe(true);
    expect(tintOf()).toEqual([3, 7]);
    // 合成一個無關的東西（craft 會把背包 toJSON / fromJSON 來回）
    g.world.setFg(58, 59, T.WORKBENCH);
    g.give('planks', 10);
    expect(g.craft('platform').ok).toBe(true);
    expect(tintOf()).toEqual([3, 7]);
    // 存檔來回（角色 + 世界拆檔、位元組編碼）
    const h = saveLoad(g);
    expect(h.inventory.slots[slotOf(h, 'sailor_top')]!.tint).toEqual([3, 7]);
  });
  it('箱子 / 地上 / 時裝欄裡帶顏色的時裝都存得回來', () => {
    const g = arena();
    g.world.setFg(62, 59, T.CHEST);
    g.interact(62, 59);
    g.inventory.add('beret', 1, undefined, [5, 2]);
    g.depositToChest(slotOf(g, 'beret'));
    g.closeChest();
    g.dropAtTile('travel_cape', 1, 80, 58, [6, 9]);
    g.inventory.add('maid_dress', 1, undefined, [1, 4]);
    g.equipVanityFromInventory(slotOf(g, 'maid_dress'));
    const h = saveLoad(g);
    expect(h.world.chests.get(h.world.idx(62, 59))!.find((s) => s?.item === 'beret')!.tint).toEqual([5, 2]);
    expect(h.drops.list.find((x) => x.item === 'travel_cape')!.tint).toEqual([6, 9]);
    expect(h.vanity.getStack('body')!.tint).toEqual([1, 4]);
    expect(h.doll().key).toBe(g.doll().key);
  });
  it('giveOrDrop：背包滿 → 帶顏色掉在腳邊', () => {
    const g = arena();
    for (let i = 0; i < g.inventory.slots.length; i++) g.inventory.slots[i] = { item: 'dirt', count: 999 };
    g.giveOrDrop('witch_hat', undefined, [0, 1]);
    expect(g.drops.list.find((x) => x.item === 'witch_hat')!.tint).toEqual([0, 1]);
    g.inventory.slots[5] = null;
    g.giveOrDrop('ribbon_bow', undefined, [2, 2]);
    expect(g.inventory.slots[5]).toEqual({ item: 'ribbon_bow', count: 1, tint: [2, 2] });
  });
  it('不同顏色的同款掉落物不合併', () => {
    const g = arena();
    g.dropAtTile('beret', 1, 80, 58, [1, 1]);
    g.dropAtTile('beret', 1, 80, 58, [2, 2]);
    g.dropAtTile('beret', 1, 80, 58);
    expect(g.drops.list.filter((x) => x.item === 'beret').map((x) => x.tint ?? null)).toEqual([[1, 1], [2, 2], null]);
  });
});
