import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, runeView, skillFor } from './battle';
import { hitAmount, rollHit, type BattleEvent, type Combatant } from './combatant';
import { AILMENT } from './ailments';
import { newLedger } from './ledger';
import { mulberry32, type Rng } from './rng';
import { bounceNext } from './runes';
import { applyEffect, patchSkill, pctOf, type EffectContext } from './skills';
import { lastingBarrierLoss } from './mechanics/runes';
import { constRng, fullParty, makeBattle, makeCombatant } from './testing';
import { SKILLS } from '../data/skills';
import { RUNES, type RuneId, type RuneRef } from '../data/runes';
import { POWERS } from '../data/gear';
import type { Effect } from './types';

type Damage = Extract<Effect, { kind: 'damage' }>;
/** An rng that counts its draws. */
const counting = (base: Rng): Rng & { n: number } => {
  const f = (() => { f.n++; return base(); }) as Rng & { n: number };
  f.n = 0;
  return f;
};
/** An rng that plays `seq` and then 0.5 for ever. */
const script = (...seq: number[]): Rng => () => (seq.length ? seq.shift()! : 0.5);
const ctxOf = (rng: Rng, over: Partial<EffectContext> = {}): EffectContext => ({ rng, itemBoost: false, revealed: {}, log: [] as BattleEvent[], ...over });
const R = (id: RuneId, tier: RuneRef['tier'] = 'magic'): RuneRef => ({ id, tier });
const MAX = { hp: 300, tp: 20, atk: 60, def: 20, mag: 60, res: 20, spd: 10 };
const member = (key: string, runes?: Record<string, RuneRef[]>, over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'party', defId: key, max: MAX, ...(runes ? { runes } : {}), ...over });
const foe = (key = 'e0', over: Partial<Combatant> = {}) =>
  makeCombatant({ key, side: 'enemy', max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 }, ...over });
/** The first damage effect of `skill` as `c` casts it. */
const hit = (c: Combatant, skill: string): Damage => skillFor(c, skill)!.effects.find((e) => e.kind === 'damage') as Damage;
const damageTo = (log: BattleEvent[], key: string) => log.filter((e): e is Extract<BattleEvent, { type: 'damage' }> => e.type === 'damage' && e.target === key);

