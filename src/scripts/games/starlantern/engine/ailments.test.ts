import { describe, expect, it } from 'vitest';
import { AILMENT, ailmentChance, ailmentChips, inflictAilment } from './ailments';
import type { Combatant } from './combatant';
import { mulberry32 } from './rng';
import { applyEffect, type EffectContext } from './skills';
import { constRng, makeCombatant } from './testing';
import type { Effect, Element } from './types';
import { SKILLS } from '../data/skills';
import { ENEMIES } from '../data/enemies';
import { REGIONS } from '../data/regions';
import { HERO_ULTIMATES, RIN_DAWN, ULTIMATES, skyForm } from '../data/ultimates';
import { POWERS } from '../data/gear';
import { TREES } from '../data/trees';

const P = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'party', ...over });
const E = (key: string, over: Partial<Combatant> = {}) => makeCombatant({ key, side: 'enemy', ...over });
/** A constant rng that counts its draws. */
const counting = (v: number) => {
  const f = Object.assign(() => { f.n += 1; return v; }, { n: 0 });
  return f;
};
const ctx = (over: Partial<EffectContext> = {}): EffectContext => ({ rng: constRng(0), itemBoost: false, revealed: {}, log: [], ...over });

describe('the chance formula', () => {
  it('scales by the boss half and the matching resistance', () => {
    expect(ailmentChance(E('e', { x: { fireRes: 25 } }), 'burn', 0.4)).toBeCloseTo(0.3, 12);
    expect(ailmentChance(E('e', { boss: true, x: { fireRes: 25 } }), 'burn', 0.4)).toBeCloseTo(0.15, 12);
    expect(ailmentChance(E('e', { x: { iceRes: 50 } }), 'freeze', 0.4)).toBeCloseTo(0.2, 12);
    expect(ailmentChance(E('e', { x: { thunderRes: 10 } }), 'shock', 0.5)).toBeCloseTo(0.45, 12);
  });

  it('bleed ignores every resistance', () => {
    const t = E('e', { x: { fireRes: 50, iceRes: 50, thunderRes: 50, poisonRes: 50, sleepRes: 50, armor: 300 } });
    expect(ailmentChance(t, 'bleed', 0.4)).toBe(0.4);
  });

  it('a boss is not halved against freeze; a guarded foe cannot be frozen', () => {
    expect(ailmentChance(E('e', { boss: true }), 'freeze', 0.4)).toBe(0.4);
    expect(ailmentChance(E('e', { freezeGuard: 2 }), 'freeze', 0.4)).toBe(0);
    expect(ailmentChance(E('e', { freezeGuard: 2 }), 'shock', 0.4)).toBe(0.4);
  });

  it('poison and sleep are the old formula to the bit', () => {
    const r = mulberry32(8);
    for (let i = 0; i < 20; i++) {
      const chance = r(), boss = r() < 0.5, res = Math.floor(r() * 120) - 10;
      for (const status of ['poison', 'sleep'] as const) {
        const t = E('e', { boss, x: status === 'poison' ? { poisonRes: res } : { sleepRes: res } });
        expect(ailmentChance(t, status, chance)).toBe(chance * (boss ? 0.5 : 1) * (1 - res / 100));
      }
    }
  });
});

