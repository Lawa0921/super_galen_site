import { describe, expect, it } from 'vitest';
import { LIMIT_PER_ACTION, createBattle, resolveRound, writeBack, type Action, type BattleState } from '../battle';
import { hitAmount, rollHit, type BattleEvent, type Combatant } from '../combatant';
import { applyEffect, pctOf, type EffectContext } from '../skills';
import { BARRIER } from '../mech';
import { SKILLS } from '../../data/skills';
import { mulberry32, type Rng } from '../rng';
import { constRng, fullParty, makeBattle, makeCombatant } from '../testing';
import { applyLasting, battleReservePct, lastingTargets } from './runes';
import { reservedTpPct } from '../sockets';
import { stat } from '../combatant';
import { castCost } from './index';
import { echoOf } from './echo';
import { skillFor } from '../battle';
import { T } from '../../data/text.zh-TW';
import type { RuneId, RuneRef } from '../../data/runes';
import type { Effect } from '../types';

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

describe('runes on every cast: review fixes (plan 8e Task 5 review)', () => {
  const fast = (key: string, spd: number, over: Partial<Combatant> = {}) => member(key, { ...over, max: { ...MAX, spd } });

  it("a reprise strikes at the cast's own power, not the sync's", () => {
    const team = [fast('noel', 90, { runes: { 'fire-star': [R('sync')] } }), fast('liz', 80, { runes: { 'twin-slash': [R('reprise')] } })];
    const r = resolveRound(makeBattle(team, [tough('e0')]), { noel: cast('fire-star', 'e0'), liz: cast('twin-slash', 'e0') }, constRng(0.5));
    // Her cast was lifted (the sync is used up), but the reprise it leaves is 50% of 雙刃's own 60.
    expect(r.sync).toBeUndefined();
    expect((r.reprises![0].effects[0] as { power: number }).power).toBe(pctOf(60, 50));
  });

  it('only a skill the sync can lift uses it up: a damage or heal skill', () => {
    const team = () => [fast('noel', 90, { runes: { 'fire-star': [R('sync')] } }), fast('rin', 80), fast('liz', 70)];
    const acts = { noel: cast('fire-star', 'e0'), rin: cast('rin-veil'), liz: cast('twin-slash', 'e0') };
    const lifted = resolveRound(makeBattle(team(), [tough('e0')]), acts, constRng(0.5));
    const plain = resolveRound(makeBattle([fast('noel', 90), fast('rin', 80), fast('liz', 70)], [tough('e0')]), acts, constRng(0.5));
    const lizHit = (log: BattleEvent[]) => damage(log.slice(log.findIndex((e) => e.type === 'act' && e.actor === 'liz')))[0].amount;
    // Rin's veil is neither: it leaves the sync for Liz.
    expect(lizHit(lifted.log)).toBeGreaterThan(lizHit(plain.log));
  });

  it('aftermath and a once-a-cast ailment of its kind are one try on a crit, against a boss too', () => {
    const sure = (c: Combatant): Effect[] => skillFor(c, 'ice-star')!.effects.map((e) => (e.kind === 'damage' ? { ...e, crit: 'always' as const } : e));
    const both = member('noel', { runes: { 'ice-star': [R('aftermath', 'magic'), R('frostbite', 'magic')] } });
    const alone = member('noel', { runes: { 'ice-star': [R('aftermath', 'magic')] } });
    const cast1 = (c: Combatant, t: Combatant, effects: readonly Effect[]) => {
      const rng = counting(constRng(0.5));
      const ctx: EffectContext = { rng, itemBoost: false, revealed: {}, log: [] };
      for (const e of effects) applyEffect(c, t, e, ctx);
      return { n: rng.n, log: ctx.log };
    };
    for (const boss of [false, true]) {
      const a = cast1(both, tough('e0', { frozen: undefined, boss }), sure(both));
      const b = cast1(alone, tough('e0', { frozen: undefined, boss }), sure(alone));
      expect(a.n, `boss ${boss}`).toBe(b.n);
      expect(a.log.filter((e) => e.type === 'status')).toHaveLength(1);
    }
    // Without a crit, 凍結 tries on its own once.
    const calm = cast1(both, tough('e0', { frozen: undefined }), skillFor(both, 'ice-star')!.effects);
    const bare = cast1(member('noel'), tough('e0', { frozen: undefined }), skillFor(member('noel'), 'ice-star')!.effects);
    expect(calm.n - bare.n).toBe(1);
  });

  it('no skill puts an ailment before its damage, so 餘波 always tries first', () => {
    for (const [id, def] of Object.entries(SKILLS)) {
      const firstDamage = def.effects.findIndex((e) => e.kind === 'damage');
      if (firstDamage < 0) continue;
      expect(def.effects.slice(0, firstDamage).some((e) => e.kind === 'inflict'), id).toBe(false);
    }
  });

  it('twin-cast pays the mechanic again: 一擲千金 throws what she holds now, none when it ran out', () => {
    const liz = (coins: number) => member('liz', { mech: { kind: 'coins', coins }, runes: { jackpot: [R('twin-cast')] } });
    // One coin, dodged: none left, so the second throw has nothing to throw.
    const dry = resolveRound(makeBattle([liz(1)], [tough('e0', { x: { evasion: 50 } })]), { liz: cast('jackpot') }, constRng(0.1));
    expect(dry.log.filter((e) => e.type === 'miss')).toHaveLength(1);
    expect(damage(dry.log)).toHaveLength(0);
    expect(acts(dry.log, 'liz')).toEqual(['一擲千金', '一擲千金（第二次）']);
    expect(dry.party[0].mech).toMatchObject({ coins: 0 });
    // Two coins that land come back one a hit: the second throw spends those two again.
    const wet = resolveRound(makeBattle([liz(2)], [tough('e0')]), { liz: cast('jackpot') }, constRng(0.5));
    expect(damage(wet.log)).toHaveLength(4);
    expect(wet.party[0].mech).toMatchObject({ coins: 2 });
  });

  it('twin-cast pays the mechanic again: 天之逆鉾 releases the barrier once, the second strike has none', () => {
    const chizuru = member('chizuru', { mech: { kind: 'barrier' }, runes: { 'heaven-spear': [R('twin-cast')] } });
    const ward = { skill: 'ward', kind: 'guard' as const, power: 30, turns: 3, src: 'chizuru' };
    const r = resolveRound(makeBattle([chizuru], [tough('e0')], { barriers: [ward] }), { chizuru: cast('heaven-spear', 'e0') }, constRng(0.5));
    const [first, second] = damage(r.log).map((e) => e.amount);
    expect(r.barriers ?? []).toEqual([]);
    const at = (power: number) => hitAmount(chizuru, tough('e0'), { power, element: 'phys', scale: 'atk', melee: true }, { variance: 1, crit: false, blocked: false }).amount;
    expect(second).toBe(at(330));
    expect(first).toBe(at(pctOf(330, 100 + BARRIER.releasePct * 3)));
  });
});

