// frost.test.ts — 地表水結冰：frozen 旗標（碰撞實心、液體不流動）、依季節 / 生態區結冰與融化
import { describe, it, expect } from 'vitest';
import { World, LIQ, BIOME } from './world';
import { T, W } from './tiles';
import { LiquidSim } from './liquid';
import { updateFreeze, freezeColumns, frozenCount } from './frost';
import { li, type Column, type ColumnLayers, type ColumnSource } from './column';
import { DAYS_PER_SEASON, SEASON, SEASON_TRANSITION_DAYS } from './calendar';

/** 寬 60、高 40 的小世界：地面在 y=20，x 20..39 挖一個 4 格深的湖（水面 y=17..20 → 湖底 y=21） */
function lakeWorld(biome: number = BIOME.FOREST): World {
  const w = new World(60, 40);
  for (let x = 0; x < 60; x++) {
    w.biome[x] = biome;
    const lake = x >= 20 && x < 40;
    const top = lake ? 21 : 18;
    w.surface[x] = top;
    for (let y = top; y < 40; y++) w.setFg(x, y, T.DIRT);
    if (lake) for (let y = 18; y < 21; y++) w.setLiquid(x, y, 255, LIQ.WATER);
  }
  w.surfaceY = 18;
  return w;
}
const winterLate = SEASON.WINTER * DAYS_PER_SEASON + SEASON_TRANSITION_DAYS + 1;
const summer = SEASON.SUMMER * DAYS_PER_SEASON + 3;
const springLate = SEASON.SPRING * DAYS_PER_SEASON + 28 + SEASON_TRANSITION_DAYS + 1;

describe('frozen 旗標', () => {
  it('結冰格碰撞算實心；在上面蓋實心方塊會清掉旗標', () => {
    const w = lakeWorld();
    expect(w.isSolid(25, 18)).toBe(false);
    w.setFrozen(25, 18, true);
    expect(w.isSolid(25, 18)).toBe(true);
    w.setFg(25, 18, T.STONE);
    expect(w.isFrozen(25, 18)).toBe(false);
  });
  it('液體模擬不動結冰格，也不會流進結冰格', () => {
    const w = new World(10, 10);
    for (let x = 0; x < 10; x++) w.setFg(x, 9, T.STONE);
    w.setLiquid(4, 8, 200, LIQ.WATER);
    w.setFrozen(4, 8, true);
    w.setLiquid(4, 7, 255, LIQ.WATER);
    const sim = new LiquidSim(w);
    sim.wakeAll();
    for (let i = 0; i < 200; i++) sim.step();
    expect(w.getLiquid(4, 8)).toBe(200);
    // 上面那格水沒有往下掉進冰裡（往旁邊攤開、從冰的兩側落下）
    expect(w.getLiquid(3, 8) + w.getLiquid(5, 8)).toBeGreaterThan(0);
    // 單獨一格冰（旁邊空著）也不會攤開
    const w2 = new World(10, 10);
    for (let x = 0; x < 10; x++) w2.setFg(x, 9, T.STONE);
    w2.setLiquid(4, 8, 200, LIQ.WATER);
    w2.setFrozen(4, 8, true);
    const sim2 = new LiquidSim(w2);
    sim2.wakeAll();
    for (let i = 0; i < 50; i++) sim2.step();
    expect(w2.getLiquid(3, 8) + w2.getLiquid(5, 8)).toBe(0);
    expect(sim.take(4, 8, 255)).toBeNull();
  });
});

