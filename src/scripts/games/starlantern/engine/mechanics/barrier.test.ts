import { describe, expect, it } from 'vitest';
import { resolveRound, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { newLedger } from '../ledger';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef, fieldWords } from './index';

const chizuru = (over: Partial<Combatant> = {}) => makeCombatant({
  key: 'chizuru', side: 'party', defId: 'chizuru', mech: { kind: 'barrier' },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 30, res: 20, spd: 50 }, ...over,
});
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over });
/** A foe that sleeps through the round and does not fall. */
const foe = (over: Partial<Combatant> = {}) => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const cast = (skill: string, target = 'e0'): Record<string, Action> => ({ chizuru: { kind: 'skill', skill, target } });
const round = (s: BattleState, acts: Record<string, Action> = {}) => resolveRound(s, acts, constRng(0.5));

describe("Chizuru's barriers", () => {
  it('one barrier at a time; a new one replaces the old', () => {
    let s = round(makeBattle([chizuru(), P('noel')], [foe()]), cast('ward'));
    expect(s.barriers).toEqual([{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }]);   // 3 rounds, one gone
    expect(s.party.map((c) => c.ward?.def)).toEqual([30, 30]);
    s = round(s, cast('purify-ward'));
    expect(s.barriers?.map((b) => b.kind)).toEqual(['purify']);
    expect(s.party.some((c) => c.ward)).toBe(false);
  });

  it('the purifying barrier heals and cures before the ticks, credited to Chizuru, even after she falls', () => {
    const l = newLedger();
    const s0 = makeBattle([chizuru(), P('noel', { hp: 50, poison: true, poisonSrc: 'e0' })], [foe()],
      { barriers: [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 3, src: 'chizuru' }] });
    const s = resolveRound(s0, {}, constRng(0.5), l);
    const healed = Math.floor((30 / 100) * (30 * 2 + 10));
    const noel = s.party[1];
    expect(noel.poison).toBe(false);                     // cured before the poison could tick
    expect(s.log.some((e) => e.type === 'poison-tick')).toBe(false);
    expect(noel.hp).toBe(50 + healed);
    expect(l.by.chizuru.healing).toBe(healed);
    expect(s.barriers).toEqual([{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 2, src: 'chizuru' }]);
    // She is down; her barrier still works and is still hers.
    const l2 = newLedger();
    const s2 = resolveRound(makeBattle([chizuru({ alive: false, hp: 0 }), P('noel', { hp: 50 })], [foe()],
      { barriers: [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 3, src: 'chizuru' }] }), {}, constRng(0.5), l2);
    expect(s2.party[1].hp).toBe(50 + healed);
    expect(l2.by.chizuru.healing).toBe(healed);
  });

  it('the great barrier doubles the barrier and adds three rounds', () => {
    const s = round(makeBattle([chizuru(), P('noel')], [foe()], { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }] }), cast('great-barrier'));
    expect(s.barriers).toEqual([{ skill: 'ward', kind: 'guard', power: 30, turns: 4, src: 'chizuru', boost: 2 }]);   // 2 + 3, one gone
    expect(s.party[1].ward?.def).toBe(60);
    // Nothing to boost: nothing changes, the TP is paid, and the log says why.
    const none = round(makeBattle([chizuru()], [foe()]), cast('great-barrier'));
    expect(none.barriers ?? []).toEqual([]);
    expect(none.party[0].tp).toBe(99 - SKILLS['great-barrier'].tp);
    expect(none.log).toContainEqual({ type: 'mech', actor: 'chizuru', cue: 'no-barrier' });
  });

  it('release spends the barrier for ten percent a round left', () => {
    const withWard = (turns: number) => makeBattle([chizuru()], [foe()], { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns, src: 'chizuru' }] });
    const power = (s: BattleState) => { const d = castDef(s, s.party[0], SKILLS['exorcism-thrust']).effects[0]; return d.kind === 'damage' ? d.power : NaN; };
    expect(power(withWard(3))).toBe(195);   // 150 at +10% a round left
    expect(power(makeBattle([chizuru()], [foe()]))).toBe(150);
    const after = round(withWard(3), cast('exorcism-thrust'));
    expect(after.barriers ?? []).toEqual([]);
    expect(after.party[0].ward).toBeUndefined();
    // Heaven's spear releases too; another skill leaves the barrier alone.
    expect(SKILLS['heaven-spear'].mech).toBe('release');
    expect(round(withWard(3), cast('pierce')).barriers?.length).toBe(1);
  });

  it('barriers draw nothing', () => {
    const draws = (barriers: BattleState['barriers']) => {
      let n = 0;
      const rng = () => { n++; return 0.5; };
      let s = makeBattle([chizuru(), P('noel', { hp: 150, poison: true, poisonSrc: 'e0', max: { hp: 300, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10 } })], [foe({ sleep: 0 })], barriers ? { barriers } : {});
      for (let i = 0; i < 3; i++) s = resolveRound(s, { chizuru: { kind: 'defend' } }, rng);
      return n;
    };
    expect(draws([{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 5, src: 'chizuru' }])).toBe(draws([{ skill: 'ward', kind: 'guard', power: 30, turns: 5, src: 'chizuru' }]));
  });
});