describe('trigger runes (plan 8e Task 6)', () => {
  const crit = (id: RuneId): RuneRef => ({ id, tier: 'magic' });
  const triggers = (log: BattleEvent[]) => log.filter((e) => e.type === 'trigger');
  const after = (log: BattleEvent[], i: number) => damage(log.slice(i));
  const atk = (target: string): Action => ({ kind: 'attack', target });
  const rolls = (c = false) => ({ variance: 1, crit: c, blocked: false });

  it('a crit sets off the crit trigger after the action, at 60%, for free', () => {
    const rin = member('rin', { nextCrit: true, runes: { 'rin-needle': [crit('on-crit')] } });
    const r = resolveRound(makeBattle([rin], [tough('e0')]), { rin: atk('e0') }, constRng(0.5));
    expect(triggers(r.log)).toEqual([{ type: 'trigger', actor: 'rin', skill: 'rin-needle', rune: 'on-crit' }]);
    const at = r.log.findIndex((e) => e.type === 'trigger');
    expect(r.log.slice(0, at).some((e) => e.type === 'damage' && e.crit)).toBe(true);
    const spec = { power: pctOf(65, 60), element: 'phys', scale: 'atk', melee: false } as const;
    expect(after(r.log, at).map((e) => e.amount)).toEqual([0, 1].map(() => hitAmount(member('rin'), tough('e0'), spec, rolls()).amount));
    expect(r.party[0].tp).toBe(99);
    expect(r.party[0].limit).toBe(LIMIT_PER_ACTION);
  });

  it('once a round, and a triggered cast sets off nothing', () => {
    const rin = member('rin', { x: { crit: 100 }, runes: { 'rin-needle': [crit('on-crit')] } });
    const rounds = play(makeBattle([rin], [tough('e0', { frozen: undefined, sleep: 0, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } })]),
      [{ rin: cast('rin-needle', 'e0') }, { rin: cast('rin-needle', 'e0') }]);
    // Two crits in her cast, and two more in the triggered needle: one trigger a round.
    for (const r of rounds) expect(triggers(r.log)).toHaveLength(1);
  });

  it('a kill and a blow set off theirs', () => {
    const rin = member('rin', { max: { ...MAX, atk: 999 }, runes: { 'rin-needle': [crit('on-kill')] } });
    const k = resolveRound(makeBattle([rin], [tough('e0', { hp: 1 }), tough('e1')]), { rin: atk('e0') }, constRng(0.5));
    expect(triggers(k.log)).toEqual([{ type: 'trigger', actor: 'rin', skill: 'rin-needle', rune: 'on-kill' }]);
    expect(after(k.log, k.log.findIndex((e) => e.type === 'trigger')).map((e) => e.target)).toEqual(['e1', 'e1']);
    // A blow on her: after that foe's action, 挑釁 for free.
    const scarlet = (over: Partial<Combatant> = {}) => member('scarlet', { runes: { provoke: [crit('on-struck')] }, max: { ...MAX, spd: 1 }, ...over });
    const awake = () => tough('e0', { frozen: undefined, max: { hp: 99999, tp: 0, atk: 10, def: 20, mag: 1, res: 20, spd: 50 } });
    // The foe has announced a plain blow on her.
    const hits = { intents: { e0: { kind: 'attack' as const, target: 'scarlet' } } };
    const struck = resolveRound(makeBattle([scarlet()], [awake()], hits), {}, constRng(0.5));
    const i = struck.log.findIndex((e) => e.type === 'trigger');
    expect(triggers(struck.log)).toEqual([{ type: 'trigger', actor: 'scarlet', skill: 'provoke', rune: 'on-struck' }]);
    expect(struck.log.slice(0, i).some((e) => e.type === 'damage' && e.target === 'scarlet')).toBe(true);
    expect(struck.log.slice(i)).toContainEqual({ type: 'taunt', target: 'scarlet' });
    // A blow she dodges sets off nothing; nor one that finds her frozen.
    const dodge = resolveRound(makeBattle([scarlet({ x: { evasion: 9999 } })], [awake()], hits), {}, constRng(0.01));
    expect(dodge.log).toContainEqual({ type: 'miss', target: 'scarlet' });
    expect(triggers(dodge.log)).toEqual([]);
    const frozen = resolveRound(makeBattle([scarlet({ frozen: true })], [awake()], hits), {}, constRng(0.5));
    expect(frozen.log.some((e) => e.type === 'damage' && e.target === 'scarlet')).toBe(true);
    expect(triggers(frozen.log)).toEqual([]);
  });

  it('only her own blows count', () => {
    // 回聲 at the round's end fells the foe: her 擊倒觸發 stays quiet.
    const noel = member('noel', { runes: { 'fire-star': [crit('on-kill'), R('reprise')] } });
    const [r1] = play(makeBattle([noel], [tough('e0'), tough('e1')]), [{ noel: cast('fire-star', 'e0') }]);
    const r2 = resolveRound({ ...r1, enemies: r1.enemies.map((e) => (e.key === 'e0' ? { ...e, hp: 1 } : e)) }, {}, constRng(0.5));
    expect(r2.log).toContainEqual({ type: 'ko', target: 'e0' });
    expect(triggers(r2.log)).toEqual([]);
    // A burn tick fells the foe: nothing.
    const rin = member('rin', { runes: { 'rin-needle': [crit('on-kill')] } });
    const burnt = resolveRound(makeBattle([rin], [tough('e0', { hp: 1, burn: { tick: 5, turns: 2, src: 'rin' } }), tough('e1')]), {}, constRng(0.5));
    expect(burnt.log).toContainEqual({ type: 'ko', target: 'e0' });
    expect(triggers(burnt.log)).toEqual([]);
    // The hero's echo crits: his own crit trigger stays quiet.
    const hero = member('hero', { x: { crit: 100 }, max: { ...MAX, spd: 1 }, runes: { 'hero-slash': [crit('on-crit')] } });
    const plainNoel = member('noel', { max: { ...MAX, spd: 50 } });
    const echoed = resolveRound(makeBattle([hero, plainNoel], [tough('e0')]), { noel: cast('fire-star', 'e0'), hero: { kind: 'echo', target: 'e0' } }, constRng(0.5));
    expect(echoed.log.some((e) => e.type === 'damage' && e.crit)).toBe(true);
    expect(triggers(echoed.log)).toEqual([]);
    // Bobby's turret crits at the round's end: his crit trigger stays quiet.
    const bobby = member('bobby', { x: { crit: 100 }, mech: { kind: 'devices', devices: [], cap: 2 }, runes: { cannon: [crit('on-crit')] } });
    const turret = resolveRound(makeBattle([bobby], [tough('e0')]), { bobby: cast('turret') }, constRng(0.5));
    expect(turret.log.some((e) => e.type === 'damage' && e.crit)).toBe(true);
    expect(triggers(turret.log)).toEqual([]);
    // Scarlet's 贖火 counter crits: her crit trigger stays quiet.
    const scarlet = member('scarlet', { x: { crit: 100 }, max: { ...MAX, spd: 90 }, runes: { 'flame-burst': [crit('on-crit')] } });
    const foe = tough('e0', { frozen: undefined, max: { hp: 99999, tp: 0, atk: 10, def: 20, mag: 1, res: 20, spd: 50 } });
    const counter = resolveRound(makeBattle([scarlet], [foe]), { scarlet: cast('atoning-flame') }, constRng(0.5));
    expect(counter.log.some((e) => e.type === 'damage' && e.target === 'e0' && e.crit)).toBe(true);
    expect(triggers(counter.log)).toEqual([]);
  });

  it('a trigger with no foe standing does nothing', () => {
    const rin = (runes?: Record<string, RuneRef[]>) => member('rin', { nextCrit: true, max: { ...MAX, atk: 999 }, ...(runes ? { runes } : {}) });
    const alone = resolveRound(makeBattle([rin({ 'rin-needle': [crit('on-crit')] })], [tough('e0', { hp: 1 })]), { rin: atk('e0') }, constRng(0.5));
    expect(triggers(alone.log)).toEqual([]);
    expect(alone.outcome).toBe('win');
    // The crit foe fell, another stands: the first one standing, and choosing it draws nothing.
    const a = counting(mulberry32(4));
    const r = resolveRound(makeBattle([rin({ 'rin-needle': [crit('on-crit')] })], [tough('e0', { hp: 1 }), tough('e1')]), { rin: atk('e0') }, a);
    expect(after(r.log, r.log.findIndex((e) => e.type === 'trigger')).map((e) => e.target)).toEqual(['e1', 'e1']);
    const b = counting(mulberry32(4));
    resolveRound(makeBattle([rin()], [tough('e0', { hp: 1 }), tough('e1')]), { rin: atk('e0') }, b);
    const needle = counting(mulberry32(4));
    const spec = skillFor(member('rin'), 'rin-needle')!.effects[0] as Parameters<typeof rollHit>[2];
    rollHit(member('rin'), tough('e1'), spec, needle);
    rollHit(member('rin'), tough('e1'), spec, needle);
    expect(a.n - b.n).toBe(needle.n);
  });

  it('two skills with one condition: the first learned fires', () => {
    // The slots list 飛針 first; she learned 暗記 first (it is innate): 暗記 fires.
    const rin = member('rin', { nextCrit: true, runes: { 'rin-needle': [crit('on-crit')], 'rin-mark': [crit('on-crit')] } });
    const r = resolveRound(makeBattle([rin], [tough('e0')]), { rin: atk('e0') }, constRng(0.5));
    expect(triggers(r.log)).toEqual([{ type: 'trigger', actor: 'rin', skill: 'rin-mark', rune: 'on-crit' }]);
  });

  it('a triggered cast is the plain skill', () => {
    const noel = (runes: RuneRef[], over: Partial<Combatant> = {}) => member('noel', { x: { crit: 100 }, runes: { 'fire-star': [crit('on-crit'), ...runes] }, ...over });
    // 雙重詠唱 and 彈射 do not ride on it: one cast, on the foe she struck.
    const r = resolveRound(makeBattle([noel([R('twin-cast'), R('bounce', 'magic')])], [tough('e0'), tough('e1'), tough('e2')]), { noel: atk('e0') }, constRng(0.5));
    const at = r.log.findIndex((e) => e.type === 'trigger');
    expect(after(r.log, at).map((e) => e.target)).toEqual(['e0']);
    expect(acts(r.log.slice(at), 'noel')).toEqual([]);
    // 星燈輪轉: the element now due, and the wheel does not turn.
    const w = resolveRound(makeBattle([noel([R('starwheel')], { wheel: { 'fire-star': 1 } })], [tough('e0')]), { noel: atk('e0') }, constRng(0.5));
    expect(after(w.log, w.log.findIndex((e) => e.type === 'trigger'))[0].element).toBe('ice');
    expect(w.party[0].wheel).toEqual({ 'fire-star': 1 });
    // In an abyss fight an abyss skill grows first, then the trigger's 60%.
    const hero = member('hero', { x: { crit: 100 }, runes: { 'abyss-star': [crit('on-crit')] } });
    const d = resolveRound(makeBattle([hero], [tough('e0')], { abyss: 20 }), { hero: atk('e0') }, constRng(0.5));
    const spec = { power: pctOf(pctOf(95, 120), 60), element: 'thunder', scale: 'mag', melee: false } as const;
    expect(after(d.log, d.log.findIndex((e) => e.type === 'trigger')).map((e) => e.amount)).toEqual([hitAmount(hero, tough('e0'), spec, rolls(true)).amount]);
  });
});

