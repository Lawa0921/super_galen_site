// fishing.ts — 釣魚的純邏輯（無狀態、可測）：釣力、上鉤等待 / 判定窗、時段、漁獲表與抽選、木箱戰利品。
// 拋竿 / 浮標 / 上鉤的狀態機在 game.ts（DelveGame.fishing）；這裡只有規則。
//   漁獲表每條：基礎權重 + 條件（液體、生態區、深度帶、季節、天氣、時段、最低釣力、最小水域）。
//   抽選：符合條件的條目依「權重 × 稀有度隨釣力放大」加權；小水窪（< SMALL_POOL 格）只剩垃圾 / 小魚。
import type { ItemId } from './items';
import { ITEMS } from './items';
import { LIQ } from './liquidKind';
import { BIOME } from './world';
import { SEASON, type Season } from './calendar';
import type { WeatherKind } from './weather';
import type { Rng } from './rng';
import type { Drop } from './loot';

/** 深度帶：地表（岩層以上）/ 地下（岩層）/ 洞穴層 / 熔岩深淵 */
export type DepthZone = 'surface' | 'underground' | 'cavern' | 'molten';
export type TimeSlot = 'dawn' | 'day' | 'dusk' | 'night';
export interface CatchCtx {
  liquid: number;
  biome: number;
  zone: DepthZone;
  season: Season;
  weather: WeatherKind;
  time: TimeSlot;
  /** 釣力（釣竿 + 魚餌 + 加成） */
  power: number;
  /** 浮標所在水域的格數（數到 POOL_COUNT_MAX 為止） */
  pool: number;
  /** 釣竿能不能在熔岩裡釣 */
  lavaRod: boolean;
}
export type Rarity = 'junk' | 'common' | 'uncommon' | 'rare' | 'legendary' | 'crate';
export interface FishEntry {
  item: ItemId;
  weight: number;
  rarity: Rarity;
  liquid?: number;
  biomes?: readonly number[];
  zones?: readonly DepthZone[];
  seasons?: readonly Season[];
  weathers?: readonly WeatherKind[];
  times?: readonly TimeSlot[];
  minPower?: number;
  /** 至少要這麼大的水域 */
  minPool?: number;
}

/** 水域格數數到這裡就停（夠大了） */
export const POOL_COUNT_MAX = 300;
/** 小於這個格數算小水窪：只剩垃圾 / 小魚 */
export const SMALL_POOL = 40;

