// lore.test.ts — gen2 家鄉的石碑、遺物、地標（M2a Task 14；spec §4.4「14 塊燈脈石碑與 4 件遺物在初始之地」、地標放置率 ≥ 85%）、
// homePlans 的釘選（Q9）、bootGen2 的家鄉內容、新錨點（雪原 / 沙漠石室、熔岩祭壇、坑道底藏物、出生點石碑）都走得到。
import { describe, it, expect } from 'vitest';
import { T, isSolidTile } from '../tiles';
import { FIXED_DT } from '../constants';
import { DelveGame } from '../game';
import { Discovery } from '../discovery';
import type { World } from '../world';
import type { ItemId } from '../items';
import { seedInt } from '../noise';
import { entranceHit } from '../genPrims';
import { Gen2Source } from './index';
import { homeContent, type HomeContent } from './home';
import { homeDecor } from './lore';
import { BP_MINOR, BP_UNDER, BP_DEEP, KEEP, SPAWN_CLEAR, landSlot, type Blueprint } from './blueprint';
import { naturalOpen } from './structures/miniBiome';
import { SPAWN_X } from './layout';
import { LAVA_Y } from './profile';
import { shaftOf, shaftRoom } from './caves';
import type { RegionInfo } from '../regionInfo';
import type { BpCtx } from './bpcore';
import { SEEDS5, homeBlueprints, loadColumns, srcOf, worldOf } from './testUtil';

