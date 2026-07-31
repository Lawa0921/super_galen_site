import { describe, expect, it } from 'vitest';
import { newGame, STARTING_PROFILE } from '../save';
import type { JobId } from './jobs';
import {
  deriveGrowthProfile,
  growthCombatBonuses,
  growthSignature,
  isValidGrowthProfile,
  latentStatBonuses,
} from './growth';
import type { CharacterGenesis } from './genesis';

const JOBS: JobId[] = ['swordsman', 'ranger', 'mage', 'cleric'];
const GENESIS: CharacterGenesis[] = [
  { lifepathId: 'seasoned', aptitudeId: 'int', burdenId: 'str' },
  { lifepathId: 'brawny', aptitudeId: 'str', burdenId: 'cha' },
  { lifepathId: 'nimble', aptitudeId: 'dex', burdenId: 'int' },
  { lifepathId: 'learned', aptitudeId: 'int', burdenId: 'con' },
  { lifepathId: 'charming', aptitudeId: 'cha', burdenId: 'str' },
  { lifepathId: 'tough', aptitudeId: 'con', burdenId: 'dex' },
];

describe('M23 成長潛力', () => {
  it('所有職業與命運組合都產生 1～5 的完整五維潛力', () => {
    for (const job of JOBS) {
      for (const genesis of GENESIS) {
        const base = STARTING_PROFILE[job].stats;
        const profile = deriveGrowthProfile(base, base, genesis);
        expect(isValidGrowthProfile(profile)).toBe(true);
        expect(Object.values(profile.potential)).toHaveLength(5);
        for (const value of Object.values(profile.potential)) {
          expect(value).toBeGreaterThanOrEqual(1);
          expect(value).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it('天賦與出身能改變同職業的潛力，不會只由職業模板決定', () => {
    const base = STARTING_PROFILE.mage.stats;
    const scholar = deriveGrowthProfile(base, base, {
      lifepathId: 'learned', aptitudeId: 'int', burdenId: 'str',
    });
    const fighter = deriveGrowthProfile(base, base, {
      lifepathId: 'brawny', aptitudeId: 'str', burdenId: 'cha',
    });
    expect(growthSignature(scholar)).not.toBe(growthSignature(fighter));
    expect(scholar.potential.int).toBeGreaterThan(fighter.potential.int);
    expect(fighter.potential.str).toBeGreaterThan(scholar.potential.str);
  });

  it('擲骰與配點偏移會改變潛力，而不是只改表面屬性', () => {
    const base = STARTING_PROFILE.ranger.stats;
    const normal = deriveGrowthProfile(base, base, {
      lifepathId: 'nimble', aptitudeId: 'dex', burdenId: 'int',
    });
    const altered = deriveGrowthProfile(
      { ...base, int: base.int + 3, dex: base.dex - 2 },
      base,
      { lifepathId: 'nimble', aptitudeId: 'int', burdenId: 'dex' },
    );
    expect(altered.potential.int).toBeGreaterThan(normal.potential.int);
    expect(altered.potential.dex).toBeLessThan(normal.potential.dex);
  });

  it('Lv1 不額外灌入戰鬥成長，Lv5 的總量仍受嚴格上限控制', () => {
    const profile = {
      potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } as const,
    };
    expect(growthCombatBonuses(profile, 1)).toEqual({
      stats: {}, maxHp: 0, defense: 0, damageBonus: 0,
    });
    const cap = growthCombatBonuses(profile, 5);
    expect(Object.values(cap.stats).reduce((sum, value) => sum + (value ?? 0), 0)).toBe(4);
    expect(cap.maxHp).toBeLessThanOrEqual(5);
    expect(cap.defense).toBeLessThanOrEqual(2);
    expect(cap.damageBonus).toBeLessThanOrEqual(3);
  });

  it('潛在屬性採公平分配，不會四級全部灌入單一最高屬性', () => {
    const profile = {
      potential: { str: 5, dex: 3, int: 2, cha: 1, con: 4 } as const,
    };
    const bonuses = latentStatBonuses(profile, 5);
    expect(Object.keys(bonuses).length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...Object.values(bonuses).map((value) => value ?? 0))).toBeLessThanOrEqual(2);
  });

  it('無出身角色維持舊版開局，不產生潛力或額外屬性', () => {
    const save = newGame(123, { job: 'swordsman', trait: null });
    expect(save.protagonist.growth).toBeUndefined();
    expect(save.protagonist.stats).toEqual(STARTING_PROFILE.swordsman.stats);
    expect(save.protagonist.maxHp).toBe(STARTING_PROFILE.swordsman.maxHp);
  });

  it('命運角色保存可重現潛力，並只表現一點潛力萌芽', () => {
    const choice = {
      job: 'cleric' as const,
      trait: 'charming',
      allocation: { cha: 3 },
    };
    const first = newGame(1, choice);
    const second = newGame(999, choice);
    expect(first.protagonist.growth).toEqual(second.protagonist.growth);
    const baseTotal = Object.values(STARTING_PROFILE.cleric.stats).reduce((a, b) => a + b, 0) + 3;
    const actualTotal = Object.values(first.protagonist.stats).reduce((a, b) => a + b, 0);
    expect(actualTotal - baseTotal).toBe(1);
  });

  it('毀損潛力不產生任何戰鬥加成', () => {
    const corrupt = { potential: { str: 99 } };
    expect(isValidGrowthProfile(corrupt)).toBe(false);
    expect(growthCombatBonuses(corrupt as never, 5)).toEqual({
      stats: {}, maxHp: 0, defense: 0, damageBonus: 0,
    });
  });
});
