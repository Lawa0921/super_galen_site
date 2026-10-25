// features.test.ts — gen2 填格新特徵（M2a Task 12，spec §4.4「花崗岩 / 大理石、熔岩帶」與地表 / 地下裝飾）：
// 3 個種子的家鄉 [0, 4200) 逐欄 fillCol，統計在 beforeAll 一次算完（每個種子 134 欄，hook 預設 10 s 不夠，Q18），之後每個 it 只讀統計。
// 控制者裁決（Task 12）：裝飾與熔岩帶換材質不寫進任何藍圖部件內（部件外交回天然地形）；熔岩帶的額外挖空擋在 solid 部件外（同洞穴）。
import { describe, it, expect, beforeAll } from 'vitest';
import { Gen2Source } from './index';
import { COL_LAND, LAVA_Y } from './profile';
import { SPAWN_X } from './layout';
import { BP_DEEP, KEEP, emptyObjects, partsOf, type Blueprint, type BpBox } from './bpcore';
import { Filler2 } from './fill';
import type { BlueprintIndex } from './blueprint';
import { fillCol, bytes, FILL_DECOR } from './testUtil';
import { Column, li } from '../column';
import { T, W, SOLID_LUT, floorOk, ceilOk } from '../tiles';
import { BlobNoise, ColNoise, BLOB_CELL } from '../genPrims';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { BIOME } from '../world';

const SEEDS3 = ['ft-a', 'ft-b', 'ft-c'];
const HOME_X1 = 4200, CX1 = 132;
type Band = 'dirt' | 'rock' | 'deep' | 'molten';
const BANDS: readonly Band[] = ['dirt', 'rock', 'deep', 'molten'];
// 地板類 / 天花板類 / 蛛網（上方或左右實心）
const FLOOR_DECOR = new Set<number>([T.POT, T.FLOWER, T.TALL_GRASS, T.MUSHROOM, T.SMALL_ROCK, T.BUSH, T.PUMPKIN, T.DEAD_BUSH, T.SNOW_SHRUB, T.FERN, T.GLOW_MUSHROOM, T.STALAGMITE]);
const CEIL_DECOR = new Set<number>([T.STALACTITE, T.VINE]);
const DECOR = FILL_DECOR;
// 熔岩帶換的材質（M1 的 fill 不產生這些）
const MOLTEN_T = new Set<number>([T.ASH, T.OBSIDIAN, T.MAGMA_ROCK]);
const solidAt = (t: number): boolean => SOLID_LUT[t] === 1;
// 地表裝飾的機率（brief，同舊生成器）：地面種類 → 各裝飾的機率
type Ground = 'grass' | 'desert' | 'snow' | 'jungle';
const GROUNDS: readonly Ground[] = ['grass', 'desert', 'snow', 'jungle'];
const SURFACE_P: Readonly<Record<Ground, readonly (readonly [number, number])[]>> = {
  grass: [[T.TALL_GRASS, 0.24], [T.FLOWER, 0.08], [T.MUSHROOM, 0.02], [T.SMALL_ROCK, 0.015], [T.BUSH, 0.035], [T.PUMPKIN, 0.007]],
  desert: [[T.DEAD_BUSH, 0.12], [T.SMALL_ROCK, 0.02]],
  snow: [[T.SNOW_SHRUB, 0.07], [T.SMALL_ROCK, 0.015]],
  jungle: [[T.FERN, 0.24], [T.TALL_GRASS, 0.1], [T.FLOWER, 0.04], [T.MUSHROOM, 0.01], [T.BUSH, 0.05]],
};
const groundOf = (g: number, biome: number): Ground | null =>
  g === T.GRASS ? 'grass' : g === T.SAND && biome === BIOME.DESERT ? 'desert' : g === T.SNOW ? 'snow' : g === T.JUNGLE_GRASS ? 'jungle' : null;

