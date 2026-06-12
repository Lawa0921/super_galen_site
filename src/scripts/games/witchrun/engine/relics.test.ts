// relics.test.ts
import { describe, it, expect } from 'vitest';
import { RELICS, draftRelics, computeModifiers, BASE_MODIFIERS } from './relics';
import { createRng } from './rng';
import type { RelicId } from './types';

describe('relics', () => {
  it('遺物池共 9 種且 id 唯一', () => {
    const ids = Object.keys(RELICS);
    expect(ids).toHaveLength(9);
    expect(new Set(ids).size).toBe(9);
  });

  it('draftRelics 抽 3 個不重複且排除已持有', () => {
    const rng = createRng(1);
    const owned: RelicId[] = ['split', 'magnet'];
    const picks = draftRelics(rng, owned);
    expect(picks).toHaveLength(3);
    expect(new Set(picks).size).toBe(3);
    for (const p of picks) expect(owned).not.toContain(p);
  });

  it('剩餘不足 3 個時抽剩餘全部', () => {
    const rng = createRng(1);
    const owned = Object.keys(RELICS).slice(0, 7) as RelicId[];
    expect(draftRelics(rng, owned)).toHaveLength(2);
  });

  it('computeModifiers：無遺物時回傳基準值', () => {
    expect(computeModifiers([])).toEqual(BASE_MODIFIERS);
  });

  it('computeModifiers：效果聚合', () => {
    const m = computeModifiers(['feather', 'pact', 'echo', 'stardust']);
    expect(m.speedMult).toBeCloseTo(1.2);
    expect(m.hitboxMult).toBeCloseTo(0.85);
    expect(m.atkMult).toBeCloseTo(1.5);
    expect(m.lifeCapDelta).toBe(-1);
    expect(m.overdriveDurMult).toBeCloseTo(1.5);
    expect(m.focusGrazeBonus).toBeCloseTo(0.3);
  });

  it('computeModifiers：布林遺物', () => {
    const m = computeModifiers(['split', 'familiar', 'magnet', 'catalyst']);
    expect(m.splitShot).toBe(true);
    expect(m.familiar).toBe(true);
    expect(m.magnet).toBe(true);
    expect(m.fireField).toBe(true);
  });
});
