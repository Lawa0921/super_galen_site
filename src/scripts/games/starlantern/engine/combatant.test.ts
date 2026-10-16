import { describe, it, expect } from 'vitest';
import { addBuff, calcDamage, dealDamage, stat, MAX_BUFFS, type BattleEvent } from './combatant';
import { applyEffect } from './skills';
import { constRng, makeCombatant } from './testing';

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