interface Stats {
  count(t: number): number;
  // fill 自己放的（不是藍圖寫的格）
  fillCount(t: number): number;
  countBand(t: number, b: Band): number;
  airShare(b: 'molten'): number;
  lavaCells(): number;
  badSupport(): string[];
  // 藍圖部件內、藍圖沒寫的格出現裝飾 / 熔岩帶材質（應為空）；檢查過的部件內格數
  partsLeak: string[]; partsChecked: number;
  // 藍圖寫了 fg 的格，最終 fg ≠ 寫入值（應為空；寫入空氣的格之後可能長樹幹 / 樹葉 / 仙人掌，那是 fill 的樹，不算）；檢查過的格數
  writtenBad: string[]; writtenChecked: number;
  // 地下叢林（修正 1）：家鄉叢林地區的總寬、y ∈ [rock, molten) 的泥巴（不含藍圖寫的格，淚滴可以伸出地區外，所以全家鄉都算）
  jungleWidth: number; jungleMud: number;
  // 沙漠 / 雪原淚滴（修正 2）：家鄉沙漠 / 雪原地區的總寬、y ∈ [rock, molten) 的砂岩 / 冰（不含藍圖寫的格）
  desertWidth: number; desertSandstone: number; snowWidth: number; snowIce: number;
  // 靜態液體：液體格要滿格、不在實心格裡、下方與左右是實心或同種滿格液體（應為空）
  liquidBad: string[];
  // 地表：可以放裝飾的格（陸地欄、地表上一格是空氣或裝飾、不在部件內、沒有液體、不在出生點 ±3）依地面種類；各地面種類上各裝飾的格數
  surfaceSites: Record<Ground, number>; surfaceDecor: Record<Ground, Float64Array>;
}

// 第 x 欄落在盒子們裡的列段 [y0, y1)
const rowsAt = (boxes: readonly BpBox[], x: number): number[] => {
  const out: number[] = [];
  for (const b of boxes) if (x >= b.x && x < b.x + b.w) out.push(b.y, b.y + b.h);
  return out;
};
const inRows = (r: readonly number[], y: number): boolean => { for (let k = 0; k < r.length; k += 2) if (y >= r[k] && y < r[k + 1]) return true; return false; };

