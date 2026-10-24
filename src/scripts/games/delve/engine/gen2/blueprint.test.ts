// blueprint.test.ts — gen2 結構藍圖與槽位格：藍圖格在外框內、外框在槽內、確定性、分段蓋 = 整欄蓋、overlapping 範圍查詢、
// 保證槽（P11）與排除區（出生點、主坑道）、structureId / slotOf 反查（陸地槽與海槽，P12）、主坑道蓋上結構後仍通。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, slotOf, structureId, BP_DEEP, BP_SURFACE, BP_UNDER, LAND_SLOT_W } from './blueprint';
import { HRng } from './hrng';
import { shaftX, SHAFT_REACH } from './caves';
import { SPAWN_X, VARIANT } from './layout';
import { fillCol, bytes, worldOf, loadColumns, sampleRegions, bfsReachesDepth, SEEDS5 } from './testUtil';
import { Column } from '../column';
import { hash2, seedInt } from '../noise';

const src = new Gen2Source('bp');
const idx = new BlueprintIndex('bp', src.layout, src.profile);
const all = idx.overlapping(-40_000, 40_000);

describe('gen2 blueprints / slot grid', { timeout: 30_000 }, () => {
  it('HRng：hash2(id, counter++, s)；int 是 [lo, hi)、chance(n) 是 1/n', () => {
    const r = new HRng(77, 12345);
    expect([r.next(), r.next(), r.next()]).toEqual([hash2(12345, 0, 77), hash2(12345, 1, 77), hash2(12345, 2, 77)]);
    const q = new HRng(77, 12345);
    q.next(); q.next(); q.next();
    expect(q.int(9, 16)).toBe(9 + Math.floor(hash2(12345, 3, 77) * 7));
    const ints = new Set<number>(), c = new HRng(5, 6);
    let hits = 0;
    for (let k = 0; k < 4000; k++) { ints.add(c.int(3, 6)); if (c.chance(4)) hits++; }
    expect([...ints].sort()).toEqual([3, 4, 5]);
    expect(hits).toBeGreaterThan(800); expect(hits).toBeLessThan(1200);
  });

  it('藍圖格都在外框內、外框在槽內；同 id 兩次算出相同藍圖', () => {
    expect(all.length).toBeGreaterThan(20);
    for (const b of all) {
      for (let k = 0; k < b.cells.length; k += 5) {
        expect(b.cells[k]).toBeGreaterThanOrEqual(b.x); expect(b.cells[k]).toBeLessThan(b.x + b.w);
        expect(b.cells[k + 1]).toBeGreaterThanOrEqual(b.y); expect(b.cells[k + 1]).toBeLessThan(b.y + b.h);
      }
      const slot = slotOf(b.id, src.layout);
      expect(b.x).toBeGreaterThanOrEqual(slot.x0 + 8); expect(b.x + b.w).toBeLessThanOrEqual(slot.x1 - 8);
      expect(slot.layer).toBe(b.layer);
    }
    expect(new BlueprintIndex('bp', src.layout, src.profile).overlapping(-40_000, 40_000)).toEqual(all);
  });

  it('stamp 分段蓋 = 整欄蓋（跨欄藍圖）', () => {
    const b = all.find((q) => q.x >> 5 !== (q.x + q.w - 1) >> 5)!;
    const cx = b.x >> 5;
    const whole = fillCol(src, cx), parts = new Column(cx, 1200);
    src.fill(parts, cx * 32, b.x + 1); src.fill(parts, b.x + 1, cx * 32 + 32);
    expect(bytes(parts)).toEqual(bytes(whole));
  });

  it('overlapping 回傳所有與範圍相交的藍圖', () => {
    for (const [a, z] of [[4100, 4300], [-3000, -2900], [2000, 2032]]) expect(idx.overlapping(a, z)).toEqual(all.filter((b) => b.x < z && b.x + b.w > a));
    // 有東西的範圍也要對得上（不是只有空範圍）
    const b = all[Math.floor(all.length / 2)];
    const got = idx.overlapping(b.x + 1, b.x + 2);
    expect(got).toContainEqual(b);
    expect(got).toEqual(all.filter((q) => q.x < b.x + 2 && q.x + q.w > b.x + 1));
  });

  it('保證槽（P11）：每片非家鄉大陸 ≥ 1 小屋 + ≥ 1 遺跡（5 個種子、確定）；排除區', () => {
    for (const seed of SEEDS5) {
      const g = new Gen2Source(seed), bps = new BlueprintIndex(seed, g.layout, g.profile).overlapping(-40_000, 40_000);
      for (const side of [1, -1] as const) for (const i of [2, 4, 6]) {
        const m = g.layout.landmass(side, i), in_ = bps.filter((b) => b.x >= m.x0 && b.x < m.x1);
        expect(m.kind).toBe('continent');
        expect(in_.filter((b) => b.kind === 'cabin').length, `${seed} ${side}:${i}`).toBeGreaterThanOrEqual(1);
        expect(in_.filter((b) => b.kind === 'ruin').length, `${seed} ${side}:${i}`).toBeGreaterThanOrEqual(1);
      }
    }
    expect(all.filter((b) => b.x < SPAWN_X + 80 && b.x + b.w > SPAWN_X - 80)).toEqual([]);
    // 含出生點 ± 80 的槽整槽全空（不只是 ± 80 內）
    for (let k = 0; k < 20; k++) {
      const g = new Gen2Source(`spawn-${k}`);
      for (const b of new BlueprintIndex(`spawn-${k}`, g.layout, g.profile).overlapping(0, 4200)) {
        const q = slotOf(b.id, g.layout);
        expect(q.x0 <= SPAWN_X + 80 && q.x1 > SPAWN_X - 80, `spawn-${k} ${b.kind} ${b.x}`).toBe(false);
      }
    }
    const s = seedInt('bp', 'g2-shaft');
    for (const b of all.filter((q) => q.layer !== BP_DEEP)) {
      const r = slotOf(b.id, src.layout); const sx = shaftX(s, r.region);
      if (Number.isFinite(sx)) expect(sx >= r.x0 && sx < r.x1).toBe(false);
    }
    // 外框離本地區主坑道的觸及範圍至少 1 格（鄰槽的結構也不會蓋到坑道），6 個種子
    for (const seed of ['bp', ...SEEDS5]) {
      const g = new Gen2Source(seed), ss = seedInt(seed, 'g2-shaft');
      for (const b of new BlueprintIndex(seed, g.layout, g.profile).overlapping(-40_000, 40_000)) {
        const sx = shaftX(ss, slotOf(b.id, g.layout).region);
        if (b.layer === BP_DEEP || !Number.isFinite(sx)) continue;
        expect(b.x + b.w <= sx - SHAFT_REACH - 1 || b.x >= sx + SHAFT_REACH + 2, `${seed} ${b.kind} ${b.x}`).toBe(true);
      }
    }
    for (const b of all.filter((q) => ['cabin', 'ruin'].includes(q.kind))) expect(['home', 'wild', 'culture']).toContain(slotOf(b.id, src.layout).region.kind);
    // 小屋在地下層、遺跡在表層
    for (const b of all) if (b.kind === 'cabin') expect(b.layer).toBe(BP_UNDER); else if (b.kind === 'ruin') expect(b.layer).toBe(BP_SURFACE);
  });

  it('家鄉兩端的沙灘沒有藍圖（留給 M2 的地城，spec §4.4）：20 個種子', () => {
    let seen = 0;
    for (let k = 0; k < 20; k++) {
      const seed = `seed-${k}`, g = new Gen2Source(seed), home = g.layout.landmassAt(SPAWN_X)!;
      const beaches = home.regions.filter((r) => r.variant === VARIANT.BEACH).map((r) => [r.x0, r.x1]);
      expect(beaches).toEqual([[0, 70], [4130, 4200]]);
      const bps = new BlueprintIndex(seed, g.layout, g.profile).overlapping(-200, 4400);
      seen += bps.length;
      for (const [a, z] of beaches) expect(bps.filter((b) => b.x < z && b.x + b.w > a), `${seed} [${a}, ${z})`).toEqual([]);
    }
    expect(seen).toBeGreaterThan(20);
  });

  it('非保證槽照機率：遺跡約 30% 的表層槽、小屋約 40% 的地下層槽（上限）', () => {
    const land = sampleRegions(src, { home: false, perSide: 6 });
    let slots = 0;
    for (const r of land) slots += Math.max(1, Math.floor((r.x1 - r.x0) / LAND_SLOT_W));
    const lo = Math.min(...land.map((r) => r.x0)), hi = Math.max(...land.map((r) => r.x1));
    const bps = idx.overlapping(lo, hi).filter((b) => b.x >= lo && b.x < hi);
    const ruins = bps.filter((b) => b.kind === 'ruin').length, cabins = bps.filter((b) => b.kind === 'cabin').length;
    // 12 片大陸各有 1 個保證槽；其餘槽最多 30% / 40%（建不成會更少）
    expect(ruins).toBeGreaterThan(12); expect(ruins).toBeLessThan(12 + slots * 0.45);
    expect(cabins).toBeGreaterThan(12); expect(cabins).toBeLessThan(12 + slots * 0.55);
  });

  it('structureId / slotOf：陸地槽與海槽都反查得回來（P12：海 region = 0、slot = SeaSlot.k、表層）', () => {
    const m = src.layout.landmass(1, 2), r = m.regions[1];
    const id = structureId(1, 2, 1, 1, BP_UNDER), q = slotOf(id, src.layout);
    expect(q.region).toBe(r); expect(q.layer).toBe(BP_UNDER);
    expect(q.x0).toBe(r.x0 + LAND_SLOT_W); expect(q.x1).toBe(Math.floor((r.x1 - r.x0) / LAND_SLOT_W) > 2 ? r.x0 + 2 * LAND_SLOT_W : r.x1);
    // 最後一槽吃餘數
    const n = Math.floor((r.x1 - r.x0) / LAND_SLOT_W), last = slotOf(structureId(1, 2, 1, n - 1, BP_SURFACE), src.layout);
    expect(last.x1).toBe(r.x1); expect(last.x1 - last.x0).toBeGreaterThanOrEqual(LAND_SLOT_W); expect(last.x1 - last.x0).toBeLessThan(2 * LAND_SLOT_W);
    // 家鄉（side 0、i 0）
    const home = src.layout.landmassAt(SPAWN_X)!, h = slotOf(structureId(0, 0, 3, 0, BP_DEEP), src.layout);
    expect(h.region).toBe(home.regions[3]); expect(h.x0).toBe(home.regions[3].x0); expect(h.layer).toBe(BP_DEEP);
    // 西側
    const wm = src.layout.landmass(-1, 4), wq = slotOf(structureId(-1, 4, 0, 0, BP_SURFACE), src.layout);
    expect(wq.region).toBe(wm.regions[0]); expect(wq.x0).toBe(wm.regions[0].x0);
    // 海槽
    const sea = src.layout.landmass(-1, 3);
    for (const sl of sea.slots) {
      const sq = slotOf(structureId(-1, 3, 0, sl.k, BP_SURFACE), src.layout);
      expect(sq).toEqual({ x0: sl.x0, x1: sl.x1, region: sea.regions[0], layer: BP_SURFACE });
    }
    // 不同參數 → 不同 id
    const ids = new Set<number>();
    for (const side of [-1, 0, 1] as const) for (const i of [0, 1, 2, 2000]) for (const rg of [0, 1, 9]) for (const sl of [0, 3]) for (const ly of [0, 1, 2] as const) ids.add(structureId(side, i, rg, sl, ly));
    expect(ids.size).toBe(3 * 4 * 3 * 2 * 3);
    expect(() => slotOf(structureId(1, 2, 0, 99, BP_SURFACE), src.layout)).toThrow(RangeError);
  });

  it('主坑道在蓋上結構後仍走得到洞穴層', () => {
    const w = worldOf(src), s = seedInt('bp', 'g2-shaft');
    for (const r of sampleRegions(src, { home: true, perSide: 3 }).filter((q) => q.variant !== VARIANT.BEACH)) {
      const sx = shaftX(s, r);
      loadColumns(w, sx - 20, sx + 20);
      expect(bfsReachesDepth(w, sx, src.surfaceAt(sx) - 1, (x) => src.layersAt(x).deep, sx - 20, sx + 20)).toBe(true);
    }
  });
});
