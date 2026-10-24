// fill.ts — gen2 寫格子：表層材質（gen2 自己的表）、深度層與牆、噪聲洞穴 + 地表入口、每個地區的主坑道、礦（只換石頭類）、
// 靜止的海水、熔岩線（LAVA_Y 以下的空氣全是熔岩）、結構藍圖（blueprint.ts，依 (layer, id) 序蓋；含海槽的沉船 / 漂流箱）、
// 樹 / 仙人掌（只長在陸地欄與島的台地、不長在表層藍圖外框內）。免挖洞箱（藍圖的 solid）內的格不挖噪聲洞穴、不當入口、不換礦（主坑道照挖）。島的表層與樹在這裡（P12：島地形 = Profile2 的島欄形狀 + 這裡的表層）。
// 噪聲取樣與樹 / 仙人掌繪製來自 engine/genPrims.ts（與 v1 同一份，P10）；這裡只有 gen2 的材質與礦的規則。不 import legacy。
// 每一格只由 (seed, x, y) 決定：跨欄的東西（樹冠、坑道）由「掃 [x0 − 觸及範圍, x1 + 觸及範圍)、只畫進 [x0, x1)」保證與先填哪一段無關。
// 每個 pass 收到它所屬地塊的 ctx.ver（鎖 / latestVer）；M1 只有 ver 0，沒有版本分支（新規則寫 if (ctx.ver >= N)）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { seedInt } from '../noise';
import { T, W } from '../tiles';
import { LIQ, LIQ_MAX } from '../liquidKind';
import { BIOME } from '../world';
import { li, type Column } from '../column';
import type { RegionInfo } from '../regionInfo';
import { ColNoise, CavernNoise, NO_DIG, ORE_THR, spagNoise, spagHit, cavernHit, entranceHit, oreNoise, growPlants, type PlantSite } from '../genPrims';
import { COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND, LAVA_Y, type ColInfo2, type Profile2 } from './profile';
import { HOME_X0, SPAWN_X, type Layout } from './layout';
import { SHAFT_HALF, SHAFT_REACH, carveShaft, hasShaft, shaftOf, type Shaft } from './caves';
import { BP_SURFACE, stamp, type Blueprint, type BlueprintIndex, type BpBox } from './blueprint';

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

// 藍圖的免挖洞箱
const solidBoxes = (bps: readonly Blueprint[]): BpBox[] => { const out: BpBox[] = []; for (const b of bps) if (b.solid) out.push(b.solid); return out; };
// 第 x 欄落在箱內的列段（依序 y0, y1, y0, y1…；沒有 = null）
function solidRows(boxes: readonly BpBox[], x: number): number[] | null {
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
    const home = layout.origin.home;
    this.spawnX = home ? home.x0 + SPAWN_X - HOME_X0 : null;
  }

  // 寫入 col 中 world x ∈ [x0, x1) 的格（col 是新建的空欄、x 都在 gen2 範圍內）
  fill(col: Column, x0: number, x1: number): void {
    // 結構多取 FILL_REACH 給樹根判斷外框；免挖洞箱先取出來給材質 pass
    const bps = this.blueprints.overlapping(x0 - FILL_REACH, x1 + FILL_REACH);
    const solids = solidBoxes(bps);
    for (let x = x0; x < x1; x++) this.column(col, x, this.profile.info(x), this.ctxAt(x), solidRows(solids, x));
    this.shaftPass(col, x0, x1);
    // 結構：在材質 / 洞穴 / 礦 / 液體 / 坑道之後依 (layer, id) 序蓋
    for (const b of bps) stamp(col, b, x0, x1);
    this.plants(col, x0, x1, bps.filter((b) => b.layer === BP_SURFACE));
  }

  // 地表洞穴入口：陸地欄、入口噪聲、不在出生點附近、地表那格不在免挖洞箱內
  isEntrance(x: number): boolean {
    const I = this.profile.info(x);
    return I.kind === COL_LAND && this.entranceAt(x) && !inRows(solidRows(solidBoxes(this.blueprints.overlapping(x, x + 1)), x), I.surface);
  }

  private entranceAt(x: number): boolean {
    if (this.spawnX !== null && Math.abs(x - this.spawnX) <= SPAWN_NO_ENTRANCE) return false;
    return entranceHit(x, this.sEnt);
  }

  private ctxAt(x: number): FillCtx { return { ver: this.layout.landmassAt(x)!.ver }; }

  // ── 一欄：材質、牆、海水、洞穴、礦、熔岩 ──
  // ctx.ver 0 的規則
  // solid = 這一欄落在免挖洞箱內的列段 [y0, y1)（沒有 = null）：段內不挖噪聲洞穴、不換礦；地表那格在段內就不當入口
  private column(col: Column, x: number, I: ColInfo2, _ctx: FillCtx, solid: number[] | null): void {
    const H = col.height, fg = col.fg, wall = col.wall, liq = col.liquid, lt = col.liquidType;
    const { surface: S, rock, deep, molten } = I;
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
    for (let y = Math.max(0, S); y < H; y++) {
      let t: number, w: number;
      if (y < rock) { if (y < skinTo) { t = sk.t; w = sk.w; } else { t = sk.under; w = sk.underW; } }
      else if (y < deep) { t = T.STONE; w = W.STONE_WALL; }
      else if (y < molten) { t = T.DEEP_STONE; w = W.DEEP_STONE_WALL; }
      else { t = T.BASALT; w = W.BASALT_WALL; }
      const i = li(x, y);
      if (y >= S + WALL_FROM) wall[i] = w;
      if (solid !== null && inRows(solid, y)) { fg[i] = t; continue; }
      // 洞穴（義大利麵越深越寬 + 洞穴層大洞窟）
      const k = y <= rock ? 0 : y >= molten ? 1 : (y - rock) * spanInv;
      if ((y >= caveTop && spagHit(this.spag, y, k)) || (y >= deep && cavernHit(this.cav, y))) {
        // 熔岩線：LAVA_Y 以下的空氣全是熔岩（全世界同一條水平線；主坑道最深只到 deep + 18，碰不到這裡）
        if (y >= LAVA_Y) { liq[i] = LIQ_MAX; lt[i] = LIQ.LAVA; }
        continue;
      }
      // 礦：只換石頭類（所以都在岩層頂以下），深的先判；深度帶同 v1
      if (ORE_HOST[t] === 1) {
        if (y >= deep && this.oreAu.at(y) > ORE_THR.AU) t = T.GOLD_ORE;
        else if (y >= midRock && y < molten && this.oreAg.at(y) > ORE_THR.AG) t = T.SILVER_ORE;
        else if (y < deep && this.oreFe.at(y) > ORE_THR.FE) t = T.IRON_ORE;
        else if (y < midRock && this.oreCu.at(y) > ORE_THR.CU) t = T.COPPER_ORE;
      }
      fg[i] = t;
    }
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
