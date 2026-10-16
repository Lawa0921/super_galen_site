// tiles.ts — 前景 tile 與背景牆定義表。id 即陣列索引，存進 Uint8Array。
import type { ItemId } from './items';

export const T = {
  AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, SAND: 4, WOOD: 5, LEAVES: 6,
  PLANKS: 7, COPPER_ORE: 8, IRON_ORE: 9, TORCH: 10, WORKBENCH: 11,
} as const;
export type TileId = (typeof T)[keyof typeof T];

export const W = { NONE: 0, DIRT_WALL: 1, STONE_WALL: 2 } as const;
export type WallId = (typeof W)[keyof typeof W];

export interface LocalName { zh: string; en: string; }

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
  /** 需要支撐（相鄰實心或背牆）——失去支撐會掉落 */
  needsSupport: boolean;
  /** 基礎顏色（render 程式材質用） */
  color: string;
}

export interface WallDef { id: number; key: string; name: LocalName; color: string; }

type TileInit = Omit<TileDef, 'minTier' | 'needsSupport' | 'light'> &
  Partial<Pick<TileDef, 'minTier' | 'needsSupport' | 'light'>>;
function def(d: TileInit): TileDef {
  return { minTier: 1, needsSupport: false, light: 0, ...d };
}

export const TILES: readonly TileDef[] = [
  def({ id: T.AIR, key: 'air', name: { zh: '空氣', en: 'Air' }, solid: false, hardness: 0, drop: null, blocksLight: false, color: '#000000' }),
  def({ id: T.DIRT, key: 'dirt', name: { zh: '泥土', en: 'Dirt' }, solid: true, hardness: 0.35, drop: 'dirt', blocksLight: true, color: '#8a5a34' }),
  def({ id: T.GRASS, key: 'grass', name: { zh: '草地', en: 'Grass' }, solid: true, hardness: 0.4, drop: 'dirt', blocksLight: true, color: '#4f9a3a' }),
  def({ id: T.STONE, key: 'stone', name: { zh: '石頭', en: 'Stone' }, solid: true, hardness: 0.9, drop: 'stone', blocksLight: true, color: '#7b7d82' }),
  def({ id: T.SAND, key: 'sand', name: { zh: '沙', en: 'Sand' }, solid: true, hardness: 0.3, drop: 'sand', blocksLight: true, color: '#d8c27a' }),
  def({ id: T.WOOD, key: 'wood', name: { zh: '樹幹', en: 'Tree Trunk' }, solid: false, hardness: 0.8, drop: 'wood', blocksLight: false, color: '#7a4e2a' }),
  def({ id: T.LEAVES, key: 'leaves', name: { zh: '樹葉', en: 'Leaves' }, solid: false, hardness: 0.1, drop: null, blocksLight: false, color: '#3f8a34' }),
  def({ id: T.PLANKS, key: 'planks', name: { zh: '木板', en: 'Planks' }, solid: true, hardness: 0.6, drop: 'planks', blocksLight: true, color: '#b07a44' }),
  def({ id: T.COPPER_ORE, key: 'copper_ore', name: { zh: '銅礦', en: 'Copper Ore' }, solid: true, hardness: 1.4, drop: 'copper_ore', blocksLight: true, color: '#c8743a' }),
  def({ id: T.IRON_ORE, key: 'iron_ore', name: { zh: '鐵礦', en: 'Iron Ore' }, solid: true, hardness: 2.0, minTier: 2, drop: 'iron_ore', blocksLight: true, color: '#a89a8e' }),
  def({ id: T.TORCH, key: 'torch', name: { zh: '火把', en: 'Torch' }, solid: false, hardness: 0.05, drop: 'torch', light: 1, blocksLight: false, needsSupport: true, color: '#ffcc55' }),
  def({ id: T.WORKBENCH, key: 'workbench', name: { zh: '工作台', en: 'Workbench' }, solid: false, hardness: 0.5, drop: 'workbench', blocksLight: false, needsSupport: true, color: '#9b6a3a' }),
];

export const WALLS: readonly WallDef[] = [
  { id: W.NONE, key: 'none', name: { zh: '無', en: 'None' }, color: '#000000' },
  { id: W.DIRT_WALL, key: 'dirt_wall', name: { zh: '泥土牆', en: 'Dirt Wall' }, color: '#4a3020' },
  { id: W.STONE_WALL, key: 'stone_wall', name: { zh: '石牆', en: 'Stone Wall' }, color: '#3c3d42' },
];

// 熱路徑查表（lighting / physics 每格讀取）
export const SOLID_LUT = new Uint8Array(256);
export const BLOCKS_LIGHT_LUT = new Uint8Array(256);
export const LIGHT_LUT = new Float32Array(256);
for (const t of TILES) {
  SOLID_LUT[t.id] = t.solid ? 1 : 0;
  BLOCKS_LIGHT_LUT[t.id] = t.blocksLight ? 1 : 0;
  LIGHT_LUT[t.id] = t.light;
}

export function tileDef(id: number): TileDef {
  return TILES[id] ?? TILES[T.AIR];
}
export function isSolidTile(id: number): boolean { return SOLID_LUT[id] === 1; }
export function blocksLight(id: number): boolean { return BLOCKS_LIGHT_LUT[id] === 1; }
