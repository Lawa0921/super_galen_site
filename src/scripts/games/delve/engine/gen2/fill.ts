// fill.ts — gen2 寫格子：表層材質（gen2 自己的表）、深度層與牆、噪聲洞穴 + 地表入口、每個地區的主坑道、礦（只換石頭類）、
// 靜止的海水、熔岩線（LAVA_Y 以下的空氣全是熔岩）、結構藍圖（blueprint.ts，依 (layer, id) 序蓋；含海槽的沉船 / 漂流箱）、
// 樹 / 仙人掌（只長在陸地欄與島的台地、不長在表層藍圖外框內）。免挖洞箱（藍圖的 solid）內的格不挖噪聲洞穴、不當入口（礦照常換、主坑道照挖；控制者裁決：solid 只擋洞穴與入口）。島的表層與樹在這裡（P12：島地形 = Profile2 的島欄形狀 + 這裡的表層）。
// M2a Task 12：花崗岩 / 大理石（礦之前判）、熔岩帶（額外挖空、灰燼地板、黑曜石 / 熔岩石）在 column()；地表與地下裝飾在最後的 decorate()
// （在坑道、藍圖、樹之後，所以裝飾的支撐格都是最終的格）。兩者都只看本欄、由上往下一次掃完；都不寫進藍圖部件內（控制者裁決：用部件、不用外框），
// 熔岩帶的額外挖空同洞穴一樣擋在 solid 部件外。
// 噪聲取樣與樹 / 仙人掌繪製來自 engine/genPrims.ts（與 v1 同一份，P10）；這裡只有 gen2 的材質與礦的規則。不 import legacy。
// 每一格只由 (seed, x, y) 決定：跨欄的東西（樹冠、坑道）由「掃 [x0 − 觸及範圍, x1 + 觸及範圍)、只畫進 [x0, x1)」保證與先填哪一段無關。
// 每個 pass 收到它所屬地塊的 ctx.ver（鎖 / latestVer）；M1 只有 ver 0，沒有版本分支（新規則寫 if (ctx.ver >= N)）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2, seedInt, vnoise1 } from '../noise';
import { T, W, SOLID_LUT } from '../tiles';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { BIOME } from '../world';
import { li, type Column } from '../column';
import type { RegionInfo } from '../regionInfo';
import { ColNoise, CavernNoise, NO_DIG, ORE_THR, spagNoise, entranceHit, oreNoise, blobNoise, growPlants, type PlantSite } from '../genPrims';
import { COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND, LAVA_Y, type ColInfo2, type Profile2 } from './profile';
import { HOME_X0, SPAWN_X, type Layout } from './layout';
import { SHAFT_HALF, SHAFT_REACH, CaveProbe, carveShaft, hasShaft, shaftOf, caveCut, caveK, type Shaft } from './caves';
import { BP_SURFACE, stamp, solidParts, partsOf, type Blueprint, type BlueprintIndex, type BpBox } from './blueprint';

// 每個 pass 的上下文：該地塊的版面版本
export interface FillCtx { ver: number }

// 表層：地表起 depth 格是 t（牆 w），其下到岩層是 under（牆 underW）
interface Skin { depth: number; t: number; w: number; under: number; underW: number }
const SEABED: Skin = { depth: 3, t: T.SAND, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL };
const BEACH: Skin = { depth: 4, t: T.SAND, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL };
const LAND_SKIN: Readonly<Record<number, Skin>> = {
  [BIOME.FOREST]: { depth: 1, t: T.GRASS, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL },
  [BIOME.DESERT]: { depth: 6, t: T.SAND, w: W.SANDSTONE_WALL, under: T.SANDSTONE, underW: W.SANDSTONE_WALL },
  [BIOME.SNOW]: { depth: 5, t: T.SNOW, w: W.SNOW_WALL, under: T.DIRT, underW: W.DIRT_WALL },
  [BIOME.JUNGLE]: { depth: 1, t: T.JUNGLE_GRASS, w: W.MUD_WALL, under: T.MUD, underW: W.MUD_WALL },
};
// 島欄離島的兩端（離水）這麼多格內是沙灘
const ISLAND_BEACH = 4;
// 島欄離水的格數（島地區 = 島本身的 [x0, x1)）
const islandEdge = (x: number, r: RegionInfo): number => Math.min(x - r.x0, r.x1 - 1 - x);
const landSkin = (biome: number): Skin => LAND_SKIN[biome] ?? LAND_SKIN[BIOME.FOREST];
// 島欄（ctx.ver 0 的規則）：離水 ISLAND_BEACH 格內沙灘沙、其餘台地照島的生態（森林：草 + 泥）
const skinOf = (x: number, I: ColInfo2): Skin =>
  I.kind === COL_SEA ? SEABED : I.kind === COL_BEACH ? BEACH
    : I.kind === COL_ISLAND ? (islandEdge(x, I.region) < ISLAND_BEACH ? BEACH : landSkin(I.biome)) : landSkin(I.biome);
