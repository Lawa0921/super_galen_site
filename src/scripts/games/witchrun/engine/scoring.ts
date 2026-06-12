// scoring.ts
export const SCORE = { enemy: 100, coin: 50, graze: 10, bossBonus: 5000 } as const;

/** 擦彈連鎖倍率：每 10 連鎖 +0.5x，封頂 5x。被彈時連鎖歸零（由 game.ts 處理）。 */
export function chainMultiplier(chain: number): number {
  return Math.min(5, 1 + Math.floor(chain / 10) * 0.5);
}
