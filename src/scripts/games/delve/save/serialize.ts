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
//   尺寸上限：寬 ≤ MAX_WORLD_W、高 ≤ MAX_WORLD_H、面積 ≤ MAX_WORLD_AREA（生成器實際支援的範圍）；
//   液體 chunk 清單長度先和世界 chunk 總數比對，再配置 RLE 解碼緩衝。
// 門的開 / 關 / 解鎖是 tile 本身（DOOR_CLOSED / DOOR_OPEN / DOOR_LOCKED），跟著被修改的 chunk 一起存。
//
// 二進位格式（little-endian）：
//   [0..4)  magic "DLVS"
//   [4..8)  u32 header JSON 長度 N
//   [8..8+N) header JSON（UTF-8）
//   之後依 header.chunks 順序，每個 chunk：fg CHUNK*CHUNK bytes + wall CHUNK*CHUNK bytes（越界格補 0）
import { DelveGame, BOSS_SUMMON_ITEM, MAX_BREATH, BURN_TIME, HONEY_TIME } from '../engine/game';
import type { World } from '../engine/world';
import { Inventory, type InventoryJSON, type Stack } from '../engine/inventory';
import { CHEST_SLOTS } from '../engine/loot';
import { CHUNK, GEN_VERSION, INV_SIZE, TILE_SIZE } from '../engine/constants';
import { TILES, WALLS, T, isChestTile } from '../engine/tiles';
import { ITEMS, isItemId, type ItemId } from '../engine/items';
import { MAX_DROPS } from '../engine/entities';
import { ExploredMap, MAX_MARKERS, decodeRle, type MapMarker } from '../engine/explore';
import type { DiscoveryJSON } from '../engine/discovery';
import { Equipment, type EquipmentJSON } from '../engine/equipment';
import { ENEMIES, type EnemyKind } from '../engine/enemies';
import { BASE_HP, MAX_HP_CAP } from '../engine/combat';
import { LIQ, LIQ_MAX } from '../engine/liquidKind';
import { WEATHER_KINDS, type WeatherKind } from '../engine/weather';

export const SAVE_FORMAT = 7;
/** 可以遷移的舊生成器版本（format ≤ 5 的存檔）：v4 → v5（差異見檔頭） */
export const COMPAT_GEN: readonly number[] = [4];
export interface LiquidSave { chunks: number[]; data: string; }
export interface CombatSave {
  hp: number; maxHp: number; mana: number;
  equipment: EquipmentJSON;
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

export interface PlayerSave { x: number; y: number; vx: number; vy: number; }
export interface VitalsSave { breath: number; burning: number; honey: number; }
export interface DropSave { item: ItemId; count: number; x: number; y: number; }
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
}
export interface ExtraSave {
  /** 釣魚紀錄：魚種 → 條數 */
  fishLog: Partial<Record<ItemId, number>>;
  /** 玩家敲開的冰洞（tile index） */
  minedIce?: number[];
}
export interface EnvSave {
  weather: { kind: WeatherKind; until: number } | null;
  /** 結冰格 tile index（排序後的差分：第一個是絕對值，之後是與前一個的差） */
  frozen: number[];
}
export interface ChestSave { i: number; slots: (Stack | null)[]; }
export interface ChunkPayload { fg: Uint8Array; wall: Uint8Array; }
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
}

// ── chunk 讀寫 ─────────────────────────────────────────────
export function readChunk(world: World, ci: number): ChunkPayload {
  const { cx, cy } = world.chunkCoords(ci);
  const fg = new Uint8Array(CHUNK * CHUNK), wall = new Uint8Array(CHUNK * CHUNK);
  for (let ly = 0; ly < CHUNK; ly++) {
    const y = cy * CHUNK + ly;
    if (y >= world.height) break;
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      if (x >= world.width) break;
      const wi = y * world.width + x;
      fg[ly * CHUNK + lx] = world.fg[wi];
      wall[ly * CHUNK + lx] = world.wall[wi];
    }
  }
  return { fg, wall };
}