// 牆從地表下 WALL_FROM 格起
const WALL_FROM = 3;
// 海與島的欄地表下這麼多格內不挖（比陸地深：海床薄殼不會被洞穴從下面挖穿）
const NO_DIG_SEA = 8;
// 出生點 ±SPAWN_NO_TREE 不長樹、±SPAWN_NO_ENTRANCE 沒有地表入口
const SPAWN_NO_TREE = 3, SPAWN_NO_ENTRANCE = 8;
// 樹根離 shaftX 這麼近不長：坑道各列的範圍 + 樹冠半徑 3（樹幹不會懸在挖開的地表上、樹葉不會蓋住坑道口）
const SHAFT_NO_TREE = SHAFT_HALF + 3;
// 一段 fill 讀得到的範圍：坑道觸及範圍 ≥ 樹的觸及範圍（genPrims.growPlants 掃 [x0 − 3, x1 + 3)）；藍圖不另外算——
// overlapping 依外框找（一般藍圖的外框在自己的槽裡、wholeRegion 錨點在自己的地區裡，任何與外框相交的查詢都找得到）
export const FILL_REACH = SHAFT_REACH;

// 礦只換這些格（石頭類；沙 / 泥土 / 雪 / 玄武岩不換，P10）
const ORE_HOST = new Uint8Array(256);
ORE_HOST[T.STONE] = 1; ORE_HOST[T.DEEP_STONE] = 1;

