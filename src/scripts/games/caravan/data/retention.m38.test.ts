import { describe, expect, it } from 'vitest';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import { registerCompanionOrigin } from './companionOrigins';
import { riskMandateAgenda } from './riskMandates';
import {
  companyRetentionState,
  retentionContractOffer,
  signRetentionContract,
  terminateRetentionContract,
} from './retention';
import { completeRetentionMandate, retentionMandateAgenda } from './retentionMandates';

function companion(id: string, index: number): CompanionRecord {
  return {
    id,
    name: `旅伴${index}`,
    job: index % 2 === 0 ? 'ranger' : 'mage',
    level: 5,
    xp: 320,
    stats: { str: 12, dex: 15, int: 15, cha: 14, con: 12 },
    maxHp: 26,
    injuredForTrips: 0,
    trait: index % 2 === 0 ? 'nimble' : 'learned',
    equipment: { weapon: null, armor: null, trinket: null },
    bond: 5,
    skills: { martial: 2, scouting: 4, lore: 4, negotiation: 4, survival: 2 },
  };
}

function preparedSave(count = 1): SaveData {
  const save = newGame(900, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
  save.marketSeed = 9300;
  save.gold = 2000;
  save.reputation = 30;
  save.wagonLevel = 5;
  save.inventory['dried-rations'] = 50;
  save.protagonist.stats = { str: 30, dex: 30, int: 30, cha: 30, con: 30 };
  save.protagonist.skills = { martial: 5, scouting: 5, lore: 5, negotiation: 5, survival: 5 };
  save.protagonist.growth = { potential: { str: 5, dex: 5, int: 5, cha: 5, con: 5 } } as never;
  save.companions = Array.from({ length: count }, (_, index) => companion(`c${index + 1}`, index + 1));
  for (const member of save.companions) registerCompanionOrigin(save, member.id);
  return save;
}

function seedWithDomain(save: SaveData, domain: string): void {
  for (let seed = 9300; seed < 9350; seed++) {
    save.marketSeed = seed;
    if (riskMandateAgenda(save).mandates.some((mandate) => mandate.domain === domain)) return;
  }
  throw new Error(`找不到包含 ${domain} 的測試週期`);
}

describe('M38 companion retention', () => {
  it('keeps M37 exact when there are no contracts or disputes', () => {
    const save = preparedSave(0);
    expect(retentionMandateAgenda(save).mandates).toEqual(riskMandateAgenda(save).mandates);
  });

  it('derives deterministic aspiration and transparent satisfaction without mutation', () => {
    const save = preparedSave(1);
    save.companions[0].careerMilestones = [{ level: 2, pathId: 'negotiation', score: 12 }];
    const before = JSON.stringify(save);
    const first = companyRetentionState(save);
    const second = companyRetentionState(save);
    expect(first).toEqual(second);
    expect(first.profiles[0].aspiration).toBe('trade');
    expect(first.profiles[0].factors.some((factor) => factor.id === 'baseline')).toBe(true);
    expect(first.dispute).toBeNull();
    expect(JSON.stringify(save)).toBe(before);
  });

  it('makes security and autonomy contracts produce real recurring tradeoffs', () => {
    const securitySave = preparedSave(1);
    const beforeSecurity = riskMandateAgenda(securitySave);
    const offer = retentionContractOffer(securitySave, 'c1', 'security');
    expect(offer.eligible).toBe(true);
    signRetentionContract(securitySave, 'c1', 'security');
    const secured = retentionMandateAgenda(securitySave);
    expect(secured.mandates.every((mandate, index) =>
      mandate.reward.gold === Math.max(0, beforeSecurity.mandates[index].reward.gold - 3)
    )).toBe(true);

    const autonomySave = preparedSave(1);
    autonomySave.companions[0].careerMilestones = [{ level: 2, pathId: 'scouting', score: 12 }];
    autonomySave.companions[0].bond = 2;
    seedWithDomain(autonomySave, 'frontier');
    expect(retentionContractOffer(autonomySave, 'c1', 'autonomy').eligible).toBe(true);
    signRetentionContract(autonomySave, 'c1', 'autonomy');
    const base = riskMandateAgenda(autonomySave).mandates.find((mandate) => mandate.domain === 'frontier')!;
    const adjusted = retentionMandateAgenda(autonomySave).mandates.find((mandate) => mandate.domain === 'frontier')!;
    const baseField = base.routes.find((route) => route.id === 'field')!;
    const adjustedField = adjusted.routes.find((route) => route.id === 'field')!;
    expect(adjustedField.score).toBe(baseField.score + 1);
    expect(adjustedField.inventoryCost['dried-rations']).toBe((baseField.inventoryCost['dried-rations'] ?? 0) + 1);
  });

  it('settles partnership share and bond exactly once through the real mandate path', () => {
    const save = preparedSave(1);
    save.companions[0].careerMilestones = [{ level: 2, pathId: 'negotiation', score: 12 }];
    save.companions[0].bond = 5;
    signRetentionContract(save, 'c1', 'partnership');
    const agenda = retentionMandateAgenda(save);
    const base = riskMandateAgenda(save);
    expect(agenda.mandates.every((mandate, index) =>
      mandate.reward.gold === Math.floor(base.mandates[index].reward.gold * 0.9)
    )).toBe(true);
    const option = agenda.mandates.flatMap((mandate) =>
      mandate.routes.map((route) => ({ mandate, route }))
    ).find(({ route }) => route.eligible)!;
    const beforeGold = save.gold;
    const beforeBond = save.companions[0].bond!;
    const result = completeRetentionMandate(save, option.mandate.id, option.route.id);
    expect(save.gold).toBe(beforeGold - option.route.goldCost + result.reward.gold);
    expect(save.companions[0].bond).toBe(beforeBond + result.reward.bondAll + 1);
    expect(result.partnershipBondIds).toEqual(['c1']);
    const snapshot = JSON.stringify(save);
    expect(() => completeRetentionMandate(save, option.mandate.id, option.route.id)).toThrow();
    expect(JSON.stringify(save)).toBe(snapshot);
  });

  it('enforces contract caps, blocks corrupt duplicates, and revalidates stale resources', () => {
    const save = preparedSave(4);
    for (const id of ['c1', 'c2', 'c3']) signRetentionContract(save, id, 'security');
    expect(retentionContractOffer(save, 'c4', 'security').eligible).toBe(false);

    const stale = preparedSave(1);
    stale.companions[0].bond = 5;
    const offer = retentionContractOffer(stale, 'c1', 'partnership');
    expect(offer.eligible).toBe(true);
    stale.gold = offer.goldCost - 1;
    const snapshot = JSON.stringify(stale);
    expect(() => signRetentionContract(stale, 'c1', 'partnership')).toThrow();
    expect(JSON.stringify(stale)).toBe(snapshot);

    save.flags['company-retention:c1:partnership'] = true;
    const corrupt = companyRetentionState(save);
    expect(corrupt.warnings.length).toBeGreaterThan(0);
    const agenda = retentionMandateAgenda(save);
    const option = agenda.mandates.flatMap((mandate) => mandate.routes.map((route) => ({ mandate, route })))
      .find(({ route }) => route.eligible);
    if (option) {
      const before = JSON.stringify(save);
      expect(() => completeRetentionMandate(save, option.mandate.id, option.route.id)).toThrow();
      expect(JSON.stringify(save)).toBe(before);
    }
  });

  it('creates a visible retention dispute and makes contract termination costly', () => {
    const save = preparedSave(1);
    const member = save.companions[0];
    member.careerMilestones = [{ level: 2, pathId: 'negotiation', score: 12 }];
    member.trait = 'greedy';
    member.genesis = undefined;
    member.growth = undefined;
    member.injuredForTrips = 1;
    member.bond = 0;
    save.flags['company-constitution:martial-priority'] = true;
    seedWithDomain(save, 'trade');
    const state = companyRetentionState(save);
    expect(state.dispute?.memberId).toBe('c1');
    expect(state.dispute?.disputeSeverity).toBeGreaterThan(0);
    const base = riskMandateAgenda(save);
    const adjusted = retentionMandateAgenda(save);
    expect(adjusted.mandates.every((mandate, index) =>
      mandate.reward.gold <= base.mandates[index].reward.gold
    )).toBe(true);
    const baseTrade = base.mandates.find((mandate) => mandate.domain === 'trade')!;
    const adjustedTrade = adjusted.mandates.find((mandate) => mandate.domain === 'trade')!;
    expect(adjustedTrade.routes.find((route) => route.id === 'field')!.threshold)
      .toBeGreaterThan(baseTrade.routes.find((route) => route.id === 'field')!.threshold);

    const contractSave = preparedSave(1);
    signRetentionContract(contractSave, 'c1', 'security');
    const beforeGold = contractSave.gold;
    const beforeReputation = contractSave.reputation;
    terminateRetentionContract(contractSave, 'c1');
    expect(contractSave.gold).toBe(beforeGold - 10);
    expect(contractSave.reputation).toBe(beforeReputation - 1);
    expect(companyRetentionState(contractSave).profiles[0].contract).toBeNull();
  });
});
