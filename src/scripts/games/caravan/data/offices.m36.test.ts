import { describe, expect, it } from 'vitest';
import { newGame } from '../save';
import { registerCompanionOrigin } from './companionOrigins';
import { constitutionalMandateAgenda } from './constitutionalMandates';
import { appointCompanyOfficer, companyOfficeState, dismissCompanyOfficer, officeCandidate } from './offices';
import { completeOfficeMandate, officeMandateAgenda } from './officeMandates';

function officeSave() {
  const save = newGame(777, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
  save.marketSeed = 8181;
  save.gold = 1000;
  save.reputation = 20;
  save.wagonLevel = 5;
  save.inventory['dried-rations'] = 20;
  save.visitedBossDungeons = ['a', 'b', 'c'];
  save.companions.push(
    {
      id: 'sera', name: '瑟拉', job: 'mage', level: 5, xp: 320,
      stats: { str: 8, dex: 11, int: 19, cha: 12, con: 10 }, maxHp: 22,
      injuredForTrips: 0, trait: 'learned', equipment: { weapon: null, armor: null, trinket: null },
      skills: { lore: 5 }, bond: 9,
    },
    {
      id: 'doran', name: '多蘭', job: 'swordsman', level: 5, xp: 320,
      stats: { str: 19, dex: 11, int: 9, cha: 10, con: 15 }, maxHp: 30,
      injuredForTrips: 0, trait: 'brawny', equipment: { weapon: null, armor: null, trinket: null },
      skills: { martial: 5 }, bond: 9,
    },
    {
      id: 'mira', name: '米拉', job: 'ranger', level: 5, xp: 320,
      stats: { str: 10, dex: 19, int: 11, cha: 10, con: 13 }, maxHp: 25,
      injuredForTrips: 0, trait: 'nimble', equipment: { weapon: null, armor: null, trinket: null },
      skills: { scouting: 5 }, bond: 9,
    },
    {
      id: 'lian', name: '蓮', job: 'cleric', level: 5, xp: 320,
      stats: { str: 10, dex: 9, int: 12, cha: 19, con: 15 }, maxHp: 28,
      injuredForTrips: 0, trait: 'charming', equipment: { weapon: null, armor: null, trinket: null },
      skills: { negotiation: 5, survival: 4 }, bond: 9,
    },
  );
  for (const companion of save.companions) registerCompanionOrigin(save, companion.id);
  return save;
}

describe('M36 company offices', () => {
  it('keeps M35 exact when no office is appointed', () => {
    const save = officeSave();
    const base = constitutionalMandateAgenda(save);
    const office = officeMandateAgenda(save);
    expect(office.mandates).toEqual(base.mandates);
    expect(office.officeUpkeep).toBe(0);
  });

  it('requires registered qualified healthy companions and charges appointments', () => {
    const save = officeSave();
    const candidate = officeCandidate(save, 'relic-curator', 'sera');
    expect(candidate.eligible).toBe(true);
    expect(candidate.appointmentCost).toBe(0);
    const beforeGold = save.gold;
    appointCompanyOfficer(save, 'relic-curator', 'sera');
    expect(save.gold).toBe(beforeGold);
    dismissCompanyOfficer(save, 'relic-curator');
    const rehire = officeCandidate(save, 'relic-curator', 'sera');
    expect(rehire.appointmentCost).toBe(25);
  });

  it('limits the company to three seats and one seat per companion', () => {
    const save = officeSave();
    appointCompanyOfficer(save, 'relic-curator', 'sera');
    expect(officeCandidate(save, 'escort-marshal', 'sera').eligible).toBe(false);
    appointCompanyOfficer(save, 'escort-marshal', 'doran');
    appointCompanyOfficer(save, 'surveyor', 'mira');
    expect(companyOfficeState(save).assignments).toHaveLength(3);
    expect(officeCandidate(save, 'trade-director', 'lian').eligible).toBe(false);
  });

  it('adds domain expertise but subtracts visible and settled officer upkeep', () => {
    const save = officeSave();
    const base = constitutionalMandateAgenda(save);
    appointCompanyOfficer(save, 'relic-curator', 'sera');
    const agenda = officeMandateAgenda(save);
    expect(agenda.officeUpkeep).toBe(3);
    const relic = agenda.mandates.find((entry) => entry.domain === 'relic');
    const baseRelic = base.mandates.find((entry) => entry.domain === 'relic');
    if (relic && baseRelic) {
      expect(relic.routes.find((route) => route.id === 'expertise')!.score)
        .toBeGreaterThan(baseRelic.routes.find((route) => route.id === 'expertise')!.score);
    }
    for (let index = 0; index < agenda.mandates.length; index++) {
      expect(agenda.mandates[index].reward.gold).toBe(Math.max(0, base.mandates[index].reward.gold - 3));
    }
    const option = agenda.mandates.flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.eligible);
    expect(option).toBeTruthy();
    const beforeGold = save.gold;
    const result = completeOfficeMandate(save, option!.mandate.id, option!.route.id);
    expect(save.gold).toBe(beforeGold - option!.route.goldCost + result.reward.gold);
  });

  it('disables corrupt duplicate assignments instead of stacking bonuses', () => {
    const save = officeSave();
    save.flags['company-office:relic-curator:sera'] = true;
    save.flags['company-office:relic-curator:doran'] = true;
    const state = companyOfficeState(save);
    expect(state.assignments.some((entry) => entry.officeId === 'relic-curator')).toBe(false);
    expect(state.warnings.length).toBeGreaterThan(0);
    const agenda = officeMandateAgenda(save);
    expect(agenda.officeWarnings.length).toBeGreaterThan(0);
    const before = JSON.stringify(save);
    const option = agenda.mandates.flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.eligible);
    expect(() => completeOfficeMandate(save, option!.mandate.id, option!.route.id)).toThrow();
    expect(JSON.stringify(save)).toBe(before);
  });
});
