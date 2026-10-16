// worldgen.ts — 確定性世界生成。每個 pass 用 subSeed(seed, passName) 取獨立亂數流。
// 只用 + − × ÷ / floor / abs，不用 Math.sin 等超越函數，確保跨引擎位元一致。
// 演算法概念參考泰拉（地表 feature 隨機漫步、TileRunner 菱形筆刷），程式為自行重寫。
import { World } from './world';
import { Rng, subSeed } from './rng';
import { T, W } from './tiles';
import { WORLD_W, WORLD_H } from './constants';

export interface GenOptions { width?: number; height?: number; }
export interface GenBands {
  surfaceLow: number; surfaceHigh: number; rockLow: number; rockHigh: number;
}
export interface GenResult {
  world: World;
  /** 出生 tile：玩家腳底所在格（y+1 為實心地面） */
  spawn: { x: number; y: number };
  /** 每欄地表高度（第一個實心格 y） */
  surface: Int16Array;
  bands: GenBands;
}

export interface RunnerOptions {
  speedX?: number;
  speedY?: number;
  /** type>=0 時，是否可在空氣上新增（預設 false：只取代既有實心） */
  addTile?: boolean;
  /** 自訂可被取代的 tile 判定 */
  only?: (id: number) => boolean;
}

/**
 * TileRunner：隨機漫步的菱形筆刷，尺寸隨剩餘步數線性收斂。
 * type = -1 → 挖空；type >= 0 → 設為該 tile。直接寫 world.fg（不標記玩家修改）。
 */
export function tileRunner(
  world: World, rng: Rng, x: number, y: number, strength: number, steps: number,
  type: number, opt: RunnerOptions = {},
): void {
  const { width, height, fg } = world;
  let px = x, py = y;
  let vx = opt.speedX ?? rng.range(-1, 1);
  let vy = opt.speedY ?? rng.range(-1, 1);
  const only = opt.only;
  const addTile = opt.addTile ?? false;
  for (let left = steps; left > 0; left--) {
    const size = strength * (left / steps);
    if (size <= 0) break;
    const half = size * 0.5;
    const x0 = Math.max(0, Math.floor(px - half)), x1 = Math.min(width - 1, Math.floor(px + half));
    const y0 = Math.max(0, Math.floor(py - half)), y1 = Math.min(height - 1, Math.floor(py + half));
    for (let ty = y0; ty <= y1; ty++) {
      const dy = Math.abs(ty - py);
      for (let tx = x0; tx <= x1; tx++) {
        const lim = half * (1 + rng.int(-10, 11) * 0.015);
        if (Math.abs(tx - px) + dy >= lim) continue;
        const i = ty * width + tx;
        const cur = fg[i];
        if (type < 0) { fg[i] = T.AIR; continue; }
        if (only) { if (only(cur)) fg[i] = type; continue; }
        if (cur !== T.AIR || addTile) fg[i] = type;
      }
    }
    px += vx; py += vy;
    vx += rng.int(-10, 11) * 0.05; vy += rng.int(-10, 11) * 0.05;
    if (vx > 1) vx = 1; else if (vx < -1) vx = -1;
    if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
  }
}

const isRock = (id: number): boolean => id === T.STONE || id === T.DIRT;

/** 地表 feature：平台 / 丘 / 谷 / 山 / 峽谷，各自決定每欄高度變化的偏向。 */
type Feature = 0 | 1 | 2 | 3 | 4;
function surfaceOffset(rng: Rng, f: Feature): number {
  switch (f) {
    case 0: return rng.chance(6) ? rng.int(-1, 2) : 0;                 // plateau
    case 1: return rng.chance(2) ? -1 : rng.int(-1, 2);                // hill（往上）
    case 2: return rng.chance(2) ? 1 : rng.int(-1, 2);                 // dale（往下）
    case 3: return rng.chance(3) ? -2 : rng.int(-2, 1);                // mountain
    default: return rng.chance(3) ? 2 : rng.int(0, 3);                 // valley
  }
}

