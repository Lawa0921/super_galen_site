import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { createProtagonist, newGame, type CompanionRecord, type SaveData } from '../save';
import {
  applyEnduranceCamp,
  beginEnduranceBattle,
  checkpointEnduranceBattle,
  claimEnduranceReward,
  createEnduranceRun,
  enduranceAccess,
  enduranceCampOptions,
  enduranceReceiptForMarket,
  enduranceReward,
  finishEnduranceBattle,
  isEnduranceRun,
} from './endurance';

function member(job: CompanionRecord['job'], id: string, name: string): CompanionRecord {
  const record = createProtagonist({ job });
  record.id = id;
  record.name = name;
  record.level = 4;
  record.xp = 999;
  record.injuredForTrips = 0;
  record.stats = job === 'swordsman'
    ? { str: 18, dex: 12, int: 9, cha: 11, con: 17 }
    : job === 'ranger'
      ? { str: 11, dex: 18, int: 11, cha: 11, con: 13 }
      : job === 'mage'
        ? { str: 8, dex: 12, int: 19, cha: 11, con: 11 }
        : { str: 11, dex: 9, int: 13, cha: 19, con: 15 };
  record.maxHp = job === 'swordsman' ? 34 : job === 'cleric' ? 29 : job === 'ranger' ? 26 : 23;
  record.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  return record;
}

function save(): SaveData {
  const data = newGame(42001, { job: 'swordsman' });
  data.protagonist = member('swordsman', 'protagonist', '隊長');
  data.companions = [
    member('ranger', 'ranger', '長弓'),
    member('mage', 'mage', '灰袍'),
    member('cleric', 'cleric', '白燭'),
  ];
  data.reputation = 40;
  data.flags['world-quest:ashen-reliquary:completed'] = true;
  data.inventory = {
    ...data.inventory,
    'dried-rations': 5,
    herb: 5,
    bandage: 5,
  };
  data.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'mage', 'cleric'],
    positions: { protagonist: 'front', ranger: 'back', mage: 'back', cleric: 'front' },
    roles: { captain: 'protagonist', scout: 'ranger', medic: 'cleric' },
  };
  return data;
}

