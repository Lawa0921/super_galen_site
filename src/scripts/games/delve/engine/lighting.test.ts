// lighting.test.ts
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T, W } from './tiles';
import { LightEngine, LightMap, skyBrightness, ambientReach } from './lighting';
import { skyColor } from './sky';
import { generateWorld } from './worldgen';
import {
  LIGHT_AIR_DECAY, LIGHT_AIR_DECAY_DEEP, LIGHT_DEEP_START, LIGHT_DEEP_FULL, LIGHT_SOLID_DECAY, LIGHT_MARGIN, DAY_LENGTH,
  LIGHT_WATER_DECAY, LIGHT_HONEY_DECAY, LAVA_LIGHT, SKY_SHAFT_LEN,
} from './constants';

// 2026-10 洞穴對比：地下（每欄地表下 LIGHT_DEEP_START 格起、LIGHT_DEEP_FULL 格完全）的空氣改用 LIGHT_AIR_DECAY_DEEP，
// 光池變小、未照到的地方真的暗。closedCave 的每欄地表 = 0（整個世界都是「深處」），所以下面那些封閉洞穴的
// 衰減期望值從 LIGHT_AIR_DECAY 改成 LIGHT_AIR_DECAY_DEEP——是刻意的新行為，不是放寬比對。
// 地表的測試世界補上每欄地表高度（w.surface），地表附近仍是原本的 LIGHT_AIR_DECAY（白天地表不變）。
const AIR = LIGHT_AIR_DECAY_DEEP;

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
  it('火把照亮鄰格，深處隨距離以 LIGHT_AIR_DECAY_DEEP 衰減', () => {
    const w = closedCave();
    w.fg[w.idx(50, 50)] = T.TORCH;
    const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
    expect(m.get(50, 50)).toBeCloseTo(1, 5);
    expect(m.get(51, 50)).toBeCloseTo(AIR, 4);
    expect(m.get(53, 50)).toBeCloseTo(AIR ** 3, 4);
    expect(m.get(50, 52)).toBeCloseTo(AIR ** 2, 4);
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
    expect(m.get(39, 50)).toBeCloseTo(AIR ** 2, 4); // x=40 是空氣，x=39 是第一格石頭
    expect(m.get(38, 50)).toBeCloseTo(AIR ** 2 * LIGHT_SOLID_DECAY, 4);
    expect(m.get(20, 50)).toBe(0); // 深入岩石 → 低於門檻
  });
  it('天空光照到地表、照不進深層岩石', () => {
    const w = new World(80, 80);
    for (let y = 30; y < 80; y++) for (let x = 0; x < 80; x++) { w.fg[w.idx(x, y)] = T.STONE; if (y > 32) w.wall[w.idx(x, y)] = W.STONE_WALL; }
    w.surfaceY = 35;
    w.surface.fill(30);
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
    w.surface.fill(39); // 地形表面在底部：這些格都在地表之上（不是天光井）
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
    console.log(`[delve] lighting RGB 130x80+28 margin: ${ms.toFixed(2)} ms/compute`);
    // 遊戲內實際視窗：1280×720 → 640×360 美術 px（43×26 格），1920×1080 → 960×540（63×37 格）
    for (const [vw, vh, label] of [[43, 26, '1280x720'], [63, 37, '1920x1080']] as const) {
      const v = { x: spawn.x - vw / 2, y: spawn.y - vh / 2, w: vw, h: vh };
      eng.compute(world, v, { sky: 1 });
      const t1 = performance.now();
      for (let i = 0; i < N; i++) eng.compute(world, v, { sky: 1 });
      console.log(`[delve] lighting RGB ${label} (${vw}x${vh}+28): ${((performance.now() - t1) / N).toFixed(2)} ms/compute`);
    }
    expect(ms).toBeLessThan(25);
  }, 120_000); // 先生成一個全尺寸世界：整套測試平行跑時要好幾秒

  describe('液體', () => {
    it('熔岩發光（量多才亮）', () => {
      const w = closedCave();
      w.setLiquid(50, 50, 255, LIQ.LAVA);
      w.setLiquid(45, 50, 20, LIQ.LAVA);
      const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
      expect(m.get(50, 50)).toBeCloseTo(LAVA_LIGHT, 4);
      expect(m.get(51, 50)).toBeCloseTo(LAVA_LIGHT * AIR, 3);
    });
    it('光穿過深水：紅綠衰減得比空氣快、藍走得最遠；淺水（≤128）當空氣', () => {
      expect(LIGHT_WATER_DECAY[0]).toBeLessThan(LIGHT_AIR_DECAY);
      expect(LIGHT_WATER_DECAY[0]).toBeGreaterThan(LIGHT_SOLID_DECAY);
      expect(LIGHT_WATER_DECAY[2]).toBeGreaterThan(LIGHT_WATER_DECAY[1]);
      expect(LIGHT_WATER_DECAY[1]).toBeGreaterThan(LIGHT_WATER_DECAY[0]);
      const w = closedCave();
      w.fg[w.idx(42, 50)] = T.TORCH;
      for (let y = 48; y < 55; y++) for (let x = 43; x < 60; x++) w.setLiquid(x, y, 255, LIQ.WATER);
      for (let x = 43; x < 60; x++) w.setLiquid(x, 46, 100, LIQ.WATER);
      w.fg[w.idx(42, 46)] = T.TORCH;
      const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
      // 深水那列：第 1 格之後每格 ×LIGHT_WATER_DECAY
      expect(m.getRGB(45, 50)[0] / m.getRGB(44, 50)[0]).toBeCloseTo(LIGHT_WATER_DECAY[0], 2);
      expect(m.get(45, 46) / m.get(44, 46)).toBeCloseTo(AIR, 2);
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

  describe('彩色光（RGB 三通道）', () => {
    const at = (w: World, x: number, y: number, opts: Parameters<LightEngine['compute']>[2] = { sky: 0 }): readonly number[] =>
      new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, opts).getRGB(x, y);
    it('LightMap.data = 三通道最大值；rgb 每格三個值', () => {
      const w = closedCave();
      w.fg[w.idx(50, 50)] = T.TORCH;
      const m = new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 });
      expect(m.rgb.length).toBe(m.w * m.h * 3);
      for (const [x, y] of [[50, 50], [53, 51], [58, 54]]) {
        const [r, g, b] = m.getRGB(x, y);
        expect(m.get(x, y)).toBeCloseTo(Math.max(r, g, b), 6);
      }
    });
    it('只有 data 的 LightMap（舊呼叫端）getRGB 視為白光', () => {
      const m = new LightMap(0, 0, 2, 1, Float32Array.from([0.5, 0.25]));
      expect(m.getRGB(1, 0)).toEqual([0.25, 0.25, 0.25]);
    });
    it('火把暖橘、蠟燭 / 吊燈 / 熔爐暖黃：紅 > 綠 > 藍', () => {
      for (const t of [T.TORCH, T.CANDLE, T.LANTERN, T.FURNACE]) {
        const w = closedCave();
        w.fg[w.idx(50, 50)] = t;
        const [r, g, b] = at(w, 52, 50);
        expect(r).toBeGreaterThan(g);
        expect(g).toBeGreaterThan(b);
      }
    });
    it('螢光菇發藍光；蘑菇草（實心）也發藍光照亮上方', () => {
      const w = closedCave();
      w.fg[w.idx(50, 50)] = T.GLOW_MUSHROOM;
      const [r, g, b] = at(w, 52, 50);
      expect(b).toBeGreaterThan(g);
      expect(g).toBeGreaterThan(r);
      const w2 = closedCave();
      for (let x = 40; x < 60; x++) w2.fg[w2.idx(x, 54)] = T.MUSHROOM_GRASS;
      const c2 = at(w2, 50, 52);
      expect(c2[2]).toBeGreaterThan(0.15);
      expect(c2[2]).toBeGreaterThan(c2[0] * 1.5);
    });
    it('水晶冷色，依格子變體分成青 / 紫兩種', () => {
      const hues = new Set<string>();
      for (let vx = 40; vx < 52; vx++) {
        const w = closedCave();
        w.fg[w.idx(vx, 50)] = T.CRYSTAL;
        const [r, g, b] = at(w, vx, 50);
        expect(b).toBeGreaterThan(0.5);
        expect(b).toBeGreaterThanOrEqual(r);
        hues.add(r > g ? 'violet' : 'cyan');
      }
      expect(hues).toEqual(new Set(['violet', 'cyan']));
    });
    it('熔岩紅橘光', () => {
      const w = closedCave();
      w.setLiquid(50, 50, 255, LIQ.LAVA);
      const [r, g, b] = at(w, 52, 50);
      expect(r).toBeGreaterThan(g * 1.4);
      expect(g).toBeGreaterThan(b);
    });
    it('動態光源可帶顏色（c = 色相，v = 強度 = 最大通道）', () => {
      const w = closedCave();
      const [r, g, b] = at(w, 45, 48, { sky: 0, lights: [{ x: 45, y: 48, v: 0.8, c: [0.25, 1, 0.75] }] });
      expect(g).toBeCloseTo(0.8, 5);
      expect(r).toBeCloseTo(0.2, 5);
      expect(b).toBeCloseTo(0.6, 5);
    });
    it('深水裡越深越藍；深蜂蜜裡越深越琥珀（藍掉最快）', () => {
      const lake = (liq: number): World => {
        const w = new World(60, 80);
        for (let y = 30; y < 80; y++) for (let x = 0; x < 60; x++) w.fg[w.idx(x, y)] = T.STONE;
        for (let y = 30; y < 70; y++) for (let x = 10; x < 50; x++) { w.fg[w.idx(x, y)] = T.AIR; w.setLiquid(x, y, 255, liq); }
        w.surfaceY = 50;
        return w;
      };
      const mw = new LightEngine().compute(lake(LIQ.WATER), { x: 0, y: 0, w: 60, h: 80 }, { sky: 1 });
      const top = mw.getRGB(30, 31), deep = mw.getRGB(30, 40);
      expect(deep[2] / deep[0]).toBeGreaterThan(1.8);
      expect(deep[2] / deep[0]).toBeGreaterThan(top[2] / top[0]);
      const mh = new LightEngine().compute(lake(LIQ.HONEY), { x: 0, y: 0, w: 60, h: 80 }, { sky: 1 });
      const h = mh.getRGB(30, 34);
      expect(h[0]).toBeGreaterThan(h[1]);
      expect(h[1]).toBeGreaterThan(h[2] * 1.5);
      expect(LIGHT_HONEY_DECAY[2]).toBeLessThan(LIGHT_HONEY_DECAY[0]);
    });
    it('天空光吃 skyColor（夜晚深藍）', () => {
      const w = new World(40, 40);
      w.surfaceY = 20;
      const m = new LightEngine().compute(w, { x: 0, y: 0, w: 40, h: 40 }, { sky: skyBrightness(0), skyColor: skyColor(0) });
      const [r, g, b] = m.getRGB(20, 10);
      expect(b).toBeGreaterThan(r * 1.5);
      expect(b).toBeGreaterThan(g);
    });
    it('天光井：從地表直通下去的豎井（有背牆）上段吃得到淡淡天光，越深越淡；頂端封住的洞沒有', () => {
      const w = new World(80, 220);
      for (let y = 30; y < 220; y++) for (let x = 0; x < 80; x++) { w.fg[w.idx(x, y)] = T.STONE; w.wall[w.idx(x, y)] = W.STONE_WALL; }
      w.surface.fill(30);
      w.surfaceY = 32;
      for (let y = 30; y < 200; y++) for (let x = 40; x < 43; x++) w.fg[w.idx(x, y)] = T.AIR;
      for (let y = 40; y < 70; y++) for (let x = 10; x < 13; x++) w.fg[w.idx(x, y)] = T.AIR;
      const eng = new LightEngine();
      const m = eng.compute(w, { x: 0, y: 30, w: 80, h: 60 }, { sky: 1 });
      const near = m.get(41, 45), deeper = m.get(41, 70);
      expect(near).toBeGreaterThan(0.25);
      expect(deeper).toBeLessThan(near);
      expect(m.get(11, 45)).toBe(0);
      const y = 30 + SKY_SHAFT_LEN + 50;
      const deep = eng.compute(w, { x: 20, y: y - 5, w: 40, h: 10 }, { sky: 1, margin: 4 });
      expect(deep.get(41, y)).toBe(0);
    });
  });

  describe('洞穴對比：地下的空氣衰減更快（地表不變）', () => {
    /** 一條水平走廊（y = row），每欄地表在 y = 40 */
    function corridor(row: number): World {
      const w = new World(120, 160);
      w.fg.fill(T.STONE);
      w.wall.fill(W.STONE_WALL);
      w.surface.fill(40);
      w.surfaceY = 0;
      for (let x = 10; x < 110; x++) w.fg[w.idx(x, row)] = T.AIR;
      w.fg[w.idx(60, row)] = T.TORCH;
      return w;
    }
    const ratio = (row: number): number => {
      const m = new LightEngine().compute(corridor(row), { x: 20, y: row - 10, w: 80, h: 20 }, { sky: 0 });
      return m.get(63, row) / m.get(62, row);
    };
    it('地表附近（≤ LIGHT_DEEP_START 格）沿用 LIGHT_AIR_DECAY；夠深（≥ LIGHT_DEEP_FULL）用 LIGHT_AIR_DECAY_DEEP；中間線性過渡', () => {
      expect(LIGHT_AIR_DECAY_DEEP).toBeLessThan(LIGHT_AIR_DECAY);
      expect(ratio(40 + LIGHT_DEEP_START - 2)).toBeCloseTo(LIGHT_AIR_DECAY, 4);
      expect(ratio(40 + LIGHT_DEEP_FULL + 5)).toBeCloseTo(LIGHT_AIR_DECAY_DEEP, 4);
      const mid = ratio(40 + Math.round((LIGHT_DEEP_START + LIGHT_DEEP_FULL) / 2));
      expect(mid).toBeLessThan(LIGHT_AIR_DECAY);
      expect(mid).toBeGreaterThan(LIGHT_AIR_DECAY_DEEP);
    });
    it('深處的火把光比地表附近的短得多：20 格外降到原本的一半以下', () => {
      const reach = (row: number): number => new LightEngine().compute(corridor(row), { x: 20, y: row - 10, w: 80, h: 20 }, { sky: 0 }).get(80, row);
      expect(reach(100)).toBeLessThan(reach(42) * 0.5);
    });
  });

  it('裂紋石（密室假牆）比一般岩石更擋光：牆後幾乎看不到', () => {
    const plug = (t: number): number => {
      const w = closedCave();
      for (let y = 45; y < 55; y++) { w.fg[w.idx(50, y)] = t; w.fg[w.idx(51, y)] = t; }
      w.fg[w.idx(44, 50)] = T.TORCH;
      return new LightEngine().compute(w, { x: 30, y: 30, w: 40, h: 40 }, { sky: 0 }).get(53, 50);
    };
    expect(plug(T.CRACKED_STONE)).toBeLessThan(0.05);
    expect(plug(T.STONE)).toBeGreaterThan(plug(T.CRACKED_STONE) * 2);
  });

  describe('ambientReach：玩家身邊的輪廓微光只照得到「看得到」的格', () => {
    /** 走廊（玩家在這）| 1 格厚裂紋石牆 | 密室 */
    function secretRoom(): World {
      const w = closedCave(); // 40..59 × 45..54 空洞
      for (let y = 45; y < 55; y++) w.fg[w.idx(50, y)] = T.CRACKED_STONE;
      return w;
    }
    it('走廊與牆面標記、牆後的密室不標記', () => {
      const w = secretRoom();
      const rect = { x: 30, y: 35, w: 40, h: 30 };
      const out = new Uint8Array(rect.w * rect.h);
      ambientReach(w, 45, 50, 13, rect, out);
      const v = (x: number, y: number): number => out[(y - rect.y) * rect.w + (x - rect.x)];
      expect(v(45, 50)).toBe(1);
      expect(v(48, 52)).toBe(1);
      expect(v(50, 50)).toBe(1); // 牆的這一面
      expect(v(39, 50)).toBe(1); // 洞壁
      expect(v(52, 50)).toBe(0); // 密室
      expect(v(55, 48)).toBe(0);
      expect(v(37, 50)).toBe(0); // 岩體深處
    });
    it('半徑外不標記；玩家在 rect 外 → 全部 0', () => {
      const w = closedCave();
      const rect = { x: 40, y: 45, w: 10, h: 10 };
      const out = new Uint8Array(rect.w * rect.h);
      ambientReach(w, 41, 50, 3, rect, out);
      expect(out[5 * 10 + 1]).toBe(1);
      expect(out[5 * 10 + 8]).toBe(0);
      ambientReach(w, 200, 200, 5, rect, out);
      expect(out.every((q) => q === 0)).toBe(true);
    });
  });
});
