import { describe, expect, it } from 'vitest';
import { newGame } from '../save';
import { companyMandateAgenda } from './mandates';
import { constitutionalMandateAgenda, completeConstitutionalMandate } from './constitutionalMandates';
import { companyConstitutionState, enactCompanyConstitution } from './constitution';

function richSave() {
  const save = newGame(123, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
  save.marketSeed = 9090;
  save.gold = 1000;
  save.reputation = 20;
  save.wagonLevel = 5;
  save.inventory['dried-rations'] = 20;
  save.visitedBossDungeons = ['a', 'b', 'c'];
  return save;
}

describe('M35 company constitution', () => {
  it('keeps M34 exact when no clause is enacted', () => {
    const save = richSave();
    expect(constitutionalMandateAgenda(save).mandates).toEqual(companyMandateAgenda(save).mandates);
  });

  it('makes every clause a tradeoff rather than a free universal buff', () => {
    const base = richSave();
    const baseline = companyMandateAgenda(base);
    for (const id of ['martial-priority', 'open-knowledge', 'fellowship-dividend', 'commercial-supremacy', 'exploration-duty'] as const) {
      const save = richSave();
      enactCompanyConstitution(save, id);
      const agenda = constitutionalMandateAgenda(save);
      expect(agenda.mandates).not.toEqual(baseline.mandates);
      const allRoutes = agenda.mandates.flatMap((m) => m.routes);
      expect(allRoutes.every((route) => route.goldCost >= 0 && Object.values(route.inventoryCost).every((n) => n >= 0))).toBe(true);
    }
  });

  it('charges amendments after the first enactment and fails atomically', () => {
    const save = richSave();
    enactCompanyConstitution(save, 'open-knowledge');
    save.gold = 39;
    const before = JSON.stringify(save);
    expect(() => enactCompanyConstitution(save, 'commercial-supremacy')).toThrow();
    expect(JSON.stringify(save)).toBe(before);
  });

  it('disables corrupt multiple clauses instead of stacking them', () => {
    const save = richSave();
    save.flags['company-constitution:open-knowledge'] = true;
    save.flags['company-constitution:commercial-supremacy'] = true;
    const state = companyConstitutionState(save);
    expect(state.active).toBeNull();
    expect(state.warnings.length).toBeGreaterThan(0);
    expect(constitutionalMandateAgenda(save).mandates).toEqual(companyMandateAgenda(save).mandates);
  });

  it('settles the policy-adjusted cost and reward only once', () => {
    const save = richSave();
    enactCompanyConstitution(save, 'fellowship-dividend');
    const agenda = constitutionalMandateAgenda(save);
    const option = agenda.mandates.flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.eligible);
    expect(option).toBeTruthy();
    const beforeGold = save.gold;
    const result = completeConstitutionalMandate(save, option!.mandate.id, option!.route.id);
    expect(save.gold).toBe(beforeGold - option!.route.goldCost + result.reward.gold);
    const snapshot = JSON.stringify(save);
    expect(() => completeConstitutionalMandate(save, option!.mandate.id, option!.route.id)).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });
});
