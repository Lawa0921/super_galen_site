// storage.ts — 薄封裝：gzip（CompressionStream，可用才用）+ IndexedDB + 自動存檔 + 匯出/匯入。
// 純邏輯在 serialize.ts / split.ts（有單元測試）；本檔只做瀏覽器 I/O（IndexedDB 由 e2e 驗；只有 gzip 與自動存檔排程有單元測試）。
import { encodeCharacter } from './character';
import { WORLD_FORMAT } from './worldSave';
import type { SplitStore } from './split';

const DB_NAME = 'delve';
/** v1：saves（keyPath slot）。v2：另加 characters（keyPath id），saves 與其記錄原封不動。 */
const DB_VERSION = 2;
const STORE = 'saves';
const CHAR_STORE = 'characters';
export const AUTOSAVE_INTERVAL_MS = 30_000;
export const EXPORT_MIME = 'application/x-delve-save';

/** 存檔摘要（存檔時算好，標題畫面的「繼續」顯示用；不必解開整個世界） */
export interface SaveSummary {
  seed: string;
  /** 遊戲內時間（秒） */
  time: number;
  /** 實際遊玩秒數 */
  playSec: number;
  /** 最深紀錄（地表下幾格） */
  depth: number;
  /** 日誌完成度 0..1 */
  completion: number;
  peaceful: boolean;
  /** 角色等級（等級系統；舊摘要沒有） */
  level?: number;
  /** 角色暱稱（co-op 拆檔後；舊摘要沒有） */
  nick?: string;
}
export interface SlotMeta {
  slot: string; seed: string; savedAt: number;
  /** 壓縮後 data 的長度 */
  bytes: number;
  summary?: SaveSummary;
  /** 拆檔存檔（format 10）對應的角色 id；舊存檔沒有 */
  charId?: string;
  /** 拆檔存檔的世界格式；舊存檔沒有 */
  format?: number;
}
/** saves 記錄：data = compress(serializeGame 或 encodeWorld 的輸出) */
interface SlotRecord extends SlotMeta { data: Uint8Array; }
/** characters 記錄：data = compress(encodeCharacter) */
export interface CharacterRecord { id: string; nick: string; savedAt: number; rev: number; data: Uint8Array }

export function hasCompression(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

function isGzip(b: Uint8Array): boolean { return b.length > 2 && b[0] === 0x1f && b[1] === 0x8b; }

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const input = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(input).arrayBuffer());
}

/** gzip 壓縮；瀏覽器不支援 CompressionStream 時原樣回傳（decompress 以 gzip magic 判斷）。 */
export async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  if (!hasCompression()) return bytes;
  return pipe(bytes, new CompressionStream('gzip'));
}

/** 存檔檔案讀不了（gzip 截斷 / 損毀 / 過大）：message 是給玩家看的中文 */
export class SaveFileError extends Error {
  constructor(msg: string) { super(msg); this.name = 'SaveFileError'; }
}
export const CORRUPT_MSG = '存檔檔案已損毀或不完整';
export const TOO_LARGE_MSG = '存檔檔案太大，不是有效的 DELVE 存檔';
/** 解壓後最多幾個位元組（最大世界的存檔遠小於此）；超過就中止串流，避免 gzip 炸彈吃光記憶體 */
export const MAX_DECOMPRESSED = 64 * 1024 * 1024;

