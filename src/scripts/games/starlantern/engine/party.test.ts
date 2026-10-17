import { describe, it, expect } from 'vitest';
import {
  rowOfCell, statSources, expToNext, statsOf, newMember, newParty, recruit, setFormation, activeIds,
  gainExp, awardExp, hasPassive, MAX_LEVEL, SLOTS, slotsFor, defaultSlotFor, sheetOf, setCounts, powersOf,
} from './party';
import { partyAt } from './sim';
import { LEGACY_GRID, LEGACY_LINEUP, STANDARD_LINEUP, START_LINEUP, partyWith, placeInGrid } from './party';
import { defaultTalents, defaultTree, learnedSkills, newTree, raiseTalent, skillPoints, skillPointsLeft, talentPoints, talentPointsLeft } from './progression';
import { fullParty, plainItem } from './testing';
import { rollItem } from './loot/item';
import { mulberry32 } from './rng';
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { SETS } from '../data/gear';
import { TALENT_PER, TALENT_SCALE } from '../data/talents';
import type { AnyStat, CharacterId, Member } from './types';

const per = (stat: AnyStat) => TALENT_PER[stat]! * TALENT_SCALE;

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
    expect(parts.map((p) => p.source)).toEqual(['base', 'growth', 'gear', 'set', 'talent', 'primary']);
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
          expect(st[k], `${id} Lv${level} ${k}`).toBe(Math.floor(def.base[k] + def.growth[k] * (level - 1) + 1e-9));
        }
      }
    }
  });
  it('talent primaries convert like gear', () => {
    const before: Member = { ...newMember('noel'), level: 10 };
    let m = before;
    for (let i = 0; i < 3; i++) {
      const r = raiseTalent(m, 'noel-t00');   // noel-t00 is int, noel's affinity
      if (!r.ok) throw new Error(r.reason);
      m = r.member;
    }
    const parts = Object.fromEntries(statSources(m).map((p) => [p.source, p.stats]));
    expect(statSources(m).map((p) => p.source)).toEqual(['base', 'growth', 'gear', 'set', 'talent', 'primary']);
    expect(parts.talent).toEqual({ int: 3 * per('int') });
    expect(sheetOf(m).mag - sheetOf(before).mag).toBeCloseTo(3 * per('int') * 1.5);   // 1.5: the 5a affinity multiplier
    expect(parts.base.int).toBe(CHARACTERS.noel.base.mag + CHARACTERS.noel.growth.mag * 9);   // natural int unchanged: Lv10 mag
    expect(parts.base.int).toBe(41);
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
    const p = fullParty(LEGACY_LINEUP);
    expect(p.grid).toEqual(['scarlet', 'chizuru', 'liz', null, null, null, 'noel', null, 'selene']);
    expect(activeIds(p)).toEqual(['scarlet', 'chizuru', 'liz', 'noel', 'selene']);
    expect(Object.keys(p.roster)).toHaveLength(CHARACTER_IDS.length);
  });
  it('places members anywhere, front row first in reading order', () => {
    const r = setFormation(fullParty(), [null, 'hero', null, 'noel', null, null, null, null, 'chizuru']);
    expect(r.ok && activeIds(r.party)).toEqual(['hero', 'noel', 'chizuru']);
    expect(rowOfCell(0)).toBe('front');
    expect(rowOfCell(4)).toBe('middle');
    expect(rowOfCell(8)).toBe('back');
  });
  it('rejects bad formations, including more than five members', () => {
    const p = recruit(fullParty(LEGACY_LINEUP), 'bobby');
    const g = (...ids: (string | null)[]) => [...ids, ...Array(9 - ids.length).fill(null)] as never;
    expect(setFormation(p, ['scarlet', 'liz'] as never)).toEqual({ ok: false, reason: 'size' });
    expect(setFormation(p, g('sylvie'))).toEqual({ ok: false, reason: 'not-recruited' });
    expect(setFormation(p, g('liz', 'liz'))).toEqual({ ok: false, reason: 'duplicate' });
    expect(setFormation(p, g())).toEqual({ ok: false, reason: 'empty' });
    expect(setFormation(p, g('scarlet', 'chizuru', 'liz', 'noel', 'selene', 'bobby'))).toEqual({ ok: false, reason: 'too-many' });
  });
  it('the hero cannot leave the field', () => {
    const p = recruit(fullParty(), 'bobby');
    const h = p.grid.indexOf('hero');
    const off = [...p.grid]; off[h] = null;
    expect(setFormation(p, off)).toEqual({ ok: false, reason: 'no-hero' });
    const swapped = [...p.grid]; swapped[h] = 'bobby';
    expect(setFormation(p, swapped)).toEqual({ ok: false, reason: 'no-hero' });
    const moved = [...p.grid]; moved[h] = null; moved[4] = 'hero';
    expect(setFormation(p, moved).ok).toBe(true);
  });
  it('empty and too-many still win over no-hero', () => {
    const p = recruit(fullParty(LEGACY_LINEUP), 'bobby');
    const g = (...ids: (string | null)[]) => [...ids, ...Array(9 - ids.length).fill(null)] as never;
    expect(setFormation(p, g())).toEqual({ ok: false, reason: 'empty' });
    expect(setFormation(p, g('scarlet', 'chizuru', 'liz', 'noel', 'selene', 'bobby'))).toEqual({ ok: false, reason: 'too-many' });
    expect(setFormation(p, g('scarlet', 'liz'))).toEqual({ ok: false, reason: 'no-hero' });
  });
  it('recruits once', () => {
    const p = recruit(fullParty(LEGACY_LINEUP), 'bobby');
    expect(p.recruited).toContain('bobby');
    expect(recruit(p, 'bobby').recruited.filter((id) => id === 'bobby')).toHaveLength(1);
  });
});

