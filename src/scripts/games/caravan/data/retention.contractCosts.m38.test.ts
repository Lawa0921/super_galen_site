import { describe, expect, it } from 'vitest';
import { newGame, type CompanionRecord } from '../save';
import { registerCompanionOrigin } from './companionOrigins';
import {
  companyRetentionState,
  retentionContractOffer,
  signRetentionContract,
  terminateRetentionContract,
} from './retention';

function veteran(): CompanionRecord {
  return {
    id: 'veteran',
    name: '資深旅伴',
    job: 'mage',
    level: 5,
    xp: 320,
    stats: { str: 10, dex: 12, int: 16, cha: 14, con: 12 },
    maxHp: 25,
    injuredForTrips: 0,
    trait: 'learned',
    equipment: { weapon: null, armor: null, trinket: null },
    bond: 5,
    skills: { lore: 5, negotiation: 4 },
  };
}

describe('M38 retention contract lifecycle costs', () => {
  it('charges amendment, termination, and restart costs without free switching', () => {
    const save = newGame(1400, { job: 'cleric', trait: 'charming', allocation: { cha: 3 } });
    save.gold = 500;
    save.reputation = 10;
    save.inventory['dried-rations'] = 20;
    save.companions = [veteran()];
    registerCompanionOrigin(save, 'veteran');

    const security = retentionContractOffer(save, 'veteran', 'security');
    expect(security.goldCost).toBe(40);
    expect(security.reputationCost).toBe(0);
    signRetentionContract(save, 'veteran', 'security');

    const amendment = retentionContractOffer(save, 'veteran', 'partnership');
    expect(amendment.goldCost).toBe(45);
    expect(amendment.reputationCost).toBe(2);
    signRetentionContract(save, 'veteran', 'partnership');
    expect(companyRetentionState(save).profiles[0].contract).toBe('partnership');

    const beforeTerminationGold = save.gold;
    const beforeTerminationReputation = save.reputation;
    terminateRetentionContract(save, 'veteran');
    expect(save.gold).toBe(beforeTerminationGold - 10);
    expect(save.reputation).toBe(beforeTerminationReputation - 1);

    const restart = retentionContractOffer(save, 'veteran', 'security');
    expect(restart.goldCost).toBe(50);
    expect(restart.reputationCost).toBe(0);
  });
});
