import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, syncWards, type BattleState } from './battle';
import { dealDamage, hitAmount, rollHit, stat, type BattleEvent, type Combatant, type DamageSpec, type HitRolls } from './combatant';
import { credit, creditPrevented, lossOf, newLedger, totalOf, type Ledger } from './ledger';
import { mulberry32 } from './rng';
import { encounterTable } from './scaling';
import { choose, partyAt, simBattle } from './sim';
import { applyEffect, healAmount, pctOf, type EffectContext } from './skills';
import { skillFor } from './battle';
import { SKILLS } from '../data/skills';
import { constRng, makeBattle, makeCombatant } from './testing';
import type { EnemyDef } from './types';
import { ENEMIES } from '../data/enemies';

const ctx = (ledger: Ledger, over: Partial<EffectContext> = {}): EffectContext =>
  ({ rng: constRng(0.5), itemBoost: false, revealed: {}, log: [], ledger, ...over });
const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
const of = (l: Ledger, key: string) => l.by[key] ?? { damage: 0, healing: 0, prevented: 0, shield: 0 };
const phys = (over: Partial<DamageSpec> = {}): DamageSpec => ({ power: 100, element: 'phys', scale: 'atk', melee: true, ...over });
/** constRng(0.5) with no evasion, crit or block: only the variance draws. */
const MID: HitRolls = { variance: 0.9 + 0.5 * 0.2, crit: false, blocked: false };

describe('ledger basics', () => {
  it('credit ignores a missing ledger, a missing key and nothing gained', () => {
    const l = newLedger();
    credit(undefined, 'a', 'damage', 5);
    credit(l, undefined, 'damage', 5);
    credit(l, 'a', 'damage', 0);
    credit(l, 'a', 'damage', -3);
    expect(l.by).toEqual({});
    credit(l, 'a', 'damage', 5);
    credit(l, 'a', 'healing', 2);
    credit(l, 'a', 'damage', 1);
    expect(l.by.a).toEqual({ damage: 6, healing: 2, prevented: 0, shield: 0 });
    expect(totalOf(l.by.a)).toBe(8);
  });

  it('lossOf is what the target can still lose', () => {
    expect(lossOf(E('e', { hp: 30 }), 100)).toBe(30);
    expect(lossOf(E('e', { hp: 30 }), 12)).toBe(12);
    expect(lossOf(E('e', { hp: 100, undying: true }), 150)).toBe(99);
    expect(lossOf(E('e', { hp: 1, undying: true }), 150)).toBe(0);
  });
});