describe('runes on every hit (plan 8e Task 4)', () => {
  it('a rune ailment rolls once per landed hit', () => {
    const torn = member('liz', { 'twin-slash': [R('tear')] });
    const plain = member('liz');
    const draws = (c: Combatant) => {
      const rng = counting(mulberry32(1));
      applyEffect(c, foe(), hit(c, 'twin-slash'), ctxOf(rng));
      return rng.n;
    };
    expect(draws(torn) - draws(plain)).toBe(2);
    // At 0.3 both hits bleed (35%): two stacks, each a share of its own hit.
    const t = foe();
    const ctx = ctxOf(constRng(0.3));
    applyEffect(torn, t, hit(torn, 'twin-slash'), ctx);
    const dealt = damageTo(ctx.log, 'e0').map((e) => e.amount);
    expect(dealt).toHaveLength(2);
    expect(t.bleed!.map((b) => b.tick)).toEqual(dealt.map((n) => Math.max(1, Math.floor((n * AILMENT.bleedPct) / 100))));
    // A hit she misses draws no ailment: the first evades (0.1 < 50%), the second lands (0.9), varies (0.5) and bleeds (0.1).
    const dodgy = foe('e0', { x: { evasion: 50 } });
    const seq = counting(script(0.1, 0.9, 0.5, 0.1));
    applyEffect(torn, dodgy, hit(torn, 'twin-slash'), ctxOf(seq));
    expect([seq.n, dodgy.bleed?.length]).toEqual([4, 1]);
  });

  it('aftermath rides on a crit only', () => {
    const sure = (c: Combatant, skill: string): Damage => ({ ...hit(c, skill), crit: 'always' });
    const noel = member('noel', { 'fire-star': [R('aftermath')], 'ice-star': [R('aftermath')] });
    const burnt = foe();
    applyEffect(noel, burnt, sure(noel, 'fire-star'), ctxOf(constRng(0.5)));
    expect(burnt.burn).toBeDefined();
    const sylvie = member('sylvie', { 'aimed-shot': [R('aftermath')] });
    const cut = foe();
    applyEffect(sylvie, cut, sure(sylvie, 'aimed-shot'), ctxOf(constRng(0.5)));
    expect(cut.bleed).toHaveLength(1);
    const frozen = foe();
    applyEffect(noel, frozen, sure(noel, 'ice-star'), ctxOf(constRng(0.5)));
    expect(frozen.frozen).toBe(true);
    const boss = foe('e0', { boss: true });
    applyEffect(noel, boss, sure(noel, 'ice-star'), ctxOf(constRng(0.5)));
    expect([boss.frozen, boss.chill]).toEqual([undefined, AILMENT.chillTurns]);
    // No crit, no draw: her crit chance is 0 and the hit has no 'always'.
    const draws = (c: Combatant) => {
      const rng = counting(mulberry32(3));
      applyEffect(c, foe(), hit(c, 'fire-star'), ctxOf(rng));
      return rng.n;
    };
    expect(draws(noel)).toBe(draws(member('noel')));
  });

  it('armor break ignores armor and block, and rolls no block', () => {
    const sylvie = member('sylvie', { 'aimed-shot': [R('armor-break', 'common')] });
    const broken = hit(sylvie, 'aimed-shot');
    expect(broken.armorBreak).toBe(true);
    const wall = foe('e0', { x: { armor: 200, block: 50 } });
    const bare = foe('e0');
    const rolls = { variance: 1, crit: false, blocked: true };
    expect(hitAmount(sylvie, wall, broken, rolls).amount).toBe(hitAmount(sylvie, bare, hit(member('sylvie'), 'aimed-shot'), { ...rolls, blocked: false }).amount);
    expect(hitAmount(sylvie, wall, hit(member('sylvie'), 'aimed-shot'), rolls).amount).toBeLessThan(hitAmount(sylvie, wall, broken, rolls).amount);
    const draws = (spec: Damage) => { const rng = counting(constRng(0.9)); rollHit(sylvie, wall, spec, rng); return rng.n; };
    expect(draws(hit(member('sylvie'), 'aimed-shot')) - draws(broken)).toBe(1);
    expect(rollHit(sylvie, wall, broken, constRng(0.01))!.blocked).toBe(false);
  });

  it('drain and regain pay back', () => {
    // 吸血 8%: a foe of 100 HP loses 100, she heals 8 and the ledger counts it.
    const scarlet = member('scarlet', { 'aimed-shot': [R('drain')] }, { hp: 200, max: { ...MAX, atk: 999 } });
    const ledger = newLedger();
    const ctx = ctxOf(constRng(0.5), { ledger });
    applyEffect(scarlet, foe('e0', { hp: 100, max: { hp: 100, tp: 0, atk: 1, def: 1, mag: 1, res: 1, spd: 1 } }), hit(scarlet, 'aimed-shot'), ctx);
    expect(scarlet.hp).toBe(208);
    expect(ledger.by.scarlet.healing).toBe(8);
    expect(ctx.log).toContainEqual({ type: 'heal', target: 'scarlet', amount: 8 });
    // 回氣 1 a hit: of three hits two land (the middle one is dodged), TP +2 (the cast paid its TP: plan 8h ruling 11c).
    const paid = { paid: SKILLS['blade-dance'].tp };
    const safira = member('safira', { 'blade-dance': [R('regain')] }, { tp: 5 });
    const dodgy = foe('e0', { x: { evasion: 50 } });
    applyEffect(safira, dodgy, hit(safira, 'blade-dance'), ctxOf(script(0.9, 0.5, 0.1, 0.9, 0.5), paid));
    expect(safira.tp).toBe(7);
    // Never past her max.
    const full = member('safira', { 'blade-dance': [R('regain')] }, { tp: 19 });
    applyEffect(full, foe(), hit(full, 'blade-dance'), ctxOf(constRng(0.5), paid));
    expect(full.tp).toBe(20);
  });

  it('a bounce goes down the line and skips the fallen', () => {
    const noel = () => member('noel', { 'fire-star': [R('bounce')] }, { max: { ...MAX, spd: 50 } });
    const sleepy = (key: string, over: Partial<Combatant> = {}) => foe(key, { sleep: 9, ...over });
    const s0 = makeBattle([noel()], [sleepy('e0'), sleepy('e1', { alive: false, hp: 0 }), sleepy('e2')]);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect(damageTo(r.log, 'e0')).toHaveLength(1);
    expect(damageTo(r.log, 'e1')).toHaveLength(0);
    const [bounced] = damageTo(r.log, 'e2');
    expect(pctOf(140, 70)).toBe(98);
    const want = hitAmount(noel(), r.enemies[2], { power: 98, element: 'fire', scale: 'mag', melee: false }, { variance: 1, crit: false, blocked: false }).amount;
    expect(bounced.amount).toBe(want);
    // Two foes: one bounce, never back to the first.
    const two = resolveRound(makeBattle([noel()], [sleepy('e0'), sleepy('e1')]), { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.5));
    expect([damageTo(two.log, 'e0').length, damageTo(two.log, 'e1').length]).toEqual([1, 1]);
    // From the last foe the line wraps to the first.
    const line = [foe('e0'), foe('e1'), foe('e2')];
    expect(bounceNext(line, 'e2', new Set(['e2']))?.key).toBe('e0');
    expect(bounceNext(line, 'e0', new Set(['e0', 'e1']))?.key).toBe('e2');
    expect(bounceNext(line, 'e0', new Set(['e0', 'e1', 'e2']))).toBeUndefined();
  });

  it('no rune fields, no new draws', () => {
    const run = (runes?: Record<string, RuneRef[]>) => {
      const rng = counting(mulberry32(7));
      const s0 = makeBattle([member('noel', runes), member('liz', runes)], [foe('e0'), foe('e1')]);
      const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, liz: { kind: 'skill', skill: 'twin-slash', target: 'e1' } }, rng);
      return { n: rng.n, log: r.log };
    };
    const without = run(), empty = run({});
    expect(empty.n).toBe(without.n);
    expect(empty.log).toEqual(without.log);
    expect(SKILLS['fire-star']).toBeDefined();
  });
});

