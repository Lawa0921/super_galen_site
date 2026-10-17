// crafting.ts — 配方表與合成。station = 需在該合成站 STATION_RANGE 格內：
//   workbench 工作台（木 / 銅裝備、基本物件）、furnace 熔爐（礦 → 錠）、anvil 鐵砧（鐵 / 金 / 骸衛 / 熔心裝備、高階武器）。
import { Inventory } from './inventory';
import type { ItemId } from './items';

export type Station = 'workbench' | 'furnace' | 'anvil';
export interface ItemAmount { item: ItemId; n: number; }
export interface Recipe {
  id: string;
  out: ItemAmount;
  inputs: readonly ItemAmount[];
  station: Station | null;
}
export interface CraftContext { nearWorkbench: boolean; nearFurnace?: boolean; nearAnvil?: boolean; }
export type CraftResult = { ok: true } | { ok: false; reason: 'unknown' | 'missing' | 'station' | 'full' };
export const STATION_NAME: Record<Station, string> = { workbench: '工作台', furnace: '熔爐', anvil: '鐵砧' };

const r = (id: string, out: ItemId, n: number, station: Station | null, ...inputs: [ItemId, number][]): Recipe =>
  ({ id, out: { item: out, n }, inputs: inputs.map(([item, k]) => ({ item, n: k })), station });

export const RECIPES: readonly Recipe[] = [
  r('planks', 'planks', 4, null, ['wood', 1]),
  r('torch', 'torch', 3, null, ['wood', 1]),
  r('workbench', 'workbench', 1, null, ['planks', 10]),
  // 鎬：銅鎬在工作台（錠來自熔爐），鐵以上要鐵砧
  r('copper_pickaxe', 'copper_pickaxe', 1, 'workbench', ['planks', 4], ['copper_bar', 5]),
  r('iron_pickaxe', 'iron_pickaxe', 1, 'anvil', ['planks', 4], ['iron_bar', 6]),
  r('silver_pickaxe', 'silver_pickaxe', 1, 'anvil', ['planks', 4], ['silver_bar', 7]),
  r('gold_pickaxe', 'gold_pickaxe', 1, 'anvil', ['planks', 4], ['gold_bar', 8]),
  r('chest', 'chest', 1, 'workbench', ['planks', 8], ['iron_ore', 2]),
  r('stone_brick', 'stone_brick', 2, 'workbench', ['stone', 2]),
  r('torch_crystal', 'torch', 6, null, ['wood', 1], ['crystal', 1]),
  r('torch_gel', 'torch', 5, null, ['wood', 1], ['gel', 1]),
  r('silver_coin', 'silver_coin', 1, null, ['copper_coin', 100]),
  r('platform', 'platform', 2, null, ['planks', 1]),
  r('wooden_door', 'wooden_door', 1, 'workbench', ['planks', 6]),
  // ── 探索工具 ──
  r('rope', 'rope', 8, null, ['wood', 1]),
  r('bed', 'bed', 1, 'workbench', ['planks', 15]),
  r('recall_stone', 'recall_stone', 1, 'workbench', ['crystal', 3], ['stone', 20]),
  r('compass', 'compass', 1, 'workbench', ['iron_ore', 6], ['copper_ore', 2]),
  r('depth_meter', 'depth_meter', 1, 'workbench', ['copper_ore', 8], ['stone', 10]),
  // ── 合成站 ──
  r('furnace', 'furnace', 1, 'workbench', ['stone', 20], ['wood', 4], ['torch', 3]),
  r('anvil', 'anvil', 1, 'workbench', ['iron_bar', 5]),
  // ── 熔爐：礦 → 錠 ──
  r('copper_bar', 'copper_bar', 1, 'furnace', ['copper_ore', 3]),
  r('iron_bar', 'iron_bar', 1, 'furnace', ['iron_ore', 3]),
  r('silver_bar', 'silver_bar', 1, 'furnace', ['silver_ore', 4]),
  r('gold_bar', 'gold_bar', 1, 'furnace', ['gold_ore', 4]),
  r('molten_bar', 'molten_bar', 1, 'furnace', ['magma_rock', 3], ['obsidian', 1], ['ember', 1]),
  // ── 武器 ──
  r('wood_sword', 'wood_sword', 1, 'workbench', ['planks', 7]),
  r('copper_sword', 'copper_sword', 1, 'workbench', ['copper_bar', 6]),
  r('iron_sword', 'iron_sword', 1, 'anvil', ['iron_bar', 7]),
  r('gold_sword', 'gold_sword', 1, 'anvil', ['gold_bar', 8]),
  r('iron_spear', 'iron_spear', 1, 'anvil', ['iron_bar', 6], ['planks', 3]),
  r('wood_bow', 'wood_bow', 1, 'workbench', ['wood', 10]),
  r('silver_bow', 'silver_bow', 1, 'anvil', ['silver_bar', 7]),
  r('throwing_knife', 'throwing_knife', 15, 'anvil', ['iron_bar', 1]),
  r('wood_boomerang', 'wood_boomerang', 1, 'workbench', ['wood', 12], ['gel', 3]),
  r('crystal_staff', 'crystal_staff', 1, 'anvil', ['crystal', 8], ['gold_bar', 4]),
  r('wooden_arrow', 'wooden_arrow', 10, 'workbench', ['wood', 1], ['stone', 1]),
  r('wooden_arrow_f', 'wooden_arrow', 15, 'workbench', ['wood', 1], ['feather', 1]),
  r('flaming_arrow', 'flaming_arrow', 5, null, ['wooden_arrow', 5], ['torch', 1]),
  // ── 防具 ──
  r('wood_helmet', 'wood_helmet', 1, 'workbench', ['planks', 15]),
  r('wood_chestplate', 'wood_chestplate', 1, 'workbench', ['planks', 20]),
  r('wood_greaves', 'wood_greaves', 1, 'workbench', ['planks', 18]),
  r('copper_helmet', 'copper_helmet', 1, 'workbench', ['copper_bar', 8]),
  r('copper_chestplate', 'copper_chestplate', 1, 'workbench', ['copper_bar', 12]),
  r('copper_greaves', 'copper_greaves', 1, 'workbench', ['copper_bar', 10]),
  r('iron_helmet', 'iron_helmet', 1, 'anvil', ['iron_bar', 10]),
  r('iron_chestplate', 'iron_chestplate', 1, 'anvil', ['iron_bar', 15]),
  r('iron_greaves', 'iron_greaves', 1, 'anvil', ['iron_bar', 12]),
  r('gold_helmet', 'gold_helmet', 1, 'anvil', ['gold_bar', 12]),
  r('gold_chestplate', 'gold_chestplate', 1, 'anvil', ['gold_bar', 18]),
  r('gold_greaves', 'gold_greaves', 1, 'anvil', ['gold_bar', 15]),
  r('bone_helmet', 'bone_helmet', 1, 'anvil', ['bone', 20], ['iron_bar', 4]),
  r('bone_chestplate', 'bone_chestplate', 1, 'anvil', ['bone', 30], ['iron_bar', 6]),
  r('bone_greaves', 'bone_greaves', 1, 'anvil', ['bone', 25], ['iron_bar', 5]),
  r('molten_helmet', 'molten_helmet', 1, 'anvil', ['molten_bar', 10]),
  r('molten_chestplate', 'molten_chestplate', 1, 'anvil', ['molten_bar', 15]),
  r('molten_greaves', 'molten_greaves', 1, 'anvil', ['molten_bar', 12]),
  // ── 消耗品 / 飾品 / 首領 ──
  r('life_core', 'life_core', 1, 'anvil', ['crystal', 4], ['gold_bar', 2]),
  r('healing_potion', 'healing_potion', 2, 'workbench', ['mushroom', 1], ['gel', 2]),
  r('healing_potion_s', 'healing_potion', 3, 'workbench', ['spore', 1], ['gel', 1]),
  r('wick_offering', 'wick_offering', 1, 'anvil', ['glow_mushroom', 6], ['gel', 5], ['gold_bar', 3]),
  r('chitin_buckler', 'chitin_buckler', 1, 'anvil', ['chitin', 10], ['iron_bar', 4]),
  r('fang_charm', 'fang_charm', 1, 'anvil', ['fang', 6], ['silver_bar', 3]),
  r('feather_charm', 'feather_charm', 1, 'workbench', ['feather', 10], ['gel', 5]),
];

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((q) => q.id === id);
}