describe("Chizuru's barrier nodes (plan 8d Task 5)", () => {
  /** A constant rng that counts its draws. */
  const counting = (v: number) => { const f = Object.assign(() => { f.n += 1; return v; }, { n: 0 }); return f; };
  const two = () => [foe(), foe({ key: 'e1' })];
  const guard = (turns = 3): BattleState['barriers'] => [{ skill: 'ward', kind: 'guard', power: 30, turns, src: 'chizuru' }];

  it('the thunder ward strikes every foe at round end, credited to Chizuru; no barrier, no strike and no draw', () => {
    const c = chizuru({ ranks: { 'chizuru-thunder-ward': 1 } });
    const l = newLedger();
    const s = resolveRound(makeBattle([c, P('noel')], two(), { barriers: guard() }), {}, constRng(0.5), l);
    const hits = s.log.filter((e) => e.type === 'damage' && e.element === 'thunder');
    expect(hits.map((e) => (e as { target: string }).target)).toEqual(['e0', 'e1']);
    const dealt = s.enemies.reduce((n, e) => n + e.max.hp - e.hp, 0);
    expect(dealt).toBeGreaterThan(0);
    expect(l.by.chizuru.damage).toBe(dealt);
    // A stronger rank strikes harder.
    const c3 = chizuru({ ranks: { 'chizuru-thunder-ward': 3 } });
    const s3 = resolveRound(makeBattle([c3, P('noel')], two(), { barriers: guard() }), {}, constRng(0.5));
    expect(s3.enemies[0].max.hp - s3.enemies[0].hp).toBeGreaterThan(s.enemies[0].max.hp - s.enemies[0].hp);
    // Its word on the field bar.
    expect(fieldWords(makeBattle([c], two(), { barriers: guard() })).map((w) => w.text)).toEqual(['守之結界・雷3']);
    // No barrier up: nothing strikes, nothing is drawn beyond a plain round's draws.
    const n = (ranks: Record<string, number>) => {
      const rng = counting(0.5);
      resolveRound(makeBattle([chizuru({ ranks }), P('noel')], two()), {}, rng);
      return rng.n;
    };
    expect(n({ 'chizuru-thunder-ward': 1 })).toBe(n({}));
    // With a barrier: exactly one hit's rolls a foe (variance; no crit, block or evasion stat to roll).
    const m = (ranks: Record<string, number>) => {
      const rng = counting(0.5);
      resolveRound(makeBattle([chizuru({ ranks }), P('noel')], two(), { barriers: guard() }), {}, rng);
      return rng.n;
    };
    expect(m({ 'chizuru-thunder-ward': 1 }) - m({})).toBe(2);
  });

  it('two kinds at once with the twin ward; the later one at its percent; the same kind replaces its own', () => {
    const c = chizuru({ ranks: { ward: 1, 'purify-ward': 1, 'chizuru-twin-ward': 1 } });
    let s = round(makeBattle([c, P('noel')], [foe()]), cast('ward'));
    s = round(s, cast('purify-ward'));
    expect(s.barriers?.map((b) => [b.kind, b.turns])).toEqual([['guard', 1], ['purify', 2]]);
    expect(s.party[1].ward?.def).toBe(30);                                  // the earlier one whole
    expect(s.barriers![1].pair).toBe(60);                                   // the later one at 60%
    s = round(s, cast('ward'));
    expect(s.barriers?.map((b) => b.kind)).toEqual(['purify', 'guard']);   // the old guard replaced: now the later one
    expect(s.party[1].ward?.def).toBe(18);                                  // 30 x 60%
    expect(s.barriers![0].pair).toBeUndefined();
    // Without the node a new barrier still replaces the old.
    const plain = round(round(makeBattle([chizuru(), P('noel')], [foe()]), cast('ward')), cast('purify-ward'));
    expect(plain.barriers?.map((b) => b.kind)).toEqual(['purify']);
    // The later purifying barrier heals at its percent.
    const heal = (pair?: number) => {
      const s0 = makeBattle([chizuru(), P('noel', { hp: 10 })], [foe()], { barriers: [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 3, src: 'chizuru', ...(pair ? { pair } : {}) }] });
      return round(s0).party[1].hp - 10;
    };
    expect(heal(60)).toBe(Math.floor((18 / 100) * (30 * 2 + 10)));
    expect(heal()).toBe(Math.floor((30 / 100) * (30 * 2 + 10)));
  });

  it('release keeps the barrier with 連解, short of its rounds', () => {
    const c = chizuru({ ranks: { 'exorcism-thrust': 1, 'chizuru-release-keep': 1 } });
    const s = round(makeBattle([c], [foe()], { barriers: guard(5) }), cast('exorcism-thrust'));
    expect(s.barriers?.map((b) => b.turns)).toEqual([1]);                  // 5 − 3, then the round's end
    const s2 = round(makeBattle([chizuru({ ranks: { 'exorcism-thrust': 1, 'chizuru-release-keep': 3 } })], [foe()], { barriers: guard(5) }), cast('exorcism-thrust'));
    expect(s2.barriers?.map((b) => b.turns)).toEqual([3]);                 // 5 − 1, then the round's end
    // Too few rounds left: it goes, as without the node.
    expect(round(makeBattle([c], [foe()], { barriers: guard(3) }), cast('exorcism-thrust')).barriers ?? []).toEqual([]);
    // The thrust is as strong as without the node.
    const power = (x: Combatant) => { const st = makeBattle([x], [foe()], { barriers: guard(5) }); const d = castDef(st, x, SKILLS['exorcism-thrust']).effects[0]; return d.kind === 'damage' ? d.power : NaN; };
    expect(power(c)).toBe(power(chizuru()));
  });

  it('祓 wakes the sleeping at round end; at power 100% it heals as without the node', () => {
    const c = chizuru({ ranks: { 'purify-ward': 1, 'chizuru-purify-wake': 1 } });
    let s = round(makeBattle([c, P('noel', { hp: 10, sleep: 2 })], [foe()]), cast('purify-ward'));
    expect(s.barriers?.[0].wake).toBe(true);
    expect(s.party[1].sleep).toBe(0);
    expect(s.log).toContainEqual({ type: 'cure', target: 'noel' });
    const plain = round(makeBattle([chizuru({ ranks: { 'purify-ward': 1 } }), P('noel', { hp: 10, sleep: 2 })], [foe()]), cast('purify-ward'));
    expect(plain.party[1].sleep).toBe(1);                                 // slept through her turn, still asleep
    expect(s.party[1].hp).toBe(plain.party[1].hp);
    // Its ranks raise the heal.
    s = round(makeBattle([chizuru({ ranks: { 'purify-ward': 1, 'chizuru-purify-wake': 3 } }), P('noel', { hp: 10 })], [foe()]), cast('purify-ward'));
    expect(s.barriers?.[0].power).toBe(39);                                 // 30 x 130%
  });
});
