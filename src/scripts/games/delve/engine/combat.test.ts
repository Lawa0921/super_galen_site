// combat.test.ts — 武器 / 防具 / 飾品資料表、裝備欄、戰鬥數值公式、合成站（熔爐 / 鐵砧）
import { describe, it, expect } from 'vitest';
import { ITEMS, ARMOR_SETS, type ItemId } from './items';
import { Equipment, ACC_SLOTS } from './equipment';
import { gearPower, type Gear } from './gear';
import { computeStats, damageTaken, enemyDamage, rollCrit, knockbackScale, SET_BONUS } from './combat';
import { RECIPES, findRecipe, craft } from './crafting';
import { Inventory } from './inventory';
import { Rng } from './rng';

const ids = Object.keys(ITEMS) as ItemId[];

describe('武器表', () => {
  it('至少 10 把武器，涵蓋劍 / 矛或闊劍 / 弓 / 投擲或迴旋 / 法杖', () => {
    const weapons = ids.filter((i) => ITEMS[i].weapon);
    expect(weapons.length).toBeGreaterThanOrEqual(10);
    const kinds = new Set(weapons.map((i) => ITEMS[i].weapon!.kind));
    for (const k of ['sword', 'spear', 'broadsword', 'bow', 'throw', 'boomerang', 'staff'] as const) expect(kinds.has(k), k).toBe(true);
    // 劍有等級：木 < 銅 < 鐵 < 金
    const d = (i: ItemId): number => ITEMS[i].weapon!.damage;
    expect(d('wood_sword')).toBeLessThan(d('copper_sword'));
    expect(d('copper_sword')).toBeLessThan(d('iron_sword'));
    expect(d('iron_sword')).toBeLessThan(d('gold_sword'));
    // 獨特掉落
    expect(weapons.filter((i) => ITEMS[i].unique).length).toBeGreaterThanOrEqual(2);
    // 法杖耗魔、弓要箭
    expect(ITEMS.crystal_staff.weapon!.mana).toBeGreaterThan(0);
    expect(ITEMS.wood_bow.weapon!.ammo).toBe('arrow');
    expect(ITEMS.flaming_arrow.ammo?.flame).toBe(true);
    for (const w of weapons) {
      const wd = ITEMS[w].weapon!;
      expect(wd.useTime, w).toBeGreaterThan(0.1);
      expect(wd.crit, w).toBeGreaterThanOrEqual(0);
      expect(ITEMS[w].name.zh.length).toBeGreaterThan(0);
    }
  });
});

describe('防具表', () => {
  it('六套防具（木 / 銅 / 鐵 / 金 / 骸衛 / 熔心）各有頭身腿，防禦隨等級提高', () => {
    expect(Object.keys(ARMOR_SETS)).toEqual(['wood', 'copper', 'iron', 'gold', 'bone', 'molten']);
    let prev = 0;
    for (const set of Object.keys(ARMOR_SETS) as (keyof typeof ARMOR_SETS)[]) {
      const pieces = ARMOR_SETS[set];
      expect(pieces.map((p) => ITEMS[p].armor!.slot)).toEqual(['head', 'body', 'legs']);
      const total = pieces.reduce((a, p) => a + ITEMS[p].armor!.defense, 0);
      expect(total, set).toBeGreaterThan(prev);
      prev = total;
      for (const p of pieces) expect(ITEMS[p].armor!.set).toBe(set);
      expect(SET_BONUS[set].text.length).toBeGreaterThan(0);
    }
  });
});

