// settlements.test.ts — gen2 家鄉的村莊與矮人地廳（M2a Task 9；spec §4.4「2–4 個村莊、至少 1 座矮人廳」）：
// 跨層不重疊（Q10：crossYields 的優先序、家鄉與外圍零重疊）、村莊 / 地廳的內容、畫圖時依賴實心的格在成品裡真的是實心
// （BpCanvas 的回退讀取不知道洞穴，靠 solid 蓋住）、地廳隧道接到天然洞穴、錨點建構器在最窄的可用範圍內、
// 居民（開局就有、白天在村裡 / 晚上在屋裡、委託板找得到村長、房主與客人同一批 NPC）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { homeSites } from './home';
import { BlueprintIndex, slotOf, crossYields, structureId, emptyObjects, BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, type Blueprint, type BpCtx, type Layer } from './blueprint';
import { ANCHOR_MAX_W, anchorSpan, villageFits, registerAnchorBuild, type Anchor } from './anchors';
import { buildVillageBp } from './structures/village';
import { buildHallBp } from './structures/hall';
import { homeDungeonRegion, SPAWN_X, VARIANT, type Landmass } from './layout';
import { worldOf, loadColumns, firstSolid, overlapPairs } from './testUtil';
import { Filler2 } from './fill';
import { seedInt } from '../noise';
import { T, W, isSolidTile } from '../tiles';
import { BIOME } from '../world';
import { checkRoom } from '../housing';
import { DelveGame } from '../game';
import { FIXED_DT, TILE_SIZE as S } from '../constants';
import type { World } from '../world';
import type { GenSite, HallInfo, VillageInfo } from '../genTypes';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `set-${k}`);
const SEEDS2 = SEEDS20.slice(0, 2);
// 本檔登錄 test_probe 的建構器（只在本檔的模組實例裡）：probeBox 決定蓋什麼
let probeBox: (c: BpCtx) => Blueprint = () => { throw new Error('probe not set'); };
registerAnchorBuild('test_probe', (c) => probeBox(c));

// 每個種子一個 Gen2Source（檔案內共用）
const SRC = new Map<string, Gen2Source>();
function srcOf(seed: string): Gen2Source {
  let s = SRC.get(seed);
  if (!s) { s = new Gen2Source(seed); SRC.set(seed, s); }
  return s;
}
const homeOf = (src: Gen2Source): Landmass => src.layout.landmassAt(SPAWN_X)!;
const sitesOf = (seed: string): GenSite[] => homeSites(srcOf(seed));
const homeBlueprints = (seed: string): Blueprint[] => { const s = srcOf(seed), h = homeOf(s); return s.blueprints.overlapping(h.x0, h.x1); };
type Village = Extract<GenSite, { kind: 'village' }>;
type Hall = Extract<GenSite, { kind: 'hall' }>;
const villagesOf = (seed: string): Village[] => sitesOf(seed).filter((q): q is Village => q.kind === 'village');
const hallSitesOf = (seed: string): Hall[] => sitesOf(seed).filter((q): q is Hall => q.kind === 'hall');
// 村莊 [x0, x1] 與家鄉地城區 [dz.x0, dz.x1) 的水平距離
function distToDungeonZone(seed: string, v: VillageInfo): number {
  const dz = homeDungeonRegion(homeOf(srcOf(seed)));
  return v.x0 >= dz.x1 ? v.x0 - (dz.x1 - 1) : dz.x0 - v.x1;
}
// 只有外框的假藍圖
const box = (layer: Layer, x: number, y: number, w: number, h: number): Blueprint =>
  ({ id: 0, kind: 'ruin', layer, x, y, w, h, cells: new Int32Array(0), chests: [], ...emptyObjects() });
