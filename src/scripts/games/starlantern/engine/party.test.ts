import { describe, it, expect } from 'vitest';
import {
  rowOfCell, statSources, expToNext, statsOf, newMember, newParty, recruit, setFormation, activeIds,
  learnedSkills, gainExp, awardExp, hasPassive, MAX_LEVEL, SLOTS, slotsFor, defaultSlotFor, sheetOf, setCounts, powersOf,
} from './party';
import { partyAt } from './sim';
import { plainItem } from './testing';
import { rollItem } from './loot/item';
import { mulberry32 } from './rng';
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { SETS } from '../data/gear';

describe('stats', () => {
  it('grows per level and adds equipment', () => {
    const m = newMember('scarlet');
    expect(statsOf(m).hp).toBe(48);
    expect(statsOf({ ...m, level: 3 }).hp).toBe(62);
    expect(statsOf({ ...m, equip: { weapon: plainItem('iron-sword', 1) } }).atk).toBe(13 + 4);
  });
  it('starts members at full HP/TP', () => {
    const m = newMember('noel');
    expect([m.level, m.hp, m.tp]).toEqual([1, 28, 30]);
  });
});

describe('stat sources', () => {
  it('splits a member\u2019s numbers by where they come from and adds up to statsOf', () => {
    const m = { ...newMember('scarlet'), level: 3, equip: { weapon: plainItem('iron-sword', 1) } };
    const parts = statSources(m);
    expect(parts.map((p) => p.source)).toEqual(['base', 'growth', 'gear', 'set', 'primary']);
    const total = statsOf(m);
    for (const k of ['hp', 'atk', 'def'] as const) expect(parts.reduce((n, p) => n + (p.stats[k] ?? 0), 0)).toBe(total[k]);
    expect(parts[2].stats.atk).toBeGreaterThan(0);
  });
});

describe('gear instances', () => {
  const set = (special: string, uid: number) => rollItem(mulberry32(uid), { uid, ilvl: 20, rarity: 'set', special });
  it('no gear means the same numbers as before', () => {
    for (const id of CHARACTER_IDS) {
      for (const level of [1, 20]) {
        const st = statsOf({ ...newMember(id), level });
        const def = CHARACTERS[id];
        for (const k of ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'] as const) {
          expect(st[k], `${id} Lv${level} ${k}`).toBe(def.base[k] + def.growth[k] * (level - 1));
        }
      }
    }
  });
  it('gear primaries convert and show as their own source', () => {
    const sword = { ...plainItem('iron-sword', 1), affixes: [{ key: 'str' as const, value: 10 }] };
    const m = { ...newMember('scarlet'), equip: { weapon: sword } };
    const parts = Object.fromEntries(statSources(m).map((p) => [p.source, p.stats]));
    expect(parts.gear.str).toBe(10);
    expect(parts.primary).toEqual({ atk: 15, armor: 30 });   // scarlet's affinity is str: 1.5x
    expect(parts.base.critDmg).toBe(50);
    expect(parts.base.str).toBe(13);                          // natural primary, shown but never converted
    expect(statsOf(m).atk).toBe(13 + 4 + 15);
    expect(sheetOf(m).armor).toBe(30);
    expect(sheetOf(m).str).toBe(13 + 10);
  });
  it('the sheet holds the caps and stats round down', () => {
    const ring = { ...plainItem('copper-ring', 1), affixes: [{ key: 'crit' as const, value: 500 }, { key: 'agi' as const, value: 3 }] };
    const m = { ...newMember('scarlet'), equip: { ring1: ring } };
    expect(sheetOf(m).crit).toBe(60);
    expect(statsOf(m).spd).toBe(7 + 1);                       // agi 3 -> spd 1.5, floored
  });
  it('two pieces give the two-piece bonus, four give both', () => {
    const base = newMember('scarlet');
    const two = { ...base, equip: { weapon: set('set-blaze-weapon', 1), body: set('set-blaze-body', 2) } };
    expect(setCounts(two)).toEqual({ 'set-blaze': 2 });
    expect(statSources(two).find((p) => p.source === 'set')!.stats).toEqual(SETS['set-blaze'].two);
    const four = { ...base, equip: { ...two.equip, hands: set('set-blaze-hands', 3), ring2: set('set-blaze-ring', 4) } };
    expect(setCounts(four)).toEqual({ 'set-blaze': 4 });
    expect(statSources(four).find((p) => p.source === 'set')!.stats).toEqual({ fireDmg: 15 + 20, crit: 8 });
    const one = { ...base, equip: { weapon: set('set-blaze-weapon', 1) } };
    expect(statSources(one).find((p) => p.source === 'set')!.stats).toEqual({});
  });
  it('the same set piece twice counts once', () => {
    const m = { ...newMember('scarlet'), equip: { ring1: set('set-blaze-ring', 1), ring2: set('set-blaze-ring', 2) } };
    expect(setCounts(m)).toEqual({ 'set-blaze': 1 });
    expect(statSources(m).find((p) => p.source === 'set')!.stats).toEqual({});
  });
  it('defaultSlotFor fills the first empty ring slot, then ring1', () => {
    const r = (uid: number) => plainItem('copper-ring', uid);
    const m = newMember('liz');
    expect(defaultSlotFor(m, r(1))).toBe('ring1');
    expect(defaultSlotFor({ ...m, equip: { ring1: r(1) } }, r(2))).toBe('ring2');
    expect(defaultSlotFor({ ...m, equip: { ring2: r(1) } }, r(2))).toBe('ring1');
    expect(defaultSlotFor({ ...m, equip: { ring1: r(1), ring2: r(2) } }, r(3))).toBe('ring1');
    expect(defaultSlotFor(m, plainItem('moss-charm', 4))).toBe('neck');
    expect(defaultSlotFor(m, plainItem('iron-sword', 5))).toBe('weapon');
    expect(SLOTS).toEqual(['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring1', 'ring2']);
    expect(slotsFor('ring')).toEqual(['ring1', 'ring2']);
    expect(slotsFor('body')).toEqual(['body']);
  });
  it('lists the powers of worn legendaries once each', () => {
    const lg = (uid: number) => rollItem(mulberry32(uid), { uid, ilvl: 20, rarity: 'legendary', special: 'lg-noel' });
    expect(powersOf(newMember('noel'))).toEqual([]);
    expect(powersOf({ ...newMember('noel'), equip: { ring1: lg(1), ring2: lg(2) } })).toEqual(['lg-noel']);
  });
});

