// dungeon.test.ts — gen2 家鄉地城（M2a Task 8）：spec §4.4（≥ 25 房、在地城區內、塔底貼地）、可解性（房間圖 + tile 洪水填充）、
// 召喚 / 鑰匙內容與舊地城相同（Q20a：陶罐 / 箱子裡的地城鑰匙、上鎖神殿的金鑰匙、上鎖寶箱的金礦夠做 wick_offering）、
// 地城裡沒有天然洞穴、分段填 = 整欄填、建構 ≤ 80 ms、家鄉藍圖釘選（Q9）、50 個種子都建得出來。
import { describe, it, expect, beforeAll } from 'vitest';
import { Gen2Source } from './index';
import { structureId, stamp, type Blueprint, type BpCtx } from './blueprint';
import { buildDungeonBp } from './structures/dungeon';
import { anchorSpan } from './anchors';
import { homeDungeonRegion, SPAWN_X, VARIANT, type Landmass } from './layout';
import { worldOf, loadColumns, fillCol, bytes, solvable, floodSolvable, naturalHoles } from './testUtil';
import { seedInt } from '../noise';
import { Column } from '../column';
import { T } from '../tiles';
import { findRecipe } from '../crafting';
import type { Stack } from '../inventory';
import type { DungeonInfo } from '../genTypes';
import { DelveGame } from '../game';

interface Dg { src: Gen2Source; bp: Blueprint; info: DungeonInfo }
// nh-8（DUNGEONS[1]，給「沒有天然洞穴」那條）：地城外框若沒有從區內最高地表往下併進 solid，地表入口的洞穴會挖進外框（40 個種子裡 5 個）
const SEEDS = ['dg-a', 'nh-8', 'dg-c', 'dg-d', 'dg-e'];
const SEEDS50 = Array.from({ length: 50 }, (_, k) => `dg50-${k}`);
const home = (src: Gen2Source): Landmass => src.layout.landmassAt(SPAWN_X)!;
const infoOf = (bp: Blueprint): DungeonInfo => {
  if (bp.site?.kind !== 'dungeon') throw new Error('not a dungeon blueprint');
  return bp.site.info;
};
// 經 BlueprintIndex 取家鄉地城（地城區內唯一的 dungeon 藍圖）
function dungeonIn(src: Gen2Source): Dg {
  const z = homeDungeonRegion(home(src)), bp = src.blueprints.overlapping(z.x0, z.x1).find((b) => b.kind === 'dungeon');
  if (!bp) throw new Error('no dungeon blueprint');
  return { src, bp, info: infoOf(bp) };
}
// 地城錨點的 BpCtx（照 BlueprintIndex：structureId、anchorSpan = 整個地城區）
function dungeonCtx(seed: string): BpCtx {
  const src = new Gen2Source(seed), m = home(src), a = src.blueprints.anchorsOf(m).find((q) => q.kind === 'dungeon')!, sp = anchorSpan(seed, a);
  return { seed, s: seedInt(seed, 'g2-bp'), id: structureId(m.side, m.i, a.region.index, a.slot, a.layer), slotX0: sp.x0, slotX1: sp.x1,
    region: a.region, profile: src.profile, ver: m.ver, groundAt: (x) => src.surfaceAt(x) };
}
const dungeonOf = (seed: string): Blueprint => buildDungeonBp(dungeonCtx(seed));
// 依序取東側外圍大陸的藍圖，直到碰過 n 份不同的藍圖
function touchOuterBlueprints(g: Gen2Source, n: number): void {
  const seen = new Set<number>();
  for (let i = 1; seen.size < n; i++) {
    if (i > 100) throw new Error('not enough outer blueprints');
    const m = g.layout.landmass(1, i);
    for (const b of g.blueprints.overlapping(m.x0, m.x1)) seen.add(b.id);
  }
}
const stackCount = (slots: readonly (Stack | null)[], item: string): number => slots.reduce((n, s) => n + (s?.item === item ? s.count : 0), 0);
const recipeOf = (id: string): { inputs: [string, number][] } => ({ inputs: findRecipe(id)!.inputs.map((a) => [a.item, a.n]) });

let DUNGEONS: [string, Dg][] = [];
beforeAll(() => { DUNGEONS = SEEDS.map((s) => [s, dungeonIn(new Gen2Source(s))]); }, 120_000);