// ── Task 12 的數值（ctx.ver 0；舊生成器 worldgen.ts 的花崗岩 / 大理石、熔岩深淵細節、地表 / 地下裝飾，改成逐欄局部判斷）──
// 花崗岩 y ∈ [deep + 20, molten − 25)、大理石 y ∈ [rock + 30, deep + 80)：團塊噪聲過門檻的石 / 深層岩換掉（礦之前判，礦不換花崗岩 / 大理石）
const GRANITE_FROM_DEEP = 20, GRANITE_TO_MOLTEN = 25, GRANITE_THR = 0.72;
const MARBLE_FROM_ROCK = 30, MARBLE_TO_DEEP = 80, MARBLE_THR = 0.74;
// 熔岩帶 y ∈ [molten, LAVA_Y)：團塊噪聲 > MOLTEN_OPEN 額外挖空（不留牆）；> MAGMA_THR 熔岩石、> OBSIDIAN_THR 黑曜石（只換玄武岩）；
// 空氣正下方的玄武岩表面往下 2–4 格（每欄一個深度，vnoise1(x, ASH_CELL)）換灰燼。
// 黑曜石 / 熔岩石的團塊用小格（OBSIDIAN_CELL：舊生成器的熔岩石團 3–9 格寬；熔岩帶只有約 40 列高，大格的團塊數太少、各種子差很多）
const MOLTEN_OPEN = 0.55, OBSIDIAN_THR = 0.8, MAGMA_THR = 0.86, ASH_CELL = 9, OBSIDIAN_CELL = 16;
// 地表裝飾：草 / 沙漠沙 / 雪 / 叢林草上方那格（擲 hash2(x, 0, g2-decor)，依序累加的機率）
const DECOR_GRASS: readonly (readonly [number, number])[] = [[0.24, T.TALL_GRASS], [0.32, T.FLOWER], [0.34, T.MUSHROOM], [0.355, T.SMALL_ROCK], [0.39, T.BUSH], [0.397, T.PUMPKIN]];
const DECOR_DESERT: readonly (readonly [number, number])[] = [[0.12, T.DEAD_BUSH], [0.14, T.SMALL_ROCK]];
const DECOR_SNOW: readonly (readonly [number, number])[] = [[0.07, T.SNOW_SHRUB], [0.085, T.SMALL_ROCK]];
const DECOR_JUNGLE: readonly (readonly [number, number])[] = [[0.24, T.FERN], [0.34, T.TALL_GRASS], [0.38, T.FLOWER], [0.39, T.MUSHROOM], [0.44, T.BUSH]];
const pickDecor = (table: readonly (readonly [number, number])[], r: number): number => { for (const [p, t] of table) if (r < p) return t; return -1; };
// 地下裝飾（擲 hash2(x, y, g2-ugdecor) 一個值 r，各項的區間不重疊）：
//   地板（下方實心）：r < POT_P 且深於地表 + POT_BELOW → 陶罐；泥巴 / 叢林草上 r ∈ [POT_P, POT_P + FERN_P) → 蕨；
//     石類上 r ∈ [POT_P, POT_P + STALAGMITE_P) → 石筍；y ≥ deep 且 r ≥ 1 − GLOW_P → 發光蘑菇
//   天花板（上方實心、下方不實心）：石類下 r < STALACTITE_P → 鐘乳石；泥巴 / 叢林草下 r < VINE_P → 藤（長 2–7，hash2(x, y, g2-vine)，
//     只往下長到本欄空氣用完）；r ≥ 1 − COBWEB_P 且左或右是天然實心（caves.CaveProbe，只看噪聲 → 與分段無關）→ 蛛網
const POT_P = 0.012, POT_BELOW = 12, FERN_P = 0.12, STALAGMITE_P = 0.04, GLOW_P = 0.012;
const STALACTITE_P = 0.045, VINE_P = 0.24, VINE_MIN = 2, VINE_SPAN = 6, COBWEB_P = 0.02;
// 石類（石筍 / 鐘乳石長在這些上面；同舊生成器）、叢林土（蕨 / 藤）
const STONY = new Uint8Array(256);
for (const t of [T.STONE, T.GRANITE, T.MARBLE, T.ICE, T.SANDSTONE, T.GRAVEL, T.DEEP_STONE, T.BASALT, T.OBSIDIAN]) STONY[t] = 1;
const JUNGLY = new Uint8Array(256);
JUNGLY[T.MUD] = 1; JUNGLY[T.JUNGLE_GRASS] = 1;

// 藍圖的免挖洞箱：只算與部件相交的部分（bpcore.solidParts；沒有部件 = solid 本身，Task 11 修正 2）
const solidBoxes = (bps: readonly Blueprint[]): BpBox[] => { const out: BpBox[] = []; for (const b of bps) out.push(...solidParts(b)); return out; };
// 藍圖的部件（沒有部件 = 外框）：裝飾與熔岩帶換材質不寫進這些格（Task 12）
const partBoxes = (bps: readonly Blueprint[]): BpBox[] => { const out: BpBox[] = []; for (const b of bps) out.push(...partsOf(b)); return out; };
// 第 x 欄落在箱內的列段（依序 y0, y1, y0, y1…；沒有 = null）
function boxRows(boxes: readonly BpBox[], x: number): number[] | null {
  let out: number[] | null = null;
  for (const b of boxes) if (x >= b.x && x < b.x + b.w) (out ??= []).push(b.y, b.y + b.h);
  return out;
}
const inRows = (rows: readonly number[] | null, y: number): boolean => {
  if (rows === null) return false;
  for (let k = 0; k < rows.length; k += 2) if (y >= rows[k] && y < rows[k + 1]) return true;
  return false;
};

