import { describe, expect, it } from 'vitest';
import type { Move } from '../combat';
import {
  canGuardIntercept,
  engagementForMove,
  formationAttackProfile,
} from './martialEngagement.m49';

const sword: Move = {
  id: 'review-sword', name: '長劍斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '',
};
const bow: Move = {
  id: 'review-bow', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '',
};
const spell: Move = {
  id: 'review-spell', name: '炎術', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 1, sides: 8, bonusStat: 'int' }, narration: '',
};
const thrownSpear: Move = {
  id: 'review-thrown-spear', name: '投槍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce',
  engagement: 'ranged', damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '',
};

describe('M49 player-perspective multidimensional engagement review', () => {
  it('creates different preferred rows for steel, bows and spellcraft instead of one dominant formation', () => {
    const matrix = {
      sword: {
        front: formationAttackProfile('front', sword, false).hitModifier,
        back: formationAttackProfile('back', sword, false).hitModifier,
      },
      bow: {
        front: formationAttackProfile('front', bow, false).hitModifier,
        back: formationAttackProfile('back', bow, false).hitModifier,
      },
      spell: {
        front: formationAttackProfile('front', spell, true).hitModifier,
        back: formationAttackProfile('back', spell, true).hitModifier,
      },
    };
    console.log('[M49 FORMATION MATRIX]', matrix);

    expect(matrix.sword.front).toBeGreaterThan(matrix.sword.back);
    expect(matrix.bow.back).toBeGreaterThan(matrix.bow.front);
    expect(matrix.spell.front).toBe(matrix.spell.back);
  });

  it('keeps penalties bounded at -2 so wrong-row experimentation remains playable rather than forbidden', () => {
    const samples = [
      formationAttackProfile('back', sword, false).hitModifier,
      formationAttackProfile('front', bow, false).hitModifier,
      formationAttackProfile('front', spell, true).hitModifier,
      formationAttackProfile('back', spell, true).hitModifier,
    ];
    expect(Math.min(...samples)).toBe(-2);
    expect(Math.max(...samples)).toBe(0);
    expect(samples.every((value) => value >= -2 && value <= 0)).toBe(true);
  });

  it('bases weapon behavior on the move, not the character job, so cross-training builds remain valid', () => {
    expect(engagementForMove(sword, false)).toBe('melee');
    expect(engagementForMove(bow, false)).toBe('ranged');
    expect(engagementForMove(thrownSpear, false)).toBe('ranged');
    expect(formationAttackProfile('front', thrownSpear, false).hitModifier).toBe(-2);
    expect(formationAttackProfile('back', thrownSpear, false).hitModifier).toBe(0);
  });

  it('lets arcana truth override superficial damage labels so magical blunt/fire/pierce can never inherit mundane range pressure by accident', () => {
    const magicalBlunt: Move = {
      ...sword,
      id: 'review-gravity',
      name: '重力術',
      hitStat: 'int',
      element: 'blunt',
      engagement: 'melee',
    };
    expect(engagementForMove(magicalBlunt, true)).toBe('mystic');
    expect(formationAttackProfile('back', magicalBlunt, true).hitModifier).toBe(0);
    expect(formationAttackProfile('front', magicalBlunt, true).hitModifier).toBe(0);
  });

  it('makes guarding a real frontline job without breaking old records that have no row field', () => {
    expect(canGuardIntercept('front')).toBe(true);
    expect(canGuardIntercept('back')).toBe(false);
    expect(canGuardIntercept(undefined)).toBe(true);
  });

  it('always returns a readable explanation when a row penalty is applied', () => {
    const rearSword = formationAttackProfile('back', sword, false);
    const frontBow = formationAttackProfile('front', bow, false);
    expect(rearSword.message).toContain('後排距離限制');
    expect(rearSword.message).toContain('命中 -2');
    expect(frontBow.message).toContain('前排近身壓力');
    expect(frontBow.message).toContain('命中 -2');
  });
});
