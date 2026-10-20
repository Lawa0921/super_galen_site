import { describe, it, expect } from 'vitest';
import { addBuff, calcDamage, dealDamage, hitAmount, roll, rollHit, stat, MAX_BUFFS, type BattleEvent, type DamageSpec, type HitRolls } from './combatant';
import { applyEffect } from './skills';
import { constRng, makeCombatant } from './testing';
import { mulberry32 } from './rng';
import { KEYSTONE_VALUES as V } from '../data/talents';
import type { Combatant } from './combatant';

const rng = constRng(0.5); // variance factor exactly 1.0
const phys = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: true };

describe('calcDamage', () => {
  const a = makeCombatant({ key: 'a', side: 'party' });
  const t = makeCombatant({ key: 't', side: 'enemy' });
  it('uses the base formula', () => {
    expect(calcDamage(a, t, phys, rng)).toEqual({ amount: 20, mult: 1, crit: false, miss: false });
  });
  it('applies weakness and resistance', () => {
    const fire = { ...phys, element: 'fire' as const };
    expect(calcDamage(a, { ...t, weak: ['fire'] }, fire, rng)).toEqual({ amount: 30, mult: 1.5, crit: false, miss: false });
    expect(calcDamage(a, { ...t, resist: ['fire'] }, fire, rng)).toEqual({ amount: 10, mult: 0.5, crit: false, miss: false });
  });
  it('weakens melee from further back (middle 75%, back 50%), but not ranged', () => {
    expect(calcDamage({ ...a, row: 'middle' }, t, phys, rng).amount).toBe(15);
    expect(calcDamage({ ...a, row: 'back' }, t, phys, rng).amount).toBe(10);
    expect(calcDamage({ ...a, row: 'back' }, t, { ...phys, melee: false }, rng).amount).toBe(20);
    expect(calcDamage(t, { ...a, row: 'back' }, phys, rng).amount).toBe(20);   // the row protects by not being reachable, not by halving
  });
  it('halves damage into a defending target', () => {
    expect(calcDamage(a, { ...t, defending: true }, phys, rng).amount).toBe(10);
  });
  it('uses mag against res for magic', () => {
    const caster = makeCombatant({ key: 'c', side: 'party', max: { mag: 40 } as never });
    expect(calcDamage(caster, t, { ...phys, scale: 'mag', melee: false }, rng).amount).toBe(40);
  });
  it('never deals less than 1', () => {
    const tank = makeCombatant({ key: 'k', side: 'enemy', max: { def: 9999 } as never });
    expect(calcDamage(a, tank, phys, rng).amount).toBe(1);
  });
});

describe('calcDamage always-crit, execute and wounded', () => {
  const counting = () => { let n = 0; const f = () => { n++; return 0.5; }; return { f, count: () => n }; };
  const t = makeCombatant({ key: 't', side: 'enemy' });
  const mk = (x: Combatant['x']) => makeCombatant({ key: 'a', side: 'party', x });
  it('crit always crits and draws no crit roll', () => {
    const a = mk({ crit: 0, critDmg: 50 });
    const plain = calcDamage(a, t, phys, rng);
    const always = calcDamage(a, t, { ...phys, crit: 'always' }, rng);
    expect(always.crit).toBe(true);
    expect(always.amount).toBeGreaterThan(plain.amount);
    expect(Math.abs(always.amount - Math.floor(plain.amount * 1.5))).toBeLessThanOrEqual(1);
    const c1 = counting(); calcDamage(mk({ crit: 50, critDmg: 50 }), t, phys, c1.f);
    const c2 = counting(); calcDamage(a, t, { ...phys, crit: 'always' }, c2.f);
    expect(c1.count() - c2.count()).toBe(1);
  });
  it("execute scales with the target's missing HP", () => {
    const a = mk({});
    const full = calcDamage(a, t, { ...phys, power: 300, execute: 100 }, rng).amount;
    const half = calcDamage(a, { ...t, hp: 50 }, { ...phys, power: 300, execute: 100 }, rng).amount;
    expect(Math.abs(half - Math.floor(full * 1.5))).toBeLessThanOrEqual(1);
    expect(half).toBeGreaterThan(full);
  });
  it('wounded adds only when the target is hurt', () => {
    const a = mk({});
    const spec = { ...phys, power: 300, wounded: 50 };
    const base = calcDamage(a, t, { ...phys, power: 300 }, rng).amount;
    expect(calcDamage(a, t, spec, rng).amount).toBe(base);
    const hurt = calcDamage(a, { ...t, hp: t.max.hp - 1 }, spec, rng).amount;
    expect(Math.abs(hurt - Math.floor(base * 1.5))).toBeLessThanOrEqual(1);
    expect(hurt).toBeGreaterThan(base);
  });
});

