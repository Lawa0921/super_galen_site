// items.ts — 道具表。方塊類道具用 place 指回 tile id；鎬用 pick。
import { T, type LocalName } from './tiles';
import { MAX_STACK } from './constants';

export type ItemId =
  | 'dirt' | 'stone' | 'sand' | 'wood' | 'planks' | 'copper_ore' | 'iron_ore'
  | 'torch' | 'workbench' | 'wood_pickaxe' | 'copper_pickaxe' | 'iron_pickaxe'
  // ── 新材料 ──
  | 'silver_ore' | 'gold_ore' | 'clay' | 'gravel' | 'granite' | 'marble' | 'sandstone'
  | 'snow' | 'ice' | 'mud' | 'stone_brick'
  // ── 物件 / 素材 / 錢 ──
  | 'chest' | 'pumpkin' | 'glow_mushroom' | 'mushroom' | 'crystal' | 'cactus'
  | 'copper_coin' | 'silver_coin'
  | 'silver_pickaxe' | 'gold_pickaxe';

export interface PickStats { speed: number; tier: number; }
export interface ItemDef {
  id: ItemId;
  name: LocalName;
  maxStack: number;
  place?: number;
  pick?: PickStats;
}

const block = (id: ItemId, zh: string, en: string, place: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: MAX_STACK, place });
const pick = (id: ItemId, zh: string, en: string, speed: number, tier: number): ItemDef =>
  ({ id, name: { zh, en }, maxStack: 1, pick: { speed, tier } });
const mat = (id: ItemId, zh: string, en: string): ItemDef => ({ id, name: { zh, en }, maxStack: MAX_STACK });

export const ITEMS: Record<ItemId, ItemDef> = {
  dirt: block('dirt', '泥土', 'Dirt', T.DIRT),
  stone: block('stone', '石頭', 'Stone', T.STONE),
  sand: block('sand', '沙', 'Sand', T.SAND),
  wood: mat('wood', '木材', 'Wood'),
  planks: block('planks', '木板', 'Planks', T.PLANKS),
  copper_ore: block('copper_ore', '銅礦', 'Copper Ore', T.COPPER_ORE),
  iron_ore: block('iron_ore', '鐵礦', 'Iron Ore', T.IRON_ORE),
  torch: block('torch', '火把', 'Torch', T.TORCH),
  workbench: block('workbench', '工作台', 'Workbench', T.WORKBENCH),
  wood_pickaxe: pick('wood_pickaxe', '木鎬', 'Wooden Pickaxe', 1, 1),
  copper_pickaxe: pick('copper_pickaxe', '銅鎬', 'Copper Pickaxe', 2, 2),
  iron_pickaxe: pick('iron_pickaxe', '鐵鎬', 'Iron Pickaxe', 3, 3),
  silver_ore: block('silver_ore', '銀礦', 'Silver Ore', T.SILVER_ORE),
  gold_ore: block('gold_ore', '金礦', 'Gold Ore', T.GOLD_ORE),
  clay: block('clay', '黏土', 'Clay', T.CLAY),
  gravel: block('gravel', '碎石', 'Gravel', T.GRAVEL),
  granite: block('granite', '花崗岩', 'Granite', T.GRANITE),
  marble: block('marble', '大理石', 'Marble', T.MARBLE),
  sandstone: block('sandstone', '砂岩', 'Sandstone', T.SANDSTONE),
  snow: block('snow', '雪塊', 'Snow Block', T.SNOW),
  ice: block('ice', '冰塊', 'Ice Block', T.ICE),
  mud: block('mud', '泥巴', 'Mud', T.MUD),
  stone_brick: block('stone_brick', '石磚', 'Stone Brick', T.STONE_BRICK),
  chest: { ...block('chest', '箱子', 'Chest', T.CHEST), maxStack: 99 },
  pumpkin: block('pumpkin', '南瓜', 'Pumpkin', T.PUMPKIN),
  glow_mushroom: block('glow_mushroom', '螢光菇', 'Glowing Mushroom', T.GLOW_MUSHROOM),
  mushroom: mat('mushroom', '蘑菇', 'Mushroom'),
  crystal: mat('crystal', '水晶碎片', 'Crystal Shard'),
  cactus: mat('cactus', '仙人掌', 'Cactus'),
  copper_coin: mat('copper_coin', '銅幣', 'Copper Coin'),
  silver_coin: mat('silver_coin', '銀幣', 'Silver Coin'),
  silver_pickaxe: pick('silver_pickaxe', '銀鎬', 'Silver Pickaxe', 3.6, 4),
  gold_pickaxe: pick('gold_pickaxe', '金鎬', 'Gold Pickaxe', 4.4, 5),
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);
}
export function itemDef(id: ItemId): ItemDef { return ITEMS[id]; }
