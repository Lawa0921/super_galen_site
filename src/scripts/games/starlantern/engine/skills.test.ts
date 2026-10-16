import { describe, it, expect } from 'vitest';
import { applyEffect, patchSkill, type EffectContext } from './skills';
import { createBattle, resolveRound, skillCost, skillFor } from './battle';
import { POWERS } from '../data/gear';
import { SKILLS } from '../data/skills';
import { newParty } from './party';
import { constRng, makeBattle, makeCombatant, plainItem } from './testing';
import type { SkillDef } from './types';

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

describe('patchSkill', () => {
  it('patchSkill applies every SkillMod field; hpCost 0 is kept', () => {
    const def: SkillDef = {
      id: 'x', name: 'x', owner: 'noel', learnLevel: 1, tp: 5, hpCost: 0.15, target: 'enemy', desc: '',
      effects: [
        { kind: 'damage', power: 81, element: 'phys', scale: 'atk', melee: true },
        { kind: 'heal', power: 120 },
        { kind: 'buff', stat: 'def', pct: 40, turns: 3 },
        { kind: 'inflict', status: 'poison', chance: 0.5 },
        { kind: 'turret', power: 70, turns: 3 },
        { kind: 'taunt', turns: 3 },
      ],
    };
    const before = structuredClone(def);
    const out = patchSkill(def, { hits: 2, target: 'allies', powerPct: 65, element: 'thunder', hpCost: 0, turns: 5, chance: 1, extra: [{ kind: 'cure' }] });
    expect(out.target).toBe('allies');
    expect(out).toHaveProperty('hpCost', 0);
    expect(out.effects).toEqual([
      { kind: 'damage', power: 53, element: 'thunder', scale: 'atk', melee: true, hits: 2 },   // round(81 * 65 / 100)
      { kind: 'heal', power: 78 },
      { kind: 'buff', stat: 'def', pct: 26, turns: 5 },
      { kind: 'inflict', status: 'poison', chance: 1 },
      { kind: 'turret', power: 46, turns: 5 },
      { kind: 'taunt', turns: 5 },
      { kind: 'cure' },
    ]);
    expect(def).toEqual(before);
    expect(patchSkill(def, {})).toEqual(def);
  });

  it('every legendary power changes the skill it names', () => {
    for (const p of Object.values(POWERS)) {
      const base = SKILLS[p.skill];
      expect(base, p.id).toBeDefined();
      expect(patchSkill(base, p.mod), p.id).not.toEqual(base);
    }
    // The four whose skill is not a plain damage skill, checked by what they must do.
    expect(patchSkill(SKILLS.hex, POWERS['mire-whisper-gloves'].mod).effects).toEqual([
      { kind: 'buff', stat: 'atk', pct: -25, turns: 3 }, { kind: 'inflict', status: 'poison', chance: 1 },
    ]);
    const moon = patchSkill(SKILLS.moonlight, POWERS['lg-selene'].mod);
    expect([moon.target, moon.effects]).toEqual(['allies', [{ kind: 'heal', power: 72 }]]);
    expect(patchSkill(SKILLS.turret, POWERS['lg-bobby'].mod).effects).toEqual([{ kind: 'turret', power: 70, turns: 5 }]);
    const wall = patchSkill(SKILLS['iron-wall'], POWERS['iron-bulwark-plate'].mod);
    expect([wall.target, wall.effects]).toEqual(['allies', [{ kind: 'buff', stat: 'def', pct: 20, turns: 3 }]]);
  });

  it('a member wearing 雙月槍 sweeps twice at power 52', () => {
    const party = newParty();
    const spear = { ...plainItem('iron-sword', 1), rarity: 'legendary' as const, special: 'lg-chizuru' };
    party.roster.chizuru = { ...party.roster.chizuru, equip: { weapon: spear } };
    const c = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} }).party.find((x) => x.key === 'chizuru')!;
    expect(skillFor(c, 'sweep')!.effects).toEqual([{ kind: 'damage', power: 52, element: 'phys', scale: 'atk', melee: true, hits: 2 }]);
    expect(skillFor(c, 'pierce')).toBe(SKILLS.pierce);
    const plain = createBattle({ party: newParty(), enemyIds: ['slime'], inventory: {}, revealed: {} }).party.find((x) => x.key === 'chizuru')!;
    expect(skillFor(plain, 'sweep')).toBe(SKILLS.sweep);
    const foes = [enemy({ key: 'e0', sleep: 3, max: { hp: 999 } as never }), enemy({ key: 'e1', sleep: 3, max: { hp: 999 } as never })];
    const r = resolveRound(makeBattle([c], foes), { chizuru: { kind: 'skill', skill: 'sweep' } }, constRng(0.5));
    const hits = (k: string) => r.log.filter((e) => e.type === 'damage' && e.target === k).length;
    expect([hits('e0'), hits('e1')]).toEqual([2, 2]);
  });

  it('stacks two powers on one skill; an added effect is never rescaled by the other power', () => {
    const want = [
      { kind: 'damage', power: 204, element: 'thunder', scale: 'atk', melee: false },
      { kind: 'buff', stat: 'def', pct: -20, turns: 3 },
    ];
    expect(skillFor(party({ powers: ['lg-sylvie', 'storm-thunder-bow'] }), 'aimed-shot')!.effects).toEqual(want);
    expect(skillFor(party({ powers: ['storm-thunder-bow', 'lg-sylvie'] }), 'aimed-shot')!.effects).toEqual(want);
  });
});

