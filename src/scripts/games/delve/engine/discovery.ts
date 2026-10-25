// discovery.ts — 探索發現系統（純邏輯，不碰 DOM）。
//   · buildRegions：由 worldgen 的輸出推導出所有「地區 / 地標」（生態區、森林段、海岸、地層、迷你生態區、
//     大洞窟、裂谷、天坑、小屋、礦坑、遺跡、浮空島、結冰湖、乾湖床、密室、地城與其重要房間），依種子命名（中文）。
//     id = 陣列索引（同種子永遠相同），存檔只存 id。
//   · Discovery：已發現的地區、讀過的碑文、拿到的珍寶、最深紀錄、移動距離 → 日誌統計與完成度。
//   · 外圍（B13）：每個 v0 生態段與兩片海各是一個惰性地區（cat land），id = OUTER_REGION_BASE + zigzag(段號, 側)；
//     會跳「發現」並存進 found，但不算進日誌的總數與完成度（stats 只看已知表，舊世界的已知表 = 中央的 regions）。
//   · 已知地區表（Task 15）：listKnown = 中央 regions ∪ know() 加入的地區；stats 的各類別總數只數它。gen2 世界開局 know(gen2HomeRegions)（家鄉全知），
//     trackOuter 時 visit 到的外圍地區自動 know 並存進 toJSON().known（Q12）；region(id) 依序查中央 → 已知表 → resolver（gen2RegionById）。
//     消費端（M2a Task 16）：大地圖 / 日誌 / 提示 / 委託讀 listKnown；HUD 與環境音讀 knownAt / areaAt（中央索引 ∪ 已知的外圍地區）。
//   · gen2 名字（Task 17b）：家鄉同 kind 不重名、同一座地城的房間不重名（gen2Names.uniqueNames，Gen2Kit 建一次家鄉表）；村莊地區同舊世界外擴（走近就發現）。
//   · RegionJSON（Task 16）：烘焙過的舊世界把 buildRegions 的清單存進存檔（id 依生成順序，之後不再重算）；
//     contains 函式換成可存的形狀 RegionShape（buildRegions 填 shape），regionFromJSON 以深度層線重建出逐格相同的 contains。
import { Rng } from './rng';
import { seedInt, hash2 } from './noise';
import { SEA_W, type OuterProfile } from './legacy/chunkgen/profile';
import { BIOME } from './world';
import type { BiomeSegment, Structure, GenLayers, DungeonInfo, RoomKind } from './genTypes';
import { ITEMS, isItemId, type ItemId } from './items';
import { LORE } from './lore';
import { TILE_SIZE } from './constants';
import type { Side, RegionInfo } from './regionInfo';
import type { Gen2Source } from './gen2';
import { CULTURES } from './gen2/cultures';
import { VARIANT, SPAWN_X, type Landmass } from './gen2/layout';
import { slotOf, partsOf, type Blueprint, type BpBox, type BpKind } from './gen2/blueprint';
import { FILL_REACH } from './gen2/fill';
import { gen2SiteRegionId, isGen2SiteRegionId, siteOfRegionId, decodeStructureId } from './gen2/structId';
import { uniqueNames, type NameSpec } from './gen2Names';
import { X_LIMIT } from './coords';

/** 分類：地表區域（生態區）、地層、洞窟與秘境、遺跡與建築、地城、密室 */
export type RegionCat = 'land' | 'depth' | 'cave' | 'site' | 'dungeon' | 'secret';
export const CATEGORY_LABEL: Record<RegionCat, string> = {
  land: '地表區域', depth: '地層', cave: '洞窟與秘境', site: '遺跡與建築', dungeon: '地下城', secret: '密室',
};
export const CATEGORY_ORDER: readonly RegionCat[] = ['land', 'depth', 'cave', 'site', 'dungeon', 'secret'];

export interface Region {
  id: number;
  cat: RegionCat;
  /** 種類（desert / cabin / cavern_layer / dungeon_library …） */
  kind: string;
  name: string;
  /** 外接框（tile） */
  x: number; y: number; w: number; h: number;
  /** 地圖上名字 / 圖示的錨點（tile）；x = -1 表示橫跨整個世界（跟著畫面置中） */
  ax: number; ay: number;
  contains(x: number, y: number): boolean;
  /** contains 的可存形狀（buildRegions 填；外圍 / gen2 地區不存檔、沒有） */
  shape?: RegionShape;
}

/**
 * 地區範圍的形狀：rect / ellipse = 外接框（x, y, w, h）；cols = 欄範圍 [x, x + w)、y 介於 top(x) 與 bot(x) 之間，
 * top / bot 取該欄的深度層線（zero = 0、H = 世界高度；層線在 [0, W) 之外夾到邊欄）
 */
export type RegionShape = { t: 'rect' } | { t: 'ellipse' } | { t: 'cols'; top: 'zero' | 'rock' | 'deep' | 'molten'; bot: 'deep' | 'molten' | 'H' };
/** 存檔用的地區（Region 去掉 contains、shape 必有） */
export type RegionJSON = Omit<Region, 'contains' | 'shape'> & { shape: RegionShape };

export interface RegionSource {
  seed: string;
  width: number; height: number;
  spawn: { x: number; y: number };
  /** 每欄地表（生成時） */
  surface: Int16Array;
  layers: GenLayers;
  biomes: readonly BiomeSegment[];
  structures: readonly Structure[];
  dungeon: DungeonInfo | null;
}

