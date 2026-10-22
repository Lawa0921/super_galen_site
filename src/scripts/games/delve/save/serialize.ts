// serialize.ts — 純函式存檔（不碰 IndexedDB / DOM）。
// 存「seed + 生成器版本 + 被修改 chunk 的 fg/wall + 那些 chunk 裡的箱子內容 + 玩家 + 背包 + 時間」；
// 載入時用 seed 重新生成，再覆蓋被修改的 chunk（chunk 內的箱子以存檔為準）。
// format 1（M1）沒有 chests；format 2 起 header.chests = [{ i: tile index, slots }]（含金寶箱）；
// format 3 起 header.unlocked = 已用金鑰匙打開的金寶箱 tile index（排序）、header.keysUsed = 累計用掉的鑰匙數。
// format 4 起（探索）：header.explored = 戰爭迷霧位元圖的 RLE（engine/explore.ts）再 base64、header.markers = 地圖標記、
//   header.discovery = 已發現的地區 id / 讀過的碑文 / 拿到的珍寶 / 最深紀錄 / 移動距離、header.bed = 床（重生點）。
//   舊格式（1–3）讀進來 = 什麼都沒探索、沒有標記、沒有床。
// format 5 起（戰鬥）：header.combat = { hp, maxHp（不含飾品的上限 = 100 + 生命晶核）, mana, equipment（頭 / 身 / 腿 / 飾品槽）,
//   bosses（已擊敗的首領 kind）, kills（各種怪物擊殺數）, peaceful（和平模式） }。
//   怪物 / 投射物不存（讀檔後重新生成）。死亡中存檔 → 讀回來是活著、滿血（format 7 起在重生點）。
//   舊格式（1–4）讀進來 = 裝備空、滿血 100、沒擊敗首領、一般模式。
// format 6 起（液體）：header.liquids = { chunks, data }：chunks = 液體或 tile 被改過的 chunk（world.liquidModified ∪
//   modifiedChunks，排序），data = 那些 chunk 依序每格（量, 種類）的 RLE（[長度 varint][量 u8][種類 u8]…）再 base64。
//   沒被動過、生成時已靜置的自然液體不存——讀檔時由 seed 重新生成。讀檔後存檔裡的液體 chunk 會被喚醒（繼續流）。
//   遷移：format ≤ 5 的存檔（生成器 v4）可以讀——以 v5 生成器重建，再貼上被改過的 chunk；
//   那些 chunk 裡落在實心方塊上的新液體清掉、其餘液體喚醒（例如玩家挖過的洞會被附近的新湖灌進去）。
//   v5 相對 v4 的地形差異：多了液體、沙漠綠洲的淺碗、叢林蜂巢、熔岩深淵的低窪池從熔岩石變成熔岩（液體）；
//   樹 / 地表裝飾的亂數流維持 v4（只是水面上不放），所以沒動過的地表與 v4 相同。蜂巢 / 綠洲 / 熔岩池若緊鄰
//   玩家改過的 chunk，接縫處可能不連續（已知限制）。
// format 7 起：header.vitals = { breath, burning, honey }（水下讀檔不會補滿氣、著火 / 蜂蜜計時延續）、
//   header.drops = 地上的掉落物 [{ item, count, x, y（中心 px） }]（死亡掉的錢讀檔後還在原地）、
//   header.bossActive = 存檔時正在打的首領 kind（怪物不存 → 讀檔時退還召喚道具）。
//   死亡中存檔：玩家位置存成重生點（床 / 出生點）、生命 / 魔力存成重生後的滿值——不會在死亡地點（例如熔岩裡）復活。
//   舊格式（≤ 6）讀進來 = 滿氣、沒著火、地上沒有掉落物、不退還。
// format 8 起（裝備詞條）：背包 / 箱子 / 掉落物的每格可帶 gear（稀有度 / 物品等級 / 強化 / 詞條 / 鎖定）；
//   header.combat.equipGear = 裝備欄各格的 gear（與 equipment 同形）；header.extra.codex = 裝備圖鑑。
//   gear 結構不合法 → 存檔損毀（同其他欄位）；舊格式讀進來 = 全部普通、圖鑑空。
//   header.extra.rng = 掉寶 / 釣魚亂數的 sfc32 狀態（各 4 個 uint32）：讀檔後的掉落 / 漁獲接著原本的序列，不會因重讀而重骰；
//   沒有或不合法 → 從種子起點（不算損毀，舊存檔照讀）。
//   尺寸上限：寬 ≤ MAX_WORLD_W、高 ≤ MAX_WORLD_H、面積 ≤ MAX_WORLD_AREA（生成器實際支援的範圍）；
//   液體 chunk 清單長度先和世界 chunk 總數比對，再配置 RLE 解碼緩衝。
// format 9 起：header.vanity = 外觀欄（頭 / 身 / 腿 / 背的時裝或當樣子用的防具 + 詞條）與防具隱藏開關（壞資料各自丟掉）。
// 時裝顏色（不換版號，舊檔沒有 = 原色）：背包 / 箱子 / 掉落物的時裝格可帶 tint = [主色, 副色]（CLOTH_COLORS index）；
//   header.vanity.tint = 外觀欄各格的顏色。格子上的 tint 不合法或放在非時裝上 → 存檔損毀（比照 gear）；外觀欄的壞 tint 丟掉。
// format 9 起：header.appearance = 角色外觀（engine/appearance.ts 的選項索引）。沒有 / 壞掉 → 預設外觀（各欄獨立退回，
//   不算存檔損毀：外觀是裝飾，不該讓整個世界讀不到）。
// header.cformat = 角色資料的版本（save/character.ts CHARACTER_FORMAT；不換存檔版號）：snapshotGame 一律寫目前的版本
//   （活的遊戲已經轉換過）；沒有 = 舊資料。讀檔時 < WARDROBE_CFORMAT → applyCharacter 做一次舊角色的時裝轉換（spec C6）。
// header.levels = 等級 / 經驗 / 技能樹 / 防刷紀錄（engine/levels.ts LevelsJSON）。沒有 / 壞掉 → 各欄位獨立退回預設
//   （技能樹不合法 → 整棵重置、點數退回），不算存檔損毀。
// 無限世界（世界檔 format 11 起；B6：新欄位只在不是預設值時才寫，有界世界的 snapshot 位元組不變）：
//   header.bounds = 'infinite' + header.outerGen（外圍生成器版本）只在無限世界才寫；chunks / liquids.chunks 可含外圍 chunk 鍵、
//   chests / unlocked / minedIce / 結冰 / 半格差分可含外圍 tile 鍵（engine/coords.ts）；chunks = 常駐 + 停放的已修改 chunk。
//   header.exploredOuter = 含中央框外已探索格的 chunk 的迷霧（engine/explore.ts encodeOuter），只在非空時寫。
//   header.stones = 已解鎖的傳送碑 id（世界共用；由小到大），只在非空時寫；讀檔：不是整數陣列 → 當作沒有，
//   還原時以 engine/waystones.ts validStoneIds 過濾（這個世界沒有的碑 / 0 丟掉，不算損毀）。
//   讀檔：有 bounds → 外圍鍵合法、chunk payload 整塊 32 欄寫入；沒有 bounds（format ≤ 10 的舊檔）→ 只接受中央範圍的鍵
//   （restoreBlocker 回 size），payload / 液體 / 箱子只寫 x < width 的格（補零規則：舊 payload 在 x ≥ width 是補的 0，
//   不能把無限世界那幾欄的地形挖成空氣）。
// 門的開 / 關 / 解鎖是 tile 本身（DOOR_CLOSED / DOOR_OPEN / DOOR_LOCKED），跟著被修改的 chunk 一起存。
//
// 二進位格式（little-endian）：
//   [0..4)  magic "DLVS"
//   [4..8)  u32 header JSON 長度 N
//   [8..8+N) header JSON（UTF-8）
//   之後依 header.chunks 順序，每個 chunk：fg CHUNK*CHUNK bytes + wall CHUNK*CHUNK bytes（越界格補 0）
// 世界檔 format 10（co-op，save/worldSave.ts）用同一個容器（encodeContainer / readContainer / readChunks）。
import { DelveGame, BOSS_SUMMON_ITEM, MAX_BREATH, BURN_TIME, HONEY_TIME } from '../engine/game';
import type { World, ChunkData, ChunkPayload, ColumnSource } from '../engine/world';
import { C_BASE, T_BASE, X_LIMIT, chunkOfX, chunkXY, defaultBounds, tileXY, type WorldBounds } from '../engine/coords';
import { fromBase64, toBase64 } from '../engine/base64';
import { Inventory, cloneStack, type InventoryJSON, type Stack } from '../engine/inventory';
import { gearSlot, validGear, type Gear } from '../engine/gear';
import type { CodexJSON } from '../engine/codex';
import { CHEST_SLOTS } from '../engine/loot';
import { CHUNK, GEN_VERSION, INV_SIZE, TILE_SIZE } from '../engine/constants';
import { TILES, WALLS, T, SOLID_LUT, isChestTile } from '../engine/tiles';
import { ITEMS, isItemId, type ItemId } from '../engine/items';
import { MAX_DROPS } from '../engine/entities';
import { ExploredMap, MAX_MARKERS, decodeRle, type MapMarker, type OuterBitsSave } from '../engine/explore';
import type { GenResult } from '../engine/worldgen';
import type { DiscoveryJSON } from '../engine/discovery';
import { Equipment, type EquipmentGearJSON, type EquipmentJSON } from '../engine/equipment';
import { ENEMIES, type EnemyKind } from '../engine/enemies';
import { BASE_HP, MAX_HP_CAP } from '../engine/combat';
import { LIQ, LIQ_MAX } from '../engine/liquidKind';
import { WEATHER_KINDS, type WeatherKind } from '../engine/weather';
import { isRngState, type RngState } from '../engine/rng';
import { normalizeAppearance, type Appearance } from '../engine/appearance';
import { Vanity, type VanityJSON } from '../engine/vanity';
import { WARDROBE_CFORMAT } from '../engine/wardrobeMigration';
import { CHARACTER_FORMAT } from './character';
import { cloneTint, isTintable, validTint, type Tint } from '../engine/tint';
import type { SettlementJSON } from '../engine/settlement';
import { Progression, type LevelsJSON } from '../engine/levels';
import type { FolkJSON } from '../engine/folk';
import type { QuestLogJSON } from '../engine/quests';
import { BUFFS, type BuffKind } from '../engine/folkDefs';
import { validStoneIds } from '../engine/waystones';

