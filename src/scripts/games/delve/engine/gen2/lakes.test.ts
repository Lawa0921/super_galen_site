// lakes.test.ts — gen2 靜態液體藍圖（spec §4.3）：地表湖、地下湖、熔岩池生成時就是靜止形狀（盆地 + 平液面），
// 不靠 LiquidSim 沉降：三種都出現、含它們的欄通過 liquidInvariant、整片喚醒跑 300 刻不動、液面是一條水平線；
// 形狀參數（寬 / 深 / 水位 / 橢圓 / 殼）；同一槽不同層的藍圖外框不與液體藍圖相交（後蓋的結構不會切開液體）。
import { describe, it, expect } from 'vitest';
import { Gen2Source } from './index';
import { BlueprintIndex, KEEP, liquidYields, emptyObjects, type Blueprint, type BpKind } from './blueprint';
import { LAVA_Y } from './profile';
import { worldOf, loadColumns, liquidInvariant, snapshotLiquid, SEEDS5 } from './testUtil';
import { LiquidSim } from '../liquid';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { T } from '../tiles';

const KINDS = ['lake', 'cave_lake', 'lava_pool'];
const src = new Gen2Source('lake'), liq = new BlueprintIndex('lake', src.layout, src.profile).overlapping(-25_000, 25_000).filter((b) => KINDS.includes(b.kind));
const ofKind = (k: string): Blueprint[] => liq.filter((b) => b.kind === k);

// 藍圖最後蓋在 (x, y) 的液體值（沒有 = KEEP）
function liqAt(b: Blueprint, x: number, y: number): number {
  let v = KEEP;
  for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k] === x && b.cells[k + 1] === y && b.cells[k + 4] !== KEEP) v = b.cells[k + 4];
  return v;
}
// 藍圖在 (x, y − 1) 有液體格
const hasLiquidCellAbove = (b: Blueprint, x: number, y: number): boolean => liqAt(b, x, y - 1) > 0;

// 藍圖的格：key → [fg, liq]（最後蓋的）
function cellMap(b: Blueprint): Map<string, [number, number]> {
  const m = new Map<string, [number, number]>();
  for (let k = 0; k < b.cells.length; k += 5) m.set(`${b.cells[k]},${b.cells[k + 1]}`, [b.cells[k + 2], b.cells[k + 4]]);
  return m;
}
// 液體格（liq > 0）的 x / y 範圍與每欄最上 / 最下
function liquidCells(b: Blueprint): { x: number; y: number; q: number }[] {
  const out: { x: number; y: number; q: number }[] = [];
  for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 4] > 0) out.push({ x: b.cells[k], y: b.cells[k + 1], q: b.cells[k + 4] });
  return out;
}
const full = (type: number): number => (LIQ_MAX << 8) | type;

// 在世界裡跑：載入 → 不變量 → 整片喚醒 300 刻 → 外框內液體不變
function settledInWorld(bs: Blueprint[]): void {
  expect(bs.length).toBe(6);
  const w = worldOf(src), sim = new LiquidSim(w);
  for (const b of bs) {
    loadColumns(w, b.x - 4, b.x + b.w + 4);
    expect(liquidInvariant(w, b.x - 4, b.x + b.w + 4), `${b.kind} ${b.id}`).toEqual([]);
    const before = snapshotLiquid(w, b);
    expect(before.some((v, k) => k % 2 === 0 && v > 0)).toBe(true);
    sim.wakeRect(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 2);
    for (let k = 0; k < 300; k++) sim.step();
    expect(snapshotLiquid(w, b), `${b.kind} ${b.id}`).toEqual(before);
  }
}

