// sea.test.ts — gen2 海上點位（spec §8，M1；M2a Task 20 加珊瑚礁 / 海底遺跡 / 有建物的島，形狀在 islands.test）：每道海的每個 300 格槽恰有一個點、
// 沉船在水面下半埋於海床（有箱子、船內保留水）、漂流箱浮在水面（三格木板 + 箱子）、海上的靜態液體不變量、
// 島的表層（沙灘沙 / 台地草）與樹（P12：本 Task 是島地形的唯一擁有者）、slotOf 反查海槽。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, slotOf, KEEP, BP_SURFACE, type Blueprint } from './blueprint';
import { SEA_Y } from './profile';
import type { IslandInfo } from './layout';
import { fillCol, worldOf, loadColumns, liquidInvariant, SEEDS5 } from './testUtil';
import { li } from '../column';
import { T, W, isSolidTile } from '../tiles';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { LiquidSim } from '../liquid';
import type { World } from '../world';

// 範圍內地表以上有沒有該 tile
function rangeHas(w: World, x0: number, x1: number, tile: number): boolean {
  for (let x = x0; x < x1; x++) { const s = w.surfaceAt(x); for (let y = 0; y < s; y++) if (w.getFg(x, y) === tile) return true; }
  return false;
}
// 藍圖最後蓋在 (x, y) 的 fg / wall / liq（沒有 = KEEP）
function cellAt(b: Blueprint, x: number, y: number): { f: number; w: number; q: number } {
  const o = { f: KEEP, w: KEEP, q: KEEP };
  for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k] === x && b.cells[k + 1] === y) {
    if (b.cells[k + 2] !== KEEP) o.f = b.cells[k + 2];
    if (b.cells[k + 3] !== KEEP) o.w = b.cells[k + 3];
    if (b.cells[k + 4] !== KEEP) o.q = b.cells[k + 4];
  }
  return o;
}
const count = (b: Blueprint, t: number): number => { let n = 0; for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 2] === t) n++; return n; };
// 島 d 上不在島藍圖（Task 20：燈塔 / 隱士 / 沉船島）外框內的欄
function islandCols(src: Gen2Source, d: IslandInfo): number[] {
  const bps = src.blueprints.overlapping(d.x0, d.x1, [BP_SURFACE]).filter((b) => b.kind === 'island'), out: number[] = [];
  for (let x = d.x0; x < d.x1; x++) if (!bps.some((b) => x >= b.x && x < b.x + b.w)) out.push(x);
  return out;
}

