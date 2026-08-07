import { describe, expect, it } from 'vitest';
import { createRng } from '../rng';
import { createProtagonist, newGame, type CompanionRecord, type SaveData } from '../save';
import {
  applyEnduranceCamp,
  beginEnduranceBattle,
  createEnduranceRun,
  enduranceCampOptions,
  finishEnduranceBattle,
  isEnduranceRun,
} from './enduranceArmory';

function member(job: CompanionRecord['job'], id: string): CompanionRecord {
  const record = createProtagonist({ job });
  record.id = id;
  record.name = id;
  record.level = 4;
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
  const data = newGame(43001, { job: 'swordsman' });
  data.protagonist = member('swordsman', 'protagonist');
  const ranger = member('ranger', 'ranger');
  const mage = member('mage', 'mage');
  const cleric = member('cleric', 'cleric');
  data.companions = [ranger, mage, cleric];
  data.protagonist.equipment = { weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: 'den-idol' };
  ranger.equipment = { weapon: 'ridge-mist-bow', armor: 'ridgeleather-vest', trinket: null };
  mage.equipment = { weapon: 'ghostflame-staff', armor: 'ashveil-robe', trinket: 'saltglass-talisman' };
  cleric.equipment = { weapon: 'brine-blessed-mace', armor: 'brinewarded-vestment', trinket: null };
  data.reputation = 40;
  data.flags['world-quest:ashen-reliquary:completed'] = true;
  data.inventory = { ...data.inventory, 'dried-rations': 5, herb: 5 };
  data.expeditionPlan = {
    activeIds: ['protagonist', 'ranger', 'mage', 'cleric'],
    positions: { protagonist: 'front', ranger: 'back', mage: 'back', cleric: 'front' },
    roles: { captain: 'protagonist', scout: 'ranger', medic: 'cleric' },
  };
  return data;
}

function reachCamp(data: SaveData) {
  const run = createEnduranceRun(data);
  const combat = beginEnduranceBattle(run, data, createRng(430));
  for (const partyMember of combat.party) partyMember.hp = Math.max(1, Math.floor(partyMember.maxHp / 2));
  combat.outcome = 'victory';
  finishEnduranceBattle(run, combat);
  return run;
}

describe('M43 armory-aware endurance', () => {
  it('requires a strict armory snapshot and rejects plain M42 runs', () => {
    const data = save();
    const run = createEnduranceRun(data);
    console.log(`[M43 ENDURANCE] snapshot valid=${isEnduranceRun(run)} burden=${run.partyBurden}/${run.partyCapacity} overload=${run.partyOverload}`);
    expect(isEnduranceRun(run)).toBe(true);
    const plain = { ...run } as Record<string, unknown>;
    delete plain.armoryVersion;
    expect(isEnduranceRun(plain)).toBe(false);
  });

  it('snapshots personal and party load at departure', () => {
    const run = createEnduranceRun(save());
    console.log(`[M43 ENDURANCE] members=${Object.entries(run.armory).map(([id, profile]) => `${id}:${profile.burden}/${profile.capacity}+${profile.overload}`).join(', ')}`);
    expect(run.partyBurden).toBeGreaterThan(0);
    expect(run.partyCapacity).toBeGreaterThan(0);
    expect(run.armory.protagonist.burden).toBeGreaterThan(run.armory.mage.burden);
    expect(run.partyOverload).toBe(0);
  });

  it('makes camp recovery less efficient for heavier members without making rest useless', () => {
    const data = save();
    const run = reachCamp(data);
    const heavyBefore = run.members.protagonist.hp;
    const lightBefore = run.members.mage.hp;
    applyEnduranceCamp(run, data, 'ration-rest');
    const heavyGainRatio = (run.members.protagonist.hp - heavyBefore) / run.members.protagonist.maxHp;
    const lightGainRatio = (run.members.mage.hp - lightBefore) / run.members.mage.maxHp;
    console.log(`[M43 ENDURANCE] rest heavy=${heavyBefore}->${run.members.protagonist.hp}/${run.members.protagonist.maxHp} (${heavyGainRatio.toFixed(3)}), light=${lightBefore}->${run.members.mage.hp}/${run.members.mage.maxHp} (${lightGainRatio.toFixed(3)})`);
    expect(heavyGainRatio).toBeGreaterThan(0.15);
    expect(lightGainRatio).toBeGreaterThan(heavyGainRatio);
  });

  it('turns forced march into an immediate load-dependent cost before future enemy pressure', () => {
    const data = save();
    const run = reachCamp(data);
    const heavyBefore = run.members.protagonist.hp;
    const lightBefore = run.members.mage.hp;
    const heavyMax = run.members.protagonist.maxHp;
    const lightMax = run.members.mage.maxHp;
    applyEnduranceCamp(run, data, 'forced-march');
    const heavyLossRatio = (heavyBefore - run.members.protagonist.hp) / heavyMax;
    const lightLossRatio = (lightBefore - run.members.mage.hp) / lightMax;
    console.log(`[M43 ENDURANCE] march heavy=${heavyBefore}->${run.members.protagonist.hp}/${heavyMax} (${heavyLossRatio.toFixed(3)}), light=${lightBefore}->${run.members.mage.hp}/${lightMax} (${lightLossRatio.toFixed(3)}), strain=${run.members.mage.mystic?.strain ?? 0}`);
    expect(heavyLossRatio).toBeGreaterThan(lightLossRatio);
    expect(run.forcedMarches).toBe(1);
    expect(run.phase).toBe('battle');
    const next = beginEnduranceBattle(run, data, createRng(431));
    expect(next.enemies.every((enemy) => enemy.statuses?.some((status) => status.kind === 'strength' && status.potency === 1))).toBe(true);
  });

  it('surfaces the burden consequence in every camp option', () => {
    const data = save();
    const run = reachCamp(data);
    const descriptions = enduranceCampOptions(run, data).map((option) => option.description).join('\n');
    console.log(`[M43 ENDURANCE] camp descriptions=${descriptions}`);
    expect(descriptions).toContain('負重');
    expect(descriptions).toContain('重裝');
    expect(descriptions).toContain('強行軍疲勞');
  });

  it('does not allow a second camp action in the same stage', () => {
    const data = save();
    const run = reachCamp(data);
    applyEnduranceCamp(run, data, 'ration-rest');
    expect(() => applyEnduranceCamp(run, data, 'forced-march')).toThrow('目前不能進行營地選擇');
  });
});