const homeOf = (seed: string): HomeContent => homeContent(srcOf(seed));
const PASS: ReadonlySet<number> = new Set([T.CRACKED_STONE, T.DOOR_CLOSED, T.DOOR_LOCKED]);
// 有地標的 gen2 種類
const LANDMARK_KINDS: ReadonlySet<string> = new Set(['cabin', 'mineshaft', 'ruin', 'sky_island', 'crystal_cave', 'mushroom_biome', 'hive', 'cave_lake', 'lake', 'hall']);
// 家鄉藍圖箱子裡（載入後的世界）item 的件數
function chestItemCount(w: World, bps: readonly Blueprint[], item: ItemId): number {
  let n = 0;
  for (const b of bps) for (const c of b.chests) {
    loadColumns(w, c.x, c.x + 1);
    n += (w.chests.get(w.idx(c.x, c.y)) ?? []).filter((s) => s?.item === item).length;
  }
  return n;
}
// 外圍的藍圖（家鄉以外）碰 n 次，把 LRU 洗過一輪
function touchOuterBlueprints(src: Gen2Source, n: number): void {
  for (let k = 0; k < n; k++) { const x = 6000 + k * 170; src.blueprints.overlapping(x, x + 1); src.blueprints.overlapping(-x, -x + 1); }
}
// 從 (x, y) 走 4 鄰的非實心格（裂紋石算走得過：一敲就碎；門也算：地城的鑰匙拿得到，dungeon.test 驗過）、不進液體；範圍同 testUtil.walkOut
// （外框 b 左右 80 欄、上 80 列到下 40 列）：走到地表以上或走到外框外 ≥ 300 格 = true
function walkFrom(w: World, src: Gen2Source, b: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
  const x0 = b.x - 80, x1 = b.x + b.w + 80, y0 = Math.max(0, b.y - 80), y1 = b.y + b.h + 40, W = x1 - x0, seen = new Uint8Array(W * (y1 - y0)), st = [x, y];
  seen[(y - y0) * W + x - x0] = 1;
  let out = 0;
  while (st.length) {
    const cy = st.pop()!, cx = st.pop()!;
    if (cy < src.surfaceAt(cx)) return true;
    if ((cx < b.x || cx >= b.x + b.w || cy < b.y || cy >= b.y + b.h) && ++out >= 300) return true;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const k = (ny - y0) * W + nx - x0, t = w.getFg(nx, ny);
      if (seen[k] || (isSolidTile(t) && !PASS.has(t)) || w.getLiquid(nx, ny) > 0) continue;
      seen[k] = 1; st.push(nx, ny);
    }
  }
  return false;
}
// 只看藍圖的格 + 天然洞穴探針（不載入世界）：從 (sx, sy) 走 4 鄰，走得到地表以上或外框外 ≥ 300 格（同 minibiome.test 的 escapes）
function escapes(src: Gen2Source, b: Blueprint, sx: number, sy: number, open: (x: number, y: number) => boolean): boolean {
  const at = new Map<number, [number, number]>();
  for (let i = 0; i < b.cells.length; i += 5) at.set(b.cells[i] * 4096 + b.cells[i + 1], [b.cells[i + 2], b.cells[i + 4]]);
  const pass = (x: number, y: number): boolean => { const c = at.get(x * 4096 + y); return c && c[0] !== KEEP ? !isSolidTile(c[0]) && c[1] <= 0 : open(x, y); };
  const x0 = b.x - 80, x1 = b.x + b.w + 80, y0 = Math.max(0, b.y - 80), y1 = b.y + b.h + 40;
  const seen = new Set<number>([sx * 4096 + sy]), st = [sx, sy];
  let out = 0;
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (y < src.surfaceAt(x)) return true;
    if ((x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) && ++out >= 300) return true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const k = nx * 4096 + ny;
      if (seen.has(k) || nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      if (ny >= src.surfaceAt(nx) && !pass(nx, ny)) continue;
      seen.add(k); st.push(nx, ny);
    }
  }
  return false;
}
// 坑道底藏物（見下面的測試）：箱子 = 圓室中心欄、圓室最低一列的上一列，腳下石頭；載入那一帶後沿非實心格（坑道中心 ± 20 欄）走得到地表以上
function cacheReachable(g: Gen2Source, seed: string, r: RegionInfo, b: Blueprint): boolean {
  const ss = seedInt(seed, 'g2-shaft'), sh = shaftOf(ss, r, (x) => g.profile.surfaceAt(x), (x) => g.profile.layersAt(x).deep)!, rm = shaftRoom(ss, r, sh), c = b.chests[0];
  if (b.chests.length !== 1 || c.kind !== 'relic' || c.x !== rm.x || c.y !== rm.y + rm.r - 1) return false;
  const w = worldOf(g), x0 = sh.sx - 20, x1 = sh.sx + 21;
  loadColumns(w, x0, x1);
  if (w.getFg(c.x, c.y) !== T.CHEST || w.getFg(c.x, c.y + 1) !== T.STONE) return false;
  const seen = new Set<number>([c.x * 4096 + c.y]), st = [c.x, c.y];
  while (st.length) {
    const y = st.pop()!, x = st.pop()!;
    if (y < g.surfaceAt(x)) return true;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      const k = nx * 4096 + ny;
      if (seen.has(k) || nx < x0 || nx >= x1 || ny < 0 || ny > c.y || isSolidTile(w.getFg(nx, ny)) || w.getLiquid(nx, ny) > 0) continue;
      seen.add(k); st.push(nx, ny);
    }
  }
  return false;
}
// 藍圖裡第一個箱子（沒有就第一塊地板）當起點
const startOf = (b: Blueprint): { x: number; y: number } => b.chests[0] ?? b.floors[0];
const NEW_KINDS = ['alcove', 'molten_shrine', 'shaft_cache', 'spawn_tablet'] as const;

