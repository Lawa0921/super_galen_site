import { describe, it, expect } from 'vitest';
import { resolveCheck } from './check';
import type { Rng } from './rng';

/** 固定骰值的假 RNG——檢定測試只關心規則，不關心隨機 */
function fixedDie(value: number): Rng {
  return {
    next: () => 0,
    roll: () => value,
    d20: () => value,
    pick: (arr) => arr[0],
    weightedPick: (items) => items[0].value,
  };
}

describe('resolveCheck（d20 檢定）', () => {
  it('total >= dc 成功', () => {
    const r = resolveCheck(fixedDie(12), { stat: 'dex', dc: 14, modifier: 2 });
    expect(r).toEqual({ die: 12, total: 14, dc: 14, success: true, critical: null });
  });

  it('total < dc 失敗', () => {
    const r = resolveCheck(fixedDie(10), { stat: 'dex', dc: 14, modifier: 2 });
    expect(r.success).toBe(false);
    expect(r.critical).toBeNull();
  });

  it('bonus 疊加進 total', () => {
    const r = resolveCheck(fixedDie(10), { stat: 'cha', dc: 14, modifier: 2, bonus: 2 });
    expect(r.total).toBe(14);
    expect(r.success).toBe(true);
  });

  it('nat20 即使 total 不足也必成功', () => {
    const r = resolveCheck(fixedDie(20), { stat: 'str', dc: 99, modifier: 0 });
    expect(r.success).toBe(true);
    expect(r.critical).toBe('success');
  });

  it('nat1 即使 total 足夠也必失敗', () => {
    const r = resolveCheck(fixedDie(1), { stat: 'str', dc: 2, modifier: 10 });
    expect(r.success).toBe(false);
    expect(r.critical).toBe('failure');
  });
});
