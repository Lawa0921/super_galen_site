// scoring.test.ts
import { describe, it, expect } from 'vitest';
import { SCORE, descendBonus } from './scoring';

describe('scoring', () => {
  it('各事件有固定分值', () => {
    expect(SCORE.crate).toBe(10);
    expect(SCORE.enemy).toBe(100);
    expect(SCORE.powerup).toBe(50);
  });
  it('下樓獎勵隨層數遞增', () => {
    expect(descendBonus(2)).toBeGreaterThan(descendBonus(1));
    expect(descendBonus(1)).toBe(200);
    expect(descendBonus(2)).toBe(400);
  });
});
