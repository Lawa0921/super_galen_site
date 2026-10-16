// mapModel.test.ts — 地圖的純邏輯：色表（全在色票上）、chunk 繪製（迷霧 / 揭露 / 邊緣抖動）、視圖縮放平移、小地圖取樣框、圖示 / 標籤
import { describe, it, expect } from 'vitest';
import {
  buildMapLut, paintMapChunk, MAP_SCALES, zoomView, panView, screenToTileOnMap, tileToScreenOnMap, clampView, minimapSource,
  mapIconBmp, MAP_ICONS, mapPins, mapLabels, type MapView,
} from './mapModel';
import { World } from '../engine/world';
import { T, W } from '../engine/tiles';
import { ExploredMap } from '../engine/explore';
import { CHUNK } from '../engine/constants';
import { Bmp, inPalette } from './pixel';
import { buildRegions, Discovery } from '../engine/discovery';
import { BIOME } from '../engine/world';

const unpack = (v: number): [number, number, number] => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255];

describe('地圖色表', () => {
  it('所有 tile / 牆 / 天空 / 洞穴 / 迷霧色都在色票上、不透明', () => {
    const lut = buildMapLut();
    for (const v of [...lut.fg, ...lut.fgDark, ...lut.wall, lut.sky, lut.cave, lut.fog, lut.fogEdge]) {
      if (!v) continue;
      expect(v >>> 24).toBe(255);
      expect(inPalette(unpack(v))).toBe(true);
    }
    expect(lut.fg[T.STONE]).not.toBe(lut.fg[T.DIRT]);
    expect(lut.fog).not.toBe(lut.cave);
  });
});

describe('paintMapChunk', () => {
  const world = (): World => {
    const w = new World(64, 64);
    w.surfaceY = 10;
    for (let y = 20; y < 64; y++) for (let x = 0; x < 64; x++) { w.fg[y * 64 + x] = T.STONE; w.wall[y * 64 + x] = W.STONE_WALL; }
    w.fg[25 * 64 + 5] = T.AIR; // 洞（有背景牆）
    return w;
  };
  it('未探索 = 迷霧；探索過的實心 = tile 色、天空 = 天空色、有牆的空洞 = 牆色', () => {
    const w = world(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    ex.reveal(3, 3); ex.reveal(3, 22); ex.reveal(5, 25);
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunk(out, w, ex, 0, 0, lut);
    expect(out[3 * CHUNK + 3]).toBe(lut.sky);
    expect([lut.fg[T.STONE], lut.fgDark[T.STONE]]).toContain(out[22 * CHUNK + 3]);
    expect(out[25 * CHUNK + 5]).toBe(lut.wall[W.STONE_WALL]);
    expect(out[30 * CHUNK + 30]).toBe(lut.fog);
  });
  it('迷霧邊緣（緊鄰已探索格）用棋盤格抖動', () => {
    const w = world(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    ex.reveal(10, 22);
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunk(out, w, ex, 0, 0, lut);
    const ring = [out[22 * CHUNK + 11], out[23 * CHUNK + 10]];
    expect(ring.some((v) => v === lut.fogEdge)).toBe(true);
    expect(out[22 * CHUNK + 14]).toBe(lut.fog);
  });
  it('世界邊界外的格 = 透明（0）', () => {
    const w = new World(40, 40), ex = new ExploredMap(40, 40), lut = buildMapLut();
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunk(out, w, ex, 1, 1, lut);
    expect(out[0]).toBe(lut.fog); // (32,32) 在世界內
    expect(out[CHUNK * CHUNK - 1]).toBe(0); // (63,63) 在世界外
  });
});

describe('地圖視圖', () => {
  const v0: MapView = { cx: 100, cy: 50, scale: 2 };
  it('screen ↔ tile 互逆；畫面中心 = (cx, cy)', () => {
    expect(screenToTileOnMap(v0, 800, 600, 400, 300)).toEqual({ x: 100, y: 50 });
    const p = tileToScreenOnMap(v0, 800, 600, 120, 70);
    expect(screenToTileOnMap(v0, 800, 600, p.x, p.y)).toEqual({ x: 120, y: 70 });
  });
  it('zoomView：以游標為中心縮放（游標下的格不動），倍率只在 MAP_SCALES 之間跳', () => {
    const at = screenToTileOnMap(v0, 800, 600, 600, 100);
    const z = zoomView(v0, 800, 600, 600, 100, 1);
    expect(MAP_SCALES).toContain(z.scale);
    expect(z.scale).toBeGreaterThan(v0.scale);
    const after = screenToTileOnMap(z, 800, 600, 600, 100);
    expect(Math.abs(after.x - at.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.y - at.y)).toBeLessThanOrEqual(1);
    let v = v0;
    for (let i = 0; i < 20; i++) v = zoomView(v, 800, 600, 400, 300, -1);
    expect(v.scale).toBe(MAP_SCALES[0]);
  });
  it('panView 依螢幕位移移動；clampView 讓世界留在畫面內', () => {
    const p = panView(v0, 40, -20);
    expect(p.cx).toBeCloseTo(80); expect(p.cy).toBeCloseTo(60);
    const c = clampView({ cx: -500, cy: 9999, scale: 2 }, 4200, 1200, 800, 600);
    expect(c.cx).toBeGreaterThanOrEqual(0);
    expect(c.cy).toBeLessThanOrEqual(1200);
  });
  it('minimapSource：以玩家為中心、夾在世界內', () => {
    expect(minimapSource(100, 50, 120, 80, 2, 4200, 1200)).toEqual({ sx: 70, sy: 30, sw: 60, sh: 40 });
    expect(minimapSource(5, 5, 120, 80, 1, 4200, 1200)).toEqual({ sx: 0, sy: 0, sw: 120, sh: 80 });
    expect(minimapSource(4199, 1199, 120, 80, 3, 4200, 1200)).toEqual({ sx: 4160, sy: 1173, sw: 40, sh: 27 });
  });
});

describe('地圖圖示 / 標籤', () => {
  it('每種圖示都畫得出來（色票內）', () => {
    for (const k of MAP_ICONS) {
      const b = mapIconBmp(k);
      let n = 0;
      for (const v of b.px) if (v >>> 24) { n++; expect(inPalette(Bmp.unpack(v))).toBe(true); }
      expect(n, k).toBeGreaterThan(8);
    }
  });
  it('mapPins：只有發現過的地標才顯示；有探險家地圖時全部顯示（未發現的標成 ?）', () => {
    const fill = (v: number): Int16Array => new Int16Array(300).fill(v);
    const rs = buildRegions({
      seed: 'p', width: 300, height: 200, spawn: { x: 150, y: 39 }, surface: fill(40),
      layers: { rock: fill(60), deep: fill(100), molten: fill(170) },
      biomes: [{ biome: BIOME.SNOW, x0: 20, x1: 80 }],
      structures: [{ kind: 'cabin', x: 200, y: 80, w: 10, h: 6 }, { kind: 'sky_island', x: 100, y: 5, w: 30, h: 10 }],
      dungeon: null,
    });
    const d = new Discovery(rs);
    d.visit(205, 83);
    const shown = mapPins(rs, d, false);
    expect(shown.map((p) => p.icon)).toEqual(['cabin']);
    expect(shown[0].x).toBe(205);
    const all = mapPins(rs, d, true);
    expect(all.length).toBe(2);
    expect(all.find((p) => p.icon === 'sky_island')!.found).toBe(false);
    const labels = mapLabels(rs, d);
    expect(labels.some((l) => l.name === '家鄉林地')).toBe(true);
    expect(labels.every((l) => d.isFound(l.id))).toBe(true);
  });
});