describe('gen2 static liquids: lake / cave_lake / lava_pool', () => {
  it('三種液體藍圖都會出現', () => { for (const k of KINDS) expect(liq.some((b) => b.kind === k)).toBe(true); });

  it('靜態液體不變量：含湖 / 地下湖 / 熔岩池的欄全部通過 liquidInvariant', () => {
    const w = worldOf(src);
    for (const b of liq.slice(0, 30)) { loadColumns(w, b.x - 4, b.x + b.w + 4); expect(liquidInvariant(w, b.x - 4, b.x + b.w + 4)).toEqual([]); }
  });

  it('喚醒後不動：液體整片喚醒、LiquidSim.step 300 次，液體格不變', () => {
    const w = worldOf(src), sim = new LiquidSim(w);
    for (const b of liq.slice(0, 8)) {
      loadColumns(w, b.x - 4, b.x + b.w + 4); const before = snapshotLiquid(w, b); sim.wakeRect(b.x - 2, b.y - 2, b.x + b.w + 2, b.y + b.h + 2);
      for (let k = 0; k < 300; k++) sim.step(); expect(snapshotLiquid(w, b)).toEqual(before);
    }
  });

  // liq 依 (layer, id) 排序，前 30 / 8 份多半是地表湖；每種各取前 6 份再驗一次
  it('每一種各 6 份：不變量 + 喚醒 300 刻不動', () => { for (const k of KINDS) settledInWorld(ofKind(k).slice(0, 6)); });

  it('每份液體藍圖的水面 / 熔岩面是一條水平線', () => {
    for (const b of liq) {
      const tops = new Set<number>();
      for (let k = 0; k < b.cells.length; k += 5) if (b.cells[k + 4] > 0 && !hasLiquidCellAbove(b, b.cells[k], b.cells[k + 1])) tops.add(b.cells[k + 1]);
      expect(tops.size).toBe(1);
    }
  });

  it('地表湖：寬 20–60、最深 6–12、水位 = 兩岸較低者、兩岸差 ≤ 8、全是滿格水、盆底與兩壁 2 格是土', () => {
    const p = src.profile, lakes = ofKind('lake');
    expect(lakes.length).toBeGreaterThan(5);
    for (const b of lakes) {
      const cells = liquidCells(b), m = cellMap(b);
      for (const c of cells) expect(c.q).toBe(full(LIQ.WATER));
      const xs = cells.map((c) => c.x), x0 = Math.min(...xs), x1 = Math.max(...xs) + 1, w = x1 - x0;
      expect(w).toBeGreaterThanOrEqual(20); expect(w).toBeLessThanOrEqual(60);
      const level = Math.min(...cells.map((c) => c.y)), sl = p.surfaceAt(x0 - 1), sr = p.surfaceAt(x1);
      expect(level).toBe(Math.max(sl, sr)); expect(Math.abs(sl - sr)).toBeLessThanOrEqual(8);
      let maxD = 0;
      for (let x = x0; x < x1; x++) {
        let d = 0;
        while (liqAt(b, x, level + d) > 0) d++;
        expect(d, `col ${x}`).toBeGreaterThanOrEqual(1);
        maxD = Math.max(maxD, d);
      }
      expect(maxD).toBeGreaterThanOrEqual(6); expect(maxD).toBeLessThanOrEqual(12);
      // 每個水格左右 2 格、下方 2 格（含斜角）不是水就是實心土
      const soils = new Set<number>([T.DIRT, T.SAND, T.MUD]);
      for (const c of cells) for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const e = m.get(`${c.x + dx},${c.y + dy}`);
        expect(e, `${c.x + dx},${c.y + dy}`).toBeDefined();
        if (e![1] > 0) continue;
        expect(soils.has(e![0]), `${c.x + dx},${c.y + dy} fg ${e![0]}`).toBe(true);
      }
      // 水面上方是空氣
      for (let x = x0; x < x1; x++) { const e = m.get(`${x},${level - 1}`); if (e) { expect(e[0]).toBe(T.AIR); expect(e[1]).toBe(0); } }
    }
  });

  it('地下湖：橢圓 rx 12–30、ry 6–12、中心在 [rock + 20, deep − 20]、下 60% 滿水、外圍 2 格石殼', () => {
    ellipseCheck(ofKind('cave_lake'), { rx: [12, 30], ry: [6, 12], shell: T.STONE, type: LIQ.WATER },
      (x) => [src.profile.layersAt(x).rock + 20, src.profile.layersAt(x).deep - 20], (h) => Math.floor((h * 3) / 5));
  });

  it('熔岩池：橢圓 rx 8–20、ry 4–8、中心在 [molten + 10, LAVA_Y − 14]、下半滿熔岩、外圍 2 格玄武岩殼', () => {
    ellipseCheck(ofKind('lava_pool'), { rx: [8, 20], ry: [4, 8], shell: T.BASALT, type: LIQ.LAVA },
      (x) => [src.profile.layersAt(x).molten + 10, LAVA_Y - 14], (h) => (h + 1) >> 1);
  });

  it('同一槽不同層的藍圖外框不與液體藍圖外框相交（5 個種子）', () => {
    let n = 0;
    for (const seed of SEEDS5) {
      const g = new Gen2Source(seed), bps = new BlueprintIndex(seed, g.layout, g.profile).overlapping(-25_000, 25_000);
      for (const a of bps) {
        if (!KINDS.includes(a.kind)) continue;
        n++;
        for (const b of bps) {
          if (b === a) continue;
          const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(hit, `${seed}: ${a.kind} ${a.id} × ${b.kind} ${b.id}`).toBe(false);
        }
      }
    }
    expect(n).toBeGreaterThan(50);
  // 5 個種子 ±25,000 格的全部藍圖（Task 11 加了小生態 / 蜂巢的建構，超過預設 5 秒）
  }, 60_000);

  it('liquidYields：液體讓給相交的非液體（任一層）與較淺層的液體；不相交、同層、非液體本身都不讓', () => {
    const bp = (kind: BpKind, layer: 0 | 1 | 2, x: number, y: number): Blueprint => ({ id: 0, kind, layer, x, y, w: 10, h: 10, cells: new Int32Array(0), chests: [], ...emptyObjects() });
    const lake = bp('lake', 0, 0, 0), cave = bp('cave_lake', 1, 5, 5), lava = bp('lava_pool', 2, 5, 5);
    expect(liquidYields(lake, bp('cabin', 1, 5, 5))).toBe(true);
    expect(liquidYields(lava, bp('cabin', 1, 5, 5))).toBe(true);
    expect(liquidYields(cave, bp('ruin', 0, 0, 0))).toBe(true);
    expect(liquidYields(cave, lake)).toBe(true); expect(liquidYields(lake, cave)).toBe(false);
    expect(liquidYields(lava, cave)).toBe(true); expect(liquidYields(cave, lava)).toBe(false);
    expect(liquidYields(lake, bp('cabin', 1, 10, 0))).toBe(false);
    expect(liquidYields(lake, bp('ruin', 0, 5, 5))).toBe(false);
    expect(liquidYields(bp('cabin', 1, 5, 5), lake)).toBe(false);
  });
});

