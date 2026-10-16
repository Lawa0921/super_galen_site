// inventory.test.ts
import { describe, it, expect } from 'vitest';
import { Inventory, starterInventory } from './inventory';
import { RECIPES, canCraft, craft, availableRecipes, findRecipe } from './crafting';
import { INV_SIZE, HOTBAR_SIZE, MAX_STACK } from './constants';

describe('Inventory', () => {
  it('40 格、前 10 格為快捷欄', () => {
    const inv = new Inventory();
    expect(inv.slots.length).toBe(INV_SIZE);
    expect(HOTBAR_SIZE).toBe(10);
    expect(inv.selected).toBe(0);
  });
  it('add 先疊到既有堆，再放進第一個空格；上限 999', () => {
    const inv = new Inventory();
    expect(inv.add('dirt', 5)).toBe(0);
    expect(inv.add('stone', 1)).toBe(0);
    expect(inv.add('dirt', 3)).toBe(0);
    expect(inv.slots[0]).toEqual({ item: 'dirt', count: 8 });
    expect(inv.slots[1]).toEqual({ item: 'stone', count: 1 });
    inv.add('dirt', MAX_STACK);
    expect(inv.slots[0]?.count).toBe(MAX_STACK);
    expect(inv.slots[2]).toEqual({ item: 'dirt', count: 8 });
    expect(inv.count('dirt')).toBe(MAX_STACK + 8);
  });
  it('工具不可堆疊', () => {
    const inv = new Inventory();
    inv.add('wood_pickaxe', 2);
    expect(inv.slots[0]).toEqual({ item: 'wood_pickaxe', count: 1 });
    expect(inv.slots[1]).toEqual({ item: 'wood_pickaxe', count: 1 });
  });
  it('背包滿時回傳剩餘數量', () => {
    const inv = new Inventory();
    for (let i = 0; i < INV_SIZE; i++) inv.slots[i] = { item: 'wood_pickaxe', count: 1 };
    expect(inv.add('dirt', 4)).toBe(4);
    expect(inv.canAdd('dirt', 1)).toBe(false);
  });
  it('remove 是全有或全無，數量歸零時清空格子', () => {
    const inv = new Inventory();
    inv.add('planks', 3);
    expect(inv.remove('planks', 5)).toBe(false);
    expect(inv.count('planks')).toBe(3);
    expect(inv.remove('planks', 3)).toBe(true);
    expect(inv.slots[0]).toBeNull();
  });
  it('select 範圍限制在快捷欄；selectedStack', () => {
    const inv = new Inventory();
    inv.add('dirt', 2);
    inv.select(12);
    expect(inv.selected).toBe(0);
    inv.select(9);
    expect(inv.selected).toBe(9);
    inv.select(0);
    expect(inv.selectedStack()).toEqual({ item: 'dirt', count: 2 });
  });
  it('bestPick 取背包內最好的鎬；takeFromSlot', () => {
    const inv = new Inventory();
    expect(inv.bestPick()).toBeNull();
    inv.add('wood_pickaxe', 1);
    inv.add('copper_pickaxe', 1);
    expect(inv.bestPick()?.speed).toBe(2);
    inv.add('torch', 3);
    expect(inv.takeFromSlot(2, 1)).toBe(true);
    expect(inv.slots[2]?.count).toBe(2);
  });
  it('toJSON / fromJSON 往返，無效項目被丟棄', () => {
    const inv = starterInventory();
    inv.select(1);
    const j = JSON.parse(JSON.stringify(inv.toJSON()));
    const back = Inventory.fromJSON(j);
    expect(back.slots).toEqual(inv.slots);
    expect(back.selected).toBe(1);
    const bad = Inventory.fromJSON({ slots: [{ item: 'nope', count: 3 }, { item: 'dirt', count: -1 }], selected: 99 });
    expect(bad.slots[0]).toBeNull();
    expect(bad.slots[1]).toBeNull();
    expect(bad.selected).toBe(0);
  });
  it('初始背包：木鎬 + 10 火把', () => {
    const inv = starterInventory();
    expect(inv.count('wood_pickaxe')).toBe(1);
    expect(inv.count('torch')).toBe(10);
  });
});

describe('crafting', () => {
  const free = { nearWorkbench: false };
  const bench = { nearWorkbench: true };
  it('配方表包含計畫中的 5 道', () => {
    const ids = RECIPES.map((r) => r.id).sort();
    expect(ids).toEqual(['copper_pickaxe', 'iron_pickaxe', 'planks', 'torch', 'workbench'].sort());
    expect(findRecipe('planks')?.out).toEqual({ item: 'planks', n: 4 });
  });
  it('徒手：1 wood → 4 planks，消耗與產出', () => {
    const inv = new Inventory();
    inv.add('wood', 2);
    expect(craft(inv, 'planks', free)).toEqual({ ok: true });
    expect(inv.count('wood')).toBe(1);
    expect(inv.count('planks')).toBe(4);
  });
  it('材料不足失敗且不消耗', () => {
    const inv = new Inventory();
    inv.add('planks', 9);
    expect(craft(inv, 'workbench', free)).toEqual({ ok: false, reason: 'missing' });
    expect(inv.count('planks')).toBe(9);
  });
  it('wood → 3 torch；10 planks → workbench', () => {
    const inv = new Inventory();
    inv.add('wood', 1); inv.add('planks', 10);
    expect(craft(inv, 'torch', free).ok).toBe(true);
    expect(inv.count('torch')).toBe(3);
    expect(craft(inv, 'workbench', free).ok).toBe(true);
    expect(inv.count('workbench')).toBe(1);
    expect(inv.count('planks')).toBe(0);
  });
  it('銅鎬需要工作台在附近', () => {
    const inv = new Inventory();
    inv.add('planks', 5); inv.add('copper_ore', 8);
    expect(canCraft(inv, findRecipe('copper_pickaxe')!, free)).toBe(false);
    expect(craft(inv, 'copper_pickaxe', free)).toEqual({ ok: false, reason: 'station' });
    expect(craft(inv, 'copper_pickaxe', bench)).toEqual({ ok: true });
    expect(inv.count('copper_pickaxe')).toBe(1);
    expect(inv.count('copper_ore')).toBe(0);
  });
  it('背包滿且產出放不下 → full，不消耗', () => {
    const inv = new Inventory();
    for (let i = 0; i < INV_SIZE; i++) inv.slots[i] = { item: 'wood_pickaxe', count: 1 };
    inv.slots[5] = { item: 'wood', count: 5 }; // 扣 1 木材後仍佔格 → 木板沒地方放
    expect(craft(inv, 'planks', free)).toEqual({ ok: false, reason: 'full' });
    expect(inv.count('wood')).toBe(5);
  });
  it('未知配方', () => {
    expect(craft(new Inventory(), 'nope', free)).toEqual({ ok: false, reason: 'unknown' });
  });
  it('availableRecipes 依材料與工作台過濾', () => {
    const inv = new Inventory();
    inv.add('wood', 1);
    expect(availableRecipes(inv, free).map((r) => r.id).sort()).toEqual(['planks', 'torch']);
  });
});
