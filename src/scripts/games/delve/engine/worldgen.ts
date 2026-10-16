// worldgen.ts — 確定性世界生成。每個 pass 用 subSeed(seed, passName) 取獨立亂數流。
// 只用 + − × ÷ / floor / abs 與整數雜湊，不用 Math.sin / pow 等超越函數，確保跨引擎位元一致。
// 演算法概念參考泰拉（地表 feature 隨機漫步、TileRunner 菱形筆刷、依面積縮放的 pass 數量），程式為自行重寫。
//
// Pass 順序：生態區配置 → 地形（含沙丘 / 雪峰 / 懸崖 / 突岩）→ 土石互滲、黏土、碎石 → 洞穴（小洞、蟲洞、大洞窟、
// 地表坑道）→ 花崗岩 / 大理石 → 生態區轉換（材料 + 背景牆）→ 礦脈 → 草 / 叢林草 → 出生點 → 結構（礦坑、小屋、遺跡）
// → 樹 → 地表裝飾 → 地下裝飾。
import { World, BIOME, type BiomeId } from './world';
import { Rng, subSeed } from './rng';
import { T, W, SOLID_LUT } from './tiles';
import { WORLD_W, WORLD_H } from './constants';
import { chestLoot, type ChestKind } from './loot';
import { fbm2, seedInt, vnoise1 } from './noise';