// ── 命名 ─────────────────────────────────────────────────
export const NAMES: Record<string, readonly string[]> = {
  forest: ['低語林地', '苔光林地', '老橡樹林', '鹿角林', '晨霧林地', '松鼠丘陵', '落葉長廊', '樹冠迴廊'],
  desert: ['赤砂荒漠', '低語沙海', '烈日沙原', '駝鈴沙丘'],
  snow: ['霜牙雪原', '白寂雪原', '寒鴉雪嶺', '銀針雪野'],
  jungle: ['濕綠叢林', '藤纏密林', '蛙鳴叢林', '翡翠沼林'],
  cabin: ['老礦工的小屋', '守林人的小屋', '獨眼採石匠的家', '迷路信差的落腳處', '退休爆破手的小屋', '燈匠的工坊',
    '沉默鐵匠的小屋', '失蹤測量師的營地', '夜班挖工的宿舍', '拾荒老婆婆的家', '採菇人的小屋', '雙胞胎礦工的家',
    '說書人的小屋', '被遺忘的哨站', '燒炭人的窩棚', '流浪樂手的小屋', '老鼠王的小屋', '養蜂人的地窖'],
  mineshaft: ['黑脈坑道', '銅鈴坑道', '斷樑坑道', '回聲坑道', '寡婦坑道', '第七坑道', '老鼠坑道', '紅燈坑道', '長夜坑道', '鐵軌坑道', '窄喉坑道', '霧氣坑道'],
  ruin: ['傾頹石廳', '無名祠堂', '守望者遺址', '半埋的門樓', '碎碑庭院', '燈脈人的舊居'],
  sky_island: ['雲上小築', '漂浮果園', '風鈴島', '孤鷹島', '天際驛站', '晴空小島'],
  chasm: ['無底裂谷', '巨人之疤', '回音裂縫', '黑喉裂谷', '斷崖之縫'],
  ravine: ['風切谷', '碎石溝', '狼嚎峽谷', '乾河峽谷', '鷹嘴峽谷', '影子溝'],
  sinkhole: ['塌陷天坑', '墜星坑', '井中之井', '雨落天坑', '漏斗洞'],
  frozen_lake: ['鏡面冰湖', '靜默冰湖', '月光冰湖'],
  lake_bed: ['靜水湖', '蘆花湖', '鷺鷥湖', '碧鏡湖'],
  oasis: ['棕櫚綠洲', '駝鈴綠洲', '月泉綠洲', '旅人之泉'],
  hive: ['琥珀蜂巢', '嗡鳴蜂窟', '蜜糖巢穴', '六角蜂城'],
  underground_lake: ['地底暗湖', '沉默水窟', '黑鏡湖', '滴水洞湖', '盲魚湖', '深淵水潭', '迴聲水窟', '冷泉洞'],
  cavern_mushroom: ['幽光菇廳', '孢子大廳', '藍燈穹窟'],
  cavern_crystal: ['晶簇大廳', '星屑穹窟', '千面晶廳'],
  cavern_plain: ['迴音大廳', '巨人之腹', '穹頂洞窟', '沉睡洞廳', '黑石大廳', '寂靜穹窟'],
  mushroom_biome: ['幽藍菇林', '夢遊菇林', '孢子森林', '螢光菇林'],
  crystal_cave: ['寂靜晶洞', '冷光晶窟', '星屑晶洞', '玻璃之心'],
  secret_room: ['被遺忘的儲藏室', '礦工的密藏', '封死的隱室', '走私者暗室', '燈脈人的寶庫', '無人知曉的房間', '石縫後的小間'],
  dungeon: ['沉眠地城', '燈脈地下城', '磚影古城', '無光王廷'],
  village: ['楓溪村', '白石村', '麥浪村', '鈴蘭村', '橡木村', '暮光村', '風鈴村', '青苔村'],
  sea: ['暗潮海域', '鹹風海', '無名海峽', '浪語海', '霧鎖海灣', '遠洋'],
  island: ['孤礁島', '椰影島', '潮間小島', '海鷗島', '漂木島', '無名小島'],
  shipwreck: ['擱淺的商船', '沉默的殘骸', '鏽錨之舟', '破帆沉船'],
  dwarf_hall: ['鐵脈地廳', '深爐大廳', '灰鬚石廳', '琥珀礦廳'],
  pond: ['蘆葦池', '蛙鳴池', '睡蓮池', '野鴨池', '清泉池', '月影池'],
};
// 各房間種類的名單兩兩不重疊（含下面的 gen2 補充）：gen2 的「整座地城房間不重名」只在同種類內唯一化，靠這個前提（discovery.test 斷言）
export const ROOM_NAMES: Partial<Record<RoomKind, readonly string[]>> = {
  entry: ['入口大廳'], library: ['塵封書庫', '禁書庫', '低語書齋'], prison: ['鐵鍊牢房', '沉默監牢', '鏽鎖牢區'],
  shrine: ['金鑰神殿'], treasure: ['最深的寶庫'], vault: ['地圖密室'],
};
// ── gen2 專用補充名單（Task 17b 修正）：接在舊名單後面，舊世界（Namer / buildRegions）不用，舊世界名字不變。
//    gen2 的起點仍以舊名單長度取模（雜湊 % 舊長度）→ 沒碰撞的地區名字和補名單前相同；補充名字只在衝突時才用到。
//    家鄉 300 個種子的最大同類數：書庫 4、牢房 3、水晶洞 5、礦坑密室 7（舊名單 3 / 3 / 4 / 7）
const GEN2_ROOM_EXTRA: Partial<Record<RoomKind, readonly string[]>> = {
  library: ['殘卷書室', '古籍書廊', '蛛網書齋'], prison: ['枯骨囚室', '幽閉囚籠'],
};
/** gen2 地城房間的名單 = ROOM_NAMES + GEN2_ROOM_EXTRA */
export const GEN2_ROOM_NAMES: Partial<Record<RoomKind, readonly string[]>> = Object.fromEntries(
  (Object.keys(ROOM_NAMES) as RoomKind[]).map((k) => [k, [...ROOM_NAMES[k]!, ...(GEN2_ROOM_EXTRA[k] ?? [])]]),
);
/** gen2 地點的補充名單（接在 NAMES[kind] 後面；不得和任何 NAMES 名單重複） */
export const GEN2_NAMES_EXTRA: Partial<Record<string, readonly string[]>> = {
  crystal_cave: ['紫晶幽窟', '霜晶洞', '虹光晶洞'],
  secret_room: ['盜墓者的暗格', '牆後的祕藏', '塵封的小金庫'],
};
/** gen2 種類的命名池：list = 名單（含補充）、base = 起點取模的長度（舊名單長度）；沒有名單 → null（依 kind 快取） */
interface Gen2Pool { list: readonly string[]; base: number }
const GEN2_POOLS = new Map<string, Gen2Pool | null>();
function gen2Pool(kind: string): Gen2Pool | null {
  let p = GEN2_POOLS.get(kind);
  if (p !== undefined) return p;
  if (kind.startsWith('dungeon_')) {
    const k = kind.slice(8) as RoomKind, l = GEN2_ROOM_NAMES[k];
    p = l ? { list: l, base: ROOM_NAMES[k]!.length } : null;
  } else {
    const l = NAMES[kind];
    p = l ? { list: [...l, ...(GEN2_NAMES_EXTRA[kind] ?? [])], base: l.length } : null;
  }
  GEN2_POOLS.set(kind, p);
  return p;
}
/** gen2 種類（Region.kind；地城房間 = dungeon_xxx）的名單（含 gen2 補充）；沒有 → null */
export function gen2NameList(kind: string): readonly string[] | null { return gen2Pool(kind)?.list ?? null; }

/** 依種子從名單挑名字；挑過的不重複（名單用完後加上「二」「三」…） */
class Namer {
  private used = new Set<string>();
  private rng: Rng;
  constructor(seed: string) { this.rng = new Rng(`${seed}:region-names`); }
  pick(list: readonly string[]): string {
    const free = list.filter((n) => !this.used.has(n));
    let name = free.length ? free[this.rng.int(0, free.length)] : list[this.rng.int(0, list.length)];
    for (let k = 2; this.used.has(name); k++) name = `${name.replace(/[二三四五六七八九]$/, '')}${'二三四五六七八九'[Math.min(7, k - 2)]}`;
    this.used.add(name);
    return name;
  }
  fixed(name: string): string { this.used.add(name); return name; }
}

const rectHit = (x0: number, y0: number, w: number, h: number) => (x: number, y: number): boolean =>
  x >= x0 && x < x0 + w && y >= y0 && y < y0 + h;
const ellipseHit = (x0: number, y0: number, w: number, h: number) => {
  const cx = x0 + w / 2, cy = y0 + h / 2, rx = w / 2, ry = h / 2;
  return (x: number, y: number): boolean => {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  };
};

/** 形狀 → contains（buildRegions 與 regionFromJSON 共用：讀回來的地區逐格相同） */
function containsOf(shape: RegionShape, x0: number, y0: number, w: number, h: number, layers: GenLayers, H: number): (x: number, y: number) => boolean {
  if (shape.t === 'rect') return rectHit(x0, y0, w, h);
  if (shape.t === 'ellipse') return ellipseHit(x0, y0, w, h);
  const W = layers.deep.length;
  const line = (a: Int16Array) => (x: number): number => a[Math.max(0, Math.min(W - 1, x))];
  const top = shape.top === 'zero' ? (): number => 0 : line(layers[shape.top]);
  const bot = shape.bot === 'H' ? (): number => H : line(layers[shape.bot]);
  const x1 = x0 + w;
  return (x: number, y: number): boolean => x >= x0 && x < x1 && y >= top(x) && y < bot(x);
}

