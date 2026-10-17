// worldgen.liquids.test.ts — 生成器 v5 的液體：地表湖 / 池塘、沙漠綠洲、地下湖、洞穴層熔岩囊、熔岩深淵的熔岩湖、
// 叢林蜂巢（蜂巢殼 + 蜂蜜）；生成時已靜置（載入後不會大流動）、確定性、不淹進建築 / 出生點、效能。
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from './worldgen';
import { LIQ, BIOME } from './world';
import { T, W, SOLID_LUT } from './tiles';
import { LiquidSim } from './liquid';
import { GEN_VERSION } from './constants';

function hashBytes(...arrs: ArrayLike<number>[]): number {
  let h = 2166136261;
  for (const a of arrs) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

describe('世界生成：液體', { timeout: 240_000 }, () => {
  let r: GenResult;
  beforeAll(() => { r = generateWorld('liquids'); }, 240_000);

  it('生成器版本 5（v5 = 加入液體）', () => {
    expect(GEN_VERSION).toBe(5);
  });

  it('三種液體都有，量級合理；液體不會在實心格裡', () => {
    const w = r.world;
    let water = 0, lava = 0, honey = 0, inSolid = 0;
    for (let i = 0; i < w.liquid.length; i++) {
      if (!w.liquid[i]) continue;
      const t = w.liquidType[i];
      if (t === LIQ.WATER) water++; else if (t === LIQ.LAVA) lava++; else if (t === LIQ.HONEY) honey++;
      if (SOLID_LUT[w.fg[i]]) inSolid++;
    }
    expect(inSolid).toBe(0);
    expect(water).toBeGreaterThan(8000);
    expect(lava).toBeGreaterThan(8000);
    expect(honey).toBeGreaterThan(200);
  });

  it('地表有湖（湖床注滿 / 山谷池塘），沙漠有綠洲，叢林地下有蜂巢', () => {
    const w = r.world;
    // 地表（岩層以上）的水
    let surfWater = 0;
    for (let x = 0; x < w.width; x++) for (let y = 0; y < r.layers.rock[x]; y++) if (w.liquidType[y * w.width + x] === LIQ.WATER) surfWater++;
    expect(surfWater).toBeGreaterThan(300);
    const kinds = new Set(r.structures.map((s) => s.kind));
    expect(kinds.has('oasis')).toBe(true);
    expect(kinds.has('hive')).toBe(true);
    const hive = r.structures.find((s) => s.kind === 'hive')!;
    expect(w.biome[Math.floor(hive.x + hive.w / 2)]).toBe(BIOME.JUNGLE);
    let comb = 0, honey = 0;
    for (let y = hive.y; y < hive.y + hive.h; y++) for (let x = hive.x; x < hive.x + hive.w; x++) {
      const i = y * w.width + x;
      if (w.fg[i] === T.HIVE) comb++;
      if (w.liquidType[i] === LIQ.HONEY) honey++;
    }
    expect(comb).toBeGreaterThan(40);
    expect(honey).toBeGreaterThan(20);
    // 綠洲在沙漠
    const oasis = r.structures.find((s) => s.kind === 'oasis')!;
    expect(w.biome[Math.floor(oasis.x + oasis.w / 2)]).toBe(BIOME.DESERT);
  });

  it('洞穴裡有地下湖、熔岩深淵有熔岩湖、洞穴層偶爾有熔岩囊', () => {
    const w = r.world;
    let caveWater = 0, moltenLava = 0, cavernLava = 0;
    for (let x = 0; x < w.width; x++) for (let y = r.layers.rock[x]; y < w.height; y++) {
      const i = y * w.width + x, t = w.liquidType[i];
      if (!t) continue;
      if (y < r.layers.molten[x] && t === LIQ.WATER) caveWater++;
      if (y >= r.layers.molten[x] && t === LIQ.LAVA) moltenLava++;
      if (y >= r.layers.deep[x] && y < r.layers.molten[x] && t === LIQ.LAVA) cavernLava++;
    }
    expect(caveWater).toBeGreaterThan(3000);
    expect(moltenLava).toBeGreaterThan(5000);
    expect(cavernLava).toBeGreaterThan(50);
  });

  it('已靜置：載入後喚醒全部液體跑 60 刻，幾乎沒有格子在變', () => {
    const w = r.world;
    // 用副本跑，免得影響其他測試
    const copy = generateWorld('liquids');
    const before = copy.world.liquid.slice();
    const sim = new LiquidSim(copy.world);
    sim.wakeAll();
    for (let k = 0; k < 60; k++) sim.step();
    let changed = 0, cells = 0;
    for (let i = 0; i < before.length; i++) {
      if (before[i]) cells++;
      if (before[i] !== copy.world.liquid[i]) changed++;
    }
    expect(cells).toBeGreaterThan(0);
    expect(changed / cells).toBeLessThan(0.01);
    void w;
  });

  it('不淹進出生點、小屋（木板牆）與地城', () => {
    const w = r.world;
    for (let y = r.spawn.y - 3; y <= r.spawn.y; y++) for (let x = r.spawn.x - 2; x <= r.spawn.x + 2; x++) expect(w.getLiquid(x, y)).toBe(0);
    let bad = 0;
    for (let i = 0; i < w.liquid.length; i++) {
      if (!w.liquid[i]) continue;
      const wl = w.wall[i];
      if (wl === W.PLANK_WALL || (wl >= W.DUNGEON_WALL_BLUE && wl <= W.DUNGEON_WALL_PINK)) bad++;
      const f = w.fg[i];
      if (f === T.CHEST || f === T.LOCKED_CHEST || f === T.DOOR_CLOSED || f === T.BED_HEAD || f === T.LORE_TABLET) bad++;
    }
    expect(bad).toBe(0);
  });

  it('確定性：同 seed 液體位元相同；生成後沒有被標成玩家修改', () => {
    const b = generateWorld('liquids');
    expect(hashBytes(b.world.liquid, b.world.liquidType)).toBe(hashBytes(r.world.liquid, r.world.liquidType));
    expect(b.world.modifiedChunks.size).toBe(0);
    expect(b.world.liquidModified.size).toBe(0);
  });

  it('液體 pass 有記錄耗時與靜置刻數', () => {
    expect(r.liquidStats.ms).toBeGreaterThan(0);
    expect(r.liquidStats.settleTicks).toBeGreaterThanOrEqual(0);
    console.log(`[delve] liquid pass ${r.liquidStats.ms.toFixed(0)} ms (settle ${r.liquidStats.settleMs.toFixed(0)} ms / ${r.liquidStats.settleTicks} ticks, left active ${r.liquidStats.leftActive}) cells`, r.liquidStats.cells);
  });

  it('小世界也能生成（不會當掉）', () => {
    const s = generateWorld('tiny-liquid', { width: 160, height: 100 });
    expect(s.world.liquid.length).toBe(160 * 100);
  });
});