// [x0, x1] 欄、全部列的 tile 數
function count(w: World, x0: number, x1: number, t: number): number {
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let y = 0; y < w.height; y++) if (w.getFg(x, y) === t) n++;
  return n;
}
function liquidCells(w: World, x0: number, y0: number, x1: number, y1: number): number {
  let n = 0;
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (w.getLiquid(x, y) > 0) n++;
  return n;
}
// 藍圖：外框含 (x, ·) 的那份 kind 藍圖
const bpAt = (src: Gen2Source, x: number, kind: string, layer: Layer): Blueprint => src.blueprints.overlapping(x, x + 1, [layer]).find((b) => b.kind === kind)!;
// 地廳 + 已載入的世界 + 地廳內部各欄 deep 的最大值 / molten 的最小值
interface HallCase { seed: string; info: HallInfo; w: World; bp: Blueprint; deep: number; molten: number }
function hallsOf(seeds: readonly string[]): HallCase[] {
  const out: HallCase[] = [];
  for (const seed of seeds) {
    const src = srcOf(seed), w = worldOf(src);
    for (const s of hallSitesOf(seed)) {
      const h = s.info, bp = bpAt(src, h.x0, 'hall', BP_DEEP);
      loadColumns(w, bp.x - 80, bp.x + bp.w + 80);
      let deep = 0, molten = Infinity;
      for (let x = h.x0; x <= h.x1; x++) { const L = src.layersAt(x); deep = Math.max(deep, L.deep); molten = Math.min(molten, L.molten); }
      out.push({ seed, info: h, w, bp, deep, molten });
    }
  }
  return out;
}
// 從地廳中央走「不擋身體」的格（4 鄰、門可開、不進液體），範圍 = 外框外擴 80 欄、外框上方 80 列到地板下 40 列；回走到外框外的格數
function reachOutside(h: HallCase): number {
  const { w, bp, info } = h, x0 = bp.x - 80, x1 = bp.x + bp.w + 80, y0 = Math.max(0, bp.y - 80), y1 = info.floorY + 40, W = x1 - x0;
  const pass = (x: number, y: number): boolean => { const t = w.getFg(x, y); return !isSolidTile(t) || t === T.DOOR_CLOSED; };
  const seen = new Uint8Array(W * (y1 - y0)), sx = (info.x0 + info.x1) >> 1, sy = info.floorY - 2;
  const st = [sx, sy];
  seen[(sy - y0) * W + sx - x0] = 1;
  let out = 0;
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (x < bp.x || x >= bp.x + bp.w || y < bp.y || y >= bp.y + bp.h) out++;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const k = (ny - y0) * W + nx - x0;
      if (seen[k] || !pass(nx, ny) || w.getLiquid(nx, ny) > 0) continue;
      seen[k] = 1; st.push(nx, ny);
    }
  }
  return out;
}
// 錨點 a 的 BpCtx（照 BlueprintIndex：structureId、anchorSpan），可另給可用範圍
function anchorCtx(seed: string, a: Anchor, span?: { x0: number; x1: number }): BpCtx {
  const src = srcOf(seed), m = homeOf(src), sp = span ?? anchorSpan(seed, a);
  return { seed, s: seedInt(seed, 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
    region: a.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x), rank: 0, spawnX: SPAWN_X };
}

// 用 bp 取代真的地廳 real 填欄，從豎井口上方的地表（sx, top − 1）走（4 鄰、不擋身體的格）到大廳地板；繩梯從 top 垂到地板上 2 格
function walkToHall(seed: string, real: Blueprint, bp: Blueprint, sx: number, top: number): boolean {
  const src = srcOf(seed), h = (bp.site as Hall).info;
  const stub = { overlapping: (x0: number, x1: number, l?: readonly Layer[]) => src.blueprints.overlapping(x0, x1, l).map((b) => (b.id === real.id ? bp : b)).filter((b) => b.x < x1 && b.x + b.w > x0) } as unknown as BlueprintIndex;
  const filler = new Filler2(seed, src.layout, src.profile, stub);
  const w = worldOf({ version: 0, fill: (c, x0, x1) => filler.fill(c, x0, x1), surfaceAt: (x) => src.surfaceAt(x), biomeAt: (x) => src.biomeAt(x), layersAt: (x) => src.layersAt(x) });
  loadColumns(w, bp.x, bp.x + bp.w);
  for (let y = top; y <= h.floorY - 2; y++) expect(w.getFg(sx, y), `rope ${y}`).toBe(T.ROPE);
  const goal = { x: (h.x0 + h.x1) >> 1, y: h.floorY - 1 }, seen = new Set<number>(), st = [sx, top - 1];
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (x === goal.x && y === goal.y) return true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const k = ny * 100_000 + nx;
      if (nx < bp.x || nx >= bp.x + bp.w || ny < bp.y - 1 || ny > h.floorY || seen.has(k) || isSolidTile(w.getFg(nx, ny))) continue;
      seen.add(k); st.push(nx, ny);
    }
  }
  return false;
}

