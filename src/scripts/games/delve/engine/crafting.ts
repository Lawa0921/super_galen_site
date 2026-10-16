// crafting.ts — 配方表與合成。station = 'workbench' 表示需在工作台 STATION_RANGE 格內。
import { Inventory } from './inventory';
import type { ItemId } from './items';

export interface ItemAmount { item: ItemId; n: number; }
export interface Recipe {
  id: string;
  out: ItemAmount;
  inputs: readonly ItemAmount[];
  station: 'workbench' | null;
}
export interface CraftContext { nearWorkbench: boolean; }
export type CraftResult = { ok: true } | { ok: false; reason: 'unknown' | 'missing' | 'station' | 'full' };

export const RECIPES: readonly Recipe[] = [
  { id: 'planks', out: { item: 'planks', n: 4 }, inputs: [{ item: 'wood', n: 1 }], station: null },
  { id: 'torch', out: { item: 'torch', n: 3 }, inputs: [{ item: 'wood', n: 1 }], station: null },
  { id: 'workbench', out: { item: 'workbench', n: 1 }, inputs: [{ item: 'planks', n: 10 }], station: null },
  { id: 'copper_pickaxe', out: { item: 'copper_pickaxe', n: 1 }, inputs: [{ item: 'planks', n: 5 }, { item: 'copper_ore', n: 8 }], station: 'workbench' },
  { id: 'iron_pickaxe', out: { item: 'iron_pickaxe', n: 1 }, inputs: [{ item: 'planks', n: 5 }, { item: 'iron_ore', n: 8 }], station: 'workbench' },
  { id: 'silver_pickaxe', out: { item: 'silver_pickaxe', n: 1 }, inputs: [{ item: 'planks', n: 5 }, { item: 'silver_ore', n: 10 }], station: 'workbench' },
  { id: 'gold_pickaxe', out: { item: 'gold_pickaxe', n: 1 }, inputs: [{ item: 'planks', n: 5 }, { item: 'gold_ore', n: 12 }], station: 'workbench' },
  { id: 'chest', out: { item: 'chest', n: 1 }, inputs: [{ item: 'planks', n: 8 }, { item: 'iron_ore', n: 2 }], station: 'workbench' },
  { id: 'stone_brick', out: { item: 'stone_brick', n: 2 }, inputs: [{ item: 'stone', n: 2 }], station: 'workbench' },
  { id: 'torch_crystal', out: { item: 'torch', n: 6 }, inputs: [{ item: 'wood', n: 1 }, { item: 'crystal', n: 1 }], station: null },
  { id: 'silver_coin', out: { item: 'silver_coin', n: 1 }, inputs: [{ item: 'copper_coin', n: 100 }], station: null },
  { id: 'platform', out: { item: 'platform', n: 2 }, inputs: [{ item: 'planks', n: 1 }], station: null },
  { id: 'wooden_door', out: { item: 'wooden_door', n: 1 }, inputs: [{ item: 'planks', n: 6 }], station: 'workbench' },
];

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}

function hasInputs(inv: Inventory, r: Recipe): boolean {
  return r.inputs.every((a) => inv.has(a.item, a.n));
}
function stationOk(r: Recipe, ctx: CraftContext): boolean {
  return r.station === null || (r.station === 'workbench' && ctx.nearWorkbench);
}

export function canCraft(inv: Inventory, r: Recipe, ctx: CraftContext): boolean {
  return stationOk(r, ctx) && hasInputs(inv, r);
}

export function availableRecipes(inv: Inventory, ctx: CraftContext): Recipe[] {
  return RECIPES.filter((r) => canCraft(inv, r, ctx));
}

/** 合成一次。失敗時背包不變。 */
export function craft(inv: Inventory, recipeId: string, ctx: CraftContext): CraftResult {
  const r = findRecipe(recipeId);
  if (!r) return { ok: false, reason: 'unknown' };
  if (!stationOk(r, ctx)) return { ok: false, reason: 'station' };
  if (!hasInputs(inv, r)) return { ok: false, reason: 'missing' };
  // 先在副本上試，確保產出放得下才提交
  const trial = Inventory.fromJSON(inv.toJSON());
  for (const a of r.inputs) trial.remove(a.item, a.n);
  if (trial.add(r.out.item, r.out.n) > 0) return { ok: false, reason: 'full' };
  inv.slots = trial.slots;
  return { ok: true };
}