const STRUCT_CAT: Partial<Record<string, RegionCat>> = {
  cabin: 'site', mineshaft: 'site', ruin: 'site', sky_island: 'site', frozen_lake: 'site', lake_bed: 'site', oasis: 'site',
  hive: 'cave', underground_lake: 'cave',
  cavern: 'cave', chasm: 'cave', ravine: 'cave', sinkhole: 'cave', mushroom_biome: 'cave', crystal_cave: 'cave',
  secret_room: 'secret',
  village: 'site', dwarf_hall: 'site',
};
/** 村莊地區的外擴（舊世界 buildRegions 與 gen2 共用）：結構框左右各 VILLAGE_PAD 格、上方 VILLAGE_PAD_UP 格（下方不外擴）；地圖錨點仍在結構框中心 */
const VILLAGE_PAD = 22, VILLAGE_PAD_UP = 10;

export function buildRegions(src: RegionSource): Region[] {
  const { width: W, height: H, layers } = src;
  const nm = new Namer(src.seed);
  const out: Region[] = [];
  // contains 一律由 shape 建（containsOf），存檔讀回來（regionFromJSON）逐格相同
  const add = (r: Omit<Region, 'id' | 'ax' | 'ay' | 'contains' | 'shape'> & { ax?: number; ay?: number; shape: RegionShape }): void => {
    out.push({ ...r, ax: r.ax ?? Math.floor(r.x + r.w / 2), ay: r.ay ?? Math.floor(r.y + r.h / 2), id: out.length, contains: containsOf(r.shape, r.x, r.y, r.w, r.h, layers, H) });
  };
  const clampX = (x: number): number => Math.max(0, Math.min(W - 1, x));
  /** 欄範圍 [x, x + w)、y 介於 top 與 bot 的層線之間 */
  const cols = (top: 'zero' | 'rock' | 'deep' | 'molten', bot: 'deep' | 'molten' | 'H'): RegionShape => ({ t: 'cols', top, bot });
  const deep = (x: number): number => layers.deep[clampX(x)];

  // ── 地域：海岸、森林段、沙漠 / 雪原 / 叢林 ──
  const coastW = Math.max(8, Math.round(W * 0.015) + 6);
  const bio = [...src.biomes].sort((a, b) => a.x0 - b.x0);
  const lands: { kind: string; x0: number; x1: number; name: string }[] = [];
  lands.push({ kind: 'coast', x0: 0, x1: coastW, name: nm.fixed('西岸沙灘') });
  lands.push({ kind: 'coast', x0: W - coastW, x1: W, name: nm.fixed('東岸沙灘') });
  const kinds: Record<number, string> = { [BIOME.DESERT]: 'desert', [BIOME.SNOW]: 'snow', [BIOME.JUNGLE]: 'jungle' };
  let fx = coastW;
  const forestUntil = (x1: number): void => {
    if (x1 - fx >= 40) {
      const home = src.spawn.x >= fx && src.spawn.x < x1;
      lands.push({ kind: 'forest', x0: fx, x1, name: home ? nm.fixed('家鄉林地') : nm.pick(NAMES.forest) });
    }
  };
  for (const b of bio) {
    forestUntil(Math.max(fx, b.x0));
    lands.push({ kind: kinds[b.biome] ?? 'forest', x0: b.x0, x1: b.x1, name: nm.pick(NAMES[kinds[b.biome] ?? 'forest']) });
    fx = Math.max(fx, b.x1);
  }
  forestUntil(W - coastW);
  for (const l of lands.sort((a, b) => a.x0 - b.x0)) {
    let top = H;
    for (let x = l.x0; x < l.x1; x++) top = Math.min(top, src.surface[clampX(x)]);
    let bot = 0;
    for (let x = l.x0; x < l.x1; x++) bot = Math.max(bot, deep(x));
    add({ cat: 'land', kind: l.kind, name: l.name, x: l.x0, y: 0, w: l.x1 - l.x0, h: bot, ay: Math.max(4, top - 14), shape: cols('zero', 'deep') });
  }

  // ── 地層 ──
  const minOf = (a: Int16Array): number => { let m = H; for (let i = 0; i < a.length; i++) m = Math.min(m, a[i]); return m; };
  const maxOf = (a: Int16Array): number => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, a[i]); return m; };
  add({ cat: 'depth', kind: 'rock_layer', name: nm.fixed('地底岩層'), x: 0, y: minOf(layers.rock), w: W, h: H - minOf(layers.rock),
    ax: -1, ay: maxOf(layers.rock) + 12, shape: cols('rock', 'deep') });
  add({ cat: 'depth', kind: 'cavern_layer', name: nm.fixed('洞穴層'), x: 0, y: minOf(layers.deep), w: W, h: H - minOf(layers.deep),
    ax: -1, ay: maxOf(layers.deep) + 12, shape: cols('deep', 'molten') });
  add({ cat: 'depth', kind: 'molten', name: nm.fixed('熔岩深淵'), x: 0, y: minOf(layers.molten), w: W, h: H - minOf(layers.molten),
    ax: -1, ay: maxOf(layers.molten) + 12, shape: cols('molten', 'H') });

  // ── 結構 / 迷你生態區 / 洞窟 ──
  for (const s of src.structures) {
    const cat = STRUCT_CAT[s.kind];
    if (!cat) continue;
    let list = NAMES[s.kind];
    if (s.kind === 'cavern') list = NAMES[`cavern_${s.flavor ?? 'plain'}`];
    const round = s.kind === 'mushroom_biome' || s.kind === 'crystal_cave' || s.kind === 'cavern';
    // 村落：走近（左右各 VILLAGE_PAD = 22 格、上方多 VILLAGE_PAD_UP = 10 格）就算發現——還沒進村就跳出「發現：○○村」
    const pad = s.kind === 'village' ? VILLAGE_PAD : 0, padY = s.kind === 'village' ? VILLAGE_PAD_UP : 0;
    const rx = s.x - pad, ry = s.y - padY, rw = s.w + pad * 2, rh = s.h + padY;
    add({ cat, kind: s.kind, name: nm.pick(list), x: rx, y: ry, w: rw, h: rh,
      ax: s.x + (s.w >> 1), ay: s.y + (s.h >> 1),
      shape: { t: round ? 'ellipse' : 'rect' } });
  }

  // ── 地城 + 重要房間 ──
  const d = src.dungeon;
  if (d) {
    const b = d.bbox;
    add({ cat: 'dungeon', kind: 'dungeon', name: nm.pick(NAMES.dungeon), x: b.x, y: b.y, w: b.w, h: b.h, shape: { t: 'rect' } });
    for (const r of d.rooms) {
      const list = ROOM_NAMES[r.kind];
      if (!list) continue;
      add({ cat: 'dungeon', kind: `dungeon_${r.kind}`, name: nm.pick(list), x: r.x, y: r.y, w: r.w, h: r.h, shape: { t: 'rect' } });
    }
  }
  return out;
}

/** 地區 → 存檔用的 RegionJSON（沒有 shape 的地區（外圍 / gen2）不能存 → RangeError） */
export function toRegionJSON(r: Region): RegionJSON {
  if (!r.shape) throw new RangeError(`region ${r.id} has no shape`);
  const { id, cat, kind, name, x, y, w, h, ax, ay } = r;
  return { id, cat, kind, name, x, y, w, h, ax, ay, shape: { ...r.shape } };
}

