// explore.ts — 戰爭迷霧：每格 1 bit 的「已探索」位元圖，按 chunk 儲存（每 chunk 128 bytes，bit = ly*32 + lx；
//   只有含已探索格的 chunk 才配置）。x 可以是任何合法座標（負 x、x ≥ width；水平範圍 span 預設 ±X_LIMIT）。
//   · reveal / revealDisc（玩家周圍）/ revealLit（畫面上光照夠亮的格）
//   · 新揭露的格標記所在的 CHUNK 為 dirty（chunk 鍵，同 world.chunkIndex），地圖快取只重畫那些 chunk
//   · 存檔：中央框 [0, width) 的 row-major RLE（0 / 1 交替的連續長度，從 0 開始，LEB128 varint——與舊扁平實作位元組相同）；
//     含中央框外已探索格的 chunk 另存 encodeOuter()（整塊 1024 bit 串接的 RLE），讀檔時以 OR 疊上
//   · 地圖標記（使用者在全地圖上點的記號）：toggleMarker
import { CHUNK } from './constants';
import { chunkKey, chunkXY, isOuterChunkKey, X_LIMIT } from './coords';
import { fromBase64, toBase64 } from './base64';
import type { LightMap, LightRect } from './lighting';

export const MAX_MARKERS = 20;
export interface MapMarker { x: number; y: number; }

/** 位元圖 → RLE 位元組。nbits = 總格數。 */
export function encodeRle(bits: Uint8Array, nbits: number): Uint8Array {
  const out: number[] = [];
  const push = (v: number): void => {
    while (v >= 0x80) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
    out.push(v);
  };
  let cur = 0, run = 0;
  for (let i = 0; i < nbits; i++) {
    const b = (bits[i >> 3] >> (i & 7)) & 1;
    if (b === cur) { run++; continue; }
    push(run);
    cur = b; run = 1;
  }
  push(run);
  return Uint8Array.from(out);
}

/** RLE 位元組 → 位元圖；長度總和必須剛好 = nbits，否則丟例外（存檔損毀）。 */
export function decodeRle(bytes: Uint8Array, nbits: number): Uint8Array {
  const bits = new Uint8Array(Math.ceil(nbits / 8));
  let i = 0, pos = 0, cur = 0;
  while (i < bytes.length) {
    let v = 0, mul = 1, k = 0;
    for (;;) {
      if (i >= bytes.length) throw new Error('rle: truncated varint');
      const b = bytes[i++];
      v += (b & 0x7f) * mul;
      if (!(b & 0x80)) break;
      mul *= 128;
      if (++k > 5) throw new Error('rle: varint too long');
    }
    if (pos + v > nbits) throw new Error('rle: run overflow');
    if (cur) {
      for (let p = pos; p < pos + v; p++) bits[p >> 3] |= 1 << (p & 7);
    }
    pos += v;
    cur ^= 1;
  }
  if (pos !== nbits) throw new Error(`rle: ${pos} bits != ${nbits}`);
  return bits;
}

/** 一個 chunk 的迷霧位元組數（CHUNK*CHUNK bit；bit = ly*CHUNK + lx） */
export const FOG_CHUNK_BYTES = (CHUNK * CHUNK) / 8;
const FOG_CHUNK_BITS = CHUNK * CHUNK;
/** 「上一個 chunk」快取的「沒有」值（不會是合法的 chunk 座標） */
const NO_C = 0x3fffffff;

/** 中央框外的已探索 chunk（存檔用）：chunks = chunk 鍵（升冪），data = 依序串接的每塊 1024 bit 的 RLE 再 base64 */
export interface OuterBitsSave { chunks: number[]; data: string; }
/** 揭露的水平範圍（xMax 不含）：有界世界 = [0, width)；World 本身就符合 */
export interface FogSpan { readonly xMin: number; readonly xMax: number; }

export class ExploredMap {
  /** 中央區的 chunk 數（chunk 鍵與 World 相同：coords.ts chunkKey） */
  readonly chunksX: number;
  readonly chunksY: number;
  /** 揭露的水平範圍（xMax 不含；預設 ±X_LIMIT） */
  readonly xMin: number;
  readonly xMax: number;
  /** 已揭露格數（含中央框外） */
  count = 0;
  private central = 0;
  /** chunk 鍵 → 128 bytes（只有含已探索格的 chunk 才有） */
  private readonly chunks = new Map<number, Uint8Array>();
  private readonly dirty = new Set<number>();
  /** 上一個用到的 chunk（has / reveal 的熱路徑：命中就不查 Map；lbits = null 表示那個 chunk 還沒有任何已探索格） */
  private lcx = NO_C;
  private lcy = NO_C;
  private lbits: Uint8Array | null = null;

