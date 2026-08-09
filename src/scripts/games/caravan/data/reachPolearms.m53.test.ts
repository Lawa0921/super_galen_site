import { describe, expect, it } from 'vitest';
import type { Move } from '../combat';
import type { CompanionRecord } from '../save';
import { armoryProfile, armoryRuleForItem, WEAPON_DISCIPLINE_LABELS } from './armory';
import { engagementForMove, formationAttackProfile } from './martialEngagement.m49';
import { handLoadoutProfile, setOffhandId, weaponHands } from './offhandShields.m52';
import { M53_POLEARM_ITEMS } from './reachPolearms.m53';
import { TOWNS } from './towns';

function record(job: CompanionRecord['job'] = 'swordsman', weapon = 'ashwood-war-spear'): CompanionRecord {
  return {
    id: `m53-${job}`,
    name: '長柄測試者',
    job,
    level: 5,
    xp: 750,
    stats: { str: 14, dex: 12, int: 12, cha: 12, con: 14 },
    maxHp: 28,
    injuredForTrips: 0,
    equipment: { weapon, armor: null, trinket: null },
  };
}

const plainPierce: Move = {
  id: 'plain-pierce',
  name: '短槍刺擊',
  kind: 'attack',
  target: 'enemy',
  hitStat: 'str',
  element: 'pierce',
  damage: { dice: 1, sides: 6, bonusStat: 'str' },
  narration: '',
};

describe('M53 reach and polearm rules', () => {
  it('requires an explicit reach declaration instead of treating every STR pierce attack as long-reach', () => {
    expect(engagementForMove(plainPierce, false)).toBe('melee');
    expect(M53_POLEARM_ITEMS['ashwood-war-spear'].equip?.move?.engagement).toBe('reach');
    expect(M53_POLEARM_ITEMS['saltsteel-pike'].equip?.move?.engagement).toBe('reach');
  });

  it('makes reach comfortable in rear rank but mildly awkward when forced into the frontline', () => {
    const spear = M53_POLEARM_ITEMS['ashwood-war-spear'].equip!.move!;
    const rear = formationAttackProfile('back', spear, false);
    const front = formationAttackProfile('front', spear, false);
    expect(rear.engagement).toBe('reach');
    expect(rear.hitModifier).toBe(0);
    expect(front.engagement).toBe('reach');
    expect(front.hitModifier).toBe(-1);
    expect(front.message).toContain('長柄近身壓力');
    expect(front.message).toContain('命中 -1');
  });

  it('keeps M49 melee and ranged penalties unchanged', () => {
    const melee = { ...plainPierce, element: 'slash' as const };
    const ranged = { ...plainPierce, hitStat: 'dex' as const };
    expect(formationAttackProfile('back', melee, false).hitModifier).toBe(-2);
    expect(formationAttackProfile('front', ranged, false).hitModifier).toBe(-2);
  });

  it('lets true magic override even an explicit reach marker', () => {
    const fakeReachSpell: Move = {
      ...plainPierce,
      id: 'reach-spell',
      engagement: 'reach',
      hitStat: 'int',
      element: 'fire',
    };
    const profile = formationAttackProfile('front', fakeReachSpell, true);
    expect(profile.engagement).toBe('mystic');
    expect(profile.hitModifier).toBe(0);
  });

  it('registers both polearms as two-handed armory weapons with real burden', () => {
    expect(weaponHands('ashwood-war-spear')).toBe(2);
    expect(weaponHands('saltsteel-pike')).toBe(2);
    expect(armoryRuleForItem('ashwood-war-spear')).toMatchObject({ burden: 2, weapon: 'polearm' });
    expect(armoryRuleForItem('saltsteel-pike')).toMatchObject({ burden: 3, weapon: 'polearm' });
    expect(WEAPON_DISCIPLINE_LABELS.polearm).toBe('長柄');
  });

  it('uses cross-training rather than job locks for the polearm discipline', () => {
    expect(armoryProfile(record('swordsman')).weaponFit).toBe('mastered');
    expect(armoryProfile(record('ranger')).weaponFit).toBe('trained');
    expect(armoryProfile(record('cleric')).weaponFit).toBe('trained');
    expect(armoryProfile(record('mage')).weaponFit).toBe('strained');
  });

  it('stows a shield while a two-handed polearm is in use instead of granting both benefits', () => {
    const fighter = record();
    setOffhandId(fighter, 'salt-rim-kite-shield');
    const hand = handLoadoutProfile(fighter);
    expect(hand.weaponHands).toBe(2);
    expect(hand.shieldReady).toBe(false);
    expect(hand.shieldGuardBonus).toBe(0);
    expect(hand.offhandBurden).toBe(2);
  });

  it('places both polearms in real town stock at distinct progression points', () => {
    expect(TOWNS['starting-town'].stock).toContain('ashwood-war-spear');
    expect(TOWNS['salt-spring-city'].stock).toContain('saltsteel-pike');
    expect(M53_POLEARM_ITEMS['ashwood-war-spear'].equip?.minLevel).toBeUndefined();
    expect(M53_POLEARM_ITEMS['saltsteel-pike'].equip?.minLevel).toBe(3);
  });
});
