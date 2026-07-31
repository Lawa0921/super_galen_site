import { describe, expect, it } from 'vitest';
import type { CompanionRecord, SaveData } from '../save';
import { newGame } from '../save';
import { totalWage } from '../economy';
import {
  acceptedOperationalInitiatives,
  companyOperatingProfile,
  companyPayrollBreakdown,
} from './operations';

function companion(id: string, level: number, trait: string | null = null, bond = 0): CompanionRecord {
  return {
    id,
    name: id,
    job: 'ranger',
    level,
    xp: 0,
    stats: { str: 10, dex: 12, int: 10, cha: 10, con: 10 },
    maxHp: 20,
    injuredForTrips: 0,
    trait,
    equipment: { weapon: null, armor: null, trinket: null },
    bond,
  };
}

function matureSave(): SaveData {
  const save = newGame(100, {
    job: 'swordsman',
    trait: 'seasoned',
    allocation: { str: 3 },
  });
  save.protagonist.level = 5;
  save.protagonist.skills = { martial: 5, scouting: 4, lore: 4, negotiation: 4, survival: 4 };
  save.protagonist.skillPoints = 3;
  save.protagonist.careerMilestones = [
    { level: 2, pathId: 'martial', score: 20 },
    { level: 3, pathId: 'scouting', score: 19 },
    { level: 4, pathId: 'lore', score: 18 },
    { level: 5, pathId: 'negotiation', score: 17 },
  ];
  save.companyCharter = { id: 'iron-vanguard', tier: 3 };
  save.wagonLevel = 3;
  save.companions = [
    companion('a', 3, 'greedy', 9),
    companion('b', 2, 'frugal', 5),
    companion('c', 4, null, 2),
    companion('reserve', 1, null, 0),
  ];
  save.expeditionPlan = {
    activeIds: ['protagonist', 'a', 'b', 'c'],
    positions: { protagonist: 'front', a: 'front', b: 'back', c: 'back' },
    roles: { captain: 'protagonist', scout: 'a', quartermaster: 'b', medic: 'c' },
  };
  return save;
}

function receipt(save: SaveData, project: string, stage: number, route: string): void {
  save.flags[`company-initiative:${project}:${stage}:${route}`] = true;
}

function legacyWage(save: SaveData): number {
  const activeIds = new Set(save.expeditionPlan!.activeIds);
  const wage = (record: CompanionRecord) => 8 + record.level * 4 + (record.trait === 'greedy' ? 3 : record.trait === 'frugal' ? -2 : 0);
  const active = save.companions.filter((c) => !c.injuredForTrips && activeIds.has(c.id)).reduce((sum, c) => sum + wage(c), 0);
  const reserve = save.companions.filter((c) => !c.injuredForTrips && !activeIds.has(c.id)).reduce((sum, c) => sum + wage(c), 0);
  return active + Math.ceil(reserve * 0.25 * 0.5);
}