describe('calcDamage with derived stats', () => {
  const a = makeCombatant({ key: 'a', side: 'party' });
  const t = makeCombatant({ key: 't', side: 'enemy' });
  const fire = { ...phys, element: 'fire' as const, melee: false };
  /** Plays back `vs` in order and counts the draws. */
  const seq = (vs: number[]) => { const r = Object.assign(() => vs[r.n++ % vs.length], { n: 0 }); return r; };

  it('zero secondaries consume exactly one random number, as before', () => {
    const r = seq([0.5]);
    expect(calcDamage(a, t, phys, r)).toEqual({ amount: 20, mult: 1, crit: false, miss: false });
    expect(r.n).toBe(1);
    // A party member's base crit damage alone draws nothing either: no crit chance, no roll.
    const r2 = seq([0.5]);
    expect(calcDamage({ ...a, x: { critDmg: 50 } }, { ...a, key: 'p2' }, fire, r2).amount).toBe(20);
    expect(r2.n).toBe(1);
  });

  it('crit multiplies by 1 + critDmg', () => {
    const critter = { ...a, x: { crit: 50, critDmg: 100 } };
    expect(calcDamage(critter, t, phys, seq([0.5, 0.1]))).toEqual({ amount: 40, mult: 1, crit: true, miss: false });
    expect(calcDamage(critter, t, phys, seq([0.5, 0.9]))).toEqual({ amount: 20, mult: 1, crit: false, miss: false });
    // Enemies always crit for 50%, whatever critDmg they carry.
    const foe = { ...t, x: { crit: 50, critDmg: 300 } };
    expect(calcDamage(foe, a, phys, seq([0.5, 0.1])).amount).toBe(30);
  });

  it('an evaded hit deals nothing and logs miss', () => {
    // A member's evasion is rated against the attacker's level: 50 / (50 + 50 x 1) = 0.5.
    const dodger = { ...a, x: { evasion: 50 } };
    expect(calcDamage(t, dodger, phys, seq([0.4, 0.5]))).toMatchObject({ amount: 0, miss: true });
    expect(calcDamage(t, dodger, phys, seq([0.6, 0.5]))).toMatchObject({ amount: 20, miss: false });
    expect(calcDamage({ ...t, level: 3 }, dodger, phys, seq([0.3, 0.5])).miss).toBe(false);   // 50 / 200 = 0.25
    // An enemy's evasion is a plain percentage.
    const foe = { ...t, x: { evasion: 20 } };
    expect(calcDamage(a, foe, phys, seq([0.19, 0.5])).miss).toBe(true);
    expect(calcDamage(a, foe, phys, seq([0.21, 0.5])).miss).toBe(false);

    const log: BattleEvent[] = [];
    const sleeper = makeCombatant({ key: 'e0', side: 'enemy', sleep: 2, x: { evasion: 20 } });
    applyEffect(a, sleeper, { kind: 'damage', ...phys }, { rng: constRng(0), itemBoost: false, revealed: {}, log });
    expect(log).toEqual([{ type: 'miss', target: 'e0' }]);
    expect([sleeper.hp, sleeper.sleep]).toEqual([100, 2]);
  });

  it('armor only reduces physical damage, with diminishing returns', () => {
    const r = constRng(0.5);
    expect(calcDamage(a, { ...t, x: { armor: 50 } }, phys, r).amount).toBe(10);        // 50 / (50 + 50) = 0.5
    expect(calcDamage(a, { ...t, x: { armor: 50 } }, fire, r).amount).toBe(20);
    expect(calcDamage({ ...a, level: 3 }, { ...t, x: { armor: 50 } }, phys, r).amount).toBe(15);   // 50 / 200 = 0.25
    expect(calcDamage(a, { ...t, x: { armor: 150 } }, phys, r).amount).toBe(5);       // 0.75
    expect(calcDamage(a, { ...t, x: { armor: 100000 } }, phys, r).amount).toBe(5);    // held at 0.75
  });

  it('block halves physical hits only; melee and ranged reduction follow the attack', () => {
    const wall = { ...t, x: { block: 50 } };
    expect(calcDamage(a, wall, phys, seq([0.5, 0.4])).amount).toBe(10);
    expect(calcDamage(a, wall, phys, seq([0.5, 0.6])).amount).toBe(20);
    const r = seq([0.5]);
    expect(calcDamage(a, wall, fire, r).amount).toBe(20);
    expect(r.n).toBe(1);
    const dr = { ...t, x: { meleeDR: 50, rangedDR: 25 } };
    expect(calcDamage(a, dr, phys, constRng(0.5)).amount).toBe(10);
    expect(calcDamage(a, dr, { ...phys, melee: false }, constRng(0.5)).amount).toBe(15);
  });

  it('fire bonus and resistance multiply; physical ignores both', () => {
    const r = constRng(0.5);
    const pyro = { ...a, x: { fireDmg: 50 } };
    expect(calcDamage(pyro, t, fire, r).amount).toBe(30);
    expect(calcDamage(pyro, { ...t, x: { fireRes: 50 } }, fire, r).amount).toBe(15);
    expect(calcDamage(a, { ...t, x: { fireRes: 50 } }, fire, r).amount).toBe(10);
    expect(calcDamage(pyro, { ...t, x: { fireRes: 50 } }, phys, r).amount).toBe(20);
    expect(calcDamage({ ...a, x: { iceDmg: 50 } }, t, fire, r).amount).toBe(20);
  });

  it('a miss reports a plain multiplier of 1, whatever the element', () => {
    const blur = { ...t, weak: ['fire' as const], x: { evasion: 50 } };
    expect(calcDamage(a, blur, fire, seq([0.1, 0.5]))).toEqual({ amount: 0, mult: 1, crit: false, miss: true });
  });

  it('resistance above 100 is held at 100: a hit never turns into a heal or cancels a negative bonus', () => {
    const r = constRng(0.5);
    expect(calcDamage(a, { ...t, x: { fireRes: 150 } }, fire, r).amount).toBe(1);
    // A negative fire bonus times an over-100 resistance would multiply back to a full hit.
    expect(calcDamage({ ...a, x: { fireDmg: -200 } }, { ...t, x: { fireRes: 200 } }, fire, r).amount).toBe(1);
  });

  it('roll draws nothing at a chance of 0 or less, one number otherwise', () => {
    const r = seq([0.3]);
    expect(roll(0, r)).toBe(false);
    expect(roll(-1, r)).toBe(false);
    expect(r.n).toBe(0);
    expect(roll(0.5, r)).toBe(true);
    expect(roll(0.2, r)).toBe(false);
    expect(r.n).toBe(2);
  });

  it('an enemy evades at most half of the hits, like a member', () => {
    const blur = { ...t, x: { evasion: 90 } };
    expect(calcDamage(a, blur, phys, seq([0.49, 0.5])).miss).toBe(true);
    expect(calcDamage(a, blur, phys, seq([0.51, 0.5])).miss).toBe(false);
  });

  it('a negative resistance is a weakness, held at -100 (double damage)', () => {
    const r = constRng(0.5);
    expect(calcDamage(a, { ...t, x: { fireRes: -50 } }, fire, r).amount).toBe(30);
    expect(calcDamage(a, { ...t, x: { fireRes: -100 } }, fire, r).amount).toBe(40);
    expect(calcDamage(a, { ...t, x: { fireRes: -500 } }, fire, r).amount).toBe(40);
  });

  it('vuln only on weakness hits; eliteDmg only on elites and bosses', () => {
    const r = constRng(0.5);
    const sharp = { ...a, x: { vuln: 100 } };
    expect(calcDamage(sharp, { ...t, weak: ['fire'] }, fire, r).amount).toBe(60);
    expect(calcDamage(sharp, t, fire, r).amount).toBe(20);
    const hunter = { ...a, x: { eliteDmg: 50 } };
    expect(calcDamage(hunter, t, phys, r).amount).toBe(20);
    expect(calcDamage(hunter, { ...t, tint: 'elite' }, phys, r).amount).toBe(30);
    expect(calcDamage(hunter, { ...t, boss: true }, phys, r).amount).toBe(30);
    expect(calcDamage(hunter, { ...t, tint: 'fire' }, phys, r).amount).toBe(20);
  });

  it('damage stays finite with capped stats at level 198', () => {
    const big = { hp: 999999, tp: 999, atk: 99999, def: 99999, mag: 99999, res: 99999, spd: 999 };
    const ace = makeCombatant({ key: 'ace', side: 'party', level: 198, max: big,
      x: { crit: 60, critDmg: 5000, vuln: 5000, eliteDmg: 5000, multi: 50, fireDmg: 5000, armor: 1e9, evasion: 1e9, block: 50, meleeDR: 50, rangedDR: 50, fireRes: 75 } });
    const foe = makeCombatant({ key: 'foe', side: 'enemy', level: 198, boss: true, weak: ['fire'], max: big,
      x: { crit: 30, evasion: 17, armor: 1e9, block: 50, meleeDR: 50, rangedDR: 50, fireRes: 75 } });
    for (const v of [0, 0.25, 0.5, 0.75, 0.999]) for (const spec of [phys, fire, { ...fire, scale: 'mag' as const }]) {
      for (const [x, y] of [[ace, foe], [foe, ace]]) {
        const d = calcDamage(x, y, spec, constRng(v));
        expect(Number.isFinite(d.amount), `${x.key} ${spec.element} ${v}`).toBe(true);
        expect(d.amount).toBeGreaterThanOrEqual(d.miss ? 0 : 1);
      }
    }
  });
});

