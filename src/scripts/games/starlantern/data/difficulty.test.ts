import { describe, expect, it } from 'vitest';
import { TIERS, tierOf, type TierDef } from './difficulty';

const KEYS: (keyof TierDef)[] = [
  'hp', 'atk', 'chanceMul', 'chanceCap', 'rider', 'eliteAffixes', 'bossAffixes', 'reward', 'runeDrop', 'runeTierMul',
  'runeLegendary', 'rarityMul', 'legendaryShareMul', 'legendaryCap', 'ilvl', 'starlitMul', 'crowdAffixChance',
];

describe('the difficulty table (difficulty plan Task 1)', () => {
  it('the normal row is the identity', () => {
    // Multipliers 1; the rider, affix counts, item level bonus and chance cap 0 (a cap of 0 under a x1 multiplier leaves
    // every chance as it is); the legendary cap 1 (no cap).
    expect(TIERS.normal).toEqual({
      hp: 1, atk: 1, chanceMul: 1, chanceCap: 0, rider: 0, eliteAffixes: 0, bossAffixes: 0, reward: 1, runeDrop: 1, runeTierMul: 1,
      runeLegendary: 1, rarityMul: 1, legendaryShareMul: 1, legendaryCap: 1, ilvl: 0, starlitMul: 1, crowdAffixChance: 0,
    });
    // The starting proposal (spec §5.0); Hell's crowd affix chance (controller ruling 2026-10-23), none below Hell.
    expect(TIERS.nightmare).toEqual({
      hp: 1.35, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, rider: 0.25, eliteAffixes: 1, bossAffixes: 1, reward: 1.25, runeDrop: 1.25,
      runeTierMul: 1.5, runeLegendary: 1.5, rarityMul: 1.3, legendaryShareMul: 1.3, legendaryCap: 0.5, ilvl: 4, starlitMul: 1.5, crowdAffixChance: 0,
    });
    expect(TIERS.hell).toEqual({
      hp: 1.8, atk: 1.4, chanceMul: 2, chanceCap: 0.75, rider: 0.4, eliteAffixes: 2, bossAffixes: 2, reward: 1.5, runeDrop: 1.5,
      runeTierMul: 3, runeLegendary: 2, rarityMul: 1.6, legendaryShareMul: 1.6, legendaryCap: 0.5, ilvl: 8, starlitMul: 2, crowdAffixChance: 0.5,
    });
    for (const t of Object.values(TIERS)) expect(Object.keys(t).sort()).toEqual([...KEYS].sort());
  });

  it('tierOf gives null for Normal', () => {
    expect(tierOf(undefined)).toBeNull();
    expect(tierOf('normal')).toBeNull();
    expect(tierOf('nightmare')).toBe(TIERS.nightmare);
    expect(tierOf('hell')).toBe(TIERS.hell);
  });

  it('higher tiers only ever ask more', () => {
    for (const k of KEYS) {
      if (k === 'legendaryCap') continue;
      expect(TIERS.nightmare[k], `nightmare ${k}`).toBeGreaterThanOrEqual(TIERS.normal[k]);
      expect(TIERS.hell[k], `hell ${k}`).toBeGreaterThanOrEqual(TIERS.nightmare[k]);
    }
  });
});