describe('inflicting the new ailments', () => {
  it('burn and bleed take the hit that caused them', () => {
    const a = P('p'), t = E('e0');
    const c = ctx({ lastHit: { target: 'e0', amount: 80 } });
    inflictAilment(a, t, 'burn', 1, c);
    expect(t.burn).toEqual({ tick: 28, turns: 3, src: 'p' });
    inflictAilment(a, t, 'bleed', 1, c);
    expect(t.bleed).toEqual([{ tick: 16, turns: 3, src: 'p' }]);
    expect(c.log).toEqual([{ type: 'status', target: 'e0', status: 'burn' }, { type: 'status', target: 'e0', status: 'bleed' }]);
  });

  it('a tick is at least 1', () => {
    const t = E('e0');
    inflictAilment(P('p'), t, 'bleed', 1, ctx({ lastHit: { target: 'e0', amount: 2 } }));
    expect(t.bleed).toEqual([{ tick: 1, turns: AILMENT.bleedTurns, src: 'p' }]);
  });

  it('without a hit on this target in the same action, nothing is added and nothing drawn', () => {
    for (const lastHit of [undefined, { target: 'e1', amount: 80 }]) {
      const rng = counting(0);
      const t = E('e0');
      const c = ctx({ rng, ...(lastHit ? { lastHit } : {}) });
      inflictAilment(P('p'), t, 'burn', 1, c);
      inflictAilment(P('p'), t, 'bleed', 1, c);
      expect(t.burn).toBeUndefined();
      expect(t.bleed).toBeUndefined();
      expect(rng.n).toBe(0);
      expect(c.log).toEqual([]);
    }
  });

  it('a damage effect records the HP the hit took (what dealDamage returns) as the last hit', () => {
    const c = ctx({ rng: constRng(0.5) });
    const t = E('e0', { hp: 10, undying: true });
    applyEffect(P('p'), t, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, c);
    expect(c.lastHit).toEqual({ target: 'e0', amount: 9 });
    const u = E('e1');
    applyEffect(P('p'), u, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, c);
    expect(c.lastHit).toEqual({ target: 'e1', amount: 100 - u.hp });
  });

  it('only the strongest burn stays, for the longer time', () => {
    const t = E('e0', { burn: { tick: 28, turns: 1, src: 'old' } });
    inflictAilment(P('new'), t, 'burn', 1, ctx({ lastHit: { target: 'e0', amount: 58 } }));   // tick 20
    expect(t.burn).toEqual({ tick: 28, turns: 3, src: 'old' });
    inflictAilment(P('new'), t, 'burn', 1, ctx({ lastHit: { target: 'e0', amount: 115 } }));   // tick 40
    expect(t.burn).toEqual({ tick: 40, turns: 3, src: 'new' });
  });

  it('bleed stacks to three, then replaces only a weaker stack', () => {
    const t = E('e0');
    const hit = (amount: number) => inflictAilment(P('p'), t, 'bleed', 1, ctx({ lastHit: { target: 'e0', amount } }));
    hit(80); hit(50); hit(60);   // ticks 16, 10, 12
    expect(t.bleed!.map((d) => d.tick)).toEqual([16, 10, 12]);
    hit(55);   // 11 beats the 10
    expect(t.bleed!.map((d) => d.tick)).toEqual([16, 11, 12]);
    hit(45);   // 9 beats nothing
    expect(t.bleed!.map((d) => d.tick)).toEqual([16, 11, 12]);
  });

  it('a full bleed replaces, among the weakest, the one with the fewest turns left', () => {
    const t = E('e0', { bleed: [{ tick: 5, turns: 3, src: 'a' }, { tick: 5, turns: 1, src: 'b' }, { tick: 9, turns: 1, src: 'c' }] });
    inflictAilment(P('p'), t, 'bleed', 1, ctx({ lastHit: { target: 'e0', amount: 30 } }));   // tick 6
    expect(t.bleed).toEqual([{ tick: 5, turns: 3, src: 'a' }, { tick: 6, turns: 3, src: 'p' }, { tick: 9, turns: 1, src: 'c' }]);
  });

  it('a boss is chilled, never frozen', () => {
    const boss = E('b', { boss: true });
    const c = ctx();
    inflictAilment(P('p'), boss, 'freeze', 1, c);
    expect(boss.frozen).toBeUndefined();
    expect(boss.chill).toBe(AILMENT.chillTurns);
    expect(c.log).toEqual([{ type: 'status', target: 'b', status: 'chill' }]);
    const foe = E('e0');
    inflictAilment(P('p'), foe, 'freeze', 1, c);
    expect(foe.frozen).toBe(true);
    expect(foe.chill).toBeUndefined();
    expect(c.log[1]).toEqual({ type: 'status', target: 'e0', status: 'freeze' });
  });

  it('a chill already longer is not shortened', () => {
    const boss = E('b', { boss: true, chill: 5 });
    inflictAilment(P('p'), boss, 'freeze', 1, ctx());
    expect(boss.chill).toBe(5);
  });

  it('freeze draws nothing while the guard holds', () => {
    const rng = counting(0);
    const foe = E('e0', { freezeGuard: 1 });
    const c = ctx({ rng });
    inflictAilment(P('p'), foe, 'freeze', 1, c);
    expect(rng.n).toBe(0);
    expect(c.log).toEqual([]);
    expect(foe.frozen).toBeUndefined();
  });

  it('shock lasts two rounds; a boss resists half the time', () => {
    const t = E('e0');
    inflictAilment(P('p'), t, 'shock', 1, ctx());
    expect(t.shock).toBe(2);
    const boss = E('b', { boss: true });
    const c = ctx({ rng: constRng(0.5) });   // 0.5 is not below 1 x 0.5
    inflictAilment(P('p'), boss, 'shock', 1, c);
    expect(boss.shock).toBeUndefined();
    expect(c.log).toEqual([{ type: 'resist', target: 'b' }]);
  });

  it('a new ailment at chance 0 draws nothing and logs nothing', () => {
    const rng = counting(0);
    const t = E('e0', { x: { thunderRes: 100 } });
    const c = ctx({ rng, lastHit: { target: 'e0', amount: 50 } });
    inflictAilment(P('p'), t, 'shock', 1, c);
    inflictAilment(P('p'), t, 'burn', 0, c);
    expect(rng.n).toBe(0);
    expect(c.log).toEqual([]);
  });

  it('poison and sleep still draw once, even at chance 0', () => {
    const rng = counting(0.5);
    const t = E('e0');
    const c = ctx({ rng });
    inflictAilment(P('p'), t, 'poison', 0, c);
    expect(rng.n).toBe(1);
    expect(c.log).toEqual([{ type: 'resist', target: 'e0' }]);
    applyEffect(P('p'), t, { kind: 'inflict', status: 'sleep', chance: 0 }, c);
    expect(rng.n).toBe(2);
  });

  it('the inflict effect goes through the same rules', () => {
    const t = E('e0');
    const c = ctx({ lastHit: { target: 'e0', amount: 80 } });
    applyEffect(P('p'), t, { kind: 'inflict', status: 'burn', chance: 1 }, c);
    applyEffect(P('p'), t, { kind: 'inflict', status: 'shock', chance: 1 }, c);
    expect(t.burn).toEqual({ tick: 28, turns: 3, src: 'p' });
    expect(t.shock).toBe(2);
  });

  it('elemental hits alone never inflict anything', () => {
    for (const element of ['phys', 'fire', 'ice', 'thunder'] as Element[]) {
      const t = E('e0', { max: { hp: 1000, tp: 0, atk: 20, def: 20, mag: 20, res: 20, spd: 10 } });
      applyEffect(P('p'), t, { kind: 'damage', power: 100, element, scale: 'mag', melee: false }, ctx({ rng: constRng(0.5) }));
      for (const k of ['burn', 'bleed', 'shock', 'frozen', 'freezeGuard', 'chill'] as const) expect(t[k], `${element} ${k}`).toBeUndefined();
      expect(t.poison).toBe(false);
      expect(t.sleep).toBe(0);
    }
  });
});

