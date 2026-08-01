import { describe, expect, it } from 'vitest';
import { newGame, type SaveData } from '../save';
import {
  beginReliquaryBattleAttempt,
  finishReliquaryBattleAttempt,
} from './ashenReliquaryAttempts';

function save(): SaveData {
  const data = newGame(4050, { job: 'swordsman', trait: 'brawny', allocation: { str: 3 } });
  data.reputation = 30;
  data.inventory['dried-rations'] = 3;
  return data;
}

describe('M40 reliquary battle attempt receipts', () => {
  it('records the first attempt without charging a penalty and clears on normal settlement', () => {
    const data = save();
    const first = beginReliquaryBattleAttempt(data, 1);
    expect(first.abandonmentPenalty).toBeNull();
    expect(data.flags[first.receipt]).toBe(true);
    expect(data.inventory['dried-rations']).toBe(3);
    finishReliquaryBattleAttempt(data, 1);
    expect(data.flags[first.receipt]).toBe(false);
  });

  it('charges one ration when the previous page was abandoned and does not stack within one re-entry', () => {
    const data = save();
    beginReliquaryBattleAttempt(data, 1);
    const second = beginReliquaryBattleAttempt(data, 1);
    expect(second.abandonmentPenalty).toContain('乾糧 1');
    expect(data.inventory['dried-rations']).toBe(2);
    expect(data.flags[second.receipt]).toBe(true);
    finishReliquaryBattleAttempt(data, 1);
    const third = beginReliquaryBattleAttempt(data, 1);
    expect(third.abandonmentPenalty).toBeNull();
    expect(data.inventory['dried-rations']).toBe(2);
  });

  it('injures the captain instead of creating negative rations when supplies are empty', () => {
    const data = save();
    data.inventory['dried-rations'] = 0;
    beginReliquaryBattleAttempt(data, 1);
    const second = beginReliquaryBattleAttempt(data, 1);
    expect(second.abandonmentPenalty).toContain('隊長');
    expect(data.inventory['dried-rations']).toBe(0);
    expect(data.protagonist.injuredForTrips).toBe(1);
  });

  it('rejects attempts for future acts without mutating the save', () => {
    const data = save();
    const before = JSON.stringify(data);
    expect(() => beginReliquaryBattleAttempt(data, 2)).toThrow();
    expect(JSON.stringify(data)).toBe(before);
  });
});
