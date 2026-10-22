import { describe, expect, it } from 'vitest';
import { decodeBulk, decodeChunkData, encodeBulk, encodeChunkData, fnv1a, fnv1aStr, rleDecode, rleEncode } from './codec';
import type { BulkHead } from './protocol';
import type { ChunkData } from '../engine/column';

const N = 1024;
const layers = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

function rndBytes(n: number, seed: number): Uint8Array {
  const out = new Uint8Array(n);
  let s = seed >>> 0;
  for (let i = 0; i < n; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; out[i] = s >>> 24; }
  return out;
}
function mkChunk(f: (layer: number, i: number) => number): ChunkData {
  const d = {} as Record<string, Uint8Array>;
  layers.forEach((k, li) => { d[k] = Uint8Array.from({ length: N }, (_, i) => f(li, i) & 255); });
  return d as unknown as ChunkData;
}

describe('fnv1a', () => {
  it('已知值', () => {
    expect(fnv1a(new Uint8Array([]))).toBe(0x811c9dc5);
    expect(fnv1aStr('a')).toBe(0xe40c292c);
  });
  it('可接續（h 參數）', () => {
    const a = new Uint8Array([1, 2, 3]), b = new Uint8Array([4, 5]);
    expect(fnv1a(b, fnv1a(a))).toBe(fnv1a(new Uint8Array([1, 2, 3, 4, 5])));
  });
});

describe('rle', () => {
  const samples: [string, Uint8Array][] = [
    ['全 0', new Uint8Array(N)],
    ['全相異', Uint8Array.from({ length: 256 }, (_, i) => i)],
    ['長度 200 的連續段', Uint8Array.from({ length: 300 }, (_, i) => (i >= 50 && i < 250 ? 7 : i & 3))],
    ['隨機 1024 B', rndBytes(1024, 42)],
  ];
  for (const [name, b] of samples) {
    it(`往返：${name}`, () => {
      const enc = rleEncode(b);
      const { out, next } = rleDecode(enc, b.length);
      expect(Array.from(out)).toEqual(Array.from(b));
      expect(next).toBe(enc.length);
    });
  }
  it('rleDecode 從 at 開始並回報 next', () => {
    const enc = rleEncode(new Uint8Array([5, 5, 5, 6]));
    const buf = new Uint8Array([9, 9, ...enc, 1]);
    const r = rleDecode(buf, 4, 2);
    expect(Array.from(r.out)).toEqual([5, 5, 5, 6]);
    expect(r.next).toBe(2 + enc.length);
  });
});

describe('chunkData', () => {
  it('往返六層逐位元組相等', () => {
    const d = mkChunk((l, i) => (i % 17 === 0 ? l * 31 + (i >> 4) : l));
    const { data, next } = decodeChunkData(encodeChunkData(d));
    for (const k of layers) expect(Array.from(data[k])).toEqual(Array.from(d[k]));
    expect(next).toBe(encodeChunkData(d).length);
  });
  it('全空氣 < 40 B', () => {
    expect(encodeChunkData(mkChunk(() => 0)).length).toBeLessThan(40);
  });
  it('從 at 開始解碼', () => {
    const d = mkChunk((l, i) => (i * (l + 1)) >> 3);
    const enc = encodeChunkData(d);
    const buf = new Uint8Array(3 + enc.length); buf.set(enc, 3);
    const r = decodeChunkData(buf, 3);
    expect(Array.from(r.data.fg)).toEqual(Array.from(d.fg));
    expect(r.next).toBe(buf.length);
  });
});

describe('bulk', () => {
  it('往返（含空 payload、含中文標頭）', () => {
    const head: BulkHead = { t: 'chunk', key: 7, rev: 3, chests: [[5, [{ item: 'torch', count: 2 }, null], 1]] };
    const r = decodeBulk(encodeBulk(head));
    expect(r?.head).toEqual(head);
    expect(r?.payload.length).toBe(0);
    const head2: BulkHead = { t: 'snap', snap: { time: 1, tick: 2, peaceful: false, unlocked: [], keysUsed: 0, bosses: ['骷髏王'], kills: {},
      bossActive: null, weather: null, minedIce: [], settle: {} as never, folk: {} as never, quests: {} as never,
      scoutMarks: [], perkDays: { guide: -1, healer: -1 }, scouted: [], stones: [], visit: null } };
    const pl = rndBytes(300, 1);
    const r2 = decodeBulk(encodeBulk(head2, pl));
    expect(r2?.head).toEqual(head2);
    expect(Array.from(r2!.payload)).toEqual(Array.from(pl));
  });
  it('截斷 → null', () => {
    const bytes = encodeBulk({ t: 'liq', chunks: [1, 2, 3] }, new Uint8Array([1, 2]));
    expect(decodeBulk(bytes.subarray(0, 2))).toBeNull();
    expect(decodeBulk(bytes.subarray(0, 8))).toBeNull();
    expect(decodeBulk(new Uint8Array(0))).toBeNull();
  });
});
