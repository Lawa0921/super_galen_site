// scoring.test.ts
import { describe, it, expect } from 'vitest';
import { SCORE, chainMultiplier } from './scoring';

describe('scoring', () => {
  it('連鎖倍率：每 10 連鎖 +0.5x，封頂 5x', () => {
    expect(chainMultiplier(0)).toBe(1);
    expect(chainMultiplier(10)).toBeCloseTo(1.5);
    expect(chainMultiplier(40)).toBeCloseTo(3);
    expect(chainMultiplier(999)).toBe(5);
  });

  it('分值常數存在', () => {
    expect(SCORE.enemy).toBeGreaterThan(0);
    expect(SCORE.coin).toBeGreaterThan(0);
    expect(SCORE.graze).toBeGreaterThan(0);
    expect(SCORE.bossBonus).toBeGreaterThan(0);
  });
});