const TOPS: readonly string[] = ['zero', 'rock', 'deep', 'molten'], BOTS: readonly string[] = ['deep', 'molten', 'H'];
/** 存檔的 RegionJSON → Region（contains 由 shape + 深度層線重建）；形狀 / 欄位不合法 → RangeError */
export function regionFromJSON(j: unknown, layers: GenLayers, H: number): Region {
  if (!j || typeof j !== 'object' || Array.isArray(j)) throw new RangeError('region: not an object');
  const o = j as Record<string, unknown>;
  const int = (k: string): number => {
    const v = o[k];
    if (!Number.isInteger(v)) throw new RangeError(`region: ${k}`);
    return v as number;
  };
  const id = int('id'), x = int('x'), y = int('y'), w = int('w'), h = int('h'), ax = int('ax'), ay = int('ay');
  if (id < 0 || w < 0 || h < 0) throw new RangeError('region: range');
  if (typeof o.cat !== 'string' || !(CATEGORY_ORDER as readonly string[]).includes(o.cat)) throw new RangeError('region: cat');
  if (typeof o.kind !== 'string' || typeof o.name !== 'string') throw new RangeError('region: kind / name');
  const sh = o.shape;
  if (!sh || typeof sh !== 'object') throw new RangeError('region: shape');
  const q = sh as { t?: unknown; top?: unknown; bot?: unknown };
  let shape: RegionShape;
  if (q.t === 'rect' || q.t === 'ellipse') shape = { t: q.t };
  else if (q.t === 'cols' && typeof q.top === 'string' && TOPS.includes(q.top) && typeof q.bot === 'string' && BOTS.includes(q.bot)) {
    shape = { t: 'cols', top: q.top as 'zero' | 'rock' | 'deep' | 'molten', bot: q.bot as 'deep' | 'molten' | 'H' };
  } else throw new RangeError('region: shape');
  return { id, cat: o.cat as RegionCat, kind: o.kind, name: o.name, x, y, w, h, ax, ay, shape, contains: containsOf(shape, x, y, w, h, layers, H) };
}

// ── 外圍地區（B13） ──────────────────────────────────────
/** 外圍地區 id 的起點（中央地區 id = 陣列索引，遠小於這個） */
export const OUTER_REGION_BASE = 2 ** 30;
/** 外圍地區 id 的上限（不含；段號 / 側的 zigzag 不會超過） */
export const OUTER_REGION_END = OUTER_REGION_BASE + 2 ** 22;
/** 段號 n（海 = 0、海後第 k 段陸地 = k + 1）與側（東 1 / 西 −1）→ 外圍地區 id */
export function outerRegionId(n: number, side: 1 | -1): number {
  return OUTER_REGION_BASE + n * 2 + (side === 1 ? 0 : 1);
}
export function isOuterRegionId(id: number): boolean {
  return Number.isInteger(id) && id >= OUTER_REGION_BASE && id < OUTER_REGION_END;
}
const OUTER_BIOME_KEY: Record<number, string> = { [BIOME.FOREST]: 'forest', [BIOME.DESERT]: 'desert', [BIOME.SNOW]: 'snow', [BIOME.JUNGLE]: 'jungle' };

/**
 * 外圍地區的查詢：(x, y) → 那一片海 / 那一段生態的地區，0 或 1 個（惰性建立、快取；中央 / 範圍外 → []）。
 * 名字：海 = 「西方大海」/「東方大海」；陸地 = 「東境・」/「西境・」+ NAMES[生態] 依（seed, 側, 段號）雜湊挑。
 * 範圍：該段的欄、y 在洞穴層線以上（同中央的地表區域）。
 */
export function outerRegions(seed: string, profile: OuterProfile): (x: number, y: number) => Region[] {
  const cache = new Map<number, Region>();
  const sName = seedInt(seed, 'outer-region-names');
  const width = profile.frame.width;
  const deep = (x: number): number => profile.layersAt(x).deep;
  const make = (id: number, kind: string, name: string, x0: number, x1: number): Region => {
    const ax = Math.floor((x0 + x1) / 2);
    return {
      id, cat: 'land', kind, name, x: x0, y: 0, w: x1 - x0, h: profile.frame.cavernY,
      ax, ay: Math.max(4, profile.surfaceAt(ax) - 14),
      contains: (x: number, y: number): boolean => x >= x0 && x < x1 && y >= 0 && y < deep(x),
    };
  };
  return (x: number, y: number): Region[] => {
    const z = profile.zoneAt(x);
    if (z.kind === 'central') return [];
    const n = z.kind === 'sea' ? 0 : z.seg.k + 1;
    const id = outerRegionId(n, z.side);
    let r = cache.get(id);
    if (!r) {
      if (z.kind === 'sea') {
        const [x0, x1] = z.side === 1 ? [width, width + SEA_W] : [-SEA_W, 0];
        r = make(id, 'sea', z.side === 1 ? '東方大海' : '西方大海', x0, x1);
      } else {
        const key = OUTER_BIOME_KEY[z.seg.biome] ?? 'forest', list = NAMES[key];
        const pick = list[Math.floor(hash2(z.seg.k, z.side, sName) * list.length) % list.length];
        r = make(id, key, `${z.side === 1 ? '東境・' : '西境・'}${pick}`, z.seg.x0, z.seg.x1);
      }
      cache.set(id, r);
    }
    return r.contains(x, y) ? [r] : [];
  };
}

// ── gen2 地區 ────────────────────────────────────────────
/** gen2 地區 id 的起點（高於舊世界外圍的範圍） */
export const GEN2_REGION_BASE = 2 ** 32;
const GEN2_REGION_END = GEN2_REGION_BASE + 2 ** 26;
/** (側, 第幾片地塊, 地區 index, sub) → id；sub 0 = 地區本身（結構的地區 id 另走 gen2/structId 的 gen2SiteRegionId） */
export function gen2RegionId(side: Side, i: number, index: number, sub: number): number {
  return GEN2_REGION_BASE + (((i * 2 + (side < 0 ? 1 : 0)) * 64 + index) * 64 + sub);
}
export function isGen2RegionId(id: number): boolean {
  return Number.isInteger(id) && id >= GEN2_REGION_BASE && id < GEN2_REGION_END;
}
const GEN2_BIOME_KEY = ['forest', 'desert', 'snow', 'jungle'] as const;

/**
 * gen2 藍圖種類 → 結構地區（kind、cat、round = 橢圓）。沒列的種類不立地區：箱子（crate）、熔岩池，
 * 以及家鄉的石碑 / 遺物點（alcove / molten_shrine / shaft_cache / spawn_tablet，Task 14；它們是點不是區域）。
 * 之後的種類（keep / hermit_hut：Task 18；lighthouse / wreck 島 / reef / sea_ruin：Task 20）接上時加在這裡。
 */
const GEN2_SITE: Partial<Record<BpKind, { kind: string; cat: RegionCat; round?: true }>> = {
  cabin: { kind: 'cabin', cat: 'site' }, ruin: { kind: 'ruin', cat: 'site' }, shipwreck: { kind: 'shipwreck', cat: 'site' },
  mineshaft: { kind: 'mineshaft', cat: 'site' }, sky_island: { kind: 'sky_island', cat: 'site' }, lake: { kind: 'pond', cat: 'site' },
  village: { kind: 'village', cat: 'site' }, hall: { kind: 'dwarf_hall', cat: 'site' },
  mushroom_biome: { kind: 'mushroom_biome', cat: 'cave', round: true }, crystal_cave: { kind: 'crystal_cave', cat: 'cave', round: true },
  hive: { kind: 'hive', cat: 'cave', round: true }, cave_lake: { kind: 'underground_lake', cat: 'cave' },
  dungeon: { kind: 'dungeon', cat: 'dungeon' },
};