export function generateWorld(seed: string | number, opts: GenOptions = {}): GenResult {
  const width = opts.width ?? WORLD_W;
  const height = opts.height ?? WORLD_H;
  const world = new World(width, height);
  const { fg, wall } = world;
  const A = width * height;
  const spawnLo = Math.floor(width * 0.45), spawnHi = Math.floor(width * 0.55);
  const inSpawnBand = (x: number): boolean => x >= spawnLo && x <= spawnHi;

  // ── Terrain：每欄地表隨機漫步 + 岩層線 ─────────────────────
  const surface = new Int16Array(width);
  const rockLine = new Int16Array(width);
  {
    const rng = subSeed(seed, 'terrain');
    const minS = Math.floor(height * 0.17), maxS = Math.floor(height * 0.26);
    let s = Math.floor(height * rng.int(18, 25) * 0.01);
    if (s < minS) s = minS; if (s > maxS) s = maxS;
    let rock = s + Math.floor(height * 0.1);
    let feature: Feature = 0, featureLeft = 0;
    for (let x = 0; x < width; x++) {
      if (featureLeft <= 0) {
        const central = x >= width * 0.45 && x <= width * 0.55;
        feature = (central ? rng.int(0, 3) : rng.int(0, 5)) as Feature;
        if (x >= width * 0.48 && x <= width * 0.52) feature = 0;
        featureLeft = rng.int(5, 40);
        if (feature === 0) featureLeft = Math.floor(featureLeft * rng.int(5, 30) * 0.2);
      }
      featureLeft--;
      s += surfaceOffset(rng, feature);
      if (x >= width * 0.48 && x <= width * 0.52 && s !== surface[x - 1] && x > 0) s = surface[x - 1];
      if (s < minS) { s = minS; featureLeft = 0; }
      if (s > maxS) { s = maxS; featureLeft = 0; }
      while (rng.chance(3)) rock += rng.int(-2, 3);
      const rMin = s + Math.floor(height * 0.04), rMax = s + Math.floor(height * 0.16);
      if (rock < rMin) rock = rMin; if (rock > rMax) rock = rMax;
      surface[x] = s;
      rockLine[x] = rock;
    }
    // 去除單格尖刺
    for (let x = 1; x < width - 1; x++) {
      const l = surface[x - 1], r = surface[x + 1];
      if (l === r && Math.abs(surface[x] - l) === 1) surface[x] = l;
    }
    for (let x = 0; x < width; x++) {
      const sx = surface[x], rx = rockLine[x];
      for (let y = sx; y < height; y++) {
        const i = y * width + x;
        fg[i] = y < rx ? T.DIRT : T.STONE;
        if (y >= sx + 3) wall[i] = y < rx ? W.DIRT_WALL : W.STONE_WALL;
      }
    }
  }
  let surfaceLow = height, surfaceHigh = 0, rockLow = height, rockHigh = 0;
  for (let x = 0; x < width; x++) {
    surfaceLow = Math.min(surfaceLow, surface[x]); surfaceHigh = Math.max(surfaceHigh, surface[x]);
    rockLow = Math.min(rockLow, rockLine[x]); rockHigh = Math.max(rockHigh, rockLine[x]);
  }
  world.surfaceY = Math.min(height - 1, surfaceHigh + 10);
  world.cavernY = Math.min(height - 1, rockHigh);
  world.surface.set(surface); // 洞穴挖穿前的地形地表（之後會重新量 surface，但 HUD 深度用這份）
  const bands: GenBands = { surfaceLow, surfaceHigh, rockLow, rockHigh };
  const bottom = height - 1;
  const yIn = (rng: Rng, lo: number, hi: number): number => rng.int(Math.min(lo, hi - 1), Math.max(lo + 1, hi));

  // ── Rocks in dirt / Dirt in rocks ─────────────────────────
  {
    const rng = subSeed(seed, 'rocks-in-dirt');
    for (let k = 0; k < A * 0.0012; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, surfaceHigh, rockHigh), rng.int(2, 7), rng.int(2, 23), T.STONE, { only: isRock });
    }
  }
  {
    const rng = subSeed(seed, 'dirt-in-rocks');
    for (let k = 0; k < A * 0.0008; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, rockLow, bottom), rng.int(2, 8), rng.int(2, 21), T.DIRT, { only: isRock });
    }
  }
  // ── Small holes ───────────────────────────────────────────
  {
    const rng = subSeed(seed, 'small-holes');
    for (let k = 0; k < A * 0.0005; k++) {
      const x = rng.int(0, width), y = yIn(rng, surfaceHigh + 8, bottom);
      tileRunner(world, rng, x, y, rng.int(2, 5), rng.int(2, 20), -1);
      tileRunner(world, rng, x, y, rng.int(8, 15), rng.int(7, 30), -1);
    }
  }
  // ── Dirt layer caves（長蟲洞） ─────────────────────────────
  {
    const rng = subSeed(seed, 'dirt-caves');
    for (let k = 0; k < A * 3e-5; k++) {
      const x = rng.int(0, width);
      if (inSpawnBand(x)) continue;
      tileRunner(world, rng, x, yIn(rng, surfaceHigh + 5, rockHigh), rng.int(5, 15), rng.int(30, 200), -1);
    }
  }
  // ── Rock layer caves（大洞窟） ─────────────────────────────
  {
    const rng = subSeed(seed, 'rock-caves');
    for (let k = 0; k < A * 0.00013; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, rockHigh, bottom), rng.int(6, 20), rng.int(50, 300), -1);
    }
  }
  // ── Surface caves（往下的斜坑道，避開出生帶） ─────────────
  {
    const rng = subSeed(seed, 'surface-caves');
    const n = Math.max(1, Math.floor(width * 0.004));
    for (let k = 0; k < n; k++) {
      const x = rng.int(0, width);
      if (inSpawnBand(x) || x < 30 || x > width - 30) continue;
      tileRunner(world, rng, x, surface[x], rng.int(3, 6), rng.int(20, 60), -1, { speedX: rng.range(-1, 1), speedY: 1 });
    }
  }
  // ── Sand patches（地表沙地） ───────────────────────────────
  {
    const rng = subSeed(seed, 'sand');
    const n = Math.max(1, Math.floor(width / 160));
    for (let k = 0; k < n; k++) {
      const x = rng.int(10, width - 10);
      if (inSpawnBand(x)) continue;
      const str = rng.int(10, 22);
      tileRunner(world, rng, x, surface[x] + 2, str, rng.int(4, 10), T.SAND, { speedX: rng.range(-1, 1), speedY: 0, only: (id) => id === T.DIRT });
    }
  }
  // ── Shinies（礦脈：越深越多） ─────────────────────────────
  {
    const rng = subSeed(seed, 'shinies');
    const ore = (count: number, lo: number, hi: number, s0: number, s1: number, st0: number, st1: number, type: number): void => {
      for (let k = 0; k < count; k++) {
        tileRunner(world, rng, rng.int(0, width), yIn(rng, lo, hi), rng.int(s0, s1), rng.int(st0, st1), type, { only: isRock });
      }
    };
    ore(A * 6e-5, surfaceLow, surfaceHigh + 10, 3, 6, 2, 6, T.COPPER_ORE);
    ore(A * 8e-5, surfaceHigh, rockHigh, 3, 7, 3, 7, T.COPPER_ORE);
    ore(A * 0.0002, rockLow, bottom, 4, 9, 4, 8, T.COPPER_ORE);
    ore(A * 4e-5, surfaceHigh + 10, rockHigh, 3, 6, 3, 6, T.IRON_ORE);
    ore(A * 0.00016, rockHigh, bottom, 4, 8, 4, 8, T.IRON_ORE);
  }
  // ── 重新量地表（洞穴可能挖穿地表） ───────────────────────
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height && fg[y * width + x] === T.AIR) y++;
    surface[x] = y;
  }
  // ── Grass：地表線附近、上方為空氣的泥土 ───────────────────
  for (let x = 0; x < width; x++) {
    for (let y = 1; y <= world.surfaceY; y++) {
      const i = y * width + x;
      if (fg[i] === T.DIRT && fg[i - width] === T.AIR && wall[i - width] === W.NONE) fg[i] = T.GRASS;
    }
  }
  // ── Spawn：中央欄的地表，清出 3 格寬的站立空間 ─────────────
  const sx = Math.floor(width / 2);
  const groundY = surface[sx];
  const spawn = { x: sx, y: groundY - 1 };
  for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx;
    if (fg[groundY * width + x] === T.AIR) fg[groundY * width + x] = T.DIRT;
    world.surface[x] = groundY;
    for (let dy = 1; dy <= 4; dy++) {
      const y = groundY - dy;
      if (y >= 0) fg[y * width + x] = T.AIR;
    }
  }
  // ── Trees：草地上長樹（樹幹 + 菱形樹冠），避開出生點 ─────
  {
    const rng = subSeed(seed, 'trees');
    let lastTree = -10;
    for (let x = 3; x < width - 3; x++) {
      if (x - lastTree < 4 || Math.abs(x - sx) < 5) continue;
      const gy = surface[x];
      if (gy <= 16 || gy >= height || fg[gy * width + x] !== T.GRASS) continue;
      if (!rng.chance(5)) continue;
      const h = rng.int(5, 12);
      let clear = true;
      for (let dy = 1; dy <= h + 3 && clear; dy++) {
        for (let dx = -2; dx <= 2; dx++) if (fg[(gy - dy) * width + x + dx] !== T.AIR) { clear = false; break; }
      }
      if (!clear) continue;
      for (let dy = 1; dy <= h; dy++) fg[(gy - dy) * width + x] = T.WOOD;
      const top = gy - h, r = rng.int(2, 4);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r) continue;
          const i = (top + dy) * width + x + dx;
          if (fg[i] === T.AIR) fg[i] = T.LEAVES;
        }
      }
      lastTree = x;
    }
  }
  return { world, spawn, surface, bands };
}