describe('runes on every hit: review fixes (plan 8e Task 4 review)', () => {
  const sure = (c: Combatant, skill: string): Damage => ({ ...hit(c, skill), crit: 'always' });

  it('aftermath and a hit ailment of the same kind never stack: one stack, one draw, at the higher chance', () => {
    const both = member('sylvie', { 'aimed-shot': [R('tear'), R('aftermath')] });
    const tearOnly = member('sylvie', { 'aimed-shot': [R('tear')] });
    const draws = (c: Combatant, rng: Rng & { n: number }, t = foe()) => { applyEffect(c, t, sure(c, 'aimed-shot'), ctxOf(rng)); return { n: rng.n, t }; };
    const a = draws(both, counting(mulberry32(5))), b = draws(tearOnly, counting(mulberry32(5)));
    expect(a.n).toBe(b.n);
    expect(a.t.bleed).toHaveLength(1);
    // The crit makes it sure: at 0.9, past 撕裂's 35%, it still bleeds.
    const t = foe();
    applyEffect(both, t, sure(both, 'aimed-shot'), ctxOf(constRng(0.9)));
    expect(t.bleed).toHaveLength(1);
    // Without a crit, 撕裂 alone at its own chance.
    const calm = foe();
    applyEffect(both, calm, hit(both, 'aimed-shot'), ctxOf(constRng(0.9)));
    expect(calm.bleed).toBeUndefined();
  });

  it("aftermath's ailment is halved on a boss: burn, bleed and shock", () => {
    const caster = member('noel', { 'fire-star': [R('aftermath')], 'thunder-star': [R('aftermath')] });
    const archer = member('sylvie', { 'aimed-shot': [R('aftermath')] });
    const cases: [Combatant, string, (t: Combatant) => unknown][] = [
      [caster, 'fire-star', (t) => t.burn], [archer, 'aimed-shot', (t) => t.bleed?.length], [caster, 'thunder-star', (t) => t.shock],
    ];
    for (const [c, sk, got] of cases) {
      // 0.6: past half, so a boss shrugs it off; a normal foe never can (100%).
      const boss = foe('e0', { boss: true }), plain = foe('e0');
      applyEffect(c, boss, sure(c, sk), ctxOf(constRng(0.6)));
      applyEffect(c, plain, sure(c, sk), ctxOf(constRng(0.6)));
      expect(got(boss), sk).toBeUndefined();
      expect(got(plain), sk).toBeDefined();
      const lucky = foe('e0', { boss: true });
      applyEffect(c, lucky, sure(c, sk), ctxOf(constRng(0.4)));
      expect(got(lucky), sk).toBeDefined();
    }
  });

  it('a bounce follows a hit that landed, never a dodge', () => {
    const noel = member('noel', { 'fire-star': [R('bounce')] }, { max: { ...MAX, spd: 50 } });
    const s0 = makeBattle([noel], [foe('e0', { sleep: 9, x: { evasion: 50 } }), foe('e1', { sleep: 9 })]);
    // Every draw 0.1: e0 dodges (50%); nothing lands, so nothing bounces.
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.1));
    expect(r.log).toContainEqual({ type: 'miss', target: 'e0' });
    expect(damageTo(r.log, 'e1')).toHaveLength(0);
    // A bounce that is dodged ends the chain: e1 dodges, e2 is never reached.
    const s1 = makeBattle([member('noel', { 'fire-star': [R('bounce')] }, { max: { ...MAX, spd: 50 } })],
      [foe('e0', { sleep: 9 }), foe('e1', { sleep: 9, x: { evasion: 50 } }), foe('e2', { sleep: 9 })]);
    const r1 = resolveRound(s1, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' } }, constRng(0.1));
    expect(damageTo(r1.log, 'e0')).toHaveLength(1);
    expect(r1.log).toContainEqual({ type: 'miss', target: 'e1' });
    expect(damageTo(r1.log, 'e2')).toHaveLength(0);
  });
});