describe('trigger runes: review fixes (plan 8e Task 6 review)', () => {
  const crit = (id: RuneId): RuneRef => ({ id, tier: 'magic' });
  const triggers = (log: BattleEvent[]) => log.filter((e) => e.type === 'trigger');
  const atk = (target: string): Action => ({ kind: 'attack', target });

  it("a triggered cast starts clean: her cast's 餘波 tries do not stop its own 凍結", () => {
    // Her cast crits (readied): 餘波 chills the boss and 凍結 waits. The triggered cast does not crit: its 凍結 tries once.
    const noel = (runes: RuneRef[]) => member('noel', { nextCrit: true, runes: { 'ice-star': [crit('aftermath'), crit('frostbite'), ...runes] } });
    const boss = () => tough('e0', { boss: true });
    const a = counting(mulberry32(2)), b = counting(mulberry32(2));
    const r = resolveRound(makeBattle([noel([crit('on-crit')])], [boss()]), { noel: cast('ice-star', 'e0') }, a);
    resolveRound(makeBattle([noel([])], [boss()]), { noel: cast('ice-star', 'e0') }, b);
    expect(triggers(r.log)).toHaveLength(1);
    // The triggered cast: its hit's variance, and its 凍結.
    expect(a.n - b.n).toBe(2);
  });

  it('a sleeper the blow woke sets off nothing, and her trigger is still there for a later blow', () => {
    const scarlet = member('scarlet', { sleep: 3, runes: { provoke: [crit('on-struck')] }, max: { ...MAX, spd: 1 } });
    const foe = (key: string) => tough(key, { frozen: undefined, max: { hp: 99999, tp: 0, atk: 10, def: 20, mag: 1, res: 20, spd: key === 'e0' ? 60 : 50 } });
    const r = resolveRound(makeBattle([scarlet], [foe('e0'), foe('e1')], { intents: { e0: { kind: 'attack', target: 'scarlet' }, e1: { kind: 'attack', target: 'scarlet' } } }), {}, constRng(0.5));
    // e0's blow wakes her: nothing. e1's blow finds her awake: 挑釁.
    const blows = r.log.flatMap((e, i) => (e.type === 'damage' && e.target === 'scarlet' ? [i] : []));
    expect(blows).toHaveLength(2);
    const fired = r.log.findIndex((e) => e.type === 'trigger');
    expect(fired).toBeGreaterThan(blows[1]);
    expect(triggers(r.log)).toHaveLength(1);
  });

  it('no foe standing, no trigger: a heal or a buff does not fire after the win', () => {
    const scarlet = member('scarlet', { nextCrit: true, max: { ...MAX, atk: 999 }, runes: { 'iron-wall': [crit('on-crit')] } });
    const r = resolveRound(makeBattle([scarlet], [tough('e0', { hp: 1 })]), { scarlet: atk('e0') }, constRng(0.5));
    expect(r.log.some((e) => e.type === 'damage' && e.crit)).toBe(true);
    expect(r.outcome).toBe('win');
    expect(triggers(r.log)).toEqual([]);
  });

  it("a twin cast at the finale says the finale once", () => {
    const safira = member('safira', { mech: { kind: 'beat', beat: 4, last: null }, runes: { 'blade-dance': [R('twin-cast')] } });
    const r = resolveRound(makeBattle([safira], [tough('e0')]), { safira: cast('blade-dance', 'e0') }, constRng(0.5));
    expect(r.log.filter((e) => e.type === 'mech' && e.cue === 'finale')).toHaveLength(1);
    expect(acts(r.log, 'safira')).toEqual(['刃舞', '刃舞（第二次）']);
  });

  it('a triggered mechanic skill spends nothing: coins, embers, the barrier, HP', () => {
    // 大手筆 on Liz's crit: her coins only grow by her landed hits (none spent).
    const liz = member('liz', { nextCrit: true, mech: { kind: 'coins', coins: 3 }, runes: { 'fortune-strike': [crit('on-crit')] } });
    const l = resolveRound(makeBattle([liz], [tough('e0')]), { liz: atk('e0') }, constRng(0.5));
    expect(triggers(l.log)).toHaveLength(1);
    expect(l.party[0].mech).toMatchObject({ coins: 3 + damage(l.log).length });
    // 紅蓮終焉 on Scarlet's crit: her embers and HP stay.
    const scarlet = member('scarlet', { nextCrit: true, mech: { kind: 'embers', embers: 50 }, runes: { 'crimson-end': [crit('on-crit')] } });
    const s = resolveRound(makeBattle([scarlet], [tough('e0')]), { scarlet: atk('e0') }, constRng(0.5));
    expect(triggers(s.log)).toHaveLength(1);
    expect([s.party[0].hp, s.party[0].mech]).toEqual([300, { kind: 'embers', embers: 50 }]);
    // 天之逆鉾 on Chizuru's crit: the barrier stays up.
    const ward = { skill: 'ward', kind: 'guard' as const, power: 30, turns: 3, src: 'chizuru' };
    const chizuru = member('chizuru', { nextCrit: true, mech: { kind: 'barrier' }, runes: { 'heaven-spear': [crit('on-crit')] } });
    const c = resolveRound(makeBattle([chizuru], [tough('e0')], { barriers: [ward] }), { chizuru: atk('e0') }, constRng(0.5));
    expect(triggers(c.log)).toHaveLength(1);
    // As a round with no trigger leaves it (the round's end ages it).
    const plain = member('chizuru', { nextCrit: true, mech: { kind: 'barrier' } });
    const p = resolveRound(makeBattle([plain], [tough('e0')], { barriers: [ward] }), { chizuru: atk('e0') }, constRng(0.5));
    expect(c.barriers).toEqual(p.barriers);
    expect(c.barriers).toHaveLength(1);
  });

  it('an ally skill as a trigger goes to the lowest share of HP, with no draw', () => {
    const selene = (runes?: Record<string, RuneRef[]>) => member('selene', { max: { ...MAX, spd: 1 }, ...(runes ? { runes } : {}) });
    const hurt = () => member('noel', { hp: 30, max: { ...MAX, spd: 1 } });
    const foe = () => tough('e0', { frozen: undefined, max: { hp: 99999, tp: 0, atk: 10, def: 20, mag: 1, res: 20, spd: 50 } });
    const intents = { intents: { e0: { kind: 'attack' as const, target: 'selene' } } };
    const a = counting(mulberry32(6)), b = counting(mulberry32(6));
    const r = resolveRound(makeBattle([selene({ moonlight: [crit('on-struck')] }), hurt()], [foe()], intents), {}, a);
    resolveRound(makeBattle([selene(), hurt()], [foe()], intents), {}, b);
    const at = r.log.findIndex((e) => e.type === 'trigger');
    expect(r.log.slice(at).find((e) => e.type === 'heal')).toMatchObject({ target: 'noel' });
    expect(a.n).toBe(b.n);
  });
});