/** gen2 地區的建法（gen2Regions / gen2RegionById / gen2HomeRegions 共用；依 (src, seed) 共用一份，快取也共用） */
interface Gen2Kit {
  /** 地塊 m 的第 info 個地區 */
  land(m: Landmass, info: RegionInfo): Region;
  /** 藍圖的結構地區（part 0 = 結構本身；礦坑密室 part 1、地城房間 part 1..）；不立地區的種類 = [] */
  sites(b: Blueprint): readonly Region[];
}
const GEN2_KITS = new WeakMap<Gen2Source, Map<string, Gen2Kit>>();
/** gen2Regions 多查的欄數：藍圖外框伸出槽的 FILL_REACH 與村莊外擴 VILLAGE_PAD 取大者 */
const SITE_REACH = Math.max(FILL_REACH, VILLAGE_PAD);

function gen2Kit(seed: string, src: Gen2Source): Gen2Kit {
  let bySeed = GEN2_KITS.get(src);
  if (!bySeed) { bySeed = new Map(); GEN2_KITS.set(src, bySeed); }
  let kit = bySeed.get(seed);
  if (!kit) { kit = makeGen2Kit(seed, src); bySeed.set(seed, kit); }
  return kit;
}

/** 藍圖的一個結構地區（名字以外的部分）：box = 地區範圍、(ax, ay) = 地圖錨點、pool = 命名池（gen2Pool） */
interface SitePart { id: number; cat: RegionCat; kind: string; pool: Gen2Pool; box: BpBox; round: boolean; ax: number; ay: number }
/** 村莊地區的外擴（gen2Regions 的外框預篩與 siteParts 共用）：左右 x、上方 up；其他種類不外擴 */
const padOf = (kind: string): { x: number; up: number } => (kind === 'village' ? { x: VILLAGE_PAD, up: VILLAGE_PAD_UP } : { x: 0, up: 0 });

/**
 * 名字（Task 17b）：起點由 id 雜湊在名單上挑；家鄉（gen2HomeRegions 的全部地區）依 kind 唯一化——kit 第一次碰到家鄉的地區時，
 * 一次算好整個家鄉的 id → 名字表（gen2Names.uniqueNames：只看家鄉整組，與查詢順序無關），gen2Regions / gen2RegionById / gen2HomeRegions 都查這張表；
 * 家鄉以外的藍圖在自己的部件之間唯一化（外圍地城的房間），外圍彼此可以重名、同一個 id 永遠同名。同種子跨實例相同（主機 / 客人逐位相同）。
 * 地塊地區範圍 = 欄範圍、y 在洞穴層線以上；結構地區 = 藍圖主體（部件 0；沒有部件 = 外框——豎井部件不算進地區）的矩形，
 * 蘑菇林 / 水晶洞 / 蜂巢是主體的內切橢圓；村莊 = 主體左右各外擴 VILLAGE_PAD、上方 VILLAGE_PAD_UP（同舊世界，走近就算發現；錨點仍在主體中心）；
 * 地城 = DungeonInfo.bbox（同舊世界）、房間 = 有名字的房間（ROOM_NAMES，依 rooms 順序編 part 1..）；礦坑密室 = Blueprint.secret（密室室內，Task 14）。
 * 名單用 gen2Pool（舊名單 + gen2 補充）；起點 = 雜湊 % 舊名單長度，所以起點沒和別人衝突的地區名字和 Task 17b 之前相同。
 */