describe('gen2 家鄉地城', () => {
  it('§4.4：每個種子的家鄉地城 ≥ 25 房、bbox 寬 ≥ 0.7 高、在地城區內、塔底貼地', () => { for (const [, d] of DUNGEONS) {
    expect(d.info.rooms.length).toBeGreaterThanOrEqual(25); expect(d.info.bbox.w).toBeGreaterThanOrEqual(0.7 * d.info.bbox.h);
    const z = homeDungeonRegion(home(d.src)); expect(d.info.bbox.x).toBeGreaterThanOrEqual(z.x0); expect(d.info.bbox.x + d.info.bbox.w).toBeLessThanOrEqual(z.x1);
    expect(Math.abs(d.src.surfaceAt(d.info.entrance.x) - (d.info.entrance.y + 1))).toBeLessThanOrEqual(2); } });

  it('外框：wholeRegion、在地城區內（Task 7）、對著沙灘那側留 4 格、涵蓋塔周圍整平帶 cx ± 34 × [gy − 40, gy + 8)（Task 5 延續）、solid / ground 在外框內', () => {
    for (const [, d] of DUNGEONS) {
      const z = homeDungeonRegion(home(d.src)), b = d.bp, beachWest = d.src.profile.regionAt(z.x0 - 1)!.variant === VARIANT.BEACH;
      expect(b.wholeRegion).toBe(true); expect(b.kind).toBe('dungeon');
      expect(b.x).toBeGreaterThanOrEqual(z.x0 + (beachWest ? 4 : 0)); expect(b.x + b.w).toBeLessThanOrEqual(z.x1 - (beachWest ? 0 : 4));
      const cx = d.info.entrance.x - 4, gy = d.info.entrance.y + 1;
      expect(b.x).toBeLessThanOrEqual(cx - 34); expect(b.x + b.w).toBeGreaterThanOrEqual(cx + 35);
      expect(b.y).toBeLessThanOrEqual(gy - 40); expect(b.y + b.h).toBeGreaterThanOrEqual(gy + 8);
      // 整平帶真的畫了：cx ± 34 每欄 [gy − 40, gy) 都是空氣（塔身以外）、地面覆寫 = gy
      const air = new Set<number>();
      for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === T.AIR) air.add(b.cells[k] * 4096 + b.cells[k + 1]);
      for (let x = cx - 34; x <= cx + 34; x++) {
        if (x >= d.info.tower.x - 1 && x <= d.info.tower.x + d.info.tower.w) continue;
        for (let y = gy - 40; y < gy; y++) expect(air.has(x * 4096 + y), `${x},${y}`).toBe(true);
        expect(d.src.surfaceAt(x)).toBe(gy);
      }
      // 整平帶在 solid 裡（fill 的洞穴挖不穿）
      expect(b.solid!.x).toBeLessThanOrEqual(cx - 34); expect(b.solid!.x + b.solid!.w).toBeGreaterThan(cx + 34); expect(b.solid!.y).toBeLessThanOrEqual(gy); expect(b.solid!.y + b.solid!.h).toBeGreaterThanOrEqual(gy + 8);
      for (const s of [b.solid!, { x: b.ground!.x0, y: b.y, w: b.ground!.tops.length, h: 1 }]) { expect(s.x).toBeGreaterThanOrEqual(b.x); expect(s.x + s.w).toBeLessThanOrEqual(b.x + b.w); }
      expect(b.solid!.y).toBeGreaterThanOrEqual(b.y); expect(b.solid!.y + b.solid!.h).toBeLessThanOrEqual(b.y + b.h);
      // floors：每個房間地板列上站得住的格（空氣、腳下實心），每房至少一格
      for (const r of d.info.rooms) expect(b.floors.some((f) => f.y === r.y + r.h - 1 && f.x >= r.x && f.x < r.x + r.w), `room ${r.id}`).toBe(true);
      expect(b.site).toMatchObject({ kind: 'dungeon', key: 's' + b.id, rot: 0 });
    }
  });

  it('召喚 / 鑰匙內容：房間圖可解（鑰匙數 = 上鎖門數、不開鎖就拿得到所有鑰匙、金鑰匙在上鎖神殿、寶藏室上鎖）', () => { for (const [, d] of DUNGEONS) expect(solvable(d.info)).toEqual({ ok: true }); });

  it('世界整合：載入地城欄後 tile 層級可解（洪水填充）、陶罐鑰匙登錄進 potDrops、上鎖寶箱 tile 與 rune_pickaxe、塔 / 神殿 / 寶藏室古碑 id 6 / 7 / 12', () => {
    const [, d] = DUNGEONS[0], w = worldOf(d.src); loadColumns(w, d.info.bbox.x, d.info.bbox.x + d.info.bbox.w);
    expect(floodSolvable(w, d.info)).toEqual({ ok: true });
    for (const p of d.bp.pots) expect(w.potDrops.get(w.idx(p.x, p.y))).toEqual(p.drops);
    const t = d.info.treasureChest; expect(w.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST); expect(w.chests.get(w.idx(t.x, t.y))!.some((s) => s?.item === 'rune_pickaxe')).toBe(true);
    expect(d.info.tablets.map((q) => [q.site, w.genTablets.get(w.idx(q.x, q.y))]).sort()).toEqual([['shrine', 7], ['tower', 6], ['treasure', 12]]); }, 60_000);

  it('召喚 / 鑰匙內容與舊地城相同（Q20a）：陶罐鑰匙 + 箱子鑰匙 = 上鎖門數、金鑰匙在上鎖神殿、寶藏箱的金礦夠做 wick_offering 的 3 金錠', () => { for (const [, d] of DUNGEONS) {
    const locked = d.info.doors.filter((q) => q.locked).length, potKeys = d.bp.pots.flatMap((p) => p.drops).filter((q) => q.item === 'dungeon_key').length;
    expect(potKeys).toBeGreaterThanOrEqual(1); expect(potKeys + d.bp.chests.filter((c) => c.extra?.includes('dungeon_key')).length).toBe(locked);
    expect(d.info.keys.filter((k) => k.golden && k.container === 'chest')).toHaveLength(1);
    const w = worldOf(d.src), t = d.info.treasureChest; loadColumns(w, t.x, t.x + 1);
    expect(w.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST); expect(stackCount(w.chests.get(w.idx(t.x, t.y))!, 'gold_ore')).toBeGreaterThanOrEqual(12);
    expect(recipeOf('wick_offering').inputs).toContainEqual(['gold_bar', 3]); expect(recipeOf('gold_bar').inputs).toEqual([['gold_ore', 4]]); } }, 60_000);

  it('上鎖金寶箱在 gen2 遊戲裡（Task 5 延續）：沒金鑰匙打不開、用金鑰匙打開後拿得到 rune_pickaxe 與金礦', () => {
    const g = new DelveGame({ seed: 'dg-game', worldGen: { kind: 'gen2' } }), d = dungeonIn(g.gen2()!), t = d.info.treasureChest;
    g.teleport(t.x - 2, t.y + 1);
    for (let i = 0; i < 5; i++) g.step();
    expect(g.world.getFg(t.x, t.y)).toBe(T.LOCKED_CHEST);
    expect(g.interact(t.x, t.y)).toBe(false); expect(g.openChest).toBeNull();
    g.give('golden_key', 1);
    expect(g.interact(t.x, t.y)).toBe(true); expect(g.openChest).toEqual({ x: t.x, y: t.y }); expect(g.inventory.count('golden_key')).toBe(0);
    expect(g.takeAllFromChest()).toBeGreaterThan(0);
    expect(g.inventory.count('rune_pickaxe')).toBe(1); expect(g.inventory.count('gold_ore')).toBeGreaterThanOrEqual(12);
  }, 120_000);

  it('地城裡沒有天然洞穴：bbox 內縮 14 的每個空氣格都有地城背景牆', () => { const [, d] = DUNGEONS[1], w = worldOf(d.src), b = d.info.bbox;
    loadColumns(w, b.x, b.x + b.w); expect(naturalHoles(w, { x: b.x + 14, y: b.y + 14, w: b.w - 28, h: b.h - 28 })).toEqual([]); }, 60_000);

  it('分段填 = 整欄填（地城跨欄）；colIndex 每欄恰好是該欄的格；地城藍圖單次建構 ≤ 80 ms（3 次中位數；直接呼叫建構器，不經索引）', () => { const [, d] = DUNGEONS[2], cx = (d.info.bbox.x >> 5) + 3;
    const whole = fillCol(d.src, cx), parts = new Column(cx, 1200); d.src.fill(parts, cx * 32, cx * 32 + 13); d.src.fill(parts, cx * 32 + 13, cx * 32 + 32);
    expect(bytes(parts)).toEqual(bytes(whole));
    const ci = d.bp.colIndex!, c = d.bp.cells;
    let n = 0;
    for (const [k, [a, z]] of ci) { for (let i = a; i < z; i += 5) expect(c[i] >> 5).toBe(k); n += z - a; }
    expect(n).toBe(c.length);
    // 排序 + colIndex 不改蓋出來的結果：拿掉 colIndex（整份掃）蓋同一欄，位元組相同
    const a = new Column(cx, 1200), z = new Column(cx, 1200);
    stamp(a, d.bp, cx * 32, cx * 32 + 32); stamp(z, { ...d.bp, colIndex: undefined }, cx * 32, cx * 32 + 32);
    expect(bytes(a)).toEqual(bytes(z)); expect(bytes(a).some((v) => v !== 0)).toBe(true);
    // 單次牆鐘會被負載抖動拉高：量 3 次（每次新的 ctx，不吃快取）取中位數
    const ts = ['dg-time', 'dg-time-2', 'dg-time-3'].map((s) => { const ctx = dungeonCtx(s), t0 = performance.now(); buildDungeonBp(ctx); return performance.now() - t0; }).sort((p, q) => p - q);
    expect(ts[1], ts.map((t) => t.toFixed(1)).join(' / ')).toBeLessThanOrEqual(80); }, 30_000);

  it('家鄉藍圖釘選：碰過外圍 300 份藍圖（超過 LRU 256）之後，再取地城藍圖是同一個物件（沒被淘汰重建）', () => { const g = new Gen2Source('dg-pin'), z = homeDungeonRegion(home(g));
    const a = g.blueprints.overlapping(z.x0, z.x1).find((b) => b.kind === 'dungeon')!; touchOuterBlueprints(g, 300);
    expect(a).toBeDefined();
    expect(g.blueprints.overlapping(z.x0, z.x1).find((b) => b.kind === 'dungeon')).toBe(a); }, 60_000);

  it('50 個種子都建得出地城（不丟 RangeError）、每個 ≥ 25 房且房間圖可解', () => { for (const seed of SEEDS50) {
    let bp: Blueprint | null = null;
    expect(() => { bp = dungeonOf(seed); }, seed).not.toThrow();
    const info = infoOf(bp!);
    expect(info.rooms.length, seed).toBeGreaterThanOrEqual(25); expect(solvable(info), seed).toEqual({ ok: true }); } }, 300_000);

  it('礦照常換（控制者裁決）：地城 solid 範圍內的礦密度（礦 / 可換礦的岩格）與鄰近同尺寸區塊相差 ±30% 內（3 個種子）', () => {
    const ORE = new Set<number>([T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]), HOST = new Set<number>([T.STONE, T.DEEP_STONE, ...ORE]);
    for (const [seed, d] of DUNGEONS.slice(0, 3)) {
      const s = d.bp.solid!, z = homeDungeonRegion(home(d.src)), beachWest = d.src.profile.regionAt(z.x0 - 1)!.variant === VARIANT.BEACH;
      // 鄰近區塊：地城區往內側（離開沙灘的那側）緊鄰、同寬同高
      const nx = beachWest ? z.x1 : z.x0 - s.w, w = worldOf(d.src);
      const density = (x0: number): { ore: number; host: number } => {
        loadColumns(w, x0, x0 + s.w);
        let ore = 0, host = 0;
        for (let x = x0; x < x0 + s.w; x++) for (let y = s.y; y < s.y + s.h; y++) { const t = w.getFg(x, y); if (ORE.has(t)) ore++; if (HOST.has(t)) host++; }
        return { ore, host };
      };
      const a = density(s.x), b = density(nx), ra = a.ore / a.host, rb = b.ore / b.host;
      expect(a.ore, seed).toBeGreaterThan(1000); expect(b.ore, seed).toBeGreaterThan(1000);
      expect(ra / rb, `${seed} ${ra} vs ${rb}`).toBeGreaterThanOrEqual(0.7); expect(ra / rb, `${seed} ${ra} vs ${rb}`).toBeLessThanOrEqual(1.3);
    }
  }, 120_000);

  it('地城外框不與家鄉任何其他藍圖的外框在 x 上重疊（鄰接地區的槽離地區邊 ≥ 8；Task 9 起的家鄉結構保護）', () => {
    for (const [seed, d] of DUNGEONS) {
      const h = home(d.src), b = d.bp, others = d.src.blueprints.overlapping(h.x0, h.x1).filter((q) => q !== b);
      expect(others.length, seed).toBeGreaterThan(0);
      for (const o of others) expect(o.x + o.w <= b.x || o.x >= b.x + b.w, `${seed} ${o.kind} [${o.x}, ${o.x + o.w})`).toBe(true);
    }
  }, 60_000);
});