function homeStats(seed: string): Stats {
  const src = new Gen2Source(seed), H = 1200;
  const cnt = new Float64Array(256), fillCnt = new Float64Array(256), band = BANDS.map(() => new Float64Array(256));
  let mAir = 0, mAll = 0, lava = 0, partsChecked = 0, writtenChecked = 0, jungleMud = 0, desertSandstone = 0, snowIce = 0;
  const bad: string[] = [], partsLeak: string[] = [], writtenBad: string[] = [], liquidBad: string[] = [];
  const widthOf = (b: number): number => src.layout.landmassAt(2100)!.regions.filter((r) => r.biome === b).reduce((a, r) => a + r.x1 - r.x0, 0);
  const jungleWidth = widthOf(BIOME.JUNGLE), desertWidth = widthOf(BIOME.DESERT), snowWidth = widthOf(BIOME.SNOW);
  const surfaceSites: Record<Ground, number> = { grass: 0, desert: 0, snow: 0, jungle: 0 };
  const surfaceDecor = Object.fromEntries(GROUNDS.map((g) => [g, new Float64Array(256)])) as Record<Ground, Float64Array>;
  // 只留 cx − 1..cx + 1 三欄（蛛網看左右）
  const cols = new Map<number, Column>();
  const colOf = (cx: number): Column => { let c = cols.get(cx); if (!c) { c = fillCol(src, cx); cols.set(cx, c); } return c; };
  const fgAt = (x: number, y: number): number => (y < 0 || y >= H ? T.STONE : colOf(x >> 5).fg[li(x, y)]);
  // (x, y) 撐得住 type 的液體：世界底下、實心、或同種滿格液體
  const holds = (x: number, y: number, type: number): boolean => {
    if (y >= H || solidAt(fgAt(x, y))) return true;
    const q = colOf(x >> 5), j = li(x, y);
    return q.liquid[j] === LIQ_MAX && q.liquidType[j] === type;
  };
  for (let cx = 0; cx < CX1; cx++) {
    cols.delete(cx - 2);
    const c = colOf(cx), x0 = cx * 32, x1 = Math.min(HOME_X1, x0 + 32);
    const bps: Blueprint[] = src.blueprints.overlapping(x0, x0 + 32);
    // 藍圖寫了 fg 的格（li 索引 → 最後寫入的值；overlapping 的順序 = stamp 的順序）
    const written = new Map<number, number>();
    for (const b of bps) for (let k = 0; k < b.cells.length; k += 5) {
      const x = b.cells[k], y = b.cells[k + 1];
      if (x >= x0 && x < x0 + 32 && y >= 0 && y < H && b.cells[k + 2] !== KEEP) written.set(li(x, y), b.cells[k + 2]);
    }
    const parts = bps.flatMap((b) => [...partsOf(b)]);
    for (let x = x0; x < x1; x++) {
      const I = src.profile.info(x), pr = rowsAt(parts, x);
      const gk = I.kind === COL_LAND && Math.abs(x - SPAWN_X) > 3 ? groundOf(c.fg[li(x, I.surface)], I.biome) : null;
      if (gk) {
        const a = li(x, I.surface - 1), t = c.fg[a];
        if ((t === T.AIR || DECOR.has(t)) && c.liquid[a] === 0 && !inRows(pr, I.surface - 1)) { surfaceSites[gk]++; surfaceDecor[gk][t]++; }
      }
      for (let y = 0; y < H; y++) {
        const i = li(x, y), t = c.fg[i];
        cnt[t]++;
        const wv = written.get(i);
        if (wv === undefined) fillCnt[t]++;
        else {
          writtenChecked++;
          if (t !== wv && !(wv === T.AIR && (t === T.WOOD || t === T.LEAVES || t === T.CACTUS))) writtenBad.push(`${t}≠${wv}@${x},${y}`);
        }
        if (y >= I.surface) band[y < I.rock ? 0 : y < I.deep ? 1 : y < I.molten ? 2 : 3][t]++;
        if (y >= I.molten && y < LAVA_Y) { mAll++; if (t === T.AIR && c.liquid[i] === 0) mAir++; }
        if (c.liquid[i] > 0 && c.liquidType[i] === LIQ.LAVA) lava++;
        if (c.liquid[i] > 0) {
          const ty = c.liquidType[i];
          if (c.liquid[i] !== LIQ_MAX || solidAt(t) || !holds(x, y + 1, ty) || !holds(x - 1, y, ty) || !holds(x + 1, y, ty)) liquidBad.push(`${ty}@${x},${y}`);
        }
        if (wv === undefined && y >= I.rock && y < I.molten) {
          if (t === T.MUD) jungleMud++;
          else if (t === T.SANDSTONE) desertSandstone++;
          else if (t === T.ICE) snowIce++;
        }
        if (DECOR.has(t)) {
          const ok = FLOOR_DECOR.has(t) ? floorOk(t, fgAt(x, y + 1)) : CEIL_DECOR.has(t) ? ceilOk(t, fgAt(x, y - 1))
            : solidAt(fgAt(x, y - 1)) || solidAt(fgAt(x - 1, y)) || solidAt(fgAt(x + 1, y));
          if (!ok) bad.push(`${t}@${x},${y}`);
        }
        if (inRows(pr, y) && !written.has(i)) {
          partsChecked++;
          if (DECOR.has(t) || MOLTEN_T.has(t)) partsLeak.push(`${t}@${x},${y}`);
        }
      }
    }
  }
  return {
    count: (t) => cnt[t], fillCount: (t) => fillCnt[t], countBand: (t, b) => band[BANDS.indexOf(b)][t], airShare: () => mAir / mAll, lavaCells: () => lava,
    badSupport: () => bad, partsLeak, partsChecked, writtenBad, writtenChecked, jungleWidth, jungleMud, desertWidth, desertSandstone, snowWidth, snowIce, liquidBad, surfaceSites, surfaceDecor,
  };
}

