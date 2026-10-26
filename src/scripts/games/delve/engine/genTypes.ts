// genTypes.ts — 世界生成的共用型別（純型別，從 engine/legacy 搬出：legacy 生成器、gen2、存檔與遊戲端共用）。
//   · 世界剖面：生態段、結構、地形分段、地城預留區、深度層線、珍寶。
//   · 地城（房間圖 / 門 / 鑰匙）、地表村落與矮人地廳、地標。
//   · GenSite：一個聚落 / 地城的描述（gen2 藍圖與 SiteRegistry 共用）。
import type { BiomeId } from './world';
import type { ItemId } from './items';

// ── 世界剖面 ──
export interface BiomeSegment { biome: BiomeId; x0: number; x1: number; }
export type StructureKind = 'cabin' | 'mineshaft' | 'ruin' | 'cavern' | 'chasm' | 'ravine' | 'frozen_lake'
  | 'mushroom_biome' | 'crystal_cave' | 'sky_island' | 'lake_bed' | 'sinkhole' | 'dungeon' | 'secret_room'
  // 液體（v5）
  | 'pond' | 'oasis' | 'hive' | 'underground_lake'
  // 泉水瀑布（v6）
  | 'waterfall' | 'lavafall'
  // NPC 聚落（地表村落 / 矮人地廳）
  | 'village' | 'dwarf_hall';
/** 每欄的深度層分界（第一個屬於該層的 y） */
export interface GenLayers { rock: Int16Array; deep: Int16Array; molten: Int16Array; }
/** 地表地形種類（依生態區挑）；reserved = 預留給地城的平地 */
export type LandformType = 'plains' | 'hills' | 'mountains' | 'valley' | 'dunes' | 'mesa' | 'frozen_lake' | 'swamp' | 'reserved';
export interface Landform { type: LandformType; x0: number; x1: number; }
/** 預留給之後地城 pass 的區域（tile 座標，x1 / y1 不含） */
export interface ReservedZone { x0: number; x1: number; y0: number; y1: number; side: 'left' | 'right'; }
export interface Structure {
  kind: StructureKind;
  x: number; y: number; w: number; h: number;
  /** 大洞窟的風味 */
  flavor?: 'mushroom' | 'crystal' | 'plain';
  chest?: { x: number; y: number };
  /** 浮空島垂下的繩梯（x、上端 y0、下端 y1） */
  rope?: { x: number; y0: number; y1: number };
}
/** 放在難到達處的珍寶（獨特道具）箱子 */
export interface GenRelic { x: number; y: number; item: ItemId; where: string }

// ── 地城 ──
export type RoomKind = 'entry' | 'hall' | 'shaft' | 'library' | 'prison' | 'shrine' | 'treasure' | 'vault' | 'chamber';
/** 房間內部（不含磚殼）；地板（腳踩的那列）= y + h − 1，實心地板在 y + h */
export interface DungeonRoom { id: number; kind: RoomKind; x: number; y: number; w: number; h: number; locked: boolean; }
export interface DungeonEdge {
  a: number; b: number;
  /** b 端的門（頂端 tile）；locked = 上鎖的門 */
  door: { x: number; y: number } | null;
  locked: boolean;
}
export interface DungeonKey { x: number; y: number; room: number; container: 'chest' | 'pot'; golden: boolean; }
export interface DungeonInfo {
  bbox: { x: number; y: number; w: number; h: number };
  color: string; brick: number; wall: number;
  rooms: DungeonRoom[];
  edges: DungeonEdge[];
  /** 入口塔：腳底 tile（塔內一樓地板上） */
  entrance: { x: number; y: number };
  /** 塔的範圍 */
  tower: { x: number; y: number; w: number; h: number };
  entryRoom: number; treasureRoom: number; keyRoom: number;
  keys: DungeonKey[];
  treasureChest: { x: number; y: number };
  /** 所有門（頂端 tile） */
  doors: { x: number; y: number; locked: boolean }[];
  /** 古碑：site = 擺放位置（塔內 / 神殿 / 寶藏室），worldgen 依此對應碑文 id */
  tablets: { x: number; y: number; id: number; site: 'tower' | 'shrine' | 'treasure' }[];
  /** 所有地城箱子（含寶箱） */
  chests: { x: number; y: number; room: number }[];
  /** 平台格數（統計 / 測試用） */
  platforms: number;
}

// ── 聚落 ──
export interface GenRect { x: number; y: number; w: number; h: number; }
export interface VillageHouse {
  /** 外牆左右欄（含）、地板列（站立的那一列 = floorY - 1） */
  x0: number; x1: number; floorY: number;
  /** 門所在欄 */
  door: number;
  /** 用途：elder = 村長家（書架）、shop = 商店（櫃台 + 木桶）、home = 一般住家 */
  role: 'elder' | 'shop' | 'home';
}
export interface VillageInfo {
  /** 村子範圍（含兩端旗桿）x0..x1（含）、地面列 ground（第一個實心列） */
  x0: number; x1: number; ground: number;
  houses: VillageHouse[];
  /** 委託板（站立列） */
  board: { x: number; y: number };
  /** 旗色（0..2；渲染端可依此換色） */
  style: number;
}
export interface HallInfo {
  x0: number; x1: number;
  /** 天花板最高的內部列 / 地板（第一個實心列） */
  y0: number; floorY: number;
  forge: { x: number; y: number };
  cart: { x: number; y: number };
  /** 兩側鑿出的軌道隧道（欄範圍，含；列 = floorY-5 .. floorY） */
  tunnels: { x0: number; x1: number }[];
}

// ── 地標 ──
export interface LandmarkInfo { x: number; y: number; tile: number; /** 所屬地點的結構種類（獎勵 / 文案依它挑） */ site: string; }

// ── 聚落 / 地城描述（gen2 藍圖與 SiteRegistry 共用）──
export type GenSite =
  | { kind: 'village'; key: string; rot: number; info: VillageInfo }
  | { kind: 'hall'; key: string; rot: number; info: HallInfo }
  | { kind: 'hermit'; key: string; rot: number; at: { x: number; y: number } }
  | { kind: 'dungeon'; key: string; rot: number; info: DungeonInfo };
