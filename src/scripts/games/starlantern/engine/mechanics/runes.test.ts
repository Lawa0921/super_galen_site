import { describe, expect, it } from 'vitest';
import { resolveRound, type Action, type BattleState } from '../battle';
import { rollHit, type BattleEvent, type Combatant } from '../combatant';
import { mulberry32, type Rng } from '../rng';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { castCost } from './index';
import { echoOf } from './echo';
import { skillFor } from '../battle';
import { T } from '../../data/text.zh-TW';
import type { RuneId, RuneRef } from '../../data/runes';

const R = (id: RuneId, tier: RuneRef['tier'] = 'legendary'): RuneRef => ({ id, tier });
const MAX = { hp: 300, tp: 99, atk: 40, def: 20, mag: 60, res: 20, spd: 10 };
/** A member; an `over.max` replaces MAX as a whole, so callers spread MAX into it. */
const member = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, max: MAX, ...over });
const tough = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 }, frozen: true, ...over });
const counting = (base: Rng): Rng & { n: number } => {
  const f = (() => { f.n++; return base(); }) as Rng & { n: number };
  f.n = 0;
  return f;
};
/** The damage the foes take (a thawed foe's blows on the party are left out). */
const damage = (log: BattleEvent[]) => log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.target.startsWith('e'));
const acts = (log: BattleEvent[], actor: string) => log.filter((e): e is Extract<BattleEvent, { type: 'act' }> => e.type === 'act' && e.actor === actor).map((e) => e.label);
const cast = (skill: string, target?: string): Action => ({ kind: 'skill', skill, ...(target ? { target } : {}) });
/** Plays rounds one after another, each with its own actions. */
const play = (s: BattleState, rounds: Record<string, Action>[], rng: Rng = constRng(0.5)): BattleState[] => {
  const out: BattleState[] = [];
  for (const acts of rounds) out.push((s = resolveRound(s, acts, rng)));
  return out;
};

