// chunkSync.ts — 按 chunk 同步核心（co-op M-B3；spec §5.5–5.6、§10 D1–D6；建造者決定 C3–C6）。
//   房主端：chunkSum / columnSums（C5：六層 + 箱子的 FNV-1a）、answerSum（C4：整欄一則 col）、
//           wireBatch（日誌批次 → 上線格式）、chunkMessage（full 批次的整塊資料）、encodeLiq（液體 + 結冰訊框）。
//   客人端：applyLiq、ChunkSyncGuest（C3：每個 chunk 的 rev 與 unsynced / pending / live 三種狀態、暫存與重放；C6：興趣範圍）。
// 不碰時間與亂數。客人信任房主，但解析失敗只丟該則訊息（不拋到迴圈外）。
import type { World, ChunkData } from '../engine/world';
import type { EditBatch } from '../engine/edits';
import { cloneStack, type Stack } from '../engine/inventory';
import { CHUNK } from '../engine/constants';
import { chunkOfX } from '../engine/coords';
import { LOAD_COLS, UNLOAD_COLS } from '../engine/streaming';
import { encodeLiquidRle, decodeLiquidRle } from '../save/serialize';
import type { BulkHead, WireBatch, WireChest } from './protocol';
import { fnv1a, fnv1aStr, rleEncode, rleDecode, encodeChunkData, decodeChunkData } from './codec';

type ColHead = Extract<BulkHead, { t: 'col' }>;
type ChunkHead = Extract<BulkHead, { t: 'chunk' }>;
type LiqHead = Extract<BulkHead, { t: 'liq' }>;

const CK = CHUNK * CHUNK;
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

/** 箱子 / 解鎖的 tile 鍵所在的 chunk 鍵 */
function chunkOfTile(w: World, k: number): number {
  const { x, y } = w.tileXY(k);
  return w.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
}
/** 一個 chunk 裡的箱子 tile 鍵（升冪） */
function chestKeysIn(w: World, key: number): number[] {
  const out: number[] = [];
  for (const k of w.chests.keys()) if (chunkOfTile(w, k) === key) out.push(k);
  return out.sort((a, b) => a - b);
}
/** 第 cx 欄每個 cy 的箱子 tile 鍵（升冪；一次走完箱子表） */
function chestKeysByCy(w: World, cx: number): number[][] {
  const out: number[][] = Array.from({ length: w.chunksY }, () => []);
  for (const k of w.chests.keys()) {
    const { x, y } = w.tileXY(k);
    if (chunkOfX(x) !== cx) continue;
    const cy = Math.floor(y / CHUNK);
    if (cy >= 0 && cy < w.chunksY) out[cy].push(k);
  }
  for (const a of out) a.sort((p, q) => p - q);
  return out;
}
const cloneSlots = (s: readonly (Stack | null)[]): (Stack | null)[] => s.map((q) => (q ? cloneStack(q) : null));
/** tile 鍵 → 上線格式的箱子（內容複本；沒有箱子 = null） */
function wireChest(w: World, k: number): WireChest {
  const s = w.chests.get(k);
  return [k, s ? cloneSlots(s) : null, w.unlocked.has(k) ? 1 : 0];
}

/** 六層 + 箱子（tile 鍵升冪；JSON.stringify(slots) 的 UTF-16 碼元 + 解鎖旗標）的 FNV-1a */
function sumOf(w: World, d: ChunkData, chestKeys: readonly number[]): number {
  let h: number | undefined;
  for (const L of LAYERS) h = fnv1a(d[L], h);
  for (const k of chestKeys) {
    h = fnv1aStr(JSON.stringify(w.chests.get(k)), h);
    h = fnv1a(Uint8Array.of(w.unlocked.has(k) ? 1 : 0), h);
  }
  return h! >>> 0;
}

