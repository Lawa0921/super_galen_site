// lighting.test.ts
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T, W } from './tiles';
import { LightEngine, skyBrightness } from './lighting';
import { generateWorld } from './worldgen';
import { LIGHT_AIR_DECAY, LIGHT_SOLID_DECAY, LIGHT_MARGIN, DAY_LENGTH, LIGHT_WATER_DECAY, LAVA_LIGHT } from './constants';

/** 全石頭 + 背牆，中央挖一個封閉洞穴（20×10），surfaceY = 0 → 沒有天空光 */
function closedCave(): World {
  const w = new World(100, 100);
  w.fg.fill(T.STONE);
  w.wall.fill(W.STONE_WALL);
  for (let y = 45; y < 55; y++) for (let x = 40; x < 60; x++) w.fg[w.idx(x, y)] = T.AIR;
  w.surfaceY = 0;
  return w;
}

describe('LightEngine', () => {
  it('封閉洞穴中無光源 → 全黑', () => {
    const w = closedCave();
    const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 1 });
    for (let i = 0; i < m.data.length; i++) expect(m.data[i]).toBe(0);
  });
  it('火把照亮鄰格，隨距離以 0.91 衰減', () => {
    const w = closedCave();
    w.fg[w.idx(50, 50)] = T.TORCH;
    const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
    expect(m.get(50, 50)).toBeCloseTo(1, 5);
    expect(m.get(51, 50)).toBeCloseTo(LIGHT_AIR_DECAY, 4);
    expect(m.get(53, 50)).toBeCloseTo(LIGHT_AIR_DECAY ** 3, 4);
    expect(m.get(50, 52)).toBeCloseTo(LIGHT_AIR_DECAY ** 2, 4);
    expect(m.get(52, 52)).toBeLessThan(m.get(51, 51));
    expect(m.get(51, 51)).toBeLessThan(m.get(51, 50));
  });
  it('穿過實心衰減更快（0.56）', () => {
    const w = closedCave();
    w.fg[w.idx(41, 50)] = T.TORCH;
    const m = new LightEngine().compute(w, { x: 20, y: 30, w: 40, h: 40 }, { sky: 0 });
    // 往右 3 格是空氣；往左 1 格起是石頭（x=39,38,...）
    const air3 = m.get(44, 50);
    const solid3 = m.get(38, 50);
    expect(solid3).toBeLessThan(air3);
    expect(m.get(39, 50)).toBeCloseTo(LIGHT_AIR_DECAY ** 2, 4); // x=40 是空氣，x=39 是第一格石頭
    expect(m.get(38, 50)).toBeCloseTo(LIGHT_AIR_DECAY ** 2 * LIGHT_SOLID_DECAY, 4);
    expect(m.get(20, 50)).toBe(0); // 深入岩石 → 低於門檻
  });
  it('天空光照到地表、照不進深層岩石', () => {
    const w = new World(80, 80);
    for (let y = 30; y < 80; y++) for (let x = 0; x < 80; x++) { w.fg[w.idx(x, y)] = T.STONE; if (y > 32) w.wall[w.idx(x, y)] = W.STONE_WALL; }
    w.surfaceY = 35;
    const m = new LightEngine().compute(w, { x: 10, y: 5, w: 60, h: 60 }, { sky: 1 });
    expect(m.get(40, 10)).toBeCloseTo(1, 5);
    expect(m.get(40, 29)).toBeCloseTo(1, 5);
    expect(m.get(40, 30)).toBeCloseTo(LIGHT_AIR_DECAY, 4); // 第一格地面
    expect(m.get(40, 60)).toBe(0);
  });
  it('夜晚天空光較弱', () => {
    const w = new World(40, 40);
    w.surfaceY = 20;
    const m = new LightEngine().compute(w, { x: 0, y: 0, w: 40, h: 40 }, { sky: 0.2 });
    expect(m.get(20, 10)).toBeCloseTo(0.2, 5);
  });
  it('有背牆的空格不發天空光', () => {
    const w = new World(40, 40);
    w.surfaceY = 39;
    for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) w.wall[w.idx(x, y)] = W.DIRT_WALL;
    const m = new LightEngine().compute(w, { x: 0, y: 0, w: 40, h: 40 }, { sky: 1 });
    expect(m.get(20, 20)).toBe(0);
  });
  it('額外動態光源（例如手持火把）', () => {
    const w = closedCave();
    const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0, lights: [{ x: 45, y: 48, v: 0.8 }] });
    expect(m.get(45, 48)).toBeCloseTo(0.8, 5);
  });
  it('輸出範圍 = 視窗外擴 margin，並夾在世界內', () => {
    const w = new World(300, 200);
    const m = new LightEngine().compute(w, { x: 100, y: 50, w: 50, h: 40 }, { sky: 1 });
    expect(m.x0).toBe(100 - LIGHT_MARGIN);
    expect(m.y0).toBe(50 - LIGHT_MARGIN);
    expect(m.w).toBe(50 + 2 * LIGHT_MARGIN);
    expect(m.h).toBe(40 + 2 * LIGHT_MARGIN);
    const c = new LightEngine().compute(w, { x: 0, y: 0, w: 20, h: 20 }, { sky: 1 });
    expect(c.x0).toBe(0);
    expect(c.y0).toBe(0);
    expect(c.get(-5, 0)).toBe(0);
  });
  it('skyBrightness：正午最亮、午夜最暗、連續', () => {
    expect(skyBrightness(0.5 * DAY_LENGTH)).toBeCloseTo(1, 5);
    expect(skyBrightness(0)).toBeLessThan(0.3);
    expect(skyBrightness(0)).toBeGreaterThan(0);
    expect(skyBrightness(DAY_LENGTH * 1.5)).toBeCloseTo(1, 5);
    for (let t = 0; t < DAY_LENGTH; t += 1) {
      expect(Math.abs(skyBrightness(t + 1) - skyBrightness(t))).toBeLessThan(0.05);
    }
  });
  it('效能：130×80 視窗 + 28 格外框只需數毫秒', () => {
    const { world, spawn } = generateWorld('light-perf');
    const eng = new LightEngine();
    const view = { x: spawn.x - 65, y: spawn.y - 40, w: 130, h: 80 };
    eng.compute(world, view, { sky: 1 }); // 暖機
    const N = 20;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) eng.compute(world, view, { sky: 1 });
    const ms = (performance.now() - t0) / N;
    console.log(`[delve] lighting 130x80+28 margin: ${ms.toFixed(2)} ms/compute`);
    expect(ms).toBeLessThan(25);
  }, 120_000); // 先生成一個全尺寸世界：整套測試平行跑時要好幾秒

  describe('液體', () => {
    it('熔岩發光（量多才亮）', () => {
      const w = closedCave();
      w.setLiquid(50, 50, 255, LIQ.LAVA);
      w.setLiquid(45, 50, 20, LIQ.LAVA);
      const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
      expect(m.get(50, 50)).toBeCloseTo(LAVA_LIGHT, 4);
      expect(m.get(51, 50)).toBeCloseTo(LAVA_LIGHT * LIGHT_AIR_DECAY, 3);
    });
    it('光穿過深水衰減得比空氣快；淺水（≤128）當空氣', () => {
      expect(LIGHT_WATER_DECAY).toBeLessThan(LIGHT_AIR_DECAY);
      expect(LIGHT_WATER_DECAY).toBeGreaterThan(LIGHT_SOLID_DECAY);
      const w = closedCave();
      w.fg[w.idx(42, 50)] = T.TORCH;
      for (let x = 43; x < 60; x++) w.setLiquid(x, 50, 255, LIQ.WATER);
      for (let x = 43; x < 60; x++) w.setLiquid(x, 46, 100, LIQ.WATER);
      w.fg[w.idx(42, 46)] = T.TORCH;
      const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
      // 深水那列：第 1 格之後每格 ×LIGHT_WATER_DECAY
      expect(m.get(45, 50) / m.get(44, 50)).toBeCloseTo(LIGHT_WATER_DECAY, 2);
      expect(m.get(45, 46) / m.get(44, 46)).toBeCloseTo(LIGHT_AIR_DECAY, 2);
    });
    it('地表的湖：只有水面那格吃天空光，越深越暗', () => {
      const w = new World(60, 60);
      for (let y = 30; y < 60; y++) for (let x = 0; x < 60; x++) w.fg[w.idx(x, y)] = T.STONE;
      for (let y = 30; y < 45; y++) for (let x = 10; x < 50; x++) { w.fg[w.idx(x, y)] = T.AIR; w.setLiquid(x, y, 255, LIQ.WATER); }
      w.surfaceY = 50;
      const m = new LightEngine().compute(w, { x: 0, y: 0, w: 60, h: 60 }, { sky: 1 });
      expect(m.get(30, 30)).toBeCloseTo(1, 4);
      expect(m.get(30, 36)).toBeLessThan(0.6);
      expect(m.get(30, 44)).toBeLessThan(m.get(30, 36));
      expect(m.get(30, 44)).toBeGreaterThan(0);
    });
  });
});