let HOME3: Stats[] = [];

describe('gen2 填格新特徵（Task 12）', () => {
  beforeAll(() => { HOME3 = SEEDS3.map(homeStats); }, 180_000);

  it('§4.4 花崗岩 / 大理石：各 > 300 格；花崗岩只在深層（泥土帶 / 岩層帶 0 格）', () => { for (const s of HOME3) {
    expect(s.count(T.GRANITE)).toBeGreaterThan(300); expect(s.count(T.MARBLE)).toBeGreaterThan(300);
    expect(s.countBand(T.GRANITE, 'dirt')).toBe(0); expect(s.countBand(T.GRANITE, 'rock')).toBe(0); expect(s.countBand(T.GRANITE, 'deep')).toBeGreaterThan(300); } }, 30_000);

  it('§4.4 熔岩帶：molten..LAVA_Y 的空氣 > 15%、灰燼 > 500、黑曜石 > 300、熔岩岩 > 200、熔岩 > 1500', () => { for (const s of HOME3) {
    expect(s.airShare('molten')).toBeGreaterThan(0.15); expect(s.count(T.ASH)).toBeGreaterThan(500); expect(s.count(T.OBSIDIAN)).toBeGreaterThan(300);
    expect(s.count(T.MAGMA_ROCK)).toBeGreaterThan(200); expect(s.lavaCells()).toBeGreaterThan(1500); } }, 30_000);

  // brief 的「每種 > 30」對雪灌木 / 枯灌木 / 蘑菇不成立：家鄉的雪地地表約 450 欄（7% → 期望約 31）、沙漠沙約 400 欄（12%，扣掉仙人掌期望約 42）、
  // 蘑菇（草 2% + 叢林草 1%）期望約 40，每個種子都 > 30 是擲硬幣。這三種每個種子 > 15，再用下一個測試驗機率
  it('裝飾：每種 > 30 格（南瓜 > 5；雪灌木 / 枯灌木 / 蘑菇 > 15），每一格的支撐都合法（地板類下方實心、天花板類上方實心、藤往上接藤或實心）', () => { for (const s of HOME3) {
    for (const t of [T.FLOWER, T.TALL_GRASS, T.SMALL_ROCK, T.BUSH, T.FERN, T.GLOW_MUSHROOM, T.STALACTITE, T.STALAGMITE, T.COBWEB, T.POT]) expect(s.count(t), String(t)).toBeGreaterThan(30);
    // 藤只算 fill 自己長的（蘑菇林的藤是藍圖畫的）：修正 1 的地下叢林之後每個種子 3,200–3,800（舊生成器同種子整圖 6,700–7,100）
    expect(s.fillCount(T.VINE)).toBeGreaterThan(1500);
    for (const t of [T.SNOW_SHRUB, T.DEAD_BUSH, T.MUSHROOM]) expect(s.count(t), String(t)).toBeGreaterThan(15);
    expect(s.count(T.PUMPKIN)).toBeGreaterThan(5); expect(s.badSupport()).toEqual([]); } }, 30_000);

  // 修正 1：舊生成器的地下叢林是一路長到熔岩深淵上方的泥巴淚滴。舊生成器同種子：岩層以下的泥巴約 17.5 萬格 / 地表叢林 550–626 欄
  // （每欄 280–320 格）；gen2 家鄉每欄（叢林地區寬）實測 240–300 格，門檻 150（約舊的一半）
  it('地下叢林：家鄉 y ∈ [rock, molten) 的泥巴每欄叢林地區寬 > 150 格', () => { for (const s of HOME3) {
    expect(s.jungleWidth).toBeGreaterThan(200);
    expect(s.jungleMud / s.jungleWidth, `${s.jungleMud} / ${s.jungleWidth}`).toBeGreaterThan(150); } }, 30_000);

  // 修正 2：舊生成器同種子（ft-a / b / c、lg-1 / 2）地表下 30 格以下的砂岩每欄沙漠 132–209 格、冰每欄雪原 101–142 格；
  // gen2 家鄉（每欄地區寬）實測砂岩 111–123、冰 85–98（同樣從地表下 30 格算），門檻約舊的一半
  it('地下沙漠 / 雪原：家鄉 y ∈ [rock, molten) 的砂岩每欄沙漠地區寬 > 80 格、冰每欄雪原地區寬 > 60 格', () => { for (const s of HOME3) {
    expect(s.desertWidth).toBeGreaterThan(200); expect(s.snowWidth).toBeGreaterThan(200);
    expect(s.desertSandstone / s.desertWidth, `${s.desertSandstone} / ${s.desertWidth}`).toBeGreaterThan(80);
    expect(s.snowIce / s.snowWidth, `${s.snowIce} / ${s.snowWidth}`).toBeGreaterThan(60); } }, 30_000);

  it('靜態液體：家鄉每個液體格都滿格、下方與左右撐得住（叢林洞穴、熔岩帶挖空不會讓藍圖的水 / 蜂蜜 / 熔岩漏）', () => { for (const s of HOME3) {
    expect(s.liquidBad).toEqual([]); expect(s.lavaCells()).toBeGreaterThan(1500); } }, 30_000);

  it('地表裝飾的機率：3 個種子合計，每種地面上各裝飾的比例在 brief 機率的 0.5–1.5 倍內', () => {
    for (const g of GROUNDS) {
      const n = HOME3.reduce((a, s) => a + s.surfaceSites[g], 0);
      expect(n, g).toBeGreaterThan(500);
      for (const [t, p] of SURFACE_P[g]) {
        const k = HOME3.reduce((a, s) => a + s.surfaceDecor[g][t], 0);
        expect(k / n, `${g} ${t}: ${k} / ${n}`).toBeGreaterThan(p * 0.5);
        expect(k / n, `${g} ${t}: ${k} / ${n}`).toBeLessThan(p * 1.5);
      }
    }
  }, 30_000);

  // 控制者裁決 1：部件內藍圖沒寫的格（KEEP = 天然）不放裝飾（家鄉真實藍圖；這 3 個種子沒有部件伸進熔岩帶，熔岩帶由下一個測試注入）
  it('藍圖部件內不放裝飾（家鄉真實藍圖，部件內藍圖沒寫的格）；藍圖寫的格最終就是寫入值', () => { for (const s of HOME3) {
    expect(s.partsChecked).toBeGreaterThan(10_000);
    expect(s.partsLeak).toEqual([]);
    expect(s.writtenChecked).toBeGreaterThan(10_000);
    expect(s.writtenBad).toEqual([]); } }, 30_000);

  // 控制者裁決 2：注入一份蓋住整欄熔岩帶、什麼都不寫（cells 空 = 全部 KEEP）的藍圖。
  // solid + 部件：箱內 [molten, LAVA_Y) 不挖洞、不額外挖空、不換灰燼 / 黑曜石 / 熔岩石；只有部件（solid = null）：照樣挖，但不換材質、不放裝飾。
  // 對照組（不注入）同一個箱子裡要有額外挖空（空氣且沒有牆：洞穴留牆、挖空不留）與熔岩帶材質，否則測試沒意義；欄是種子 'feat' 挖空多的欄
  it('熔岩帶：額外挖空擋在 solid 部件外；灰燼 / 黑曜石 / 熔岩石與裝飾不寫進部件內', () => {
    const src = new Gen2Source('feat');
    const bpOf = (b: BpBox, solid: boolean): Blueprint => ({ id: 1, kind: 'cabin', layer: BP_DEEP, ...b, cells: new Int32Array(0), chests: [], ...emptyObjects(), solid: solid ? { ...b } : null, parts: [{ ...b }] });
    const fillWith = (cx: number, bps: Blueprint[]): Column => {
      const idx = { overlapping: (a: number, z: number) => bps.filter((p) => p.x < z && p.x + p.w > a) } as unknown as BlueprintIndex;
      const col = new Column(cx, 1200); new Filler2('feat', src.layout, src.profile, idx).fill(col, cx * 32, cx * 32 + 32); return col;
    };
    let refCarve = 0, refMolten = 0, partCarve = 0;
    for (const cx of [43, 46, 47, 107, 124]) {
      const xs = Array.from({ length: 32 }, (_, k) => cx * 32 + k), y0 = Math.min(...xs.map((x) => src.profile.info(x).molten));
      const box = { x: cx * 32, y: y0, w: 32, h: LAVA_Y - y0 };
      const ref = fillWith(cx, []), sol = fillWith(cx, [bpOf(box, true)]), part = fillWith(cx, [bpOf(box, false)]);
      for (const x of xs) for (let y = src.profile.info(x).molten; y < LAVA_Y; y++) {
        const i = li(x, y);
        // 挖空格可能長了裝飾（對照組沒有部件），所以算「空氣或裝飾、沒有牆」
        if ((ref.fg[i] === T.AIR || DECOR.has(ref.fg[i])) && ref.wall[i] === W.NONE) refCarve++;
        if (MOLTEN_T.has(ref.fg[i])) refMolten++;
        // solid 內礦照常換（控制者裁決）：熔岩線下 25 格的玄武岩可以是金礦（逐帶宿主表，M2a Task 13），當成玄武岩比
        const sf = sol.fg[i];
        expect(sf === T.GOLD_ORE && y < src.profile.info(x).molten + 25 ? T.BASALT : sf, `solid ${x},${y}`).toBe(T.BASALT);
        expect(MOLTEN_T.has(part.fg[i]) || DECOR.has(part.fg[i]), `parts ${x},${y}`).toBe(false);
        if (part.fg[i] === T.AIR && part.wall[i] === W.NONE) partCarve++;
      }
    }
    expect(refCarve).toBeGreaterThan(1000); expect(refMolten).toBeGreaterThan(50); expect(partCarve).toBe(refCarve);
  }, 60_000);

  // 修正 1 第 4 項：BlobNoise 的 at() = 同格距 ColNoise 的三次方（逐位元），above(y, thr) = at(y) > thr（四角最大值提早結束不改結果）
  it('BlobNoise：at = ColNoise 的三次方、above = at > 門檻（逐點相同）', () => {
    // 逐點比較、不同的點收集起來（每點都 expect 太慢）
    let n = 0, hits = 0;
    const diff: string[] = [];
    for (const cell of [BLOB_CELL, 16]) for (const s of [7, -123456, 2024]) {
      const b = new BlobNoise(cell, s), c = new ColNoise(cell, s);
      for (let x = -300; x < 900; x += 7) {
        b.setX(x); c.setX(x);
        for (let y = 0; y < 1200; y++) {
          const v = c.at(y), v3 = v * v * v;
          if (b.at(y) !== v3) diff.push(`at ${cell} ${s} ${x},${y}`);
          for (const thr of [0.55, 0.72, 0.74, 0.8, 0.86]) {
            const up = b.above(y, thr);
            if (up !== v3 > thr) diff.push(`above ${thr} ${cell} ${s} ${x},${y}`);
            n++; if (up) hits++;
          }
        }
      }
    }
    expect(diff.slice(0, 5)).toEqual([]);
    expect(n).toBeGreaterThan(1_000_000); expect(hits).toBeGreaterThan(10_000);
  }, 120_000);

  it('分段填 = 整欄填（裝飾 / 熔岩帶在欄內、與分段無關）', () => { const src = new Gen2Source('feat'); for (const cx of [20, 66, 110]) {
    const parts = new Column(cx, 1200); src.fill(parts, cx * 32, cx * 32 + 7); src.fill(parts, cx * 32 + 7, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(fillCol(src, cx))); } }, 30_000);
});