export class Filler2 {
  private readonly spag: ColNoise;
  private readonly cav: CavernNoise;
  private readonly oreCu: ColNoise;
  private readonly oreFe: ColNoise;
  private readonly oreAg: ColNoise;
  private readonly oreAu: ColNoise;
  private readonly sEnt: number;
  private readonly sShaft: number;
  private readonly sTree: number;
  private readonly sCactus: number;
  private readonly granite: ColNoise;
  private readonly marble: ColNoise;
  private readonly molten: ColNoise;
  private readonly obsidian: ColNoise;
  private readonly sAsh: number;
  private readonly sDecor: number;
  private readonly sUgDecor: number;
  private readonly sVine: number;
  // 蛛網看左右欄的天然實心（只看噪聲）
  private readonly probe: CaveProbe;
  private readonly spawnX: number | null;
  // 地區 → 坑道（RegionInfo 是 Layout 的同一個物件）
  private readonly shafts = new Map<RegionInfo, Shaft | null>();

  constructor(seed: string, private readonly layout: Layout, private readonly profile: Profile2, private readonly blueprints: BlueprintIndex) {
    this.spag = spagNoise(seedInt(seed, 'g2-cave'));
    this.cav = new CavernNoise(seedInt(seed, 'g2-cavern'));
    this.oreCu = oreNoise(seedInt(seed, 'g2-ore-copper'));
    this.oreFe = oreNoise(seedInt(seed, 'g2-ore-iron'));
    this.oreAg = oreNoise(seedInt(seed, 'g2-ore-silver'));
    this.oreAu = oreNoise(seedInt(seed, 'g2-ore-gold'));
    this.sEnt = seedInt(seed, 'g2-entrance');
    this.sShaft = seedInt(seed, 'g2-shaft');
    this.sTree = seedInt(seed, 'g2-tree');
    this.sCactus = seedInt(seed, 'g2-cactus');
    this.granite = blobNoise(seedInt(seed, 'g2-granite'));
    this.marble = blobNoise(seedInt(seed, 'g2-marble'));
    this.molten = blobNoise(seedInt(seed, 'g2-molten'));
    this.obsidian = blobNoise(seedInt(seed, 'g2-obsidian'), OBSIDIAN_CELL);
    this.sAsh = seedInt(seed, 'g2-ash');
    this.sDecor = seedInt(seed, 'g2-decor');
    this.sUgDecor = seedInt(seed, 'g2-ugdecor');
    this.sVine = seedInt(seed, 'g2-vine');
    this.probe = new CaveProbe(seed);
    const home = layout.origin.home;
    this.spawnX = home ? home.x0 + SPAWN_X - HOME_X0 : null;
  }

  // 寫入 col 中 world x ∈ [x0, x1) 的格（col 是新建的空欄、x 都在 gen2 範圍內）
  fill(col: Column, x0: number, x1: number): void {
    // 結構多取 FILL_REACH 給樹根判斷外框；免挖洞箱先取出來給材質 pass
    const bps = this.blueprints.overlapping(x0 - FILL_REACH, x1 + FILL_REACH);
    const solids = solidBoxes(bps), parts = partBoxes(bps);
    for (let x = x0; x < x1; x++) this.column(col, x, this.profile.info(x), this.ctxAt(x), boxRows(solids, x), boxRows(parts, x));
    this.shaftPass(col, x0, x1);
    // 結構：在材質 / 洞穴 / 礦 / 液體 / 坑道之後依 (layer, id) 序蓋
    for (const b of bps) stamp(col, b, x0, x1);
    this.plants(col, x0, x1, bps.filter((b) => b.layer === BP_SURFACE));
    // 裝飾最後放：支撐格（上 / 下一格）已經是坑道、藍圖、樹之後的最終格
    for (let x = x0; x < x1; x++) this.decorate(col, x, this.profile.info(x), this.ctxAt(x), boxRows(parts, x));
  }

  // 地表洞穴入口：陸地欄、入口噪聲、不在出生點附近、地表那格不在免挖洞箱內
  isEntrance(x: number): boolean {
    const I = this.profile.info(x);
    return I.kind === COL_LAND && this.entranceAt(x) && !inRows(boxRows(solidBoxes(this.blueprints.overlapping(x, x + 1)), x), I.surface);
  }

  private entranceAt(x: number): boolean {
    if (this.spawnX !== null && Math.abs(x - this.spawnX) <= SPAWN_NO_ENTRANCE) return false;
    return entranceHit(x, this.sEnt);
  }

