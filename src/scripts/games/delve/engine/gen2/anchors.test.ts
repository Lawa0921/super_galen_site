// anchors.test.ts — gen2 錨點（M2a Task 7）：家鄉錨點的不變量（50 個種子）、錨點槽不擲機率（測試專用 test_probe，Q8）、
// 地城區只有地城錨點、地城區沒有主坑道、錨點優先於大陸的保證槽（Q15）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, landSlot, landSlotCount, slotOf, BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, SUB_SLOT_W, slotWidth, type Layer } from './blueprint';
import { ANCHOR_MAX_W, LAKE_MIN_W, anchorSpan, continentAnchors, homeAnchors, villageFits, type Anchor, type AnchorKind } from './anchors';
import { homeDungeonRegion, SPAWN_X, VARIANT, type Landmass } from './layout';
import { shaftOf, shaftX, SHAFT_REACH } from './caves';
import { hash2, seedInt } from '../noise';
import { BIOME } from '../world';
import { SEEDS5, SEEDS50 } from './testUtil';
import type { RegionInfo } from '../regionInfo';

const slotRange = (a: Anchor): { x0: number; x1: number } => landSlot(a.region, a.slot, a.layer);
const slotMid = (a: Anchor): number => { const s = slotRange(a); return (s.x0 + s.x1) / 2; };
const slotOverlapsSpawnClear = (a: Anchor): boolean => { const s = slotRange(a); return s.x0 <= SPAWN_X + 80 && s.x1 > SPAWN_X - 80; };
// 錨點可用範圍（建構器的外框只能在裡面）不碰坑道帶 [sx − SHAFT_REACH − 1, sx + SHAFT_REACH + 2)、放得下 ANCHOR_MAX_W + 兩側 8 格
// （地表湖錨點例外：放得下最窄的湖 LAKE_MIN_W 就行，建構器把湖寬夾進可用範圍，Task 17）；回 null = 合格
function spanProblem(seed: string, a: Anchor): string | null {
  if (a.kind === 'dungeon' || a.kind === 'shaft_cache') return null;
  const sp = anchorSpan(seed, a), sl = slotRange(a), sx = shaftX(seedInt(seed, 'g2-shaft'), a.region);
  if (sp.x0 < sl.x0 || sp.x1 > sl.x1) return `span [${sp.x0}, ${sp.x1}) outside slot`;
  const need = a.kind === 'lake' ? LAKE_MIN_W : ANCHOR_MAX_W[a.kind]!;
  if (sp.x1 - sp.x0 - 16 < need) return `span ${sp.x1 - sp.x0} too narrow for ${need}`;
  if (Number.isFinite(sx) && !(sp.x1 <= sx - SHAFT_REACH - 1 || sp.x0 >= sx + SHAFT_REACH + 2)) return `span [${sp.x0}, ${sp.x1}) touches shaft ${sx}`;
  const inShaft = Number.isFinite(sx) && sx >= sl.x0 && sx < sl.x1;
  if (inShaft !== sp.shaft) return 'shaft flag';
  // a.avoid（家鄉空島避開下方地廳 / 礦坑密室的槽，Task 10）：不碰它們、取扣掉坑道帶與它們之後最寬的一段
  if (a.avoid?.length) {
    const cuts = [...a.avoid, ...(Number.isFinite(sx) ? [{ x0: sx - SHAFT_REACH - 1, x1: sx + SHAFT_REACH + 2 }] : [])];
    for (const v of a.avoid) if (sp.x0 < v.x1 && v.x0 < sp.x1) return `span touches avoided [${v.x0}, ${v.x1})`;
    const edges = [sl.x0, sl.x1, ...cuts.flatMap((c) => [c.x0, c.x1])].filter((x) => x >= sl.x0 && x <= sl.x1).sort((p, q) => p - q);
    let widest = 0;
    for (const lo of edges) for (const hi of edges) if (hi > lo && cuts.every((c) => c.x1 <= lo || c.x0 >= hi)) widest = Math.max(widest, hi - lo);
    return sp.x1 - sp.x0 < widest ? 'not the widest piece' : null;
  }
  // 含坑道的槽：取較大的一側
  if (Number.isFinite(sx) && sp.x1 - sp.x0 < Math.min(sl.x1 - sl.x0, Math.max(sx - SHAFT_REACH - 1 - sl.x0, sl.x1 - sx - SHAFT_REACH - 2))) return 'not the larger side';
  return null;
}
// kind 在 layer 層放得下的槽（不碰出生點清空區、可用範圍 − 16 ≥ 最大外框；含坑道的槽也算）：plain = 不含坑道、shafted = 含坑道
// keep 收到地區、槽中點、可用範圍
// 蘑菇林錨點：首選（森林、不在地廳槽上方）還有空槽時一定在森林；選完全部錨點後仍空著的森林地下層槽，在選蘑菇林時也是空的（錨點只會增加）。
// 「空著」= 沒有地下層錨點、也不是水晶洞第 ② 段保留的那一槽（水晶洞正上方的地下層槽，anchors.ts 的 reserve 分支）；回 null = 合格
function mushroomProblem(seed: string, h: Landmass, a: readonly Anchor[]): string | null {
  const mu = a.find((q) => q.kind === 'mushroom_biome')!;
  const takenU = new Set(a.filter((q) => q.layer === BP_UNDER || q.kind === 'crystal_cave').map((q) => `${q.region.index}:${q.slot}`));
  const hallSlots = a.filter((q) => q.kind === 'hall').map(slotRange);
  const forestFree = fitSlots(seed, h.regions.filter((r) => r.biome === BIOME.FOREST && r.variant !== VARIANT.BEACH && r.variant !== VARIANT.DUNGEON), 'mushroom_biome', BP_UNDER,
    (_r, _m, sp) => hallSlots.every((hs) => hs.x1 <= sp.x0 || hs.x0 >= sp.x1)).plain.filter((q) => !takenU.has(`${q.region.index}:${q.slot}`));
  if (forestFree.length && mu.region.biome !== BIOME.FOREST) return `mushroom in biome ${mu.region.biome} with a free forest slot ${forestFree[0].region.index}:${forestFree[0].slot}`;
  if (mu.region.variant === VARIANT.BEACH || mu.region.variant === VARIANT.DUNGEON) return 'mushroom on beach / dungeon';
  return null;
}
function fitSlots(seed: string, rs: readonly RegionInfo[], kind: AnchorKind, layer: Layer, keep: (r: RegionInfo, mid: number, span: { x0: number; x1: number }) => boolean) {
  const plain: Anchor[] = [], shafted: Anchor[] = [];
  for (const r of rs) for (let q = 0; q < landSlotCount(r, layer); q++) {
    const a: Anchor = { kind, region: r, layer, slot: q }, sl = slotRange(a), sp = anchorSpan(seed, a);
    if (slotOverlapsSpawnClear(a) || !keep(r, (sl.x0 + sl.x1) / 2, sp) || sp.x1 - sp.x0 - 16 < ANCHOR_MAX_W[kind]!) continue;
    (sp.shaft ? shafted : plain).push(a);
  }
  return { plain, shafted };
}
// 藍圖所在槽的序號（槽 x0 = 地區 x0 + 序號 × 槽寬）
const slotIndex = (g: Gen2Source, id: number): number => { const s = slotOf(id, g.layout); return (s.x0 - s.region.x0) / slotWidth(s.layer); };
// 地塊 m 一個不是錨點、機率擲出遺跡 / 湖的 SURFACE 槽（不是保證槽：保證遺跡的槽另外驗，Q15）
function firstRolledSurfaceSlot(g: Gen2Source, m: Landmass): { region: RegionInfo; slot: number; x0: number; x1: number } {
  const anchored = new Set(g.blueprints.anchorsOf(m).filter((a) => a.layer === BP_SURFACE).map((a) => `${a.region.index}:${a.slot}`));
  for (const b of g.blueprints.overlapping(m.x0, m.x1, [BP_SURFACE])) {
    const s = slotOf(b.id, g.layout), slot = slotIndex(g, b.id);
    if (b.kind === 'lake' && s.region.landmass === m.i && s.region.side === m.side && !anchored.has(`${s.region.index}:${slot}`)) return { region: s.region, slot, x0: s.x0, x1: s.x1 };
  }
  throw new Error('no rolled surface slot');
}

