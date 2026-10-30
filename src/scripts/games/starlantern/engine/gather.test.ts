import { describe, expect, it } from 'vitest';
import { SPOT_OF, type GatherMode, type GatherType, type SpotRegion } from '../data/gather';
import { GATHER_TEXT, type GatherText } from '../data/gather.zh-TW';
import { FLOORS } from '../data/floors';
import { advance, ENCOUNTER_PACE } from './encounter';
import { POISON_TP_LOSS_PCT, trapDamage } from './events';
import { innerFor, nextStep, outcome, remarkFor, spotGather, spotKey, visibleGather, type StepRate } from './gather';
import { meet, statsOf } from './party';
import { newRun } from './dungeon/run';
import type { Content } from './dungeon/rooms';
import { newGame, type GameState } from './state';
import type { CharacterId } from './types';

/** Gathering plan Task A3 (spec §5.3, §5.4, §9.2; rulings 4, 6): the one formula, the sighting and who would speak. */

const RULE_REGION: Record<string, SpotRegion> = { scald: 'blaze', hush: 'frost', charge: 'storm', fumes: 'mire', hidden: 'shade', clang: 'iron' };

/** A point: an ordinary vein, or the spot of the region whose rule is `rule`, holding `qty` goods (the rich two included). */
const point = (rule: string, qty: number, rich = false, at = { x: 4, y: 4 }): Content => {
  const type: GatherType = rule === 'none' ? 'vein' : 'spot';
  const item = rule === 'none' ? 'copper-ore' : SPOT_OF[RULE_REGION[rule]];
  return { kind: 'gather', at, room: 1, gather: { type, item, qty, ...(rich ? { rich: true as const } : {}) } };
};
const withTool = (tool: 0 | 1 | 2): GameState => {
  const s = newGame();
  if (tool) s.gather = { tool, got: {} };
  return s;
};
const STEP: StepRate = { mod: 1, rate: FLOORS[0].rate };

