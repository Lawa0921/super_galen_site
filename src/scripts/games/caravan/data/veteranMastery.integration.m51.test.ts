import { describe, expect, it } from 'vitest';
import {
  partyAct,
  partyMoveAvailability,
  startCombat,
  type EnemyUnit,
  type PartyMember,
} from '../combat';
import type { Rng } from '../rng';
import type { CompanionRecord } from '../save';
import { memberFromRecord } from './jobs';
import { VETERAN_REPOSITION_MOVE_ID } from './veteranMastery.m51';

const rng: Rng = {
  next: () => 0,
  roll: () => 4,
  d20: () => 10,
  pick: (items) => items[0],
  weightedPick: (items) => items.find((item) => item.weight > 0)!.value,
};

function record(id: string, xp: number, job: CompanionRecord['job'] = 'swordsman'): CompanionRecord {
  return {
    id,
    name: id,
    job,
    level: 5,
    xp,
    stats: job === 'ranger'
      ? { str: 10, dex: 16, int: 10, cha: 10, con: 10 }
      : { str: 14, dex: 10, int: 8, cha: 10, con: 14 },
    maxHp: job === 'ranger' ? 20 : 26,
    injuredForTrips: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function enemy(): EnemyUnit {
  return {
    id: 'foe', name: '伏兵',
    stats: { str: 12, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 40, hp: 40, defense: 12,
    moves: [{
      id: 'club', name: '棍擊', kind: 'attack', target: 'enemy', hitStat: 'str',
      damage: { dice: 1, sides: 4, bonusStat: 'str' }, narration: '{actor}攻擊{target}，造成 {amount} 點傷害。',
    }],
    intents: [{ weight: 1, moveId: 'club' }],
  };
}

function plainMember(id: string, row: 'front' | 'back', defense = 12): PartyMember {
  return {
    id, name: id,
    stats: { str: 10, dex: 10, int: 8, cha: 8, con: 10 },
    maxHp: 20, hp: 20, defense, formationRow: row,
    moves: [{ id: `${id}-strike`, name: '攻擊', kind: 'attack', target: 'enemy', hitStat: 'str', narration: '' }],
  };
}

function actVeteran(state: ReturnType<typeof startCombat>, actor: PartyMember) {
  state.turnIndex = state.order.indexOf(actor.id);
  return partyAct(rng, state, actor.id, VETERAN_REPOSITION_MOVE_ID, actor.id);
}

describe('M51 live veteran mastery', () => {
  it('adds the veteran action outside the four-slot prepared loadout and reports mastery at combat start', () => {
    const veteran = memberFromRecord(record('veteran', 320));
    veteran.formationRow = 'back';
    const preparedCount = veteran.moves.filter((move) => move.id !== VETERAN_REPOSITION_MOVE_ID).length;
    expect(preparedCount).toBeLessThanOrEqual(4);
    expect(veteran.moves.some((move) => move.id === VETERAN_REPOSITION_MOVE_ID)).toBe(true);

    const state = startCombat(rng, [plainMember('anchor', 'front'), veteran], [enemy()]);
    expect(veteran.moves.find((move) => move.id === VETERAN_REPOSITION_MOVE_ID)?.name).toBe('戰術換位〔前進〕');
    expect(state.log.some((entry) => entry.text.includes('老兵精通 I') && entry.text.includes('500 XP'))).toBe(true);
  });

  it('rank I spends a full turn to advance without gaining free damage or guard', () => {
    const veteran = memberFromRecord(record('veteran', 320));
    veteran.formationRow = 'back';
    const foe = enemy();
    const state = startCombat(rng, [plainMember('anchor', 'front'), veteran], [foe]);
    state.turnIndex = state.order.indexOf(veteran.id);
    const beforeTurn = state.turnIndex;
    const beforeHp = foe.hp;

    const result = partyAct(rng, state, veteran.id, VETERAN_REPOSITION_MOVE_ID, veteran.id);

    expect(result.acted).toBe(true);
    expect(veteran.formationRow).toBe('front');
    expect(state.guarding[veteran.id]).not.toBe(true);
    expect(foe.hp).toBe(beforeHp);
    expect(state.turnIndex).not.toBe(beforeTurn);
    expect(veteran.moves.find((move) => move.id === VETERAN_REPOSITION_MOVE_ID)?.name).toBe('戰術換位〔後撤〕');
  });

  it('rank I can fall back only while another living frontline member remains', () => {
    const veteran = memberFromRecord(record('veteran', 320));
    veteran.formationRow = 'front';
    const anchor = plainMember('anchor', 'front');
    const state = startCombat(rng, [veteran, anchor], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toBe('戰術換位〔後撤〕');
    expect(partyMoveAvailability(veteran, move).allowed).toBe(true);

    actVeteran(state, veteran);
    expect(veteran.formationRow).toBe('back');
    expect(anchor.formationRow).toBe('front');
  });

  it('blocks a last-frontline fallback without consuming the turn or creating an all-rear exploit', () => {
    const veteran = memberFromRecord(record('veteran', 320));
    veteran.formationRow = 'front';
    const rear = plainMember('rear', 'back');
    const state = startCombat(rng, [veteran, rear], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toBe('戰術換位〔無人接替〕');
    expect(partyMoveAvailability(veteran, move).allowed).toBe(false);

    state.turnIndex = state.order.indexOf(veteran.id);
    const beforeTurn = state.turnIndex;
    const result = partyAct(rng, state, veteran.id, move.id, veteran.id);
    expect(result.acted).toBe(false);
    expect(state.turnIndex).toBe(beforeTurn);
    expect(veteran.formationRow).toBe('front');
    expect(state.party.some((member) => member.hp > 0 && member.formationRow !== 'back')).toBe(true);
  });

  it('rank II turns a costly rear-to-front advance into a guarded entry, not a passive stat bonus', () => {
    const veteran = memberFromRecord(record('veteran', 500));
    veteran.formationRow = 'back';
    const state = startCombat(rng, [plainMember('anchor', 'front'), veteran], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toBe('戰術換位〔前進・守勢〕');

    actVeteran(state, veteran);
    expect(veteran.formationRow).toBe('front');
    expect(state.guarding[veteran.id]).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('前進接戰') && entry.text.includes('守勢'))).toBe(true);
  });

  it('rank III lets the last front rotate out only by exposing the strongest rear defender', () => {
    const veteran = memberFromRecord(record('veteran', 750));
    veteran.formationRow = 'front';
    const rearWeak = plainMember('rear-weak', 'back', 11);
    const rearStrong = plainMember('rear-strong', 'back', 16);
    const state = startCombat(rng, [veteran, rearWeak, rearStrong], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toBe('戰術換位〔輪替後撤〕');
    expect(partyMoveAvailability(veteran, move).allowed).toBe(true);

    actVeteran(state, veteran);
    expect(veteran.formationRow).toBe('back');
    expect(rearStrong.formationRow).toBe('front');
    expect(rearWeak.formationRow).toBe('back');
    expect(state.party.some((member) => member.hp > 0 && member.formationRow !== 'back')).toBe(true);
    expect(state.log.some((entry) => entry.text.includes('rear-strong') && entry.text.includes('接替前線'))).toBe(true);
  });

  it('rank III still cannot disappear from the frontline when nobody can replace it', () => {
    const veteran = memberFromRecord(record('veteran', 750));
    veteran.formationRow = 'front';
    const state = startCombat(rng, [veteran], [enemy()]);
    const move = veteran.moves.find((candidate) => candidate.id === VETERAN_REPOSITION_MOVE_ID)!;
    expect(move.name).toBe('戰術換位〔無人接替〕');
    expect(partyMoveAvailability(veteran, move).allowed).toBe(false);
  });
});
