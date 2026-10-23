import { describe, expect, it } from 'vitest';
import { DEPTH_BANDS, TIERS, enemyFactors, tierOf, type DepthFactors, type TierDef } from './difficulty';

const KEYS: (keyof TierDef)[] = [
  'enemy', 'rider', 'eliteAffixes', 'bossAffixes', 'reward', 'runeDrop', 'runeTierMul',
  'runeLegendary', 'rarityMul', 'legendaryShareMul', 'legendaryCap', 'ilvl', 'starlitMul', 'crowdAffixChance',
];
/** The enemy factors' fields; a boss's own factors are 1 when left out. */
const FACTORS = ['hp', 'atk', 'chanceMul', 'chanceCap', 'bossHp', 'bossAtk'] as const;
const factor = (f: DepthFactors, k: (typeof FACTORS)[number]): number => f[k] ?? 1;

describe('the difficulty table (difficulty plan Task 1)', () => {
  it('the normal row is the identity', () => {
    // Multipliers 1; the rider, affix counts, item level bonus, chance cap and crowd affix chance 0 (a cap of 0 under a x1
    // multiplier leaves every chance as it is); the legendary cap 1 (no cap); the same enemy factors at every depth band.
    expect(TIERS.normal).toEqual({
      enemy: DEPTH_BANDS.map(() => ({ hp: 1, atk: 1, chanceMul: 1, chanceCap: 0 })), rider: 0, eliteAffixes: 0, bossAffixes: 0,
      reward: 1, runeDrop: 1, runeTierMul: 1, runeLegendary: 1, rarityMul: 1, legendaryShareMul: 1, legendaryCap: 1, ilvl: 0,
      starlitMul: 1, crowdAffixChance: 0,
    });
    // The rest of the starting proposal (spec §5.0); the enemy factors are the depth table (Task 5b, pinned below).
    const { enemy: _n, ...night } = TIERS.nightmare;
    expect(night).toEqual({
      rider: 0.25, eliteAffixes: 1, bossAffixes: 1, reward: 1.25, runeDrop: 1.25,
      runeTierMul: 1.5, runeLegendary: 1.5, rarityMul: 1.3, legendaryShareMul: 1.3, legendaryCap: 0.5, ilvl: 4, starlitMul: 1.5, crowdAffixChance: 0,
    });
    const { enemy: _h, ...hell } = TIERS.hell;
    expect(hell).toEqual({
      rider: 0.4, eliteAffixes: 2, bossAffixes: 2, reward: 1.5, runeDrop: 1.5,
      runeTierMul: 3, runeLegendary: 2, rarityMul: 1.6, legendaryShareMul: 1.6, legendaryCap: 0.5, ilvl: 8, starlitMul: 2, crowdAffixChance: 0.5,
    });
    for (const t of Object.values(TIERS)) {
      expect(Object.keys(t).sort()).toEqual([...KEYS].sort());
      expect(t.enemy).toHaveLength(DEPTH_BANDS.length);
    }
  });

  it('a depth reads its band: d10-14 and shallower, d15-19, d20-24, d25 on', () => {
    expect(DEPTH_BANDS).toEqual([10, 15, 20, 25]);
    const band = (hp: number): DepthFactors => ({ hp, atk: 1, chanceMul: 1, chanceCap: 0 });
    const t: TierDef = { ...TIERS.nightmare, enemy: [band(1.1), band(1.2), band(1.3), band(1.4)] };
    const at = (d: number) => enemyFactors(t, d).hp;
    expect([1, 9, 10, 14, 15, 19, 20, 24, 25, 30, 60].map(at)).toEqual([1.1, 1.1, 1.1, 1.1, 1.2, 1.2, 1.3, 1.3, 1.4, 1.4, 1.4]);
  });

  it('tierOf gives null for Normal', () => {
    expect(tierOf(undefined)).toBeNull();
    expect(tierOf('normal')).toBeNull();
    expect(tierOf('nightmare')).toBe(TIERS.nightmare);
    expect(tierOf('hell')).toBe(TIERS.hell);
  });

  it('the depth table (Task 5b, controller rulings of 2026-10-23)', () => {
    // d10–14, d15–19, d20–24, d25 on. Crowds and elites read hp/atk; the Lantern-eater its own factors on top.
    expect(TIERS.nightmare.enemy).toEqual([
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, bossHp: 1.5, bossAtk: 1.25 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, bossHp: 0.85, bossAtk: 1.15 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6 },
    ]);
    expect(TIERS.hell.enemy).toEqual([
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75 },
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75, bossHp: 1.5, bossAtk: 1.25 },
      { hp: 1.2, atk: 1.2, chanceMul: 2, chanceCap: 0.75, bossHp: 0.85, bossAtk: 1.3 },
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75 },
    ]);
  });

  it('higher tiers only ever ask more', () => {
    for (const k of KEYS) {
      if (k === 'legendaryCap' || k === 'enemy') continue;
      expect(TIERS.nightmare[k], `nightmare ${k}`).toBeGreaterThanOrEqual(TIERS.normal[k] as number);
      expect(TIERS.hell[k], `hell ${k}`).toBeGreaterThanOrEqual(TIERS.nightmare[k] as number);
    }
    // The enemy factors (controller ruling 2026-10-23): at every depth band Hell >= Nightmare on every factor (a boss's own
    // left out are 1); Nightmare's effective factors (a boss's times its own) never under Normal's.
    for (const [i, d] of DEPTH_BANDS.entries()) {
      const n = TIERS.nightmare.enemy[i], h = TIERS.hell.enemy[i], o = TIERS.normal.enemy[i];
      for (const k of FACTORS) expect(factor(h, k), `hell d${d} ${k}`).toBeGreaterThanOrEqual(factor(n, k));
      for (const k of ['hp', 'atk', 'chanceMul', 'chanceCap'] as const) expect(n[k], `nightmare d${d} ${k}`).toBeGreaterThanOrEqual(o[k]);
      expect(n.hp * factor(n, 'bossHp'), `nightmare d${d} boss hp`).toBeGreaterThanOrEqual(1);
      expect(n.atk * factor(n, 'bossAtk'), `nightmare d${d} boss atk`).toBeGreaterThanOrEqual(1);
    }
  });
});
