// islands.test.ts — M2a Task 20（spec §8）：島的種類（燈塔 / 隱士 / 沉船島）、珊瑚礁、海底遺跡、隱士 NPC 的 chart 服務。
// 每道海至少一座有建物的島、每個海槽恰一個點；燈塔從底爬得到頂、從島灘走得到入口（不經液體、不必挖，指揮官裁決 7）；
// 珊瑚礁 / 海底遺跡在水面下、液體靜止；M1 沉船抽出 drawHull 後逐格相同（裁決 6）；漂流箱的少量物資（裁決 5）；
// 新地名單不重複、一道海裡與相鄰陸地之間同名組 0、地區名非空（裁決 1、2）；chart 服務（裁決 3、4）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { Layout, newWorldOrigin, type IslandInfo, type Landmass } from './layout';
import { LockTable } from './locks';
import type { Profile2 } from './profile';
import { BP_SURFACE, KEEP, structureId, type Blueprint, type BpCtx } from './blueprint';
import { decodeStructureId, gen2SiteRegionId } from './structId';
import { buildShipwreck } from './structures/shipwreck';
import { buildReefBp } from './structures/reef';
import { buildSeaRuinBp } from './structures/seaRuin';
import { worldOf, loadColumns, liquidInvariant, SEEDS5, srcOf } from './testUtil';
import { DelveGame } from '../game';
import { FIXED_DT } from '../constants';
import { T, W, isSolidTile, isPlatformTile } from '../tiles';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { LiquidSim } from '../liquid';
import { seedInt } from '../noise';
import { fnv1a, fnv1aStr } from '../../net/codec';
import { chestLoot, type ChestKind } from '../loot';
import { ROLES } from '../folkDefs';
import { NAMES, GEN2_NAMES_EXTRA, GEN2_ROOM_NAMES, gen2RegionById, gen2Regions, gen2RegionId, type Region } from '../discovery';
import { mapLabels } from '../../render/mapModel';
import type { World } from '../world';
import type { GenSite } from '../genTypes';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `isl-${k}`);
const L = (seed: string): Layout => new Layout(seed, newWorldOrigin(341, 334), new LockTable(), 0);
const BIG: ReadonlySet<string> = new Set(['village', 'keep', 'hall']);

// 藍圖所在海槽的 IslandInfo（不是島槽 → null）
function islandOf(src: Gen2Source, b: Blueprint): IslandInfo | null {
  const d = decodeStructureId(b.id), m = src.layout.landmass(d.side as 1 | -1, d.i);
  return m.kind === 'sea' ? m.islands.find((q) => q.slot === d.slot) ?? null : null;
}
// 海點的種類：島 = 島的 type，其他 = 藍圖種類
const tagOf = (src: Gen2Source, b: Blueprint): string => (b.kind === 'island' ? islandOf(src, b)!.type : b.kind);
// 地塊 m 範圍內（外框 x 在 m 裡）的表層藍圖
const seaBps = (src: Gen2Source, m: Landmass): Blueprint[] => src.blueprints.overlapping(m.x0, m.x1, [BP_SURFACE]).filter((b) => b.x >= m.x0 && b.x < m.x1);
const SEAS = [[1, 1], [1, 3], [-1, 1], [-1, 3]] as const;
const SEA_KINDS = ['crate', 'hermit', 'lighthouse', 'reef', 'sea_ruin', 'shipwreck', 'wreck'];
// 前兩道海（東西各兩道）每種海點（含燈塔島）至少一份的種子：{ src, bp = 那四道海的表層藍圖 }
function seaKinds(prefix: string): { seed: string; src: Gen2Source; bp: Blueprint[] } {
  for (let k = 0; k < 200; k++) {
    const seed = `${prefix}-${k}`, src = srcOf(seed), bp = SEAS.flatMap(([side, i]) => seaBps(src, src.layout.landmass(side, i)));
    const tags = new Set(bp.map((b) => tagOf(src, b)));
    if (SEA_KINDS.every((t) => tags.has(t))) return { seed, src, bp };
  }
  throw new Error(`seaKinds(${prefix}): no seed has every sea point`);
}