/** 直接覆寫 chunk 內容並標為已修改（不經 setFg，避免逐格 touch）。 */
export function writeChunk(world: World, ci: number, data: ChunkPayload): void {
  const { cx, cy } = world.chunkCoords(ci);
  for (let ly = 0; ly < CHUNK; ly++) {
    const y = cy * CHUNK + ly;
    if (y >= world.height) break;
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = cx * CHUNK + lx;
      if (x >= world.width) break;
      const wi = y * world.width + x;
      world.fg[wi] = data.fg[ly * CHUNK + lx];
      world.wall[wi] = data.wall[ly * CHUNK + lx];
    }
  }
  world.modifiedChunks.add(ci);
}

/** 兩個同尺寸世界中內容（fg 或 wall）不同的 chunk index，已排序。 */
export function diffChunks(a: World, b: World): number[] {
  if (a.width !== b.width || a.height !== b.height) throw new Error('diffChunks: world size mismatch');
  const out = new Set<number>();
  for (let i = 0; i < a.fg.length; i++) {
    if (a.fg[i] !== b.fg[i] || a.wall[i] !== b.wall[i]) {
      const x = i % a.width, y = (i - x) / a.width;
      out.add(a.chunkIndex(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    }
  }
  return [...out].sort((p, q) => p - q);
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
    for (let ly = 0; ly < CHUNK; ly++) {
      const y = cy * CHUNK + ly;
      if (y >= world.height) break;
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = cx * CHUNK + lx;
        if (x >= world.width) break;
        const wi = y * world.width + x, o = k * K + ly * CHUNK + lx;
        amount[o] = world.liquid[wi]; type[o] = world.liquid[wi] ? world.liquidType[wi] : 0;
      }
    }
  });
  return { amount, type };
}
/** 液體欄位：先驗 chunk 清單（長度 ≤ 世界 chunk 總數、index 在範圍內、不重複），再配置 RLE 解碼緩衝 */
function validLiquids(v: unknown, width: number, height: number): LiquidSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<LiquidSave> | null;
  const dimsOk = validDims(width, height);
  const total = dimsOk ? chunkTotal(width, height) : MAX_CHUNKS;
  if (!o || typeof o !== 'object' || !Array.isArray(o.chunks) || typeof o.data !== 'string' || o.chunks.length > total
    || !o.chunks.every((c) => Number.isInteger(c) && c >= 0 && c < total)) throw new SaveFormatError('liquids');
  if (new Set(o.chunks).size !== o.chunks.length) throw new SaveFormatError('liquids: duplicate chunk');
  // 尺寸不合法時不解碼（restoreGame 的 size 檢查會拒絕）
  if (dimsOk) {
    let bytes: Uint8Array;
    try { bytes = fromBase64(o.data); } catch { throw new SaveFormatError('liquids: base64'); }
    decodeLiquidRle(bytes, o.chunks.length * CHUNK * CHUNK);
  }
  return { chunks: [...o.chunks], data: o.data };
}
function validVitals(v: unknown): VitalsSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<VitalsSave> | null;
  if (!o || typeof o !== 'object' || !isNum(o.breath) || !isNum(o.burning) || !isNum(o.honey)) throw new SaveFormatError('vitals');
  return { breath: o.breath, burning: o.burning, honey: o.honey };
}
function validDrops(v: unknown): DropSave[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > MAX_DROPS) throw new SaveFormatError('drops');
  return v.map((d, k) => {
    const o = d as Partial<DropSave> | null;
    if (!o || typeof o !== 'object' || !isItemId(o.item) || !Number.isInteger(o.count) || (o.count as number) < 1
      || (o.count as number) > ITEMS[o.item].maxStack || !isNum(o.x) || !isNum(o.y)) throw new SaveFormatError(`drop ${k}`);
    return { item: o.item, count: o.count as number, x: o.x, y: o.y };
  });
}
function validEnv(v: unknown): EnvSave | undefined {
  if (v === undefined) return undefined;
  const o = v as Partial<EnvSave> | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.frozen) || !o.frozen.every((d) => Number.isInteger(d) && d >= 0)) throw new SaveFormatError('env');
  const wx = o.weather as EnvSave['weather'] | undefined;
  const weather = wx && typeof wx === 'object' && WEATHER_KINDS.includes(wx.kind) && isNum(wx.until) ? { kind: wx.kind, until: wx.until } : null;
  return { weather, frozen: [...o.frozen] };
}
function encodeFrozen(F: Uint8Array): number[] {
  const out: number[] = [];
  let last = 0;
  for (let i = 0; i < F.length; i++) if (F[i]) { out.push(i - last); last = i; }
  return out;
}
function validExtra(v: unknown): ExtraSave | undefined {
  if (v === undefined || v === null || typeof v !== 'object') return undefined;
  const o = v as Partial<ExtraSave>;
  const fishLog: Partial<Record<ItemId, number>> = {};
  if (o.fishLog && typeof o.fishLog === 'object') {
    for (const [k, n] of Object.entries(o.fishLog)) if (isItemId(k) && Number.isInteger(n) && (n as number) > 0) fishLog[k] = n as number;
  }
  const minedIce = Array.isArray(o.minedIce) ? o.minedIce.filter((i) => Number.isInteger(i) && i >= 0).slice(0, 100000) : [];
  return { fishLog, minedIce };
}
function validBossActive(v: unknown): EnemyKind | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new SaveFormatError('bossActive');
  // 未知 / 不是首領的 kind：寬鬆忽略
  return Object.prototype.hasOwnProperty.call(ENEMIES, v) && ENEMIES[v as EnemyKind].boss ? v as EnemyKind : null;
}

