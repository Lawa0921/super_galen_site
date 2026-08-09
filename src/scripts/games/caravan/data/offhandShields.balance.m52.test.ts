import { describe, expect, it } from 'vitest';
import { startCombat, type EnemyUnit } from '../combat';
import type { Rng } from '../rng';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { TOWNS } from './towns';
import { armoryProfile } from './armory';
import {
  M52_OFFHAND_ITEMS,
  handLoadoutProfile,
  setOffhandId,
} from './offhandShields.m52';
import { combatMoveForecast } from './combatReadability.m50';

const rng: Rng = {
  next: () => 0,
  roll: () => 2,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

const dummy = (): EnemyUnit => ({
  id: 'dummy', name: '木樁', stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
  maxHp: 30, hp: 30, defense: 10,
  moves: [{ id: 'dummy-hit', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str', narration: '' }],
  intents: [{ weight: 1, moveId: 'dummy-hit' }],
});

function record(job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id: `m52-${job}`, name: '審查角色', job, level: 5, xp: 750,
    stats: { str: 14, dex: 14, int: 16, cha: 14, con: 14 },
    maxHp: 28, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function passiveSnapshot(source: CompanionRecord) {
  const member = memberFromRecord(source);
  return { stats: member.stats, defense: member.defense, maxHp: member.maxHp, damageBonus: member.damageBonus ?? 0 };
}

describe('M52 multidimensional player adversarial review', () => {
  it('prevents shields from becoming a mandatory passive fourth armor slot', () => {
    const plain = record(); plain.equipment.weapon = 'salt-crystal-blade';
    const buckler = record(); buckler.equipment.weapon = 'salt-crystal-blade'; setOffhandId(buckler, 'oak-buckler');
    expect(passiveSnapshot(buckler)).toEqual(passiveSnapshot(plain));
  });

  it('makes stronger guard protection pay more burden instead of strictly dominating the buckler', () => {
    const buckler = record(); buckler.equipment.weapon = 'salt-crystal-blade'; setOffhandId(buckler, 'oak-buckler');
    const kite = record(); kite.equipment.weapon = 'salt-crystal-blade'; setOffhandId(kite, 'salt-rim-kite-shield');
    const light = handLoadoutProfile(buckler);
    const heavy = handLoadoutProfile(kite);
    expect(heavy.shieldGuardBonus).toBeGreaterThan(light.shieldGuardBonus);
    expect(heavy.offhandBurden).toBeGreaterThan(light.offhandBurden);
    expect(heavy.manaCapacity).toBeLessThanOrEqual(light.manaCapacity);
  });

  it('gives two-handed loadouts a real opportunity cost instead of allowing bow/staff plus active shield', () => {
    const bow = record('ranger'); bow.equipment.weapon = 'ridge-mist-bow'; setOffhandId(bow, 'salt-rim-kite-shield');
    const bowProfile = armoryProfile(bow);
    expect(bowProfile.weaponHands).toBe(2);
    expect(bowProfile.shieldReady).toBe(false);
    expect(bowProfile.shieldGuardBonus).toBe(0);
    expect(bowProfile.burden).toBeGreaterThan(0);

    const staff = record('mage'); staff.equipment.weapon = 'brine-crystal-staff'; setOffhandId(staff, 'salt-rim-kite-shield');
    const staffProfile = armoryProfile(staff);
    expect(staffProfile.weaponHands).toBe(2);
    expect(staffProfile.shieldReady).toBe(false);
    expect(staffProfile.mysticCapacity.mana).toBeGreaterThanOrEqual(1);
  });

  it('does not let a ranger exploit an empty weapon item slot to activate a shield beside the implicit bow', () => {
    const ranger = record('ranger'); setOffhandId(ranger, 'oak-buckler');
    const profile = handLoadoutProfile(ranger);
    expect(profile.weaponHands).toBe(2);
    expect(profile.shieldReady).toBe(false);
  });

  it('keeps heavy-shield casting interference contextual: active in hand, absent while stowed', () => {
    const active = record('mage'); setOffhandId(active, 'salt-rim-kite-shield');
    const activeProfile = armoryProfile(active);
    const stowed = record('mage'); stowed.equipment.weapon = 'ghostflame-staff'; setOffhandId(stowed, 'salt-rim-kite-shield');
    const stowedProfile = armoryProfile(stowed);
    expect(activeProfile.shieldReady).toBe(true);
    expect(activeProfile.mysticCapacity.mana).toBe(-1);
    expect(stowedProfile.shieldReady).toBe(false);
    expect(stowedProfile.mysticCapacity.mana).toBe(1);
  });

  it('makes pre-action guard information match the actual shield-ready profile', () => {
    const source = record(); source.equipment.weapon = 'salt-crystal-blade'; setOffhandId(source, 'salt-rim-kite-shield');
    const member = memberFromRecord(source); member.formationRow = 'front';
    const guard = member.moves.find((move) => move.id === 'guard')!;
    const forecast = combatMoveForecast(member, guard);
    expect(forecast.shortLabel).toContain('盾+2');
    expect(forecast.hint).toContain('防禦 +6');
    expect(forecast.hint).toContain('含盾牌 +2');

    source.equipment.weapon = 'swordsaint-bokken';
    const stowed = memberFromRecord(source); stowed.formationRow = 'front';
    const stowedGuard = stowed.moves.find((move) => move.id === 'guard')!;
    const stowedForecast = combatMoveForecast(stowed, stowedGuard);
    expect(stowedForecast.shortLabel).not.toContain('盾+');
    expect(stowedForecast.hint).toContain('防禦 +4');
  });

  it('keeps the bulwark specialization playable without inventing a shield, while using shield wording when one is real', () => {
    const unshielded = record();
    unshielded.specialization = 'bulwark';
    unshielded.equipment.weapon = 'swordsaint-bokken';
    setOffhandId(unshielded, 'oak-buckler'); // stowed by the two-handed weapon
    const noShieldMember = memberFromRecord(unshielded); noShieldMember.formationRow = 'front';
    startCombat(rng, [noShieldMember], [dummy()]);
    const noShieldBash = noShieldMember.moves.find((move) => move.id === 'shield-bash')!;
    expect(noShieldBash.name).toContain('壁壘猛擊');
    expect(noShieldBash.name).not.toContain('盾牆');
    expect(noShieldBash.narration).not.toContain('盾面');

    const shielded = record();
    shielded.specialization = 'bulwark';
    shielded.equipment.weapon = 'salt-crystal-blade';
    setOffhandId(shielded, 'oak-buckler');
    const shieldMember = memberFromRecord(shielded); shieldMember.formationRow = 'front';
    startCombat(rng, [shieldMember], [dummy()]);
    const shieldBash = shieldMember.moves.find((move) => move.id === 'shield-bash')!;
    expect(shieldBash.name).toContain('盾牆猛擊');
    expect(shieldBash.narration).toContain('盾面');
  });

  it('keeps both shields in the real economy instead of making them debug-only equipment', () => {
    expect(TOWNS['starting-town'].stock).toContain('oak-buckler');
    expect(TOWNS['salt-spring-city'].stock).toContain('salt-rim-kite-shield');
    expect(M52_OFFHAND_ITEMS['oak-buckler'].value).toBeGreaterThan(0);
    expect(M52_OFFHAND_ITEMS['salt-rim-kite-shield'].value).toBeGreaterThan(M52_OFFHAND_ITEMS['oak-buckler'].value);
  });

  it('bounds shield guard bonus so later gear cannot silently turn guard into near-invulnerability', () => {
    for (const item of Object.values(M52_OFFHAND_ITEMS)) {
      const source = record(); source.equipment.weapon = 'salt-crystal-blade'; setOffhandId(source, item.id);
      const profile = handLoadoutProfile(source);
      expect(profile.shieldGuardBonus).toBeGreaterThanOrEqual(0);
      expect(profile.shieldGuardBonus).toBeLessThanOrEqual(2);
    }
  });
});
