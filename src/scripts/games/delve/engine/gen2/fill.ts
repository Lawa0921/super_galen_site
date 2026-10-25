// fill.ts — gen2 寫格子：表層材質（gen2 自己的表）、深度層與牆、噪聲洞穴 + 地表入口、每個地區的主坑道、礦（逐帶宿主表 G2_ORE）、
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
import { ColNoise, CavernNoise, NO_DIG, spagNoise, entranceHit, oreNoise, blobNoise, growPlants, type BlobNoise, type PlantSite } from '../genPrims';
import { COL_SEA, COL_BEACH, COL_LAND, COL_ISLAND, LAVA_Y, type ColInfo2, type Profile2 } from './profile';
import { HOME_X0, SPAWN_X, type Layout } from './layout';
import { SHAFT_HALF, SHAFT_REACH, CaveProbe, carveShaft, hasShaft, shaftOf, caveCut, caveK, type Shaft } from './caves';
import { BP_SURFACE, BP_MINOR, stamp, solidParts, partsOf, type Blueprint, type BlueprintIndex, type BpBox } from './blueprint';
import { TeardropField, Fbm2, type Teardrop } from './teardrop';

// 每個 pass 的上下文：該地塊的版面版本
export interface FillCtx { ver: number }

// 表層：地表起 depth 格是 t（牆 w），其下到岩層是 under（牆 underW）。海床 / 沙灘 / 島與森林 / 叢林的陸地欄用這張表；
// 沙漠 / 雪原的陸地欄是逐格規則（Task 17 延續事項 1，見下面的 SKIN_* 與 Filler2.landCell）
interface Skin { depth: number; t: number; w: number; under: number; underW: number }
const SEABED: Skin = { depth: 3, t: T.SAND, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL };
const BEACH: Skin = { depth: 4, t: T.SAND, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL };
const LAND_SKIN: Readonly<Record<number, Skin>> = {
  [BIOME.FOREST]: { depth: 1, t: T.GRASS, w: W.DIRT_WALL, under: T.DIRT, underW: W.DIRT_WALL },
  [BIOME.JUNGLE]: { depth: 1, t: T.JUNGLE_GRASS, w: W.MUD_WALL, under: T.MUD, underW: W.MUD_WALL },
};
// ── 沙漠 / 雪原的表層（ctx.ver 0；M2a Task 17 延續事項 1，比照舊生成器 legacy/worldgen.ts「生態區轉換」淚滴在岩層以上的部分）──
//   沙漠：y < 砂層底 sandTo（= 地表 + 13 + floor(vnoise1(x, 20) × 10)，與地下沙漠淚滴同一條）→ 沙；其下到岩層 → 砂岩（mat > 0.68 → 沙）；牆砂岩牆
//   雪原：雪層底 snowTo = 地表 + 2 + floor(vnoise1(x, 23) × 4 + vnoise1(x, 7) × 2.5 + max(0, vnoise1(x, 41) − 0.72) × 14)（薄、有起伏、偶有雪堆）；
//     地表那格是雪，y < snowTo → 雪（mat > 0.8 → 冰）；其下到岩層是凍土：mat > 0.64 冰、< 0.2 碎石、< 0.27 石、y < snowTo + 3 且 > 0.5 雪、其餘泥；牆雪牆
//   mat = 15 × 15 的 2 八度值雜訊（teardrop.Fbm2，同舊生成器 matN 的格距）
const SKIN_SNOW_ICE = 0.8, FROST_ICE = 0.64, FROST_GRAVEL = 0.2, FROST_STONE = 0.27, FROST_SNOW = 0.5, FROST_SNOW_ROWS = 3;
// 不同生態的陸地地區交界（Task 17 延續事項 2）：交界 ± SKIN_J 欄內，地表下第 y 列的表層照「x + 抖動」所在那一側地區的生態
// （抖動 = (edge − 0.5) × 2 × SKIN_J × min(1, (y − 地表) / SKIN_RAMP)，edge = 6 × 6 的 2 八度值雜訊：岩層以上只有 10–26 列，格距大的話整段幾乎不動）：交界從地表那一列（不抖：
// 地表裝飾 / 樹 / 仙人掌照地區）往下散成不規則的邊，不是一條垂直直線
const SKIN_J = 12, SKIN_RAMP = 4;
// 島欄離島的兩端（離水）這麼多格內是沙灘
const ISLAND_BEACH = 4;
// 島欄離水的格數（島地區 = 島本身的 [x0, x1)）
const islandEdge = (x: number, r: RegionInfo): number => Math.min(x - r.x0, r.x1 - 1 - x);
const landSkin = (biome: number): Skin => LAND_SKIN[biome] ?? LAND_SKIN[BIOME.FOREST];
// 島欄（ctx.ver 0 的規則）：離水 ISLAND_BEACH 格內沙灘沙、其餘台地照島的生態（森林：草 + 泥）；陸地欄的表層由 Filler2.landCell 決定（這裡的值不用）
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

