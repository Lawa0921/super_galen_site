// storage.ts — 薄封裝：gzip（CompressionStream，可用才用）+ IndexedDB + 自動存檔 + 匯出/匯入。
// 純邏輯在 serialize.ts（有單元測試）；本檔只做瀏覽器 I/O，不做單元測試。

const DB_NAME = 'delve';
const DB_VERSION = 1;
const STORE = 'saves';
export const AUTOSAVE_INTERVAL_MS = 30_000;
export const EXPORT_MIME = 'application/x-delve-save';

export interface SlotMeta { slot: string; seed: string; savedAt: number; bytes: number; }
interface SlotRecord extends SlotMeta { data: Uint8Array; }

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

export async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (!isGzip(bytes)) return bytes;
  if (!hasCompression()) throw new Error('This browser cannot read compressed DELVE saves (no DecompressionStream).');
  return pipe(bytes, new DecompressionStream('gzip'));
}

// ── IndexedDB ────────────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;

export function hasIndexedDB(): boolean { return typeof indexedDB !== 'undefined'; }

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('indexedDB open failed')); };
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error ?? req.error ?? new Error('indexedDB tx failed'));
    t.onabort = () => reject(t.error ?? new Error('indexedDB tx aborted'));
  }));
}

/** 存入一個槽（bytes 為 serializeGame 的輸出；此處會壓縮）。 */
export async function saveSlot(slot: string, seed: string, raw: Uint8Array, savedAt = Date.now()): Promise<SlotMeta> {
  const data = await compress(raw);
  const rec: SlotRecord = { slot, seed, savedAt, bytes: data.length, data };
  await tx('readwrite', (s) => s.put(rec));
  return { slot, seed, savedAt, bytes: data.length };
}

/** 讀取槽，回傳解壓後的 serialize 位元組；沒有則 null。 */
export async function loadSlot(slot: string): Promise<Uint8Array | null> {
  const rec = await tx<SlotRecord | undefined>('readonly', (s) => s.get(slot) as IDBRequest<SlotRecord | undefined>);
  if (!rec) return null;
  return decompress(rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data as ArrayBuffer));
}

export async function deleteSlot(slot: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

export async function listSlots(): Promise<SlotMeta[]> {
  const all = await tx<SlotRecord[]>('readonly', (s) => s.getAll() as IDBRequest<SlotRecord[]>);
  return all.map(({ slot, seed, savedAt, bytes }) => ({ slot, seed, savedAt, bytes }))
    .sort((a, b) => b.savedAt - a.savedAt);
}

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
  slot: string;
  seed: string;
  /** 回傳當下存檔位元組（通常是 () => serializeGame(game)） */
  getBytes: () => Uint8Array;
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
    let bytes: Uint8Array;
    try { bytes = opts.getBytes(); } catch (e) { busy = false; opts.onError?.(e); return; }
    saveSlot(opts.slot, opts.seed, bytes)
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