describe('gen2 anchors', () => {
  it('家鄉錨點不變量（50 個種子都放滿，homeAnchors 不丟 RangeError）', () => {
    let shafted = 0, avoided = 0;
    for (const seed of SEEDS50) {
      const g = new Gen2Source(seed), h = g.layout.landmassAt(SPAWN_X)!, a = g.blueprints.anchorsOf(h);
      const n = (k: AnchorKind) => a.filter((q) => q.kind === k).length;
      expect(n('dungeon')).toBe(1); expect(n('village')).toBeGreaterThanOrEqual(2); expect(n('village')).toBeLessThanOrEqual(4);
      expect(n('hall')).toBeGreaterThanOrEqual(1); expect(n('mineshaft_secret')).toBe(3); expect(n('sky_island')).toBe(2);
      for (const k of ['mushroom_biome', 'crystal_cave', 'hive', 'cave_lake', 'ruin', 'alcove_snow', 'alcove_desert', 'molten_shrine', 'shaft_cache', 'spawn_tablet', 'lake'] as const) expect(n(k), `${seed} ${k}`).toBe(1);
      // 地表湖（Task 17）：同序號的天空槽不是空島（空島的繩梯垂到地面）
      const lk = a.find((q) => q.kind === 'lake')!;
      expect(a.some((q) => q.kind === 'sky_island' && q.region === lk.region && q.slot === lk.slot), `${seed} lake under sky`).toBe(false);
      expect(n('cabin')).toBe(2);
      const keys = a.map((q) => `${q.region.index}:${q.layer}:${q.slot}`); expect(new Set(keys).size).toBe(keys.length);
      for (const q of a.filter((p) => p.kind === 'village')) { expect(q.region.biome).toBe(BIOME.FOREST); expect(Math.abs(slotMid(q) - SPAWN_X)).toBeGreaterThanOrEqual(200); }
      expect(a.find((q) => q.kind === 'hive')!.region.biome).toBe(BIOME.JUNGLE);
      expect(a.find((q) => q.kind === 'alcove_snow')!.region.biome).toBe(BIOME.SNOW); expect(a.find((q) => q.kind === 'alcove_desert')!.region.biome).toBe(BIOME.DESERT);
      expect(Math.abs(slotMid(a.find((q) => q.kind === 'molten_shrine')!) - SPAWN_X)).toBeGreaterThanOrEqual(630);
      // 第 1 座地廳在非地城那一端的外圍生態地區（地廳要整槽 170 格，最外側的槽被坑道帶切到時只能放最後那個較寬的槽，
      // 槽中點可能到 509.5——所以釘地區本身、與槽中點 < 沙灘 70 + 外圍最寬 630）
      const far = a.find((q) => q.kind === 'hall')!, dWest = homeDungeonRegion(h).x0 < SPAWN_X, end = dWest ? 4200 : 0, outer = dWest ? h.regions.at(-2)! : h.regions[1];
      expect(far.region).toBe(outer);
      // 外圍地區合格的 DEEP 槽（有不含坑道的就只看那些）裡，沒有比第 1 座更靠近端點的
      const fit = fitSlots(seed, [outer], 'hall', BP_DEEP, () => true), pool = fit.plain.length ? fit.plain : fit.shafted;
      expect(pool.map((q) => q.slot)).toContain(far.slot);
      for (const q of pool) expect(Math.abs(slotMid(q) - end), `${seed} slot ${q.slot}`).toBeGreaterThanOrEqual(Math.abs(slotMid(far) - end));
      for (const q of a) expect(slotOverlapsSpawnClear(q), q.kind).toBe(false);                          // 所有層，含 MINOR 的 spawn_tablet（Q16）
      expect(a.filter((q) => q.wholeRegion).map((q) => q.kind)).toEqual(['dungeon']);
      // 每個錨點的外框可用範圍都不碰坑道帶、放得下該種最大外框（含坑道的槽也一樣）
      for (const q of a) { expect(spanProblem(seed, q), `${seed} ${q.kind} ${q.region.index}/${q.layer}:${q.slot}`).toBeNull(); if (anchorSpan(seed, q).shaft) shafted++; }
      // 空島（Task 10）：可用範圍不碰下方地廳 / 礦坑密室 / 三種小生態（Task 11 修正 1：它們的後備豎井會通到地表）的槽（avoid 涵蓋每一個與天空槽相交的）；
      // 不在表層錨點的同一槽——退讓鏈 ③④（Task 11 修正 1）放在村莊 / 遺跡的槽時，可用範圍不碰那座表層錨點實際的外框
      const meets = (p: { x0: number; x1: number }, q: { x0: number; x1: number }): boolean => p.x0 < q.x1 && q.x0 < p.x1;
      for (const k of a.filter((q) => q.kind === 'sky_island')) {
        const surf = a.find((q) => q.layer === BP_SURFACE && q.region === k.region && q.slot === k.slot);
        // 村莊 / 遺跡都有建構器（遺跡 Task 14 接上），一定建得出來
        if (surf) { expect(['village', 'ruin'], seed).toContain(surf.kind); const sb = g.blueprints.anchorBlueprint(h, surf); expect(sb, `${seed} ${surf.kind}`).not.toBeNull(); expect(meets(anchorSpan(seed, k), { x0: sb!.x, x1: sb!.x + sb!.w }), `${seed} sky over ${surf.kind}`).toBe(false); }
        for (const q of a.filter((p) => ['hall', 'mineshaft_secret', 'mushroom_biome', 'crystal_cave', 'hive'].includes(p.kind))) if (meets(slotRange(k), slotRange(q))) { avoided++; expect(meets(anchorSpan(seed, k), slotRange(q)), `${seed} sky over ${q.kind}`).toBe(false); }
      }
    }
    expect(avoided).toBeGreaterThan(0);
    // 備案（含坑道的槽）真的有用到，上面的坑道帶斷言不是空測
    expect(shafted).toBeGreaterThan(0);
  }, 120_000);

  it('錨點的層、地區與坑道規則；回傳順序 = 規則順序；確定', () => {
    const ORDER: AnchorKind[] = ['dungeon', 'village', 'hall', 'mineshaft_secret', 'sky_island', 'mushroom_biome', 'crystal_cave', 'hive', 'cave_lake', 'ruin', 'cabin', 'alcove_snow', 'alcove_desert', 'molten_shrine', 'shaft_cache', 'spawn_tablet', 'lake'];
    const LAYER: Record<string, number> = { dungeon: BP_SURFACE, village: BP_SURFACE, ruin: BP_SURFACE, lake: BP_SURFACE, hall: BP_DEEP, crystal_cave: BP_DEEP, molten_shrine: BP_DEEP, shaft_cache: BP_DEEP, sky_island: BP_SKY, spawn_tablet: BP_MINOR };
    for (const seed of SEEDS50.slice(0, 20)) {
      const g = new Gen2Source(seed), h = g.layout.landmassAt(SPAWN_X)!, a = g.blueprints.anchorsOf(h), ss = seedInt(seed, 'g2-shaft');
      expect(g.blueprints.anchorsOf(h)).toBe(a);
      expect(new Gen2Source(seed).blueprints.anchorsOf(new Gen2Source(seed).layout.landmassAt(SPAWN_X)!)).toEqual(a);
      const idx = a.map((q) => ORDER.indexOf(q.kind));
      expect(idx).toEqual([...idx].sort((p, q) => p - q));
      const dz = homeDungeonRegion(h);
      expect(a[0]).toEqual({ kind: 'dungeon', region: dz, layer: BP_SURFACE, slot: 0, wholeRegion: true });
      for (const q of a) {
        expect(q.layer, q.kind).toBe(LAYER[q.kind] ?? BP_UNDER);
        expect(q.region.kind).toBe('home'); expect(q.region.variant).not.toBe(VARIANT.BEACH);
        if (q.kind !== 'dungeon') expect(q.region.variant, q.kind).not.toBe(VARIANT.DUNGEON);
        const s = slotRange(q), sx = shaftX(ss, q.region), inShaft = Number.isFinite(sx) && sx >= s.x0 && sx < s.x1;
        if (q.kind === 'shaft_cache') expect(inShaft).toBe(true);
        expect(spanProblem(seed, q), `${seed} ${q.kind}`).toBeNull();
      }
      // 主坑道最深的那個地區、其坑道所在的 DEEP 槽
      const sc = a.find((q) => q.kind === 'shaft_cache')!;
      const bottom = (r: RegionInfo): number => shaftOf(ss, r, (x) => g.profile.surfaceAt(x), (x) => g.profile.layersAt(x).deep)?.bottom ?? -1;
      expect(bottom(sc.region)).toBe(Math.max(...h.regions.map(bottom)));
      // 礦坑密室彼此 ≥ 2 槽、離出生點 ≥ 160；空島離出生點 ≥ 250；出生石碑在出生點東側
      const ms = a.filter((q) => q.kind === 'mineshaft_secret');
      for (const p of ms) { expect(Math.abs(slotMid(p) - SPAWN_X)).toBeGreaterThanOrEqual(160); for (const q of ms) if (p !== q) expect(Math.abs(slotMid(p) - slotMid(q))).toBeGreaterThanOrEqual(2 * SUB_SLOT_W); }
      // 空島：退讓鏈 ②（Task 11 修正 1）不限 SKY_MIN，所以只斷言退讓後仍成立的：槽不碰出生點清空區（上面對所有錨點驗過），
      // 槽寬 ≥ 340 時中點離出生點因此 ≥ 80 + 170 = 250（只有不到 340 寬的地區單槽才可能更近）
      for (const q of a.filter((p) => p.kind === 'sky_island')) { const sl = slotRange(q); if (sl.x1 - sl.x0 >= 340) expect(Math.abs(slotMid(q) - SPAWN_X)).toBeGreaterThanOrEqual(250); }
      expect(slotMid(a.find((q) => q.kind === 'spawn_tablet')!)).toBeGreaterThan(SPAWN_X);
      expect(a.find((q) => q.kind === 'ruin')!.region.biome).not.toBe(BIOME.SNOW);
      // 蘑菇林：首選（森林、不在地廳槽上方）還有空槽時一定在森林；選完全部錨點後仍空著的森林地下層槽，在選蘑菇林時也是空的（錨點只會增加）
      expect(mushroomProblem(seed, h, a)).toBeNull();
      expect(continentAnchors(seed, g.layout.landmass(1, 2), g.profile)).toEqual([]);
    }
  }, 120_000);

  it('錨點的槽不擲機率：沒登錄建構器的錨點槽是空的（測試專用 test_probe，Q8）', () => {
    // 家鄉放得下東西的表層槽都是錨點（村莊 / 遺跡；M2a Task 7 的坑道規則之後），改用大陸上擲出湖的表層槽
    // （湖只來自機率表，不會是保證槽）：依序找東西兩側前幾片大陸的第一個
    const seed = 'anc', g = new Gen2Source(seed);
    const found = [2, 4, 6].flatMap((i) => [1, -1].map((sd) => g.layout.landmass(sd as 1 | -1, i))).map((m) => { try { return { h: m, free: firstRolledSurfaceSlot(g, m) }; } catch { return null; } }).find((e) => e)!;
    const { h, free } = found;
    const idx = new BlueprintIndex(seed, g.layout, g.profile, { extraAnchors: (m) => (m === h ? [{ kind: 'test_probe', region: free.region, layer: BP_SURFACE, slot: free.slot }] : []) });
    expect(idx.overlapping(free.x0, free.x1).filter((b) => b.layer === BP_SURFACE && b.x >= free.x0 && b.x < free.x1)).toEqual([]);
    expect(g.blueprints.overlapping(free.x0, free.x1).filter((b) => b.layer === BP_SURFACE && b.x >= free.x0 && b.x < free.x1).length).toBe(1);
    // 測試接縫併進 anchorsOf
    expect(idx.anchorsOf(h).at(-1)).toMatchObject({ kind: 'test_probe', slot: free.slot });
    expect(idx.anchorsOf(h).length).toBe(g.blueprints.anchorsOf(h).length + 1);
  });

  it('地城區只有地城錨點：其他層、機率表都不放（整區只有一份 wholeRegion 的地城藍圖，M2a Task 8）', () => {
    for (const seed of SEEDS50.slice(0, 20)) {
      const g = new Gen2Source(seed), dz = homeDungeonRegion(g.layout.landmassAt(SPAWN_X)!);
      expect(g.blueprints.overlapping(dz.x0, dz.x1).map((b) => [b.kind, b.layer, b.wholeRegion]), seed).toEqual([['dungeon', BP_SURFACE, true]]);
    }
  }, 60_000);

  it('村莊數 = 擲出的 2 / 3 / 4，只有家鄉放得下村莊的槽（含坑道槽）不夠時才少（600 個種子）', () => {
    const dist: Record<number, number> = { 2: 0, 3: 0, 4: 0 };
    let short = 0;
    for (let k = 0; k < 600; k++) {
      const seed = `vil-${k}`, g = new Gen2Source(seed), h = g.layout.landmassAt(SPAWN_X)!;
      const got = g.blueprints.anchorsOf(h).filter((q) => q.kind === 'village').length;
      const hv = hash2(1, 0, seedInt(seed, 'g2-anchor')), rolled = hv < 0.15 ? 2 : hv < 0.75 ? 3 : 4;
      // 村莊在其他表層錨點之前選（地城不在森林），所以容量 = 全家鄉放得下村莊的森林表層槽
      const fit = fitSlots(seed, h.regions.filter((r) => r.variant !== VARIANT.BEACH && r.variant !== VARIANT.DUNGEON), 'village', BP_SURFACE,
        (r, mid, span) => r.biome === BIOME.FOREST && [VARIANT.PLAIN, VARIANT.HILLS, VARIANT.SPAWN].includes(r.variant as never) && Math.abs(mid - SPAWN_X) >= 200
          && villageFits(span, SPAWN_X));
      const cap = fit.plain.length + fit.shafted.length;
      expect(got, `${seed} rolled ${rolled} cap ${cap}`).toBe(Math.min(rolled, cap));
      if (got < rolled) { expect(cap).toBeLessThan(rolled); short++; }
      dist[got]++;
    }
    // 實測（M2a Task 7 修正 1）：2 / 3 / 4 座 = 104 / 381 / 115、因容量不足而少的 20 個；擲到 4 的 25% 大多真的放 4 座。
    // Task 9 起村莊中心要離出生點 > 200（移不開的含坑道槽不放）：113 / 377 / 110、少的 33 個
    expect(dist[4]).toBeGreaterThan(600 * 0.18); expect(short).toBeLessThan(600 * 0.06);
  }, 120_000);

  it('整個家鄉找不到放得下的槽 → RangeError（不默默少放）', () => {
    const g = new Gen2Source('anc-0'), h = g.layout.landmassAt(SPAWN_X)!;
    // 同一個家鄉，但沒有森林（村莊沒有合格槽）
    const noForest: Landmass = { ...h, regions: h.regions.map((r) => (r.biome === BIOME.FOREST && r.variant !== VARIANT.BEACH && r.variant !== VARIANT.DUNGEON ? { ...r, biome: BIOME.DESERT } : r)) };
    expect(() => homeAnchors('anc-0', noForest, g.profile)).toThrow(/no slot for anchor village/);
    expect(homeAnchors('anc-0', h, g.profile)).toEqual(g.blueprints.anchorsOf(h));
  });

  it('ANCHOR_MAX_W 對得上已存在建構器的實際外框寬（小屋 / 遺跡 / 地下湖：都不超過、最大值貼近上限）', () => {
    const widest: Record<string, number> = {};
    for (const seed of ['bp', ...SEEDS5]) for (const b of new Gen2Source(seed).blueprints.overlapping(-40_000, 40_000)) {
      if (b.kind !== 'cabin' && b.kind !== 'ruin' && b.kind !== 'cave_lake') continue;
      expect(b.w, `${seed} ${b.kind}`).toBeLessThanOrEqual(ANCHOR_MAX_W[b.kind]!);
      widest[b.kind] = Math.max(widest[b.kind] ?? 0, b.w);
    }
    // 上限不是亂抓的大數：取樣到的最大值離上限不遠
    for (const k of ['cabin', 'ruin', 'cave_lake'] as const) expect(widest[k], k).toBeGreaterThanOrEqual(ANCHOR_MAX_W[k]! - 6);
  }, 120_000);

  it('地城區沒有主坑道', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed); expect(shaftX(seedInt(seed, 'g2-shaft'), homeDungeonRegion(g.layout.landmassAt(SPAWN_X)!))).toBeNaN(); } });

  it('錨點優先於大陸的保證小屋 / 遺跡（Q15）：佔掉原本有小屋 / 遺跡的槽，保證改找剩下的槽（仍 ≥ 1）', () => {
    for (const seed of SEEDS5) for (const i of [2, 4]) {
      const g = new Gen2Source(seed), m = g.layout.landmass(1, i);
      const inM = (idx: BlueprintIndex) => idx.overlapping(m.x0, m.x1).filter((b) => b.x >= m.x0 && b.x < m.x1);
      const before = inM(g.blueprints).filter((b) => (b.kind === 'cabin' && b.layer === BP_UNDER) || (b.kind === 'ruin' && b.layer === BP_SURFACE));
      const probes: Anchor[] = before.map((b) => ({ kind: 'test_probe', region: slotOf(b.id, g.layout).region, layer: b.layer, slot: slotIndex(g, b.id) }));
      const idx = new BlueprintIndex(seed, g.layout, g.profile, { extraAnchors: (q) => (q === m ? probes : []) });
      const after = inM(idx), ids = new Set(before.map((b) => b.id));
      expect(after.filter((b) => ids.has(b.id)), `${seed} ${i}`).toEqual([]);
      expect(after.filter((b) => b.kind === 'cabin').length, `${seed} ${i}`).toBeGreaterThanOrEqual(1);
      expect(after.filter((b) => b.kind === 'ruin').length, `${seed} ${i}`).toBeGreaterThanOrEqual(1);
    }
  }, 60_000);
  // 修正第 1 輪（Task 11 審查）：rg-74 / rg-10181 等種子村莊擲到 4 座吃光天空合格槽，兩座空島放不下 → 開機 RangeError；
  // 森林的地下層槽被吃光時蘑菇林也放不下。30,000 個種子 homeAnchors 0 個 RangeError；原有保證不變（地城 1、村莊 2–4、礦坑密室 3、空島 2）
  for (const part of [0, 1, 2]) {
    it(`30,000 個種子（rg-${part * 10_000}..${part * 10_000 + 9999}）homeAnchors 0 個 RangeError；地城 1、村莊 2–4、礦坑密室 3、空島 2、三種小生態各 1`, () => {
      const errors: string[] = [];
      for (let k = part * 10_000; k < (part + 1) * 10_000; k++) {
        const seed = `rg-${k}`, g = new Gen2Source(seed);
        try {
          const a = homeAnchors(seed, g.layout.landmassAt(SPAWN_X)!, g.profile), n = (kind: AnchorKind): number => a.filter((q) => q.kind === kind).length;
          const v = n('village');
          if (n('dungeon') !== 1 || v < 2 || v > 4 || n('mineshaft_secret') !== 3 || n('sky_island') !== 2 || n('mushroom_biome') !== 1 || n('crystal_cave') !== 1 || n('hive') !== 1) errors.push(`${seed}: counts`);
        } catch (e) { if (!(e instanceof RangeError)) throw e; errors.push(`${seed}: ${e.message}`); }
      }
      expect(errors.slice(0, 5)).toEqual([]);
    }, 120_000);
  }
  // 修正第 3 輪：mx-0..2999（沒調過參的前綴）的蘑菇林規則；修正前的判定漏算水晶洞保留的地下層槽，mx-1121 / 1630 / 2826 / 2982 誤判（RED）
  it('蘑菇林錨點首選可用時在森林（mx-0..2999；水晶洞第 ② 段保留的地下層槽算已佔）', () => {
    const bad: string[] = [];
    for (let k = 0; k < 3000; k++) {
      const seed = `mx-${k}`, g = new Gen2Source(seed), h = g.layout.landmassAt(SPAWN_X)!, p = mushroomProblem(seed, h, homeAnchors(seed, h, g.profile));
      if (p) bad.push(`${seed}: ${p}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  }, 120_000);
});