describe('裝備欄', () => {
  it('防具只能進對應槽、飾品進飾品槽、同一飾品不能裝兩個', () => {
    const e = new Equipment();
    expect(ACC_SLOTS).toBeGreaterThanOrEqual(3);
    expect(ACC_SLOTS).toBeLessThanOrEqual(5);
    expect(e.canEquip('head', 'copper_helmet')).toBe(true);
    expect(e.canEquip('body', 'copper_helmet')).toBe(false);
    expect(e.canEquip('acc0', 'jump_boots')).toBe(true);
    expect(e.canEquip('acc0', 'copper_helmet')).toBe(false);
    expect(e.canEquip('head', 'dirt')).toBe(false);
    e.set('acc0', 'jump_boots');
    expect(e.canEquip('acc1', 'jump_boots')).toBe(false);
    expect(e.has('jump_boots')).toBe(true);
  });
  it('toJSON / fromJSON 往返；不合法項目丟掉', () => {
    const e = new Equipment();
    e.set('head', 'gold_helmet'); e.set('acc2', 'magnet');
    const j = e.toJSON();
    expect(Equipment.fromJSON(j).toJSON()).toEqual(j);
    const bad = Equipment.fromJSON({ head: 'dirt', body: 'nope', acc: ['magnet', 'magnet', 'gold_helmet'] });
    expect(bad.toJSON()).toEqual({ head: null, body: null, legs: null, acc: ['magnet', null, null, null, null].slice(0, ACC_SLOTS) });
  });
  it('從背包裝上 / 卸下（交換、背包滿不能卸下）', () => {
    const inv = new Inventory();
    const e = new Equipment();
    inv.add('copper_helmet', 1); inv.add('iron_helmet', 1);
    expect(e.equipFrom(inv, 0, 'head')).toBe(true);
    expect(e.get('head')).toBe('copper_helmet');
    expect(inv.slots[0]).toBeNull();
    expect(e.equipFrom(inv, 1, 'head')).toBe(true); // 交換：舊頭盔回到背包那格
    expect(e.get('head')).toBe('iron_helmet');
    expect(inv.slots[1]).toEqual({ item: 'copper_helmet', count: 1 });
    expect(e.equipFrom(inv, 1, 'body')).toBe(false);
    for (let i = 0; i < inv.slots.length; i++) if (!inv.slots[i]) inv.slots[i] = { item: 'dirt', count: 999 };
    expect(e.unequipTo(inv, 'head')).toBe(false);
    inv.slots[5] = null;
    expect(e.unequipTo(inv, 'head')).toBe(true);
    expect(e.get('head')).toBeNull();
  });
  it('autoSlot：防具找對應槽，飾品找第一個空的飾品槽', () => {
    const e = new Equipment();
    expect(e.autoSlot('iron_chestplate')).toBe('body');
    expect(e.autoSlot('magnet')).toBe('acc0');
    e.set('acc0', 'magnet');
    expect(e.autoSlot('jump_boots')).toBe('acc1');
    expect(e.autoSlot('dirt')).toBeNull();
  });
  const G = (rarity: number, tiers: number[], plus = 0): Gear => ({ rarity, ilvl: 5, plus, affixes: tiers.map((t) => ({ id: 'hale' as const, tier: t, value: 5 * t })) });
  it('gearPower：沒有詞條 = 0；稀有度 / 詞條階數 / 強化越高越強；傳奇詞條算很多', () => {
    expect(gearPower(undefined)).toBe(0);
    expect(gearPower(G(2, [2, 2]))).toBeGreaterThan(gearPower(G(1, [2])));
    expect(gearPower(G(2, [3, 3]))).toBeGreaterThan(gearPower(G(2, [1, 1])));
    expect(gearPower(G(2, [3, 3], 4))).toBeGreaterThan(gearPower(G(2, [3, 3])));
    const uniq: Gear = { rarity: 4, ilvl: 5, plus: 0, affixes: [{ id: 'skyleap', tier: 5, value: 1 }] };
    expect(gearPower(uniq)).toBeGreaterThan(gearPower(G(3, [2, 2])));
  });
  it('autoSlot：飾品槽都滿了 → 換掉詞條最弱的那格（同分取前面）；比較對象就是那格', () => {
    const e = new Equipment();
    const items = ['compass', 'depth_meter', 'jump_boots', 'swift_boots', 'night_amulet'] as const;
    const power = [G(3, [3, 3, 3]), G(2, [2, 2]), G(1, [1]), G(4, [4, 4, 4]), G(1, [1])];
    items.forEach((it, k) => e.set(`acc${k}` as 'acc0', it, power[k]));
    expect(e.autoSlot('magnet')).toBe('acc2');
    expect(e.compareTarget('magnet')).toEqual({ slot: 'acc2', stack: e.getStack('acc2'), weakest: true });
    // 有空槽：裝進空槽、沒有比較對象
    e.set('acc1', null);
    expect(e.autoSlot('magnet')).toBe('acc1');
    expect(e.compareTarget('magnet')).toEqual({ slot: 'acc1', stack: null, weakest: false });
    // 已經裝著同一件：比較那一件（換裝 = 換掉它）
    expect(e.compareTarget('jump_boots')).toEqual({ slot: 'acc2', stack: e.getStack('acc2'), weakest: false });
    // 防具：同部位
    e.set('head', 'copper_helmet');
    expect(e.compareTarget('iron_helmet')).toEqual({ slot: 'head', stack: e.getStack('head'), weakest: false });
    expect(e.compareTarget('dirt')).toBeNull();
  });
});

