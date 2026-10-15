import { describe, it, expect } from 'vitest';
import {
  expToNext, statsOf, newMember, newParty, recruit, setFormation, activeIds,
  learnedSkills, gainExp, awardExp, hasPassive, MAX_LEVEL,
} from './party';

describe('stats', () => {
  it('grows per level and adds equipment', () => {
    const m = newMember('scarlet');
    expect(statsOf(m).hp).toBe(48);
    expect(statsOf({ ...m, level: 3 }).hp).toBe(62);
    expect(statsOf({ ...m, equip: { weapon: 'iron-sword' } }).atk).toBe(13 + 4);
  });
  it('starts members at full HP/TP', () => {
    const m = newMember('noel');
    expect([m.level, m.hp, m.tp]).toEqual([1, 28, 30]);
  });
});

describe('formation', () => {
  it('starts with the spec front/back split', () => {
    const p = newParty();
    expect(p.front).toEqual(['scarlet', 'chizuru', 'liz']);
    expect(p.back).toEqual(['noel', 'selene']);
    expect(activeIds(p)).toHaveLength(5);
    expect(Object.keys(p.roster)).toHaveLength(8);
  });
  it('accepts a valid change with empty slots', () => {
    const r = setFormation(newParty(), ['scarlet', null, 'liz'], ['noel', null]);
    expect(r.ok && activeIds(r.party)).toEqual(['scarlet', 'liz', 'noel']);
  });
  it('rejects bad formations', () => {
    const p = newParty();
    expect(setFormation(p, ['scarlet', 'liz'], ['noel', null])).toEqual({ ok: false, reason: 'size' });
    expect(setFormation(p, ['bobby', null, null], [null, null])).toEqual({ ok: false, reason: 'not-recruited' });
    expect(setFormation(p, ['liz', 'liz', null], [null, null])).toEqual({ ok: false, reason: 'duplicate' });
    expect(setFormation(p, [null, null, null], [null, null])).toEqual({ ok: false, reason: 'empty' });
  });
  it('recruits once', () => {
    const p = recruit(newParty(), 'bobby');
    expect(p.recruited).toContain('bobby');
    expect(recruit(p, 'bobby').recruited.filter((id) => id === 'bobby')).toHaveLength(1);
  });
});

describe('experience', () => {
  it('uses the curve', () => {
    expect(expToNext(1)).toBe(14);
    expect(expToNext(2)).toBe(34);
  });
  it('levels up, carries over, raises current HP by the gain and learns skills', () => {
    const r = gainExp(newMember('noel'), 14 + 34 + 3);
    expect([r.member.level, r.member.exp, r.levels]).toEqual([3, 3, 2]);
    expect(r.member.hp).toBe(28 + 8);
    expect(r.learned).toEqual(['ice-star']);
  });
  it('keeps a downed member at 0 HP', () => {
    expect(gainExp({ ...newMember('liz'), hp: 0 }, 100).member.hp).toBe(0);
  });
  it('stops at the level cap', () => {
    const r = gainExp(newMember('liz'), 10_000_000);
    expect([r.member.level, r.member.exp]).toEqual([MAX_LEVEL, 0]);
  });
  it('gives survivors full, the bench half, and downed actives nothing', () => {
    const p = recruit(newParty(), 'sylvie');
    const { party } = awardExp(p, 10, ['scarlet', 'chizuru', 'noel', 'selene']);
    expect(party.roster.scarlet.exp).toBe(10);
    expect(party.roster.sylvie.exp).toBe(5);
    expect(party.roster.liz.exp).toBe(0);
    expect(party.roster.bobby.exp).toBe(0); // not recruited
  });
});

describe('skills and passives', () => {
  it('learns by level', () => {
    expect(learnedSkills('liz', 1)).toEqual(['twin-slash']);
    expect(learnedSkills('liz', 4)).toEqual(['twin-slash', 'stealth', 'treasure-sense']);
  });
  it('only counts living active members who learned the passive', () => {
    const p = newParty();
    expect(hasPassive(p, 'encounterDown')).toBe(false);
    p.roster.liz.level = 2;
    expect(hasPassive(p, 'encounterDown')).toBe(true);
    p.roster.liz.hp = 0;
    expect(hasPassive(p, 'encounterDown')).toBe(false);
  });
});