describe('ailment chips', () => {
  it('ailment chips in a fixed order', () => {
    const c = E('e0', {
      chill: 2, frozen: true, shock: 2, bleed: [{ tick: 3, turns: 1, src: 'p' }, { tick: 2, turns: 3, src: 'p' }],
      burn: { tick: 5, turns: 3, src: 'p' }, sleep: 2, poison: true, freezeGuard: 2,
    });
    expect(ailmentChips(c)).toEqual([
      { id: 'poison' }, { id: 'sleep', turns: 2 }, { id: 'burn', turns: 3 }, { id: 'bleed', stacks: 2, turns: 3 },
      { id: 'shock', turns: 2 }, { id: 'freeze' }, { id: 'chill', turns: 2 },
    ]);
    expect(ailmentChips(E('e1'))).toEqual([]);
  });
});

describe('the data guard', () => {
  it('every burn and bleed in the data rides on a hit', () => {
    const lists: [string, Effect[]][] = [];
    for (const s of Object.values(SKILLS)) lists.push([`skill ${s.id}`, s.effects]);
    for (const [id, e] of Object.entries(ENEMIES)) for (const s of e.skills) lists.push([`enemy ${id} ${s.name}`, s.effects]);
    for (const [id, r] of Object.entries(REGIONS)) if (r.skill) lists.push([`region ${id}`, r.skill.effects]);
    const ults = [...Object.values(ULTIMATES), ...HERO_ULTIMATES, RIN_DAWN];
    for (const u of [...ults, ...ults.map(skyForm)]) {
      lists.push([`ultimate ${u.id}`, u.effects]);
      if (u.follow) lists.push([`ultimate ${u.id} follow`, u.follow.effects]);
    }
    // Added effects land after the skill's own list.
    for (const p of Object.values(POWERS)) if (p.mod.extra) lists.push([`power ${p.id}`, [...(SKILLS[p.skill]?.effects ?? []), ...p.mod.extra]]);
    for (const tree of Object.values(TREES)) {
      for (const b of tree.branches) for (const n of b.nodes) for (const m of n.mods ?? []) {
        if (m.extra) lists.push([`node ${n.id}`, [...(SKILLS[n.skill!]?.effects ?? []), ...m.extra]]);
      }
    }
    expect(lists.length).toBeGreaterThan(50);
    for (const [name, effects] of lists) {
      effects.forEach((e, i) => {
        if (e.kind === 'inflict' && (e.status === 'burn' || e.status === 'bleed')) {
          expect(effects.slice(0, i).some((x) => x.kind === 'damage'), name).toBe(true);
        }
      });
    }
  });
});
