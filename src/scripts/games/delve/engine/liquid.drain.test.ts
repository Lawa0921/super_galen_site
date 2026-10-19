// liquid.drain.test.ts — 湖泊洩水：挖穿湖底後整個湖往破口流（不是只有破口那一欄）、水面整體下降直到流光或平衡；
// 總量只會因薄膜蒸發減少、不會變多；熔岩 / 蜂蜜照原本的節奏比較慢；世界生成的真實湖也一樣（沒有水壓：要往上爬才出得去的水留著，跟 Terraria 一樣）；靜止時不花成本。
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T, SOLID_LUT } from './tiles';
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

/**
 * 從 src 反向找「水能不往上走（只左 / 右 / 下）就流到 src」的格。液體模擬沒有水壓（跟 Terraria 一樣）：
 * 水只會落下或橫攤、不會往上爬，所以 U 形彎 / 岩簷底下的水道後面那片水本來就流不過來。
 * 這個集合就是挖穿後「照規則該流光」的部分；集合外的格一滴都不該少。
 */
function downhillTo(w: World, src: number, box: { x0: number; y0: number; x1: number; y1: number }): Uint8Array {
  const W = w.width, ok = new Uint8Array(w.liquid.length), q = [src];
  ok[src] = 1;
  while (q.length) {
    const r = q.pop()!;
    for (const j of [r - 1, r + 1, r - W]) {
      const x = j % W, y = (j - x) / W;
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1 || ok[j] || SOLID_LUT[w.fg[j]] === 1) continue;
      ok[j] = 1; q.push(j);
    }
  }
  return ok;
}

describe('沒有水壓（跟 Terraria 一樣）', () => {
  it('U 形彎：岩簷底下水道另一頭的水不會往上爬過去；能往下流的部分照樣流光', () => {
    // 湖 y 2..7。岩簷 x 11..12、y 2..6 把右池（x 13..30）和左邊隔開，只在 y = 7 的水道相通；
    // 水道往左延伸到 x 6，x 1..5 的 y = 7 是石頭 → 水道出口要往上一格（y = 6）才接到左池（x 1..10、y 2..6）。
    const { w, sim, FLOOR, H } = lakeWorld({ LW: 30, LD: 6 });
    const stone = (x: number, y: number): void => { w.setLiquid(x, y, 0, LIQ.NONE); w.fg[w.idx(x, y)] = T.STONE; };
    for (let y = 2; y <= 6; y++) { stone(11, y); stone(12, y); }
    for (let x = 1; x <= 5; x++) stone(x, 7);
    sim.wakeAll(); sim.settle(500);
    expect(sim.activeCount).toBe(0);
    const keep0 = sumRect(w, 13, 2, 30, 7) + sumRect(w, 6, 7, 12, 7);
    w.setFg(3, 7, T.AIR); w.setFg(3, FLOOR, T.AIR); // 破口在左池底
    for (let k = 0; k < 2000; k++) sim.step();
    expect(sumRect(w, 1, 2, 10, 6)).toBeLessThan(3 * 50); // 左池流光
    expect(sumRect(w, 1, FLOOR + 1, 30, H - 2)).toBeGreaterThan(40 * 255);
    expect(sumRect(w, 13, 2, 30, 7) + sumRect(w, 6, 7, 12, 7)).toBe(keep0); // 右池 + 水道：要往上爬才出得去 → 一滴不少
    expect(sim.activeCount).toBe(0);
  });
});

