// gen/liquids.ts — 世界生成的液體 pass（生成器 v5）。確定性：只用 Rng / 值雜訊 / 四則與 sqrt。
//   1) 地表：乾湖床注滿水；森林 / 叢林 / 平原的山谷窪地依地表剖面（左右各 50 欄內的最高邊緣）找盆地 → 池塘
//   2) 沙漠綠洲：每個沙漠段挖一個淺碗（底下要夠厚的實心），注水，岸邊長草
//   3) 地下湖：岩層 / 洞穴層隨機挑空氣格 → 往下找地板 → 從地板往上 3–12 格當水位做 flood fill（容量上限；
//      超過就把水位往下調，直到裝得下）；洞穴層有一小部分是熔岩囊
//   4) 熔岩深淵：地形 pass 留下的低窪池（lavaPool）+ 地板上更多淺而寬的熔岩湖（像河）
//   5) 叢林蜂巢：地下叢林挖一個雜訊邊界的橢圓，外殼 2–3 格蜂巢殼、裡面蜂巢牆、下半部注滿蜂蜜
//   flood fill 碰到建築（箱子 / 門 / 床 / 古碑 / 火把 / 木樑 / 繩索 / 平台 / 木板牆 / 地城牆）、樹幹、
//   世界邊緣就整個放棄；淹到的可替換植物 / 藤蔓 / 蜘蛛網清掉。
//   最後用 LiquidSim.settle 把不穩定的邊緣（下方 / 左右還能流的格）靜置，世界載入時就是靜止的。
import type { World } from '../world';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { T, W, SOLID_LUT, tileDef } from '../tiles';
import { Rng, subSeed } from '../rng';
import { vnoise1, seedInt } from '../noise';
import { LiquidSim, SPRING_RATE, type SpringSpec } from '../liquid';

export interface LiquidGenStats {
  ms: number;
  settleMs: number;
  settleTicks: number;
  /** 靜置後還沒退休的活躍格（理想是 0） */
  leftActive: number;
  cells: { water: number; lava: number; honey: number };
  lakes: number; ponds: number; caveLakes: number; lavaLakes: number; hives: number; oases: number;
  /** v6：挖盆地的大地下湖 */
  grandLakes: number;
  /** v6：泉水瀑布 / 熔岩瀑布 */
  waterfalls: number; lavafalls: number;
}
export interface LiquidStructure { kind: 'pond' | 'oasis' | 'hive' | 'underground_lake' | 'waterfall' | 'lavafall'; x: number; y: number; w: number; h: number; }
export interface LiquidGenCtx {
  world: World;
  seed: string | number;
  /** 每欄地表（第一個實心格 y；會被綠洲改寫） */
  surface: Int16Array;
  layers: { rock: Int16Array; deep: Int16Array; molten: Int16Array };
  colBiome: Uint8Array;
  biomes: readonly { biome: number; x0: number; x1: number }[];
  /** 乾湖床（碗的左右緣 + 湖面高度） */
  lakeBeds: readonly { x0: number; x1: number; level: number }[];
  /** 熔岩深淵地形 pass 留下的低窪池格（tile index） */
  lavaPool: readonly number[];
  spawnX: number;
  /** 不放液體的欄範圍（地城預留區、海灘） */
  avoid: (x: number) => boolean;
  /** 已有的結構矩形（蜂巢 / 綠洲避開；呼叫當下的清單） */
  occupied: () => readonly { x: number; y: number; w: number; h: number }[];
  /** 液體絕對不能進去的格（村落 / 矮人地廳 / 地廳隧道 + 緩衝區）：注水範圍碰到就整個放棄 */
  protect?: (x: number, y: number) => boolean;
}

const BIOME_DESERT = 1, BIOME_SNOW = 2, BIOME_JUNGLE = 3;
/** flood fill 碰到就放棄的 tile（建築 / 樹幹） */
const FORBID = new Uint8Array(256);
for (const id of [T.CHEST, T.LOCKED_CHEST, T.DOOR_CLOSED, T.DOOR_OPEN, T.DOOR_LOCKED, T.BED_HEAD, T.BED_FOOT, T.LORE_TABLET,
  T.TORCH, T.BEAM, T.ROPE, T.PLATFORM, T.WORKBENCH, T.FURNACE, T.ANVIL, T.BOOKSHELF, T.CANDLE, T.LANTERN, T.CHAIN, T.BANNER, T.WOOD]) FORBID[id] = 1;