describe('formation', () => {
  it('starts with three in front and two at the back of a 3x3 grid', () => {
    const p = newParty();
    expect(p.grid).toEqual(['scarlet', 'chizuru', 'liz', null, null, null, 'noel', null, 'selene']);
    expect(activeIds(p)).toEqual(['scarlet', 'chizuru', 'liz', 'noel', 'selene']);
    expect(Object.keys(p.roster)).toHaveLength(8);
  });
  it('places members anywhere, front row first in reading order', () => {
    const r = setFormation(newParty(), [null, 'scarlet', null, 'noel', null, null, null, null, 'liz']);
    expect(r.ok && activeIds(r.party)).toEqual(['scarlet', 'noel', 'liz']);
    expect(rowOfCell(0)).toBe('front');
    expect(rowOfCell(4)).toBe('middle');
    expect(rowOfCell(8)).toBe('back');
  });
  it('rejects bad formations, including more than five members', () => {
    const p = recruit(newParty(), 'bobby');
    const g = (...ids: (string | null)[]) => [...ids, ...Array(9 - ids.length).fill(null)] as never;
    expect(setFormation(p, ['scarlet', 'liz'] as never)).toEqual({ ok: false, reason: 'size' });
    expect(setFormation(p, g('sylvie'))).toEqual({ ok: false, reason: 'not-recruited' });
    expect(setFormation(p, g('liz', 'liz'))).toEqual({ ok: false, reason: 'duplicate' });
    expect(setFormation(p, g())).toEqual({ ok: false, reason: 'empty' });
    expect(setFormation(p, g('scarlet', 'chizuru', 'liz', 'noel', 'selene', 'bobby'))).toEqual({ ok: false, reason: 'too-many' });
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
  it('levels past 20, up to the cap of 50 that deep floors need', () => {
    expect(MAX_LEVEL).toBe(50);
    let need = 0;
    for (let l = 20; l < 30; l++) need += expToNext(l);
    const r = gainExp({ ...newMember('liz'), level: 20 }, need + 5);
    expect([r.member.level, r.member.exp, r.levels]).toEqual([30, 5, 10]);
  });
  it('the balance sim fields a party no higher than the cap', () => {
    expect(Object.values(partyAt(60).roster).every((m) => m.level === MAX_LEVEL)).toBe(true);
    expect(partyAt(38).roster.liz.level).toBe(38);
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