describe('gen2 家鄉的石碑 / 遺物 / 地標（Task 14）', () => {
  it('§4.4：14 塊石碑 id 0..13 各恰一次、都在家鄉、站在地板上（載入後 上方空氣 / 下方實心）', () => { for (const seed of SEEDS5) { const hc = homeOf(seed), w = worldOf(srcOf(seed));
    expect(hc.tablets.map((t) => t.id).sort((a, b) => a - b)).toEqual([...Array(14).keys()]);
    for (const t of hc.tablets) { expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x).toBeLessThan(4200); loadColumns(w, t.x, t.x + 1);
      expect(w.getFg(t.x, t.y), `${seed} #${t.id}`).toBe(T.LORE_TABLET); expect(w.genTablets.get(w.idx(t.x, t.y))).toBe(t.id);
      expect(isSolidTile(w.getFg(t.x, t.y + 1)), `${seed} #${t.id} below`).toBe(true); expect(w.getFg(t.x, t.y - 1), `${seed} #${t.id} above`).toBe(T.AIR); } } }, 180_000);

  it('§4.4：4 件遺物 + 指南針 / 深度計各恰一次、在對的地方、箱子裡真的有', () => { for (const seed of SEEDS5) { const hc = homeOf(seed), w = worldOf(srcOf(seed)), bps = homeBlueprints(seed);
    expect(hc.relics.map((r) => [r.item, r.where]).sort()).toEqual([['jump_boots', 'sky_island'], ['magnet', 'secret_room'], ['night_amulet', 'molten'], ['swift_boots', 'shaft']]);
    for (const r of hc.relics) { loadColumns(w, r.x, r.x + 1); expect(w.chests.get(w.idx(r.x, r.y))!.some((s) => s?.item === r.item), `${seed} ${r.item}`).toBe(true); }
    const m = hc.relics.find((r) => r.item === 'night_amulet')!; expect(m.y).toBeGreaterThanOrEqual(srcOf(seed).layersAt(m.x).molten); expect(m.y).toBeLessThan(LAVA_Y - 12);
    for (const it of ['compass', 'depth_meter'] as const) expect(chestItemCount(w, bps, it), `${seed} ${it}`).toBe(1); } }, 180_000);

  // 家鄉的地表湖是錨點（Task 17 延續事項 4：舊生成器的家鄉每個種子都有地表湖），湖岸的旅人石堆（CAIRN）家鄉必有
  it('§4.4：地標放置率 ≥ 85%（有地標種類的家鄉藍圖中真的放了地標的比例），且含 RELIC_PACK / ORE_CART / GUARDIAN_STATUE / GEODE / SPORE_TOTEM / HONEY_JAR / CAIRN', () => {
    for (const seed of SEEDS5) { const bp = homeBlueprints(seed), elig = bp.filter((b) => LANDMARK_KINDS.has(b.kind));
      expect(elig.filter((b) => b.landmarks.length > 0).length / elig.length, seed).toBeGreaterThanOrEqual(0.85);
      expect(homeOf(seed).landmarks.some((l) => l.tile === T.CAIRN), `${seed} cairn`).toBe(true); }
    expect(new Set(SEEDS5.flatMap((s) => homeOf(s).landmarks.map((l) => l.tile)))).toEqual(new Set([T.RELIC_PACK, T.ORE_CART, T.GUARDIAN_STATUE, T.GEODE, T.SPORE_TOTEM, T.HONEY_JAR, T.CAIRN])); }, 180_000);

  it('M1 建構器補的地標（家鄉 + 外圍）：小屋 RELIC_PACK、遺跡 GUARDIAN_STATUE、湖 CAIRN、地下湖 RELIC_PACK；地標格在藍圖裡、腳下是實心；家鄉的每一份都有', () => {
    const TILE: Record<string, number> = { cabin: T.RELIC_PACK, ruin: T.GUARDIAN_STATUE, lake: T.CAIRN, cave_lake: T.RELIC_PACK };
    const seen: Record<string, number> = {};
    for (const seed of SEEDS5) for (const b of homeBlueprints(seed)) if (b.kind in TILE) expect(b.landmarks.length, `${seed} ${b.kind}@${b.x}`).toBe(1);
    for (const seed of SEEDS5.slice(0, 2)) for (const b of srcOf(seed).blueprints.overlapping(-12_000, 12_000)) {
      if (!(b.kind in TILE) || !b.landmarks.length) continue;
      const at = new Map<string, number>();
      for (let i = 0; i < b.cells.length; i += 5) at.set(`${b.cells[i]},${b.cells[i + 1]}`, b.cells[i + 2]);
      const l = b.landmarks[0];
      expect(b.landmarks).toEqual([{ x: l.x, y: l.y, tile: TILE[b.kind], site: b.kind }]);
      expect(at.get(`${l.x},${l.y}`)).toBe(TILE[b.kind]);
      expect(isSolidTile(at.get(`${l.x},${l.y + 1}`) ?? -1), `${seed} ${b.kind}@${b.x}`).toBe(true);
      seen[b.kind] = (seen[b.kind] ?? 0) + 1;
    }
    for (const k of Object.keys(TILE)) expect(seen[k], k).toBeGreaterThan(0);
  }, 180_000);

  it('gen2 遊戲：日誌古碑 0 / 14、地標總數 = 家鄉地標數；開局 < 1500 ms', () => { const t0 = performance.now(), g = new DelveGame({ seed: 'home-c', worldGen: { kind: 'gen2' } });
    expect(performance.now() - t0).toBeLessThan(1500); const st = g.discovery.stats();
    expect(st.lore).toEqual({ found: 0, total: 14 }); expect(st.landmarks.total).toBe(homeOf('home-c').landmarks.length); }, 60_000);

  it('homePlans 只建一次、之後碰家鄉欄不重建（Q9）', () => { const src = new Gen2Source('home-pin'), a = src.blueprints.homePlans();
    expect(src.blueprints.homePlans()).toBe(a); touchOuterBlueprints(src, 300);
    const d = a.find((b) => b.kind === 'dungeon')!; expect(src.blueprints.overlapping(d.x, d.x + 1).find((b) => b.kind === 'dungeon')).toBe(d);
    // 先碰家鄉欄（沒有先呼叫 homePlans）也拿到裝飾過的同一份
    const s2 = new Gen2Source('home-pin'), t = homeContent(s2).tablets.find((q) => q.id === 0)!, sp = s2.blueprints.overlapping(t.x, t.x + 1).find((b) => b.kind === 'spawn_tablet')!;
    expect(sp.tablets).toEqual([{ x: t.x, y: t.y, id: 0 }]); expect(s2.blueprints.homePlans()).toContain(sp); }, 60_000);

  // 開局的家鄉藍圖預算（Q9）：目標 ≤ 300 ms 由 Task 21 在閒置機器上把關；這裡量 20 個種子並印出，只擋 gen2 開局門檻 1500 ms（全套負載下也穩）
  // DELVE_MEASURE=1 時印出平均 / 最差（報告用）；平常不印
  it('開局預算（Q9，量測）：20 個種子的 homePlans + homeContent 每個 < 1500 ms', () => {
    const ts: number[] = [];
    for (let k = 0; k < 20; k++) { const g = new Gen2Source(`hb-${k}`), t0 = performance.now(); g.blueprints.homePlans(); homeContent(g); ts.push(performance.now() - t0); }
    if (process.env.DELVE_MEASURE === '1') console.info(`[home budget] homePlans + homeContent over ${ts.length} seeds: mean ${(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(1)} ms, worst ${Math.max(...ts).toFixed(1)} ms`);
    expect(Math.max(...ts)).toBeLessThan(1500);
  }, 120_000);

  // 遊戲讀生成物件（從 Task 2 移來：要真的 gen2 世界才有登錄，Q5；只用公開 API——interact + drainEvents，不呼叫 private claimLandmark）
  it('gen2 遊戲：古碑互動回藍圖的碑文 id；地標第一次 first: true、第二次 first: false；讀檔後仍是已領', () => {
    const g = new DelveGame({ seed: 'home-c', worldGen: { kind: 'gen2' } }), hc = homeOf('home-c');
    const t = hc.tablets.find((q) => q.id === 0)!; g.teleport(t.x + 1, t.y); g.step(FIXED_DT); g.drainEvents();
    expect(g.interact(t.x, t.y)).toBe(true); expect(g.drainEvents().find((e) => e.type === 'lore')).toMatchObject({ type: 'lore', id: 0, first: true });
    const l = hc.landmarks[0]; g.teleport(l.x + 1, l.y); g.step(FIXED_DT); g.drainEvents();
    expect(g.interact(l.x, l.y)).toBe(true); expect(g.drainEvents().find((e) => e.type === 'landmark')).toMatchObject({ type: 'landmark', first: true });
    g.interact(l.x, l.y); expect(g.drainEvents().find((e) => e.type === 'landmark')).toMatchObject({ first: false });
    const d2 = new Discovery([], { open: true }); d2.load(g.discovery.toJSON()); expect(d2.landmarks.has(g.world.idx(l.x, l.y))).toBe(true); }, 60_000);

  it('連線：同一個種子建兩次 Gen2Source（主機 / 客人），homeContent 深度相等；結果快取在 src 上', () => {
    for (const seed of ['home-c', ...SEEDS5.slice(0, 2)]) {
      const a = new Gen2Source(seed), b = new Gen2Source(seed, { recordLocks: false });
      // 客人先碰別的地方（查詢順序不同）再算
      b.blueprints.overlapping(-9000, -8000); b.surfaceAt(SPAWN_X);
      expect(homeContent(b)).toEqual(homeContent(a)); expect(homeContent(a)).toBe(homeContent(a));
    }
  }, 120_000);

  it('homeDecor 只看原始藍圖：去掉裝飾重算，石碑 / 附加物品與 homePlans 的最終藍圖逐份相同；離出生點近的小屋拿到指南針', () => {
    const src = new Gen2Source('home-c'), plans = src.blueprints.homePlans(), sp = SPAWN_X;
    // 去掉裝飾（地城以外的石碑、地城以外箱子的附加物）＝原始藍圖；重算的裝飾要正好補回最終藍圖多出來的部分
    const raw = plans.map((b) => ({ ...b, tablets: b.kind === 'dungeon' ? b.tablets : [], chests: b.chests.map((c) => ({ x: c.x, y: c.y, kind: c.kind, ...(b.kind === 'dungeon' && c.extra ? { extra: c.extra } : {}) })) }));
    const d1 = homeDecor(raw, sp);
    let nt = 0, ne = 0;
    for (const b of plans) {
      expect(d1.tablets.get(b.id) ?? [], `${b.kind}@${b.x} tablets`).toEqual(b.kind === 'dungeon' ? [] : b.tablets);
      nt += (d1.tablets.get(b.id) ?? []).length;
      const ext = d1.extras.get(b.id);
      for (const c of b.chests) { const want = b.kind === 'dungeon' ? undefined : c.extra; expect(ext?.get(`${c.x},${c.y}`), `${b.kind}@${b.x} chest ${c.x},${c.y}`).toEqual(want); if (want) ne += want.length; }
      if (ext) for (const k of ext.keys()) expect(b.chests.some((c) => `${c.x},${c.y}` === k), `${b.kind} extra key ${k}`).toBe(true);
    }
    // 14 − 地城的 3 塊；4 件遺物 + 指南針 + 深度計
    expect(nt).toBe(11); expect(ne).toBe(6); expect(d1.tablets.size + d1.extras.size).toBeGreaterThan(0);
    const cabins = plans.filter((b) => b.kind === 'cabin').sort((p, q) => Math.abs(p.x + p.w / 2 - sp) - Math.abs(q.x + q.w / 2 - sp));
    expect(cabins[0].chests.some((c) => c.extra?.includes('compass'))).toBe(true); expect(cabins[1].chests.some((c) => c.extra?.includes('depth_meter'))).toBe(true);
  }, 60_000);

  it('出生點石碑：在出生點 ± 80 之外、出生點東側第一個 MINOR 槽內，站在 groundAt 的平地上（左右兩欄地面同高）、不是地表入口欄', () => { for (const seed of SEEDS5) {
    const src = srcOf(seed), t = homeOf(seed).tablets.find((q) => q.id === 0)!, sEnt = seedInt(seed, 'g2-entrance');
    expect(t.x - SPAWN_X).toBeGreaterThan(SPAWN_CLEAR);
    const b = homeBlueprints(seed).find((q) => q.kind === 'spawn_tablet')!;
    expect(b.layer).toBe(BP_MINOR); expect(t.y).toBe(src.surfaceAt(t.x) - 1);
    expect(src.surfaceAt(t.x - 1)).toBe(src.surfaceAt(t.x)); expect(src.surfaceAt(t.x + 1)).toBe(src.surfaceAt(t.x)); expect(entranceHit(t.x, sEnt)).toBe(false);
    const m = src.layout.landmassAt(SPAWN_X)!, a = src.blueprints.anchorsOf(m).find((q) => q.kind === 'spawn_tablet')!, sl = landSlot(a.region, a.slot, BP_MINOR);
    expect(t.x).toBeGreaterThanOrEqual(sl.x0); expect(t.x).toBeLessThan(sl.x1);
    // 槽裡比它更靠近出生點的欄都不是可用的平地（平地 + 非入口欄 + 3 欄內沒有別的藍圖）
    const others = homeBlueprints(seed).filter((q) => q !== b);
    for (let x = sl.x0 + 11; x < t.x; x++) {
      const flat = src.surfaceAt(x - 1) === src.surfaceAt(x) && src.surfaceAt(x + 1) === src.surfaceAt(x) && !entranceHit(x, sEnt);
      if (flat) expect(others.some((q) => q.x < x + 4 && x - 3 < q.x + q.w), `${seed} x ${x}`).toBe(true);
    } } }, 120_000);

  // 石室 / 熔岩祭壇：藍圖的格 + 天然洞穴探針（不載入世界）。坑道底藏物：主坑道是 fill 挖的、不在藍圖裡，所以載入箱子那一帶的欄驗：
  // 箱子在該地區主坑道底圓室（caves.shaftRoom）的最低處、腳下是石地板，從箱子沿非實心、沒有液體的格（坑道 ± 20 欄內）走得到地表以上
  // 2000 個家鄉切成兩段各自逾時（Task 17：單段實測 278 s 貼著 300 s 上限，整個資料夾一起跑時逾時；種子與斷言不變）
  for (const [a, z] of [[0, 1000], [1000, 2000]] as const) {
    it(`新錨點都走得到：家鄉 lw-${a}..${z - 1} 的石室 ×2 / 熔岩祭壇（藍圖的格 + 天然洞穴探針，走到外框外 ≥ 300 格或地表）、坑道底藏物（載入世界，箱子在坑道底圓室、沿主坑道走到地表）；0 個 RangeError`, () => {
      const bad: string[] = [];
      let probed = 0, cached = 0;
      for (let k = a; k < z; k++) {
        const seed = `lw-${k}`;
        try {
          const g = new Gen2Source(seed), m = g.layout.landmassAt(SPAWN_X)!, open = naturalOpen({ seed, profile: g.profile } as BpCtx, {});
          for (const an of g.blueprints.anchorsOf(m)) {
            if (!['alcove_snow', 'alcove_desert', 'molten_shrine', 'shaft_cache'].includes(an.kind)) continue;
            const b = g.blueprints.anchorBlueprint(m, an)!, s = startOf(b);
            if (an.kind !== 'shaft_cache') { probed++; if (!escapes(g, b, s.x, s.y, open)) bad.push(`${seed} ${an.kind}@${b.x}`); continue; }
            if (cacheReachable(g, seed, an.region, b)) cached++; else bad.push(`${seed} shaft_cache@${b.x}`);
          }
        } catch (e) { if (!(e instanceof RangeError)) throw e; bad.push(`${seed}: ${e.message}`); }
      }
      expect(bad.slice(0, 5)).toEqual([]); expect(probed).toBe((z - a) * 3); expect(cached).toBe(z - a);
    }, 300_000);
  }

  it('載入世界後真的走得出去：80 個家鄉的新錨點、4 件遺物箱、14 塊石碑與指南針 / 深度計的小屋（從那一格走出它所在的藍圖外框，裂紋石 / 門算走得過），都不進液體', () => {
    const bad: string[] = [];
    let n = 0;
    for (let k = 0; k < 80; k++) {
      const seed = `lv-${k}`, g = new Gen2Source(seed), w = worldOf(g), hc = homeContent(g), bps = g.blueprints.homePlans();
      const pts: { x: number; y: number; tag: string }[] = [...hc.relics.map((r) => ({ x: r.x, y: r.y, tag: r.item })), ...hc.tablets.map((t) => ({ x: t.x, y: t.y, tag: `lore ${t.id}` }))];
      for (const b of bps) {
        if ((NEW_KINDS as readonly string[]).includes(b.kind)) pts.push({ ...startOf(b), tag: b.kind });
        for (const c of b.chests) if (c.extra?.some((i) => i === 'compass' || i === 'depth_meter')) pts.push({ x: c.x, y: c.y, tag: c.extra.join('+') });
      }
      for (const p of pts) {
        const b = bps.find((q) => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h)!;
        loadColumns(w, b.x - 80, b.x + b.w + 80); n++;
        if (!walkFrom(w, g, b, p.x, p.y)) bad.push(`${seed} ${p.tag}@${p.x},${p.y} in ${b.kind}`);
      }
    }
    expect(bad.slice(0, 5)).toEqual([]); expect(n).toBeGreaterThanOrEqual(80 * 24);
  }, 300_000);

  it('熔岩祭壇：在 [molten + 8, LAVA_Y − 12) 的玄武岩小室、有黑曜石台與 relic 箱、外框不碰 LAVA_Y、沒有液體格；石室：岩層到洞穴層之間', () => { for (const seed of SEEDS5) {
    const bps = homeBlueprints(seed), p = srcOf(seed).profile, ms = bps.find((b) => b.kind === 'molten_shrine')!;
    expect(ms.chests.map((c) => c.kind)).toEqual(['relic']);
    const c = ms.chests[0], cells = new Map<string, number[]>();
    for (let i = 0; i < ms.cells.length; i += 5) cells.set(`${ms.cells[i]},${ms.cells[i + 1]}`, [ms.cells[i + 2], ms.cells[i + 4]]);
    expect(cells.get(`${c.x},${c.y + 1}`)![0]).toBe(T.OBSIDIAN);
    expect(c.y).toBeGreaterThanOrEqual(p.layersAt(c.x).molten + 8); expect(ms.y + ms.h).toBeLessThanOrEqual(LAVA_Y - 12);
    expect([...cells.values()].filter((v) => v[1] > 0)).toEqual([]);
    expect([...cells.values()].filter((v) => v[0] === T.BASALT).length).toBeGreaterThan(20);
    for (const al of bps.filter((b) => b.kind === 'alcove')) {
      const f = al.floors[0], L = p.layersAt(f.x);
      expect(f.y).toBeGreaterThanOrEqual(L.rock); expect(f.y).toBeLessThan(L.deep);
      expect(['snow', 'desert']).toContain(al.variant);
    }
    expect(bps.filter((b) => b.kind === 'alcove').map((b) => b.variant).sort()).toEqual(['desert', 'snow']);
  } }, 120_000);
});
