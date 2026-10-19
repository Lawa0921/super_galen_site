// liquid.drain.test.ts — 湖泊洩水：挖穿湖底後整個湖往破口流（不是只有破口那一欄）、水面整體下降直到流光或平衡；
// 總量只會因薄膜蒸發減少、不會變多；熔岩 / 蜂蜜照原本的節奏比較慢；世界生成的真實湖也一樣；靜止時不花成本。
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T } from './tiles';
import { LiquidSim } from './liquid';
import { LIQ_MAX } from './liquidKind';
import { generateWorld } from './worldgen';

/**
 * 湖：x 1..LW、y LY0..LY1 滿液體；湖底 y = FLOOR 是石頭；底下 CAV_W 寬、CAV_H 高的空腔（x 1..CAV_W）。
 * 靜置到全部退休（像世界生成後載入的靜止湖）。
 */
function lakeWorld(o: { LW?: number; LD?: number; CAV_W?: number; CAV_H?: number; type?: number } = {}) {
  const { LW = 30, LD = 6, CAV_H = 20, type = LIQ.WATER } = o;
  const CAV_W = o.CAV_W ?? LW;
  const W = LW + 2, LY0 = 2, LY1 = LY0 + LD - 1, FLOOR = LY1 + 1, H = FLOOR + 1 + CAV_H + 1;
  const w = new World(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cavity = y > FLOOR && y < H - 1 && x >= 1 && x <= CAV_W;
    const lake = y < FLOOR && x >= 1 && x <= LW;
    if (!cavity && !lake) w.fg[w.idx(x, y)] = T.STONE;
  }
  const sim = new LiquidSim(w);
  for (let y = LY0; y <= LY1; y++) for (let x = 1; x <= LW; x++) w.setLiquid(x, y, LIQ_MAX, type);
  sim.wakeAll();
  sim.settle(500);
  return { w, sim, W, H, LW, LD, LY0, LY1, FLOOR, CAV_W };
}
function sumRect(w: World, x0: number, y0: number, x1: number, y1: number): number {
  let s = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) s += w.getLiquid(x, y);
  return s;
}
function total(w: World): number { let s = 0; for (let i = 0; i < w.liquid.length; i++) s += w.liquid[i]; return s; }

describe('湖泊洩水（合成湖）', () => {
  it('靜止的湖不花成本：退休後每刻處理 0 格', () => {
    const { sim } = lakeWorld();
    expect(sim.activeCount).toBe(0);
    for (let k = 0; k < 50; k++) sim.step();
    expect(sim.stats.processed).toBe(0);
  });

  it('寬 30 深 6 的湖挖穿湖底一格 → 整個湖流進空腔，每一欄都降下來；總量不增、蒸發 < 2%', () => {
    const { w, sim, LW, LY0, LY1, FLOOR, H } = lakeWorld();
    const lake0 = sumRect(w, 1, LY0, LW, LY1);
    const tot0 = total(w);
    w.setFg(5, FLOOR, T.AIR); // 挖穿（setFg → onTileChange → 喚醒）
    let prev = tot0;
    for (let k = 0; k < 1500; k++) {
      sim.step();
      const t = total(w);
      expect(t).toBeLessThanOrEqual(prev); // 不會憑空生水
      prev = t;
      if (k === 200) {
        // 湖面整體下降：離破口最遠的那欄也已經在降（不是只有破口那欄）
        expect(sumRect(w, LW, LY0, LW, LY1)).toBeLessThan(6 * LIQ_MAX);
      }
    }
    const cav = sumRect(w, 1, FLOOR, LW, H - 2);
    expect(cav).toBeGreaterThan(lake0 * 0.98);
    for (let x = 1; x <= LW; x++) expect(sumRect(w, x, LY0, x, LY1)).toBeLessThan(3);
    expect(tot0 - total(w)).toBeLessThan(tot0 * 0.02);
    expect(sim.activeCount).toBe(0); // 流完又靜止
  });

  it('空腔裝不下 → 空腔滿、湖面整體平平地降低（兩邊水位平衡）', () => {
    // 湖 40×6 = 240 格；空腔 10×12 = 120 格 → 剩一半，湖面約降 3 格
    const { w, sim, LW, LY0, LY1, FLOOR, H, CAV_W } = lakeWorld({ LW: 40, LD: 6, CAV_W: 10, CAV_H: 12 });
    const tot0 = total(w);
    w.setFg(3, FLOOR, T.AIR);
    for (let k = 0; k < 3000; k++) sim.step();
    expect(sim.activeCount).toBe(0);
    expect(sumRect(w, 1, FLOOR + 1, CAV_W, H - 2)).toBeGreaterThan(120 * LIQ_MAX * 0.97);
    const cols: number[] = [];
    for (let x = 1; x <= LW; x++) cols.push(sumRect(w, x, LY0, x, LY1));
    const mx = Math.max(...cols), mn = Math.min(...cols);
    expect(mx).toBeLessThan(4 * LIQ_MAX); // 遠端也降了（原本 6 格滿）
    expect(mn).toBeGreaterThan(2 * LIQ_MAX);
    expect(mx - mn).toBeLessThanOrEqual(LIQ_MAX / 4); // 水面是平的
    expect(tot0 - total(w)).toBeLessThan(tot0 * 0.01);
  });

  it('熔岩 / 蜂蜜也會整湖洩光，而且照黏度：同樣刻數水 > 熔岩 > 蜂蜜', () => {
    const drained = (type: number, ticks: number): number => {
      const { w, sim, LW, LY0, LY1, FLOOR } = lakeWorld({ type });
      const lake0 = sumRect(w, 1, LY0, LW, LY1);
      w.setFg(5, FLOOR, T.AIR);
      for (let k = 0; k < ticks; k++) sim.step();
      return 1 - sumRect(w, 1, LY0, LW, LY1) / lake0;
    };
    const t = 300;
    const water = drained(LIQ.WATER, t), lava = drained(LIQ.LAVA, t), honey = drained(LIQ.HONEY, t);
    expect(water).toBeGreaterThan(lava);
    expect(lava).toBeGreaterThan(honey);
    // 給夠時間都會流光
    expect(drained(LIQ.LAVA, 1500 * 5)).toBeGreaterThan(0.98);
    expect(drained(LIQ.HONEY, 1500 * 10)).toBeGreaterThan(0.98);
  });
});

