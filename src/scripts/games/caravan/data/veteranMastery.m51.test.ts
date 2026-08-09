import { describe, expect, it } from 'vitest';
import type { CompanionRecord } from '../save';
import type { Move } from '../combat';
import {
  VETERAN_REPOSITION_MOVE_ID,
  VETERAN_XP_THRESHOLDS,
  appendVeteranMasteryMoves,
  veteranMasteryProfile,
  veteranMasteryRank,
} from './veteranMastery.m51';

const record = (level: number, xp: number): CompanionRecord => ({
  id: `veteran-${level}-${xp}`,
  name: '老兵候補',
  job: 'swordsman',
  level,
  xp,
  stats: { str: 14, dex: 12, int: 8, cha: 10, con: 14 },
  maxHp: 26,
  injuredForTrips: 0,
  equipment: { weapon: null, armor: null, trinket: null },
});

const strike: Move = {
  id: 'test-strike', name: '試斬', kind: 'attack', target: 'enemy', hitStat: 'str',
  damage: { dice: 1, sides: 6, bonusStat: 'str' }, narration: '',
};

describe('M51 veteran mastery progression', () => {
  it('never lets pre-cap XP farming bypass the Lv5 career boundary', () => {
    expect(veteranMasteryRank(record(4, 9999))).toBe(0);
  });

  it('turns Lv5 and post-cap XP into three bounded horizontal mastery milestones', () => {
    expect(VETERAN_XP_THRESHOLDS).toEqual([320, 500, 750]);
    expect(veteranMasteryRank(record(5, 319))).toBe(0);
    expect(veteranMasteryRank(record(5, 320))).toBe(1);
    expect(veteranMasteryRank(record(5, 499))).toBe(1);
    expect(veteranMasteryRank(record(5, 500))).toBe(2);
    expect(veteranMasteryRank(record(5, 749))).toBe(2);
    expect(veteranMasteryRank(record(5, 750))).toBe(3);
    expect(veteranMasteryRank(record(5, 99999))).toBe(3);
  });

  it('shows the next concrete XP goal instead of silently discarding post-cap XP meaning', () => {
    expect(veteranMasteryProfile(record(5, 320))).toMatchObject({ rank: 1, nextXp: 500 });
    expect(veteranMasteryProfile(record(5, 500))).toMatchObject({ rank: 2, nextXp: 750 });
    expect(veteranMasteryProfile(record(5, 750))).toMatchObject({ rank: 3, nextXp: null });
  });

  it('adds tactical reposition as a bonus mastery action without consuming or duplicating prepared moves', () => {
    const before = [strike];
    expect(appendVeteranMasteryMoves(record(4, 9999), before).map((move) => move.id)).toEqual(['test-strike']);
    const veteran = appendVeteranMasteryMoves(record(5, 320), before);
    expect(veteran.map((move) => move.id)).toEqual(['test-strike', VETERAN_REPOSITION_MOVE_ID]);
    expect(before).toHaveLength(1);
    expect(appendVeteranMasteryMoves(record(5, 750), veteran).filter((move) => move.id === VETERAN_REPOSITION_MOVE_ID)).toHaveLength(1);
  });
});