// ── 探索位元圖編碼快取：自動存檔每 30 秒一次；迷霧只會增加，揭露格數沒變 = 內容沒變，重用上次的 base64 ──
const exploredCache = new WeakMap<ExploredMap, { count: number; b64: string }>();
function encodeExplored(m: ExploredMap): string {
  const c = exploredCache.get(m);
  if (c && c.count === m.count) return c.b64;
  const b64 = toBase64(m.encode());
  exploredCache.set(m, { count: m.count, b64 });
  return b64;
}

// ── snapshot / encode / decode ────────────────────────────
export function snapshotGame(game: DelveGame, now: number = Date.now()): SaveData {
  const w = game.world;
  const list = [...w.modifiedChunks].sort((p, q) => p - q);
  const chunks = new Map<number, ChunkPayload>();
  for (const ci of list) chunks.set(ci, readChunk(w, ci));
  const p = game.player;
  const mod = w.modifiedChunks;
  const chests: ChestSave[] = [];
  for (const [i, slots] of w.chests) {
    const x = i % w.width, y = (i - x) / w.width;
    if (!mod.has(w.chunkIndex(Math.floor(x / CHUNK), Math.floor(y / CHUNK)))) continue;
    chests.push({ i, slots: slots.map((st) => (st ? { item: st.item, count: st.count } : null)) });
  }
  chests.sort((a, b) => a.i - b.i);
  const liqChunks = [...new Set([...w.modifiedChunks, ...w.liquidModified])].sort((p, q) => p - q);
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
      explored: encodeExplored(game.explored),
      markers: game.markers.map((m) => ({ x: m.x, y: m.y })),
      discovery: game.discovery.toJSON(),
      bed: game.bed ? { ...game.bed } : null,
      combat: {
        hp: r2(hp), maxHp: game.baseMaxHp, mana: r2(mana),
        equipment: game.equipment.toJSON(),
        bosses: [...game.bossesDefeated].sort(),
        kills: { ...game.kills },
        peaceful: game.peaceful,
      },
      liquids: { chunks: liqChunks, data: toBase64(encodeLiquidRle(lq.amount, lq.type)) },
      vitals: { breath: r2(game.breath), burning: r2(Math.max(0, game.burning)), honey: r2(Math.max(0, game.honeyT)) },
      drops: game.drops.list.map((d) => ({ item: d.item, count: d.count, x: r2(d.body.x + d.body.w / 2), y: r2(d.body.y + d.body.h / 2) })),
      bossActive: boss && boss.state !== 'leave' ? boss.kind : null,
      env: { weather: game.weatherOverride ? { ...game.weatherOverride } : null, frozen: encodeFrozen(w.frozen) },
      extra: { fishLog: { ...game.fishLog }, minedIce: [...game.minedIce] },
    },
    chunks,
  };
}

