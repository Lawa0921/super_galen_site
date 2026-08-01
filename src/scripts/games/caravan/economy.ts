import { ITEMS } from './data/items';
import type { ExpeditionPlan, SaveData } from './save';
import { governedPayrollBreakdown } from './data/governance';

export interface TownDef {
  id: string;
  name: string;
  desc: string;
  /** itemId -> 價格係數（如 1.4/0.7）；未列出的物品視為 1.0 */
  priceModifiers: Record<string, number>;
  /** 該鎮商店可購買的物品清單（含孤兒物品：繃帶/乾糧/銀懷錶/香料包，M4） */
  stock: string[];
  /** 城鎮橫幅圖路徑（M5 美術） */
  art?: string;
}

/**
 * 市場行情（M7）：以 marketSeed 對鎮上「非裝備」品項的價格係數做 0.75-1.35 決定性浮動，
 * 回傳新 TownDef（不改原物件）。裝備不吃行情（延伸 M5 套利裁決）。
 * 浮動對象＝priceModifiers 既有品項 ∪ stock 品項。
 */
export function applyMarket(town: TownDef, marketSeed: number): TownDef {
  const swing = (key: string): number => {
    let h = marketSeed >>> 0;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 2654435761);
    h = Math.imul(h ^ (h >>> 13), 1597334677);
    const unit = ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    return 0.75 + unit * 0.6;
  };
  const itemIds = new Set([...Object.keys(town.priceModifiers), ...town.stock]);
  const priceModifiers: Record<string, number> = {};
  for (const itemId of itemIds) {
    const base = town.priceModifiers[itemId] ?? 1;
    priceModifiers[itemId] = ITEMS[itemId]?.equip
      ? base
      : Math.round(base * swing(`${town.id}:${itemId}`) * 100) / 100;
  }
  return { ...town, priceModifiers };
}

function priceModifier(town: TownDef, itemId: string): number {
  return town.priceModifiers[itemId] ?? 1;
}

function requireItem(itemId: string, callerName: string) {
  const item = ITEMS[itemId];
  if (!item) throw new Error(`${callerName}: 找不到物品「${itemId}」`);
  return item;
}

export function buyPrice(town: TownDef, itemId: string): number {
  const item = requireItem(itemId, 'buyPrice');
  return Math.round(item.value * priceModifier(town, itemId));
}

export function sellPrice(town: TownDef, itemId: string): number {
  return Math.round(buyPrice(town, itemId) * 0.5);
}

export function tradeSellPrice(town: TownDef, itemId: string): number {
  const item = requireItem(itemId, 'tradeSellPrice');
  if (item.equip) return Math.round(item.value * 0.5);
  return Math.round(item.value * priceModifier(town, itemId) * 0.9);
}

export function cargoCapacity(wagonLevel: number): number {
  return 6 + wagonLevel * 4;
}

export function wagonUpgradeCost(wagonLevel: number): number {
  return 120 + wagonLevel * 180;
}

/** M33：正式遠征與治理頁共用同一份受姿態／暫停影響的薪餉明細。 */
export function totalWage(save: SaveData, candidate?: ExpeditionPlan): number {
  return governedPayrollBreakdown(save, candidate).total;
}
