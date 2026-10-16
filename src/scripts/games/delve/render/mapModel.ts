// mapModel.ts — 地圖的純邏輯（無 DOM）：
//   · 色表：每個 tile / 背景牆 / 天空 / 洞穴空氣 / 迷霧 → 色票色（uint32 ABGR，可直接寫進 ImageData）
//   · paintMapChunk：把一個 CHUNK×CHUNK 區塊畫成 1 tile = 1 px（未探索 = 迷霧；迷霧邊緣棋盤抖動）
//   · 全地圖視圖：中心 tile + 每格幾個裝置像素（只在 MAP_SCALES 間跳，保持整數 / 1/n 倍的像素感）、縮放平移
//   · 小地圖取樣框、地標圖示（7×7 手繪）、名字標籤
import { TILES, WALLS, T, SOLID_LUT } from '../engine/tiles';
import { CHUNK } from '../engine/constants';
import type { ExploredMap } from '../engine/explore';
import type { Discovery, Region } from '../engine/discovery';
import { Bmp, INK, hex, nudge, snap, type RGB } from './pixel';

export interface MapLut {
  /** 實心 / 顯示在地圖上的物件色（0 = 用背景） */
  fg: Uint32Array;
  /** 同上，暗一階（材質變體 → 地圖上有一點顆粒感） */
  fgDark: Uint32Array;
  wall: Uint32Array;
  sky: number; cave: number; fog: number; fogEdge: number;
}

const pack = (c: RGB): number => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
/** 非實心但要畫在地圖上的物件 */
const SHOWN = new Set<number>([T.WOOD, T.LEAVES, T.TORCH, T.PLATFORM, T.ROPE, T.CHEST, T.LOCKED_CHEST, T.DOOR_OPEN, T.LORE_TABLET,
  T.BED_HEAD, T.BED_FOOT, T.CRYSTAL, T.GLOW_MUSHROOM, T.WORKBENCH]);

let LUT: MapLut | null = null;
export function buildMapLut(): MapLut {
  if (LUT) return LUT;
  const fg = new Uint32Array(256), fgDark = new Uint32Array(256), wall = new Uint32Array(256);
  for (const t of TILES) {
    if (t.id === T.AIR || (!t.solid && !SHOWN.has(t.id))) continue;
    const c = snap(hex(t.color));
    fg[t.id] = pack(c);
    fgDark[t.id] = t.solid ? pack(nudge(c, -1)) : pack(c);
  }
  for (const w of WALLS) if (w.id) wall[w.id] = pack(snap(hex(w.color)));
  LUT = { fg, fgDark, wall, sky: pack(hex('#5c9ce0')), cave: pack(hex('#1c1424')), fog: pack(hex('#0c0a12')), fogEdge: pack(hex('#2c2838')) };
  return LUT;
}

export interface MapWorld {
  width: number; height: number; surfaceY: number;
  fg: Uint8Array; wall: Uint8Array; variant: Uint8Array;
}

/** 畫 chunk (cx, cy) 到 out（CHUNK*CHUNK，row-major）；世界外 = 0（透明） */
export function paintMapChunk(out: Uint32Array, w: MapWorld, ex: ExploredMap, cx: number, cy: number, lut: MapLut = buildMapLut()): void {
  const W = w.width, x0 = cx * CHUNK, y0 = cy * CHUNK;
  const bits = ex.bits;
  const has = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= w.height) return false;
    const i = y * W + x;
    return ((bits[i >> 3] >> (i & 7)) & 1) === 1;
  };
  for (let ly = 0; ly < CHUNK; ly++) {
    const y = y0 + ly;
    for (let lx = 0; lx < CHUNK; lx++) {
      const x = x0 + lx, o = ly * CHUNK + lx;
      if (x >= W || y >= w.height) { out[o] = 0; continue; }
      if (!has(x, y)) {
        out[o] = ((x + y) & 1) === 1 && (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) ? lut.fogEdge : lut.fog;
        continue;
      }
      const i = y * W + x, f = w.fg[i];
      const c = w.variant[i] === 2 ? lut.fgDark[f] : lut.fg[f];
      if (c) { out[o] = c; continue; }
      const wl = w.wall[i];
      out[o] = wl ? lut.wall[wl] : y <= w.surfaceY && SOLID_LUT[f] !== 1 ? lut.sky : lut.cave;
    }
  }
}