describe('buffs', () => {
  it('modify stats with a floor of 25%', () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    addBuff(c, { stat: 'atk', pct: 50, turns: 3 });
    expect(stat(c, 'atk')).toBe(30);
    const d = makeCombatant({ key: 'b', side: 'party' });
    addBuff(d, { stat: 'atk', pct: -100, turns: 3 });
    expect(stat(d, 'atk')).toBe(5);
  });
  it('refresh the same stat and direction instead of stacking', () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    addBuff(c, { stat: 'atk', pct: 25, turns: 1 });
    addBuff(c, { stat: 'atk', pct: 25, turns: 3 });
    expect(c.buffs).toEqual([{ stat: 'atk', pct: 25, turns: 3 }]);
  });
  it(`cap at ${MAX_BUFFS}, dropping the oldest`, () => {
    const c = makeCombatant({ key: 'a', side: 'party' });
    for (const s of ['atk', 'def', 'spd', 'res'] as const) addBuff(c, { stat: s, pct: 10, turns: 3 });
    expect(c.buffs.map((b) => b.stat)).toEqual(['def', 'spd', 'res']);
  });
});

describe('dealDamage', () => {
  it('wakes a sleeper', () => {
    const c = makeCombatant({ key: 'a', side: 'party', sleep: 2 });
    dealDamage(c, 5);
    expect([c.hp, c.sleep, c.alive]).toEqual([95, 0, true]);
  });
  it('knocks out at 0 and clears statuses', () => {
    const c = makeCombatant({ key: 'a', side: 'party', poison: true, taunt: 2, buffs: [{ stat: 'atk', pct: 10, turns: 2 }] });
    dealDamage(c, 500);
    expect(c).toMatchObject({ hp: 0, alive: false, poison: false, taunt: 0, buffs: [], turret: null });
  });
});

