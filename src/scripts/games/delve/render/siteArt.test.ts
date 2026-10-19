import { describe, expect, it } from 'vitest';
import { SITE_DECOR_STYLES, SITE_ICONS, SITE_TILE_PAL, siteDecorBmp, siteTileBmp, siteWallBmp } from './siteArt';
import { BUILD_DECOR_STYLES, BUILD_ICONS, buildIcon, buildTileBmp, buildWallBmp, buildDecorBmp } from './buildArt';
import { DECOR_STYLES, decorStyle } from './autotile';
import { MAP_ICONS, mapIconBmp } from './mapModel';
import { Bmp, inPalette } from './pixel';
import { T, TILES, W } from '../engine/tiles';

function clean(b: Bmp): boolean {
  for (const v of b.px) {
    const a = v >>> 24;
    if (a === 0) continue;
    if (a !== 255 || !inPalette(Bmp.unpack(v))) return false;
  }
  return true;
}
const opaque = (b: Bmp): number => b.px.reduce((n, v) => n + (v >>> 24 ? 1 : 0), 0);
const NEW_DECOR = [T.RAIL, T.ORE_CART, T.QUEST_BOARD, T.FLAGPOLE, T.DWARF_FORGE, T.BRAZIER, T.BARREL,
  T.CAIRN, T.RELIC_PACK, T.GUARDIAN_STATUE, T.GEODE, T.SPORE_TOTEM, T.HONEY_JAR];

describe('site art（村落 / 矮人地廳 / 地標）', () => {
  it('新實心方塊：3 個變體都是滿格、只用色票、彼此不同，而且接到 buildArt', () => {
    for (const id of [T.THATCH, T.TIMBER, T.DWARF_BRICK]) {
      const v = [0, 1, 2].map((k) => siteTileBmp(id, k)!);
      for (const b of v) { expect(clean(b)).toBe(true); expect(opaque(b)).toBe(256); }
      expect(v[0].px.join()).not.toBe(v[1].px.join());
      expect(buildTileBmp(id, 0)!.px.join()).toBe(v[0].px.join());
      expect(SITE_TILE_PAL[id].length).toBeGreaterThanOrEqual(7);
    }
  });
  it('鑿刻石牆：不透明、色票內，和一般石磚牆看起來不同', () => {
    for (let v = 0; v < 3; v++) {
      const w = siteWallBmp(W.DWARF_WALL, v)!;
      expect(clean(w.b)).toBe(true);
      expect(opaque(w.b)).toBe(256);
      expect(buildWallBmp(W.DWARF_WALL, v)!.b.px.join()).toBe(w.b.px.join());
    }
    expect(siteWallBmp(W.DWARF_WALL, 0)!.b.px.join()).not.toBe(buildWallBmp(W.STONE_BRICK_WALL, 0)!.b.px.join());
  });
  it('每個新裝飾 tile 的每個 style 都畫得出來，而且登記進 DECOR_STYLES / BUILD_DECOR_STYLES', () => {
    for (const id of NEW_DECOR) {
      const n = SITE_DECOR_STYLES[id];
      expect(n, `styles ${id}`).toBeGreaterThan(0);
      expect(DECOR_STYLES[id]).toBe(n);
      expect(BUILD_DECOR_STYLES[id]).toBe(n);
      for (let s = 0; s < n; s++) {
        const b = siteDecorBmp(id, s)!;
        expect(clean(b), `${id}/${s}`).toBe(true);
        expect(opaque(b), `${id}/${s}`).toBeGreaterThan(20);
        expect(buildDecorBmp(id, s)!.px.join()).toBe(b.px.join());
      }
    }
  });
  it('每個新 tile 都有美術（非實心的都有 decor style，實心的有材質）', () => {
    for (const t of TILES) {
      if (t.id < T.THATCH) continue;
      if (t.solid) expect(siteTileBmp(t.id, 0), t.key).not.toBeNull();
      else expect(DECOR_STYLES[t.id], t.key).toBeGreaterThan(0);
    }
  });
  it('發光的地標 / 火源畫得夠亮（有很亮的像素）', () => {
    const bright = (b: Bmp): number => b.px.reduce((n, v) => { if (!(v >>> 24)) return n; const [r, g, bl] = Bmp.unpack(v); return n + (r + g + bl > 600 ? 1 : 0); }, 0);
    for (const id of [T.GEODE, T.DWARF_FORGE, T.RELIC_PACK, T.SPORE_TOTEM, T.BRAZIER]) expect(bright(siteDecorBmp(id, 0)!), `${id}`).toBeGreaterThan(2);
  });
  it('旗桿：上面接旗桿 → 桿身（0），頂端 → 三角旗（1）；兩種畫法不同', () => {
    const n = (map: Record<string, number>) => (dx: number, dy: number): number => map[`${dx},${dy}`] ?? T.AIR;
    expect(decorStyle(T.FLAGPOLE, 3, 3, n({ '0,-1': T.FLAGPOLE }))).toBe(0);
    expect(decorStyle(T.FLAGPOLE, 3, 3, n({ '0,1': T.FLAGPOLE }))).toBe(1);
    expect(opaque(siteDecorBmp(T.FLAGPOLE, 1)!)).toBeGreaterThan(opaque(siteDecorBmp(T.FLAGPOLE, 0)!) + 15);
  });
  it('熔爐 / 火盆的火形有 3 種、彼此不同', () => {
    for (const id of [T.DWARF_FORGE, T.BRAZIER]) {
      const a = [0, 1, 2].map((s) => siteDecorBmp(id, s)!.px.join());
      expect(new Set(a).size).toBeGreaterThan(1);
    }
  });
  it('新道具都有圖示（方塊 / 牆 / 家具）', () => {
    for (const it of SITE_ICONS) {
      expect(BUILD_ICONS).toContain(it);
      const b = buildIcon(it)!;
      expect(b, it).not.toBeNull();
      expect(clean(b)).toBe(true);
      expect(opaque(b), it).toBeGreaterThan(20);
    }
  });
  it('地圖圖示：村落 / 矮人地廳 / 地標', () => {
    for (const k of ['village', 'dwarf_hall', 'landmark'] as const) {
      expect(MAP_ICONS).toContain(k);
      expect(opaque(mapIconBmp(k))).toBeGreaterThan(12);
    }
  });
});
