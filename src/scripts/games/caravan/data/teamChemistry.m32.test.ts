import { describe, expect, it } from 'vitest';
import { newGame, type CompanionRecord, type SaveData } from '../save';
import { partyCheckBonus } from '../roster';
import { registerCompanionOrigin } from './companionOrigins';
import { conductTeamCouncil, teamChemistryProfile } from './teamChemistry';

function companion(
  id: string,
  name: string,
  trait: string,
  stats: CompanionRecord['stats'],
): CompanionRecord {
  return {
    id,
    name,
    job: trait === 'learned' ? 'mage' : trait === 'nimble' ? 'ranger' : 'swordsman',
    level: 3,
    xp: 120,
    stats: { ...stats },
    maxHp: 20,
    injuredForTrips: 0,
    trait,
    bond: 0,
    equipment: { weapon: null, armor: null, trinket: null },
  };
}

function registeredSave(): SaveData {
  const save = newGame(100, {
    job: 'cleric',
    trait: 'charming',
    allocation: { cha: 3 },
  });
  save.gold = 500;
  save.companions = [
    companion('a', '石衛', 'brawny', { str: 16, dex: 9, int: 8, cha: 9, con: 14 }),
    companion('b', '雲眼', 'nimble', { str: 9, dex: 17, int: 10, cha: 10, con: 12 }),
    companion('c', '墨頁', 'learned', { str: 8, dex: 10, int: 17, cha: 11, con: 9 }),
  ];
  for (const record of save.companions) registerCompanionOrigin(save, record.id);
  return save;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('M32 team chemistry councils', () => {
  it('is deterministic and read-only while previewing', () => {
    const save = registeredSave();
    const before = JSON.stringify(save);
    const ids = [save.protagonist.id, 'a', 'b', 'c'];
    const first = teamChemistryProfile(save, ids);
    const second = teamChemistryProfile(save, [...ids].reverse());
    expect(first.signature).toBe(second.signature);
    expect(first.score).toBe(second.score);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('turns a successful council into real bond-tier check value', () => {
    const save = registeredSave();
    const ids = [save.protagonist.id, 'a', 'b', 'c'];
    const profile = teamChemistryProfile(save, ids);
    expect(profile.eligible).toBe(true);
    expect(profile.score).toBeGreaterThanOrEqual(1);
    const beforeBonus = partyCheckBonus(save, ids);
    const beforeGold = save.gold;
    const result = conductTeamCouncil(save, ids);
    expect(save.gold).toBe(beforeGold - profile.councilCost);
    expect(result.bondReward).toBeGreaterThanOrEqual(2);
    expect(save.companions.every((record) => (record.bond ?? 0) === result.bondReward)).toBe(true);
    expect(partyCheckBonus(save, ids)).toBeGreaterThan(beforeBonus);
  });

  it('blocks a conflicting team without any mutation', () => {
    const save = registeredSave();
    for (const record of [save.protagonist, ...save.companions]) {
      record.genesis = { lifepathId: 'brawny', aptitudeId: 'str', burdenId: 'cha' };
      record.careerMilestones = [{ level: 2, pathId: 'martial', score: 10 }];
      record.growth = { potential: { str: 5, dex: 2, int: 2, cha: 1, con: 4 } };
    }
    const ids = [save.protagonist.id, 'a', 'b', 'c'];
    const profile = teamChemistryProfile(save, ids);
    expect(profile.score).toBeLessThan(0);
    expect(profile.eligible).toBe(false);
    const before = JSON.stringify(save);
    expect(() => conductTeamCouncil(save, ids)).toThrow(/化學反應為負/);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('has three global slots that roster churn cannot reset', () => {
    const save = registeredSave();
    const rosters = [
      [save.protagonist.id, 'a', 'b', 'c'],
      [save.protagonist.id, 'a', 'b'],
      [save.protagonist.id, 'b', 'c'],
    ];
    for (const ids of rosters) {
      const profile = teamChemistryProfile(save, ids);
      if (profile.score < 0) {
        for (const record of save.companions) record.bond = 9;
      }
      conductTeamCouncil(save, ids);
    }
    expect(save.flags['company-council-slot:1']).toBe(true);
    expect(save.flags['company-council-slot:2']).toBe(true);
    expect(save.flags['company-council-slot:3']).toBe(true);
    const fourth = teamChemistryProfile(save, [save.protagonist.id, 'a', 'c']);
    expect(fourth.eligible).toBe(false);
    expect(fourth.blockingReasons.join(' ')).toMatch(/三次/);
  });

  it('rejects invalid membership, injuries, and insufficient funds atomically', () => {
    const cases: Array<(save: SaveData) => string[]> = [
      () => ['a', 'b'],
      (save) => [save.protagonist.id, 'missing'],
      (save) => {
        save.companions[0].injuredForTrips = 1;
        return [save.protagonist.id, 'a'];
      },
      (save) => {
        save.gold = 0;
        return [save.protagonist.id, 'a', 'b'];
      },
    ];
    for (const arrange of cases) {
      const save = registeredSave();
      const ids = arrange(save);
      const before = clone(save);
      expect(() => conductTeamCouncil(save, ids)).toThrow();
      expect(save).toEqual(before);
    }
  });

  it('never repeats a completed council receipt', () => {
    const save = registeredSave();
    const ids = [save.protagonist.id, 'a', 'b', 'c'];
    conductTeamCouncil(save, ids);
    const after = clone(save);
    // Rewind only the global slot to simulate a corrupted save; signature receipt still protects the transaction.
    delete save.flags['company-council-slot:1'];
    expect(() => conductTeamCouncil(save, ids)).toThrow(/已經完成/);
    expect(save.gold).toBe(after.gold);
    expect(save.companions.map((record) => record.bond)).toEqual(after.companions.map((record) => record.bond));
  });
});