describe('湖泊洩水（世界生成的真實湖）', { timeout: 120_000 }, () => {
  it('地下湖：照規則能流到破口的格全部流光（含離破口很遠的欄），其他格一滴不少；總量不增；每刻成本在預算內', () => {
    const r = generateWorld('liquids');
    const w = r.world, W = w.width;
    const sim = new LiquidSim(w);
    sim.setSprings(r.springs);
    sim.measure = true;
    // 連通水域，取最大的 5 座
    const seen = new Uint8Array(w.liquid.length);
    const lakes: number[][] = [];
    for (let s = 0; s < w.liquid.length; s++) {
      if (seen[s] || w.liquidType[s] !== LIQ.WATER) continue;
      const cur: number[] = [], st = [s];
      seen[s] = 1;
      while (st.length) {
        const i = st.pop()!;
        cur.push(i);
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < w.liquid.length && !seen[j] && w.liquidType[j] === LIQ.WATER) { seen[j] = 1; st.push(j); }
      }
      lakes.push(cur);
    }
    lakes.sort((a, b) => b.length - a.length);
    // 每座湖的破口 = 最深那欄的湖底；挑「照規則能流光的格」最多的那座（避免挑到被岩簷隔成兩半、只有小角落能流的湖）
    type Cand = { reg: number[]; hx: number; hy: number; box: { x0: number; y0: number; x1: number; y1: number }; drain: Uint8Array; n: number };
    let best: Cand | null = null;
    for (const reg of lakes.slice(0, 5)) {
      let hx = -1, hy = -1, x0 = W, x1 = 0, y0 = w.height, y1 = 0;
      for (const i of reg) {
        const x = i % W, y = (i - x) / W;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        if (y > hy && w.liquidType[i + W] !== LIQ.WATER) { hy = y; hx = x; }
      }
      const box = { x0, y0, x1, y1 };
      const drain = downhillTo(w, hy * W + hx, box);
      let n = 0;
      for (const i of reg) if (drain[i]) n++;
      if (!best || n > best.n) best = { reg, hx, hy, box, drain, n };
    }
    const { reg, hx, hy, drain } = best!;
    // 測試要有意義：能流的部分夠大，而且延伸到離破口很遠的欄（原本的 bug：只有破口那一欄會流）
    expect(best!.n).toBeGreaterThan(1000);
    let farDx = 0;
    for (const i of reg) if (drain[i]) farDx = Math.max(farDx, Math.abs((i % W) - hx));
    expect(farDx).toBeGreaterThan(40);

    const vol = (sel: (i: number) => boolean): number => { let s = 0; for (const i of reg) if (sel(i)) s += w.liquid[i]; return s; };
    const drainVol0 = vol((i) => drain[i] === 1), keepVol0 = vol((i) => drain[i] === 0);
    // 湖底下方挖一個裝得下整湖的空腔（還沒接通），再挖穿湖底到空腔的豎井
    const cy0 = hy + 4, cy1 = hy + 30, cx0 = hx - 150, cx1 = hx + 150;
    expect(301 * 27).toBeGreaterThan(reg.length);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { const i = y * W + x; w.fg[i] = T.AIR; w.liquid[i] = 0; w.liquidType[i] = LIQ.NONE; }
    const local = (): number => { let s = vol(() => true); for (let y = hy + 1; y <= cy1 + 1; y++) for (let x = cx0 - 1; x <= cx1 + 1; x++) s += w.liquid[y * W + x]; return s; };
    const v0 = local();
    for (let y = hy + 1; y < cy0; y++) w.setFg(hx, y, T.AIR);
    let sum = 0, mx = 0;
    const N = 9000;
    for (let k = 0; k < N; k++) { sim.step(); sum += sim.stats.ms; if (sim.stats.ms > mx) mx = sim.stats.ms; }
    const drainVol1 = vol((i) => drain[i] === 1), keepVol1 = vol((i) => drain[i] === 0);
    let wet = 0, farWet = 0;
    for (const i of reg) if (drain[i] && w.liquid[i] >= 3) { wet++; if (Math.abs((i % W) - hx) === farDx) farWet++; }
    console.log(`[drain] lake ${reg.length} cells, breach x=${hx}; downhill-to-breach ${best!.n} cells (farthest dx ${farDx}) vol ${drainVol0} -> ${drainVol1}; rest ${keepVol0} -> ${keepVol1}; local loss ${v0 - local()}; avg ${(sum / N).toFixed(3)} ms/tick, max ${mx.toFixed(2)} ms`);
    expect(wet).toBe(0); // 能流的格都流光（只剩 < 3 的薄膜）
    expect(farWet).toBe(0);
    expect(drainVol1).toBeLessThan(drainVol0 * 0.01);
    expect(keepVol1).toBe(keepVol0); // 要往上爬才出得去的水一滴不少（沒有水壓）
    expect(v0 - local()).toBeGreaterThanOrEqual(0); // 不會變多
    expect(v0 - local()).toBeLessThan(drainVol0 * 0.03); // 只有薄膜蒸發
    expect(sum / N).toBeLessThan(2); // 平均在瀏覽器的每刻預算（LIQUID_BUDGET_MS）內
    // 已平衡：再跑也不動
    const before = local();
    for (let k = 0; k < 300; k++) sim.step();
    expect(local()).toBe(before);
  });
});