describe('gen2 sea points: islands / shipwrecks / floating crates', () => {
  it('每道海的每個槽恰有一個點', () => {
    for (const seed of SEEDS5) {
      const src = new Gen2Source(seed), idx = new BlueprintIndex(seed, src.layout, src.profile);
      for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) {
        const sea = src.layout.landmass(side, i);
        expect(sea.kind).toBe('sea');
        for (const s of sea.slots) {
          const bps = idx.overlapping(s.x0, s.x1).filter((b) => b.x >= s.x0 && b.x < s.x1);
          // 島槽：plain 沒有藍圖、有建物的島一份 kind 'island'（Task 20）
          if (s.poi === 'island') { const d = sea.islands.find((q) => q.slot === s.k); expect(d).toBeDefined(); expect(bps.map((b) => b.kind)).toEqual(d!.type === 'plain' ? [] : ['island']); }
          else { expect(bps, `${seed} ${side}:${i} slot ${s.k}`).toHaveLength(1); expect(bps[0].kind).toBe(s.poi); expect(bps[0].layer).toBe(BP_SURFACE); }
        }
      }
    }
  });

  it('沉船在水面下、有箱子；漂流箱的木板在 waterTop − 1、箱子在 waterTop − 2', () => {
    const src = new Gen2Source('wreck'), bps = new BlueprintIndex('wreck', src.layout, src.profile).overlapping(-40_000, 40_000);
    const sw = bps.find((b) => b.kind === 'shipwreck')!, wt = src.waterTopAt(sw.x)!;
    expect(sw.y).toBeGreaterThan(wt); expect(sw.chests).toHaveLength(1); expect(slotOf(sw.id, src.layout).region.kind).toBe('sea');
    const cr = bps.find((b) => b.kind === 'crate')!, c = cr.chests[0], top = src.waterTopAt(c.x)!, col = fillCol(src, c.x >> 5);
    expect(c.y).toBe(top - 2); expect(col.fg[li(c.x, top - 2)]).toBe(T.CHEST);
    expect([-1, 0, 1].map((d) => col.fg[li(c.x + d, top - 1)])).toEqual([T.PLANKS, T.PLANKS, T.PLANKS]);
    // 漂流箱的格沒有碰到水面那一列（水不被擠掉）
    // 漂流箱的少量物資表（Task 20 起 'crate'）
    expect(cr.y + cr.h).toBe(top); expect(cr.chests).toEqual([{ x: c.x, y: top - 2, kind: 'crate' }]);
  });

  it('沉船的形狀：寬 18–26、船底在海床下 2 格、木板船殼 + 木樑桅杆 + 深色木板牆、置中於槽 ± 槽寬 / 10、箱子在船內水中（ruin）', () => {
    let n = 0;
    for (const seed of ['wreck', ...SEEDS5]) {
      const src = new Gen2Source(seed);
      for (const b of new BlueprintIndex(seed, src.layout, src.profile).overlapping(-30_000, 30_000).filter((q) => q.kind === 'shipwreck')) {
        n++;
        const s = slotOf(b.id, src.layout), sw = s.x1 - s.x0, mid = s.x0 + (sw >> 1);
        expect(b.w).toBeGreaterThanOrEqual(18); expect(b.w).toBeLessThanOrEqual(26);
        expect(Math.abs(b.x + (b.w >> 1) - mid)).toBeLessThanOrEqual(Math.floor(sw / 10));
        let sum = 0;
        for (let x = b.x; x < b.x + b.w; x++) sum += src.surfaceAt(x);
        expect(b.y + b.h - 1).toBe(Math.round(sum / b.w) + 2);
        expect(count(b, T.PLANKS)).toBeGreaterThan(20); expect(count(b, T.BEAM)).toBeGreaterThanOrEqual(2);
        let dark = 0;
        for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 3] === W.DARK_PLANK_WALL) dark++;
        expect(dark).toBeGreaterThan(b.w * 2);
        // 實心的船殼格清掉水；非實心的格（箱子 / 木樑）不動水（船內保留水）
        for (let k = 0; k < b.cells.length; k += 5) {
          const f = b.cells[k + 2], q = b.cells[k + 4];
          if (f !== KEEP && isSolidTile(f)) expect(q).toBe(0); else expect(q).toBe(KEEP);
        }
        const c = b.chests[0];
        expect(c.kind).toBe('ruin'); expect(cellAt(b, c.x, c.y).f).toBe(T.CHEST);
        expect(c.y).toBeLessThan(src.surfaceAt(c.x)); expect(c.y).toBeGreaterThan(src.waterTopAt(c.x)!);
      }
    }
    expect(n).toBeGreaterThan(10);
  });

  // M2a Task 19：海點偏移 ± min(20, floor(槽寬 / 10))（島在 layout.test）
  it('沉船與漂流箱的中心離槽中心 ≤ 20', () => {
    let n = 0;
    for (const seed of SEEDS5) {
      const src = new Gen2Source(seed);
      for (const side of [1, -1] as const) for (const i of [1, 3, 5, 7]) for (const s of src.layout.landmass(side, i).slots) {
        if (s.poi === 'island') continue;
        const b = src.blueprints.overlapping(s.x0, s.x1).find((q) => q.kind === s.poi && q.x >= s.x0 && q.x < s.x1), msg = `${seed} ${side}:${i} slot ${s.k} ${s.poi}`;
        expect(b, msg).toBeDefined();
        n++;
        expect(Math.abs(b!.x + (b!.w >> 1) - (s.x0 + ((s.x1 - s.x0) >> 1))), msg).toBeLessThanOrEqual(20);
      }
    }
    expect(n).toBeGreaterThan(30);
  }, 60_000);

  it('海上的靜態液體不變量（含沉船與漂流箱的欄）', () => {
    const src = new Gen2Source('sea'), w = worldOf(src), sea = src.layout.landmass(1, 1);
    loadColumns(w, sea.x0, sea.x1); expect(liquidInvariant(w, sea.x0, sea.x1)).toEqual([]);
  });

  it('沉船：載入後箱子與桅杆泡在滿格水裡，整片喚醒跑 300 刻水不動', () => {
    const src = new Gen2Source('wreck'), w = worldOf(src), sim = new LiquidSim(w);
    // Task 20 起沉船只佔非島槽的 30%（原本 50%）：範圍放寬到 ±30,000 才湊得到 4 艘
    const wrecks = new BlueprintIndex('wreck', src.layout, src.profile).overlapping(-30_000, 30_000).filter((b) => b.kind === 'shipwreck').slice(0, 4);
    expect(wrecks.length).toBe(4);
    for (const b of wrecks) {
      loadColumns(w, b.x - 4, b.x + b.w + 4);
      expect(liquidInvariant(w, b.x - 4, b.x + b.w + 4)).toEqual([]);
      const c = b.chests[0];
      expect(w.getFg(c.x, c.y)).toBe(T.CHEST); expect([w.getLiquid(c.x, c.y), w.getLiquidType(c.x, c.y)]).toEqual([LIQ_MAX, LIQ.WATER]);
      const snap = (): number[] => { const o: number[] = []; for (let y = b.y - 2; y < b.y + b.h + 2; y++) for (let x = b.x - 2; x < b.x + b.w + 2; x++) o.push(w.getLiquid(x, y), w.getLiquidType(x, y), w.getFg(x, y)); return o; };
      const before = snap();
      sim.wakeRect(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 2);
      for (let k = 0; k < 300; k++) sim.step();
      expect(snap()).toEqual(before);
    }
  });

  it('島：台地在水面上、表層有草或沙、regionAt.kind = island；多數島有樹', () => {
    const src = new Gen2Source('isl');
    let treed = 0, n = 0;
    for (const i of [1, 3, 5]) for (const d of src.layout.landmass(1, i).islands) {
      n++;
      // 表層看島上建物（Task 20 的島藍圖）外框以外、離中央最近的一欄
      const x = islandCols(src, d).sort((p, q) => Math.abs(p - ((d.x0 + d.x1) >> 1)) - Math.abs(q - ((d.x0 + d.x1) >> 1)))[0], col = fillCol(src, x >> 5);
      expect(src.waterTopAt(x)).toBeNull(); expect(src.surfaceAt(x)).toBeLessThan(SEA_Y);
      expect([T.GRASS, T.SAND]).toContain(col.fg[li(x, src.surfaceAt(x))]); expect(src.regionAt(x).kind).toBe('island');
      const w = worldOf(src); loadColumns(w, d.x0, d.x1); if (rangeHas(w, d.x0, d.x1, T.WOOD)) treed++;
    }
    expect(treed).toBeGreaterThan(n / 2);
  });

  it('島的表層：離水 4 格內沙灘沙（4 格深、其下泥）、其餘草 + 泥；樹根只在草上', () => {
    for (const seed of SEEDS5) {
      const src = new Gen2Source(seed), w = worldOf(src);
      for (const d of src.layout.landmass(-1, 1).islands.concat(src.layout.landmass(1, 3).islands)) {
        loadColumns(w, d.x0 - 2, d.x1 + 2);
        // 島上建物（Task 20）的外框以外照舊
        for (const x of islandCols(src, d)) {
          const s = src.surfaceAt(x), e = Math.min(x - d.x0, d.x1 - 1 - x);
          if (e < 4) expect([0, 1, 2, 3].map((k) => w.getFg(x, s + k)), `${seed} ${x}`).toEqual([T.SAND, T.SAND, T.SAND, T.SAND]);
          else expect([w.getFg(x, s), w.getFg(x, s + 1)], `${seed} ${x}`).toEqual([T.GRASS, T.DIRT]);
          if (w.getFg(x, s - 1) === T.WOOD) expect(e).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it('slotOf 反查海槽（P12）', () => {
    // brief 的範圍 [4200, 7200) 在 'sid' 只有第一道海、它的槽全是島（測試會是空的）→ 放寬到東側 30000 格
    const src = new Gen2Source('sid'), bps = new BlueprintIndex('sid', src.layout, src.profile).overlapping(4200, 4200 + 30_000);
    const sea = bps.filter((q) => ['shipwreck', 'crate', 'reef', 'sea_ruin', 'island'].includes(q.kind));
    expect(sea.length).toBeGreaterThan(0);
    for (const b of sea) {
      const s = slotOf(b.id, src.layout);
      expect(s.region.kind).toBe('sea'); expect(b.x).toBeGreaterThanOrEqual(s.x0); expect(b.x + b.w).toBeLessThanOrEqual(s.x1);
    }
  });

  it('objectsIn 回傳海上的箱子', () => {
    const src = new Gen2Source('wreck'), sea = src.layout.landmass(1, 1);
    const chests = src.blueprints.overlapping(sea.x0, sea.x1).flatMap((b) => b.chests);
    expect(chests.length).toBeGreaterThan(0);
    expect(src.objectsIn(sea.x0, sea.x1).map((c) => [c.x, c.y])).toEqual(chests.map((c) => [c.x, c.y]));
  });
});