describe('M42 expedition endurance', () => {
  it('requires the world quest, reputation, a healthy captain, and three healthy members', () => {
    const data = save();
    delete data.flags['world-quest:ashen-reliquary:completed'];
    expect(enduranceAccess(data).allowed).toBe(false);
    data.flags['world-quest:ashen-reliquary:completed'] = true;
    data.reputation = 19;
    expect(enduranceAccess(data).allowed).toBe(false);
    data.reputation = 40;
    data.protagonist.injuredForTrips = 1;
    expect(enduranceAccess(data).allowed).toBe(false);
    data.protagonist.injuredForTrips = 0;
    data.companions[0].injuredForTrips = 2;
    data.companions[1].injuredForTrips = 2;
    expect(enduranceAccess(data).allowed).toBe(false);
  });

  it('rejects legacy, partial, and corrupted run shapes instead of migrating them', () => {
    expect(isEnduranceRun({ version: 1 })).toBe(false);
    expect(isEnduranceRun({ version: 2, stage: 1 })).toBe(false);
    const data = save();
    const run = createEnduranceRun(data);
    expect(isEnduranceRun(run)).toBe(true);
    run.members.protagonist.hp = -1;
    expect(isEnduranceRun(run)).toBe(false);
  });

  it('carries HP, mana, favor, and strain into the next battle', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const first = beginEnduranceBattle(run, data, createRng(101));
    const mage = first.party.find((entry) => entry.id === 'mage')!;
    const cleric = first.party.find((entry) => entry.id === 'cleric')!;
    mage.hp = 9;
    mage.mystic!.current = 1;
    mage.mystic!.strain = 2;
    cleric.hp = 14;
    cleric.mystic!.current = 3;
    first.outcome = 'victory';
    finishEnduranceBattle(run, first);
    expect(run.phase).toBe('camp');

    applyEnduranceCamp(run, data, 'forced-march');
    const second = beginEnduranceBattle(run, data, createRng(102));
    const nextMage = second.party.find((entry) => entry.id === 'mage')!;
    const nextCleric = second.party.find((entry) => entry.id === 'cleric')!;
    expect(nextMage.hp).toBe(9);
    expect(nextMage.mystic).toMatchObject({ kind: 'mana', current: 1, strain: 2 });
    expect(nextCleric.hp).toBe(14);
    expect(nextCleric.mystic).toMatchObject({ kind: 'favor', current: 3 });
  });

  it('keeps a downed member out for the remainder of the pilgrimage', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const first = beginEnduranceBattle(run, data, createRng(151));
    first.party.find((entry) => entry.id === 'ranger')!.hp = 0;
    first.outcome = 'victory';
    finishEnduranceBattle(run, first);
    expect(run.members.ranger.hp).toBe(0);
    applyEnduranceCamp(run, data, 'ration-rest');
    expect(run.members.ranger.hp).toBe(0);
    const second = beginEnduranceBattle(run, data, createRng(152));
    expect(second.party.some((entry) => entry.id === 'ranger')).toBe(false);
  });

  it('ration rest consumes one ration and restores living endurance resources', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const combat = beginEnduranceBattle(run, data, createRng(201));
    for (const partyMember of combat.party) {
      partyMember.hp = Math.max(1, Math.floor(partyMember.maxHp / 2));
      if (partyMember.mystic) {
        partyMember.mystic.current = 0;
        partyMember.mystic.strain = partyMember.mystic.kind === 'mana' ? 2 : 0;
      }
    }
    combat.outcome = 'victory';
    finishEnduranceBattle(run, combat);
    const before = data.inventory['dried-rations'];
    applyEnduranceCamp(run, data, 'ration-rest');
    expect(data.inventory['dried-rations']).toBe(before - 1);
    expect(Object.values(run.members).every((entry) => entry.hp > entry.maxHp / 2)).toBe(true);
    expect(run.members.mage.mystic).toMatchObject({ current: 2, strain: 1 });
    expect(run.members.cleric.mystic).toMatchObject({ current: 1 });
  });

  it('arcane and sacred vigils require the matching living caster and herb', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const combat = beginEnduranceBattle(run, data, createRng(301));
    combat.outcome = 'victory';
    finishEnduranceBattle(run, combat);
    expect(enduranceCampOptions(run, data).find((entry) => entry.id === 'arcane-vigil')?.eligible).toBe(true);
    expect(enduranceCampOptions(run, data).find((entry) => entry.id === 'sacred-vigil')?.eligible).toBe(true);
    run.members.mage.hp = 0;
    expect(enduranceCampOptions(run, data).find((entry) => entry.id === 'arcane-vigil')?.eligible).toBe(false);
    data.inventory.herb = 0;
    expect(enduranceCampOptions(run, data).find((entry) => entry.id === 'sacred-vigil')?.eligible).toBe(false);
  });

  it('forced march increases both enemy pressure and final reward', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const first = beginEnduranceBattle(run, data, createRng(401));
    first.outcome = 'victory';
    finishEnduranceBattle(run, first);
    applyEnduranceCamp(run, data, 'forced-march');
    const second = beginEnduranceBattle(run, data, createRng(402));
    expect(second.enemies.every((enemy) => enemy.statuses?.some((status) => status.kind === 'strength' && status.potency === 1))).toBe(true);
    expect(second.enemies[0].maxHp).toBeGreaterThan(34);

    second.outcome = 'victory';
    finishEnduranceBattle(run, second);
    applyEnduranceCamp(run, data, 'forced-march');
    const third = beginEnduranceBattle(run, data, createRng(403));
    third.outcome = 'victory';
    finishEnduranceBattle(run, third);
    expect(enduranceReward(run)).toMatchObject({ gold: 150, reputation: 10 });
  });

  it('checkpoints real losses before applying refresh fatigue', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const first = beginEnduranceBattle(run, data, createRng(501));
    const captain = first.party.find((entry) => entry.id === 'protagonist')!;
    const mage = first.party.find((entry) => entry.id === 'mage')!;
    captain.hp = 12;
    mage.hp = 8;
    mage.mystic!.current = 0;
    mage.mystic!.strain = 2;
    checkpointEnduranceBattle(run, first);

    const retry = beginEnduranceBattle(run, data, createRng(502));
    const retryCaptain = retry.party.find((entry) => entry.id === 'protagonist')!;
    const retryMage = retry.party.find((entry) => entry.id === 'mage')!;
    expect(run.abandonmentCount).toBe(1);
    expect(retryCaptain.hp).toBeLessThan(12);
    expect(retryMage.hp).toBeLessThan(8);
    expect(retryMage.mystic).toMatchObject({ current: 0, strain: 3 });
  });

  it('defeat ends the run and cannot enter camp', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const combat = beginEnduranceBattle(run, data, createRng(601));
    combat.outcome = 'defeat';
    finishEnduranceBattle(run, combat);
    expect(run.phase).toBe('defeat');
    expect(() => applyEnduranceCamp(run, data, 'forced-march')).toThrow('目前不能進行營地選擇');
  });

  it('allows one reward per market cycle and becomes replayable after the cycle advances', () => {
    const data = save();
    const run = createEnduranceRun(data);
    for (let stage = 1; stage <= 3; stage += 1) {
      const combat = beginEnduranceBattle(run, data, createRng(700 + stage));
      combat.outcome = 'victory';
      finishEnduranceBattle(run, combat);
      if (stage < 3) applyEnduranceCamp(run, data, 'ration-rest');
    }
    const goldBefore = data.gold;
    const reward = claimEnduranceReward(run, data);
    expect(data.gold).toBe(goldBefore + reward.gold);
    expect(data.flags[enduranceReceiptForMarket(run.marketSeed)]).toBe(true);
    expect(() => claimEnduranceReward(run, data)).toThrow('已領取');
    expect(() => createEnduranceRun(data)).toThrow('本市場週期');

    data.marketSeed += 1;
    const nextRun = createEnduranceRun(data);
    expect(nextRun.marketSeed).toBe(data.marketSeed);
  });

  it('invalidates a run when the market cycle changes mid-pilgrimage', () => {
    const data = save();
    const run = createEnduranceRun(data);
    data.marketSeed += 1;
    expect(() => beginEnduranceBattle(run, data, createRng(801))).toThrow('市場週期已變更');
  });
});