// ── base64（瀏覽器與 Node 都有 btoa / atob） ───────────────
function toBase64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSave(data: SaveData): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(data.header));
  const n = data.header.chunks.length;
  const out = new Uint8Array(8 + json.length + n * CHUNK_BYTES);
  out.set(MAGIC, 0);
  new DataView(out.buffer).setUint32(4, json.length, true);
  out.set(json, 8);
  let off = 8 + json.length;
  const half = CHUNK * CHUNK;
  for (const ci of data.header.chunks) {
    const c = data.chunks.get(ci);
    if (!c) throw new Error(`encodeSave: missing chunk ${ci}`);
    out.set(c.fg.subarray(0, half), off);
    out.set(c.wall.subarray(0, half), off + half);
    off += CHUNK_BYTES;
  }
  return out;
}

function isNum(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v); }

/** chunk 內每格 fg / wall id 必須是已知 TILES / WALLS（variant 不存檔，由座標雜湊重算）。 */
function validateChunk(ci: number, c: ChunkPayload): void {
  const half = CHUNK * CHUNK;
  if (c.fg.length < half || c.wall.length < half) throw new SaveFormatError(`chunk ${ci}: short payload`);
  for (let i = 0; i < half; i++) {
    if (c.fg[i] >= TILES.length) throw new SaveFormatError(`chunk ${ci}: unknown tile ${c.fg[i]}`);
    if (c.wall[i] >= WALLS.length) throw new SaveFormatError(`chunk ${ci}: unknown wall ${c.wall[i]}`);
  }
}

function validStack(st: unknown, where: string): Stack | null {
  if (st === null) return null;
  const o = st as { item?: unknown; count?: unknown };
  if (!o || typeof o !== 'object' || !isItemId(o.item) || typeof o.count !== 'number'
    || !Number.isInteger(o.count) || o.count < 1 || o.count > ITEMS[o.item].maxStack) {
    throw new SaveFormatError(where);
  }
  return { item: o.item, count: o.count };
}

function validUnlocked(v: unknown): number[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || !v.every((i) => Number.isInteger(i) && i >= 0)) throw new SaveFormatError('unlocked');
  return [...(v as number[])].sort((a, b) => a - b);
}
function validKeysUsed(v: unknown): number {
  if (v === undefined) return 0;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new SaveFormatError('keysUsed');
  return v;
}

