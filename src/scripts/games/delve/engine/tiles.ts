// tiles.ts — 前景 tile 與背景牆定義表。id 即陣列索引，存進 Uint8Array。
// 新 tile 一律接在最後（存檔裡存的是 id）。
import type { ItemId } from './items';

export const T = {
  AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  PLANKS: 7, COPPER_ORE: 8, IRON_ORE: 9, TORCH: 10, WORKBENCH: 11,
  // ── 材料 ──
  SILVER_ORE: 12, GOLD_ORE: 13, CLAY: 14, GRAVEL: 15, GRANITE: 16, MARBLE: 17,
  SANDSTONE: 18, SNOW: 19, ICE: 20, MUD: 21, JUNGLE_GRASS: 22, STONE_BRICK: 23,
  // ── 物件 / 裝飾（非實心） ──
  CHEST: 24, POT: 25, FLOWER: 26, TALL_GRASS: 27, MUSHROOM: 28, SMALL_ROCK: 29, BUSH: 30,
  PUMPKIN: 31, CACTUS: 32, DEAD_BUSH: 33, SNOW_SHRUB: 34, FERN: 35, VINE: 36,
  GLOW_MUSHROOM: 37, CRYSTAL: 38, STALACTITE: 39, STALAGMITE: 40, COBWEB: 41, BEAM: 42,
} as const;
export type TileId = (typeof T)[keyof typeof T];

export const W = {
  NONE: 0, DIRT_WALL: 1, STONE_WALL: 2,
  PLANK_WALL: 3, SANDSTONE_WALL: 4, SNOW_WALL: 5, ICE_WALL: 6, MUD_WALL: 7,
} as const;
export type WallId = (typeof W)[keyof typeof W];

export interface LocalName { zh: string; en: string; }

/**
 * 支撐種類：none = 不需要；any = 相鄰任一實心或背牆（火把）；
 * floor = 正下方實心（或同種 tile 疊起來，例如仙人掌）；ceiling = 正上方實心（或同種 tile 垂吊，例如藤蔓）。
 */
export type Support = 'none' | 'any' | 'floor' | 'ceiling';

export interface TileDef {
  id: number;
  key: string;
  name: LocalName;
  /** 物理碰撞 */
  solid: boolean;
  /** 以木鎬（speed 1）挖掉所需秒數；0 = 不可挖（空氣） */
  hardness: number;
  /** 需要的最低鎬等級 */
  minTier: number;
  drop: ItemId | null;
  /** 發光強度 0..1 */
  light: number;
  /** 光照遮罩：true 時光衰減用 solid 係數 */
  blocksLight: boolean;
  support: Support;
  /** 需要支撐（support !== 'none'）——失去支撐會掉落 */
  needsSupport: boolean;
  /** 放方塊時可以直接蓋掉（草、花） */
  replaceable: boolean;
  /** 基礎顏色（render 程式材質 / 世界總覽圖用） */
  color: string;
}

export interface WallDef { id: number; key: string; name: LocalName; color: string; }

type TileInit = Omit<TileDef, 'minTier' | 'needsSupport' | 'light' | 'support' | 'replaceable' | 'blocksLight'> &
  Partial<Pick<TileDef, 'minTier' | 'light' | 'support' | 'replaceable' | 'blocksLight'>>;
function def(d: TileInit): TileDef {
  const support = d.support ?? 'none';
  return {
    ...d, minTier: d.minTier ?? 1, light: d.light ?? 0, replaceable: d.replaceable ?? false,
    blocksLight: d.blocksLight ?? d.solid, support, needsSupport: support !== 'none',
  };
}
const n = (zh: string, en: string): LocalName => ({ zh, en });
/** 實心材料 */
const block = (id: number, key: string, name: LocalName, hardness: number, drop: ItemId, color: string, minTier = 1): TileDef =>
  def({ id, key, name, solid: true, hardness, drop, color, minTier });
/** 非實心裝飾 */
const decor = (id: number, key: string, name: LocalName, support: Support, drop: ItemId | null, color: string,
  extra: Partial<Pick<TileDef, 'hardness' | 'light' | 'replaceable'>> = {}): TileDef =>
  def({ id, key, name, solid: false, hardness: extra.hardness ?? 0.08, drop, color, support, light: extra.light, replaceable: extra.replaceable });

