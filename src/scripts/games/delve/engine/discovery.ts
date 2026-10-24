// discovery.ts — 探索發現系統（純邏輯，不碰 DOM）。
//   · buildRegions：由 worldgen 的輸出推導出所有「地區 / 地標」（生態區、森林段、海岸、地層、迷你生態區、
//     大洞窟、裂谷、天坑、小屋、礦坑、遺跡、浮空島、結冰湖、乾湖床、密室、地城與其重要房間），依種子命名（中文）。
//     id = 陣列索引（同種子永遠相同），存檔只存 id。
//   · Discovery：已發現的地區、讀過的碑文、拿到的珍寶、最深紀錄、移動距離 → 日誌統計與完成度。
//   · 外圍（B13）：每個 v0 生態段與兩片海各是一個惰性地區（cat land），id = OUTER_REGION_BASE + zigzag(段號, 側)；
//     會跳「發現」並存進 found，但不算進日誌的總數與完成度（stats 只看中央的 regions）。
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
import type { Blueprint } from './gen2/blueprint';
import { gen2SiteRegionId, isGen2SiteRegionId } from './gen2/structId';

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
};
const ROOM_NAMES: Partial<Record<RoomKind, readonly string[]>> = {
  entry: ['入口大廳'], library: ['塵封書庫', '禁書庫', '低語書齋'], prison: ['鐵鍊牢房', '沉默監牢', '鏽鎖牢區'],
  shrine: ['金鑰神殿'], treasure: ['最深的寶庫'], vault: ['地圖密室'],
};

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
    // 村落：走近（左右各 22 格、上方多 10 格）就算發現——還沒進村就跳出「發現：○○村」
    const pad = s.kind === 'village' ? 22 : 0, padY = s.kind === 'village' ? 10 : 0;
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
 * gen2 地區的查詢：(x, y) → 那裡的結構（小屋 / 遺跡 / 沉船）與所在地區（陸地 / 海 / 島），先結構、後地區（惰性建立、快取）。
 * 地區範圍 = 欄範圍、y 在洞穴層線以上；結構 = 藍圖外框。名字確定（由 id 雜湊挑），同種子跨實例相同。
 */
export function gen2Regions(seed: string, src: Gen2Source): (x: number, y: number) => Region[] {
  const sName = seedInt(seed, 'gen2-region-names');
  const cache = new Map<number, Region>();
  const deep = (x: number): number => src.layersAt(x).deep;
  const pickName = (list: readonly string[], id: number): string => list[Math.floor(hash2(id & 0xffffff, id >>> 24, sName) * list.length) % list.length];
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
  // 地塊 m 的第 info 個地區 → Region（快取）
  const regionOf = (m: Landmass, info: RegionInfo): Region => {
    const id = gen2RegionId(m.side, m.i, info.index, 0);
    const o = src.layout.origin, first = info.kind === 'sea' && m.i === ((m.side > 0 ? o.east : o.west).start === 'sea' ? 1 : 2);
    return cached(id, () => {
      let hmax = 0;
      for (let cx = info.x0; cx < info.x1; cx += 16) hmax = Math.max(hmax, deep(cx));
      const ax = Math.floor((info.x0 + info.x1) / 2);
      return {
        id, cat: 'land', kind: info.kind === 'sea' || info.kind === 'island' ? info.kind : GEN2_BIOME_KEY[info.biome] ?? 'forest',
        name: landName(info, id, first), x: info.x0, y: 0, w: info.x1 - info.x0, h: hmax,
        ax, ay: Math.max(4, src.surfaceAt(ax) - 14),
        contains: (cx: number, cy: number): boolean => cx >= info.x0 && cx < info.x1 && cy >= 0 && cy < deep(cx),
      };
    });
  };
  // 結構地區 id = gen2SiteRegionId(藍圖 id, 0)（位元配置只在 gen2/structId.ts）
  const structureOf = (b: Blueprint): Region | null => {
    if (b.kind !== 'cabin' && b.kind !== 'ruin' && b.kind !== 'shipwreck') return null;
    const key = b.kind, id = gen2SiteRegionId(b.id, 0);
    return cached(id, () => ({
      id, cat: 'site', kind: key, name: pickName(NAMES[key], id), x: b.x, y: b.y, w: b.w, h: b.h,
      ax: b.x + (b.w >> 1), ay: b.y + (b.h >> 1), contains: rectHit(b.x, b.y, b.w, b.h),
    }));
  };
  return (x: number, y: number): Region[] => {
    const m = src.layout.landmassAt(x), info = m ? src.layout.regionAt(x) : null;
    if (!m || !info) return [];
    const out: Region[] = [];
    for (const b of src.blueprints.overlapping(x, x + 1)) {
      const r = y >= b.y && y < b.y + b.h ? structureOf(b) : null;
      if (r && r.contains(x, y)) out.push(r);
    }
    // 島在海之中：先回海、再回島
    if (info.kind === 'island') {
      const sea = regionOf(m, m.regions[0]);
      if (sea.contains(x, y)) out.push(sea);
    }
    const r = regionOf(m, info);
    if (r.contains(x, y)) out.push(r);
    return out;
  };
}

