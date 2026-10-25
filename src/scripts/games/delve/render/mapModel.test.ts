// mapModel.test.ts — 地圖的純邏輯：色表（全在色票上）、chunk 繪製（迷霧 / 揭露 / 邊緣抖動）、視圖縮放平移、小地圖取樣框、圖示 / 標籤
import { describe, it, expect } from 'vitest';
import {
  buildMapLut, paintMapChunk, paintMapChunkAt, MAP_SCALES, zoomView, panView, screenToTileOnMap, tileToScreenOnMap, clampView, minimapView,
  mapIconBmp, MAP_ICONS, mapPins, mapLabels, stonePins, type MapView,
} from './mapModel';
import { World } from '../engine/world';
import { T, W } from '../engine/tiles';
import { ExploredMap } from '../engine/explore';
import { CHUNK } from '../engine/constants';
import { Bmp, inPalette } from './pixel';
import { buildRegions, Discovery, gen2Regions } from '../engine/discovery';
import { BIOME } from '../engine/world';
import { DelveGame } from '../engine/game';
import { SEA_Y } from '../engine/gen2/profile';
import { fullMapPins, fullMapLabels } from './mapView';

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
    for (let y = 20; y < 64; y++) for (let x = 0; x < 64; x++) { w.setFg(x, y, T.STONE); w.setWall(x, y, W.STONE_WALL); }
    w.setFg(5, 25, T.AIR); // 洞（有背景牆）
    return w;
  };
  it('未探索 = 迷霧；探索過的實心 = tile 色、天空 = 天空色、有牆的空洞 = 牆色', () => {
    const w = world(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    ex.reveal(3, 3); ex.reveal(3, 22); ex.reveal(5, 25);
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(out, w, ex, 0, 0, lut);
    expect(out[3 * CHUNK + 3]).toBe(lut.sky);
    expect([lut.fg[T.STONE], lut.fgDark[T.STONE]]).toContain(out[22 * CHUNK + 3]);
    expect(out[25 * CHUNK + 5]).toBe(lut.wall[W.STONE_WALL]);
    expect(out[30 * CHUNK + 30]).toBe(lut.fog);
  });
  it('迷霧邊緣（緊鄰已探索格）用棋盤格抖動', () => {
    const w = world(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    ex.reveal(10, 22);
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(out, w, ex, 0, 0, lut);
    const ring = [out[22 * CHUNK + 11], out[23 * CHUNK + 10]];
    expect(ring.some((v) => v === lut.fogEdge)).toBe(true);
    expect(out[22 * CHUNK + 14]).toBe(lut.fog);
  });
  it('世界邊界外的格 = 透明（0）', () => {
    const w = new World(40, 40), ex = new ExploredMap(40, 40), lut = buildMapLut();
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(out, w, ex, 1, 1, lut);
    expect(out[0]).toBe(lut.fog); // (32,32) 在世界內
    expect(out[CHUNK * CHUNK - 1]).toBe(0); // (63,63) 在世界外
  });
  it('直接吃 TileWindow + chunk 位元（沒常駐的欄由呼叫端 peek 後填進視窗）：與從世界讀的結果相同', () => {
    const w = world(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    for (let x = 0; x < 40; x++) ex.reveal(x, 22);
    const a = new Uint32Array(CHUNK * CHUNK), b = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(a, w, ex, 0, 0, lut);
    const win = w.window(-1, -1, CHUNK + 2, CHUNK + 2);
    paintMapChunk(b, win, ex.chunkBits(0, 0), lut, w, { l: ex.chunkBits(-1, 0), r: ex.chunkBits(1, 0), u: ex.chunkBits(0, -1), d: ex.chunkBits(0, 1) });
    expect(b).toEqual(a);
    // 沒有位元 = 整塊迷霧
    paintMapChunk(b, win, undefined, lut, w);
    expect(b.every((v) => v === lut.fog || v === lut.fogEdge)).toBe(true);
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
  it('panView 依螢幕位移移動；clampView 讓中心留在探索範圍內', () => {
    const p = panView(v0, 40, -20);
    expect(p.cx).toBeCloseTo(80); expect(p.cy).toBeCloseTo(60);
    const c = clampView({ cx: -500, cy: 9999, scale: 2 }, { x0: 0, x1: 4200 }, 1200, 800, 600);
    expect(c.cx).toBeGreaterThanOrEqual(0);
    expect(c.cy).toBeLessThanOrEqual(1200);
  });
  it('minimapView：以玩家為中心（水平不夾、負 x 也行）、垂直夾在世界內', () => {
    expect(minimapView(100, 50, 120, 80, 2, 1200)).toEqual({ cx: 100.5, cy: 50.5, scale: 2 });
    expect(minimapView(-5000, 50, 120, 80, 1, 1200)).toEqual({ cx: -4999.5, cy: 50.5, scale: 1 });
    expect(minimapView(5, 5, 120, 80, 1, 1200).cy).toBe(40);
    expect(minimapView(4199, 1199, 120, 80, 3, 1200).cy).toBeCloseTo(1200 - 40 / 3);
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
    expect(MAP_ICONS).toContain('waystone');
  });
  it('stonePins：解鎖的傳送碑 → waystone 圖示與名字', () => {
    const pins = stonePins([{ id: 0, x: 10, y: 20, name: '出生地傳送碑' }, { id: 1, x: 6000, y: 30, name: '東境第 1 碑' }]);
    expect(pins).toEqual([
      { icon: 'waystone', x: 10, y: 20, name: '出生地傳送碑' },
      { icon: 'waystone', x: 6000, y: 30, name: '東境第 1 碑' },
    ]);
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

describe('地城在地圖上讀得出來', () => {
  const dungeonWorld = (): World => {
    const w = new World(64, 64);
    w.surfaceY = 2;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { w.setFg(x, y, T.STONE); w.setWall(x, y, W.STONE_WALL); }
    // 磚殼 20..40 × 20..40，裡面是地城牆的空房間
    for (let y = 20; y <= 40; y++) for (let x = 20; x <= 40; x++) {
      const shell = x === 20 || x === 40 || y === 20 || y === 40;
      w.setFg(x, y, shell ? T.DUNGEON_BRICK_BLUE : T.AIR);
      w.setWall(x, y, W.DUNGEON_WALL_BLUE);
    }
    return w;
  };
  const paint = (): { out: Uint32Array; lut: ReturnType<typeof buildMapLut> } => {
    const w = dungeonWorld(), ex = new ExploredMap(64, 64), lut = buildMapLut();
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) ex.reveal(x, y);
    const out = new Uint32Array(CHUNK * CHUNK);
    paintMapChunkAt(out, w, ex, 0, 0, lut);
    return { out, lut };
  };
  const lum = (v: number): number => { const [r, g, b] = unpack(v); return 0.299 * r + 0.587 * g + 0.114 * b; };
  it('地城磚的地圖色和石頭明顯不同、比石頭亮', () => {
    const lut = buildMapLut();
    expect(lut.fg[T.DUNGEON_BRICK_BLUE]).not.toBe(lut.fg[T.STONE]);
    expect(lum(lut.fg[T.DUNGEON_BRICK_BLUE])).toBeGreaterThan(lum(lut.fg[T.STONE]));
  });
  it('磚殼外側緊貼的一般岩石畫成深色描邊', () => {
    const { out, lut } = paint();
    expect(out[30 * CHUNK + 19]).toBe(lut.outline);
    expect(out[19 * CHUNK + 30]).toBe(lut.outline);
    expect(out[30 * CHUNK + 15]).not.toBe(lut.outline);
  });
  it('地城牆畫成兩色的磚紋（不是一整片單色）、而且比一般洞穴空氣亮', () => {
    const { out, lut } = paint();
    const inside = new Set<number>();
    const e = Math.min(39, CHUNK);
    for (let y = 22; y < e; y++) for (let x = 22; x < e; x++) inside.add(out[y * CHUNK + x]);
    expect(inside.size).toBe(2);
    for (const v of inside) { expect(inPalette(unpack(v))).toBe(true); expect(lum(v)).toBeGreaterThan(lum(lut.cave)); }
  });
});

// ── gen2：大地圖讀已知地區表（Task 16） ─────────────────────
type Pt = { x: number; y: number };
const layoutOf = (g: DelveGame) => g.gen2()!.layout;
/** 第一道東海的海面（避開島） */
function firstSea(g: DelveGame): Pt {
  const sea = layoutOf(g).landmass(1, 1);
  expect(sea.kind).toBe('sea');
  let x = sea.x0 + 20;
  while (layoutOf(g).regionAt(x)?.kind === 'island') x++;
  return { x, y: SEA_Y - 2 };
}
/** 第一道東海的第一座島中點 */
function firstIsland(g: DelveGame): Pt {
  const isl = layoutOf(g).landmass(1, 1).regions.find((r) => r.kind === 'island')!;
  return { x: (isl.x0 + isl.x1) >> 1, y: SEA_Y - 2 };
}
/** 東側第一片大陸第一個地區的中點（地表上方） */
function firstContinentMid(g: DelveGame): Pt {
  const c = layoutOf(g).landmass(1, 2);
  expect(c.kind).toBe('continent');
  const x = (c.regions[0].x0 + c.regions[0].x1) >> 1;
  return { x, y: g.gen2()!.surfaceAt(x) - 2 };
}
/** 那一點所在的地塊地區名（gen2Regions 的最後一個 = 地塊地區） */
function regionName(g: DelveGame, p: Pt): string {
  const rs = gen2Regions(g.seed, g.gen2()!)(p.x, p.y);
  expect(rs.at(-1)!.cat).toBe('land');
  return rs.at(-1)!.name;
}
/** gen2 遊戲 + 依序 visit 第一道東海、它的第一座島、東側第一片大陸的中點 */
function gen2Explorer(seed: string): { g: DelveGame; d: Discovery } {
  const g = new DelveGame({ seed, worldGen: { kind: 'gen2' } }), d = g.discovery;
  for (const p of [firstSea(g), firstIsland(g), firstContinentMid(g)]) d.visit(p.x, p.y);
  return { g, d };
}

describe('gen2 大地圖：已知地區表', () => {
  it('外圍地區找到後大地圖畫名字：東方大海、島、荒野地區（大地圖本身 fullMapLabels 也畫）', () => {
    const { g, d } = gen2Explorer('lbl');
    const want = ['東方大海', regionName(g, firstIsland(g)), regionName(g, firstContinentMid(g))];
    const names = mapLabels(d.listKnown(), d).map((l) => l.name);
    for (const n of want) expect(names).toContain(n);
    const full = fullMapLabels(g);
    for (const n of want) expect(full.map((l) => l.name)).toContain(n);
    // 以 id 為鍵：每個已發現的地塊地區恰好一個標籤（同名不去重）
    const ids = full.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(d.listKnown().filter((r) => (r.cat === 'land' || r.cat === 'depth') && d.isFound(r.id)).length);
    // 大地圖用 discovery.region(id) 找回地區（外圍 id 不是陣列索引）
    for (const l of full) expect(d.region(l.id)?.name).toBe(l.name);
    // 沒去過的大陸地區不畫
    const far = layoutOf(g).landmass(1, 2).regions.at(-1)!, fx = (far.x0 + far.x1) >> 1;
    const farId = gen2Regions(g.seed, g.gen2()!)(fx, g.gen2()!.surfaceAt(fx) - 2).at(-1)!.id;
    expect(ids).not.toContain(farId);
  }, 60_000);
  it('gen2 家鄉的村莊 / 地城圖釘：找到前 showAll 才畫、找到後畫（大地圖 fullMapPins 也是）', () => {
    const { g, d } = gen2Explorer('pin');
    const v = d.listKnown().find((r) => r.kind === 'village' && !d.isFound(r.id))!;
    expect(v).toBeDefined();
    expect(mapPins(d.listKnown(), d, false).some((p) => p.id === v.id)).toBe(false);
    expect(mapPins(d.listKnown(), d, true).some((p) => p.id === v.id && !p.found)).toBe(true);
    expect(fullMapPins(g).some((p) => p.x === v.ax && p.y === v.ay)).toBe(false);
    d.visit(v.ax, v.ay);
    expect(mapPins(d.listKnown(), d, false).some((p) => p.id === v.id && p.icon === 'village')).toBe(true);
    expect(fullMapPins(g)).toContainEqual({ icon: 'village', x: v.ax, y: v.ay, name: v.name });
    const dg = d.listKnown().find((r) => r.kind === 'dungeon')!;
    d.visit(dg.ax, dg.ay);
    expect(fullMapPins(g).some((p) => p.icon === 'dungeon' && p.x === dg.ax && p.y === dg.ay)).toBe(true);
  }, 60_000);
  it('舊世界不變：listKnown = 中央 regions（同順序），大地圖的圖釘 / 標籤與改動前（直接吃 g.regions）相同', () => {
    const g = new DelveGame({ seed: 'old-map', width: 300, height: 160 }), d = g.discovery;
    expect(d.listKnown()).toEqual(g.regions);
    for (const r of g.regions.filter((q) => q.ax >= 0).slice(0, 6)) d.visit(r.ax, r.ay);
    for (const all of [false, true]) expect(mapPins(d.listKnown(), d, all)).toEqual(mapPins(g.regions, d, all));
    expect(fullMapLabels(g)).toEqual(mapLabels(g.regions, d));
    expect(fullMapLabels(g).length).toBeGreaterThan(0);
  });
  it('新種類沿用既有圖示：pond → lake、keep → dungeon、lighthouse / hermit / wreck_isle → cabin、reef / sea_ruin → ruin', () => {
    const want: Record<string, string> = { pond: 'lake', keep: 'dungeon', lighthouse: 'cabin', hermit: 'cabin', wreck_isle: 'cabin', reef: 'ruin', sea_ruin: 'ruin' };
    const rs = Object.keys(want).map((kind, id) => ({ id, cat: 'site' as const, kind, name: kind, x: id * 10, y: 0, w: 5, h: 5, ax: id * 10 + 2, ay: 2, contains: () => false }));
    const d = new Discovery(rs);
    expect(Object.fromEntries(mapPins(rs, d, true).map((p) => [p.name, p.icon]))).toEqual(want);
  });
});
