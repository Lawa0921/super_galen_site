import { describe, expect, it } from 'vitest';
import { partyAct, startCombat, type EnemyUnit, type PartyMember } from '../combat';
import type { Rng } from '../rng';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { VETERAN_REPOSITION_MOVE_ID, veteranMasteryRank } from './veteranMastery.m51';

const rng: Rng = {
  next: () => 0,
  roll: () => 3,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

function record(xp: number): CompanionRecord {
  return {
    id: `fighter-${xp}`, name: '老兵', job: 'swordsman', level: 5, xp,
    stats: { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: 26, injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function enemy(): EnemyUnit {
  return {
    id: 'foe', name: '敵人', stats: { str: 12, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 30, hp: 30, defense: 12,
    moves: [{ id: 'hit', name: '攻擊', kind: 'attack', target: 'enemy', hitStat: 'str', damage: { dice: 1, sides: 4 }, narration: '' }],
    intents: [{ weight: 1, moveId: 'hit' }],
  };
}

function anchor(id: string, row: 'front' | 'back' = 'front'): PartyMember {
  return {
    id, name: id, stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 20, hp: 20, defense: 12, formationRow: row,
    moves: [{ id: `${id}-attack`, name: '揮擊', kind: 'attack', target: 'enemy', hitStat: 'str', narration: '' }],
  };
}

function combatSnapshot(member: PartyMember) {
  return {
    stats: member.stats,
    maxHp: member.maxHp,
    defense: member.defense,
    damageBonus: member.damageBonus ?? 0,
  };
}

describe('M51 multidimensional player adversarial review', () => {
  it('adds no passive power from rank I through III', () => {
    const rank1 = memberFromRecord(record(320));
    const rank2 = memberFromRecord(record(500));
    const rank3 = memberFromRecord(record(750));
    expect(combatSnapshot(rank2)).toEqual(combatSnapshot(rank1));
    expect(combatSnapshot(rank3)).toEqual(combatSnapshot(rank1));
  });

  it('keeps mastery bounded instead of creating an endless post-cap stat ladder', () => {
    expect(veteranMasteryRank({ level: 5, xp: 750 })).toBe(3);
    expect(veteranMasteryRank({ level: 5, xp: 750000 })).toBe(3);
  });

  it('cannot be unlocked early by stockpiling XP below Lv5', () => {
    expect(veteranMasteryRank({ level: 4, xp: 750000 })).toBe(0);
  });

  it('never creates a zero-frontline safe state after a legal veteran action', () => {
    for (const xp of [320, 500, 750]) {
      const veteran = memberFromRecord(record(xp));
      veteran.formationRow = 'front';
      const otherFront = anchor(`front-${xp}`, 'front');
      const rear = anchor(`rear-${xp}`, 'back');
      const state = startCombat(rng, [veteran, otherFront, rear], [enemy()]);
      state.turnIndex = state.order.indexOf(veteran.id);
      const action = partyAct(rng, state, veteran.id, VETERAN_REPOSITION_MOVE_ID, veteran.id);
      expect(action.acted).toBe(true);
      expect(state.party.some((member) => member.hp > 0 && member.formationRow !== 'back')).toBe(true);
    }
  });

  it('makes every successful shift consume the actor turn, preventing free ranged/melee stance dancing', () => {
    const veteran = memberFromRecord(record(750));
    veteran.formationRow = 'back';
    const state = startCombat(rng, [anchor('front'), veteran], [enemy()]);
    state.turnIndex = state.order.indexOf(veteran.id);
    const before = state.turnIndex;
    const result = partyAct(rng, state, veteran.id, VETERAN_REPOSITION_MOVE_ID, veteran.id);
    expect(result.acted).toBe(true);
    expect(state.turnIndex).not.toBe(before);
  });

  it('does not consume a turn when the UI says there is nobody to replace the last front', () => {
    const veteran = memberFromRecord(record(320));
    veteran.formationRow = 'front';
    const state = startCombat(rng, [veteran, anchor('rear', 'back')], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toContain('無人接替');
    state.turnIndex = state.order.indexOf(veteran.id);
    const before = state.turnIndex;
    const result = partyAct(rng, state, veteran.id, move.id, veteran.id);
    expect(result.acted).toBe(false);
    expect(state.turnIndex).toBe(before);
  });

  it('does not stack dynamic reposition suffixes when a runtime member enters combat repeatedly', () => {
    const veteran = memberFromRecord(record(500));
    veteran.formationRow = 'back';
    startCombat(rng, [anchor('front-a'), veteran], [enemy()]);
    const once = veteran.moves.find((move) => move.id === VETERAN_REPOSITION_MOVE_ID)!.name;
    startCombat(rng, [anchor('front-b'), veteran], [enemy()]);
    const twice = veteran.moves.find((move) => move.id === VETERAN_REPOSITION_MOVE_ID)!.name;
    expect(twice).toBe(once);
    expect((twice.match(/前進/g) ?? []).length).toBe(1);
  });

  it('normalizes an impossible all-rear veteran opening instead of letting mastery preserve phantom safety', () => {
    const veteran = memberFromRecord(record(750));
    veteran.formationRow = 'back';
    const rear = anchor('rear', 'back');
    const state = startCombat(rng, [veteran, rear], [enemy()]);
    expect(state.party.every((member) => member.formationRow === 'front')).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('前線崩潰'))).toBe(true);
  });
});
