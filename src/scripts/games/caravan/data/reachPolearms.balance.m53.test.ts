import { describe, expect, it } from 'vitest';
import type { CompanionRecord } from '../save';
import { ITEMS } from './items';
import { armoryProfile, armoryRuleForItem } from './armory';
import { formationAttackProfile } from './martialEngagement.m49';
import { handLoadoutProfile, setOffhandId } from './offhandShields.m52';
import { M53_POLEARM_ITEMS } from './reachPolearms.m53';

function record(weapon: string, job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id: `${job}-${weapon}`,
    name: '構築審查',
    job,
    level: 5,
    xp: 750,
    stats: { str: 14, dex: 14, int: 14, cha: 14, con: 14 },
    maxHp: 28,
    injuredForTrips: 0,
    equipment: { weapon, armor: null, trinket: null },
  };
}

function maxWeaponDice(itemId: string): number {
  const damage = ITEMS[itemId]?.equip?.move?.damage;
  return damage ? damage.dice * damage.sides : 0;
}

describe('M53 multidimensional player adversarial review', () => {
  it('trades raw blade damage for reach instead of strictly upgrading swords', () => {
    expect(maxWeaponDice('ashwood-war-spear')).toBeLessThan(maxWeaponDice('salt-crystal-blade'));
    expect(maxWeaponDice('saltsteel-pike')).toBeLessThan(maxWeaponDice('ancient-king-blade'));
    expect(M53_POLEARM_ITEMS['ashwood-war-spear'].equip?.bonus).toBeUndefined();
    expect(M53_POLEARM_ITEMS['saltsteel-pike'].equip?.bonus).toBeUndefined();
  });

  it('makes the stronger pike pay progression, price and burden costs over the starter spear', () => {
    const spear = M53_POLEARM_ITEMS['ashwood-war-spear'];
    const pike = M53_POLEARM_ITEMS['saltsteel-pike'];
    expect(pike.value).toBeGreaterThan(spear.value);
    expect(pike.equip?.minLevel).toBe(3);
    expect(armoryRuleForItem('saltsteel-pike')!.burden).toBeGreaterThan(armoryRuleForItem('ashwood-war-spear')!.burden);
    expect(pike.equip?.move?.armorPiercing).toBeGreaterThan(spear.equip?.move?.armorPiercing ?? 0);
  });

  it('never turns correct reach positioning into a hidden positive hit bonus', () => {
    for (const item of Object.values(M53_POLEARM_ITEMS)) {
      const move = item.equip!.move!;
      expect(formationAttackProfile('back', move, false).hitModifier).toBe(0);
      expect(formationAttackProfile('front', move, false).hitModifier).toBe(-1);
    }
  });

  it('keeps the frontline reach penalty bounded below the harsher bow/melee wrong-row penalty', () => {
    const spear = M53_POLEARM_ITEMS['ashwood-war-spear'].equip!.move!;
    const front = formationAttackProfile('front', spear, false);
    expect(front.hitModifier).toBe(-1);
    expect(front.hitModifier).toBeGreaterThanOrEqual(-1);
  });

  it('prevents polearm plus shield from becoming a universal offense-defense loadout', () => {
    for (const weapon of Object.keys(M53_POLEARM_ITEMS)) {
      const fighter = record(weapon);
      setOffhandId(fighter, 'salt-rim-kite-shield');
      const hand = handLoadoutProfile(fighter);
      expect(hand.weaponHands).toBe(2);
      expect(hand.shieldReady).toBe(false);
      expect(hand.shieldGuardBonus).toBe(0);
      expect(hand.offhandBurden).toBeGreaterThan(0);
    }
  });

  it('makes cross-trained polearms pay the same M43 proficiency costs instead of bypassing armory rules', () => {
    const swordsman = armoryProfile(record('ashwood-war-spear', 'swordsman'));
    const ranger = armoryProfile(record('ashwood-war-spear', 'ranger'));
    const mage = armoryProfile(record('ashwood-war-spear', 'mage'));
    expect(swordsman.weaponFit).toBe('mastered');
    expect(swordsman.weaponHitBonus).toBe(1);
    expect(ranger.weaponFit).toBe('trained');
    expect(ranger.weaponHitBonus).toBe(0);
    expect(mage.weaponFit).toBe('strained');
    expect(mage.weaponHitBonus).toBe(-2);
    expect(mage.damageAdjustment).toBe(-1);
    expect(mage.burden).toBeGreaterThan(swordsman.burden);
  });

  it('keeps reach identity move-based, not job-based', () => {
    const move = M53_POLEARM_ITEMS['ashwood-war-spear'].equip!.move!;
    expect(move.engagement).toBe('reach');
    for (const job of ['swordsman', 'ranger', 'mage', 'cleric'] as const) {
      const profile = armoryProfile(record('ashwood-war-spear', job));
      expect(profile.weaponFit).not.toBeNull();
    }
  });

  it('does not smuggle crowd control, area damage or passive stats into the new range archetype', () => {
    for (const item of Object.values(M53_POLEARM_ITEMS)) {
      const move = item.equip!.move!;
      expect(move.area).not.toBe(true);
      expect(move.applyStatus).toBeUndefined();
      expect(item.equip?.defense).toBeUndefined();
      expect(item.equip?.maxHp).toBeUndefined();
      expect(item.equip?.bonus).toBeUndefined();
    }
  });
});
