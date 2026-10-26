// outer.test.ts — M2a Task 18：荒野大陸的大東西（村莊 / 小地城 / 地廳）與隱士小屋（spec §4.1「荒野大陸的結構以遺跡、地城、小屋、礦坑、隱士為主」、
// §4.4 驚喜密度「任意 1,800 格內至少一個大東西」）。錨點 vs 保證槽（Q15）、小地城外框內沒有別的藍圖（Q10）、隱士 NPC（Q20b）、
// 都從地表走得到（指揮官裁決 1：載入世界、液體不可走）、小地城在遊戲裡打得開（裁決 2）、外圍地城房間名唯一（Task 17b 延續）、外圍聚落名（裁決 4）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { DelveGame } from '../game';
import { FIXED_DT, TILE_SIZE } from '../constants';
import { T, isSolidTile } from '../tiles';
import { BIOME } from '../world';
import type { World } from '../world';
import type { DungeonInfo, GenSite } from '../genTypes';
import { seedInt } from '../noise';
import { structureId, type Blueprint, type BpCtx } from './blueprint';
import { anchorSpan, type Anchor } from './anchors';
import { decodeStructureId } from './structId';
import type { Landmass, Layout } from './layout';
import { buildKeepBp } from './structures/keep';
import { LEVEL_HALF } from './structures/dungeon';
import { solvable, floodSolvable, worldOf, loadColumns } from './testUtil';
import { gen2Regions, gen2RegionById, ROOM_NAMES } from '../discovery';
import { areaLabel } from '../../render/model';

const SEEDS20 = Array.from({ length: 20 }, (_, k) => `outer-${k}`);
const LIQUID_KINDS: ReadonlySet<string> = new Set(['lake', 'cave_lake', 'lava_pool']);
const BIG_KINDS: ReadonlySet<string> = new Set(['village', 'keep', 'hall']);
const CONTS = [[1, 2], [1, 4], [1, 6], [-1, 2], [-1, 4], [-1, 6]] as const;
type Site<K extends GenSite['kind']> = Extract<GenSite, { kind: K }>;

// 地塊 m 範圍內（外框 x 在 m 裡）的藍圖
const bpsIn = (g: Gen2Source, m: Landmass): Blueprint[] => g.blueprints.overlapping(m.x0, m.x1).filter((b) => b.x >= m.x0 && b.x < m.x1);
// [x0, x1) 內的大東西（村莊 / 小地城 / 地廳）的外框 x 範圍 [x, x + w]
const bigBoxes = (g: Gen2Source, x0: number, x1: number): [number, number][] =>
  g.blueprints.overlapping(x0, x1).filter((b) => BIG_KINDS.has(b.kind) && b.x >= x0 && b.x < x1).map((b) => [b.x, b.x + b.w]);