export const SAVE_FORMAT = 9;
/** 可以遷移的舊生成器版本（format ≤ 5 的存檔）：v4 → v5（差異見檔頭） */
export const COMPAT_GEN: readonly number[] = [4];
export interface LiquidSave { chunks: number[]; data: string; }
export interface CombatSave {
  hp: number; maxHp: number; mana: number;
  equipment: EquipmentJSON;
  /** 裝備欄各格的詞條；format 8 起 */
  equipGear?: EquipmentGearJSON;
  bosses: string[];
  kills: Partial<Record<EnemyKind, number>>;
  peaceful: boolean;
}
export const CHUNK_BYTES = CHUNK * CHUNK * 2;
const MAGIC = [0x44, 0x4c, 0x56, 0x53]; // "DLVS"
/** 存檔世界尺寸上限（生成器實際支援：預設 4200×1200，最大到 2 倍寬 / 高） */
export const MAX_WORLD_W = 8400;
export const MAX_WORLD_H = 2400;
export const MAX_WORLD_AREA = 21_000_000;
/** 尺寸是否在支援範圍內（整數、≥ 1 chunk、寬 / 高 / 面積上限） */
export function validDims(width: unknown, height: unknown): boolean {
  if (!Number.isInteger(width) || !Number.isInteger(height)) return false;
  const w = width as number, h = height as number;
  return w >= CHUNK && h >= CHUNK && w <= MAX_WORLD_W && h <= MAX_WORLD_H && w * h <= MAX_WORLD_AREA;
}
function chunkTotal(width: number, height: number): number { return Math.ceil(width / CHUNK) * Math.ceil(height / CHUNK); }
/** 尺寸不合法時的 chunk 清單長度上限（只用來擋超大清單；尺寸本身交給 restoreGame 的 size 檢查） */
const MAX_CHUNKS = chunkTotal(MAX_WORLD_W, MAX_WORLD_H);
/** 外圍欄號範圍（X_LIMIT 內） */
const CX_MIN = chunkOfX(-X_LIMIT), CX_MAX = chunkOfX(X_LIMIT - 1);
/**
 * chunk 鍵清單的長度上限 = 合法鍵的總數（清單不重複，所以寫出來的清單一定在這之內）：
 * 有界世界 = 中央 chunk 數；無限世界 = 硬邊界內的所有欄 × 每欄 chunk 數（走得再遠，存檔也讀得回來）
 */
function maxChunkKeys(width: number, height: number, bounds: 'infinite' | undefined): number {
  return bounds === 'infinite' ? (CX_MAX - CX_MIN + 1) * Math.ceil(height / CHUNK) : chunkTotal(width, height);
}
/** 鍵合法性要看的 header 欄位 */
type KeyDims = Pick<SaveHeader, 'width' | 'height' | 'bounds'>;
/** chunk 鍵是否合法：中央鍵 < 中央 chunk 數；外圍鍵只在 bounds 有值時合法（cx 在 X_LIMIT 內、不是中央欄、cy 在範圍內） */
function chunkKeyOk(k: unknown, h: KeyDims): boolean {
  if (!Number.isInteger(k) || (k as number) < 0) return false;
  const cxN = Math.ceil(h.width / CHUNK), cyN = Math.ceil(h.height / CHUNK);
  if ((k as number) < C_BASE) return (k as number) < cxN * cyN;
  if (h.bounds !== 'infinite') return false;
  const { cx, cy } = chunkXY(cxN, k as number);
  return cy < cyN && (cx < 0 || cx >= cxN) && cx >= CX_MIN && cx <= CX_MAX;
}
/** chunk 鍵清單：每個都要合法（見 chunkKeyOk）、不重複，否則存檔損毀；回傳副本 */
export function validChunkKeys(keys: unknown, h: KeyDims): number[] {
  if (!Array.isArray(keys) || keys.length > maxChunkKeys(h.width, h.height, h.bounds)) throw new SaveFormatError('chunk keys');
  for (const k of keys) if (!chunkKeyOk(k, h)) throw new SaveFormatError(`chunk key ${String(k)}`);
  if (new Set(keys).size !== keys.length) throw new SaveFormatError('chunk keys: duplicate');
  return [...keys] as number[];
}
/** tile 鍵是否合法：中央鍵 < width*height；外圍鍵只在 bounds 有值時合法（x 在 X_LIMIT 內且在中央框外、y 在範圍內） */
export function validTileKey(k: number, h: KeyDims): boolean {
  if (!Number.isInteger(k) || k < 0) return false;
  if (k < T_BASE) return k < h.width * h.height;
  if (h.bounds !== 'infinite') return false;
  const { x, y } = tileXY(h.width, k);
  return y < h.height && (x < 0 || x >= h.width) && x >= -X_LIMIT && x < X_LIMIT;
}

export interface PlayerSave { x: number; y: number; vx: number; vy: number; }
/** undying = 不滅（傳奇詞條）冷卻剩餘秒數；format 8 起 */
export interface VitalsSave { breath: number; burning: number; honey: number; undying?: number; }
export interface DropSave { item: ItemId; count: number; x: number; y: number; gear?: Gear; tint?: Tint; }
export interface SaveHeader {
  format: number;
  genVersion: number;
  seed: string;
  width: number;
  height: number;
  time: number;
  tick: number;
  savedAt: number;
  player: PlayerSave;
  inventory: InventoryJSON;
  /** 已排序的 chunk index（cy*chunksX+cx） */
  chunks: number[];
  /** 被修改 chunk 裡的箱子（依 i 排序）；format 1 沒有 */
  chests?: ChestSave[];
  /** 已解鎖的金寶箱（tile index，排序）；format 3 起 */
  unlocked?: number[];
  /** 累計用掉的鑰匙數；format 3 起 */
  keysUsed?: number;
  /** 戰爭迷霧：RLE 位元圖的 base64；format 4 起 */
  explored?: string;
  /** 地圖標記；format 4 起 */
  markers?: MapMarker[];
  /** 發現 / 日誌；format 4 起 */
  discovery?: DiscoveryJSON;
  /** 床（重生點）；format 4 起 */
  bed?: { x: number; y: number } | null;
  /** 戰鬥（生命 / 裝備 / 首領 / 和平模式）；format 5 起 */
  combat?: CombatSave;
  /** 液體（被改過的 chunk 的 RLE）；format 6 起 */
  liquids?: LiquidSave;
  /** 呼吸 / 燃燒 / 蜂蜜計時；format 7 起 */
  vitals?: VitalsSave;
  /** 地上的掉落物；format 7 起 */
  drops?: DropSave[];
  /** 存檔時正在打的首領（讀檔退還召喚道具）；format 7 起 */
  bossActive?: EnemyKind | null;
  /** 曆法 / 天氣：強制天氣、結冰格（tile index 的差分）；沒有 = 讀檔時依日期重算結冰 */
  env?: EnvSave;
  /** 內容 / 打磨（釣魚紀錄等）；沒有 = 空 */
  extra?: ExtraSave;
  /** 角色外觀；format 9 起（沒有 = 預設外觀） */
  appearance?: Appearance;
  /** 角色資料的版本（沒有 = 舊資料，外觀上的服裝 / 頭飾 / 眼鏡還沒轉成時裝物品） */
  cformat?: number;
  /** 外觀欄（時裝）+ 防具隱藏開關；format 9 起（沒有 = 空、都不隱藏） */
  vanity?: VanityJSON;
  /** 據點（爐心）與居民；沒有 = 沒有據點（壞欄位逐筆丟掉，不算損毀） */
  settle?: SettlementJSON;
  /** 半格方塊（建築木槌）：tile index 的差分（同結冰格）；沒有 = 都是整格 */
  halves?: number[];
  /** 等級 / 技能樹（沒有 = 1 級、沒點技能） */
  levels?: LevelsJSON;
  /** 世界 NPC（好感度 / 遇見的旅人 / 冷卻）+ 委託 + buff；沒有 = 都是初始值 */
  folk?: FolkSave;
  /** 無限世界才有（有界世界不寫；format ≤ 10 的舊檔沒有 = 只接受中央範圍的鍵、payload 補零規則） */
  bounds?: 'infinite';
  /** 外圍生成器版本（無限世界才有） */
  outerGen?: number;
  /** 中央框外的迷霧（非空才有） */
  exploredOuter?: OuterBitsSave;
  /** 已解鎖的傳送碑 id（世界共用；非空才有） */
  stones?: number[];
}
export interface FolkSave {
  world: FolkJSON; quests: QuestLogJSON;
  /** 每種 buff 的到期時間（遊戲秒） */
  buffs: Partial<Record<BuffKind, number>>;
  /** 嚮導 / 線索標記 */
  scoutMarks: MapMarker[];
  /** 招募居民的每日好處（上次觸發的天） */
  perkDays: { guide: number; healer: number };
  /** 標過的所有地點（"x,y"） */
  scouted?: string[];
}
export function validFolk(v: unknown): FolkSave | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Partial<FolkSave>;
  const buffs: Partial<Record<BuffKind, number>> = {};
  if (o.buffs && typeof o.buffs === 'object') for (const [k, t] of Object.entries(o.buffs)) if (k in BUFFS && typeof t === 'number' && Number.isFinite(t)) buffs[k as BuffKind] = t;
  const scoutMarks = Array.isArray(o.scoutMarks) ? o.scoutMarks.filter((m) => m && Number.isInteger(m.x) && Number.isInteger(m.y)).slice(0, 60).map((m) => ({ x: m.x, y: m.y })) : [];
  const pd = o.perkDays as { guide?: unknown; healer?: unknown } | undefined;
  const perkDays = { guide: pd && Number.isInteger(pd.guide) ? pd.guide as number : -1, healer: pd && Number.isInteger(pd.healer) ? pd.healer as number : -1 };
  const scouted = Array.isArray(o.scouted) ? o.scouted.filter((k) => typeof k === 'string' && /^\d+,\d+$/.test(k)).slice(0, 4000) : [];
  return { world: (o.world ?? {}) as FolkJSON, quests: (o.quests ?? {}) as QuestLogJSON, buffs, scoutMarks, perkDays, scouted };
}
/** 存檔裡的等級資料 → 正規化後的副本 */
export function validLevels(raw: unknown): LevelsJSON {
  const p = new Progression();
  p.load(raw);
  return p.toJSON();
}
export interface ExtraSave {
  /** 釣魚紀錄：魚種 → 條數 */
  fishLog: Partial<Record<ItemId, number>>;
  /** 玩家敲開的冰洞（tile index） */
  minedIce?: number[];
  /** 裝備圖鑑；format 8 起 */
  codex?: CodexJSON;
  /** 掉寶 / 釣魚亂數的狀態（讀檔後不重骰）；沒有 / 壞的 = 從種子起點開始（不算損毀） */
  rng?: { loot?: RngState; fish?: RngState };
}
export interface EnvSave {
  weather: { kind: WeatherKind; until: number } | null;
  /** 結冰格 tile index（排序後的差分：第一個是絕對值，之後是與前一個的差） */
  frozen: number[];
}
export interface ChestSave { i: number; slots: (Stack | null)[]; }
export type { ChunkPayload } from '../engine/world';
export interface SaveData { header: SaveHeader; chunks: Map<number, ChunkPayload>; }

