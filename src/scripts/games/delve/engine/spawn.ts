// spawn.ts — 怪物生成規則（純函式）：棲地判定 → 生成表（權重 / 成群）→ 找生成點。
// 規則：不在畫面內（離玩家 > 視野半寬 / 半高）、不在床（重生點）附近、不在有木板牆的房子裡、
// 附近怪物數有上限（依棲地）；離玩家太遠的一般怪物會消失。和平模式不生成。
import type { World } from './world';
import { BIOME } from './world';
import { T, W, isSolidTile } from './tiles';
import { LIQ } from './liquidKind';
import { ENEMIES, type EnemyKind } from './enemies';
import type { Rng } from './rng';
import { TILE_SIZE as S, DAY_LENGTH } from './constants';
import type { WeatherKind } from './weather';

export type Zone = 'surface' | 'underground' | 'cavern' | 'molten' | 'dungeon';
export interface Habitat {
  zone: Zone; biome: number; mushroom: boolean; night: boolean;
  /** 生成點附近（同欄 ±4 列）有深水：只生水生怪 */
  water?: boolean;
  /** 季節（calendar.SEASON；省略 = 不套用季節修正） */
  season?: number;
  /** 玩家所在處的天氣（weather.localWeather） */
  weather?: WeatherKind;
}
/** 地表的雨夜（雨 / 雷雨）：亡者變多 */
function rainyNight(h: Habitat, p?: SpawnPressure): boolean {
  return h.zone === 'surface' && h.night && !p?.firstNight && (h.weather === 'rain' || h.weather === 'storm');
}
/** 季節編號（避免 spawn ↔ calendar 循環相依） */
const SPRING = 0, WINTER = 3;
export interface SpawnEntry { kind: EnemyKind; weight: number; group?: [number, number]; }

/** 生成檢查間隔（秒，漸進後的最短值）與每次成功機率 */
export const SPAWN_INTERVAL = 0.5;
/** 剛開始 / 剛重生 / 剛讀檔時的生成間隔（秒），SPAWN_RAMP 秒內線性加快到 SPAWN_INTERVAL */
export const SPAWN_INTERVAL_START = 2.5;
export const SPAWN_RAMP = 150;
/** 離世界出生點這麼近（格，水平）算「出生點附近」：地表夜晚上限較低 */
export const NEAR_SPAWN_TILES = 160;
/** 生成壓力修正：第一夜（新玩家還沒準備好）、出生點附近 */
export interface SpawnPressure { firstNight: boolean; nearSpawn: boolean; }
/** 第一夜 = 第一天傍晚到第二天清晨（夜晚是一天的前 / 後 20%，世界從第一天 30% 開始） */
export function isFirstNight(time: number): boolean { return time < DAY_LENGTH * 1.2; }
/** 距上次喘息（新世界 / 讀檔 / 重生）calm 秒後的生成間隔：從 SPAWN_INTERVAL_START 線性降到 SPAWN_INTERVAL */
export function spawnInterval(calm: number): number {
  const t = Math.max(0, Math.min(1, calm / SPAWN_RAMP));
  return SPAWN_INTERVAL_START + (SPAWN_INTERVAL - SPAWN_INTERVAL_START) * t;
}
/** 生成點離玩家的最小距離（格）＝畫面外；renderer 會依實際視野更新 */
export const DEFAULT_VIEW_HALF = { w: 34, h: 20 };
/** 生成環（格）：在畫面外、但不超過這個距離 */
export const SPAWN_MAX = { x: 64, y: 40 };
/** 超過這個距離（格）的一般怪物移除 */
export const DESPAWN = { x: 110, y: 72 };
/** 只更新這個距離（格）內的實體（再遠就凍結） */
export const ACTIVE = { x: 80, y: 56 };
/** 床（重生點）周圍不生成（格） */
export const BED_SAFE = 24;
/** 全世界怪物上限 */
export const MAX_ENEMIES = 40;

export interface HabitatSource {
  world: World;
  layers: { deep: Int16Array; molten: Int16Array };
  night: boolean;
}

export function isDungeonWall(w: number): boolean { return w >= W.DUNGEON_WALL_BLUE && w <= W.DUNGEON_WALL_PINK; }