const slotKey = (a: Anchor): string => `${a.region.index}:${a.layer}:${a.slot}`;
const slotKeyOf = (b: Blueprint, _layout: Layout): string => { const d = decodeStructureId(b.id); return `${d.region}:${d.layer}:${d.slot}`; };
// 是不是 guard() 選的那份保證小屋 / 遺跡（BlueprintIndex.guaranteed）
const isGuaranteed = (g: Gen2Source, m: Landmass, b: Blueprint): boolean => { const q = g.blueprints.guaranteed(m); return b.id === q.cabin.id || b.id === q.ruin.id; };
const meets = (a: Blueprint, b: Blueprint): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const siteOf = <K extends GenSite['kind']>(b: Blueprint, kind: K): Site<K> => {
  if (b.site?.kind !== kind) throw new Error(`${b.kind} has no ${kind} site`);
  return b.site as Site<K>;
};
// 東側由近到遠第一座小地城、第一座村莊、第一座地廳
function firstOuter(seed: string): { src: Gen2Source; keep: Site<'dungeon'>; village: Site<'village'>; hall: Site<'hall'>; keepBp: Blueprint } {
  const src = new Gen2Source(seed);
  let keepBp: Blueprint | undefined, village: Blueprint | undefined, hall: Blueprint | undefined;
  for (let i = 2; (!keepBp || !village || !hall) && i < 40; i += 2) {
    const bs = bpsIn(src, src.layout.landmass(1, i));
    keepBp ??= bs.find((b) => b.kind === 'keep'); village ??= bs.find((b) => b.kind === 'village'); hall ??= bs.find((b) => b.kind === 'hall');
  }
  if (!keepBp || !village || !hall) throw new Error(`${seed}: no outer keep / village / hall`);
  return { src, keep: siteOf(keepBp, 'dungeon'), village: siteOf(village, 'village'), hall: siteOf(hall, 'hall'), keepBp };
}
// 欄在讀到時才載入的世界讀取（整座小地城先全部載入太慢）
function lazyFg(w: World): { getFg(x: number, y: number): number; load(x: number): void } {
  const loaded = new Set<number>(), load = (x: number): void => { if (!loaded.has(x >> 5)) { w.ensureColumn(x >> 5); loaded.add(x >> 5); } };
  return { load, getFg: (x, y) => { load(x); return w.getFg(x, y); } };
}
// 小地城的鑰匙容器（載入後的世界）：每把鑰匙都在它的箱子 / 陶罐裡（金鑰匙 golden_key、其他 dungeon_key），地城鑰匙數 = 上鎖的門數、金鑰匙恰 1 把；回傳不對的項目
function keyProblems(w: World, d: DungeonInfo, load: (x: number) => void = () => {}): string[] {
  const out: string[] = [], locked = d.doors.filter((q) => q.locked).length;
  let keys = 0;
  for (const k of d.keys) {
    load(k.x);
    const i = w.idx(k.x, k.y), item = k.golden ? 'golden_key' : 'dungeon_key';
    const n = k.container === 'chest' ? (w.chests.get(i) ?? []).filter((s) => s?.item === item).length : (w.potDrops.get(i) ?? []).filter((q) => q.item === item).length;
    if (n < 1) out.push(`${item} missing in ${k.container} ${k.x},${k.y}`);
    if (!k.golden) keys++;
  }
  if (keys !== locked) out.push(`keys ${keys} vs locked doors ${locked}`);
  if (d.keys.filter((k) => k.golden).length !== 1) out.push('golden keys');
  return out;
}
// 東側第一片大陸的隱士小屋
function firstHermitHut(g: DelveGame): Site<'hermit'> {
  const src = g.gen2()!, b = bpsIn(src, src.layout.landmass(1, 2)).find((q) => q.kind === 'hermit_hut')!;
  return siteOf(b, 'hermit');
}
// 從 (x, y) 走 4 鄰的非實心格（裂紋石 / 門算走得過：門一敲就開、上鎖的門鑰匙在同一座地城裡，floodSolvable 驗過）、不進液體，
// 走到藍圖外框外、地表以上的格 = 走得到地表。範圍 = 外框左右 80 欄、上 80 列到下 40 列（同 lore.test 的 walkFrom）。
// 欄在走到時才載入（整個範圍先載入的話 504 片大陸要 280 s）
const PASS: ReadonlySet<number> = new Set([T.CRACKED_STONE, T.DOOR_CLOSED, T.DOOR_LOCKED]);
function reachesSurface(w: World, src: Gen2Source, b: Blueprint, x: number, y: number): boolean {
  const x0 = b.x - 80, x1 = b.x + b.w + 80, y0 = Math.max(0, b.y - 80), y1 = b.y + b.h + 40, W = x1 - x0, seen = new Uint8Array(W * (y1 - y0)), st = [x, y];
  seen[(y - y0) * W + x - x0] = 1;
  const fgAt = lazyFg(w).getFg;
  while (st.length) {
    const cy = st.pop()!, cx = st.pop()!;
    if ((cx < b.x || cx >= b.x + b.w || cy < b.y || cy >= b.y + b.h) && cy < src.surfaceAt(cx)) return true;
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
      const k = (ny - y0) * W + nx - x0;
      if (seen[k]) continue;
      const t = fgAt(nx, ny);
      if ((isSolidTile(t) && !PASS.has(t)) || w.getLiquid(nx, ny) > 0) continue;
      seen[k] = 1; st.push(nx, ny);
    }
  }
  return false;
}
// 藍圖要從地表走得到的點：小地城 = 入口 + 上鎖的金寶箱、地廳 = 主廳中央、村莊 = 委託板、隱士小屋 = 隱士站的格
function mustReach(b: Blueprint): { x: number; y: number; tag: string }[] {
  const s = b.site;
  if (b.kind === 'keep' && s?.kind === 'dungeon') return [{ ...s.info.entrance, tag: 'keep entrance' }, { ...s.info.treasureChest, tag: 'keep locked chest' }];
  if (b.kind === 'hall' && s?.kind === 'hall') return [{ x: (s.info.x0 + s.info.x1) >> 1, y: s.info.floorY - 2, tag: 'hall' }];
  if (b.kind === 'village' && s?.kind === 'village') return [{ ...s.info.board, tag: 'village board' }];
  if (b.kind === 'hermit_hut' && s?.kind === 'hermit') return [{ ...s.at, tag: 'hermit' }];
  return [];
}