/** gzip 解壓（逐塊讀、累計超過 limit 就取消串流）；截斷 / 損毀 → SaveFileError(CORRUPT_MSG) */
export async function decompress(bytes: Uint8Array, limit: number = MAX_DECOMPRESSED): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  if (!hasCompression()) throw new Error('This browser cannot read compressed DELVE saves (no DecompressionStream).');
  const reader = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) {
        void reader.cancel().catch(() => { /* 已中止 */ });
        throw new SaveFileError(TOO_LARGE_MSG);
      }
      parts.push(value);
    }
  } catch (e) {
    if (e instanceof SaveFileError) throw e;
    throw new SaveFileError(CORRUPT_MSG);
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// ── IndexedDB ────────────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;

export function hasIndexedDB(): boolean { return typeof indexedDB !== 'undefined'; }

export const DB_BLOCKED_MSG = '請關閉其他開著 DELVE 的分頁後重新整理。';
/** 升級資料庫版本被別的分頁（舊版程式、不肯讓出連線）擋住：message 是給玩家看的中文 */
export class DbBlockedError extends Error {
  constructor() { super(DB_BLOCKED_MSG); this.name = 'DbBlockedError'; }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const p: Promise<IDBDatabase> = new Promise<IDBDatabase>((resolve, reject) => {
    /** 被擋住後已放棄這個請求：之後才開成的連線要立刻關掉 */
    let abandoned = false;
    const forget = (): void => { if (dbPromise === p) dbPromise = null; };
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
      if (!db.objectStoreNames.contains(CHAR_STORE)) db.createObjectStore(CHAR_STORE, { keyPath: 'id' });
    };
    // 別的分頁還開著舊版連線、不肯關：不要一直等（每個存讀都會卡住），回報讓玩家關掉分頁；下次呼叫重試
    req.onblocked = () => { abandoned = true; forget(); reject(new DbBlockedError()); };
    req.onsuccess = () => {
      const db = req.result;
      if (abandoned) { db.close(); return; }
      // 別的分頁要升級版本：讓出連線（否則它的升級會卡住）；下次存讀再重開
      db.onversionchange = () => { db.close(); forget(); };
      resolve(db);
    };
    req.onerror = () => { forget(); reject(req.error ?? new Error('indexedDB open failed')); };
  });
  dbPromise = p;
  return p;
}

/**
 * 開一個 transaction：fn 排好請求、回傳「完成後取結果」的函式；transaction complete 才 resolve。
 * fn 可呼叫 abort(err) 中止整個 transaction（reject 該 err）。
 */
function withTx<T>(
  stores: string | string[], mode: IDBTransactionMode,
  fn: (t: IDBTransaction, abort: (err: Error) => void) => () => T,
): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let failure: Error | null = null;
    const result = fn(t, (err) => { failure = err; t.abort(); });
    t.oncomplete = () => resolve(result());
    t.onerror = () => reject(failure ?? t.error ?? new Error('indexedDB tx failed'));
    t.onabort = () => reject(failure ?? t.error ?? new Error('indexedDB tx aborted'));
  }));
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store: string = STORE): Promise<T> {
  return withTx(store, mode, (t) => { const req = fn(t.objectStore(store)); return () => req.result; });
}

function asBytes(d: Uint8Array | ArrayBuffer): Uint8Array {
  return d instanceof Uint8Array ? d : new Uint8Array(d);
}

