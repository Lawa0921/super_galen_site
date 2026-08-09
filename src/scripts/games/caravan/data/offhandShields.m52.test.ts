import { describe, expect, it } from 'vitest';
import type { CompanionRecord } from '../save';
import { armoryProfile } from './armory';
import {
  M52_OFFHAND_ITEMS,
  equipOffhandItem,
  equipmentView,
  handLoadoutProfile,
  offhandId,
  setOffhandId,
  unequipOffhandItem,
  weaponHands,
} from './offhandShields.m52';

function record(job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id: 'm52-test', name: '測試者', job, level: 5, xp: 750,
    stats: { str: 14, dex: 12, int: 14, cha: 12, con: 14 },
    maxHp: 28, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

describe('M52 offhand and handedness rules', () => {
  it('keeps legacy v6 three-slot records valid without mutating them just by reading', () => {
    const legacy = record();
    const before = JSON.stringify(legacy);
    expect(offhandId(legacy)).toBeNull();
    expect(handLoadoutProfile(legacy).shieldReady).toBe(false);
    expect(JSON.stringify(legacy)).toBe(before);
    expect('offhand' in equipmentView(legacy)).toBe(false);
  });

  it('classifies one-handed and two-handed weapons explicitly', () => {
    expect(weaponHands('salt-crystal-blade')).toBe(1);
    expect(weaponHands('brine-blessed-mace')).toBe(1);
    expect(weaponHands('ridge-mist-bow')).toBe(2);
    expect(weaponHands('ghostflame-staff')).toBe(2);
    expect(weaponHands('brine-crystal-staff')).toBe(2);
    expect(weaponHands('swordsaint-bokken')).toBe(2);
  });

  it('treats the ranger default bow as two-handed even with an empty weapon item slot', () => {
    const ranger = record('ranger');
    setOffhandId(ranger, 'oak-buckler');
    const hand = handLoadoutProfile(ranger);
    expect(ranger.equipment.weapon).toBeNull();
    expect(hand.weaponHands).toBe(2);
    expect(hand.shieldReady).toBe(false);
    expect(hand.shieldGuardBonus).toBe(0);
    expect(hand.warning).toContain('游俠的預設弓');
  });

  it('makes a buckler ready beside a one-handed weapon but never grants passive defense', () => {
    const fighter = record();
    fighter.equipment.weapon = 'salt-crystal-blade';
    setOffhandId(fighter, 'oak-buckler');
    const hand = handLoadoutProfile(fighter);
    const profile = armoryProfile(fighter);
    expect(hand.shieldReady).toBe(true);
    expect(hand.shieldGuardBonus).toBe(1);
    expect(hand.offhandBurden).toBe(1);
    expect(profile.defenseAdjustment).toBe(0);
    expect(profile.shieldGuardBonus).toBe(1);
    expect(profile.burden).toBeGreaterThanOrEqual(3);
  });

  it('stows a shield under a two-handed weapon while keeping its burden', () => {
    const archer = record('ranger');
    archer.equipment.weapon = 'ridge-mist-bow';
    setOffhandId(archer, 'oak-buckler');
    const hand = handLoadoutProfile(archer);
    expect(hand.weaponHands).toBe(2);
    expect(hand.shieldReady).toBe(false);
    expect(hand.shieldGuardBonus).toBe(0);
    expect(hand.offhandBurden).toBe(1);
    expect(hand.warning).toContain('佔滿雙手');
    expect(hand.warning).toContain('守勢加成不生效');
  });

  it('applies the heavy shield casting penalty only while the shield is actually in hand', () => {
    const mage = record('mage');
    mage.equipment.weapon = null;
    setOffhandId(mage, 'salt-rim-kite-shield');
    const ready = handLoadoutProfile(mage);
    expect(ready.shieldReady).toBe(true);
    expect(ready.shieldGuardBonus).toBe(2);
    expect(ready.manaCapacity).toBe(-1);

    mage.equipment.weapon = 'ghostflame-staff';
    const stowed = handLoadoutProfile(mage);
    expect(stowed.shieldReady).toBe(false);
    expect(stowed.shieldGuardBonus).toBe(0);
    expect(stowed.manaCapacity).toBe(0);
    expect(stowed.offhandBurden).toBe(2);
  });

  it('moves shields between inventory and the optional offhand slot without a new save schema', () => {
    const fighter = record();
    const save = { inventory: { 'oak-buckler': 1, 'salt-rim-kite-shield': 1 } };
    equipOffhandItem(save, fighter, 'oak-buckler');
    expect(offhandId(fighter)).toBe('oak-buckler');
    expect(save.inventory['oak-buckler']).toBeUndefined();

    equipOffhandItem(save, fighter, 'salt-rim-kite-shield');
    expect(offhandId(fighter)).toBe('salt-rim-kite-shield');
    expect(save.inventory['oak-buckler']).toBe(1);
    expect(save.inventory['salt-rim-kite-shield']).toBeUndefined();

    unequipOffhandItem(save, fighter);
    expect(offhandId(fighter)).toBeNull();
    expect(save.inventory['salt-rim-kite-shield']).toBe(1);
  });

  it('keeps the M52 item definitions bounded to guard utility rather than passive stat bundles', () => {
    for (const shield of Object.values(M52_OFFHAND_ITEMS)) {
      expect(shield.equip.slot).toBe('offhand');
      expect(shield.equip.offhandKind).toBe('shield');
      expect('bonus' in shield.equip).toBe(false);
      expect('defense' in shield.equip).toBe(false);
      expect('maxHp' in shield.equip).toBe(false);
      expect('move' in shield.equip).toBe(false);
    }
  });
});
