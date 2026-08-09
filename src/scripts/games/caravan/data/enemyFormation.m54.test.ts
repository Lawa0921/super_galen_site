import { describe, expect, it } from 'vitest';
import type { EnemyUnit, Move } from '../combat';
import {
  collapseEnemyFrontLine,
  enemyCanBypassPartyFront,
  enemyLineGate,
  initializeEnemyFormation,
  legalEnemyTargets,
  normalizeEnemyWeaponSemantics,
  preferredEnemyRow,
} from './enemyFormation.m54';

const melee: Move = {
  id: 'm54-sword', name: '長劍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '',
};
const ranged: Move = {
  id: 'm54-bow', name: '長弓', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '',
};
const reach: Move = {
  id: 'm54-spear', name: '長槍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '',
};
const magic: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '',
};
const guard: Move = { id: 'm54-guard', name: '守勢', kind: 'guard', target: 'self', hitStat: 'con', narration: '' };

function enemy(id: string, moves: Move[], row?: 'front' | 'back'): EnemyUnit {
  return {
    id, name: id, stats: { str: 12, dex: 12, int: 12, cha: 10, con: 12 },
    maxHp: 20, hp: 20, defense: 12, moves, intents: moves.map((move) => ({ weight: 1, moveId: move.id })),
    formationRow: row,
  };
}

describe('M54 enemy formation rules', () => {
  it('infers melee/guard bodies as front and ranged/reach/mystic specialists as back', () => {
    expect(preferredEnemyRow(enemy('melee', [melee]))).toBe('front');
    expect(preferredEnemyRow(enemy('guard', [guard]))).toBe('front');
    expect(preferredEnemyRow(enemy('ranged', [ranged]))).toBe('back');
    expect(preferredEnemyRow(enemy('reach', [reach]))).toBe('back');
    expect(preferredEnemyRow(enemy('mage', [magic]))).toBe('back');
  });

  it('preserves explicit authored rows instead of overriding encounter design', () => {
    expect(preferredEnemyRow(enemy('explicit-front-archer', [ranged], 'front'))).toBe('front');
    expect(preferredEnemyRow(enemy('explicit-back-sword', [melee], 'back'))).toBe('back');
  });

  it('repairs pre-M49 enemy bow metadata so named bow shots are truly pierce/ranged', () => {
    const legacy = enemy('legacy', [{ ...ranged, id: 'ridge-arrow', element: undefined, engagement: undefined }]);
    normalizeEnemyWeaponSemantics(legacy);
    expect(legacy.moves[0].element).toBe('pierce');
    expect(legacy.moves[0].engagement).toBe('ranged');

    const bone = enemy('bone', [{ ...ranged, id: 'bone-arrow', element: undefined, engagement: undefined }]);
    normalizeEnemyWeaponSemantics(bone);
    expect(bone.moves[0].element).toBe('pierce');
    expect(bone.moves[0].engagement).toBe('ranged');
  });

  it('creates a real mixed enemy line and forbids an all-rear phantom screen', () => {
    const mixed = [enemy('screen', [melee]), enemy('archer', [ranged])];
    expect(initializeEnemyFormation(mixed).promoted).toEqual([]);
    expect(mixed.map((unit) => unit.formationRow)).toEqual(['front', 'back']);

    const allBack = [enemy('archer-a', [ranged]), enemy('archer-b', [ranged])];
    const result = initializeEnemyFormation(allBack);
    expect(result.promoted).toEqual(['archer-a', 'archer-b']);
    expect(allBack.every((unit) => unit.formationRow === 'front')).toBe(true);
  });

  it('promotes all surviving enemy rear units when their frontline actually collapses', () => {
    const front = enemy('front', [melee], 'front');
    const backA = enemy('back-a', [ranged], 'back');
    const backB = enemy('back-b', [reach], 'back');
    front.hp = 0;
    expect(collapseEnemyFrontLine([front, backA, backB]).promoted).toEqual(['back-a', 'back-b']);
    expect(backA.formationRow).toBe('front');
    expect(backB.formationRow).toBe('front');
  });

  it('lets ranged and true magic bypass a living enemy screen but blocks melee and reach', () => {
    const front = enemy('front', [melee], 'front');
    const back = enemy('back', [ranged], 'back');
    const enemies = [front, back];
    expect(enemyLineGate(enemies, melee, back).allowed).toBe(false);
    expect(enemyLineGate(enemies, reach, back).allowed).toBe(false);
    expect(enemyLineGate(enemies, ranged, back).allowed).toBe(true);
    expect(enemyLineGate(enemies, magic, back).allowed).toBe(true);
    expect(enemyLineGate(enemies, melee, back).reason).toContain('前線尚未突破');
  });

  it('keeps physical area melee/reach on the frontline while ranged/mystic area can cross it', () => {
    const front = enemy('front', [melee], 'front');
    const back = enemy('back', [ranged], 'back');
    expect(legalEnemyTargets([front, back], { ...melee, area: true }).map((unit) => unit.id)).toEqual(['front']);
    expect(legalEnemyTargets([front, back], { ...reach, area: true }).map((unit) => unit.id)).toEqual(['front']);
    expect(legalEnemyTargets([front, back], { ...ranged, area: true }).map((unit) => unit.id)).toEqual(['front', 'back']);
    expect(legalEnemyTargets([front, back], { ...magic, area: true }).map((unit) => unit.id)).toEqual(['front', 'back']);
  });

  it('uses the same bypass categories when enemies choose party targets', () => {
    expect(enemyCanBypassPartyFront(melee)).toBe(false);
    expect(enemyCanBypassPartyFront(reach)).toBe(false);
    expect(enemyCanBypassPartyFront(ranged)).toBe(true);
    expect(enemyCanBypassPartyFront(magic)).toBe(true);
  });
});