describe('the runes as the workshop reads them (plan 8g Task 1)', () => {
  it('runeView tells what applyRunes uses', () => {
    // 延長 reads the skill without its extras: the legendary power's def debuff on 瞄準射擊 gives it nothing to lengthen.
    const sylvie = member('sylvie', { 'aimed-shot': [R('extend')] }, { powers: ['lg-sylvie'] });
    const aimed = runeView(sylvie, 'aimed-shot', [R('extend')])!;
    expect(aimed.states).toHaveLength(1);
    expect(aimed.states[0].ref).toEqual(R('extend'));
    expect(aimed.states[0].miss?.kind).toBe('needs');
    expect(aimed.def).toEqual(skillFor({ ...sylvie, runes: undefined }, 'aimed-shot'));
    const debuff = (c: Combatant) => skillFor(c, 'aimed-shot')!.effects.find((e) => e.kind === 'buff') as Extract<Effect, { kind: 'buff' }>;
    expect(debuff(sylvie).turns).toBe(debuff({ ...sylvie, runes: undefined }).turns);
    // 守之結界 takes it: no miss, and the barrier really lasts longer.
    const chizuru = member('chizuru', { ward: [R('extend')] });
    const ward = runeView(chizuru, 'ward', [R('extend')])!;
    expect(ward.states.map((x) => x.miss)).toEqual([null]);
    expect(ward.def).toEqual(skillFor({ ...chizuru, runes: undefined }, 'ward'));
    const turns = (c: Combatant) => (skillFor(c, 'ward')!.effects[0] as { turns: number }).turns;
    expect(turns(chizuru)).toBe(turns({ ...chizuru, runes: undefined }) + RUNES.extend.mod('magic').turns!);
    // The refs need not be the ones she wears: the view of a rune not yet socketed.
    expect(runeView(member('chizuru'), 'ward', [R('extend')])!.states.map((x) => x.miss)).toEqual([null]);
    expect(runeView(member('chizuru'), 'ward', [])!.states).toEqual([]);
    expect(runeView(member('chizuru'), 'no-such-skill', [])).toBeUndefined();
  });

  it('a skill nothing rewrites is the very same object; a rewritten one is as before', () => {
    expect(skillFor(member('noel'), 'fire-star')).toBe(SKILLS['fire-star']);
    expect(runeView(member('noel'), 'fire-star', [])!.def).toBe(SKILLS['fire-star']);
    const lg = POWERS['lg-sylvie'].mod;
    const want = patchSkill(patchSkill(SKILLS['aimed-shot'], {}), { extra: lg.extra });
    expect(skillFor(member('sylvie', undefined, { powers: ['lg-sylvie'] }), 'aimed-shot')).toEqual(want);
  });
});

describe('two lasting barriers (plan 8g Task 1)', () => {
  const lasting = R('lasting', 'common');
  const chizuru = (runes: Record<string, RuneRef[]>, over: Partial<Combatant> = {}) => member('chizuru', runes, { mech: { kind: 'barrier' }, ...over });

  it('two lasting barriers: one is lost', () => {
    const both = chizuru({ ward: [lasting], 'purify-ward': [lasting] });
    expect(lastingBarrierLoss(both)).toBe(1);
    expect(lastingBarrierLoss(chizuru({ ward: [lasting] }))).toBe(0);
    expect(lastingBarrierLoss(chizuru({}))).toBe(0);
    // With the twin ward two kinds stand at once.
    const twin = chizuru({ ward: [lasting], 'purify-ward': [lasting] }, { ranks: { ward: 1, 'purify-ward': 1, 'chizuru-twin-ward': 1 } });
    expect(lastingBarrierLoss(twin)).toBe(0);
    // It changes nothing on her.
    const before = JSON.stringify(both);
    lastingBarrierLoss(both);
    expect(JSON.stringify(both)).toBe(before);
  });

  it('the loss is what a fight opened from the party shows', () => {
    const open = (twin: boolean) => {
      const party = fullParty(['hero', 'chizuru', 'noel']);
      const m = party.roster.chizuru;
      party.roster.chizuru = { ...m, level: 20, tree: { ...m.tree, ward: 1, 'purify-ward': 1, ...(twin ? { 'chizuru-twin-ward': 1 } : {}) },
        sockets: { ward: [lasting], 'purify-ward': [lasting] } };
      const fight = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} });
      const c = fight.party.find((x) => x.key === 'chizuru')!;
      return { raised: 2, standing: fight.barriers?.length ?? 0, loss: lastingBarrierLoss(c) };
    };
    for (const twin of [false, true]) {
      const r = open(twin);
      expect(r.raised - r.standing, `twin ${twin}`).toBe(r.loss);
    }
    expect(open(false).loss).toBe(1);
    expect(open(true).loss).toBe(0);
  });
});