describe('gathering, the one formula (gathering plan Task A3)', () => {
  it('the outcome table', () => {
    // [rule, rich, tool, mode, goods, noise] for a point of 3 goods (5 when rich): spec §5.4, worked by hand
    const TABLE: [string, boolean, 0 | 1 | 2, GatherMode, number, number][] = [
      ['none', false, 0, 'light', 2, 15], ['none', false, 0, 'full', 3, 30], ['none', false, 1, 'light', 2, 15], ['none', false, 1, 'full', 4, 30],
      ['none', false, 2, 'light', 2, 10], ['none', false, 2, 'full', 4, 20], ['none', true, 0, 'light', 3, 23], ['none', true, 0, 'full', 5, 45],
      ['none', true, 1, 'light', 3, 23], ['none', true, 1, 'full', 6, 45], ['none', true, 2, 'light', 3, 18], ['none', true, 2, 'full', 6, 35],
      ['scald', false, 0, 'light', 2, 15], ['scald', false, 0, 'full', 3, 30], ['scald', false, 1, 'light', 2, 15], ['scald', false, 1, 'full', 4, 30],
      ['scald', false, 2, 'light', 2, 10], ['scald', false, 2, 'full', 4, 20], ['scald', true, 0, 'light', 3, 23], ['scald', true, 0, 'full', 5, 45],
      ['scald', true, 1, 'light', 3, 23], ['scald', true, 1, 'full', 6, 45], ['scald', true, 2, 'light', 3, 18], ['scald', true, 2, 'full', 6, 35],
      ['hush', false, 0, 'light', 2, 0], ['hush', false, 0, 'full', 3, 0], ['hush', false, 1, 'light', 2, 0], ['hush', false, 1, 'full', 4, 0],
      ['hush', false, 2, 'light', 2, 0], ['hush', false, 2, 'full', 4, 0], ['hush', true, 0, 'light', 3, 0], ['hush', true, 0, 'full', 5, 0],
      ['hush', true, 1, 'light', 3, 0], ['hush', true, 1, 'full', 6, 0], ['hush', true, 2, 'light', 3, 0], ['hush', true, 2, 'full', 6, 0],
      ['charge', false, 0, 'light', 2, 15], ['charge', false, 0, 'full', 4, 30], ['charge', false, 1, 'light', 3, 15], ['charge', false, 1, 'full', 5, 30],
      ['charge', false, 2, 'light', 3, 10], ['charge', false, 2, 'full', 5, 20], ['charge', true, 0, 'light', 3, 23], ['charge', true, 0, 'full', 6, 45],
      ['charge', true, 1, 'light', 4, 23], ['charge', true, 1, 'full', 7, 45], ['charge', true, 2, 'light', 4, 18], ['charge', true, 2, 'full', 7, 35],
      ['fumes', false, 0, 'light', 2, 15], ['fumes', false, 0, 'full', 3, 30], ['fumes', false, 1, 'light', 2, 15], ['fumes', false, 1, 'full', 4, 30],
      ['fumes', false, 2, 'light', 2, 10], ['fumes', false, 2, 'full', 4, 20], ['fumes', true, 0, 'light', 3, 23], ['fumes', true, 0, 'full', 5, 45],
      ['fumes', true, 1, 'light', 3, 23], ['fumes', true, 1, 'full', 6, 45], ['fumes', true, 2, 'light', 3, 18], ['fumes', true, 2, 'full', 6, 35],
      ['hidden', false, 0, 'light', 2, 8], ['hidden', false, 0, 'full', 3, 15], ['hidden', false, 1, 'light', 2, 8], ['hidden', false, 1, 'full', 4, 15],
      ['hidden', false, 2, 'light', 2, 5], ['hidden', false, 2, 'full', 4, 10], ['hidden', true, 0, 'light', 3, 11], ['hidden', true, 0, 'full', 5, 23],
      ['hidden', true, 1, 'light', 3, 11], ['hidden', true, 1, 'full', 6, 23], ['hidden', true, 2, 'light', 3, 9], ['hidden', true, 2, 'full', 6, 18],
      ['clang', false, 0, 'light', 3, 30], ['clang', false, 0, 'full', 6, 60], ['clang', false, 1, 'light', 4, 30], ['clang', false, 1, 'full', 8, 60],
      ['clang', false, 2, 'light', 4, 20], ['clang', false, 2, 'full', 8, 40], ['clang', true, 0, 'light', 5, 45], ['clang', true, 0, 'full', 10, 90],
      ['clang', true, 1, 'light', 6, 45], ['clang', true, 1, 'full', 12, 90], ['clang', true, 2, 'light', 6, 35], ['clang', true, 2, 'full', 12, 70],
    ];
    expect(TABLE).toHaveLength(7 * 2 * 3 * 2);
    for (const [rule, rich, tool, mode, qty, noise] of TABLE) {
      const o = outcome(withTool(tool), point(rule, rich ? 5 : 3, rich), mode, 0, STEP, 1);
      expect([o.qty, o.noise], `${rule} rich ${rich} tool ${tool} ${mode}`).toEqual([qty, noise]);
      expect(o.gauge, `${rule} rich ${rich} tool ${tool} ${mode}`).toEqual({ from: 0, to: noise });
    }
    // the gauge stops at 99, never at the encounter itself
    expect(outcome(withTool(0), point('clang', 5, true), 'full', 50, STEP, 1).gauge).toEqual({ from: 50, to: 99 });
    expect(outcome(withTool(0), point('none', 3), 'full', 69, STEP, 1).gauge).toEqual({ from: 69, to: 99 });
    expect(outcome(withTool(0), point('none', 3), 'full', 68, STEP, 1).gauge).toEqual({ from: 68, to: 98 });
  });

  it('the gauge and the lamp', () => {
    const lamp = (v: number, mode: GatherMode, rule = 'none') => outcome(withTool(0), point(rule, 3), mode, v, STEP, 1);
    // the gauge as numbers, from and to: a full ordinary point from 44
    expect(lamp(44, 'full').gauge).toEqual({ from: 44, to: 74 });
    expect(lamp(44, 'full').danger).toEqual({ from: 'yellow', to: 'yellow' });
    const at = (v: number) => lamp(v, 'full', 'hush').danger.to;   // no noise: the lamp of the gauge itself
    expect([0, 39, 40, 74, 75, 98, 99].map(at)).toEqual(['green', 'green', 'yellow', 'yellow', 'red', 'red', 'red']);
    expect(lamp(9, 'full').danger).toEqual({ from: 'green', to: 'green' });   // spec §6.1: below 10 a full gather stays green
    expect(lamp(10, 'full').danger).toEqual({ from: 'green', to: 'yellow' });
    expect(lamp(44, 'full').danger).toEqual({ from: 'yellow', to: 'yellow' });
    expect(lamp(45, 'full').danger).toEqual({ from: 'yellow', to: 'red' });
    expect(lamp(24, 'light').danger).toEqual({ from: 'green', to: 'green' });
    expect(lamp(25, 'light').danger).toEqual({ from: 'green', to: 'yellow' });
    expect(lamp(60, 'light').danger).toEqual({ from: 'yellow', to: 'red' });
  });

  it('the next step', () => {
    const MODS = [1, 0.8, 0.6, 0.5, 0.4, 0.3];
    const GAUGES = [0, 20, 39, 41, 69, 98, 99];
    for (const f of FLOORS) for (const mod of MODS) for (const v of GAUGES) {
      const step = { mod, rate: f.rate };
      const gMin = Math.round(f.rate[0] * mod * ENCOUNTER_PACE), gMax = Math.round(f.rate[1] * mod * ENCOUNTER_PACE);
      const want = v + gMin >= 100 ? 'sure' : v + gMax > 40 ? 'maybe' : 'never';
      const key = `${f.id} ${mod} ${v}`;
      expect(nextStep(v, step), key).toBe(want);
      expect(outcome(withTool(0), point('hush', 3), 'full', v, step, 1).next, key).toBe(want);
      // advance() itself at both ends: the least and the most gain, the yellow roll at 0 and at nearly 1
      const ends = [0, 0.999999].flatMap((gain) => [0, 0.999999].map((roll) => {
        const seq = [gain, roll];
        let i = 0;
        return advance(v, () => seq[i++ % 2], f.rate, mod).encounter;
      }));
      if (want === 'never') expect(ends.every((e) => !e), key).toBe(true);
      if (want === 'sure') expect(ends.every((e) => e), key).toBe(true);
      if (want === 'maybe') expect(ends.some((e) => e), key).toBe(true);
    }
    // at 99 the least gain under every multiplier is at least one: always sure
    for (const f of FLOORS) for (const mod of MODS) expect(nextStep(99, { mod, rate: f.rate })).toBe('sure');
  });

  it("the land's toll", () => {
    for (const d of [1, 15, 40]) {
      for (const [rule, effect] of [['scald', 'hurt'], ['fumes', 'poison']] as const) {
        const n = Math.ceil(trapDamage(effect, d) / 2);
        const s = newGame();
        for (const id of ['chizuru', 'noel', 'selene', 'sylvie', 'liz'] as CharacterId[]) s.party = meet(s.party, id, 10);
        expect(s.party.grid.includes('liz')).toBe(false);   // on the bench: still recruited
        s.party.roster.hero.hp = 1;
        s.party.roster.rin.hp = Math.max(2, n - 1);
        s.party.roster.chizuru.hp = n + 30;
        s.party.roster.noel.hp = 0;                          // fallen: untouched
        const o = outcome(s, point(rule, 3), 'light', 0, STEP, d);
        const want: Record<string, { hp: number }> = {};
        for (const id of s.party.recruited) {
          const m = s.party.roster[id];
          if (m.hp > 0) want[id] = { hp: m.hp - Math.max(1, m.hp - n) };
        }
        expect(o.toll, `${rule} ${d}`).toEqual(want);
        expect(o.toll!.hero).toEqual({ hp: 0 });
        expect(o.toll!.chizuru).toEqual({ hp: n });
        expect(o.toll!.noel).toBeUndefined();
        expect(o.toll!.liz).toEqual(want.liz);   // on the bench, recruited and standing: she pays too
        expect(outcome(s, point(rule, 3), 'full', 0, STEP, d).toll).toEqual(o.toll);
      }
    }
    expect([1, 15].map((d) => Math.ceil(trapDamage('hurt', d) / 2))).toEqual([6, 34]);
    expect([1, 15].map((d) => Math.ceil(trapDamage('poison', d) / 2))).toEqual([3, 17]);
    // charge: TP, never below 0
    const s = newGame();
    s.party = meet(s.party, 'liz', 10);
    s.party.roster.rin.tp = 0;
    const o = outcome(s, point('charge', 3), 'full', 0, STEP, 7);
    for (const id of s.party.recruited) {
      const m = s.party.roster[id];
      expect(o.toll![id], id).toEqual({ tp: Math.min(m.tp, Math.floor((statsOf(m).tp * POISON_TP_LOSS_PCT) / 100)) });
    }
    expect(o.toll!.rin).toEqual({ tp: 0 });
    // no toll on hush, hidden, clang or an ordinary point
    for (const rule of ['hush', 'hidden', 'clang', 'none']) expect(outcome(s, point(rule, 3), 'full', 0, STEP, 7).toll, rule).toBeUndefined();
  });

  it('hidden until spotted', () => {
    const run = newRun(1, 'shade', 'plain', 1);
    const shade = point('hidden', 3, false, { x: 5, y: 5 });
    const vein = point('none', 3, false, { x: 9, y: 9 });
    run.floors.set(2, { map: { width: 12, height: 12, tiles: [], entrance: { x: 0, y: 0 }, up: null, down: null, boss: null, chests: [] }, contents: [shade, vein] });
    expect(visibleGather(run, 2, shade)).toBe(false);
    expect(visibleGather(run, 2, vein)).toBe(true);   // any other point never looks at run.spotted
    // next to it but its cell unexplored: not yet
    spotGather(run, 2, { x: 6, y: 6 }, ['6,6']);
    expect(visibleGather(run, 2, shade)).toBe(false);
    // explored but two steps away: not yet
    spotGather(run, 2, { x: 7, y: 5 }, ['5,5', '7,5']);
    expect(visibleGather(run, 2, shade)).toBe(false);
    // explored and one step away, diagonally
    spotGather(run, 2, { x: 6, y: 6 }, ['5,5', '6,6']);
    expect(run.spotted?.has(spotKey(2, shade.at))).toBe(true);
    expect(visibleGather(run, 2, shade)).toBe(true);
    // walked away: still seen; another depth's same cell is not
    spotGather(run, 2, { x: 0, y: 0 }, ['5,5']);
    expect(visibleGather(run, 2, shade)).toBe(true);
    expect(visibleGather(run, 3, shade)).toBe(false);
    expect([...run.spotted!]).toEqual(['2:5,5']);
  });

  it('who would speak', () => {
    const text: GatherText = {
      remarks: { sylvie: { herb: ['h1', 'h2'], fungus: ['f1'] }, bobby: { vein: ['v1', 'v2', 'v3'], crystal: [] }, liz: { crystal: ['c1'], spot: ['s1'] }, rin: { any: ['a1', 'a2'] } },
      inner: { first: ['i1'], deep: ['d1', 'd2'] },
      doran: { tools: [], made1: [], made2: [] },
    };
    const pt = (type: GatherType): Content => ({ kind: 'gather', at: { x: 1, y: 1 }, room: 1, gather: { type, item: 'copper-ore', qty: 2 } });
    const run = newRun(1, 'mainline', 'plain', 1);
    const base = newGame();   // hero and Rin
    let s = base;
    for (const id of ['sylvie', 'bobby', 'liz'] as CharacterId[]) s = { ...s, party: meet(s.party, id, 5) };
    // the order: Sylvie for herbs, Bobby for veins, Liz for spots; a crystal is Bobby's before Liz's
    expect(remarkFor(s, run, pt('herb'), text)).toEqual({ key: 'remarks.sylvie.herb', index: 0 });
    expect(remarkFor(s, run, pt('vein'), text)).toEqual({ key: 'remarks.bobby.vein', index: 0 });
    expect(remarkFor(s, run, pt('spot'), text)).toEqual({ key: 'remarks.liz.spot', index: 0 });
    // Bobby's crystal pool is empty: nothing, and Liz is not asked
    expect(remarkFor(s, run, pt('crystal'), text)).toBeUndefined();
    // on the field means in the grid and standing
    const down = structuredClone(s);
    down.party.roster.bobby.hp = 0;
    expect(remarkFor(down, run, pt('crystal'), text)).toEqual({ key: 'remarks.liz.crystal', index: 0 });
    const benched = structuredClone(s);
    benched.party.grid = benched.party.grid.map((id) => (id === 'sylvie' ? null : id));
    // no one for herbs: Rin for any kind
    expect(remarkFor(benched, run, pt('herb'), text)).toEqual({ key: 'remarks.rin.any', index: 0 });
    const noRin = structuredClone(benched);
    noRin.party.roster.rin.hp = 0;
    expect(remarkFor(noRin, run, pt('herb'), text)).toBeUndefined();
    // the line: the gathered total so far, modulo the pool
    const got = structuredClone(s);
    got.gather = { got: { 'copper-ore': 4, 'stanch-herb': 3 } };
    expect(remarkFor(got, run, pt('vein'), text)).toEqual({ key: 'remarks.bobby.vein', index: 7 % 3 });
    expect(remarkFor(got, run, pt('herb'), text)).toEqual({ key: 'remarks.sylvie.herb', index: 7 % 2 });
    // once a dive has had its remark: none
    const talked = newRun(1, 'mainline', 'plain', 1);
    talked.gatherTalked = true;
    expect(remarkFor(s, talked, pt('herb'), text)).toBeUndefined();
    // the real slots are empty: never a remark
    expect(remarkFor(s, run, pt('herb'))).toBeUndefined();
    expect(remarkFor(benched, run, pt('herb'), GATHER_TEXT)).toBeUndefined();

    // Lorne's inner voice: the first gathering ever; the first deep material ever; both: the first
    expect(innerFor(base, 'copper-ore', text)).toEqual({ key: 'inner.first', index: 0 });
    expect(innerFor(base, 'silver-ore', text)).toEqual({ key: 'inner.first', index: 0 });
    const shallow = structuredClone(base);
    shallow.gather = { got: { 'copper-ore': 3 } };
    expect(innerFor(shallow, 'copper-ore', text)).toBeUndefined();
    expect(innerFor(shallow, 'silver-ore', text)).toEqual({ key: 'inner.deep', index: 3 % 2 });
    expect(innerFor(shallow, 'ember-glass', text)).toBeUndefined();   // a spot is not deep
    const deep = structuredClone(base);
    deep.gather = { got: { 'copper-ore': 3, 'deep-quartz': 1 } };
    expect(innerFor(deep, 'silver-ore', text)).toBeUndefined();
    // empty pools say nothing
    expect(innerFor(base, 'copper-ore')).toBeUndefined();
    expect(innerFor(shallow, 'silver-ore')).toBeUndefined();
  });

  it('none of it draws', () => {
    const s = newGame();
    s.party = meet(s.party, 'liz', 10);
    s.gather = { tool: 1, got: { 'copper-ore': 2 } };
    const before = structuredClone(s);
    const run = newRun(1, 'shade', 'plain', 1);
    const c = point('hidden', 3, true);
    const cBefore = structuredClone(c);
    for (const rule of ['none', 'scald', 'hush', 'charge', 'fumes', 'hidden', 'clang']) for (const mode of ['light', 'full'] as const) outcome(s, point(rule, 4, true), mode, 33, STEP, 12);
    outcome(s, c, 'full', 10, STEP, 3);
    remarkFor(s, run, c);
    innerFor(s, 'silver-ore');
    nextStep(50, STEP);
    visibleGather(run, 1, c);
    expect(s).toEqual(before);
    expect(c).toEqual(cBefore);
    expect(run.spotted).toBeUndefined();
  });
});
