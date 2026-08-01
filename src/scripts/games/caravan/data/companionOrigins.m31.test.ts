import { describe, expect, it } from 'vitest';
import type { CompanionRecord, SaveData } from '../save';
import {
  companionOriginFingerprint,
  previewAllCompanionOrigins,
  previewCompanionOrigin,
  registerCompanionOrigin,
} from './companionOrigins';

function companion(overrides: Partial<CompanionRecord> = {}): CompanionRecord {
  return {
    id: 'companion-a',
    name: '沈昭',
    job: 'ranger',
    level: 3,
    xp: 120,
    stats: { str: 10, dex: 15, int: 11, cha: 9, con: 12 },
    maxHp: 22,
    injuredForTrips: 0,
    trait: 'nimble',
    equipment: { weapon: null, armor: null, trinket: null },
    bond: 4,
    skills: { scouting: 1 },
    skillPoints: 1,
    ...overrides,
  };
}

function saveWith(companions: CompanionRecord[] = [companion()]): SaveData {
  return {
    version: 6,
    createdAt: 100,
    gold: 321,
    flags: {},
    protagonist: {
      id: 'protagonist', name: '你', job: 'swordsman', level: 1, xp: 0,
      stats: { str: 12, dex: 12, int: 10, cha: 12, con: 12 },
      maxHp: 22, injuredForTrips: 0, trait: null,
      equipment: { weapon: null, armor: null, trinket: null },
    },
    companions,
    inventory: { herb: 3, ore: 2 },
    expedition: null,
    wagonLevel: 1,
    tavernSeed: 100,
    marketSeed: 101,
    reputation: 17,
    visitedBossDungeons: [],
  };
}

describe('M31 companion origins', () => {
  it('is deterministic and preview-only', () => {
    const save = saveWith();
    const before = JSON.stringify(save);
    const first = previewCompanionOrigin(save, 'companion-a');
    const second = previewCompanionOrigin(save, 'companion-a');
    expect(companionOriginFingerprint(first)).toBe(companionOriginFingerprint(second));
    expect(JSON.stringify(save)).toBe(before);
  });

  it('uses an existing genesis-compatible trait as the lifepath', () => {
    const preview = previewCompanionOrigin(saveWith(), 'companion-a');
    expect(preview.lifepathId).toBe('nimble');
    expect(preview.careerMilestones.map((milestone) => milestone.level)).toEqual([2, 3]);
  });

  it('assigns non-genesis traits through a stable identity hash', () => {
    const record = companion({ trait: 'greedy' });
    const a = previewCompanionOrigin(saveWith([record]), record.id);
    const b = previewCompanionOrigin(saveWith([{ ...record }]), record.id);
    expect(a.lifepathId).toBe(b.lifepathId);
  });

  it('registers only character power and never grants economic rewards', () => {
    const save = saveWith();
    const economyBefore = {
      gold: save.gold,
      reputation: save.reputation,
      inventory: { ...save.inventory },
      wagonLevel: save.wagonLevel,
      flags: { ...save.flags },
    };
    const preview = previewCompanionOrigin(save, 'companion-a');
    registerCompanionOrigin(save, 'companion-a');
    const record = save.companions[0];

    expect(record.genesis).toBeDefined();
    expect(record.growth).toEqual(preview.growth);
    expect(record.growthRealizedLevel).toBe(record.level);
    expect(record.careerMilestones).toEqual(preview.careerMilestones);
    expect(save.gold).toBe(economyBefore.gold);
    expect(save.reputation).toBe(economyBefore.reputation);
    expect(save.inventory).toEqual(economyBefore.inventory);
    expect(save.wagonLevel).toBe(economyBefore.wagonLevel);
    expect(save.flags).toEqual(economyBefore.flags);
  });

  it('cannot be repeated to stack stats, hp, skills, or careers', () => {
    const save = saveWith();
    registerCompanionOrigin(save, 'companion-a');
    const after = JSON.stringify(save.companions[0]);
    expect(() => registerCompanionOrigin(save, 'companion-a')).toThrow('已完成身世登記');
    expect(JSON.stringify(save.companions[0])).toBe(after);
  });

  it('respects the skill cap when an origin adds an existing skill', () => {
    const save = saveWith([companion({ skills: { scouting: 5 } })]);
    registerCompanionOrigin(save, 'companion-a');
    expect(save.companions[0].skills?.scouting).toBe(5);
  });

  it('lists mixed registered and unregistered companions without mutating either', () => {
    const registered = companion({
      id: 'registered',
      genesis: { lifepathId: 'nimble', aptitudeId: 'dex', burdenId: 'cha' },
      growth: { potential: { str: 2, dex: 5, int: 3, cha: 1, con: 4 } },
    });
    const save = saveWith([registered, companion({ id: 'fresh', name: '顧言' })]);
    const before = JSON.stringify(save);
    const previews = previewAllCompanionOrigins(save);
    expect(previews.map((entry) => entry.alreadyRegistered)).toEqual([true, false]);
    expect(JSON.stringify(save)).toBe(before);
  });

  it('fails cleanly for an unknown companion', () => {
    const save = saveWith();
    const before = JSON.stringify(save);
    expect(() => registerCompanionOrigin(save, 'missing')).toThrow('找不到旅伴');
    expect(JSON.stringify(save)).toBe(before);
  });
});