export class SaveFormatError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SaveFormatError'; }
}

export type RestoreError = 'format' | 'gen_version' | 'size';
export type RestoreResult =
  | { ok: true; game: DelveGame; header: SaveHeader }
  | { ok: false; error: RestoreError; message: string; saveGenVersion?: number };
export interface RestoreOptions {
  /** 生成器版本不符時仍以目前生成器還原（被修改 chunk 照貼，可能有接縫） */
  allowGenMismatch?: boolean;
  /** 預先生成好的世界（同 seed / 大小；標題畫面分段生成、顯示進度用） */
  gen?: GenResult;
  /** 角色第一次來這個世界（save/worldSave.ts restoreSplit）：不套用存檔的位置 / 探索 / 標記 / 發現 / 床，
   *  保留建構子給的出生點狀態（出生點、只揭露出生點周圍、只發現出生地區） */
  freshVisit?: boolean;
  /** 測試用覆寫：世界的水平邊界（省略 = 存檔的 bounds，沒有就 defaultBounds(width, height)：正式尺寸的舊檔打開是無限世界） */
  bounds?: WorldBounds;
  /** 測試用覆寫：中央以外的欄由誰生成 */
  source?: ColumnSource;
}

// ── chunk 讀寫 ─────────────────────────────────────────────
export function readChunk(world: World, ci: number): ChunkPayload {
  const { cx, cy } = world.chunkCoords(ci);
  return world.readChunkPayload(cx, cy);
}

/** 直接覆寫 chunk 內容並標為已修改（不經 setFg，避免逐格 touch）。 */
export function writeChunk(world: World, ci: number, data: ChunkPayload): void {
  const { cx, cy } = world.chunkCoords(ci);
  world.writeChunkPayload(cx, cy, data);
}

/** 兩個同尺寸世界中內容（fg 或 wall）不同的 chunk index，已排序。 */
export function diffChunks(a: World, b: World): number[] {
  if (a.width !== b.width || a.height !== b.height) throw new Error('diffChunks: world size mismatch');
  const out: number[] = [];
  const same = (p: Uint8Array, q: Uint8Array): boolean => { for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false; return true; };
  a.forEachChunk((cx, cy) => {
    const pa = a.readChunkPayload(cx, cy), pb = b.readChunkPayload(cx, cy);
    if (!same(pa.fg, pb.fg) || !same(pa.wall, pb.wall)) out.push(a.chunkIndex(cx, cy));
  });
  return out.sort((p, q) => p - q);
}

// ── 液體 RLE ─────────────────────────────────────────────
/** (量, 種類) 的 run-length：[長度 varint][量][種類]… */
export function encodeLiquidRle(amount: Uint8Array, type: Uint8Array): Uint8Array {
  const out: number[] = [];
  const n = amount.length;
  let i = 0;
  while (i < n) {
    const a = amount[i], t = a ? type[i] : 0;
    let j = i + 1;
    while (j < n && amount[j] === a && (a ? type[j] : 0) === t) j++;
    let len = j - i;
    while (len >= 0x80) { out.push((len & 0x7f) | 0x80); len >>>= 7; }
    out.push(len, a, t);
    i = j;
  }
  return Uint8Array.from(out);
}
/** 解 RLE；長度不符 / 種類不合法 / 量與種類不一致 → SaveFormatError */
export function decodeLiquidRle(bytes: Uint8Array, n: number): { amount: Uint8Array; type: Uint8Array } {
  const amount = new Uint8Array(n), type = new Uint8Array(n);
  let p = 0, i = 0;
  while (p < bytes.length) {
    let len = 0, shift = 0, b: number;
    do {
      if (p >= bytes.length || shift > 28) throw new SaveFormatError('liquids: bad run');
      b = bytes[p++]; len |= (b & 0x7f) << shift; shift += 7;
    } while (b & 0x80);
    if (p + 2 > bytes.length) throw new SaveFormatError('liquids: truncated');
    const a = bytes[p++], t = bytes[p++];
    if (t > LIQ.HONEY || (a === 0) !== (t === 0) || a > LIQ_MAX || len < 1 || i + len > n) throw new SaveFormatError('liquids: bad cell');
    amount.fill(a, i, i + len); type.fill(t, i, i + len);
    i += len;
  }
  if (i !== n) throw new SaveFormatError(`liquids: ${i} cells != ${n}`);
  return { amount, type };
}
/** chunk 清單的液體（依序每 chunk CHUNK*CHUNK 格，越界補 0） */
function readLiquids(world: World, chunks: readonly number[]): { amount: Uint8Array; type: Uint8Array } {
  const K = CHUNK * CHUNK, amount = new Uint8Array(chunks.length * K), type = new Uint8Array(chunks.length * K);
  chunks.forEach((ci, k) => {
    const { cx, cy } = world.chunkCoords(ci);
    world.readChunkLiquids(cx, cy, amount, type, k * K);
  });
  return { amount, type };
}
/** 液體欄位：先驗 chunk 清單（長度 ≤ 合法鍵總數（maxChunkKeys）、鍵合法（外圍鍵只在 bounds 有值時）、不重複），再配置 RLE 解碼緩衝 */
export function validLiquids(v: unknown, width: number, height: number, bounds?: 'infinite'): LiquidSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<LiquidSave> | null;
  const dimsOk = validDims(width, height);
  const total = dimsOk ? maxChunkKeys(width, height, bounds) : MAX_CHUNKS;
  const keyOk = dimsOk ? (c: unknown): boolean => chunkKeyOk(c, { width, height, bounds }) : (c: unknown): boolean => Number.isInteger(c) && (c as number) >= 0 && (c as number) < total;
  if (!o || typeof o !== 'object' || !Array.isArray(o.chunks) || typeof o.data !== 'string' || o.chunks.length > total
    || !o.chunks.every(keyOk)) throw new SaveFormatError('liquids');
  if (new Set(o.chunks).size !== o.chunks.length) throw new SaveFormatError('liquids: duplicate chunk');
  // 尺寸不合法時不解碼（restoreGame 的 size 檢查會拒絕）
  if (dimsOk) {
    let bytes: Uint8Array;
    try { bytes = fromBase64(o.data); } catch { throw new SaveFormatError('liquids: base64'); }
    decodeLiquidRle(bytes, o.chunks.length * CHUNK * CHUNK);
  }
  return { chunks: [...o.chunks], data: o.data };
}
export function validVitals(v: unknown): VitalsSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<VitalsSave> | null;
  if (!o || typeof o !== 'object' || !isNum(o.breath) || !isNum(o.burning) || !isNum(o.honey)) throw new SaveFormatError('vitals');
  const out: VitalsSave = { breath: o.breath, burning: o.burning, honey: o.honey };
  if (isNum(o.undying) && o.undying > 0) out.undying = o.undying;
  return out;
}
export function validDrops(v: unknown): DropSave[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_DROPS) throw new SaveFormatError('drops');
  return v.map((d, k) => {
    const o = d as Partial<DropSave> | null;
    if (!o || typeof o !== 'object' || !isItemId(o.item) || !Number.isInteger(o.count) || (o.count as number) < 1
      || (o.count as number) > ITEMS[o.item].maxStack || !isNum(o.x) || !isNum(o.y)) throw new SaveFormatError(`drop ${k}`);
    const gear = strictGear(o.item, o.gear, `drop ${k}`), tint = strictTint(o.item, o.tint, `drop ${k}`);
    const out: DropSave = { item: o.item, count: o.count as number, x: o.x, y: o.y };
    if (gear) out.gear = gear;
    if (tint) out.tint = tint;
    return out;
  });
}
export function validEnv(v: unknown): EnvSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<EnvSave> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.frozen) || !o.frozen.every((d) => Number.isInteger(d) && d >= 0)) throw new SaveFormatError('env');
  const wx = o.weather as EnvSave['weather'] | undefined;
  const weather = wx && typeof wx === 'object' && WEATHER_KINDS.includes(wx.kind) && isNum(wx.until) ? { kind: wx.kind, until: wx.until } : null;
  return { weather, frozen: [...o.frozen] };
}
export function validHalves(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.filter((d) => Number.isInteger(d) && d >= 0).slice(0, 2_000_000);
}
/** 升冪 tile 鍵 → 差分（第一個是絕對值，之後是與前一個的差） */
function encodeDeltas(keys: readonly number[]): number[] {
  const out: number[] = [];
  let last = 0;
  for (const i of keys) { out.push(i - last); last = i; }
  return out;
}
/** tile 鍵所在的 chunk 鍵 */
function chunkOfKey(w: World, i: number): number {
  const { x, y } = w.tileXY(i);
  return w.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
}
export function validFishLog(v: unknown): Partial<Record<ItemId, number>> {
  const fishLog: Partial<Record<ItemId, number>> = {};
  if (v && typeof v === 'object') {
    for (const [k, n] of Object.entries(v)) if (isItemId(k) && Number.isInteger(n) && (n as number) > 0) fishLog[k] = n as number;
  }
  return fishLog;
}
export function validExtra(v: unknown): ExtraSave | undefined {
  if (v === undefined || v === null || typeof v !== 'object') return undefined;
  const o = v as Partial<ExtraSave>;
  const fishLog = validFishLog(o.fishLog);
  const minedIce = Array.isArray(o.minedIce) ? o.minedIce.filter((i) => Number.isInteger(i) && i >= 0).slice(0, 100000) : [];
  const out: ExtraSave = { fishLog, minedIce };
  if (o.codex && typeof o.codex === 'object') out.codex = o.codex;
  const r = o.rng as { loot?: unknown; fish?: unknown } | undefined;
  if (r && typeof r === 'object') {
    const rng: NonNullable<ExtraSave['rng']> = {};
    if (isRngState(r.loot)) rng.loot = [...r.loot];
    if (isRngState(r.fish)) rng.fish = [...r.fish];
    if (rng.loot || rng.fish) out.rng = rng;
  }
  return out;
}
export function validBossActive(v: unknown): EnemyKind | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new SaveFormatError('bossActive');
  // 未知 / 不是首領的 kind：寬鬆忽略
  return Object.prototype.hasOwnProperty.call(ENEMIES, v) && ENEMIES[v as EnemyKind].boss ? v as EnemyKind : null;
}

