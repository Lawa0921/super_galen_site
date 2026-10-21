import { describe, expect, it } from 'vitest';
import { LIMIT_PER_ACTION, resolveRound, skillFor, type BattleState } from '../battle';
import { hitAmount, rollHit, type Combatant } from '../combatant';
import { castCost, initMechs } from './index';
import { MARK } from '../mech';
import { applyEffect, type EffectContext } from '../skills';
import { constRng, makeBattle, makeCombatant } from '../testing';
import { NODES } from '../../data/trees';
import { SKILLS } from '../../data/skills';

const rin = (over: Partial<Combatant> = {}) => makeCombatant({
  key: 'rin', side: 'party', defId: 'rin', mech: { kind: 'mark', marks: [], cap: 1 },
  max: { hp: 200, tp: 99, atk: 40, def: 20, mag: 20, res: 20, spd: 50 }, ...over,
});
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over });
const foe = (key: string, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 30, def: 20, mag: 20, res: 20, spd: 1 }, ...over });
const marksOf = (c: Combatant) => (c.mech?.kind === 'mark' ? c.mech.marks : null);
const ctxOf = (s: BattleState): EffectContext => ({ rng: constRng(0.5), itemBoost: false, revealed: {}, log: s.log, battle: s });
const phys = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: false };

describe("Rin's mark and 還有。", () => {
  it("rin's hits on her mark always crit and draw no crit roll", () => {
    const counted = (marked: boolean) => {
      let n = 0;
      const rng = () => { n++; return 0.99; };
      const r = rollHit(rin({ x: { crit: 10 }, mech: { kind: 'mark', marks: marked ? ['e0'] : [], cap: 1 } }), foe('e0'), phys, rng);
      return { n, crit: r?.crit };
    };
    expect(counted(true)).toEqual({ n: 1, crit: true });
    expect(counted(false)).toEqual({ n: 2, crit: false });
    // Only her: another member's hits on the same foe roll as ever.
    let n = 0;
    expect(rollHit(P('noel', { x: { crit: 10 } }), foe('e0'), phys, () => { n++; return 0.99; })?.crit).toBe(false);
    expect(n).toBe(2);
  });

  it('marking moves the mark', () => {
    const s = makeBattle([rin()], [foe('e0'), foe('e1', { hp: 1 })]);
    const r = s.party[0];
    applyEffect(r, s.enemies[0], { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e0']);
    applyEffect(r, s.enemies[1], { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e1']);
    applyEffect(r, s.enemies[1], { kind: 'damage', ...phys }, ctxOf(s));
    expect(s.enemies[1].alive).toBe(false);
    expect(marksOf(r)).toEqual([]);
  });

  it('felling her mark brings 還有。: the same command again, once a round', () => {
    const marked = (...keys: string[]) => ({ mech: { kind: 'mark' as const, marks: keys, cap: 1 } });
    const fight = (tp: number) => {
      const s = makeBattle([rin({ tp, ...marked('e0') })], [foe('e0', { hp: 1 }), foe('e1', { hp: 1 }), foe('e2')]);
      return resolveRound(s, { rin: { kind: 'skill', skill: 'rin-needle', target: 'e0' } }, constRng(0.5));
    };
    const r = fight(99);
    const acts = r.log.filter((e) => e.type === 'act' && e.actor === 'rin');
    expect(acts.map((e) => e.type === 'act' && e.label)).toEqual(['飛針', '飛針']);
    expect(r.log.filter((e) => e.type === 'mech')).toEqual([{ type: 'mech', actor: 'rin', cue: 'again' }]);
    expect(r.enemies.map((e) => e.alive)).toEqual([false, false, true]);   // the second kill brings nothing more
    expect(r.party[0].limit).toBe(LIMIT_PER_ACTION);
    // Short of TP for the same skill: a plain attack instead.
    const poor = fight(3);
    expect(poor.log.filter((e) => e.type === 'act' && e.actor === 'rin').map((e) => e.type === 'act' && e.label)).toEqual(['飛針', '攻擊']);
    // A kill that was not her mark brings nothing.
    const other = resolveRound(makeBattle([rin(marked('e2'))], [foe('e0', { hp: 1 }), foe('e1'), foe('e2')]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(other.enemies[0].alive).toBe(false);
    expect(other.log.some((e) => e.type === 'mech')).toBe(false);
    // A new round brings it back; a kill that leaves nobody brings nothing.
    const r1 = resolveRound(makeBattle([rin(marked('e0'))], [foe('e0', { hp: 1 }), foe('e1'), foe('e2', { hp: 1 })]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(r1.log.filter((e) => e.type === 'mech')).toHaveLength(1);
    const again = structuredClone(r1);
    again.party[0].mech = { kind: 'mark', marks: ['e2'], cap: 1 };
    const r2 = resolveRound(again, { rin: { kind: 'attack', target: 'e2' } }, constRng(0.5));
    expect(r2.log.filter((e) => e.type === 'mech')).toHaveLength(1);
    const last = resolveRound(makeBattle([rin(marked('e0'))], [foe('e0', { hp: 1 })]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(last.outcome).toBe('win');
    expect(last.log.some((e) => e.type === 'mech')).toBe(false);
  });

  it('veil hides rin unless everyone in reach is veiled', () => {
    const intents = { e0: { kind: 'attack' as const, target: 'rin' } };
    const attacker = () => foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 1 } });
    const hidden = resolveRound(makeBattle([rin({ veil: 2 }), P('scarlet', { max: { hp: 9999, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } })], [attacker()], { intents }), {}, constRng(0.5));
    expect(hidden.party[0].hp).toBe(200);
    expect(hidden.party[1].hp).toBeLessThan(9999);
    const alone = resolveRound(makeBattle([rin({ veil: 2 })], [attacker()], { intents }), {}, constRng(0.5));
    expect(alone.party[0].hp).toBeLessThan(200);
    // Two round ends and the veil is gone.
    let s = makeBattle([rin({ veil: 2 })], [foe('e0')]);
    s = resolveRound(s, {}, constRng(0.5));
    expect(s.party[0].veil).toBe(1);
    s = resolveRound(s, {}, constRng(0.5));
    expect(s.party[0].veil).toBeUndefined();
    // Casting it: the veil, and her next landed hit crits, once.
    const ctx = ctxOf(s);
    const r = s.party[0];
    applyEffect(r, r, { kind: 'veil', turns: 2 }, ctx);
    expect([r.veil, r.nextCrit]).toEqual([2, true]);
    const hit = resolveRound(makeBattle([rin({ nextCrit: true })], [foe('e0')]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0.99));
    expect(hit.log.find((e) => e.type === 'damage')).toMatchObject({ crit: true });
    expect(hit.party[0].nextCrit).toBeUndefined();
  });

  it('the veil ends with her first blow, which still crits', () => {
    // Rin (fast) strikes from the veil; the foe (slow) then finds her: the veil is gone the moment she hits.
    const attacker = foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 1 } });
    const intents = { e0: { kind: 'attack' as const, target: 'rin' } };
    const struck = resolveRound(makeBattle([rin({ veil: 4, nextCrit: true }), P('scarlet', { max: { hp: 9999, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } })], [attacker], { intents }),
      { rin: { kind: 'attack', target: 'e0' } }, constRng(0.99));
    expect(struck.log.find((e) => e.type === 'damage' && e.target === 'e0')).toMatchObject({ crit: true });
    expect(struck.party[0].veil).toBeUndefined();
    expect(struck.party[0].hp).toBeLessThan(200);
    // A skill that hurts ends it too (since 8d Task 3 the mark strikes, so marking does); one that does not (defending) keeps it.
    const needled = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'skill', skill: 'rin-needle', target: 'e0' } }, constRng(0.5));
    expect(needled.party[0].veil).toBeUndefined();
    const marked = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'skill', skill: 'rin-mark', target: 'e0' } }, constRng(0.5));
    expect(marked.party[0].veil).toBeUndefined();
    const waited = resolveRound(makeBattle([rin({ veil: 4 })], [foe('e0')]), { rin: { kind: 'defend' } }, constRng(0.5));
    expect(waited.party[0].veil).toBe(3);
    // A blow that misses still shows her: the veil and its crit both go.
    const missed = resolveRound(makeBattle([rin({ veil: 4, nextCrit: true })], [foe('e0', { x: { evasion: 100 } })]), { rin: { kind: 'attack', target: 'e0' } }, constRng(0));
    expect(missed.log.some((e) => e.type === 'miss')).toBe(true);
    expect([missed.party[0].veil, missed.party[0].nextCrit]).toEqual([undefined, undefined]);
    // An ultimate she could not fire (her gauge short) is no blow.
    const unfired = resolveRound(makeBattle([rin({ veil: 4, limit: 10 })], [foe('e0')]), { rin: { kind: 'ultimate', target: 'e0' } }, constRng(0.5));
    expect(unfired.log.some((e) => e.type === 'no-limit')).toBe(true);
    expect(unfired.party[0].veil).toBe(3);
  });

  it("the bell's blow shows her too (it goes through the mechanics like any action)", () => {
    // The hero falls; Rin, holding unrung-bell, strikes at once, from her veil.
    const hero = P('hero', { hp: 1, max: { hp: 100, tp: 20, atk: 20, def: 1, mag: 20, res: 20, spd: 99 } });
    const attacker = foe('e0', { sleep: 0, max: { hp: 99999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 60 } });
    const s = resolveRound(makeBattle([hero, rin({ veil: 4, keystones: ['unrung-bell'] })], [attacker], { intents: { e0: { kind: 'attack', target: 'hero' } } }),
      { rin: { kind: 'defend' } }, constRng(0.5));
    expect(s.party[0].alive).toBe(false);
    expect(s.log.filter((e) => e.type === 'act' && e.actor === 'rin').length).toBeGreaterThan(0);
    expect(s.party[1].veil).toBeUndefined();
  });

  it('when its owner or its target falls', () => {
    // Her mark's foe felled by someone else: the mark goes with it, and no 還有。 for a kill that was not hers.
    const s = makeBattle([rin({ mech: { kind: 'mark', marks: ['e0'], cap: 1 } }), P('noel', { max: { hp: 100, tp: 20, atk: 999, def: 20, mag: 20, res: 20, spd: 99 } })],
      [foe('e0', { hp: 1 }), foe('e1')]);
    const r = resolveRound(s, { noel: { kind: 'attack', target: 'e0' }, rin: { kind: 'defend' } }, constRng(0.5));
    expect(r.enemies[0].alive).toBe(false);
    expect(marksOf(r.party[0])).toEqual([]);
    expect(r.log.some((e) => e.type === 'mech')).toBe(false);
    // A foe that falls to a round-end tick loses her mark that same round.
    const ticked = resolveRound(makeBattle([rin({ mech: { kind: 'mark', marks: ['e0'], cap: 1 } })], [foe('e0', { hp: 3, burn: { tick: 5, turns: 2, src: 'rin' } }), foe('e1')]),
      { rin: { kind: 'defend' } }, constRng(0.5));
    expect(ticked.enemies[0].alive).toBe(false);
    expect(marksOf(ticked.party[0])).toEqual([]);
    // A fallen Rin acts no more, again or otherwise.
    const down = resolveRound(makeBattle([rin({ alive: false, hp: 0 }), P('noel')], [foe('e0', { hp: 1 }), foe('e1')]),
      { noel: { kind: 'attack', target: 'e0' } }, constRng(0.5));
    expect(down.log.some((e) => e.type === 'mech' || (e.type === 'act' && e.actor === 'rin'))).toBe(false);
  });
});