// ── 全地圖視圖 ──────────────────────────────────────────
/** 每格 tile 佔幾個裝置像素 */
export const MAP_SCALES = [0.25, 0.5, 1, 2, 3, 4, 6, 8] as const;
export interface MapView { cx: number; cy: number; scale: number; }

export function screenToTileOnMap(v: MapView, sw: number, sh: number, sx: number, sy: number): { x: number; y: number } {
  return { x: Math.floor(v.cx + (sx - sw / 2) / v.scale), y: Math.floor(v.cy + (sy - sh / 2) / v.scale) };
}
export function tileToScreenOnMap(v: MapView, sw: number, sh: number, tx: number, ty: number): { x: number; y: number } {
  return { x: Math.round(sw / 2 + (tx + 0.5 - v.cx) * v.scale), y: Math.round(sh / 2 + (ty + 0.5 - v.cy) * v.scale) };
}
/** 以螢幕點 (sx,sy) 為中心縮放一階（dir +1 放大 / −1 縮小） */
export function zoomView(v: MapView, sw: number, sh: number, sx: number, sy: number, dir: number): MapView {
  let k = MAP_SCALES.findIndex((s) => s >= v.scale - 1e-9);
  if (k < 0) k = MAP_SCALES.length - 1;
  const nk = Math.max(0, Math.min(MAP_SCALES.length - 1, k + (dir > 0 ? 1 : -1)));
  const ns = MAP_SCALES[nk];
  const wx = v.cx + (sx - sw / 2) / v.scale, wy = v.cy + (sy - sh / 2) / v.scale;
  return { scale: ns, cx: wx - (sx - sw / 2) / ns, cy: wy - (sy - sh / 2) / ns };
}
/** 螢幕位移 (dx,dy) 裝置像素 → 地圖跟著手指走 */
export function panView(v: MapView, dx: number, dy: number): MapView {
  return { scale: v.scale, cx: v.cx - dx / v.scale, cy: v.cy - dy / v.scale };
}
/** 中心夾在世界內（世界比畫面小時置中） */
export function clampView(v: MapView, ww: number, wh: number, sw: number, sh: number): MapView {
  const fit = (c: number, world: number, screen: number): number => {
    const half = screen / 2 / v.scale;
    if (world <= half * 2) return world / 2;
    return Math.max(half * 0.25, Math.min(world - half * 0.25, c));
  };
  return { scale: v.scale, cx: fit(v.cx, ww, sw), cy: fit(v.cy, wh, sh) };
}

/** 小地圖：以玩家 tile (px,py) 為中心、w×h 美術像素、每格 zoom 像素 → 地圖快取上的取樣框 */
export function minimapSource(px: number, py: number, w: number, h: number, zoom: number, ww: number, wh: number):
  { sx: number; sy: number; sw: number; sh: number } {
  const sw = Math.min(ww, Math.ceil(w / zoom)), sh = Math.min(wh, Math.ceil(h / zoom));
  const sx = Math.max(0, Math.min(ww - sw, Math.round(px - sw / 2)));
  const sy = Math.max(0, Math.min(wh - sh, Math.round(py - sh / 2)));
  return { sx, sy, sw, sh };
}

// ── 地標圖示 ─────────────────────────────────────────────
export const MAP_ICONS = ['cabin', 'mineshaft', 'ruin', 'sky_island', 'lake', 'cavern', 'chasm', 'mushroom_biome', 'crystal_cave',
  'secret_room', 'dungeon', 'treasure', 'unknown', 'player', 'marker'] as const;
