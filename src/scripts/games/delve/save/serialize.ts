// serialize.ts — 純函式存檔（不碰 IndexedDB / DOM）。
// 存「seed + 生成器版本 + 被修改 chunk 的 fg/wall + 玩家 + 背包 + 時間」；
// 載入時用 seed 重新生成，再覆蓋被修改的 chunk。
//
// 二進位格式（little-endian）：
//   [0..4)  magic "DLVS"
//   [4..8)  u32 header JSON 長度 N
//   [8..8+N) header JSON（UTF-8）
//   之後依 header.chunks 順序，每個 chunk：fg CHUNK*CHUNK bytes + wall CHUNK*CHUNK bytes（越界格補 0）
import { DelveGame } from '../engine/game';
import type { World } from '../engine/world';
import { Inventory, type InventoryJSON } from '../engine/inventory';
import { CHUNK, GEN_VERSION, INV_SIZE } from '../engine/constants';
import { TILES, WALLS } from '../engine/tiles';
import { ITEMS, isItemId } from '../engine/items';

export const SAVE_FORMAT = 1;
export const CHUNK_BYTES = CHUNK * CHUNK * 2;
const MAGIC = [0x44, 0x4c, 0x56, 0x53]; // "DLVS"
const MAX_DIM = 8192;

export interface PlayerSave { x: number; y: number; vx: number; vy: number; }
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
}
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

// ── snapshot / encode / decode ────────────────────────────
export function snapshotGame(game: DelveGame, now: number = Date.now()): SaveData {
  const w = game.world;
  const list = [...w.modifiedChunks].sort((p, q) => p - q);
  const chunks = new Map<number, ChunkPayload>();
  for (const ci of list) chunks.set(ci, readChunk(w, ci));
  const p = game.player;
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
      player: { x: p.x, y: p.y, vx: p.vx, vy: p.vy },
      inventory: game.inventory.toJSON(),
      chunks: list,
    },
    chunks,
  };
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
    }
  } catch (e) {
    return { ok: false, error: 'format', message: e instanceof Error ? e.message : String(e) };
  }
  const h = data.header;
  if (h.format !== SAVE_FORMAT) return { ok: false, error: 'format', message: `format ${h.format}` };
  if (h.genVersion !== GEN_VERSION && !opts.allowGenMismatch) {
    return {
      ok: false, error: 'gen_version', saveGenVersion: h.genVersion,
      message: `save generated with v${h.genVersion}, current generator v${GEN_VERSION}`,
    };
  }
  if (!Number.isInteger(h.width) || !Number.isInteger(h.height) || h.width < CHUNK || h.height < CHUNK
    || h.width > MAX_DIM || h.height > MAX_DIM) {
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
  w.markAllDirty();
  game.player.x = h.player.x;
  game.player.y = h.player.y;
  game.player.vx = h.player.vx;
  game.player.vy = h.player.vy;
  game.inventory = Inventory.fromJSON(h.inventory);
  game.time = h.time;
  game.tick = h.tick;
  return { ok: true, game, header: h };
}
