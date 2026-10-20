import { describe, it, expect } from 'vitest';
import { applyEffect, patchSkill, stackMods, type EffectContext } from './skills';
import { treeMods } from './progression';
import { ACTIVE_RANK_PCT, NODES } from '../data/trees';
import { createBattle, resolveRound, skillCost, skillFor } from './battle';
import { POWERS } from '../data/gear';
import { SKILLS } from '../data/skills';
import { LEGACY_LINEUP } from './party';
import { constRng, makeBattle, makeCombatant, plainItem, fullParty } from './testing';
import type { SkillDef } from './types';
import { KEYSTONE_VALUES as V, MEMORY_KEYSTONE_VALUES, type KeystoneId } from '../data/talents';
import { dealDamage, stat, type Combatant } from './combatant';
import type { Element } from './types';

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
    expect(t.buffs).toEqual([{ stat: 'spd', pct: -30, turns: 3, src: 'p' }]);
  });
});

describe('patchSkill', () => {
  it('patchSkill applies every SkillMod field; hpCost 0 is kept', () => {
    const def: SkillDef = {
      id: 'x', name: 'x', owner: 'noel', tp: 5, hpCost: 0.15, target: 'enemy', desc: '',
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
    const out = patchSkill(def, { hits: 2, target: 'allies', powerPct: 65, buffPct: 150, element: 'thunder', hpCost: 0, turns: 5, chance: 1, extra: [{ kind: 'cure' }] });
    expect(out.target).toBe('allies');
    expect(out).toHaveProperty('hpCost', 0);
    expect(out.effects).toEqual([
      { kind: 'damage', power: 53, element: 'thunder', scale: 'atk', melee: true, hits: 2 },   // round(81 * 65 / 100)
      { kind: 'heal', power: 78 },
      { kind: 'buff', stat: 'def', pct: 60, turns: 5 },   // buffPct, never powerPct: round(40 * 150 / 100)
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
    expect(patchSkill(SKILLS['rin-venom-needle'], POWERS['mire-whisper-gloves'].mod).effects).toEqual([
      { kind: 'damage', power: 70, element: 'phys', scale: 'atk', melee: false }, { kind: 'inflict', status: 'poison', chance: 1 },
    ]);
    const moon = patchSkill(SKILLS.moonlight, POWERS['lg-selene'].mod);
    expect([moon.target, moon.effects]).toEqual(['allies', [{ kind: 'heal', power: 72 }]]);
    expect(patchSkill(SKILLS.turret, POWERS['lg-bobby'].mod).effects).toEqual([{ kind: 'turret', power: 70, turns: 5 }]);
    const wall = patchSkill(SKILLS['iron-wall'], POWERS['iron-bulwark-plate'].mod);
    expect([wall.target, wall.effects]).toEqual(['allies', [{ kind: 'buff', stat: 'def', pct: 20, turns: 3 }]]);
  });

  it('a member wearing 雙月槍 sweeps twice at power 52', () => {
    const party = fullParty(LEGACY_LINEUP);
    const spear = { ...plainItem('iron-sword', 1), rarity: 'legendary' as const, special: 'lg-chizuru' };
    party.roster.chizuru = { ...party.roster.chizuru, equip: { weapon: spear } };
    const c = createBattle({ party, enemyIds: ['slime'], inventory: {}, revealed: {} }).party.find((x) => x.key === 'chizuru')!;
    expect(skillFor(c, 'sweep')!.effects).toEqual([{ kind: 'damage', power: 52, element: 'phys', scale: 'atk', melee: true, hits: 2 }]);
    expect(skillFor(c, 'pierce')).toBe(SKILLS.pierce);
    const plain = createBattle({ party: fullParty(LEGACY_LINEUP), enemyIds: ['slime'], inventory: {}, revealed: {} }).party.find((x) => x.key === 'chizuru')!;
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
      id: 'x', name: 'x', owner: 'noel', tp: 5, target: 'enemy', desc: '',
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

  it('a percent rounds half away from zero, so a debuff rounds as deep as the matching buff', () => {
    const def: SkillDef = {
      id: 'x', name: 'x', owner: 'noel', tp: 5, target: 'enemy', desc: '',
      effects: [{ kind: 'buff', stat: 'atk', pct: -25, turns: 3 }, { kind: 'buff', stat: 'atk', pct: 25, turns: 3 }],
    };
    expect(patchSkill(def, { buffPct: 150 }).effects.map((e) => (e as { pct: number }).pct)).toEqual([-38, 38]);   // 37.5 both ways
    expect(patchSkill(def, { buffPct: 130 }).effects.map((e) => (e as { pct: number }).pct)).toEqual([-33, 33]);   // 32.5
    expect(patchSkill(def, { buffPct: 115 }).effects.map((e) => (e as { pct: number }).pct)).toEqual([-29, 29]);   // 28.75
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

describe('tpDelta', () => {
  it('never takes a TP skill below 1 and leaves a free skill free', () => {
    expect(patchSkill(SKILLS['flame-wave'], { tpDelta: -99 }).tp).toBe(1);
    expect(patchSkill(SKILLS.stealth, { tpDelta: -1 }).tp).toBe(0);
    expect(patchSkill(SKILLS['flame-wave'], { tpDelta: -2 }).tp).toBe(5);
  });
});

describe('skill ranks and modifier nodes (Task 8)', () => {
  const mod = (id: string, r: number) => NODES[id].node.mods![r - 1];
  const pw = (base: number, pct: number) => Math.round((base * pct) / 100);
  const caster = (ranks: Record<string, number>, powers: string[] = []) => party({ ranks, powers });
  const fx = (c: ReturnType<typeof caster>, id: string) => skillFor(c, id)!.effects;
  const dmg = (c: ReturnType<typeof caster>, id: string) => (fx(c, id).find((e) => e.kind === 'damage') as { power: number }).power;

  it("an active's rank scales its power by ACTIVE_RANK_PCT", () => {
    expect(dmg(caster({ 'fire-star': 3 }), 'fire-star')).toBe(pw(140, ACTIVE_RANK_PCT[2]));
    expect(skillFor(caster({ 'fire-star': 1 }), 'fire-star')).toBe(SKILLS['fire-star']);
  });

  it('a modifier node rewrites its skill at its rank', () => {
    expect(dmg(caster({ 'fire-star': 1, 'noel-fire-up': 2 }), 'fire-star')).toBe(pw(140, mod('noel-fire-up', 2).powerPct!));
    expect(skillCost(caster({ 'flame-wave': 1, 'noel-wave-up': 3 }), 'flame-wave'))
      .toBe(Math.max(1, SKILLS['flame-wave'].tp + mod('noel-wave-up', 3).tpDelta!));
  });

  it('the tree applies before worn powers', () => {
    const c = caster({ 'fire-star': 2 }, ['lg-noel']);
    expect(dmg(c, 'fire-star')).toBe(pw(pw(140, ACTIVE_RANK_PCT[1]), POWERS['lg-noel'].mod.powerPct!));
    expect(skillFor(c, 'fire-star')!.target).toBe('enemies');
  });

  const twin = mod('twin-turret', 1);
  const turretTurns = (SKILLS.turret.effects[0] as { turns: number }).turns;

  it('hpCost and the turret capstone come through', () => {
    expect(skillFor(caster({ 'blaze-ring': 1, 'scarlet-ring-up': 3 }), 'blaze-ring')!.hpCost).toBe(mod('scarlet-ring-up', 3).hpCost);
    const turret = fx(caster({ turret: 1, 'twin-turret': 1 }), 'turret')[0] as { power: number; turns: number };
    expect(turret.power).toBe(pw(70, 100 + twin.powerDelta!));
    expect(turret.turns).toBe(turretTurns + twin.turnsDelta!);
  });

  it('stacking: rank, then modifiers (absolute replaces, relative adds), then the legendary power last', () => {
    // twin-turret is relative (+powerPct points, +turns): it stacks on bobby-turret-up's absolute powerPct.
    const ranks = { turret: 1, 'bobby-turret-up': 3, 'twin-turret': 1 };
    const up3 = mod('bobby-turret-up', 3);
    const plain = fx(caster(ranks), 'turret')[0] as { power: number; turns: number };
    expect(plain.power).toBe(pw(70, up3.powerPct! + twin.powerDelta!));
    expect(plain.turns).toBe(turretTurns + twin.turnsDelta!);
    // lg-bobby comes last and its turns are absolute.
    const t = fx(caster(ranks, ['lg-bobby']), 'turret')[0] as { power: number; turns: number };
    expect(t.power).toBe(pw(70, up3.powerPct! + twin.powerDelta!));
    expect(t.turns).toBe(POWERS['lg-bobby'].mod.turns);
    // The active's own rank is a stage of its own, before the modifiers.
    const t3 = fx(caster({ ...ranks, turret: 3 }, ['lg-bobby']), 'turret')[0] as { power: number; turns: number };
    expect(t3.power).toBe(pw(pw(70, ACTIVE_RANK_PCT[2]), up3.powerPct! + twin.powerDelta!));
    // Relative values add, absolute values replace: the later absolute wins.
    expect(stackMods([{ powerPct: 110, tpDelta: -1 }, { powerPct: 120, powerDelta: 60, turnsDelta: 1, tpDelta: -2 }, { powerDelta: 5, turnsDelta: 1 }]))
      .toEqual({ powerPct: 120, powerDelta: 65, turnsDelta: 2, tpDelta: -3 });
    expect(stackMods([{ extra: [{ kind: 'cure' }] }, { extra: [{ kind: 'cure' }] }]).extra).toHaveLength(2);
  });

  it('patchSkill adds powerDelta points to powerPct and turnsDelta to every lasting effect', () => {
    const def: SkillDef = { id: 'x', name: 'x', owner: 'bobby', tp: 5, target: 'self', desc: '',
      effects: [{ kind: 'turret', power: 70, turns: 3 }, { kind: 'buff', stat: 'def', pct: 20, turns: 3 }, { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: false }] };
    expect(patchSkill(def, { powerPct: 135, powerDelta: 60, turnsDelta: 1 }).effects).toEqual([
      { kind: 'turret', power: pw(70, 195), turns: 4 }, { kind: 'buff', stat: 'def', pct: 20, turns: 4 },
      { kind: 'damage', power: 195, element: 'phys', scale: 'atk', melee: false },
    ]);
    expect((patchSkill(def, { powerDelta: 60 }).effects[0] as { power: number }).power).toBe(pw(70, 160));
  });

  it("a rank scales the skill's primary effect: power, or a pure buff's percent; never a debuff riding on damage", () => {
    const roar0 = SKILLS['guardian-roar'];
    expect(skillFor(caster({ 'guardian-roar': 1 }), 'guardian-roar')).toBe(roar0);
    for (const r of [1, 2, 3]) {
      expect(fx(caster({ 'guardian-roar': r }), 'guardian-roar'), `roar ${r}`)
        .toEqual(roar0.effects.map((e) => (e.kind === 'buff' ? { ...e, pct: pw(e.pct, ACTIVE_RANK_PCT[r - 1]) } : e)));
    }
    const bind0 = SKILLS['frost-bind'].effects;
    for (const r of [1, 2, 3]) {
      expect(fx(caster({ 'frost-bind': r }), 'frost-bind'), `bind ${r}`)
        .toEqual(bind0.map((e) => (e.kind === 'damage' ? { ...e, power: pw(e.power, ACTIVE_RANK_PCT[r - 1]) } : e)));
    }
    const baseDebuff = bind0.find((e) => e.kind === 'buff');
    expect(fx(caster({ 'frost-bind': 1, 'noel-bind-up': 3 }), 'frost-bind').find((e) => e.kind === 'buff'))
      .toEqual({ ...baseDebuff, pct: -45 });   // 「並加深速度削弱」: -30 x 150%
    const smoke = fx(caster({ 'smoke-bomb': 1, 'liz-smoke-up': 2 }), 'smoke-bomb')[0] as { pct: number };
    const smoke0 = SKILLS['smoke-bomb'].effects[0] as { pct: number };
    expect(smoke.pct).toBe(pw(smoke0.pct, mod('liz-smoke-up', 2).buffPct!));                                    // 「加深煙霧彈的攻擊削弱」
    const bash = fx(caster({ 'shield-bash': 1, 'scarlet-bash-up': 3 }), 'shield-bash');
    const bash0 = SKILLS['shield-bash'].effects;
    expect(bash).toEqual([
      { ...bash0[0], power: pw((bash0[0] as { power: number }).power, mod('scarlet-bash-up', 3).powerPct!) },
      { ...bash0[1], pct: pw((bash0[1] as { pct: number }).pct, mod('scarlet-bash-up', 3).buffPct!) },   // 「並加深攻擊削弱」
    ]);
  });

  it('skillFor casts exactly what treeMods describes, then the worn powers (one path)', () => {
    for (const [skill, ranks, powers] of [
      ['turret', { turret: 2, 'bobby-turret-up': 3, 'twin-turret': 1 }, ['lg-bobby']],
      ['shield-bash', { 'shield-bash': 3, 'scarlet-bash-up': 2 }, []],
      ['fire-star', { 'fire-star': 3, 'noel-fire-up': 1 }, ['lg-noel']],
    ] as [string, Record<string, number>, string[]][]) {
      const tree = treeMods(ranks, skill).reduce((d, m) => patchSkill(d, m), SKILLS[skill]);
      const want = powers.map((p) => POWERS[p].mod).reduce((d, m) => patchSkill(d, m), tree);
      expect(skillFor(caster(ranks, powers), skill), skill).toEqual(want);
    }
    // Pinned by hand, not through treeMods: 70 at rank 2 is 110% (77); the mod's 135% and the twin turret's +60 points
    // stack into one 195% (77 x 1.95 = 150), then +1 turn, and lg-bobby fixes the turns at 5.
    expect(skillFor(caster({ turret: 2, 'bobby-turret-up': 3, 'twin-turret': 1 }, ['lg-bobby']), 'turret')!.effects).toEqual([{ kind: 'turret', power: 150, turns: 5 }]);
  });

  it('a member casts only a skill whose own node holds a whole rank; a junk rank casts nothing', () => {
    const casts = (ranks: Record<string, unknown>) => resolveRound(
      makeBattle([party({ ranks: ranks as Record<string, number> })], [enemy({ max: { hp: 999 } as never })]),
      { p: { kind: 'skill', skill: 'twin-slash', target: 'e0' } }, constRng(0.5),
    ).log.some((e) => e.type === 'act' && e.actor === 'p');
    expect(casts({ 'twin-slash': 1 })).toBe(true);
    expect(casts({ 'twin-slash': 9 })).toBe(true);   // above the max reads as the max
    for (const junk of [0, -1, 1.5, '1', NaN, null, true]) expect(casts({ 'twin-slash': junk }), String(junk)).toBe(false);
  });

  it('a mod node without its active, a rank of 0 and a junk rank change nothing', () => {
    expect(skillFor(caster({ 'fire-star': 0 }), 'fire-star')).toBe(SKILLS['fire-star']);
    expect(skillFor(caster({ 'fire-star': 1, 'noel-fire-up': 0 }), 'fire-star')).toBe(SKILLS['fire-star']);
    expect(skillFor(caster({ 'fire-star': 1.5 as never, 'noel-fire-up': '2' as never }), 'fire-star')).toBe(SKILLS['fire-star']);
    // A rank above the node's max reads as the max.
    expect(dmg(caster({ 'fire-star': 9 }), 'fire-star')).toBe(pw(140, ACTIVE_RANK_PCT[2]));
  });

  it('treeMods gives the two tree stages: the active rank, then the modifier nodes stacked into one in tree order', () => {
    expect(treeMods({ turret: 2, 'twin-turret': 1, 'bobby-turret-up': 1 }, 'turret'))
      .toEqual([{ powerPct: ACTIVE_RANK_PCT[1] }, stackMods([mod('bobby-turret-up', 1), mod('twin-turret', 1)])]);
    expect(treeMods({ turret: 1, 'twin-turret': 1 }, 'turret')).toEqual([mod('twin-turret', 1)]);
    expect(treeMods({ 'guardian-roar': 2 }, 'guardian-roar')).toEqual([{ buffPct: ACTIVE_RANK_PCT[1] }]);
    expect(treeMods({ turret: 1 }, 'turret')).toEqual([]);
    expect(treeMods({}, 'no-such-skill')).toEqual([]);
  });
});

describe('keystone TP refills', () => {
  const TP = 100;   // the hitting member's max TP, roomy enough for any KEYSTONE_VALUES
  /** One damage effect from a member at 10 TP (max TP): the TP gained and left, the tp events and the rng draws. */
  const hit = (keystones: KeystoneId[], over: Partial<Combatant> = {}, foe: Partial<Combatant> = {}, element: Element = 'phys', hits = 1) => {
    let draws = 0;
    const c = ctx({ rng: () => { draws++; return 0.5; } });
    const a = party({ max: { tp: TP } as never, tp: 10, keystones, ...over });
    const before = a.tp;
    applyEffect(a, enemy({ max: { hp: 999 } as never, ...foe }), { kind: 'damage', power: 100, element, scale: 'atk', melee: true, hits }, c);
    return { gain: a.tp - before, after: a.tp, tp: c.log.filter((e) => e.type === 'tp'), draws };
  };

  it('crit-tp, kill-tp and weak-tp refill TP, held to the maximum', () => {
    const crit = { x: { crit: 100 } };
    expect(hit(['crit-tp'], crit)).toMatchObject({ after: 10 + V.critTp, tp: [{ type: 'tp', target: 'p', amount: V.critTp }] });
    expect(hit(['kill-tp'], {}, { hp: 1 })).toMatchObject({ gain: V.killTp, tp: [{ type: 'tp', target: 'p', amount: V.killTp }] });
    expect(hit(['weak-tp'], {}, { weak: ['fire'] }, 'fire')).toMatchObject({ gain: V.weakTp, tp: [{ type: 'tp', target: 'p', amount: V.weakTp }] });
    // TP already full: +0 and no event; one short of full with critTp + killTp (more than 1) to gain: exactly the maximum.
    expect(hit(['crit-tp', 'kill-tp'], { ...crit, tp: TP }, { hp: 1 })).toMatchObject({ after: TP, gain: 0, tp: [] });
    expect(V.critTp + V.killTp).toBeGreaterThan(1);
    expect(hit(['crit-tp', 'kill-tp'], { ...crit, tp: TP - 1 }, { hp: 1 })).toMatchObject({ after: TP, tp: [{ type: 'tp', target: 'p', amount: 1 }] });
    // Without the keystone, or without the trigger, nothing.
    expect(hit([], crit, { hp: 1, weak: ['fire'] }, 'fire')).toMatchObject({ gain: 0, tp: [] });
    expect(hit(['crit-tp', 'kill-tp', 'weak-tp'], {}, { weak: ['ice'] }, 'fire')).toMatchObject({ gain: 0, tp: [] });
  });

  it('settles each hit on its own, and all three on one hit', () => {
    const three = hit(['crit-tp'], { tp: 0, x: { crit: 100 } }, {}, 'phys', 3);
    expect(three.tp).toHaveLength(3);
    expect(three.gain).toBe(3 * V.critTp);
    const all = hit(['crit-tp', 'kill-tp', 'weak-tp'], { tp: 0, x: { crit: 100 } }, { hp: 1, weak: ['fire'] }, 'fire');
    expect(all.gain).toBe(V.critTp + V.killTp + V.weakTp);
  });

  it('draws no extra random numbers', () => {
    const over = { x: { crit: 100 } };
    expect(hit(['crit-tp', 'kill-tp', 'weak-tp'], over, { hp: 1, weak: ['fire'] }, 'fire').draws)
      .toBe(hit([], over, { hp: 1, weak: ['fire'] }, 'fire').draws);
  });
});

describe('patchSkill new damage options', () => {
  it('patchSkill keeps crit, execute and wounded', () => {
    const def: SkillDef = { ...SKILLS.hex, effects: [{ kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true, crit: 'always', execute: 40, wounded: 30 }] };
    expect(patchSkill(def, { powerPct: 150 }).effects).toEqual([
      { kind: 'damage', power: 150, element: 'phys', scale: 'atk', melee: true, crit: 'always', execute: 40, wounded: 30 },
    ]);
  });
});

describe('memory keystones', () => {
  const MV = MEMORY_KEYSTONE_VALUES;
  const draws = () => { const n = { v: 0 }; return { n, rng: () => { n.v++; return 0.5; } }; };

  it('moon-promise heals more', () => {
    const heal = (keystones: KeystoneId[]) => {
      const d = draws();
      const t = party({ key: 't', hp: 1, max: { hp: 999 } as never });
      applyEffect(party({ keystones }), t, { kind: 'heal', power: 120 }, ctx({ rng: d.rng }));
      return { got: t.hp - 1, draws: d.n.v };
    };
    const plain = heal([]), held = heal(['moon-promise']);
    expect(held.got).toBe(Math.floor(plain.got * (1 + MV.moonHealPct / 100)));
    expect(held.got).toBeGreaterThan(plain.got);
    expect(held.draws).toBe(plain.draws);
    // A different keystone changes nothing.
    expect(heal(['regen']).got).toBe(plain.got);
    // It multiplies with the heal bonus (1.5 x 1.2), it does not add to it (1.7).
    const both = party({ keystones: ['moon-promise'] as KeystoneId[], x: { heal: 50 } });
    const t = party({ key: 't', hp: 1, max: { hp: 9999 } as never });
    applyEffect(both, t, { kind: 'heal', power: 120 }, ctx());
    const base = (120 / 100) * (stat(both, 'mag') * 2 + 10);
    expect(t.hp - 1).toBe(Math.floor(base * (1.5 * (1 + MV.moonHealPct / 100))));
    expect(t.hp - 1).not.toBe(Math.floor(base * (1 + 0.5 + MV.moonHealPct / 100)));
  });

  it('troupe-step buffs last longer', () => {
    const cast = (keystones: KeystoneId[], onFoe = false) => {
      const target = onFoe ? enemy() : party({ key: 'ally' });
      applyEffect(party({ keystones }), target, { kind: 'buff', stat: onFoe ? 'def' : 'atk', pct: onFoe ? -20 : 20, turns: 2 }, ctx());
      return target.buffs[0].turns;
    };
    expect(cast([])).toBe(2);
    expect(cast(['troupe-step'])).toBe(2 + MV.troupeTurns);
    // Only her buffs on her side: a debuff on a foe lasts as written.
    expect(cast(['troupe-step'], true)).toBe(2);
  });

  it('carried-out hits a full-HP target harder', () => {
    const hit = (keystones: KeystoneId[], hp: number) => {
      const d = draws();
      const c = ctx({ rng: d.rng });
      applyEffect(party({ keystones, max: { atk: 400 } as never }), enemy({ hp, max: { hp: 99999 } as never }), { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, c);
      const e = c.log.find((x) => x.type === 'damage');
      return { amount: e && e.type === 'damage' ? e.amount : -1, draws: d.n.v };
    };
    const plain = hit([], 99999), held = hit(['carried-out'], 99999);
    expect(Math.abs(held.amount - plain.amount * (1 + MV.fullHpPct / 100))).toBeLessThanOrEqual(1);
    expect(held.draws).toBe(plain.draws);
    // One HP short of full: the same as without it.
    expect(hit(['carried-out'], 99998).amount).toBe(hit([], 99998).amount);
  });

  it('not-a-shield takes less while taunting', () => {
    const hit = (keystones: KeystoneId[], taunt: number) => {
      const c = ctx();
      applyEffect(enemy({ max: { atk: 400 } as never }), party({ keystones, taunt, max: { hp: 99999 } as never }), { kind: 'damage', power: 100, element: 'phys', scale: 'atk', melee: true }, c);
      const e = c.log.find((x) => x.type === 'damage');
      return e && e.type === 'damage' ? e.amount : -1;
    };
    const base = hit(['taunt-guard'], 2);
    const held = hit(['taunt-guard', 'not-a-shield'], 2);
    expect(Math.abs(held - base * (1 - MV.friendGuardPct / 100))).toBeLessThanOrEqual(1);
    expect(held).toBeLessThan(base);
    // Not taunting: no difference.
    expect(hit(['not-a-shield'], 0)).toBe(hit([], 0));
  });
});

describe('buffs keep the strongest (plan 8b)', () => {
  it('casting a weaker buff over a stronger one keeps the stronger', () => {
    const chizuru = makeCombatant({ key: 'chizuru', side: 'party' });
    const t = makeCombatant({ key: 'hero', side: 'party', max: { def: 40 } as never });
    for (const e of SKILLS.ward.effects) applyEffect(chizuru, t, e, ctx());
    expect(stat(t, 'def')).toBe(52);
    const guard = SKILLS['hero-guard'].effects.find((e) => e.kind === 'buff')!;
    expect(guard).toMatchObject({ stat: 'def', pct: 25 });
    applyEffect(t, t, guard, ctx());
    expect(stat(t, 'def')).toBe(52);
    expect(t.buffs).toEqual([{ stat: 'def', pct: 30, turns: 3, src: 'chizuru' }]);
  });
});

describe('effect sources', () => {
  it('a buff remembers who cast it', () => {
    const chizuru = makeCombatant({ key: 'chizuru', side: 'party' });
    const friend = makeCombatant({ key: 'selene', side: 'party' });
    applyEffect(chizuru, friend, SKILLS.ward.effects[0], ctx());
    expect(friend.buffs).toEqual([{ stat: 'def', pct: 30, turns: 3, src: 'chizuru' }]);
  });

  it('poison remembers its first poisoner until it ends', () => {
    const A = makeCombatant({ key: 'A', side: 'party' }), B = makeCombatant({ key: 'B', side: 'party' });
    const foe = enemy();
    const poison = { kind: 'inflict', status: 'poison', chance: 1 } as const;
    applyEffect(A, foe, poison, ctx({ rng: constRng(0) }));
    expect([foe.poison, foe.poisonSrc]).toEqual([true, 'A']);
    applyEffect(B, foe, poison, ctx({ rng: constRng(0) }));
    expect(foe.poisonSrc).toBe('A');
    // A resisted poison changes nothing.
    const clean = enemy();
    applyEffect(B, clean, { ...poison, chance: 0.5 }, ctx({ rng: constRng(0.99) }));
    expect([clean.poison, clean.poisonSrc]).toEqual([false, undefined]);
    applyEffect(B, foe, { kind: 'cure' }, ctx());
    expect([foe.poison, foe.poisonSrc]).toEqual([false, undefined]);
    applyEffect(B, foe, poison, ctx({ rng: constRng(0) }));
    expect(foe.poisonSrc).toBe('B');
    dealDamage(foe, foe.hp);
    expect([foe.alive, foe.poison, foe.poisonSrc]).toEqual([false, false, undefined]);
  });
});
