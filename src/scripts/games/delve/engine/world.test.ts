// world.test.ts
import { describe, it, expect } from 'vitest';
import { World, LIQ, type TileWindow } from './world';
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

  it('xMin / xMax（扁平世界 = 0 / width）、idx / tileXY 往返', () => {
    const w = new World(100, 70);
    expect(w.xMin).toBe(0);
    expect(w.xMax).toBe(100);
    expect(w.idx(7, 3)).toBe(3 * 100 + 7);
    expect(w.tileXY(w.idx(7, 3))).toEqual({ x: 7, y: 3 });
    expect(w.chunkCoords(w.chunkIndex(2, 1))).toEqual({ cx: 2, cy: 1 });
    expect(w.chunkIndex(2, 1)).toBe(1 * w.chunksX + 2);
  });

  it('window 讀到的每格 = getter（跨 chunk、跨左右上下邊界；邊界外是 STONE、其餘 0）', () => {
    const w = new World(96, 80);
    let s = 99;
    const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
    for (let y = 0; y < 80; y++) for (let x = 0; x < 96; x++) {
      w.setFg(x, y, rnd(4) === 0 ? T.STONE : rnd(3) === 0 ? T.DIRT : T.AIR);
      w.setWall(x, y, rnd(2) ? W.DIRT_WALL : 0);
      if (rnd(5) === 0) w.setLiquid(x, y, 1 + rnd(255), rnd(2) ? LIQ.WATER : LIQ.LAVA);
      if (rnd(7) === 0) w.setFrozen(x, y, true);
      if (rnd(6) === 0) w.setHalf(x, y, true);
    }
    const check = (win: TileWindow): void => {
      for (let y = win.y0; y < win.y0 + win.h; y++) for (let x = win.x0; x < win.x0 + win.w; x++) {
        const i = (y - win.y0) * win.w + (x - win.x0);
        const at = `${x},${y}`;
        expect([at, win.fg[i]]).toEqual([at, w.getFg(x, y)]);
        expect([at, win.wall[i]]).toEqual([at, w.getWall(x, y)]);
        expect([at, win.liquid[i]]).toEqual([at, w.getLiquid(x, y)]);
        expect([at, win.liquidType[i]]).toEqual([at, w.getLiquidType(x, y)]);
        expect([at, win.frozen[i]]).toEqual([at, w.isFrozen(x, y) ? 1 : 0]);
        expect([at, win.half[i]]).toEqual([at, w.isHalf(x, y) ? 1 : 0]);
        expect([at, win.variant[i]]).toEqual([at, w.variantAt(x, y)]);
      }
    };
    const a = w.window(20, 25, 50, 30); // 跨 chunk
    expect(a.fg.length).toBeGreaterThanOrEqual(50 * 30);
    check(a);
    const b = w.window(-10, -6, 120, 95); // 四邊都越界
    check(b);
    expect(b.fg[0]).toBe(T.STONE);
    expect(b.wall[0]).toBe(0);
    check(w.window(80, 70, 30, 20)); // 右下越界
    check(w.window(-40, 10, 30, 5)); // 整塊在左邊界外
  });

  it('window 的 out 夠大就重用（不配置），太小才重新配置', () => {
    const w = new World(64, 64);
    const a = w.window(0, 0, 40, 30);
    const fg = a.fg;
    const b = w.window(10, 10, 20, 20, a);
    expect(b).toBe(a);
    expect(b.fg).toBe(fg);
    expect([b.x0, b.y0, b.w, b.h]).toEqual([10, 10, 20, 20]);
    const c = w.window(0, 0, 64, 64, a);
    expect(c.fg.length).toBeGreaterThanOrEqual(64 * 64);
  });

  it('isFrozen / setFrozen 不標 dirty；越界安全', () => {
    const w = new World(64, 64);
    expect(w.isFrozen(3, 3)).toBe(false);
    w.setFrozen(3, 3, true);
    expect(w.isFrozen(3, 3)).toBe(true);
    expect(w.frozen[w.idx(3, 3)]).toBe(1);
    expect(w.drainDirty()).toEqual([]);
    expect(w.modifiedChunks.size).toBe(0);
    w.setFrozen(3, 3, false);
    expect(w.isFrozen(3, 3)).toBe(false);
    w.setFrozen(-1, 3, true);
    expect(w.isFrozen(-1, 3)).toBe(false);
  });

  it('setLiquidRaw 不標 dirty；touchLiquidAt 標液體 dirty / 已修改', () => {
    const w = new World(96, 96);
    w.setLiquidRaw(40, 40, 120, LIQ.WATER);
    expect(w.getLiquid(40, 40)).toBe(120);
    expect(w.getLiquidType(40, 40)).toBe(LIQ.WATER);
    expect(w.drainLiquidDirty()).toEqual([]);
    expect(w.liquidModified.size).toBe(0);
    expect(w.drainDirty()).toEqual([]);
    w.touchLiquidAt(40, 40);
    expect(w.drainLiquidDirty()).toEqual([w.chunkIndex(1, 1)]);
    expect([...w.liquidModified]).toEqual([w.chunkIndex(1, 1)]);
    w.touchLiquid(w.idx(70, 5));
    expect(w.drainLiquidDirty()).toEqual([w.chunkIndex(2, 0)]);
    w.setLiquidRaw(-1, 0, 50, LIQ.WATER); // 越界不炸
    w.touchLiquidAt(-1, 0);
    expect(w.drainLiquidDirty()).toEqual([]);
  });

  it('variantAt 在界內 = variant 陣列；界外也有座標雜湊值（0..2）', () => {
    const w = new World(64, 64);
    for (let i = 0; i < 64; i++) expect(w.variantAt(i, 5)).toBe(w.variant[w.idx(i, 5)]);
    for (const x of [-1, -100, 64, 9999]) {
      const v = w.variantAt(x, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
    }
  });

  it('layersAt 讀中央陣列、越界夾到邊欄；沒有 layers 時用世界的單一深度線', () => {
    const w = new World(10, 50);
    w.rockY = 11; w.cavernY = 22; w.moltenY = 33;
    expect(w.layers).toBeNull();
    expect(w.layersAt(4)).toEqual({ rock: 11, deep: 22, molten: 33 });
    const rock = new Int16Array(10), deep = new Int16Array(10), molten = new Int16Array(10);
    for (let x = 0; x < 10; x++) { rock[x] = 10 + x; deep[x] = 20 + x; molten[x] = 30 + x; }
    w.layers = { rock, deep, molten };
    expect(w.layersAt(3)).toEqual({ rock: 13, deep: 23, molten: 33 });
    expect(w.layersAt(-5)).toEqual({ rock: 10, deep: 20, molten: 30 });
    expect(w.layersAt(99)).toEqual({ rock: 19, deep: 29, molten: 39 });
    expect(w.layersAt(3.7)).toEqual({ rock: 13, deep: 23, molten: 33 });
  });

  it('forEachChunk 的順序 = markAllDirty 的順序（cy 外層、cx 內層）', () => {
    const w = new World(100, 70);
    w.markAllDirty();
    const old = w.drainDirty();
    const seen: number[] = [];
    w.forEachChunk((cx, cy) => seen.push(w.chunkIndex(cx, cy)));
    expect(seen).toEqual(old);
    expect(seen.length).toBe(w.chunksX * w.chunksY);
  });
});
