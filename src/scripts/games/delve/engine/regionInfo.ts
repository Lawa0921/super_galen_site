// regionInfo.ts — 地區資訊（World.regionAt / ColumnSource.regionAt 的回傳）：一欄屬於哪塊陸地、哪一側、第幾階、什麼地區。
// 舊世界中央 = landmass 0 的 home；v1 外圍 = 海（landmass 1）與陸地生態段（landmass 2，wild）。

/** 在家鄉的哪一側：-1 = 西、0 = 家鄉本身、1 = 東 */
export type Side = -1 | 0 | 1;
export type RegionKind = 'home' | 'culture' | 'wild' | 'sea' | 'island';
export type CultureId = 'mistbamboo';

export interface RegionInfo {
  /** 第幾塊陸地 / 海（0 = 家鄉） */
  landmass: number;
  side: Side;
  /** 離家鄉的階數（0 = 家鄉與 v1 外圍） */
  tier: number;
  kind: RegionKind;
  culture: CultureId | null;
  /** 同一種地區的變體 */
  variant: number;
  /** 地區的代表生態（BIOME） */
  biome: number;
  /** 在所屬陸地 / 海裡的第幾個地區 */
  index: number;
  /** 地區範圍 [x0, x1)（世界座標） */
  x0: number;
  x1: number;
}
