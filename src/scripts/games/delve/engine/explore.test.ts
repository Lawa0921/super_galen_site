// explore.test.ts — 戰爭迷霧位元圖：揭露（點 / 圓 / 光照）、髒 chunk、RLE 壓縮編解碼、地圖標記
import { describe, it, expect } from 'vitest';
import { ExploredMap, toggleMarker, MAX_MARKERS, encodeRle, decodeRle } from './explore';
import { LightMap } from './lighting';
import { CHUNK } from './constants';

describe('ExploredMap', () => {
  it('reveal / has；越界忽略；count 只算新揭露的格', () => {
    const m = new ExploredMap(100, 50);
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
    expect(Array.from(m2.bits)).toEqual(Array.from(m.bits));
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
