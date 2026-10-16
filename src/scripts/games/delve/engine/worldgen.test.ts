// worldgen.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, tileRunner, type GenResult } from './worldgen';
import { World } from './world';
import { Rng } from './rng';
import { T, W, isSolidTile } from './tiles';
import { WORLD_W, WORLD_H, PLAYER_H, TILE_SIZE } from './constants';

function hashBytes(...arrs: Uint8Array[]): number {
  let h = 2166136261;
  for (const a of arrs) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

describe('tileRunner', () => {
  it('在空白世界灑出菱形塊、尺寸隨步數收斂', () => {
    const w = new World(64, 64);
    tileRunner(w, new Rng(1), 32, 32, 8, 6, T.STONE, { addTile: true });
    let n = 0;
    for (let i = 0; i < w.fg.length; i++) if (w.fg[i] === T.STONE) n++;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(64 * 64 / 4);
    expect(w.modifiedChunks.size).toBe(0); // 生成階段不算玩家修改
  });
  it('type=-1 挖成空氣', () => {
    const w = new World(64, 64);
    w.fg.fill(T.STONE);
    tileRunner(w, new Rng(2), 32, 32, 10, 10, -1);
    expect(w.fg[w.idx(32, 32)]).toBe(T.AIR);
  });
});

describe('generateWorld', () => {
  let a: GenResult;
  beforeAll(() => { a = generateWorld('alpha'); });

  it('預設尺寸 1600×500', () => {
    expect(a.world.width).toBe(WORLD_W);
    expect(a.world.height).toBe(WORLD_H);
  });
  it('同 seed → 位元相同；不同 seed → 不同', () => {
    const b = generateWorld('alpha');
    expect(hashBytes(b.world.fg, b.world.wall)).toBe(hashBytes(a.world.fg, a.world.wall));
    expect(b.spawn).toEqual(a.spawn);
    const c = generateWorld('beta');
    expect(hashBytes(c.world.fg, c.world.wall)).not.toBe(hashBytes(a.world.fg, a.world.wall));
  });
  it('出生點：腳下是實心地面、身體所在格為空', () => {
    const { world, spawn } = a;
    expect(isSolidTile(world.getFg(spawn.x, spawn.y + 1))).toBe(true);
    const bodyTiles = Math.ceil(PLAYER_H / TILE_SIZE);
    for (let dy = 0; dy < bodyTiles; dy++) {
      for (let dx = -1; dx <= 1; dx++) expect(isSolidTile(world.getFg(spawn.x + dx, spawn.y - dy))).toBe(false);
    }
    expect(spawn.x).toBeGreaterThan(WORLD_W * 0.4);
    expect(spawn.x).toBeLessThan(WORLD_W * 0.6);
  });
  it('地表以下有洞穴（大量空氣）', () => {
    const { world } = a;
    let air = 0, total = 0;
    for (let y = world.surfaceY + 20; y < world.height - 5; y++) {
      for (let x = 0; x < world.width; x++) { total++; if (world.fg[world.idx(x, y)] === T.AIR) air++; }
    }
    expect(air / total).toBeGreaterThan(0.03);
    expect(air / total).toBeLessThan(0.5);
  });
  it('有銅礦與鐵礦，且鐵礦平均比銅礦深', () => {
    const { world } = a;
    let cu = 0, fe = 0, cuY = 0, feY = 0;
    for (let i = 0; i < world.fg.length; i++) {
      const y = Math.floor(i / world.width);
      if (world.fg[i] === T.COPPER_ORE) { cu++; cuY += y; }
      if (world.fg[i] === T.IRON_ORE) { fe++; feY += y; }
    }
    expect(cu).toBeGreaterThan(200);
    expect(fe).toBeGreaterThan(100);
    expect(feY / fe).toBeGreaterThan(cuY / cu);
    expect(cuY / cu).toBeGreaterThan(world.surfaceY);
  });
  it('有石頭、草地、沙、樹與背景牆', () => {
    const { world } = a;
    const count = new Map<number, number>();
    for (let i = 0; i < world.fg.length; i++) count.set(world.fg[i], (count.get(world.fg[i]) ?? 0) + 1);
    expect(count.get(T.STONE) ?? 0).toBeGreaterThan(50000);
    expect(count.get(T.GRASS) ?? 0).toBeGreaterThan(500);
    expect(count.get(T.SAND) ?? 0).toBeGreaterThan(50);
    expect(count.get(T.WOOD) ?? 0).toBeGreaterThan(50);
    expect(count.get(T.LEAVES) ?? 0).toBeGreaterThan(50);
    let walls = 0;
    for (let i = 0; i < world.wall.length; i++) if (world.wall[i] !== W.NONE) walls++;
    expect(walls).toBeGreaterThan(100000);
  });
  it('地表以上空氣無牆（天空可見），最上排為空氣', () => {
    const { world } = a;
    for (let x = 0; x < world.width; x++) {
      expect(world.fg[world.idx(x, 0)]).toBe(T.AIR);
      expect(world.wall[world.idx(x, 0)]).toBe(W.NONE);
    }
    expect(world.surfaceY).toBeGreaterThan(50);
    expect(world.surfaceY).toBeLessThan(world.height / 2);
  });
  it('生成後 modifiedChunks 為空', () => {
    expect(a.world.modifiedChunks.size).toBe(0);
  });
  it('效能：1600×500 生成遠小於 2 秒', () => {
    const t0 = performance.now();
    generateWorld('perf');
    const ms = performance.now() - t0;
    console.log(`[delve] worldgen 1600x500: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(2000);
  });
  it('可指定較小尺寸', () => {
    const r = generateWorld('small', { width: 200, height: 120 });
    expect(r.world.width).toBe(200);
    expect(isSolidTile(r.world.getFg(r.spawn.x, r.spawn.y + 1))).toBe(true);
  });
});