// ── 探索位元圖編碼快取：自動存檔每 30 秒一次；迷霧只會增加，揭露格數沒變 = 內容沒變，重用上次的 base64 ──
const exploredCache = new WeakMap<ExploredMap, { count: number; b64: string; outer: OuterBitsSave | undefined }>();
export function encodeExplored(m: ExploredMap): { b64: string; outer: OuterBitsSave | undefined } {
  const c = exploredCache.get(m);
  if (c && c.count === m.count) return c;
  const e = { count: m.count, b64: toBase64(m.encode()), outer: m.encodeOuter() };
  exploredCache.set(m, e);
  return e;
}

// ── snapshot / encode / decode ────────────────────────────
/** 不該發生的狀態：測試環境丟例外（抓出來）；正式環境 console.error、照常繼續（不讓存檔失敗） */
function invariantBroken(msg: string): void {
  // vitest 會設 NODE_ENV = 'test'；瀏覽器裡沒有 process → 一律走 console.error
  if ((globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV === 'test') throw new Error(msg);
  console.error(`[delve] ${msg}`);
}
export function snapshotGame(game: DelveGame, now: number = Date.now()): SaveData {
  const w = game.world;
  // 只存常駐 + 停放的已修改 chunk（readChunkPayload 對兩者都不是的外圍 chunk 回 0，不能當資料寫出）；數字升冪 → 外圍鍵在中央之後
  const parked = new Set(w.parkedChunks());
  const stored = new Set<number>(), lost: number[] = [];
  for (const k of new Set([...w.modifiedChunks, ...w.liquidModified])) {
    if (parked.has(k) || w.isResident(w.chunkCoords(k).cx)) stored.add(k); else lost.push(k);
  }
  // 不該發生：改過的 chunk 卸載時一定停放。內容已經不在記憶體，寫出來只會是 0 → 不寫，但要大聲說
  if (lost.length) invariantBroken(`snapshotGame: modified chunks ${lost.sort((p, q) => p - q).join(',')} are neither resident nor parked (dropped from save)`);
  const list = [...w.modifiedChunks].filter((k) => stored.has(k)).sort((p, q) => p - q);
  const chunks = new Map<number, ChunkPayload>();
  for (const ci of list) chunks.set(ci, readChunk(w, ci));
  const p = game.player;
  const mod = new Set(list);
  const chests: ChestSave[] = [];
  for (const [i, slots] of w.chests) {
    if (!mod.has(chunkOfKey(w, i))) continue;
    chests.push({ i, slots: slots.map((st) => (st ? cloneStack(st) : null)) });
  }
  chests.sort((a, b) => a.i - b.i);
  const liqChunks = [...stored].sort((p, q) => p - q);
  const lq = readLiquids(w, liqChunks);
  // 死亡中：存成重生後的狀態（重生點、滿血滿魔），避免讀檔後在死亡地點（例如熔岩裡）復活
  let player: PlayerSave = { x: p.x, y: p.y, vx: p.vx, vy: p.vy };
  let hp = game.hp, mana = game.mana;
  if (game.dead) {
    const r = game.respawnPoint();
    player = { x: r.x * TILE_SIZE + TILE_SIZE / 2 - p.w / 2, y: (r.y + 1) * TILE_SIZE - p.h, vx: 0, vy: 0 };
    hp = game.maxHp(); mana = game.maxMana();
  }
  const r2 = (v: number): number => Math.round(v * 100) / 100;
  const boss = game.bossEnemy();
  const fog = encodeExplored(game.explored);
  return {
    header: {
      format: SAVE_FORMAT,
      genVersion: GEN_VERSION,
      seed: game.seed,
      width: w.width,
      height: w.height,
      time: game.time,
      tick: game.tick,
      savedAt: now,
      player,
      inventory: game.inventory.toJSON(),
      chunks: list,
      chests,
      unlocked: [...w.unlocked].sort((a, b) => a - b),
      keysUsed: w.keysUsed,
      explored: fog.b64,
      markers: game.markers.map((m) => ({ x: m.x, y: m.y })),
      discovery: game.discovery.toJSON(),
      bed: game.bed ? { ...game.bed } : null,
      combat: {
        hp: r2(hp), maxHp: game.baseMaxHp, mana: r2(mana),
        equipment: game.equipment.toJSON(),
        equipGear: game.equipment.gearJSON(),
        bosses: [...game.bossesDefeated].sort(),
        kills: { ...game.kills },
        peaceful: game.peaceful,
      },
      liquids: { chunks: liqChunks, data: toBase64(encodeLiquidRle(lq.amount, lq.type)) },
      vitals: { breath: r2(game.breath), burning: r2(Math.max(0, game.burning)), honey: r2(Math.max(0, game.honeyT)), ...(game.undyingCd > 0 ? { undying: r2(game.undyingCd) } : {}) },
      drops: game.drops.list.map((d) => {
        const o: DropSave = { item: d.item, count: d.count, x: r2(d.body.x + d.body.w / 2), y: r2(d.body.y + d.body.h / 2) };
        if (d.gear) o.gear = { ...d.gear, affixes: d.gear.affixes.map((a) => ({ ...a })) };
        if (d.tint) o.tint = cloneTint(d.tint);
        return o;
      }),
      bossActive: boss && boss.state !== 'leave' ? boss.kind : null,
      env: { weather: game.weatherOverride ? { ...game.weatherOverride } : null, frozen: encodeDeltas(w.flaggedTiles('frozen')) },
      extra: { fishLog: { ...game.fishLog }, minedIce: [...game.minedIce], codex: game.codex.toJSON(), rng: game.rngState() },
      appearance: { ...game.appearance },
      cformat: CHARACTER_FORMAT,
      vanity: game.vanity.toJSON(),
      settle: game.settle.toJSON(),
      halves: encodeDeltas(w.flaggedTiles('half')),
      levels: game.levels.toJSON(),
      folk: { world: game.folk.toJSON(), quests: game.quests.toJSON(), buffs: { ...game.buffs }, scoutMarks: game.scoutMarks.map((m) => ({ ...m })), perkDays: { ...game.perkDays }, scouted: [...game.scouted] },
      // B6：只在不是預設值時才寫（有界世界 / 沒有外圍迷霧 → 位元組與之前相同）
      ...(w.bounds === 'infinite' ? { bounds: 'infinite' as const, outerGen: w.source ? w.source.version : 0 } : {}),
      ...(fog.outer ? { exploredOuter: { chunks: [...fog.outer.chunks], data: fog.outer.data } } : {}),
      ...(game.stonesUnlocked.size ? { stones: [...game.stonesUnlocked].sort((a, b) => a - b) } : {}),
    },
    chunks,
  };
}

// ── base64（engine/base64.ts；這裡轉出給既有的呼叫端） ───────────────
export { toBase64, fromBase64 };

/** 容器（magic + header JSON + 依 order 的 chunk payload）；舊合併檔與世界檔共用 */
export function encodeContainer(headerJson: unknown, order: readonly number[], chunks: Map<number, ChunkPayload>): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(headerJson));
  const out = new Uint8Array(8 + json.length + order.length * CHUNK_BYTES);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let off = 8 + json.length;
  const half = CHUNK * CHUNK;
  for (const ci of order) {
    const c = chunks.get(ci);
    if (!c) throw new Error(`encodeContainer: missing chunk ${ci}`);
    out.set(c.fg.subarray(0, half), off);
    out.set(c.wall.subarray(0, half), off + half);
    off += CHUNK_BYTES;
  }
  return out;
}