/** C5：chunk 雜湊（六層 + 箱子）。欄沒常駐、chunk 也沒停放 → 0 */
export function chunkSum(w: World, cx: number, cy: number): number {
  const d = w.readChunk(cx, cy);
  if (!d) return 0;
  return sumOf(w, d, chestKeysIn(w, w.chunkIndex(cx, cy)));
}
/** 第 cx 欄每個 cy 的 chunkSum（長度 chunksY） */
export function columnSums(w: World, cx: number): number[] {
  const byCy = chestKeysByCy(w, cx);
  const out: number[] = [];
  for (let cy = 0; cy < w.chunksY; cy++) {
    const d = w.readChunk(cx, cy);
    out.push(d ? sumOf(w, d, byCy[cy]) : 0);
  }
  return out;
}

/** C4：回覆客人的 sum——整欄一則 col：每個 cy 的目前 rev，加上雜湊不同的 chunk 的資料（依 diff 順序串接）與箱子 */
export function answerSum(w: World, cx: number, sums: readonly number[]): { head: ColHead; payload: Uint8Array } {
  w.ensureColumn(cx);
  const mine = columnSums(w, cx), byCy = chestKeysByCy(w, cx);
  const revs: number[] = [], diff: ColHead['diff'] = [], parts: Uint8Array[] = [];
  for (let cy = 0; cy < w.chunksY; cy++) {
    revs.push(w.edits.rev(w.chunkIndex(cx, cy)));
    if (sums[cy] === mine[cy]) continue;
    diff.push({ cy, chests: byCy[cy].map((k) => wireChest(w, k)) });
    parts.push(encodeChunkData(w.readChunk(cx, cy)!));
  }
  return { head: { t: 'col', cx, revs, diff }, payload: concat(parts) };
}

/** 日誌批次 → 上線格式：箱子 tile 鍵帶內容與解鎖；tiles 裡有箱子的格補一筆。full 批次只有標記（C3） */
export function wireBatch(w: World, b: EditBatch): WireBatch {
  if (b.full) return { chunk: b.chunk, rev: b.rev, tiles: [], chests: [], full: true };
  const seen = new Set<number>(), chests: WireChest[] = [];
  for (const k of b.chests) { if (!seen.has(k)) { seen.add(k); chests.push(wireChest(w, k)); } }
  for (let i = 0; i < b.tiles.length; i += 5) {
    const k = w.idx(b.tiles[i], b.tiles[i + 1]);
    if (!seen.has(k) && w.chests.has(k)) { seen.add(k); chests.push(wireChest(w, k)); }
  }
  return { chunk: b.chunk, rev: b.rev, tiles: b.tiles.slice(), chests, full: false };
}

/** full 批次的整塊資料（bulk 的 chunk）；chunk 沒常駐也沒停放 → null */
export function chunkMessage(w: World, key: number): { head: ChunkHead; payload: Uint8Array } | null {
  const { cx, cy } = w.chunkCoords(key);
  const d = w.readChunk(cx, cy);
  if (!d) return null;
  return {
    head: { t: 'chunk', key, rev: w.edits.rev(key), chests: chestKeysIn(w, key).map((k) => wireChest(w, k)) },
    payload: encodeChunkData(d),
  };
}

/** 液體訊框：每個 chunk = u32 長度 + encodeLiquidRle(liquid, liquidType) + u32 長度 + rleEncode(frozen)。讀不到的 chunk 略過 */
export function encodeLiq(w: World, keys: readonly number[]): { head: LiqHead; payload: Uint8Array } {
  const chunks: number[] = [], parts: Uint8Array[] = [];
  for (const key of keys) {
    const { cx, cy } = w.chunkCoords(key);
    const d = w.readChunk(cx, cy);
    if (!d) continue;
    chunks.push(key);
    const lq = encodeLiquidRle(d.liquid, d.liquidType), f = rleEncode(d.frozen);
    parts.push(u32(lq.length), lq, u32(f.length), f);
  }
  return { head: { t: 'liq', chunks }, payload: concat(parts) };
}