/** 可繼續的槽（備份記錄 `*.bak` 不列出），新到舊 */
export async function listSlots(): Promise<SlotMeta[]> {
  const all = await tx<SlotRecord[]>('readonly', (s) => s.getAll() as IDBRequest<SlotRecord[]>);
  return all.filter((r) => !r.slot.endsWith('.bak'))
    .map(({ slot, seed, savedAt, bytes, summary, charId, format }) => ({
      slot, seed, savedAt, bytes, summary, ...(charId ? { charId } : {}), ...(format !== undefined ? { format } : {}),
    }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

// ── 拆檔存檔（世界 + 角色）的 IndexedDB 實作 ──────────────────
export const idbSplitStore: SplitStore = {
  async getSlot(slot) {
    const rec = await tx<SlotRecord | undefined>('readonly', (s) => s.get(slot) as IDBRequest<SlotRecord | undefined>);
    if (!rec) return null;
    const bytes = await decompress(asBytes(rec.data));
    return rec.charId ? { bytes, charId: rec.charId } : { bytes };
  },

  async getCharacter(id) {
    const rec = await tx<CharacterRecord | undefined>(
      'readonly', (s) => s.get(id) as IDBRequest<CharacterRecord | undefined>, CHAR_STORE,
    );
    return rec ? decompress(asBytes(rec.data)) : null;
  },

  /**
   * 同一個 readwrite transaction：to 已有記錄 → 什麼都不做（備份只寫一次：兩個分頁都遷移時，第二次不會用 format 10 蓋掉原始舊檔）；
   * 否則把 from 整筆原封複製成 { ...rec, slot: to }（data 不解壓、不重壓）。from 沒有記錄 → 丟錯。
   */
  async backupSlot(from, to) {
    await withTx(STORE, 'readwrite', (t, abort) => {
      const s = t.objectStore(STORE);
      const existing = s.count(to);
      existing.onsuccess = () => {
        if (existing.result > 0) return;
        const src = s.get(from) as IDBRequest<SlotRecord | undefined>;
        src.onsuccess = () => {
          const rec = src.result;
          if (!rec) { abort(new Error(`no save in slot ${from}`)); return; }
          s.put({ ...rec, slot: to });
        };
      };
      return () => undefined;
    });
  },

  /** 先壓縮兩份，再在同一個 transaction 寫世界記錄（saves）與角色記錄（characters） */
  async putSplit(slot, world, character) {
    const [wdata, cdata] = await Promise.all([compress(world.bytes), compress(encodeCharacter(character))]);
    const savedAt = character.savedAt;
    const meta: SlotMeta = {
      slot, seed: world.seed, savedAt, bytes: wdata.length,
      ...(world.summary ? { summary: world.summary } : {}), charId: character.id, format: WORLD_FORMAT,
    };
    const rec: SlotRecord = { ...meta, data: wdata };
    const crec: CharacterRecord = { id: character.id, nick: character.nick, savedAt, rev: character.rev, data: cdata };
    await withTx([STORE, CHAR_STORE], 'readwrite', (t) => {
      t.objectStore(STORE).put(rec);
      t.objectStore(CHAR_STORE).put(crec);
      return () => undefined;
    });
    return meta;
  },
};

/** 請求持久化儲存（降低被瀏覽器清除的風險）。不支援時回 false。 */
export async function requestPersistence(): Promise<boolean> {
  try {
    const st = typeof navigator !== 'undefined' ? navigator.storage : undefined;
    if (!st || typeof st.persist !== 'function') return false;
    if (typeof st.persisted === 'function' && await st.persisted()) return true;
    return await st.persist();
  } catch {
    return false;
  }
}

// ── 匯出 / 匯入 .delve 檔 ─────────────────────────────────
/** 產生可下載的 Blob（頁面層自行建立 <a download>）。 */
export async function exportBlob(raw: Uint8Array): Promise<Blob> {
  const data = await compress(raw);
  return new Blob([data as Uint8Array<ArrayBuffer>], { type: EXPORT_MIME });
}

/** 讀取使用者選的檔案，回傳解壓後的 serialize 位元組（交給 restoreGame 驗證）。 */
export async function importBlob(file: Blob): Promise<Uint8Array> {
  return decompress(new Uint8Array(await file.arrayBuffer()));
}

// ── 自動存檔 ─────────────────────────────────────────────
export interface AutosaveOptions {
  /** 存一次檔（序列化 + 寫入都在裡面）；回傳寫入的槽資訊 */
  save: () => Promise<SlotMeta>;
  intervalMs?: number;
  onSaved?: (meta: SlotMeta) => void;
  onError?: (err: unknown) => void;
}

/** 每 intervalMs 與 pagehide / visibilitychange(hidden) 時存檔。回傳停止函式。 */
export function startAutosave(opts: AutosaveOptions): () => void {
  let busy = false;
  const run = (): void => {
    if (busy) return;
    busy = true;
    let pending: Promise<SlotMeta>;
    try { pending = opts.save(); } catch (e) { busy = false; opts.onError?.(e); return; }
    pending
      .then((m) => opts.onSaved?.(m))
      .catch((e: unknown) => opts.onError?.(e))
      .finally(() => { busy = false; });
  };
  const timer = setInterval(run, opts.intervalMs ?? AUTOSAVE_INTERVAL_MS);
  const onHide = (): void => run();
  const onVis = (): void => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') run(); };
  globalThis.addEventListener?.('pagehide', onHide);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
  return () => {
    clearInterval(timer);
    globalThis.removeEventListener?.('pagehide', onHide);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
  };
}
