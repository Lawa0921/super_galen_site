// underground.test.ts — 地下背景每欄的色帶規劃：生態區主題、層與層之間的抖動過渡帶、交界抖動、菇林 / 地城覆蓋；
// 主題暗紋（近層有洞口、遠層是整片的環境色）。
import { describe, it, expect } from 'vitest';
import { FAR_RAMP, UG, UG_KEEPS, UG_FADE_STEPS, UG_SEAM, UG_TILE, smoothTops, ugAreas, ugColumnBands, ugThemeBmp, type UgColumn } from './underground';

const T = 16;
const base = (o: Partial<UgColumn> = {}): UgColumn => ({
  tx: 100, top: 200 * T, fade: 96, rockY: 300 * T, deepY: 400 * T, moltenY: 600 * T,
  viewTop: 0, viewBottom: 2000 * T, tile: T, biomeAt: () => 0, xMin: 0, xMax: 1000, areas: [], ...o,
});
const FULL = UG_KEEPS.length - 1;

describe('ugColumnBands', () => {
  it('森林：淡入（多階、標 fade）→ 土 → 岩 → 深層 → 熔岩', () => {
    const b = ugColumnBands(base());
    const solid = b.filter((q) => q.keep === FULL && !q.overlay).map((q) => q.theme);
    expect(solid).toEqual([UG.DIRT, UG.ROCK, UG.DEEP, UG.MOLTEN]);
    const fade = b.filter((q) => q.fade);
    expect(fade.length).toBe(UG_FADE_STEPS);
    expect(fade.map((q) => q.keep)).toEqual([...fade.map((q) => q.keep)].sort((x, y) => x - y));
    expect(fade[0].y0).toBe(200 * T);
    expect(fade.every((q) => q.keep < FULL)).toBe(true);
  });
  it('層與層之間沒有硬接縫：分界上下 UG_SEAM/2 內，下一層以遞增的抖動密度疊在上一層上', () => {
    const b = ugColumnBands(base());
    for (const [Y, upper, lower] of [[300 * T, UG.DIRT, UG.ROCK], [400 * T, UG.ROCK, UG.DEEP], [600 * T, UG.DEEP, UG.MOLTEN]] as const) {
      const seam = b.filter((q) => q.theme === lower && q.overlay && q.y0 >= Y - UG_SEAM / 2 && q.y1 <= Y + UG_SEAM / 2);
      expect(seam.length).toBeGreaterThanOrEqual(4);
      // 密度往下遞增
      for (let i = 1; i < seam.length; i++) { expect(seam[i].y0).toBeGreaterThanOrEqual(seam[i - 1].y0); expect(seam[i].keep).toBeGreaterThanOrEqual(seam[i - 1].keep); }
      // 上一層實心畫到分界帶底；下一層實心從分界帶底開始
      expect(b.some((q) => q.theme === upper && q.keep === FULL && q.y1 === Y + UG_SEAM / 2)).toBe(true);
      expect(b.some((q) => q.theme === lower && q.keep === FULL && !q.overlay && q.y0 === Y + UG_SEAM / 2)).toBe(true);
    }
  });
  it('沙漠 / 雪原 / 叢林：土層與岩層換成該區主題（同主題的分界不畫過渡帶）', () => {
    for (const [biome, theme] of [[1, UG.SAND], [2, UG.ICE], [3, UG.MUD]] as const) {
      const b = ugColumnBands(base({ biomeAt: () => biome }));
      const solid = b.filter((q) => q.keep === FULL && !q.overlay).map((q) => q.theme);
      expect(solid).toEqual([theme, UG.DEEP, UG.MOLTEN]);
      expect(b.filter((q) => q.fade).every((q) => q.theme === theme)).toBe(true);
    }
  });
  it('生態區交界：越靠近另一區疊得越密（多階）、遠處沒有；兩側對稱', () => {
    const biomeAt = (x: number): number => (x < 100 ? 0 : 1);
    const over = (tx: number): number[] => ugColumnBands(base({ tx, biomeAt })).filter((q) => q.overlay && q.theme === UG.SAND).map((q) => q.keep);
    expect(over(99).length).toBeGreaterThan(0);
    const levels = new Set([99, 98, 97, 96, 95].map((tx) => Math.max(...over(tx), -1)));
    expect(levels.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...over(99))).toBeGreaterThan(Math.max(...over(96), -1));
    expect(over(85)).toEqual([]);
    const b = ugColumnBands(base({ tx: 100, biomeAt }));
    expect(b.filter((q) => q.overlay && (q.theme === UG.DIRT || q.theme === UG.ROCK)).length).toBeGreaterThan(0);
  });
  it('無限世界：負 x 的欄也看得到另一區（交界不被夾在 x = 0）；世界邊界外不找', () => {
    const biomeAt = (x: number): number => (x < -100 ? 1 : 0);
    const over = (tx: number, xMin = -1e6): number[] => ugColumnBands(base({ tx, biomeAt, xMin })).filter((q) => q.overlay && q.theme === UG.SAND).map((q) => q.keep);
    expect(over(-99).length).toBeGreaterThan(0);
    expect(over(-99, -100)).toEqual([]);
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
  it('遠層：每個主題 UG_TILE×UG_TILE（256，重複得少）、完全不透明', () => {
    for (let t = 0; t < UG.COUNT; t++) {
      const b = ugThemeBmp(t, 1, 'far');
      expect(b.w).toBe(UG_TILE);
      expect(UG_TILE).toBeGreaterThanOrEqual(128);
      expect(b.px.every((v) => v >>> 24 === 255)).toBe(true);
    }
  });
  it('近層：洞穴主題有洞口（透出遠層，約 15–40%），地城磚沒有', () => {
    for (const t of [UG.DIRT, UG.ROCK, UG.DEEP, UG.MOLTEN, UG.SAND, UG.ICE, UG.MUD]) {
      const b = ugThemeBmp(t, 1);
      let open = 0;
      let bad = 0;
      for (const v of b.px) { const a = v >>> 24; if (a !== 0 && a !== 255) bad++; if (!a) open++; }
      expect(bad).toBe(0);
      expect(open / b.px.length).toBeGreaterThan(0.12);
      expect(open / b.px.length).toBeLessThan(0.4);
    }
    expect(ugThemeBmp(UG.BRICK, 1).px.every((v) => v >>> 24 === 255)).toBe(true);
  });
  it('遠層：只用該深度帶的環境色（土暖、岩紫、深層藍、熔岩紅各不相同）；flat 沒有洞口', () => {
    const cols = (t: number): Set<number> => { const o = new Set<number>(); for (const v of ugThemeBmp(t, 1, 'far').px) o.add(v & 0xffffff); return o; };
    const hexOf = (h: string): number => { const n = parseInt(h.slice(1), 16); return ((n & 255) << 16) | (n & 0xff00) | (n >> 16); };
    for (const t of [UG.DIRT, UG.ROCK, UG.DEEP, UG.MOLTEN, UG.ICE, UG.SAND]) {
      const allowed = new Set(FAR_RAMP[t].map(hexOf));
      expect([...cols(t)].every((c) => allowed.has(c))).toBe(true);
    }
    const tops = [UG.DIRT, UG.ROCK, UG.DEEP, UG.MOLTEN].map((t) => FAR_RAMP[t][2]);
    expect(new Set(tops).size).toBe(4);
    expect(ugThemeBmp(UG.DIRT, 1, 'flat').px.every((v) => v >>> 24 === 255)).toBe(true);
  });
  it('keep < 1：1×1 Bayer 挖空（不透明 / 全透明），是 keep 越大的子集；沒有 2×2 成簇', () => {
    const lo = ugThemeBmp(UG.SAND, UG_KEEPS[1], 'far'), hi = ugThemeBmp(UG.SAND, UG_KEEPS[4], 'far');
    let nlo = 0, bad = 0;
    for (let i = 0; i < lo.px.length; i++) {
      const a = lo.px[i] >>> 24;
      if (a !== 0 && a !== 255) bad++;
      if (a) { nlo++; if (hi.px[i] >>> 24 !== 255) bad++; }
    }
    expect(bad).toBe(0);
    expect(nlo / lo.px.length).toBeCloseTo(UG_KEEPS[1], 1);
    // 1×1：任何 2×2 格都不會「四格全開」或「四格全關」地成塊（keep 0.5 時）
    const mid = ugThemeBmp(UG.ROCK, 0.5, 'far');
    let blocks = 0;
    const M = UG_TILE;
    for (let y = 0; y < M; y += 2) for (let x = 0; x < M; x += 2) {
      const s = [mid.px[y * M + x], mid.px[y * M + x + 1], mid.px[(y + 1) * M + x], mid.px[(y + 1) * M + x + 1]].map((v) => (v >>> 24) > 0);
      if (s.every((q) => q === s[0])) blocks++;
    }
    expect(blocks).toBe(0);
  });
  it('土層和岩層看得出差別：用的顏色不同、岩層有更亮的灰紫岩面', () => {
    const cols = (t: number): Set<number> => { const o = new Set<number>(); for (const v of ugThemeBmp(t, 1, 'flat').px) o.add(v); return o; };
    const dirt = cols(UG.DIRT), rock = cols(UG.ROCK);
    const onlyDirt = [...dirt].filter((c) => !rock.has(c)), onlyRock = [...rock].filter((c) => !dirt.has(c));
    expect(onlyDirt.length).toBeGreaterThan(0);
    expect(onlyRock.length).toBeGreaterThan(0);
  });
  it('一塊暗紋裡不會短週期重複：左右兩半不相同（冰洞尤其）', () => {
    for (const t of [UG.ICE, UG.ROCK, UG.DIRT]) {
      const b = ugThemeBmp(t, 1, 'flat'), M = UG_TILE;
      let same = 0;
      for (let y = 0; y < M; y++) for (let x = 0; x < M / 2; x++) if (b.px[y * M + x] === b.px[y * M + x + M / 2]) same++;
      expect(same / (M * M / 2)).toBeLessThan(0.75);
    }
  });
});

describe('smoothTops（欄頂平滑：水裡 / 洞裡沒有垂直硬邊）', () => {
  const T = 16;
  // 第 100 欄起地表突然低 12 格
  const raw = (tx: number): number => (tx < 100 ? 200 : 212) * T;
  it('高低差被攤開：相鄰欄的差距遠小於原本的 12 格', () => {
    const t = smoothTops(raw, 80, 120, T);
    let worst = 0;
    for (let i = 1; i < t.length; i++) worst = Math.max(worst, Math.abs(t[i] - t[i - 1]));
    expect(worst).toBeLessThanOrEqual(4 * T);
  });
  it('最多只往上提 3 格（不會冒到地面上）；平地不變', () => {
    const t = smoothTops(raw, 80, 120, T);
    for (let i = 0; i < t.length; i++) expect(t[i]).toBeGreaterThanOrEqual(raw(80 + i) - 3 * T);
    const flat = smoothTops(() => 300 * T, 0, 10, T);
    for (const v of flat) expect(v).toBe(300 * T);
  });
});