// ── 走路與爬塔（載入後的世界）──
// 門算走得過（一碰就開）；液體不可走
const PASS: ReadonlySet<number> = new Set([T.DOOR_CLOSED, T.DOOR_OPEN]);
const open = (w: World, x: number, y: number): boolean => { const t = w.getFg(x, y); return (!isSolidTile(t) || PASS.has(t)) && w.getLiquid(x, y) === 0; };
const footing = (w: World, x: number, y: number): boolean => { const t = w.getFg(x, y + 1); return (isSolidTile(t) && !PASS.has(t)) || isPlatformTile(t); };
// 站得住：腳下實心或平台、身體三格（角色 > 2 格高）都空、沒有液體
const stands = (w: World, x: number, y: number): boolean => open(w, x, y) && open(w, x, y - 1) && open(w, x, y - 2) && footing(w, x, y);
// 從站立格 from 走到 to（x ∈ [xLo, xHi]）：每步往左 / 右一欄，落在該欄 y − 3 … y + 12 的站立格；往上 = 本欄頭頂上方空到目標的頭（跳得上去），
// 往下 = 目標欄從頭到腳都空（掉得下去）。不挖、不游泳
function walkTo(w: World, from: { x: number; y: number }, to: { x: number; y: number }, xLo: number, xHi: number): boolean {
  const seen = new Set<number>(), key = (x: number, y: number): number => x * 4096 + y, st: [number, number][] = [[from.x, from.y]];
  if (!stands(w, from.x, from.y)) return false;
  seen.add(key(from.x, from.y));
  while (st.length) {
    const [x, y] = st.pop()!;
    if (x === to.x && y === to.y) return true;
    for (const nx of [x - 1, x + 1]) {
      if (nx < xLo || nx > xHi) continue;
      for (let ny = y - 3; ny <= y + 12; ny++) {
        if (!stands(w, nx, ny) || seen.has(key(nx, ny))) continue;
        let ok = true;
        if (ny < y) { for (let yy = ny - 2; yy < y - 2 && ok; yy++) ok = open(w, x, yy); }
        else for (let yy = y - 2; yy <= ny && ok; yy++) ok = open(w, nx, yy);
        if (!ok) continue;
        seen.add(key(nx, ny)); st.push([nx, ny]);
      }
    }
  }
  return false;
}
// 島的兩端（離水的那一欄）的站立格
function beaches(w: World, d: IslandInfo): { x: number; y: number }[] {
  const top = (x: number): number => { for (let y = 0; y < w.height; y++) if (isSolidTile(w.getFg(x, y))) return y; return w.height; };
  return [d.x0, d.x1 - 1].map((x) => ({ x, y: top(x) - 1 }));
}
// 燈塔：一樓地板（守望石像那一格）往上，塔內（屋頂以下）每個站立列到下一個站立列 ≤ 4 格，最上面的站立列 = 頂部箱子那一列
function climbable(w: World, b: Blueprint): boolean {
  const s = b.landmarks.find((q) => q.tile === T.GUARDIAN_STATUE)!, c = b.chests[0], xs: number[] = [];
  // 塔內的欄：從石像往左右，到石磚牆為止（一樓上面第 5 列，在門洞之上）；屋頂 = 石像那一欄由上往下第一個石磚
  for (const dir of [-1, 1]) for (let x = s.x + (dir < 0 ? 0 : 1); w.getFg(x, s.y - 4) !== T.STONE_BRICK; x += dir) xs.push(x);
  let roof = b.y;
  while (roof < s.y && w.getFg(s.x, roof) !== T.STONE_BRICK) roof++;
  const rows = new Set<number>();
  for (const x of xs) for (let y = roof + 1; y <= s.y; y++) if (stands(w, x, y)) rows.add(y);
  const ys = [...rows].sort((p, q) => q - p);
  if (ys[0] !== s.y) return false;
  for (let k = 1; k < ys.length; k++) if (ys[k - 1] - ys[k] > 4) return false;
  return ys.at(-1) === c.y;
}

// 從水面登岸（修正回合 1 第 5 條）：島 d 的一端（x0 端 = 左）外側那一欄 sx 是海、水面 wt；島灘那一欄的地面離水面 ≤ 1 格高（游到岸邊一步就上得去）、
// 水面以上的空氣不擋（海那一欄 wt − 3 … wt − 1 與島灘站立格的身體都空）。回登岸後的站立格（不成立 → null）
function landing(w: World, d: IslandInfo, left: boolean): { x: number; y: number } | null {
  const sx = left ? d.x0 - 1 : d.x1, bx = left ? d.x0 : d.x1 - 1;
  let wt = -1;
  for (let y = 0; y < w.height && wt < 0; y++) if (w.getLiquid(sx, y) > 0) wt = y;
  if (wt < 0) return null;
  let top = 0;
  while (top < w.height && !isSolidTile(w.getFg(bx, top))) top++;
  if (wt - top > 1 || top > wt) return null;
  for (let y = wt - 3; y < wt; y++) if (!open(w, sx, y)) return null;
  return stands(w, bx, top - 1) ? { x: bx, y: top - 1 } : null;
}

// ── chart 測試用 ──
// 東側由近到遠第一座隱士島的 site
function firstHermit(g: DelveGame): Extract<GenSite, { kind: 'hermit' }> {
  const src = g.gen2()!;
  for (let i = 1; i < 40; i += 2) for (const b of seaBps(src, src.layout.landmass(1, i))) if (b.kind === 'island' && b.site?.kind === 'hermit') return b.site;
  throw new Error('no hermit island');
}
// x 所在地塊朝外的下一片大陸
function nextContinentOf(g: DelveGame, x: number): Landmass {
  const lay = g.gen2()!.layout, m = lay.landmassAt(x)!;
  for (let k = m.i + 1; ; k++) { const c = lay.landmass(m.side as 1 | -1, k); if (c.kind === 'continent') return c; }
}
// 大陸 c 的錨點大東西（村莊 / 小地城 / 地廳）的地區（discovery.region 反查）
function bigRegionsOf(g: DelveGame, c: Landmass): Region[] {
  const bi = g.gen2()!.blueprints, out: Region[] = [];
  for (const a of bi.anchorsOf(c)) {
    if (!BIG.has(a.kind)) continue;
    const b = bi.anchorBlueprint(c, a), r = b ? g.discovery.region(gen2SiteRegionId(b.id, 0)) : null;
    if (r) out.push(r);
  }
  return out;
}