  private ctxAt(x: number): FillCtx { return { ver: this.layout.landmassAt(x)!.ver }; }

  // ── 一欄：材質、牆、海水、洞穴、礦、熔岩 ──
  // ctx.ver 0 的規則
  // solid = 這一欄落在免挖洞箱內的列段 [y0, y1)（沒有 = null）：段內不挖噪聲洞穴、熔岩帶不額外挖空（礦 / 花崗岩 / 大理石照常換：只換石頭類，結構本身之後由 stamp 蓋）；
  // 地表那格在段內就不當入口。parts = 落在藍圖部件內的列段：熔岩帶的灰燼 / 黑曜石 / 熔岩石不換這些格
  private column(col: Column, x: number, I: ColInfo2, _ctx: FillCtx, solid: number[] | null, parts: number[] | null): void {
    const H = col.height, fg = col.fg, wall = col.wall, liq = col.liquid, lt = col.liquidType;
    const { surface: S, rock, deep, molten } = I;
    const gr0 = deep + GRANITE_FROM_DEEP, gr1 = molten - GRANITE_TO_MOLTEN, mb0 = rock + MARBLE_FROM_ROCK, mb1 = deep + MARBLE_TO_DEEP;
    // 熔岩帶：上一格是空氣（洞穴或挖空）→ 這格起 ashD 格的玄武岩換灰燼；ashLeft = 還剩幾格
    const ashD = 2 + Math.floor(vnoise1(x, ASH_CELL, this.sAsh) * 3);
    let open = false, ashLeft = 0;
    // 海：水面到海床前一格滿格、靜止
    if (I.kind === COL_SEA) {
      for (let y = Math.max(0, I.waterTop); y < S && y < H; y++) { const i = li(x, y); liq[i] = LIQ_MAX; lt[i] = LIQ.WATER; }
    }
    const sk = skinOf(x, I), skinTo = S + sk.depth;
    const entrance = I.kind === COL_LAND && this.entranceAt(x) && !inRows(solid, S);
    const caveTop = entrance ? S : Math.max(rock, S + (I.kind === COL_SEA || I.kind === COL_ISLAND ? NO_DIG_SEA : NO_DIG));
    const spanInv = 1 / Math.max(1, molten - rock), midRock = rock + ((deep - rock) >> 1);
    this.spag.setX(x); this.cav.setX(x);
    this.oreCu.setX(x); this.oreFe.setX(x); this.oreAg.setX(x); this.oreAu.setX(x);
    this.granite.setX(x); this.marble.setX(x); this.molten.setX(x); this.obsidian.setX(x);
    for (let y = Math.max(0, S); y < H; y++) {
      let t: number, w: number;
      if (y < rock) { if (y < skinTo) { t = sk.t; w = sk.w; } else { t = sk.under; w = sk.underW; } }
      else if (y < deep) { t = T.STONE; w = W.STONE_WALL; }
      else if (y < molten) { t = T.DEEP_STONE; w = W.DEEP_STONE_WALL; }
      else { t = T.BASALT; w = W.BASALT_WALL; }
      const i = li(x, y);
      if (y >= S + WALL_FROM) wall[i] = w;
      const inSolid = solid !== null && inRows(solid, y);
      // 洞穴（義大利麵越深越寬 + 洞穴層大洞窟）；免挖洞箱內不挖
      if (!inSolid && caveCut(this.spag, this.cav, y, caveTop, deep, caveK(y, rock, molten, spanInv))) {
        // 熔岩線：LAVA_Y 以下的空氣全是熔岩（全世界同一條水平線；主坑道最深只到 deep + 18，碰不到這裡）
        if (y >= LAVA_Y) { liq[i] = LIQ_MAX; lt[i] = LIQ.LAVA; }
        open = true;
        continue;
      }
      if (y >= molten && y < LAVA_Y) {
        // 熔岩帶：額外挖空（不留牆，看得到深淵背景；免挖洞箱內不挖）
        if (!inSolid && this.molten.at(y) > MOLTEN_OPEN) { wall[i] = W.NONE; open = true; continue; }
        if (open) ashLeft = ashD;
        // 只換玄武岩、不換藍圖部件內的格：熔岩石 / 黑曜石（團塊），其餘的地板表層換灰燼
        if (!(parts !== null && inRows(parts, y))) {
          const ob = this.obsidian.at(y);
          t = ob > MAGMA_THR ? T.MAGMA_ROCK : ob > OBSIDIAN_THR ? T.OBSIDIAN : ashLeft > 0 ? T.ASH : t;
        }
        if (ashLeft > 0) ashLeft--;
      }
      open = false;
      // 石頭類：花崗岩 / 大理石先判（換掉的格不再放礦），再放礦（所以都在岩層頂以下），深的先判；深度帶同 v1
      if (ORE_HOST[t] === 1) {
        if (y >= gr0 && y < gr1 && this.granite.at(y) > GRANITE_THR) t = T.GRANITE;
        else if (y >= mb0 && y < mb1 && this.marble.at(y) > MARBLE_THR) t = T.MARBLE;
        else if (y >= deep && this.oreAu.at(y) > ORE_THR.AU) t = T.GOLD_ORE;
        else if (y >= midRock && y < molten && this.oreAg.at(y) > ORE_THR.AG) t = T.SILVER_ORE;
        else if (y < deep && this.oreFe.at(y) > ORE_THR.FE) t = T.IRON_ORE;
        else if (y < midRock && this.oreCu.at(y) > ORE_THR.CU) t = T.COPPER_ORE;
      }
      fg[i] = t;
    }
  }