describe('the contribution ledger', () => {
  it('credits only what was really lost or gained', () => {
    const l = newLedger();
    const big = { max: { hp: 100, tp: 20, atk: 500, def: 20, mag: 20, res: 20, spd: 10 } };
    const foe = E('e0', { hp: 30 });
    applyEffect(P('hero', big), foe, { kind: 'damage', ...phys() }, ctx(l));
    expect(foe.alive).toBe(false);
    expect(of(l, 'hero').damage).toBe(30);
    const wall = E('e1', { undying: true });
    applyEffect(P('rin', { max: { ...big.max, atk: 2000 } }), wall, { kind: 'damage', ...phys() }, ctx(l));
    expect(wall.hp).toBe(1);
    expect(of(l, 'rin').damage).toBe(99);
    const friend = P('selene', { hp: 95 });
    applyEffect(P('chizuru'), friend, { kind: 'restore', hp: 20 }, ctx(l));
    expect(of(l, 'chizuru').healing).toBe(5);
    applyEffect(P('noel', { max: { ...big.max, mag: 200 } }), friend, { kind: 'heal', power: 100 }, ctx(l));
    expect(of(l, 'noel').healing).toBe(0);   // already full: an overheal is no healing
    // Enemies hitting the party, and anyone healing an enemy, credit no damage and no healing.
    applyEffect(E('e2'), P('liz'), { kind: 'damage', ...phys() }, ctx(l));
    applyEffect(P('sylvie'), E('e3', { hp: 50 }), { kind: 'restore', hp: 20 }, ctx(l));
    expect([of(l, 'e2').damage, of(l, 'sylvie').healing]).toEqual([0, 0]);
  });

  it('poison ticks go to the first poisoner, turrets to their builder', () => {
    const l = newLedger();
    const foe = E('e0', { poison: true, poisonSrc: 'noel', sleep: 5, max: { hp: 100, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } });
    const bobby = P('bobby', { mech: { kind: 'devices', devices: [{ skill: 'turret', kind: 'turret', power: 100, level: 1, turns: 2 }], cap: 2 } });
    const s = resolveRound(makeBattle([P('noel'), bobby], [foe]), {}, constRng(0.5), l);
    const tick = s.log.find((e) => e.type === 'poison-tick');
    const shot = s.log.find((e) => e.type === 'damage');
    expect(tick && tick.type === 'poison-tick' && tick.amount).toBe(10);
    expect(of(l, 'noel').damage).toBe(10);
    expect(shot && shot.type === 'damage' && shot.amount).toBeGreaterThan(0);
    expect(of(l, 'bobby').damage).toBe(shot && shot.type === 'damage' ? shot.amount : -1);
    expect(of(l, 'noel').damage + of(l, 'bobby').damage).toBe(100 - s.enemies[0].hp);
    // A poisoned member's tick and a regen credit no damage; regen credits its holder's healing.
    const l2 = newLedger();
    const s2 = resolveRound(makeBattle([P('hero', { hp: 50, keystones: ['regen'], poison: true, poisonSrc: 'e0' })], [E('e0', { sleep: 5 })]), {}, constRng(0.5), l2);
    const regen = s2.log.find((e) => e.type === 'heal');
    expect(regen && regen.type === 'heal' && regen.amount).toBeGreaterThan(0);
    expect(of(l2, 'hero').healing).toBe(regen && regen.type === 'heal' ? regen.amount : -1);
    expect(of(l2, 'e0').damage).toBe(0);
  });

  it('burn and bleed ticks go to who caused them', () => {
    const l = newLedger();
    const foe = E('e0', { hp: 50, burn: { tick: 7, turns: 2, src: 'noel' }, bleed: [{ tick: 4, turns: 2, src: 'liz' }, { tick: 3, turns: 2, src: 'rin' }] });
    // A member's own burn credits no one (the ledger counts damage dealt to enemies only).
    const s = resolveRound(makeBattle([P('noel', { burn: { tick: 5, turns: 2, src: 'e0' } }), P('liz'), P('rin')], [foe]), { noel: { kind: 'defend' }, liz: { kind: 'defend' }, rin: { kind: 'defend' } }, constRng(0.5), l);
    expect(s.log.filter((e) => e.type === 'dot-tick' && e.target === 'e0')).toHaveLength(3);
    expect(of(l, 'noel').damage).toBe(7);
    expect(of(l, 'liz').damage).toBe(4);
    expect(of(l, 'rin').damage).toBe(3);
    expect(of(l, 'e0').damage).toBe(0);
    expect(s.enemies[0].hp).toBe(36);
    // Overkill is not credited: a 5 HP foe gives the burn's owner 5 and the bleed nothing.
    const l2 = newLedger();
    resolveRound(makeBattle([P('noel')], [E('e0', { hp: 5, burn: { tick: 7, turns: 2, src: 'noel' }, bleed: [{ tick: 4, turns: 2, src: 'liz' }] }), E('e1', { sleep: 3 })]), { noel: { kind: 'defend' } }, constRng(0.5), l2);
    expect(of(l2, 'noel').damage).toBe(5);
    expect(of(l2, 'liz').damage).toBe(0);
  });

  it('each protective factor is credited on its own', () => {
    const run = (reverse: boolean) => {
      const l = newLedger();
      const a = E('e0', { max: { hp: 100, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 10 }, buffs: [{ stat: 'atk', pct: -20, turns: 2, src: 'scarlet' }] });
      const buffs = [{ stat: 'def' as const, pct: 30, turns: 2, src: 'chizuru' }, { stat: 'def' as const, pct: 25, turns: 2, src: 'hero' }];
      const t = P('selene', { max: { hp: 1000, tp: 20, atk: 20, def: 40, mag: 20, res: 20, spd: 10 }, defending: true, buffs: reverse ? [...buffs].reverse() : buffs });
      const spec = phys();
      const before: Combatant = structuredClone(t);
      applyEffect(a, t, { kind: 'damage', ...spec }, ctx(l));
      const actual = before.hp - t.hp;
      expect(actual).toBe(lossOf(before, hitAmount(a, before, spec, MID).amount));
      const spared = (amount: number) => Math.max(0, lossOf(before, amount) - actual);
      const without = (src: string) => ({ ...before, buffs: before.buffs.filter((b) => b.src !== src) });
      const expected = {
        chizuru: spared(hitAmount(a, without('chizuru'), spec, MID).amount),
        hero: spared(hitAmount(a, without('hero'), spec, MID).amount),
        scarlet: spared(hitAmount({ ...a, buffs: [] }, before, spec, MID).amount),
        selene: spared(hitAmount(a, { ...before, defending: false }, spec, MID).amount),
      };
      for (const v of Object.values(expected)) expect(v).toBeGreaterThan(0);
      expect({ chizuru: of(l, 'chizuru').prevented, hero: of(l, 'hero').prevented, scarlet: of(l, 'scarlet').prevented, selene: of(l, 'selene').prevented }).toEqual(expected);
      return expected;
    };
    expect(run(true)).toEqual(run(false));
  });

  it('taunt-guard and not-a-shield credit their holder', () => {
    const l = newLedger();
    const a = E('e0', { max: { hp: 100, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 10 } });
    const t = P('scarlet', { max: { hp: 1000, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10 }, taunt: 2, keystones: ['taunt-guard', 'not-a-shield'] });
    const before: Combatant = structuredClone(t);
    applyEffect(a, t, { kind: 'damage', ...phys() }, ctx(l));
    const actual = before.hp - t.hp;
    const spared = (amount: number) => Math.max(0, lossOf(before, amount) - actual);
    const guard = spared(hitAmount(a, { ...before, keystones: ['not-a-shield'] }, phys(), MID).amount);
    const shield = spared(hitAmount(a, { ...before, keystones: ['taunt-guard'] }, phys(), MID).amount);
    expect(guard).toBeGreaterThan(0);
    expect(shield).toBeGreaterThan(0);
    expect(of(l, 'scarlet').prevented).toBe(guard + shield);
  });

  describe('a hit turned by a taunt', () => {
    const spec = (melee: boolean) => phys({ melee });
    const party = () => [
      P('scarlet', { taunt: 2, max: { hp: 1000, tp: 20, atk: 20, def: 200, mag: 20, res: 20, spd: 1 } }),
      P('noel', { max: { hp: 1000, tp: 20, atk: 20, def: 10, mag: 20, res: 20, spd: 1 } }),
      P('selene', { row: 'back', max: { hp: 1000, tp: 20, atk: 20, def: 35, mag: 20, res: 20, spd: 1 } }),
    ];
    const foe = (melee = true) => E('e0', { melee, max: { hp: 9999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 99 } });
    const fight = (s: BattleState) => { const l = newLedger(); return { l, s: resolveRound(s, {}, constRng(0.5), l) }; };
    /** What `who` would have lost to the same hit, with the rolls the hit drew. */
    const would = (melee: boolean, who: Combatant) => {
      const r = rollHit(foe(melee), who, spec(melee), constRng(0.5))!;
      return lossOf(who, hitAmount(foe(melee), who, spec(melee), r).amount);
    };
    const taken = (s: BattleState) => party()[0].hp - s.party[0].hp;

    it('a taunt is credited with the average loss over the others the foe could reach', () => {
      // Melee: the front row only, so the pool is Noel.
      const melee = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'attack', target: 'noel' } } }));
      expect(taken(melee.s)).toBeGreaterThan(0);
      expect(melee.s.party[1].hp).toBe(1000);   // the hit really was turned
      expect(of(melee.l, 'scarlet').prevented).toBe(Math.max(0, would(true, party()[1]) - taken(melee.s)));
      expect(of(melee.l, 'scarlet').prevented).toBeGreaterThan(0);
      // Ranged: everyone standing, so the pool is Noel and Selene (whole HP: the average is rounded down).
      const ranged = fight(makeBattle(party(), [foe(false)], { intents: { e0: { kind: 'attack', target: 'noel' } } }));
      const avg = Math.floor((would(false, party()[1]) + would(false, party()[2])) / 2);
      expect(would(false, party()[1])).not.toBe(would(false, party()[2]));
      expect(of(ranged.l, 'scarlet').prevented).toBe(Math.max(0, avg - taken(ranged.s)));
      expect(of(ranged.l, 'scarlet').prevented).toBeGreaterThan(0);
    });

    it('a taunt already in place when the foe planned still earns its credit', () => {
      const turned = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'attack', target: 'noel' } } }));
      const meant = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'attack', target: 'scarlet' } } }));
      expect(of(meant.l, 'scarlet').prevented).toBeGreaterThan(0);
      expect(of(meant.l, 'scarlet').prevented).toBe(of(turned.l, 'scarlet').prevented);
    });

    it('an area hit or a lone taunter credits nothing', () => {
      const def: EnemyDef = { ...ENEMIES.slime, skills: [{ name: '橫掃', chance: 1, target: 'row', effects: [{ kind: 'damage', ...phys() }] }] };
      const area = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'enemy-skill', index: 0, target: 'noel' } }, enemyDefs: { e0: def } }));
      expect(taken(area.s)).toBeGreaterThan(0);
      expect(of(area.l, 'scarlet').prevented).toBe(0);
      // A melee foe reaches only the front row, and Scarlet stands there alone: nobody else it could have hit.
      const alone = fight(makeBattle([party()[0], party()[2]], [foe()], { intents: { e0: { kind: 'attack', target: 'scarlet' } } }));
      expect(taken(alone.s)).toBeGreaterThan(0);
      expect(of(alone.l, 'scarlet').prevented).toBe(0);
    });
  });

  describe('barriers and shields', () => {
    const foe = () => E('e0', { max: { hp: 9999, tp: 0, atk: 300, def: 20, mag: 300, res: 20, spd: 99 } });
    const ward = { def: 30, res: 30, src: 'chizuru' };
    const credited = (spec: DamageSpec, t: Combatant) => {
      const l = newLedger();
      const before: Combatant = structuredClone(t);
      applyEffect(foe(), t, { kind: 'damage', ...spec }, ctx(l));
      return { l, before, actual: before.hp - t.hp };
    };

    it("a guard barrier's share goes to whoever raised it", () => {
      const t = P('selene', { max: { hp: 1000, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 10 }, ward });
      expect(stat(t, 'def')).toBe(Math.floor(20 * 1.3));
      expect(stat(t, 'res')).toBe(Math.floor(20 * 1.3));
      expect(stat(t, 'atk')).toBe(20);
      for (const spec of [phys(), phys({ element: 'ice', scale: 'mag', melee: false })]) {
        const { l, before, actual } = credited(spec, structuredClone(t));
        const want = lossOf(before, hitAmount(foe(), { ...before, ward: undefined }, spec, MID).amount) - actual;
        expect(want).toBeGreaterThan(0);
        expect(of(l, 'chizuru').prevented).toBe(want);
      }
      // A ward and a def buff together: each recomputed with only itself taken away.
      const both = P('selene', { max: t.max, ward, buffs: [{ stat: 'def', pct: 30, turns: 2, src: 'hero' }] });
      const { l, before, actual } = credited(phys(), both);
      expect(of(l, 'chizuru').prevented).toBe(lossOf(before, hitAmount(foe(), { ...before, ward: undefined }, phys(), MID).amount) - actual);
      expect(of(l, 'hero').prevented).toBe(lossOf(before, hitAmount(foe(), { ...before, buffs: [] }, phys(), MID).amount) - actual);
      expect(of(l, 'hero').prevented).toBeGreaterThan(0);
      expect(of(l, 'hero').prevented).toBe(of(l, 'chizuru').prevented);
    });

    it('syncWards mirrors the guard barrier on every living member', () => {
      const s = makeBattle([P('chizuru'), P('noel'), P('selene', { alive: false, hp: 0 })], [E('e0')],
        { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }] });
      syncWards(s);
      // The ward names the skill that raised it too (plan 8h Task 2 review).
      expect(s.party.map((c) => c.ward)).toEqual([{ ...ward, skill: 'ward' }, { ...ward, skill: 'ward' }, undefined]);
      s.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru', boost: 2 }];
      syncWards(s);
      expect(s.party[0].ward).toEqual({ def: 60, res: 60, src: 'chizuru', skill: 'ward' });
      s.barriers = [{ skill: 'purify-ward', kind: 'purify', power: 30, turns: 2, src: 'chizuru' }];
      syncWards(s);
      expect(s.party.some((c) => 'ward' in c)).toBe(false);
      s.barriers = [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }];
      syncWards(s);
      s.barriers = [];
      syncWards(s);
      expect(s.party.some((c) => 'ward' in c)).toBe(false);
      // A round keeps them in step: the ward is on the members after it.
      const r = resolveRound(makeBattle([P('chizuru'), P('noel')], [E('e0', { sleep: 3 })],
        { barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }] }), {}, constRng(0.5));
      expect(r.party.map((c) => c.ward)).toEqual([{ ...ward, skill: 'ward' }, { ...ward, skill: 'ward' }]);
    });

    it('a round starts with the wards in step, so the first hit already meets them', () => {
      const l = newLedger();
      const s = makeBattle([P('chizuru', { max: { hp: 1000, tp: 20, atk: 20, def: 20, mag: 20, res: 20, spd: 1 } })], [foe()],
        { intents: { e0: { kind: 'attack', target: 'chizuru' } }, barriers: [{ skill: 'ward', kind: 'guard', power: 30, turns: 2, src: 'chizuru' }] });
      resolveRound(s, {}, constRng(0.5), l);
      expect(of(l, 'chizuru').prevented).toBeGreaterThan(0);
    });

    it('a shield takes the hit first and is credited to who gave it', () => {
      const l = newLedger();
      const log: BattleEvent[] = [];
      const t = P('noel', { shield: { amount: 30, src: 'bobby' } });
      expect(dealDamage(t, 50, { ledger: l, log })).toBe(20);
      expect(t.hp).toBe(80);
      expect('shield' in t).toBe(false);
      expect(of(l, 'bobby').shield).toBe(30);
      expect(log).toEqual([{ type: 'shield', target: 'noel', amount: 30 }]);
      // A hit the shield takes whole: no HP lost, the rest of the shield kept.
      const u = P('noel', { shield: { amount: 30, src: 'bobby' }, sleep: 2 });
      expect(dealDamage(u, 10, { ledger: l, log })).toBe(0);
      expect(u.hp).toBe(100);
      expect(u.shield).toEqual({ amount: 20, src: 'bobby' });
      expect(of(l, 'bobby').shield).toBe(40);
      expect(u.sleep).toBe(0);   // still a hit: it wakes her
      const v = P('noel', { shield: { amount: 30, src: 'bobby' }, sleep: 2 });
      expect(dealDamage(v, 10, { dot: true })).toBe(0);
      expect(v.sleep).toBe(2);   // a tick does not
      expect(v.shield).toEqual({ amount: 20, src: 'bobby' });
      // A fall clears the shield and the ward.
      const w = P('noel', { hp: 5, shield: { amount: 3, src: 'bobby' }, ward });
      dealDamage(w, 50);
      expect(w.alive).toBe(false);
      expect('shield' in w || 'ward' in w).toBe(false);
    });

    it('in a fight the shield takes hits and ticks alike, credited to its giver', () => {
      const l = newLedger();
      const t = P('noel', { shield: { amount: 1000, src: 'bobby' }, poison: true, poisonSrc: 'e0', burn: { tick: 5, turns: 2, src: 'e0' } });
      const s = resolveRound(makeBattle([t], [foe()], { intents: { e0: { kind: 'attack', target: 'noel' } } }), {}, constRng(0.5), l);
      expect(s.party[0].hp).toBe(100);
      const soaked = s.log.flatMap((e) => (e.type === 'shield' ? [e.amount] : []));
      expect(soaked).toHaveLength(3);   // the hit, the poison tick, the burn tick
      expect(soaked.slice(1)).toEqual([10, 5]);
      expect(of(l, 'bobby').shield).toBe(soaked.reduce((n, a) => n + a, 0));
      expect(of(l, 'bobby').shield).toBe(1000 - s.party[0].shield!.amount);
      expect(s.log).toContainEqual({ type: 'damage', target: 'noel', amount: 0, element: 'phys', mult: 1 });
    });
  });

  it('an evaded hit prevents nothing', () => {
    const l = newLedger();
    const t = P('selene', { x: { evasion: 100000 }, defending: true, taunt: 2, keystones: ['taunt-guard'], buffs: [{ stat: 'def', pct: 30, turns: 2, src: 'chizuru' }] });
    const c = ctx(l, { rng: constRng(0) });
    applyEffect(E('e0', { buffs: [{ stat: 'atk', pct: -20, turns: 2, src: 'scarlet' }] }), t, { kind: 'damage', ...phys() }, c);
    expect(c.log).toEqual([{ type: 'miss', target: 'selene' }]);
    expect(l.by).toEqual({});
  });

  /** The standard five at Lv 10 against depth 3's first group and against the Lantern-eater, seed 7919, to the end. */
  const FIGHTS: { enemyIds: string[]; boss: boolean }[] = [
    { enemyIds: encounterTable('mainline', 3)[0], boss: false },
    { enemyIds: ['lanterneater'], boss: true },
  ];
  const play = (f: (typeof FIGHTS)[number], ledger?: Ledger) => {
    const party = partyAt(10);
    const base = mulberry32(7919);
    let draws = 0;
    const rng = () => { draws++; return base(); };
    let s = createBattle({ party, enemyIds: f.enemyIds, boss: f.boss, inventory: {}, revealed: {}, scale: { depth: 3, region: 'mainline' } });
    const states = [JSON.stringify(s)];
    const logs = [];
    for (let r = 0; r < 60 && s.outcome === 'ongoing'; r++) {
      s = resolveRound(s, choose(s, party), rng, ledger);
      states.push(JSON.stringify(s));
      logs.push(...s.log);
    }
    return { s, states, draws, logs };
  };

  it('the ledger never changes the fight', () => {
    for (const f of FIGHTS) {
      const plain = play(f), kept = play(f, newLedger());
      expect(kept.states).toEqual(plain.states);
      expect(kept.draws).toBe(plain.draws);
      expect(plain.states.length).toBeGreaterThan(2);
    }
  });

  it('the ledger reconciles with the fight', () => {
    let healed = 0;
    for (const f of FIGHTS) {
      const l = newLedger();
      const { s, logs } = play(f, l);
      const members = Object.values(l.by);
      const damage = members.reduce((n, c) => n + c.damage, 0);
      const healing = members.reduce((n, c) => n + c.healing, 0);
      expect(damage).toBe(s.enemies.reduce((n, e) => n + e.max.hp - e.hp, 0));
      expect(damage).toBeGreaterThan(0);
      const partyKeys = new Set(s.party.map((c) => c.key));
      healed += healing;
      expect(healing).toBe(logs.reduce((n, e) => n + (e.type === 'heal' && partyKeys.has(e.target) ? e.amount : 0), 0));
      // Only members are credited.
      for (const k of Object.keys(l.by)) expect(partyKeys.has(k), k).toBe(true);
    }
    expect(healed, 'some healing is reconciled').toBeGreaterThan(0);
  });

  it('simBattle keeps its ledger in opts and fights the same with it', () => {
    const scale = { depth: 3, region: 'mainline' as const };
    const l = newLedger();
    const kept = simBattle(partyAt(10), FIGHTS[0].enemyIds, false, 7919, scale, undefined, 'skill', undefined, undefined, { ledger: l });
    expect(kept).toEqual(simBattle(partyAt(10), FIGHTS[0].enemyIds, false, 7919, scale));
    const plain = play(FIGHTS[0], newLedger());
    expect(Object.values(l.by).reduce((n, c) => n + c.damage, 0)).toBe(plain.s.enemies.reduce((n, e) => n + e.max.hp - e.hp, 0));
  });
});

