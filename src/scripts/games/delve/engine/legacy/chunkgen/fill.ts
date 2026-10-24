// fill.ts — 外圍生成器 v0 寫格子（B9）：海 / 沙灘 / 四種生態的表層、深度層（泥土 / 岩層 / 深層岩 / 玄武岩 + 各自的牆）、
// 洞穴（義大利麵 + 洞穴層大洞窟 + 地表入口）、熔岩深淵的熔岩、礦、樹 / 仙人掌。
// 每一格只由 (seed, x, y) 決定：噪聲取樣、洞穴 / 入口門檻與樹 / 仙人掌繪製是 engine/genPrims.ts 與 gen2 共用的一份（P10），
// 這裡只留 v1 自己的材質表、礦的深度帶與替換規則（輸出由 chunkgen.test.ts 的 V1_FILL_HASH / V1_SEA_HASH 釘住）。
// 跨欄的東西（樹冠）由 growPlants「掃 [x0 − 3, x1 + 3) 的樹根、只畫進 [x0, x1)」保證與先填哪一欄無關。
// 本資料夾的檔案（測試以外）不得出現連續兩個星號（測試會 grep），註解一律用 //。
import { seedInt } from '../../noise';
import { T, W } from '../../tiles';
import { LIQ, LIQ_MAX } from '../../liquidKind';
import { BIOME } from '../../world';
import { li, type Column } from '../../column';
import { ColNoise, CavernNoise, NO_DIG, ORE_THR, spagNoise, spagHit, cavernHit, entranceHit, oreNoise, growPlants, type PlantSite } from '../../genPrims';
import { OuterProfile, ZONE_SEA, ZONE_BEACH, ZONE_LAND, type ColumnInfo } from './profile';

// 熔岩深淵：洞底在熔岩線下 LAVA_BELOW 格以下的空氣填熔岩
const LAVA_BELOW = 40;
// 礦：genPrims 的 vnoise2(x, y, 6) 場 > ORE_THR（深度層越厚的礦門檻越高，每層的礦量差不多）
const { CU: THR_CU, FE: THR_FE, AG: THR_AG, AU: THR_AU } = ORE_THR;

// 一格是不是「天然實心」（洞穴 / 礦只動這些）
const NATURAL = new Uint8Array(256);
for (const t of [T.DIRT, T.GRASS, T.STONE, T.SAND, T.SANDSTONE, T.SNOW, T.MUD, T.JUNGLE_GRASS, T.DEEP_STONE, T.BASALT]) NATURAL[t] = 1;

export class OuterFiller {
  private readonly spag: ColNoise;
  private readonly cav: CavernNoise;
  private readonly oreCu: ColNoise;
  private readonly oreFe: ColNoise;
  private readonly oreAg: ColNoise;
  private readonly oreAu: ColNoise;
  private readonly sEnt: number;
  private readonly sTree: number;
  private readonly sCactus: number;

  constructor(seed: string, readonly profile: OuterProfile) {
    const sCave = seedInt(seed, 'outer-cave'), sCavern = seedInt(seed, 'outer-cavern');
    this.spag = spagNoise(sCave);
    this.cav = new CavernNoise(sCavern);
    this.oreCu = oreNoise(seedInt(seed, 'outer-ore-copper'));
    this.oreFe = oreNoise(seedInt(seed, 'outer-ore-iron'));
    this.oreAg = oreNoise(seedInt(seed, 'outer-ore-silver'));
    this.oreAu = oreNoise(seedInt(seed, 'outer-ore-gold'));
    this.sEnt = seedInt(seed, 'outer-entrance');
    this.sTree = seedInt(seed, 'outer-tree');
    this.sCactus = seedInt(seed, 'outer-cactus');
  }

  // 寫入 col 中 world x ∈ [x0, x1) 的格（呼叫端保證這些 x 都在中央以外、col 是新建的空欄）
  fill(col: Column, x0: number, x1: number): void {
    for (let x = x0; x < x1; x++) this.column(col, x, this.profile.info(x));
    this.plants(col, x0, x1);
  }

  isEntrance(x: number): boolean { return entranceHit(x, this.sEnt); }

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
    this.spag.setX(x); this.cav.setX(x);
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
        if (spagHit(this.spag, y, k)) air = true;
      }
      if (!air && y >= deep && cavernHit(this.cav, y)) air = true;
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

  // 樹 / 仙人掌（genPrims.growPlants）：只長在陸地欄、入口欄不長
  private plants(col: Column, x0: number, x1: number): void {
    const site = (rx: number): PlantSite | null => {
      const I = this.profile.info(rx);
      return I.kind !== ZONE_LAND || this.isEntrance(rx) ? null : I;
    };
    growPlants(col, x0, x1, site, this.sTree, this.sCactus);
  }
}