export function encodeSave(data: SaveData): Uint8Array {
  return encodeContainer(data.header, data.header.chunks, data.chunks);
}

/** 容器前半：magic / 長度 / header JSON → 未驗證的 header 與 chunk payload 起點 */
export function readContainer(bytes: Uint8Array): { raw: unknown; body: number } {
  if (bytes.length < 8) throw new SaveFormatError('too short');
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new SaveFormatError('bad magic');
  const len = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
  if (8 + len > bytes.length) throw new SaveFormatError('header truncated');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + len)));
  } catch {
    throw new SaveFormatError('header json');
  }
  return { raw, body: 8 + len };
}

/** 容器後半：總長要剛好、依 order 切出每個 chunk 並驗證 tile / wall id */
export function readChunks(bytes: Uint8Array, body: number, order: readonly number[]): Map<number, ChunkPayload> {
  const need = body + order.length * CHUNK_BYTES;
  if (bytes.length !== need) throw new SaveFormatError(`payload size ${bytes.length} != ${need}`);
  const chunks = new Map<number, ChunkPayload>();
  const half = CHUNK * CHUNK;
  let off = body;
  for (const ci of order) {
    const c = { fg: bytes.slice(off, off + half), wall: bytes.slice(off + half, off + CHUNK_BYTES) };
    validateChunk(ci, c);
    chunks.set(ci, c);
    off += CHUNK_BYTES;
  }
  return chunks;
}

export function isNum(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

/** chunk 內每格 fg / wall id 必須是已知 TILES / WALLS（variant 不存檔，由座標雜湊重算）。 */
export function validateChunk(ci: number, c: ChunkPayload): void {
  const half = CHUNK * CHUNK;
  if (c.fg.length < half || c.wall.length < half) throw new SaveFormatError(`chunk ${ci}: short payload`);
  for (let i = 0; i < half; i++) {
    if (c.fg[i] >= TILES.length) throw new SaveFormatError(`chunk ${ci}: unknown tile ${c.fg[i]}`);
    if (c.wall[i] >= WALLS.length) throw new SaveFormatError(`chunk ${ci}: unknown wall ${c.wall[i]}`);
  }
}

/** 格子上的 gear：沒有 → undefined；有但不合法（或不是裝備）→ 存檔損毀 */
export function strictGear(item: ItemId, raw: unknown, where: string): Gear | undefined {
  if (raw === undefined || raw === null) return undefined;
  const g = gearSlot(item) ? validGear(item, raw) : null;
  if (!g) throw new SaveFormatError(`${where}: gear`);
  return g;
}
/** 格子上的 tint：沒有 → undefined；有但不合法（或不是時裝）→ 存檔損毀 */
function strictTint(item: ItemId, raw: unknown, where: string): Tint | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = isTintable(item) ? validTint(raw) : null;
  if (!t) throw new SaveFormatError(`${where}: tint`);
  return t;
}
export function validStack(st: unknown, where: string): Stack | null {
  if (st === null) return null;
  const o = st as { item?: unknown; count?: unknown; gear?: unknown; tint?: unknown };
  if (!o || typeof o !== 'object' || !isItemId(o.item) || typeof o.count !== 'number'
    || !Number.isInteger(o.count) || o.count < 1 || o.count > ITEMS[o.item].maxStack) {
    throw new SaveFormatError(where);
  }
  const gear = strictGear(o.item, o.gear, where), tint = strictTint(o.item, o.tint, where);
  const out: Stack = { item: o.item, count: o.count };
  if (gear) out.gear = gear;
  if (tint) out.tint = tint;
  return out;
}

export function validUnlocked(v: unknown): number[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((i) => Number.isInteger(i) && i >= 0)) throw new SaveFormatError('unlocked');
  return [...(v as number[])].sort((a, b) => a - b);
}
export function validKeysUsed(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new SaveFormatError('keysUsed');
  return v;
}

/** 迷霧：base64 → RLE → 長度要剛好 width*height（否則損毀）；回傳原字串 */
export function validExplored(v: unknown, width: number, height: number): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new SaveFormatError('explored');
  // 尺寸本身不合法時交給 restoreGame 的 size 檢查
  if (!validDims(width, height)) return v;
  try {
    decodeRle(fromBase64(v), width * height);
  } catch {
    throw new SaveFormatError('explored');
  }
  return v;
}
/** 無限世界標記：沒有 = undefined；只接受 'infinite'（其他 = 損毀） */
export function validBounds(v: unknown): 'infinite' | undefined {
  if (v === undefined) return undefined;
  if (v !== 'infinite') throw new SaveFormatError('bounds');
  return v;
}
/** 外圍生成器版本：沒有 = undefined；非負整數 */
export function validOuterGen(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (!Number.isInteger(v) || (v as number) < 0) throw new SaveFormatError('outerGen');
  return v as number;
}
/** 傳送碑解鎖清單（讀檔第一關，只看形狀）：整數陣列才收（最多 MAX_STONE_IDS 筆）、空的 = 沒有；其他 = 當作沒有（不算損毀） */
export const MAX_STONE_IDS = 4096;
export function validStoneList(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.slice(0, MAX_STONE_IDS).filter((x): x is number => Number.isInteger(x));
  return out.length ? out : undefined;
}
/** 中央框外的迷霧：chunk 鍵合法（validChunkKeys）+ RLE 長度要剛好 chunks*1024；壞了 = 損毀 */
export function validExploredOuter(v: unknown, h: KeyDims): OuterBitsSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<OuterBitsSave> | null;
  if (!o || typeof o !== 'object' || typeof o.data !== 'string') throw new SaveFormatError('exploredOuter');
  const chunks = validChunkKeys(o.chunks, h);
  if (!validDims(h.width, h.height)) return { chunks, data: o.data };
  try {
    decodeRle(fromBase64(o.data), chunks.length * CHUNK * CHUNK);
  } catch {
    throw new SaveFormatError('exploredOuter');
  }
  return { chunks, data: o.data };
}
export function validMarkers(v: unknown): MapMarker[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_MARKERS) throw new SaveFormatError('markers');
  return v.map((m) => {
    const o = m as { x?: unknown; y?: unknown } | null;
    if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y)) throw new SaveFormatError('markers');
    return { x: o.x as number, y: o.y as number };
  });
}
export function validBed(v: unknown): { x: number; y: number } | null {
  if (v === undefined || v === null) return null;
  const o = v as { x?: unknown; y?: unknown };
  if (typeof o !== 'object' || !Number.isInteger(o.x) || !Number.isInteger(o.y)) throw new SaveFormatError('bed');
  return { x: o.x as number, y: o.y as number };
}
/** 戰鬥欄位：型別錯 → 損毀；數值範圍與未知裝備在還原時寬鬆處理 */
export function validCombat(v: unknown): CombatSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<CombatSave> | null;
  if (!o || typeof o !== 'object' || !isNum(o.hp) || !isNum(o.maxHp) || !isNum(o.mana)
    || (o.bosses !== undefined && (!Array.isArray(o.bosses) || !o.bosses.every((b) => typeof b === 'string')))
    || (o.kills !== undefined && (typeof o.kills !== 'object' || o.kills === null || Array.isArray(o.kills)))
    || (o.equipment !== undefined && (typeof o.equipment !== 'object' || o.equipment === null))) {
    throw new SaveFormatError('combat');
  }
  const kills: Partial<Record<EnemyKind, number>> = {};
  for (const [k, n] of Object.entries(o.kills ?? {})) {
    if (Object.prototype.hasOwnProperty.call(ENEMIES, k) && Number.isInteger(n) && (n as number) >= 0) kills[k as EnemyKind] = n as number;
  }
  const eq = Equipment.fromJSON(o.equipment, o.equipGear);
  return {
    hp: o.hp, maxHp: o.maxHp, mana: o.mana,
    equipment: eq.toJSON(),
    equipGear: eq.gearJSON(),
    bosses: (o.bosses ?? []).filter((b) => Object.prototype.hasOwnProperty.call(ENEMIES, b) && ENEMIES[b as EnemyKind].boss),
    kills, peaceful: Boolean(o.peaceful),
  };
}
export function validDiscovery(v: unknown): DiscoveryJSON | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SaveFormatError('discovery');
  return v as DiscoveryJSON;
}