/** 套液體訊框：只寫常駐欄（不載入）、不進編輯日誌。payload 壞掉 → 整則丟掉（不拋） */
export function applyLiq(w: World, head: LiqHead, payload: Uint8Array): void {
  const dec: { key: number; amount: Uint8Array; type: Uint8Array; frozen: Uint8Array }[] = [];
  try {
    const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    let p = 0;
    const take = (): Uint8Array => {
      if (p + 4 > payload.length) throw new RangeError('liq: truncated');
      const n = dv.getUint32(p, true); p += 4;
      if (p + n > payload.length) throw new RangeError('liq: truncated');
      const s = payload.subarray(p, p + n); p += n;
      return s;
    };
    for (const key of head.chunks) {
      const lq = decodeLiquidRle(take(), CK);
      const fz = rleDecode(take(), CK).out;
      dec.push({ key, amount: lq.amount, type: lq.type, frozen: fz });
    }
  } catch { return; }
  for (const { key, amount, type, frozen } of dec) {
    const { cx, cy } = w.chunkCoords(key);
    if (!w.isResident(cx)) continue;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    let tx = -1, ty = -1;
    for (let ly = 0; ly < CHUNK; ly++) {
      const y = y0 + ly;
      if (y < 0 || y >= w.height) continue;
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = x0 + lx;
        if (!w.inBounds(x, y)) continue;
        const i = ly * CHUNK + lx;
        w.setLiquidRaw(x, y, amount[i], type[i]);
        w.setFlag('frozen', x, y, frozen[i] === 1);
        if (tx < 0) { tx = x; ty = y; }
      }
    }
    if (tx >= 0) w.touchLiquidAt(tx, ty);
  }
}

export type ChunkState = 'unsynced' | 'pending' | 'live';

/** 暫存的項目：tiles 批次或整塊（bulk 的 chunk，已解碼） */
type Item = { kind: 'tiles'; rev: number; b: WireBatch } | { kind: 'chunk'; rev: number; data: ChunkData; chests: WireChest[] };
/** 客人端一個 chunk 的同步狀態（只有同步集合裡的欄才有） */
interface Rec {
  state: 'pending' | 'live';
  /** pending 在等什麼：col = 送了 sum 等整欄回覆；full = 收到 full 標記等整塊 */
  wait: 'col' | 'full';
  /** 目前套到的 rev */
  rev: number;
  /** 等整塊時要到的 rev（full 標記的 rev） */
  need: number;
  buf: Item[];
}

/** 客人端 rev 表（C3）與興趣範圍（C6） */
export class ChunkSyncGuest {
  private readonly w: World;
  /** 同步集合（已送 sum 的欄） */
  private readonly cols = new Set<number>();
  private readonly recs = new Map<number, Rec>();
  /** 每欄還沒收到回覆的 sum 數（忘掉不清：舊的 col 晚到時才認得出來；reset 才清） */
  private readonly outstanding = new Map<number, number>();
  /** chunk 鍵 → (格子 tile 鍵 → 最後一次被房主寫的 writes 計數) */
  private readonly cellWrites = new Map<number, Map<number, number>>();
  /** chunk 鍵 → 最後一次整塊覆寫的 writes 計數 */
  private readonly chunkWrites = new Map<number, number>();
  private count = 0;

  constructor(w: World) { this.w = w; }

  /** 每套一格（tiles）加 1；整塊覆寫也加 1 */
  get writes(): number { return this.count; }

  /** welcome：清空 rev 表、暫存、同步集合 */
  reset(): void {
    this.cols.clear();
    this.recs.clear();
    this.outstanding.clear();
    this.cellWrites.clear();
    this.chunkWrites.clear();
  }

