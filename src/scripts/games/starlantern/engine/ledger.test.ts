import { describe, expect, it } from 'vitest';
import { createBattle, resolveRound, type BattleState } from './battle';
import { hitAmount, type Combatant, type DamageSpec, type HitRolls } from './combatant';
import { credit, lossOf, newLedger, totalOf, type Ledger } from './ledger';
import { mulberry32 } from './rng';
import { encounterTable } from './scaling';
import { choose, partyAt, simBattle } from './sim';
import { applyEffect, type EffectContext } from './skills';
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
    const bobby = P('bobby', { turret: { power: 100, turns: 2 } });
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
    const party = () => [
      P('scarlet', { taunt: 2, max: { hp: 1000, tp: 20, atk: 20, def: 200, mag: 20, res: 20, spd: 1 } }),
      P('selene', { row: 'back', max: { hp: 1000, tp: 20, atk: 20, def: 10, mag: 20, res: 20, spd: 1 } }),
    ];
    const foe = (over: Partial<Combatant> = {}) => E('e0', { max: { hp: 9999, tp: 0, atk: 300, def: 20, mag: 20, res: 20, spd: 99 }, ...over });
    const fight = (s: BattleState) => { const l = newLedger(); return { l, s: resolveRound(s, {}, constRng(0.5), l) }; };

    it('credits the taunter with what the first target was spared', () => {
      const { l, s } = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'attack', target: 'selene' } } }));
      const scarlet = s.party[0], selene0 = party()[1], scarlet0 = party()[0];
      const actual = scarlet0.hp - scarlet.hp;
      expect(actual).toBeGreaterThan(0);
      expect(s.party[1].hp).toBe(selene0.hp);   // the hit really was turned
      const would = lossOf(selene0, hitAmount(foe(), selene0, phys(), MID).amount);
      expect(would).toBeGreaterThan(actual);
      expect(of(l, 'scarlet').prevented).toBe(Math.max(0, would - actual));
    });

    it('credits nothing when the taunt was already there when the foe chose', () => {
      const { l, s } = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'attack', target: 'scarlet' } } }));
      expect(s.party[0].hp).toBeLessThan(1000);
      expect(of(l, 'scarlet').prevented).toBe(0);
    });

    it('credits nothing for an area skill turned by a taunt', () => {
      const def: EnemyDef = { ...ENEMIES.slime, skills: [{ name: '橫掃', chance: 1, target: 'row', effects: [{ kind: 'damage', ...phys() }] }] };
      const { l, s } = fight(makeBattle(party(), [foe()], { intents: { e0: { kind: 'enemy-skill', index: 0, target: 'selene' } }, enemyDefs: { e0: def } }));
      expect(s.party[0].hp).toBeLessThan(1000);
      expect(of(l, 'scarlet').prevented).toBe(0);
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