/** 迷霧：base64 → RLE → 長度要剛好 width*height（否則損毀）；回傳原字串 */
function validExplored(v: unknown, width: number, height: number): string | undefined {
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
function validMarkers(v: unknown): MapMarker[] {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > MAX_MARKERS) throw new SaveFormatError('markers');
  return v.map((m) => {
    const o = m as { x?: unknown; y?: unknown } | null;
    if (!o || !Number.isInteger(o.x) || !Number.isInteger(o.y)) throw new SaveFormatError('markers');
    return { x: o.x as number, y: o.y as number };
  });
}
function validBed(v: unknown): { x: number; y: number } | null {
  if (v === undefined || v === null) return null;
  const o = v as { x?: unknown; y?: unknown };
  if (typeof o !== 'object' || !Number.isInteger(o.x) || !Number.isInteger(o.y)) throw new SaveFormatError('bed');
  return { x: o.x as number, y: o.y as number };
}
/** 戰鬥欄位：型別錯 → 損毀；數值範圍與未知裝備在還原時寬鬆處理 */
function validCombat(v: unknown): CombatSave | undefined {
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
  return {
    hp: o.hp, maxHp: o.maxHp, mana: o.mana,
    equipment: Equipment.fromJSON(o.equipment).toJSON(),
    bosses: (o.bosses ?? []).filter((b) => Object.prototype.hasOwnProperty.call(ENEMIES, b) && ENEMIES[b as EnemyKind].boss),
    kills, peaceful: Boolean(o.peaceful),
  };
}
function validDiscovery(v: unknown): DiscoveryJSON | undefined {
  if (v === undefined) return undefined;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new SaveFormatError('discovery');
  return v as DiscoveryJSON;
}

function validChests(v: unknown): ChestSave[] {
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
function validInventory(v: unknown): InventoryJSON {
  if (v === undefined) return { slots: [], selected: 0 };
  const o = v as { slots?: unknown; selected?: unknown } | null;
  if (!o || typeof o !== 'object' || !Array.isArray(o.slots) || o.slots.length > INV_SIZE) {
    throw new SaveFormatError('inventory');
  }
  const slots = o.slots.map((s, i) => {
    if (s === null) return null;
    const st = s as { item?: unknown; count?: unknown };
    if (!st || typeof st !== 'object' || !isItemId(st.item) || typeof st.count !== 'number'
      || !Number.isInteger(st.count) || st.count < 1 || st.count > ITEMS[st.item].maxStack) {
      throw new SaveFormatError(`inventory slot ${i}`);
    }
    return { item: st.item, count: st.count };
  });
  const selected = typeof o.selected === 'number' && Number.isInteger(o.selected) ? o.selected : 0;
  return { slots, selected };
}

export function decodeSave(bytes: Uint8Array): SaveData {
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
  const h = raw as Partial<SaveHeader>;
  if (!h || typeof h !== 'object' || !isNum(h.format) || !isNum(h.genVersion) || typeof h.seed !== 'string'
    || !isNum(h.width) || !isNum(h.height) || !isNum(h.time) || !isNum(h.tick)
    || !h.player || !isNum(h.player.x) || !isNum(h.player.y)
    || !Array.isArray(h.chunks) || !h.chunks.every((c) => Number.isInteger(c) && c >= 0)) {
    throw new SaveFormatError('header fields');
  }
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
    liquids: validLiquids(h.liquids, h.width, h.height),
    vitals: validVitals(h.vitals),
    drops: validDrops(h.drops),
    bossActive: validBossActive(h.bossActive),
    env: validEnv(h.env),
    extra: validExtra(h.extra),
  };
  const need = 8 + len + header.chunks.length * CHUNK_BYTES;
  if (bytes.length !== need) throw new SaveFormatError(`payload size ${bytes.length} != ${need}`);
  const chunks = new Map<number, ChunkPayload>();
  const half = CHUNK * CHUNK;
  let off = 8 + len;
  for (const ci of header.chunks) {
    const c = { fg: bytes.slice(off, off + half), wall: bytes.slice(off + half, off + CHUNK_BYTES) };
    validateChunk(ci, c);
    chunks.set(ci, c);
    off += CHUNK_BYTES;
  }
  return { header, chunks };
}

