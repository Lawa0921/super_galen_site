/**
 * ELO 積分與段位（純函式）。對戰結束後更新雙方分數。
 */
export const DEFAULT_RATING = 1000;
export const K_FACTOR = 32;

export type Winner = 'a' | 'b';

/** A 對 B 的期望勝率（0..1）。 */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** 依勝負更新雙方 ELO（四捨五入到整數）。 */
export function updateRatings(ratingA: number, ratingB: number, winner: Winner): { a: number; b: number } {
  const ea = expectedScore(ratingA, ratingB);
  const sa = winner === 'a' ? 1 : 0;
  return {
    a: Math.round(ratingA + K_FACTOR * (sa - ea)),
    b: Math.round(ratingB + K_FACTOR * (1 - sa - (1 - ea))),
  };
}

export interface Tier {
  name: string;
  min: number;
}

/** 由低到高的段位門檻（min = 該段最低 ELO）。 */
export const TIERS: readonly Tier[] = [
  { name: 'Bronze', min: 0 },
  { name: 'Silver', min: 1100 },
  { name: 'Gold', min: 1300 },
  { name: 'Platinum', min: 1500 },
  { name: 'Diamond', min: 1700 },
  { name: 'Master', min: 1900 },
] as const;

/** 取得該分數對應的段位名稱。 */
export function tierFor(rating: number): string {
  let tier = TIERS[0].name;
  for (const t of TIERS) {
    if (rating >= t.min) tier = t.name;
  }
  return tier;
}
