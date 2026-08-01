import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { createProtagonist, newGame, type CompanionRecord, type SaveData } from '../save';
import {
  ENDURANCE_RECEIPT,
  applyEnduranceCamp,
  beginEnduranceBattle,
  claimEnduranceReward,
  createEnduranceRun,
  enduranceAccess,
  enduranceCampOptions,
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
  it('requires reputation and at least three healthy members', () => {
    const data = save();
    data.reputation = 19;
    expect(enduranceAccess(data).allowed).toBe(false);
    data.reputation = 40;
    data.companions[0].injuredForTrips = 2;
    data.companions[1].injuredForTrips = 2;
    expect(enduranceAccess(data).allowed).toBe(false);
  });

  it('does not accept legacy or partial run shapes', () => {
    expect(isEnduranceRun({ version: 0 })).toBe(false);
    expect(isEnduranceRun({ version: 1, stage: 1 })).toBe(false);
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

  it('ration rest consumes one ration and restores all endurance resources', () => {
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
    const mage = run.members.mage.mystic!;
    const cleric = run.members.cleric.mystic!;
    expect(mage.current).toBe(2);
    expect(mage.strain).toBe(1);
    expect(cleric.current).toBe(1);
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

  it('refreshing an open battle causes fatigue instead of a free reroll', () => {
    const data = save();
    const run = createEnduranceRun(data);
    const first = beginEnduranceBattle(run, data, createRng(501));
    const originalHp = first.party.map((entry) => entry.maxHp);
    const retry = beginEnduranceBattle(run, data, createRng(502));
    expect(run.abandonmentCount).toBe(1);
    expect(retry.party.every((entry, index) => entry.hp < originalHp[index])).toBe(true);
    expect(retry.party.find((entry) => entry.id === 'mage')?.mystic?.strain).toBe(1);
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

  it('victory reward is atomic and can only be claimed once', () => {
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
    expect(data.flags[ENDURANCE_RECEIPT]).toBe(true);
    expect(() => claimEnduranceReward(run, data)).toThrow('已領取');
  });
});
