// fill.test.ts — gen2 填格與 Gen2Source：確定性 / 子範圍、每個非沙灘陸地地區的主坑道（P4）、礦的深度帶與只換石頭（P10）、
// 靜態海水與熔岩線、出生點（P9）、表層材質、版本鎖。
import { describe, it, expect } from 'vitest';
import { Gen2Source, GEN2_VERSION, GEN2_MIN_VERSION } from './index';
import { shaftX, shaftOffset } from './caves';
import { COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND, LAVA_Y } from './profile';
import { SPAWN_X, VARIANT } from './layout';
import { fillCol, bytes, worldOf, loadColumns, sampleRegions, bfsReachesDepth, liquidInvariant, range, SEEDS5 } from './testUtil';
import { Column, li, type ColumnLayers } from '../column';
import { seedInt } from '../noise';
import { T, isSolidTile } from '../tiles';
import { LIQ } from '../liquidKind';
import { BIOME } from '../world';

const ORES = new Set<number>([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]);
const mid = (L: ColumnLayers): number => L.rock + ((L.deep - L.rock) >> 1);
// v1 的深度帶 [yMin, yMax)（s = 地表）
const ORE_BAND: Record<number, (L: ColumnLayers, s: number) => [number, number]> = {
  [T.COPPER_ORE]: (L, s) => [s + 1, mid(L)],
  [T.IRON_ORE]: (L) => [L.rock, L.deep],
  [T.SILVER_ORE]: (L) => [mid(L), L.molten],
  [T.GOLD_ORE]: (L) => [L.deep, 1200],
};
const CXS = [...range(-400, -360), ...range(60, 71), ...range(131, 151)];
// 第一個不同的位元組（相同 = -1）
function diffAt(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) return -2;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

