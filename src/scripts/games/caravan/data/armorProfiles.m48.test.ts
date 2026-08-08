import { describe, expect, it } from 'vitest';
import { partyAct, startCombat, type EnemyUnit, type Move, type PartyMember } from '../combat';
import type { Rng } from '../rng';
import { createProtagonist, type CompanionRecord } from '../save';
import { armoryProfile } from './armory';
import {
  armorProtectionForDiscipline,
  armorProtectionText,
  resolveArmorMitigation,
} from './armorProfiles.m48';
import { createReliquaryEncounter } from './ashenReliquaryCombat';
import { createConvoyDefenseEncounter } from './convoyDefense.m46';
import { memberFromRecord } from './jobs';

const fixedRng: Rng = {
  next: () => 0.5,
  roll: (sides) => sides,
  d20: () => 20,
  pick: (items) => items[0],
  weightedPick: (items) => items[0].value,
};

function record(job: CompanionRecord['job'], armor: string | null): CompanionRecord {
  const member = createProtagonist({ job });
  member.id = `${job}-${armor ?? 'none'}`;
  member.name = member.id;
  member.level = 4;
  member.equipment.armor = armor;
  return member;
}

function attacker(move: Move): PartyMember {
  return {
    id: 'attacker', name: '測試攻擊者',
    stats: { str: 10, dex: 10, int: 16, cha: 16, con: 10 },
    maxHp: 40, hp: 40, defense: 10,
    moves: [move],
  };
}

function armoredEnemy(profile: 'light' | 'mail' | 'robe' | 'vestment'): EnemyUnit {
  return {
    id: 'armored-target', name: '護甲標靶',
    stats: { str: 10, dex: 10, int: 10, cha: 10, con: 10 },
    maxHp: 40, hp: 40, defense: 1,
    armorProtection: armorProtectionForDiscipline(profile),
    moves: [{
      id: 'tap', name: '輕敲', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 2 }, narration: '{actor}敲擊{target}，造成 {amount} 點傷害。',
    }],
    intents: [{ weight: 1, moveId: 'tap' }],
  };
}

function hit(move: Move, profile: 'light' | 'mail' | 'robe' | 'vestment'): { damage: number; log: string } {
  const target = armoredEnemy(profile);
  const state = startCombat(fixedRng, [attacker(move)], [target]);
  state.order = ['attacker', target.id];
  state.turnIndex = 0;
  const before = target.hp;
  partyAct(fixedRng, state, 'attacker', move.id, target.id);
  return { damage: before - target.hp, log: state.log.map((entry) => entry.text).join('\n') };
}

describe('M48 armor material profiles', () => {
  it('maps live armory disciplines to readable material protection', () => {
    const light = armoryProfile(record('ranger', 'ridgeleather-vest'));
    const mail = armoryProfile(record('swordsman', 'saltforged-mail'));
    const robe = armoryProfile(record('mage', 'ashveil-robe'));
    const vestment = armoryProfile(record('cleric', 'brinewarded-vestment'));
    expect(armorProtectionText(light.armorProtection)).toContain('斬 -1');
    expect(armorProtectionText(mail.armorProtection)).toContain('斬 -2');
    expect(armorProtectionText(mail.armorProtection)).toContain('刺 -1');
    expect(armorProtectionText(robe.armorProtection)).toContain('火 -1');
    expect(armorProtectionText(robe.armorProtection)).toContain('霜 -1');
    expect(armorProtectionText(vestment.armorProtection)).toContain('聖 -2');
  });

  it('makes mail strongly answer cuts, partly answer ordinary arrows, and never invent blunt reduction', () => {
    const mail = armorProtectionForDiscipline('mail');
    const slash: Move = { id: 'slash', name: '刀斬', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash', damage: { dice: 1, sides: 8 }, narration: '' };
    const pierce: Move = { ...slash, id: 'pierce', name: '箭刺', element: 'pierce' };
    const blunt: Move = { ...slash, id: 'blunt', name: '錘擊', element: 'blunt' };
    expect(resolveArmorMitigation(mail, slash, false).reduction).toBe(2);
    expect(resolveArmorMitigation(mail, pierce, false).reduction).toBe(1);
    expect(resolveArmorMitigation(mail, blunt, false).reduction).toBe(0);
  });

  it('lets armor-piercing remove physical reduction without piercing magical cloth wards', () => {
    const mail = armorProtectionForDiscipline('mail');
    const robe = armorProtectionForDiscipline('robe');
    const arrow: Move = {
      id: 'piercing-arrow', name: '穿甲箭', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
      armorPiercing: 2, damage: { dice: 1, sides: 10 }, narration: '',
    };
    const fire: Move = {
      id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
      armorPiercing: 99, damage: { dice: 1, sides: 10 }, narration: '',
    };
    expect(resolveArmorMitigation(mail, arrow, false)).toMatchObject({ baseReduction: 1, reduction: 0, bypassed: 1 });
    expect(resolveArmorMitigation(robe, fire, true)).toMatchObject({ baseReduction: 1, reduction: 1, bypassed: 0 });
  });

  it('integrates flat armor reduction into real combat damage and logs the material response', () => {
    const slash: Move = {
      id: 'test-slash', name: '測試斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
      damage: { dice: 1, sides: 10 }, narration: '{actor}斬中{target}，造成 {amount} 點傷害。',
    };
    const regularPierce: Move = { ...slash, id: 'test-pierce', name: '普通箭', element: 'pierce' };
    const piercing: Move = { ...regularPierce, id: 'test-piercing', name: '穿甲測試箭', armorPiercing: 2 };
    expect(hit(slash, 'mail').damage).toBe(8);
    expect(hit(slash, 'light').damage).toBe(9);
    expect(hit(regularPierce, 'mail').damage).toBe(9);
    const pierced = hit(piercing, 'mail');
    expect(pierced.damage).toBe(10);
    expect(pierced.log).toContain('穿透了 1 點護甲減傷');
  });

  it('treats robe and vestment protection as magical rather than mundane physical armor', () => {
    const fireball: Move = {
      id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
      damage: { dice: 1, sides: 6 }, narration: '{actor}以火球擊中{target}，造成 {amount} 點傷害。',
    };
    const holy: Move = {
      id: 'holy-strike', name: '聖擊', kind: 'attack', target: 'enemy', hitStat: 'cha', element: 'holy',
      damage: { dice: 1, sides: 6 }, narration: '{actor}以聖光擊中{target}，造成 {amount} 點傷害。',
    };
    expect(hit(fireball, 'robe').damage).toBeLessThan(hit(fireball, 'mail').damage);
    expect(hit(holy, 'vestment').damage).toBeLessThan(hit(holy, 'light').damage);
  });

  it('turns the ranger piercing-arrow name into a real armor-piercing combat property', () => {
    const ranger = record('ranger', 'ridgeleather-vest');
    const move = memberFromRecord(ranger).moves.find((candidate) => candidate.id === 'piercing-arrow');
    expect(move?.armorPiercing).toBe(2);
  });

  it('wires armor into live convoy raiders and the Reliquary knight instead of test-only fixtures', () => {
    const [captain, hook, arsonist] = createConvoyDefenseEncounter();
    expect(captain.armorProtection?.id).toBe('mail');
    expect(hook.armorProtection?.id).toBe('light');
    expect(arsonist.armorProtection?.id).toBe('robe');
    const [knight, squire] = createReliquaryEncounter(1);
    expect(knight.armorProtection?.id).toBe('mail');
    expect(squire.armorProtection?.id).toBe('light');
  });
});
