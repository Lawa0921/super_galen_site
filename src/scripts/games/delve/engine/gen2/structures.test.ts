// structures.test.ts — gen2 小屋與遺跡：形狀（尺寸、深度、門洞、坑道、家具、箱子）、force（P11）、
// objectsIn 的箱子 = chestLoot、樹不長在表層藍圖外框內、World 整合（搜刮過的箱子卸載再載入不會重新填滿，Review Focus #2）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, slotOf, depthFrac, structureId, BP_SURFACE, BP_UNDER, KEEP, type Blueprint, type BpCtx } from './blueprint';
import { buildCabin } from './structures/cabin';
import { buildRuin } from './structures/ruin';
import { fillCol, worldOf } from './testUtil';
import { li } from '../column';
import { seedInt } from '../noise';
import { T, W } from '../tiles';
import { BIOME } from '../world';
import { chestLoot } from '../loot';

const src = new Gen2Source('bp');
const all = new BlueprintIndex('bp', src.layout, src.profile).overlapping(-40_000, 40_000);
const cabins = all.filter((b) => b.kind === 'cabin'), ruins = all.filter((b) => b.kind === 'ruin');

// 藍圖在 (x, y) 最後蓋上的 fg（沒有 = KEEP）
function fgAt(b: Blueprint, x: number, y: number): number {
  let v = KEEP;
  for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k] === x && b.cells[k + 1] === y && b.cells[k + 2] !== KEEP) v = b.cells[k + 2];
  return v;
}
const count = (b: Blueprint, t: number): number => { let n = 0; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === t) n++; return n; };

// 某片大陸某地區的某槽的 BpCtx
function ctxOf(g: Gen2Source, seed: string, side: 1 | -1, i: number, region: number, slot: number, layer: 0 | 1 | 2): BpCtx {
  const id = structureId(side, i, region, slot, layer), q = slotOf(id, g.layout);
  return { seed, s: seedInt(seed, 'g2-bp'), id, slotX0: q.x0, slotX1: q.x1, region: q.region, profile: g.profile, ver: 0 };
}

