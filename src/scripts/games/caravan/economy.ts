import { ITEMS } from './data/items';
import type { SaveData } from './save';
import { wagePerTrip } from './roster';

export interface TownDef {
  id: string;
  name: string;
  desc: string;
  /** itemId -> 價格係數（如 1.4/0.7）；未列出的物品視為 1.0 */
  priceModifiers: Record<string, number>;
  /** 該鎮商店可購買的物品清單（含孤兒物品：繃帶/乾糧/銀懷錶/香料包，M4） */
  stock: string[];
}

function priceModifier(town: TownDef, itemId: string): number {
  return town.priceModifiers[itemId] ?? 1;
}

function requireItem(itemId: string, callerName: string) {
  const item = ITEMS[itemId];
  if (!item) {
    throw new Error(`${callerName}: 找不到物品「${itemId}」`);
  }
  return item;
}

/** 該鎮買入某物品的價格：round(ITEMS[itemId].value × 城鎮係數) */
export function buyPrice(town: TownDef, itemId: string): number {
  const item = requireItem(itemId, 'buyPrice');
  return Math.round(item.value * priceModifier(town, itemId));
}

/** 原鎮賣回價格（商店收購折扣，全物品通用，含 boss 遺寶）：round(buyPrice × 0.5) */
export function sellPrice(town: TownDef, itemId: string): number {
  return Math.round(buyPrice(town, itemId) * 0.5);
}

/**
 * 異鎮轉賣價格（押貨貿易的差價空間）：round(ITEMS.value × 城鎮係數 × 0.9)。
 * M5 套利裁決（終審移交）：equip 類物品不吃異鎮 0.9 係數與城鎮係數，一律
 * round(value × 0.5)（＝與原鎮 sellPrice 同量級）——裝備要嘛用、要嘛半價賣，無套利。
 */
export function tradeSellPrice(town: TownDef, itemId: string): number {
  const item = requireItem(itemId, 'tradeSellPrice');
  if (item.equip) {
    return Math.round(item.value * 0.5);
  }
  return Math.round(item.value * priceModifier(town, itemId) * 0.9);
}

/** 馬車載貨上限（單位=件）：6 + wagonLevel×4 */
export function cargoCapacity(wagonLevel: number): number {
  return 6 + wagonLevel * 4;
}

/** 馬車升級花費（升到下一級）：120 + wagonLevel×180 */
export function wagonUpgradeCost(wagonLevel: number): number {
  return 120 + wagonLevel * 180;
}

/** 未重傷（injuredForTrips===0）傭兵每趟薪餉合計（wagePerTrip，roster.ts） */
export function totalWage(save: SaveData): number {
  return save.companions
    .filter((companion) => companion.injuredForTrips === 0)
    .reduce((sum, companion) => sum + wagePerTrip(companion), 0);
}
