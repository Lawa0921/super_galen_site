import { describe, expect, it } from 'vitest';
import { FLOORS } from '../data/floors';
import { expToNext } from './party';
import { avgExp, fightsToLevel, groupExp, winRate } from './sim';

const groups = (f: number) => FLOORS[f - 1].encounters;

describe('balance', () => {
  it('1. no floor-1 fight levels anyone up on its own', () => {
    for (const g of groups(1)) expect(groupExp(g), g.join('+')).toBeLessThan(expToNext(1));
  });

  it('2-3. levelling pace per floor', () => {
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeGreaterThanOrEqual(10);
    expect(fightsToLevel(avgExp(1), 1, 5)).toBeLessThanOrEqual(18);
    for (const [f, a, b] of [[2, 5, 8], [3, 8, 11]] as const) {
      const n = fightsToLevel(avgExp(f), a, b);
      expect(n, `floor ${f}`).toBeGreaterThanOrEqual(10);
      expect(n, `floor ${f}`).toBeLessThanOrEqual(18);
    }
  });

  it('4. a party at the recommended level wins reliably without trivialising', () => {
    for (const [f, lv] of [[1, 2], [2, 6], [3, 9]] as const) {
      const r = winRate(lv, groups(f), false);
      expect(r.rate, `floor ${f}`).toBeGreaterThanOrEqual(0.85);
      expect(r.hpLoss, `floor ${f}`).toBeGreaterThanOrEqual(0.1);
      expect(r.hpLoss, `floor ${f}`).toBeLessThanOrEqual(0.45);
    }
  });

  it('5. under-levelled parties are at risk on floor 3', () => {
    expect(winRate(4, groups(3), false).rate).toBeLessThanOrEqual(0.6);
  });

  it('6. the boss is a real fight', () => {
    const lo = winRate(11, [['lanterneater']], true).rate;
    expect(lo).toBeGreaterThanOrEqual(0.3);
    expect(lo).toBeLessThanOrEqual(0.85);
    expect(winRate(13, [['lanterneater']], true).rate).toBeGreaterThanOrEqual(0.7);
  });
});