export const TILES: readonly TileDef[] = [
  def({ id: T.AIR, key: 'air', name: n('空氣', 'Air'), solid: false, hardness: 0, drop: null, color: '#000000' }),
  block(T.DIRT, 'dirt', n('泥土', 'Dirt'), 0.35, 'dirt', '#7c4c2e'),
  block(T.GRASS, 'grass', n('草地', 'Grass'), 0.4, 'dirt', '#468a34'),
  block(T.STONE, 'stone', n('石頭', 'Stone'), 0.9, 'stone', '#5e5e74'),
  block(T.SAND, 'sand', n('沙', 'Sand'), 0.3, 'sand', '#d8ba76'),
  def({ id: T.WOOD, key: 'wood', name: n('樹幹', 'Tree Trunk'), solid: false, hardness: 0.8, drop: 'wood', color: '#623924' }),
  def({ id: T.LEAVES, key: 'leaves', name: n('樹葉', 'Leaves'), solid: false, hardness: 0.1, drop: null, color: '#2d672e' }),
  block(T.PLANKS, 'planks', n('木板', 'Planks'), 0.6, 'planks', '#966139'),
  block(T.COPPER_ORE, 'copper_ore', n('銅礦', 'Copper Ore'), 1.4, 'copper_ore', '#e8701c'),
  block(T.IRON_ORE, 'iron_ore', n('鐵礦', 'Iron Ore'), 2.0, 'iron_ore', '#d98f66', 2),
  decor(T.TORCH, 'torch', n('火把', 'Torch'), 'any', 'torch', '#ffd86a', { hardness: 0.05, light: 1 }),
  decor(T.WORKBENCH, 'workbench', n('工作台', 'Workbench'), 'any', 'workbench', '#966139', { hardness: 0.5 }),
  // ── 材料 ──
  block(T.SILVER_ORE, 'silver_ore', n('銀礦', 'Silver Ore'), 2.4, 'silver_ore', '#b4b9c8', 3),
  block(T.GOLD_ORE, 'gold_ore', n('金礦', 'Gold Ore'), 2.9, 'gold_ore', '#ffd86a', 4),
  block(T.CLAY, 'clay', n('黏土', 'Clay'), 0.4, 'clay', '#b8788e'),
  block(T.GRAVEL, 'gravel', n('碎石', 'Gravel'), 0.45, 'gravel', '#707490'),
  block(T.GRANITE, 'granite', n('花崗岩', 'Granite'), 1.25, 'granite', '#2c2450'),
  block(T.MARBLE, 'marble', n('大理石', 'Marble'), 1.25, 'marble', '#cceaf8'),
  block(T.SANDSTONE, 'sandstone', n('砂岩', 'Sandstone'), 0.75, 'sandstone', '#b07a4b'),
  block(T.SNOW, 'snow', n('雪', 'Snow'), 0.25, 'snow', '#ffffff'),
  block(T.ICE, 'ice', n('冰', 'Ice'), 0.5, 'ice', '#94c8ee'),
  block(T.MUD, 'mud', n('泥巴', 'Mud'), 0.35, 'mud', '#472819'),
  block(T.JUNGLE_GRASS, 'jungle_grass', n('叢林草', 'Jungle Grass'), 0.4, 'mud', '#93cc50'),
  block(T.STONE_BRICK, 'stone_brick', n('石磚', 'Stone Brick'), 1.0, 'stone_brick', '#858aa0'),
  // ── 物件 / 裝飾 ──
  decor(T.CHEST, 'chest', n('箱子', 'Chest'), 'floor', 'chest', '#b07a4b', { hardness: 0.5 }),
  decor(T.POT, 'pot', n('陶罐', 'Pot'), 'floor', null, '#a83a10', { hardness: 0.15 }),
  decor(T.FLOWER, 'flower', n('花', 'Flower'), 'floor', null, '#f2b888', { hardness: 0.05, replaceable: true }),
  decor(T.TALL_GRASS, 'tall_grass', n('高草', 'Tall Grass'), 'floor', null, '#67ab3c', { hardness: 0.05, replaceable: true }),
  decor(T.MUSHROOM, 'mushroom', n('蘑菇', 'Mushroom'), 'floor', 'mushroom', '#a83a10', { hardness: 0.05 }),
  decor(T.SMALL_ROCK, 'small_rock', n('小石頭', 'Small Rock'), 'floor', 'stone', '#858aa0', { hardness: 0.1 }),
  decor(T.BUSH, 'bush', n('灌木', 'Bush'), 'floor', null, '#2d672e', { hardness: 0.1, replaceable: true }),
  decor(T.PUMPKIN, 'pumpkin', n('南瓜', 'Pumpkin'), 'floor', 'pumpkin', '#e8701c', { hardness: 0.2 }),
  decor(T.CACTUS, 'cactus', n('仙人掌', 'Cactus'), 'floor', 'cactus', '#468a34', { hardness: 0.3 }),
  decor(T.DEAD_BUSH, 'dead_bush', n('枯灌木', 'Dead Bush'), 'floor', null, '#966139', { hardness: 0.05, replaceable: true }),
  decor(T.SNOW_SHRUB, 'snow_shrub', n('雪灌木', 'Snowy Shrub'), 'floor', null, '#cceaf8', { hardness: 0.08, replaceable: true }),
  decor(T.FERN, 'fern', n('蕨類', 'Fern'), 'floor', null, '#67ab3c', { hardness: 0.05, replaceable: true }),
  decor(T.VINE, 'vine', n('藤蔓', 'Vine'), 'ceiling', null, '#468a34', { hardness: 0.05, replaceable: true }),
  decor(T.GLOW_MUSHROOM, 'glow_mushroom', n('螢光菇', 'Glowing Mushroom'), 'floor', 'glow_mushroom', '#4aaeb0', { hardness: 0.05, light: 0.5 }),
  decor(T.CRYSTAL, 'crystal', n('水晶簇', 'Crystal Cluster'), 'any', 'crystal', '#b8788e', { hardness: 0.35, light: 0.72 }),
  decor(T.STALACTITE, 'stalactite', n('鐘乳石', 'Stalactite'), 'ceiling', null, '#707490', { hardness: 0.1 }),
  decor(T.STALAGMITE, 'stalagmite', n('石筍', 'Stalagmite'), 'floor', null, '#707490', { hardness: 0.1 }),
  decor(T.COBWEB, 'cobweb', n('蜘蛛網', 'Cobweb'), 'none', null, '#b4b9c8', { hardness: 0.05, replaceable: true }),
  decor(T.BEAM, 'beam', n('木樑', 'Wooden Beam'), 'none', 'wood', '#7c4c2e', { hardness: 0.5 }),
];