describe('keystones in calcDamage', () => {
  const foe = makeCombatant({ key: 't', side: 'enemy' });
  it('last-stand: below the threshold a hit deals lastStandPct more', () => {
    const edge = Math.round(V.lastStandHp * 100);   // HP at the threshold of a 100 max HP attacker
    const a = (hp: number, keystones: Combatant['keystones'] = ['last-stand']) => makeCombatant({ key: 'a', side: 'party', hp, keystones });
    expect(calcDamage(a(edge - 1), foe, phys, rng).amount).toBe(Math.floor(20 * (1 + V.lastStandPct / 100)));
    expect(calcDamage(a(edge), foe, phys, rng).amount).toBe(20);
    expect(calcDamage(a(edge - 1, []), foe, phys, rng).amount).toBe(20);
  });
  it('taunt-guard: a taunting member takes tauntGuardPct less', () => {
    const m = (over: Partial<Combatant>) => makeCombatant({ key: 'm', side: 'party', ...over });
    expect(calcDamage(foe, m({ taunt: 2, keystones: ['taunt-guard'] }), phys, rng).amount).toBe(Math.floor(20 * (1 - V.tauntGuardPct / 100)));
    expect(calcDamage(foe, m({ keystones: ['taunt-guard'] }), phys, rng).amount).toBe(20);   // not taunting
    expect(calcDamage(foe, m({ taunt: 2 }), phys, rng).amount).toBe(20);                      // no keystone
  });
});