// 石頭類：花崗岩 / 大理石與地下生態淚滴只換這些格
const STONE_BASE = new Uint8Array(256);
STONE_BASE[T.STONE] = 1; STONE_BASE[T.DEEP_STONE] = 1;

// ── 礦（ctx.ver 0；M2a Task 13，P10 改寫成逐帶宿主表，控制者裁決 A′）──
// 深度帶相對本欄層線：0 泥土 [地表, 岩層)、1 岩層 [岩層, 洞穴層)、2 洞穴層 [洞穴層, 熔岩)、3 熔岩 [熔岩, 世界底)。
// 每種礦 × 每個帶一條規則 { thr, host }（null = 該帶不放）：本格的 tile 在 host 裡、而且礦噪聲 > thr → 換成該礦；同一格多種礦都過時金 > 銀 > 鐵 > 銅。
// 宿主照舊生成器 legacy/worldgen.ts:125-127 的 isOreHost（STONE / DIRT / SANDSTONE / ICE / MUD / SNOW / DEEP_STONE / BASALT）與
// :996-1001 的礦脈深度帶，只開放舊生成器在該帶的密度 ≥ 0.2‰ 的礦（oreBaseline.ts 的 LEGACY_ORE_DENSITY）：
//   泥土帶的銅（:996 銅礦脈 [地表 + 4, 岩層 + 20)）：DIRT / SNOW / MUD / SANDSTONE，只在 y ≥ 地表 + SOIL_ORE_FROM（地表那幾格的草 / 沙不放）
//   岩層 / 洞穴層：石頭類 + 淚滴換成的泥巴 / 砂岩 / 冰（Task 12 裁決，同 isOreHost）
//   熔岩帶的金（:1001 金礦脈上界熔岩線 + 25）：BASALT，只在 [熔岩線, 熔岩線 + MOLTEN_ORE_SPAN) 且 y < LAVA_Y（不落進熔岩海）
// 沙不放礦（Task 12 裁決）；藍圖寫入的格之後由 stamp 蓋，不受這張表影響。
// 門檻調到家鄉密度落在舊生成器 ±30%（ores.test.ts）；不用 genPrims.ORE_THR（那是 v1 的）。
// Task 17：沙漠深沙 / 雪原凍土讓泥土帶的宿主變少（沙、冰、碎石、石不是泥土帶的銅宿主），泥土帶的銅 0.9125 → 0.909
// （alpha / beta / gamma：改前 13.405‰、只改表層 12.263‰、重校後 13.345‰；舊生成器 13.397‰）
const SOIL_ORE_FROM = 4, MOLTEN_ORE_SPAN = 25;
const hostOf = (...ts: number[]): Uint8Array => { const h = new Uint8Array(256); for (const t of ts) h[t] = 1; return h; };
const H_SOIL = hostOf(T.DIRT, T.SNOW, T.MUD, T.SANDSTONE);
const H_STONE = hostOf(T.STONE, T.DEEP_STONE, T.MUD, T.SANDSTONE, T.ICE);
const H_BASALT = hostOf(T.BASALT);
interface OreRule { thr: number; host: Uint8Array }
type OreRules = readonly [OreRule | null, OreRule | null, OreRule | null, OreRule | null];
const G2_ORE: Readonly<Record<'copper' | 'iron' | 'silver' | 'gold', OreRules>> = {
  copper: [{ thr: 0.909, host: H_SOIL }, { thr: 0.9165, host: H_STONE }, null, null],
  iron: [null, { thr: 0.9385, host: H_STONE }, { thr: 0.963, host: H_STONE }, null],
  silver: [null, { thr: 0.98, host: H_STONE }, { thr: 0.9645, host: H_STONE }, null],
  gold: [null, null, { thr: 0.9595, host: H_STONE }, { thr: 0.9465, host: H_BASALT }],
};