// 橢圓液體：內部 = fg 空氣的格；最寬列的寬 = 2rx + 1、高 = 2ry + 1；液體列 = 底下 rows(h) 列；內部格 2 格內（Chebyshev）的非內部格是殼
function ellipseCheck(bs: Blueprint[], o: { rx: [number, number]; ry: [number, number]; shell: number; type: number },
  yRange: (x: number) => [number, number], rows: (h: number) => number): void {
  expect(bs.length).toBeGreaterThan(5);
  for (const b of bs) {
    const m = cellMap(b), inner: { x: number; y: number; q: number }[] = [];
    for (const [k, [f, q]] of m) if (f === T.AIR) { const [x, y] = k.split(',').map(Number); inner.push({ x, y, q }); }
    const ys = inner.map((c) => c.y), y0 = Math.min(...ys), y1 = Math.max(...ys), h = y1 - y0 + 1, ry = (h - 1) >> 1, cy = y0 + ry;
    const xs = inner.map((c) => c.x), cx = (Math.min(...xs) + Math.max(...xs)) >> 1, rx = cx - Math.min(...xs);
    // 液面高過最寬列（地下湖）時兩肩填成殼，量到的半寬 = 液面那列的半寬（ry ≤ 12、液面在中心上 ≤ 2 列：至少 rx − 1）
    expect(rx).toBeGreaterThanOrEqual(o.rx[0] - 1); expect(rx).toBeLessThanOrEqual(o.rx[1]);
    expect(ry).toBeGreaterThanOrEqual(o.ry[0]); expect(ry).toBeLessThanOrEqual(o.ry[1]);
    const [lo, hi] = yRange(cx);
    expect(cy).toBeGreaterThanOrEqual(lo); expect(cy).toBeLessThanOrEqual(hi);
    const top = y1 + 1 - rows(h);
    for (const c of inner) expect(c.q, `${c.x},${c.y}`).toBe(c.y >= top ? full(o.type) : 0);
    // 液面那一列是內部最寬的一列（液體每欄從液面往下連續）
    const rowW = (y: number): number => inner.filter((c) => c.y === y).length;
    for (let y = y0; y <= y1; y++) expect(rowW(y)).toBeLessThanOrEqual(rowW(top));
    const isInner = new Set(inner.map((c) => `${c.x},${c.y}`));
    for (const c of inner) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const k = `${c.x + dx},${c.y + dy}`;
      if (isInner.has(k)) continue;
      const e = m.get(k);
      expect(e && e[0], k).toBe(o.shell);
      expect(e![1]).toBe(0);
    }
  }
}