  /** width / height = 中央框（舊的 row-major RLE 用）；bits = 中央區的舊位元圖（bit i = y*width + x） */
  constructor(readonly width: number, readonly height: number, bits?: Uint8Array, span?: FogSpan) {
    this.chunksX = Math.ceil(width / CHUNK);
    this.chunksY = Math.ceil(height / CHUNK);
    this.xMin = Math.max(-X_LIMIT, span ? span.xMin : -X_LIMIT);
    this.xMax = Math.min(X_LIMIT, span ? span.xMax : X_LIMIT);
    if (bits) {
      const W = width, n = Math.min(width * height, bits.length * 8);
      for (let b = 0; b < bits.length; b++) {
        let v = bits[b];
        while (v) {
          const i = b * 8 + (31 - Math.clz32(v & -v));
          v &= v - 1;
          if (i >= n) break;
          const y = Math.floor(i / W);
          this.set(i - y * W, y);
        }
      }
    }
  }

  /** (cx, cy) chunk 的位元組（create = 沒有就建立）；上一個 chunk 快取 */
  private slot(cx: number, cy: number, create: boolean): Uint8Array | null {
    if (cx === this.lcx && cy === this.lcy && (this.lbits !== null || !create)) return this.lbits;
    const k = chunkKey(this.chunksX, cx, cy);
    let b = this.chunks.get(k) ?? null;
    if (b === null && create) { b = new Uint8Array(FOG_CHUNK_BYTES); this.chunks.set(k, b); }
    this.lcx = cx; this.lcy = cy; this.lbits = b;
    return b;
  }
  /** 設一格（呼叫端已檢查垂直範圍；不標 dirty）；回傳是否為新揭露 */
  private set(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax) return false;
    const b = this.slot(x >> 5, y >> 5, true)!;
    const i = ((y & 31) << 5) | (x & 31), m = 1 << (i & 7);
    if (b[i >> 3] & m) return false;
    b[i >> 3] |= m;
    this.count++;
    if (x >= 0 && x < this.width) this.central++;
    return true;
  }

  has(x: number, y: number): boolean {
    if (y < 0 || y >= this.height || x < this.xMin || x >= this.xMax) return false;
    const b = this.slot(x >> 5, y >> 5, false);
    if (b === null) return false;
    const i = ((y & 31) << 5) | (x & 31);
    return ((b[i >> 3] >> (i & 7)) & 1) === 1;
  }

  /** 揭露一格；回傳是否為新揭露（垂直範圍 / 水平範圍外忽略） */
  reveal(x: number, y: number): boolean {
    if (y < 0 || y >= this.height || x < this.xMin || x >= this.xMax) return false;
    if (!this.set(x, y)) return false;
    const cx = x >> 5, cy = y >> 5, X = this.chunksX;
    this.dirty.add(chunkKey(X, cx, cy));
    // 迷霧邊緣的抖動看 4 鄰：chunk 邊上的格揭露時，鄰 chunk 也要重畫
    const lx = x & 31, ly = y & 31;
    if (lx === 0 && x - 1 >= this.xMin) this.dirty.add(chunkKey(X, cx - 1, cy));
    if (lx === CHUNK - 1 && x + 1 < this.xMax) this.dirty.add(chunkKey(X, cx + 1, cy));
    if (ly === 0 && cy > 0) this.dirty.add(chunkKey(X, cx, cy - 1));
    if (ly === CHUNK - 1 && y + 1 < this.height) this.dirty.add(chunkKey(X, cx, cy + 1));
    return true;
  }

  /** 揭露以 (cx,cy) 為中心、半徑 r 的圓；回傳新揭露格數 */
  revealDisc(cx: number, cy: number, r: number): number {
    let n = 0;
    const r2 = r * r + r * 0.6;
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= this.height) continue;
      for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r2 && this.reveal(cx + dx, y)) n++;
    }
    return n;
  }

  /** 揭露視窗 view（tile 座標）內、光照 ≥ threshold 的格；回傳新揭露格數 */
  revealLit(L: LightMap, view: LightRect, threshold: number): number {
    const x0 = Math.max(L.x0, Math.floor(view.x), this.xMin), y0 = Math.max(L.y0, Math.floor(view.y), 0);
    const x1 = Math.min(L.x0 + L.w, Math.ceil(view.x + view.w), this.xMax), y1 = Math.min(L.y0 + L.h, Math.ceil(view.y + view.h), this.height);
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const row = (y - L.y0) * L.w - L.x0;
      for (let x = x0; x < x1; x++) if (L.data[row + x] >= threshold && this.reveal(x, y)) n++;
    }
    return n;
  }

  /** 中央框 [0, width) × [0, height) 內的已揭露格數（「已探索 %」用；外圍無限，百分比沒有意義） */
  centralCount(): number { return this.central; }

  /** 取走並清空 dirty 地圖 chunk（chunk 鍵，同 world.chunkIndex） */
  drainDirty(): number[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }

  /** (cx, cy) chunk 的位元（128 bytes，bit = ly*32 + lx；唯讀）；沒有任何已探索格 = undefined */
  chunkBits(cx: number, cy: number): Uint8Array | undefined {
    if (cy < 0 || cy >= this.chunksY) return undefined;
    return this.chunks.get(chunkKey(this.chunksX, cx, cy));
  }
  /** 含已探索格的 chunk 鍵（升冪） */
  exploredChunks(): number[] {
    return [...this.chunks.keys()].sort((a, b) => a - b);
  }

  /** 中央區的 row-major RLE（bit i = y*width + x）——與舊扁平實作的位元組相同 */
  encode(): Uint8Array {
    const W = this.width, H = this.height, flat = new Uint8Array(Math.ceil((W * H) / 8));
    for (const [k, b] of this.chunks) {
      if (isOuterChunkKey(k)) continue;
      const { cx, cy } = chunkXY(this.chunksX, k), x0 = cx * CHUNK, y0 = cy * CHUNK;
      for (let j = 0; j < FOG_CHUNK_BYTES; j++) {
        let v = b[j];
        while (v) {
          const bit = j * 8 + (31 - Math.clz32(v & -v));
          v &= v - 1;
          const x = x0 + (bit & 31), y = y0 + (bit >> 5);
          if (x >= W || y >= H) continue;
          const i = y * W + x;
          flat[i >> 3] |= 1 << (i & 7);
        }
      }
    }
    return encodeRle(flat, W * H);
  }

  /** 含中央框外已探索格的 chunk（整塊 1024 bit）；沒有 = undefined */
  encodeOuter(): OuterBitsSave | undefined {
    const keys: number[] = [];
    // 最後一個中央 chunk 在中央內的欄數（1..32）；不滿 32 時 lx ≥ edge 的格是中央框外
    const edge = this.width - (this.chunksX - 1) * CHUNK;
    const edgeMask = edge >= CHUNK ? 0 : (~((1 << edge) - 1)) >>> 0;
    for (const [k, b] of this.chunks) {
      if (isOuterChunkKey(k)) { keys.push(k); continue; }
      if (!edgeMask || chunkXY(this.chunksX, k).cx !== this.chunksX - 1) continue;
      // 每列 4 bytes = 32 bit（lx = 列內 bit）
      for (let ly = 0; ly < CHUNK; ly++) {
        const o = ly * 4, row = (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
        if (row & edgeMask) { keys.push(k); break; }
      }
    }
    if (!keys.length) return undefined;
    keys.sort((a, b) => a - b);
    const all = new Uint8Array(keys.length * FOG_CHUNK_BYTES);
    keys.forEach((k, n) => all.set(this.chunks.get(k)!, n * FOG_CHUNK_BYTES));
    return { chunks: keys, data: toBase64(encodeRle(all, keys.length * FOG_CHUNK_BITS)) };
  }

  /** 中央 RLE（長度要剛好 width*height）+ 外圍 chunk 以 OR 疊上；壞資料丟例外 */
  static decode(bytes: Uint8Array, width: number, height: number, outer?: OuterBitsSave, span?: FogSpan): ExploredMap {
    const m = new ExploredMap(width, height, decodeRle(bytes, width * height), span);
    if (outer) m.orOuter(outer);
    return m;
  }

  private orOuter(o: OuterBitsSave): void {
    if (!Array.isArray(o.chunks) || typeof o.data !== 'string') throw new Error('explored outer: shape');
    const all = decodeRle(fromBase64(o.data), o.chunks.length * FOG_CHUNK_BITS);
    o.chunks.forEach((k, n) => {
      if (!Number.isInteger(k) || k < 0) throw new Error('explored outer: key');
      const { cx, cy } = chunkXY(this.chunksX, k);
      if (cy < 0 || cy >= this.chunksY || chunkKey(this.chunksX, cx, cy) !== k) throw new Error('explored outer: key');
      const base = n * FOG_CHUNK_BYTES, x0 = cx * CHUNK, y0 = cy * CHUNK;
      for (let j = 0; j < FOG_CHUNK_BYTES; j++) {
        let v = all[base + j];
        while (v) {
          const bit = j * 8 + (31 - Math.clz32(v & -v));
          v &= v - 1;
          const y = y0 + (bit >> 5);
          if (y < this.height) this.set(x0 + (bit & 31), y);
        }
      }
    });
  }
}

/** 在 (x,y) 切換標記：radius 格內已有標記 → 移除最近的；否則新增（滿了回 full、不變）。不修改輸入陣列。 */
export function toggleMarker(markers: readonly MapMarker[], x: number, y: number, radius = 2):
  { markers: MapMarker[]; action: 'added' | 'removed' | 'full' } {
  let best = -1, bd = Infinity;
  markers.forEach((m, i) => {
    const d = Math.max(Math.abs(m.x - x), Math.abs(m.y - y));
    if (d <= radius && d < bd) { bd = d; best = i; }
  });
  if (best >= 0) return { markers: markers.filter((_, i) => i !== best), action: 'removed' };
  if (markers.length >= MAX_MARKERS) return { markers: [...markers], action: 'full' };
  return { markers: [...markers, { x: Math.round(x), y: Math.round(y) }], action: 'added' };
}