describe('M29 operational payroll', () => {
  it('preserves exact legacy wage when no initiative receipt exists', () => {
    const save = matureSave();
    expect(companyOperatingProfile(save).entries).toHaveLength(0);
    expect(companyPayrollBreakdown(save).total).toBe(legacyWage(save));
    expect(totalWage(save)).toBe(legacyWage(save));
  });

  it('makes expertise, capital, and field routes produce distinct operating accounts', () => {
    const expertise = matureSave();
    const capital = matureSave();
    const field = matureSave();
    receipt(expertise, 'escort-network', 1, 'expertise');
    receipt(capital, 'escort-network', 1, 'capital');
    receipt(field, 'escort-network', 1, 'field');
    const profiles = [expertise, capital, field].map(companyOperatingProfile);
    expect(new Set(profiles.map((p) => `${p.fixedUpkeep}:${p.activeWageFactor}:${p.reserveWageFactor}`)).size).toBe(3);
    expect(profiles.every((p) => p.entries.length === 1)).toBe(true);
  });

  it('uses skill and potential to reduce expertise upkeep', () => {
    const skilled = matureSave();
    const weak = matureSave();
    receipt(skilled, 'escort-network', 1, 'expertise');
    receipt(weak, 'escort-network', 1, 'expertise');
    weak.protagonist.skills = { martial: 0 };
    weak.protagonist.growth = undefined;
    expect(companyOperatingProfile(skilled).fixedUpkeep).toBeLessThan(companyOperatingProfile(weak).fixedUpkeep);
  });

  it('uses wagon investment to reduce capital upkeep', () => {
    const high = matureSave();
    const low = matureSave();
    receipt(high, 'trade-consortium', 1, 'capital');
    receipt(low, 'trade-consortium', 1, 'capital');
    low.wagonLevel = 0;
    expect(companyOperatingProfile(high).fixedUpkeep).toBeLessThan(companyOperatingProfile(low).fixedUpkeep);
  });

  it('uses bonds and fellowship stages as a capped loyalty discount', () => {
    const save = matureSave();
    receipt(save, 'fellowship-hall', 1, 'field');
    receipt(save, 'fellowship-hall', 2, 'field');
    receipt(save, 'fellowship-hall', 3, 'field');
    const profile = companyOperatingProfile(save);
    expect(profile.loyaltyDiscount).toBeGreaterThan(0);
    expect(profile.loyaltyDiscount).toBeLessThanOrEqual(12);
  });

  it('grants career diversity discount only after an accepted project exists', () => {
    const save = matureSave();
    expect(companyOperatingProfile(save).diversityDiscount).toBe(0);
    receipt(save, 'frontier-office', 1, 'expertise');
    expect(companyOperatingProfile(save).diversityDiscount).toBe(2);
  });

  it('rejects conflicting route receipts instead of stacking them', () => {
    const save = matureSave();
    receipt(save, 'escort-network', 1, 'expertise');
    receipt(save, 'escort-network', 1, 'capital');
    const result = acceptedOperationalInitiatives(save);
    expect(result.accepted).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('衝突'))).toBe(true);
  });

  it('rejects stage skipping from operational benefits', () => {
    const save = matureSave();
    receipt(save, 'relic-workshop', 2, 'field');
    const result = acceptedOperationalInitiatives(save);
    expect(result.accepted).toHaveLength(0);
    expect(result.warnings.some((warning) => warning.includes('缺少前置'))).toBe(true);
  });

  it('caps over-limit receipts in deterministic project order', () => {
    const save = matureSave();
    for (const project of ['escort-network', 'frontier-office', 'trade-consortium', 'fellowship-hall']) {
      receipt(save, project, 1, 'expertise');
    }
    const result = acceptedOperationalInitiatives(save);
    expect(result.accepted).toHaveLength(3);
    expect(result.accepted.map((entry) => entry.projectId)).toEqual([
      'escort-network', 'frontier-office', 'trade-consortium',
    ]);
    expect(result.warnings.some((warning) => warning.includes('超過上限'))).toBe(true);
  });

  it('keeps factors and fixed upkeep within hard safety bounds', () => {
    const save = matureSave();
    receipt(save, 'escort-network', 1, 'capital');
    receipt(save, 'frontier-office', 1, 'field');
    receipt(save, 'trade-consortium', 1, 'capital');
    receipt(save, 'escort-network', 2, 'capital');
    receipt(save, 'frontier-office', 2, 'field');
    receipt(save, 'escort-network', 3, 'capital');
    const profile = companyOperatingProfile(save);
    expect(profile.activeWageFactor).toBeGreaterThanOrEqual(0.8);
    expect(profile.activeWageFactor).toBeLessThanOrEqual(1.15);
    expect(profile.reserveWageFactor).toBeGreaterThanOrEqual(0.08);
    expect(profile.reserveWageFactor).toBeLessThanOrEqual(0.3);
    expect(profile.fixedUpkeep).toBeLessThanOrEqual(60);
  });

  it('never mutates the save while calculating payroll', () => {
    const save = matureSave();
    receipt(save, 'escort-network', 1, 'capital');
    const before = JSON.stringify(save);
    companyPayrollBreakdown(save);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('exposes the same total through economy.totalWage', () => {
    const save = matureSave();
    receipt(save, 'trade-consortium', 1, 'capital');
    expect(totalWage(save)).toBe(companyPayrollBreakdown(save).total);
  });
});