describe('gen2 structures: cabin / ruin', () => {
  it('小屋：寬 9–15 高 6–8、在地表 + 26 到熔岩層 − 30、木板外殼與木板牆、兩端門洞、兩側 3 格高 14–30 格坑道、工作台 / 箱子 / 火把', () => {
    expect(cabins.length).toBeGreaterThan(10);
    for (const b of cabins) {
      expect(b.h).toBeGreaterThanOrEqual(6); expect(b.h).toBeLessThanOrEqual(8);
      // 屋子 = 地板那一列的木板段
      const floorY = b.y + b.h - 1, xs: number[] = [];
      for (let x = b.x; x < b.x + b.w; x++) if (fgAt(b, x, floorY) === T.PLANKS) xs.push(x);
      const x0 = xs[0], x1 = xs[xs.length - 1] + 1, w = x1 - x0;
      expect(xs.length).toBe(w);
      expect(w).toBeGreaterThanOrEqual(9); expect(w).toBeLessThanOrEqual(15);
      const tl = x0 - b.x, tr = b.x + b.w - x1;
      expect(tl).toBeGreaterThanOrEqual(14); expect(tl).toBeLessThanOrEqual(30);
      expect(tr).toBeGreaterThanOrEqual(14); expect(tr).toBeLessThanOrEqual(30);
      for (let x = x0; x < x1; x++) {
        expect(src.profile.surfaceAt(x) + 26).toBeLessThanOrEqual(b.y);
        expect(b.y).toBeLessThanOrEqual(src.profile.layersAt(x).molten - 30);
      }
      // 門洞與坑道：地板上三列，從最左到最右都是空氣（屋內家具除外）
      for (const y of [floorY - 3, floorY - 2]) for (let x = b.x; x < b.x + b.w; x++) if (x < x0 + 1 || x >= x1 - 1) expect(fgAt(b, x, y), `${x},${y}`).toBe(T.AIR);
      for (let x = b.x; x < b.x + b.w; x++) if (x < x0 + 1 || x >= x1 - 1) expect(fgAt(b, x, floorY - 1)).toBe(T.AIR);
      // 木板牆
      for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k] >= x0 && b.cells[k] < x1) expect(b.cells[k + 3]).toBe(W.PLANK_WALL);
      expect(count(b, T.WORKBENCH)).toBe(1); expect(count(b, T.TORCH)).toBe(1); expect(count(b, T.CHEST)).toBe(1);
      expect(b.chests).toHaveLength(1); expect(b.chests[0].kind).toBe('cabin');
      expect(fgAt(b, b.chests[0].x, b.chests[0].y)).toBe(T.CHEST); expect(b.chests[0].y).toBe(floorY - 1);
    }
    expect(cabins.some((b) => count(b, T.COBWEB) > 0)).toBe(true);
    expect(cabins.some((b) => count(b, T.POT) > 0)).toBe(true);
  });

  it('遺跡：寬 12–18、石磚、底 = 地表平均、起伏 ≤ 5、不在雪原；箱子在底上一格、陶罐', () => {
    expect(ruins.length).toBeGreaterThan(10);
    for (const b of ruins) {
      const c = b.chests[0], base = c.y + 1;
      expect(b.chests).toHaveLength(1); expect(c.kind).toBe('ruin'); expect(fgAt(b, c.x, c.y)).toBe(T.CHEST);
      const xs: number[] = [];
      for (let x = b.x; x < b.x + b.w; x++) if (fgAt(b, x, base) === T.STONE_BRICK) xs.push(x);
      const w = xs.length;
      expect(w).toBeGreaterThanOrEqual(12); expect(w).toBeLessThanOrEqual(18);
      expect(xs[0]).toBe(b.x + 1); expect(xs[w - 1]).toBe(b.x + w);
      let sum = 0, rough = 0;
      for (const x of xs) sum += src.profile.surfaceAt(x);
      expect(Math.round(sum / w)).toBe(base);
      for (const x of xs) rough = Math.max(rough, Math.abs(src.profile.surfaceAt(x) - base));
      expect(rough).toBeLessThanOrEqual(5);
      expect(slotOf(b.id, src.layout).region.biome).not.toBe(BIOME.SNOW);
      // 底上全清空、底下的空隙補土
      for (const x of xs) for (let y = base - 3; y < base; y++) expect([T.AIR, T.STONE_BRICK, T.CHEST, T.POT]).toContain(fgAt(b, x, y));
      for (const x of xs) for (let y = base + 1; y < src.profile.surfaceAt(x); y++) expect([T.DIRT, T.SAND, T.MUD]).toContain(fgAt(b, x, y));
      expect(count(b, T.STONE_BRICK)).toBeGreaterThan(w + 4);
    }
    expect(ruins.some((b) => count(b, T.POT) > 0)).toBe(true);
  });

  it('force（P11）：雪原 / 太陡也放遺跡（地基補土整平）；小屋 force 不回 null', () => {
    // 找一個 buildRuin 回 null 的槽（雪原或起伏太大）
    let found = 0;
    for (const side of [1, -1] as const) for (const i of [2, 4, 6, 8]) {
      const m = src.layout.landmass(side, i);
      for (const r of m.regions) {
        const n = Math.max(1, Math.floor((r.x1 - r.x0) / 340));
        for (let k = 0; k < n; k++) {
          const c = ctxOf(src, 'bp', side, i, r.index, k, BP_SURFACE);
          if (buildRuin(c) !== null) continue;
          const b = buildRuin(c, { force: true })!;
          expect(b).not.toBeNull(); expect(b.kind).toBe('ruin');
          expect(b.x).toBeGreaterThanOrEqual(c.slotX0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(c.slotX1 - 8);
          const base = b.chests[0].y + 1;
          // 整平：底下到地表全是土或石磚，底上清空
          for (let x = b.x + 1; x < b.x + b.w - 1; x++) {
            expect(fgAt(b, x, base)).toBe(T.STONE_BRICK);
            for (let y = base + 1; y < src.profile.surfaceAt(x); y++) expect([T.DIRT, T.SAND, T.MUD]).toContain(fgAt(b, x, y));
            for (let y = Math.min(src.profile.surfaceAt(x), base - 9); y < base - 9; y++) expect(fgAt(b, x, y)).toBe(T.AIR);
          }
          found++;
        }
      }
    }
    expect(found).toBeGreaterThan(0);
    const cc = ctxOf(src, 'bp', 1, 2, 0, 0, BP_UNDER);
    expect(buildCabin(cc, { force: true })).not.toBeNull();
    expect(buildCabin(cc, { force: true })).toEqual(buildCabin(cc, { force: true }));
  });

  it('樹根不長在表層藍圖外框內', () => {
    const w = worldOf(src);
    let checked = 0;
    for (const b of ruins.slice(0, 12)) {
      const biome = slotOf(b.id, src.layout).region.biome;
      if (biome !== BIOME.FOREST && biome !== BIOME.JUNGLE) continue;
      for (let cx = b.x >> 5; cx <= (b.x + b.w - 1) >> 5; cx++) w.ensureColumn(cx);
      const base = b.chests[0].y + 1;
      for (let x = b.x; x < b.x + b.w; x++) for (let y = base - 30; y < base; y++) expect(w.getFg(x, y)).not.toBe(T.WOOD);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('objectsIn：箱子在箱子 tile 上、內容 = chestLoot', () => {
    for (const b of [cabins[0], ruins[0]]) {
      const c = b.chests[0], col = fillCol(src, c.x >> 5);
      expect(col.fg[li(c.x, c.y)]).toBe(T.CHEST);
      const got = src.objectsIn((c.x >> 5) * 32, (c.x >> 5) * 32 + 32).find((o) => o.x === c.x && o.y === c.y)!;
      expect(got.slots).toEqual(chestLoot('bp', c.x, c.y, c.kind, depthFrac(src.profile, c.x, c.y)));
    }
    const c = cabins[0].chests[0];
    expect(depthFrac(src.profile, c.x, c.y)).toBeCloseTo((c.y - src.surfaceAt(c.x)) / (1200 - src.surfaceAt(c.x)), 12);
    expect(depthFrac(src.profile, c.x, 0)).toBe(0);
    // 只回 x ∈ [x0, x1) 的箱子：範圍切在箱子右邊一格就不含它；整段 = 所有藍圖的箱子
    expect(src.objectsIn(c.x + 1, c.x + 2).some((o) => o.x === c.x)).toBe(false);
    expect(src.objectsIn(c.x, c.x + 1).map((o) => [o.x, o.y])).toEqual([[c.x, c.y]]);
    const a = -12_000, z = 12_000, want = all.flatMap((b) => b.chests).filter((q) => q.x >= a && q.x < z).map((q) => `${q.x},${q.y}`).sort();
    expect(want.length).toBeGreaterThan(10);
    expect(src.objectsIn(a, z).map((o) => `${o.x},${o.y}`).sort()).toEqual(want);
  });

  it('世界整合：搜刮過的小屋箱子卸載再載入不會被重新填滿；沒搜過的卸載再載入內容相同', () => {
    const w = worldOf(src); const c = cabins[0].chests[0], cx = c.x >> 5, k = w.idx(c.x, c.y);
    w.ensureColumn(cx); const orig = structuredClone(w.chests.get(k)!);
    expect(orig).toEqual(chestLoot('bp', c.x, c.y, 'cabin', depthFrac(src.profile, c.x, c.y)));
    expect(orig[0]).not.toBeNull();
    w.chests.get(k)![0] = null; w.touchChest(c.x, c.y); w.unloadColumn(cx); w.ensureColumn(cx);
    expect(w.chests.get(k)![0]).toBeNull();
    const w2 = worldOf(src); w2.ensureColumn(cx); w2.unloadColumn(cx); expect(w2.chests.has(k)).toBe(false); w2.ensureColumn(cx); expect(w2.chests.get(k)).toEqual(orig);
  });
});
