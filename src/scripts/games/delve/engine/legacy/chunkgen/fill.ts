// fill.ts — 外圍生成器 v0 寫格子（B9）：海 / 沙灘 / 四種生態的表層、深度層（泥土 / 岩層 / 深層岩 / 玄武岩 + 各自的牆）、
// 洞穴（義大利麵 + 洞穴層大洞窟 + 地表入口）、熔岩深淵的熔岩、礦、樹 / 仙人掌。
// 每一格只由 (seed, x, y) 決定：所有雜訊都是 engine/noise.ts 的值雜訊（ColNoise 是同一個公式、只把格點值沿 y 快取），
// 跨欄的東西（樹冠）由「掃 [x0 − 3, x1 + 3) 的樹根、只畫進 [x0, x1)」保證與先填哪一欄無關。
// 本資料夾的檔案（測試以外）不得出現連續兩個星號（測試會 grep），註解一律用 //。
import { seedInt, hash2, vnoise1 } from '../../noise';
import { T, W } from '../../tiles';
import { LIQ, LIQ_MAX } from '../../liquidKind';
import { BIOME } from '../../world';
import { li, type Column } from '../../column';
import { OuterProfile, ZONE_SEA, ZONE_BEACH, ZONE_LAND, type ColumnInfo } from './profile';

const smooth = (t: number): number => t * t * (3 - 2 * t);

