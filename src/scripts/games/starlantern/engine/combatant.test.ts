import { describe, it, expect } from 'vitest';
import { addBuff, calcDamage, dealDamage, stat, MAX_BUFFS } from './combatant';
import { constRng, makeCombatant } from './testing';

const rng = constRng(0.5); // variance factor exactly 1.0
const phys = { power: 100, element: 'phys' as const, scale: 'atk' as const, melee: true };

describe('calcDamage', () => {
  const a = makeCombatant({ key: 'a', side: 'party' });
  const t = makeCombatant({ key: 't', side: 'enemy' });
  it('uses the base formula', () => {
    expect(calcDamage(a, t, phys, rng)).toEqual({ amount: 20, mult: 1 });
  });
  it('applies weakness and resistance', () => {
    const fire = { ...phys, element: 'fire' as const };
    expect(calcDamage(a, { ...t, weak: ['fire'] }, fire, rng)).toEqual({ amount: 30, mult: 1.5 });
    expect(calcDamage(a, { ...t, resist: ['fire'] }, fire, rng)).toEqual({ amount: 10, mult: 0.5 });
  });
  it('halves melee from or into the back row, but not ranged', () => {
    expect(calcDamage({ ...a, row: 'back' }, t, phys, rng).amount).toBe(10);
    expect(calcDamage(t, { ...a, row: 'back' }, phys, rng).amount).toBe(10);
    expect(calcDamage({ ...a, row: 'back' }, t, { ...phys, melee: false }, rng).amount).toBe(20);
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
