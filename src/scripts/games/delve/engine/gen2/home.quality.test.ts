// home.quality.test.ts — gen2 家鄉品質總驗（M2a Task 17；spec §4.4）：§4.4 每一條在 20 個種子上再驗一次（各 Task 的測試是 5 個種子的細節版），
// 每種生態至少一條從地表走得到洞穴層的路、舊生成器家鄉出現過的 tile gen2 家鄉都有（legacyTiles.ts 的 NOT_PORTED 除外）。
// 只用藍圖 + homeContent + 抽樣欄的 fill（每種生態的路只載入坑道 ± 20 欄；tile 集合填 3 個種子的整個家鄉）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { homeContent } from './home';
import { SPAWN_X, VARIANT } from './layout';
import { shaftX } from './caves';
import { LEGACY_HOME_TILES, NOT_PORTED, ONE_PER_WORLD } from './legacyTiles';
import { fillCol, worldOf, loadColumns, bfsReachesDepth, SEEDS5 } from './testUtil';
import type { Blueprint } from './bpcore';
import type { RegionInfo } from '../regionInfo';
import { seedInt } from '../noise';
import { T, DUNGEON_COLORS } from '../tiles';
import { BIOME } from '../world';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `hq-${k}`);

// ±r 欄的地表都相同（含 SURFACE 層藍圖的地面覆寫）
const flatAround = (src: Gen2Source, x: number, r: number): boolean => {
  const s = src.surfaceAt(x);
  for (let k = x - r; k <= x + r; k++) if (src.surfaceAt(k) !== s) return false;
  return true;
};
// 家鄉中該生態的非沙灘地區
const homeRegionsOf = (src: Gen2Source, biome: number): RegionInfo[] =>
  src.layout.landmassAt(SPAWN_X)!.regions.filter((r) => r.biome === biome && r.variant !== VARIANT.BEACH);
// 家鄉 0..131 欄 fillCol 的 fg tile 集合（幾個種子的聯集）
function homeTileSet(seeds: readonly string[]): Set<number> {
  const out = new Set<number>();
  for (const seed of seeds) { const src = new Gen2Source(seed); for (let cx = 0; cx <= 131; cx++) for (const t of fillCol(src, cx).fg) out.add(t); }
  return out;
}
// 家鄉地塊的全部藍圖（每個種子新建一份 Gen2Source：不與其他測試共用快取）
const homeBps = (src: Gen2Source): Blueprint[] => { const h = src.layout.origin.home!; return src.blueprints.overlapping(h.x0, h.x1); };

describe('gen2 家鄉品質總驗（M2a Task 17，§4.4）', () => {
  it('§4.4 總驗（20 個種子）', () => { for (const seed of SEEDS20) { const src = new Gen2Source(seed), h = src.layout.landmassAt(SPAWN_X)!, hc = homeContent(src), bp = homeBps(src);
    expect(new Set(h.regions.map((r) => r.biome)), seed).toEqual(new Set([0, 1, 2, 3]));
    expect(src.layout.regionAt(SPAWN_X)!.biome, seed).toBe(BIOME.FOREST); expect(flatAround(src, SPAWN_X, 60), seed).toBe(true);
    expect(src.layout.regionAt(5)!.variant, seed).toBe(VARIANT.BEACH); expect(src.layout.regionAt(4195)!.variant, seed).toBe(VARIANT.BEACH);
    expect(hc.dungeon!.rooms.length, seed).toBeGreaterThanOrEqual(25); expect(hc.dungeon!.keys.length, seed).toBeGreaterThan(0);
    expect(hc.villages.length, seed).toBeGreaterThanOrEqual(2); expect(hc.villages.length, seed).toBeLessThanOrEqual(4); expect(hc.halls.length, seed).toBeGreaterThanOrEqual(1);
    expect(bp.flatMap((b) => b.chests).filter((c) => c.kind === 'secret').length, seed).toBeGreaterThanOrEqual(3);
    for (const k of ['cabin', 'ruin', 'mineshaft', 'sky_island', 'mushroom_biome', 'crystal_cave', 'cave_lake']) expect(bp.some((b) => b.kind === k), `${seed} ${k}`).toBe(true);
    // Task 17 延續事項 4：舊生成器的家鄉每個種子都有地表湖（12 個種子平均 2.5 座注滿的湖床 + 15 座池塘 + 1 座綠洲）→ gen2 家鄉保證一座，湖岸有旅人石堆
    expect(bp.some((b) => b.kind === 'lake'), `${seed} lake`).toBe(true); expect(hc.landmarks.some((l) => l.tile === T.CAIRN), `${seed} cairn`).toBe(true);
    expect(hc.tablets, seed).toHaveLength(14); expect(hc.relics, seed).toHaveLength(4); } }, 300_000);

  it('§4.4 每種生態至少一條從地表走得到洞穴層的路（家鄉，5 個種子）', () => { for (const seed of SEEDS5) { const src = new Gen2Source(seed), w = worldOf(src);
    for (const biome of [0, 1, 2, 3]) { const r = homeRegionsOf(src, biome).find((q) => Number.isFinite(shaftX(seedInt(seed, 'g2-shaft'), q)))!;
      expect(r, `${seed} biome ${biome}`).toBeDefined(); const sx = shaftX(seedInt(seed, 'g2-shaft'), r); loadColumns(w, sx - 20, sx + 20);
      expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20), `${seed} biome ${biome}`).toBe(true); } } }, 120_000);

  it('家鄉不輸舊版：舊生成器家鄉出現過的 tile，gen2 家鄉（3 個種子聯集）都有，除了 NOT_PORTED', () => {
    const now = homeTileSet(['alpha', 'beta', 'gamma']);
    // 每個世界只挑一個的 tile 組（地城磚三色）：組內任一個出現就算整組有
    const grouped = (t: number): boolean => ONE_PER_WORLD.some((g) => g.includes(t) && g.some((o) => now.has(o)));
    expect(LEGACY_HOME_TILES.filter((t) => !now.has(t) && !(t in NOT_PORTED) && !grouped(t))).toEqual([]);
    // 組內的每一個 gen2 都真的會挑到：20 個種子的家鄉地城磚三色都出現
    const bricks = new Set<number>();
    for (const seed of SEEDS20) { const b = homeBps(new Gen2Source(seed)).find((q) => q.kind === 'dungeon')!; for (let i = 0; i < b.cells.length; i += 5) bricks.add(b.cells[i + 2]); }
    for (const c of DUNGEON_COLORS) expect(bricks.has(c.brick), `brick ${c.brick}`).toBe(true);
    expect(ONE_PER_WORLD).toEqual([DUNGEON_COLORS.map((c) => c.brick)]);
  }, 180_000);
});
