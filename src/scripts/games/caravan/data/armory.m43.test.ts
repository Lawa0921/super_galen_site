import { describe, expect, it } from 'vitest';
import { startCombat, type EnemyUnit } from '../combat';
import { createRng } from '../rng';
import { createProtagonist, newGame, type CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import {
  armoryProfile,
  equipArmoryItem,
  partyArmoryLoad,
  unequipArmoryItem,
} from './armory';

function record(job: CompanionRecord['job'], id = job): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = id;
  member.name = id;
  member.level = 4;
  member.stats = job === 'swordsman'
    ? { str: 17, dex: 12, int: 9, cha: 11, con: 17 }
    : job === 'ranger'
      ? { str: 11, dex: 18, int: 11, cha: 10, con: 13 }
      : job === 'mage'
        ? { str: 8, dex: 12, int: 19, cha: 11, con: 11 }
        : { str: 12, dex: 10, int: 13, cha: 18, con: 15 };
  member.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  return member;
}

function dummyEnemy(): EnemyUnit {
  return {
    id: 'dummy', name: '木樁', stats: { str: 10, dex: 10, int: 10, cha: 10, con: 10 },
    maxHp: 20, hp: 20, defense: 10,
    moves: [{ id: 'tap', name: '輕敲', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 2 }, narration: '{actor}敲擊{target}，造成 {amount} 點傷害。' }],
    intents: [{ weight: 1, moveId: 'tap' }],
  };
}

describe('M43 medieval armory doctrines', () => {
  it('keeps previews deterministic and read-only', () => {
    const mage = record('mage');
    mage.equipment.weapon = 'ghostflame-staff';
    mage.equipment.armor = 'ashveil-robe';
    const before = JSON.stringify(mage);
    expect(armoryProfile(mage)).toEqual(armoryProfile(mage));
    expect(JSON.stringify(mage)).toBe(before);
  });

  it('turns staff and robe into real arcane capacity instead of decorative stats', () => {
    const mage = record('mage');
    mage.equipment.weapon = 'ghostflame-staff';
    mage.equipment.armor = 'ashveil-robe';
    const profile = armoryProfile(mage);
    expect(profile.weaponFit).toBe('mastered');
    expect(profile.armorFit).toBe('mastered');
    expect(profile.mysticCapacity.mana).toBe(3);
    const combat = startCombat(createRng(43), [memberFromRecord(mage)], [dummyEnemy()]);
    // Both legacy equipment INT bonuses and the new staff/robe focus capacity intentionally compose.
    expect(combat.party[0].mystic).toMatchObject({ kind: 'mana', max: 11, current: 11 });
  });

  it('lets a mage wear mail but exposes steel interference and encumbrance', () => {
    const mage = record('mage');
    mage.equipment.weapon = 'salt-crystal-blade';
    mage.equipment.armor = 'saltforged-mail';
    const profile = armoryProfile(mage);
    expect(profile.weaponFit).toBe('trained');
    expect(profile.armorFit).toBe('strained');
    expect(profile.mysticCapacity.mana).toBeLessThan(0);
    expect(profile.statAdjustments.dex).toBeLessThan(0);
    expect(profile.warnings.some((warning) => warning.includes('鎖甲'))).toBe(true);
    const combat = startCombat(createRng(44), [memberFromRecord(mage)], [dummyEnemy()]);
    expect(combat.party[0].mystic!.max).toBeLessThan(7);
    expect(combat.party[0].defense).toBeGreaterThan(11);
  });

  it('makes mastered weapon moves more accurate and strained weapons costly but usable', () => {
    const swordsman = record('swordsman');
    swordsman.equipment.weapon = 'salt-crystal-blade';
    const mastered = memberFromRecord(swordsman).moves
      .find((move) => move.id === 'crystal-shatter-slash')!;
    expect(mastered.hitBonus).toBe(1);

    const ranger = record('ranger');
    ranger.equipment.weapon = 'ghostflame-staff';
    const strained = memberFromRecord(ranger).moves.find((move) => move.id === 'soulfire-burst')!;
    expect(strained.hitBonus).toBe(-2);
    expect(armoryProfile(ranger).damageAdjustment).toBe(-1);
  });

  it('recognizes martial-cleric specialization without forcing all clerics into robes', () => {
    const cleric = record('cleric');
    cleric.specialization = 'inquisitor';
    cleric.equipment.weapon = 'brine-blessed-mace';
    cleric.equipment.armor = 'saltforged-mail';
    const profile = armoryProfile(cleric);
    expect(profile.weaponFit).toBe('mastered');
    expect(profile.armorFit).toBe('mastered');
    expect(profile.mysticCapacity.favor).toBe(1);
    expect(profile.warnings.some((warning) => warning.includes('護甲版型'))).toBe(false);
  });

  it('revalidates inventory and swaps equipment atomically', () => {
    const save = newGame(4301, { job: 'swordsman' });
    save.protagonist.level = 4;
    save.inventory['salt-crystal-blade'] = 1;
    save.inventory['ancient-king-blade'] = 1;
    equipArmoryItem(save, 'protagonist', 'salt-crystal-blade');
    expect(save.protagonist.equipment.weapon).toBe('salt-crystal-blade');
    expect(save.inventory['salt-crystal-blade']).toBeUndefined();
    equipArmoryItem(save, 'protagonist', 'ancient-king-blade');
    expect(save.protagonist.equipment.weapon).toBe('ancient-king-blade');
    expect(save.inventory['salt-crystal-blade']).toBe(1);
    expect(() => equipArmoryItem(save, 'protagonist', 'ghostflame-staff')).toThrow('背包中沒有');
    unequipArmoryItem(save, 'protagonist', 'weapon');
    expect(save.inventory['ancient-king-blade']).toBe(1);
  });

  it('aggregates party burden and preserves multiple viable load identities', () => {
    const save = newGame(4302, { job: 'swordsman' });
    save.protagonist = record('swordsman', 'protagonist');
    const ranger = record('ranger', 'ranger');
    const mage = record('mage', 'mage');
    const cleric = record('cleric', 'cleric');
    save.companions = [ranger, mage, cleric];
    save.protagonist.equipment = { weapon: 'salt-crystal-blade', armor: 'saltforged-mail', trinket: null };
    ranger.equipment = { weapon: 'ridge-mist-bow', armor: 'ridgeleather-vest', trinket: null };
    mage.equipment = { weapon: 'ghostflame-staff', armor: 'ashveil-robe', trinket: 'saltglass-talisman' };
    cleric.equipment = { weapon: 'brine-blessed-mace', armor: 'brinewarded-vestment', trinket: null };
    const load = partyArmoryLoad(save);
    const profiles = Object.values(load.members);
    expect(load.burden).toBeGreaterThan(0);
    expect(load.capacity).toBeGreaterThan(load.burden);
    expect(load.overload).toBe(0);
    expect(profiles.every((profile) => profile.weaponFit === 'mastered' && profile.armorFit === 'mastered')).toBe(true);
    expect(new Set(profiles.map((profile) => profile.burden)).size).toBeGreaterThanOrEqual(3);
    expect(profiles.filter((profile) => profile.mysticCapacity.mana > 0)).toHaveLength(1);
    expect(profiles.filter((profile) => profile.mysticCapacity.favor > 0)).toHaveLength(1);
  });
});
