// ores.test.ts — gen2 家鄉的礦物密度對齊舊生成器（M2a Task 13；spec §4.4）與燈籠守望者召喚材料取得得到。
// 量法同 legacy/oreBaseline.measure.test.ts（testUtil.oreTally）：家鄉 x ∈ [100, 4100)、逐欄 fillCol（含藍圖：地城、礦坑、小生態…），
// 層線用 gen2 自己的 profile.info(x)（每欄 surface / rock / deep / molten），種子 alpha / beta / gamma 各算密度再平均。
// DELVE_MEASURE=1 時印出 gen2 的量測值（報告用）；平常不印。
import { describe, it, expect, beforeAll } from 'vitest';
import { Gen2Source } from './index';
import { fillCol, newOreTally, tallyColumn, oreDensity, meanDensity, ORE_X0, ORE_X1, ORE_TILE } from './testUtil';
import { LEGACY_ORE_DENSITY, ORES4, BANDS4, type OreKind } from './oreBaseline';
import { HOME_X0, HOME_X1 } from './layout';
import { li, type Column } from '../column';
import { WORLD_H } from '../constants';
import { T } from '../tiles';
import { BIOME } from '../world';
import { RECIPES } from '../crafting';
import { ENEMIES } from '../enemies';
import { spawnTable, type Habitat } from '../spawn';

const SEEDS = ['alpha', 'beta', 'gamma'];
interface Home { src: Gen2Source; cols: Column[] }
// 種子 → 填好的家鄉（beforeAll 填 SEEDS；densityOf 要別的種子時現填）
const HOME_OF = new Map<string, Home>();
const homeOf = (seed: string): Home => {
  let h = HOME_OF.get(seed);
  if (!h) {
    const src = new Gen2Source(seed), cols: Column[] = [];
    for (let cx = HOME_X0 >> 5; cx <= (HOME_X1 - 1) >> 5; cx++) cols.push(fillCol(src, cx));
    h = { src, cols }; HOME_OF.set(seed, h);
  }
  return h;
};
const HOMES: Home[] = [];
const fgAt = (h: Home, x: number, y: number): number => h.cols[x >> 5].fg[li(x, y)];

beforeAll(() => {
  for (const seed of SEEDS) HOMES.push(homeOf(seed));
}, 180_000);

// 幾個種子的家鄉密度（各自算再平均；量法同 legacy 的量測測試）
function densityOf(seeds: readonly string[]): ReturnType<typeof meanDensity> {
  return meanDensity(seeds.map(homeOf).map((h) => {
    const t = newOreTally();
    for (let x = ORE_X0; x < ORE_X1; x++) { const I = h.src.profile.info(x); tallyColumn(t, (y) => fgAt(h, x, y), I, WORLD_H); }
    if (process.env.DELVE_MEASURE === '1') console.info('[gen2 ore counts]', JSON.stringify({ ore: t.ore, cells: t.cells }));
    return oreDensity(t);
  }));
}
// 量測範圍內的礦格數（三個種子中最少的）
const g2Count = (ore: OreKind): number => Math.min(...HOMES.map((h) => {
  let n = 0;
  for (let x = ORE_X0; x < ORE_X1; x++) for (let y = 0; y < WORLD_H; y++) if (fgAt(h, x, y) === ORE_TILE[ore]) n++;
  return n;
}));
// 量測範圍內，4 鄰至少一格是同種礦的礦格比例（三個種子中最低的）
const clustered = (ore: OreKind): number => Math.min(...HOMES.map((h) => {
  const t = ORE_TILE[ore];
  let n = 0, c = 0;
  for (let x = ORE_X0; x < ORE_X1; x++) for (let y = 1; y < WORLD_H - 1; y++) {
    if (fgAt(h, x, y) !== t) continue;
    n++;
    if (fgAt(h, x - 1, y) === t || fgAt(h, x + 1, y) === t || fgAt(h, x, y - 1) === t || fgAt(h, x, y + 1) === t) c++;
  }
  return n > 0 ? c / n : 0;
}));
// 整個家鄉 [HOME_X0, HOME_X1) 的 tile 格數（三個種子中最少的）
const homeCount = (tile: number): number => Math.min(...HOMES.map((h) => {
  let n = 0;
  for (let x = HOME_X0; x < HOME_X1; x++) for (let y = 0; y < WORLD_H; y++) if (fgAt(h, x, y) === tile) n++;
  return n;
}));
const recipeOf = (id: string): { inputs: [string, number][] } => {
  const r = RECIPES.find((q) => q.id === id);
  if (!r) throw new Error(`no recipe ${id}`);
  return { inputs: r.inputs.map((i) => [i.item, i.n]) };
};
const hab = (o: Partial<Habitat>): Habitat => ({ zone: 'surface', biome: BIOME.FOREST, mushroom: false, night: false, ...o });

