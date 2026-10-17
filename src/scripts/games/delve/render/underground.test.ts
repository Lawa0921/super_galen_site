// underground.test.ts — 地下背景每欄的色帶規劃：生態區主題、交界抖動、菇林 / 地城覆蓋。
import { describe, it, expect } from 'vitest';
import { UG, UG_KEEPS, ugAreas, ugColumnBands, ugThemeBmp, type UgColumn } from './underground';

const T = 16;
const base = (o: Partial<UgColumn> = {}): UgColumn => ({
  tx: 100, top: 200 * T, fade: 64, rockY: 300 * T, deepY: 400 * T, moltenY: 600 * T,
  viewTop: 0, viewBottom: 2000 * T, tile: T, biomeAt: () => 0, width: 1000, areas: [], ...o,
});
const FULL = UG_KEEPS.length - 1;

describe('ugColumnBands', () => {
  it('森林：淡入 4 階 → 土 → 岩 → 深層 → 熔岩', () => {
    const b = ugColumnBands(base());
    const solid = b.filter((q) => q.keep === FULL).map((q) => q.theme);
    expect(solid).toEqual([UG.DIRT, UG.ROCK, UG.DEEP, UG.MOLTEN]);
    const fade = b.filter((q) => q.keep < FULL);
    expect(fade.map((q) => q.keep)).toEqual([0, 1, 2, 3]);
    expect(fade[0].y0).toBe(200 * T);
    expect(b.find((q) => q.theme === UG.DEEP)!.y0).toBe(400 * T);
  });
  it('沙漠 / 雪原 / 叢林：土層與岩層換成該區主題（深層以下不變）', () => {
    for (const [biome, theme] of [[1, UG.SAND], [2, UG.ICE], [3, UG.MUD]] as const) {
      const b = ugColumnBands(base({ biomeAt: () => biome }));
      const solid = b.filter((q) => q.keep === FULL).map((q) => q.theme);
      expect(solid).toEqual([theme, theme, UG.DEEP, UG.MOLTEN]);
      expect(b.filter((q) => q.keep < FULL).every((q) => q.theme === theme)).toBe(true);
    }
  });
  it('生態區交界：靠近另一區的欄疊上另一區主題的抖動層，越近越密；遠處沒有', () => {
    const biomeAt = (x: number): number => (x < 100 ? 0 : 1);
    const over = (tx: number): number[] => ugColumnBands(base({ tx, biomeAt })).filter((q) => q.overlay).map((q) => q.keep);
    expect(over(99).length).toBeGreaterThan(0);
    expect(Math.max(...over(99))).toBeGreaterThan(Math.max(...over(96), -1));
    expect(over(90)).toEqual([]);
    // 疊的是鄰區主題
    const b = ugColumnBands(base({ tx: 99, biomeAt }));
    expect(b.filter((q) => q.overlay).every((q) => q.theme === UG.SAND)).toBe(true);
    // 兩側對稱：100 欄疊森林
    expect(ugColumnBands(base({ tx: 100, biomeAt })).filter((q) => q.overlay).every((q) => q.theme === UG.DIRT || q.theme === UG.ROCK)).toBe(true);
  });
  it('菇林（橢圓）覆蓋：中心欄整段實心 + 上下抖動邊；外接框角落外面沒有', () => {
    const areas = ugAreas([{ kind: 'mushroom_biome', x: 80, y: 420, w: 40, h: 30 }, { kind: 'cabin', x: 0, y: 0, w: 5, h: 5 }]);
    expect(areas.length).toBe(1);
    const mid = ugColumnBands(base({ tx: 100, areas })).filter((q) => q.theme === UG.SPORE);
    const solid = mid.find((q) => q.keep === FULL)!;
    expect(solid.y0).toBeLessThanOrEqual(422 * T);
    expect(solid.y1).toBeGreaterThanOrEqual(448 * T);
    expect(mid.some((q) => q.keep < FULL)).toBe(true);
    expect(ugColumnBands(base({ tx: 70, areas })).some((q) => q.theme === UG.SPORE)).toBe(false);
  });
  it('地城（矩形）覆蓋：磚紋整段 + 左右外緣幾欄抖動', () => {
    const areas = ugAreas([{ kind: 'dungeon', x: 50, y: 250, w: 60, h: 100 }]);
    const inside = ugColumnBands(base({ tx: 80, areas })).filter((q) => q.theme === UG.BRICK);
    expect(inside.some((q) => q.keep === FULL && q.y0 <= 251 * T && q.y1 >= 349 * T)).toBe(true);
    const edge = ugColumnBands(base({ tx: 48, areas })).filter((q) => q.theme === UG.BRICK);
    expect(edge.length).toBeGreaterThan(0);
    expect(edge.every((q) => q.keep < FULL)).toBe(true);
  });
  it('只回傳畫面內的部分', () => {
    const b = ugColumnBands(base({ viewTop: 310 * T, viewBottom: 320 * T }));
    expect(b.length).toBeGreaterThan(0);
    for (const q of b) { expect(q.y0).toBeGreaterThanOrEqual(310 * T); expect(q.y1).toBeLessThanOrEqual(320 * T); expect(q.y1).toBeGreaterThan(q.y0); }
  });
});

describe('ugThemeBmp', () => {
  it('每個主題：64×64、完全不透明（keep = 1）', () => {
    for (let t = 0; t < UG.COUNT; t++) {
      const b = ugThemeBmp(t, 1);
      expect(b.w).toBe(64);
      for (const v of b.px) expect(v >>> 24).toBe(255);
    }
  });
  it('keep < 1：Bayer 挖空（像素只有不透明 / 全透明），而且是 keep 越大的子集', () => {
    const lo = ugThemeBmp(UG.SAND, 0.2), hi = ugThemeBmp(UG.SAND, 0.6);
    let nlo = 0;
    for (let i = 0; i < lo.px.length; i++) {
      const a = lo.px[i] >>> 24;
      expect(a === 0 || a === 255).toBe(true);
      if (a) { nlo++; expect(hi.px[i] >>> 24).toBe(255); }
    }
    expect(nlo / lo.px.length).toBeCloseTo(0.2, 1);
  });
});
