// fill.test.ts — gen2 填格與 Gen2Source：確定性 / 子範圍、每個非沙灘陸地地區的主坑道（P4）、礦的深度帶與逐帶宿主表（M2a Task 13 改寫 P10）、
// 靜態海水與熔岩線、出生點（P9）、表層材質、版本鎖。
import { describe, it, expect } from 'vitest';
import { Gen2Source, GEN2_VERSION, GEN2_MIN_VERSION } from './index';
import { shaftX, shaftOffset } from './caves';
import { COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND, LAVA_Y } from './profile';
import { SPAWN_X, VARIANT } from './layout';
import { Filler2 } from './fill';
import { BP_SURFACE, BP_MINOR, partsOf } from './blueprint';
import { fillCol, bytes, worldOf, loadColumns, sampleRegions, bfsReachesDepth, liquidInvariant, range, SEEDS5, srcOf } from './testUtil';
import { Column, li, type ColumnLayers } from '../column';
import { seedInt } from '../noise';
import { T, isSolidTile } from '../tiles';
import { LIQ } from '../liquidKind';
import { BIOME } from '../world';

const ORES = new Set<number>([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]);
// 泥土帶的銅的宿主（fill.ts 的 H_SOIL）
const SOIL_HOST = new Set<number>([T.DIRT, T.SNOW, T.MUD, T.SANDSTONE]);
// gen2 的深度帶 [yMin, yMax)（s = 地表；M2a Task 13：每種礦只放在舊生成器密度 ≥ 0.2‰ 的帶，oreBaseline.ts——
// 銅：泥土帶（地表 + 4 起）+ 岩層；鐵、銀：岩層 + 洞穴層；金：洞穴層 + 熔岩線下 25 格（不到 LAVA_Y）
const ORE_BAND: Record<number, (L: ColumnLayers, s: number) => [number, number]> = {
  [T.COPPER_ORE]: (L, s) => [s + 4, L.deep],
  [T.IRON_ORE]: (L) => [L.rock, L.molten],
  [T.SILVER_ORE]: (L) => [L.rock, L.molten],
  [T.GOLD_ORE]: (L) => [L.deep, Math.min(L.molten + 25, LAVA_Y)],
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

  // M2a Task 7：家鄉地城區（整區給地城）也沒有主坑道
  it('主坑道：每個非沙灘、非地城區的陸地地區都有、且從地表走得到洞穴層（P4）', () => {
    const src = new Gen2Source('shaft'); const w = worldOf(src); const s = seedInt('shaft', 'g2-shaft');
    const regs = sampleRegions(src, { home: true, perSide: 3 });
    const none = regs.filter((q) => q.variant === VARIANT.BEACH || q.variant === VARIANT.DUNGEON);
    expect(none.length).toBe(3);
    for (const r of none) expect(shaftX(s, r)).toBeNaN();
    const land = regs.filter((q) => q.variant !== VARIANT.BEACH && q.variant !== VARIANT.DUNGEON);
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

  it('礦在對的層：陸地銅 / 鐵 / 銀 / 金都出現、各在自己的深度帶（逐帶宿主表：泥土帶只有銅、熔岩帶只有熔岩線下 25 格的金）', () => {
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
          if (y < L.rock) expect(t).toBe(T.COPPER_ORE);
          if (y >= L.molten) expect(t).toBe(T.GOLD_ORE);
        }
      }
    }
    expect(seen).toEqual(ORES);
  });

  // 逐帶宿主表（M2a Task 13 裁決 A′）逐格檢查：同一欄再填一次「不放礦」的對照組（四個礦噪聲換成永遠 0 的假噪聲，其他 pass 不變），
  // 每個礦格在對照組裡的原材質必須是該（礦, 帶）的宿主。宿主照裁決寫在這裡（不讀 fill.ts 的表：放寬表時這裡要紅）
  it('礦的宿主逐格對照：泥土帶的銅原本是泥 / 雪 / 泥巴 / 砂岩，岩層 / 洞穴層的礦原本是石頭類（含淚滴材質），熔岩帶的金原本是玄武岩', () => {
    const SOIL = new Set<number>([T.DIRT, T.SNOW, T.MUD, T.SANDSTONE]);
    const STONE = new Set<number>([T.STONE, T.DEEP_STONE, T.MUD, T.SANDSTONE, T.ICE]);
    const BASALT = new Set<number>([T.BASALT]);
    const zero = { setX: (): void => {}, at: (): number => 0 };
    const n = { soil: 0, stone: 0, basalt: 0 };
    const bad: string[] = [];
    // 4 個種子的整個家鄉（四種生態、地城、礦坑…；Task 17 起沙漠的沙到地表下 13–22、雪原凍土裡有冰 / 碎石 / 石——都不是泥土帶的銅宿主，這裡會抓到放寬）
    for (const seed of ['ore-host', 's-a', 's-b', 's-c']) for (let cx = 0; cx <= 131; cx++) {
      const src = srcOf(seed);
      const real = new Filler2(seed, src.layout, src.profile, src.blueprints), bare = new Filler2(seed, src.layout, src.profile, src.blueprints);
      for (const k of ['oreCu', 'oreFe', 'oreAg', 'oreAu']) (bare as unknown as Record<string, unknown>)[k] = zero;
      const a = new Column(cx, 1200), b = new Column(cx, 1200);
      real.fill(a, cx * 32, cx * 32 + 32); bare.fill(b, cx * 32, cx * 32 + 32);
      for (let x = cx * 32; x < cx * 32 + 32; x++) {
        const I = src.profile.info(x);
        for (let y = Math.max(0, I.surface); y < 1200; y++) {
          const i = li(x, y), t = a.fg[i];
          if (!ORES.has(t)) continue;
          const was = b.fg[i], tag = `${seed} ${t}@${x},${y} was ${was}`;
          if (y < I.rock) { if (t !== T.COPPER_ORE || !SOIL.has(was)) bad.push(`dirt ${tag}`); else n.soil++; }
          else if (y < I.molten) { if (!STONE.has(was)) bad.push(`stone ${tag}`); else n.stone++; }
          else if (t !== T.GOLD_ORE || !BASALT.has(was)) bad.push(`molten ${tag}`); else n.basalt++;
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    // 三種情況都真的有檢查到
    expect(n.soil, 'dirt-band copper').toBeGreaterThan(100);
    expect(n.stone, 'rock / deep ores').toBeGreaterThan(5000);
    expect(n.basalt, 'molten-band gold').toBeGreaterThan(30);
  }, 120_000);

  it('海床、沙灘與沙漠地表的沙不會被換成礦（Task 12 裁決：沙不放礦；逐帶宿主表）', () => {
    const src = new Gen2Source('sand'), sea = src.layout.landmass(1, 1);
    // 海上的藍圖（Task 20 起有珊瑚礁 / 海底遺跡蓋在海床上）外框內的欄由結構決定材質
    const seaBps = src.blueprints.overlapping(sea.x0, sea.x1);
    let n = 0;
    for (let x = sea.x0; x < sea.x1; x += 3) {
      if (src.profile.info(x).kind !== COL_SEA || seaBps.some((b) => x >= b.x && x < b.x + b.w)) continue;
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
    // 沙漠地表的沙（地表下至少 13 格，Task 17 延續事項 1；泥土帶的銅從地表 + 4 起，沙不是宿主）：家鄉的沙漠陸地欄這幾格都不是礦
    let desert = 0;
    const cols = new Map<number, Column>();
    for (let x = 100; x < 4100; x += 5) {
      const I = src.profile.info(x);
      if (I.kind !== COL_LAND || I.biome !== BIOME.DESERT) continue;
      let col = cols.get(x >> 5);
      if (!col) { col = fillCol(src, x >> 5); cols.set(x >> 5, col); }
      for (let y = I.surface; y < Math.min(I.surface + 13, I.rock); y++) expect(ORES.has(col.fg[li(x, y)]), `x ${x} y ${y}`).toBe(false);
      desert++;
    }
    expect(desert).toBeGreaterThan(20);
  });

  // Task 17 延續事項 1（規格補齊，比照舊生成器 legacy/worldgen.ts「生態區轉換」的表層：沙漠的沙到地表下 13–22、雪原薄雪 + 凍土）：
  // 沙漠 / 雪原改成逐格規則，不再是 M1 的「沙 6 + 砂岩」「雪 5 + 泥」固定表。這裡驗結構（不重算雜訊）：
  //   沙漠：地表下 13 格內（或到岩層）全是沙；岩層以上只有沙 / 砂岩（砂岩上可以有泥土帶的銅）；沙層底（第一格不是沙）落在地表下 13–22；
  //   雪原：地表是雪；岩層以上只有雪 / 冰 / 泥 / 碎石 / 石（泥 / 雪上可以有銅）；雪薄（每欄岩層以上的雪 ≤ 14 格、平均 2–10）；
  //     凍土的四種材質（泥、冰、碎石、石）都出現。
  it('表層材質：森林草 + 泥（夾黏土脈）、沙漠深沙（地表下 13–22）+ 砂岩、雪原薄雪 + 凍土、叢林叢林草 + 泥巴；島欄沙灘沙 / 台地草', () => {
    const src = new Gen2Source('skin');
    const want: Record<number, number[]> = {
      [BIOME.FOREST]: [T.GRASS, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT],
      [BIOME.JUNGLE]: [T.JUNGLE_GRASS, T.MUD, T.MUD, T.MUD, T.MUD, T.MUD],
    };
    const DESERT_SKIN = new Set<number>([T.SAND, T.SANDSTONE]), SNOW_SKIN = new Set<number>([T.SNOW, T.ICE, T.DIRT, T.GRAVEL, T.STONE]);
    const home = src.layout.landmassAt(2100)!;
    const seen = new Set<number>();
    // 同一欄只填一次（下面逐 x 取樣，相鄰 x 落在同一欄）
    const cols = new Map<number, Column>();
    const colAt = (cx: number): Column => { let c = cols.get(cx); if (!c) cols.set(cx, c = fillCol(src, cx)); return c; };
    const ss = seedInt('skin', 'g2-shaft');
    let sampled = 0, checked = 0;
    const bad: string[] = [];
    const snow = { dirt: 0, ice: 0, gravel: 0, stone: 0, depth: [] as number[] }, desert = { sandstone: 0, cols: 0 };
    // 家鄉 + 東西各第一片大陸（M2a Task 9：家鄉的村莊整平了不少欄，只看家鄉時跳過的比例逼近 20%）
    const lands = [home, ...([1, -1] as const).map((sd) => { for (let i = 1; ; i++) { const m = src.layout.landmass(sd, i); if (m.kind === 'continent') return m; } })];
    for (const r of lands.flatMap((m) => m.regions)) {
      if (r.variant === VARIANT.BEACH) continue;
      const sx = shaftX(ss, r);
      for (let x = r.x0 + 30; x < r.x1 - 30; x += 11) {
        const I = src.profile.info(x), S = I.surface, n = want[r.biome]?.length ?? I.rock - S;
        // 入口欄與主坑道附近會挖到地表
        if (I.kind !== COL_LAND || src.isEntrance(x) || Math.abs(x - sx) <= 20) continue;
        sampled++;
        // 藍圖（湖 / 遺跡…）外框蓋到表層的欄由結構決定材質；有部件的藍圖（外圍地廳的通地表豎井，Task 18）只看蓋到這一欄的部件。
        // 小點位不算（Task 21：小點位只畫地表以上、不改地形——minor.ts；Task 21 起小點位變多，只跳過的話取樣欄會掉到 80% 以下）
        if (src.blueprints.overlapping(x, x + 1).some((b) => b.layer !== BP_MINOR && partsOf(b).some((p) => p.x <= x && x < p.x + p.w && p.y < S + n && p.y + p.h > S))) continue;
        const col = colAt(x >> 5), at = (d: number): number => col.fg[li(x, S + d)];
        // 地表 + 4 起的泥 / 雪 / 泥巴 / 砂岩可以是銅礦（逐帶宿主表，M2a Task 13）
        const ore = (d: number, t: number): boolean => d >= 4 && t === T.COPPER_ORE;
        if (want[r.biome]) {
          for (let d = 0; d < n; d++) {
            const w = want[r.biome][d], got = at(d);
            // 森林的泥裡有黏土脈（Task 17 修正 1）：當成泥比
            const asIs = (ore(d, got) && SOIL_HOST.has(w)) || (r.biome === BIOME.FOREST && w === T.DIRT && got === T.CLAY) ? w : got;
            expect(asIs, `biome ${r.biome} x ${x} d ${d}`).toBe(w);
          }
        } else if (r.biome === BIOME.DESERT) {
          let lead = 0;
          while (lead < n && at(lead) === T.SAND) lead++;
          if (lead < Math.min(13, n)) bad.push(`desert x ${x}: sand ${lead} / rock ${n}`);
          if (lead < n && lead > 22) bad.push(`desert x ${x}: sand ${lead} > 22`);
          for (let d = 0; d < n; d++) { const t = at(d); if (!DESERT_SKIN.has(t) && !ore(d, t)) bad.push(`desert x ${x} d ${d}: ${t}`); if (t === T.SANDSTONE) desert.sandstone++; }
          desert.cols++;
        } else {
          if (at(0) !== T.SNOW) bad.push(`snow x ${x}: top ${at(0)}`);
          let deep = 0;
          for (let d = 0; d < n; d++) if (at(d) === T.SNOW) deep++;
          snow.depth.push(deep);
          for (let d = 0; d < n; d++) {
            const t = at(d);
            if (!SNOW_SKIN.has(t) && !ore(d, t)) bad.push(`snow x ${x} d ${d}: ${t}`);
            if (t === T.DIRT) snow.dirt++; else if (t === T.ICE) snow.ice++; else if (t === T.GRAVEL) snow.gravel++; else if (t === T.STONE) snow.stone++;
          }
        }
        seen.add(r.biome);
        checked++;
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(seen.size).toBe(4);
    // 跳過藍圖欄不能吃掉大部分取樣：至少 80% 的取樣欄真的檢查了材質
    expect(checked, `${checked} / ${sampled}`).toBeGreaterThanOrEqual(Math.ceil(sampled * 0.8));
    // 沙漠：沙層底在岩層以上的欄有砂岩
    expect(desert.cols).toBeGreaterThan(20); expect(desert.sandstone).toBeGreaterThan(0);
    // 雪原：凍土四種材質都有、雪層薄
    const mean = snow.depth.reduce((a, b) => a + b, 0) / snow.depth.length;
    expect(snow.depth.length).toBeGreaterThan(20); expect(Math.max(...snow.depth)).toBeLessThanOrEqual(14);
    expect(mean).toBeGreaterThanOrEqual(2); expect(mean).toBeLessThanOrEqual(10);
    for (const [k, v] of Object.entries(snow)) if (k !== 'depth') expect(v, `snow ${k}`).toBeGreaterThan(0);
    let isl = 0;
    // 島上的建物（Task 20：燈塔 / 隱士屋 / 沉船島的表層藍圖）外框內的欄由結構決定材質
    const isles = src.blueprints.overlapping(src.layout.landmass(1, 1).x0, src.layout.landmass(1, 1).x1).filter((b) => b.kind === 'island');
    for (let x = src.layout.landmass(1, 1).x0; x < src.layout.landmass(1, 1).x1; x++) {
      const I = src.profile.info(x);
      if (I.kind !== COL_ISLAND || isles.some((b) => x >= b.x && x < b.x + b.w)) continue;
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
      // 地表 = 側寫的地表被表層藍圖的地面覆寫（Q4；Task 18 起荒野大陸的村莊 / 小地城 / 隱士小屋也有地面覆寫）
      const gr = src.blueprints.overlapping(x, x + 1, [BP_SURFACE]).map((b) => b.ground).filter((g) => g && x >= g.x0 && x < g.x0 + g.tops.length).at(-1);
      expect(src.surfaceAt(x)).toBe(gr ? gr.tops[x - gr.x0] : src.profile.surfaceAt(x));
      expect(src.biomeAt(x)).toBe(src.profile.biomeAt(x));
      expect(src.layersAt(x)).toEqual(src.profile.layersAt(x));
      expect(src.waterTopAt(x)).toBe(src.profile.waterTopAt(x));
    }
    expect(src.objectsIn(SPAWN_X - 80, SPAWN_X + 80)).toEqual([]);
    expect(() => src.regionAt(2_000_000)).toThrow(RangeError);
  });
});