describe('runes on every cast (plan 8e Task 5)', () => {
  it('twin-cast casts twice for one doubled price', () => {
    const noel = member('noel', { runes: { 'fire-star': [R('twin-cast')] } });
    const r = resolveRound(makeBattle([noel], [tough('e0')]), { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(r.party[0].tp).toBe(99 - 8);
    expect(damage(r.log).filter((e) => e.target === 'e0')).toHaveLength(2);
    expect(acts(r.log, 'noel')).toEqual(['火之星彈', '火之星彈（第二次）']);
    // One action for the mechanics: Safira's beat rises once.
    const safira = member('safira', { mech: { kind: 'beat', beat: 0, last: null }, runes: { 'blade-dance': [R('twin-cast')] } });
    const b = resolveRound(makeBattle([safira], [tough('e0')]), { safira: cast('blade-dance', 'e0') }, constRng(0.5));
    expect(b.party[0].mech).toMatchObject({ kind: 'beat', beat: 1 });
  });

  it('the second cast moves on when its foe falls', () => {
    const noel = () => member('noel', { runes: { 'fire-star': [R('twin-cast')] } });
    const plain = () => member('noel');
    const frail = (key: string) => tough(key, { hp: 1 });
    // e0 falls to the first cast: the second strikes e1, choosing it with no draw.
    const twin = counting(mulberry32(9));
    const a = resolveRound(makeBattle([noel()], [frail('e0'), tough('e1')]), { noel: cast('fire-star', 'e0') }, twin);
    expect(damage(a.log).map((e) => e.target)).toEqual(['e0', 'e1']);
    const once = counting(mulberry32(9));
    resolveRound(makeBattle([plain()], [frail('e0'), tough('e1')]), { noel: cast('fire-star', 'e0') }, once);
    const one = counting(mulberry32(9));
    rollHit(noel(), tough('e1'), skillFor(noel(), 'fire-star')!.effects[0] as never, one);
    expect(twin.n - once.n).toBe(one.n);
    // No foe left standing: the second cast does nothing, and says nothing.
    const none = resolveRound(makeBattle([noel()], [frail('e0')]), { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(acts(none.log, 'noel')).toEqual(['火之星彈']);
    expect(none.outcome).toBe('win');
    // A heal on one ally: both casts on the same one.
    const selene = member('selene', { runes: { moonlight: [R('twin-cast')] } });
    const hurt = member('noel', { hp: 10 });
    const h = resolveRound(makeBattle([selene, hurt], [tough('e0')]), { selene: cast('moonlight', 'noel') }, constRng(0.5));
    expect(h.log.filter((e) => e.type === 'heal').map((e) => (e as { target: string }).target)).toEqual(['noel', 'noel']);
    // A revive: a second fallen ally stands up too; with only one down, the second cast does nothing.
    const sel = () => member('selene', { runes: { rebirth: [R('twin-cast')] } });
    const down = (key: string) => member(key, { hp: 0, alive: false });
    const two = resolveRound(makeBattle([sel(), down('noel'), down('rin')], [tough('e0')]), { selene: cast('rebirth', 'noel') }, constRng(0.5));
    expect(two.party.map((c) => c.alive)).toEqual([true, true, true]);
    const lone = resolveRound(makeBattle([sel(), down('noel')], [tough('e0')]), { selene: cast('rebirth', 'noel') }, constRng(0.5));
    expect(lone.log.filter((e) => e.type === 'revive')).toHaveLength(1);
    expect(acts(lone.log, 'selene')).toEqual(['月之再生']);
    // 彈射 follows the first cast only: e0, e1, e2, then e0 again.
    const bounce = member('noel', { runes: { 'fire-star': [R('bounce', 'magic'), R('twin-cast')] } });
    const bb = resolveRound(makeBattle([bounce], [tough('e0'), tough('e1'), tough('e2')]), { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(damage(bb.log).map((e) => e.target)).toEqual(['e0', 'e1', 'e2', 'e0']);
  });

  it('熟記 caps a twin-cast mark', () => {
    const rin = (ranks: Record<string, number>) => member('rin', { mech: { kind: 'mark', marks: [], cap: 1 }, ranks, runes: { 'rin-mark': [R('twin-cast')] } });
    const honed = rin({ 'rin-mark-hone': 1 });
    const s = makeBattle([honed], [tough('e0')]);
    expect(castCost(s, honed, 'rin-mark')).toBe(5);
    const r = resolveRound(s, { rin: cast('rin-mark', 'e0') }, constRng(0.5));
    expect(r.party[0].tp).toBe(99 - 5);
    expect(castCost(makeBattle([rin({})], [tough('e0')]), rin({}), 'rin-mark')).toBe(12);
  });

  it("the hero's echo of a twin-cast skill strikes once at the single price", () => {
    const noel = member('noel', { runes: { 'fire-star': [R('twin-cast')] }, max: { ...MAX, spd: 50 } });
    const hero = member('hero', { max: { ...MAX, spd: 1 } });
    const r = resolveRound(makeBattle([hero, noel], [tough('e0')]), { noel: cast('fire-star', 'e0'), hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    expect(r.party[0].tp).toBe(99 - 4);
    const at = r.log.findIndex((e) => e.type === 'act' && e.actor === 'hero');
    expect(damage(r.log.slice(at)).filter((e) => e.target === 'e0')).toHaveLength(1);
    expect(acts(r.log, 'hero')).toEqual([T.cmd.echoAct('火之星彈')]);
    expect(echoOf(r)!.cost).toBe(4);
  });

  it('the starwheel turns fire, ice, thunder', () => {
    const noel = member('noel', { runes: { 'fire-star': [R('starwheel')], 'ice-star': [R('starwheel')] } });
    const rounds = play(makeBattle([noel], [tough('e0')]), [1, 2, 3, 4].map(() => ({ noel: cast('fire-star', 'e0') })));
    expect(rounds.map((r) => damage(r.log)[0].element)).toEqual(['fire', 'ice', 'thunder', 'fire']);
    expect(rounds[3].party[0].wheel).toEqual({ 'fire-star': 4 });
    // Another skill counts on its own.
    const ice = play(rounds[1], [{ noel: cast('ice-star', 'e0') }]);
    expect(damage(ice[0].log)[0].element).toBe('fire');
    // Short of TP, no cast and no turn.
    const broke = play(makeBattle([member('noel', { tp: 1, runes: { 'fire-star': [R('starwheel')] } })], [tough('e0')]), [{ noel: cast('fire-star', 'e0') }]);
    expect(broke[0].party[0].wheel).toBeUndefined();
  });

  it("sync lifts the next ally's skill once", () => {
    const fast = (key: string, spd: number, over: Partial<Combatant> = {}) => member(key, { ...over, max: { ...MAX, spd } });
    const team = () => [fast('noel', 90, { runes: { 'fire-star': [R('sync')] } }), fast('rin', 80), fast('liz', 70)];
    const hits = (log: BattleEvent[], from: string) => {
      const at = log.findIndex((e) => e.type === 'act' && e.actor === from);
      return damage(log.slice(at))[0].amount;
    };
    const lifted = resolveRound(makeBattle(team(), [tough('e0')]), { noel: cast('fire-star', 'e0'), rin: cast('rin-needle', 'e0'), liz: cast('twin-slash', 'e0') }, constRng(0.5));
    const plain = resolveRound(makeBattle([fast('noel', 90), fast('rin', 80), fast('liz', 70)], [tough('e0')]), { noel: cast('fire-star', 'e0'), rin: cast('rin-needle', 'e0'), liz: cast('twin-slash', 'e0') }, constRng(0.5));
    expect(hits(lifted.log, 'rin')).toBeGreaterThan(hits(plain.log, 'rin'));
    expect(hits(lifted.log, 'liz')).toBe(hits(plain.log, 'liz'));
    expect(lifted.sync).toBeUndefined();
    // Rin attacks: the sync waits for the next ally who casts a skill.
    const waited = resolveRound(makeBattle(team(), [tough('e0')]), { noel: cast('fire-star', 'e0'), rin: { kind: 'attack', target: 'e0' }, liz: cast('twin-slash', 'e0') }, constRng(0.5));
    expect(hits(waited.log, 'liz')).toBeGreaterThan(hits(plain.log, 'liz'));
    // Unused by the round's end, it is gone.
    const unused = resolveRound(makeBattle(team(), [tough('e0')]), { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(unused.sync).toBeUndefined();
  });

  it("reprise strikes again at the next round's end", () => {
    const noel = (over: Partial<Combatant> = {}) => member('noel', { runes: { 'fire-star': [R('reprise')] }, ...over });
    const [r1, r2] = play(makeBattle([noel()], [tough('e0'), tough('e1')]), [{ noel: cast('fire-star', 'e0') }, {}]);
    expect(acts(r1.log, 'noel')).toEqual(['火之星彈']);
    expect(acts(r2.log, 'noel')).toEqual([T.rune.reprise('火之星彈')]);
    const echoHit = damage(r2.log).filter((e) => e.target === 'e0');
    expect(echoHit).toHaveLength(1);
    expect(r2.reprises ?? []).toEqual([]);
    // Its power is 50% of the cast's: 70 against 140.
    expect(r1.reprises).toEqual([expect.objectContaining({ by: 'noel', target: 'e0', round: 2 })]);
    expect((r1.reprises![0].effects[0] as { power: number }).power).toBe(70);
    // The foe or the caster falls in round 2: nothing.
    const gone = resolveRound({ ...r1, enemies: r1.enemies.map((e) => (e.key === 'e0' ? { ...e, hp: 0, alive: false } : e)) }, {}, constRng(0.5));
    expect(acts(gone.log, 'noel')).toEqual([]);
    const dead = resolveRound({ ...r1, party: r1.party.map((c) => ({ ...c, hp: 0, alive: false })) }, {}, constRng(0.5));
    expect(acts(dead.log, 'noel')).toEqual([]);
    // Meant for e0 but e0 was down: the cast struck e1, and so does its reprise.
    const [m1, m2] = play(makeBattle([noel()], [tough('e0', { hp: 0, alive: false }), tough('e1')]), [{ noel: cast('fire-star', 'e0') }, {}]);
    expect(m1.reprises![0].target).toBe('e1');
    expect(damage(m2.log).map((e) => e.target)).toEqual(['e1']);
    // A cast that missed altogether leaves no reprise.
    const [d1] = play(makeBattle([noel()], [tough('e0', { x: { evasion: 50 } })]), [{ noel: cast('fire-star', 'e0') }], constRng(0.1));
    expect(d1.reprises ?? []).toEqual([]);
    // After 彈射 the reprise still aims at the first foe the cast struck, not the last the bounce reached.
    const both = member('noel', { runes: { 'fire-star': [R('bounce', 'magic'), R('reprise')] } });
    const [b1] = play(makeBattle([both], [tough('e0'), tough('e1'), tough('e2')]), [{ noel: cast('fire-star', 'e0') }]);
    expect(damage(b1.log).map((e) => e.target)).toEqual(['e0', 'e1', 'e2']);
    expect(b1.reprises![0].target).toBe('e0');
  });

  it('blood price leaves her at 1 HP and pays no TP', () => {
    const noel = (hp: number) => member('noel', { hp, tp: 0, max: { ...MAX, hp: 200 }, x: { tpCost: 20 }, mech: { kind: 'heat', heat: 0 }, runes: { 'fire-star': [R('blood-price')] } });
    const low = noel(10);
    const s = makeBattle([low], [tough('e0')]);
    expect(castCost(s, low, 'fire-star')).toBe(0);
    const r = resolveRound(s, { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(acts(r.log, 'noel')).toEqual(['火之星彈']);
    expect([r.party[0].hp, r.party[0].tp]).toEqual([1, 0]);
    const mid = resolveRound(makeBattle([noel(100)], [tough('e0')]), { noel: cast('fire-star', 'e0') }, constRng(0.5));
    expect(mid.party[0].hp).toBe(76);
  });
});