const W = LIQ.WATER;
const SURF: DepthZone[] = ['surface'];
const DEEP: DepthZone[] = ['underground', 'cavern'];
export const FISH: readonly FishEntry[] = [
  // ── 垃圾 / 小東西（哪裡的水都有） ──
  { item: 'soggy_boot', weight: 6, rarity: 'junk', liquid: W },
  { item: 'wood', weight: 5, rarity: 'junk', liquid: W },
  { item: 'silver_minnow', weight: 18, rarity: 'common', liquid: W },
  // ── 地表 ──
  { item: 'reed_perch', weight: 16, rarity: 'common', liquid: W, zones: SURF, biomes: [BIOME.FOREST, BIOME.JUNGLE], times: ['dawn', 'day', 'dusk'], minPool: SMALL_POOL },
  { item: 'brook_trout', weight: 10, rarity: 'common', liquid: W, zones: SURF, biomes: [BIOME.FOREST, BIOME.SNOW], seasons: [SEASON.SPRING, SEASON.AUTUMN, SEASON.WINTER], minPool: SMALL_POOL },
  { item: 'mud_whisker', weight: 12, rarity: 'common', liquid: W, biomes: [BIOME.JUNGLE], zones: ['surface', 'underground'], minPool: SMALL_POOL },
  { item: 'sun_bream', weight: 10, rarity: 'uncommon', liquid: W, zones: SURF, biomes: [BIOME.FOREST, BIOME.DESERT], seasons: [SEASON.SUMMER], times: ['day'], weathers: ['clear', 'cloudy'], minPool: SMALL_POOL },
  { item: 'frost_char', weight: 14, rarity: 'common', liquid: W, biomes: [BIOME.SNOW], minPool: SMALL_POOL },
  { item: 'oasis_koi', weight: 12, rarity: 'uncommon', liquid: W, zones: SURF, biomes: [BIOME.DESERT], minPool: SMALL_POOL },
  { item: 'moonlit_eel', weight: 8, rarity: 'uncommon', liquid: W, zones: SURF, times: ['night'], minPool: SMALL_POOL },
  { item: 'thunder_ray', weight: 5, rarity: 'rare', liquid: W, zones: SURF, weathers: ['storm'], minPower: 25, minPool: SMALL_POOL },
  { item: 'mistfin', weight: 8, rarity: 'uncommon', liquid: W, zones: SURF, weathers: ['fog'], minPool: SMALL_POOL },
  { item: 'ember_salmon', weight: 9, rarity: 'uncommon', liquid: W, zones: SURF, biomes: [BIOME.FOREST, BIOME.SNOW], seasons: [SEASON.AUTUMN], minPool: SMALL_POOL },
  { item: 'petal_koi', weight: 4, rarity: 'rare', liquid: W, zones: SURF, seasons: [SEASON.SPRING], times: ['dawn', 'day'], minPower: 20, minPool: SMALL_POOL },
  // 傳說級：森林地表、下雨的黎明、釣力 ≥ 45
  { item: 'old_whiskers', weight: 0.25, rarity: 'legendary', liquid: W, zones: SURF, biomes: [BIOME.FOREST], weathers: ['rain', 'storm'], times: ['dawn'], minPower: 45, minPool: 120 },
  // ── 地下 / 洞穴層 ──
  { item: 'pale_blindfish', weight: 16, rarity: 'common', liquid: W, zones: DEEP, minPool: SMALL_POOL },
  { item: 'lantern_squid', weight: 7, rarity: 'uncommon', liquid: W, zones: ['cavern'], minPool: SMALL_POOL },
  { item: 'prism_shrimp', weight: 5, rarity: 'rare', liquid: W, zones: ['cavern'], minPower: 25, minPool: SMALL_POOL },
  { item: 'gloom_angler', weight: 3, rarity: 'rare', liquid: W, zones: ['cavern'], minPower: 35, minPool: 120 },
  // ── 蜂蜜 ──
  { item: 'amber_carp', weight: 14, rarity: 'common', liquid: LIQ.HONEY },
  { item: 'stingfin', weight: 4, rarity: 'rare', liquid: LIQ.HONEY, minPower: 25 },
  // ── 熔岩（要燼線釣竿） ──
  { item: 'cinder_snapper', weight: 14, rarity: 'common', liquid: LIQ.LAVA },
  { item: 'obsidian_eel', weight: 4, rarity: 'rare', liquid: LIQ.LAVA, minPower: 40 },
  { item: 'obsidian', weight: 6, rarity: 'junk', liquid: LIQ.LAVA },
  // ── 木箱（水裡；依釣力解鎖） ──
  { item: 'wooden_crate', weight: 5, rarity: 'crate', liquid: W, minPool: SMALL_POOL },
  { item: 'iron_crate', weight: 2, rarity: 'crate', liquid: W, minPower: 30, minPool: SMALL_POOL },
  { item: 'golden_crate', weight: 0.7, rarity: 'crate', liquid: W, minPower: 50, minPool: 120 },
];
/** 日誌「釣魚紀錄」列出的魚種（不含垃圾 / 木箱） */
export const FISH_SPECIES: readonly ItemId[] = FISH.filter((f) => ITEMS[f.item].fish).map((f) => f.item)
  .filter((v, i, a) => a.indexOf(v) === i);

/** 稀有度權重隨釣力放大：釣力 50 時 rare ×2、legendary ×3 */
function rarityMul(r: Rarity, power: number): number {
  const p = Math.max(0, Math.min(100, power)) / 50;
  switch (r) {
    case 'junk': return Math.max(0.3, 1.2 - p * 0.5);
    case 'common': return 1;
    case 'uncommon': return 0.8 + p * 0.4;
    case 'rare': return 0.6 + p * 1.4;
    case 'legendary': return 0.5 + p * 2.5;
    case 'crate': return 0.8 + p * 0.6;
  }
}

export function canFishIn(liquid: number, lavaRod: boolean): boolean {
  return liquid === LIQ.WATER || liquid === LIQ.HONEY || (liquid === LIQ.LAVA && lavaRod);
}

/** 符合條件的條目與加權後的權重 */
export function catchCandidates(c: CatchCtx): { item: ItemId; w: number }[] {
  if (!canFishIn(c.liquid, c.lavaRod)) return [];
  const small = c.pool < SMALL_POOL;
  const out: { item: ItemId; w: number }[] = [];
  for (const f of FISH) {
    if (f.liquid !== undefined && f.liquid !== c.liquid) continue;
    if (f.biomes && !f.biomes.includes(c.biome)) continue;
    if (f.zones && !f.zones.includes(c.zone)) continue;
    if (f.seasons && !f.seasons.includes(c.season)) continue;
    if (f.weathers && !f.weathers.includes(c.weather)) continue;
    if (f.times && !f.times.includes(c.time)) continue;
    if (f.minPower !== undefined && c.power < f.minPower) continue;
    if (f.minPool !== undefined && c.pool < f.minPool) continue;
    let w = f.weight * rarityMul(f.rarity, c.power);
    if (small && f.rarity === 'junk') w *= 2;
    out.push({ item: f.item, w });
  }
  return out;
}

