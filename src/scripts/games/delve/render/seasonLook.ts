// seasonLook.ts — 季節外觀（純邏輯，無 DOM）：每棵樹的季節樣貌（春花 / 新綠 / 濃綠 / 秋葉三色 / 冬天光禿或積雪）、
// 每格草 / 花的季節（逐日過渡：各自依座標雜湊在換季後 0..N−1 天內切換）、森林背景剪影的季節色。全部取自統一色票。
import { SEASON, SEASON_TRANSITION_DAYS, seasonLook, seasonOf, type Season } from '../engine/calendar';
import { TREE_KIND } from './scene';

export type TreeLook =
  | 'spring' | 'blossom' | 'summer' | 'autumn-orange' | 'autumn-red' | 'autumn-yellow' | 'winter-bare' | 'winter-snow' | 'evergreen';
export const TREE_LOOKS: readonly TreeLook[] = [
  'spring', 'blossom', 'summer', 'autumn-orange', 'autumn-red', 'autumn-yellow', 'winter-bare', 'winter-snow', 'evergreen',
];

function hash(x: number, s: number): number {
  let h = Math.imul(x ^ Math.imul(s, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return (((h ^ (h >>> 16)) >>> 0) % 10000) / 10000;
}

/** 樹（種類 kind、樹幹欄 x）在第 day 天的樣貌。kind：0–2 森林三種（2 = 常綠）、3 雪原松、4 叢林 */
export function treeLook(kind: number, x: number, day: number): TreeLook {
  if (kind === TREE_KIND.PINE || kind === TREE_KIND.JUNGLE) return 'evergreen';
  const s = seasonLook(day, hash(x, 11));
  const r = hash(x, 23);
  const evergreen = kind === 2;
  switch (s) {
    case SEASON.SPRING:
      if (evergreen) return 'spring';
      return r < (kind === 1 ? 0.6 : 0.3) ? 'blossom' : 'spring';
    case SEASON.SUMMER: return 'summer';
    case SEASON.AUTUMN:
      if (evergreen) return 'summer';
      if (kind === 1) return r < 0.7 ? 'autumn-yellow' : 'autumn-orange';
      return r < 0.4 ? 'autumn-orange' : r < 0.72 ? 'autumn-red' : 'autumn-yellow';
    default: return evergreen ? 'winter-snow' : 'winter-bare';
  }
}
/** 會飄落葉 / 花瓣的樣貌 */
export function leafFall(look: TreeLook): 'leaf' | 'petal' | null {
  if (look === 'blossom') return 'petal';
  return look.startsWith('autumn') ? 'leaf' : null;
}

/** 草 / 花（欄 x）在第 day 天的季節外觀（4 欄一組） */
export function grassLook(x: number, day: number): Season { return seasonLook(day, hash(x >> 2, 37)); }

// 樹葉色階（[0] 描邊 → [6] 最亮；sprites.paintTree 用 1..6）
const LEAF: Record<string, readonly string[]> = {
  spring: ['#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478', '#fff4c0'],
  blossom: ['#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0', '#ffffff'],
  summer: ['#0c0a12', '#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50'],
  'autumn-orange': ['#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0'],
  'autumn-red': ['#1c1424', '#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a'],
  'autumn-yellow': ['#472819', '#7c4c2e', '#b07a4b', '#c99660', '#d8ba76', '#ffd86a', '#fff4c0'],
  'winter-snow': ['#0c0a12', '#16301e', '#214528', '#1f6474', '#3f7468', '#6a9c88', '#a2c8b0'],
  // 常綠種（2）的春 / 夏：原本的青綠
  evergreen2: ['#0c0a12', '#16301e', '#214528', '#1f6474', '#3f7468', '#6a9c88', '#a2c8b0'],
  // 樺樹（1）的夏天：比較亮的黃綠
  summer1: ['#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'],
};
/** 樹葉色階；winter-bare / evergreen 回傳空陣列（光禿 / 用樹種原本的色階） */
export function leafColors(look: TreeLook, kind = 0): readonly string[] {
  if (look === 'winter-bare' || look === 'evergreen') return [];
  if (kind === 2 && (look === 'spring' || look === 'summer')) return LEAF.evergreen2;
  if (kind === 1 && look === 'summer') return LEAF.summer1;
  return LEAF[look];
}
/** 落葉 / 花瓣粒子色 */
export function fallColors(look: TreeLook): readonly string[] {
  const l = leafColors(look);
  return l.length ? [l[3], l[4], l[5]] : [];
}

/** 森林背景（遠山 / 中丘 / 近林）的白天基色與受光色，依季節 */
const BG_DAY: Record<Season, [string, string, string]> = {
  [SEASON.SPRING]: ['#7f9cc4', '#6a9c88', '#468a34'],
  [SEASON.SUMMER]: ['#7f9cc4', '#3f7468', '#214528'],
  [SEASON.AUTUMN]: ['#858aa0', '#b07a4b', '#7c4c2e'],
  [SEASON.WINTER]: ['#b4b9c8', '#858aa0', '#423f54'],
};
const BG_LITE: Record<Season, [string, string, string]> = {
  [SEASON.SPRING]: ['#a2c8b0', '#93cc50', '#67ab3c'],
  [SEASON.SUMMER]: ['#a2c8b0', '#6a9c88', '#2d672e'],
  [SEASON.AUTUMN]: ['#b4b9c8', '#d8ba76', '#e8701c'],
  [SEASON.WINTER]: ['#ffffff', '#cceaf8', '#cceaf8'],
};
const BG_DARK: Record<Season, [string, string, string]> = {
  [SEASON.SPRING]: ['#5e5e74', '#3f7468', '#2d672e'],
  [SEASON.SUMMER]: ['#5e5e74', '#214528', '#16301e'],
  [SEASON.AUTUMN]: ['#5e5e74', '#7c4c2e', '#472819'],
  [SEASON.WINTER]: ['#858aa0', '#5e5e74', '#2c2838'],
};
export function bgSeasonDay(s: Season): readonly string[] { return BG_DAY[s]; }
export function bgSeasonLite(s: Season): readonly string[] { return BG_LITE[s]; }
export function bgSeasonDark(s: Season): readonly string[] { return BG_DARK[s]; }

/**
 * 從第 prev 天換到第 day 天，草 / 花 / 植物的季節外觀（grassLook）有沒有可能改變：
 * 外觀 = seasonOf(day − lag)，lag ∈ [0, SEASON_TRANSITION_DAYS)，所以只有某個 lag 的季節不同才會變。
 * 季中的普通換日 → false（chunk 快取不用重畫）。
 */
export function grassLookChanges(prev: number, day: number): boolean {
  for (let lag = 0; lag < SEASON_TRANSITION_DAYS; lag++) {
    if (seasonOf(Math.max(0, prev - lag)) !== seasonOf(Math.max(0, day - lag))) return true;
  }
  return false;
}
