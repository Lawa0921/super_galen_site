import { describe, expect, it } from 'vitest';
import { advanceTurn, enemyAct, startCombat, type EnemyUnit } from '../combat';
import type { Rng } from '../rng';
import { createProtagonist, type CompanionRecord } from '../save';
import { armoryProfile } from './armory';
import {
  moveArmorPenetration,
  protectionProfileText,
  resolveProtectionDamage,
  type ProtectionProfile,
} from './armorProtection.m48';
import { memberFromRecord } from './jobs';

const fixedRng: Rng = {
  next: () => 0.99,
  roll: (sides) => sides,
  d20: () => 20,
  pick: <T>(items: readonly T[]) => items[0],
  weightedPick: <T>(items: ReadonlyArray<{ weight: number; value: T }>) => items[0].value,
};

function record(job: CompanionRecord['job'], armor: string | null): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = job;
  member.name = job;
  member.level = 4;
  member.stats = job === 'swordsman'
    ? { str: 17, dex: 12, int: 9, cha: 11, con: 17 }
    : job === 'ranger'
      ? { str: 11, dex: 18, int: 11, cha: 10, con: 13 }
      : job === 'mage'
        ? { str: 8, dex: 12, int: 19, cha: 11, con: 11 }
        : { str: 12, dex: 10, int: 13, cha: 18, con: 15 };
  member.skills = { martial: 3, scouting: 3, lore: 3, negotiation: 3, survival: 3 };
  member.equipment.armor = armor;
  return member;
}

function attacker(element: 'slash' | 'pierce' | 'blunt' | 'fire', moveId = `${element}-strike`): EnemyUnit {
  return {
    id: `attacker-${element}`,
    name: '試煉攻擊者',
    stats: { str: 20, dex: 10, int: 20, cha: 10, con: 10 },
    maxHp: 40,
    hp: 40,
    defense: 10,
    moves: [{
      id: moveId,
      name: '試煉攻擊',
      kind: 'attack',
      target: 'enemy',
      hitStat: element === 'fire' ? 'int' : 'str',
      element,
      damage: { dice: 1, sides: 10 },
      narration: '{actor}擊中{target}，造成 {amount} 點傷害。',
    }],
    intents: [{ weight: 1, moveId }],
  };
}

describe('M48 armor protection and penetration', () => {
  it('gives mastered mail a real anti-edge profile with blunt and fire exposure', () => {
    const profile = armoryProfile(record('swordsman', 'saltforged-mail'));
    expect(profile.armorFit).toBe('mastered');
    expect(profile.armorProtection?.multipliers).toMatchObject({
      slash: 0.7,
      pierce: 0.85,
      blunt: 1.2,
      fire: 1.1,
    });
    expect(protectionProfileText(profile.armorProtection)).toContain('斬擊 -30%');
    expect(protectionProfileText(profile.armorProtection)).toContain('鈍擊 +20%');
  });

  it('halves beneficial protection for strained armor without erasing its weaknesses', () => {
    const profile = armoryProfile(record('mage', 'saltforged-mail'));
    expect(profile.armorFit).toBe('strained');
    expect(profile.armorProtection?.multipliers.slash).toBeCloseTo(0.85);
    expect(profile.armorProtection?.multipliers.pierce).toBeCloseTo(0.925);
    expect(profile.armorProtection?.multipliers.blunt).toBe(1.2);
    expect(profile.armorProtection?.multipliers.fire).toBe(1.1);
    expect(profile.warnings.some((warning) => warning.includes('減傷抗性只能發揮一半'))).toBe(true);
  });

  it('reduces, exposes and explains incoming damage instead of hiding armor behind DEF only', () => {
    const mail = armoryProfile(record('swordsman', 'saltforged-mail')).armorProtection!;
    const slash = resolveProtectionDamage(20, mail, 'slash');
    const blunt = resolveProtectionDamage(20, mail, 'blunt');
    expect(slash.amount).toBe(14);
    expect(slash.mitigated).toBe(true);
    expect(slash.message).toContain('卸去了 6 點斬擊傷害');
    expect(blunt.amount).toBe(24);
    expect(blunt.exposed).toBe(true);
    expect(blunt.message).toContain('額外承受 4 點傷害');
  });

  it('makes the explicit armor-piercing arrow bypass mitigation but never cancel an armor weakness', () => {
    expect(moveArmorPenetration({ id: 'piercing-arrow' })).toBe(1);
    expect(moveArmorPenetration({ id: 'quick-shot' })).toBe(0);

    const mail = armoryProfile(record('swordsman', 'saltforged-mail')).armorProtection!;
    expect(resolveProtectionDamage(20, mail, 'pierce').amount).toBe(17);
    const bypassed = resolveProtectionDamage(20, mail, 'pierce', 1);
    expect(bypassed.amount).toBe(20);
    expect(bypassed.bypassed).toBe(true);
    expect(bypassed.message).toContain('穿甲效果');

    const leather = armoryProfile(record('ranger', 'ridgeleather-vest')).armorProtection!;
    const exposed = resolveProtectionDamage(20, leather, 'pierce', 1);
    expect(exposed.amount).toBe(22);
    expect(exposed.exposed).toBe(true);
  });

  it('keeps missing elements neutral and clamps pathological future profiles away from immunity or explosive damage', () => {
    const broken: ProtectionProfile = {
      source: '錯誤測試甲',
      multipliers: { slash: 0, blunt: 5 },
    };
    expect(resolveProtectionDamage(20, broken, 'slash').amount).toBe(10);
    expect(resolveProtectionDamage(20, broken, 'blunt').amount).toBe(30);
    expect(resolveProtectionDamage(20, broken, 'frost').amount).toBe(20);
    expect(resolveProtectionDamage(20, null, 'slash').amount).toBe(20);
    expect(resolveProtectionDamage(20, broken, undefined).amount).toBe(20);
  });

  it('applies the armor profile through the live enemyAct combat path', () => {
    const armored = memberFromRecord(record('swordsman', 'saltforged-mail'));
    armored.formationRow = 'front';
    const state = startCombat(fixedRng, [armored], [attacker('slash')]);
    const before = armored.hp;
    advanceTurn(state);
    enemyAct(fixedRng, state, state.enemies[0].id);
    expect(before - armored.hp).toBe(7);
    expect(state.log.some((entry) => entry.text.includes('鹽鍛鎖甲卸去了 3 點斬擊傷害'))).toBe(true);
  });

  it('leaves an unarmored live combatant on the original damage path', () => {
    const unarmored = memberFromRecord(record('swordsman', null));
    unarmored.formationRow = 'front';
    const state = startCombat(fixedRng, [unarmored], [attacker('slash')]);
    const before = unarmored.hp;
    advanceTurn(state);
    enemyAct(fixedRng, state, state.enemies[0].id);
    expect(before - unarmored.hp).toBe(10);
    expect(state.log.some((entry) => entry.text.includes('卸去了'))).toBe(false);
  });
});