describe('湖泊洩水（世界生成的真實湖）', { timeout: 120_000 }, () => {
  it('最大的地下湖：挖穿最深那欄的湖底 → 湖洩到平衡（只剩湖底窪處），遠端欄位也降；每刻成本在預算內', () => {
    const r = generateWorld('liquids');
    const w = r.world, W = w.width;
    const sim = new LiquidSim(w);
    sim.setSprings(r.springs);
    sim.measure = true;
    // 最大的一片連通水域
    const seen = new Uint8Array(w.liquid.length);
    let reg: number[] = [];
    for (let s = 0; s < w.liquid.length; s++) {
      if (seen[s] || w.liquidType[s] !== LIQ.WATER) continue;
      const cur: number[] = [], st = [s];
      seen[s] = 1;
      while (st.length) {
        const i = st.pop()!;
        cur.push(i);
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < w.liquid.length && !seen[j] && w.liquidType[j] === LIQ.WATER) { seen[j] = 1; st.push(j); }
      }
      if (cur.length > reg.length) reg = cur;
    }
    expect(reg.length).toBeGreaterThan(2000);
    const vol = (): number => { let s = 0; for (const i of reg) s += w.liquid[i]; return s; };
    let hx = -1, hy = -1, minX = W, maxX = 0;
    for (const i of reg) {
      const x = i % W, y = (i - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y > hy && w.liquidType[i + W] !== LIQ.WATER) { hy = y; hx = x; }
    }
    const v0 = vol();
    // 湖底下方挖一個裝得下整湖的空腔（還沒接通），再挖穿湖底到空腔的豎井
    const cy0 = hy + 4, cy1 = hy + 30, cx0 = hx - 150, cx1 = hx + 150;
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = y * W + x; w.fg[i] = T.AIR; w.liquid[i] = 0; w.liquidType[i] = LIQ.NONE; }
    const local = (): number => { let s = vol(); for (let y = hy + 1; y <= cy1 + 1; y++) for (let x = cx0 - 1; x <= cx1 + 1; x++) s += w.liquid[y * W + x]; return s; };
    const colVol = (x: number): number => { let s = 0; for (const i of reg) if (i % W === x) s += w.liquid[i]; return s; };
    const farX = Math.abs(minX + 5 - hx) > Math.abs(maxX - 5 - hx) ? minX + 5 : maxX - 5;
    const far0 = colVol(farX);
    expect(local()).toBe(v0);
    for (let y = hy + 1; y < cy0; y++) w.setFg(hx, y, T.AIR);
    let sum = 0, mx = 0;
    const N = 9000;
    for (let k = 0; k < N; k++) { sim.step(); sum += sim.stats.ms; if (sim.stats.ms > mx) mx = sim.stats.ms; }
    const v1 = vol();
    console.log(`[drain] lake cells ${reg.length} vol ${v0} -> ${v1}; far col x=${farX} ${far0} -> ${colVol(farX)}; local loss ${v0 - local()}; avg ${(sum / N).toFixed(3)} ms/tick, max ${mx.toFixed(2)} ms`);
    expect(v1).toBeLessThan(v0 * 0.4);
    expect(colVol(farX)).toBeLessThan(far0);
    expect(v0 - local()).toBeGreaterThanOrEqual(0); // 不會變多
    expect(v0 - local()).toBeLessThan(v0 * 0.02); // 只有薄膜蒸發
    expect(sum / N).toBeLessThan(2); // 平均在瀏覽器的每刻預算（LIQUID_BUDGET_MS）內
    // 已平衡：湖裡剩下的水不再變動
    const before = vol();
    for (let k = 0; k < 300; k++) sim.step();
    expect(vol()).toBe(before);
  });
});
