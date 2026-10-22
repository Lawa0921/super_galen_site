// world.edits.test.ts — World 的編輯日誌掛鉤（co-op M-B2 Task 1）：touch 記錄、chunk 鍵、沒常駐 / 停放、writeChunk、touchChest、netLiquid
import { describe, it, expect } from 'vitest';
import { World, LIQ, BIOME } from './world';
import { T, W } from './tiles';
import { isOuterChunkKey } from './coords';
import { DelveGame } from './game';
import type { EditBatch } from './edits';
import { restoreGame, serializeGame } from '../save/serialize';

describe('World.edits', () => {
  it('setFg 記在 chunkIndex 底下', () => {
    const w = new World(64, 64);
    expect(w.setFg(5, 40, T.DIRT)).toBe(true);
    expect(w.edits.drain()).toEqual([{ chunk: w.chunkIndex(0, 1), rev: 1, tiles: [5, 40, T.DIRT, 0, 0], chests: [], full: false }]);
  });

  it('setWall、setHalf 合併成同一筆', () => {
    const w = new World(64, 64);
    w.setFg(5, 40, T.STONE);
    w.setWall(5, 40, W.STONE_WALL);
    w.setHalf(5, 40, true);
    expect(w.edits.drain()).toEqual([{ chunk: w.chunkIndex(0, 1), rev: 3, tiles: [5, 40, T.STONE, W.STONE_WALL, 1], chests: [], full: false }]);
  });

  it('沒變化不記', () => {
    const w = new World(64, 64);
    w.setFg(5, 40, T.DIRT);
    w.edits.drain();
    expect(w.setFg(5, 40, T.DIRT)).toBe(false);
    expect(w.setWall(5, 40, 0)).toBe(false);
    expect(w.setHalf(5, 40, false)).toBe(false);
    expect(w.edits.pending()).toBe(0);
  });

  it('setFrozen、setFlag、writeChunkPayload 不進日誌', () => {
    const w = new World(64, 64);
    w.setFrozen(3, 3, true);
    w.setFlag('half', 4, 4, true);
    const p = w.readChunkPayload(1, 1);
    p.fg[0] = T.DIRT;
    w.writeChunkPayload(1, 1, p);
    expect(w.getFg(32, 32)).toBe(T.DIRT);
    expect(w.edits.pending()).toBe(0);
  });

  it('外圍負 x', () => {
    const w = new World(64, 64, { bounds: 'infinite' });
    w.ensureColumn(-3);
    expect(w.setFg(-90, 10, T.STONE)).toBe(true);
    const out = w.edits.drain();
    expect(out).toHaveLength(1);
    expect(out[0].chunk).toBe(w.chunkIndex(-3, 0));
    expect(isOuterChunkKey(out[0].chunk)).toBe(true);
    expect(out[0].tiles).toEqual([-90, 10, T.STONE, 0, 0]);
  });

  it('沒常駐的欄寫入不記', () => {
    const w = new World(64, 64, { bounds: 'infinite' });
    expect(w.isResident(40)).toBe(false);
    expect(w.setFg(40 * 32 + 1, 5, T.DIRT)).toBe(false);
    expect(w.setWall(40 * 32 + 1, 5, W.STONE_WALL)).toBe(false);
    w.touchChest(40 * 32 + 1, 5);
    expect(w.edits.pending()).toBe(0);
  });

  it('停放後蓋回來不產生日誌', () => {
    const w = new World(64, 64, { bounds: 'infinite' });
    w.ensureColumn(-3);
    w.setFg(-90, 10, T.STONE);
    w.edits.drain();
    expect(w.unloadColumn(-3)).toBe(true);
    w.ensureColumn(-3);
    expect(w.edits.pending()).toBe(0);
    expect(w.getFg(-90, 10)).toBe(T.STONE);
    expect(w.edits.rev(w.chunkIndex(-3, 0))).toBe(1);
  });

  it('writeChunk 標 full', () => {
    const w = new World(64, 64);
    w.setFg(5, 5, T.DIRT);
    const ci = w.chunkIndex(0, 0);
    const before = w.edits.rev(ci);
    w.writeChunk(0, 0, w.readChunk(0, 0)!);
    const out = w.edits.drain();
    expect(out).toEqual([{ chunk: ci, rev: before + 1, tiles: [], chests: [], full: true }]);
  });

  it('writeChunk(…, false)（讀檔還原）不進日誌', () => {
    const w = new World(64, 64);
    w.writeChunk(0, 0, w.readChunk(0, 0)!, false);
    expect(w.edits.pending()).toBe(0);
    expect(w.modifiedChunks.has(w.chunkIndex(0, 0))).toBe(true);
  });

  it('touchChest', () => {
    const w = new World(64, 64);
    w.setFg(3, 3, T.CHEST);
    w.edits.drain();
    w.modifiedChunks.clear();
    w.touchChest(3, 3);
    const ci = w.chunkIndex(0, 0);
    expect(w.edits.drain()).toEqual([{ chunk: ci, rev: 2, tiles: [], chests: [w.idx(3, 3)], full: false }]);
    expect(w.modifiedChunks.has(ci)).toBe(true);
  });

  it('netLiquid 與 renderer 的液體 dirty 各自獨立', () => {
    const w = new World(64, 64);
    const ci = w.chunkIndex(0, 0);
    expect(w.setLiquid(5, 5, 100, LIQ.WATER)).toBe(true);
    expect(w.drainLiquidDirty()).toContain(ci);
    expect(w.drainNetLiquid()).toContain(ci);
    expect(w.drainNetLiquid()).toEqual([]);
    // markLiquidDirty（結冰重畫）也進網路集合；writeChunk 也是
    w.markLiquidDirty(40, 40);
    expect(w.drainNetLiquid()).toEqual([w.chunkIndex(1, 1)]);
    w.writeChunk(1, 0, w.readChunk(1, 0)!);
    expect(w.drainNetLiquid()).toEqual([w.chunkIndex(1, 0)]);
    // 液體不進日誌
    expect(w.edits.drain().every((b) => b.tiles.length === 0)).toBe(true);
  });

  it('外圍欄的液體改完卸載 → netLiquid 不含該 chunk', () => {
    const w = new World(64, 64, { bounds: 'infinite' });
    w.ensureColumn(-3);
    w.setLiquid(-90, 10, 100, LIQ.WATER);
    w.touchLiquidAt(-90, 10);
    const ci = w.chunkIndex(-3, 0);
    w.unloadColumn(-3);
    expect(w.drainNetLiquid()).not.toContain(ci);
    expect(w.edits.pending()).toBe(0);
  });
});

