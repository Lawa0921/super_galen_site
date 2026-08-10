import { describe, expect, it } from 'vitest';
import {
  legalEnemyTargetsForMove,
  partyTargetAvailability,
  startCombat,
  targetCoverForecast,
  targetLineOfEffectForecast,
  type EnemyUnit,
  type Move,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import { createConvoyDefenseEncounter, convoyBraceValue } from './convoyDefense.m46';
import { tacticalTargetChoices } from './tacticalReadability.m56';
import { attackDeliveryForMove } from './battlefieldLineOfEffect.m57';

const rng: Rng = {
  next: () => 0,
  roll: () => 4,
  d20: () => 12,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const melee: Move = {
  id: 'm57-review-melee', name: '武器斬擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '{actor}攻擊{target}。',
};
const reach: Move = {
  id: 'm57-review-reach', name: '長槍', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'pierce', engagement: 'reach',
  damage: { dice: 1, sides: 8, bonusStat: 'str' }, narration: '{actor}刺向{target}。',
};
const bow: Move = {
  id: 'm57-review-bow', name: '長弓', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 8, bonusStat: 'dex' }, narration: '{actor}射向{target}。',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '{actor}轟擊{target}。',
};
const arrowStorm: Move = {
  ...bow, id: 'arrow-storm', name: '驟雨連射', area: true, damage: { dice: 1, sides: 4, bonusStat: 'dex' },
};
const meteor: Move = {
  ...fireball, id: 'meteor-fall', name: '隕石墜', area: true,
};
const heal: Move = {
  id: 'm57-review-heal', name: '治療', kind: 'support', target: 'ally', hitStat: 'cha',
  heal: { dice: 1, sides: 8, bonusStat: 'cha' }, narration: '{actor}治療{target}。',
};

function member(id: string, row: 'front' | 'back', moves: Move[]): PartyMember {
  return {
    id, name: id, formationRow: row,
    stats: { str: 16, dex: 16, int: 16, cha: 14, con: 16 },
    maxHp: 30, hp: 30, defense: 13, moves,
  };
}

function enemy(id: string, row: 'front' | 'back'): EnemyUnit {
  return {
    id, name: id, formationRow: row,
    stats: { str: 12, dex: 12, int: 10, cha: 10, con: 12 },
    maxHp: 20, hp: 20, defense: 12,
    moves: [melee], intents: [{ weight: 1, moveId: melee.id }],
  };
}

function battlementState() {
  return startCombat(
    rng,
    [member('fighter', 'front', [melee, reach]), member('archer', 'back', [bow, arrowStorm]), member('mage', 'back', [fireball, meteor, heal])],
    createConvoyDefenseEncounter(),
  );
}

describe('M57 multidimensional player-perspective adversarial review', () => {
  it('does not make an overhead-capable class mandatory because every build still has legal frontline targets', () => {
    const state = battlementState();
    for (const [actorId, moveId] of [['fighter', melee.id], ['fighter', reach.id], ['archer', bow.id], ['mage', fireball.id]] as const) {
      const actor = state.party.find((member) => member.id === actorId)!;
      const move = actor.moves.find((entry) => entry.id === moveId)!;
      expect(legalEnemyTargetsForMove(state, move).length, `${actorId}/${moveId} must retain a legal route`).toBeGreaterThan(0);
    }
  });

  it('keeps the physical martial solution explicit: break the screen rather than requiring spellcraft', () => {
    const state = battlementState();
    const fighter = state.party.find((member) => member.id === 'fighter')!;
    const frontIds = state.enemies.filter((enemy) => enemy.formationRow !== 'back').map((enemy) => enemy.id);
    expect(legalEnemyTargetsForMove(state, fighter.moves.find((move) => move.id === melee.id)! ).map((enemy) => enemy.id)).toEqual(frontIds);
    expect(legalEnemyTargetsForMove(state, fighter.moves.find((move) => move.id === reach.id)! ).map((enemy) => enemy.id)).toEqual(frontIds);
  });

  it('does not let ordinary magic become a universal wall key', () => {
    const state = battlementState();
    const mage = state.party.find((member) => member.id === 'mage')!;
    const spell = mage.moves.find((move) => move.id === fireball.id)!;
    const rear = state.enemies.find((enemy) => enemy.formationRow === 'back')!;
    expect(partyTargetAvailability(state, mage, spell, rear).allowed).toBe(false);
    expect(targetLineOfEffectForecast(state, spell, rear).blocked).toBe(true);
  });

  it('does not let overhead delivery become a hidden positive accuracy or damage modifier', () => {
    expect(attackDeliveryForMove(arrowStorm)).toBe('overhead');
    expect(attackDeliveryForMove(meteor)).toBe('overhead');
    expect(arrowStorm.hitBonus ?? 0).toBe(0);
    expect(meteor.hitBonus ?? 0).toBe(0);
    expect(arrowStorm.damage).toEqual({ dice: 1, sides: 4, bonusStat: 'dex' });
    expect(meteor.damage).toEqual(fireball.damage);
  });

  it('keeps physical overhead and mystical overhead tactically distinct through M55 cover', () => {
    const state = battlementState();
    const rear = state.enemies.find((enemy) => enemy.formationRow === 'back')!;
    const archer = state.party.find((member) => member.id === 'archer')!;
    const mage = state.party.find((member) => member.id === 'mage')!;
    const storm = archer.moves.find((move) => move.id === arrowStorm.id)!;
    const fall = mage.moves.find((move) => move.id === meteor.id)!;
    expect(targetCoverForecast(state, storm, rear).hitModifier).toBe(-2);
    expect(targetCoverForecast(state, fall, rear).hitModifier).toBe(0);
  });

  it('keeps the convoy objective route alive even when a party ignores rear sniping entirely', () => {
    const state = battlementState();
    const fighter = state.party.find((member) => member.id === 'fighter')!;
    expect(convoyBraceValue(fighter)).toBeGreaterThanOrEqual(3);
    expect(convoyBraceValue(fighter)).toBeLessThanOrEqual(7);
  });

  it('does not pollute ally support with hostile line-of-effect restrictions', () => {
    const state = battlementState();
    const mage = state.party.find((member) => member.id === 'mage')!;
    const liveHeal = mage.moves.find((move) => move.id === heal.id)!;
    const choices = tacticalTargetChoices(state, mage, liveHeal);
    expect(choices).toHaveLength(state.party.length);
    expect(choices.every((choice) => choice.allowed)).toBe(true);
    expect(choices.every((choice) => !choice.label.includes('實體遮蔽'))).toBe(true);
  });

  it('keeps open-ground legacy encounters unchanged', () => {
    const state = startCombat(rng, [member('hero', 'front', [bow, fireball])], [enemy('front', 'front'), enemy('rear', 'back')], 'open-ground');
    const hero = state.party[0];
    const liveBow = hero.moves.find((move) => move.id === bow.id)!;
    const liveFireball = hero.moves.find((move) => move.id === fireball.id)!;
    expect(legalEnemyTargetsForMove(state, liveBow)).toHaveLength(2);
    expect(legalEnemyTargetsForMove(state, liveFireball)).toHaveLength(2);
  });

  it('keeps the M55 broken bridge as cover rather than silently upgrading it into a wall', () => {
    const state = startCombat(rng, [member('hero', 'front', [bow, fireball])], [enemy('front', 'front'), enemy('rear', 'back')], 'broken-stone-bridge');
    const hero = state.party[0];
    const rear = state.enemies.find((entry) => entry.id === 'rear')!;
    const liveBow = hero.moves.find((move) => move.id === bow.id)!;
    const liveFireball = hero.moves.find((move) => move.id === fireball.id)!;
    expect(partyTargetAvailability(state, hero, liveBow, rear).allowed).toBe(true);
    expect(targetCoverForecast(state, liveBow, rear).hitModifier).toBe(-1);
    expect(partyTargetAvailability(state, hero, liveFireball, rear).allowed).toBe(true);
  });

  it('keeps target forecasting read-only instead of changing rows, HP, mana or terrain', () => {
    const state = battlementState();
    const mage = state.party.find((member) => member.id === 'mage')!;
    const liveFireball = mage.moves.find((move) => move.id === fireball.id)!;
    const rear = state.enemies.find((enemy) => enemy.formationRow === 'back')!;
    const before = JSON.stringify(state);
    targetLineOfEffectForecast(state, liveFireball, rear);
    tacticalTargetChoices(state, mage, liveFireball);
    expect(JSON.stringify(state)).toBe(before);
  });
});