export function validChests(v: unknown): ChestSave[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new SaveFormatError('chests');
  return v.map((c, k) => {
    const o = c as { i?: unknown; slots?: unknown } | null;
    if (!o || typeof o !== 'object' || !Number.isInteger(o.i) || (o.i as number) < 0
      || !Array.isArray(o.slots) || o.slots.length > CHEST_SLOTS) throw new SaveFormatError(`chest ${k}`);
    return { i: o.i as number, slots: o.slots.map((st, j) => validStack(st, `chest ${k} slot ${j}`)) };
  });
}

/** 背包欄位驗證：每格為 null 或 { 已知道具, 1..maxStack 的整數 }；不合法即視為存檔損毀。 */
export function validInventory(v: unknown): InventoryJSON {
  if (v === undefined) return { slots: [], selected: 0 };
  const o = v as { slots?: unknown; selected?: unknown } | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.slots) || o.slots.length > INV_SIZE) {
    throw new SaveFormatError('inventory');
  }
  const slots = o.slots.map((s, i) => validStack(s, `inventory slot ${i}`));
  const selected = typeof o.selected === 'number' && Number.isInteger(o.selected) ? o.selected : 0;
  return { slots, selected };
}

/** 角色資料版本：正整數才算；其他 = 沒有（舊資料） */
function validCformat(v: unknown): v is number { return Number.isInteger(v) && (v as number) >= 1; }

/** 無限世界的欄位（bounds / outerGen / exploredOuter）：有值才放（同 snapshotGame 的 B6） */
export function validOuterFields(h: { width: number; height: number; bounds?: unknown; outerGen?: unknown; exploredOuter?: unknown }):
  Pick<SaveHeader, 'bounds' | 'outerGen' | 'exploredOuter'> {
  const bounds = validBounds(h.bounds), outerGen = validOuterGen(h.outerGen);
  const exploredOuter = validExploredOuter(h.exploredOuter, { width: h.width, height: h.height, bounds });
  return {
    ...(bounds ? { bounds } : {}),
    ...(outerGen !== undefined ? { outerGen } : {}),
    ...(exploredOuter ? { exploredOuter } : {}),
  };
}

/** header.stones：形狀合法且非空才放（同 snapshotGame 的 B6） */
export function stonesField(v: unknown): Pick<SaveHeader, 'stones'> {
  const stones = validStoneList(v);
  return stones ? { stones } : {};
}

export function decodeSave(bytes: Uint8Array): SaveData {
  const { raw, body } = readContainer(bytes);
  const h = raw as Partial<SaveHeader>;
  if (!h || typeof h !== 'object' || !isNum(h.format) || !isNum(h.genVersion) || typeof h.seed !== 'string'
    || !isNum(h.width) || !isNum(h.height) || !isNum(h.time) || !isNum(h.tick)
    || !h.player || !isNum(h.player.x) || !isNum(h.player.y)
    || !Array.isArray(h.chunks) || !h.chunks.every((c) => Number.isInteger(c) && c >= 0)) {
    throw new SaveFormatError('header fields');
  }
  const outer = validOuterFields({ ...h, width: h.width, height: h.height });
  const header: SaveHeader = {
    format: h.format, genVersion: h.genVersion, seed: h.seed, width: h.width, height: h.height,
    time: h.time, tick: h.tick, savedAt: isNum(h.savedAt) ? h.savedAt : 0,
    player: { x: h.player.x, y: h.player.y, vx: isNum(h.player.vx) ? h.player.vx : 0, vy: isNum(h.player.vy) ? h.player.vy : 0 },
    inventory: validInventory(h.inventory),
    chunks: h.chunks as number[],
    chests: validChests(h.chests),
    unlocked: validUnlocked(h.unlocked),
    keysUsed: validKeysUsed(h.keysUsed),
    explored: validExplored(h.explored, h.width, h.height),
    markers: validMarkers(h.markers),
    discovery: validDiscovery(h.discovery),
    bed: validBed(h.bed),
    combat: validCombat(h.combat),
    liquids: validLiquids(h.liquids, h.width, h.height, outer.bounds),
    vitals: validVitals(h.vitals),
    drops: validDrops(h.drops),
    bossActive: validBossActive(h.bossActive),
    env: validEnv(h.env),
    extra: validExtra(h.extra),
    appearance: normalizeAppearance(h.appearance),
    ...(validCformat(h.cformat) ? { cformat: h.cformat } : {}),
    vanity: Vanity.fromJSON(h.vanity).toJSON(),
    settle: h.settle && typeof h.settle === 'object' ? h.settle : undefined,
    halves: validHalves(h.halves),
    levels: validLevels(h.levels),
    folk: validFolk(h.folk),
    ...outer,
    ...stonesField(h.stones),
  };
  return { header, chunks: readChunks(bytes, body, header.chunks) };
}

/**
 * 被修改 chunk 裡：丟掉世界生成的箱子，依 tile 重建空箱，再套用存檔內容。
 * maxX（不含）= 補零規則的上限（沒有 bounds 的舊檔 = width：x ≥ width 是 payload 補的 0，不是存檔內容）。
 */
function restoreChests(w: World, chunks: readonly number[], saved: readonly ChestSave[], h: KeyDims, maxX: number,
  fgAt: (x: number, y: number) => number = (x, y) => w.getFg(x, y)): void {
  const mod = new Set(chunks);
  // x ≥ maxX 的格不是存檔內容（補零）：那裡生成的箱子留著
  for (const i of [...w.chests.keys()]) if (mod.has(chunkOfKey(w, i)) && w.tileXY(i).x < maxX) w.chests.delete(i);
  for (const ci of mod) {
    const { cx, cy } = w.chunkCoords(ci);
    // 世界外的格讀到 STONE（不是箱子）→ 不必另夾左右邊界
    for (let y = cy * CHUNK; y < Math.min(w.height, (cy + 1) * CHUNK); y++) {
      for (let x = cx * CHUNK; x < Math.min((cx + 1) * CHUNK, maxX); x++) {
        if (isChestTile(fgAt(x, y))) w.chests.set(w.idx(x, y), new Array<Stack | null>(CHEST_SLOTS).fill(null));
      }
    }
  }
  for (const c of saved) {
    if (!validTileKey(c.i, h)) continue;
    const { x, y } = w.tileXY(c.i);
    if (!isChestTile(fgAt(x, y)) || !mod.has(chunkOfKey(w, c.i))) continue;
    const slots = new Array<Stack | null>(CHEST_SLOTS).fill(null);
    c.slots.forEach((st, k) => { slots[k] = st ? cloneStack(st) : null; });
    w.chests.set(c.i, slots);
  }
}

const CK = CHUNK * CHUNK;
/**
 * 讀檔時沒常駐的外圍欄（離讀檔後的玩家很遠）：存檔裡的 chunk 直接組成六層、最後停放（world.parkChunk），
 * 不生成、不常駐 → 讀檔時間不隨走過的距離增加（B8）。fg / wall 用存檔 payload、液體用存檔的液體；
 * 只有缺層的 chunk（只有液體被改過、或沒有液體紀錄）才暫時生成那一欄（peekColumn）補上。
 */
export class FarChunks {
  readonly map = new Map<number, ChunkData>();
  private readonly peeked = new Map<number, ChunkData[]>();
  constructor(private readonly w: World, private readonly payload: ReadonlySet<number>, private readonly liquid: ReadonlySet<number>) {}
  /** 第 cx 欄讀檔時沒常駐 → 它的存檔 chunk 走停放 */
  isFar(cx: number): boolean { return !this.w.isResident(cx); }
  /** chunk ci 的六層（第一次用到時建立） */
  get(ci: number): ChunkData {
    const have = this.map.get(ci);
    if (have) return have;
    const { cx, cy } = this.w.chunkCoords(ci);
    let d: ChunkData;
    if (this.payload.has(ci) && this.liquid.has(ci)) {
      d = { fg: new Uint8Array(CK), wall: new Uint8Array(CK), liquid: new Uint8Array(CK), liquidType: new Uint8Array(CK), frozen: new Uint8Array(CK), half: new Uint8Array(CK) };
    } else {
      let col = this.peeked.get(cx);
      if (!col) {
        const c = this.w.peekColumn(cx);
        const take = (a: Uint8Array, k: number): Uint8Array => { const b = new Uint8Array(CK); b.set(a.subarray(k * CK, Math.min((k + 1) * CK, a.length))); return b; };
        col = [];
        for (let k = 0; k < this.w.chunksY; k++) {
          col.push({ fg: take(c.fg, k), wall: take(c.wall, k), liquid: take(c.liquid, k), liquidType: take(c.liquidType, k), frozen: take(c.frozen, k), half: take(c.half, k) });
        }
        this.peeked.set(cx, col);
      }
      d = col[cy];
    }
    this.map.set(ci, d);
    return d;
  }
  /** (x,y) 落在已建立的停放 chunk → 那個 chunk 與格的索引（ly*CHUNK + lx）；否則 null */
  at(x: number, y: number): { d: ChunkData; i: number } | null {
    if (y < 0 || y >= this.w.height) return null;
    const d = this.map.get(this.w.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK)));
    return d ? { d, i: (y % CHUNK) * CHUNK + (x & 31) } : null;
  }
  /** (x,y) 的前景：停放 chunk 裡的讀它，否則讀世界 */
  fgAt(x: number, y: number): number {
    const a = this.at(x, y);
    return a ? a.d.fg[a.i] : this.w.getFg(x, y);
  }
  /**
   * 全部停放（之後走近時 ensureColumn 生成那一欄再蓋上）。停放被拒絕（那一欄在讀檔途中變成常駐）→ 不能默默丟掉：
   * 六層直接寫進常駐欄，修改標記維持存檔內容（writeChunk 會兩種都標）；不進編輯日誌（B5）。回傳改走寫入的 chunk 鍵（升冪；呼叫端喚醒液體）
   */
  park(): number[] {
    const wrote: number[] = [];
    const w = this.w;
    for (const [ci, d] of this.map) {
      const { cx, cy } = w.chunkCoords(ci);
      if (w.parkChunk(cx, cy, d)) continue;
      const mod = w.modifiedChunks.has(ci), liq = w.liquidModified.has(ci);
      w.writeChunk(cx, cy, d, { journal: false });
      if (!mod) w.modifiedChunks.delete(ci);
      if (!liq) w.liquidModified.delete(ci);
      wrote.push(ci);
    }
    return wrote.sort((p, q) => p - q);
  }
}