describe('gen2 島的種類、珊瑚礁、海底遺跡（Task 20）', () => {
  it('§8：每道海至少 1 座有建物的島（燈塔 / 隱士 / 沉船島），三種都出現過（20 個種子）', () => { const types = new Set<string>();
    for (const seed of SEEDS20) for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) { const m = L(seed).landmass(side, i);
      expect(m.islands.some((d) => d.type !== 'plain')).toBe(true); for (const d of m.islands) types.add(d.type); }
    expect([...types].sort()).toEqual(['hermit', 'lighthouse', 'plain', 'wreck']); }, 30_000);

  it('每個海槽恰一個點（島槽：有建物的島有一份藍圖；其他槽一份對應的藍圖）', () => { for (const seed of SEEDS5) { const g = new Gen2Source(seed);
    for (const side of [1, -1] as const) for (const i of [1, 3]) for (const s of g.layout.landmass(side, i).slots) { const bps = g.blueprints.overlapping(s.x0, s.x1, [BP_SURFACE]).filter((b) => b.x >= s.x0 && b.x < s.x1);
      const isl = g.layout.landmass(side, i).islands.find((d) => d.slot === s.k);
      if (isl) expect(bps.map((b) => b.kind)).toEqual(isl.type === 'plain' ? [] : ['island']); else expect(bps.map((b) => b.kind)).toEqual([s.poi]); } } }, 120_000);

  it('燈塔可以從底爬到頂（平台間距 ≤ 4）、頂部有箱子；海底遺跡與珊瑚礁在水面下且液體靜止', () => { const { src, bp } = seaKinds('isl2'), w = worldOf(src);
    for (const b of bp) loadColumns(w, b.x, b.x + b.w);
    const tower = bp.find((b) => b.kind === 'island' && islandOf(src, b)!.type === 'lighthouse')!;   // 明確挑燈塔島（沉船島也有箱子——Q21）
    expect(tower).toBeDefined(); expect(climbable(w, tower)).toBe(true); expect(tower.chests.length).toBeGreaterThanOrEqual(1);
    for (const b of bp.filter((q) => q.kind === 'reef' || q.kind === 'sea_ruin')) { expect(b.y).toBeGreaterThan(src.waterTopAt(b.x)!); expect(liquidInvariant(w, b.x - 2, b.x + b.w + 2)).toEqual([]); } }, 60_000);

  it('隱士：島上有隱士 NPC；chart 服務把下一片大陸的一處未找到的大東西標上地圖', () => { const g = new DelveGame({ seed: 'hermit', worldGen: { kind: 'gen2' } }), h = firstHermit(g);
    g.teleport(h.at.x, h.at.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT); const npc = g.folk.byKey(`${h.key}:hermit`)!; expect(npc).not.toBeNull();
    g.inventory.add('copper_coin', 500); const before = g.scoutMarks.length, coins = g.coins();
    expect(g.folkService(npc.key, 'chart').ok).toBe(true); expect(g.coins()).toBeLessThan(coins);
    expect(g.scoutMarks.length).toBe(before + 1); const mark = g.scoutMarks.at(-1)!, next = nextContinentOf(g, h.at.x);   // MapMarker = { x, y }，沒有 id（Q13）
    expect(mark.x).toBeGreaterThanOrEqual(next.x0); expect(mark.x).toBeLessThan(next.x1);
    expect(g.discovery.listKnown().concat(bigRegionsOf(g, next)).some((r) => r.ax === mark.x && r.ay === mark.y)).toBe(true); }, 120_000);

  it('島的種類：每道海依槽序的第一座島有建物；其餘島約 40% 有建物（三種約各三分之一）；非島槽 沉船 30% / 漂流箱 30% / 珊瑚礁 20% / 海底遺跡 20%', () => {
    const rest: Record<string, number> = { plain: 0, lighthouse: 0, hermit: 0, wreck: 0 }, first: Record<string, number> = { lighthouse: 0, hermit: 0, wreck: 0 };
    const poi: Record<string, number> = { shipwreck: 0, crate: 0, reef: 0, sea_ruin: 0 };
    for (let k = 0; k < 200; k++) { const lay = L(`ity-${k}`);
      for (const side of [1, -1] as const) for (let i = 1; i <= 15; i += 2) { const m = lay.landmass(side, i);
        m.islands.forEach((d, j) => { expect(m.slots[d.slot].poi).toBe('island'); if (j === 0) first[d.type]++; else rest[d.type]++; });
        for (const s of m.slots) if (s.poi !== 'island') poi[s.poi]++; } }
    expect(Object.keys(first).sort()).toEqual(['hermit', 'lighthouse', 'wreck']);
    const nf = first.lighthouse + first.hermit + first.wreck, nr = rest.plain + rest.lighthouse + rest.hermit + rest.wreck, np = poi.shipwreck + poi.crate + poi.reef + poi.sea_ruin;
    for (const t of ['lighthouse', 'hermit', 'wreck']) { expect(first[t] / nf, t).toBeGreaterThan(0.28); expect(first[t] / nf, t).toBeLessThan(0.39);
      expect(rest[t] / nr, t).toBeGreaterThan(0.1); expect(rest[t] / nr, t).toBeLessThan(0.17); }
    expect(rest.plain / nr).toBeGreaterThan(0.55); expect(rest.plain / nr).toBeLessThan(0.65);
    for (const [t, p] of [['shipwreck', 0.3], ['crate', 0.3], ['reef', 0.2], ['sea_ruin', 0.2]] as const) { expect(poi[t] / np, t).toBeGreaterThan(p - 0.04); expect(poi[t] / np, t).toBeLessThan(p + 0.04); }
  }, 60_000);

  it('燈塔：石磚塔寬 5、高 18–24、門洞在兩側、頂部 ruin 箱 + 吊燈、一樓守望石像；隱士島：木屋 + hermit site；沉船島：船殼在島上、ruin 箱；外框都在島的 [x0, x1) 內', () => {
    const n: Record<string, number> = { lighthouse: 0, hermit: 0, wreck: 0 };
    for (const seed of SEEDS20.slice(0, 10)) { const src = srcOf(seed);
      for (const [side, i] of SEAS) for (const b of seaBps(src, src.layout.landmass(side, i)).filter((q) => q.kind === 'island')) {
        const d = islandOf(src, b)!, msg = `${seed} ${side}:${i} ${d.type}@${b.x}`;
        n[d.type]++; expect(b.variant, msg).toBe(d.type); expect(b.layer).toBe(BP_SURFACE);
        expect(b.x, msg).toBeGreaterThanOrEqual(d.x0); expect(b.x + b.w, msg).toBeLessThanOrEqual(d.x1);
        const at = (t: number): number => { let c = 0; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === t) c++; return c; };
        if (d.type === 'lighthouse') {
          const cols = new Map<number, number>();
          for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === T.STONE_BRICK) cols.set(b.cells[k], (cols.get(b.cells[k]) ?? 0) + 1);
          const walls = [...cols].filter(([, c]) => c >= 12).map(([x]) => x).sort((p, q) => p - q);
          expect(walls, msg).toHaveLength(2); expect(walls[1] - walls[0], msg).toBe(4);
          const s = b.landmarks[0];
          expect(b.landmarks, msg).toEqual([{ x: s.x, y: s.y, tile: T.GUARDIAN_STATUE, site: 'lighthouse' }]); expect(s.x).toBe(walls[0] + 2);
          let roof = Infinity; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === T.STONE_BRICK && b.cells[k] === walls[0]) roof = Math.min(roof, b.cells[k + 1]);
          const H = s.y + 1 - roof; expect(H, msg).toBeGreaterThanOrEqual(18); expect(H, msg).toBeLessThanOrEqual(24);
          expect(b.chests, msg).toHaveLength(1); expect(b.chests[0].kind).toBe('ruin'); expect(at(T.LANTERN), msg).toBe(1); expect(at(T.PLATFORM), msg).toBeGreaterThanOrEqual(9);
          expect(b.ground).not.toBeNull(); expect(b.site).toBeNull();
        } else if (d.type === 'hermit') {
          expect(b.site?.kind, msg).toBe('hermit'); expect(b.site && 'key' in b.site ? b.site.key : '').toBe(`s${b.id}`);
          expect(at(T.DOOR_CLOSED), msg).toBe(3); expect(at(T.BED_HEAD), msg).toBe(1); expect(b.ground).not.toBeNull(); expect(b.chests).toEqual([]);
        } else {
          expect(at(T.PLANKS), msg).toBeGreaterThan(20); expect(at(T.BEAM), msg).toBeGreaterThanOrEqual(2);
          let dark = 0; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 3] === W.DARK_PLANK_WALL) dark++;
          expect(dark, msg).toBeGreaterThan(b.w * 2); expect(b.chests.map((c) => c.kind), msg).toEqual(['ruin']); expect(b.landmarks).toEqual([]);
        }
      } }
    for (const t of ['lighthouse', 'hermit', 'wreck']) expect(n[t], t).toBeGreaterThan(3);
  }, 120_000);

  it('裁決 7：燈塔島 / 隱士島從島灘走得到入口（不經液體、不必挖）——燈塔兩端都行、隱士至少一端；沉船島的格都在水面上', () => {
    const n: Record<string, number> = { lighthouse: 0, hermit: 0, wreck: 0 }, bad: string[] = [];
    for (const seed of SEEDS20) { const src = srcOf(seed), w = worldOf(src);
      for (const [side, i] of SEAS) for (const b of seaBps(src, src.layout.landmass(side, i)).filter((q) => q.kind === 'island')) {
        const d = islandOf(src, b)!, msg = `${seed} ${side}:${i} ${d.type}@${b.x}`;
        loadColumns(w, d.x0 - 2, d.x1 + 2); n[d.type]++;
        const ends = beaches(w, d);
        if (d.type === 'lighthouse') { const s = b.landmarks[0]; for (const e of ends) if (!walkTo(w, e, s, d.x0, d.x1 - 1)) bad.push(`${msg} from ${e.x}`); if (!climbable(w, b)) bad.push(`${msg} climb`); }
        else if (d.type === 'hermit' && b.site?.kind === 'hermit') { const at = b.site.at; if (!ends.some((e) => walkTo(w, e, at, d.x0, d.x1 - 1))) bad.push(msg); }
        else for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (w.getLiquid(x, y) > 0) bad.push(`${msg} wet ${x},${y}`);
      } }
    expect(bad.slice(0, 5)).toEqual([]);
    for (const t of ['lighthouse', 'hermit', 'wreck']) expect(n[t], t).toBeGreaterThan(5);
  }, 240_000);

  it('珊瑚礁：海床上的石 / 砂岩丘、6–12 格同一種銀或金礦團、丘頂的遺落行囊泡在水裡；海底遺跡：石磚殘屋、ruin 箱與守望石像泡在水裡、喚醒跑 300 刻水不動', () => {
    let reefs = 0, ruins = 0;
    for (const seed of SEEDS20.slice(0, 8)) { const src = srcOf(seed), w = worldOf(src), sim = new LiquidSim(w);
      for (const [side, i] of SEAS) for (const b of seaBps(src, src.layout.landmass(side, i)).filter((q) => q.kind === 'reef' || q.kind === 'sea_ruin')) {
        const msg = `${seed} ${side}:${i} ${b.kind}@${b.x}`, wt = src.waterTopAt(b.x + (b.w >> 1))!;
        loadColumns(w, b.x - 4, b.x + b.w + 4);
        expect(b.y, msg).toBeGreaterThan(wt); expect(liquidInvariant(w, b.x - 4, b.x + b.w + 4), msg).toEqual([]);
        const tiles = new Map<number, number>();
        for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] !== KEEP) tiles.set(b.cells[k + 2], (tiles.get(b.cells[k + 2]) ?? 0) + 1);
        const lm = b.landmarks[0];
        expect(b.landmarks, msg).toHaveLength(1); expect([w.getLiquid(lm.x, lm.y), w.getLiquidType(lm.x, lm.y)], msg).toEqual([LIQ_MAX, LIQ.WATER]);
        expect(w.getFg(lm.x, lm.y)).toBe(lm.tile);
        if (b.kind === 'reef') {
          reefs++;
          const ore = (tiles.get(T.SILVER_ORE) ?? 0) + (tiles.get(T.GOLD_ORE) ?? 0);
          expect(ore, msg).toBeGreaterThanOrEqual(6); expect(ore, msg).toBeLessThanOrEqual(12); expect(tiles.has(T.SILVER_ORE) && tiles.has(T.GOLD_ORE), msg).toBe(false);
          expect((tiles.get(T.STONE) ?? 0) + (tiles.get(T.SANDSTONE) ?? 0), msg).toBeGreaterThan(20);
          expect(lm).toMatchObject({ tile: T.RELIC_PACK, site: 'reef' }); expect(b.chests).toEqual([]);
          // 礦都在丘裡（四鄰沒有水）
          for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === T.SILVER_ORE || b.cells[k + 2] === T.GOLD_ORE) {
            const x = b.cells[k], y = b.cells[k + 1];
            expect([w.getLiquid(x - 1, y), w.getLiquid(x + 1, y), w.getLiquid(x, y - 1), w.getLiquid(x, y + 1)], `${msg} ore ${x},${y}`).toEqual([0, 0, 0, 0]);
          }
        } else {
          ruins++;
          expect(tiles.get(T.STONE_BRICK) ?? 0, msg).toBeGreaterThanOrEqual(b.w + 6); expect(lm).toMatchObject({ tile: T.GUARDIAN_STATUE, site: 'sea_ruin' });
          const c = b.chests[0];
          expect(b.chests.map((q) => q.kind), msg).toEqual(['ruin']); expect(w.getFg(c.x, c.y)).toBe(T.CHEST);
          expect([w.getLiquid(c.x, c.y), w.getLiquidType(c.x, c.y)], msg).toEqual([LIQ_MAX, LIQ.WATER]);
          const snap = (): number[] => { const o: number[] = []; for (let y = b.y - 2; y < b.y + b.h + 2; y++) for (let x = b.x - 2; x < b.x + b.w + 2; x++) o.push(w.getLiquid(x, y), w.getLiquidType(x, y), w.getFg(x, y)); return o; };
          const before = snap();
          sim.wakeRect(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 2);
          for (let k = 0; k < 300; k++) sim.step();
          expect(snap(), msg).toEqual(before);
        }
      } }
    expect(reefs).toBeGreaterThan(3); expect(ruins).toBeGreaterThan(3);
  }, 180_000);

  it('裁決 6：M1 沉船抽出 drawHull 後逐格相同（直接呼叫建構器，雜湊在抽出前錄）', () => {
    let h = 0x811c9dc5, n = 0;
    for (const seed of SEEDS5) { const src = srcOf(seed);
      for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7, 9]) { const m = src.layout.landmass(side, i);
        for (const s of m.slots) { if (m.islands.some((d) => d.slot === s.k)) continue;
          const id = structureId(side, i, 0, s.k, BP_SURFACE);
          const c: BpCtx = { seed, s: seedInt(seed, 'g2-bp'), id, slotX0: s.x0, slotX1: s.x1, region: m.regions[0], profile: src.profile, ver: 0, groundAt: (x) => src.profile.surfaceAt(x) };
          const b = buildShipwreck(c); n++;
          h = fnv1a(new Uint8Array(b.cells.buffer), h); h = fnv1aStr(JSON.stringify([b.kind, b.x, b.y, b.w, b.h, b.chests]), h);
        } } }
    expect(n).toBeGreaterThan(40);
    expect(h).toBe(SHIPWRECK_HASH);
  }, 60_000);

  it('荒野大陸的隱士小屋與隱士島共用畫法後不變（Task 18 的 hermit_hut 逐格相同，雜湊在改動前錄；Task 21 依生態鋪地表後重錄）', () => {
    let h = 0x811c9dc5, n = 0;
    for (const seed of SEEDS5) { const src = srcOf(seed);
      for (const side of [1, -1] as const) for (const i of [2, 4]) { const m = src.layout.landmass(side, i);
        for (const a of src.blueprints.anchorsOf(m)) { if (a.kind !== 'hermit_hut') continue;
          const b = src.blueprints.anchorBlueprint(m, a)!; n++;
          h = fnv1a(new Uint8Array(b.cells.buffer), h); h = fnv1aStr(JSON.stringify([b.kind, b.x, b.y, b.w, b.h, b.site, b.solid, b.floors, [...(b.ground?.tops ?? [])]]), h);
        } } }
    expect(n).toBe(20);
    expect(h).toBe(HUT_HASH);
  }, 60_000);

  it('修正回合 1（第 4 條）：珊瑚礁的礦一定 6–12 格、海底遺跡一定恰 1 尊守望石像（50 個種子的每個非島海槽直接呼叫建構器）', () => {
    let n = 0;
    for (let k = 0; k < 50; k++) { const seed = `rg-${k}`, src = srcOf(seed);
      for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7, 9]) { const m = src.layout.landmass(side, i);
        for (const s of m.slots) { if (m.islands.some((d) => d.slot === s.k)) continue;
          const c: BpCtx = { seed, s: seedInt(seed, 'g2-bp'), id: structureId(side, i, 0, s.k, BP_SURFACE), slotX0: s.x0, slotX1: s.x1, region: m.regions[0], profile: src.profile, ver: 0, groundAt: (x) => src.profile.surfaceAt(x) };
          const r = buildReefBp(c), u = buildSeaRuinBp(c), msg = `${seed} ${side}:${i} slot ${s.k}`; n++;
          let ore = 0; for (let q = 0; q < r.cells.length; q += 5) if (r.cells[q + 2] === T.SILVER_ORE || r.cells[q + 2] === T.GOLD_ORE) ore++;
          expect(ore, msg).toBeGreaterThanOrEqual(6); expect(ore, msg).toBeLessThanOrEqual(12);
          expect(u.landmarks.filter((l) => l.tile === T.GUARDIAN_STATUE), msg).toHaveLength(1);
          let statues = 0; for (let q = 0; q < u.cells.length; q += 5) if (u.cells[q + 2] === T.GUARDIAN_STATUE) statues++;
          expect(statues, msg).toBe(1);
        } } }
    expect(n).toBeGreaterThan(500);
  }, 120_000);

  it('修正回合 1（第 4 條）：極端海床（假側寫）下也不默默少放——礦 6–12 格或丟 RangeError；海底遺跡屋頂被水面壓扁、放不下石像 → RangeError', () => {
    const fake = (surf: (x: number) => number, wt: number): Profile2 => ({ surfaceAt: surf, waterTopAt: () => wt } as unknown as Profile2);
    const c = (p: Profile2, id: number): BpCtx => ({ seed: 'fake', s: 7, id, slotX0: 0, slotX1: 300, region: L('fake').landmass(1, 1).regions[0], profile: p, ver: 0, groundAt: (x) => p.surfaceAt(x) });
    // 鋸齒海床：相鄰欄差 12 格（礦團長不開、丘心也可能碰水）
    let thrown = 0, built = 0;
    for (let id = 0; id < 200; id++) {
      const p = fake((x) => 400 + (x % 2) * 12, 341);
      try { const b = buildReefBp(c(p, id)); built++; let ore = 0; for (let q = 0; q < b.cells.length; q += 5) if (b.cells[q + 2] === T.SILVER_ORE || b.cells[q + 2] === T.GOLD_ORE) ore++; expect(ore, `id ${id}`).toBeGreaterThanOrEqual(6); expect(ore).toBeLessThanOrEqual(12); }
      catch (e) { expect(e).toBeInstanceOf(RangeError); thrown++; }
    }
    expect(thrown + built).toBe(200);
    // 海底遺跡：各種淺 / 鋸齒海床下，不是恰一尊石像就是 RangeError（不會沒有石像）
    let ruins = 0;
    for (let id = 0; id < 200; id++) for (const surf of [(x: number) => 343 + (x % 3 === 0 ? 4 : 0), (x: number) => 344 + (x % 2) * 3, () => 345]) {
      try { const b = buildSeaRuinBp(c(fake(surf, 341), id)); ruins++; expect(b.landmarks.filter((l) => l.tile === T.GUARDIAN_STATUE), `id ${id}`).toHaveLength(1); }
      catch (e) { expect(e).toBeInstanceOf(RangeError); }
    }
    expect(ruins).toBeGreaterThan(0);
    // 水面離海床只有 2 格：屋頂夾到海床上一格，屋內站不下 → RangeError
    for (let id = 0; id < 20; id++) expect(() => buildSeaRuinBp(c(fake(() => 343, 341), id))).toThrow(RangeError);
  }, 30_000);

  it('修正回合 1（第 5 條）：燈塔島兩端、隱士島兩端（含門那一側）都從水面一步登上島灘', () => {
    const n: Record<string, number> = { lighthouse: 0, hermit: 0, door: 0 }, bad: string[] = [];
    for (const seed of SEEDS20) { const src = srcOf(seed), w = worldOf(src);
      for (const [side, i] of SEAS) for (const b of seaBps(src, src.layout.landmass(side, i)).filter((q) => q.kind === 'island' && q.variant !== 'wreck')) {
        const d = islandOf(src, b)!, msg = `${seed} ${side}:${i} ${d.type}@${b.x}`;
        loadColumns(w, d.x0 - 3, d.x1 + 3); n[d.type]++;
        for (const left of [true, false]) if (!landing(w, d, left)) bad.push(`${msg} ${left ? 'x0' : 'x1'}`);
        if (d.type === 'hermit' && b.site?.kind === 'hermit') {
          // 門那一側：從水面登岸的站立格走得到隱士
          let door = -1; for (let q = 0; q < b.cells.length; q += 5) if (b.cells[q + 2] === T.DOOR_CLOSED) door = b.cells[q];
          const left = door < b.site.at.x, start = landing(w, d, left);
          if (!start || !walkTo(w, start, b.site.at, d.x0, d.x1 - 1)) bad.push(`${msg} door side`); else n.door++;
        }
      } }
    expect(bad.slice(0, 5)).toEqual([]);
    expect(n.lighthouse).toBeGreaterThan(5); expect(n.hermit).toBeGreaterThan(5); expect(n.door).toBe(n.hermit);
  }, 240_000);

  it('修正回合 1（第 1 條）：沉船島與 M1 沉船共用 hullPlan 後，沉船島逐格不變（雜湊在改動前錄）', () => {
    let h = 0x811c9dc5, n = 0;
    for (const seed of SEEDS20) { const src = srcOf(seed);
      for (const [side, i] of SEAS) for (const b of seaBps(src, src.layout.landmass(side, i)).filter((q) => q.variant === 'wreck')) {
        n++; h = fnv1a(new Uint8Array(b.cells.buffer), h); h = fnv1aStr(JSON.stringify([b.x, b.y, b.w, b.h, b.chests]), h);
      } }
    expect(n).toBeGreaterThan(10);
    expect(h).toBe(WRECK_ISLE_HASH);
  }, 60_000);

  it('裁決 5：漂流箱用 crate 少量物資表（沒有裝備 / 時裝）、比遺跡箱少；既有種類的箱子內容與改動前相同', () => {
    let h = 0x811c9dc5;
    for (const kind of ['cabin', 'mineshaft', 'ruin', 'cavern', 'sky', 'dungeon', 'treasure', 'secret', 'relic'] as ChestKind[]) for (let x = 0; x < 40; x += 3) for (const d of [0, 0.3, 0.6, 0.9]) {
      h = fnv1aStr(JSON.stringify(chestLoot('loot-pin', x * 37, 300 + x, kind, d)), h);
    }
    expect(h).toBe(CHEST_HASH);
    const total = (s: ReturnType<typeof chestLoot>): number => s.reduce((a, q) => a + (q ? (q.item === 'copper_coin' ? 0 : q.count) : 0), 0);
    let crate = 0, ruin = 0;
    for (let x = 0; x < 200; x++) {
      const c = chestLoot('crate-amt', x, 341, 'crate', 0), r = chestLoot('crate-amt', x, 341, 'ruin', 0);
      expect(c.filter((q) => q !== null).length).toBeLessThanOrEqual(3);
      for (const q of c) if (q) { expect(['copper_coin', 'torch', 'rope', 'wood', 'grilled_fish']).toContain(q.item); expect(q.gear).toBeUndefined(); }
      expect(c.find((q) => q?.item === 'copper_coin')!.count).toBeLessThanOrEqual(15);
      crate += total(c); ruin += total(r);
    }
    expect(crate * 3).toBeLessThan(ruin);
    const { seed, src, bp } = seaKinds('isl2'), cr = bp.find((b) => b.kind === 'crate')!;
    expect(cr.chests.map((c) => c.kind)).toEqual(['crate']);
    expect(src.objectsIn(cr.x, cr.x + cr.w)[0].slots).toEqual(chestLoot(seed, cr.chests[0].x, cr.chests[0].y, 'crate', 0));
  }, 60_000);
});