/** 被修改 chunk 裡：丟掉世界生成的箱子，依 tile 重建空箱，再套用存檔內容。 */
function restoreChests(w: World, chunks: readonly number[], saved: readonly ChestSave[]): void {
  const mod = new Set(chunks);
  const chunkOf = (i: number): number => {
    const x = i % w.width, y = (i - x) / w.width;
    return w.chunkIndex(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
  };
  for (const i of [...w.chests.keys()]) if (mod.has(chunkOf(i))) w.chests.delete(i);
  for (const ci of mod) {
    const { cx, cy } = w.chunkCoords(ci);
    for (let y = cy * CHUNK; y < Math.min(w.height, (cy + 1) * CHUNK); y++) {
      for (let x = cx * CHUNK; x < Math.min(w.width, (cx + 1) * CHUNK); x++) {
        const i = y * w.width + x;
        if (isChestTile(w.fg[i])) w.chests.set(i, new Array<Stack | null>(CHEST_SLOTS).fill(null));
      }
    }
  }
  for (const c of saved) {
    if (c.i >= w.fg.length || !isChestTile(w.fg[c.i]) || !mod.has(chunkOf(c.i))) continue;
    const slots = new Array<Stack | null>(CHEST_SLOTS).fill(null);
    c.slots.forEach((st, k) => { slots[k] = st ? { ...st } : null; });
    w.chests.set(c.i, slots);
  }
}

export function serializeGame(game: DelveGame, now?: number): Uint8Array {
  return encodeSave(snapshotGame(game, now));
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
      validLiquids(data.header.liquids, data.header.width, data.header.height);
      data.header.vitals = validVitals(data.header.vitals);
      data.header.drops = validDrops(data.header.drops);
      data.header.bossActive = validBossActive(data.header.bossActive);
      data.header.env = validEnv(data.header.env);
      data.header.extra = validExtra(data.header.extra);
    }
  } catch (e) {
    return { ok: false, error: 'format', message: e instanceof Error ? e.message : String(e) };
  }
  const h = data.header;
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
  const game = new DelveGame({ seed: h.seed, width: h.width, height: h.height });
  const w = game.world;
  const total = w.chunksX * w.chunksY;
  for (const ci of h.chunks) {
    if (ci >= total) return { ok: false, error: 'size', message: `chunk ${ci} out of range` };
    const c = data.chunks.get(ci);
    if (c) writeChunk(w, ci, c);
  }
  restoreChests(w, h.chunks, h.chests ?? []);
  // 液體（format 6）：存檔裡的 chunk 整塊覆蓋；舊格式：被改過 chunk 裡蓋在方塊上的新液體清掉
  const wake: number[] = [...h.chunks];
  if (h.liquids) {
    const lq = decodeLiquidRle(fromBase64(h.liquids.chunks.length ? h.liquids.data : ''), h.liquids.chunks.length * CHUNK * CHUNK);
    const K = CHUNK * CHUNK;
    h.liquids.chunks.forEach((ci, k) => {
      if (ci >= total) return;
      const { cx, cy } = w.chunkCoords(ci);
      for (let ly = 0; ly < CHUNK; ly++) {
        const y = cy * CHUNK + ly;
        if (y >= w.height) break;
        for (let lx = 0; lx < CHUNK; lx++) {
          const x = cx * CHUNK + lx;
          if (x >= w.width) break;
          const wi = y * w.width + x, o = k * K + ly * CHUNK + lx;
          w.liquid[wi] = lq.amount[o]; w.liquidType[wi] = lq.type[o];
        }
      }
      w.liquidModified.add(ci);
      wake.push(ci);
    });
  } else {
    for (const ci of h.chunks) {
      const { cx, cy } = w.chunkCoords(ci);
      for (let y = cy * CHUNK; y < Math.min(w.height, (cy + 1) * CHUNK); y++) for (let x = cx * CHUNK; x < Math.min(w.width, (cx + 1) * CHUNK); x++) {
        const wi = y * w.width + x;
        if (w.liquid[wi] && w.isSolid(x, y)) { w.liquid[wi] = 0; w.liquidType[wi] = 0; }
      }
    }
  }
  for (const ci of wake) {
    const { cx, cy } = w.chunkCoords(ci);
    game.liquids.wakeRect(cx * CHUNK - 1, cy * CHUNK - 1, (cx + 1) * CHUNK + 1, (cy + 1) * CHUNK + 1);
  }
  for (const i of h.unlocked ?? []) if (i < w.fg.length && w.fg[i] === T.LOCKED_CHEST) w.unlocked.add(i);
  w.keysUsed = h.keysUsed ?? 0;
  w.markAllDirty();
  game.player.x = h.player.x;
  game.player.y = h.player.y;
  game.player.vx = h.player.vx;
  game.player.vy = h.player.vy;
  game.inventory = Inventory.fromJSON(h.inventory);
  game.time = h.time;
  game.tick = h.tick;
  // 探索（format 4）；舊格式 = 什麼都沒探索
  const explored = h.explored ? ExploredMap.decode(fromBase64(h.explored), w.width, w.height) : new ExploredMap(w.width, w.height);
  game.setExploration(explored, (h.markers ?? []).map((m) => ({ ...m })));
  if (h.discovery) game.discovery.load(h.discovery);
  else game.discovery.found.clear();
  game.bed = h.bed && w.inBounds(h.bed.x, h.bed.y) ? { ...h.bed } : null;
  // 戰鬥（format 5）；舊格式 = 裝備空、滿血、一般模式
  const c = h.combat;
  if (c) {
    game.baseMaxHp = Math.max(BASE_HP, Math.min(MAX_HP_CAP, Math.round(c.maxHp / 20) * 20));
    game.equipment = Equipment.fromJSON(c.equipment);
    for (const b of c.bosses) game.bossesDefeated.add(b);
    game.kills = { ...c.kills };
    game.peaceful = c.peaceful;
    const max = game.maxHp();
    game.hp = c.hp > 0 ? Math.min(max, c.hp) : max;
    game.mana = Math.max(0, Math.min(game.maxMana(), c.mana));
  }
  // 呼吸 / 燃燒 / 蜂蜜（format 7）；舊格式 = 滿氣、沒著火
  if (h.vitals) {
    game.breath = Math.max(0, Math.min(MAX_BREATH, h.vitals.breath));
    game.burning = Math.max(0, Math.min(BURN_TIME, h.vitals.burning));
    game.honeyT = Math.max(0, Math.min(HONEY_TIME, h.vitals.honey));
  }
  // 地上的掉落物（format 7）：放回原地、靜止
  for (const d of h.drops ?? []) {
    if (d.x < 0 || d.y < 0 || d.x > w.width * TILE_SIZE || d.y > w.height * TILE_SIZE) continue;
    game.drops.spawn(d.item, d.count, d.x, d.y, 0, 0);
  }
  // 曆法 / 天氣：結冰格（只留在還有水的格）、強制天氣；舊存檔沒有 → 依日期重算結冰
  if (h.env) {
    w.frozen.fill(0);
    let i = 0;
    for (let k = 0; k < h.env.frozen.length; k++) {
      i += h.env.frozen[k];
      if (i < w.frozen.length && w.liquidType[i] === LIQ.WATER && w.liquid[i] > 0 && !w.isSolid(i % w.width, Math.floor(i / w.width))) w.frozen[i] = 1;
    }
    game.weatherOverride = h.env.weather ? { ...h.env.weather } : null;
    game.syncDay();
  } else game.refreshSeason();
  if (h.extra) {
    game.fishLog = { ...h.extra.fishLog };
    for (const i of h.extra.minedIce ?? []) if (i < w.liquid.length) game.minedIce.add(i);
  }
  // 首領戰中存檔（怪物不存）：退還召喚道具，背包滿就掉在腳邊
  const refund = h.bossActive ? BOSS_SUMMON_ITEM[h.bossActive] : undefined;
  if (refund && !game.bossEnemy()) {
    const left = game.inventory.add(refund, 1);
    if (left > 0) { const pc = game.playerCenter(); game.drops.spawn(refund, left, pc.x, pc.y, 0, 0); }
  }
  return { ok: true, game, header: h };
}