describe('review fixes', () => {
  it('a damage effect without multistrike draws one number per hit (the variance) and nothing else', () => {
    const r = Object.assign(() => { r.n++; return 0.5; }, { n: 0 });
    applyEffect(party(), enemy({ max: { hp: 999 } as never }), { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, ctx({ rng: r }));
    expect(r.n).toBe(1);
    const r3 = Object.assign(() => { r3.n++; return 0.5; }, { n: 0 });
    applyEffect(party(), enemy({ max: { hp: 999 } as never }), { kind: 'damage', power: 10, element: 'phys', scale: 'atk', melee: true, hits: 3 }, ctx({ rng: r3 }));
    expect(r3.n).toBe(3);
  });

  it('a chance mod changes poison inflicts only, never another status in the same skill', () => {
    const def: SkillDef = {
      id: 'x', name: 'x', owner: 'noel', learnLevel: 1, tp: 5, target: 'enemy', desc: '',
      effects: [{ kind: 'inflict', status: 'sleep', chance: 0.4 }, { kind: 'inflict', status: 'poison', chance: 0.5 }],
    };
    expect(patchSkill(def, { chance: 1 }).effects).toEqual([
      { kind: 'inflict', status: 'sleep', chance: 0.4 }, { kind: 'inflict', status: 'poison', chance: 1 },
    ]);
  });

  it('skillFor an unknown id is undefined, and a round with it does nothing', () => {
    expect(skillFor(party(), 'no-such-skill')).toBeUndefined();
    expect(skillFor(party({ powers: ['lg-sylvie'] }), 'no-such-skill')).toBeUndefined();
    const r = resolveRound(makeBattle([party()], [enemy({ sleep: 3 })]), { p: { kind: 'skill', skill: 'no-such-skill' } }, constRng(0.5));
    expect(r.log.some((e) => e.type === 'act' && e.actor === 'p')).toBe(false);
  });

  it('a tpCost of 100 or more still charges 1 TP', () => {
    for (const tpCost of [100, 150, 1e6]) expect(skillCost(party({ x: { tpCost } }), 'twin-slash'), String(tpCost)).toBe(1);
  });
});

describe('heal bonus', () => {
  it("raises the healer's healing by heal%", () => {
    const t = party({ hp: 1, max: { hp: 999 } as never });
    applyEffect(party({ x: { heal: 50 } }), t, { kind: 'heal', power: 120 }, ctx());
    expect(t.hp).toBe(1 + 90);   // 60 * 1.5
  });
});