export const WALLS: readonly WallDef[] = [
  { id: W.NONE, key: 'none', name: n('無', 'None'), color: '#000000' },
  { id: W.DIRT_WALL, key: 'dirt_wall', name: n('泥土牆', 'Dirt Wall'), color: '#2a1810' },
  { id: W.STONE_WALL, key: 'stone_wall', name: n('石牆', 'Stone Wall'), color: '#2c2838' },
  { id: W.PLANK_WALL, key: 'plank_wall', name: n('木板牆', 'Plank Wall'), color: '#472819' },
  { id: W.SANDSTONE_WALL, key: 'sandstone_wall', name: n('砂岩牆', 'Sandstone Wall'), color: '#623924' },
  { id: W.SNOW_WALL, key: 'snow_wall', name: n('雪牆', 'Snow Wall'), color: '#5e5e74' },
  { id: W.ICE_WALL, key: 'ice_wall', name: n('冰牆', 'Ice Wall'), color: '#2c4486' },
  { id: W.MUD_WALL, key: 'mud_wall', name: n('泥巴牆', 'Mud Wall'), color: '#16301e' },
];

// 熱路徑查表（lighting / physics 每格讀取）
export const SOLID_LUT = new Uint8Array(256);
export const BLOCKS_LIGHT_LUT = new Uint8Array(256);
export const LIGHT_LUT = new Float32Array(256);
/** 非實心、靜態畫進 chunk 的裝飾物件 */
export const DECOR_LUT = new Uint8Array(256);
for (const t of TILES) {
  SOLID_LUT[t.id] = t.solid ? 1 : 0;
  BLOCKS_LIGHT_LUT[t.id] = t.blocksLight ? 1 : 0;
  LIGHT_LUT[t.id] = t.light;
  DECOR_LUT[t.id] = t.id >= T.CHEST || t.id === T.WORKBENCH ? 1 : 0;
}

export function tileDef(id: number): TileDef {
  return TILES[id] ?? TILES[T.AIR];
}
export function isSolidTile(id: number): boolean { return SOLID_LUT[id] === 1; }
export function blocksLight(id: number): boolean { return BLOCKS_LIGHT_LUT[id] === 1; }
export function isDecor(id: number): boolean { return DECOR_LUT[id] === 1; }
