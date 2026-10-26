// gen2.perf.test.ts — gen2 每欄 fill 效能。自動門檻放寬到 3×（機器負載容忍）；spec §4.3 的 2× / 每 chunk 8 ms 由閒置機器實測把關（裁決 P5）。
// M2a Task 21：大藍圖建構與開局預算（Q9；計畫「規格模糊處與作者裁決」9）——任一份藍圖單次建構（直接呼叫建構器）≤ 80 ms（地城）/ 30 ms（小地城）/ 10 ms（其他）、
// 開局建家鄉藍圖 homePlans()（含裝飾）≤ 300 ms、第一次碰到某欄的 fill ≤ 120 ms（家鄉欄在 homePlans 之後、外圍小地城欄含第一次建藍圖）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { OuterGen, type CentralFrame } from '../legacy/chunkgen';
import type { ColumnSource } from '../column';
import { seedInt } from '../noise';
import { fillCol, range } from './testUtil';
import { BP_UNDER, BP_DEEP, slotOf, structureId, type Blueprint, type BpCtx } from './blueprint';
import { decodeStructureId } from './structId';
import { anchorBuild, anchorSpan } from './anchors';
import { SPAWN_X, type Landmass } from './layout';
import { buildRuin } from './structures/ruin';
import { buildCabin } from './structures/cabin';
import { buildLake, buildCaveLake, buildLavaPool } from './structures/lakes';
import { rollMushroomBp, rollCrystalBp } from './structures/miniBiome';
import { rollHiveBp } from './structures/hive';
import { rollMineshaftBp } from './structures/mineshaft';
import { rollSkyIslandBp } from './structures/skyIsland';
import { buildMinorBp } from './structures/minor';
import { buildShipwreck } from './structures/shipwreck';
import { buildCrate } from './structures/crate';
import { buildReefBp } from './structures/reef';
import { buildSeaRuinBp } from './structures/seaRuin';
import { buildIslandBp } from './structures/island';

const F: CentralFrame = { width: 4200, height: 1200, edgeL: 330, edgeR: 345, cavernY: 560, moltenY: 1010 };

// 機率擲出的藍圖（與海點）的建構器（直接呼叫；kind → 建構器）
const ROLLED: Readonly<Record<string, (c: BpCtx) => Blueprint | null>> = {
  ruin: buildRuin, lake: buildLake, cabin: buildCabin, cave_lake: buildCaveLake, lava_pool: buildLavaPool, mushroom_biome: rollMushroomBp, crystal_cave: rollCrystalBp,
  hive: rollHiveBp, mineshaft: rollMineshaftBp, sky_island: rollSkyIslandBp, minor: buildMinorBp, shipwreck: buildShipwreck, crate: buildCrate, reef: buildReefBp, sea_ruin: buildSeaRuinBp,
};
const ms = (f: () => unknown): number => { const t0 = performance.now(); f(); return performance.now() - t0; };
// 建構器的單次建構時間：同一份 ctx 建 3 次取最快的（建構器是純函式、每次從頭算；取最快的是濾掉排程 / GC 的負載抖動，同 legacy worldgen 效能測試「取較快者」）
const best3 = (f: () => unknown): number => Math.min(ms(f), ms(f), ms(f));

