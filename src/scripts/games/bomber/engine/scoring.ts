// scoring.ts
export const SCORE = { crate: 10, enemy: 100, powerup: 50 } as const;

/** 進入下一層的分數獎勵：抵達的層數 × 200。 */
export function descendBonus(reachedFloor: number): number {
  return reachedFloor * 200;
}