function makeGen2Kit(seed: string, src: Gen2Source): Gen2Kit {
  const sName = seedInt(seed, 'gen2-region-names');
  const cache = new Map<number, Region>(), siteCache = new Map<number, readonly Region[]>();
  const deep = (x: number): number => src.layersAt(x).deep;
  const pickIdx = (n: number, id: number): number => Math.floor(hash2(id & 0xffffff, id >>> 24, sName) * n) % n;
  const pickName = (list: readonly string[], id: number): string => list[pickIdx(list.length, id)];
  const pickSpec = (id: number, kind: string, pool: Gen2Pool): NameSpec => ({ id, kind, list: pool.list, start: pickIdx(pool.base, id) });
  const landKind = (info: RegionInfo): string => (info.kind === 'sea' || info.kind === 'island' ? info.kind : GEN2_BIOME_KEY[info.biome] ?? 'forest');
  const cached = (id: number, make: () => Region): Region => {
    let r = cache.get(id);
    if (!r) { r = make(); if (cache.size >= 4096) cache.clear(); cache.set(id, r); }
    return r;
  };
  const landName = (info: RegionInfo, id: number, firstSea: boolean): string => {
    const west = info.side < 0, pre = west ? '西境・' : '東境・';
    if (info.kind === 'sea') return firstSea ? (west ? '西方大海' : '東方大海') : pre + pickName(NAMES.sea, id);
    if (info.kind === 'island') return pickName(NAMES.island, id);
    if (info.kind === 'culture' && info.culture) {
      const c = CULTURES[info.culture], h = Math.floor(hash2(id & 0xffffff, id >>> 24, sName) * c.prefixes.length * c.suffixes.length);
      return c.prefixes[h % c.prefixes.length] + c.suffixes[Math.floor(h / c.prefixes.length) % c.suffixes.length];
    }
    if (info.kind === 'home') {
      if (info.variant === VARIANT.BEACH) return (info.x0 + info.x1) / 2 < SPAWN_X ? '西岸沙灘' : '東岸沙灘';
      if (info.variant === VARIANT.SPAWN) return '家鄉林地';
      return pickName(NAMES[GEN2_BIOME_KEY[info.biome] ?? 'forest'], id);
    }
    return pre + pickName(NAMES[GEN2_BIOME_KEY[info.biome] ?? 'forest'], id);
  };
  // 結構地區 id = gen2SiteRegionId(藍圖 id, part)（位元配置只在 gen2/structId.ts）
  const siteParts = (b: Blueprint): SitePart[] => {
    const m = GEN2_SITE[b.kind];
    if (!m) return [];
    const out: SitePart[] = [];
    const add = (part: number, cat: RegionCat, kind: string, box: BpBox, round = false, anchor: BpBox = box): void => {
      const pool = gen2Pool(kind);
      if (!pool) throw new RangeError(`gen2: no name list for ${kind}`);
      out.push({ id: gen2SiteRegionId(b.id, part), cat, kind, pool, box, round, ax: anchor.x + (anchor.w >> 1), ay: anchor.y + (anchor.h >> 1) });
    };
    const s = b.site;
    if (m.kind === 'dungeon' && s?.kind === 'dungeon') {
      add(0, 'dungeon', 'dungeon', s.info.bbox);
      let part = 1;
      for (const r of s.info.rooms) {
        if (!ROOM_NAMES[r.kind] || part >= 64) continue;
        add(part++, 'dungeon', `dungeon_${r.kind}`, r);
      }
    } else {
      const body = partsOf(b)[0];
      // 村莊：走近就算發現（同舊世界 buildRegions）——地區範圍外擴，錨點仍在主體中心
      const pad = padOf(m.kind), box = { x: body.x - pad.x, y: body.y - pad.up, w: body.w + pad.x * 2, h: body.h + pad.up };
      add(0, m.cat, m.kind, box, m.round === true, body);
      if (m.kind === 'mineshaft' && b.secret) add(1, 'secret', 'secret_room', b.secret);
    }
    return out;
  };
  // 家鄉地塊地區的命名：沙灘 / 出生點林地是固定名字（landName），其餘家鄉地區用該生態的名單
  const landSpec = (m: Landmass, info: RegionInfo): NameSpec => {
    const id = gen2RegionId(m.side, m.i, info.index, 0), kind = landKind(info);
    if (info.kind === 'home' && info.variant !== VARIANT.BEACH && info.variant !== VARIANT.SPAWN) return pickSpec(id, kind, gen2Pool(GEN2_BIOME_KEY[info.biome] ?? 'forest')!);
    return { id, kind, fixed: landName(info, id, false) };
  };
  // 家鄉的 id → 名字表：家鄉地塊的每個地區 + 家鄉藍圖（homePlans）的結構地區，依 kind 唯一化；第一次用到時建一次（沒有家鄉 = 空表）
  let homeTable: Map<number, string> | null = null;
  const homeNames = (): Map<number, string> => {
    if (homeTable) return homeTable;
    const h = src.layout.origin.home, m = h ? src.layout.landmassAt(h.x0) : null, specs: NameSpec[] = [];
    if (m && m.kind === 'home') {
      for (const info of m.regions) specs.push(landSpec(m, info));
      for (const b of src.blueprints.homePlans()) for (const p of siteParts(b)) specs.push(pickSpec(p.id, p.kind, p.pool));
    }
    homeTable = uniqueNames(specs);
    return homeTable;
  };
  // 地塊 m 的第 info 個地區 → Region（快取）
  const regionOf = (m: Landmass, info: RegionInfo): Region => {
    const id = gen2RegionId(m.side, m.i, info.index, 0);
    const o = src.layout.origin, first = info.kind === 'sea' && m.i === ((m.side > 0 ? o.east : o.west).start === 'sea' ? 1 : 2);
    return cached(id, () => {
      let hmax = 0;
      for (let cx = info.x0; cx < info.x1; cx += 16) hmax = Math.max(hmax, deep(cx));
      const ax = Math.floor((info.x0 + info.x1) / 2);
      return {
        id, cat: 'land', kind: landKind(info),
        name: (m.kind === 'home' ? homeNames().get(id) : undefined) ?? landName(info, id, first), x: info.x0, y: 0, w: info.x1 - info.x0, h: hmax,
        ax, ay: Math.max(4, src.surfaceAt(ax) - 14),
        contains: (cx: number, cy: number): boolean => cx >= info.x0 && cx < info.x1 && cy >= 0 && cy < deep(cx),
      };
    });
  };
  // 家鄉藍圖（結構 id 的 side = 0）查家鄉表；其他藍圖在自己的部件之間唯一化（家鄉表沒有的也退回這裡；只在需要時才算）
  const sitesOf = (b: Blueprint): readonly Region[] => {
    const ps = siteParts(b);
    if (!ps.length) return [];
    const home = decodeStructureId(b.id).side === 0 ? homeNames() : null;
    let own: Map<number, string> | null = null;
    return ps.map((p): Region => {
      const { x, y, w, h } = p.box;
      const name = home?.get(p.id) ?? (own ??= uniqueNames(ps.map((q) => pickSpec(q.id, q.kind, q.pool)))).get(p.id)!;
      return { id: p.id, cat: p.cat, kind: p.kind, name, x, y, w, h, ax: p.ax, ay: p.ay, contains: p.round ? ellipseHit(x, y, w, h) : rectHit(x, y, w, h) };
    });
  };
  return {
    land: regionOf,
    sites(b: Blueprint): readonly Region[] {
      let rs = siteCache.get(b.id);
      if (!rs) { rs = sitesOf(b); if (siteCache.size >= 4096) siteCache.clear(); siteCache.set(b.id, rs); }
      return rs;
    },
  };
}

/**
 * gen2 地區的查詢：(x, y) → 那裡的結構地區（小的先：密室 / 地城房間先於礦坑 / 地城）與所在地區（陸地 / 海 / 島），先結構、後地區（惰性建立、快取）。
 * 結構用 overlapping 多查 SITE_REACH 欄（藍圖外框可能伸出自己的槽 FILL_REACH 欄，同 Gen2Source.objectsIn / extrasIn；村莊地區又比外框外擴 VILLAGE_PAD；
 * 整區錨點如家鄉地城由 overlapping 本身處理）。
 */
export function gen2Regions(seed: string, src: Gen2Source): (x: number, y: number) => Region[] {
  const kit = gen2Kit(seed, src);
  return (x: number, y: number): Region[] => {
    const m = src.layout.landmassAt(x), info = m ? src.layout.regionAt(x) : null;
    if (!m || !info) return [];
    const out: Region[] = [];
    for (const b of src.blueprints.overlapping(x - SITE_REACH, x + 1 + SITE_REACH)) {
      // 外框（村莊加上外擴）不含 (x, y) 的藍圖不必建地區
      const pad = padOf(b.kind);
      if (b.x - pad.x > x || b.x + b.w + pad.x <= x || b.y - pad.up > y || b.y + b.h <= y) continue;
      for (const r of kit.sites(b)) if (r.contains(x, y)) out.push(r);
    }
    out.sort((a, b) => a.w * a.h - b.w * b.h);
    // 島在海之中：先回海、再回島
    if (info.kind === 'island') {
      const sea = kit.land(m, m.regions[0]);
      if (sea.contains(x, y)) out.push(sea);
    }
    const r = kit.land(m, info);
    if (r.contains(x, y)) out.push(r);
    return out;
  };
}

/**
 * gen2 地區 id → 地區（gen2Regions 會回的同一個：同名、同範圍）；地塊地區 id（gen2RegionId，sub 必須是 0）與結構地區 id（gen2SiteRegionId）都能反查，
 * 不存在（沒有那片地塊 / 地區 / 槽 / 藍圖 / part、不立地區的種類、超出 ±X_LIMIT、不是 gen2 的 id）→ null。
 * 結構：slotOf(藍圖 id) 的槽多查 FILL_REACH 欄找那份藍圖（只看它那一層；整區錨點的槽在地區內，overlapping 找得到）。
 */
export function gen2RegionById(seed: string, src: Gen2Source): (id: number) => Region | null {
  const kit = gen2Kit(seed, src), layout = src.layout;
  const inRange = (m: Landmass): boolean => m.x1 > -X_LIMIT && m.x0 < X_LIMIT;
  const landOf = (id: number): Region | null => {
    const off = id - GEN2_REGION_BASE, sub = off % 64, index = Math.floor(off / 64) % 64, t = Math.floor(off / 4096), west = t % 2, i = (t - west) / 2;
    if (sub !== 0) return null;
    let m: Landmass | null;
    if (i === 0) { const h = layout.origin.home; m = west === 0 && h ? layout.landmassAt(h.x0) : null; if (m && m.kind !== 'home') m = null; }
    else m = layout.landmass(west ? -1 : 1, i);
    const info = m && inRange(m) ? m.regions[index] : undefined;
    return m && info ? kit.land(m, info) : null;
  };
  const siteOf = (id: number): Region | null => {
    const { sid, part } = siteOfRegionId(id), sl = slotOf(sid, layout);
    if (sl.x1 <= -X_LIMIT || sl.x0 >= X_LIMIT) return null;
    const b = src.blueprints.overlapping(sl.x0 - FILL_REACH, sl.x1 + FILL_REACH, [sl.layer]).find((p) => p.id === sid);
    return (b && kit.sites(b).find((r) => r.id === id)) ?? null;
  };
  return (id: number): Region | null => {
    try {
      if (isGen2RegionId(id)) return landOf(id);
      if (isGen2SiteRegionId(id)) return siteOf(id);
    } catch (e) {
      // 解不開的 id（不存在的槽 / 地塊）
      if (e instanceof RangeError) return null;
      throw e;
    }
    return null;
  };
}