export interface GenOptions { width?: number; height?: number; }
export interface GenBands {
  surfaceLow: number; surfaceHigh: number; rockLow: number; rockHigh: number;
}
export interface BiomeSegment { biome: BiomeId; x0: number; x1: number; }
export type StructureKind = 'cabin' | 'mineshaft' | 'ruin' | 'cavern';
export interface Structure {
  kind: StructureKind;
  x: number; y: number; w: number; h: number;
  /** 大洞窟的風味 */
  flavor?: 'mushroom' | 'crystal' | 'plain';
  chest?: { x: number; y: number };
}
export interface GenResult {
  world: World;
  /** 出生 tile：玩家腳底所在格（y+1 為實心地面） */
  spawn: { x: number; y: number };
  /** 每欄地表高度（第一個實心格 y；含樹以外的所有生成） */
  surface: Int16Array;
  bands: GenBands;
  /** 非森林的生態區（由左到右） */
  biomes: BiomeSegment[];
  structures: Structure[];
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
const isOreHost = (id: number): boolean =>
  id === T.STONE || id === T.DIRT || id === T.SANDSTONE || id === T.ICE || id === T.MUD || id === T.SNOW;
const isSolid = (id: number): boolean => SOLID_LUT[id] === 1;

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
const FEATURES: Record<number, Feature[]> = {
  [BIOME.FOREST]: [0, 1, 2, 3, 4],
  [BIOME.DESERT]: [0, 0, 1, 2],
  [BIOME.SNOW]: [1, 3, 3, 2, 4, 0],
  [BIOME.JUNGLE]: [1, 2, 1, 2, 4, 3, 0],
};

/** 生態區左右配置：中央 40%–60% 一定是森林（出生地）；一側雪原、另一側叢林，沙漠隨機放在某一側。 */
function layoutBiomes(seed: string | number, width: number): BiomeSegment[] {
  const rng = subSeed(seed, 'biomes');
  const snowLeft = rng.chance(2), desertLeft = rng.chance(2);
  const segs: BiomeSegment[] = [];
  for (const left of [true, false]) {
    const r0 = left ? width * 0.03 : width * 0.6, r1 = left ? width * 0.4 : width * 0.97;
    const outer: BiomeId = left === snowLeft ? BIOME.SNOW : BIOME.JUNGLE;
    const ow = width * (outer === BIOME.SNOW ? rng.range(0.1, 0.13) : rng.range(0.12, 0.15));
    if (left === desertLeft) {
      const dw = width * rng.range(0.075, 0.1), gap = width * rng.range(0.02, 0.045);
      let a = r0 + rng.range(0, Math.max(0, r1 - r0 - ow - dw - gap));
      const order: [BiomeId, number][] = rng.chance(2) ? [[BIOME.DESERT, dw], [outer, ow]] : [[outer, ow], [BIOME.DESERT, dw]];
      for (const [b, w] of order) { segs.push({ biome: b, x0: Math.floor(a), x1: Math.floor(a + w) }); a += w + gap; }
    } else {
      const a = r0 + rng.range(0, Math.max(0, r1 - r0 - ow));
      segs.push({ biome: outer, x0: Math.floor(a), x1: Math.floor(a + ow) });
    }
  }
  return segs.filter((s) => s.x1 > s.x0).sort((p, q) => p.x0 - q.x0);
}

interface Rect { x: number; y: number; w: number; h: number; }
const overlap = (a: Rect, b: Rect, m = 0): boolean =>
  a.x - m < b.x + b.w && a.x + a.w + m > b.x && a.y - m < b.y + b.h && a.y + a.h + m > b.y;

export function generateWorld(seed: string | number, opts: GenOptions = {}): GenResult {
  const width = opts.width ?? WORLD_W;
  const height = opts.height ?? WORLD_H;
  const world = new World(width, height);
  const { fg, wall } = world;
  const A = width * height;
  const WW = width;
  const seedStr = String(seed);
  const spawnLo = Math.floor(width * 0.45), spawnHi = Math.floor(width * 0.55);
  const inSpawnBand = (x: number): boolean => x >= spawnLo && x <= spawnHi;
  const inB = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  const put = (x: number, y: number, t: number): void => { if (inB(x, y)) fg[y * WW + x] = t; };
  const get = (x: number, y: number): number => (inB(x, y) ? fg[y * WW + x] : T.STONE);
  const putWall = (x: number, y: number, t: number): void => { if (inB(x, y)) wall[y * WW + x] = t; };

  // ── 生態區 ───────────────────────────────────────────────
  const biomes = layoutBiomes(seed, width);
  const colBiome = new Uint8Array(width);
  for (const s of biomes) for (let x = Math.max(0, s.x0); x < Math.min(width, s.x1); x++) colBiome[x] = s.biome;
  const segAt = (x: number): BiomeSegment | null => biomes.find((s) => x >= s.x0 && x < s.x1) ?? null;
  /** 0 在生態區邊界、往內 n 欄升到 1 */
  const edgeFade = (s: BiomeSegment, x: number, n: number): number =>
    Math.max(0, Math.min(1, (x - s.x0) / n, (s.x1 - 1 - x) / n));

  // ── Terrain：每欄地表隨機漫步（依生態區挑 feature）+ 懸崖 ───────────
  const surface = new Int16Array(width);
  const rockLine = new Int16Array(width);
  const cliffs: { x: number; d: number }[] = [];
  const minS = Math.floor(height * 0.17), maxS = Math.floor(height * 0.27), minSnow = Math.floor(height * 0.11);
  /** 地表最高點限制：雪原內可以更高（雪峰），往邊界 90 欄內平滑過渡回一般限制，避免邊界出現垂直斷崖 */
  const loAt = (x: number, base: number): number => {
    const seg = colBiome[x] === BIOME.SNOW ? segAt(x) : null;
    return seg ? Math.round(minSnow + (base - minSnow) * (1 - edgeFade(seg, x, 90))) : base;
  };
  {
    const rng = subSeed(seed, 'terrain');
    let s = Math.floor(height * rng.int(19, 25) * 0.01);
    if (s < minS) s = minS; if (s > maxS) s = maxS;
    let feature: Feature = 0, featureLeft = 0;
    for (let x = 0; x < width; x++) {
      const b = colBiome[x];
      const central = x >= width * 0.45 && x <= width * 0.55;
      if (featureLeft <= 0) {
        const list = FEATURES[b];
        feature = central ? (rng.int(0, 3) as Feature) : list[rng.int(0, list.length)];
        if (x >= width * 0.48 && x <= width * 0.52) feature = 0;
        featureLeft = rng.int(5, 40);
        if (feature === 0) featureLeft = Math.floor(featureLeft * rng.int(5, 30) * 0.2);
        // 懸崖：森林 / 雪原 / 叢林偶爾直接落差 4–9 格（避開出生帶與生態區邊界）
        const seg = segAt(x);
        const nearEdge = seg ? Math.min(x - seg.x0, seg.x1 - x) < 18 : biomes.some((q) => Math.abs(x - q.x0) < 18 || Math.abs(x - q.x1) < 18);
        const farFromSpawn = Math.abs(x - width / 2) > width * 0.07;
        if (b !== BIOME.DESERT && farFromSpawn && !nearEdge && x > 20 && x < width - 20 && rng.chance(6)) {
          const d = rng.int(4, 10) * (rng.chance(2) ? 1 : -1);
          s += d;
          cliffs.push({ x, d });
        }
      }
      featureLeft--;
      s += surfaceOffset(rng, feature);
      if (x >= width * 0.48 && x <= width * 0.52 && x > 0 && s !== surface[x - 1]) s = surface[x - 1];
      const lo = loAt(x, minS);
      if (s < lo) { s = lo; featureLeft = 0; }
      if (s > maxS) { s = maxS; featureLeft = 0; }
      surface[x] = s;
    }
  }
  // 沙漠：抹平成和緩地面，再疊上沙丘
  {
    const rng = subSeed(seed, 'dunes');
    for (const seg of biomes) {
      if (seg.biome !== BIOME.DESERT) continue;
      const src = surface.slice(Math.max(0, seg.x0 - 8), Math.min(width, seg.x1 + 8));
      const off = Math.max(0, seg.x0 - 8);
      for (let x = Math.max(0, seg.x0); x < Math.min(width, seg.x1); x++) {
        let sum = 0, n = 0;
        for (let k = -7; k <= 7; k++) { const j = x + k - off; if (j >= 0 && j < src.length) { sum += src[j]; n++; } }
        const f = edgeFade(seg, x, 12);
        surface[x] = Math.round(src[x - off] + (sum / n - src[x - off]) * f);
      }
      const dunes = Math.max(1, Math.floor((seg.x1 - seg.x0) / 40));
      for (let k = 0; k < dunes; k++) {
        const cx = rng.range(seg.x0 + 6, seg.x1 - 6), hw = rng.int(16, 38), hh = rng.int(3, 9);
        const lean = rng.chance(2) ? 1 : -1;
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          if (x < seg.x0 || x >= seg.x1) continue;
          let t = (x - cx) / hw;
          t = t * lean > 0 ? t * 1.6 : t; // 背風面較陡
          if (t <= -1 || t >= 1) continue;
          surface[x] -= Math.round(hh * (1 - t * t) * edgeFade(seg, x, 20));
        }
      }
    }
  }
  // 雪原：疊上幾座雪峰；叢林：細碎起伏
  {
    const rng = subSeed(seed, 'peaks');
    const js = seedInt(seed, 'jungle-bumps');
    for (const seg of biomes) {
      if (seg.biome === BIOME.SNOW) {
        const n = Math.max(1, Math.floor((seg.x1 - seg.x0) / 170));
        for (let k = 0; k < n; k++) {
          const cx = rng.range(seg.x0 + (seg.x1 - seg.x0) * 0.15, seg.x1 - (seg.x1 - seg.x0) * 0.15);
          const hw = rng.int(34, 72), hh = rng.int(16, 34);
          for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
            if (x < seg.x0 || x >= seg.x1) continue;
            const t = Math.abs(x - cx) / hw;
            if (t >= 1) continue;
            surface[x] -= Math.round(hh * (1 - t) * (1 - t * 0.5) * edgeFade(seg, x, 25));
          }
        }
      } else if (seg.biome === BIOME.JUNGLE) {
        for (let x = Math.max(0, seg.x0); x < Math.min(width, seg.x1); x++) {
          surface[x] += Math.round((vnoise1(x, 7, js) - 0.5) * 7 * edgeFade(seg, x, 15));
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const lo = loAt(x, minS - 8);
      if (surface[x] < lo) surface[x] = lo;
      if (surface[x] > maxS + 6) surface[x] = maxS + 6;
    }
  }
  // 去除單格尖刺（懸崖保留）
  for (let x = 1; x < width - 1; x++) {
    const l = surface[x - 1], r = surface[x + 1];
    if (l === r && Math.abs(surface[x] - l) === 1) surface[x] = l;
  }
  {
    const rng = subSeed(seed, 'rockline');
    let rock = surface[0] + Math.floor(height * 0.1);
    for (let x = 0; x < width; x++) {
      while (rng.chance(3)) rock += rng.int(-2, 3);
      const rMin = surface[x] + Math.floor(height * 0.04), rMax = surface[x] + Math.floor(height * 0.13);
      if (rock < rMin) rock = rMin; if (rock > rMax) rock = rMax;
      rockLine[x] = rock;
    }
    for (let x = 0; x < width; x++) {
      const sx = surface[x], rx = rockLine[x];
      for (let y = Math.max(0, sx); y < height; y++) {
        const i = y * WW + x;
        fg[i] = y < rx ? T.DIRT : T.STONE;
        if (y >= sx + 3) wall[i] = y < rx ? W.DIRT_WALL : W.STONE_WALL;
      }
    }
  }
  // 突岩：懸崖高的一側往外伸出 2–4 格、3 格厚的土簷（底下是空的）
  {
    const rng = subSeed(seed, 'overhangs');
    for (const c of cliffs) {
      if (!rng.chance(2)) continue;
      const dir = c.d > 0 ? 1 : -1; // d>0：左高右低 → 往右伸
      const from = dir > 0 ? c.x : c.x - 1;
      const top = surface[from - dir];
      const len = rng.int(2, 5);
      for (let k = 0; k < len; k++) {
        const x = from + k * dir;
        if (x < 1 || x >= width - 1 || surface[x] - top < 6) break;
        for (let y = top; y < top + 3; y++) put(x, y, T.DIRT);
        surface[x] = top;
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
  world.surface.set(surface); // 洞穴挖穿前的地形地表（HUD 深度用）
  const bands: GenBands = { surfaceLow, surfaceHigh, rockLow, rockHigh };
  const bottom = height - 1;
  const cavernY = world.cavernY;
  const yIn = (rng: Rng, lo: number, hi: number): number => rng.int(Math.min(lo, hi - 1), Math.max(lo + 1, hi));

  // ── Rocks in dirt / Dirt in rocks / 黏土 / 碎石 ─────────────────
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
  {
    const rng = subSeed(seed, 'clay');
    for (let k = 0; k < A * 0.00012; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, surfaceLow, surfaceHigh + 40), rng.int(4, 10), rng.int(4, 18), T.CLAY, { only: (id) => id === T.DIRT });
    }
  }
  {
    const rng = subSeed(seed, 'gravel');
    for (let k = 0; k < A * 0.0001; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, surfaceHigh, cavernY + 80), rng.int(3, 8), rng.int(3, 14), T.GRAVEL, { only: isRock });
    }
  }
  // ── 洞穴 ─────────────────────────────────────────────────
  {
    const rng = subSeed(seed, 'small-holes');
    for (let k = 0; k < A * 0.0005; k++) {
      const x = rng.int(0, width), y = yIn(rng, surfaceHigh + 8, bottom);
      tileRunner(world, rng, x, y, rng.int(2, 5), rng.int(2, 20), -1);
      tileRunner(world, rng, x, y, rng.int(8, 15), rng.int(7, 30), -1);
    }
  }
  {
    const rng = subSeed(seed, 'dirt-caves');
    for (let k = 0; k < A * 3e-5; k++) {
      const x = rng.int(0, width);
      if (inSpawnBand(x)) continue;
      tileRunner(world, rng, x, yIn(rng, surfaceHigh + 5, rockHigh), rng.int(5, 15), rng.int(30, 200), -1);
    }
  }
  {
    const rng = subSeed(seed, 'rock-caves');
    for (let k = 0; k < A * 0.00013; k++) {
      tileRunner(world, rng, rng.int(0, width), yIn(rng, rockHigh, bottom), rng.int(6, 20), rng.int(50, 300), -1);
    }
  }
  const structures: Structure[] = [];
  {
    // 大洞窟：少數巨大空腔，各自有風味（螢光菇 / 水晶 / 普通）
    const rng = subSeed(seed, 'caverns');
    const n = Math.max(1, Math.floor(width / 420));
    for (let k = 0; k < n; k++) {
      const x = rng.int(Math.min(40, width - 1), Math.max(41, width - 40));
      const y = yIn(rng, cavernY + 40, bottom - 60);
      const str = rng.int(34, 56), steps = rng.int(30, 70);
      tileRunner(world, rng, x, y, str, steps, -1, { speedY: rng.range(-0.3, 0.3) });
      const r = Math.floor(str * 0.75);
      const f = rng.int(0, 3);
      structures.push({ kind: 'cavern', x: x - r, y: y - r, w: r * 2, h: r * 2, flavor: f === 0 ? 'mushroom' : f === 1 ? 'crystal' : 'plain' });
    }
  }
  {
    const rng = subSeed(seed, 'surface-caves');
    const n = Math.max(1, Math.floor(width * 0.004));
    for (let k = 0; k < n; k++) {
      const x = rng.int(0, width);
      if (inSpawnBand(x) || x < 30 || x > width - 30) continue;
      tileRunner(world, rng, x, surface[x], rng.int(3, 6), rng.int(20, 60), -1, { speedX: rng.range(-1, 1), speedY: 1 });
    }
  }
  // ── 花崗岩（深處）/ 大理石（岩層上段）：大塊岩體，中間常有空洞 ──────
  {
    const rng = subSeed(seed, 'granite-marble');
    const n = Math.max(1, Math.floor(width / 330));
    const rocky = (id: number): boolean => id === T.STONE || id === T.DIRT || id === T.GRAVEL;
    for (let k = 0; k < n * 2; k++) {
      const granite = k % 2 === 0;
      const x = rng.int(0, width);
      const y = granite ? yIn(rng, cavernY + Math.floor((bottom - cavernY) * 0.35), bottom - 20) : yIn(rng, rockHigh, cavernY + Math.floor((bottom - cavernY) * 0.45));
      const str = rng.int(30, 50);
      tileRunner(world, rng, x, y, str, rng.int(25, 60), granite ? T.GRANITE : T.MARBLE, { only: rocky });
      tileRunner(world, rng, x + rng.int(-20, 21), y + rng.int(-12, 13), Math.floor(str * 0.8), rng.int(20, 40), granite ? T.GRANITE : T.MARBLE, { only: rocky });
      if (rng.chance(2)) tileRunner(world, rng, x, y, Math.floor(str * 0.5), rng.int(8, 18), -1);
    }
  }
  // ── 森林的沙地 ─────────────────────────────────────────────
  {
    const rng = subSeed(seed, 'sand');
    const n = Math.max(1, Math.floor(width / 220));
    for (let k = 0; k < n; k++) {
      const x = rng.int(10, Math.max(11, width - 10));
      if (inSpawnBand(x) || colBiome[x] !== BIOME.FOREST) continue;
      tileRunner(world, rng, x, surface[x] + 2, rng.int(10, 22), rng.int(4, 10), T.SAND, { speedX: rng.range(-1, 1), speedY: 0, only: (id) => id === T.DIRT });
    }
  }
  // ── 生態區轉換：材料 + 背景牆，邊界隨深度起伏 ──────────────────
  {
    const ns = seedInt(seed, 'biome-noise');
    biomes.forEach((seg, si) => {
      const s0 = ns + si * 101;
      const bottomAt = (x: number): number => {
        if (seg.biome === BIOME.DESERT) return rockHigh + Math.floor(height * 0.1) + Math.floor(vnoise1(x, 40, s0 + 1) * 60 + vnoise1(x, 11, s0 + 7) * 16);
        if (seg.biome === BIOME.SNOW) return cavernY + Math.floor((height - cavernY) * 0.45) + Math.floor(vnoise1(x, 50, s0 + 1) * 70 + vnoise1(x, 12, s0 + 7) * 16);
        return height;
      };
      const sL = surface[Math.max(0, Math.min(width - 1, seg.x0))], sR = surface[Math.max(0, Math.min(width - 1, seg.x1 - 1))];
      for (let y = 0; y < height; y++) {
        const fl = Math.max(0.25, Math.min(1, (y - sL) / 40)), fr = Math.max(0.25, Math.min(1, (y - sR) / 40));
        // 地下沙漠往兩側變寬
        const widen = seg.biome === BIOME.DESERT ? Math.floor(Math.max(0, Math.min(26, (y - sL - 30) * 0.15))) : 0;
        // 兩個八度的邊界起伏（大彎 + 小鋸齒），越深越明顯
        const wob = (k: number): number => (vnoise1(y, 70, s0 + k) - 0.5) * 70 + (vnoise1(y, 17, s0 + k + 9) - 0.5) * 22;
        const xl = seg.x0 + Math.round(wob(2) * fl) - widen;
        const xr = seg.x1 + Math.round(wob(3) * fr) + widen;
        const J = 18; // 邊界附近逐格抖動成團塊狀（不是直線）
        for (let x = Math.max(0, xl - J); x < Math.min(width, xr + J); x++) {
          if (x < xl + J || x >= xr - J) {
            const f = x < xl + J ? fl : fr;
            const jx = x + (fbm2(x, y, 9, s0 + 11) - 0.5) * 2 * J * f;
            if (jx < xl || jx >= xr) continue;
          }
          const by = bottomAt(x);
          if (y > by + 12) continue;
          if (y > by - 12 && y - by > (fbm2(x, y, 8, s0 + 13) - 0.5) * 24) continue;
          const i = y * WW + x, t = fg[i], wl = wall[i];
          if (seg.biome === BIOME.DESERT) {
            const sandTo = surface[x] + 13 + Math.floor(vnoise1(x, 20, s0 + 4) * 10);
            if (t === T.DIRT || t === T.GRASS || t === T.STONE || t === T.CLAY || t === T.GRAVEL) {
              fg[i] = y < sandTo || fbm2(x, y, 14, s0 + 5) > 0.74 ? T.SAND : T.SANDSTONE;
            }
            if (wl) wall[i] = W.SANDSTONE_WALL;
          } else if (seg.biome === BIOME.SNOW) {
            if (t === T.DIRT || t === T.GRASS || t === T.CLAY || t === T.SAND) fg[i] = T.SNOW;
            else if ((t === T.STONE || t === T.GRAVEL) && fbm2(x, y, 16, s0 + 5) > 0.44) fg[i] = T.ICE;
            if (wl) wall[i] = y < rockLine[x] ? W.SNOW_WALL : W.ICE_WALL;
          } else {
            if (t === T.DIRT || t === T.GRASS || t === T.CLAY || t === T.SAND || t === T.GRAVEL) fg[i] = T.MUD;
            else if (t === T.STONE && fbm2(x, y, 15, s0 + 5) > 0.5) fg[i] = T.MUD;
            if (wl) wall[i] = W.MUD_WALL;
          }
        }
      }
    });
  }
  // ── Shinies（礦脈：越深越多、越好） ─────────────────────────
  {
    const rng = subSeed(seed, 'shinies');
    const ore = (count: number, lo: number, hi: number, s0: number, s1: number, st0: number, st1: number, type: number): void => {
      for (let k = 0; k < count; k++) {
        tileRunner(world, rng, rng.int(0, width), yIn(rng, lo, hi), rng.int(s0, s1), rng.int(st0, st1), type, { only: isOreHost });
      }
    };
    const goldTop = cavernY + Math.floor((bottom - cavernY) * 0.3);
    ore(A * 6e-5, surfaceLow, surfaceHigh + 10, 3, 6, 2, 6, T.COPPER_ORE);
    ore(A * 8e-5, surfaceHigh, rockHigh, 3, 7, 3, 7, T.COPPER_ORE);
    ore(A * 0.00016, rockLow, bottom, 4, 9, 4, 8, T.COPPER_ORE);
    ore(A * 4e-5, surfaceHigh + 10, rockHigh, 3, 6, 3, 6, T.IRON_ORE);
    ore(A * 0.00014, rockHigh, bottom, 4, 8, 4, 8, T.IRON_ORE);
    ore(A * 2e-5, surfaceHigh + 30, rockHigh, 3, 5, 3, 6, T.SILVER_ORE);
    ore(A * 8e-5, rockHigh, bottom, 3, 7, 3, 7, T.SILVER_ORE);
    ore(A * 7e-5, goldTop, bottom, 3, 7, 3, 7, T.GOLD_ORE);
  }
  // ── 重新量地表（洞穴可能挖穿地表） ───────────────────────
  const remeasure = (): void => {
    for (let x = 0; x < width; x++) {
      let y = 0;
      while (y < height && !isSolid(fg[y * WW + x])) y++;
      surface[x] = y;
    }
  };
  remeasure();
  // ── Grass：地表線附近、上方為空氣的泥土；泥巴外露 → 叢林草（地下也長） ──
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * WW + x, t = fg[i];
      if (t === T.DIRT) { if (y <= world.surfaceY && fg[i - WW] === T.AIR && wall[i - WW] === W.NONE) fg[i] = T.GRASS; }
      else if (t === T.MUD && fg[i - WW] === T.AIR) fg[i] = T.JUNGLE_GRASS;
    }
  }
  // ── Spawn：中央欄的地表，清出 3 格寬的站立空間 ─────────────
  const sx = Math.floor(width / 2);
  const groundY = surface[sx];
  const spawn = { x: sx, y: groundY - 1 };
  for (let dx = -1; dx <= 1; dx++) {
    const x = sx + dx;
    if (fg[groundY * WW + x] === T.AIR) fg[groundY * WW + x] = T.DIRT;
    world.surface[x] = groundY;
    for (let dy = 1; dy <= 4; dy++) {
      const y = groundY - dy;
      if (y >= 0) fg[y * WW + x] = T.AIR;
    }
  }
  const occupied: Rect[] = [{ x: sx - 60, y: 0, w: 120, h: groundY + 70 }];
  const free = (r: Rect, m = 3): boolean => r.x >= 2 && r.y >= 2 && r.x + r.w < width - 2 && r.y + r.h < height - 2
    && !occupied.some((o) => overlap(o, r, m));
  const depthFrac = (x: number, y: number): number => {
    const s = world.surfaceAt(x);
    return Math.max(0, Math.min(1, (y - s) / Math.max(1, height - s)));
  };
  const addChest = (x: number, y: number, kind: ChestKind): void => {
    put(x, y, T.CHEST);
    world.chests.set(y * WW + x, chestLoot(seedStr, x, y, kind, depthFrac(x, y)));
  };

  // ── 礦坑：水平坑道 + 每 6 格一組木框（橫樑 + 兩根柱）+ 火把；一半有斜坡通往地表 ──
  {
    const rng = subSeed(seed, 'mineshafts');
    const n = Math.max(1, Math.round(width / 550));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 6; tries++) {
        const len = rng.int(50, 140);
        const x0 = rng.int(60, Math.max(61, width - len - 60));
        const yTop = surface[Math.min(width - 1, x0)] + rng.int(28, 130);
        const r: Rect = { x: x0, y: yTop - 1, w: len, h: 6 };
        if (yTop + 6 >= height - 4 || !free(r, 4)) continue;
        for (let x = x0; x < x0 + len; x++) {
          for (let y = yTop; y < yTop + 4; y++) { put(x, y, T.AIR); if (!wall[y * WW + x]) putWall(x, y, W.DIRT_WALL); }
          if (!isSolid(get(x, yTop + 4))) put(x, yTop + 4, T.PLANKS);
          if (!isSolid(get(x, yTop - 1))) put(x, yTop - 1, T.PLANKS);
        }
        let frame = 0;
        for (let fx = x0 + 2; fx < x0 + len - 2; fx += 6, frame++) {
          const broken = rng.chance(6);
          if (!broken) for (let dx = -1; dx <= 1; dx++) put(fx + dx, yTop, T.PLANKS);
          for (let y = broken ? yTop : yTop + 1; y < yTop + 4; y++) { put(fx - 1, y, T.BEAM); put(fx + 1, y, T.BEAM); }
          if (!broken && frame % 3 === 1) put(fx, yTop + 1, T.TORCH);
        }
        const st: Structure = { kind: 'mineshaft', x: x0, y: yTop - 1, w: len, h: 6 };
        if (rng.chance(2)) {
          let cx = x0 + 4 + rng.int(0, Math.max(1, len - 8));
          while (get(cx, yTop + 3) !== T.AIR && cx < x0 + len - 1) cx++;
          if (get(cx, yTop + 3) === T.AIR && isSolid(get(cx, yTop + 4))) { addChest(cx, yTop + 3, 'mineshaft'); st.chest = { x: cx, y: yTop + 3 }; }
        }
        occupied.push(r);
        // 入口斜坡：從坑道左端往左上每欄升一格（可走上走下）
        if (rng.chance(2) && yTop - surface[x0] < 100) {
          const stair: Rect = { x: x0 - (yTop - surface[x0]) - 6, y: surface[x0] - 6, w: yTop - surface[x0] + 6, h: yTop - surface[x0] + 6 };
          if (free(stair, 1)) {
            for (let s = 1; s < 160; s++) {
              const x = x0 - s, feet = yTop + 3 - s;
              if (x < 2) break;
              for (let y = feet - 3; y <= feet; y++) put(x, y, T.AIR);
              if (!isSolid(get(x, feet + 1))) put(x, feet + 1, T.PLANKS);
              if (feet - 3 < surface[x] - 1) break;
            }
            occupied.push(stair);
          }
        }
        structures.push(st);
        break;
      }
    }
  }
  // ── 廢棄小屋：木板外殼 + 木板牆 + 工作台 + 箱子 + 火把，兩側門口接一小段坑道 ──
  {
    const rng = subSeed(seed, 'cabins');
    const n = Math.max(1, Math.round(width / 260));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 6; tries++) {
        const w = rng.int(9, 16), h = rng.int(6, 9);
        const x = rng.int(40, Math.max(41, width - 40 - w));
        const y = yIn(rng, surface[x] + 26, height - 40);
        const r: Rect = { x, y, w, h };
        if (y + h >= height - 6 || !free(r, 5)) continue;
        const floorY = y + h - 1;
        // 先挖兩側通道（之後蓋屋子，避免坑道反過來挖壞屋子）
        tileRunner(world, rng, x - 3, floorY - 2, rng.int(4, 6), rng.int(14, 30), -1, { speedX: -1, speedY: rng.range(-0.3, 0.3) });
        tileRunner(world, rng, x + w + 2, floorY - 2, rng.int(4, 6), rng.int(14, 30), -1, { speedX: 1, speedY: rng.range(-0.3, 0.3) });
        for (let yy = y; yy < y + h; yy++) {
          for (let xx = x; xx < x + w; xx++) {
            const border = yy === y || yy === floorY || xx === x || xx === x + w - 1;
            put(xx, yy, border ? T.PLANKS : T.AIR);
            putWall(xx, yy, W.PLANK_WALL);
          }
        }
        for (const dx of [x, x + w - 1]) for (let yy = floorY - 3; yy < floorY; yy++) put(dx, yy, T.AIR);
        // 年久失修：屋頂 / 牆缺幾塊（地板保留）
        for (let xx = x + 1; xx < x + w - 1; xx++) if (rng.chance(9)) put(xx, y, T.AIR);
        for (let yy = y + 1; yy < floorY - 3; yy++) for (const dx of [x, x + w - 1]) if (rng.chance(6)) put(dx, yy, T.AIR);
        const inside = floorY - 1;
        const bx = rng.int(x + 2, x + w - 3);
        put(bx, inside, T.WORKBENCH);
        let cx = rng.int(x + 2, x + w - 2);
        if (Math.abs(cx - bx) < 2) cx = bx + 2 < x + w - 1 ? bx + 2 : bx - 2;
        addChest(cx, inside, 'cabin');
        const tx = rng.chance(2) ? x + 1 : x + w - 2;
        put(tx, y + 1, T.TORCH);
        for (const qx of [x + 1, x + w - 2]) if (get(qx, y + 1) === T.AIR && rng.chance(2)) put(qx, y + 1, T.COBWEB);
        if (rng.chance(2)) {
          const px = rng.int(x + 1, x + w - 1);
          if (get(px, inside) === T.AIR) put(px, inside, T.POT);
        }
        occupied.push(r);
        structures.push({ kind: 'cabin', x, y, w, h, chest: { x: cx, y: inside } });
        break;
      }
    }
  }
  // ── 地表遺跡：石磚殘屋（一側坍塌）+ 箱子 + 陶罐 ─────────────
  {
    const rng = subSeed(seed, 'ruins');
    const n = Math.max(1, Math.round(width / 2000));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const w = rng.int(12, 19), h = rng.int(7, 10);
        const x = rng.int(30, Math.max(31, width - 30 - w));
        if (Math.abs(x + w / 2 - width / 2) < width * 0.05) continue;
        const b = colBiome[x];
        if (b === BIOME.SNOW || b !== colBiome[Math.min(width - 1, x + w)]) continue;
        let sum = 0;
        for (let xx = x; xx < x + w; xx++) sum += surface[xx];
        const base = Math.round(sum / w);
        const r: Rect = { x, y: base - h - 2, w, h: h + 4 };
        let rough = 0;
        for (let xx = x; xx < x + w; xx++) rough = Math.max(rough, Math.abs(surface[xx] - base));
        if (rough > 5 || !free(r, 4)) continue;
        const fill = b === BIOME.DESERT ? T.SAND : b === BIOME.JUNGLE ? T.MUD : T.DIRT;
        for (let xx = x - 1; xx <= x + w; xx++) {
          for (let yy = base - h - 2; yy < base; yy++) put(xx, yy, T.AIR);
          for (let yy = base; yy < base + 6; yy++) if (!isSolid(get(xx, yy))) put(xx, yy, fill);
        }
        const roof = base - h;
        const breakAt = x + Math.floor(w * rng.range(0.45, 0.7));
        for (let xx = x; xx < x + w; xx++) {
          put(xx, base, T.STONE_BRICK);
          // 坍塌側：高度往右遞減
          const keep = xx < breakAt ? h : Math.max(1, Math.floor(h * (1 - (xx - breakAt + 1) / (x + w - breakAt + 1))) - rng.int(0, 3));
          for (let yy = base - 1; yy >= roof; yy--) {
            const level = base - yy;
            if (level > keep) break;
            const shell = xx === x || xx === x + w - 1 || yy === roof;
            if (shell && !(xx === x && yy >= base - 3 && yy < base)) {
              if (!rng.chance(8)) put(xx, yy, T.STONE_BRICK);
            }
            if (!shell && rng.next() < 0.8) putWall(xx, yy, W.STONE_WALL);
          }
        }
        const cx = x + 2 + rng.int(0, Math.max(1, Math.floor(w / 2) - 2));
        addChest(cx, base - 1, 'ruin');
        for (let p = 0; p < 2; p++) {
          const px = rng.int(x + 1, x + w - 1);
          if (get(px, base - 1) === T.AIR) put(px, base - 1, T.POT);
        }
        occupied.push(r);
        structures.push({ kind: 'ruin', x, y: roof, w, h: h + 1, chest: { x: cx, y: base - 1 } });
        break;
      }
    }
  }
  remeasure();

  // ── Trees：森林闊葉樹、雪原松樹、叢林大樹（樹幹 + 菱形樹葉格，外觀由 render 依地面挑） ──
  {
    const rng = subSeed(seed, 'trees');
    let lastTree = -10;
    for (let x = 3; x < width - 3; x++) {
      const gy = surface[x];
      if (gy <= 4 || gy >= height) continue;
      const ground = fg[gy * WW + x];
      const jungle = ground === T.JUNGLE_GRASS, snow = ground === T.SNOW;
      if (ground !== T.GRASS && !jungle && !snow) continue;
      const gap = jungle ? 7 : 4;
      if (x - lastTree < gap || Math.abs(x - sx) < 5) continue;
      if (!rng.chance(jungle ? 3 : snow ? 4 : 5)) continue;
      const h = jungle ? rng.int(11, 21) : snow ? rng.int(7, 15) : rng.int(5, 12);
      const r = jungle ? rng.int(4, 7) : snow ? rng.int(2, 4) : rng.int(2, 4);
      if (gy - h - r - 2 < 1) continue;
      let clear = true;
      for (let dy = 1; dy <= h + 3 && clear; dy++) {
        for (let dx = -2; dx <= 2; dx++) if (fg[(gy - dy) * WW + x + dx] !== T.AIR) { clear = false; break; }
      }
      if (!clear) continue;
      for (let dy = 1; dy <= h; dy++) fg[(gy - dy) * WW + x] = T.WOOD;
      const top = gy - h;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r) continue;
          const xx = x + dx, yy = top + dy;
          if (inB(xx, yy) && fg[yy * WW + xx] === T.AIR) fg[yy * WW + xx] = T.LEAVES;
        }
      }
      lastTree = x;
    }
  }
  // ── 地表裝飾：花草、蘑菇、石頭、灌木、南瓜 / 仙人掌、枯枝 / 雪灌木 / 蕨類 ──
  {
    const rng = subSeed(seed, 'surface-decor');
    let lastCactus = -10;
    for (let x = 1; x < width - 1; x++) {
      const gy = surface[x];
      if (gy < 2 || gy >= height) continue;
      const ground = fg[gy * WW + x], ai = (gy - 1) * WW + x;
      if (fg[ai] !== T.AIR) continue;
      const r = rng.next();
      let d = -1;
      if (ground === T.GRASS) {
        d = r < 0.24 ? T.TALL_GRASS : r < 0.32 ? T.FLOWER : r < 0.34 ? T.MUSHROOM : r < 0.355 ? T.SMALL_ROCK
          : r < 0.39 ? T.BUSH : r < 0.397 ? T.PUMPKIN : -1;
      } else if (ground === T.SAND && colBiome[x] === BIOME.DESERT) {
        if (r < 0.08 && x - lastCactus > 5) {
          const hc = rng.int(2, 6);
          let ok = true;
          for (let k = 1; k <= hc; k++) if (get(x, gy - k) !== T.AIR) ok = false;
          if (ok) { for (let k = 1; k <= hc; k++) put(x, gy - k, T.CACTUS); lastCactus = x; }
          continue;
        }
        d = r < 0.2 ? T.DEAD_BUSH : r < 0.22 ? T.SMALL_ROCK : -1;
      } else if (ground === T.SNOW) {
        d = r < 0.07 ? T.SNOW_SHRUB : r < 0.085 ? T.SMALL_ROCK : -1;
      } else if (ground === T.JUNGLE_GRASS) {
        d = r < 0.24 ? T.FERN : r < 0.34 ? T.TALL_GRASS : r < 0.38 ? T.FLOWER : r < 0.39 ? T.MUSHROOM : r < 0.44 ? T.BUSH : -1;
      } else if (ground === T.SAND) {
        d = r < 0.04 ? T.SMALL_ROCK : -1;
      }
      if (d >= 0) fg[ai] = d;
    }
  }
  // ── 地下裝飾：陶罐、石筍 / 鐘乳石、螢光菇、水晶、藤蔓、蜘蛛網 ──────
  {
    const rng = subSeed(seed, 'underground-decor');
    const caverns = structures.filter((s) => s.kind === 'cavern' && s.flavor !== 'plain');
    const flavorAt = (x: number, y: number): 'mushroom' | 'crystal' | null => {
      for (const c of caverns) {
        const r = c.w / 2 + 10, dx = x - (c.x + c.w / 2), dy = y - (c.y + c.h / 2);
        if (dx * dx + dy * dy < r * r) return c.flavor === 'mushroom' ? 'mushroom' : 'crystal';
      }
      return null;
    };
    const deep = cavernY + Math.floor((bottom - cavernY) * 0.25);
    const stony = (t: number): boolean => t === T.STONE || t === T.GRANITE || t === T.MARBLE || t === T.ICE || t === T.SANDSTONE || t === T.GRAVEL;
    const jungly = (t: number): boolean => t === T.MUD || t === T.JUNGLE_GRASS;
    for (let y = 2; y < height - 2; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * WW + x;
        if (fg[i] !== T.AIR || y <= surface[x] + 1) continue;
        const below = fg[i + WW], above = fg[i - WW];
        const floor = isSolid(below), ceil = isSolid(above);
        if (!floor && !ceil) continue;
        const fl = y > cavernY - 40 ? flavorAt(x, y) : null;
        const r = rng.next();
        if (floor) {
          if (fl === 'mushroom' && r < 0.3) { fg[i] = T.GLOW_MUSHROOM; continue; }
          if (fl === 'crystal' && r < 0.12) { fg[i] = T.CRYSTAL; continue; }
          if (jungly(below)) { if (r < 0.12) fg[i] = T.FERN; else if (r < 0.135 && y > surface[x] + 12) fg[i] = T.POT; continue; }
          if (y > surface[x] + 12 && r < 0.012) { fg[i] = T.POT; continue; }
          if (stony(below) && r < 0.04) { fg[i] = T.STALAGMITE; continue; }
          if (y > cavernY && r > 0.988) { fg[i] = T.GLOW_MUSHROOM; continue; }
          if (y > deep && r > 0.984 && r <= 0.988) { fg[i] = T.CRYSTAL; continue; }
        } else {
          if (fl === 'crystal' && r < 0.1) { fg[i] = T.CRYSTAL; continue; }
          if (jungly(above) && r < 0.24) {
            const len = rng.int(2, 8);
            for (let k = 0; k < len && fg[i + k * WW] === T.AIR && y + k < height - 2; k++) fg[i + k * WW] = T.VINE;
            continue;
          }
          if (stony(above) && r < 0.045) { fg[i] = T.STALACTITE; continue; }
          if (y < cavernY + 120 && (isSolid(fg[i - 1]) || isSolid(fg[i + 1])) && r > 0.93) { fg[i] = T.COBWEB; continue; }
        }
      }
    }
  }
  remeasure();
  // ── 每欄地表的生態區 ──────────────────────────────────────
  world.biome.set(colBiome);
  return { world, spawn, surface, bands, biomes, structures };
}