describe('lasting runes (plan 8e Task 7)', () => {
  const lasting: RuneRef = { id: 'lasting', tier: 'magic' };
  const team = () => [
    member('safira', { max: { ...MAX, tp: 100 }, tp: 100, runes: { 'war-dance': [lasting] } }),
    member('noel'), member('rin'),
  ];

  it('a lasting war dance lifts the party all fight and reserves her TP', () => {
    const s = makeBattle(team(), [tough('e0')]);
    applyLasting(s);
    for (const c of s.party) expect(c.auras, c.key).toEqual([{ stat: 'atk', pct: 15, turns: 0, src: 'safira' }]);
    expect([s.party[0].max.tp, s.party[0].tp]).toEqual([70, 70]);
    // Twenty rounds on, and after she falls, it stands.
    const rounds = play(s, Array.from({ length: 20 }, () => ({})));
    const last = rounds[rounds.length - 1];
    for (const c of last.party) expect(c.auras).toEqual([{ stat: 'atk', pct: 15, turns: 0, src: 'safira' }]);
    const down = resolveRound({ ...last, party: last.party.map((c) => (c.key === 'safira' ? { ...c, hp: 0, alive: false } : c)) }, {}, constRng(0.5));
    for (const c of down.party) expect(c.auras).toEqual([{ stat: 'atk', pct: 15, turns: 0, src: 'safira' }]);
    // A fight opened from the party: the same, at once.
    const party = fullParty(['hero', 'safira', 'noel']);
    party.roster.safira = { ...party.roster.safira, sockets: { 'war-dance': [lasting] } };
    const opened = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    for (const c of opened.party) expect(c.auras?.[0]).toMatchObject({ stat: 'atk', src: 'safira' });
    const plainFight = createBattle({ party: fullParty(['hero', 'safira', 'noel']), enemyIds: ['slime'], inventory: {}, revealed: {} });
    const sf = (b: BattleState) => b.party.find((c) => c.key === 'safira')!;
    expect(sf(opened).max.tp).toBe(Math.floor((sf(plainFight).max.tp * 70) / 100));
  });

  it('an aura and a buff: the stronger counts', () => {
    const c = member('noel', { auras: [{ stat: 'atk', pct: 15, turns: 0, src: 'safira' }], buffs: [{ stat: 'atk', pct: 25, turns: 1, src: 'safira' }] });
    expect(stat(c, 'atk')).toBe(Math.floor(MAX.atk * 1.25));
    const s = resolveRound(makeBattle([c], [tough('e0')]), {}, constRng(0.5));
    expect(s.party[0].buffs).toEqual([]);
    expect(stat(s.party[0], 'atk')).toBe(Math.floor(MAX.atk * 1.15));
    // Different ways: an aura of +24 and a debuff of −20 both count.
    const both = member('noel', { auras: [{ stat: 'def', pct: 24, turns: 0, src: 'chizuru' }], buffs: [{ stat: 'def', pct: -20, turns: 2, src: 'e0' }] });
    expect(stat(both, 'def')).toBe(Math.floor(MAX.def * 1.04));
    // No aura: the same number as ever.
    expect(stat(member('noel', { buffs: [{ stat: 'atk', pct: 25, turns: 1 }] }), 'atk')).toBe(Math.floor(MAX.atk * 1.25));
  });

  it('a lasting single-ally buff goes to the caster', () => {
    const [safira, noel, rin] = team();
    const party = [safira, noel, { ...rin, alive: false, hp: 0 }];
    expect(lastingTargets({ ...SKILLS['war-dance'], target: 'ally' }, safira, party)).toEqual([safira]);
    expect(lastingTargets({ ...SKILLS['war-dance'], target: 'self' }, safira, party)).toEqual([safira]);
    expect(lastingTargets(SKILLS['war-dance'], safira, party)).toEqual([safira, noel]);
  });

  it('a lasting rune that no longer fits reserves nothing', () => {
    expect(reservedTpPct({ sockets: { 'fire-star': [lasting] } })).toBe(30);
    const noel = member('noel', { runes: { 'fire-star': [lasting] } });
    const s = makeBattle([noel], [tough('e0')]);
    applyLasting(s);
    expect(battleReservePct(s.party[0])).toBe(0);
    expect(s.party[0].max.tp).toBe(MAX.tp);
    expect(s.party[0].auras).toBeUndefined();
  });

  it('no lasting rune, no aura and the same TP', () => {
    const s = makeBattle([member('noel'), member('rin', { runes: { 'rin-needle': [{ id: 'regain', tier: 'magic' }] } })], [tough('e0')]);
    const before = JSON.stringify(s);
    applyLasting(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('lasting runes: review fixes (plan 8e Task 7 review)', () => {
  const lasting: RuneRef = { id: 'lasting', tier: 'magic' };

  it('a caster down at the start raises nothing, but her TP is still held back', () => {
    const safira = member('safira', { hp: 0, alive: false, max: { ...MAX, tp: 100 }, tp: 100, runes: { 'war-dance': [lasting] } });
    const s = makeBattle([safira, member('noel')], [tough('e0')]);
    applyLasting(s);
    for (const c of s.party) expect(c.auras, c.key).toBeUndefined();
    expect(s.party[0].max.tp).toBe(70);
    const chizuru = member('chizuru', { hp: 0, alive: false, mech: { kind: 'barrier' }, runes: { ward: [lasting] } });
    const b = makeBattle([chizuru, member('noel')], [tough('e0')]);
    applyLasting(b);
    expect(b.barriers).toBeUndefined();
  });

  it('the TP held back comes back after the fight', () => {
    const party = fullParty(['hero', 'safira', 'noel']);
    party.roster.safira = { ...party.roster.safira, sockets: { 'war-dance': [lasting] } };
    const full = party.roster.safira.tp;
    const fight = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
    const sf = fight.party.find((c) => c.key === 'safira')!;
    const held = full - sf.max.tp;
    expect(held).toBeGreaterThan(0);
    sf.tp = sf.max.tp - 5;   // she spent 5
    expect(writeBack(party, fight).roster.safira.tp).toBe(full - 5);
    // Without the rune, as ever.
    const plain = createBattle({ party: fullParty(['hero', 'safira', 'noel']), enemyIds: ['slime'], inventory: {}, revealed: {} });
    plain.party.find((c) => c.key === 'safira')!.tp = full - 5;
    expect(writeBack(fullParty(['hero', 'safira', 'noel']), plain).roster.safira.tp).toBe(full - 5);
  });
});