// vnoise2(x, y, cell, s) 固定 x、沿 y 取樣：與 noise.ts 的 vnoise2 逐位元相同（同樣的運算順序），只是格點雜湊在同一格內重用
export class ColNoise {
  private fx = 0; private gx = 0; private sx = 0;
  private gy = 0x7fffffff;
  private a = 0; private b = 0; private c = 0; private d = 0;
  constructor(readonly cell: number, readonly s: number) {}
  setX(x: number): void {
    this.fx = x / this.cell;
    this.gx = Math.floor(this.fx);
    this.sx = smooth(this.fx - this.gx);
    this.gy = 0x7fffffff;
  }
  at(y: number): number {
    const fy = y / this.cell, gy = Math.floor(fy);
    if (gy !== this.gy) {
      const gx = this.gx, s = this.s;
      this.gy = gy;
      this.a = hash2(gx, gy, s); this.b = hash2(gx + 1, gy, s);
      this.c = hash2(gx, gy + 1, s); this.d = hash2(gx + 1, gy + 1, s);
    }
    const sx = this.sx, sy = smooth(fy - gy), a = this.a, b = this.b, c = this.c, d = this.d;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

// 義大利麵洞穴：|vnoise2(x, y, 48) − 0.5| < SPAG_THR（越深越寬，到熔岩線加 SPAG_GROW）
const SPAG_CELL = 48, SPAG_THR = 0.035, SPAG_GROW = 0.015;
// 洞穴層大洞窟：fbm2(x, y, 64) > CAVERN_THR
const CAVERN_CELL = 64, CAVERN_THR = 0.68;
// 地表入口：vnoise1(x, 40) > ENTRANCE_THR 的欄，義大利麵從地表就開始挖（其他地方地表下 6 格內不挖）
const ENTRANCE_CELL = 40, ENTRANCE_THR = 0.85, NO_DIG = 6;
// 熔岩深淵：洞底在熔岩線下 LAVA_BELOW 格以下的空氣填熔岩
const LAVA_BELOW = 40;
// 礦：vnoise2(x, y, 6) > 門檻（深度層越厚的礦門檻越高，每層的礦量差不多）
const ORE_CELL = 6, THR_CU = 0.76, THR_FE = 0.83, THR_AG = 0.86, THR_AU = 0.88;
// 樹：hash2(x, 0) < 機率、而且是左右各 3 格內最小的（→ 樹根間距 ≥ 4）
const TREE_REACH = 3;
const P_TREE_FOREST = 0.3, P_TREE_JUNGLE = 0.45, P_CACTUS = 0.25;

// 一格是不是「天然實心」（洞穴 / 礦只動這些）
const NATURAL = new Uint8Array(256);
for (const t of [T.DIRT, T.GRASS, T.STONE, T.SAND, T.SANDSTONE, T.SNOW, T.MUD, T.JUNGLE_GRASS, T.DEEP_STONE, T.BASALT]) NATURAL[t] = 1;

export class OuterFiller {
  private readonly spag: ColNoise;
  private readonly cav1: ColNoise;
  private readonly cav2: ColNoise;
  private readonly oreCu: ColNoise;
  private readonly oreFe: ColNoise;
  private readonly oreAg: ColNoise;
  private readonly oreAu: ColNoise;
  private readonly sEnt: number;
  private readonly sTree: number;
  private readonly sCactus: number;

  constructor(seed: string, readonly profile: OuterProfile) {
    const sCave = seedInt(seed, 'outer-cave'), sCavern = seedInt(seed, 'outer-cavern');
    this.spag = new ColNoise(SPAG_CELL, sCave);
    // fbm2(x, y, cell, s) = vnoise2(cell, s) × 0.68 + vnoise2(cell × 0.4, s + 7) × 0.32
    this.cav1 = new ColNoise(CAVERN_CELL, sCavern);
    this.cav2 = new ColNoise(CAVERN_CELL * 0.4, sCavern + 7);
    this.oreCu = new ColNoise(ORE_CELL, seedInt(seed, 'outer-ore-copper'));
    this.oreFe = new ColNoise(ORE_CELL, seedInt(seed, 'outer-ore-iron'));
    this.oreAg = new ColNoise(ORE_CELL, seedInt(seed, 'outer-ore-silver'));
    this.oreAu = new ColNoise(ORE_CELL, seedInt(seed, 'outer-ore-gold'));
    this.sEnt = seedInt(seed, 'outer-entrance');
    this.sTree = seedInt(seed, 'outer-tree');
    this.sCactus = seedInt(seed, 'outer-cactus');
  }

  // 寫入 col 中 world x ∈ [x0, x1) 的格（呼叫端保證這些 x 都在中央以外、col 是新建的空欄）
  fill(col: Column, x0: number, x1: number): void {
    for (let x = x0; x < x1; x++) this.column(col, x, this.profile.info(x));
    this.plants(col, x0, x1);
  }

  isEntrance(x: number): boolean { return vnoise1(x, ENTRANCE_CELL, this.sEnt) > ENTRANCE_THR; }

  private column(col: Column, x: number, I: ColumnInfo): void {
    if (I.kind !== ZONE_SEA && I.kind !== ZONE_BEACH && I.kind !== ZONE_LAND) return;
    const H = col.height, fg = col.fg, wall = col.wall, liq = col.liquid, lt = col.liquidType;
    const { surface: S, rock, deep, molten, biome } = I;
    // 水（海）：水面到海床前一格，滿格、靜止
    if (I.waterTop >= 0) {
      for (let y = Math.max(0, I.waterTop); y < S && y < H; y++) {
        const i = li(x, y);
        liq[i] = LIQ_MAX; lt[i] = LIQ.WATER;
      }
    }
    // 表層材質（只在泥土層：y < rock）
    let skinTo = S, skinT: number = T.DIRT, skinW: number = W.DIRT_WALL, topT: number = T.DIRT, underT: number = T.DIRT, underW: number = W.DIRT_WALL;
    if (I.kind === ZONE_SEA) { skinTo = S + 3; skinT = T.SAND; }
    else if (I.kind === ZONE_BEACH) { skinTo = S + 4; skinT = T.SAND; }
    else if (biome === BIOME.FOREST) { topT = T.GRASS; }
    else if (biome === BIOME.DESERT) { skinTo = S + 6; skinT = T.SAND; skinW = W.SANDSTONE_WALL; underT = T.SANDSTONE; underW = W.SANDSTONE_WALL; }
    else if (biome === BIOME.SNOW) { skinTo = S + 5; skinT = T.SNOW; skinW = W.SNOW_WALL; }
    else { topT = T.JUNGLE_GRASS; underT = T.MUD; underW = W.MUD_WALL; }
    // 洞穴從哪裡開始挖：入口欄從地表、其他從岩層（≥ 地表下 NO_DIG 格）
    const entrance = I.kind === ZONE_LAND && this.isEntrance(x);
    const caveTop = entrance ? S : Math.max(rock, S + NO_DIG);
    const spanInv = 1 / Math.max(1, molten - rock);
    this.spag.setX(x); this.cav1.setX(x); this.cav2.setX(x);
    this.oreCu.setX(x); this.oreFe.setX(x); this.oreAg.setX(x); this.oreAu.setX(x);
    const midRock = rock + ((deep - rock) >> 1);
    for (let y = Math.max(0, S); y < H; y++) {
      let t: number, w: number;
      if (y < rock) {
        if (y < skinTo) { t = skinT; w = skinW; }
        else { t = underT; w = underW; }
        if (y === S && skinTo === S) t = topT;
      } else if (y < deep) { t = T.STONE; w = W.STONE_WALL; }
      else if (y < molten) { t = T.DEEP_STONE; w = W.DEEP_STONE_WALL; }
      else { t = T.BASALT; w = W.BASALT_WALL; }
      const i = li(x, y);
      if (y >= S + 3) wall[i] = w;
      // 洞穴
      let air = false;
      if (y >= caveTop) {
        const k = y <= rock ? 0 : y >= molten ? 1 : (y - rock) * spanInv;
        const n = this.spag.at(y) - 0.5;
        if (n < SPAG_THR + SPAG_GROW * k && n > -(SPAG_THR + SPAG_GROW * k)) air = true;
      }
      if (!air && y >= deep && this.cav1.at(y) * 0.68 + this.cav2.at(y) * 0.32 > CAVERN_THR) air = true;
      if (air) {
        if (y >= molten + LAVA_BELOW) { liq[i] = LIQ_MAX; lt[i] = LIQ.LAVA; }
        continue;
      }
      // 礦（深的先判；各自限定深度層）
      if (NATURAL[t] === 1) {
        if (y >= deep && this.oreAu.at(y) > THR_AU) t = T.GOLD_ORE;
        else if (y >= midRock && y < molten && this.oreAg.at(y) > THR_AG) t = T.SILVER_ORE;
        else if (y >= rock && y < deep && this.oreFe.at(y) > THR_FE) t = T.IRON_ORE;
        else if (y > S && y < midRock && this.oreCu.at(y) > THR_CU) t = T.COPPER_ORE;
      }
      fg[i] = t;
    }
  }

  // 樹根：hash2(x, 0) < p 而且是左右 TREE_REACH 格內最小（同值時 x 小的贏）→ 間距 ≥ TREE_REACH + 1
  private isRoot(x: number, s: number, p: number): boolean {
    const h = hash2(x, 0, s);
    if (h >= p) return false;
    for (let dx = -TREE_REACH; dx <= TREE_REACH; dx++) {
      if (dx === 0) continue;
      const o = hash2(x + dx, 0, s);
      if (o < h || (o === h && dx < 0)) return false;
    }
    return true;
  }

  // 樹 / 仙人掌：掃 [x0 − 3, x1 + 3) 的樹根，只畫進 [x0, x1)；先畫全部樹幹、再畫樹冠（樹冠只蓋空氣）
  private plants(col: Column, x0: number, x1: number): void {
    const fg = col.fg, liq = col.liquid, H = col.height;
    const trees: number[] = [];
    for (let rx = x0 - TREE_REACH; rx < x1 + TREE_REACH; rx++) {
      const I = this.profile.info(rx);
      if (I.kind !== ZONE_LAND || this.isEntrance(rx)) continue;
      if (I.biome === BIOME.DESERT) {
        if (rx < x0 || rx >= x1 || !this.isRoot(rx, this.sCactus, P_CACTUS)) continue;
        const hc = 2 + Math.floor(hash2(rx, 1, this.sCactus) * 4);
        for (let k = 1; k <= hc; k++) {
          const y = I.surface - k;
          if (y < 1) break;
          const i = li(rx, y);
          if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.CACTUS;
        }
        continue;
      }
      if (I.biome !== BIOME.FOREST && I.biome !== BIOME.JUNGLE) continue;
      const jungle = I.biome === BIOME.JUNGLE;
      if (!this.isRoot(rx, this.sTree, jungle ? P_TREE_JUNGLE : P_TREE_FOREST)) continue;
      const hh = hash2(rx, 1, this.sTree), hr = hash2(rx, 2, this.sTree);
      const h = jungle ? 9 + Math.floor(hh * 7) : 5 + Math.floor(hh * 7);
      const r = 2 + Math.floor(hr * 2);
      const top = I.surface - h;
      if (top - r - 1 < 1) continue;
      trees.push(rx, top, r);
      if (rx < x0 || rx >= x1) continue;
      for (let y = top; y < I.surface && y < H; y++) {
        const i = li(rx, y);
        if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.WOOD;
      }
    }
    for (let n = 0; n < trees.length; n += 3) {
      const rx = trees[n], top = trees[n + 1], r = trees[n + 2];
      for (let dx = -r; dx <= r; dx++) {
        const xx = rx + dx;
        if (xx < x0 || xx >= x1) continue;
        const ax = dx < 0 ? -dx : dx;
        for (let dy = -r; dy <= r; dy++) {
          const ay = dy < 0 ? -dy : dy;
          if (ax + ay > r) continue;
          const yy = top + dy;
          if (yy < 0 || yy >= H) continue;
          const i = li(xx, yy);
          if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.LEAVES;
        }
      }
    }
  }
}