describe('updateFreeze', () => {
  it('森林的冬天：湖面那一列結冰（湖下仍是水），可以站上去', () => {
    const w = lakeWorld();
    const sim = new LiquidSim(w);
    updateFreeze(w, sim, winterLate);
    for (let x = 20; x < 40; x++) {
      expect(w.isFrozen(x, 18)).toBe(true);
      expect(w.isFrozen(x, 19)).toBe(false);
      expect(w.isSolid(x, 18)).toBe(true);
    }
    expect(frozenCount(w)).toBe(20);
  });
  it('夏天不結冰；春天融化（旗標清掉、水重新流動）', () => {
    const w = lakeWorld();
    const sim = new LiquidSim(w);
    updateFreeze(w, sim, summer);
    expect(frozenCount(w)).toBe(0);
    updateFreeze(w, sim, winterLate);
    expect(frozenCount(w)).toBe(20);
    updateFreeze(w, sim, springLate);
    expect(frozenCount(w)).toBe(0);
    expect(sim.activeCount).toBeGreaterThan(0);
  });
  it('雪原秋天就結冰；沙漠冬天也不結冰', () => {
    const snow = lakeWorld(BIOME.SNOW);
    updateFreeze(snow, new LiquidSim(snow), SEASON.AUTUMN * DAYS_PER_SEASON + SEASON_TRANSITION_DAYS + 1);
    expect(frozenCount(snow)).toBe(20);
    const desert = lakeWorld(BIOME.DESERT);
    updateFreeze(desert, new LiquidSim(desert), winterLate);
    expect(frozenCount(desert)).toBe(0);
  });
  it('有屋頂 / 背牆的水不結冰；有人在那格（blocked）不結冰', () => {
    const w = lakeWorld();
    w.setFg(22, 10, T.STONE);
    w.setWall(30, 18, W.DIRT_WALL);
    updateFreeze(w, new LiquidSim(w), winterLate, (x) => x === 35);
    expect(w.isFrozen(22, 18)).toBe(false);
    expect(w.isFrozen(30, 18)).toBe(false);
    expect(w.isFrozen(35, 18)).toBe(false);
    expect(w.isFrozen(25, 18)).toBe(true);
  });
  it('cols：只處理指定的區塊欄（cx；每欄 32 格），結果與一次處理全部相同', () => {
    const w = lakeWorld(), sim = new LiquidSim(w);
    const a = updateFreeze(w, sim, winterLate, undefined, undefined, [0]);
    expect(a.frozen).toBe(12); // 湖 x 20..39：chunk 0 只含 20..31
    for (let x = 20; x < 40; x++) expect(w.isFrozen(x, 18)).toBe(x < 32);
    const b = updateFreeze(w, sim, winterLate, undefined, undefined, [1, 1, 5]); // 重複 / 世界外的欄略過
    expect(b.frozen).toBe(8);
    const ref = lakeWorld();
    updateFreeze(ref, new LiquidSim(ref), winterLate);
    expect(frozenCount(w)).toBe(frozenCount(ref));
    // 冰洞清單只在處理到的欄才清（夏天）
    const keep = new Set([w.idx(25, 18), w.idx(35, 18)]);
    updateFreeze(w, sim, summer, undefined, keep, [1]);
    expect([...keep]).toEqual([w.idx(25, 18)]);
  });
  it('湖面那格水很少（薄膜）時，連下面一格一起結冰', () => {
    const w = lakeWorld();
    w.setLiquid(25, 17, 30, LIQ.WATER);
    updateFreeze(w, new LiquidSim(w), winterLate);
    expect(w.isFrozen(25, 17)).toBe(true);
    expect(w.isFrozen(25, 18)).toBe(true);
  });
});

/** 外圍（x < 0）是雪原的湖：地面 y=21、水面 y=18..20（每欄都一樣） */
class SnowLakeSource implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let x = x0; x < x1; x++) {
      for (let y = 21; y < col.height; y++) col.fg[li(x, y)] = T.DIRT;
      for (let y = 18; y < 21; y++) { col.liquid[li(x, y)] = 255; col.liquidType[li(x, y)] = LIQ.WATER; }
    }
  }
  surfaceAt(): number { return 21; }
  biomeAt(): number { return BIOME.SNOW; }
  layersAt(): ColumnLayers { return { rock: 30, deep: 35, molten: 38 }; }
}

describe('freezeColumns（無限世界：欄載入時依日期結冰）', () => {
  it('只處理指定的欄；外圍的冰只標重畫、不標液體已修改（不必存檔 / 停放）', () => {
    const w = new World(60, 40, { bounds: 'infinite', source: new SnowLakeSource() });
    for (let x = 0; x < 60; x++) { w.biome[x] = BIOME.SNOW; w.surface[x] = 21; }
    for (let x = 20; x < 40; x++) for (let y = 18; y < 21; y++) w.setLiquid(x, y, 255, LIQ.WATER);
    w.ensureColumn(-1);
    w.drainLiquidDirty();
    w.liquidModified.clear();
    const r = freezeColumns(w, null, winterLate, [-1]);
    expect(r.frozen).toBeGreaterThan(0);
    // 中央的湖沒被碰
    for (let x = 20; x < 40; x++) expect(w.isFrozen(x, 18)).toBe(false);
    let outer = 0;
    for (let x = -32; x < 0; x++) if (w.isFrozen(x, 18)) outer++;
    expect(outer).toBe(r.frozen);
    const ci = w.chunkIndex(-1, 0);
    expect(w.drainLiquidDirty()).toContain(ci);
    expect(w.liquidModified.has(ci)).toBe(false);
    // 中央照舊：結冰的 chunk 標已修改（存檔）
    updateFreeze(w, null, winterLate, undefined, undefined, [0, 1]);
    expect(w.isFrozen(25, 18)).toBe(true);
    expect(w.liquidModified.has(w.chunkIndex(0, 0))).toBe(true);
  });
});