  // ── 裝飾：地表（陸地欄的地表上一格）與地下（地表 + 1 以下的空氣格）；只看本欄的最終格、由上往下一次掃完 ──
  // ctx.ver 0 的規則。parts = 這一欄落在藍圖部件內的列段：不放裝飾（藍圖自己的裝飾由藍圖畫）；水 / 熔岩裡不放
  private decorate(col: Column, x: number, I: ColInfo2, _ctx: FillCtx, parts: number[] | null): void {
    const H = col.height, fg = col.fg, liq = col.liquid, S = I.surface;
    // 地表：草 / 沙漠沙 / 雪 / 叢林草上方那格是空氣（出生點 ±SPAWN_NO_TREE 不放：出生點上方要是空氣，P9）
    if (I.kind === COL_LAND && S >= 2 && S < H && !(this.spawnX !== null && Math.abs(x - this.spawnX) <= SPAWN_NO_TREE)) {
      const ai = li(x, S - 1), g = fg[li(x, S)];
      if (fg[ai] === T.AIR && liq[ai] === 0 && !inRows(parts, S - 1)) {
        const table = g === T.GRASS ? DECOR_GRASS : g === T.SAND && I.biome === BIOME.DESERT ? DECOR_DESERT
          : g === T.SNOW ? DECOR_SNOW : g === T.JUNGLE_GRASS ? DECOR_JUNGLE : null;
        const d = table ? pickDecor(table, hash2(x, 0, this.sDecor)) : -1;
        if (d >= 0) fg[ai] = d;
      }
    }
    // 地下
    for (let y = Math.max(1, S + 2); y < H - 1; y++) {
      const i = li(x, y);
      if (fg[i] !== T.AIR || liq[i] !== 0) continue;
      const below = fg[li(x, y + 1)], above = fg[li(x, y - 1)];
      const floor = SOLID_LUT[below] === 1;
      if (!floor && SOLID_LUT[above] !== 1) continue;
      if (inRows(parts, y)) continue;
      const r = hash2(x, y, this.sUgDecor);
      if (floor) {
        if (r < POT_P) { if (y > S + POT_BELOW) fg[i] = T.POT; }
        else if (JUNGLY[below] === 1) { if (r < POT_P + FERN_P) fg[i] = T.FERN; }
        else if (STONY[below] === 1 && r < POT_P + STALAGMITE_P) fg[i] = T.STALAGMITE;
        else if (y >= I.deep && r >= 1 - GLOW_P) fg[i] = T.GLOW_MUSHROOM;
      } else if (STONY[above] === 1 && r < STALACTITE_P) fg[i] = T.STALACTITE;
      else if (JUNGLY[above] === 1 && r < VINE_P) {
        const len = VINE_MIN + Math.floor(hash2(x, y, this.sVine) * VINE_SPAN);
        for (let k = 0, yy = y; k < len && yy < H - 1; k++, yy++) {
          const j = li(x, yy);
          if (fg[j] !== T.AIR || liq[j] !== 0 || inRows(parts, yy)) break;
          fg[j] = T.VINE;
        }
      } else if (r >= 1 - COBWEB_P && (this.naturalSolid(x - 1, y) || this.naturalSolid(x + 1, y))) fg[i] = T.COBWEB;
    }
  }