function hasInputs(inv: Inventory, rc: Recipe): boolean {
  return rc.inputs.every((a) => inv.has(a.item, a.n));
}
export function stationOk(rc: Recipe, ctx: CraftContext): boolean {
  switch (rc.station) {
    case null: return true;
    case 'workbench': return ctx.nearWorkbench;
    case 'furnace': return Boolean(ctx.nearFurnace);
    case 'anvil': return Boolean(ctx.nearAnvil);
  }
}

export function canCraft(inv: Inventory, rc: Recipe, ctx: CraftContext): boolean {
  return stationOk(rc, ctx) && hasInputs(inv, rc);
}

export function availableRecipes(inv: Inventory, ctx: CraftContext): Recipe[] {
  return RECIPES.filter((q) => canCraft(inv, q, ctx));
}

/** 合成一次。失敗時背包不變。 */
export function craft(inv: Inventory, recipeId: string, ctx: CraftContext): CraftResult {
  const rc = findRecipe(recipeId);
  if (!rc) return { ok: false, reason: 'unknown' };
  if (!stationOk(rc, ctx)) return { ok: false, reason: 'station' };
  if (!hasInputs(inv, rc)) return { ok: false, reason: 'missing' };
  // 先在副本上試，確保產出放得下才提交
  const trial = Inventory.fromJSON(inv.toJSON());
  for (const a of rc.inputs) trial.remove(a.item, a.n);
  if (trial.add(rc.out.item, rc.out.n) > 0) return { ok: false, reason: 'full' };
  inv.slots = trial.slots;
  return { ok: true };
}