describe('gen2 礦物密度（M2a Task 13）', () => {
  it('§4.4：每種礦在舊生成器密度 ≥ 0.2‰ 的帶裡，gen2 密度落在 ±30%；舊的 < 0.2‰ 的帶 gen2 也 < 0.5‰', () => {
    const g2 = densityOf(['alpha', 'beta', 'gamma']);
    if (process.env.DELVE_MEASURE === '1') {
      console.info('[gen2 ore density]', JSON.stringify(g2));
      // Task 21 延後事項 4（Task 13 審查）：熔岩帶金對舊生成器的比例——單一種子的家鄉、單片荒野大陸（東 / 西第一片）各自算（只記錄，不改規則）
      const ratio = (src: Gen2Source, x0: number, x1: number): string => {
        const t = newOreTally();
        for (let cx = x0 >> 5; cx <= (x1 - 1) >> 5; cx++) {
          const col = fillCol(src, cx);
          for (let x = Math.max(x0, cx * 32); x < Math.min(x1, cx * 32 + 32); x++) tallyColumn(t, (y) => col.fg[li(x, y)], src.profile.info(x), WORLD_H);
        }
        return (oreDensity(t).gold.molten / LEGACY_ORE_DENSITY.gold.molten).toFixed(2);
      };
      for (const seed of SEEDS) {
        const h = homeOf(seed), conts = ([1, -1] as const).map((side) => h.src.layout.landmass(side, 2));
        console.info('[gen2 molten gold ×legacy]', seed, 'home', ratio(h.src, ORE_X0, ORE_X1), ...conts.map((m) => `continent ${m.side}:${m.i} ${ratio(h.src, m.x0, m.x1)}`));
      }
    }
    for (const ore of ORES4) for (const band of BANDS4) {
      const old = LEGACY_ORE_DENSITY[ore][band], now = g2[ore][band];
      if (old >= 0.2) { expect(now, `${ore}/${band}`).toBeGreaterThanOrEqual(old * 0.7); expect(now, `${ore}/${band}`).toBeLessThanOrEqual(old * 1.3); }
      else expect(now, `${ore}/${band}`).toBeLessThan(0.5);
    }
  }, 180_000);

  it('礦成團：每種礦 > 1500 格、與同種相鄰的比例 > 0.6', () => {
    for (const ore of ORES4) { expect(g2Count(ore), ore).toBeGreaterThan(1500); expect(clustered(ore), ore).toBeGreaterThan(0.6); }
  }, 180_000);

  it('§4.4 燈籠守望者召喚材料：配方 = 發光蘑菇 6 + 凝膠 5 + 金錠 3；家鄉有發光蘑菇 > 40、金礦 > 300；森林地表白天的生怪表有掉凝膠的怪', () => {
    expect(recipeOf('wick_offering').inputs).toEqual([['glow_mushroom', 6], ['gel', 5], ['gold_bar', 3]]);
    expect(homeCount(T.GLOW_MUSHROOM)).toBeGreaterThan(40); expect(homeCount(T.GOLD_ORE)).toBeGreaterThan(300);
    const kinds = spawnTable(hab({ zone: 'surface', biome: BIOME.FOREST, night: false })).map((e) => e.kind);
    expect(kinds.some((k) => ENEMIES[k].drops.some((d) => d.item === 'gel'))).toBe(true);
    expect(recipeOf('gold_bar').inputs).toEqual([['gold_ore', 4]]);
  }, 180_000);
});