describe('gen2 家鄉的村莊與矮人地廳', () => {
  it('跨層優先序（Q10）：錨點 > 保證 > 機率；同級丟較深的；SKY / MINOR 同級讓位；不相交不丟', { timeout: 10_000 }, () => {
    const S_ = box(BP_SURFACE, 0, 300, 100, 40), U = box(BP_UNDER, 10, 320, 60, 40), K = box(BP_SKY, 0, 250, 40, 20), far = box(BP_DEEP, 500, 320, 40, 40);
    expect(crossYields(U, 0, S_, 0)).toBe(true); expect(crossYields(S_, 0, U, 0)).toBe(false);
    expect(crossYields(S_, 0, U, 2)).toBe(true); expect(crossYields(U, 1, S_, 0)).toBe(false);
    expect(crossYields(K, 0, box(BP_SURFACE, 0, 260, 40, 20), 0)).toBe(true); expect(crossYields(U, 0, far, 2)).toBe(false);
    // 同層、液體不歸這條規則管（液體照舊 liquidYields）
    expect(crossYields(box(BP_UNDER, 0, 300, 50, 50), 0, U, 2)).toBe(false);
    expect(crossYields({ ...U, kind: 'cave_lake' }, 0, S_, 2)).toBe(false); expect(crossYields(U, 0, { ...S_, kind: 'lake' }, 0)).toBe(false);
    // 例外（Task 17）：家鄉的地表湖錨點（lake、等級 2）不讓位，碰到它的非液體機率 / 保證藍圖讓位；錨點碰到它不讓（BlueprintIndex 丟 RangeError）；液體照舊
    expect(crossYields(U, 0, { ...S_, kind: 'lake' }, 2)).toBe(true); expect(crossYields(U, 1, { ...S_, kind: 'lake' }, 2)).toBe(true);
    expect(crossYields(U, 2, { ...S_, kind: 'lake' }, 2)).toBe(false); expect(crossYields({ ...U, kind: 'cave_lake' }, 0, { ...S_, kind: 'lake' }, 2)).toBe(false);
  });

  it('跨層規則在索引裡生效：注入的錨點（UNDER）外框壓到機率擲出的遺跡（SURFACE）→ 遺跡消失、錨點留著；不相交 → 都在', () => {
    const seed = 'set-x', g = srcOf(seed);
    // 東側第一片有 ≥ 2 座遺跡的大陸的最後一座遺跡（機率或保證槽；兩種等級都低於錨點）；uq = 遺跡中心所在的地下層 170 格槽
    let ruin: Blueprint | null = null, m: Landmass | null = null;
    for (let i = 1; !ruin && i < 12; i++) {
      const q = g.layout.landmass(1, i);
      if (q.kind !== 'continent') continue;
      const all = g.blueprints.overlapping(q.x0, q.x1, [BP_SURFACE]).filter((b) => b.kind === 'ruin');
      if (all.length >= 2) { ruin = all[all.length - 1]; m = q; }
    }
    expect(ruin).not.toBeNull();
    const r = slotOf(ruin!.id, g.layout).region, uq = Math.floor((ruin!.x + (ruin!.w >> 1) - r.x0) / 170);
    const make = (dy: number): BlueprintIndex => {
      const w = Math.min(ruin!.w, 40);
      probeBox = (c) => ({ ...box(BP_UNDER, Math.max(c.slotX0 + 8, Math.min(ruin!.x, c.slotX1 - 8 - w)), ruin!.y + dy, w, 10), id: c.id });
      return new BlueprintIndex(seed, g.layout, g.profile, { extraAnchors: (q) => (q === m ? [{ kind: 'test_probe', region: r, layer: BP_UNDER, slot: uq }] : []) });
    };
    const hit = make(0).overlapping(ruin!.x, ruin!.x + ruin!.w);
    expect(hit.some((b) => b.id === ruin!.id)).toBe(false);
    expect(hit.some((b) => b.layer === BP_UNDER && b.kind === 'ruin' && b.id === structureId(m!.side, m!.i, r.index, uq, BP_UNDER))).toBe(true);
    const miss = make(400).overlapping(ruin!.x, ruin!.x + ruin!.w);
    expect(miss.some((b) => b.id === ruin!.id)).toBe(true);
  }, 60_000);

  it('錨點與錨點跨層相交 → RangeError（不默默丟掉較深的錨點）', () => {
    const seed = SEEDS20[0], g = srcOf(seed), m = homeOf(g), v = villagesOf(seed)[0], vb = bpAt(g, v.info.x0, 'village', BP_SURFACE);
    // 村莊底下、還沒有錨點的地下 / 深層 170 格槽（外框中心或兩端所在的槽）
    const r = slotOf(vb.id, g.layout).region, used = new Set(g.blueprints.anchorsOf(m).map((a) => `${a.region.index}:${a.layer}:${a.slot}`));
    const cands = ([BP_UNDER, BP_DEEP] as const).flatMap((layer) => [vb.x + (vb.w >> 1), vb.x + 9, vb.x + vb.w - 9].map((x) => ({ layer, slot: Math.floor((x - r.x0) / 170) })));
    const at = cands.find((q) => !used.has(`${r.index}:${q.layer}:${q.slot}`))!;
    expect(at).toBeDefined();
    probeBox = (c) => ({ ...box(at.layer, Math.max(c.slotX0 + 8, Math.min(vb.x + 9, c.slotX1 - 8 - 30)), vb.y, 30, 10), id: c.id });
    const idx = new BlueprintIndex(seed, g.layout, g.profile, { extraAnchors: (q) => (q === m ? [{ kind: 'test_probe', region: r, layer: at.layer, slot: at.slot }] : []) });
    expect(() => idx.overlapping(vb.x, vb.x + vb.w)).toThrow(/anchors .* overlap across layers/);
  }, 60_000);

  it('§4.4：家鄉 2–4 個村莊、≥ 1 座地廳；村莊在森林、離出生點 > 200、離地城區 > 60、不與其他藍圖重疊', () => { for (const seed of SEEDS20) { const s = sitesOf(seed);
    const v = s.filter((q) => q.kind === 'village'), h = s.filter((q): q is Hall => q.kind === 'hall');
    expect(v.length).toBeGreaterThanOrEqual(2); expect(v.length).toBeLessThanOrEqual(4); expect(h.length).toBeGreaterThanOrEqual(1);
    for (const q of villagesOf(seed)) { const c = (q.info.x0 + q.info.x1) >> 1; expect(Math.abs(c - SPAWN_X)).toBeGreaterThan(200); expect(distToDungeonZone(seed, q.info)).toBeGreaterThan(60);
      expect(srcOf(seed).profile.regionAt(c)!.biome).toBe(BIOME.FOREST); }
    expect(overlapPairs(homeBlueprints(seed)), seed).toEqual([]);
    // 每個登錄了建構器的家鄉錨點都有藍圖（錨點彼此不相交，沒有錨點被跨層規則丟掉）；依 x 排序
    const anchors = srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed)));
    expect(v.length, seed).toBe(anchors.filter((a) => a.kind === 'village').length); expect(h.length, seed).toBe(anchors.filter((a) => a.kind === 'hall').length);
    const xs = s.map((q) => (q.kind === 'hermit' ? q.at.x : q.kind === 'dungeon' ? q.info.bbox.x : q.info.x0));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  } }, 180_000);

  it('外圍（大陸）也沒有跨層重疊的非液體藍圖（Q10 全面適用）', () => {
    for (const seed of SEEDS20.slice(0, 5)) expect(overlapPairs(srcOf(seed).blueprints.overlapping(-20_000, 20_000)), seed).toEqual([]);
  }, 120_000);

  it('村莊：≥ 2 棟房子（門、床、茅草屋頂、checkRoom 通過）、委託板、2 支旗桿（FLAG_CLOTH 18、FLAG_LAMP 2）、沒有液體；地面覆寫 = 第一個實心格', () => {
    for (const seed of SEEDS2) { const g = srcOf(seed), w = worldOf(g); for (const q of villagesOf(seed)) { const v = q.info;
      loadColumns(w, v.x0 - 12, v.x1 + 12); expect(v.houses.length).toBeGreaterThanOrEqual(2);
      for (const hs of v.houses) {
        expect(checkRoom(w, (hs.x0 + hs.x1) >> 1, hs.floorY - 2)).not.toBeNull();
        expect(count(w, hs.x0, hs.x1, T.DOOR_CLOSED)).toBe(3);
        expect(count(w, hs.x0, hs.x1, T.BED_HEAD)).toBe(1);
        expect(count(w, hs.x0 - 1, hs.x1 + 1, T.THATCH)).toBeGreaterThan(10);
      }
      expect(w.getFg(v.board.x, v.board.y)).toBe(T.QUEST_BOARD); expect(count(w, v.x0 - 3, v.x1 + 3, T.FLAG_CLOTH)).toBe(18); expect(count(w, v.x0 - 3, v.x1 + 3, T.FLAG_LAMP)).toBe(2);
      expect(liquidCells(w, v.x0 - 10, v.ground - 30, v.x1 + 10, v.ground + 6)).toBe(0);
      // 房子自己的牆 / 屋頂（地面以上）不算地面
      const house = (x: number, y: number): boolean => y < v.ground && v.houses.some((h) => x >= h.x0 - 1 && x <= h.x1 + 1);
      for (let x = v.x0; x <= v.x1; x++) { expect(g.surfaceAt(x), `${seed} x ${x}`).toBe(v.ground); expect(g.surfaceAt(x), `${seed} x ${x}`).toBe(firstSolid(w, x, (y) => house(x, y))); }
      // 地面覆寫涵蓋兩側緩坡（外框 x0 − 9 .. x1 + 9，Task 4 延續事項）
      const bp = bpAt(g, v.x0, 'village', BP_SURFACE);
      expect(bp.ground!.x0).toBe(v.x0 - 9); expect(bp.ground!.tops.length).toBe(v.x1 - v.x0 + 1 + 18);
      expect([bp.x, bp.w]).toEqual([v.x0 - 9, v.x1 - v.x0 + 1 + 18]);
      // floors：委託板 + 廣場
      expect(bp.floors[0]).toEqual(v.board); expect(bp.floors.length).toBeGreaterThanOrEqual(6);
    } } }, 120_000);

  it('畫圖時依賴實心的格在成品裡是實心（BpCanvas 回退不知道洞穴 → solid 蓋住）：村莊每欄地面到 max(地面 + 6, 原地表 + 3)、地廳隧道的地板與頂', () => {
    // 6 個種子：沒有 solid 時 20 個種子的村莊有 578 格、地廳隧道有 921 格是洞（實測；前 6 個種子村莊 498、地廳 265）
    const seeds = SEEDS20.slice(0, 6), holes: string[] = [], boxes: Blueprint[] = [];
    let villages = 0;
    for (const seed of seeds) {
      const g = srcOf(seed), w = worldOf(g);
      for (const q of villagesOf(seed)) {
        const v = q.info, bp = bpAt(g, v.x0, 'village', BP_SURFACE);
        loadColumns(w, bp.x, bp.x + bp.w);
        villages++; boxes.push(bp);
        for (let x = bp.x; x < bp.x + bp.w; x++) {
          const top = g.surfaceAt(x), s0 = g.profile.surfaceAt(x);
          for (let y = top; y < Math.max(top + 6, s0 + 3); y++) if (!isSolidTile(w.getFg(x, y))) holes.push(`${seed} village ${x},${y}`);
        }
      }
    }
    expect(villages).toBeGreaterThanOrEqual(12);
    for (const h of hallsOf(seeds)) {
      boxes.push(h.bp);
      for (const t of h.info.tunnels) for (let x = t.x0; x <= t.x1; x++) {
        if (!isSolidTile(h.w.getFg(x, h.info.floorY))) holes.push(`${h.seed} hall floor ${x}`);
        if (!isSolidTile(h.w.getFg(x, h.info.floorY - 5))) holes.push(`${h.seed} hall roof ${x}`);
      }
    }
    expect(holes.slice(0, 5), `${holes.length} holes`).toEqual([]);
    // solid = 整個外框
    for (const b of boxes) expect(b.solid).toEqual({ x: b.x, y: b.y, w: b.w, h: b.h });
  }, 180_000);

  it('地廳：在 deep 與 molten 之間、熔爐 / 礦車 / DWARF_WALL / 兩端軌道', () => { for (const h of hallsOf(SEEDS2)) {
    expect(h.info.floorY).toBeGreaterThan(h.deep); expect(h.info.floorY).toBeLessThan(h.molten); expect(h.w.getFg(h.info.forge.x, h.info.forge.y)).toBe(T.DWARF_FORGE);
    expect(h.w.getFg(h.info.cart.x, h.info.cart.y)).toBe(T.ORE_CART); expect(h.w.getFg(h.info.x0 - 5, h.info.floorY - 1)).toBe(T.RAIL);
    expect(h.w.getFg(h.info.x1 + 5, h.info.floorY - 1)).toBe(T.RAIL); expect(h.w.getWall(h.info.x0 + 3, h.info.floorY - 3)).toBe(W.DWARF_WALL);
    expect(h.bp.landmarks).toEqual([{ x: h.info.cart.x, y: h.info.cart.y, tile: T.ORE_CART, site: 'dwarf_hall' }]);
    expect(h.info.floorY).toBeGreaterThanOrEqual(h.deep + 24 + 13);
  } }, 120_000);

  it('地廳隧道每側 20–36 格、接到天然洞穴（隧道口外那欄有洞），從大廳走得到外框外的洞穴', () => {
    const halls = hallsOf(SEEDS20.slice(0, 6));
    expect(halls.length).toBeGreaterThanOrEqual(6);
    for (const h of halls) {
      const [l, r] = h.info.tunnels;
      expect(l.x1).toBe(h.info.x0 - 3); expect(r.x0).toBe(h.info.x1 + 3);
      for (const t of [l, r]) { expect(t.x1 - t.x0 + 1).toBeGreaterThanOrEqual(20); expect(t.x1 - t.x0 + 1).toBeLessThanOrEqual(36); }
      expect(h.bp.w).toBeLessThanOrEqual(154);
      expect(reachOutside(h), `${h.seed} hall ${h.info.x0}`).toBeGreaterThanOrEqual(300);
    }
  }, 180_000);

  it('後備（整個 floorY 範圍都接不到洞穴）：大廳中央 2 格寬的豎井 + 繩梯通到地表，外框往上延伸到地表、仍是 solid；從地表走得到大廳', () => {
    const seed = SEEDS20[0], src = srcOf(seed), m = homeOf(src), a = src.blueprints.anchorsOf(m).find((q) => q.kind === 'hall')!;
    const real = src.blueprints.anchorBlueprint(m, a)!, bp = buildHallBp(anchorCtx(seed, a), { caveOpen: () => false });
    const h = (bp.site as Hall).info, sx = (h.x0 + h.x1) >> 1, top = Math.min(src.profile.surfaceAt(sx), src.profile.surfaceAt(sx + 1));
    expect(bp.site?.kind).toBe('hall');
    // 兩側 36 格、外框上緣 = 地表上一格、整個外框是 solid
    for (const t of h.tunnels) expect(t.x1 - t.x0 + 1).toBe(36);
    expect(bp.y).toBe(top - 1); expect(bp.y + bp.h).toBe(h.floorY + 3); expect(bp.solid).toEqual({ x: bp.x, y: bp.y, w: bp.w, h: bp.h });
    expect(walkToHall(seed, real, bp, sx, top)).toBe(true);
  }, 60_000);

  // Task 21（Task 9 審查 Minor）：家鄉地廳的後備豎井原本固定在大廳中央、外框整片從地表起——上方有村莊錨點時兩個錨點跨層相交 → 開機 RangeError
  it('後備豎井避開上方的表層錨點（surfaceBan）：豎井移到不碰村莊的欄、地廳帶部件，與村莊不相交（不丟 RangeError），繩梯照樣從地表通到大廳', () => {
    const seed = SEEDS20[0], src = srcOf(seed), m = homeOf(src), a = src.blueprints.anchorsOf(m).find((q) => q.kind === 'hall')!;
    const real = src.blueprints.anchorBlueprint(m, a)!, sp = anchorSpan(seed, a), c = (sp.x0 + sp.x1) >> 1;
    // 蓋住大廳中央的假村莊（最寬的 91 欄、天空到地表下 10 格）
    const village: Blueprint = { ...box(BP_SURFACE, c - 45, 0, 91, src.profile.surfaceAt(c) + 10), kind: 'village' };
    const bp = buildHallBp({ ...anchorCtx(seed, a), surfaceBan: [{ x: village.x, y: village.y, w: village.w, h: village.h }] }, { caveOpen: () => false });
    expect(bp.parts).toHaveLength(2);
    const shaft = bp.parts![1];
    expect(shaft.x + shaft.w <= village.x || shaft.x >= village.x + village.w, `shaft ${shaft.x}`).toBe(true);
    // 部件判定：與村莊不相交 → 跨層規則不丟錯（兩份都是錨點，相交就是 RangeError）；沒有部件（整片外框，舊做法）會相交
    expect(crossYields(bp, 2, village, 2)).toBe(false); expect(crossYields(village, 2, bp, 2)).toBe(false);
    expect(crossYields({ ...bp, parts: undefined }, 2, village, 2)).toBe(true);
    const top = Math.min(src.profile.surfaceAt(shaft.x), src.profile.surfaceAt(shaft.x + 1));
    expect(shaft.y).toBe(top - 1);
    expect(walkToHall(seed, real, bp, shaft.x, top)).toBe(true);
    // 整段（大廳 + 兩側隧道）上方都被擋住 → 丟 RangeError（不默默少一條路）
    expect(() => buildHallBp({ ...anchorCtx(seed, a), surfaceBan: [{ x: bp.x - 10, y: 0, w: bp.w + 20, h: 2000 }] }, { caveOpen: () => false })).toThrow(RangeError);
  }, 60_000);

  it('回歸：rch-2 的 x0 = 895 地廳（floorY 範圍 390 列，只試 160 列時兩側都不通）現在接得出去', () => {
    const h = hallsOf(['rch-2']).find((q) => q.info.x0 === 895)!;
    expect(h).toBeDefined();
    expect(reachOutside(h)).toBeGreaterThanOrEqual(300);
  }, 60_000);

  it('300 個種子的每一座家鄉地廳都接得出去（走得到外框外 ≥ 300 格：天然洞穴，或後備豎井通到地表）', () => {
    let halls = 0, fallback = 0;
    for (let k = 0; k < 300; k++) {
      const seed = `hall300-${k}`, src = new Gen2Source(seed), w = worldOf(src);
      for (const s of homeSites(src)) {
        if (s.kind !== 'hall') continue;
        const bp = bpAt(src, s.info.x0, 'hall', BP_DEEP);
        loadColumns(w, bp.x - 80, bp.x + bp.w + 80);
        halls++;
        if (bp.y < s.info.y0 - 3) fallback++;
        expect(reachOutside({ seed, info: s.info, w, bp, deep: 0, molten: 0 }), `${seed} hall ${s.info.x0}`).toBeGreaterThanOrEqual(300);
      }
    }
    expect(halls).toBeGreaterThanOrEqual(300);
    console.log(`[halls] ${halls} halls, ${fallback} via the fallback shaft`);
  }, 600_000);

  it('錨點建構器在最窄的可用範圍（ANCHOR_MAX_W + 2 × SLOT_PAD）內也放得進去（不靠 placeX 的夾位置）', () => {
    let built = 0;
    for (const seed of SEEDS20.slice(0, 5)) for (const a of srcOf(seed).blueprints.anchorsOf(homeOf(srcOf(seed)))) {
      if (a.kind !== 'village' && a.kind !== 'hall') continue;
      const need = ANCHOR_MAX_W[a.kind]! + 16, sp = anchorSpan(seed, a);
      for (const span of [{ x0: sp.x0, x1: sp.x0 + need }, { x0: sp.x1 - need, x1: sp.x1 }]) {
        // 出生地區的村莊：anchors.ts 只給移得開（中心離出生點 > 200）的可用範圍，移不開的窄範圍不會出現
        if (a.kind === 'village' && a.region.variant === VARIANT.SPAWN && !villageFits(span, SPAWN_X)) continue;
        const c = anchorCtx(seed, a, span), b = a.kind === 'village' ? buildVillageBp(c) : buildHallBp(c);
        expect(b.x, `${seed} ${a.kind}`).toBeGreaterThanOrEqual(c.slotX0 + 8); expect(b.x + b.w, `${seed} ${a.kind}`).toBeLessThanOrEqual(c.slotX1 - 8);
        expect(b.w).toBeLessThanOrEqual(ANCHOR_MAX_W[a.kind]!);
        built++;
      }
      // 同一個 ctx 兩次算出相同藍圖
      const c = anchorCtx(seed, a);
      expect(a.kind === 'village' ? buildVillageBp(c) : buildHallBp(c)).toEqual(a.kind === 'village' ? buildVillageBp(c) : buildHallBp(c));
    }
    expect(built).toBeGreaterThan(20);
  }, 60_000);

  it('居民住進去：gen2 遊戲開局就有家鄉每座村莊的 elder / trader、地廳三位矮人；白天在村裡、晚上在屋裡；委託板找得到村長', () => {
    const g = new DelveGame({ seed: SEEDS2[0], worldGen: { kind: 'gen2' }, peaceful: true }), v = g.sites.list('village');
    expect(v.length).toBeGreaterThanOrEqual(2); for (const s of v) for (const r of ['elder', 'trader']) expect(g.folk.byKey(`${s.key}:${r}`)).not.toBeNull();
    const halls = g.sites.list('hall');
    expect(halls.length).toBeGreaterThanOrEqual(1);
    for (const s of halls) for (const r of ['runesmith', 'ore_trader', 'dwarf_elder']) expect(g.folk.byKey(`${s.key}:${r}`)).not.toBeNull();
    // 開局時欄還沒載入：NPC 站在藍圖給的地面上（ground − 1 / floorY − 1）
    for (const s of v) expect((g.folk.byKey(`${s.key}:elder`)!.body.y + g.folk.byKey(`${s.key}:elder`)!.body.h) / S).toBe(s.info.ground);
    // 離出生點最近的村莊 rot 0 → 一定有嚮導
    const near = [...v].sort((p, q) => Math.abs(((p.info.x0 + p.info.x1) >> 1) - SPAWN_X) - Math.abs(((q.info.x0 + q.info.x1) >> 1) - SPAWN_X))[0];
    expect(near.rot).toBe(0); expect(g.folk.byKey(`${near.key}:guide`)).not.toBeNull();
    expect([...v].map((s) => s.rot).sort()).toEqual(v.map((_, k) => k));
    const s0 = v[0], elder = g.folk.byKey(`${s0.key}:elder`)!; g.teleport(s0.info.board.x, s0.info.board.y);
    g.setDate({ hour: 12 });
    for (let k = 0; k < 240; k++) g.step(FIXED_DT);
    const ex = elder.body.x / 16; expect(ex).toBeGreaterThanOrEqual(s0.info.x0 - 2); expect(ex).toBeLessThanOrEqual(s0.info.x1 + 2);
    expect(g.questGiverAt(s0.info.board.x, s0.info.board.y)).toBe(`${s0.key}:elder`);
    // 載入村莊那幾欄時 onGenSites 交來同一個 key：去重，不多一座
    expect(g.sites.list('village').length).toBe(v.length);
    // 晚上回屋（同 game.folk.test.ts 的寫法）
    const tr = g.folk.byKey(`${s0.key}:trader`)!;
    g.setDate({ hour: 23 });
    for (let k = 0; k < 60 * 25; k++) g.step(FIXED_DT);
    const fx = Math.floor((tr.body.x + tr.body.w / 2) / S);
    expect(s0.info.houses.some((h) => fx > h.x0 && fx < h.x1)).toBe(true);
  }, 120_000);

  it('房主與客人（replica）算出同一批聚落 NPC（key / id 相同，不依登錄順序）；家鄉地城也開局登錄', () => {
    const host = new DelveGame({ seed: SEEDS2[1], worldGen: { kind: 'gen2' } }), guest = new DelveGame({ seed: SEEDS2[1], worldGen: { kind: 'gen2' }, mode: 'replica' });
    const ids = (g: DelveGame) => g.folk.npcs.filter((n) => n.site !== null).map((n) => [n.key, n.id]).sort();
    expect(ids(host).length).toBeGreaterThanOrEqual(2 * 4 + 3);
    expect(ids(guest)).toEqual(ids(host));
    expect(host.sites.list('dungeon').length).toBe(1);
  }, 60_000);
});