// ── 發現狀態 ─────────────────────────────────────────────
/** 會被算進「珍寶」的獨特道具 */
export const TREASURE_ITEMS: readonly ItemId[] = (Object.keys(ITEMS) as ItemId[]).filter((id) => ITEMS[id].unique);

export interface DiscoveryJSON {
  regions: number[]; lore: number[]; treasures: ItemId[];
  depthRecord: number; distance: number;
  /** 領過的地標（tile index，排序）；沒有 = 都還沒領 */
  landmarks?: number[];
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
  /** 世界裡所有地標的 tile index（存檔讀回時只認這些） */
  readonly landmarkSet: ReadonlySet<number>;
  private grid = new Map<number, number[]>();
  /** 外圍地區的查詢（無限世界；回傳 (x, y) 所在的外圍地區；null = 沒有外圍） */
  private outer: ((x: number, y: number) => Region[]) | null = null;
  private lastX: number | null = null;
  private lastY = 0;

  constructor(readonly regions: readonly Region[], opts: { loreTotal?: number; treasureItems?: readonly ItemId[]; landmarks?: readonly number[] } = {}) {
    this.loreTotal = opts.loreTotal ?? LORE.length;
    this.landmarkSet = new Set(opts.landmarks ?? []);
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
  setOuter(fn: ((x: number, y: number) => Region[]) | null): void { this.outer = fn; }

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
    if (os) for (const o of os) if (!this.found.has(o.id)) { this.found.add(o.id); out.push(o); }
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
    const cats = CATEGORY_ORDER.map((cat) => {
      const rs = this.regions.filter((r) => r.cat === cat);
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
    };
  }

  /** 由存檔還原；不合法的項目忽略 */
  load(j: Partial<DiscoveryJSON> | null | undefined): void {
    if (!j || typeof j !== 'object') return;
    const ints = (v: unknown): number[] => (Array.isArray(v) ? v.filter((i): i is number => Number.isInteger(i) && i >= 0) : []);
    for (const id of ints(j.regions)) if (id < this.regions.length || isOuterRegionId(id) || isGen2RegionId(id) || isGen2SiteRegionId(id)) this.found.add(id);
    for (const id of ints(j.lore)) this.readLore(id);
    if (Array.isArray(j.treasures)) for (const t of j.treasures) if (isItemId(t)) this.gainTreasure(t);
    for (const i of ints(j.landmarks)) this.claimLandmark(i);
    if (typeof j.depthRecord === 'number' && Number.isFinite(j.depthRecord) && j.depthRecord >= 0) this.depthRecord = Math.floor(j.depthRecord);
    if (typeof j.distance === 'number' && Number.isFinite(j.distance) && j.distance >= 0) this.distance = j.distance;
  }
}
