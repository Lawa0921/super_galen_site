import { describe, expect, it } from 'vitest';
import { newGame } from '../save';
import { totalWage } from '../economy';
import { companyPayrollBreakdown } from './operations';
import {
  currentOperatingStance,
  governedPayrollBreakdown,
  governanceProjects,
  setOperatingStance,
  setProjectSuspended,
} from './governance';

function matureSave() {
  const save = newGame(1, {
    job: 'swordsman', trait: 'brawny', allocation: { str: 3 },
  });
  save.gold = 1000;
  save.wagonLevel = 3;
  save.companions = [
    { id: 'a', name: '甲', job: 'ranger', level: 4, xp: 210, stats: { str: 10, dex: 15, int: 10, cha: 10, con: 12 }, maxHp: 22, injuredForTrips: 0, trait: 'frugal', equipment: { weapon: null, armor: null, trinket: null }, bond: 6 },
    { id: 'b', name: '乙', job: 'cleric', level: 4, xp: 210, stats: { str: 10, dex: 9, int: 12, cha: 15, con: 13 }, maxHp: 23, injuredForTrips: 0, trait: 'seasoned', equipment: { weapon: null, armor: null, trinket: null }, bond: 6 },
  ];
  save.expeditionPlan = {
    activeIds: ['protagonist', 'a', 'b'],
    positions: { protagonist: 'front', a: 'back', b: 'back' },
    roles: { captain: 'protagonist', scout: 'a', quartermaster: 'b' },
  };
  save.flags['company-initiative:escort-network:1:expertise'] = true;
  save.flags['company-initiative:escort-network:2:capital'] = true;
  save.flags['company-initiative:fellowship-hall:1:field'] = true;
  save.flags['company-initiative:fellowship-hall:2:field'] = true;
  return save;
}

describe('M33 operational governance', () => {
  it('keeps legacy balanced saves exactly equal to M29', () => {
    const save = matureSave();
    expect(currentOperatingStance(save)).toBe('balanced');
    expect(governedPayrollBreakdown(save)).toEqual({
      ...companyPayrollBreakdown(save),
      stanceId: 'balanced',
      stanceName: '標準營運',
      suspendedProjectIds: [],
      governanceWarnings: [],
    });
    expect(totalWage(save)).toBe(companyPayrollBreakdown(save).total);
  });

  it('lean stance reduces fixed upkeep but raises labor factors', () => {
    const save = matureSave();
    const balanced = governedPayrollBreakdown(save);
    setOperatingStance(save, 'lean');
    const lean = governedPayrollBreakdown(save);
    expect(lean.fixedUpkeep).toBeLessThan(balanced.fixedUpkeep);
    expect(lean.activeWageFactor).toBeGreaterThanOrEqual(balanced.activeWageFactor);
    expect(totalWage(save)).toBe(lean.total);
  });

  it('suspending a project removes both its costs and its benefits', () => {
    const save = matureSave();
    const before = governedPayrollBreakdown(save);
    setProjectSuspended(save, 'fellowship-hall', true);
    const after = governedPayrollBreakdown(save);
    expect(after.entries.some((entry) => entry.projectId === 'fellowship-hall')).toBe(false);
    expect(after.loyaltyDiscount).toBe(0);
    expect(after.fixedUpkeep).toBeLessThan(before.fixedUpkeep);
  });

  it('restart costs scale with highest stage and are atomic on failure', () => {
    const save = matureSave();
    setProjectSuspended(save, 'escort-network', true);
    const project = governanceProjects(save).find((entry) => entry.projectId === 'escort-network')!;
    expect(project.restartCost).toBe(30);
    save.gold = 29;
    const snapshot = JSON.stringify(save);
    expect(() => setProjectSuspended(save, 'escort-network', false)).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
    save.gold = 30;
    setProjectSuspended(save, 'escort-network', false);
    expect(save.gold).toBe(0);
  });

  it('corrupt multiple stance flags safely fall back to balanced', () => {
    const save = matureSave();
    save.flags['operating-stance:lean'] = true;
    save.flags['operating-stance:ambitious'] = true;
    const result = governedPayrollBreakdown(save);
    expect(result.stanceId).toBe('balanced');
    expect(result.governanceWarnings.length).toBe(1);
  });

  it('stance changes charge only after the first explicit choice', () => {
    const save = matureSave();
    setOperatingStance(save, 'lean');
    expect(save.gold).toBe(1000);
    setOperatingStance(save, 'ambitious');
    expect(save.gold).toBe(990);
  });
});