/** gen2 家鄉開局就知道的地區（Task 15）：家鄉地塊的每個地區 + 家鄉藍圖（BlueprintIndex.homePlans，同 homeContent）的結構地區，依 id 排序；沒有家鄉 = [] */
export function gen2HomeRegions(seed: string, src: Gen2Source): Region[] {
  const h = src.layout.origin.home, m = h ? src.layout.landmassAt(h.x0) : null;
  if (!m || m.kind !== 'home') return [];
  const kit = gen2Kit(seed, src), out: Region[] = m.regions.map((info) => kit.land(m, info));
  for (const b of src.blueprints.homePlans()) out.push(...kit.sites(b));
  return out.sort((a, b) => a.id - b.id);
}

// ── 發現狀態 ─────────────────────────────────────────────
/** 會被算進「珍寶」的獨特道具 */
export const TREASURE_ITEMS: readonly ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].unique);

export interface DiscoveryJSON {
  regions: number[]; lore: number[]; treasures: ItemId[];
  depthRecord: number; distance: number;
  /** 領過的地標（tile index，排序）；沒有 = 都還沒領 */
  landmarks?: number[];
  /** trackOuter 的世界（gen2）：visit 時自動加進已知表的外圍地區 id（排序）；讀檔經 resolver 反查後再加回去。舊世界沒有這個欄位 */
  known?: number[];
}
export interface DiscoveryOpts {
  loreTotal?: number;
  treasureItems?: readonly ItemId[];
  /** 世界裡的地標 tile index（舊世界：全部；gen2：已登錄的） */
  landmarks?: readonly number[];
  /** gen2 世界傳 true（DelveGame 只對 genKind 'gen2' 傳）：load 保留所有存檔的地標鍵、不經 landmarkSet 過濾。
   *  烘焙世界傳 false：BakedSource 沒有 extrasIn，不登錄生成的地標（只有存檔的舊地標，closed 就對）；BakedSource 只在 dev、M2b 刪掉 */
  open?: boolean;
  /** gen2 世界傳 true（Q12）：visit 到的外圍地區自動 know()、存進 toJSON().known；舊世界不傳（v1 外圍地區不進日誌總數） */
  trackOuter?: boolean;
}
export interface CategoryStat { cat: RegionCat; label: string; found: number; total: number; }
export interface JournalStats {
  cats: CategoryStat[];
  lore: { found: number; total: number };
  treasures: { found: number; total: number };
  /** 地標發現物 */
  landmarks: { found: number; total: number };
  /** 0..1 */
  completion: number;
  depthRecord: number;
  /** 移動距離（格） */
  distance: number;
}

const CELL = 64;
/** 格網鍵：(gx + 2**15) * 64 + gy（gy = y / CELL < 64；負 gx 不會撞到別列） */
const cellKey = (gx: number, gy: number): number => (gx + 2 ** 15) * 64 + gy;

export class Discovery {
  readonly found = new Set<number>();
  readonly lore = new Set<number>();
  readonly treasures = new Set<ItemId>();
  /** 領過的地標（tile index） */
  readonly landmarks = new Set<number>();
  depthRecord = 0;
  /** 移動距離（格） */
  distance = 0;
  readonly loreTotal: number;
  readonly treasureItems: readonly ItemId[];
  /** 世界裡（已知的）地標的 tile index：可領的集合（closed 世界：存檔讀回時只認這些；gen2 世界由 knowLandmark 隨載入增加） */
  readonly landmarkSet: ReadonlySet<number>;
  private readonly known: Set<number>;
  /** true（gen2 世界）：load 保留存檔的所有地標鍵（生成的地標要等那一欄載入才登錄，讀檔時還不知道） */
  private readonly open: boolean;
  private grid = new Map<number, number[]>();
  /** 外圍地區的查詢（無限世界；回傳 (x, y) 所在的外圍地區；null = 沒有外圍） */
  private outer: ((x: number, y: number) => Region[]) | null = null;
  /** 已知表（中央 regions 以外的已知地區：gen2 家鄉開局的 know、trackOuter 自動加入的外圍地區） */
  private readonly extra = new Map<number, Region>();
  /** trackOuter 自動加入的 id（toJSON().known） */
  private readonly auto = new Set<number>();
  /** listKnown 的快取（know 改動已知表時清掉） */
  private knownList: readonly Region[] | null = null;
  /** id → 地區的反查（gen2RegionById；region() 與讀檔用；null = 沒有） */
  private resolver: ((id: number) => Region | null) | null = null;
  private readonly trackOuter: boolean;
  /** knownAt 的單格快取（同一格連續查詢不重查外圍；know 改動已知表時清掉） */
  private hereKey: { x: number; y: number; rs: readonly Region[] } | null = null;
  private lastX: number | null = null;
  private lastY = 0;

  constructor(readonly regions: readonly Region[], opts: DiscoveryOpts = {}) {
    this.loreTotal = opts.loreTotal ?? LORE.length;
    this.known = new Set(opts.landmarks ?? []);
    this.landmarkSet = this.known;
    this.open = opts.open === true;
    this.trackOuter = opts.trackOuter === true;
    this.treasureItems = opts.treasureItems ?? TREASURE_ITEMS;
    for (const r of regions) {
      for (let gy = Math.floor(r.y / CELL); gy <= Math.floor((r.y + r.h - 1) / CELL); gy++) {
        for (let gx = Math.floor(r.x / CELL); gx <= Math.floor((r.x + r.w - 1) / CELL); gx++) {
          const k = cellKey(gx, gy);
          let l = this.grid.get(k);
          if (!l) { l = []; this.grid.set(k, l); }
          l.push(r.id);
        }
      }
    }
  }

  regionsAt(x: number, y: number): Region[] {
    const l = this.grid.get(cellKey(Math.floor(x / CELL), Math.floor(y / CELL)));
    if (!l) return [];
    const out: Region[] = [];
    for (const id of l) { const r = this.regions[id]; if (r.contains(x, y)) out.push(r); }
    return out;
  }

  isFound(id: number): boolean { return this.found.has(id); }

  /** 外圍地區的查詢（outerRegions 的結果；null = 沒有外圍） */
  setOuter(fn: ((x: number, y: number) => Region[]) | null): void { this.outer = fn; this.hereKey = null; }

  /** id → 地區的反查（gen2RegionById 的結果；null = 沒有） */
  setResolver(fn: ((id: number) => Region | null) | null): void { this.resolver = fn; }

  /** 中央 regions 的第 id 個（中央地區 id = 陣列索引） */
  private central(id: number): Region | null {
    const r = Number.isInteger(id) && id >= 0 && id < this.regions.length ? this.regions[id] : undefined;
    return r && r.id === id ? r : null;
  }

  private isKnown(id: number): boolean { return this.central(id) !== null || this.extra.has(id); }

  /** 加進已知表（同 id 不重複；中央地區本來就已知） */
  know(regions: readonly Region[]): void { for (const r of regions) this.addKnown(r); }