/** (x,y) tile 的棲地 */
export function habitatAt(src: HabitatSource, x: number, y: number): Habitat {
  const w = src.world;
  const cx = Math.max(0, Math.min(w.width - 1, x));
  const biome = w.biomeAt(cx);
  let mushroom = false;
  for (let yy = y - 2; yy <= y + 4 && !mushroom; yy++) for (let xx = x - 3; xx <= x + 3; xx++) if (w.getFg(xx, yy) === T.MUSHROOM_GRASS) { mushroom = true; break; }
  let zone: Zone;
  if (isDungeonWall(w.getWall(x, y))) zone = 'dungeon';
  else if (y >= src.layers.molten[cx]) zone = 'molten';
  else if (y >= src.layers.deep[cx]) zone = 'cavern';
  else if (y <= w.surfaceAt(cx) + 6) zone = 'surface';
  else zone = 'underground';
  let water = false;
  for (let yy = y - 4; yy <= y + 4 && !water; yy++) water = w.getLiquidType(x, yy) === LIQ.WATER && w.getLiquid(x, yy) >= 200;
  return { zone, biome, mushroom, night: src.night, water };
}

/** 附近（活動範圍內）最多幾隻怪。地表夜晚：第一夜 3、出生點附近 5、其他 8；第一夜的淺層地下也只有 3 */
export function spawnCap(h: Habitat, p?: SpawnPressure): number {
  switch (h.zone) {
    case 'surface': return h.night ? (p?.firstNight ? 3 : p?.nearSpawn ? 5 : 8) + (rainyNight(h, p) ? 2 : 0) : 4;
    case 'dungeon': return 9;
    case 'molten': return 8;
    case 'underground': return p?.firstNight && h.night ? 3 : 7;
    default: return 7;
  }
}
/** 水裡：叢林（任何深度）與地下湖有鋸鰭魚群；洞穴（岩層以下）的水有螢光水母。地表一般的湖沒有怪 */
function aquaticTable(h: Habitat): SpawnEntry[] {
  const out: SpawnEntry[] = [];
  if (h.zone === 'molten' || h.zone === 'dungeon') return out;
  if (h.biome === BIOME.JUNGLE) out.push({ kind: 'razor_fin', weight: 10, group: [3, 5] });
  else if (h.zone !== 'surface') out.push({ kind: 'razor_fin', weight: 4, group: [2, 4] });
  if (h.zone === 'underground' || h.zone === 'cavern') out.push({ kind: 'glow_jelly', weight: 6, group: [1, 2] });
  return out;
}
/** 每次檢查的生成機率 */
export function spawnChance(h: Habitat, p?: SpawnPressure): number {
  switch (h.zone) {
    case 'surface': {
      const base = h.night ? (p?.firstNight ? 0.22 : p?.nearSpawn ? 0.34 : 0.45) : 0.16 + (h.season === SPRING ? 0.05 : 0);
      return rainyNight(h, p) ? Math.min(0.6, base * 1.25) : base;
    }
    case 'dungeon': return 0.5;
    case 'molten': return 0.4;
    default: return 0.32;
  }
}

/** 生成表：依棲地挑怪 */
export function spawnTable(h: Habitat): SpawnEntry[] {
  const { zone, biome, night } = h;
  const out: SpawnEntry[] = [];
  const add = (kind: EnemyKind, weight: number, group?: [number, number]): void => { out.push({ kind, weight, group }); };
  if (h.water) return aquaticTable(h);
  if (zone === 'dungeon') { add('bone_knight', 8); add('cursed_skull', 5); return out; }
  if (zone === 'molten') { add('ember_imp', 5); add('magma_bat', 7, [1, 2]); return out; }
  if (h.mushroom && zone !== 'surface') { add('spore_walker', 10); add('cave_bat', 2, [2, 3]); return out; }
  if (zone === 'surface') {
    surfaceTable(h, add);
    // 季節 / 天氣修正：雨夜亡者 ×1.8、春天史萊姆 ×2、冬天森林出現霜系怪
    for (const e of out) {
      if (e.kind === 'night_walker' && rainyNight(h)) e.weight *= 1.8;
      if (e.kind === 'gel_blob' && h.season === SPRING) e.weight *= 2;
    }
    if (h.season === WINTER && biome === BIOME.FOREST) {
      add('frost_blob', night ? 3 : 6);
      if (night) add('frost_wolf', 4);
    }
    return out;
  }
  return undergroundTable(h, add, out);
}