describe('experience', () => {
  it('uses the curve', () => {
    expect(expToNext(1)).toBe(14);
    expect(expToNext(2)).toBe(34);
  });
  it('levels up, carries over, raises current HP by the gain and gains points', () => {
    const r = gainExp(newMember('noel'), 14 + 34 + 3);
    expect([r.member.level, r.member.exp, r.levels]).toEqual([3, 3, 2]);
    expect(r.member.hp).toBe(28 + 8);
    expect(r.points).toEqual({ skill: 2, talent: 0 });
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
    const p = recruit(fullParty(LEGACY_LINEUP), 'sylvie');
    const { party } = awardExp(p, 10, ['scarlet', 'chizuru', 'noel', 'selene']);
    expect(party.roster.scarlet.exp).toBe(10);
    expect(party.roster.sylvie.exp).toBe(5);
    expect(party.roster.liz.exp).toBe(0);
    expect(party.roster.bobby.exp).toBe(0); // not recruited
  });
});

describe('skills and passives', () => {
  it('hasPassive needs the learned node, not the level', () => {
    const p = fullParty(LEGACY_LINEUP);
    p.roster.liz.level = 10;
    expect(hasPassive(p, 'encounterDown')).toBe(false);
    p.roster.liz.tree = { 'twin-slash': 1, stealth: 1 };
    expect(hasPassive(p, 'encounterDown')).toBe(true);
    p.roster.liz.hp = 0;
    expect(hasPassive(p, 'encounterDown')).toBe(false);
  });
  it('hasPassive only counts members on the field', () => {
    const p = fullParty(LEGACY_LINEUP);
    p.roster.liz.tree = { 'twin-slash': 1, stealth: 1 };
    p.grid = p.grid.map((id) => (id === 'liz' ? null : id));
    expect(hasPassive(p, 'encounterDown')).toBe(false);
  });
  it('gainExp reports the points gained', () => {
    const from = (level: number) => ({ ...newMember('noel'), level });
    let need = 0;
    for (let l = 4; l < 6; l++) need += expToNext(l);
    const r = gainExp(from(4), need);
    expect(r.levels).toBe(2);
    expect(r.points).toEqual({ skill: 1, talent: 1 });
    expect(gainExp(from(MAX_LEVEL), 1000).points).toEqual({ skill: 0, talent: 0 });
    expect(gainExp(from(4), 0).points).toEqual({ skill: 0, talent: 0 });
  });
  it('gainExp reports the points of each single level', () => {
    const one = (level: number) => gainExp({ ...newMember('noel'), level }, expToNext(level)).points;
    expect(one(4)).toEqual({ skill: 1, talent: 0 });
    expect(one(5)).toEqual({ skill: 0, talent: 1 });
    expect(one(6)).toEqual({ skill: 1, talent: 0 });
  });
  it('a Lv6 noel in the real game keeps her skill points for the player to spend', () => {
    let need = 0;
    for (let l = 1; l < 6; l++) need += expToNext(l);
    const p = awardExp(fullParty(LEGACY_LINEUP), need, ['scarlet', 'chizuru', 'liz', 'noel', 'selene']).party;
    const noel = p.roster.noel;
    expect(noel.level).toBe(6);
    expect(noel.tree).toEqual(newTree('noel'));
    expect(learnedSkills(noel)).toEqual(['fire-star']);
    expect(skillPointsLeft(noel)).toBe(skillPoints(6));
    expect(skillPointsLeft(noel)).toBe(4);
  });
  it('a Lv8 member in the real game keeps her talent points for the player to spend', () => {
    let need = 0;
    for (let l = 1; l < 8; l++) need += expToNext(l);
    const p = awardExp(fullParty(LEGACY_LINEUP), need, ['scarlet', 'chizuru', 'liz', 'noel', 'selene']).party;
    for (const id of ['scarlet', 'noel'] as const) {
      const m = p.roster[id];
      expect(m.level, id).toBe(8);
      expect(m.talents, id).toEqual({});
      expect(talentPointsLeft(m), id).toBe(2);
    }
  });
  it('a level-up spends no point: the tree and the talents stay as the player left them', () => {
    const own = { ...newMember('noel'), level: 2, tree: { 'fire-star': 1, 'noel-fire-up': 1 } };
    const r = gainExp(own, expToNext(2)).member;   // Lv3: one point left
    expect(r.level).toBe(3);
    expect(r.tree).toEqual(own.tree);
    expect(skillPointsLeft(r)).toBe(1);
    let need = 0;
    for (let l = 2; l < 10; l++) need += expToNext(l);
    const far = gainExp(own, need).member;          // several levels at once
    expect(far.level).toBe(10);
    expect(far.tree).toEqual(own.tree);
    expect(skillPointsLeft(far)).toBe(skillPoints(10) - 1);
    expect(far.talents).toEqual({});
    expect(talentPointsLeft(far)).toBe(talentPoints(10));
  });
  it('partyAt gives each member the default tree', () => {
    expect(partyAt(10).roster.noel.tree).toEqual(defaultTree('noel', 10));
    for (const id of CHARACTER_IDS) expect(partyAt(6).roster[id].tree, id).toEqual(defaultTree(id, 6));
    for (const id of CHARACTER_IDS) expect(partyAt(20).roster[id].talents, id).toEqual(defaultTalents(id, 20));
  });
});

