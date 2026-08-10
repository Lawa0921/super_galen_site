import { describe, expect, it } from 'vitest';
import type { Move } from '../combat';
import { BATTLEFIELD_TERRAINS } from './battlefieldTerrain.m55';
import {
  attackDeliveryForMove,
  lineOfEffectProfile,
  moveCanBypassFrontline,
  solidRearObstructionActive,
} from './battlefieldLineOfEffect.m57';

const melee: Move = {
  id: 'm57-melee', name: '劍擊', kind: 'attack', target: 'enemy', hitStat: 'str', element: 'slash',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '{actor}斬向{target}。',
};
const ranged: Move = {
  id: 'm57-ranged', name: '長弓射擊', kind: 'attack', target: 'enemy', hitStat: 'dex', element: 'pierce', engagement: 'ranged',
  damage: { dice: 1, sides: 6, bonusStat: 'dex' }, narration: '{actor}射向{target}。',
};
const fireball: Move = {
  id: 'fireball', name: '火球', kind: 'attack', target: 'enemy', hitStat: 'int', element: 'fire',
  damage: { dice: 2, sides: 6, bonusStat: 'int' }, narration: '{actor}以火球轟擊{target}。',
};
const explicitOverhead: Move = {
  ...ranged, id: 'm57-overhead', name: '拋射', delivery: 'overhead',
};
const explicitContactSpell: Move = {
  ...fireball, id: 'm57-contact-spell', name: '灼熱觸碰', delivery: 'contact',
};

describe('M57 attack delivery and solid line-of-effect rules', () => {
  it('infers ordinary melee as contact and ordinary ranged/spell projectiles as direct', () => {
    expect(attackDeliveryForMove(melee)).toBe('contact');
    expect(attackDeliveryForMove(ranged)).toBe('direct');
    expect(attackDeliveryForMove(fireball)).toBe('direct');
    expect(moveCanBypassFrontline(melee)).toBe(false);
    expect(moveCanBypassFrontline(ranged)).toBe(true);
    expect(moveCanBypassFrontline(fireball)).toBe(true);
  });

  it('honors explicit delivery instead of magic identity', () => {
    expect(attackDeliveryForMove(explicitOverhead)).toBe('overhead');
    expect(attackDeliveryForMove(explicitContactSpell)).toBe('contact');
    expect(moveCanBypassFrontline(explicitContactSpell)).toBe(false);
  });

  it('normalizes unambiguous pre-M57 authored moves without changing their fiction', () => {
    const arrowStorm: Move = { ...ranged, id: 'arrow-storm', name: '驟雨連射', area: true };
    const meteor: Move = { ...fireball, id: 'meteor-fall', name: '隕石墜', area: true };
    const judgement: Move = { ...fireball, id: 'judgement-hammer', name: '聖裁之錘', hitStat: 'cha', element: 'holy' };
    const lament: Move = { ...fireball, id: 'reliquary-lament-touch', name: '哀歌觸碰', element: 'frost' };
    expect(attackDeliveryForMove(arrowStorm)).toBe('overhead');
    expect(attackDeliveryForMove(meteor)).toBe('overhead');
    expect(attackDeliveryForMove(judgement)).toBe('contact');
    expect(attackDeliveryForMove(lament)).toBe('contact');
  });

  it('activates solid obstruction only for a protected rear rank', () => {
    const terrain = BATTLEFIELD_TERRAINS['ruined-battlements'];
    expect(solidRearObstructionActive(terrain, 'back', true)).toBe(true);
    expect(solidRearObstructionActive(terrain, 'front', true)).toBe(false);
    expect(solidRearObstructionActive(terrain, 'back', false)).toBe(false);
    expect(solidRearObstructionActive(BATTLEFIELD_TERRAINS['broken-stone-bridge'], 'back', true)).toBe(false);
  });

  it('blocks direct attacks to a protected rear target but never invents a hit penalty', () => {
    const profile = lineOfEffectProfile(BATTLEFIELD_TERRAINS['ruined-battlements'], 'back', true, fireball);
    expect(profile).toMatchObject({ delivery: 'direct', bypassesFrontline: true, blocked: true });
    expect(profile.message).toMatch(/直線作用線|後排|越頂|突破/);
    expect(profile).not.toHaveProperty('hitModifier');
  });

  it('lets explicit overhead attacks cross solid obstruction without a positive combat bonus', () => {
    const profile = lineOfEffectProfile(BATTLEFIELD_TERRAINS['ruined-battlements'], 'back', true, explicitOverhead);
    expect(profile).toEqual({ delivery: 'overhead', bypassesFrontline: true, blocked: false, message: '' });
  });

  it('leaves open ground and the M55 broken bridge behavior unchanged', () => {
    expect(lineOfEffectProfile(BATTLEFIELD_TERRAINS['open-ground'], 'back', true, fireball).blocked).toBe(false);
    expect(lineOfEffectProfile(BATTLEFIELD_TERRAINS['broken-stone-bridge'], 'back', true, ranged).blocked).toBe(false);
  });
});