  /** 本地 actor 的 tile x：新進 LOAD_COLS 的常駐欄 → 回傳要送的 sum；離開 UNLOAD_COLS 或已卸載的欄 → 忘掉 */
  updateInterest(tileX: number): { cx: number; sums: number[] }[] {
    const w = this.w, a = chunkOfX(Math.floor(tileX));
    for (const cx of [...this.cols]) {
      if (Math.abs(cx - a) > UNLOAD_COLS || !w.isResident(cx)) this.forget(cx);
    }
    const out: { cx: number; sums: number[] }[] = [];
    for (let cx = a - LOAD_COLS; cx <= a + LOAD_COLS; cx++) {
      if (this.cols.has(cx) || !w.isResident(cx)) continue;
      this.cols.add(cx);
      this.outstanding.set(cx, (this.outstanding.get(cx) ?? 0) + 1);
      for (let cy = 0; cy < w.chunksY; cy++) {
        this.recs.set(w.chunkIndex(cx, cy), { state: 'pending', wait: 'col', rev: 0, need: 0, buf: [] });
      }
      out.push({ cx, sums: columnSums(w, cx) });
    }
    return out;
  }

  onTiles(batches: readonly WireBatch[]): void {
    for (const b of batches) {
      const rec = this.live(b.chunk);
      if (rec) this.deliver(b.chunk, rec, { kind: 'tiles', rev: b.rev, b });
    }
  }

  onCol(head: ColHead, payload: Uint8Array): void {
    const w = this.w, cx = head.cx;
    const n = this.outstanding.get(cx) ?? 0;
    if (n <= 0) return;
    if (n === 1) this.outstanding.delete(cx); else this.outstanding.set(cx, n - 1);
    if (n > 1 || !this.cols.has(cx)) return;                       // 還有較新的回覆在路上 / 已忘掉
    if (!w.isResident(cx)) { this.forget(cx); return; }
    const datas = new Map<number, { data: ChunkData; chests: WireChest[] }>();
    try {
      if (!Array.isArray(head.revs) || head.revs.length !== w.chunksY) throw new RangeError('col: revs');
      let p = 0;
      for (const d of head.diff) {
        const r = decodeChunkData(payload, p);
        p = r.next;
        datas.set(d.cy, { data: r.data, chests: d.chests });
      }
    } catch { this.forget(cx); return; }                             // 解析失敗：忘掉，下次 updateInterest 重送 sum
    for (let cy = 0; cy < w.chunksY; cy++) {
      const key = w.chunkIndex(cx, cy), rec = this.recs.get(key);
      if (!rec || rec.state !== 'pending' || rec.wait !== 'col') continue;
      const d = datas.get(cy);
      if (d) this.applyWhole(key, d.data, d.chests);
      rec.rev = head.revs[cy];
      rec.state = 'live';
      this.replay(key, rec);
    }
  }

  onChunk(head: ChunkHead, payload: Uint8Array): void {
    const rec = this.live(head.key);
    if (!rec) return;
    let data: ChunkData;
    try { data = decodeChunkData(payload).data; } catch { this.forget(this.w.chunkCoords(head.key).cx); return; }
    this.deliver(head.key, rec, { kind: 'chunk', rev: head.rev, data, chests: head.chests });
  }

  state(key: number): ChunkState {
    if (!this.cols.has(this.w.chunkCoords(key).cx)) return 'unsynced';
    return this.recs.get(key)?.state ?? 'unsynced';
  }

  rev(key: number): number { return this.recs.get(key)?.rev ?? 0; }

  /** 有沒有房主寫過 (x, y)（從 since 這個計數之後；整塊覆寫也算）：樂觀放置回滾用 */
  writtenSince(x: number, y: number, since: number): boolean {
    const key = this.w.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
    if ((this.chunkWrites.get(key) ?? -1) > since) return true;
    return (this.cellWrites.get(key)?.get(this.w.idx(x, y)) ?? -1) > since;
  }