  // 第 x 欄第 y 格的天然實心（地表以下、不是噪聲洞穴；不含入口欄的淺層、坑道與藍圖）：只看噪聲與 profile。
  // gen2 範圍外（烘焙世界的接縫另一側）= 不算（不放蛛網）
  private naturalSolid(x: number, y: number): boolean {
    if (!this.profile.regionAt(x)) return false;
    const I = this.profile.info(x);
    return y >= I.surface && !this.probe.open(x, y, I);
  }

  // ── 主坑道：與 [x0 − 觸及, x1 + 觸及) 相交的每個地區各一條 ──
  private shaftPass(col: Column, x0: number, x1: number): void {
    for (const r of this.regionsNear(x0 - SHAFT_REACH, x1 + SHAFT_REACH)) this.shaft(col, x0, x1, r, this.ctxAt(r.x0));
  }

  // ctx.ver（坑道所屬地塊）0 的規則
  private shaft(col: Column, x0: number, x1: number, r: RegionInfo, _ctx: FillCtx): void {
    const sh = this.shaftFor(r);
    if (sh) carveShaft(col, x0, x1, this.sShaft, r, sh);
  }

  // [a, b) 內的 gen2 地區（地區 ≥ 40 格寬，每 16 格取樣一次 + 右端點不會漏）
  private regionsNear(a: number, b: number): Set<RegionInfo> {
    const out = new Set<RegionInfo>();
    for (let x = a; ; x += 16) {
      const q = Math.min(x, b - 1), r = this.profile.regionAt(q);
      if (r) out.add(r);
      if (q === b - 1) break;
    }
    return out;
  }

  private shaftFor(r: RegionInfo): Shaft | null {
    let sh = this.shafts.get(r);
    if (sh === undefined) {
      sh = hasShaft(r) ? shaftOf(this.sShaft, r, (x) => this.profile.surfaceAt(x), (x) => this.profile.layersAt(x).deep) : null;
      if (this.shafts.size >= 256) this.shafts.clear();
      this.shafts.set(r, sh);
    }
    return sh;
  }

  // ── 樹 / 仙人掌（genPrims.growPlants）：只長在陸地欄與島的台地；入口欄、出生點 ±3、坑道上方、表層藍圖外框內不長 ──
  private plants(col: Column, x0: number, x1: number, surface: Blueprint[]): void {
    const inBp = (rx: number): boolean => surface.some((b) => rx >= b.x && rx < b.x + b.w);
    const site = (rx: number): PlantSite | null => (this.profile.regionAt(rx) && !inBp(rx) ? this.plantSite(rx, this.ctxAt(rx)) : null);
    growPlants(col, x0, x1, site, this.sTree, this.sCactus);
  }

  // ctx.ver（樹根所屬地塊）0 的規則
  private plantSite(rx: number, _ctx: FillCtx): PlantSite | null {
    const I = this.profile.info(rx), r = I.region;
    // 島：台地（離水 ≥ ISLAND_BEACH，草上）照島的生態長樹；樹冠半徑 ≤ 3，不會伸出島外
    if (I.kind === COL_ISLAND) return islandEdge(rx, r) >= ISLAND_BEACH ? I : null;
    if (I.kind !== COL_LAND || this.entranceAt(rx)) return null;
    if (this.spawnX !== null && Math.abs(rx - this.spawnX) <= SPAWN_NO_TREE) return null;
    const sh = this.shaftFor(r);
    if (sh && Math.abs(rx - sh.sx) <= SHAFT_NO_TREE) return null;
    return I;
  }
}
