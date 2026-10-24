// worldgen.ts — 確定性世界生成。每個 pass 用 subSeed(seed, passName) 取獨立亂數流。
// 只用 + − × ÷ / floor / abs 與整數雜湊，不用 Math.sin / pow 等超越函數，確保跨引擎位元一致。
// 演算法：地表 feature 隨機漫步、TileRunner 菱形筆刷、依面積縮放的 pass 數量（程式為自行撰寫）。
//
// Pass 順序：生態區配置 → 地形（沙丘 / 雪峰 / 大山塊 / 乾湖床 / 懸崖 / 突岩）→ 深度層（泥土層厚度起伏、岩層、
// 洞穴層深層岩、熔岩深淵）→ 土石互滲、黏土、碎石 → 洞穴系統（義大利麵隧道、柏林蟲、長水平廊道、洞穴層大洞窟網路
// + 連通、巨大洞室、熔岩深淵開闊帶、少量小洞、地表坑道 / 裂谷 / 天坑）→ 花崗岩 / 大理石 → 生態區轉換（有機形狀：
// 沙漠淚滴、雪原往下收窄成冰洞、叢林鼓起再收）→ 迷你生態區 → 礦脈群 → 熔岩深淵細節 → 草 → 出生點 → 結構
// （礦坑、小屋、遺跡、地城）→ 樹 → 地表裝飾 → 地下裝飾 → 浮空島 → 珍寶 / 古碑 → 液體（生成器 v5，見 gen/liquids.ts：
// 湖 / 池塘 / 綠洲 / 地下湖 / 熔岩囊與熔岩湖 / 叢林蜂巢，最後靜置）。
import { BIOME, type BiomeId } from '../world';
import { GenGrid } from './gen/grid';
import { Rng, subSeed } from '../rng';
import { T, W, SOLID_LUT, DUNGEON_COLORS } from '../tiles';
import { WORLD_W, WORLD_H } from '../constants';
import { chestLoot, type ChestKind } from '../loot';
import { FbmField, NoiseField, fbm2, seedInt, vnoise1 } from '../noise';
import { carveChamber, carveNetwork, carveNoiseTunnels, perlinWorm, carveDisc, paintBlob, noisePockets, fillTinyPockets } from './gen/caves';
import { generateDungeon } from './gen/dungeon';
import { createLiquidGen, type LiquidGenStats } from './gen/liquids';
import { placeVillages, placeDwarfHalls } from './gen/settlements';
import { placeLandmarks } from './gen/landmarks';
import { gridCanvas } from './gen/gridCanvas';
import { drawMineshaft, drawRamp, drawSecretRoom, secretRoomLayout, SECRET_RH } from '../gen2/draw/mineshaft';
import { drawSkyIsland, SKY_HH } from '../gen2/draw/skyIsland';
import type { BiomeSegment, Structure, Landform, LandformType, ReservedZone, GenLayers, GenRelic, DungeonInfo, VillageInfo, HallInfo, LandmarkInfo } from '../genTypes';
import type { SpringSpec } from '../liquid';
import { LORE_SITES, type LoreSite } from '../lore';
import type { ItemId } from '../items';
import type { Stack } from '../inventory';

