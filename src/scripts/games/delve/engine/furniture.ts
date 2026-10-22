// furniture.ts — 家具目錄（純資料）：每種家具在房屋判定裡算什麼（桌子 / 座位 / 床 / 光源 / 裝飾 / 收納 / 合成站）、
// 舒適度、雙格家具（床 / 沙發 / 壁爐：左半是「本體」，右半不重複計分）與人造背景牆清單。
// 房屋判定（housing.ts）、據點評分（settlement.ts）、UI 的家具圖鑑都讀這張表。
import { T, W } from './tiles';
import type { ItemId } from './items';

export type FurnitureRole = 'table' | 'seat' | 'bed' | 'light' | 'decor' | 'storage' | 'station';
export interface FurnitureDef {
  tile: number;
  item: ItemId;
  role: FurnitureRole;
  /** 舒適度（房間品質 / 居民心情） */
  comfort: number;
  /** 也算光源（壁爐、檯燈…） */
  light?: boolean;
  /** 也算裝飾 */
  decor?: boolean;
  /** 圖鑑說明（zh） */
  note: string;
}

const f = (tile: number, item: ItemId, role: FurnitureRole, comfort: number, note: string, extra: Partial<FurnitureDef> = {}): FurnitureDef =>
  ({ tile, item, role, comfort, note, ...extra });

/** 圖鑑順序 = 這個陣列的順序 */
export const FURNITURE: readonly FurnitureDef[] = [
  f(T.TABLE, 'table', 'table', 1, '房間必備的桌子'),
  f(T.WORKBENCH, 'workbench', 'table', 0, '也可以當桌子用'),
  f(T.CHAIR, 'chair', 'seat', 1, '房間必備的座位'),
  f(T.BENCH, 'bench', 'seat', 2, '兩個人坐也不擠的座位'),
  f(T.SOFA_L, 'sofa', 'seat', 4, '雙格。最舒服的座位'),
  f(T.BED_HEAD, 'bed', 'bed', 3, '雙格。居民要有自己的床'),
  f(T.TORCH, 'torch', 'light', 0, '最基本的光源'),
  f(T.CANDLE, 'candle', 'light', 1, '可以放在桌上 / 書架上'),
  f(T.TABLE_LAMP, 'table_lamp', 'light', 2, '放在桌上的暖光燈'),
  f(T.LANTERN_POST, 'lantern_post', 'light', 1, '戶外照明也很好用'),
  f(T.CHANDELIER, 'chandelier', 'light', 3, '掛在天花板，照亮整個房間', { decor: true }),
  f(T.FIREPLACE_L, 'fireplace', 'light', 4, '雙格。溫暖又能當料理站', { decor: true }),
  f(T.CAMPFIRE, 'campfire', 'light', 1, '料理站，也是光源'),
  f(T.BOOKSHELF, 'bookshelf', 'decor', 2, '書香氣息'),
  f(T.SHELF, 'shelf', 'decor', 1, '掛在背景牆上'),
  f(T.PAINTING, 'painting', 'decor', 2, '掛在背景牆上'),
  f(T.BANNER, 'banner', 'decor', 1, '掛在天花板下'),
  f(T.RUG, 'rug', 'decor', 2, '鋪在地上'),
  f(T.POTTED_PLANT, 'potted_plant', 'decor', 2, '可以放在桌上 / 平台上'),
  f(T.TROPHY, 'warden_trophy', 'decor', 4, '首領戰利品，炫耀用'),
  f(T.VANITY_TABLE, 'vanity_table', 'decor', 2, '靠近按使用：改髮型、臉和衣服的顏色'),
  f(T.CHEST, 'chest', 'storage', 1, '收納'),
  f(T.FURNACE, 'furnace', 'station', 0, '合成站'),
  f(T.ANVIL, 'anvil', 'station', 0, '合成站'),
];
export const FURNITURE_BY_TILE = new Map<number, FurnitureDef>(FURNITURE.map((d) => [d.tile, d]));

/** 雙格家具：左半 → 右半（放置 / 拆除時一起；右半不重複計分） */
export const PAIRS: readonly { left: number; right: number; item: ItemId }[] = [
  { left: T.BED_HEAD, right: T.BED_FOOT, item: 'bed' },
  { left: T.SOFA_L, right: T.SOFA_R, item: 'sofa' },
  { left: T.FIREPLACE_L, right: T.FIREPLACE_R, item: 'fireplace' },
];
export const PAIR_OF_LEFT = new Map(PAIRS.map((p) => [p.left, p]));
export const PAIR_OF_RIGHT = new Map(PAIRS.map((p) => [p.right, p]));

/** 光源 tile（房屋判定的「有照明」） */
export const LIGHT_TILES = new Set<number>([
  T.TORCH, T.CANDLE, T.LANTERN, T.LANTERN_POST, T.CHANDELIER, T.TABLE_LAMP, T.FIREPLACE_L, T.FIREPLACE_R, T.CAMPFIRE, T.HEARTH,
]);
/** 裝飾（據點評分的「裝飾」；舒適度另計） */
export const DECOR_TILES = new Set<number>(FURNITURE.filter((d) => d.role === 'decor' || d.decor).map((d) => d.tile));
/** 會讓居民 / 據點覺得「這是人住的地方」的人造背景牆（天然的土牆 / 石牆不算） */
export const HOUSE_WALLS = new Set<number>([
  W.PLANK_WALL, W.DARK_PLANK_WALL, W.PALE_PLANK_WALL, W.STONE_BRICK_WALL, W.RED_BRICK_WALL, W.GLASS_WALL, W.PLASTER_WALL,
]);
/** 房間的入口：門（開 / 關）或平台（往上 / 往下的出入口） */
export function isEntrance(id: number): boolean { return id === T.DOOR_CLOSED || id === T.DOOR_OPEN || id === T.PLATFORM; }
/** 安全設施（據點評分「安全」）：圍欄 */
export const SAFETY_TILES = new Set<number>([T.FENCE]);
