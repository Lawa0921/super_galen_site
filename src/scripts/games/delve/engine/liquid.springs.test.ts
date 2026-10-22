// liquid.springs.test.ts — 泉水（無限源，固定速率）+ 滲水石（溢流排水）：瀑布一直流，但液體總量有上限
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T, tileDef, TIER_UNBREAKABLE } from './tiles';
import { LiquidSim, LAVA_EVERY, SPRING_RATE, type SpringSpec } from './liquid';

/**
 * 60×50 石塊裡挖一個洞：左邊是懸崖（x ≤ 20），泉水在崖面 (20, 10)；地板 y = 40；
 * 崖腳挖一個碗（x 21..30、y 40..44）注滿 → 遠端碗緣 (31, 40) 是滲水石。
 */
function scene(type: number = LIQ.WATER): { w: World; spec: SpringSpec } {
  const w = new World(60, 50);
  for (let y = 0; y < 50; y++) for (let x = 0; x < 60; x++) w.setFg(x, y, T.STONE);
  for (let y = 5; y < 40; y++) for (let x = 21; x < 56; x++) w.setFg(x, y, T.AIR);
  for (let y = 40; y < 45; y++) for (let x = 21; x <= 30; x++) { w.setFg(x, y, T.AIR); w.setLiquid(x, y, 255, type); }
  w.setFg(20, 10, type === LIQ.LAVA ? T.LAVA_SPRING : T.SPRING);
  w.setFg(31, 40, T.DRAIN);
  const spec: SpringSpec = { x: 20, y: 10, type, box: { x0: 18, y0: 8, x1: 36, y1: 46 }, cap: 10 * 5 * 255 + 255 * 12, drains: [{ x: 31, y: 40 }] };
  return { w, spec };
}
function total(w: World, x0 = 0, x1 = w.width): number {
  let s = 0;
  for (let y = 0; y < w.height; y++) for (let x = x0; x < x1; x++) s += w.getLiquid(x, y);
  return s;
}

describe('泉水 / 滲水石', () => {
  it('泉水與滲水石是挖不動的實心方塊', () => {
    for (const id of [T.SPRING, T.LAVA_SPRING, T.DRAIN]) {
      expect(tileDef(id).solid).toBe(true);
      expect(tileDef(id).minTier).toBe(TIER_UNBREAKABLE);
    }
  });

  it('泉水以固定速率往崖外的空格出水，水柱往下落', () => {
    const { w, spec } = scene();
    const sim = new LiquidSim(w);
    sim.setSprings([spec]);
    sim.step();
    expect(sim.springStats().emitted).toBe(SPRING_RATE[LIQ.WATER]);
    for (let k = 0; k < 40; k++) sim.step();
    // 崖面下方那一欄有水在落
    let falling = 0;
    for (let y = 11; y < 40; y++) if (w.getLiquid(21, y) > 0) falling++;
    expect(falling).toBeGreaterThan(5);
  });

  it('長時間跑：總量有上限（溢流被滲水石排掉），滲水石另一邊幾乎是乾的', () => {
    const { w, spec } = scene();
    const sim = new LiquidSim(w);
    sim.setSprings([spec]);
    const samples: number[] = [];
    for (let k = 0; k < 24000; k++) { sim.step(); if (k % 500 === 499) samples.push(total(w)); }
    const early = Math.max(...samples.slice(0, 16)), late = Math.max(...samples.slice(16));
    expect(late).toBeLessThanOrEqual(early * 1.03 + 255);
    expect(total(w, 34, 60)).toBeLessThan(255 * 3);
    // 瀑布還在流（不是停掉）
    let falling = 0;
    for (let y = 11; y < 40; y++) if (w.getLiquid(21, y) > 0) falling++;
    expect(falling).toBeGreaterThan(5);
    expect(sim.springStats().drained).toBeGreaterThan(0);
  });

  it('滲水石被堵住：泉水在區域總量到上限後停水（不會無限淹）', () => {
    const { w, spec } = scene();
    w.setFg(31, 40, T.STONE);
    const sim = new LiquidSim(w);
    sim.setSprings([{ ...spec, drains: [] }]);
    for (let k = 0; k < 20000; k++) sim.step();
    const a = total(w);
    for (let k = 0; k < 6000; k++) sim.step();
    expect(total(w)).toBeLessThanOrEqual(a + SPRING_RATE[LIQ.WATER] * 4);
    expect(total(w)).toBeLessThanOrEqual(spec.cap + 255 * 60);
  });

  it('泉水被拆掉（debug setFg）就不再出水', () => {
    const { w, spec } = scene();
    const sim = new LiquidSim(w);
    sim.setSprings([spec]);
    w.setFg(20, 10, T.STONE);
    for (let k = 0; k < 20; k++) sim.step();
    expect(sim.springStats().emitted).toBe(0);
  });

  it('熔岩泉：照熔岩的節奏出水', () => {
    const { w, spec } = scene(LIQ.LAVA);
    const sim = new LiquidSim(w);
    sim.setSprings([spec]);
    for (let k = 0; k < LAVA_EVERY; k++) sim.step();
    expect(sim.springStats().emitted).toBe(SPRING_RATE[LIQ.LAVA]);
    for (let k = 0; k < 6000; k++) sim.step();
    expect(total(w, 34, 60)).toBeLessThan(255 * 3);
  });

  it('確定性', () => {
    const a = scene(), b = scene();
    const sa = new LiquidSim(a.w), sb = new LiquidSim(b.w);
    sa.setSprings([a.spec]); sb.setSprings([b.spec]);
    for (let k = 0; k < 3000; k++) { sa.step(); sb.step(); }
    expect(Array.from(a.w.window(0, 0, 60, 50).liquid)).toEqual(Array.from(b.w.window(0, 0, 60, 50).liquid));
  });
});