describe('rollHit and hitAmount', () => {
  /** A seeded rng that counts its draws. */
  const counting = (seed: number) => {
    const r = mulberry32(seed);
    const c = { n: 0, rng: () => { c.n++; return r(); } };
    return c;
  };
  /** A random fighter of `side` from `g`: stats, secondaries, buffs, stance and keystones that touch the formula. */
  const fighter = (g: () => number, key: string, side: Combatant['side']): Combatant => {
    const n = (lo: number, hi: number) => lo + Math.floor(g() * (hi - lo + 1));
    const maybe = (p: number) => g() < p;
    const hp = n(20, 500);
    const keystones = (['last-stand', 'carried-out', 'taunt-guard', 'not-a-shield'] as const).filter(() => maybe(0.3));
    const buffs = [
      ...(maybe(0.5) ? [{ stat: 'def' as const, pct: n(-40, 40), turns: 2 }] : []),
      ...(maybe(0.5) ? [{ stat: 'atk' as const, pct: n(-40, 40), turns: 2 }] : []),
      ...(maybe(0.4) ? [{ stat: 'res' as const, pct: n(-40, 40), turns: 2 }] : []),
      ...(maybe(0.4) ? [{ stat: 'mag' as const, pct: n(-40, 40), turns: 2 }] : []),
    ];
    return makeCombatant({
      key, side, level: n(1, 50), row: (['front', 'middle', 'back'] as const)[n(0, 2)],
      max: { hp, tp: 20, atk: n(5, 300), def: n(5, 300), mag: n(5, 300), res: n(5, 300), spd: 10 },
      hp: n(1, hp), boss: maybe(0.2), tint: maybe(0.2) ? 'elite' : undefined,
      weak: maybe(0.3) ? ['fire'] : [], resist: maybe(0.2) ? ['fire'] : [],
      defending: maybe(0.3), taunt: maybe(0.4) ? n(1, 3) : 0, keystones, buffs,
      x: {
        crit: maybe(0.6) ? n(0, 60) : 0, critDmg: n(0, 150), block: maybe(0.5) ? n(0, 50) : 0, armor: maybe(0.6) ? n(0, 400) : 0,
        evasion: maybe(0.5) ? n(0, 300) : 0, meleeDR: n(0, 30), rangedDR: n(0, 30), fireRes: n(-150, 150), fireDmg: n(0, 60),
        vuln: n(0, 40), eliteDmg: n(0, 40),
      },
    });
  };

  it('calcDamage is rollHit then hitAmount, draw for draw', () => {
    let misses = 0, crits = 0;
    for (let i = 1; i <= 2000; i++) {
      const g = mulberry32(i);
      const aSide = g() < 0.5 ? 'party' : 'enemy';
      const a = fighter(g, 'a', aSide);
      const t = fighter(g, 't', aSide === 'party' ? 'enemy' : 'party');
      const spec: DamageSpec = {
        power: 30 + Math.floor(g() * 300), element: g() < 0.5 ? 'phys' : 'fire', scale: g() < 0.5 ? 'atk' : 'mag', melee: g() < 0.5,
        ...(g() < 0.15 ? { crit: 'always' as const } : {}),
        ...(g() < 0.2 ? { execute: Math.floor(g() * 100) } : {}),
        ...(g() < 0.2 ? { wounded: Math.floor(g() * 60) } : {}),
      };
      const one = counting(i * 31), two = counting(i * 31);
      const whole = calcDamage(a, t, spec, one.rng);
      const r = rollHit(a, t, spec, two.rng);
      expect(two.n, `draws, case ${i}`).toBe(one.n);
      if (whole.miss) { misses++; expect(r, `case ${i}`).toBeNull(); continue; }
      expect(r, `case ${i}`).not.toBeNull();
      if (whole.crit) crits++;
      expect({ ...hitAmount(a, t, spec, r!), miss: false }, `case ${i}`).toEqual(whole);
    }
    // The cases reach every branch that draws.
    expect(misses).toBeGreaterThan(50);
    expect(crits).toBeGreaterThan(50);
  });

  it('hitAmount draws nothing', () => {
    const a = makeCombatant({ key: 'a', side: 'party', x: { crit: 50, critDmg: 80 } });
    const t = makeCombatant({ key: 't', side: 'enemy', x: { block: 50, armor: 100 } });
    // No rng goes in: the signature has none.
    expect(hitAmount.length).toBe(4);
    const r: HitRolls = { variance: 1.05, crit: true, blocked: true };
    const first = hitAmount(a, t, phys, r);
    expect(hitAmount(a, t, phys, r)).toEqual(first);
    expect(first.crit).toBe(true);
    expect(hitAmount(a, t, phys, { ...r, blocked: false }).amount).toBeGreaterThan(first.amount);
  });
});