describe('a lasting guard in the ledger (plan 8e Task 7)', () => {
  it('a lasting guard is credited what it prevents', () => {
    const a = E('e0', { max: { hp: 100, tp: 0, atk: 60, def: 20, mag: 20, res: 20, spd: 10 } });
    const buff = { stat: 'def' as const, pct: 24, turns: 3, src: 'chizuru' };
    const aura = { ...buff, turns: 0 };
    const prevented = (t: Combatant) => {
      const l = newLedger();
      creditPrevented(l, a, t, phys(), MID, hitAmount(a, t, phys(), MID).amount);
      return of(l, 'chizuru').prevented;
    };
    const byBuff = prevented(P('noel', { buffs: [buff] }));
    expect(byBuff).toBeGreaterThan(0);
    expect(prevented(P('noel', { auras: [aura] }))).toBe(byBuff);
    // Both, the same way: taking either away changes nothing, so neither is credited.
    expect(prevented(P('noel', { buffs: [buff], auras: [aura] }))).toBe(0);
  });
});

describe('step ⑧ in the ledger (plan 8h Task 2)', () => {
  const MAX = { hp: 300, tp: 99, atk: 40, def: 20, mag: 60, res: 20, spd: 10 };
  const sync = { id: 'sync', tier: 'legendary' } as const;
  const member = (key: string, spd: number, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', defId: key, ...over, max: { ...MAX, spd } });
  const tough = () => makeCombatant({ key: 'e0', side: 'enemy', sleep: 9, max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } });

  it("a sync's giver is credited with its lift", () => {
    // Noel's fire star carries 同步 (+30%); Rin's 飛針 comes next: 65 a needle lifted to 85 (84.5 rounded: a lift that
    // cannot be divided back to 65).
    expect(pctOf(65, 130)).toBe(85);
    const fight = (withSync: boolean) => {
      const l = newLedger();
      const s0 = makeBattle([member('noel', 90, withSync ? { runes: { 'fire-star': [sync] } } : {}), member('rin', 80)], [tough()]);
      const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, rin: { kind: 'skill', skill: 'rin-needle', target: 'e0' } }, constRng(0.5), l);
      return { l, r };
    };
    const { l, r } = fight(true);
    const rolls = rollHit(member('rin', 80), tough(), { power: 65, element: 'phys', scale: 'atk', melee: false }, constRng(0.5))!;
    const needle = (power: number) => hitAmount(member('rin', 80), tough(), { power, element: 'phys', scale: 'atk', melee: false }, rolls).amount;
    const fire = hitAmount(member('noel', 90), tough(), SKILLS['fire-star'].effects[0] as DamageSpec, rolls).amount;
    // Two needles: Rin keeps what 65 deals, Noel gets the rest.
    expect(of(l, 'rin').damage).toBe(2 * needle(65));
    expect(of(l, 'noel').damage).toBe(fire + 2 * (needle(85) - needle(65)));
    // The two add up to what the foe lost.
    expect(of(l, 'noel').damage + of(l, 'rin').damage).toBe(r.enemies[0].max.hp - r.enemies[0].hp);
    // With no sync, the books are as they always were.
    const plain = fight(false);
    expect(of(plain.l, 'rin').damage).toBe(2 * needle(65));
    expect(of(plain.l, 'noel').damage).toBe(fire);
  });

  it("a sync's giver is credited with a lifted heal", () => {
    // Noel's sync, then Selene's 月光 on Rin: Selene keeps what the unlifted heal restores.
    const l = newLedger();
    const selene = member('selene', 80);
    const s0 = makeBattle([member('noel', 90, { runes: { 'fire-star': [sync] } }), selene, member('rin', 1, { hp: 10 })], [tough()]);
    const power = (SKILLS.moonlight.effects[0] as { power: number }).power;
    const raw = healAmount(selene, power), lifted = healAmount(selene, pctOf(power, 130));
    expect(lifted).toBeGreaterThan(raw);
    const r = resolveRound(s0, { noel: { kind: 'skill', skill: 'fire-star', target: 'e0' }, selene: { kind: 'skill', skill: 'moonlight', target: 'rin' } }, constRng(0.5), l);
    expect(r.party[2].hp).toBe(10 + lifted);
    expect(of(l, 'selene').healing).toBe(raw);
    expect(of(l, 'noel').healing).toBe(lifted - raw);
  });

  it('a barrier is credited to its skill, a shield to the skill that gave it, and the books still balance', () => {
    const foe = (_target: string) => makeCombatant({ key: 'e0', side: 'enemy', max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 1, res: 20, spd: 1 } });
    const blow = (target: string) => ({ intents: { e0: { kind: 'attack' as const, target } } });
    const both = (s0: BattleState, rounds: Record<string, import('./battle').Action>[]) => {
      const split = newLedger({ bySkill: true }), plain = newLedger();
      let a = s0, b = s0;
      for (const acts of rounds) { a = resolveRound(a, acts, constRng(0.5), split); b = resolveRound(b, acts, constRng(0.5), plain); }
      // The split never changes the totals, and no part is counted twice.
      expect(split.by).toEqual(plain.by);
      for (const k of ['damage', 'healing', 'prevented', 'shield'] as const) {
        const parts = Object.values(split.bySkill!).reduce((n, c) => n + c[k], 0);
        expect(parts, k).toBeLessThanOrEqual(Object.values(split.by).reduce((n, c) => n + c[k], 0));
      }
      return split;
    };
    // 守之結界 cast by hand, then a blow on Noel: what the ward spared her is 守之結界's.
    const chizuru = member('chizuru', 90, { mech: { kind: 'barrier' } });
    const w = both(makeBattle([chizuru, member('noel', 50)], [foe('noel')], blow('noel')), [{ chizuru: { kind: 'skill', skill: 'ward' } }]);
    expect(of(w, 'chizuru').prevented).toBeGreaterThan(0);
    expect(w.bySkill!.ward).toMatchObject({ prevented: of(w, 'chizuru').prevented, casts: 1 });
    // A lasting 守之結界 (never cast): still 守之結界's.
    const lasting = makeBattle([member('chizuru', 90, { mech: { kind: 'barrier' } }), member('noel', 50)], [foe('noel')], { ...blow('noel'), barriers: [{ skill: 'ward', kind: 'guard', power: 18, turns: 3, src: 'chizuru', lasting: true, lastingPct: 60 }] });
    syncWards(lasting);
    const l = both(lasting, [{}]);
    expect(l.bySkill!.ward).toMatchObject({ prevented: of(l, 'chizuru').prevented, casts: 0 });
    expect(of(l, 'chizuru').prevented).toBeGreaterThan(0);
    // 月光 with 化盾 on Noel at full HP: the spill is a shield, and what it takes is 月光's.
    const selene = member('selene', 90, { runes: { moonlight: [{ id: 'spill-shield', tier: 'legendary' }] } });
    const m = both(makeBattle([selene, member('noel', 50)], [foe('noel')], blow('noel')), [{ selene: { kind: 'skill', skill: 'moonlight', target: 'noel' } }]);
    expect(of(m, 'selene').shield).toBeGreaterThan(0);
    expect(m.bySkill!.moonlight).toMatchObject({ shield: of(m, 'selene').shield, casts: 1 });
    // Bobby's shield generator, run at the round's end, then a blow next round: 護盾產生器's.
    const bobby = member('bobby', 90, { mech: { kind: 'devices', devices: [], cap: 2 } });
    const g = both(makeBattle([bobby, member('noel', 50, { hp: 100 })], [foe('noel')], blow('noel')), [{ bobby: { kind: 'skill', skill: 'barrier' } }, {}]);
    expect(of(g, 'bobby').shield).toBeGreaterThan(0);
    expect(g.bySkill!.barrier).toMatchObject({ shield: of(g, 'bobby').shield, casts: 1 });
  });

  it('a device set by no hand cast gives a shield no skill', () => {
    // 護盾產生器 set outside her own cast (a bare context: no one acting, as a trigger or an echo would be).
    const bobby = member('bobby', 90, { mech: { kind: 'devices', devices: [], cap: 2 } });
    applyEffect(bobby, bobby, SKILLS.barrier.effects[0], ctx(newLedger(), { cast: 'barrier' }));
    expect(bobby.mech).toMatchObject({ devices: [{ skill: 'barrier', untracked: true }] });
    const l = newLedger({ bySkill: true });
    const foe = makeCombatant({ key: 'e0', side: 'enemy', max: { hp: 99999, tp: 0, atk: 60, def: 20, mag: 1, res: 20, spd: 1 } });
    let s = makeBattle([bobby, member('noel', 50, { hp: 100 })], [foe], { intents: { e0: { kind: 'attack', target: 'noel' } } });
    s = resolveRound(s, {}, constRng(0.5), l);
    s = resolveRound({ ...s, intents: { e0: { kind: 'attack', target: 'noel' } } }, {}, constRng(0.5), l);
    expect(of(l, 'bobby').shield).toBeGreaterThan(0);
    expect(l.bySkill!.barrier?.shield ?? 0).toBe(0);
    // Set by her own cast, it is 護盾產生器's (the review test above), and the device says nothing more.
    const hand = makeBattle([member('bobby', 90, { mech: { kind: 'devices', devices: [], cap: 2 } })], [foe]);
    const r = resolveRound(hand, { bobby: { kind: 'skill', skill: 'barrier' } }, constRng(0.5));
    expect(r.party[0].mech).toMatchObject({ devices: [{ skill: 'barrier' }] });
    expect((r.party[0].mech as { devices: object[] }).devices[0]).not.toHaveProperty('untracked');
  });

  it('a ledger that asks credits buff givers by what their buff added, and gauge feeding apart (plan 8h Task 5b, H3)', () => {
    // Safira's 戰舞 (+25% atk) on Rin: Rin's hit, with and without it on the same rolls; the difference is Safira's.
    const buff = { stat: 'atk' as const, pct: 25, turns: 3, src: 'safira' };
    const rin = () => member('rin', 50, { buffs: [buff] });
    const foe = () => makeCombatant({ key: 'e0', side: 'enemy', max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } });
    const spec = { kind: 'damage' as const, power: 100, element: 'phys' as const, scale: 'atk' as const, melee: false };
    const hit = (l: ReturnType<typeof newLedger>) => { applyEffect(rin(), foe(), spec, ctx(l)); return l; };
    const plain = hit(newLedger());
    const split = hit(newLedger({ buffGivers: true }));
    const rolls = rollHit(rin(), foe(), spec, constRng(0.5))!;
    const without = hitAmount(member('rin', 50), foe(), spec, rolls).amount;
    expect(of(split, 'safira').damage).toBe(of(plain, 'rin').damage - without);
    expect(of(split, 'rin').damage).toBe(without);
    expect(of(split, 'safira').damage + of(split, 'rin').damage).toBe(of(plain, 'rin').damage);
    expect(of(plain, 'safira').damage).toBe(0);   // a plain ledger (the gate's) is as it always was
    // The giver's share goes to the buff's skill when a cast of hers gave it in a ledger that asks (plan 8h review).
    const byGiver = newLedger({ bySkill: true, buffGivers: true });
    applyEffect(member('rin', 50, { buffs: [{ ...buff, skill: 'war-dance' }] }), foe(), spec, ctx(byGiver));
    expect(byGiver.bySkill!['war-dance']?.damage).toBe(of(split, 'safira').damage);
    // ... and such a ledger tags the buff a hand cast gives; a plain one never does.
    const dancer = member('safira', 90);
    const target = member('rin', 50);
    applyEffect(dancer, target, { kind: 'buff', stat: 'atk', pct: 25, turns: 3 }, ctx(newLedger({ bySkill: true, buffGivers: true }), { cast: 'war-dance', acting: 'safira' }));
    expect(target.buffs[0]).toMatchObject({ src: 'safira', skill: 'war-dance' });
    const plainTarget = member('rin', 50);
    applyEffect(dancer, plainTarget, { kind: 'buff', stat: 'atk', pct: 25, turns: 3 }, ctx(newLedger(), { cast: 'war-dance', acting: 'safira' }));
    expect(plainTarget.buffs[0]).not.toHaveProperty('skill');
    // Her own buff is hers: nothing moves.
    const self = newLedger({ buffGivers: true });
    applyEffect(member('rin', 50, { buffs: [{ ...buff, src: 'rin' }] }), foe(), spec, ctx(self));
    expect(Object.keys(self.by)).toEqual(['rin']);
    // A def debuff on the foe from Sylvie: hers likewise.
    const sunder = newLedger({ buffGivers: true });
    applyEffect(member('rin', 50), makeCombatant({ key: 'e0', side: 'enemy', buffs: [{ stat: 'def', pct: -30, turns: 3, src: 'sylvie' }], max: { hp: 99999, tp: 0, atk: 1, def: 20, mag: 1, res: 20, spd: 1 } }), spec, ctx(sunder));
    expect(of(sunder, 'sylvie').damage).toBeGreaterThan(0);
    // Gauge fed to the party: counted apart, never in the totals.
    const g = newLedger({ buffGivers: true });
    const allies = [member('noel', 50), member('rin', 50, { limit: 95 })];
    for (const t of allies) applyEffect(member('safira', 50), t, { kind: 'gauge', amount: 10 }, ctx(g));
    expect(g.gauge).toEqual({ safira: 15 });
    expect(g.by).toEqual({});
    expect(newLedger()).not.toHaveProperty('gauge');
  });

  it('the ledger can split by skill', () => {
    expect(newLedger()).toEqual({ by: {} });
    const l = newLedger({ bySkill: true });
    expect(l.bySkill).toEqual({});
    const party = partyAt(35, { ids: ['hero', 'rin', 'chizuru', 'noel', 'selene'] });
    let s = createBattle({ party, enemyIds: encounterTable('mainline', 5)[0], inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    const rng = mulberry32(7919);
    const acts: { actor: string; label: string }[] = [];
    for (let i = 0; i < 40 && s.outcome === 'ongoing'; i++) {
      s = resolveRound(s, choose(s, party), rng, l);
      for (const e of s.log) if (e.type === 'act') acts.push({ actor: e.actor, label: e.label });
    }
    const split = Object.entries(l.bySkill!);
    expect(split.length).toBeGreaterThan(2);
    const sum = (f: (c: { damage: number; healing: number; prevented: number; shield: number }) => number) => (xs: typeof split) => xs.reduce((n, [, c]) => n + f(c), 0);
    // Every part of it is someone's: no skill's share is more than its owner's whole.
    for (const [id, c] of split) {
      const owner = SKILLS[id].owner;
      expect(totalOf(c), id).toBeLessThanOrEqual(totalOf(of(l, owner)));
      // As many casts as the log shows acts under that skill's name by its owner.
      const name = skillFor(s.party.find((m) => m.defId === owner)!, id)!.name;
      expect(c.casts, id).toBe(acts.filter((a) => a.actor === owner && a.label === name).length);
    }
    expect(sum(totalOf)(split)).toBeLessThanOrEqual(Object.values(l.by).reduce((n, c) => n + totalOf(c), 0));
    // The same fight with a plain ledger credits the same members the same.
    const plainL = newLedger();
    let p = createBattle({ party, enemyIds: encounterTable('mainline', 5)[0], inventory: {}, revealed: {}, scale: { depth: 5, region: 'mainline' } });
    const rng2 = mulberry32(7919);
    for (let i = 0; i < 40 && p.outcome === 'ongoing'; i++) p = resolveRound(p, choose(p, party), rng2, plainL);
    expect(plainL.by).toEqual(l.by);
  });
});