export type MapIcon = (typeof MAP_ICONS)[number];
const ICON_OF: Record<string, MapIcon> = {
  cabin: 'cabin', mineshaft: 'mineshaft', ruin: 'ruin', sky_island: 'sky_island', frozen_lake: 'lake', lake_bed: 'lake',
  cavern: 'cavern', chasm: 'chasm', ravine: 'chasm', sinkhole: 'chasm', mushroom_biome: 'mushroom_biome', crystal_cave: 'crystal_cave',
  secret_room: 'secret_room', dungeon: 'dungeon', dungeon_treasure: 'treasure',
};
const IC: Record<string, RGB> = {
  w: hex('#f2e2b0'), b: hex('#966139'), d: hex('#623924'), r: hex('#a83a10'), o: hex('#e8701c'), y: hex('#ffd86a'),
  g: hex('#858aa0'), G: hex('#b4b9c8'), s: hex('#5e5e74'), c: hex('#4aaeb0'), C: hex('#cceaf8'), l: hex('#5c9ce0'),
  p: hex('#b8788e'), P: hex('#7a5a8c'), n: hex('#468a34'), N: hex('#93cc50'), k: hex('#2c2838'), W: hex('#ffffff'),
};
const ICON_ART: Record<MapIcon, string[]> = {
  cabin: ['...r...', '..rrr..', '.rrrrr.', 'rbbbbbr', '.bwbdb.', '.bbbdb.', '.bbbdb.'],
  mineshaft: ['.GGG...', '..dGG..', '..d.G..', '.d...G.', '.d.....', 'd......', 'd......'],
  ruin: ['G.G.G..', 'GGGGG..', '.g.g.G.', '.g.g.g.', '.g.g.g.', '.g.g.g.', 'GGGGGGG'],
  sky_island: ['..WWW..', '.WWWWW.', '.......', 'nNNNNNn', '.ggggg.', '..ggg..', '...g...'],
  lake: ['.......', '.l.l.l.', 'l.l.l.l', '.......', '.l.l.l.', 'l.l.l.l', '.......'],
  cavern: ['..sss..', '.s...s.', 's.....s', 's.....s', 's.....s', '.s...s.', 'sssssss'],
  chasm: ['ss...ss', 'ss...ss', '.s...s.', '.ss.ss.', '..s.s..', '..sss..', '...s...'],
  mushroom_biome: ['.ccccc.', 'cCcccCc', 'ccccccc', '...w...', '...w...', '...w...', '..www..'],
  crystal_cave: ['...C...', '..CpC..', '..ppp..', '.pPpPp.', '.ppppp.', '..ppp..', '...P...'],
  secret_room: ['.yyyyy.', 'yy...yy', 'y.....y', 'yyyyyyy', 'yyykyyy', 'yyykyyy', 'yyyyyyy'],
  dungeon: ['P.P.P.P', 'PPPPPPP', '.PPPPP.', '.PkkkP.', '.PkkkP.', '.PkkkP.', 'PPPPPPP'],
  treasure: ['.......', '.yyyyy.', 'yoyyyoy', 'yyyyyyy', 'odoyodo', 'oooyooo', 'ooooooo'],
  unknown: ['..www..', '.w...w.', '.....w.', '....w..', '...w...', '.......', '...w...'],
  player: ['...W...', '..WWW..', '.WWWWW.', 'WWWWWWW', '.WWWWW.', '..WWW..', '...W...'],
  marker: ['.rrrrr.', 'rroooor', 'rooyoor', 'rroooor', '.rrrrr.', '..rr...', '..r....'],
};
export function mapIconBmp(kind: MapIcon): Bmp {
  const b = new Bmp(9, 9);
  b.grid(ICON_ART[kind], IC, 1, 1);
  return b.outline(INK);
}

export interface MapPin { id: number; x: number; y: number; icon: MapIcon; name: string; found: boolean; }
/** 地圖上的地標：發現過的結構 / 洞窟 / 密室 / 地城（showAll = 有探險家地圖 → 全部，未發現的 found = false） */
export function mapPins(regions: readonly Region[], d: Discovery, showAll: boolean): MapPin[] {
  const out: MapPin[] = [];
  for (const r of regions) {
    const icon = ICON_OF[r.kind];
    if (!icon) continue;
    const found = d.isFound(r.id);
    if (!found && !showAll) continue;
    out.push({ id: r.id, x: r.ax, y: r.ay, icon, name: r.name, found });
  }
  return out;
}
export interface MapLabel { id: number; name: string; x: number; y: number; }
/** 發現過的地域 / 地層名字（x = -1：跟著畫面置中） */
export function mapLabels(regions: readonly Region[], d: Discovery): MapLabel[] {
  return regions.filter((r) => (r.cat === 'land' || r.cat === 'depth') && d.isFound(r.id))
    .map((r) => ({ id: r.id, name: r.name, x: r.ax, y: r.ay }));
}
