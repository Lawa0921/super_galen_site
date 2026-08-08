import { describe, expect, it } from 'vitest';
import type { Element, Move } from '../combat';
import { createProtagonist, type CompanionRecord } from '../save';
import { armoryProfile } from './armory';
import { armorProtectionForDiscipline, resolveArmorMitigation, type ArmorProfileId } from './armorProfiles.m48';
import { memberFromRecord } from './jobs';

const DAMAGE = 10;

function mundane(element: Element, armorPiercing = 0): Move {
  return {
    id: `mundane-${element}-${armorPiercing}`,
    name: '威脅', kind: 'attack', target: 'enemy', hitStat: 'str', element, armorPiercing,
    damage: { dice: 1, sides: DAMAGE }, narration: '',
  };
}

function magical(element: Element): Move {
  return {
    id: element === 'holy' ? 'holy-strike' : element === 'fire' ? 'fireball' : 'ice-spike',
    name: '魔法威脅', kind: 'attack', target: 'enemy', hitStat: element === 'holy' ? 'cha' : 'int', element,
    damage: { dice: 1, sides: DAMAGE }, narration: '',
  };
}

function damageAfter(profile: ArmorProfileId, move: Move, isMagical: boolean): number {
  const mitigation = resolveArmorMitigation(armorProtectionForDiscipline(profile), move, isMagical);
  return Math.max(1, DAMAGE - mitigation.reduction);
}

function threatVector(profile: ArmorProfileId) {
  return {
    steel: damageAfter(profile, mundane('slash'), false) + damageAfter(profile, mundane('pierce'), false),
    blunt: damageAfter(profile, mundane('blunt'), false),
    arcane: damageAfter(profile, magical('fire'), true) + damageAfter(profile, magical('frost'), true),
    divine: damageAfter(profile, magical('holy'), true),
    piercing: damageAfter(profile, mundane('pierce', 2), false),
  };
}

function record(job: CompanionRecord['job'], armor: string): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = `${job}-${armor}`;
  member.name = member.id;
  member.level = 4;
  member.equipment.armor = armor;
  return member;
}

function tradeoff(job: CompanionRecord['job'], lightArmor: string, heavyArmor: string) {
  const lightRecord = record(job, lightArmor);
  const heavyRecord = record(job, heavyArmor);
  const lightProfile = armoryProfile(lightRecord);
  const heavyProfile = armoryProfile(heavyRecord);
  const lightMember = memberFromRecord(lightRecord);
  const heavyMember = memberFromRecord(heavyRecord);
  return { lightRecord, heavyRecord, lightProfile, heavyProfile, lightMember, heavyMember };
}

describe('M48 player-perspective multidimensional armor review', () => {
  it('makes material matchups readable without one armor winning every incoming threat', () => {
    const vectors = {
      light: threatVector('light'),
      mail: threatVector('mail'),
      robe: threatVector('robe'),
      vestment: threatVector('vestment'),
    };
    console.log('[M48 ARMOR THREATS]', vectors);

    expect(vectors.mail.steel).toBeLessThan(vectors.light.steel);
    expect(vectors.mail.blunt).toBe(vectors.light.blunt);
    expect(vectors.robe.arcane).toBeLessThan(vectors.mail.arcane);
    expect(vectors.vestment.divine).toBeLessThan(vectors.mail.divine);
    expect(vectors.mail.piercing).toBe(DAMAGE);
  });

  it('keeps ranger light armor and mail on a real protection-versus-mobility frontier', () => {
    const { lightProfile, heavyProfile, lightMember, heavyMember } = tradeoff('ranger', 'ridgeleather-vest', 'saltforged-mail');
    const lightSteel = threatVector('light').steel;
    const mailSteel = threatVector('mail').steel;
    console.log(`[M48 RANGER] light steel=${lightSteel} burden=${lightProfile.burden} dex=${lightMember.stats.dex}; mail steel=${mailSteel} burden=${heavyProfile.burden} dex=${heavyMember.stats.dex}`);
    expect(mailSteel).toBeLessThan(lightSteel);
    expect(lightProfile.burden).toBeLessThan(heavyProfile.burden);
    expect(lightMember.stats.dex).toBeGreaterThan(heavyMember.stats.dex);
  });

  it('keeps mage robe and mail on a survival-versus-spell-capacity frontier', () => {
    const { lightProfile: robe, heavyProfile: mail, lightMember: robeMage, heavyMember: mailMage } = tradeoff('mage', 'ashveil-robe', 'saltforged-mail');
    console.log(`[M48 MAGE] robe arcane=${threatVector('robe').arcane} manaBonus=${robe.mysticCapacity.mana} burden=${robe.burden}; mail steel=${threatVector('mail').steel} manaBonus=${mail.mysticCapacity.mana} burden=${mail.burden}`);
    expect(threatVector('mail').steel).toBeLessThan(threatVector('robe').steel);
    expect(threatVector('robe').arcane).toBeLessThan(threatVector('mail').arcane);
    expect(robe.mysticCapacity.mana).toBeGreaterThan(mail.mysticCapacity.mana);
    expect(robeMage.stats.dex).toBeGreaterThan(mailMage.stats.dex);
  });

  it('keeps cleric vestment and mail on a divine-capacity-versus-steel frontier', () => {
    const { lightProfile: vestment, heavyProfile: mail } = tradeoff('cleric', 'brinewarded-vestment', 'saltforged-mail');
    console.log(`[M48 CLERIC] vestment holy=${threatVector('vestment').divine} favorBonus=${vestment.mysticCapacity.favor}; mail steel=${threatVector('mail').steel} favorBonus=${mail.mysticCapacity.favor}`);
    expect(threatVector('mail').steel).toBeLessThan(threatVector('vestment').steel);
    expect(threatVector('vestment').divine).toBeLessThan(threatVector('mail').divine);
    expect(vestment.mysticCapacity.favor).toBeGreaterThan(mail.mysticCapacity.favor);
  });

  it('keeps swordsman mail meaningful without making light armor a trap', () => {
    const { lightProfile, heavyProfile, lightMember, heavyMember } = tradeoff('swordsman', 'ridgeleather-vest', 'saltforged-mail');
    console.log(`[M48 SWORDSMAN] light burden=${lightProfile.burden} dex=${lightMember.stats.dex}; mail burden=${heavyProfile.burden} dex=${heavyMember.stats.dex}`);
    expect(threatVector('mail').steel).toBeLessThan(threatVector('light').steel);
    expect(lightProfile.burden).toBeLessThan(heavyProfile.burden);
    expect(lightMember.stats.dex).toBeGreaterThan(heavyMember.stats.dex);
  });
});
