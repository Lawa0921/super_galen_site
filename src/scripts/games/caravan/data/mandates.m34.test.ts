import { describe, expect, it } from 'vitest';
import { newGame } from '../save';
import {
  companyMandateAgenda,
  completeCompanyMandate,
  type MandateRouteId,
} from './mandates';

function richSave() {
  const save = newGame(100, {
    job: 'cleric',
    trait: 'charming',
    allocation: { cha: 3 },
    statRoll: { str: 10, dex: 9, int: 11, cha: 16, con: 12 },
  });
  save.marketSeed = 4242;
  save.gold = 1000;
  save.wagonLevel = 6;
  save.inventory['dried-rations'] = 20;
  save.visitedBossDungeons = ['a', 'b', 'c'];
  save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  save.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } };
  save.protagonist.careerMilestones = [
    { level: 2, pathId: 'martial', score: 20 },
    { level: 3, pathId: 'scouting', score: 20 },
    { level: 4, pathId: 'lore', score: 20 },
    { level: 5, pathId: 'negotiation', score: 20 },
  ];
  save.companions = [
    {
      id: 'c1', name: '甲', job: 'swordsman', level: 5, xp: 0,
      stats: { str: 15, dex: 10, int: 9, cha: 9, con: 14 }, maxHp: 30,
      injuredForTrips: 0, trait: 'brawny', equipment: { weapon: null, armor: null, trinket: null },
      bond: 9,
      genesis: { lifepathId: 'brawny', aptitudeId: 'str', burdenId: 'int' },
      growth: { potential: { str: 5, dex: 2, int: 1, cha: 2, con: 5 } },
      careerMilestones: [{ level: 5, pathId: 'martial', score: 20 }],
    },
    {
      id: 'c2', name: '乙', job: 'ranger', level: 5, xp: 0,
      stats: { str: 9, dex: 16, int: 11, cha: 10, con: 12 }, maxHp: 26,
      injuredForTrips: 0, trait: 'nimble', equipment: { weapon: null, armor: null, trinket: null },
      bond: 9,
      genesis: { lifepathId: 'nimble', aptitudeId: 'dex', burdenId: 'str' },
      growth: { potential: { str: 1, dex: 5, int: 3, cha: 2, con: 4 } },
      careerMilestones: [{ level: 5, pathId: 'scouting', score: 20 }],
    },
    {
      id: 'c3', name: '丙', job: 'mage', level: 5, xp: 0,
      stats: { str: 8, dex: 11, int: 17, cha: 10, con: 10 }, maxHp: 22,
      injuredForTrips: 0, trait: 'learned', equipment: { weapon: null, armor: null, trinket: null },
      bond: 9,
      genesis: { lifepathId: 'learned', aptitudeId: 'int', burdenId: 'str' },
      growth: { potential: { str: 1, dex: 3, int: 5, cha: 2, con: 3 } },
      careerMilestones: [{ level: 5, pathId: 'lore', score: 20 }],
    },
  ];
  save.flags['company-initiative:escort-network:1:expertise'] = true;
  save.flags['company-initiative:frontier-office:1:capital'] = true;
  save.flags['company-initiative:trade-consortium:1:field'] = true;
  return save;
}

function eligibleChoice(save: ReturnType<typeof richSave>) {
  const agenda = companyMandateAgenda(save);
  for (const mandate of agenda.mandates) {
    const route = mandate.routes.find((entry) => entry.eligible);
    if (route) return { agenda, mandate, route };
  }
  throw new Error('測試存檔應至少有一條可行路線');
}

describe('M34 dynamic company mandates', () => {
  it('is deterministic, presents three distinct domains, and preview is read-only', () => {
    const save = richSave();
    const before = JSON.stringify(save);
    const first = companyMandateAgenda(save);
    const second = companyMandateAgenda(save);
    expect(first).toEqual(second);
    expect(new Set(first.mandates.map((entry) => entry.domain)).size).toBe(3);
    expect(first.mandates.every((entry) => entry.routes.length === 3)).toBe(true);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('allows exactly one mandate per market cycle even when another route remains eligible', () => {
    const save = richSave();
    const { agenda, mandate, route } = eligibleChoice(save);
    completeCompanyMandate(save, mandate.id, route.id);
    expect(companyMandateAgenda(save).completed).toBe(true);
    const other = agenda.mandates.find((entry) => entry.id !== mandate.id)!;
    const otherRoute = other.routes.find((entry) => entry.eligible) ?? other.routes[0];
    const snapshot = JSON.stringify(save);
    expect(() => completeCompanyMandate(save, other.id, otherRoute.id)).toThrow(/已經完成/);
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('revalidates current resources and fails atomically after a stale preview', () => {
    const save = richSave();
    const agenda = companyMandateAgenda(save);
    const field = agenda.mandates
      .flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.id === 'field' && route.eligible);
    expect(field).toBeTruthy();
    save.inventory['dried-rations'] = 0;
    const before = JSON.stringify(save);
    expect(() => completeCompanyMandate(save, field!.mandate.id, 'field')).toThrow(/不足/);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('does not allow duplicate capital rewards or negative-cost inventory', () => {
    const save = richSave();
    const agenda = companyMandateAgenda(save);
    const choice = agenda.mandates
      .flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.id === 'capital' && route.eligible);
    expect(choice).toBeTruthy();
    const goldBefore = save.gold;
    const result = completeCompanyMandate(save, choice!.mandate.id, 'capital');
    expect(save.gold).toBe(goldBefore - choice!.route.goldCost + result.reward.gold);
    expect(Object.values(save.inventory).every((count) => count >= 0)).toBe(true);
    const after = JSON.stringify(save);
    expect(() => completeCompanyMandate(save, choice!.mandate.id, 'capital')).toThrow();
    expect(JSON.stringify(save)).toBe(after);
  });

  it('invalid mandate and route ids never mutate resources', () => {
    const save = richSave();
    const before = JSON.stringify(save);
    expect(() => completeCompanyMandate(save, 'missing', 'expertise')).toThrow(/找不到/);
    expect(JSON.stringify(save)).toBe(before);
    const mandate = companyMandateAgenda(save).mandates[0];
    expect(() => completeCompanyMandate(save, mandate.id, 'bad' as MandateRouteId)).toThrow(/找不到/);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('a new market seed creates a new agenda without erasing the prior receipt', () => {
    const save = richSave();
    const { mandate, route, agenda } = eligibleChoice(save);
    completeCompanyMandate(save, mandate.id, route.id);
    expect(save.flags[agenda.receipt]).toBe(true);
    save.marketSeed += 1;
    const next = companyMandateAgenda(save);
    expect(next.cycle).not.toBe(agenda.cycle);
    expect(next.completed).toBe(false);
    expect(save.flags[agenda.receipt]).toBe(true);
  });
});