type AddFn = (kind: EnemyKind, weight: number, group?: [number, number]) => void;
function surfaceTable(h: Habitat, add: AddFn): void {
  const { biome, night } = h;
  {
    if (biome === BIOME.SNOW) {
      add('frost_blob', night ? 4 : 10);
      if (night) { add('frost_wolf', 7); add('dusk_owl', 3); }
    } else if (biome === BIOME.DESERT) {
      add('sand_scorpion', night ? 6 : 3);
      add('gel_blob', night ? 2 : 8);
      if (night) add('night_walker', 6);
    } else if (biome === BIOME.JUNGLE) {
      add('thorn_hornet', night ? 4 : 3);
      add('gel_blob', night ? 2 : 8);
      if (night) add('night_walker', 6);
    } else {
      if (night) { add('night_walker', 10); add('dusk_owl', 5); add('gel_blob', 2); }
      else add('gel_blob', 10);
    }
  }
}
function undergroundTable(h: Habitat, add: AddFn, out: SpawnEntry[]): SpawnEntry[] {
  const { zone, biome } = h;
  // 地下（岩層 / 洞穴層）
  if (biome === BIOME.SNOW) { add('frost_blob', 6); add('frost_wolf', 3); add('cave_bat', 3, [2, 3]); }
  else if (biome === BIOME.DESERT) { add('sand_scorpion', 7); add('cave_bat', 3, [2, 3]); }
  else if (biome === BIOME.JUNGLE) { add('snap_vine', 5); add('thorn_hornet', 5); add('cave_bat', 2, [2, 3]); }
  else {
    add('cave_bat', 6, [2, 4]);
    add('rock_crab', zone === 'cavern' ? 6 : 4);
    if (zone === 'underground') add('gel_blob', 3);
  }
  return out;
}

export function pickEntry(table: readonly SpawnEntry[], rng: Rng): SpawnEntry | null {
  const total = table.reduce((a, e) => a + e.weight, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const e of table) { r -= e.weight; if (r < 0) return e; }
  return table[table.length - 1];
}

/** 這種怪在 (x,y) 附近能不能站 / 飛：回傳腳底 px（中心 x, 底 y）或 null。會上下搜尋 ±12 格。 */
export function findSpot(w: World, kind: EnemyKind, x: number, y: number): { x: number; y: number } | null {
  const def = ENEMIES[kind];
  const tw = Math.ceil(def.w / S), th = Math.ceil(def.h / S);
  const clear = (tx: number, ty: number): boolean => {
    for (let yy = ty - th + 1; yy <= ty; yy++) for (let xx = tx; xx < tx + tw; xx++) {
      if (!w.inBounds(xx, yy) || isSolidTile(w.getFg(xx, yy))) return false;
    }
    return true;
  };
  const floor = (tx: number, ty: number): boolean => {
    for (let xx = tx; xx < tx + tw; xx++) if (isSolidTile(w.getFg(xx, ty + 1))) return true;
    return false;
  };
  const px = (tx: number, ty: number): { x: number; y: number } => ({ x: tx * S + (tw * S) / 2, y: (ty + 1) * S });
  const ai = def.ai;
  if (def.aquatic) {
    // 水生：身體範圍（中心欄）每格都是深水
    const wet = (tx: number, ty: number): boolean => {
      for (let yy = ty - th + 1; yy <= ty; yy++) if (w.getLiquidType(tx, yy) !== LIQ.WATER || w.getLiquid(tx, yy) < 200 || isSolidTile(w.getFg(tx, yy))) return false;
      return true;
    };
    for (let k = 0; k <= 12; k++) for (const ty of k === 0 ? [y] : [y + k, y - k]) if (w.inBounds(x, ty) && wet(x, ty) && clear(x, ty)) return px(x, ty);
    return null;
  }
  for (let k = 0; k <= 12; k++) {
    for (const ty of k === 0 ? [y] : [y + k, y - k]) {
      if (!w.inBounds(x, ty)) continue;
      if (!clear(x, ty)) continue;
      if (ai === 'flyer' || ai === 'swooper' || ai === 'shooter' || ai === 'ghost') {
        // 飛行：周圍要有一點空間（上下各 1 格空）
        if (clear(x, ty - 1) && clear(x, ty + 1)) return px(x, ty);
        continue;
      }
      if (ai === 'plant') {
        // 噬花藤：身邊（上 / 下 / 左 / 右）要有可攀附的實心方塊
        const solid = (dx: number, dy: number): boolean => isSolidTile(w.getFg(x + dx, ty + dy));
        if (solid(0, 1) || solid(0, -1) || solid(-1, 0) || solid(1, 0)) return px(x, ty);
        continue;
      }
      if (floor(x, ty)) return px(x, ty);
    }
  }
  return null;
}

/** 生成點是不是在玩家房子裡（木板牆背景） */
export function inHouse(w: World, x: number, y: number): boolean {
  return w.getWall(x, y) === W.PLANK_WALL;
}
