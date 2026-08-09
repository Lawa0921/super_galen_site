import { describe, expect, it } from 'vitest';
import {
  enemyAct,
  partyAct,
  startCombat,
  type EnemyUnit,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { setOffhandId } from './offhandShields.m52';
import { VETERAN_REPOSITION_MOVE_ID } from './veteranMastery.m51';

const initRng: Rng = {
  next: () => 0,
  roll: () => 2,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

function attackRng(d20: number, damage = 2): Rng {
  return {
    next: () => 0,
    roll: () => damage,
    d20: () => d20,
    pick: (items) => items[0],
    weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
  };
}

function record(xp = 320): CompanionRecord {
  return {
    id: `fighter-${xp}`, name: '盾兵', job: 'swordsman', level: 5, xp,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    equipment: { weapon: 'salt-crystal-blade', armor: null, trinket: null },
  };
}

function enemy(): EnemyUnit {
  return {
    id: 'foe', name: '測試敵兵',
    stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 40, hp: 40, defense: 12,
    moves: [{
      id: 'enemy-strike', name: '刀擊', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4 }, narration: '{actor}攻擊{target}，造成 {amount} 點傷害！',
    }],
    intents: [{ weight: 1, moveId: 'enemy-strike' }],
  };
}

function guardMove(member: PartyMember) {
  const move = member.moves.find((candidate) => candidate.id === 'guard');
  if (!move) throw new Error('test member has no guard');
  return move;
}

function setEnemyTurn(state: ReturnType<typeof startCombat>): void {
  state.turnIndex = state.order.indexOf('foe');
}

function runGuardedHit(offhand: string | null, weapon = 'salt-crystal-blade', die = 16): { hp: number; member: PartyMember } {
  const source = record();
  source.equipment.weapon = weapon;
  if (offhand) setOffhandId(source, offhand);
  const defender = memberFromRecord(source);
  defender.formationRow = 'front';
  defender.defense = 12; // isolate guard math from job/equipment base defense
  const state = startCombat(initRng, [defender], [enemy()]);
  state.guarding[defender.id] = true;
  setEnemyTurn(state);
  enemyAct(attackRng(die), state, 'foe');
  return { hp: defender.hp, member: defender };
}

describe('M52 live shield combat integration', () => {
  it('does not change passive defense or unguarded hit resolution', () => {
    const plain = memberFromRecord(record());
    const shieldRecord = record();
    setOffhandId(shieldRecord, 'salt-rim-kite-shield');
    const shielded = memberFromRecord(shieldRecord);
    expect(shielded.defense).toBe(plain.defense);

    plain.formationRow = 'front';
    shielded.formationRow = 'front';
    plain.defense = 12;
    shielded.defense = 12;
    const plainState = startCombat(initRng, [plain], [enemy()]);
    const shieldState = startCombat(initRng, [shielded], [enemy()]);
    setEnemyTurn(plainState);
    setEnemyTurn(shieldState);
    enemyAct(attackRng(12), plainState, 'foe');
    enemyAct(attackRng(12), shieldState, 'foe');
    expect(plain.hp).toBeLessThan(plain.maxHp);
    expect(shielded.hp).toBeLessThan(shielded.maxHp);
    expect(shielded.hp).toBe(plain.hp);
  });

  it('resolves base guard, buckler guard and kite-shield guard as +4 / +5 / +6', () => {
    const baseAt16 = runGuardedHit(null, 'salt-crystal-blade', 16);
    const bucklerAt16 = runGuardedHit('oak-buckler', 'salt-crystal-blade', 16);
    const kiteAt17 = runGuardedHit('salt-rim-kite-shield', 'salt-crystal-blade', 17);
    const kiteAt18 = runGuardedHit('salt-rim-kite-shield', 'salt-crystal-blade', 18);

    expect(baseAt16.hp).toBeLessThan(baseAt16.member.maxHp); // DEF 12 + guard 4 = 16, hit
    expect(bucklerAt16.hp).toBe(bucklerAt16.member.maxHp); // 12 + 4 + 1 = 17, miss
    expect(kiteAt17.hp).toBe(kiteAt17.member.maxHp); // 12 + 4 + 2 = 18, miss
    expect(kiteAt18.hp).toBeLessThan(kiteAt18.member.maxHp); // exact 18 hits
  });

  it('stows the shield under a two-handed weapon, falling back to ordinary +4 guard', () => {
    const result = runGuardedHit('salt-rim-kite-shield', 'swordsaint-bokken', 16);
    expect(result.member.armoryProfile?.shieldReady).toBe(false);
    expect(result.member.armoryProfile?.shieldGuardBonus).toBe(0);
    expect(result.hp).toBeLessThan(result.member.maxHp);
    expect(guardMove(result.member).name).not.toContain('盾+');
  });

  it('shows the real shield guard value in the live pre-action guard label', () => {
    const source = record();
    setOffhandId(source, 'salt-rim-kite-shield');
    const member = memberFromRecord(source);
    member.formationRow = 'front';
    startCombat(initRng, [member], [enemy()]);
    expect(guardMove(member).name).toBe('防禦架勢〔護衛・盾+2〕');
  });

  it('lets M51 mastery-II guarded advance benefit from a ready shield, with the result visible before click', () => {
    const source = record(500);
    setOffhandId(source, 'oak-buckler');
    const veteran = memberFromRecord(source);
    veteran.formationRow = 'back';
    veteran.defense = 12;
    const anchor: PartyMember = {
      id: 'anchor', name: '前排同伴',
      stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
      maxHp: 30, hp: 30, defense: 12, formationRow: 'front',
      moves: [{ id: 'anchor-hit', name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str', narration: '' }],
    };
    const state = startCombat(initRng, [anchor, veteran], [enemy()]);
    const shift = veteran.moves.find((move) => move.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(shift.name).toContain('前進・守勢・盾+1');

    state.turnIndex = state.order.indexOf(veteran.id);
    const acted = partyAct(initRng, state, veteran.id, shift.id, veteran.id);
    expect(acted.acted).toBe(true);
    expect(veteran.formationRow).toBe('front');
    expect(state.guarding[veteran.id]).toBe(true);

    veteran.hp = 5; // make enemy choose the guarded veteran over anchor
    setEnemyTurn(state);
    enemyAct(attackRng(16), state, 'foe');
    expect(veteran.hp).toBe(5); // DEF 12 + guard 4 + buckler 1 = 17
  });

  it('does not duplicate shield suffixes after repeated combat initialization', () => {
    const source = record();
    setOffhandId(source, 'oak-buckler');
    const member = memberFromRecord(source);
    member.formationRow = 'front';
    startCombat(initRng, [member], [enemy()]);
    const once = guardMove(member).name;
    startCombat(initRng, [member], [enemy()]);
    const twice = guardMove(member).name;
    expect(twice).toBe(once);
    expect((twice.match(/盾\+1/g) ?? []).length).toBe(1);
  });
});
