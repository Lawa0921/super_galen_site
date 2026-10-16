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
  | 'silver_pickaxe' | 'gold_pickaxe'
  // ── 深度層 / 地城 ──
  | 'deep_stone' | 'basalt' | 'ash' | 'obsidian' | 'magma_rock'
  | 'dungeon_brick_blue' | 'dungeon_brick_green' | 'dungeon_brick_pink'
  | 'platform' | 'wooden_door' | 'dungeon_key' | 'golden_key'
  | 'lantern' | 'rune_pickaxe' | 'explorer_map'
  // ── 探索工具 / 飾品 ──
  | 'rope' | 'bed' | 'recall_stone' | 'compass' | 'depth_meter'
  | 'jump_boots' | 'swift_boots' | 'night_amulet' | 'magnet';

/**
 * 飾品效果（放在背包任一格即生效）：jump 跳更高、run 跑更快、night 身邊微光、magnet 伸手距離更遠、
 * compass HUD 顯示東西座標、depth HUD 顯示深度格數、map 全地圖顯示所有地標位置。
 */
export type Accessory = 'jump' | 'run' | 'night' | 'magnet' | 'compass' | 'depth' | 'map';

export interface PickStats { speed: number; tier: number; }
export interface ItemDef {
  id: ItemId;
  name: LocalName;
  maxStack: number;
  place?: number;
  pick?: PickStats;
  /** 拿在手上時在玩家身邊發光的強度（0..1） */
  heldLight?: number;
  /** 獨特道具（地城 / 探索戰利品） */
  unique?: boolean;
  /** 飾品效果（在背包裡就生效） */
  accessory?: Accessory;
  /** 主動使用（手持按「使用」）：recall = 引導後傳送回重生點 */
  use?: 'recall';
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
  deep_stone: block('deep_stone', '深層岩', 'Deep Rock', T.DEEP_STONE),
  basalt: block('basalt', '玄武岩', 'Basalt', T.BASALT),
  ash: block('ash', '灰燼', 'Ash', T.ASH),
  obsidian: block('obsidian', '黑曜石', 'Obsidian', T.OBSIDIAN),
  magma_rock: block('magma_rock', '熔岩石', 'Magma Rock', T.MAGMA_ROCK),
  dungeon_brick_blue: block('dungeon_brick_blue', '藍地城磚', 'Blue Dungeon Brick', T.DUNGEON_BRICK_BLUE),
  dungeon_brick_green: block('dungeon_brick_green', '綠地城磚', 'Green Dungeon Brick', T.DUNGEON_BRICK_GREEN),
  dungeon_brick_pink: block('dungeon_brick_pink', '粉地城磚', 'Pink Dungeon Brick', T.DUNGEON_BRICK_PINK),
  platform: block('platform', '木平台', 'Wooden Platform', T.PLATFORM),
  // 木門：放置時往上佔 3 格（game.tryPlace 特別處理）
  wooden_door: { ...block('wooden_door', '木門', 'Wooden Door', T.DOOR_CLOSED), maxStack: 99 },
  dungeon_key: { ...mat('dungeon_key', '地城鑰匙', 'Dungeon Key'), maxStack: 99 },
  golden_key: { ...mat('golden_key', '金鑰匙', 'Golden Key'), maxStack: 99 },
  lantern: { id: 'lantern', name: { zh: '探險提燈', en: "Delver's Lantern" }, maxStack: 1, heldLight: 1, unique: true },
  rune_pickaxe: { ...pick('rune_pickaxe', '符文鎬', 'Rune Pickaxe', 5.6, 5), unique: true },
  explorer_map: { id: 'explorer_map', name: { zh: '探險家地圖', en: "Explorer's Map" }, maxStack: 1, unique: true, accessory: 'map' },
  rope: block('rope', '繩索', 'Rope', T.ROPE),
  // 床：放置時佔兩格（床頭 + 右邊床尾，game.tryPlace 特別處理）
  bed: { ...block('bed', '床', 'Bed', T.BED_HEAD), maxStack: 99 },
  recall_stone: { id: 'recall_stone', name: { zh: '傳送石', en: 'Recall Stone' }, maxStack: 1, use: 'recall' },
  compass: { id: 'compass', name: { zh: '指南針', en: 'Compass' }, maxStack: 1, accessory: 'compass' },
  depth_meter: { id: 'depth_meter', name: { zh: '深度計', en: 'Depth Gauge' }, maxStack: 1, accessory: 'depth' },
  jump_boots: { id: 'jump_boots', name: { zh: '跳躍靴', en: 'Springstep Boots' }, maxStack: 1, unique: true, accessory: 'jump' },
  swift_boots: { id: 'swift_boots', name: { zh: '疾行靴', en: 'Windrunner Boots' }, maxStack: 1, unique: true, accessory: 'run' },
  night_amulet: { id: 'night_amulet', name: { zh: '夜視護符', en: 'Owl-Eye Amulet' }, maxStack: 1, unique: true, accessory: 'night' },
  magnet: { id: 'magnet', name: { zh: '磁石', en: 'Lodestone' }, maxStack: 1, unique: true, accessory: 'magnet' },
};

export function isItemId(v: unknown): v is ItemId {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v);
}
export function itemDef(id: ItemId): ItemDef { return ITEMS[id]; }