describe('gen2 荒野大陸的大東西與隱士小屋（Task 18）', () => {
  it('荒野大陸的大東西：兩端 500 格內各有一個、相鄰兩個的外框間隔 < 1,700', () => { for (const seed of SEEDS20) { const g = new Gen2Source(seed);
    for (const [side, i] of CONTS) { const m = g.layout.landmass(side, i), big = bigBoxes(g, m.x0, m.x1).sort((a, b) => a[0] - b[0]);
      expect(big.length, `${seed} ${side}:${i}`).toBeGreaterThanOrEqual(2);
      expect(big[0][0], `${seed} ${side}:${i}`).toBeLessThan(m.x0 + 500); expect(big.at(-1)![1], `${seed} ${side}:${i}`).toBeGreaterThan(m.x1 - 500);
      for (let k = 1; k < big.length; k++) expect(big[k][0] - big[k - 1][1], `${seed} ${side}:${i} #${k}`).toBeLessThan(1700); } } }, 300_000);

  // Task 21 延後事項 8：Task 18 實際比例 村 30 / 城 39 / 廳 30 偏離雜湊設定（tier 1 50 / 30 / 20、tier ≥ 2 35 / 45 / 20）——退讓多半落到槽較密的地廳。
  // 改成退讓依序取第一個 ≤ KIND_NEAR 的種類、小地城的退讓先村莊，並「欠債」：放不下的種類記下來，之後的目標放得下就先還（anchors.continentAnchors）。
  // 40 個種子 × 每側 i = 2..12 的大陸：改前 tier 1 村 35.9 / 城 31.1 / 廳 32.9、tier ≥ 2 27.0 / 42.5 / 30.5；改後 41.9 / 36.2 / 21.9、30.5 / 47.0 / 22.6。
  // tier 1 的村莊仍少約 8 個百分點：HIGH 地區不放村莊（Task 18：太陡），tier 1 的大陸只有 3–6 個目標，欠下的村莊還不完
  it('大東西的種類比例接近雜湊設定（Task 21）：tier ≥ 2 各在設定 ± 6 個百分點內；tier 1 地廳 ≤ 25%、村莊 ≥ 38%、小地城 ≤ 40%', () => {
    const n: Record<string, Record<string, number>> = { t1: {}, t2: {} };
    for (let s = 0; s < 40; s++) {
      const g = new Gen2Source(`ratio-${s}`);
      for (const side of [1, -1] as const) for (let i = 2; i <= 12; i += 2) {
        const m = g.layout.landmass(side, i), t = m.tier <= 1 ? 't1' : 't2';
        for (const a of g.blueprints.anchorsOf(m)) if (BIG_KINDS.has(a.kind)) n[t][a.kind] = (n[t][a.kind] ?? 0) + 1;
      }
    }
    const pct = (t: string, k: string): number => { const tot = Object.values(n[t]).reduce((a, c) => a + c, 0); return (100 * (n[t][k] ?? 0)) / tot; };
    const tag = JSON.stringify(n);
    expect(Math.abs(pct('t2', 'village') - 35), tag).toBeLessThanOrEqual(6); expect(Math.abs(pct('t2', 'keep') - 45), tag).toBeLessThanOrEqual(6);
    expect(Math.abs(pct('t2', 'hall') - 20), tag).toBeLessThanOrEqual(6);
    expect(pct('t1', 'hall'), tag).toBeLessThanOrEqual(25); expect(pct('t1', 'village'), tag).toBeGreaterThanOrEqual(38);
    // 修正回合 1：tier 1 的小地城（設定 30%，村莊放不下時的退讓先落到它）也設上界，防止回歸
    expect(pct('t1', 'keep'), tag).toBeLessThanOrEqual(40);
  }, 120_000);

  it('小地城：≥ 8 房、房間圖可解、有上鎖寶箱；外圍村莊有居民（欄載入後 elder 存在）', () => { const { keep, village } = firstOuter('outer-k');
    expect(keep.info.rooms.length).toBeGreaterThanOrEqual(8); expect(solvable(keep.info)).toEqual({ ok: true });
    expect(keep.info.rooms[keep.info.treasureRoom].locked).toBe(true);
    const g = new DelveGame({ seed: 'outer-k', worldGen: { kind: 'gen2' } }); g.teleport(village.info.board.x, village.info.board.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
    expect(g.folk.byKey(`${village.key}:elder`)).not.toBeNull(); }, 120_000);

  it('錨點 vs 保證槽（Q15）：保證小屋 / 遺跡不落在錨點槽，且每片大陸仍各 ≥ 1；keep 外框內沒有其他非液體藍圖（Q10）；每座小地城 ≥ 8 房、可解', () => {
    let keeps = 0;
    for (const seed of SEEDS20) { const g = new Gen2Source(seed);
      for (const [side, i] of CONTS) { const m = g.layout.landmass(side, i), anc = new Set(g.blueprints.anchorsOf(m).map(slotKey)), bps = bpsIn(g, m);
        expect(bps.filter((b) => b.kind === 'cabin').length, `${seed} ${side}:${i}`).toBeGreaterThanOrEqual(1); expect(bps.filter((b) => b.kind === 'ruin').length, `${seed} ${side}:${i}`).toBeGreaterThanOrEqual(1);
        const guaranteed = bps.filter((q) => (q.kind === 'cabin' || q.kind === 'ruin') && isGuaranteed(g, m, q));
        expect(guaranteed, `${seed} ${side}:${i}`).toHaveLength(2);
        for (const b of guaranteed) expect(anc.has(slotKeyOf(b, g.layout)), `${seed} ${b.kind} ${b.x}`).toBe(false);
        for (const k of bps.filter((q) => q.kind === 'keep')) {
          keeps++;
          expect(bps.filter((o) => o !== k && !LIQUID_KINDS.has(o.kind) && meets(o, k)).map((o) => `${o.kind}@${o.x}`), `${seed} keep@${k.x}`).toEqual([]);
          const info = siteOf(k, 'dungeon').info;
          expect(info.rooms.length, `${seed} keep@${k.x}`).toBeGreaterThanOrEqual(8); expect(solvable(info), `${seed} keep@${k.x}`).toEqual({ ok: true });
          // 外框涵蓋可用範圍中點 ± LEVEL_HALF（塔周圍整平帶；anchors.continentAnchors 估兩端有沒有大東西靠這一條）
          const ka = g.blueprints.anchorsOf(m).find((q) => slotKey(q) === slotKeyOf(k, g.layout))!, sp = anchorSpan(seed, ka), c = (sp.x0 + sp.x1) >> 1;
          expect(k.x <= c - LEVEL_HALF && k.x + k.w > c + LEVEL_HALF, `${seed} keep@${k.x}`).toBe(true);
        } } }
    expect(keeps).toBeGreaterThan(60);
  }, 300_000);

  it('隱士小屋（Q20b）：每片荒野大陸 1 座；欄載入後隱士 NPC 在屋裡', () => { for (const seed of SEEDS20) { const g = new Gen2Source(seed);
    for (const [side, i] of CONTS) expect(bpsIn(g, g.layout.landmass(side, i)).filter((b) => b.kind === 'hermit_hut' && b.site?.kind === 'hermit'), `${seed} ${side}:${i}`).toHaveLength(1); }
    const g = new DelveGame({ seed: 'outer-h', worldGen: { kind: 'gen2' } }), h = firstHermitHut(g); g.teleport(h.at.x, h.at.y); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
    const npc = g.folk.byKey(`${h.key}:hermit`)!; expect(npc).not.toBeNull(); expect(Math.abs(npc.body.x / TILE_SIZE - h.at.x)).toBeLessThanOrEqual(8);
    expect(npc.role).toBe('hermit'); expect(g.siteName(h.key)).not.toBe(''); }, 300_000);

  // 指揮官裁決 1：一律可進入。84 個種子 × 6 片大陸 = 504 片（切兩段各自逾時）
  for (const [a, z] of [[0, 42], [42, 84]] as const) {
    it(`都從地表走得到（載入世界、液體不可走）：rch-${a}..${z - 1} × 6 片大陸的小地城入口與上鎖寶箱、地廳主廳、村莊委託板、隱士；每座小地城 tile 層級可解、鑰匙都在容器裡`, () => {
      const bad: string[] = [], n: Record<string, number> = {};
      for (let s = a; s < z; s++) {
        const seed = `rch-${s}`, g = new Gen2Source(seed);
        for (const [side, i] of CONTS) {
          const w = worldOf(g);
          for (const b of bpsIn(g, g.layout.landmass(side, i))) {
            const pts = mustReach(b);
            if (!pts.length) continue;
            for (const p of pts) { n[p.tag] = (n[p.tag] ?? 0) + 1; if (!reachesSurface(w, g, b, p.x, p.y)) bad.push(`${seed} ${side}:${i} ${p.tag}@${p.x},${p.y}`); }
            if (b.kind === 'keep') {
              const d = siteOf(b, 'dungeon').info, lz = lazyFg(w), v = floodSolvable(lz, d);
              n['keep flood'] = (n['keep flood'] ?? 0) + 1;
              if (!v.ok) bad.push(`${seed} ${side}:${i} keep@${b.x} flood: ${v.why}`);
              for (const q of keyProblems(w, d, lz.load)) bad.push(`${seed} ${side}:${i} keep@${b.x} ${q}`);
            }
          }
        }
      }
      // DELVE_MEASURE=1 時印出各種類的點數（報告用）；平常不印
      if (process.env.DELVE_MEASURE === '1') console.info(`[gen2 outer reach] rch-${a}..${z - 1}`, JSON.stringify(n), 'bad', bad.length);
      expect(bad.slice(0, 5)).toEqual([]);
      const conts = (z - a) * 6;
      expect(n.hermit).toBe(conts); expect(n['keep entrance']).toBe(n['keep locked chest']); expect(n['keep flood']).toBe(n['keep entrance']);
      for (const t of ['keep entrance', 'hall', 'village board']) expect(n[t] ?? 0, t).toBeGreaterThan(conts / 6);
    }, 300_000);
  }

  it('小地城在遊戲裡打得開（裁決 2）：鑰匙都在同一座小地城裡（載入後的箱子 / 陶罐）、tile 洪水填充可解；拿神殿的金鑰匙開金寶箱', () => {
    const { keep } = firstOuter('outer-k'), d = keep.info, g = new DelveGame({ seed: 'outer-k', worldGen: { kind: 'gen2' } }), w = g.world;
    g.teleport(d.entrance.x, d.entrance.y); for (let k = 0; k < 10; k++) g.step(FIXED_DT);
    loadColumns(w, d.bbox.x - 2, d.bbox.x + d.bbox.w + 2);
    expect(g.sites.list('dungeon').some((s) => s.key === keep.key)).toBe(true);
    expect(floodSolvable(w, d)).toEqual({ ok: true });
    expect(keyProblems(w, d)).toEqual([]);
    const t = d.treasureChest;
    expect(w.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST);
    g.teleport(t.x, t.y); g.step(FIXED_DT);
    expect(g.interact(t.x, t.y)).toBe(false);
    const gk = d.keys.find((k) => k.golden)!;
    g.teleport(gk.x, gk.y); g.step(FIXED_DT);
    expect(g.interact(gk.x, gk.y)).toBe(true); g.takeAllFromChest(); g.closeChest();
    expect(g.inventory.count('golden_key')).toBe(1);
    g.teleport(t.x, t.y); g.step(FIXED_DT);
    expect(g.interact(t.x, t.y)).toBe(true);
    expect(g.inventory.count('golden_key')).toBe(0); expect(w.unlocked.has(w.idx(t.x, t.y))).toBe(true);
    expect(g.takeAllFromChest()).toBeGreaterThan(0);
  }, 120_000);

  it('外圍地城房間名（Task 17b 延續）：單座小地城內房間名唯一，gen2Regions 與 gen2RegionById 同名；外圍村莊 / 地廳也同名', () => {
    let rooms = 0;
    for (const seed of SEEDS20.slice(0, 8)) {
      const g = new Gen2Source(seed), q = gen2Regions(seed, g), byId = gen2RegionById(seed, g);
      for (const [side, i] of CONTS) for (const b of bpsIn(g, g.layout.landmass(side, i))) {
        if (b.kind === 'keep') {
          const info = siteOf(b, 'dungeon').info, names: string[] = [];
          for (const r of info.rooms) {
            // 有名單的房型（ROOM_NAMES：入口大廳 / 書庫 / 牢房 / 神殿 / 寶藏室 / 密室）一定立地區；其他房型（大廳 / 豎井 / 房間）不立
            if (!ROOM_NAMES[r.kind]) continue;
            const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1), hit = q(cx, cy).find((x) => x.kind === `dungeon_${r.kind}` && x.x === r.x && x.y === r.y);
            expect(hit, `${seed} keep@${b.x} ${r.kind} room ${r.id}`).toBeDefined();
            if (!hit) continue;
            rooms++; names.push(hit.name);
            expect(byId(hit.id)?.name, `${seed} ${hit.kind}`).toBe(hit.name);
          }
          expect(new Set(names).size, `${seed} keep@${b.x} ${names.join()}`).toBe(names.length);
          const whole = q(info.entrance.x, info.entrance.y + 3).find((x) => x.kind === 'dungeon');
          expect(whole, `${seed} keep@${b.x}`).toBeDefined(); expect(byId(whole!.id)?.name).toBe(whole!.name);
        }
        if (b.kind === 'village' || b.kind === 'hall' || b.kind === 'hermit_hut') {
          const s = b.site!, p = s.kind === 'village' ? s.info.board : s.kind === 'hall' ? { x: (s.info.x0 + s.info.x1) >> 1, y: s.info.floorY - 2 } : s.kind === 'hermit' ? s.at : null;
          const kind = b.kind === 'hall' ? 'dwarf_hall' : b.kind === 'hermit_hut' ? 'hermit' : 'village', hit = q(p!.x, p!.y).find((x) => x.kind === kind);
          expect(hit, `${seed} ${b.kind}@${b.x}`).toBeDefined(); expect(hit!.name).not.toBe(''); expect(byId(hit!.id)?.name).toBe(hit!.name);
        }
      }
    }
    expect(rooms).toBeGreaterThan(100);
  }, 300_000);

  it('外圍聚落名（裁決 4）：外圍村莊欄載入後 siteName 非空、提示說得出村名（不出現「」）、走進去 HUD 顯示村名', () => {
    const { village } = firstOuter('outer-k'), g = new DelveGame({ seed: 'outer-k', worldGen: { kind: 'gen2' } }), d = g.discovery;
    g.giveGear('iron_pickaxe', 1); g.settle.cores.push({ id: 1, x: g.spawn.x, y: g.spawn.y });
    const v = village.info, near = v.x0 - 60;
    // 站在村外 60 格（村莊地區外擴 ±22，還沒走進去）：外框那一欄載入 → 聚落登錄、居民出現，名字走外圍查詢
    g.teleport(near, g.gen2()!.surfaceAt(near) - 2); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
    expect(g.sites.byKey(village.key)).toBeDefined();
    const name = g.siteName(village.key);
    expect(name).not.toBe('');
    // 家鄉的村莊都走過之後，提示指向沒走過的外圍村莊（說得出村名）
    for (const r of d.listKnown().filter((q) => q.kind === 'village')) d.visit(r.ax, r.ay);
    const h = g.nextStepHint();
    expect(h).not.toContain('「」');
    expect(h).toContain(`村子「${name}」`);
    // 走進村子：HUD 的地區名 = 村名、日誌（已知表）有它
    g.teleport(v.board.x, v.board.y); for (let k = 0; k < 10; k++) g.step(FIXED_DT);
    expect(areaLabel(d, v.board.x, v.board.y)).toBe(name);
    expect(d.listKnown().some((r) => r.kind === 'village' && r.name === name && d.isFound(r.id))).toBe(true);
    expect(g.nextStepHint()).not.toContain('「」');
  }, 120_000);

  it('外圍聚落名（裁決 4）：外圍地廳欄載入後 siteName 非空、提示說得出廳名（不出現「」）', () => {
    const { hall } = firstOuter('outer-k'), g = new DelveGame({ seed: 'outer-k', worldGen: { kind: 'gen2' } }), d = g.discovery, src = g.gen2()!;
    g.giveGear('iron_pickaxe', 1); g.settle.cores.push({ id: 1, x: g.spawn.x, y: g.spawn.y });
    // 提示依序：村莊 → 旅行藥師 → 地廳；讓前兩句都不成立（已邀請藥師）
    g.settle.invited.add('healer');
    // 站在地廳正上方的地表（地廳在洞穴層深處，還沒走進去）：那一欄載入 → 聚落登錄，名字走外圍查詢
    const hx = (hall.info.x0 + hall.info.x1) >> 1;
    g.teleport(hx, src.surfaceAt(hx) - 2); for (let k = 0; k < 30; k++) g.step(FIXED_DT);
    expect(g.sites.byKey(hall.key)).toBeDefined();
    const name = g.siteName(hall.key);
    expect(name).not.toBe('');
    // 家鄉的村莊 / 地廳與登錄過的外圍村莊都走過之後，提示指向這座外圍地廳
    for (const r of d.listKnown().filter((q) => q.kind === 'village' || q.kind === 'dwarf_hall')) d.visit(r.ax, r.ay);
    for (const v of g.sites.list('village')) d.visit(v.info.board.x, v.info.board.y);
    const h = g.nextStepHint();
    expect(h).not.toContain('「」');
    expect(h).toContain(`「${name}」`);
    expect(h).toMatch(/矮人/);
  }, 120_000);

  // Task 21 延後事項 5：外圍（荒野大陸）的機率礦坑一定走得進去——從礦車那一格走得到地表（同上面的 reachesSurface：載入世界、液體不可走、欄走到時才載入）
  it('外圍礦坑可進入（Task 21）：≥ 200 座外圍礦坑的礦車都從地表走得到（載入世界、液體不可走）', () => {
    const bad: string[] = [];
    let n = 0;
    for (let s = 0; n < 200 && s < 60; s++) {
      const seed = `mine-${s}`, g = new Gen2Source(seed);
      for (const [side, i] of CONTS) {
        const w = worldOf(g);
        for (const b of bpsIn(g, g.layout.landmass(side, i))) {
          if (b.kind !== 'mineshaft') continue;
          n++;
          const c = b.landmarks[0];
          if (!c || !reachesSurface(w, g, b, c.x, c.y)) bad.push(`${seed} ${side}:${i} mineshaft@${b.x},${b.y}`);
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(200);
    expect(bad.slice(0, 5)).toEqual([]);
  }, 300_000);

  // Task 21 延後事項 9（Task 18 審查 Minor 9）：整平的地面依生態鋪（村莊 / 隱士小屋原本一律鋪草）；載入世界看整平過的每一欄的地面那格
  it('地表依生態（Task 21）：外圍村莊 / 隱士小屋整平的地面——森林鋪草、叢林鋪叢林草、雪原鋪雪、沙漠鋪沙；雪原 / 沙漠的藍圖不寫草；家鄉村莊（森林）照舊鋪草', () => {
    const TOP: Readonly<Record<number, number>> = { [BIOME.FOREST]: T.GRASS, [BIOME.JUNGLE]: T.JUNGLE_GRASS, [BIOME.SNOW]: T.SNOW, [BIOME.DESERT]: T.SAND };
    const GROUND: ReadonlySet<number> = new Set([T.GRASS, T.JUNGLE_GRASS, T.SNOW, T.SAND, T.DIRT, T.MUD]);
    const seen = new Map<string, number>(), bad: string[] = [];
    const check = (g: Gen2Source, w: World, b: Blueprint, tag: string): void => {
      const gr = b.ground!;
      let ok = 0;
      loadColumns(w, gr.x0, gr.x0 + gr.tops.length);
      for (let k = 0; k < gr.tops.length; k++) {
        // 房子的地板（木板）蓋在地面那一列：只看地面材質的格（草 / 叢林草 / 雪 / 沙 / 泥土 / 泥巴）
        const x = gr.x0 + k, y = gr.tops[k], bi = g.profile.biomeAt(x), t = w.getFg(x, y);
        if (!GROUND.has(t)) continue;
        if (t === TOP[bi]) ok++; else bad.push(`${tag} ${b.kind}@${x},${y} biome ${bi} tile ${t}`);
      }
      if (ok < gr.tops.length >> 2) bad.push(`${tag} ${b.kind}@${b.x}: only ${ok} / ${gr.tops.length} columns of ${TOP[g.profile.biomeAt(b.x)]}`);
      const bi = g.profile.biomeAt(b.x + (b.w >> 1)), key = `${b.kind}:${bi}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (bi === BIOME.SNOW || bi === BIOME.DESERT) for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === T.GRASS) { bad.push(`${tag} ${b.kind}@${b.x} grass`); break; }
    };
    for (const seed of SEEDS20.slice(0, 10)) {
      const g = new Gen2Source(seed), w = worldOf(g);
      for (const [side, i] of CONTS) for (const b of bpsIn(g, g.layout.landmass(side, i))) if (b.kind === 'village' || b.kind === 'hermit_hut') check(g, w, b, `${seed} ${side}:${i}`);
      for (const b of g.blueprints.homePlans().filter((q) => q.kind === 'village')) check(g, w, b, `${seed} home`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
    // 不是空測：四種生態的村莊與隱士小屋都有
    for (const bi of [BIOME.FOREST, BIOME.JUNGLE, BIOME.SNOW, BIOME.DESERT]) for (const k of ['village', 'hermit_hut']) expect(seen.get(`${k}:${bi}`) ?? 0, `${k} biome ${bi}`).toBeGreaterThan(0);
  }, 300_000);

  it('效能（裁決 8）：小地城藍圖單次建構 ≤ 80 ms（3 次中位數；直接呼叫建構器）', () => {
    const { src, keepBp } = firstOuter('outer-k'), d = decodeStructureId(keepBp.id), m = src.layout.landmass(d.side as 1 | -1, d.i);
    const a = src.blueprints.anchorsOf(m).find((q) => q.kind === 'keep' && q.region.index === d.region && q.slot === d.slot)!, sp = anchorSpan('outer-k', a);
    const c: BpCtx = { seed: 'outer-k', s: seedInt('outer-k', 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
      region: a.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x) };
    const ts: number[] = [];
    for (let k = 0; k < 3; k++) { const t0 = performance.now(), b = buildKeepBp(c); ts.push(performance.now() - t0); expect([b.x, b.y, b.w, b.h]).toEqual([keepBp.x, keepBp.y, keepBp.w, keepBp.h]); }
    ts.sort((p, q) => p - q);
    // DELVE_MEASURE=1 時印出（報告用）；平常不印
    if (process.env.DELVE_MEASURE === '1') console.info('[gen2 keep] build ms', ts.map((t) => t.toFixed(1)).join(' '));
    expect(ts[1]).toBeLessThanOrEqual(80);
  }, 60_000);
});
