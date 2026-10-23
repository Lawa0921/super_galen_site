// world.source.test.ts — World 的 central: 'source' 模式（中央也由 ColumnSource 生成、不建中央陣列、不 pin）、
// regionAt（地區 API）與生成物件登錄（source.objectsIn 的箱子：載入時登錄、改過的 chunk 不蓋、卸載時丟掉沒改過的）。
import { describe, it, expect } from 'vitest';
import { World, BIOME, LIQ } from './world';
import { Column, li, type ColumnSource, type ColumnLayers, type GenChest } from './column';
import type { RegionInfo } from './regionInfo';
import { cloneStack, type Stack } from './inventory';
import { T, W } from './tiles';

function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y + 977, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}
const CHEST_X = 330, CHEST_Y = 400;
/** 物件清單裡有、但那格不是箱子 tile（不該被登錄） */
const BOGUS_X = 340, BOGUS_Y = 410;

class ObjSource implements ColumnSource {
  readonly version = 1;
  readonly chestSlots: (Stack | null)[] = [{ item: 'rope', count: 5 }, null, { item: 'planks', count: 12 }, null];
  expectFg(x: number, y: number): number {
    if (x === CHEST_X && y === CHEST_Y) return T.CHEST;
    if (x === BOGUS_X && y === BOGUS_Y) return T.STONE;
    const v = hash(x, y) % 3;
    return v === 0 ? T.STONE : v === 1 ? T.DIRT : T.AIR;
  }
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 0; y < col.height; y++) {
      for (let x = x0; x < x1; x++) { col.fg[li(x, y)] = this.expectFg(x, y); col.wall[li(x, y)] = hash(y, x) % 4 === 0 ? W.DIRT_WALL : 0; }
    }
  }
  surfaceAt(x: number): number { return 300 + (x & 7); }
  biomeAt(x: number): number { return (x >> 4) & 3; }
  layersAt(x: number): ColumnLayers { return { rock: 500 + (x & 1), deep: 700, molten: 1000 }; }
  regionAt(x: number): RegionInfo {
    const index = Math.floor(x / 256);
    return { landmass: 3, side: 1, tier: 2, kind: 'culture', culture: 'mistbamboo', variant: 1, biome: this.biomeAt(x), index, x0: index * 256, x1: index * 256 + 256 };
  }
  objectsIn(x0: number, x1: number): GenChest[] {
    const out: GenChest[] = [];
    if (CHEST_X >= x0 && CHEST_X < x1) out.push({ x: CHEST_X, y: CHEST_Y, slots: this.chestSlots.map((s) => (s ? cloneStack(s) : null)) });
    if (BOGUS_X >= x0 && BOGUS_X < x1) out.push({ x: BOGUS_X, y: BOGUS_Y, slots: [{ item: 'rope', count: 1 }] });
    return out;
  }
}

const mk = (src: ColumnSource): World => new World(4200, 1200, { bounds: 'infinite', source: src, central: 'source' });