export interface GenOptions {
  width?: number; height?: number;
  /** 世界一建立就交給呼叫端（生成畫面的地層剖面用來邊生成邊取樣；不影響生成結果） */
  peek?: (world: GenGrid) => void;
}
export interface GenBands {
  surfaceLow: number; surfaceHigh: number; rockLow: number; rockHigh: number;
}
export interface GenResult {
  world: GenGrid;
  /** 出生 tile：玩家腳底所在格（y+1 為實心地面） */
  spawn: { x: number; y: number };
  /** 每欄地表高度（第一個實心格 y；含樹以外的所有生成） */
  surface: Int16Array;
  bands: GenBands;
  /** 非森林的生態區（由左到右） */
  biomes: BiomeSegment[];
  structures: Structure[];
  /** 地形分段（由左到右、連續覆蓋整個世界） */
  landforms: Landform[];
  /** 地城預留區：靠一側海灘內側，生態區與結構都避開 */
  dungeonZone: ReservedZone;
  /** 每欄深度層分界 */
  layers: GenLayers;
  /** 地城（房間圖、門、鑰匙、寶箱）；世界太小放不下時 null */
  dungeon: DungeonInfo | null;
  /** 所有古碑（含地城裡的）：id = 碑文編號（lore.ts） */
  tablets: { x: number; y: number; id: number }[];
  /** 放在難到達處的珍寶（獨特道具）箱子 */
  relics: GenRelic[];
  /** 液體 pass 的統計（耗時 / 靜置刻數 / 各液體格數） */
  liquidStats: LiquidGenStats;
  /** 泉水（瀑布的無限源；liquid.ts LiquidSim.setSprings） */
  springs: SpringSpec[];
  /** 地表村落（房子 / 委託板位置；engine/folk.ts 安排村民） */
  villages: VillageInfo[];
  /** 矮人地廳 */
  halls: HallInfo[];
  /** 每個發現地點的地標物件（一次性發現物） */
  landmarks: LandmarkInfo[];
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
  world: GenGrid, rng: Rng, x: number, y: number, strength: number, steps: number,
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
      // 邊緣抖動：每列一個（逐格抽亂數太慢；每列抖動已足夠讓邊緣參差）
      const lim = half * (1 + rng.int(-10, 11) * 0.015) - dy;
      const lx0 = Math.max(x0, Math.ceil(px - lim)), lx1 = Math.min(x1, Math.floor(px + lim));
      for (let tx = lx0; tx <= lx1; tx++) {
        if (Math.abs(tx - px) >= lim) continue;
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
  id === T.STONE || id === T.DIRT || id === T.SANDSTONE || id === T.ICE || id === T.MUD || id === T.SNOW
  || id === T.DEEP_STONE || id === T.BASALT;
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
const LF_FEATURES: Record<LandformType, Feature[]> = {
  plains: [0, 0, 0, 1, 2], hills: [1, 2, 1, 2, 0], mountains: [3, 3, 1, 4, 2], valley: [2, 4, 2, 0, 1],
  dunes: [0, 0, 1, 2], mesa: [0, 0, 1, 2], frozen_lake: [0, 1, 2], swamp: [0, 0, 2, 1], reserved: [0, 0, 0],
};
/** 遇到 feature 切換時出現懸崖的機率（1/n；0 = 不會） */
const LF_CLIFF: Record<LandformType, number> = {
  plains: 0, hills: 9, mountains: 4, valley: 5, dunes: 0, mesa: 0, frozen_lake: 0, swamp: 0, reserved: 0,
};
/** 森林：山比較少（6 段裡 1 段），但每座都是大山塊 */
const LF_BY_BIOME: Record<number, LandformType[]> = {
  [BIOME.FOREST]: ['plains', 'hills', 'valley', 'plains', 'hills', 'mountains'],
  [BIOME.DESERT]: ['dunes', 'mesa'],
  [BIOME.SNOW]: ['mountains', 'hills', 'frozen_lake'],
  [BIOME.JUNGLE]: ['hills', 'swamp'],
};

/** 地形分段：在生態區邊界、出生帶、地城預留區處切開，再把每段切成 90–380 欄的小段，各自挑地形 */
function layoutLandforms(seed: string | number, width: number, colBiome: Uint8Array,
  cuts: number[], fixed: (x0: number, x1: number) => LandformType | null): Landform[] {
  const rng = subSeed(seed, 'landforms');
  const pts = [...new Set([0, width, ...cuts.filter((c) => c > 0 && c < width).map(Math.floor)])].sort((a, b) => a - b);
  const out: Landform[] = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    if (b <= a) continue;
    const f = fixed(a, b);
    if (f) { out.push({ type: f, x0: a, x1: b }); continue; }
    const biome = colBiome[Math.floor((a + b) / 2)];
    const list = [...LF_BY_BIOME[biome]];
    for (let i = list.length - 1; i > 0; i--) { const j = rng.int(0, i + 1); [list[i], list[j]] = [list[j], list[i]]; }
    const small = biome !== BIOME.FOREST;
    let x = a, n = 0;
    while (x < b) {
      let len = small ? rng.int(90, 170) : rng.int(140, 380);
      if (b - (x + len) < (small ? 60 : 90)) len = b - x;
      out.push({ type: list[n % list.length], x0: x, x1: x + len });
      x += len; n++;
    }
  }
  return out;
}

/** 生態區左右配置：中央 40%–60% 一定是森林（出生地）；一側雪原、另一側叢林，沙漠隨機放在某一側。 */
function layoutBiomes(seed: string | number, width: number, leftStart = 0.03, rightEnd = 0.97): BiomeSegment[] {
  const rng = subSeed(seed, 'biomes');
  const snowLeft = rng.chance(2), desertLeft = rng.chance(2);
  const segs: BiomeSegment[] = [];
  for (const left of [true, false]) {
    const r0 = left ? width * leftStart : width * 0.6, r1 = left ? width * 0.4 : width * rightEnd;
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

/** generateWorldSteps 會 yield 幾段（進度條分母） */
export const GEN_STAGE_COUNT = 41;

/** 一次生成整個世界 */
export function generateWorld(seed: string | number, opts: GenOptions = {}): GenResult {
  const it = generateWorldSteps(seed, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

/**
 * 分段生成：每完成一段 pass 就 yield 那段的名字（共 GEN_STAGE_COUNT 段），最後 return 結果。
 * 標題畫面用它在段與段之間讓出主執行緒、畫生成進度；結果與 generateWorld 逐格相同。
 */
export function* generateWorldSteps(seed: string | number, opts: GenOptions = {}): Generator<string, GenResult, void> {
  // 效能剖析（globalThis.__delveGenProfile = {} 時記錄每段 pass 的毫秒數；平常是 no-op）
  const prof = (globalThis as { __delveGenProfile?: Record<string, number> }).__delveGenProfile;
  let tMark = prof ? performance.now() : 0, lastMark = 'setup';
  const mark = (name: string): void => {
    if (!prof) return;
    const t = performance.now();
    prof[lastMark] = (prof[lastMark] ?? 0) + t - tMark;
    tMark = t; lastMark = name;
  };
  const width = opts.width ?? WORLD_W;
  const height = opts.height ?? WORLD_H;
  const world = new GenGrid(width, height);
  opts.peek?.(world);
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

  mark('海灘 + 地城預留區（一');
  yield '海灘 + 地城預留區（一';
  // ── 海灘 + 地城預留區（一側海灘內側） ─────────────────────────
  const beachW = Math.max(4, Math.round(width * 0.015));
  const dungeonLeft = subSeed(seed, 'dungeon').chance(2);
  const dzW = Math.max(8, Math.round(width * 0.1));
  const dzX0 = dungeonLeft ? beachW + 4 : width - beachW - 4 - dzW, dzX1 = dzX0 + dzW;
  const inDz = (x: number, m = 0): boolean => x >= dzX0 - m && x < dzX1 + m;
  mark('生態區 ────────');
  yield '生態區 ────────';
  // ── 生態區 ───────────────────────────────────────────────
  const biomes = layoutBiomes(seed, width,
    dungeonLeft ? (dzX1 + width * 0.012) / width : 0.03, dungeonLeft ? 0.97 : (dzX0 - width * 0.012) / width);
  const colBiome = new Uint8Array(width);
  for (const s of biomes) for (let x = Math.max(0, s.x0); x < Math.min(width, s.x1); x++) colBiome[x] = s.biome;
  const segAt = (x: number): BiomeSegment | null => biomes.find((s) => x >= s.x0 && x < s.x1) ?? null;
  const spawnLf0 = Math.floor(width * 0.44), spawnLf1 = Math.ceil(width * 0.56);
  const landforms = layoutLandforms(seed, width, colBiome,
    [...biomes.flatMap((s) => [s.x0, s.x1]), spawnLf0, spawnLf1, dzX0, dzX1],
    (a, b) => (a >= dzX0 && b <= dzX1 ? 'reserved' : a >= spawnLf0 && b <= spawnLf1 ? 'plains' : null));
  const lfOf = new Uint8Array(width);
  landforms.forEach((l, i) => { for (let x = l.x0; x < l.x1; x++) lfOf[x] = i; });
  const lfAt = (x: number): Landform => landforms[lfOf[Math.max(0, Math.min(width - 1, x))]];
  /** 0 在生態區邊界、往內 n 欄升到 1 */
  const edgeFade = (s: BiomeSegment, x: number, n: number): number =>
    Math.max(0, Math.min(1, (x - s.x0) / n, (s.x1 - 1 - x) / n));

  mark('Terrain：每欄地表');
  yield 'Terrain：每欄地表';
  // ── Terrain：每欄地表隨機漫步（依生態區挑 feature）+ 懸崖 ───────────
  const surface = new Int16Array(width);
  const rockLine = new Int16Array(width);
  const cliffs: { x: number; d: number }[] = [];
  const lakes: { x0: number; x1: number; level: number }[] = [];
  const lakeBeds: { x0: number; x1: number; level: number }[] = [];
  const sinks: { x: number; r: number; depth: number }[] = [];
  const minS = Math.floor(height * 0.17), maxS = Math.floor(height * 0.27), minSnow = Math.floor(height * 0.11);
  /** 地表最高點限制：雪原內可以更高（雪峰），往邊界 90 欄內平滑過渡回一般限制，避免邊界出現垂直斷崖 */
  const loAt = (x: number, base: number): number => {
    const seg = colBiome[x] === BIOME.SNOW ? segAt(x) : null;
    return seg ? Math.round(minSnow + (base - minSnow) * (1 - edgeFade(seg, x, 90))) : base;
  };
  (() => { // 獨立函式：generateWorld 太大不會被最佳化編譯，熱迴圈要放在自己的函式裡
    const rng = subSeed(seed, 'terrain');
    let s = Math.floor(height * rng.int(19, 25) * 0.01);
    if (s < minS) s = minS; if (s > maxS) s = maxS;
    let feature: Feature = 0, featureLeft = 0;
    for (let x = 0; x < width; x++) {
      const lf = lfAt(x);
      const central = x >= width * 0.45 && x <= width * 0.55;
      if (featureLeft <= 0) {
        const list = LF_FEATURES[lf.type];
        feature = central ? (rng.int(0, 3) as Feature) : list[rng.int(0, list.length)];
        if (x >= width * 0.48 && x <= width * 0.52) feature = 0;
        featureLeft = rng.int(5, 40);
        if (feature === 0) featureLeft = Math.floor(featureLeft * rng.int(5, 30) * 0.2);
        // 懸崖：森林 / 雪原 / 叢林偶爾直接落差 4–9 格（避開出生帶與生態區邊界）
        const seg = segAt(x);
        const nearEdge = seg ? Math.min(x - seg.x0, seg.x1 - x) < 18 : biomes.some((q) => Math.abs(x - q.x0) < 18 || Math.abs(x - q.x1) < 18);
        const farFromSpawn = Math.abs(x - width / 2) > width * 0.07;
        const cliffN = LF_CLIFF[lf.type];
        const nearLfEdge = Math.min(x - lf.x0, lf.x1 - x) < 12;
        if (cliffN && farFromSpawn && !nearEdge && !nearLfEdge && x > 20 && x < width - 20 && rng.chance(cliffN)) {
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
  })();
  // 沙漠：抹平成和緩地面，再疊上沙丘
  (() => {
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
      // 平頂方山（mesa 段）：階梯狀陡壁 + 完全平的頂
      for (const lf of landforms) {
        if (lf.type !== 'mesa' || lf.x0 < seg.x0 || lf.x1 > seg.x1) continue;
        const len = lf.x1 - lf.x0;
        for (let m = 0; m < (len > 150 ? 2 : 1); m++) {
          const mw = rng.int(Math.min(30, len - 24), Math.max(31, Math.min(90, len - 20)));
          const mx0 = lf.x0 + 10 + rng.int(0, Math.max(1, len - mw - 20)), mh = rng.int(14, 27);
          let top = height;
          for (let x = mx0; x < mx0 + mw; x++) top = Math.min(top, surface[x]);
          top -= mh;
          for (let x = mx0; x < mx0 + mw; x++) {
            const d = Math.min(x - mx0, mx0 + mw - 1 - x);
            const lift = d >= 6 ? 1 : d >= 4 ? 0.82 : d >= 2 ? 0.55 : 0.25;
            surface[x] = Math.min(surface[x], Math.round(surface[x] + (top - surface[x]) * lift));
          }
        }
      }
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
  })();
  // 雪原：疊上幾座雪峰；叢林：細碎起伏
  (() => {
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
    // 叢林沼澤低地：整段下沉、抹平，只留小土丘
    for (const lf of landforms) {
      if (lf.type !== 'swamp') continue;
      const low = rng.int(9, 17), src = surface.slice(lf.x0, lf.x1);
      for (let x = lf.x0; x < lf.x1; x++) {
        let sum = 0, n = 0;
        for (let k = -5; k <= 5; k++) { const j = x + k - lf.x0; if (j >= 0 && j < src.length) { sum += src[j]; n++; } }
        const f = Math.max(0, Math.min(1, (x - lf.x0) / 30, (lf.x1 - 1 - x) / 30));
        surface[x] = Math.round(src[x - lf.x0] + (sum / n + low - src[x - lf.x0]) * f + (vnoise1(x, 6, js + 3) - 0.6) * 4 * f);
      }
    }
    for (let x = 0; x < width; x++) {
      const lo = loAt(x, minS - 8);
      const hiLim = lfAt(x).type === 'swamp' ? maxS + 22 : maxS + 6;
      if (surface[x] < lo) surface[x] = lo;
      if (surface[x] > hiLim) surface[x] = hiLim;
    }
    // 大山塊：森林 / 雪原的 mountains 段疊一座寬而高的山（稜線帶雜訊鋸齒），比隨機漫步的小山大得多
    const ms = seedInt(seed, 'massif');
    for (const lf of landforms) {
      if (lf.type !== 'mountains') continue;
      const len = lf.x1 - lf.x0;
      if (len < 70) continue;
      const hw = Math.min(Math.floor(len / 2) - 6, rng.int(60, 120)), hh = rng.int(38, 72);
      const cx = lf.x0 + Math.floor(len / 2) + rng.int(-Math.floor(len / 8), Math.floor(len / 8) + 1);
      const lean = rng.range(-0.25, 0.25);
      for (let x = cx - hw; x <= cx + hw; x++) {
        if (x < 1 || x >= width - 1) continue;
        let t = (x - cx) / hw;
        t = t < 0 ? t * (1 - lean) : t * (1 + lean);
        const a = Math.abs(t);
        if (a >= 1) continue;
        const body = (1 - a) * (1 - a * 0.35);
        const ridge = (vnoise1(x, 9, ms) - 0.5) * 7 * body + (vnoise1(x, 23, ms + 1) - 0.5) * 10 * body;
        const fade = Math.min(1, (1 - a) * 4);
        surface[x] = Math.max(minSnow - 12, Math.round(surface[x] - (hh * body + ridge) * fade));
      }
    }
    // 結冰湖：雪原 frozen_lake 段挖一個碗，之後填成平的冰面
    for (const lf of landforms) {
      if (lf.type !== 'frozen_lake') continue;
      const len = lf.x1 - lf.x0;
      if (len < 40) continue;
      const lw = rng.int(Math.min(40, len - 16), Math.max(41, Math.min(90, len - 14))), ld = rng.int(8, 15);
      const x0 = lf.x0 + 7 + rng.int(0, Math.max(1, len - lw - 14));
      const level = Math.max(surface[x0], surface[x0 + lw - 1]) + 2;
      for (let x = x0; x < x0 + lw; x++) {
        const t = ((x - x0) + 0.5) / lw * 2 - 1;
        surface[x] = Math.max(surface[x], level + Math.round(ld * (1 - t * t)));
      }
      lakes.push({ x0, x1: x0 + lw, level });
    }
    // 乾湖床：森林平原 / 丘陵偶爾一個淺碗（之後鋪黏土、沙、碎石），天坑：漏斗形凹陷（之後往下挖豎井）
    const farOk = (x0: number, x1: number): boolean => Math.abs((x0 + x1) / 2 - width / 2) > width * 0.08 && !inDz(x0, 30) && !inDz(x1, 30)
      && biomes.every((b) => x1 < b.x0 - 30 || x0 > b.x1 + 30) && x0 > beachW + 20 && x1 < width - beachW - 20;
    const nBeds = Math.max(1, Math.round(width / 1400));
    for (let k = 0, tries = 0; k < nBeds && tries < 40; tries++) {
      const lf = landforms[rng.int(0, landforms.length)];
      if ((lf.type !== 'plains' && lf.type !== 'hills') || lf.x1 - lf.x0 < 70) continue;
      const lw = rng.int(28, Math.min(64, lf.x1 - lf.x0 - 20)), x0 = rng.int(lf.x0 + 10, lf.x1 - lw - 10);
      if (!farOk(x0, x0 + lw) || lakeBeds.some((l) => Math.abs(l.x0 - x0) < 120)) continue;
      const ld = rng.int(6, 12);
      const level = Math.max(surface[x0], surface[x0 + lw - 1]);
      for (let x = x0; x < x0 + lw; x++) {
        const t = ((x - x0) + 0.5) / lw * 2 - 1;
        surface[x] = Math.max(surface[x], level + Math.round(ld * (1 - t * t) * (1 - t * t * 0.3)));
      }
      lakeBeds.push({ x0, x1: x0 + lw, level });
      k++;
    }
    const nSinks = Math.max(1, Math.round(width / 1000));
    for (let k = 0, tries = 0; k < nSinks && tries < 40; tries++) {
      const x = rng.int(40, Math.max(41, width - 40)), r = rng.int(4, 8);
      if (!farOk(x - 16, x + 16) || sinks.some((s) => Math.abs(s.x - x) < 150) || lakeBeds.some((l) => x > l.x0 - 30 && x < l.x1 + 30)) continue;
      if (lakes.some((l) => x > l.x0 - 30 && x < l.x1 + 30)) continue;
      const R = r * 3;
      for (let xx = x - R; xx <= x + R; xx++) {
        const t = Math.abs(xx - x) / R;
        surface[xx] += Math.round((1 - t) * (1 - t) * r * 1.2);
      }
      sinks.push({ x, r, depth: rng.int(18, 46) });
      k++;
    }
    // 海灘：世界兩端往海邊緩降
    const bl = surface[Math.min(width - 1, beachW)], br = surface[Math.max(0, width - 1 - beachW)];
    for (let x = 0; x < beachW && x < width; x++) {
      surface[x] = bl + Math.round((beachW - x) * 0.22);
      surface[width - 1 - x] = br + Math.round((beachW - x) * 0.22);
    }
  })();
  // 去除單格尖刺（懸崖保留）
  for (let x = 1; x < width - 1; x++) {
    const l = surface[x - 1], r = surface[x + 1];
    if (l === r && Math.abs(surface[x] - l) === 1) surface[x] = l;
  }
  mark('深度層：泥土層厚度（低頻');
  yield '深度層：泥土層厚度（低頻';
  // ── 深度層：泥土層厚度（低頻大起伏 + 中頻小起伏）、岩層、洞穴層（深層岩）、熔岩深淵（玄武岩）──
  // 分界線各自帶雜訊；填色時在分界附近再用 2D 雜訊抖動成團塊狀交界（不是直線）。
  const deepLine = new Int16Array(width), moltenLine = new Int16Array(width);
  (() => {
    const ln = seedInt(seed, 'layers');
    for (let x = 0; x < width; x++) {
      const thick = height * (0.028 + 0.088 * vnoise1(x, 210, ln)) + (vnoise1(x, 37, ln + 1) - 0.5) * 16;
      rockLine[x] = surface[x] + Math.max(10, Math.round(thick));
      const d = Math.round(height * 0.47 + (vnoise1(x, 170, ln + 2) - 0.5) * height * 0.06 + (vnoise1(x, 55, ln + 3) - 0.5) * 26 + (vnoise1(x, 13, ln + 6) - 0.5) * 8);
      deepLine[x] = Math.min(height - 4, Math.max(rockLine[x] + Math.round(height * 0.05), d));
      const m = Math.round(height * 0.845 + (vnoise1(x, 130, ln + 4) - 0.5) * height * 0.035 + (vnoise1(x, 29, ln + 5) - 0.5) * 9);
      moltenLine[x] = Math.min(height - 2, Math.max(deepLine[x] + Math.round(height * 0.12), m));
    }
    mark('L:fill');
    const dith = new NoiseField(width, height, 5, 5, ln + 9);
    const dith2 = new NoiseField(width, height, 18, 12, ln + 10);
    let minS = height;
    for (let x = 0; x < width; x++) minS = Math.min(minS, surface[x]);
    for (let y = Math.max(0, minS); y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sx = surface[x];
        if (y < sx) continue;
        const rx = rockLine[x], dx = deepLine[x], mx = moltenLine[x];
        const i = y * WW + x;
        let t: number, wl: number;
        const near = Math.abs(y - rx) < 5 || Math.abs(y - dx) < 16 || Math.abs(y - mx) < 10;
        const j = near ? dith.at(x, y) - 0.5 : 0;
        const j2 = near ? dith2.at(x, y) - 0.5 : 0;
        if (y < rx + j * 8) { t = T.DIRT; wl = W.DIRT_WALL; }
        else if (y < dx + j * 14 + j2 * 18) { t = T.STONE; wl = W.STONE_WALL; }
        else if (y < mx + j * 14 + j2 * 6) { t = T.DEEP_STONE; wl = W.DEEP_STONE_WALL; }
        else { t = T.BASALT; wl = W.BASALT_WALL; }
        fg[i] = t;
        if (y >= sx + 3) wall[i] = wl;
      }
    }
  })();
  mark('L:lakebed');
  yield 'L:lakebed';
  // 乾湖床：碗底鋪 2–3 層黏土 / 沙 / 碎石（不長草）
  (() => {
    const ls = seedInt(seed, 'lake-beds');
    for (const lb of lakeBeds) {
      for (let x = lb.x0; x < lb.x1; x++) {
        const deep = surface[x] - lb.level;
        if (deep < 2) continue;
        for (let k = 0; k < 3; k++) {
          const y = surface[x] + k, n = vnoise1(x + k * 31, 6, ls);
          put(x, y, k === 0 ? (n > 0.6 ? T.SAND : T.CLAY) : n > 0.7 ? T.GRAVEL : T.CLAY);
        }
      }
    }
  })();
  mark('L:frozen');
  yield 'L:frozen';
  // 結冰湖填冰：湖面 = level（平的）
  for (const lk of lakes) {
    for (let x = lk.x0; x < lk.x1; x++) {
      for (let y = lk.level; y < surface[x]; y++) { put(x, y, T.ICE); if (y >= lk.level + 2) putWall(x, y, W.ICE_WALL); }
      surface[x] = Math.min(surface[x], lk.level);
    }
  }
  // 突岩：懸崖高的一側往外伸出 2–4 格、3 格厚的土簷（底下是空的）
  (() => {
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
  })();
  let surfaceLow = height, surfaceHigh = 0, rockLow = height, rockHigh = 0;
  for (let x = 0; x < width; x++) {
    surfaceLow = Math.min(surfaceLow, surface[x]); surfaceHigh = Math.max(surfaceHigh, surface[x]);
    rockLow = Math.min(rockLow, rockLine[x]); rockHigh = Math.max(rockHigh, rockLine[x]);
  }
  mark('L:bands');
  yield 'L:bands';
  let deepTop = height, moltenTop = height;
  for (let x = 0; x < width; x++) { deepTop = Math.min(deepTop, deepLine[x]); moltenTop = Math.min(moltenTop, moltenLine[x]); }
  world.surfaceY = Math.min(height - 1, surfaceHigh + 10);
  world.rockY = Math.min(height - 1, rockHigh);
  world.cavernY = Math.min(height - 1, deepTop);
  world.moltenY = Math.min(height - 1, moltenTop);
  world.surface.set(surface); // 洞穴挖穿前的地形地表（HUD 深度用）
  const bands: GenBands = { surfaceLow, surfaceHigh, rockLow, rockHigh };
  const layers: GenLayers = { rock: rockLine, deep: deepLine, molten: moltenLine };
  world.layers = layers;
  const bottom = height - 1;
  const cavernY = world.cavernY;
  const yIn = (rng: Rng, lo: number, hi: number): number => rng.int(Math.min(lo, hi - 1), Math.max(lo + 1, hi));
  /** 洞穴層中段（較深的迷你生態區 / 花崗岩用） */
  const deepY = deepTop + Math.floor((moltenTop - deepTop) * 0.5);
  const dungeonZone: ReservedZone = {
    x0: dzX0, x1: dzX1, y0: Math.max(2, surfaceLow - 40),
    y1: Math.min(height - 2, Math.max(rockHigh + 40, cavernY + Math.floor((moltenTop - cavernY) * 0.32))), side: dungeonLeft ? 'left' : 'right',
  };
  const occupied: Rect[] = [{ x: dzX0, y: dungeonZone.y0, w: dzW, h: dungeonZone.y1 - dungeonZone.y0 }];
  const structures: Structure[] = [];
  for (const lk of lakes) structures.push({ kind: 'frozen_lake', x: lk.x0, y: lk.level, w: lk.x1 - lk.x0, h: 16 });
  for (const lb of lakeBeds) structures.push({ kind: 'lake_bed', x: lb.x0, y: lb.level - 2, w: lb.x1 - lb.x0, h: 16 });

  mark('土石互滲（兩個方向都有，');
  yield '土石互滲（兩個方向都有，';
  // ── 土石互滲（兩個方向都有，大塊團狀）/ 黏土 / 碎石 ─────────────────
  const rocky = (id: number): boolean => id === T.STONE || id === T.DIRT || id === T.GRAVEL || id === T.DEEP_STONE;
  (() => {
    // 雙向互滲：泥土層裡的石頭團、岩層 / 洞穴層裡的泥土團、洞穴層裡夾一般石頭——都用雜訊團塊（有機形狀，不是菱形）
    const ps = seedInt(seed, 'pockets');
    noisePockets(world, new FbmField(width, height, 22, 14, ps, 2, 0.5), 0.66, (x) => surface[x] + 4, (x) => rockLine[x] + 4, (id) => id === T.DIRT, T.STONE);
    noisePockets(world, new FbmField(width, height, 7, 6, ps + 3, 2, 0.5), 0.76, (x) => surface[x] + 3, (x) => rockLine[x], (id) => id === T.DIRT, T.STONE);
    noisePockets(world, new FbmField(width, height, 26, 16, ps + 5, 2, 0.5), 0.665, (x) => rockLine[x] - 4, (x) => deepLine[x] + 40, (id) => id === T.STONE || id === T.DEEP_STONE, T.DIRT);
    noisePockets(world, new FbmField(width, height, 44, 26, ps + 7, 2, 0.5), 0.65, (x) => deepLine[x], (x) => moltenLine[x] - 10, (id) => id === T.DEEP_STONE, T.STONE);
    noisePockets(world, new FbmField(width, height, 30, 18, ps + 9, 2, 0.5), 0.68, (x) => moltenLine[x] - 40, (x) => moltenLine[x] + 8, (id) => id === T.DEEP_STONE, T.BASALT);
  })();
  (() => {
    const rng = subSeed(seed, 'clay');
    for (let k = 0; k < A * 0.00012; k++) {
      const x = rng.int(0, width);
      tileRunner(world, rng, x, yIn(rng, surface[x], rockLine[x] + 10), rng.int(4, 10), rng.int(4, 18), T.CLAY, { only: (id) => id === T.DIRT });
    }
  })();
  (() => {
    const rng = subSeed(seed, 'gravel');
    for (let k = 0; k < A * 0.0001; k++) {
      const x = rng.int(0, width);
      tileRunner(world, rng, x, yIn(rng, rockLine[x] - 10, deepLine[x] + 60), rng.int(3, 8), rng.int(3, 14), T.GRAVEL, { only: isRock });
    }
  })();
  mark('洞穴系統 ───────');
  yield '洞穴系統 ───────';
  // ── 洞穴系統 ──────────────────────────────────────────────
  const spawnSafe = (x: number): boolean => Math.abs(x - width / 2) < width * 0.02;
  const caveSeed = seedInt(seed, 'caves');
  // 1) 泥土層 + 岩層的義大利麵隧道：細長、蜿蜒、彼此交會成網；低頻遮罩讓某些區域是大片實心岩
  carveNoiseTunnels(world, {
    top: (x) => surface[x] + (spawnSafe(x) ? 30 : 9), bottom: (x) => deepLine[x] + 24,
    seed: caveSeed, width: 0.024, keep: (id) => id === T.ICE,
  });
  mark('caves:worms');
  yield 'caves:worms';
  // 2) 柏林蟲：岩層 / 洞穴層的大隧道，半徑 1.5–5 起伏、偶爾分岔
  (() => {
    const rng = subSeed(seed, 'worms');
    const n = Math.max(2, Math.round(width / 115 * (height / 1200)));
    for (let k = 0; k < n; k++) {
      const x = rng.int(20, Math.max(21, width - 20));
      if (inDz(x, 20)) continue;
      const deep = rng.next() < 0.42;
      const y0 = deep ? deepLine[x] + 10 : rockLine[x] + 6, y1 = deep ? moltenLine[x] - 20 : deepLine[x] + 20;
      if (y1 - y0 < 12) continue;
      perlinWorm(world, rng, {
        x, y: rng.int(y0, y1), steps: rng.int(140, 420), r0: rng.range(1.4, 2.2), r1: rng.range(2.8, deep ? 5.6 : 4.4),
        turn: rng.range(0.04, 0.1), flat: rng.range(0.25, 0.75), yMin: y0 - 10, yMax: y1 + 10, branch: 1 / 260,
      });
    }
  })();
  mark('caves:corridors');
  yield 'caves:corridors';
  // 3) 長水平廊道：幾條橫跨很遠、只微微起伏的通道
  (() => {
    const rng = subSeed(seed, 'corridors');
    const n = Math.max(1, Math.round(width / 650));
    for (let k = 0; k < n; k++) {
      const x = rng.int(40, Math.max(41, width - 40));
      if (inDz(x, 40)) continue;
      const lo = rng.chance(2) ? rockLine[x] + 12 : deepLine[x] + 20, hi = lo + Math.floor(height * 0.12);
      perlinWorm(world, rng, {
        x, y: rng.int(lo, Math.max(lo + 1, Math.min(hi, moltenLine[x] - 30))), steps: rng.int(380, 820),
        r0: rng.range(1.6, 2.1), r1: rng.range(2.6, 3.4), turn: 0.08, flat: 0.96,
        dx: rng.chance(2) ? 1 : -1, dy: 0, yMin: lo - 30, yMax: hi + 30,
      });
    }
  })();
  mark('caves:network');
  yield 'caves:network';
  // 4) 洞穴層的大洞窟網路（細胞自動機 + 移除小洞 + 連通）
  const network = carveNetwork(world, {
    yTop: deepTop - 6, yBot: moltenTop - 12, threshold: 0.55, seed: caveSeed + 101,
    rng: subSeed(seed, 'network'), minCells: 70,
  });
  mark('caves:chambers');
  yield 'caves:chambers';
  // 5) 巨大洞室：洞穴層裡少數圓頂大廳，各有風味（螢光菇 / 水晶 / 普通），兩側再接柏林蟲出去
  (() => {
    const rng = subSeed(seed, 'caverns');
    const n = Math.max(1, Math.round(width / 700));
    const placed: Rect[] = [];
    for (let k = 0, tries = 0; k < n && tries < n * 12; tries++) {
      const rx = rng.int(40, 82), ry = rng.int(22, 40);
      const x = rng.int(Math.min(rx + 20, width - 1), Math.max(rx + 21, width - rx - 20));
      const lo = deepTop + ry + 8, hi = moltenTop - ry - 16;
      if (hi <= lo) continue;
      const y = rng.int(lo, hi);
      const r: Rect = { x: x - rx, y: y - ry, w: rx * 2, h: ry * 2 };
      if (inDz(x - rx, 20) || inDz(x + rx, 20) || placed.some((o) => overlap(o, r, 30))) continue;
      carveChamber(world, x, y, rx, ry, caveSeed + 200 + k);
      for (const side of [-1, 1]) {
        perlinWorm(world, rng, {
          x: x + side * rx * 0.8, y: y + rng.int(-5, 6), steps: rng.int(60, 160), r0: 1.8, r1: 3.6, turn: 0.2, flat: 0.5,
          dx: side, dy: rng.range(-0.3, 0.3), yMin: deepTop, yMax: moltenTop - 10,
        });
      }
      placed.push(r);
      const f = rng.int(0, 3);
      structures.push({ kind: 'cavern', x: r.x, y: r.y, w: r.w, h: r.h, flavor: f === 0 ? 'mushroom' : f === 1 ? 'crystal' : 'plain' });
      k++;
    }
  })();
  mark('caves:moltenband');
  yield 'caves:moltenband';
  // 6) 熔岩深淵開闊帶：深淵中段一條橫貫世界、帶岩柱與浮島的大空間（無背景牆 → 看得到紅色深淵背景）
  (() => {
    const yC = Math.round(height - height * 0.078), hb = Math.max(6, Math.round(height * 0.052));
    const mf = new FbmField(width, height, 120, 34, caveSeed + 300, 3, 0.55);
    const ycA = new Float64Array(width), hbA = new Float64Array(width), y0A = new Int32Array(width), y1A = new Int32Array(width);
    let ylo = height, yhi = 0;
    for (let x = 0; x < width; x++) {
      ycA[x] = yC + (vnoise1(x, 150, caveSeed + 310) - 0.5) * hb * 0.9;
      hbA[x] = hb * (0.7 + 0.6 * vnoise1(x, 90, caveSeed + 311));
      y0A[x] = Math.max(moltenLine[x] + 8, Math.floor(ycA[x] - hbA[x] - 10));
      y1A[x] = Math.min(height - 12, Math.ceil(ycA[x] + hbA[x] + 10));
      ylo = Math.min(ylo, y0A[x]); yhi = Math.max(yhi, y1A[x]);
    }
    for (let y = ylo; y < yhi; y++) {
      for (let x = 0; x < width; x++) {
        if (y < y0A[x] || y >= y1A[x]) continue;
        const q = (y - ycA[x]) / hbA[x];
        const bias = 0.56 * (1 - q * q);
        if (!mf.above(x, y, 0.8 - bias)) continue;
        const i = y * WW + x;
        if (SOLID_LUT[fg[i]] !== 1) continue;
        fg[i] = T.AIR;
        wall[i] = W.NONE;
      }
    }
  })();
  mark('caves:holes');
  yield 'caves:holes';
  // 7) 少量小洞（岩層 / 洞穴層），不再滿地都是
  (() => {
    const rng = subSeed(seed, 'small-holes');
    for (let k = 0; k < A * 0.000025; k++) {
      const x = rng.int(0, width);
      if (inDz(x, 4)) continue;
      carveChamber(world, x, yIn(rng, rockLine[x] + 6, moltenLine[x] - 10), rng.int(4, 10), rng.int(3, 7), caveSeed + 700 + k);
    }
  })();
  (() => {
    const rng = subSeed(seed, 'surface-caves');
    const n = Math.max(1, Math.floor(width * 0.004));
    for (let k = 0; k < n; k++) {
      const x = rng.int(0, width);
      if (inSpawnBand(x) || x < 30 || x > width - 30 || inDz(x, 10)) continue;
      if (lakes.some((l) => x > l.x0 - 12 && x < l.x1 + 12)) continue;
      tileRunner(world, rng, x, surface[x], rng.int(3, 6), rng.int(20, 60), -1, { speedX: rng.range(-1, 1), speedY: 1 });
    }
  })();
  (() => {
    // 垂直裂谷：從地表一路往下的窄縫（上寬下窄、左右微擺）
    const rng = subSeed(seed, 'chasms');
    const n = Math.max(1, Math.round(width / 900));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 8; tries++) {
        const x = rng.int(30, Math.max(31, width - 30));
        if (inSpawnBand(x) || Math.abs(x - width / 2) < width * 0.07 || inDz(x, 30) || x < beachW + 10 || x > width - beachW - 10) continue;
        if (lakes.some((l) => x > l.x0 - 20 && x < l.x1 + 20) || lakeBeds.some((l) => x > l.x0 - 20 && x < l.x1 + 20)) continue;
        const top = surface[x] - 1, len = Math.min(height - 30 - top, rng.int(90, 220));
        if (len < 70) continue;
        let cx = x, drift = 0;
        const r0 = rng.range(1.6, 3.2);
        for (let d = 0; d < len; d++) {
          drift += (rng.next() - 0.5) * 0.5; drift = Math.max(-0.6, Math.min(0.6, drift));
          cx += drift; if (Math.abs(cx - x) > 14) { cx = x + Math.sign(cx - x) * 14; drift = -drift; }
          const rr = r0 + Math.max(0, 7 - d) * 0.7 + (rng.next() < 0.12 ? 1 : 0) - (d > len - 6 ? (d - len + 6) * 0.4 : 0);
          for (let tx = Math.floor(cx - rr); tx <= Math.ceil(cx + rr); tx++) if (Math.abs(tx - cx) <= rr) put(tx, top + d, T.AIR);
        }
        structures.push({ kind: 'chasm', x: x - 15, y: top, w: 30, h: len });
        break;
      }
    }
    // 峽谷：valley 段裡的一道 V 形深溝
    for (const lf of landforms) {
      if (lf.type !== 'valley' || lf.x1 - lf.x0 < 60) continue;
      const cx = rng.int(lf.x0 + 25, lf.x1 - 25), steps = rng.int(25, 50);
      tileRunner(world, rng, cx, surface[cx] + 2, rng.int(9, 15), steps, -1, { speedX: rng.range(-0.2, 0.2), speedY: 1 });
      structures.push({ kind: 'ravine', x: cx - 10, y: surface[cx], w: 20, h: steps });
    }
    // 天坑：漏斗底往下一口圓井，井底開成小洞室，通常會接到隧道網
    for (const s of sinks) {
      const top = surface[s.x];
      perlinWorm(world, rng, {
        x: s.x, y: top - 2, steps: Math.ceil(s.depth / Math.max(0.8, s.r * 0.55)), r0: s.r * 0.75, r1: s.r,
        turn: 0.06, flat: 0, dx: 0, dy: 1, yMin: top - 4, yMax: top + s.depth + 20,
      });
      carveDisc(world, s.x, top + s.depth, s.r + 3);
      structures.push({ kind: 'sinkhole', x: s.x - s.r * 3, y: top - 4, w: s.r * 6, h: s.depth + s.r + 6 });
    }
  })();
  mark('caves:fillpockets');
  yield 'caves:fillpockets';
  // 填掉洞穴挖完後殘留的孤立小氣泡（< 24 格），地底不再滿是零碎小洞
  fillTinyPockets(world, (x) => surface[x] + 6, 24);
  mark('花崗岩（洞穴層，較多）/');
  yield '花崗岩（洞穴層，較多）/';
  // ── 花崗岩（洞穴層，較多）/ 大理石（岩層下段 ~ 洞穴層上段）：大塊有機岩體，中間常有空洞 ──────
  (() => {
    const rng = subSeed(seed, 'granite-marble');
    const nG = Math.max(1, Math.round(width / 220)), nM = Math.max(1, Math.round(width / 300));
    for (let k = 0; k < nG + nM; k++) {
      const granite = k < nG;
      const x = rng.int(0, width);
      if (inDz(x, 40)) continue;
      const y = granite ? yIn(rng, deepLine[x] + 20, moltenLine[x] - 25) : yIn(rng, rockLine[x] + 30, deepLine[x] + 80);
      const rx = rng.int(18, 38), ry = rng.int(12, 24);
      paintBlob(world, x, y, rx, ry, granite ? T.GRANITE : T.MARBLE, caveSeed + 500 + k, rocky);
      if (rng.chance(3)) carveChamber(world, x + rng.int(-rx >> 1, (rx >> 1) + 1), y + rng.int(-4, 5), rx * 0.4, ry * 0.5, caveSeed + 600 + k);
    }
  })();
  mark('森林的沙地 ──────');
  yield '森林的沙地 ──────';
  // ── 森林的沙地 ─────────────────────────────────────────────
  (() => {
    const rng = subSeed(seed, 'sand');
    const n = Math.max(1, Math.floor(width / 220));
    for (let k = 0; k < n; k++) {
      const x = rng.int(10, Math.max(11, width - 10));
      if (inSpawnBand(x) || colBiome[x] !== BIOME.FOREST) continue;
      tileRunner(world, rng, x, surface[x] + 2, rng.int(10, 22), rng.int(4, 10), T.SAND, { speedX: rng.range(-1, 1), speedY: 0, only: (id) => id === T.DIRT });
    }
  })();
  mark('生態區轉換：有機形狀 ─');
  yield '生態區轉換：有機形狀 ─';
  // ── 生態區轉換：有機形狀 ─────────────────────────────────────
  //   沙漠：地表沙地 → 地下砂岩「淚滴」（先變寬再收成尖底），裡面有大量直條狀砂岩洞
  //   雪原：往下逐漸收窄成冰洞（冰 / 石混合 + 冰洞）
  //   叢林：中段鼓起再收、隨深度左右漂移，底部停在熔岩深淵上方
  //   左右邊界兩個八度起伏 + 逐格雜訊抖動；底部也是雜訊邊界。都不會延伸到世界底部。
  (() => {
    const ns = seedInt(seed, 'biome-noise');
    const edgeN = new FbmField(width, height, 13, 13, ns + 11, 2, 0.5);
    const matN = new FbmField(width, height, 15, 15, ns + 5, 2, 0.5);
    const caveA = new FbmField(width, height, 26, 30, ns + 21, 2, 0.5);
    const caveB = new FbmField(width, height, 14, 48, ns + 23, 2, 0.5);
    const span = moltenTop - deepTop;
    biomes.forEach((seg, si) => {
      const s0 = ns + si * 101, b = seg.biome;
      const w = seg.x1 - seg.x0, mid = (seg.x0 + seg.x1) / 2;
      let top = height;
      for (let x = Math.max(0, seg.x0); x < Math.min(width, seg.x1); x++) top = Math.min(top, surface[x]);
      const yB = b === BIOME.DESERT ? deepTop + Math.floor(span * 0.3) : b === BIOME.SNOW ? deepTop + Math.floor(span * 0.45) : moltenTop - 28;
      const depth = Math.max(10, yB - top);
      const prof = (t: number): number => {
        if (b === BIOME.DESERT) {
          if (t < 0.3) return 1 + 0.42 * (t / 0.3);
          const u = (t - 0.3) / 0.7;
          return 1.42 * Math.max(0, 1 - 0.62 * u - 0.38 * u * u);
        }
        if (b === BIOME.SNOW) {
          const p = 1 - 0.7 * t * Math.sqrt(t);
          return t > 0.88 ? p * Math.sqrt(Math.max(0, 1 - (t - 0.88) / 0.12)) : p;
        }
        const p = 1 + 2 * t * (1 - t);
        return t > 0.84 ? p * Math.sqrt(Math.max(0, 1 - (t - 0.84) / 0.16)) : p;
      };
      for (let y = Math.max(1, top - 2); y < Math.min(height - 1, yB); y++) {
        const t = (y - top) / depth;
        const f = Math.max(0.35, Math.min(1, (y - top) / 40));
        const lean = (vnoise1(y, 230, s0 + 40) - 0.5) * w * (b === BIOME.JUNGLE ? 0.7 : 0.3) * Math.min(1, t * 2.5);
        const wob = (k: number): number => ((vnoise1(y, 80, s0 + k) - 0.5) * 46 + (vnoise1(y, 19, s0 + k + 9) - 0.5) * 14) * f;
        const hw = (w / 2) * prof(Math.max(0, t)) * (1 + (vnoise1(y, 64, s0 + 20) - 0.5) * 0.22);
        const c = mid + lean, xl = c - hw + wob(2), xr = c + hw + wob(3);
        if (xr - xl < 2) continue;
        const J = 14;
        for (let x = Math.max(0, Math.floor(xl - J)); x < Math.min(width, Math.ceil(xr + J)); x++) {
          const jx = x + (edgeN.at(x, y) - 0.5) * 2 * J * f;
          if (jx < xl || jx >= xr) continue;
          if (y < surface[x] - 1) continue;
          const i = y * WW + x, tl = fg[i], wl = wall[i];
          const inner = Math.min(1, Math.min(jx - xl, xr - jx) / 18);
          if (b === BIOME.DESERT) {
            const sandTo = surface[x] + 13 + Math.floor(vnoise1(x, 20, s0 + 4) * 10);
            if (tl === T.DIRT || tl === T.GRASS || tl === T.STONE || tl === T.CLAY || tl === T.GRAVEL || tl === T.DEEP_STONE || tl === T.SAND) {
              fg[i] = y < sandTo || matN.at(x, y) > 0.68 ? T.SAND : T.SANDSTONE;
            }
            if (wl) wall[i] = W.SANDSTONE_WALL;
            // 砂岩洞：直條拉長的細縫 + 大泡泡
            if (y > sandTo + 6 && t > 0.08 && SOLID_LUT[fg[i]] === 1) {
              const k = inner * Math.min(1, (t - 0.08) * 6);
              if (Math.abs(caveB.at(x, y) - 0.5) < 0.034 * k || caveA.at(x, y) > 0.7 - 0.04 * k) fg[i] = T.AIR;
            }
          } else if (b === BIOME.SNOW) {
            // v6：地表雪層變薄、有起伏（2–9 格，偶有雪堆），下面是凍土：泥土混冰透鏡、碎石、石塊
            const snowTo = surface[x] + 2 + Math.floor(vnoise1(x, 23, s0 + 6) * 4 + vnoise1(x, 7, s0 + 7) * 2.5 + Math.max(0, vnoise1(x, 41, s0 + 8) - 0.72) * 14);
            if (tl === T.DIRT || tl === T.GRASS || tl === T.CLAY || tl === T.SAND) {
              if (y < snowTo) fg[i] = matN.at(x, y) > 0.8 && y > surface[x] ? T.ICE : T.SNOW;
              else {
                const m = matN.at(x, y);
                fg[i] = m > 0.64 ? T.ICE : m < 0.2 ? T.GRAVEL : m < 0.27 ? T.STONE : y < snowTo + 3 && m > 0.5 ? T.SNOW : T.DIRT;
              }
            }
            else if ((tl === T.STONE || tl === T.GRAVEL || tl === T.DEEP_STONE) && matN.at(x, y) > 0.45) fg[i] = T.ICE;
            if (wl) wall[i] = y < rockLine[x] ? W.SNOW_WALL : W.ICE_WALL;
            if (y > rockLine[x] + 8 && SOLID_LUT[fg[i]] === 1 && caveA.at(x, y) > 0.69 - 0.03 * inner) fg[i] = T.AIR;
          } else {
            if (tl === T.DIRT || tl === T.GRASS || tl === T.CLAY || tl === T.SAND || tl === T.GRAVEL) fg[i] = T.MUD;
            else if ((tl === T.STONE || tl === T.DEEP_STONE) && matN.at(x, y) > 0.47) fg[i] = T.MUD;
            if (wl) wall[i] = W.MUD_WALL;
            if (y > rockLine[x] && SOLID_LUT[fg[i]] === 1 && caveA.at(x, y) > 0.685 - 0.035 * inner) fg[i] = T.AIR;
          }
        }
      }
    });
  })();
  mark('迷你生態區：地下螢光菇林');
  yield '迷你生態區：地下螢光菇林';
  // ── 迷你生態區：地下螢光菇林、深層水晶洞 ───────────────────
  const miniRegions: { kind: 'mushroom_biome' | 'crystal_cave'; cx: number; cy: number; rx: number; ry: number }[] = [];
  (() => {
    const rng = subSeed(seed, 'mini-biomes');
    const ms = seedInt(seed, 'mini-noise');
    const n = Math.max(1, Math.round(width / 2800));
    for (let k = 0; k < n * 2; k++) {
      const mush = k < n;
      for (let tries = 0; tries < 10; tries++) {
        const rx = mush ? rng.int(55, 86) : rng.int(40, 61), ry = mush ? rng.int(28, 43) : rng.int(24, 35);
        const cx = rng.int(rx + 10, Math.max(rx + 11, width - rx - 10));
        const cy = mush ? yIn(rng, rockHigh + ry + 10, deepTop + Math.floor((moltenTop - deepTop) * 0.4)) : yIn(rng, deepY, moltenTop - ry - 12);
        const rect: Rect = { x: cx - rx, y: cy - ry, w: rx * 2, h: ry * 2 };
        if (cy + ry >= height - 4 || cy - ry < 4) continue;
        if (mush && (colBiome[cx] !== BIOME.FOREST || colBiome[Math.max(0, cx - rx)] !== BIOME.FOREST || colBiome[Math.min(width - 1, cx + rx)] !== BIOME.FOREST)) continue;
        if (inDz(cx - rx, 20) || inDz(cx + rx, 20) || occupied.some((o) => overlap(o, rect, 10))) continue;
        // 已經大半是空洞（例如落在巨大洞室裡）的位置不要：菇林 / 晶洞需要岩體來長蘑菇草 / 大理石殼
        let open = 0;
        for (let y = rect.y; y < rect.y + rect.h; y += 2) for (let x = rect.x; x < rect.x + rect.w; x += 2) if (!isSolid(get(x, y))) open++;
        if (open * 4 > rect.w * rect.h * 0.45) continue;
        for (let c = 0; c < (mush ? 9 : 5); c++) {
          tileRunner(world, rng, cx + rng.int(-Math.floor(rx * 0.65), Math.floor(rx * 0.65) + 1), cy + rng.int(-Math.floor(ry * 0.45), Math.floor(ry * 0.45) + 1),
            mush ? rng.int(16, 27) : rng.int(14, 23), rng.int(20, 50), -1, { speedY: rng.range(-0.3, 0.3) });
        }
        for (let y = cy - ry - 4; y <= cy + ry + 4; y++) {
          for (let x = cx - rx - 4; x <= cx + rx + 4; x++) {
            if (!inB(x, y)) continue;
            const dx = (x - cx) / rx, dy = (y - cy) / ry;
            if (dx * dx + dy * dy > 1 + (fbm2(x, y, 10, ms + k) - 0.5) * 0.5) continue;
            const i = y * WW + x, t = fg[i];
            if (mush) {
              if (isSolid(t) && t !== T.GRANITE && t !== T.MARBLE) fg[i] = T.MUD;
              if (wall[i]) wall[i] = W.MUD_WALL;
            } else {
              if (isSolid(t) && t !== T.GOLD_ORE && t !== T.SILVER_ORE) fg[i] = T.MARBLE;
              if (wall[i]) wall[i] = W.ICE_WALL;
            }
          }
        }
        miniRegions.push({ kind: mush ? 'mushroom_biome' : 'crystal_cave', cx, cy, rx, ry });
        structures.push({ kind: mush ? 'mushroom_biome' : 'crystal_cave', x: rect.x, y: rect.y, w: rect.w, h: rect.h });
        occupied.push(rect);
        break;
      }
    }
  })();
  mark('海灘：兩端地表下 5–9');
  yield '海灘：兩端地表下 5–9';
  // ── 海灘：兩端地表下 5–9 格換成沙 ────────────────────────
  (() => {
    const bs = seedInt(seed, 'beach');
    for (let k = 0; k < beachW + 10 && k < width; k++) {
      for (const x of [k, width - 1 - k]) {
        const depth = k < beachW ? 5 + Math.floor(vnoise1(x, 8, bs) * 5) : Math.max(0, Math.round((beachW + 10 - k) * 0.5));
        for (let y = surface[x]; y < surface[x] + depth && y < height; y++) {
          const i = y * WW + x, t = fg[i];
          if (t === T.DIRT || t === T.STONE || t === T.CLAY || t === T.GRAVEL) fg[i] = T.SAND;
        }
      }
    }
  })();
  mark('礦脈群（');
  yield '礦脈群（';
  // ── 礦脈群（每群 2–6 條同向的細長礦脈），依深度層分帶：銅（泥土 / 岩層）、鐵（岩層 ~ 洞穴層上段）、
  //    銀（岩層下段 ~ 洞穴層）、金（洞穴層下段 ~ 熔岩深淵頂）
  (() => {
    const rng = subSeed(seed, 'shinies');
    const k0 = A / (4200 * 1200);
    const cluster = (count: number, band: (x: number) => [number, number], type: number, s0: number, s1: number): void => {
      for (let k = 0; k < count * k0; k++) {
        const x = rng.int(0, width);
        const [lo, hi] = band(x);
        if (hi - lo < 4 || inDz(x, 3)) continue;
        const y = rng.int(lo, hi), veins = rng.int(2, 7);
        const ang = rng.range(-1, 1), sy = rng.range(-0.5, 0.5);
        for (let v = 0; v < veins; v++) {
          tileRunner(world, rng, x + rng.int(-9, 10), y + rng.int(-6, 7), rng.int(s0, s1), rng.int(5, 15), type,
            { only: isOreHost, speedX: ang + rng.range(-0.3, 0.3), speedY: sy + rng.range(-0.3, 0.3) });
        }
      }
    };
    cluster(150, (x) => [surface[x] + 4, rockLine[x] + 20], T.COPPER_ORE, 3, 6);
    cluster(260, (x) => [rockLine[x], deepLine[x] - 10], T.COPPER_ORE, 3, 6);
    cluster(220, (x) => [rockLine[x] + 10, deepLine[x] + 80], T.IRON_ORE, 3, 6);
    cluster(80, (x) => [deepLine[x] + 80, moltenLine[x] - 40], T.IRON_ORE, 3, 6);
    cluster(170, (x) => [deepLine[x] - 40, deepLine[x] + Math.floor((moltenLine[x] - deepLine[x]) * 0.7)], T.SILVER_ORE, 3, 6);
    cluster(160, (x) => [deepLine[x] + Math.floor((moltenLine[x] - deepLine[x]) * 0.35), moltenLine[x] + 25], T.GOLD_ORE, 3, 6);
  })();
  /** 熔岩深淵低窪池的格（液體 pass 注入熔岩） */
  const lavaPool: number[] = [];
  mark('熔岩深淵細節：灰燼地板、');
  yield '熔岩深淵細節：灰燼地板、';
  // ── 熔岩深淵細節：灰燼地板、低窪處的發光熔岩石池、熔岩石脈、黑曜石殼 ─────────
  (() => {
    const rng = subSeed(seed, 'molten');
    const isMoltenRock = (id: number): boolean => id === T.BASALT || id === T.DEEP_STONE || id === T.STONE;
    for (let k = 0; k < A * 0.00006; k++) {
      const x = rng.int(0, width);
      paintBlob(world, x, yIn(rng, moltenLine[x], height - 4), rng.int(3, 9), rng.int(2, 5), T.MAGMA_ROCK, caveSeed + 800 + k, (id) => id === T.BASALT);
    }
    for (let k = 0; k < A * 0.00003; k++) {
      const x = rng.int(0, width);
      tileRunner(world, rng, x, yIn(rng, moltenLine[x] - 10, height - 4), rng.int(3, 7), rng.int(5, 16), T.OBSIDIAN, { only: isMoltenRock });
    }
    // 每欄找開闊帶的地板（由下往上第一個「上方是空氣」的實心格）
    const floorY = new Int16Array(width).fill(-1);
    for (let x = 0; x < width; x++) {
      for (let y = height - 3; y > moltenLine[x]; y--) {
        const i = y * WW + x;
        if (SOLID_LUT[fg[i]] === 1 && fg[i - WW] === T.AIR && wall[i - WW] === W.NONE) { floorY[x] = y; break; }
      }
    }
    // 灰燼地板：地板往下 2–4 格
    for (let x = 0; x < width; x++) {
      const fy = floorY[x];
      if (fy < 0) continue;
      const d = 2 + Math.floor(vnoise1(x, 9, caveSeed + 400) * 3);
      for (let y = fy; y < fy + d && y < height; y++) if (fg[y * WW + x] === T.BASALT) fg[y * WW + x] = T.ASH;
    }
    // 熔岩池：比左右 ±10 欄平均更低的窪地，填到平均高度。
    // v6：每段連續的窪地再往下挖一個碗形盆地（中央深 4–12 格，依寬度），不再是一格厚的寬薄片；
    // 池子裡是熔岩（液體，最後的液體 pass 注入），池底兩格是發光的熔岩石
    const poolLvl = new Int16Array(width).fill(-1);
    for (let x = 10; x < width - 10; x++) {
      const fy = floorY[x];
      if (fy < 0) continue;
      let s = 0, n = 0;
      for (let k = -10; k <= 10; k++) if (floorY[x + k] >= 0) { s += floorY[x + k]; n++; }
      const lvl = Math.round(s / n) - 1;
      if (lvl < fy) poolLvl[x] = lvl;
    }
    const carvable = (id: number): boolean => id === T.BASALT || id === T.ASH || id === T.MAGMA_ROCK || id === T.OBSIDIAN || id === T.DEEP_STONE || id === T.STONE;
    for (let a = 10; a < width - 10;) {
      if (poolLvl[a] < 0) { a++; continue; }
      let b = a;
      while (b < width - 10 && poolLvl[b] >= 0) b++;
      const wr = b - a;
      const D = Math.max(4, Math.min(12, Math.round(3 + wr / 4 + vnoise1(a, 7, caveSeed + 420) * 3)));
      for (let x = a; x < b; x++) {
        const fy = floorY[x], t = ((x - a) + 0.5) / wr * 2 - 1;
        // 碗形：中央最深；底下至少留 3 格實心（不挖穿到下面的洞）
        let d = Math.round(D * (1 - t * t));
        while (d > 0) {
          let ok = fy + d + 3 < height - 7;
          for (let y = fy; y < fy + d + 3 && ok; y++) if (!carvable(fg[y * WW + x])) ok = false;
          if (ok) break;
          d--;
        }
        for (let y = fy; y < fy + d; y++) fg[y * WW + x] = T.AIR;
        const bot = fy + d;
        for (let y = poolLvl[x]; y < bot; y++) if (fg[y * WW + x] === T.AIR) lavaPool.push(y * WW + x);
        for (let y = bot; y < bot + 2; y++) if (fg[y * WW + x] === T.ASH || fg[y * WW + x] === T.BASALT) fg[y * WW + x] = T.MAGMA_ROCK;
      }
      a = b;
    }
    // 黑曜石殼：緊貼熔岩石的玄武岩一半變黑曜石
    for (let y = Math.max(1, moltenTop - 20); y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * WW + x;
        if (fg[i] !== T.BASALT && fg[i] !== T.ASH) continue;
        if ((fg[i - 1] === T.MAGMA_ROCK || fg[i + 1] === T.MAGMA_ROCK || fg[i + WW] === T.MAGMA_ROCK || fg[i - WW] === T.MAGMA_ROCK) && rng.chance(2)) fg[i] = T.OBSIDIAN;
      }
    }
    // 世界底部 6 格一律實心
    for (let y = height - 6; y < height; y++) for (let x = 0; x < width; x++) if (fg[y * WW + x] === T.AIR) fg[y * WW + x] = T.BASALT;
  })();
  void network;
  mark('重新量地表（洞穴可能挖穿');
  yield '重新量地表（洞穴可能挖穿';
  // ── 重新量地表（洞穴可能挖穿地表） ───────────────────────
  const remeasure = (): void => {
    for (let x = 0; x < width; x++) {
      let y = 0;
      while (y < height && !isSolid(fg[y * WW + x])) y++;
      surface[x] = y;
    }
  };
  remeasure();
  mark('Grass：地表線附近、');
  yield 'Grass：地表線附近、';
  // ── Grass：地表線附近、上方為空氣的泥土；泥巴外露 → 叢林草（地下也長） ──
  (() => {
  for (let y = 1; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * WW + x, t = fg[i];
      if (t === T.DIRT) { if (y <= world.surfaceY && fg[i - WW] === T.AIR && wall[i - WW] === W.NONE && colBiome[x] !== BIOME.SNOW) fg[i] = T.GRASS; }
      else if (t === T.MUD && fg[i - WW] === T.AIR) fg[i] = T.JUNGLE_GRASS;
    }
  }
  })();
  for (const m of miniRegions) {
    if (m.kind !== 'mushroom_biome') continue;
    for (let y = m.cy - m.ry - 5; y <= m.cy + m.ry + 5; y++) for (let x = m.cx - m.rx - 5; x <= m.cx + m.rx + 5; x++) {
      if (inB(x, y) && fg[y * WW + x] === T.JUNGLE_GRASS) fg[y * WW + x] = T.MUSHROOM_GRASS;
    }
  }
  mark('Spawn：中央欄的地表');
  yield 'Spawn：中央欄的地表';
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
  occupied.push({ x: sx - 60, y: 0, w: 120, h: groundY + 70 });
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
  // 礦坑 / 密室 / 浮空島的畫圖在 engine/gen2/draw/（與 gen2 共用），經 gridCanvas 直接寫 world；這裡只留選址與佔位。
  // 這三種結構不補天然地層（natural 被叫到就是 bug）
  const noNatural = (): never => { throw new Error('worldgen: mineshafts / secret rooms / sky islands fill no natural rock'); };
  const cv = gridCanvas(world, seedStr, depthFrac, surface, noNatural);

  mark('礦坑：水平坑道 + 每');
  yield '礦坑：水平坑道 + 每';
  // ── 礦坑：水平坑道 + 每 6 格一組木框（橫樑 + 兩根柱）+ 火把；一半有斜坡通往地表 ──
  (() => {
    const rng = subSeed(seed, 'mineshafts');
    const n = Math.max(1, Math.round(width / 550));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 6; tries++) {
        const len = rng.int(50, 140);
        const x0 = rng.int(60, Math.max(61, width - len - 60));
        const yTop = surface[Math.min(width - 1, x0)] + rng.int(28, 130);
        const r: Rect = { x: x0, y: yTop - 1, w: len, h: 6 };
        if (yTop + 6 >= height - 4 || !free(r, 4)) continue;
        const st: Structure = { kind: 'mineshaft', x: x0, y: yTop - 1, w: len, h: 6 };
        const { chest } = drawMineshaft(cv, { x0, len, yTop }, rng);
        if (chest) st.chest = chest;
        occupied.push(r);
        // 入口斜坡：從坑道左端往左上每欄升一格（可走上走下）
        if (rng.chance(2) && yTop - surface[x0] < 100) {
          const stair: Rect = { x: x0 - (yTop - surface[x0]) - 6, y: surface[x0] - 6, w: yTop - surface[x0] + 6, h: yTop - surface[x0] + 6 };
          if (free(stair, 1)) {
            drawRamp(cv, { x0, yTop, xMin: 2 }, (x) => surface[x]);
            occupied.push(stair);
          }
        }
        structures.push(st);
        break;
      }
    }
  })();
  mark('密室：礦坑盡頭的裂紋石假牆');
  yield '密室：礦坑盡頭的裂紋石假牆';
  // ── 密室：部分礦坑的盡頭是兩格厚的裂紋石（一敲就碎），後面是一間小密室（珍寶箱 + 陶罐 + 鐘乳石；不放發光物） ──
  const secretRooms: Structure[] = [];
  (() => {
    const rng = subSeed(seed, 'secret-rooms');
    const shafts = structures.filter((s) => s.kind === 'mineshaft');
    for (const st of shafts) {
      if (secretRooms.length >= 5) break;
      const yTop = st.y + 1, rw = rng.int(8, 13), rh = SECRET_RH;
      for (const right of rng.chance(2) ? [true, false] : [false, true]) {
        const lay = { shaftX0: st.x, shaftLen: st.w, yTop, right, rw }, { plug0, ry0, shell } = secretRoomLayout(lay);
        const outer: Rect = right ? { x: plug0, y: ry0 - 2, w: rw + 4, h: rh + 5 } : { x: shell.x, y: ry0 - 2, w: rw + 4, h: rh + 5 };
        if (!free(outer, 0) || shell.x < 4 || shell.x + shell.w > width - 4) continue;
        const room = drawSecretRoom(cv, lay, rng);
        const r: Structure = { kind: 'secret_room', x: room.x, y: room.y, w: room.w, h: room.h, chest: room.chest };
        occupied.push(outer, shell);
        structures.push(r);
        secretRooms.push(r);
        break;
      }
    }
  })();
  mark('廢棄小屋：木板外殼 +');
  yield '廢棄小屋：木板外殼 +';
  // ── 廢棄小屋：木板外殼 + 木板牆 + 工作台 + 箱子 + 火把，兩側門口接一小段坑道 ──
  (() => {
    const rng = subSeed(seed, 'cabins');
    const n = Math.max(1, Math.round(width / 260));
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 6; tries++) {
        const w = rng.int(9, 16), h = rng.int(6, 9);
        const x = rng.int(40, Math.max(41, width - 40 - w));
        const y = yIn(rng, surface[x] + 26, moltenLine[x] - 30);
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
  })();
  mark('地表遺跡：石磚殘屋（一側');
  yield '地表遺跡：石磚殘屋（一側';
  // ── 地表遺跡：石磚殘屋（一側坍塌）+ 箱子 + 陶罐 ─────────────
  (() => {
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
  })();
  mark('地城：預留區裡的入口塔');
  yield '地城：預留區裡的入口塔';
  // ── 地城：預留區裡的入口塔 + 多房間地城（房間圖 + MST + 額外迴圈、上鎖的門與鑰匙） ──
  const dungeon = generateDungeon(world, {
    seed: seedStr, zone: dungeonZone, surface,
    color: DUNGEON_COLORS[subSeed(seed, 'dungeon-color').int(0, DUNGEON_COLORS.length)],
    depthFrac,
    natural: (x, y) => y < rockLine[x] ? [T.DIRT, W.DIRT_WALL] : y < deepLine[x] ? [T.STONE, W.STONE_WALL]
      : y < moltenLine[x] ? [T.DEEP_STONE, W.DEEP_STONE_WALL] : [T.BASALT, W.BASALT_WALL],
  });
  if (dungeon) structures.push({ kind: 'dungeon', ...dungeon.bbox });
  remeasure();

  mark('聚落：地表村落 + 矮人地廳');
  yield '聚落：地表村落 + 矮人地廳';
  // ── NPC 聚落：平坦森林地表的村落（2～4）+ 洞穴層深處的矮人地廳（1～2）；見 gen/settlements.ts ──
  const villageCol = new Uint8Array(width);
  /** 液體不能進去的範圍（村落 / 地廳 / 地廳隧道，各留緩衝） */
  const dry: Rect[] = [];
  const { villages, halls } = (() => {
    const blocked = (): Rect[] => [...occupied, ...structures.filter((st) => st.kind !== 'frozen_lake' && st.kind !== 'lake_bed')];
    const wet = (x: number): boolean => lakes.some((l) => x >= l.x0 - 12 && x <= l.x1 + 12) || lakeBeds.some((l) => x >= l.x0 - 12 && x <= l.x1 + 12);
    const ctx = { world, seed, surface, colBiome, deepLine, moltenLine, spawnX: sx, dz: { x0: dzX0, x1: dzX1 }, beachW, blocked, wetCols: wet };
    const v = placeVillages(ctx);
    for (const r of v.rects) occupied.push(r);
    v.villages.forEach((vi, i) => {
      structures.push({ kind: 'village', ...v.rects[i] });
      dry.push({ x: vi.x0 - 16, y: vi.ground - 40, w: vi.x1 - vi.x0 + 33, h: 46 });
      for (let x = Math.max(0, vi.x0 - 10); x <= Math.min(width - 1, vi.x1 + 10); x++) villageCol[x] = 1;
    });
    const h = placeDwarfHalls(ctx);
    for (const r of h.rects) occupied.push(r);
    h.halls.forEach((hi, i) => {
      structures.push({ kind: 'dwarf_hall', ...h.rects[i] });
      dry.push({ x: hi.x0 - 6, y: hi.y0 - 6, w: hi.x1 - hi.x0 + 13, h: hi.floorY - hi.y0 + 10 });
      for (const t of hi.tunnels) dry.push({ x: t.x0 - 3, y: hi.floorY - 8, w: t.x1 - t.x0 + 7, h: 11 });
    });
    return { villages: v.villages, halls: h.halls };
  })();
  remeasure();

  mark('樹木：森林闊葉樹、');
  yield '樹木：森林闊葉樹、';
  // ── 液體（生成器 v5）前半：湖床注滿 / 山谷池塘 / 沙漠綠洲（樹與地表裝飾之後會避開水面） ──
  const liquidGen = createLiquidGen({
    world, seed, surface, layers, colBiome, biomes, lakeBeds, lavaPool, spawnX: spawn.x,
    avoid: (x) => inDz(x, 20) || x < beachW + 8 || x > width - beachW - 8 || villageCol[Math.max(0, Math.min(width - 1, x))] === 1,
    protect: (x, y) => dry.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h),
    occupied: () => [...occupied, ...structures.filter((st) => st.kind !== 'cavern' && st.kind !== 'chasm' && st.kind !== 'ravine'
      && st.kind !== 'sinkhole' && st.kind !== 'lake_bed' && st.kind !== 'frozen_lake' && st.kind !== 'mushroom_biome' && st.kind !== 'crystal_cave')],
  });
  liquidGen.surface();
  mark('樹木');
  yield '樹木';
  // ── 樹木：森林闊葉樹、雪原松樹、叢林大樹（樹幹 + 菱形樹葉格，外觀由 render 依地面挑） ──
  (() => {
    const rng = subSeed(seed, 'trees');
    let lastTree = -10;
    for (let x = 3; x < width - 3; x++) {
      const gy = surface[x];
      if (gy <= 4 || gy >= height) continue;
      const ground = fg[gy * WW + x];
      const jungle = ground === T.JUNGLE_GRASS, snow = ground === T.SNOW;
      if (ground !== T.GRASS && !jungle && !snow) continue;
      const gap = jungle ? 7 : 4;
      if (x - lastTree < gap || Math.abs(x - sx) < 5 || villageCol[x]) continue;
      if (!rng.chance(jungle ? 3 : snow ? 4 : 5)) continue;
      const h = jungle ? rng.int(11, 21) : snow ? rng.int(7, 15) : rng.int(5, 12);
      const r = jungle ? rng.int(4, 7) : snow ? rng.int(2, 4) : rng.int(2, 4);
      if (gy - h - r - 2 < 1) continue;
      // 水底不長樹（亂數照樣抽，讓沒有水的地方和 v4 一樣 → v4 存檔遷移時沒有接縫）
      let clear = !world.liquid[(gy - 1) * WW + x];
      for (let dy = 1; dy <= h + 3 && clear; dy++) {
        for (let dx = -2; dx <= 2; dx++) if (fg[(gy - dy) * WW + x + dx] !== T.AIR || world.liquid[(gy - dy) * WW + x + dx]) { clear = false; break; }
      }
      if (!clear) continue;
      for (let dy = 1; dy <= h; dy++) fg[(gy - dy) * WW + x] = T.WOOD;
      const top = gy - h;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > r) continue;
          const xx = x + dx, yy = top + dy;
          if (inB(xx, yy) && fg[yy * WW + xx] === T.AIR && !world.liquid[yy * WW + xx]) fg[yy * WW + xx] = T.LEAVES;
        }
      }
      lastTree = x;
    }
  })();
  mark('地表裝飾：花草、蘑菇、石');
  yield '地表裝飾：花草、蘑菇、石';
  // ── 地表裝飾：花草、蘑菇、石頭、灌木、南瓜 / 仙人掌、枯枝 / 雪灌木 / 蕨類 ──
  (() => {
    const rng = subSeed(seed, 'surface-decor');
    let lastCactus = -10;
    for (let x = 1; x < width - 1; x++) {
      const gy = surface[x];
      if (gy < 2 || gy >= height) continue;
      const ground = fg[gy * WW + x], ai = (gy - 1) * WW + x;
      if (fg[ai] !== T.AIR) continue;
      const wet = world.liquid[ai] > 0; // 水裡不放裝飾（亂數照樣抽，見上）
      const r = rng.next();
      let d = -1;
      if (ground === T.GRASS) {
        d = r < 0.24 ? T.TALL_GRASS : r < 0.32 ? T.FLOWER : r < 0.34 ? T.MUSHROOM : r < 0.355 ? T.SMALL_ROCK
          : r < 0.39 ? T.BUSH : r < 0.397 ? T.PUMPKIN : -1;
      } else if (ground === T.SAND && colBiome[x] === BIOME.DESERT) {
        if (r < 0.08 && x - lastCactus > 5) {
          const hc = rng.int(2, 6);
          let ok = true;
          for (let k = 1; k <= hc; k++) if (get(x, gy - k) !== T.AIR || wet) ok = false;
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
      if (d >= 0 && !wet) fg[ai] = d;
    }
  })();
  mark('地下裝飾：陶罐、石筍 /');
  yield '地下裝飾：陶罐、石筍 /';
  // ── 地下裝飾：陶罐、石筍 / 鐘乳石、螢光菇、水晶、藤蔓、蜘蛛網 ──────
  (() => {
    const rng = subSeed(seed, 'underground-decor');
    const caverns = structures.filter((s) => s.kind === 'cavern' && s.flavor !== 'plain');
    // 8×8 粗格：只有和某個風味區外接框相交的格子才需要逐區判斷
    const fgw = Math.ceil(width / 8), fgh = Math.ceil(height / 8), flavorGrid = new Uint8Array(fgw * fgh);
    const markBox = (x0: number, y0: number, x1: number, y1: number): void => {
      for (let gy = Math.max(0, Math.floor(y0 / 8)); gy <= Math.min(fgh - 1, Math.floor(y1 / 8)); gy++)
        for (let gx = Math.max(0, Math.floor(x0 / 8)); gx <= Math.min(fgw - 1, Math.floor(x1 / 8)); gx++) flavorGrid[gy * fgw + gx] = 1;
    };
    for (const m of miniRegions) if (m.kind === 'crystal_cave') markBox(m.cx - m.rx - 5, m.cy - m.ry - 5, m.cx + m.rx + 5, m.cy + m.ry + 5);
    for (const c of caverns) { const r = c.w / 2 + 10, mx = c.x + c.w / 2, my = c.y + c.h / 2; markBox(mx - r, my - r, mx + r, my + r); }
    const flavorAt = (x: number, y: number): 'mushroom' | 'crystal' | 'crystal_cave' | null => {
      if (!flavorGrid[(y >> 3) * fgw + (x >> 3)]) return null;
      for (const m of miniRegions) {
        if (m.kind !== 'crystal_cave') continue;
        const dx = (x - m.cx) / (m.rx + 4), dy = (y - m.cy) / (m.ry + 4);
        if (dx * dx + dy * dy < 1) return 'crystal_cave';
      }
      for (const c of caverns) {
        const r = c.w / 2 + 10, dx = x - (c.x + c.w / 2), dy = y - (c.y + c.h / 2);
        if (dx * dx + dy * dy < r * r) return c.flavor === 'mushroom' ? 'mushroom' : 'crystal';
      }
      return null;
    };
    const deep = cavernY + Math.floor((bottom - cavernY) * 0.25);
    const stony = (t: number): boolean => t === T.STONE || t === T.GRANITE || t === T.MARBLE || t === T.ICE || t === T.SANDSTONE || t === T.GRAVEL
      || t === T.DEEP_STONE || t === T.BASALT || t === T.OBSIDIAN;
    const jungly = (t: number): boolean => t === T.MUD || t === T.JUNGLE_GRASS;
    // 裂谷：每欄記下「發光裝飾帶」的上下界（裂谷頂往下 40 格起）——深處沒火把也有零星水晶 / 螢光菇指路
    const chasmY0 = new Int32Array(width).fill(-1), chasmY1 = new Int32Array(width);
    for (const c of structures) {
      if (c.kind !== 'chasm') continue;
      for (let x = Math.max(0, c.x); x < Math.min(width, c.x + c.w); x++) { chasmY0[x] = c.y + 40; chasmY1[x] = c.y + c.h; }
    }
    const inChasm = (x: number, y: number): boolean => chasmY0[x] >= 0 && y >= chasmY0[x] && y < chasmY1[x];
    for (let y = 2; y < height - 2; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * WW + x;
        if (fg[i] !== T.AIR || y <= surface[x] + 1 || wall[i] >= W.DUNGEON_WALL_BLUE) continue;
        const below = fg[i + WW], above = fg[i - WW];
        const floor = isSolid(below), ceil = isSolid(above);
        if (inChasm(x, y) && world.liquid[i] === 0) {
          // 座標雜湊（不吃 rng：不改變其他裝飾的亂數序列）
          let hh = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ 0x5bd1e995;
          hh = Math.imul(hh ^ (hh >>> 15), 2246822519);
          const r = ((hh ^ (hh >>> 13)) >>> 0) / 4294967296;
          if (floor && r < 0.16) { fg[i] = T.GLOW_MUSHROOM; continue; }
          if (!floor && (isSolid(fg[i - 1]) || isSolid(fg[i + 1]) || ceil) && r < 0.03) { fg[i] = T.CRYSTAL; continue; }
        }
        if (!floor && !ceil) continue;
        const fl = y > cavernY - 40 ? flavorAt(x, y) : null;
        const r = rng.next();
        if (floor) {
          if (below === T.MUSHROOM_GRASS) { if (r < 0.38) fg[i] = T.GLOW_MUSHROOM; continue; }
          if (fl === 'crystal_cave' && r < 0.28) { fg[i] = T.CRYSTAL; continue; }
          if (fl === 'mushroom' && r < 0.3) { fg[i] = T.GLOW_MUSHROOM; continue; }
          if (fl === 'crystal' && r < 0.12) { fg[i] = T.CRYSTAL; continue; }
          if (jungly(below)) { if (r < 0.12) fg[i] = T.FERN; else if (r < 0.135 && y > surface[x] + 12) fg[i] = T.POT; continue; }
          if (y > surface[x] + 12 && r < 0.012) { fg[i] = T.POT; continue; }
          if (stony(below) && r < 0.04) { fg[i] = T.STALAGMITE; continue; }
          if (y > cavernY && r > 0.988) { fg[i] = T.GLOW_MUSHROOM; continue; }
          if (y > deep && r > 0.984 && r <= 0.988) { fg[i] = T.CRYSTAL; continue; }
        } else {
          if (fl === 'crystal_cave' && r < 0.22) { fg[i] = T.CRYSTAL; continue; }
          if (above === T.MUSHROOM_GRASS) { if (r < 0.1) { fg[i] = T.VINE; } continue; }
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
  })();
  remeasure();
  mark('浮空島：地表上空的透鏡形');
  yield '浮空島：地表上空的透鏡形';
  // ── 浮空島：地表上空的透鏡形小島，島上有小木屋 + 箱子 + 一棵樹 ──────────
  (() => {
    const rng = subSeed(seed, 'sky-islands');
    const n = Math.max(1, Math.round(width / 1400));
    const islands: Rect[] = [];
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 14; tries++) {
        const iw = rng.int(30, 49), x0 = rng.int(beachW + 20, Math.max(beachW + 21, width - beachW - 20 - iw));
        const cxI = x0 + iw / 2;
        if (Math.abs(cxI - width / 2) < width * 0.06 || inDz(x0, 20) || inDz(x0 + iw, 20)) continue;
        let minTop = height;
        for (let x = x0 - 6; x < x0 + iw + 6; x++) minTop = Math.min(minTop, world.surface[Math.max(0, Math.min(width - 1, x))], surface[Math.max(0, Math.min(width - 1, x))]);
        const thick = rng.int(9, 15), hh = SKY_HH;
        const top = minTop - 30 - thick - rng.int(10, 50);
        const rect: Rect = { x: x0, y: top - hh - 2, w: iw, h: thick + hh + 3 };
        if (rect.y < 6 || islands.some((o) => overlap(o, rect, 40))) continue;
        const isNoise = seedInt(seed, `island-${k}`);
        // 繩梯下方：照舊逐格往下走過空氣，停下的那格是實心才算地面（樹葉 / 樹幹 → −1，換一欄）
        const groundBelow = (x: number, fromY: number): number => {
          let gy = fromY;
          while (gy < height - 1 && get(x, gy) === T.AIR) gy++;
          return SOLID_LUT[get(x, gy)] === 1 ? gy : -1;
        };
        const { chest, rope } = drawSkyIsland(cv, { x0, iw, top, thick, noiseSeed: isNoise }, rng, groundBelow);
        islands.push(rect);
        structures.push({ kind: 'sky_island', x: rect.x, y: rect.y, w: rect.w, h: rect.h, chest, ...(rope ? { rope } : {}) });
        break;
      }
    }
  })();
  mark('珍寶箱 + 古碑');
  yield '珍寶箱 + 古碑';
  // ── 珍寶（獨特道具）放在難到達的地方 + 古碑（14 篇碑文各放在主題地點） ──────────
  const relics: GenResult['relics'] = [];
  const tablets: GenResult['tablets'] = [];
  (() => {
    const rng = subSeed(seed, 'relics');
    /** 在 r 裡找一格地板：空氣、正下方實心（非平台 / 地城磚）、上方空氣、不在地城裡 */
    const findFloor = (r: Rect, tries = 600, allowDungeon = false): { x: number; y: number } | null => {
      for (let t = 0; t < tries; t++) {
        const x = rng.int(Math.max(2, r.x), Math.max(Math.max(2, r.x) + 1, Math.min(width - 2, r.x + r.w)));
        const y = rng.int(Math.max(2, r.y), Math.max(Math.max(2, r.y) + 1, Math.min(height - 3, r.y + r.h)));
        const i = y * WW + x;
        if (fg[i] !== T.AIR || fg[i - WW] !== T.AIR || !isSolid(fg[i + WW])) continue;
        if (!allowDungeon && wall[i] >= W.DUNGEON_WALL_BLUE) continue;
        if (fg[i + WW] === T.DOOR_CLOSED || fg[i + WW] === T.DOOR_LOCKED || fg[i - 1] === T.CHEST || fg[i + 1] === T.CHEST) continue;
        return { x, y };
      }
      return null;
    };
    const chestSlots = (x: number, y: number): (Stack | null)[] | undefined => world.chests.get(y * WW + x);
    const addTo = (slots: (Stack | null)[] | undefined, item: ItemId): boolean => {
      if (!slots) return false;
      const k = slots.findIndex((s) => s === null);
      slots[k >= 0 ? k : slots.length - 1] = { item, count: 1 };
      return true;
    };
    const caverns = structures.filter((s) => s.kind === 'cavern');
    const relicChest = (item: ItemId, where: string, spot: { x: number; y: number } | null): boolean => {
      if (!spot) return false;
      addChest(spot.x, spot.y, 'relic');
      addTo(chestSlots(spot.x, spot.y), item);
      relics.push({ x: spot.x, y: spot.y, item, where });
      return true;
    };
    const fallback = (item: ItemId): void => {
      for (const c of caverns) if (relicChest(item, 'cavern', findFloor(c))) return;
    };
    // 跳躍靴：浮空島的箱子
    const island = structures.find((s) => s.kind === 'sky_island' && s.chest);
    if (island?.chest && addTo(chestSlots(island.chest.x, island.chest.y), 'jump_boots')) relics.push({ ...island.chest, item: 'jump_boots', where: 'sky_island' });
    else fallback('jump_boots');
    // 疾行靴：最深的裂谷谷底
    const chasms = structures.filter((s) => s.kind === 'chasm').sort((a, b) => b.h - a.h);
    let ok = false;
    for (const c of chasms) if (!ok) ok = relicChest('swift_boots', 'chasm', findFloor({ x: c.x, y: c.y + c.h - 24, w: c.w, h: 34 }));
    if (!ok) fallback('swift_boots');
    // 夜視護符：熔岩深淵的地板（離出生點遠一點）
    let moltenSpot: { x: number; y: number } | null = null;
    for (let t = 0; t < 40 && !moltenSpot; t++) {
      const x = rng.int(60, width - 60);
      if (Math.abs(x - sx) < width * 0.15 || inDz(x, 20)) continue;
      moltenSpot = findFloor({ x: x - 30, y: moltenLine[x] + 4, w: 60, h: height - 10 - moltenLine[x] }, 200);
    }
    if (!relicChest('night_amulet', 'molten', moltenSpot)) fallback('night_amulet');
    // 磁石：第一間密室的箱子
    const sr = secretRooms[0];
    if (sr?.chest && addTo(chestSlots(sr.chest.x, sr.chest.y), 'magnet')) relics.push({ ...sr.chest, item: 'magnet', where: 'secret_room' });
    else fallback('magnet');
    // 指南針 / 深度計：離出生點最近的兩間小屋箱子（早期就拿得到的導航工具，非獨特）
    const cabins = structures.filter((s) => s.kind === 'cabin' && s.chest).sort((a, b) => Math.abs(a.x - sx) - Math.abs(b.x - sx));
    if (cabins[0]?.chest) addTo(chestSlots(cabins[0].chest.x, cabins[0].chest.y), 'compass');
    if (cabins[1]?.chest) addTo(chestSlots(cabins[1].chest.x, cabins[1].chest.y), 'depth_meter');

    // ── 古碑 ──
    const used = new Set<number>();
    const place = (id: number, spot: { x: number; y: number } | null): boolean => {
      if (!spot || used.has(id)) return false;
      if (fg[spot.y * WW + spot.x] !== T.LORE_TABLET) put(spot.x, spot.y, T.LORE_TABLET);
      tablets.push({ x: spot.x, y: spot.y, id });
      used.add(id);
      return true;
    };
    const firstOf = (kind: string): Structure | undefined => structures.find((s) => s.kind === kind);
    const segOf = (b: BiomeId): BiomeSegment | undefined => biomes.find((s) => s.biome === b);
    const near = (p: { x: number; y: number } | null | undefined, rx: number, ry: number): Rect | null => (p ? { x: p.x - rx, y: p.y - ry, w: rx * 2, h: ry * 2 } : null);
    const spotFor = (site: LoreSite): { x: number; y: number } | null => {
      switch (site) {
        case 'spawn': {
          for (let dx = 14; dx < 60; dx++) {
            for (const x of [sx + dx, sx - dx]) {
              const gy = surface[x], ai = (gy - 1) * WW + x;
              if (gy < 3 || !isSolid(fg[gy * WW + x]) || fg[ai - WW] !== T.AIR || fg[ai - 2 * WW] !== T.AIR) continue;
              if (fg[ai] !== T.AIR && fg[ai] !== T.TALL_GRASS && fg[ai] !== T.FLOWER && fg[ai] !== T.BUSH) continue;
              if (fg[ai - 1] === T.WOOD || fg[ai + 1] === T.WOOD) continue;
              fg[ai] = T.AIR;
              return { x, y: gy - 1 };
            }
          }
          return null;
        }
        case 'secret': return sr ? findFloor({ x: sr.x, y: sr.y, w: sr.w, h: sr.h }) : null;
        case 'cabin': { const c = cabins[0]; return c ? findFloor({ x: c.x + 1, y: c.y, w: c.w - 2, h: c.h }) : null; }
        case 'crystal': { const c = firstOf('crystal_cave'); return c ? findFloor(c) : null; }
        case 'mushroom': { const c = firstOf('mushroom_biome'); return c ? findFloor(c) : null; }
        case 'sky': { const c = island; return c ? findFloor({ x: c.x, y: c.y, w: c.w, h: c.h }) : null; }
        case 'molten': return moltenSpot ? findFloor(near(moltenSpot, 20, 6)!) : null;
        case 'mineshaft': { const c = firstOf('mineshaft'); return c ? findFloor({ x: c.x, y: c.y, w: c.w, h: c.h }) : null; }
        case 'snow': case 'desert': {
          const s = segOf(site === 'snow' ? BIOME.SNOW : BIOME.DESERT);
          if (!s) return null;
          const mx = Math.floor((s.x0 + s.x1) / 2);
          return findFloor({ x: s.x0 + 10, y: rockLine[mx], w: s.x1 - s.x0 - 20, h: Math.max(10, deepLine[mx] - rockLine[mx]) }, 1200);
        }
        case 'ruin': { const c = firstOf('ruin'); return c ? findFloor(c) : null; }
        default: return null; // 地城：用地城自己的古碑
      }
    };
    LORE_SITES.forEach((site, id) => {
      if (site.startsWith('dungeon_')) {
        const t = dungeon?.tablets.find((q) => `dungeon_${q.site}` === site);
        if (t) place(id, t);
        return;
      }
      place(id, spotFor(site));
    });
    // 地城裡沒用到的古碑：拿掉（每篇碑文只出現一次）
    for (const t of dungeon?.tablets ?? []) if (!tablets.some((q) => q.x === t.x && q.y === t.y)) put(t.x, t.y, T.AIR);
    // 找不到主題地點的碑文：放在大洞窟的地板
    LORE_SITES.forEach((_, id) => { for (const c of caverns) if (!used.has(id)) place(id, findFloor(c)); });
  })();

  mark('液體');
  yield '液體';
  // ── 液體（生成器 v5）後半：地下湖 / 熔岩 / 蜂巢 + 靜置 ─────────────
  const liq = liquidGen.deep();
  for (const ls of liq.structures) structures.push(ls);
  for (const ls of liq.structures) if (ls.kind === 'oasis') for (let x = ls.x; x < ls.x + ls.w; x++) world.surface[x] = Math.max(world.surface[x], surface[x]);

  mark('地標：每個發現地點的發現物');
  yield '地標：每個發現地點的發現物';
  // ── 地標：每種發現地點放一件看得出地方特色的一次性發現物（見 gen/landmarks.ts） ──
  const landmarks = placeLandmarks(world, structures, surface);

  mark('每欄地表的生態區 ───');
  yield '每欄地表的生態區 ───';
  // ── 每欄地表的生態區 ──────────────────────────────────────
  world.biome.set(colBiome);
  mark('end');
  return { world, spawn, surface, bands, biomes, structures, landforms, dungeonZone, layers, dungeon, tablets, relics, liquidStats: liq.stats, springs: liq.springs, villages, halls, landmarks };
}
