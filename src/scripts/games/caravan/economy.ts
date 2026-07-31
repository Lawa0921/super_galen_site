import { ITEMS } from './data/items';
import type { ExpeditionPlan, SaveData } from './save';
import { companyPayrollBreakdown } from './data/operations';

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
 * 裝備不吃異鎮套利，一律半價出售。
 */
export function tradeSellPrice(town: TownDef, itemId: string): number {
  const item = requireItem(itemId, 'tradeSellPrice');
  if (item.equip) return Math.round(item.value * 0.5);
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

/**
 * M29 營運薪餉：保留 M17 出征／後備／軍需官規則，再套用 M28 工程形成的
 * 維護費、方案效率、特許相性、羈絆忠誠與職涯多樣性。
 * 無有效工程收據時，結果精確等同舊版薪餉。
 */
export function totalWage(save: SaveData, candidate?: ExpeditionPlan): number {
  return companyPayrollBreakdown(save, candidate).total;
}
