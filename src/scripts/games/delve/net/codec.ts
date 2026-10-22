// codec.ts — 連線用的二進位編碼：FNV-1a 雜湊、RLE、chunk 六層、bulk 訊框。純函式，不碰時間與亂數。
import type { BulkHead } from './protocol';
import type { ChunkData } from '../engine/column';

const FNV_INIT = 0x811c9dc5;
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;
const LAYER_BYTES = 1024;

/** 32 位元 FNV-1a；h 可接續上一段 */
export function fnv1a(bytes: Uint8Array, h: number = FNV_INIT): number {
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 0x01000193) >>> 0;
  return h >>> 0;
}
/** 吃 UTF-16 碼元：每個碼元先餵低位元組，大於 0xff 再餵高位元組（ASCII 等同標準 FNV-1a） */
export function fnv1aStr(s: string, h: number = FNV_INIT): number {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = Math.imul(h ^ (c & 0xff), 0x01000193) >>> 0;
    if (c > 0xff) h = Math.imul(h ^ (c >>> 8), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function pushVarint(out: number[], n: number): void {
  while (n >= 0x80) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
  out.push(n);
}
/** (varint 連續長度, 值) 成對；空輸入 → 空輸出 */
export function rleEncode(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    let j = i + 1;
    while (j < bytes.length && bytes[j] === bytes[i]) j++;
    pushVarint(out, j - i); out.push(bytes[i]);
    i = j;
  }
  return Uint8Array.from(out);
}
/** 解出 n 個位元組；資料不足或超量 → 拋 RangeError（decodeBulk 之外的呼叫端自行包 try） */
export function rleDecode(bytes: Uint8Array, n: number, at = 0): { out: Uint8Array; next: number } {
  const out = new Uint8Array(n);
  let o = 0, p = at;
  while (o < n) {
    let len = 0, shift = 1, b: number;
    do {
      if (p >= bytes.length) throw new RangeError('rle: truncated');
      b = bytes[p++];
      len += (b & 0x7f) * shift; shift *= 128;
    } while (b & 0x80);
    if (p >= bytes.length || len < 1 || o + len > n) throw new RangeError('rle: bad run');
    out.fill(bytes[p++], o, o + len);
    o += len;
  }
  return { out, next: p };
}

/** 六層依序各自 rleEncode */
export function encodeChunkData(d: ChunkData): Uint8Array {
  const parts = LAYERS.map((k) => rleEncode(d[k]));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
export function decodeChunkData(bytes: Uint8Array, at = 0): { data: ChunkData; next: number } {
  const data = {} as Record<string, Uint8Array>;
  let p = at;
  for (const k of LAYERS) { const r = rleDecode(bytes, LAYER_BYTES, p); data[k] = r.out; p = r.next; }
  return { data: data as unknown as ChunkData, next: p };
}

/** u32 LE 標頭長 + UTF-8 JSON 標頭 + payload */
export function encodeBulk(head: BulkHead, payload: Uint8Array = new Uint8Array(0)): Uint8Array {
  const h = new TextEncoder().encode(JSON.stringify(head));
  const out = new Uint8Array(4 + h.length + payload.length);
  new DataView(out.buffer).setUint32(0, h.length, true);
  out.set(h, 4); out.set(payload, 4 + h.length);
  return out;
}
/** 截斷或標頭壞掉 → null（客人信任房主，但解析失敗只丟該則） */
export function decodeBulk(bytes: Uint8Array): { head: BulkHead; payload: Uint8Array } | null {
  if (bytes.length < 4) return null;
  const n = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  if (4 + n > bytes.length) return null;
  try {
    const head = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + n))) as unknown;
    if (!head || typeof head !== 'object' || typeof (head as { t?: unknown }).t !== 'string') return null;
    return { head: head as BulkHead, payload: bytes.subarray(4 + n) };
  } catch { return null; }
}
