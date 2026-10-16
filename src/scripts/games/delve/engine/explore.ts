// explore.ts — 戰爭迷霧：每格 1 bit 的「已探索」位元圖（row-major，bit i = y*w+x）。
//   · reveal / revealDisc（玩家周圍）/ revealLit（畫面上光照夠亮的格）
//   · 新揭露的格標記所在的 CHUNK 為 dirty，地圖快取只重畫那些 chunk
//   · 存檔：RLE（0 / 1 交替的連續長度，從 0 開始，LEB128 varint）——探索區域大多是大片連續，壓得很小
//   · 地圖標記（使用者在全地圖上點的記號）：toggleMarker
import { CHUNK } from './constants';
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

export class ExploredMap {
  readonly bits: Uint8Array;
  readonly chunksX: number;
  /** 已揭露格數 */
  count = 0;
  private readonly dirty = new Set<number>();

  constructor(readonly width: number, readonly height: number, bits?: Uint8Array) {
    this.bits = bits ?? new Uint8Array(Math.ceil((width * height) / 8));
    this.chunksX = Math.ceil(width / CHUNK);
    if (bits) {
      let n = 0;
      for (let i = 0; i < bits.length; i++) { let v = bits[i]; while (v) { v &= v - 1; n++; } }
      this.count = n;
    }
  }

  has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x;
    return ((this.bits[i >> 3] >> (i & 7)) & 1) === 1;
  }

  /** 揭露一格；回傳是否為新揭露 */
  reveal(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
    const i = y * this.width + x, m = 1 << (i & 7);
    if (this.bits[i >> 3] & m) return false;
    this.bits[i >> 3] |= m;
    this.count++;
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK), ci = cy * this.chunksX + cx;
    this.dirty.add(ci);
    // 迷霧邊緣的抖動看 4 鄰：chunk 邊上的格揭露時，鄰 chunk 也要重畫
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(ci - 1);
    if (lx === CHUNK - 1 && x + 1 < this.width) this.dirty.add(ci + 1);
    if (ly === 0 && cy > 0) this.dirty.add(ci - this.chunksX);
    if (ly === CHUNK - 1 && y + 1 < this.height) this.dirty.add(ci + this.chunksX);
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
    const x0 = Math.max(L.x0, Math.floor(view.x), 0), y0 = Math.max(L.y0, Math.floor(view.y), 0);
    const x1 = Math.min(L.x0 + L.w, Math.ceil(view.x + view.w), this.width), y1 = Math.min(L.y0 + L.h, Math.ceil(view.y + view.h), this.height);
    let n = 0;
    for (let y = y0; y < y1; y++) {
      const row = (y - L.y0) * L.w - L.x0;
      for (let x = x0; x < x1; x++) if (L.data[row + x] >= threshold && this.reveal(x, y)) n++;
    }
    return n;
  }

  /** 取走並清空 dirty 地圖 chunk（index = cy * chunksX + cx） */
  drainDirty(): number[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }

  encode(): Uint8Array { return encodeRle(this.bits, this.width * this.height); }
  static decode(bytes: Uint8Array, width: number, height: number): ExploredMap {
    return new ExploredMap(width, height, decodeRle(bytes, width * height));
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