const FLOOR = 60;
/** 平地小世界（同 engine/actors.test.ts）：y ≥ 60 石頭、x 40..69 地表是泥土；本地玩家站在 (40, 59) */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'edits', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  for (let x = 40; x < 70; x++) w.setFg(x, FLOOR, T.DIRT);
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainEvents();
  g.world.edits.drain();
  return g;
}

/** batch 的 tiles 拆成 [x, y, fg, wall, half] 一組 */
function cells(b: EditBatch): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < b.tiles.length; i += 5) out.push(b.tiles.slice(i, i + 5));
  return out;
}

describe('DelveGame 的編輯進日誌', () => {
  it('mineInstant 一格泥土 → 有一筆 fg 是 AIR 的項目', () => {
    const g = arena();
    expect(g.mineInstant(45, FLOOR)).toBe(true);
    const w = g.world, out = w.edits.drain();
    const b = out.find((q) => q.chunk === w.chunkIndex(45 >> 5, FLOOR >> 5));
    expect(b).toBeDefined();
    expect(cells(b!).some(([x, y, fg]) => x === 45 && y === FLOOR && fg === T.AIR)).toBe(true);
  });

  it('箱子存入 → 那個 chunk 的 batch chests 含箱子的 tile 鍵', () => {
    const g = arena();
    const w = g.world, x = 42, y = FLOOR - 1;
    w.setFg(x, y, T.CHEST);
    w.edits.drain();
    expect(g.interact(x, y)).toBe(true);
    g.give('torch', 5);
    const slot = g.inventory.slots.findIndex((s) => s?.item === 'torch');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(g.depositToChest(slot)).toBe(true);
    const b = w.edits.drain().find((q) => q.chunk === w.chunkIndex(x >> 5, y >> 5));
    expect(b?.chests).toContain(w.idx(x, y));
    // 拿回來也記
    const i = g.chestSlots()!.findIndex((s) => s?.item === 'torch');
    expect(g.takeChestSlot(i)).toBe(true);
    expect(w.edits.drain().find((q) => q.chunk === w.chunkIndex(x >> 5, y >> 5))?.chests).toEqual([w.idx(x, y)]);
  });

  it('讀檔還原不進日誌：還原後的日誌與同 seed 新開的世界一樣', () => {
    const opts = { seed: 'edits-load', width: 160, height: 100 };
    const g = new DelveGame(opts);
    g.mineInstant(g.spawn.x, g.spawn.y + 1);
    g.world.setFg(5, 5, T.PLANKS);
    g.world.setWall(150, 90, W.STONE_WALL);
    g.world.setHalf(5, 5, true);
    g.world.setFg(40, 20, T.CHEST);
    g.world.chests.get(g.world.idx(40, 20))![0] = { item: 'torch', count: 3 };
    g.world.touchChest(40, 20);
    const r = restoreGame(serializeGame(g));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.game.world.getFg(5, 5)).toBe(T.PLANKS);
    expect(r.game.world.edits.drain()).toEqual(new DelveGame(opts).world.edits.drain());
  });
});