// ── Task 12 的數值（ctx.ver 0；舊生成器 worldgen.ts 的花崗岩 / 大理石、熔岩深淵細節、地表 / 地下裝飾，改成逐欄局部判斷）──
// 花崗岩 y ∈ [deep + 20, molten − 25)、大理石 y ∈ [rock + 30, deep + 80)：團塊噪聲過門檻的石 / 深層岩換掉（礦之前判，礦不換花崗岩 / 大理石）
// 門檻 0.8（brief 的 0.72 搭三次方團塊噪聲約是舊生成器的 2.3 倍；修正 1 調到 0.8，總量落在舊生成器 ±30%）
const GRANITE_FROM_DEEP = 20, GRANITE_TO_MOLTEN = 25, GRANITE_THR = 0.8;
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
//     只往下長到本欄空氣用完）；r ≥ 1 − COBWEB_P、y < deep + COBWEB_BELOW_DEEP（舊生成器 cavernY + 120）且左或右是天然實心
//     （caves.CaveProbe，只看噪聲 → 與分段無關）→ 蛛網
const POT_P = 0.012, POT_BELOW = 12, FERN_P = 0.12, STALAGMITE_P = 0.04, GLOW_P = 0.012;
const STALACTITE_P = 0.045, VINE_P = 0.24, VINE_MIN = 2, VINE_SPAN = 6, COBWEB_P = 0.02, COBWEB_BELOW_DEEP = 120;
// 地下生態淚滴（修正 1 叢林、修正 2 沙漠 / 雪原；teardrop.ts）：只在岩層以下（岩層以上是地區自己的表層材質）。數值同舊生成器：
//   叢林：牆 → 泥巴牆；石 / 深層岩 mat > 0.47 → 泥巴；岩層以下 caveA > 0.685 − 0.035 × inner 挖空
//   沙漠：牆 → 砂岩牆；石 / 深層岩 → 砂岩（y < 砂層底 sandTo 或 mat > 0.68 → 沙）；sandTo = 地表 + 13 + floor(vnoise1(x, 20) × 10)；
//     y > sandTo + 6、t > 0.08 時直條砂岩洞：k = inner × min(1, (t − 0.08) × 6)，|caveB − 0.5| < 0.034k 或 caveA > 0.7 − 0.04k 挖空
//   雪原：牆 → 冰牆；石 / 深層岩 mat > 0.45 → 冰；y > 岩層 + 8 時冰洞 caveA > 0.69 − 0.03 × inner 挖空
// 挖空擋在免挖洞箱與藍圖部件外（CaveProbe 不知道這些洞，部件內 KEEP 的格不能挖）。換材質在花崗岩 / 大理石之後、礦之前；
// 礦照常放在換完的泥巴 / 砂岩 / 冰上（逐帶宿主表 H_STONE，同舊生成器），沙不放
const JUNGLE_MUD_THR = 0.47, JUNGLE_CAVE_THR = 0.685, JUNGLE_CAVE_INNER = 0.035;
const DESERT_SAND_THR = 0.68, DESERT_SAND_FROM = 13, DESERT_SAND_SPAN = 10, DESERT_CAVE_BELOW = 6, DESERT_CAVE_T = 0.08;
const DESERT_SLIT = 0.034, DESERT_BUBBLE_THR = 0.7, DESERT_BUBBLE_INNER = 0.04;
const SNOW_ICE_THR = 0.45, SNOW_CAVE_BELOW = 8, SNOW_CAVE_THR = 0.69, SNOW_CAVE_INNER = 0.03;
const TEAR_WALL: Readonly<Record<number, number>> = { [BIOME.JUNGLE]: W.MUD_WALL, [BIOME.DESERT]: W.SANDSTONE_WALL, [BIOME.SNOW]: W.ICE_WALL };
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
  private readonly granite: BlobNoise;
  private readonly marble: BlobNoise;
  private readonly molten: BlobNoise;
  private readonly obsidian: BlobNoise;
  private readonly sAsh: number;
  private readonly sDecor: number;
  private readonly sUgDecor: number;
  private readonly sVine: number;
  // 蛛網看左右欄的天然實心（只看噪聲）
  private readonly probe: CaveProbe;
  private readonly tear: TeardropField;
  // 表層（Task 17）：沙漠 / 雪原的 mat、地區交界的抖動、砂層底 / 雪層底的雜訊種子；landCell 的輸出
  private readonly skinMat: Fbm2;
  private readonly skinEdge: Fbm2;
  private readonly sSkin: number;
  private cellT = 0;
  private cellW = 0;
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
    this.tear = new TeardropField(seed, layout, profile);
    this.skinMat = new Fbm2(15, 15, seedInt(seed, 'g2-skin-mat'));
    this.skinEdge = new Fbm2(6, 6, seedInt(seed, 'g2-skin-edge'));
    this.sSkin = seedInt(seed, 'g2-skin');
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
    // 樹不長在表層藍圖與小點位（出生點石碑，Task 14）的外框內
    this.plants(col, x0, x1, bps.filter((b) => b.layer === BP_SURFACE || b.layer === BP_MINOR));
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
  // solid = 這一欄落在免挖洞箱內的列段 [y0, y1)（沒有 = null）：段內不挖噪聲洞穴、熔岩帶不額外挖空（礦 / 花崗岩 / 大理石照常換：礦照逐帶宿主表、花崗岩 / 大理石只換石頭類，結構本身之後由 stamp 蓋）；
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
    const sk = skinOf(x, I), skinTo = S + sk.depth, land = I.kind === COL_LAND;
    // 陸地欄的表層（landCell）：本欄的砂層底（地下沙漠淚滴的沙也到這裡）/ 雪層底；交界 ± SKIN_J 內另一側不同生態的陸地地區（沒有 = −1）
    const sandTo = S + DESERT_SAND_FROM + Math.floor(vnoise1(x, 20, this.sSkin + 4) * DESERT_SAND_SPAN), snowTo = this.snowTo(x, S);
    const rg = I.region, nL = land && x - rg.x0 < SKIN_J ? this.skinNeighbor(rg.x0 - 1, I.biome) : -1;
    const nR = land && rg.x1 - 1 - x < SKIN_J ? this.skinNeighbor(rg.x1, I.biome) : -1;
    if (nL >= 0 || nR >= 0) this.skinEdge.setX(x);
    const dry = (b: number): boolean => b === BIOME.DESERT || b === BIOME.SNOW;
    if (land && (dry(I.biome) || dry(nL) || dry(nR))) this.skinMat.setX(x);
    const entrance = I.kind === COL_LAND && this.entranceAt(x) && !inRows(solid, S);
    const caveTop = entrance ? S : Math.max(rock, S + (I.kind === COL_SEA || I.kind === COL_ISLAND ? NO_DIG_SEA : NO_DIG));
    const spanInv = 1 / Math.max(1, molten - rock);
    const CU = G2_ORE.copper, FE = G2_ORE.iron, AG = G2_ORE.silver, AU = G2_ORE.gold;
    // 泥土帶 / 熔岩帶放礦的列範圍（見 G2_ORE）
    const soilFrom = S + SOIL_ORE_FROM, moltenTo = Math.min(molten + MOLTEN_ORE_SPAN, LAVA_Y);
    this.spag.setX(x); this.cav.setX(x);
    this.oreCu.setX(x); this.oreFe.setX(x); this.oreAg.setX(x); this.oreAu.setX(x);
    this.granite.setX(x); this.marble.setX(x); this.molten.setX(x); this.obsidian.setX(x);
    // 這一欄碰得到的地下生態淚滴（通常沒有；有的話淚滴的雜訊已 setX(x)）；沙漠淚滴的砂層底每欄算一次
    const tds = this.tear.at(x), tf = this.tear;
    for (let y = Math.max(0, S); y < H; y++) {
      let t: number, w: number;
      if (y < rock) {
        if (land) {
          // 交界抖動：x + 抖動落在左 / 右鄰地區 → 用它的生態（地表那一列不抖）
          let b = I.biome;
          if ((nL >= 0 || nR >= 0) && y > S) {
            const jx = x + (this.skinEdge.at(y) - 0.5) * 2 * SKIN_J * Math.min(1, (y - S) / SKIN_RAMP);
            if (nL >= 0 && jx < rg.x0) b = nL; else if (nR >= 0 && jx >= rg.x1) b = nR;
          }
          this.landCell(b, y, S, sandTo, snowTo); t = this.cellT; w = this.cellW;
        } else if (y < skinTo) { t = sk.t; w = sk.w; } else { t = sk.under; w = sk.underW; }
      }
      else if (y < deep) { t = T.STONE; w = W.STONE_WALL; }
      else if (y < molten) { t = T.DEEP_STONE; w = W.DEEP_STONE_WALL; }
      else { t = T.BASALT; w = W.BASALT_WALL; }
      const i = li(x, y);
      // 地下生態淚滴只在岩層以下（岩層以上是地區自己的表層材質）
      const td = tds.length > 0 && y >= rock ? tf.hit(tds, x, y) : null, inner = tf.inner;
      if (td) w = TEAR_WALL[td.biome];
      if (y >= S + WALL_FROM) wall[i] = w;
      const inSolid = solid !== null && inRows(solid, y);
      // 洞穴（義大利麵越深越寬 + 洞穴層大洞窟）；免挖洞箱內不挖
      if (!inSolid && caveCut(this.spag, this.cav, y, caveTop, deep, caveK(y, rock, molten, spanInv))) {
        // 熔岩線：LAVA_Y 以下的空氣全是熔岩（全世界同一條水平線；主坑道最深只到 deep + 18，碰不到這裡）
        if (y >= LAVA_Y) { liq[i] = LIQ_MAX; lt[i] = LIQ.LAVA; }
        open = true;
        continue;
      }
      // 淚滴的洞穴（淚滴底都在熔岩帶上方，與下面的熔岩帶互不相干）
      if (td && !inSolid && !(parts !== null && inRows(parts, y)) && this.tearCave(td, inner, y, rock, sandTo)) {
        open = true;
        continue;
      }
      if (y >= molten && y < LAVA_Y) {
        // 熔岩帶：額外挖空（不留牆，看得到深淵背景；免挖洞箱內不挖）
        if (!inSolid && this.molten.above(y, MOLTEN_OPEN)) { wall[i] = W.NONE; open = true; continue; }
        if (open) ashLeft = ashD;
        // 只換玄武岩、不換藍圖部件內的格：熔岩石 / 黑曜石（團塊），其餘的地板表層換灰燼
        if (!(parts !== null && inRows(parts, y))) {
          if (this.obsidian.above(y, OBSIDIAN_THR)) t = this.obsidian.at(y) > MAGMA_THR ? T.MAGMA_ROCK : T.OBSIDIAN;
          else if (ashLeft > 0) t = T.ASH;
        }
        if (ashLeft > 0) ashLeft--;
      }
      open = false;
      // 石頭類：花崗岩 / 大理石先判（換掉的格不放礦），再換地下生態淚滴的材質
      if (STONE_BASE[t] === 1) {
        if (y >= gr0 && y < gr1 && this.granite.above(y, GRANITE_THR)) t = T.GRANITE;
        else if (y >= mb0 && y < mb1 && this.marble.above(y, MARBLE_THR)) t = T.MARBLE;
        else if (td) t = this.tearMat(td, y, sandTo, t);
      }
      // 礦：本格的深度帶 b 查逐帶宿主表（G2_ORE），貴的先判
      const b = y < rock ? 0 : y < deep ? 1 : y < molten ? 2 : 3;
      if ((b !== 0 || y >= soilFrom) && (b !== 3 || y < moltenTo)) {
        const au = AU[b], ag = AG[b], fe = FE[b], cu = CU[b];
        if (au !== null && au.host[t] === 1 && this.oreAu.at(y) > au.thr) t = T.GOLD_ORE;
        else if (ag !== null && ag.host[t] === 1 && this.oreAg.at(y) > ag.thr) t = T.SILVER_ORE;
        else if (fe !== null && fe.host[t] === 1 && this.oreFe.at(y) > fe.thr) t = T.IRON_ORE;
        else if (cu !== null && cu.host[t] === 1 && this.oreCu.at(y) > cu.thr) t = T.COPPER_ORE;
      }
      fg[i] = t;
    }
  }

  // 雪層底（見 SKIN_*）
  private snowTo(x: number, S: number): number {
    const s = this.sSkin;
    return S + 2 + Math.floor(vnoise1(x, 23, s + 6) * 4 + vnoise1(x, 7, s + 7) * 2.5 + Math.max(0, vnoise1(x, 41, s + 8) - 0.72) * 14);
  }

  // 第 q 欄若是生態不是 own 的陸地欄 → 它的生態，否則 −1（gen2 範圍外也是 −1）
  private skinNeighbor(q: number, own: number): number {
    if (!this.profile.regionAt(q)) return -1;
    const J = this.profile.info(q);
    return J.kind === COL_LAND && J.biome !== own ? J.biome : -1;
  }

  // 陸地欄岩層以上第 y 列、照生態 b 的表層材質與牆（ctx.ver 0 的規則）→ this.cellT / this.cellW。沙漠 / 雪原讀 skinMat（本欄已 setX）
  private landCell(b: number, y: number, S: number, sandTo: number, snowTo: number): void {
    if (b === BIOME.DESERT) {
      this.cellW = W.SANDSTONE_WALL;
      this.cellT = y < sandTo || this.skinMat.at(y) > DESERT_SAND_THR ? T.SAND : T.SANDSTONE;
      return;
    }
    if (b === BIOME.SNOW) {
      this.cellW = W.SNOW_WALL;
      if (y === S) { this.cellT = T.SNOW; return; }
      const m = this.skinMat.at(y);
      if (y < snowTo) { this.cellT = m > SKIN_SNOW_ICE ? T.ICE : T.SNOW; return; }
      this.cellT = m > FROST_ICE ? T.ICE : m < FROST_GRAVEL ? T.GRAVEL : m < FROST_STONE ? T.STONE : y < snowTo + FROST_SNOW_ROWS && m > FROST_SNOW ? T.SNOW : T.DIRT;
      return;
    }
    const k = landSkin(b);
    if (y < S + k.depth) { this.cellT = k.t; this.cellW = k.w; } else { this.cellT = k.under; this.cellW = k.underW; }
  }

  // 淚滴的洞穴（ctx.ver 0 的規則；淚滴的雜訊已 setX(x)）：叢林洞穴、沙漠的直條砂岩洞與大泡泡、雪原的冰洞
  private tearCave(td: Teardrop, inner: number, y: number, rock: number, sandTo: number): boolean {
    const tf = this.tear;
    if (td.biome === BIOME.JUNGLE) return y > rock && tf.caveA.at(y) > JUNGLE_CAVE_THR - JUNGLE_CAVE_INNER * inner;
    if (td.biome === BIOME.SNOW) return y > rock + SNOW_CAVE_BELOW && tf.caveA.at(y) > SNOW_CAVE_THR - SNOW_CAVE_INNER * inner;
    const t = (y - td.top) / td.depth;
    if (y <= sandTo + DESERT_CAVE_BELOW || t <= DESERT_CAVE_T) return false;
    const k = inner * Math.min(1, (t - DESERT_CAVE_T) * 6), v = tf.caveB.at(y) - 0.5;
    return (v < DESERT_SLIT * k && v > -DESERT_SLIT * k) || tf.caveA.at(y) > DESERT_BUBBLE_THR - DESERT_BUBBLE_INNER * k;
  }

  // 淚滴裡的石 / 深層岩換成什麼（ctx.ver 0 的規則）
  private tearMat(td: Teardrop, y: number, sandTo: number, t: number): number {
    const m = this.tear.mat.at(y);
    if (td.biome === BIOME.JUNGLE) return m > JUNGLE_MUD_THR ? T.MUD : t;
    if (td.biome === BIOME.SNOW) return m > SNOW_ICE_THR ? T.ICE : t;
    return y < sandTo || m > DESERT_SAND_THR ? T.SAND : T.SANDSTONE;
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
      } else if (r >= 1 - COBWEB_P && y < I.deep + COBWEB_BELOW_DEEP && (this.naturalSolid(x - 1, y) || this.naturalSolid(x + 1, y))) fg[i] = T.COBWEB;
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
