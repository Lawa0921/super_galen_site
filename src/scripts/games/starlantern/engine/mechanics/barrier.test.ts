import { describe, expect, it } from 'vitest';
import { resolveRound, type Action, type BattleState } from '../battle';
import type { Combatant } from '../combatant';
import { newLedger } from '../ledger';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { SKILLS } from '../../data/skills';
import { castDef } from './index';
import { BARRIER } from './barrier';

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
    expect(power(withWard(3))).toBe(Math.round((150 * (100 + BARRIER.releasePct * 3)) / 100));
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