describe('partyWith', () => {
  it('puts each member on their own row', () => {
    const p = partyWith(STANDARD_LINEUP);
    expect(p.recruited).toEqual(STANDARD_LINEUP);
    for (const id of ['hero', 'rin', 'chizuru'] as const) expect(rowOfCell(p.grid.indexOf(id))).toBe('front');
    for (const id of ['noel', 'selene'] as const) expect(rowOfCell(p.grid.indexOf(id))).toBe('back');
    expect(activeIds(p)).toEqual(['hero', 'rin', 'chizuru', 'noel', 'selene']);
  });
  it('stands the hero in the row asked for', () => {
    const p = partyWith(STANDARD_LINEUP, 'back');
    expect(rowOfCell(p.grid.indexOf('hero'))).toBe('back');
    expect(activeIds(p)).toEqual(['rin', 'chizuru', 'hero', 'noel', 'selene'].sort((a, b) => p.grid.indexOf(a as never) - p.grid.indexOf(b as never)));
  });
  it('the legacy five stand where they always stood', () => {
    const p = partyWith(LEGACY_LINEUP);
    const old = newParty(LEGACY_LINEUP);
    expect(p.grid).toEqual(LEGACY_GRID);
    expect(p.recruited).toEqual(old.recruited);
    expect(p.roster).toEqual(old.roster);
    expect(partyWith(LEGACY_LINEUP, 'front', p.grid.map((c) => c)).grid).toEqual(LEGACY_GRID);
  });
});

describe('the starting lineup', () => {
  it('the starting lineup is the hero and Rin at the front', () => {
    expect(START_LINEUP).toEqual(['hero', 'rin']);
    const p = newParty(START_LINEUP);
    expect(p.recruited).toEqual(['hero', 'rin']);
    expect(activeIds(p)).toEqual(['hero', 'rin']);
    for (const id of CHARACTER_IDS) expect(p.roster[id].id).toBe(id);
    expect(Object.keys(p.roster).sort()).toEqual([...CHARACTER_IDS].sort());
  });
  it('newParty with no argument is the starting two', () => {
    expect(newParty().recruited).toEqual(START_LINEUP);
  });
});

describe('placeInGrid', () => {
  it('spills to the middle row when the row is full', () => {
    let g: (CharacterId | null)[] = Array(9).fill(null);
    const front = ['hero', 'rin', 'chizuru', 'scarlet'] as const;
    for (const id of front) g = placeInGrid(g, id, 'front');
    expect(g.slice(0, 3)).toEqual(['hero', 'rin', 'chizuru']);
    expect(g[3]).toBe('scarlet');
  });
  it('works on a copy', () => {
    const g: (CharacterId | null)[] = Array(9).fill(null);
    placeInGrid(g, 'hero', 'front');
    expect(g.every((c) => c === null)).toBe(true);
  });
});
