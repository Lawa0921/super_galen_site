// world.test.ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T, W } from './tiles';
import { CHUNK } from './constants';

describe('World', () => {
  it('尺寸、chunk 數、預設空氣', () => {
    const w = new World(100, 70);
    expect(w.fg.length).toBe(7000);
    expect(w.chunksX).toBe(Math.ceil(100 / CHUNK));
    expect(w.chunksY).toBe(Math.ceil(70 / CHUNK));
    expect(w.getFg(5, 5)).toBe(T.AIR);
  });
  it('get/set 與 inBounds；越界讀回 STONE（視為實心邊界）', () => {
    const w = new World(64, 64);
    w.setFg(3, 4, T.DIRT);
    w.setWall(3, 4, W.DIRT_WALL);
    expect(w.getFg(3, 4)).toBe(T.DIRT);
    expect(w.getWall(3, 4)).toBe(W.DIRT_WALL);
    expect(w.inBounds(-1, 0)).toBe(false);
    expect(w.inBounds(63, 63)).toBe(true);
    expect(w.inBounds(64, 0)).toBe(false);
    expect(w.isSolid(-1, 10)).toBe(true);
    expect(w.isSolid(10, 64)).toBe(true);
    expect(w.isSolid(10, -1)).toBe(false); // 上方天空可穿
    expect(w.isSolid(3, 4)).toBe(true);
    w.setFg(-5, -5, T.DIRT); // 不炸
  });
  it('set 會標記 dirty 與 modified chunk；邊界格也標鄰 chunk dirty', () => {
    const w = new World(96, 96);
    w.setFg(40, 40, T.STONE);
    expect([...w.modifiedChunks]).toEqual([w.chunkIndex(1, 1)]);
    expect(w.drainDirty()).toEqual([w.chunkIndex(1, 1)]);
    expect(w.drainDirty()).toEqual([]);
    w.setFg(32, 40, T.STONE); // 左緣
    const d = w.drainDirty().sort((a, b) => a - b);
    expect(d).toEqual([w.chunkIndex(0, 1), w.chunkIndex(1, 1)].sort((a, b) => a - b));
    expect(w.modifiedChunks.has(w.chunkIndex(0, 1))).toBe(false);
  });
  it('寫入相同值不標記', () => {
    const w = new World(64, 64);
    w.setFg(1, 1, T.AIR);
    expect(w.modifiedChunks.size).toBe(0);
  });
  it('variant 由座標雜湊決定（0..2）', () => {
    const w = new World(64, 64);
    for (let i = 0; i < 50; i++) expect(w.variant[i]).toBeLessThan(3);
  });
});