export function serializeGame(game: DelveGame, now?: number): Uint8Array {
  return encodeSave(snapshotGame(game, now));
}

/** 還原前的檢查（不必生成世界）：格式範圍、生成器版本（format ≤ 5 的 COMPAT_GEN 可遷移）、世界大小、chunk 範圍 */
export function restoreBlocker(h: SaveHeader, opts: RestoreOptions = {}): Extract<RestoreResult, { ok: false }> | null {
  if (!Number.isInteger(h.format) || h.format < 1 || h.format > SAVE_FORMAT) return { ok: false, error: 'format', message: `format ${h.format}` };
  const migrate = h.genVersion !== GEN_VERSION && h.format <= 5 && COMPAT_GEN.includes(h.genVersion);
  if (h.genVersion !== GEN_VERSION && !migrate && !opts.allowGenMismatch) {
    return {
      ok: false, error: 'gen_version', saveGenVersion: h.genVersion,
      message: `save generated with v${h.genVersion}, current generator v${GEN_VERSION}`,
    };
  }
  if (!validDims(h.width, h.height)) {
    return { ok: false, error: 'size', message: `bad size ${h.width}x${h.height}` };
  }
  // 中央鍵要在範圍內；外圍鍵只在 bounds 有值（format 11 的無限世界）時合法
  for (const ci of h.chunks) if (!chunkKeyOk(ci, h)) return { ok: false, error: 'size', message: `chunk ${ci} out of range` };
  return null;
}

/** 角色隨身的狀態（restoreGame 與 split.planNewWorld 共用 applyCharacter 套到遊戲上） */
export interface CharacterState {
  appearance?: Appearance;
  inventory: InventoryJSON;
  vanity?: VanityJSON;
  levels?: LevelsJSON;
  /** 沒有（format < 5）→ 裝備 / 血魔維持建構子的初始值 */
  combat?: { maxHp: number; hp: number; mana: number; equipment: EquipmentJSON; equipGear?: EquipmentGearJSON };
  /** 沒有（format < 7）→ 維持 0 */
  undying?: number;
  /** 沒有（舊格式沒有 extra）→ 釣魚紀錄 / 圖鑑維持初始值 */
  extra?: { fishLog?: Partial<Record<ItemId, number>>; codex?: CodexJSON };
  /** 絕對時間（到 game.time 為止有效）；呼叫端先設好 game.time */
  buffs: Partial<Record<BuffKind, number>>;
  /** 角色資料的版本；沒有 / < WARDROBE_CFORMAT = 舊角色 → 套用後做一次時裝轉換 */
  cformat?: number;
}

/** 這份角色資料還沒做過時裝轉換（cformat 沒有 / < WARDROBE_CFORMAT） */
export function needsWardrobeMigration(cformat: unknown): boolean {
  return !(validCformat(cformat) && cformat >= WARDROBE_CFORMAT);
}

/**
 * 把角色隨身的狀態套到遊戲上（不動世界 / 位置 / 探索）。舊角色（cformat < WARDROBE_CFORMAT）最後做一次時裝轉換：
 * 這裡是唯一有活 game 的載入點（轉出來的東西背包放不下要掉在玩家腳邊，呼叫端要先放好玩家位置）。
 * wardrobe = false：呼叫端自己晚點呼叫 game.migrateWardrobe()（restoreGame 要等世界存檔裡的掉落物放回去之後才轉換，
 * 不然轉出來掉在腳邊的東西會被讀回來的掉落物依 MAX_DROPS 從最舊的擠掉）。
 */
export function applyCharacter(game: DelveGame, s: CharacterState, wardrobe = true): void {
  if (s.appearance) game.setAppearance(s.appearance);
  game.inventory = Inventory.fromJSON(s.inventory);
  game.vanity = Vanity.fromJSON(s.vanity);
  game.levels.load(s.levels);
  const c = s.combat;
  if (c) {
    game.baseMaxHp = Math.max(BASE_HP, Math.min(MAX_HP_CAP, Math.round(c.maxHp / 20) * 20));
    game.equipment = Equipment.fromJSON(c.equipment, c.equipGear);
    const max = game.maxHp();
    game.hp = c.hp > 0 ? Math.min(max, c.hp) : max;
    game.mana = Math.max(0, Math.min(game.maxMana(), c.mana));
  }
  if (s.undying !== undefined) game.undyingCd = Math.max(0, Math.min(999, s.undying));
  if (s.extra) {
    game.fishLog = { ...s.extra.fishLog };
    game.codex.load(s.extra.codex);
  }
  game.buffs = { ...s.buffs };
  if (wardrobe && needsWardrobeMigration(s.cformat)) game.migrateWardrobe();
}

