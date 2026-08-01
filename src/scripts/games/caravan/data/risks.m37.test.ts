import { describe, expect, it } from 'vitest';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import { officeMandateAgenda } from './officeMandates';
import { completeRiskMandate, riskMandateAgenda } from './riskMandates';
import { companyRiskCrisis, companyRiskLedger, resolveCompanyRisk } from './risks';

function companion(id: string, index: number): CompanionRecord {
  return {
    id,
    name: `旅伴${index}`,
    job: index % 2 === 0 ? 'swordsman' : 'ranger',
    level: 5,
    xp: 320,
    stats: { str: 14, dex: 14, int: 10, cha: 10, con: 12 },
    maxHp: 28,
    injuredForTrips: 0,
    trait: 'greedy',
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function stableSave(): SaveData {
  const save = newGame(100, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
  save.marketSeed = 7000;
  save.gold = 1000;
  save.inventory['dried-rations'] = 20;
  return save;
}

function pressuredSave(): SaveData {
  const save = newGame(200, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
  save.marketSeed = 8100;
  save.gold = 100;
  save.wagonLevel = 6;
  save.inventory['dried-rations'] = 30;
  save.companions = [1, 2, 3, 4, 5].map((index) => companion(`c${index}`, index));
  save.flags['company-initiative:escort-network:1:expertise'] = true;
  save.flags['company-initiative:frontier-office:1:capital'] = true;
  save.flags['company-initiative:trade-consortium:1:field'] = true;
  save.flags['operating-stance:ambitious'] = true;
  return save;
}

describe('M37 company risk ledger', () => {
  it('keeps M36 mandates exact for stable companies and never mutates previews', () => {
    const save = stableSave();
    const before = JSON.stringify(save);
    expect(companyRiskLedger(save).stable).toBe(true);
    expect(riskMandateAgenda(save).mandates).toEqual(officeMandateAgenda(save).mandates);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('creates a deterministic finance crisis and applies visible mandate penalties', () => {
    const save = pressuredSave();
    const before = JSON.stringify(save);
    const first = companyRiskCrisis(save);
    const second = companyRiskCrisis(save);
    expect(first).toEqual(second);
    expect(first?.dimension).toBe('finance');
    expect(first?.resolved).toBe(false);
    const base = officeMandateAgenda(save);
    const risky = riskMandateAgenda(save);
    expect(risky.riskPenaltyActive).toBe(true);
    expect(risky.mandates.some((mandate, index) => mandate.reward.gold < base.mandates[index].reward.gold)).toBe(true);
    expect(risky.mandates.some((mandate, index) => {
      const route = mandate.routes.find((entry) => entry.id === 'capital')!;
      const baseRoute = base.mandates[index].routes.find((entry) => entry.id === 'capital')!;
      return route.goldCost > baseRoute.goldCost;
    })).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('resolves a crisis atomically, learns one permanent practice, and cannot repeat', () => {
    const save = pressuredSave();
    const crisis = companyRiskCrisis(save)!;
    const route = crisis.routes.find((entry) => entry.id === 'capital')!;
    expect(route.eligible).toBe(true);
    const beforeGold = save.gold;
    const result = resolveCompanyRisk(save, 'capital');
    expect(save.gold).toBe(beforeGold - route.goldCost);
    expect(result.learnedPractice).toBe(true);
    expect(save.flags['company-risk-practice:capital']).toBe(true);
    expect(companyRiskCrisis(save)?.resolved).toBe(true);
    expect(riskMandateAgenda(save).mandates).toEqual(officeMandateAgenda(save).mandates);
    const snapshot = JSON.stringify(save);
    expect(() => resolveCompanyRisk(save, 'capital')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('revalidates stale resources before crisis settlement without partial mutation', () => {
    const save = pressuredSave();
    const route = companyRiskCrisis(save)!.routes.find((entry) => entry.id === 'capital')!;
    expect(route.eligible).toBe(true);
    save.gold = route.goldCost - 1;
    const snapshot = JSON.stringify(save);
    expect(() => resolveCompanyRisk(save, 'capital')).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('makes risk practices reduce later exposure without stacking duplicates', () => {
    const save = pressuredSave();
    const before = companyRiskLedger(save).scores.find((entry) => entry.dimension === 'finance')!.score;
    save.flags['company-risk-practice:capital'] = true;
    const after = companyRiskLedger(save).scores.find((entry) => entry.dimension === 'finance')!.score;
    expect(after).toBe(Math.max(0, before - 1));
    save.flags['company-risk-practice:capital'] = true;
    expect(companyRiskLedger(save).scores.find((entry) => entry.dimension === 'finance')!.score).toBe(after);
  });

  it('uses the risk-adjusted reward in the real mandate settlement', () => {
    const save = pressuredSave();
    save.protagonist.stats = { str: 30, dex: 30, int: 30, cha: 30, con: 30 };
    save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
    save.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } } as never;
    const agenda = riskMandateAgenda(save);
    const option = agenda.mandates.flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.eligible);
    expect(option).toBeTruthy();
    const beforeGold = save.gold;
    const result = completeRiskMandate(save, option!.mandate.id, option!.route.id);
    expect(save.gold).toBe(beforeGold - option!.route.goldCost + result.reward.gold);
    const snapshot = JSON.stringify(save);
    expect(() => completeRiskMandate(save, option!.mandate.id, option!.route.id)).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('treats the next market seed as an independent crisis cycle', () => {
    const save = pressuredSave();
    resolveCompanyRisk(save, 'capital');
    const oldReceipt = `company-risk-cycle:${save.marketSeed}`;
    expect(save.flags[oldReceipt]).toBe(true);
    save.marketSeed += 1;
    const next = companyRiskCrisis(save);
    expect(next).not.toBeNull();
    expect(next?.resolved).toBe(false);
    expect(save.flags[oldReceipt]).toBe(true);
  });
});