describe('海上的地名（裁決 1、2）', () => {
  it('新名單（燈塔 / 沉船島 / 珊瑚礁 / 海底遺跡）至少 6 個名字、不重複、不和任何既有名單或固定名字重複；隱士島共用隱士名單', () => {
    const NEW = ['lighthouse', 'wreck_isle', 'reef', 'sea_ruin'];
    const others = new Set<string>(['西岸沙灘', '東岸沙灘', '家鄉林地', '西方大海', '東方大海']);
    for (const [k, l] of Object.entries(NAMES)) if (!NEW.includes(k)) for (const s of l) others.add(s);
    for (const l of Object.values(GEN2_NAMES_EXTRA)) for (const s of l ?? []) others.add(s);
    for (const l of Object.values(GEN2_ROOM_NAMES)) for (const s of l ?? []) others.add(s);
    const seen = new Set<string>();
    for (const k of NEW) {
      const l = NAMES[k];
      expect(l, k).toBeDefined(); expect(l.length, k).toBeGreaterThanOrEqual(6);
      for (const s of l) { expect(s.length, k).toBeGreaterThan(0); expect(others.has(s), `${k} ${s}`).toBe(false); expect(seen.has(s), `${k} ${s}`).toBe(false); seen.add(s); }
    }
    expect(NAMES.hermit.length).toBeGreaterThanOrEqual(6);
  }, 10_000);

  it('一道海裡、以及與相鄰陸地（家鄉 / 大陸）之間，同名組 0（經 uniqueNames 之後）；有建物的島 / 珊瑚礁 / 海底遺跡都立地區、名字非空', () => {
    const bad: string[] = [], kinds = new Set<string>();
    let seaNames = 0;
    for (let k = 0; k < 8; k++) {
      const seed = `nm-${k}`, src = srcOf(seed), byId = gen2RegionById(seed, src);
      // 地塊 m 的全部地區（地塊地區 + 每份藍圖的每個結構地區）
      const regionsOf = (m: Landmass): Region[] => {
        const out = m.regions.map((r) => byId(gen2RegionId(m.side, m.i, r.index, 0))!);
        for (const b of src.blueprints.overlapping(m.x0, m.x1).filter((q) => q.x >= m.x0 && q.x < m.x1)) for (let p = 0; p < 64; p++) {
          const r = byId(gen2SiteRegionId(b.id, p));
          if (!r) break;
          out.push(r);
        }
        return out;
      };
      const home = src.layout.landmassAt(2100)!;
      for (const side of [1, -1] as const) for (const i of [1, 3]) {
        const sea = src.layout.landmass(side, i), near = [i === 1 ? home : src.layout.landmass(side, i - 1), src.layout.landmass(side, i + 1)];
        const own = regionsOf(sea), all = [...own, ...near.flatMap(regionsOf)];
        for (const b of seaBps(src, sea)) if (b.kind === 'island' || b.kind === 'reef' || b.kind === 'sea_ruin' || b.kind === 'shipwreck') {
          const r = byId(gen2SiteRegionId(b.id, 0));
          expect(r, `${seed} ${b.kind}@${b.x}`).not.toBeNull(); expect(r!.name).not.toBe(''); kinds.add(r!.kind);
        }
        for (const r of own) {
          seaNames++;
          expect(r.name, `${seed} ${r.kind}`).not.toBe('');
          const same = new Set(all.filter((q) => q.name === r.name).map((q) => q.id));
          if (same.size > 1) bad.push(`${seed} ${side}:${i} ${r.kind} ${r.name} ×${same.size}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(seaNames).toBeGreaterThan(100);
    for (const t of ['lighthouse', 'hermit', 'wreck_isle', 'reef', 'sea_ruin', 'shipwreck']) expect(kinds, t).toContain(t);
  }, 240_000);

  it('地區名在 gen2Regions / gen2RegionById 一致；走過之後已知表、地圖標籤與嚮導提示不出現空白地名或「」', () => {
    const { seed, src, bp } = seaKinds('isl2'), q = gen2Regions(seed, src), byId = gen2RegionById(seed, src);
    const g = new DelveGame({ seed, worldGen: { kind: 'gen2' } }), d = g.discovery;
    for (const b of bp) {
      const r = byId(gen2SiteRegionId(b.id, 0));
      if (b.kind === 'crate') { expect(r).toBeNull(); continue; }
      expect(r, `${b.kind}@${b.x}`).not.toBeNull();
      const hit = q(r!.ax, r!.ay).find((x) => x.id === r!.id);
      expect(hit?.name).toBe(r!.name);
      d.visit(r!.ax, r!.ay);
      const isl = islandOf(src, b);
      if (isl) d.visit((isl.x0 + isl.x1) >> 1, src.surfaceAt((isl.x0 + isl.x1) >> 1) - 2);
    }
    for (const r of d.listKnown()) { expect(r.name, `${r.kind} ${r.id}`).not.toBe(''); expect(r.name).not.toContain('「」'); }
    for (const l of mapLabels(d.listKnown(), d)) expect(l.name).not.toBe('');
    expect(d.listKnown().filter((r) => ['lighthouse', 'hermit', 'wreck_isle', 'reef', 'sea_ruin'].includes(r.kind) && d.isFound(r.id)).length).toBeGreaterThanOrEqual(5);
    expect(g.nextStepHint()).not.toContain('「」');
  }, 120_000);
});

describe('隱士的 chart 服務（裁決 3、4）', () => {
  it('ROLES.hermit 有 chart 服務（繁中文案、120 銅）；錢不夠 → 失敗、不標記', () => {
    expect(ROLES.hermit.services).toContainEqual({ kind: 'chart', zh: '標出下一片大陸上一處還沒去過的地點', price: 120 });
    const g = new DelveGame({ seed: 'hermit', worldGen: { kind: 'gen2' } }), h = firstHermit(g);
    g.teleport(h.at.x, h.at.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
    const npc = g.folk.byKey(`${h.key}:hermit`)!, before = g.scoutMarks.length;
    for (const c of ['copper_coin', 'silver_coin'] as const) g.inventory.remove(c, g.inventory.count(c));
    expect(g.folkService(npc.key, 'chart')).toEqual({ ok: false, msg: '錢不夠' }); expect(g.scoutMarks.length).toBe(before);
    // 錢夠：訊息說得出地名（不是「」）
    g.inventory.add('copper_coin', 500);
    const r = g.folkService(npc.key, 'chart');
    expect(r.ok).toBe(true); expect(r.msg).not.toContain('「」'); expect(r.msg).toMatch(/「.+」/);
    // 再問一次：標下一個還沒標過的大東西（不重複標同一處）
    const r2 = g.folkService(npc.key, 'chart');
    expect(r2.ok).toBe(true); expect(g.scoutMarks.length).toBe(before + 2);
    expect(new Set(g.scoutMarks.map((m) => `${m.x},${m.y}`)).size).toBe(g.scoutMarks.length);
  }, 120_000);
});

// 改動前（Task 20 之前，base 0e079e591）錄下的雜湊
const SHIPWRECK_HASH = 2625913742;
// 修正回合 1 抽出 hullPlan 前（253a71ee3）錄下的沉船島雜湊
const WRECK_ISLE_HASH = 2107307070;
const CHEST_HASH = 2991537935;
// Task 21 重錄（原 951269948，Task 20 前錄）：隱士小屋的整平依生態鋪地表（雪原鋪雪、沙漠鋪沙、叢林鋪叢林草；原本一律鋪草），
// 大陸大東西的退讓 / 欠債規則也讓部分小屋換了槽；共用畫法（drawHermitHut / levelSite）沒有改——島上的小屋（森林）照舊草 / 泥土
const HUT_HASH = 2908162404;
