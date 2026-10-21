// explore.test.ts — 戰爭迷霧位元圖：揭露（點 / 圓 / 光照）、髒 chunk、RLE 壓縮編解碼、地圖標記
import { describe, it, expect } from 'vitest';
import { ExploredMap, toggleMarker, MAX_MARKERS, encodeRle, decodeRle } from './explore';
import { LightMap } from './lighting';
import { CHUNK } from './constants';
import { chunkKey, isOuterChunkKey } from './coords';

/** 舊的扁平實作（row-major，bit i = y*w+x，夾在 [0, width)）：中央 encode() 的位元組參考 */
class FlatFog {
  readonly bits: Uint8Array;
  constructor(readonly width: number, readonly height: number) { this.bits = new Uint8Array(Math.ceil((width * height) / 8)); }
  reveal(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = y * this.width + x;
    this.bits[i >> 3] |= 1 << (i & 7);
  }
  encode(): Uint8Array { return encodeRle(this.bits, this.width * this.height); }
}

describe('ExploredMap', () => {
  it('reveal / has；有界範圍（span）外忽略；count 只算新揭露的格', () => {
    const m = new ExploredMap(100, 50, undefined, { xMin: 0, xMax: 100 });
    expect(m.has(3, 4)).toBe(false);
    expect(m.reveal(3, 4)).toBe(true);
    expect(m.reveal(3, 4)).toBe(false);
    expect(m.has(3, 4)).toBe(true);
    expect(m.reveal(-1, 0)).toBe(false);
    expect(m.reveal(100, 0)).toBe(false);
    expect(m.count).toBe(1);
  });
  it('revealDisc：半徑 r 的圓內全部揭露，圓外不動', () => {
    const m = new ExploredMap(100, 100);
    const n = m.revealDisc(50, 50, 5);
    expect(n).toBeGreaterThan(70);
    expect(n).toBeLessThan(100);
    expect(m.has(50, 45)).toBe(true);
    expect(m.has(54, 53)).toBe(true);
    expect(m.has(55, 55)).toBe(false);
    expect(m.revealDisc(50, 50, 5)).toBe(0);
  });
  it('揭露會標記所在的地圖 chunk 為 dirty（drainDirty 取走後清空）', () => {
    const m = new ExploredMap(200, 100);
    m.reveal(5, 5);
    m.reveal(CHUNK + 1, 5);
    expect(m.drainDirty().sort((a, b) => a - b)).toEqual([0, 1]);
    expect(m.drainDirty()).toEqual([]);
    m.reveal(5, 5); // 已揭露：不再 dirty
    expect(m.drainDirty()).toEqual([]);
  });
  it('revealLit：視窗內光照 ≥ 門檻的格揭露，暗處 / 視窗外不揭露', () => {
    const m = new ExploredMap(60, 60);
    const data = new Float32Array(20 * 20);
    data[5 * 20 + 5] = 0.9; data[6 * 20 + 5] = 0.2; data[1 * 20 + 1] = 0.9;
    const L = new LightMap(10, 10, 20, 20, data);
    const n = m.revealLit(L, { x: 12, y: 12, w: 10, h: 10 }, 0.3);
    expect(n).toBe(1);
    expect(m.has(15, 15)).toBe(true);
    expect(m.has(15, 16)).toBe(false);
    expect(m.has(11, 11)).toBe(false); // 亮但在視窗外
  });
  it('RLE 編解碼往返；大片連續區壓得很小', () => {
    const m = new ExploredMap(4200, 1200);
    m.revealDisc(2100, 300, 40);
    m.revealDisc(500, 900, 25);
    for (let x = 0; x < 4200; x++) m.reveal(x, 10);
    const bytes = m.encode();
    expect(bytes.length).toBeLessThan(4000);
    const m2 = ExploredMap.decode(bytes, 4200, 1200);
    expect(m2.count).toBe(m.count);
    expect(Array.from(m2.encode())).toEqual(Array.from(bytes));
    expect(m2.has(2100, 300)).toBe(true);
    expect(m2.has(2100, 200)).toBe(false);
  });
  it('空地圖 / 全開地圖都能編解碼；壞資料丟例外', () => {
    for (const fill of [false, true]) {
      const m = new ExploredMap(33, 17);
      if (fill) for (let y = 0; y < 17; y++) for (let x = 0; x < 33; x++) m.reveal(x, y);
      const m2 = ExploredMap.decode(m.encode(), 33, 17);
      expect(m2.count).toBe(fill ? 33 * 17 : 0);
    }
    expect(() => ExploredMap.decode(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]), 10, 10)).toThrow();
    expect(() => decodeRle(encodeRle(new Uint8Array([1, 0, 1]), 3), 5)).toThrow();
  });
});