/** 依 r ∈ [0,1) 抽一個漁獲；沒有可釣的 → null */
export function rollCatch(c: CatchCtx, r: number): ItemId | null {
  const cands = catchCandidates(c);
  if (!cands.length) return null;
  let total = 0;
  for (const q of cands) total += q.w;
  let t = Math.max(0, Math.min(0.999999, r)) * total;
  for (const q of cands) { if (t < q.w) return q.item; t -= q.w; }
  return cands[cands.length - 1].item;
}

/** 釣力：釣竿 + 魚餌（沒有魚餌 = 0，不能釣）；雨 / 雷雨 +15%、黎明 / 黃昏 +10%、霧 +5% */
export function fishingPower(rod: ItemId | null, bait: ItemId | null, weather: WeatherKind, time: TimeSlot): number {
  const rp = rod ? ITEMS[rod].rod?.power ?? 0 : 0, bp = bait ? ITEMS[bait].bait ?? 0 : 0;
  if (!rp || !bp) return 0;
  let k = 1;
  if (weather === 'rain' || weather === 'storm') k += 0.15;
  else if (weather === 'fog') k += 0.05;
  if (time === 'dawn' || time === 'dusk') k += 0.1;
  return Math.round((rp + bp) * k);
}

/** 浮標落水後等多久上鉤（秒）：2–10 秒，釣力越高越快（最多快 55%）；r ∈ [0,1) */
export function biteDelay(power: number, r: number): number {
  const k = 1 - Math.min(0.55, Math.max(0, power) / 110);
  return Math.max(1.2, (2 + r * 8) * k);
}
/** 浮標沉下去後，要在多久內按下才釣得起來（秒） */
export function biteWindow(power: number): number {
  return Math.min(1, 0.55 + Math.max(0, power) * 0.0045);
}

/** 一天的比例 → 時段（日出 / 日落前後各一個曙暮光寬算黎明 / 黃昏） */
export function timeSlot(frac: number, s: { sunrise: number; sunset: number; twilight: number }): TimeSlot {
  const f = frac - Math.floor(frac);
  if (Math.abs(f - s.sunrise) <= s.twilight) return 'dawn';
  if (Math.abs(f - s.sunset) <= s.twilight) return 'dusk';
  return f > s.sunrise && f < s.sunset ? 'day' : 'night';
}

/** 打開木箱的戰利品 */
export function crateLoot(kind: 'wooden_crate' | 'iron_crate' | 'golden_crate', r: Rng): Drop[] {
  const out: Drop[] = [];
  const add = (item: ItemId, n: number): void => {
    if (n <= 0) return;
    const e = out.find((o) => o.item === item);
    if (e) e.n += n; else out.push({ item, n });
  };
  const bars: ItemId[] = kind === 'wooden_crate' ? ['copper_bar', 'iron_bar'] : kind === 'iron_crate' ? ['iron_bar', 'silver_bar'] : ['silver_bar', 'gold_bar'];
  const baits: ItemId[] = ['worm', 'grub', 'firefly'];
  if (kind === 'wooden_crate') {
    add('copper_coin', r.int(20, 80));
    if (r.chance(2)) add(bars[r.int(0, 2)], r.int(2, 5));
    add(baits[r.int(0, 3)], r.int(2, 6));
    if (r.chance(3)) add('rope', r.int(8, 20));
    if (r.chance(5)) add('healing_potion', 1);
  } else if (kind === 'iron_crate') {
    add('silver_coin', r.int(1, 4));
    add(bars[r.int(0, 2)], r.int(4, 9));
    add(baits[r.int(0, 3)], r.int(3, 8));
    if (r.chance(2)) add('healing_potion', r.int(1, 3));
    if (r.chance(4)) add('crystal', r.int(1, 3));
  } else {
    add('silver_coin', r.int(5, 15));
    add('gold_bar', r.int(3, 8));
    add('sunbeetle', r.int(1, 3));
    add('healing_potion', r.int(2, 4));
    if (r.chance(2)) add('crystal', r.int(2, 5));
    if (r.chance(4)) add('life_core', 1);
  }
  return out;
}
