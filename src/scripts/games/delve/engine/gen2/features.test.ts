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
import { fillCol, bytes } from './testUtil';
import { Column, li } from '../column';
import { T, W, SOLID_LUT, floorOk, ceilOk } from '../tiles';
import { LIQ } from '../liquidKind';
import { BIOME } from '../world';

const SEEDS3 = ['ft-a', 'ft-b', 'ft-c'];
const HOME_X1 = 4200, CX1 = 132;
type Band = 'dirt' | 'rock' | 'deep' | 'molten';
const BANDS: readonly Band[] = ['dirt', 'rock', 'deep', 'molten'];
// 地板類 / 天花板類 / 蛛網（上方或左右實心）
const FLOOR_DECOR = new Set<number>([T.POT, T.FLOWER, T.TALL_GRASS, T.MUSHROOM, T.SMALL_ROCK, T.BUSH, T.PUMPKIN, T.DEAD_BUSH, T.SNOW_SHRUB, T.FERN, T.GLOW_MUSHROOM, T.STALAGMITE]);
const CEIL_DECOR = new Set<number>([T.STALACTITE, T.VINE]);
const DECOR = new Set<number>([...FLOOR_DECOR, ...CEIL_DECOR, T.COBWEB]);
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
  countBand(t: number, b: Band): number;
  airShare(b: 'molten'): number;
  lavaCells(): number;
  badSupport(): string[];
  // 藍圖部件內、藍圖沒寫的格出現裝飾 / 熔岩帶材質（應為空）；檢查過的部件內格數
  partsLeak: string[]; partsChecked: number;
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
  const cnt = new Float64Array(256), band = BANDS.map(() => new Float64Array(256));
  let mAir = 0, mAll = 0, lava = 0, partsChecked = 0;
  const bad: string[] = [], partsLeak: string[] = [];
  const surfaceSites: Record<Ground, number> = { grass: 0, desert: 0, snow: 0, jungle: 0 };
  const surfaceDecor = Object.fromEntries(GROUNDS.map((g) => [g, new Float64Array(256)])) as Record<Ground, Float64Array>;
  // 只留 cx − 1..cx + 1 三欄（蛛網看左右）
  const cols = new Map<number, Column>();
  const colOf = (cx: number): Column => { let c = cols.get(cx); if (!c) { c = fillCol(src, cx); cols.set(cx, c); } return c; };
  const fgAt = (x: number, y: number): number => (y < 0 || y >= H ? T.STONE : colOf(x >> 5).fg[li(x, y)]);
  for (let cx = 0; cx < CX1; cx++) {
    cols.delete(cx - 2);
    const c = colOf(cx), x0 = cx * 32, x1 = Math.min(HOME_X1, x0 + 32);
    const bps: Blueprint[] = src.blueprints.overlapping(x0, x0 + 32);
    // 藍圖寫了 fg 的格（li 索引）
    const written = new Set<number>();
    for (const b of bps) for (let k = 0; k < b.cells.length; k += 5) {
      const x = b.cells[k], y = b.cells[k + 1];
      if (x >= x0 && x < x0 + 32 && y >= 0 && y < H && b.cells[k + 2] !== KEEP) written.add(li(x, y));
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
        if (y >= I.surface) band[y < I.rock ? 0 : y < I.deep ? 1 : y < I.molten ? 2 : 3][t]++;
        if (y >= I.molten && y < LAVA_Y) { mAll++; if (t === T.AIR && c.liquid[i] === 0) mAir++; }
        if (c.liquid[i] > 0 && c.liquidType[i] === LIQ.LAVA) lava++;
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
    count: (t) => cnt[t], countBand: (t, b) => band[BANDS.indexOf(b)][t], airShare: () => mAir / mAll, lavaCells: () => lava,
    badSupport: () => bad, partsLeak, partsChecked, surfaceSites, surfaceDecor,
  };
}