describe('ExploredMap：按 chunk 儲存、x 不夾在 [0, width)', () => {
  it('負 x / x ≥ width 揭露後 has 為真；drainDirty 給外圍 chunk 鍵；centralCount 只算中央', () => {
    const m = new ExploredMap(100, 50), cxN = Math.ceil(100 / CHUNK);
    expect(m.reveal(-5, 3)).toBe(true);
    expect(m.has(-5, 3)).toBe(true);
    expect(m.has(-6, 3)).toBe(false);
    expect(m.reveal(5000, 40)).toBe(true);
    expect(m.reveal(10, 10)).toBe(true);
    expect(m.reveal(-5, 3)).toBe(false);
    expect(m.count).toBe(3);
    expect(m.centralCount()).toBe(1);
    const d = m.drainDirty();
    expect(d).toContain(chunkKey(cxN, -1, 0));
    expect(d).toContain(chunkKey(cxN, Math.floor(5000 / CHUNK), 1));
    expect(d).toContain(chunkKey(cxN, 0, 0));
    expect(d.filter(isOuterChunkKey).length).toBe(2);
    // 越過垂直邊界照舊忽略
    expect(m.reveal(-5, -1)).toBe(false);
    expect(m.reveal(-5, 50)).toBe(false);
  });
  it('chunk 邊上的格揭露：鄰 chunk（含負 x 那邊）也 dirty', () => {
    const m = new ExploredMap(100, 50), cxN = Math.ceil(100 / CHUNK);
    m.reveal(0, 5);
    expect(m.drainDirty().sort((a, b) => a - b)).toEqual([chunkKey(cxN, 0, 0), chunkKey(cxN, -1, 0)].sort((a, b) => a - b));
    const b = new ExploredMap(100, 50, undefined, { xMin: 0, xMax: 100 });
    b.reveal(0, 5);
    expect(b.drainDirty()).toEqual([0]);
  });
  it('chunkBits：bit = ly*32 + lx；沒有已探索格的 chunk = undefined；exploredChunks 列出 chunk 鍵', () => {
    const m = new ExploredMap(100, 50), cxN = Math.ceil(100 / CHUNK);
    m.reveal(-30, 33); // cx −1、lx 2；cy 1、ly 1
    const bits = m.chunkBits(-1, 1)!;
    expect(bits.length).toBe(128);
    const i = 1 * 32 + 2;
    expect((bits[i >> 3] >> (i & 7)) & 1).toBe(1);
    expect(m.chunkBits(0, 0)).toBeUndefined();
    expect(m.chunkBits(-1, 0)).toBeUndefined();
    expect(m.exploredChunks()).toEqual([chunkKey(cxN, -1, 1)]);
  });
  it('中央 encode() 與舊扁平實作位元組相同（寬度不是 32 的倍數、也揭露外圍）', () => {
    const W = 200, H = 100, m = new ExploredMap(W, H), f = new FlatFog(W, H);
    const pts: [number, number][] = [];
    for (let x = 180; x < 230; x++) pts.push([x, 7], [x, 64]);
    for (let y = 0; y < H; y += 3) pts.push([0, y], [W - 1, y], [-1, y], [W, y]);
    for (let k = 0; k < 400; k++) pts.push([((k * 7919) % 300) - 50, (k * 104729) % H]);
    for (const [x, y] of pts) { m.reveal(x, y); f.reveal(x, y); }
    m.revealDisc(10, 50, 9); m.revealDisc(195, 20, 12);
    const f2 = new FlatFog(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.has(x, y)) f2.reveal(x, y);
    for (const [x, y] of pts) if (x >= 0 && x < W) expect(f2.bits[(y * W + x) >> 3] >> ((y * W + x) & 7) & 1).toBe(1);
    expect(Array.from(m.encode())).toEqual(Array.from(f2.encode()));
    // 只揭露點（沒有圓）時，直接與舊實作逐位元組相同
    const m3 = new ExploredMap(W, H), f3 = new FlatFog(W, H);
    for (const [x, y] of pts) { m3.reveal(x, y); f3.reveal(x, y); }
    expect(Array.from(m3.encode())).toEqual(Array.from(f3.encode()));
    let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m3.has(x, y)) n++;
    expect(m3.centralCount()).toBe(n);
  });
  it('只揭露中央 → encodeOuter() 是 undefined（包括跨出中央的最後一個 chunk 只揭露到 x < width）', () => {
    const m = new ExploredMap(200, 100);
    m.revealDisc(50, 50, 10);
    for (let x = 192; x < 200; x++) m.reveal(x, 3);
    expect(m.encodeOuter()).toBeUndefined();
    m.reveal(200, 3);
    const o = m.encodeOuter()!;
    expect(o.chunks).toEqual([chunkKey(Math.ceil(200 / CHUNK), 6, 0)]);
  });
  it('encodeOuter → decode 往返相同（外圍 OR 疊在中央上）', () => {
    const W = 200, H = 100, m = new ExploredMap(W, H);
    m.revealDisc(-40, 30, 8); m.revealDisc(5000, 80, 6); m.revealDisc(198, 50, 7); m.revealDisc(60, 60, 5);
    m.reveal(-1_000_000, 0); m.reveal(999_999, 99);
    const outer = m.encodeOuter()!;
    expect(outer.chunks).toEqual([...outer.chunks].sort((a, b) => a - b));
    expect(typeof outer.data).toBe('string');
    const m2 = ExploredMap.decode(m.encode(), W, H, outer);
    expect(m2.count).toBe(m.count);
    expect(m2.centralCount()).toBe(m.centralCount());
    expect(m2.exploredChunks()).toEqual(m.exploredChunks());
    for (const [x0, y0] of [[-50, 20], [4990, 70], [188, 40], [50, 50]]) {
      for (let y = y0; y < y0 + 25; y++) for (let x = x0; x < x0 + 25; x++) if (y < H) expect(m2.has(x, y)).toBe(m.has(x, y));
    }
    expect(m2.has(-1_000_000, 0)).toBe(true);
    expect(m2.has(999_999, 99)).toBe(true);
    expect(m2.drainDirty()).toEqual([]);
    // 外圍清單壞掉（長度不符 / 鍵不合法）→ 丟例外
    expect(() => ExploredMap.decode(m.encode(), W, H, { chunks: [...outer.chunks, outer.chunks[0] + 1], data: outer.data })).toThrow();
  });
  it('X_LIMIT 外不揭露', () => {
    const m = new ExploredMap(100, 50);
    expect(m.reveal(1_000_000, 3)).toBe(false);
    expect(m.reveal(-1_000_001, 3)).toBe(false);
    expect(m.reveal(-1_000_000, 3)).toBe(true);
  });
});

describe('地圖標記', () => {
  it('點空地新增；點在既有標記 2 格內 → 移除；最多 MAX_MARKERS 個', () => {
    let ms: { x: number; y: number }[] = [];
    ms = toggleMarker(ms, 10, 10).markers;
    expect(ms).toEqual([{ x: 10, y: 10 }]);
    const r = toggleMarker(ms, 11, 9);
    expect(r.action).toBe('removed');
    expect(r.markers).toEqual([]);
    for (let i = 0; i < MAX_MARKERS; i++) ms = toggleMarker(ms, i * 10, 0).markers;
    expect(ms.length).toBe(MAX_MARKERS);
    const full = toggleMarker(ms, 500, 500);
    expect(full.action).toBe('full');
    expect(full.markers.length).toBe(MAX_MARKERS);
  });
});