describe('戰鬥數值', () => {
  it('防禦 = 防具總和 + 套裝加成 + 飾品；暴擊與傷害加成', () => {
    const e = new Equipment();
    expect(computeStats(e).defense).toBe(0);
    for (const p of ARMOR_SETS.copper) e.set(ITEMS[p].armor!.slot, p);
    const sum = ARMOR_SETS.copper.reduce((a, p) => a + ITEMS[p].armor!.defense, 0);
    const s = computeStats(e);
    expect(s.setBonus).toBe('copper');
    expect(s.defense).toBe(sum + SET_BONUS.copper.defense);
    e.set('acc0', 'chitin_buckler');
    expect(computeStats(e).defense).toBe(s.defense + ITEMS.chitin_buckler.stats!.defense!);
    e.set('acc1', 'fang_charm');
    expect(computeStats(e).crit).toBeGreaterThan(s.crit);
    e.set('body', 'iron_chestplate'); // 混搭 → 沒有套裝
    expect(computeStats(e).setBonus).toBeNull();
  });
  it('受傷 = 原始傷害 − 防禦/2，至少 1', () => {
    expect(damageTaken(20, 0)).toBe(20);
    expect(damageTaken(20, 10)).toBe(15);
    expect(damageTaken(5, 40)).toBe(1);
    expect(enemyDamage(12, 4)).toBe(10);
    expect(enemyDamage(1, 50)).toBe(1);
  });
  it('暴擊以種子亂數決定、機率接近設定值', () => {
    const r = new Rng('crit');
    let n = 0;
    for (let i = 0; i < 4000; i++) if (rollCrit(0.25, r)) n++;
    expect(n / 4000).toBeGreaterThan(0.22);
    expect(n / 4000).toBeLessThan(0.28);
    expect(rollCrit(0, new Rng('x'))).toBe(false);
  });
  it('擊退抗性', () => {
    expect(knockbackScale(200, 0)).toBe(200);
    expect(knockbackScale(200, 0.5)).toBe(100);
    expect(knockbackScale(200, 1)).toBe(0);
  });
});

describe('合成站與錠', () => {
  it('熔爐把礦熔成錠；鐵砧用錠做高階裝備；鎬改用錠', () => {
    expect(findRecipe('copper_bar')!.station).toBe('furnace');
    expect(findRecipe('gold_bar')!.inputs.some((a) => a.item === 'gold_ore')).toBe(true);
    expect(findRecipe('anvil')!.inputs.some((a) => a.item === 'iron_bar')).toBe(true);
    expect(findRecipe('iron_pickaxe')!.station).toBe('anvil');
    expect(findRecipe('copper_pickaxe')!.inputs.some((a) => a.item === 'copper_bar')).toBe(true);
    expect(findRecipe('gold_helmet')!.station).toBe('anvil');
    expect(findRecipe('wood_helmet')!.station).toBe('workbench');
    expect(findRecipe('wick_offering')).toBeDefined();
    expect(findRecipe('life_core')).toBeDefined();
  });
  it('每件武器 / 防具（獨特掉落除外）都有配方', () => {
    const made = new Set(RECIPES.map((r) => r.out.item));
    for (const i of ids) {
      const d = ITEMS[i];
      if ((d.weapon || d.armor || d.ammo) && !d.unique) expect(made.has(i), i).toBe(true);
    }
  });
  it('需要正確的合成站', () => {
    const inv = new Inventory();
    inv.add('copper_ore', 6);
    expect(craft(inv, 'copper_bar', { nearWorkbench: true }).ok).toBe(false);
    expect(craft(inv, 'copper_bar', { nearWorkbench: false, nearFurnace: true }).ok).toBe(true);
    expect(inv.count('copper_bar')).toBe(1);
  });
});