let HOME3: Stats[] = [];

describe('gen2 填格新特徵（Task 12）', () => {
  beforeAll(() => { HOME3 = SEEDS3.map(homeStats); }, 180_000);

  it('§4.4 花崗岩 / 大理石：各 > 300 格；花崗岩在深層的比在岩層的多', () => { for (const s of HOME3) {
    expect(s.count(T.GRANITE)).toBeGreaterThan(300); expect(s.count(T.MARBLE)).toBeGreaterThan(300); expect(s.countBand(T.GRANITE, 'deep')).toBeGreaterThan(s.countBand(T.GRANITE, 'rock')); } }, 30_000);

  it('§4.4 熔岩帶：molten..LAVA_Y 的空氣 > 15%、灰燼 > 500、黑曜石 > 300、熔岩岩 > 200、熔岩 > 1500', () => { for (const s of HOME3) {
    expect(s.airShare('molten')).toBeGreaterThan(0.15); expect(s.count(T.ASH)).toBeGreaterThan(500); expect(s.count(T.OBSIDIAN)).toBeGreaterThan(300);
    expect(s.count(T.MAGMA_ROCK)).toBeGreaterThan(200); expect(s.lavaCells()).toBeGreaterThan(1500); } }, 30_000);

  // brief 的「每種 > 30」對雪灌木 / 枯灌木 / 蘑菇不成立：家鄉的雪地地表約 450 欄（7% → 期望約 31）、沙漠沙約 400 欄（12%，扣掉仙人掌期望約 42）、
  // 蘑菇（草 2% + 叢林草 1%）期望約 40，每個種子都 > 30 是擲硬幣。這三種每個種子 > 15，再用下一個測試驗機率
  it('裝飾：每種 > 30 格（南瓜 > 5；雪灌木 / 枯灌木 / 蘑菇 > 15），每一格的支撐都合法（地板類下方實心、天花板類上方實心、藤往上接藤或實心）', () => { for (const s of HOME3) {
    for (const t of [T.FLOWER, T.TALL_GRASS, T.SMALL_ROCK, T.BUSH, T.FERN, T.VINE, T.GLOW_MUSHROOM, T.STALACTITE, T.STALAGMITE, T.COBWEB, T.POT]) expect(s.count(t), String(t)).toBeGreaterThan(30);
    for (const t of [T.SNOW_SHRUB, T.DEAD_BUSH, T.MUSHROOM]) expect(s.count(t), String(t)).toBeGreaterThan(15);
    expect(s.count(T.PUMPKIN)).toBeGreaterThan(5); expect(s.badSupport()).toEqual([]); } }, 30_000);

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
  it('藍圖部件內不放裝飾（家鄉真實藍圖，部件內藍圖沒寫的格）', () => { for (const s of HOME3) {
    expect(s.partsChecked).toBeGreaterThan(10_000);
    expect(s.partsLeak).toEqual([]); } }, 30_000);

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
        expect(sol.fg[i], `solid ${x},${y}`).toBe(T.BASALT);
        expect(MOLTEN_T.has(part.fg[i]) || DECOR.has(part.fg[i]), `parts ${x},${y}`).toBe(false);
        if (part.fg[i] === T.AIR && part.wall[i] === W.NONE) partCarve++;
      }
    }
    expect(refCarve).toBeGreaterThan(1000); expect(refMolten).toBeGreaterThan(50); expect(partCarve).toBe(refCarve);
  }, 60_000);

  it('分段填 = 整欄填（裝飾 / 熔岩帶在欄內、與分段無關）', () => { const src = new Gen2Source('feat'); for (const cx of [20, 66, 110]) {
    const parts = new Column(cx, 1200); src.fill(parts, cx * 32, cx * 32 + 7); src.fill(parts, cx * 32 + 7, cx * 32 + 32); expect(bytes(parts)).toEqual(bytes(fillCol(src, cx))); } }, 30_000);
});