describe("World central: 'source'", () => {
  it('source 模式：建構時沒有常駐欄、中央不 pin、中央欄整欄由 source 填', () => {
    const src = new ObjSource();
    const w = mk(src);
    expect(w.residentColumns()).toEqual([]);
    expect(w.isPinned(10)).toBe(false);
    expect(w.isPinned(0)).toBe(false);
    expect(w.pinnedSet().size).toBe(0);
    expect(w.centralArrays).toBe(false);
    expect(w.surface.length).toBe(0);
    expect(w.biome.length).toBe(0);
    expect(w.chunksX).toBe(Math.ceil(4200 / 32)); // 寬度只留給鍵的算術
    w.ensureColumn(10);
    for (let x = 320; x < 352; x++) {
      expect(w.getFg(x, 500)).toBe(src.expectFg(x, 500));
      expect(w.getFg(x, 0)).toBe(src.expectFg(x, 0));
    }
    expect(w.surfaceAt(330)).toBe(src.surfaceAt(330));
    expect(w.biomeAt(330)).toBe(src.biomeAt(330));
    expect(w.layersAt(330)).toEqual(src.layersAt(330));
    expect(w.isLegacyCentral(330)).toBe(false);
    expect(w.unloadColumn(10)).toBe(true);
    expect(w.isResident(10)).toBe(false);
    // pin() 仍然有效
    w.pin(12);
    expect(w.isPinned(12)).toBe(true);
    expect([...w.pinnedSet()]).toEqual([12]);
  });

  it('預設 arrays 模式不變：中央常駐 + pin、isLegacyCentral 只認 [0, width)', () => {
    const src = new ObjSource();
    const w = new World(4200, 1200, { bounds: 'infinite', source: src });
    expect(w.centralArrays).toBe(true);
    expect(w.residentColumns().length).toBe(Math.ceil(4200 / 32));
    expect(w.isPinned(10)).toBe(true);
    expect(w.getFg(330, 500)).toBe(T.AIR); // 中央由舊生成器負責：source 不填
    expect(w.isLegacyCentral(0)).toBe(true);
    expect(w.isLegacyCentral(4199)).toBe(true);
    expect(w.isLegacyCentral(4200)).toBe(false);
    expect(w.isLegacyCentral(-1)).toBe(false);
    expect(w.regionAt(330)).toMatchObject({ kind: 'home', landmass: 0, x0: 0, x1: 4200 });
    expect(w.regionAt(5000)).toEqual(src.regionAt(5000));
  });

  it('生成物件：載入時登錄沒改過 chunk 的箱子；改過就不蓋；卸載時丟掉沒改過的', () => {
    const src = new ObjSource();
    const w = mk(src), w2 = mk(src);
    w.ensureColumn(10);
    const k = w.idx(CHEST_X, CHEST_Y);
    expect(w.chests.get(k)).toEqual(src.chestSlots);
    expect(w.chests.get(k)).not.toBe(src.chestSlots);
    expect(w.chests.has(w.idx(BOGUS_X, BOGUS_Y))).toBe(false); // 那格不是箱子 tile
    w.chests.get(k)![0] = null; w.touchChest(CHEST_X, CHEST_Y); // 搜刮 → chunk 已修改
    w.unloadColumn(10); w.ensureColumn(10);
    expect(w.chests.get(k)![0]).toBeNull(); // 停放蓋回，沒被重新填滿
    expect(w.chests.get(k)![2]).toEqual({ item: 'planks', count: 12 });
    w2.ensureColumn(10); w2.unloadColumn(10);
    expect(w2.chests.has(k)).toBe(false); // 沒改過 → 卸載就丟
    w2.ensureColumn(10);
    expect(w2.chests.get(k)).toEqual(src.chestSlots); // 再載入一樣
  });

  it('生成物件：箱子被打掉（chunk 已修改）→ 再載入不復活', () => {
    const src = new ObjSource();
    const w = mk(src);
    w.ensureColumn(10);
    const k = w.idx(CHEST_X, CHEST_Y);
    expect(w.setFg(CHEST_X, CHEST_Y, T.AIR)).toBe(true);
    expect(w.chests.has(k)).toBe(false);
    w.unloadColumn(10); w.ensureColumn(10);
    expect(w.getFg(CHEST_X, CHEST_Y)).toBe(T.AIR);
    expect(w.chests.has(k)).toBe(false);
  });

  it('生成物件：只有液體改過（停放但 modifiedChunks 沒有）→ 卸載丟掉、再載入照生成內容登錄', () => {
    const src = new ObjSource();
    const w = mk(src);
    w.ensureColumn(10);
    const k = w.idx(CHEST_X, CHEST_Y);
    w.chests.get(k)![0] = null; // 沒 touchChest：不算修改
    w.setLiquid(CHEST_X + 1, CHEST_Y, 100, LIQ.WATER);
    w.unloadColumn(10);
    expect(w.chests.has(k)).toBe(false);
    w.ensureColumn(10);
    expect(w.chests.get(k)).toEqual(src.chestSlots);
  });

  it('regionAt：source 有就問 source；舊世界中央回 home', () => {
    const src = new ObjSource();
    const w = mk(src);
    expect(w.regionAt(330)).toEqual(src.regionAt(330));
    expect(w.regionAt(-5000)).toEqual(src.regionAt(-5000));
    const legacy = new World(100, 100);
    legacy.biome.fill(BIOME.SNOW);
    expect(legacy.regionAt(50)).toEqual({ landmass: 0, side: 0, tier: 0, kind: 'home', culture: null, variant: 0, biome: BIOME.SNOW, index: 0, x0: 0, x1: 100 });
    expect(legacy.isLegacyCentral(50)).toBe(true);
    expect(legacy.isLegacyCentral(100)).toBe(false);
    // source 沒有 regionAt（舊式 source）→ 後備值
    const plain: ColumnSource = { version: 1, fill: () => {}, surfaceAt: () => 10, biomeAt: () => BIOME.DESERT, layersAt: () => ({ rock: 1, deep: 2, molten: 3 }) };
    const pw = new World(64, 64, { bounds: 'infinite', source: plain, central: 'source' });
    expect(pw.regionAt(500)).toMatchObject({ kind: 'home', landmass: 0, biome: BIOME.DESERT, x0: 0, x1: 64 });
  });
});
