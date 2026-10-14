import { describe, it, expect } from 'vitest';
import { applyEffect, type EffectContext } from './skills';
import { constRng, makeCombatant } from './testing';

const ctx = (over: Partial<EffectContext> = {}): EffectContext => ({ rng: constRng(0.5), itemBoost: false, revealed: {}, log: [], ...over });
const party = (over = {}) => makeCombatant({ key: 'p', side: 'party', ...over });
const enemy = (over = {}) => makeCombatant({ key: 'e0', side: 'enemy', ...over });

describe('applyEffect', () => {
  it('damages, reveals the element and logs the multiplier', () => {
    const c = ctx(); const t = enemy({ weak: ['fire'] });
    applyEffect(party(), t, { kind: 'damage', power: 100, element: 'fire', scale: 'mag', melee: false }, c);
    expect(t.hp).toBe(70);
    expect(c.revealed).toEqual({ slime: ['fire'] });
    expect(c.log).toEqual([{ type: 'damage', target: 'e0', amount: 30, element: 'fire', mult: 1.5 }]);
  });
  it('stops multi-hit attacks once the target falls', () => {
    const c = ctx(); const t = enemy({ hp: 5 });
    applyEffect(party(), t, { kind: 'damage', power: 60, element: 'phys', scale: 'atk', melee: true, hits: 3 }, c);
    expect(c.log.map((e) => e.type)).toEqual(['damage', 'ko']);
  });
  it('heals by magic and caps at max HP', () => {
    const c = ctx(); const t = party({ hp: 10 });
    applyEffect(party(), t, { kind: 'heal', power: 120 }, c);
    expect(t.hp).toBe(70);
    const u = party({ hp: 90 });
    applyEffect(party(), u, { kind: 'heal', power: 120 }, c);
    expect(u.hp).toBe(100);
    expect(c.log.at(-1)).toEqual({ type: 'heal', target: 'p', amount: 10 });
  });
  it('does not heal the fallen', () => {
    const t = party({ hp: 0, alive: false });
    applyEffect(party(), t, { kind: 'heal', power: 120 }, ctx());
    expect(t.hp).toBe(0);
  });
  it('doubles item restores with itemBoost', () => {
    const t = party({ hp: 10, max: { hp: 200 } as never });
    applyEffect(party(), t, { kind: 'restore', hp: 60 }, ctx({ itemBoost: true }));
    expect(t.hp).toBe(130);
  });
  it('revives only the fallen', () => {
    const dead = party({ hp: 0, alive: false });
    applyEffect(party(), dead, { kind: 'revive', hpPct: 0.3 }, ctx());
    expect([dead.alive, dead.hp]).toEqual([true, 30]);
    const alive = party({ hp: 50 });
    applyEffect(party(), alive, { kind: 'revive', hpPct: 0.3 }, ctx());
    expect(alive.hp).toBe(50);
  });
  it('cures poison and sleep', () => {
    const t = party({ poison: true, sleep: 2 });
    applyEffect(party(), t, { kind: 'cure' }, ctx());
    expect([t.poison, t.sleep]).toEqual([false, 0]);
  });
  it('inflicts by chance, halved against bosses', () => {
    const t = enemy();
    applyEffect(party(), t, { kind: 'inflict', status: 'sleep', chance: 0.6 }, ctx({ rng: constRng(0) }));
    expect(t.sleep).toBe(3);
    const boss = enemy({ boss: true }); const c = ctx({ rng: constRng(0.4) });
    applyEffect(party(), boss, { kind: 'inflict', status: 'poison', chance: 0.6 }, c);
    expect(boss.poison).toBe(false);
    expect(c.log).toEqual([{ type: 'resist', target: 'e0' }]);
  });
  it('puts taunt and turret on the actor', () => {
    const a = party();
    applyEffect(a, a, { kind: 'taunt', turns: 3 }, ctx());
    applyEffect(a, a, { kind: 'turret', power: 70, turns: 3 }, ctx());
    expect([a.taunt, a.turret]).toEqual([3, { power: 70, turns: 3 }]);
  });
  it('applies buffs to the target', () => {
    const t = enemy();
    applyEffect(party(), t, { kind: 'buff', stat: 'spd', pct: -30, turns: 3 }, ctx());
    expect(t.buffs).toEqual([{ stat: 'spd', pct: -30, turns: 3 }]);
  });
});