  // ── 內部 ──────────────────────────────────────────
  /** 同步集合裡、欄還常駐的 chunk 紀錄；欄已卸載 → 忘掉；不在集合 → null（丟掉） */
  private live(key: number): Rec | null {
    const cx = this.w.chunkCoords(key).cx;
    if (!this.cols.has(cx)) return null;
    if (!this.w.isResident(cx)) { this.forget(cx); return null; }
    return this.recs.get(key) ?? null;
  }

  private forget(cx: number): void {
    this.cols.delete(cx);
    for (let cy = 0; cy < this.w.chunksY; cy++) {
      const key = this.w.chunkIndex(cx, cy);
      this.recs.delete(key);
      this.cellWrites.delete(key);
      this.chunkWrites.delete(key);
    }
  }

  /** 依狀態處理一個項目（即時到達與重放共用） */
  private deliver(key: number, rec: Rec, it: Item): void {
    if (rec.state === 'pending') {
      if (rec.wait === 'col' || it.kind === 'tiles') { rec.buf.push(it); return; }
      // 等整塊：比目前新的整塊就套上；到了標記的 rev 就轉 live 並重放
      if (it.rev <= rec.rev) return;
      this.applyWhole(key, it.data, it.chests);
      rec.rev = it.rev;
      if (rec.rev >= rec.need) { rec.state = 'live'; this.replay(key, rec); }
      return;
    }
    if (it.rev <= rec.rev) return;                                    // 舊的（含資料先到後的 full 標記）
    if (it.kind === 'chunk') { this.applyWhole(key, it.data, it.chests); rec.rev = it.rev; return; }
    if (it.b.full) { rec.state = 'pending'; rec.wait = 'full'; rec.need = it.rev; return; }
    this.applyTiles(key, it.b);
    rec.rev = it.rev;
  }

  /** 暫存依 rev 升冪重放（同 rev 整塊先）；比目前 rev 舊的跳過，又轉 pending 的會重新進暫存 */
  private replay(key: number, rec: Rec): void {
    if (!rec.buf.length) return;
    const items = rec.buf.sort((p, q) => p.rev - q.rev || (p.kind === q.kind ? 0 : p.kind === 'chunk' ? -1 : 1));
    rec.buf = [];
    for (const it of items) this.deliver(key, rec, it);
  }

  private applyTiles(key: number, b: WireBatch): void {
    const w = this.w, t = b.tiles;
    let cells = this.cellWrites.get(key);
    if (!cells) { cells = new Map(); this.cellWrites.set(key, cells); }
    for (let i = 0; i + 4 < t.length; i += 5) {
      const x = t[i], y = t[i + 1];
      w.setFg(x, y, t[i + 2]);
      w.setWall(x, y, t[i + 3]);
      w.setHalf(x, y, t[i + 4] === 1);
      cells.set(w.idx(x, y), ++this.count);
    }
    for (const c of b.chests) this.applyChest(c);
  }

  private applyChest([k, slots, unl]: WireChest): void {
    const w = this.w;
    if (slots) w.chests.set(k, cloneSlots(slots)); else w.chests.delete(k);
    if (unl) w.unlocked.add(k); else w.unlocked.delete(k);
  }

  /** 整塊覆寫（不進日誌）：箱子設成清單內容，刪掉這個 chunk 裡清單沒有的箱子與解鎖 */
  private applyWhole(key: number, data: ChunkData, chests: readonly WireChest[]): void {
    const w = this.w, { cx, cy } = w.chunkCoords(key);
    w.writeChunk(cx, cy, data, { journal: false });
    const keep = new Set(chests.map((c) => c[0]));
    for (const k of chestKeysIn(w, key)) if (!keep.has(k)) w.chests.delete(k);
    for (const k of [...w.unlocked]) if (!keep.has(k) && chunkOfTile(w, k) === key) w.unlocked.delete(k);
    for (const c of chests) this.applyChest(c);
    this.chunkWrites.set(key, ++this.count);
  }
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, true);
  return b;
}
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
