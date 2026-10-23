import { describe, expect, it } from 'vitest';
import { AILMENT, ailmentChance, ailmentChips, curable, inflictAilment, type AilmentShown } from './ailments';
import { TIER_AILMENTS } from './policy';
import { AFFIXES } from '../data/affixes';
import type { Combatant } from './combatant';
import { mulberry32 } from './rng';
import { applyEffect, type EffectContext } from './skills';
import { constRng, makeCombatant } from './testing';
import type { Effect, Element } from './types';
import { SKILLS } from '../data/skills';
import { ENEMIES } from '../data/enemies';
import { REGIONS, REGION_RIDER } from '../data/regions';
import { HERO_ULTIMATES, RIN_DAWN, ULTIMATES, skyForm } from '../data/ultimates';
import { POWERS } from '../data/gear';
import { TREES } from '../data/trees';
import { skillFor } from './battle';

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

  it('deep sleep lasts as the variant says (plan 8d Task 5, 深眠)', () => {
    const t = E('e0');
    applyEffect(P('p'), t, { kind: 'inflict', status: 'sleep', chance: 1, turns: 5 }, ctx());
    expect(t.sleep).toBe(5);
    const u = E('e1');
    applyEffect(P('p'), u, { kind: 'inflict', status: 'sleep', chance: 1 }, ctx());
    expect(u.sleep).toBe(3);
    // 深眠 writes its rounds onto 夢境's sleep; the moon's new-moon chance keeps them.
    const deep = skillFor({ powers: [], ranks: { dream: 1, 'selene-dream-deep': 2 } }, 'dream')!;
    expect(deep.effects).toContainEqual({ kind: 'inflict', status: 'sleep', chance: SKILLS.dream.effects[0].kind === 'inflict' ? SKILLS.dream.effects[0].chance : NaN, turns: 5 });
    expect(deep.name).toBe('夢境・深眠');
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

describe('the party is chilled, never frozen (difficulty plan Task 2)', () => {
  it('the party is chilled, never frozen', () => {
    const foe = E('e0');
    const hit = (t: Combatant) => { const c = ctx(); inflictAilment(foe, t, 'freeze', 1, c); return c.log; };
    const p = P('p');
    expect(hit(p)).toEqual([{ type: 'status', target: 'p', status: 'chill' }]);
    expect(p.frozen).toBeUndefined();
    expect(p.chill).toBe(AILMENT.chillTurns);
    // Already chilled: refreshed back to full.
    const chilled = P('p', { chill: 1 });
    hit(chilled);
    expect(chilled.chill).toBe(AILMENT.chillTurns);
    expect(chilled.frozen).toBeUndefined();
    // Just thawed (the guard still up): chilled all the same, the guard does not stop it.
    const thawed = P('p', { freezeGuard: 2 });
    expect(ailmentChance(thawed, 'freeze', 0.4)).toBe(0.4);
    hit(thawed);
    expect(thawed.chill).toBe(AILMENT.chillTurns);
    expect(thawed.frozen).toBeUndefined();
    // Asleep: chilled too.
    const asleep = P('p', { sleep: 2 });
    hit(asleep);
    expect(asleep.chill).toBe(AILMENT.chillTurns);
    expect(asleep.frozen).toBeUndefined();
    // A foe (not a boss) still freezes, and its guard still holds.
    const e = E('e1');
    inflictAilment(P('p'), e, 'freeze', 1, ctx());
    expect(e.frozen).toBe(true);
    expect(ailmentChance(E('e2', { freezeGuard: 2 }), 'freeze', 0.4)).toBe(0);
  });

  it('Normal never freezes the party', () => {
    // Guard (green before the implementation): no Normal source of the enemies inflicts freeze, so changing what a freeze
    // does to the party changes no Normal fight. Widened (T2-T3 review, minor 3): nor any ailment `cure-ailment` answers,
    // so that rule never holds on Normal.
    const shown = (s: string) => (s === 'freeze' ? 'chill' : s);
    const tierOnly = (effects: readonly Effect[]) => effects.some((e) => e.kind === 'inflict' && (e.status === 'freeze' || TIER_AILMENTS.includes(shown(e.status) as AilmentShown)));
    for (const def of Object.values(ENEMIES)) for (const k of def.skills) expect(tierOnly(k.effects), `${def.id} ${k.name}`).toBe(false);
    for (const r of Object.values(REGIONS)) if (r.skill) expect(tierOnly(r.skill.effects), `${r.id} ${r.skill.name}`).toBe(false);
    // TIER_AILMENTS is exactly what the tiers add: the region riders and the affixes' ailments, a freeze shown as chill.
    const added = new Set<string>([
      ...Object.values(REGION_RIDER).map((s) => shown(s!)),
      ...Object.values(AFFIXES).flatMap((a) => (a.skill?.effects ?? []).flatMap((e) => (e.kind === 'inflict' ? [shown(e.status)] : []))),
    ]);
    expect([...TIER_AILMENTS].sort()).toEqual([...added].sort());
  });

  it('curable names what a cure removes', () => {
    const cleanse = SKILLS.cleanse;
    // The single cures say what they do (T2-T3 review, minor 5): every ailment.
    expect([SKILLS.cleanse.desc, SKILLS['hero-purify'].desc]).toEqual(['解除所有異常', '解除所有異常']);
    const sick = () => P('a', { poison: true, burn: { tick: 5, turns: 2, src: 'e0' }, chill: 1, freezeGuard: 2 });
    const t = sick();
    const named = curable(cleanse, t);
    expect([...named].sort()).toEqual(['burn', 'chill', 'poison']);
    // What the cast really removes is what it named.
    const before = ailmentChips(t).map((x) => x.id);
    applyEffect(P('selene'), t, { kind: 'cure' }, ctx());
    const after = ailmentChips(t).map((x) => x.id);
    expect(before.filter((id) => !after.includes(id)).sort()).toEqual([...named].sort());
    expect(t.freezeGuard).toBe(2);
    // Nothing to cure, or no cure in the skill: none.
    expect(curable(cleanse, P('b'))).toEqual([]);
    expect(curable(SKILLS['moon-rain'], sick())).toEqual([]);
  });
});