/** 由存檔位元組（或已解碼資料）還原遊戲。永不丟例外，錯誤以結果回報。 */
export function restoreGame(input: Uint8Array | SaveData, opts: RestoreOptions = {}): RestoreResult {
  let data: SaveData;
  try {
    data = input instanceof Uint8Array ? decodeSave(input) : input;
    if (!(input instanceof Uint8Array)) {
      for (const [ci, c] of data.chunks) validateChunk(ci, c);
      validInventory(data.header.inventory);
      validChests(data.header.chests);
      validUnlocked(data.header.unlocked);
      validKeysUsed(data.header.keysUsed);
      validExplored(data.header.explored, data.header.width, data.header.height);
      validMarkers(data.header.markers);
      validBed(data.header.bed);
      validDiscovery(data.header.discovery);
      data.header.combat = validCombat(data.header.combat);
      Object.assign(data.header, validOuterFields(data.header));
      validLiquids(data.header.liquids, data.header.width, data.header.height, data.header.bounds);
      data.header.vitals = validVitals(data.header.vitals);
      data.header.drops = validDrops(data.header.drops);
      data.header.bossActive = validBossActive(data.header.bossActive);
      data.header.env = validEnv(data.header.env);
      data.header.extra = validExtra(data.header.extra);
      data.header.appearance = normalizeAppearance(data.header.appearance);
      data.header.vanity = Vanity.fromJSON(data.header.vanity).toJSON();
      data.header.levels = validLevels(data.header.levels);
    }
  } catch (e) {
    return { ok: false, error: 'format', message: e instanceof Error ? e.message : String(e) };
  }
  const h = data.header;
  const blocked = restoreBlocker(h, opts);
  if (blocked) return blocked;
  // 沒有 bounds 的存檔（format ≤ 10）：正式尺寸 → 無限世界、小尺寸的測試世界 → 有界（CONFLICT-2）
  const game = new DelveGame({
    seed: h.seed, width: h.width, height: h.height, gen: opts.gen, appearance: h.appearance,
    bounds: opts.bounds ?? h.bounds ?? defaultBounds(h.width, h.height), columnSource: opts.source,
  });
  const w = game.world;
  // 讀檔後玩家所在的那一帶先載入（存檔內容直接寫進常駐欄）；其他沒常駐的外圍欄的存檔 chunk 直接停放（FarChunks）
  if (!opts.freshVisit) game.ensureAround(Math.floor((h.player.x + game.player.w / 2) / TILE_SIZE));
  const far = new FarChunks(w, new Set(h.chunks.filter((ci) => data.chunks.has(ci))), new Set(h.liquids?.chunks ?? []));
  // 補零規則：沒有 bounds（format ≤ 10）的 payload 在 x ≥ width 是補的 0 → 只寫 x < width（其餘留給生成器 / 來源）
  const maxX = h.bounds ? Infinity : h.width;
  for (const ci of h.chunks) {
    const c = data.chunks.get(ci);
    if (!c) continue;
    const { cx, cy } = w.chunkCoords(ci);
    if (far.isFar(cx)) {
      const d = far.get(ci);
      d.fg.set(c.fg.subarray(0, CK)); d.wall.set(c.wall.subarray(0, CK));
      w.modifiedChunks.add(ci);
      continue;
    }
    w.writeChunkPayload(cx, cy, c, h.bounds ? undefined : h.width);
  }
  restoreChests(w, h.chunks, h.chests ?? [], h, maxX, (x, y) => far.fgAt(x, y));
  // 液體（format 6）：存檔裡的 chunk 整塊覆蓋；舊格式：被改過 chunk 裡蓋在方塊上的新液體清掉
  const wake: number[] = [...h.chunks];
  if (h.liquids) {
    const lq = decodeLiquidRle(fromBase64(h.liquids.chunks.length ? h.liquids.data : ''), h.liquids.chunks.length * CHUNK * CHUNK);
    const K = CHUNK * CHUNK;
    h.liquids.chunks.forEach((ci, k) => {
      if (!chunkKeyOk(ci, h)) return;
      const { cx, cy } = w.chunkCoords(ci);
      if (far.isFar(cx)) {
        const d = far.get(ci), n = Math.min(CHUNK, w.height - cy * CHUNK) * CHUNK;
        for (let j = 0; j < n; j++) { d.liquid[j] = lq.amount[k * K + j]; d.liquidType[j] = lq.type[k * K + j]; }
        w.liquidModified.add(ci);
        return;
      }
      const lxEnd = Math.min(CHUNK, maxX - cx * CHUNK);
      // 世界外的格 setLiquidRaw 會丟掉；沒有 bounds 的舊檔只寫 x < width（補零規則）
      for (let ly = 0; ly < CHUNK; ly++) {
        const y = cy * CHUNK + ly;
        if (y >= w.height) break;
        for (let lx = 0; lx < lxEnd; lx++) {
          const o = k * K + ly * CHUNK + lx;
          w.setLiquidRaw(cx * CHUNK + lx, y, lq.amount[o], lq.type[o]);
        }
      }
      w.liquidModified.add(ci);
      wake.push(ci);
    });
  } else {
    for (const ci of h.chunks) {
      const { cx, cy } = w.chunkCoords(ci);
      for (let y = cy * CHUNK; y < Math.min(w.height, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min((cx + 1) * CHUNK, maxX); x++) {
        if (w.getLiquid(x, y) && w.isSolid(x, y)) w.setLiquidRaw(x, y, 0, 0);
      }
    }
  }
  for (const ci of wake) {
    const { cx, cy } = w.chunkCoords(ci);
    // 停放的 chunk 走近載入時才整塊喚醒
    if (far.isFar(cx)) continue;
    game.liquids.wakeRect(cx * CHUNK - 1, cy * CHUNK - 1, (cx + 1) * CHUNK + 1, (cy + 1) * CHUNK + 1);
  }
  for (const i of h.unlocked ?? []) {
    if (!validTileKey(i, h)) continue;
    const { x, y } = w.tileXY(i);
    if (far.fgAt(x, y) === T.LOCKED_CHEST) w.unlocked.add(i);
  }
  w.keysUsed = h.keysUsed ?? 0;
  // 傳送碑解鎖（世界共用；freshVisit 也照樣讀：是世界的東西不是角色的）
  for (const id of validStoneIds(h.stones, game.waystones)) game.stonesUnlocked.add(id);
  w.markAllDirty();
  // 第一次來這個世界（freshVisit）：位置 / 探索 / 標記 / 發現 / 床維持建構子的出生點狀態
  if (!opts.freshVisit) {
    game.player.x = h.player.x;
    game.player.y = h.player.y;
    game.player.vx = h.player.vx;
    game.player.vy = h.player.vy;
  }
  game.time = h.time;
  game.tick = h.tick;
  if (!opts.freshVisit) {
    // 探索（format 4）；舊格式 = 什麼都沒探索
    const explored = h.explored
      ? ExploredMap.decode(fromBase64(h.explored), w.width, w.height, h.exploredOuter, w)
      : new ExploredMap(w.width, w.height, undefined, w);
    game.setExploration(explored, (h.markers ?? []).map((m) => ({ ...m })));
    if (h.discovery) game.discovery.load(h.discovery);
    else game.discovery.found.clear();
    game.bed = h.bed && w.inBounds(h.bed.x, h.bed.y) ? { ...h.bed } : null;
  }
  // 戰鬥（format 5）的世界部分；舊格式 = 一般模式
  const c = h.combat;
  if (c) {
    for (const b of c.bosses) game.bossesDefeated.add(b);
    game.kills = { ...c.kills };
    game.peaceful = c.peaceful;
  }
  // 角色隨身的狀態（背包 / 外觀 / 等級 / 裝備 / 血魔 / 不滅冷卻 / 釣魚紀錄 / 圖鑑 / buff）
  applyCharacter(game, {
    inventory: h.inventory, vanity: h.vanity, levels: h.levels,
    combat: c ? { maxHp: c.maxHp, hp: c.hp, mana: c.mana, equipment: c.equipment, equipGear: c.equipGear } : undefined,
    undying: h.vitals ? (h.vitals.undying ?? 0) : undefined,
    extra: h.extra,
    buffs: h.folk ? h.folk.buffs : {},
    cformat: h.cformat,
  }, false);
  // 呼吸 / 燃燒 / 蜂蜜（format 7）；舊格式 = 滿氣、沒著火
  if (h.vitals) {
    game.breath = Math.max(0, Math.min(MAX_BREATH, h.vitals.breath));
    game.burning = Math.max(0, Math.min(BURN_TIME, h.vitals.burning));
    game.honeyT = Math.max(0, Math.min(HONEY_TIME, h.vitals.honey));
  }
  // 地上的掉落物（format 7）：放回原地、靜止
  for (const d of h.drops ?? []) {
    if (d.x < w.xMin * TILE_SIZE || d.y < 0 || d.x > w.xMax * TILE_SIZE || d.y > w.height * TILE_SIZE) continue;
    game.drops.spawn(d.item, d.count, d.x, d.y, 0, 0, 0, d.gear ? { ...d.gear, affixes: d.gear.affixes.map((a) => ({ ...a })) } : undefined, d.tint);
  }
  // 舊角色的時裝轉換（spec C6）：放在掉落物讀回來之後（玩家位置已經放好），背包放不下而掉在腳邊的轉換物品
  // 是最新的掉落物；掉落物總數超過 MAX_DROPS 時被擠掉的是最舊的存檔掉落物，不是轉換出來的東西
  if (needsWardrobeMigration(h.cformat)) game.migrateWardrobe();
  // 曆法 / 天氣：結冰格（只留在還有水的格）、強制天氣；舊存檔沒有 → 依日期重算結冰
  if (h.env) {
    for (const k of w.flaggedTiles('frozen')) { const p = w.tileXY(k); w.setFlag('frozen', p.x, p.y, false); }
    let i = 0;
    for (let k = 0; k < h.env.frozen.length; k++) {
      i += h.env.frozen[k];
      if (!validTileKey(i, h)) continue;
      const p = w.tileXY(i), x = p.x, y = p.y;
      const a = far.at(x, y);
      if (a) {
        if (a.d.liquidType[a.i] === LIQ.WATER && a.d.liquid[a.i] > 0 && SOLID_LUT[a.d.fg[a.i]] !== 1) a.d.frozen[a.i] = 1;
        continue;
      }
      if (w.inBounds(x, y) && w.getLiquidType(x, y) === LIQ.WATER && w.getLiquid(x, y) > 0 && !w.isSolid(x, y)) w.setFlag('frozen', x, y, true);
    }
    game.weatherOverride = h.env.weather ? { ...h.env.weather } : null;
    game.syncDay();
  } else game.refreshSeason();
  if (h.extra) {
    for (const i of h.extra.minedIce ?? []) { if (!validTileKey(i, h)) continue; const { x, y } = w.tileXY(i); if (w.inBounds(x, y)) game.minedIce.add(i); }
    if (h.extra.rng) game.setRngState(h.extra.rng);
  }
  // 半格方塊（只留在實心格）、據點 / 居民（核心那格要還是爐心）
  if (h.halves) {
    let i = 0;
    for (let k = 0; k < h.halves.length; k++) {
      i += h.halves[k];
      if (!validTileKey(i, h)) continue;
      const { x, y } = w.tileXY(i);
      const a = far.at(x, y);
      if (a) { if (SOLID_LUT[a.d.fg[a.i]] === 1) a.d.half[a.i] = 1; continue; }
      if (w.inBounds(x, y) && w.isSolid(x, y)) w.setFlag('half', x, y, true);
    }
  }
  // 遠方的存檔 chunk 停放（據點核心那幾欄接著由 settle.load 載入、蓋回來）；途中變成常駐的欄改成直接寫入 → 喚醒液體
  for (const ci of far.park()) {
    const { cx, cy } = w.chunkCoords(ci);
    game.liquids.wakeRect(cx * CHUNK - 1, cy * CHUNK - 1, (cx + 1) * CHUNK + 1, (cy + 1) * CHUNK + 1);
  }
  game.settle.load(h.settle, w);
  game.folk.load(h.folk?.world, w);
  game.quests.load(h.folk?.quests);
  game.scoutMarks = h.folk ? h.folk.scoutMarks.map((m) => ({ ...m })) : [];
  if (h.folk) game.perkDays = { ...h.folk.perkDays };
  game.scouted.clear();
  for (const k of h.folk?.scouted ?? []) game.scouted.add(k);
  for (const m of game.scoutMarks) game.scouted.add(`${m.x},${m.y}`);
  // 首領戰中存檔（怪物不存）：退還召喚道具，背包滿就掉在腳邊
  const refund = h.bossActive ? BOSS_SUMMON_ITEM[h.bossActive] : undefined;
  if (refund && !game.bossEnemy()) {
    const left = game.inventory.add(refund, 1);
    if (left > 0) { const pc = game.playerCenter(); game.drops.spawn(refund, left, pc.x, pc.y, 0, 0); }
  }
  return { ok: true, game, header: h };
}