describe('mechanic cues', () => {
  it("each mechanic colours its own moment; one nobody claims is plain", async () => {
    const { cueWord } = await import('./index');
    expect(cueWord('overload').tone).toBe('heat');
    expect(cueWord('again').tone).toBe('mark');
    expect(cueWord('nobody' as never)).toEqual({ tone: 'plain', text: 'nobody' });
  });
});

describe("Rin's tree (plan 8d)", () => {
  const ranked = (ranks: Record<string, number>, over: Partial<Combatant> = {}) => rin({ ranks: { 'rin-needle': 1, ...ranks }, ...over });

  it('rin can mark as many as her list allows', () => {
    const s = makeBattle([ranked({ 'rin-mark': 1, 'rin-names': 1 }), ranked({}, { key: 'rin2' })], [foe('e0'), foe('e1'), foe('e2')]);
    initMechs(s);
    const [r, plain] = s.party;
    expect(r.mech).toEqual({ kind: 'mark', marks: [], cap: 2 });
    expect(plain.mech).toEqual({ kind: 'mark', marks: [], cap: 1 });
    for (const e of s.enemies.slice(0, 2)) applyEffect(r, e, { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e0', 'e1']);
    applyEffect(r, s.enemies[2], { kind: 'mark' }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e1', 'e2']);   // the oldest goes
  });

  it('steady: crits on the mark hit harder', () => {
    expect(skillFor(ranked({ 'rin-mark-steady': 1 }), 'rin-mark')!.effects).toContainEqual({ kind: 'mark', critPct: 15 });
    const s = makeBattle([rin()], [foe('e0'), foe('e1')]);
    applyEffect(s.party[0], s.enemies[0], { kind: 'mark', critPct: 30 }, ctxOf(s));
    expect(s.party[0].mech).toMatchObject({ marks: ['e0'], crit: 30 });
    const strong = { max: { hp: 200, tp: 99, atk: 4000, def: 20, mag: 20, res: 20, spd: 50 } };
    const rolls = { variance: 1, crit: true, blocked: false };
    const amount = (crit: number | undefined, target: string) =>
      hitAmount(rin({ ...strong, mech: { kind: 'mark', marks: ['e0'], cap: 1, ...(crit ? { crit } : {}) } }), foe(target), phys, rolls).amount;
    expect(amount(30, 'e0') / amount(undefined, 'e0')).toBeCloseTo(1.3, 3);
    expect(amount(30, 'e1')).toBe(amount(undefined, 'e1'));                              // only on the marked foe
    expect(hitAmount(rin({ ...strong, mech: { kind: 'mark', marks: ['e0'], cap: 1, crit: 30 } }), foe('e0'), phys, { ...rolls, crit: false }).amount)
      .toBe(hitAmount(rin({ ...strong, mech: { kind: 'mark', marks: ['e0'], cap: 1 } }), foe('e0'), phys, { ...rolls, crit: false }).amount);   // only a crit
  });

  it('hop: the mark jumps to the next foe, as many times as the rank', () => {
    expect(skillFor(ranked({ 'rin-mark': 1, 'rin-mark-hop': 2 }), 'rin-mark')!.effects).toContainEqual({ kind: 'mark', hops: 2 });
    const s = makeBattle([rin()], [foe('e0', { hp: 1 }), foe('e1', { hp: 1 }), foe('e2')]);
    const r = s.party[0];
    applyEffect(r, s.enemies[0], { kind: 'mark', hops: 1 }, ctxOf(s));
    applyEffect(r, s.enemies[0], { kind: 'damage', ...phys }, ctxOf(s));
    expect(marksOf(r)).toEqual(['e1']);
    applyEffect(r, s.enemies[1], { kind: 'damage', ...phys }, ctxOf(s));
    expect(marksOf(r)).toEqual([]);
    // A tick that fells the mark at the round's end lets it jump too.
    const ticked = resolveRound(makeBattle([rin({ mech: { kind: 'mark', marks: ['e0'], cap: 1, hops: 1 } })], [foe('e0', { hp: 3, burn: { tick: 5, turns: 2, src: 'rin' } }), foe('e1')]),
      { rin: { kind: 'defend' } }, constRng(0.5));
    expect(marksOf(ticked.party[0])).toEqual(['e1']);
  });

  it('chase: an execute that fells the mark brings 還有。 twice', () => {
    const fight = (ranks: Record<string, number>) => resolveRound(
      makeBattle([ranked({ 'rin-execute': 1, ...ranks }, { mech: { kind: 'mark', marks: ['e0', 'e1'], cap: 2 } })], [foe('e0', { hp: 1 }), foe('e1', { hp: 1 }), foe('e2'), foe('e3')]),
      { rin: { kind: 'skill', skill: 'rin-execute', target: 'e0' } }, constRng(0.5));
    const chased = fight({ 'rin-execute-chase': 1 });
    expect(chased.log.filter((e) => e.type === 'act' && e.actor === 'rin').map((e) => e.type === 'act' && e.label)).toEqual(['處決・追命', '處決・追命', '處決・追命']);
    expect(chased.enemies.map((e) => e.alive)).toEqual([false, false, true, true]);
    expect(chased.enemies[2].hp).toBeLessThan(chased.enemies[2].max.hp);   // the third one fell on the first foe left
    expect(chased.log.filter((e) => e.type === 'mech')).toEqual([{ type: 'mech', actor: 'rin', cue: 'again' }, { type: 'mech', actor: 'rin', cue: 'again' }]);
    const plain = fight({});
    expect(plain.log.filter((e) => e.type === 'act' && e.actor === 'rin')).toHaveLength(2);
    expect(plain.log.filter((e) => e.type === 'mech')).toHaveLength(1);
  });
});

describe("Rin's innate mark (plan 8d Task 3 ruling 1)", () => {
  it("the mark's crits carry MARK.critSharePct of her crit damage", () => {
    const strong = { max: { hp: 200, tp: 99, atk: 4000, def: 20, mag: 20, res: 20, spd: 50 }, x: { critDmg: 50 } };
    const r = rin({ ...strong, mech: { kind: 'mark', marks: ['e0'], cap: 1 } });
    const amount = (t: string, crit: boolean) => hitAmount(r, foe(t), phys, { variance: 1, crit, blocked: false }).amount;
    expect(amount('e0', true) / amount('e0', false)).toBeCloseTo(1 + (50 * MARK.critSharePct) / 10000, 3);
    expect(amount('e1', true) / amount('e1', false)).toBeCloseTo(1.5, 3);   // an unmarked foe: the whole crit
    expect(MARK.critSharePct).toBe(30);   // 8d Task 3 ruling (the consultant's measured set)
    expect(SKILLS['rin-mark'].desc).toContain(`${MARK.critSharePct}%`);
  });

  it('暗記 strikes before it marks: a plain physical hit, then the mark', () => {
    expect(SKILLS['rin-mark'].effects).toEqual([{ kind: 'damage', power: 130, element: 'phys', scale: 'atk', melee: false }, { kind: 'mark' }]);
    // The strike lands before the mark is on, so it rolls its crit like any hit (no crit here); the mark follows.
    const r = resolveRound(makeBattle([rin({ ranks: { 'rin-needle': 1 }, x: { crit: 0 } })], [foe('e0')]), { rin: { kind: 'skill', skill: 'rin-mark', target: 'e0' } }, constRng(0.5));
    const hit = r.log.find((e) => e.type === 'damage' && e.target === 'e0');
    expect(hit && hit.type === 'damage' && !!hit.crit).toBe(false);
    expect(r.enemies[0].hp).toBeLessThan(r.enemies[0].max.hp);
    expect(marksOf(r.party[0])).toEqual(['e0']);
  });

  it('she casts her innate mark with a tree that never held it; a skill she does not know is still refused', () => {
    const cast = (skill: string) => resolveRound(makeBattle([rin({ ranks: { 'rin-needle': 1 } })], [foe('e0')]), { rin: { kind: 'skill', skill, target: 'e0' } }, constRng(0.5));
    const r = cast('rin-mark');
    expect(marksOf(r.party[0])).toEqual(['e0']);
    expect(r.log.some((e) => e.type === 'no-skill')).toBe(false);
    expect(cast('rin-execute').log.some((e) => e.type === 'no-skill')).toBe(true);
  });

  it('熟記 lowers what the mark costs', () => {
    const s = makeBattle([rin()], [foe('e0')]);
    const at = (ranks: Record<string, number>) => castCost(s, rin({ ranks: { 'rin-needle': 1, ...ranks } }), 'rin-mark');
    const values = (NODES['rin-mark-hone'].node.values ?? []);
    expect(values).toHaveLength(3);
    expect(at({})).toBe(SKILLS['rin-mark'].tp);
    values.forEach((v, i) => expect(at({ 'rin-mark-hone': i + 1 }), `rank ${i + 1}`).toBe(v));
    expect(at({ 'rin-mark-hone': 1 })).toBeLessThan(SKILLS['rin-mark'].tp);
    expect(castCost(s, rin({ ranks: { 'rin-mark-hone': 3 } }), 'rin-needle')).toBe(SKILLS['rin-needle'].tp);   // only the mark
  });

  it('her policy marks a boss or an elite from the first round', async () => {
    const { DEFAULT_POLICIES } = await import('../../data/policies');
    expect(DEFAULT_POLICIES.rin).toEqual([{ kind: 'ensure-mark', skill: 'rin-mark', big: true }]);
  });
});