const FORBID_WALL = new Uint8Array(256);
for (const id of [W.PLANK_WALL, W.DUNGEON_WALL_BLUE, W.DUNGEON_WALL_GREEN, W.DUNGEON_WALL_PINK]) FORBID_WALL[id] = 1;
/** 淹到就清掉的植物 */
const DROWN = new Uint8Array(256);
for (const t of [T.FLOWER, T.TALL_GRASS, T.BUSH, T.DEAD_BUSH, T.SNOW_SHRUB, T.FERN, T.VINE, T.COBWEB, T.LEAVES]) DROWN[t] = 1;

/**
 * 液體生成分兩段：surface()（湖床 / 池塘 / 綠洲）在種樹與地表裝飾之前跑（樹與花草避開水面），
 * deep()（地下湖 / 熔岩 / 蜂巢 + 靜置）在全部地形都完成之後跑。
 */
export function createLiquidGen(ctx: LiquidGenCtx): { surface(): void; deep(): { stats: LiquidGenStats; structures: LiquidStructure[]; springs: SpringSpec[] } } {
  let msAcc = 0;
  const { world, seed, surface, layers, colBiome } = ctx;
  const { width, height, fg, wall, liquid, liquidType } = world;
  const WW = width, N = width * height;
  const mark = new Uint8Array(N);
  const structures: LiquidStructure[] = [];
  const stats: LiquidGenStats = {
    ms: 0, settleMs: 0, settleTicks: 0, leftActive: 0, cells: { water: 0, lava: 0, honey: 0 },
    lakes: 0, ponds: 0, caveLakes: 0, lavaLakes: 0, hives: 0, oases: 0, grandLakes: 0, waterfalls: 0, lavafalls: 0,
  };
  const placed: number[] = [];

  /**
   * 從 (sx,sy) 起 4 連通 flood fill：非實心、沒有液體、y ≥ level 的格。超過 cap、碰到禁區、碰到世界邊 → null。
   * 回傳 tile index 清單（不寫入世界）。
   */
  const flood = (sx: number, sy: number, level: number, cap: number, allowDecor = true): number[] | null => {
    if (sx <= 1 || sx >= width - 2 || sy < level || sy >= height - 1) return null;
    const s0 = sy * WW + sx;
    if (SOLID_LUT[fg[s0]] || liquid[s0]) return null;
    const out: number[] = [s0];
    mark[s0] = 1;
    let ok = true;
    for (let k = 0; k < out.length && ok; k++) {
      const i = out[k], x = i % WW, y = (i - x) / WW;
      const id = fg[i];
      if (FORBID[id] || FORBID_WALL[wall[i]] || (!allowDecor && id !== T.AIR) || ctx.protect?.(x, y)) { ok = false; break; }
      if (x <= 1 || x >= width - 2 || y >= height - 2) { ok = false; break; }
      const nb = [i - 1, i + 1, i + WW, i - WW];
      for (let q = 0; q < 4; q++) {
        const j = nb[q];
        if (q === 3 && y - 1 < level) continue;
        if (mark[j] || SOLID_LUT[fg[j]] || liquid[j]) continue;
        mark[j] = 1;
        out.push(j);
        if (out.length > cap) { ok = false; break; }
      }
    }
    for (const i of out) mark[i] = 0;
    return ok ? out : null;
  };
  const fill = (cells: number[], type: number): void => {
    for (const i of cells) {
      if (DROWN[fg[i]]) fg[i] = T.AIR;
      liquid[i] = LIQ_MAX; liquidType[i] = type;
      placed.push(i);
    }
  };
  /** 從 (x, floor) 往上 depth 格當水位；裝不下就降低水位（往下）再試 */
  const fitPocket = (x: number, floorY: number, depth: number, cap: number, minCells: number): number[] | null => {
    for (let lv = floorY - depth; lv < floorY; lv++) {
      const c = flood(x, floorY - 1, lv, cap);
      if (c) return c.length >= minCells ? c : null;
    }
    return null;
  };
  /**
   * v6：在地板 (cx, floorY = 第一個實心格) 往下挖一個碗形盆地（半寬 halfW、中央深 depth，邊緣有雜訊），
   * 只挖天然岩土（okTile），每欄底下至少留 3 格實心（不挖穿到下面的洞）。回傳還原用的 [index, 原 tile] 清單與中央深度。
   */
  const NATURAL = new Uint8Array(256);
  for (const id of [T.DIRT, T.STONE, T.SAND, T.CLAY, T.GRAVEL, T.GRANITE, T.MARBLE, T.SANDSTONE, T.SNOW, T.ICE, T.MUD,
    T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE, T.DEEP_STONE, T.BASALT, T.ASH, T.OBSIDIAN, T.MAGMA_ROCK, T.MUSHROOM_GRASS, T.JUNGLE_GRASS, T.GRASS]) NATURAL[id] = 1;
  const carveBowl = (cx: number, floorY: number, halfW: number, depth: number, ns: number): { undo: [number, number][]; center: number } => {
    const undo: [number, number][] = [];
    let center = 0;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      if (x < 3 || x >= width - 3) continue;
      const t = (x - cx) / (halfW + 0.5);
      let d = Math.round(depth * (1 - t * t) + (vnoise1(x, 5, ns) - 0.5) * 2);
      while (d > 0) {
        let ok = floorY + d + 3 < height - 7;
        for (let y = floorY; y < floorY + d + 3 && ok; y++) {
          const i = y * WW + x;
          if (!NATURAL[fg[i]] && fg[i] !== T.AIR) ok = false;
          else if (y >= floorY + d && !SOLID_LUT[fg[i]]) ok = false;
          // 挖開的格不能貼著別的液體（會把旁邊的湖接通、靜置不下來）
          else if (y < floorY + d && (liquid[i - 1] || liquid[i + 1] || liquid[i + WW] || liquid[i - WW] || liquid[i])) ok = false;
        }
        if (ok) break;
        d--;
      }
      for (let y = floorY; y < floorY + d; y++) {
        const i = y * WW + x;
        if (fg[i] === T.AIR) continue;
        undo.push([i, fg[i]]);
        fg[i] = T.AIR;
      }
      // 地板挖掉了：上面站著的物件（陶罐 / 石筍 / 蘑菇…）一起拿掉
      const above = (floorY - 1) * WW + x;
      if (d > 0 && fg[above] !== T.AIR && !SOLID_LUT[fg[above]] && tileDef(fg[above]).support === 'floor') { undo.push([above, fg[above]]); fg[above] = T.AIR; }
      if (x === cx) center = Math.max(0, d);
    }
    return { undo, center };
  };
  const undoBowl = (undo: [number, number][]): void => { for (const [i, f] of undo) fg[i] = f; };
  /** 從 (x, y) 往下找地板（第一個實心格）；max 格內找不到 → -1 */
  const floorBelow = (x: number, y: number, max: number): number => {
    let k = 0;
    while (y < height - 2 && !SOLID_LUT[fg[(y + 1) * WW + x]] && k++ < max) y++;
    return k >= max ? -1 : y + 1;
  };
  const near = (x: number, y: number, w: number, h: number, m: number): boolean =>
    ctx.occupied().some((o) => x - m < o.x + o.w && x + w + m > o.x && y - m < o.y + o.h && y + h + m > o.y)
    || structures.some((o) => x - m < o.x + o.w && x + w + m > o.x && y - m < o.y + o.h && y + h + m > o.y);
  const bbox = (cells: number[]): { x: number; y: number; w: number; h: number } => {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of cells) { const x = i % WW, y = (i - x) / WW; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const spawnOk = (x0: number, x1: number): boolean => x1 < ctx.spawnX - 24 || x0 > ctx.spawnX + 24;

  const surfacePhase = (): void => {
  const t0 = performance.now();
  // ── 1) 地表：乾湖床注滿 ─────────────────────────────────
  for (const lb of ctx.lakeBeds) {
    const mx = (lb.x0 + lb.x1) >> 1;
    if (colBiome[mx] === BIOME_SNOW || ctx.avoid(mx)) continue;
    // 碗底最深那欄
    let bx = mx;
    for (let x = lb.x0; x < lb.x1; x++) if (surface[x] > surface[bx]) bx = x;
    const c = flood(bx, surface[bx] - 1, lb.level + 1, 6000);
    if (c && c.length > 20) { fill(c, LIQ.WATER); stats.lakes++; }
  }

  // ── 1b) 山谷池塘：地表剖面的局部盆地 ───────────────────────
  {
    const rng = subSeed(seed, 'liquid-ponds');
    const R = 50;
    const left = new Int16Array(width), right = new Int16Array(width);
    // left[x] = x 左邊 R 欄內最高（y 最小）的地表；right 同理
    for (let x = 0; x < width; x++) { let m = 32767; for (let k = Math.max(0, x - R); k <= x; k++) if (surface[k] < m) m = surface[k]; left[x] = m; }
    for (let x = 0; x < width; x++) { let m = 32767; for (let k = x; k <= Math.min(width - 1, x + R); k++) if (surface[k] < m) m = surface[k]; right[x] = m; }
    let x = 2;
    while (x < width - 2) {
      const lvl = Math.max(left[x], right[x]); // 兩側邊緣較低的那個 = 水位
      if (surface[x] - lvl < 1) { x++; continue; }
      // 一段連續、同水位附近的盆地欄
      let x1 = x, deep = 0, bx = x;
      while (x1 < width - 2 && surface[x1] - Math.max(left[x1], right[x1]) >= 1) {
        const d = surface[x1] - Math.max(left[x1], right[x1]);
        if (d > deep) { deep = d; bx = x1; }
        x1++;
      }
      const wdt = x1 - x, b = colBiome[bx];
      const okBiome = b !== BIOME_SNOW && b !== BIOME_DESERT;
      if (okBiome && wdt >= 6 && wdt <= 110 && deep >= 2 && !ctx.avoid(x) && !ctx.avoid(x1) && spawnOk(x, x1) && rng.next() < 0.7) {
        const level = Math.max(left[bx], right[bx]);
        const c = flood(bx, surface[bx] - 1, level, 5000);
        if (c && c.length >= 10) {
          fill(c, LIQ.WATER);
          stats.ponds++;
          const bb = bbox(c);
          structures.push({ kind: 'pond', ...bb });
        }
      }
      x = x1 + 1;
    }
  }

  // ── 2) 沙漠綠洲 ───────────────────────────────────────
  {
    const rng = subSeed(seed, 'liquid-oasis');
    const ns = seedInt(seed, 'oasis-edge');
    for (const seg of ctx.biomes) {
      if (seg.biome !== BIOME_DESERT || seg.x1 - seg.x0 < 60) continue;
      for (let tries = 0; tries < 12; tries++) {
        const ow = rng.int(16, 27), x0 = rng.int(seg.x0 + 15, Math.max(seg.x0 + 16, seg.x1 - ow - 15)), x1 = x0 + ow;
        if (ctx.avoid(x0) || ctx.avoid(x1) || !spawnOk(x0, x1)) continue;
        // 地面要算平（左右緣高度差 ≤ 3）
        if (Math.abs(surface[x0] - surface[x1 - 1]) > 3) continue;
        const depth = rng.int(4, 7);
        // 碗底下要有至少 4 格實心
        let solidOk = true;
        for (let x = x0; x < x1 && solidOk; x++) for (let k = 0; k < depth + 4; k++) if (!SOLID_LUT[fg[(surface[x] + k) * WW + x]]) { solidOk = false; break; }
        if (!solidOk || near(x0, surface[x0] - 8, ow, depth + 12, 10)) continue;
        const rim = Math.max(surface[x0], surface[x1 - 1]);
        // 先記下要動的格，注水失敗就整個還原（不留乾坑）
        const undo: [number, number, number][] = [];
        const surf0 = surface.slice(x0, x1);
        for (let x = x0; x < x1; x++) for (let y = Math.min(surface[x], rim); y <= rim + depth + 2; y++) { const i = y * WW + x; undo.push([i, fg[i], wall[i]]); }
        for (let x = x0; x < x1; x++) {
          const t = ((x - x0) + 0.5) / ow * 2 - 1;
          const d = Math.round(depth * (1 - t * t) + (vnoise1(x, 4, ns) - 0.5) * 1.5);
          const bottom = rim + Math.max(0, d);
          for (let y = Math.min(surface[x], rim); y < bottom; y++) { fg[y * WW + x] = T.AIR; wall[y * WW + x] = W.NONE; }
          // 碗底一層沙（保持沙漠樣貌）
          if (bottom > rim) fg[bottom * WW + x] = T.SAND;
          surface[x] = Math.max(surface[x], bottom);
        }
        const c = flood((x0 + x1) >> 1, surface[(x0 + x1) >> 1] - 1, rim, 2500);
        if (!c) {
          for (const [i, f, wl] of undo) { fg[i] = f; wall[i] = wl; }
          surface.set(surf0, x0);
          continue;
        }
        fill(c, LIQ.WATER);
        // 岸邊：草叢 / 蕨類
        for (const sx of [x0 - 3, x0 - 2, x0 - 1, x1, x1 + 1, x1 + 2]) {
          const sy = surface[sx] - 1;
          if (sx > 0 && sx < width && fg[sy * WW + sx] === T.AIR && SOLID_LUT[fg[(sy + 1) * WW + sx]] && rng.next() < 0.7) fg[sy * WW + sx] = rng.next() < 0.5 ? T.TALL_GRASS : T.FERN;
        }
        stats.oases++;
        structures.push({ kind: 'oasis', ...bbox(c) });
        break;
      }
    }
  }

  msAcc += performance.now() - t0;
  };

  const deepPhase = (): { stats: LiquidGenStats; structures: LiquidStructure[]; springs: SpringSpec[] } => {
  const t0 = performance.now();
  // ── 3a) v6 大地下湖：在洞穴裡夠寬的地板上挖一個碗形盆地（深 6–14 格），水位再高出地板 4–12 格 → 2000–6500 格 ──
  {
    const rng = subSeed(seed, 'liquid-grand-lakes');
    const ns = seedInt(seed, 'grand-lake-edge');
    const want = Math.max(1, Math.round(width / 600));
    let made = 0;
    for (let tries = 0; tries < want * 70 && made < want; tries++) {
      const x = rng.int(60, width - 60);
      if (ctx.avoid(x)) continue;
      const top = layers.rock[x] + 10, bot = layers.molten[x] - 30;
      if (bot <= top) continue;
      const y = rng.int(top, bot);
      if (SOLID_LUT[fg[y * WW + x]] || liquid[y * WW + x]) continue;
      const fy = floorBelow(x, y, 50);
      if (fy < 0) continue;
      // 地板要夠寬：左右各欄的地板高度和這裡差 ≤ 3 格（起伏的洞穴地板也算）
      const floorNear = (xx: number): number => {
        for (let yy = fy - 4; yy <= fy + 3; yy++) if (SOLID_LUT[fg[yy * WW + xx]] && !SOLID_LUT[fg[(yy - 1) * WW + xx]]) return yy;
        return -1;
      };
      let l = x, r = x;
      while (l > x - 60 && floorNear(l - 1) >= 0) l--;
      while (r < x + 60 && floorNear(r + 1) >= 0) r++;
      if (r - l < 26) continue;
      const cx = (l + r) >> 1, halfW = Math.min(44, (r - l) >> 1);
      if (near(cx - halfW, fy - 16, halfW * 2, 32, 6) || ctx.avoid(cx - halfW) || ctx.avoid(cx + halfW)) continue;
      const { undo, center } = carveBowl(cx, fy, halfW, rng.int(8, 17), ns + tries);
      if (center < 4) { undoBowl(undo); continue; }
      const c = fitPocket(cx, fy + center, center + rng.int(5, 14), 6500, 1800);
      if (!c) { undoBowl(undo); continue; }
      fill(c, LIQ.WATER);
      made++; stats.caveLakes++; stats.grandLakes++;
      structures.push({ kind: 'underground_lake', ...bbox(c) });
    }
  }
  // ── 3) 地下湖 / 洞穴層熔岩囊 ───────────────────────────────
  {
    const rng = subSeed(seed, 'liquid-caves');
    const want = Math.round(N * 0.0000165);
    let made = 0;
    for (let tries = 0; tries < want * 10 && made < want; tries++) {
      const x = rng.int(4, width - 4);
      if (ctx.avoid(x)) continue;
      const top = layers.rock[x] + 6, bot = layers.molten[x] - 8;
      if (bot <= top) continue;
      let y = rng.int(top, bot);
      if (SOLID_LUT[fg[y * WW + x]]) continue;
      let k = 0;
      while (y < height - 2 && !SOLID_LUT[fg[(y + 1) * WW + x]] && k++ < 40) y++;
      if (k >= 40 || liquid[y * WW + x]) continue;
      const floorY = y + 1;
      const deepLayer = floorY >= layers.deep[x];
      const lava = deepLayer && colBiome[x] !== BIOME_JUNGLE && rng.next() < 0.14;
      const big = rng.next() < 0.3;
      const c = fitPocket(x, floorY, rng.int(3, big ? 14 : 9), big ? 3200 : 1400, 14);
      if (!c) continue;
      fill(c, lava ? LIQ.LAVA : LIQ.WATER);
      made++;
      if (!lava && c.length > 250) {
        stats.caveLakes++;
        if (structures.filter((s) => s.kind === 'underground_lake').length < 8) structures.push({ kind: 'underground_lake', ...bbox(c) });
      }
    }
  }

  // ── 4) 熔岩深淵：地形 pass 的低窪池 + 地板上的熔岩湖 ─────────────
  // 低窪池：每格當種子，往下找地板、以那一欄的池面為水位做有上限的 flood fill（裝不下就降水位）→ 一定封得住
  for (const i of ctx.lavaPool) {
    if (SOLID_LUT[fg[i]] || liquid[i]) continue;
    const x = i % WW;
    let y = (i - x) / WW;
    const top = y;
    while (y < height - 2 && !SOLID_LUT[fg[(y + 1) * WW + x]]) y++;
    const c = fitPocket(x, y + 1, y + 1 - top, 9000, 4);
    if (c) { fill(c, LIQ.LAVA); stats.lavaLakes++; }
  }
  // v6：地板上的熔岩湖 / 熔岩河先挖碗形盆地（深 4–12 格、寬 14–70 格）再注滿，不再是一格厚的寬薄片
  {
    const rng = subSeed(seed, 'liquid-molten');
    const ns = seedInt(seed, 'lava-basin-edge');
    const want = Math.round(width / 90);
    let made = 0;
    for (let tries = 0; tries < want * 10 && made < want; tries++) {
      const x = rng.int(40, width - 40);
      if (ctx.avoid(x)) continue;
      const y = rng.int(layers.molten[x], height - 8);
      if (SOLID_LUT[fg[y * WW + x]] || liquid[y * WW + x]) continue;
      const fy = floorBelow(x, y, 60);
      if (fy < 0 || liquid[(fy - 1) * WW + x]) continue;
      const river = rng.next() < 0.3;
      const halfW = river ? rng.int(20, 36) : rng.int(7, 18);
      const { undo, center } = carveBowl(x, fy, halfW, rng.int(4, 13), ns + tries);
      if (center < 4) { undoBowl(undo); continue; }
      const c = fitPocket(x, fy + center, center, 7000, 40);
      if (!c) { undoBowl(undo); continue; }
      fill(c, LIQ.LAVA);
      for (const [i] of undo) {
        // 盆地底：發光熔岩石
        const b = i + WW;
        if (b < N && (fg[b] === T.ASH || fg[b] === T.BASALT) && !liquid[b]) fg[b] = T.MAGMA_ROCK;
      }
      made++; stats.lavaLakes++;
    }
  }

  // ── 5) 叢林蜂巢 ───────────────────────────────────────
  {
    const rng = subSeed(seed, 'liquid-hives');
    const ns = seedInt(seed, 'hive-edge');
    for (const seg of ctx.biomes) {
      if (seg.biome !== BIOME_JUNGLE || seg.x1 - seg.x0 < 50) continue;
      const count = seg.x1 - seg.x0 > 260 ? 2 : 1;
      let made = 0;
      for (let tries = 0; tries < 20 && made < count; tries++) {
        const rx = rng.int(10, 16), ry = rng.int(7, 11);
        const cx = rng.int(seg.x0 + rx + 8, Math.max(seg.x0 + rx + 9, seg.x1 - rx - 8));
        const top = layers.rock[cx] + ry + 4, bot = layers.deep[cx] + 20;
        if (bot <= top || ctx.avoid(cx - rx) || ctx.avoid(cx + rx)) continue;
        const cy = rng.int(top, bot);
        if (near(cx - rx - 3, cy - ry - 3, rx * 2 + 6, ry * 2 + 6, 4)) continue;
        // 外殼厚度 2–3（依雜訊），內部空氣 + 蜂巢牆
        const thick = 2.5;
        for (let y = cy - ry - 4; y <= cy + ry + 4; y++) for (let x = cx - rx - 4; x <= cx + rx + 4; x++) {
          if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          const d = Math.sqrt(dx * dx + dy * dy);
          const edge = 1 + (vnoise1((x - cx) + (y - cy) * 5, 6, ns) - 0.5) * 0.14;
          const i = y * WW + x;
          if (d <= edge) { fg[i] = T.AIR; wall[i] = W.HIVE_WALL; liquid[i] = 0; liquidType[i] = 0; }
          else if (d <= edge + thick / Math.min(rx, ry)) { fg[i] = T.HIVE; wall[i] = W.HIVE_WALL; liquid[i] = 0; liquidType[i] = 0; }
        }
        // 內部幾塊垂下的蜂巢（像蜂房隔間）
        for (let k = 0; k < 3; k++) {
          const px = cx - rx + 3 + rng.int(0, rx * 2 - 6), len = rng.int(2, Math.max(3, ry));
          for (let y = cy - ry; y < cy - ry + len; y++) if (fg[y * WW + px] === T.AIR) fg[y * WW + px] = T.HIVE;
        }
        // 下半部注滿蜂蜜
        const level = cy + Math.round(ry * 0.15);
        const c = flood(cx, cy + ry - 2, level, rx * ry * 4, true);
        if (c) fill(c, LIQ.HONEY);
        made++; stats.hives++;
        structures.push({ kind: 'hive', x: cx - rx - 3, y: cy - ry - 3, w: rx * 2 + 7, h: ry * 2 + 7 });
      }
    }
  }

  // ── 6) v6 泉水瀑布：崖面 / 洞壁嵌一顆泉水石（無限源），水柱落進崖腳挖出的小水潭，
  //    水潭遠端（上方是空氣的）碗緣換成滲水石排掉溢流 → 一直流、總量有上限（liquid.ts）。熔岩深淵另有幾道熔岩瀑布。
  const springs: SpringSpec[] = [];
  {
    const rng = subSeed(seed, 'liquid-springs');
    const ns = seedInt(seed, 'spring-pool-edge');
    /** 從空氣格 (x,y) 往左或右走到第一個實心格 = 崖面 / 洞壁，回傳 [牆 x, 朝外方向] */
    const findFace = (x: number, y: number): [number, 1 | -1] | null => {
      if (SOLID_LUT[fg[y * WW + x]] || liquid[y * WW + x]) return null;
      const walk: 1 | -1 = rng.next() < 0.5 ? 1 : -1;
      for (let k = 1; k < 50; k++) {
        const xx = x + walk * k;
        if (xx < 2 || xx >= width - 2) return null;
        if (SOLID_LUT[fg[y * WW + xx]]) return [xx, (-walk) as 1 | -1];
      }
      return null;
    };
    /** 在 (x,y) 的崖面朝 dir 放一道瀑布；成功回傳 true */
    const tryFall = (x: number, y: number, dir: 1 | -1, type: number): boolean => {
      const o = x + dir;
      if (x < 60 || x > width - 60 || y < 4 || y > height - 30 || ctx.avoid(x) || ctx.avoid(o)) return false;
      const i = y * WW + x;
      if (!NATURAL[fg[i]] || !SOLID_LUT[fg[i - dir]] || (!SOLID_LUT[fg[i - WW]] && !SOLID_LUT[fg[i + WW]])) return false;
      if (SOLID_LUT[fg[y * WW + o]] || liquid[y * WW + o] || FORBID_WALL[wall[y * WW + o]]) return false;
      // 往下的落差
      let h = 0;
      while (y + 1 + h < height - 8 && !SOLID_LUT[fg[(y + 1 + h) * WW + o]]) { if (liquid[(y + 1 + h) * WW + o]) return false; h++; }
      if (h < 6 || h > (type === LIQ.LAVA ? 75 : 42)) return false;
      const fy = y + 1 + h;
      if (!NATURAL[fg[fy * WW + o]]) return false;
      const halfW = rng.int(4, 8);
      const cx = o + dir * (halfW - 2);
      for (let k = 0; k <= halfW * 2; k++) {
        const xx = o + dir * k;
        if (!SOLID_LUT[fg[fy * WW + xx]] && !SOLID_LUT[fg[(fy + 1) * WW + xx]]) return false;
      }
      if (near(Math.min(x, cx - halfW) - 2, y - 2, halfW * 2 + 6, fy - y + 10, 3)) return false;
      const { undo, center } = carveBowl(cx, fy, halfW, rng.int(4, 8), ns + x);
      if (center < 3) { undoBowl(undo); return false; }
      const c = fitPocket(cx, fy + center, center, 500, 10);
      if (!c) { undoBowl(undo); return false; }
      // 兩側碗緣：從水潭往外第一個在 fy 列是實心的格；上方是空氣 → 換成滲水石
      let bx0 = 1e9, bx1 = -1, by1 = fy;
      for (const q of c) { const qx = q % WW, qy = (q - qx) / WW; if (qx < bx0) bx0 = qx; if (qx > bx1) bx1 = qx; if (qy > by1) by1 = qy; }
      const drains: { x: number; y: number }[] = [];
      for (const rx of [bx0 - 1, bx1 + 1]) {
        const ri = fy * WW + rx;
        if (!SOLID_LUT[fg[ri]]) { undoBowl(undo); return false; }
        if (!SOLID_LUT[fg[ri - WW]]) {
          if (!NATURAL[fg[ri]]) { undoBowl(undo); return false; }
          drains.push({ x: rx, y: fy });
        }
      }
      if (!drains.length) { undoBowl(undo); return false; }
      fill(c, type);
      fg[i] = type === LIQ.LAVA ? T.LAVA_SPRING : T.SPRING;
      for (const d of drains) fg[d.y * WW + d.x] = T.DRAIN;
      const box = { x0: Math.min(x, bx0) - 3, y0: y - 2, x1: Math.max(x, bx1) + 4, y1: by1 + 4 };
      const cap = c.length * LIQ_MAX + LIQ_MAX * (h + (bx1 - bx0) + 8) + (SPRING_RATE[type] ?? 20) * 8;
      springs.push({ x, y, type, box, cap, drains });
      structures.push({ kind: type === LIQ.LAVA ? 'lavafall' : 'waterfall', x: box.x0, y: box.y0, w: box.x1 - box.x0, h: box.y1 - box.y0 });
      if (type === LIQ.LAVA) stats.lavafalls++; else stats.waterfalls++;
      return true;
    };
    // 地表懸崖：上方地表比旁邊高 ≥ 6 格的崖面，泉水在崖頂下 2 格
    let surf = 0;
    for (let k = 0; k < width && surf < Math.max(1, Math.round(width / 1100)); k++) {
      const x = rng.int(80, width - 80);
      for (const dir of [1, -1] as const) {
        if (surface[x + dir] - surface[x] < 6 || !spawnOk(x - 30, x + 30)) continue;
        if (tryFall(x, surface[x] + 2, dir, LIQ.WATER)) { surf++; break; }
      }
    }
    // 洞壁：岩層 ~ 洞穴層
    const wantCave = Math.max(1, Math.round(width / 380));
    for (let tries = 0, made = 0; tries < wantCave * 400 && made < wantCave; tries++) {
      const x = rng.int(70, width - 70);
      const y = rng.int(layers.rock[x] + 4, Math.max(layers.rock[x] + 5, layers.molten[x] - 20));
      const f = findFace(x, y);
      if (f && tryFall(f[0], y, f[1], LIQ.WATER)) made++;
    }
    // 熔岩深淵的熔岩瀑布
    const wantLava = Math.max(1, Math.round(width / 900));
    for (let tries = 0, made = 0; tries < wantLava * 3000 && made < wantLava; tries++) {
      const x = rng.int(70, width - 70);
      const y = rng.int(layers.molten[x], height - 30);
      const f = findFace(x, y);
      if (f && tryFall(f[0], y, f[1], LIQ.LAVA)) made++;
    }
  }

  // ── 靜置：只把還能流動的邊緣格排入，跑到沒有活躍格 ──────────────
  const sim = new LiquidSim(world, { budget: Infinity, cap: 1 << 18 });
  for (const i of placed) {
    if (!liquid[i]) continue;
    const below = i + WW;
    const open = (j: number): boolean => !SOLID_LUT[fg[j]] && (liquid[j] < LIQ_MAX || liquidType[j] !== liquidType[i]);
    if (open(below) || open(i - 1) || open(i + 1)) { const x = i % WW; sim.add(x, (i - x) / WW); }
  }
  const st = sim.settle(1500);
  stats.settleMs = st.ms; stats.settleTicks = st.ticks; stats.leftActive = sim.activeCount;
  world.onTileChange = null;
  // 靜置時的反應（黑曜石）不算玩家修改
  world.modifiedChunks.clear(); world.liquidModified.clear();
  world.drainDirty(); world.drainLiquidDirty();
  for (let i = 0; i < N; i++) {
    if (!liquid[i]) continue;
    const t = liquidType[i];
    if (t === LIQ.WATER) stats.cells.water++; else if (t === LIQ.LAVA) stats.cells.lava++; else if (t === LIQ.HONEY) stats.cells.honey++;
  }
  stats.ms = msAcc + performance.now() - t0;
  return { stats, structures, springs };
  };
  void tileDef;
  return { surface: surfacePhase, deep: deepPhase };
}

export { Rng };
