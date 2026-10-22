// tileFlags.ts — 每格一個 byte 的旗標（液體模擬的 inQ / kill），與世界寬度無關：
//   每個 chunk（32×32）一塊 Uint8Array(1024)，第一次寫入非 0 值時才配置（讀沒配置的 chunk = 0）；
//   記住上一個用到的 chunk（一次整數比較，命中就不查 Map）。鍵用 coords.ts 的 chunkKey。
//   y 只用在 [0, 128 × 32) 內（WORLD_H = 1200 遠小於這個；中央 chunk 連負 cy 都是雙射）。
import { chunkKey, chunkXY } from './coords';

const CHUNK_TILES = 1024;

export class TileFlags {
  private readonly chunks = new Map<number, Uint8Array>();
  /** 上一個查過的 chunk（null = 查過但沒配置）；lcx = NaN 表示快取無效 */
  private lcx = NaN;
  private lcy = NaN;
  private last: Uint8Array | null = null;

  constructor(readonly chunksX: number) {}

  private find(cx: number, cy: number): Uint8Array | null {
    if (cx === this.lcx && cy === this.lcy) return this.last;
    const a = this.chunks.get(chunkKey(this.chunksX, cx, cy)) ?? null;
    this.lcx = cx; this.lcy = cy; this.last = a;
    return a;
  }

  get(x: number, y: number): number {
    const a = this.find(x >> 5, y >> 5);
    return a === null ? 0 : a[((y & 31) << 5) | (x & 31)];
  }

  set(x: number, y: number, v: number): void {
    const cx = x >> 5, cy = y >> 5;
    let a = this.find(cx, cy);
    if (a === null) {
      if (v === 0) return;
      a = new Uint8Array(CHUNK_TILES);
      this.chunks.set(chunkKey(this.chunksX, cx, cy), a);
      this.last = a;
    }
    a[((y & 31) << 5) | (x & 31)] = v;
  }

  /** 丟掉第 cx 欄的所有 chunk（欄卸載時；之後讀回 0） */
  dropColumn(cx: number): void {
    for (const k of [...this.chunks.keys()]) if (chunkXY(this.chunksX, k).cx === cx) this.chunks.delete(k);
    if (this.lcx === cx) { this.lcx = NaN; this.lcy = NaN; this.last = null; }
  }
}
