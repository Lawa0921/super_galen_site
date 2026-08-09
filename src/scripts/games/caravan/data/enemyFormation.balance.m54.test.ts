import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  legalEnemyTargetsForMove,
  partyAct,
  partyTargetAvailability,
  startCombat,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { formationAttackProfile } from './martialEngagement.m49';
import {
  enemyCanBypassPartyFront,
  enemyLineGate,
  initializeEnemyFormation,
} from './enemyFormation.m54';

const melee: Move = {
  id: 'm54-review-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '{actor}攻擊{target}，造成 {amount} 點傷害！',
};
const reach: Move = {
  id: 'm54-review-reach', name: '長槍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '{actor}刺向{target}，造成 {amount} 點傷害！',
};
const ranged: Move = {
  id: 'm54-review-ranged', name: '弓箭', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '{actor}射向{target}，造成 {amount} 點傷害！',
};
const magic: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 8, bonusStat: 'int' }, narration: '{actor}灼燒{target}，造成 {amount} 點傷害！',
};
const guard: Move = { id: 'm54-review-guard', name: '守勢', kind: 'guard', target: 'self', hitStat: 'con', narration: '{actor}架起守勢。' };

const rng: Rng = {
  next: () => 0,
  roll: () => 2,
  d20: () => 12,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

function unit(id: string, row: 'front' | 'back', moves: Move[] = [melee], hp = 24): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 10, con: 12 },
    maxHp: 24, hp, defense: 12, moves: moves.map((move) => ({ ...move })),
  };
}

function foe(id: string, row: 'front' | 'back', moves: Move[] = [melee], hp = 20): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 14, dex: 14, int: 14, cha: 10, con: 12 },
    maxHp: 20, hp, defense: 12, moves: moves.map((move) => ({ ...move })),
    intents: moves.map((move) => ({ weight: 1, moveId: move.id })),
  };
}

describe('M54 multidimensional player adversarial review', () => {
  it('makes enemy line protection symmetric without making rear targets permanently invulnerable', () => {
    const front = foe('front', 'front');
    const back = foe('back', 'back', [ranged]);
    expect(enemyLineGate([front, back], melee, back).allowed).toBe(false);
    front.hp = 0;
    // Once no living screen exists, the same target is no longer protected even before runtime promotion.
    expect(enemyLineGate([front, back], melee, back).allowed).toBe(true);
  });

  it('keeps melee useful by always leaving at least one legal target when enemies survive', () => {
    const encounters = [
      [foe('front', 'front'), foe('back', 'back', [ranged])],
      [foe('front-a', 'front'), foe('front-b', 'front')],
      [foe('back-a', 'back', [ranged]), foe('back-b', 'back', [magic])],
    ];
    for (const encounter of encounters) {
      initializeEnemyFormation(encounter);
      expect(encounter.some((enemy) => enemy.hp > 0)).toBe(true);
      expect(encounter.some((enemy) => enemy.hp > 0 && enemy.formationRow !== 'back')).toBe(true);
      const legal = encounter.filter((enemy) => enemyLineGate(encounter, melee, enemy).allowed);
      expect(legal.length).toBeGreaterThan(0);
    }
  });

  it('does not turn ranged/magic bypass into a free hit bonus or extra damage rule', () => {
    expect(formationAttackProfile('back', ranged, false).hitModifier).toBe(0);
    expect(formationAttackProfile('back', magic, true).hitModifier).toBe(0);
    expect(enemyCanBypassPartyFront(ranged)).toBe(true);
    expect(enemyCanBypassPartyFront(magic)).toBe(true);
    expect(ranged.damage).toEqual({ dice: 1, sides: 8, bonusStat: 'dex' });
    expect(magic.damage).toEqual({ dice: 1, sides: 8, bonusStat: 'int' });
  });

  it('preserves the value of player rear formation because ranged pressure is targetable, not guaranteed damage', () => {
    const front = unit('front', 'front', [guard], 24);
    const rear = unit('rear', 'back', [ranged], 8);
    const screen = foe('screen', 'front');
    const archer = foe('archer', 'back', [ranged]);
    const state = startCombat(rng, [front, rear], [screen, archer]);
    state.guarding[front.id] = true;
    const rearHp = rear.hp;
    enemyAct({ ...rng, d20: () => 20 }, state, archer.id);
    expect(rear.hp).toBe(rearHp);
    expect(front.hp).toBeLessThan(front.maxHp);
    expect(state.log.some((entry) => entry.text.includes('替rear攔下攻擊'))).toBe(true);
  });

  it('makes a blocked rear-line misclick informational rather than punitive', () => {
    const hero = unit('hero', 'front');
    const front = foe('front', 'front');
    const back = foe('back', 'back', [ranged]);
    const state = startCombat(rng, [hero], [front, back]);
    const before = { turn: state.turnIndex, round: state.round, hp: back.hp };
    const result = partyAct(rng, state, hero.id, melee.id, back.id);
    expect(result.acted).toBe(false);
    expect(result.reason).toContain('前線尚未突破');
    expect({ turn: state.turnIndex, round: state.round, hp: back.hp }).toEqual(before);
  });

  it('exposes exactly the legal target list to UIs for melee/reach/ranged/mystic attacks', () => {
    const hero = unit('hero', 'front');
    const front = foe('front', 'front');
    const back = foe('back', 'back', [ranged]);
    const state = startCombat(rng, [hero], [front, back]);
    expect(legalEnemyTargetsForMove(state, melee).map((enemy) => enemy.id)).toEqual(['front']);
    expect(legalEnemyTargetsForMove(state, reach).map((enemy) => enemy.id)).toEqual(['front']);
    expect(legalEnemyTargetsForMove(state, ranged).map((enemy) => enemy.id)).toEqual(['front', 'back']);
    expect(legalEnemyTargetsForMove(state, magic).map((enemy) => enemy.id)).toEqual(['front', 'back']);
    expect(partyTargetAvailability(state, hero, melee, back).allowed).toBe(false);
  });

  it('does not make close-combat area attacks secretly ignore formation on either side', () => {
    const front = foe('front', 'front');
    const back = foe('back', 'back', [ranged]);
    const sweep = { ...melee, id: 'm54-review-sweep', area: true };
    const state = startCombat(rng, [unit('hero', 'front', [sweep])], [front, back]);
    expect(legalEnemyTargetsForMove(state, sweep).map((enemy) => enemy.id)).toEqual(['front']);

    const playerFront = unit('player-front', 'front', [guard], 24);
    const playerBack = unit('player-back', 'back', [ranged], 24);
    const brute = foe('brute', 'front', [sweep]);
    const enemyState = startCombat(rng, [playerFront, playerBack], [brute]);
    enemyAct({ ...rng, d20: () => 20 }, enemyState, brute.id);
    expect(playerFront.hp).toBeLessThan(playerFront.maxHp);
    expect(playerBack.hp).toBe(playerBack.maxHp);
  });

  it('keeps magic exempt from mundane row pressure on both sides', () => {
    const caster = foe('caster', 'back', [magic]);
    const screen = foe('screen', 'front');
    const state = startCombat(rng, [unit('front', 'front'), unit('rear', 'back', [magic], 8)], [screen, caster]);
    expect(caster.formationRow).toBe('back');
    expect(formationAttackProfile(caster.formationRow, magic, true).hitModifier).toBe(0);
    expect(enemyCanBypassPartyFront(magic)).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('近戰與長柄必須先突破前線'))).toBe(true);
  });
});