// 整欄填格很重（全套平行跑時單一測試可超過 5 秒），這個檔的測試一律 30 秒
describe('gen2 fill / Gen2Source', { timeout: 30_000 }, () => {
  it('版本常數', () => {
    expect(GEN2_VERSION).toBe(0);
    expect(GEN2_MIN_VERSION).toBe(0);
    expect(new Gen2Source('v').version).toBe(GEN2_VERSION);
  });

  it('確定性與順序無關：正序 / 倒序 / 另一實例位元組相同；子範圍分段填 = 整欄', () => {
    const a = new Gen2Source('det'), b = new Gen2Source('det');
    const fwd = CXS.map((cx) => bytes(fillCol(a, cx)));
    const rev = [...CXS].reverse().map((cx) => bytes(fillCol(b, cx))).reverse();
    for (let k = 0; k < CXS.length; k++) expect(diffAt(rev[k], fwd[k]), `cx ${CXS[k]}`).toBe(-1);
    for (const cx of [-380, 65, 140]) {
      const parts = new Column(cx, 1200);
      a.fill(parts, cx * 32, cx * 32 + 11); a.fill(parts, cx * 32 + 11, cx * 32 + 32);
      expect(diffAt(bytes(parts), bytes(fillCol(a, cx))), `cx ${cx}`).toBe(-1);
    }
    expect(diffAt(bytes(fillCol(new Gen2Source('other'), 65)), fwd[CXS.indexOf(65)])).toBeGreaterThanOrEqual(0);
  });

  it('主坑道：每個非沙灘的陸地地區都有、且從地表走得到洞穴層（P4）', () => {
    const src = new Gen2Source('shaft'); const w = worldOf(src); const s = seedInt('shaft', 'g2-shaft');
    const regs = sampleRegions(src, { home: true, perSide: 3 });
    const beaches = regs.filter((q) => q.variant === VARIANT.BEACH);
    expect(beaches.length).toBe(2);
    for (const r of beaches) expect(shaftX(s, r)).toBeNaN();
    const land = regs.filter((q) => q.variant !== VARIANT.BEACH);
    expect(land.length).toBeGreaterThanOrEqual(5 + 2 * 3 * 2);
    for (const r of land) {
      const sx = shaftX(s, r), m = Math.min(120, Math.floor((r.x1 - r.x0) / 4));
      expect(Number.isFinite(sx)).toBe(true); expect(sx).toBeGreaterThanOrEqual(r.x0 + m); expect(sx).toBeLessThan(r.x1 - m);
      expect(Math.abs(sx - SPAWN_X)).toBeGreaterThanOrEqual(100);
      loadColumns(w, sx - 20, sx + 20);
      expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20), `region ${r.side}:${r.landmass}:${r.index}`).toBe(true);
      for (let y = src.surfaceAt(sx); y < src.layersAt(sx).deep; y++) {
        expect(Math.abs(shaftOffset(s, r, y + 1) - shaftOffset(s, r, y))).toBeLessThanOrEqual(1);
        expect(Math.abs(shaftOffset(s, r, y))).toBeLessThanOrEqual(12);
      }
    }
    // 海與島地區沒有坑道
    const sea = src.layout.landmass(1, 1);
    for (const r of sea.regions) expect(shaftX(s, r)).toBeNaN();
  });

  it('礦在對的層：陸地銅 / 鐵 / 銀 / 金都出現、各在自己的深度帶，而且只換石頭類（不在泥土層）', () => {
    const src = new Gen2Source('ore'), seen = new Set<number>();
    for (let cx = 160; cx < 230; cx += 7) {
      const col = fillCol(src, cx);
      for (let x = cx * 32; x < cx * 32 + 32; x++) {
        const L = src.layersAt(x), s = src.surfaceAt(x);
        for (let y = 0; y < 1200; y++) {
          const t = col.fg[li(x, y)];
          if (!ORES.has(t)) continue;
          seen.add(t);
          const [y0, y1] = ORE_BAND[t](L, s);
          expect(y).toBeGreaterThanOrEqual(y0); expect(y).toBeLessThan(y1);
          expect(y).toBeGreaterThanOrEqual(L.rock);
          expect(y).toBeLessThan(L.molten);
        }
      }
    }
    expect(seen).toEqual(ORES);
  });

  it('海床與沙灘的沙不會被換成礦（P10）', () => {
    const src = new Gen2Source('sand'), sea = src.layout.landmass(1, 1);
    let n = 0;
    for (let x = sea.x0; x < sea.x1; x += 3) {
      if (src.profile.info(x).kind !== COL_SEA) continue;
      const col = fillCol(src, x >> 5), s = src.surfaceAt(x);
      for (let y = s; y < s + 3; y++) expect(col.fg[li(x, y)]).toBe(T.SAND);
      n++;
    }
    expect(n).toBeGreaterThan(100);
    // 沙灘：家鄉東端 70 格的沙灘欄，地表下 4 格是沙
    for (let x = 4130; x < 4200; x += 2) {
      const I = src.profile.info(x);
      if (I.kind !== COL_BEACH) continue;
      const col = fillCol(src, x >> 5);
      for (let y = I.surface; y < I.surface + 4; y++) expect(col.fg[li(x, y)], `x ${x} y ${y}`).toBe(T.SAND);
    }
  });

  it('表層材質：森林草 + 泥、沙漠沙 6 + 砂岩、雪 5、叢林叢林草 + 泥巴；島欄沙灘沙 / 台地草', () => {
    const src = new Gen2Source('skin');
    const want: Record<number, number[]> = {
      [BIOME.FOREST]: [T.GRASS, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT],
      [BIOME.DESERT]: [T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SANDSTONE],
      [BIOME.SNOW]: [T.SNOW, T.SNOW, T.SNOW, T.SNOW, T.SNOW, T.DIRT],
      [BIOME.JUNGLE]: [T.JUNGLE_GRASS, T.MUD, T.MUD, T.MUD, T.MUD, T.MUD],
    };
    const home = src.layout.landmassAt(2100)!;
    const seen = new Set<number>();
    // 同一欄只填一次（下面逐 x 取樣，相鄰 x 落在同一欄）
    const cols = new Map<number, Column>();
    const colAt = (cx: number): Column => { let c = cols.get(cx); if (!c) cols.set(cx, c = fillCol(src, cx)); return c; };
    const ss = seedInt('skin', 'g2-shaft');
    for (const r of home.regions) {
      if (r.variant === VARIANT.BEACH) continue;
      const sx = shaftX(ss, r);
      for (let x = r.x0 + 30; x < r.x1 - 30; x += 11) {
        const I = src.profile.info(x);
        // 入口欄與主坑道附近會挖到地表
        if (I.kind !== COL_LAND || src.isEntrance(x) || Math.abs(x - sx) <= 20) continue;
        // 藍圖（湖 / 遺跡…）外框蓋到表層的欄由結構決定材質
        if (src.blueprints.overlapping(x, x + 1).some((b) => b.y < I.surface + want[r.biome].length && b.y + b.h > I.surface)) continue;
        const col = colAt(x >> 5);
        for (let d = 0; d < want[r.biome].length; d++) expect(col.fg[li(x, I.surface + d)], `biome ${r.biome} x ${x} d ${d}`).toBe(want[r.biome][d]);
        seen.add(r.biome);
      }
    }
    expect(seen.size).toBe(4);
    let isl = 0;
    for (let x = src.layout.landmass(1, 1).x0; x < src.layout.landmass(1, 1).x1; x++) {
      const I = src.profile.info(x);
      if (I.kind !== COL_ISLAND) continue;
      const col = colAt(x >> 5);
      // 島的表層歸 Task 11（P12，詳見 sea.test.ts）：離水 4 格內沙灘沙、其餘草 + 泥；地表以上只有空氣與樹
      const e = Math.min(x - I.region.x0, I.region.x1 - 1 - x);
      if (e < 4) for (let y = I.surface; y < I.surface + 4; y++) expect(col.fg[li(x, y)]).toBe(T.SAND);
      else expect([col.fg[li(x, I.surface)], col.fg[li(x, I.surface + 1)]]).toEqual([T.GRASS, T.DIRT]);
      for (let y = 0; y < I.surface; y++) expect([T.AIR, T.WOOD, T.LEAVES]).toContain(col.fg[li(x, y)]);
      isl++;
    }
    expect(isl).toBeGreaterThan(0);
  });

  it('靜態液體不變量：海與熔岩格的下方與左右都是實心或液體（水 / 熔岩各自滿格）', () => {
    const src = new Gen2Source('liq'), w = worldOf(src);
    loadColumns(w, 4150, 4200 + 1400);
    expect(liquidInvariant(w, 4150, 4200 + 1400)).toEqual([]);
    // 確實有海：第一道東海每欄水面 = waterTop、水到海床前一格
    let water = 0;
    for (let x = 4200; x < 4600; x += 5) {
      const top = src.waterTopAt(x);
      if (top === null) continue;
      for (let y = top; y < src.surfaceAt(x); y++) { expect(w.getLiquidType(x, y)).toBe(LIQ.WATER); water++; }
      expect(w.getLiquid(x, top - 1)).toBe(0);
    }
    expect(water).toBeGreaterThan(1000);
  });

  it('熔岩表面在 LAVA_Y：LAVA_Y 以下沒有空氣、LAVA_Y 以上的熔岩只在熔岩池（Task 10）外框內（不會有階梯）', () => {
    const src = new Gen2Source('lava');
    const pools = src.blueprints.overlapping(-25_000, 25_000).filter((b) => b.kind === 'lava_pool');
    const inPool = (x: number, y: number): boolean => pools.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
    let lava = 0, pooled = 0;
    for (const cx of [20, 70, 140, 190, -50, pools[0].x >> 5]) {
      const col = fillCol(src, cx);
      for (let x = cx * 32; x < cx * 32 + 32; x++) for (let y = 0; y < 1200; y++) {
        const i = li(x, y);
        if (y >= LAVA_Y) {
          expect(col.fg[i] !== T.AIR || col.liquidType[i] === LIQ.LAVA).toBe(true);
          if (col.liquidType[i] === LIQ.LAVA) lava++;
        } else if (col.liquidType[i] === LIQ.LAVA) { expect(inPool(x, y), `${x},${y}`).toBe(true); pooled++; }
      }
    }
    expect(lava).toBeGreaterThan(0); expect(pooled).toBeGreaterThan(0);
  });

  it('出生點站得住：腳下實心、上方 2 格空氣、±3 沒有樹幹（P9）', () => {
    for (const seed of SEEDS5) {
      const src = new Gen2Source(seed), s = src.surfaceAt(SPAWN_X), col = fillCol(src, SPAWN_X >> 5);
      expect(isSolidTile(col.fg[li(SPAWN_X, s)])).toBe(true);
      expect(col.fg[li(SPAWN_X, s - 1)]).toBe(T.AIR); expect(col.fg[li(SPAWN_X, s - 2)]).toBe(T.AIR);
      for (let x = SPAWN_X - 3; x <= SPAWN_X + 3; x++) for (let y = s - 12; y < s; y++) expect(col.fg[li(x, y)]).not.toBe(T.WOOD);
    }
  });

  it('樹與仙人掌只長在陸地欄（家鄉有樹）', () => {
    const src = new Gen2Source('trees');
    let trunks = 0;
    for (let cx = 0; cx < 132; cx++) {
      const col = fillCol(src, cx);
      for (let x = cx * 32; x < cx * 32 + 32; x++) {
        if (x >= 4200) continue;
        for (let y = 0; y < 1200; y++) {
          const t = col.fg[li(x, y)];
          if (t !== T.WOOD && t !== T.CACTUS) continue;
          expect(src.profile.info(x).kind, `x ${x}`).toBe(COL_LAND);
          if (t === T.WOOD) trunks++;
        }
      }
    }
    expect(trunks).toBeGreaterThan(100);
  });

  it('版本鎖：fill 過的地塊被鎖成 ver 0；recordLocks: false 不鎖', () => {
    const src = new Gen2Source('lk'); fillCol(src, 140);
    expect(src.locks.get(1, 1)).toEqual({ ver: 0, culture: null }); expect(src.locks.get(0, 0)).toBeUndefined();
    fillCol(src, 65);
    expect(src.locks.get(0, 0)).toEqual({ ver: 0, culture: null });
    const rep = new Gen2Source('lk', { recordLocks: false }); fillCol(rep, 140); expect(rep.locks.toJSON()).toEqual([]);
  });

  it('regionAt / 欄資訊與 profile 一致；gen2 範圍外丟 RangeError', () => {
    const src = new Gen2Source('api');
    for (const x of [-30000, -12000, 0, 2100, 4199, 4300, 9000]) {
      expect(src.regionAt(x)).toBe(src.profile.regionAt(x));
      expect(src.surfaceAt(x)).toBe(src.profile.surfaceAt(x));
      expect(src.biomeAt(x)).toBe(src.profile.biomeAt(x));
      expect(src.layersAt(x)).toEqual(src.profile.layersAt(x));
      expect(src.waterTopAt(x)).toBe(src.profile.waterTopAt(x));
    }
    expect(src.objectsIn(SPAWN_X - 80, SPAWN_X + 80)).toEqual([]);
    expect(() => src.regionAt(2_000_000)).toThrow(RangeError);
  });
});