// 每個種子：家鄉的全部藍圖、東西兩側第一片大陸與第一道海的全部藍圖，各自直接呼叫建構器（best3；ctx 由藍圖 id 反查槽 = 機率藍圖 / 海點的 slotX0 / slotX1；
// 錨點用錨點的可用範圍與 surfaceBan）
interface BuildTimes { dungeon: number; keep: number; other: number; otherKind: string; homePlans: number; firstTouchHomeColumn: number; firstTouchKeepColumn: number }
function buildTimes(seeds: readonly string[]): BuildTimes {
  const t: BuildTimes = { dungeon: 0, keep: 0, other: 0, otherKind: '', homePlans: 0, firstTouchHomeColumn: 0, firstTouchKeepColumn: 0 };
  for (const seed of seeds) {
    // 開局：全新的 source 上 homePlans()（含裝飾）
    const src = new Gen2Source(seed), home = src.layout.landmassAt(SPAWN_X)!;
    t.homePlans = Math.max(t.homePlans, ms(() => src.blueprints.homePlans()));
    // 家鄉地城所在的每一欄第一次 fill（homePlans 已建好，不含建家鄉藍圖）
    const dungeon = src.blueprints.homePlans().find((b) => b.kind === 'dungeon')!;
    for (let cx = dungeon.x >> 5; cx <= (dungeon.x + dungeon.w - 1) >> 5; cx++) t.firstTouchHomeColumn = Math.max(t.firstTouchHomeColumn, ms(() => fillCol(src, cx)));
    // 外圍：東側第一片大陸的小地城所在欄，在全新的 source 上第一次 fill（含第一次建藍圖）
    const fresh = new Gen2Source(seed), east = fresh.layout.landmass(1, 2);
    const keepA = fresh.blueprints.anchorsOf(east).find((a) => a.kind === 'keep');
    if (keepA) { const sp = anchorSpan(seed, keepA); t.firstTouchKeepColumn = Math.max(t.firstTouchKeepColumn, ms(() => fillCol(fresh, ((sp.x0 + sp.x1) >> 1) >> 5))); }
    // 每份藍圖的建構器
    const s = seedInt(seed, 'g2-bp'), lands: Landmass[] = [home, src.layout.landmass(1, 1), src.layout.landmass(1, 2), src.layout.landmass(-1, 1), src.layout.landmass(-1, 2)];
    for (const m of lands) {
      const anchors = new Map(src.blueprints.anchorsOf(m).map((a) => [structureId(m.side, m.i, a.region.index, a.slot, a.layer), a] as const));
      for (const b of src.blueprints.overlapping(m.x0, m.x1).filter((q) => q.x >= m.x0 && q.x < m.x1)) {
        const sl = slotOf(b.id, src.layout), a = anchors.get(b.id);
        const base: BpCtx = { seed, s, id: b.id, slotX0: sl.x0, slotX1: sl.x1, region: sl.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x),
          spawnX: m.kind === 'home' ? SPAWN_X : undefined };
        let run: () => unknown;
        if (a) {
          const f = anchorBuild(a.kind)!, sp = anchorSpan(seed, a);
          const ban = m.kind === 'home' && (a.layer === BP_UNDER || a.layer === BP_DEEP) ? src.blueprints.surfaceBan(m, a) : undefined;
          run = () => f({ ...base, slotX0: sp.x0, slotX1: sp.x1, rank: 0, surfaceBan: ban });
        } else if (b.kind === 'island') {
          const k = decodeStructureId(b.id).slot, d = m.islands.find((q) => q.slot === k)!, r = m.regions[m.islands.indexOf(d) + 1];
          run = () => buildIslandBp({ ...base, region: r }, d.type);
        } else {
          const f = ROLLED[b.kind];
          if (!f) throw new Error(`no builder for ${b.kind}`);
          run = () => f(base);
        }
        const dt = best3(run);
        if (b.kind === 'dungeon') t.dungeon = Math.max(t.dungeon, dt);
        else if (b.kind === 'keep') t.keep = Math.max(t.keep, dt);
        else if (dt > t.other) { t.other = dt; t.otherKind = `${b.kind}@${b.x}`; }
      }
    }
  }
  for (const k of ['dungeon', 'keep', 'other', 'homePlans', 'firstTouchHomeColumn', 'firstTouchKeepColumn'] as const) t[k] = Math.round(t[k] * 10) / 10;
  return t;
}

describe('gen2 效能', () => {
  // retry 2（控制者裁決）：全套平行跑時負載會把 p95 拉到上百 ms（單獨跑約 3–4 ms）→ 失敗就重量一次；門檻不放寬，每次嘗試都印數字
  it('每欄 fill：中位數 ≤ 3 × v1（負載容忍）、p95 ≤ 40 ms（最壞值只記錄；單一最慢樣本會被負載抖動拉高；一欄 38 個 chunk → 每 chunk 遠低於 8 ms）', { retry: 2 }, () => {
    const v1 = new OuterGen('perf', F), g2 = new Gen2Source('perf');
    const time = (src: ColumnSource, cxs: number[]): number[] => {
      for (const cx of [...cxs.slice(0, 10), ...cxs.slice(Math.floor(cxs.length / 2), Math.floor(cxs.length / 2) + 10)]) fillCol(src, cx); // 暖機（前後兩段範圍各 10 欄）
      return cxs.map((cx) => { const t0 = performance.now(); fillCol(src, cx); return performance.now() - t0; }).sort((a, b) => a - b);
    };
    const t1 = time(v1, range(160, 200)), t2 = time(g2, [...range(160, 200), ...range(20, 60)]);
    const m1 = t1[t1.length >> 1], m2 = t2[t2.length >> 1], worst = t2.at(-1)!, p95 = t2[Math.ceil(t2.length * 0.95) - 1];
    console.info('[gen2 perf] v1 median ms', m1.toFixed(3), 'gen2 median ms', m2.toFixed(3), 'median ratio', (m2 / m1).toFixed(2), 'p95 ms', p95.toFixed(2), 'worst ms', worst.toFixed(2));
    expect(m2).toBeLessThanOrEqual(3 * m1);
    expect(p95).toBeLessThanOrEqual(40);
  });

  // retry 2（同上：負載抖動；門檻不放寬，每次嘗試都印數字）
  it('大藍圖建構與開局預算', { retry: 2, timeout: 120_000 }, () => {
    const t = buildTimes(['perf-a', 'perf-b']);
    console.info('[gen2 budget]', JSON.stringify(t));
    expect(t.dungeon).toBeLessThanOrEqual(80); expect(t.keep).toBeLessThanOrEqual(30); expect(t.other).toBeLessThanOrEqual(10);
    expect(t.homePlans).toBeLessThanOrEqual(300);                                       // Q9：開局建家鄉藍圖的獨立預算
    expect(t.firstTouchHomeColumn).toBeLessThanOrEqual(120); expect(t.firstTouchKeepColumn).toBeLessThanOrEqual(120);
    expect(t.keep).toBeGreaterThan(0); expect(t.firstTouchKeepColumn).toBeGreaterThan(0);
  });
});
