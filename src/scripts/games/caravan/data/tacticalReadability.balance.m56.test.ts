import { describe, expect, it } from 'vitest';
import {
  partyAct,
  startCombat,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { tacticalTargetChoices, tacticalUnitSummary } from './tacticalReadability.m56';

const rng: Rng = {
  next: () => 0,
  roll: () => 4,
  d20: () => 12,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const melee: Move = {
  id: 'm56-balance-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}。',
};
const reach: Move = {
  id: 'm56-balance-reach', name: '長槍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}刺向{target}。',
};
const ranged: Move = {
  id: 'm56-balance-ranged', name: '弓射', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}。',
};
const spell: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 6, bonusStat: 'int' }, narration: '{actor}施法攻擊{target}。',
};
const heal: Move = {
  id: 'm56-balance-heal', name: '治療', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 6, bonusStat: 'cha' }, narration: '{actor}治療{target}。',
};

function member(id: string, row: 'front' | 'back', moves: Move[]): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 16, dex: 16, int: 16, cha: 16, con: 14 }, maxHp: 30, hp: 30, defense: 12, moves,
  };
}

function enemy(id: string, row: 'front' | 'back'): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 12, dex: 12, int: 8, cha: 8, con: 12 }, maxHp: 24, hp: 24, defense: 12,
    moves: [melee], intents: [{ weight: 1, moveId: melee.id }],
  };
}

function state() {
  return startCombat(
    rng,
    [member('sword', 'front', [melee]), member('spear', 'back', [reach]), member('archer', 'back', [ranged]), member('mage', 'back', [spell, heal])],
    [enemy('front', 'front'), enemy('rear', 'back')],
    'broken-stone-bridge',
  );
}

describe('M56 multidimensional player adversarial review', () => {
  it('teaches blocked geometry instead of hiding the protected enemy and creating mystery rules', () => {
    const combat = state();
    const choices = tacticalTargetChoices(combat, combat.party[0], melee);
    expect(choices.map((choice) => choice.id)).toEqual(['front', 'rear']);
    const rear = choices[1];
    expect(rear.allowed).toBe(false);
    expect(rear.reason.length).toBeGreaterThan(0);
    expect(rear.label).toContain('前線保護');
  });

  it('does not auto-retarget a blocked melee click and secretly spend the player turn on a different enemy', () => {
    const combat = state();
    const frontHp = combat.enemies[0].hp;
    const beforeTurn = combat.turnIndex;
    const result = partyAct(rng, combat, combat.party[0].id, melee.id, 'rear');
    expect(result.acted).toBe(false);
    expect(combat.enemies[0].hp).toBe(frontHp);
    expect(combat.turnIndex).toBe(beforeTurn);
  });

  it('preserves distinct physical routes: swords break the screen, reach contributes safely, bows may pressure rear through cover', () => {
    const combat = state();
    const swordRear = tacticalTargetChoices(combat, combat.party[0], melee).find((choice) => choice.id === 'rear')!;
    const spearRear = tacticalTargetChoices(combat, combat.party[1], reach).find((choice) => choice.id === 'rear')!;
    const bowRear = tacticalTargetChoices(combat, combat.party[2], ranged).find((choice) => choice.id === 'rear')!;
    expect(swordRear.allowed).toBe(false);
    expect(spearRear.allowed).toBe(false);
    expect(bowRear.allowed).toBe(true);
    expect(bowRear.coverHitModifier).toBe(-1);
  });

  it('does not make magic look strictly buffed by terrain: it shows no positive bonus, only absence of projectile cover', () => {
    const combat = state();
    const magicRear = tacticalTargetChoices(combat, combat.party[3], spell).find((choice) => choice.id === 'rear')!;
    expect(magicRear.allowed).toBe(true);
    expect(magicRear.coverHitModifier).toBe(0);
    expect(magicRear.label).not.toMatch(/\+\d/);
  });

  it('keeps support readable and available without exposing enemy-line jargon on ally choices', () => {
    const combat = state();
    combat.party[0].hp = 9;
    const choices = tacticalTargetChoices(combat, combat.party[3], heal);
    expect(choices.some((choice) => choice.label.includes('HP 9/30'))).toBe(true);
    expect(choices.every((choice) => choice.allowed)).toBe(true);
    expect(choices.every((choice) => !choice.label.includes('前線保護'))).toBe(true);
  });

  it('keeps information symmetric so player rear defenses are as legible as enemy rear defenses', () => {
    const combat = state();
    const playerRear = tacticalUnitSummary(combat, 'party', combat.party[2]);
    const enemyRear = tacticalUnitSummary(combat, 'enemy', combat.enemies[1]);
    expect(playerRear).toContain('後排｜受前線保護｜掩體 -1');
    expect(enemyRear).toContain('後排｜受前線保護｜掩體 -1');
  });

  it('does not expose dead units as selectable targets even though their cards may remain visible as battle history', () => {
    const combat = state();
    combat.enemies[0].hp = 0;
    combat.enemies[1].formationRow = 'front';
    const choices = tacticalTargetChoices(combat, combat.party[2], ranged);
    expect(choices.map((choice) => choice.id)).toEqual(['rear']);
  });

  it('updates from runtime truth after formation changes instead of caching stale target legality', () => {
    const combat = state();
    const rear = combat.enemies[1];
    expect(tacticalTargetChoices(combat, combat.party[0], melee).find((choice) => choice.id === rear.id)?.allowed).toBe(false);
    combat.enemies[0].hp = 0;
    rear.formationRow = 'front';
    expect(tacticalTargetChoices(combat, combat.party[0], melee).find((choice) => choice.id === rear.id)?.allowed).toBe(true);
    expect(tacticalUnitSummary(combat, 'enemy', rear)).toBe('前排｜正面接戰');
  });

  it('keeps the presentation helper read-only so opening target menus cannot alter HP, rows, resources, or turn order', () => {
    const combat = state();
    const before = JSON.stringify(combat);
    for (const actor of combat.party) {
      for (const move of actor.moves) tacticalTargetChoices(combat, actor, move);
      tacticalUnitSummary(combat, 'party', actor);
    }
    for (const foe of combat.enemies) tacticalUnitSummary(combat, 'enemy', foe);
    expect(JSON.stringify(combat)).toBe(before);
  });
});