  /** 加進已知表；回傳是否新加入 */
  private addKnown(r: Region): boolean {
    if (this.isKnown(r.id)) return false;
    this.extra.set(r.id, r);
    this.knownList = null;
    this.hereKey = null;
    return true;
  }

  /** id → 地區：中央 regions[id] → 已知表 → resolver（resolver 查到的不加進已知表）；都沒有 → null */
  region(id: number): Region | null {
    return this.central(id) ?? this.extra.get(id) ?? this.resolver?.(id) ?? null;
  }

  /** 已知的地區：中央 ∪ 已知表，依 id 排序（快取；別改它） */
  listKnown(): readonly Region[] {
    if (!this.knownList) this.knownList = [...this.regions, ...this.extra.values()].sort((a, b) => a.id - b.id);
    return this.knownList;
  }

  /**
   * (x, y) 的已知地區：中央 regionsAt（格網索引）∪ 外圍查詢裡已知的（gen2 家鄉、走過的外圍；舊世界的外圍不進已知表 → 只有中央，
   * 已知表是空的就不查外圍）。順序：中央在前、外圍照查詢的順序（小的結構先）。同一格連續查詢回快取（HUD / 環境音每幾幀查一次）。
   */
  knownAt(x: number, y: number): readonly Region[] {
    const c = this.hereKey;
    if (c && c.x === x && c.y === y) return c.rs;
    const rs = this.regionsAt(x, y);
    if (this.outer && this.extra.size) for (const o of this.outer(x, y)) if (this.extra.has(o.id)) rs.push(o);
    this.hereKey = { x, y, rs };
    return rs;
  }

  /** HUD 的地區名：knownAt 裡已發現、不是地層的最小那個（結構 > 生態區）；沒有 → 第一個已發現的（地層）；都沒有 → null */
  areaAt(x: number, y: number): Region | null {
    let best: Region | null = null, any: Region | null = null;
    for (const r of this.knownAt(x, y)) {
      if (!this.found.has(r.id)) continue;
      any ??= r;
      if (r.cat !== 'depth' && (!best || r.w * r.h < best.w * best.h)) best = r;
    }
    return best ?? any;
  }

  /** 玩家在 (x,y)：回傳這次新發現的地區（越小的越前面——結構比生態區先顯示）；外圍地區排最後 */
  visit(x: number, y: number): Region[] {
    const out: Region[] = [];
    for (const r of this.regionsAt(x, y)) {
      if (this.found.has(r.id)) continue;
      this.found.add(r.id);
      out.push(r);
    }
    out.sort((a, b) => a.w * a.h - b.w * b.h);
    const os = this.outer?.(x, y);
    if (os) for (const o of os) {
      // trackOuter（gen2）：外圍地區第一次走到就進已知表（已經找到、但舊存檔沒記 known 的也補上）
      if (this.trackOuter && this.addKnown(o)) this.auto.add(o.id);
      if (!this.found.has(o.id)) { this.found.add(o.id); out.push(o); }
    }
    return out;
  }

  /** 讀到碑文；回傳是否第一次 */
  readLore(id: number): boolean {
    if (!Number.isInteger(id) || id < 0 || id >= LORE.length || this.lore.has(id)) return false;
    this.lore.add(id);
    return true;
  }
  /** 拿到珍寶；回傳是否第一次 */
  gainTreasure(item: ItemId): boolean {
    if (!this.treasureItems.includes(item) || this.treasures.has(item)) return false;
    this.treasures.add(item);
    return true;
  }

  /** 認得一個地標（World 登錄生成的地標時）：之後 claimLandmark 才領得到 */
  knowLandmark(key: number): void { this.known.add(key); }

  /** 領地標；回傳是否第一次（不是地標 / 領過 → false） */
  claimLandmark(i: number): boolean {
    if (!this.landmarkSet.has(i) || this.landmarks.has(i)) return false;
    this.landmarks.add(i);
    return true;
  }

  /** 每步呼叫：玩家中心（px）與目前深度（格）。單步跳太遠（傳送）不算距離。 */
  track(px: number, py: number, depth: number): void {
    if (this.lastX !== null) {
      const d = Math.hypot(px - this.lastX, py - this.lastY);
      if (d < TILE_SIZE * 4) this.distance += d / TILE_SIZE;
    }
    this.lastX = px; this.lastY = py;
    if (depth > this.depthRecord) this.depthRecord = Math.floor(depth);
  }

  stats(): JournalStats {
    const known = this.listKnown();
    const cats = CATEGORY_ORDER.map((cat) => {
      const rs = known.filter((r) => r.cat === cat);
      return { cat, label: CATEGORY_LABEL[cat], found: rs.filter((r) => this.found.has(r.id)).length, total: rs.length };
    }).filter((c) => c.total > 0);
    const lore = { found: this.lore.size, total: this.loreTotal };
    const treasures = { found: this.treasures.size, total: this.treasureItems.length };
    const landmarks = { found: this.landmarks.size, total: this.landmarkSet.size };
    const total = cats.reduce((a, c) => a + c.total, 0) + lore.total + treasures.total + landmarks.total;
    const found = cats.reduce((a, c) => a + c.found, 0) + lore.found + treasures.found + landmarks.found;
    return { cats, lore, treasures, landmarks, completion: total ? found / total : 0, depthRecord: this.depthRecord, distance: this.distance };
  }

  toJSON(): DiscoveryJSON {
    return {
      regions: [...this.found].sort((a, b) => a - b),
      lore: [...this.lore].sort((a, b) => a - b),
      treasures: [...this.treasures].sort(),
      landmarks: [...this.landmarks].sort((a, b) => a - b),
      depthRecord: this.depthRecord,
      distance: Math.round(this.distance * 100) / 100,
      ...(this.trackOuter ? { known: [...this.auto].sort((a, b) => a - b) } : {}),
    };
  }

  /** 由存檔還原；不合法的項目忽略 */
  load(j: Partial<DiscoveryJSON> | null | undefined): void {
    if (!j || typeof j !== 'object') return;
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((i): i is number => Number.isInteger(i) && i >= 0) : []);
    for (const id of ints(j.regions)) if (id < this.regions.length || isOuterRegionId(id) || isGen2RegionId(id) || isGen2SiteRegionId(id)) this.found.add(id);
    for (const id of ints(j.lore)) this.readLore(id);
    if (Array.isArray(j.treasures)) for (const t of j.treasures) if (isItemId(t)) this.gainTreasure(t);
    // open：存檔的鍵都保留（領過的地標算已知，found ≤ total）；closed：只認 landmarkSet
    for (const i of ints(j.landmarks)) {
      if (this.open) { this.known.add(i); this.landmarks.add(i); } else this.claimLandmark(i);
    }
    if (typeof j.depthRecord === 'number' && Number.isFinite(j.depthRecord) && j.depthRecord >= 0) this.depthRecord = Math.floor(j.depthRecord);
    if (typeof j.distance === 'number' && Number.isFinite(j.distance) && j.distance >= 0) this.distance = j.distance;
    // trackOuter：存檔的外圍已知地區經 resolver 反查後加回已知表（不是 gen2 id / 反查不到 → 丟掉），讀檔後 listKnown 與總數相同
    if (this.trackOuter) for (const id of ints(j.known)) {
      if (!isGen2RegionId(id) && !isGen2SiteRegionId(id)) continue;
      const r = this.isKnown(id) ? null : this.resolver?.(id);
      if (r && r.id === id && this.addKnown(r)) this.auto.add(id);
    }
  }
}
