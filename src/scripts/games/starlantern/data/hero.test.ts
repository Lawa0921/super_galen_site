import { describe, expect, it } from 'vitest';
import type { CharacterId, Effect, Member, SkillDef, Stats, WeaponKind } from '../engine/types';
import { skillFor } from '../engine/battle';
import { WEAPON_KINDS } from './equipment';
import { HERO_ULTIMATES, ULTIMATES, skyForm, SKY_LANTERN } from './ultimates';
import { AFFINITY_MUL, ALL_AFFINITY_SHARE, CONVERT, convertPrimary } from '../engine/stats';
import { defaultTree, newTree, nodeRank, raiseNode, skillPoints } from '../engine/progression';
import { CHARACTERS, CHARACTER_IDS, LEGACY_CHARACTER_IDS, rulesOf } from './characters';
import { HERO_BUILDS, HERO_PEAK_SHARE } from './hero';
import { SKILLS } from './skills';
import { NODES, TREES } from './trees';

/** The eight original companions. */
const EIGHT: CharacterId[] = LEGACY_CHARACTER_IDS;
const KEYS: (keyof Stats)[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
};
const total = (st: Stats) => KEYS.reduce((n, k) => n + st[k], 0);
const hero = () => CHARACTERS['hero'];
const heroNodes = () => TREES['hero'].branches.flatMap((b) => b.nodes);

describe('hero', () => {
  it('is the returner 洛恩, a melee front-liner of every affinity and a weapon master, with the hero rules', () => {
    expect(EIGHT).toHaveLength(8);
    expect(hero()).toMatchObject({ id: 'hero', title: '歸來者', name: '洛恩', row: 'front', melee: true, affinity: 'all', weaponMaster: true });
    expect(rulesOf('hero')).toEqual({ curve: 'hero', branches: 5, capstones: 2, boardCols: 6, maxKeystones: 3 });
    expect(HERO_PEAK_SHARE).toBe(0.85);
  });

  it('leads the roster (plan 6a Task 5)', () => {
    expect(CHARACTER_IDS[0]).toBe('hero');
  });

  it("hero base and growth are at least the companions' median on every stat", () => {
    for (const part of ['base', 'growth'] as const) {
      for (const k of KEYS) expect(hero()[part][k], `${part}.${k}`).toBeGreaterThanOrEqual(median(EIGHT.map((id) => CHARACTERS[id][part][k])));
    }
  });

  it("hero HP and DEF growth are 90% of the companions' best", () => {
    for (const k of ['hp', 'def'] as const) {
      expect(hero().growth[k], k).toBeCloseTo(0.9 * Math.max(...EIGHT.map((id) => CHARACTERS[id].growth[k])));
    }
  });

  it('hero growth total is the highest of every character', () => {
    for (const id of CHARACTER_IDS.filter((x) => x !== 'hero')) expect(total(hero().growth), id).toBeGreaterThan(total(CHARACTERS[id].growth));
  });

  it("'all' converts every primary at AFFINITY_MUL × ALL_AFFINITY_SHARE", () => {
    const mul = AFFINITY_MUL * ALL_AFFINITY_SHARE;
    expect(mul).toBeCloseTo(1.2);
    const out = convertPrimary({ str: 10, int: 10 }, 'all');
    expect(out.atk).toBeCloseTo(10 * CONVERT.str.atk! * mul);
    expect(out.mag).toBeCloseTo(10 * CONVERT.int.mag! * mul);
    // A single affinity still gets the full multiplier on its own primary and none on the others.
    expect(convertPrimary({ str: 10, int: 10 }, 'str')).toMatchObject({ atk: 10 * AFFINITY_MUL, mag: 10 });
  });

  it('hero tree has 5 branches covering the five roles, tier 4 of each is an abyss node', () => {
    const t = TREES['hero'];
    expect(t.branches.map((b) => b.name)).toEqual(['劍技', '守護', '星術', '祈光', '枷鎖']);
    for (const b of t.branches) {
      expect(b.nodes, b.name).toHaveLength(5);
      expect(b.nodes[4].id, b.name).toMatch(/^abyss-/);
      expect(b.nodes[4].maxRank, b.name).toBe(1);
    }
    expect(t.branches[0].nodes[0].id).toBe('hero-slash');
  });

  it('hero tree fills between 60% and 80% at Lv50', () => {
    const capacity = heroNodes().reduce((n, x) => n + x.maxRank, 0);
    expect(capacity).toBe(97);
    const share = (skillPoints(50, 'hero') + 1) / capacity;
    expect(share).toBeGreaterThan(0.6);
    expect(share).toBeLessThan(0.8);
  });

  it("the hero's default tree spends his whole curve legally, taking only the balanced build's abyss nodes", () => {
    const id = 'hero';
    for (const level of [1, 2, 10, 30, 50]) {
      const tree = defaultTree(id, level, 10);
      const label = `Lv${level}`;
      expect(Object.values(tree).reduce((n, r) => n + r, 0) - 1, label).toBe(skillPoints(level, 'hero'));
      const caps = Object.keys(tree).filter((n) => tree[n] > 0 && NODES[n].tier === 4);
      for (const c of caps) expect(HERO_BUILDS.balanced.branches, label).toContain(NODES[c].branch);
      // Replay from a bare tree, branch by branch and tier by tier, with the engine's own rules.
      let m: Member = { id, level, exp: 0, hp: 0, tp: 0, equip: {}, tree: newTree(id), talents: {} };
      for (const b of TREES[id].branches) for (const n of b.nodes) {
        while (nodeRank(m, n.id) < (tree[n.id] ?? 0)) {
          const r = raiseNode(m, n.id, Infinity);
          if (!r.ok) throw new Error(`${label} ${n.id} refused: ${r.reason}`);
          m = r.member;
        }
      }
      expect(m.tree, label).toEqual(tree);
    }
  });

  it('every hero skill is owned by him and has the stated tp cost', () => {
    const cost: Record<string, number> = {
      'hero-slash': 3, 'hero-cleave': 6, 'hero-sunder': 7, 'abyss-sword': 14,
      'hero-guard': 4, 'hero-aegis': 7, 'hero-rally': 6, 'abyss-guard': 12,
      'hero-flare': 4, 'hero-frost': 7, 'hero-spark': 5, 'abyss-star': 14,
      'hero-mend': 5, 'hero-prayer': 9, 'hero-purify': 3, 'abyss-light': 16,
      'hero-shackle': 4, 'hero-slow': 6, 'hero-expose': 5, 'hero-sleep': 5, 'abyss-chain': 13,
    };
    const actives = heroNodes().filter((n) => n.kind === 'active').map((n) => n.skill!);
    expect([...actives].sort()).toEqual(Object.keys(cost).sort());
    for (const [id, tp] of Object.entries(cost)) {
      expect(SKILLS[id].owner, id).toBe('hero');
      expect(SKILLS[id].tp, id).toBe(tp);
    }
  });

  it('the mastery nodes rewrite their skill by the stated percents', () => {
    const mods = (id: string) => heroNodes().find((n) => n.id === id)!;
    expect(mods('hero-sword-up')).toMatchObject({ skill: 'hero-slash', maxRank: 5 });
    expect(mods('hero-sword-up').mods!.map((m) => m.powerPct)).toEqual([104, 108, 112, 116, 120]);
    expect(mods('hero-guard-up')).toMatchObject({ skill: 'hero-guard', maxRank: 5 });
    expect(mods('hero-guard-up').mods!.map((m) => m.buffPct)).toEqual([104, 108, 112, 116, 120]);
    expect(mods('hero-star-up')).toMatchObject({ skill: 'hero-frost', maxRank: 5 });
    expect(mods('hero-star-up').mods!.map((m) => m.powerPct)).toEqual([104, 108, 112, 116, 120]);
    expect(mods('hero-light-up')).toMatchObject({ skill: 'hero-mend', maxRank: 5 });
    expect(mods('hero-light-up').mods!.map((m) => m.powerPct)).toEqual([103, 106, 109, 112, 115]);
  });

  it('no hero skill revives, always crits, executes or backstabs', () => {
    const effects = [
      ...heroNodes().filter((n) => n.kind === 'active').flatMap((n) => SKILLS[n.skill!].effects),
      ...HERO_ULTIMATES.flatMap((u) => u.effects),   // the five Lantern Key forms count too
    ];
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.kind).not.toBe('revive');
      if (e.kind !== 'damage') continue;
      expect(e.crit).toBeUndefined();
      expect(e.execute).toBeUndefined();
      expect(e.wounded).toBeUndefined();
    }
  });
});

/** Plan 6a Task 9: the hero's peaks against the specialists'. A red here means lowering a hero number, never a companion's or the share. */
describe('the hero never outdoes a specialist', () => {
  type Kind = WeaponKind | undefined;
  const KINDS: Kind[] = [undefined, ...(Object.keys(WEAPON_KINDS) as WeaponKind[])];
  const maxed = (id: CharacterId) =>
    Object.fromEntries(TREES[id].branches.flatMap((b) => b.nodes).map((n) => [n.id, n.maxRank])) as Record<string, number>;
  const actives = (id: CharacterId) => TREES[id].branches.flatMap((b) => b.nodes).filter((n) => n.kind === 'active').map((n) => n.skill!);
  type Measure = (s: SkillDef) => number[];
  const best = (xs: number[]) => Math.max(0, ...xs);
  /** `skillFor` for a maxed character, failing with the skill's name instead of a bare undefined. */
  const cast = (id: CharacterId, weaponKind: Kind, sk: string): SkillDef => {
    const def = skillFor({ powers: [], ranks: maxed(id), weaponKind }, sk);
    if (!def) throw new Error(`skillFor found nothing for ${id}:${sk}`);
    return def;
  };
  /** The biggest value of `measure` over the character's maxed active skills; the hero over every weapon kind and none. */
  const peak = (id: CharacterId, measure: Measure) =>
    best((id === 'hero' ? KINDS : [undefined]).flatMap((weaponKind) =>
      actives(id).flatMap((sk) => measure(cast(id, weaponKind, sk)))));

  const heal = (target: SkillDef['target']): Measure => (s) => s.target === target ? s.effects.flatMap((e) => (e.kind === 'heal' ? [e.power] : [])) : [];
  const defBuff = (target: SkillDef['target']): Measure => (s) =>
    s.target === target ? s.effects.flatMap((e) => (e.kind === 'buff' && e.stat === 'def' && e.pct > 0 ? [e.pct] : [])) : [];
  const spell = (target: SkillDef['target']): Measure => (s) =>
    s.target === target ? s.effects.flatMap((e) => (e.kind === 'damage' && e.scale === 'mag' ? [e.power * (e.hits ?? 1)] : [])) : [];
  const debuff: Measure = (s) =>
    s.target === 'enemy' || s.target === 'enemies' ? s.effects.flatMap((e) => (e.kind === 'buff' && e.pct < 0 ? [-e.pct] : [])) : [];
  const physical: Measure = (s) =>
    s.target === 'enemy' ? s.effects.flatMap((e) => (e.kind === 'damage' && e.scale === 'atk' ? [e.power * (e.hits ?? 1)] : [])) : [];

  const guarded = (hero: number, spec: number, label: string) => {
    expect(spec, `${label}: the specialist's peak`).toBeGreaterThan(0);
    expect(hero, label).toBeGreaterThan(0);
    expect(hero, label).toBeLessThanOrEqual(HERO_PEAK_SHARE * spec);
  };

  it("the hero's best heal is at most HERO_PEAK_SHARE of Selene's, single and all, and he never revives", () => {
    guarded(peak('hero', heal('ally')), peak('selene', heal('ally')), 'single heal');
    guarded(peak('hero', heal('allies')), peak('selene', heal('allies')), 'all heal');
    const revives: Measure = (s) => s.effects.flatMap((e) => (e.kind === 'revive' ? [e.hpPct] : []));
    expect(peak('selene', revives), 'Selene revives').toBeGreaterThan(0);
    expect(peak('hero', revives)).toBe(0);
  });

  it("the hero's guard is at most HERO_PEAK_SHARE of Scarlet's for himself, and of Chizuru's guard barrier for the party", () => {
    guarded(peak('hero', defBuff('self')), peak('scarlet', defBuff('self')), 'self guard');
    // Plan 8c Task 5: Scarlet guards the party by taking its blows (代受), with no team buff left; the party's defence is
    // Chizuru's guard barrier now, the same percent on every member.
    const guardBarrier: Measure = (s) => s.effects.flatMap((e) => (e.kind === 'barrier' && e.barrier === 'guard' ? [e.power] : []));
    expect(peak('scarlet', defBuff('allies')), 'Scarlet has no team buff').toBe(0);
    guarded(peak('hero', defBuff('allies')), peak('chizuru', guardBarrier), 'team guard');
  });

  it("the hero's spells are at most HERO_PEAK_SHARE of Noel's, single and all", () => {
    guarded(peak('hero', spell('enemy')), peak('noel', spell('enemy')), 'single spell');
    guarded(peak('hero', spell('enemies')), peak('noel', spell('enemies')), 'all spell');
  });

  it("the hero's debuffs are at most HERO_PEAK_SHARE of Noel's", () => {
    guarded(peak('hero', debuff), peak('noel', debuff), 'debuff');
  });

  it("the hero's single physical hit is at most HERO_PEAK_SHARE of the best of Sylvie's and Chizuru's", () => {
    guarded(peak('hero', physical), Math.max(peak('sylvie', physical), peak('chizuru', physical)), 'single physical hit');
  });

  it("the hero learns no companion's skill", () => {
    const mine = Object.values(NODES).filter((x) => x.owner === 'hero');
    expect(mine.length).toBeGreaterThan(0);
    for (const x of mine) expect(SKILLS[x.node.skill!].owner, x.node.id).toBe('hero');
    const others = new Set(Object.entries(ULTIMATES).filter(([id]) => id !== 'hero').map(([, u]) => u.id));
    expect(new Set(HERO_ULTIMATES.map((u) => u.id)).size).toBe(HERO_ULTIMATES.length);
    for (const u of HERO_ULTIMATES) {
      expect(others.has(u.id), u.id).toBe(false);
      expect(u.owner, u.id).toBe('hero');
      expect(u.id, u.id).toMatch(/^ult-hero-/);
    }
  });

  it('no form says the sword is the lamp key: that waits for his tenth piece (story continuity fix 13)', () => {
    // The name 「燈鑰」 is the spec's (§4.6); the description must not equate it with the sword before mem:hero:10.
    for (const u of [...HERO_ULTIMATES, ...HERO_ULTIMATES.map(skyForm)]) {
      expect(u.desc, u.id).not.toContain('燈鑰');
      expect(u.name, u.id).toMatch(/^燈鑰・/);
    }
  });

  it("every Lantern Key form is below its companion's ultimate", () => {
    expect(HERO_ULTIMATES.map((u) => u.id)).toEqual(['ult-hero-sword', 'ult-hero-guard', 'ult-hero-star', 'ult-hero-light', 'ult-hero-chain']);
    const [sword, guard, star, light, chain] = HERO_ULTIMATES.map((u) => u.effects);
    const dmg = (fx: Effect[]) => best(fx.flatMap((e) => (e.kind === 'damage' ? [e.power * (e.hits ?? 1)] : [])));
    const healOf = (fx: Effect[]) => best(fx.flatMap((e) => (e.kind === 'heal' ? [e.power] : [])));
    const buffMax = (fx: Effect[], sign: 1 | -1) => best(fx.flatMap((e) => (e.kind === 'buff' ? [sign * e.pct] : [])));
    const safiraBuff = buffMax(ULTIMATES.safira.effects, 1);
    expect(dmg(sword)).toBeLessThan(dmg(ULTIMATES.sylvie.effects));
    expect(dmg(star)).toBeLessThan(dmg(ULTIMATES.noel.effects));
    expect(healOf(light)).toBeLessThan(healOf(ULTIMATES.selene.effects));
    expect(safiraBuff).toBeGreaterThan(0);
    expect(buffMax(guard, 1)).toBeLessThan(safiraBuff);
    expect(buffMax(chain, -1)).toBeGreaterThan(0);
    expect(buffMax(chain, -1)).toBeLessThan(safiraBuff);
  });

  it("every sky form stays below its companion's ultimate", () => {
    const sky = HERO_ULTIMATES.map(skyForm);
    const [sword, guard, star, light, chain] = sky;
    // The follow-up counts with the original effect: the sky lantern's heal is added to the form's own.
    const all = (u: (typeof sky)[number]) => [...u.effects, ...(u.follow?.effects ?? [])];
    const dmg = (fx: Effect[]) => best(fx.flatMap((e) => (e.kind === 'damage' ? [e.power * (e.hits ?? 1)] : [])));
    const healSum = (fx: Effect[]) => fx.reduce((n, e) => n + (e.kind === 'heal' ? e.power : 0), 0);
    const buffMax = (fx: Effect[], sign: 1 | -1) => best(fx.flatMap((e) => (e.kind === 'buff' ? [sign * e.pct] : [])));
    const safiraBuff = buffMax(ULTIMATES.safira.effects, 1);
    expect(dmg(all(sword))).toBeLessThan(dmg(ULTIMATES.sylvie.effects));
    expect(dmg(all(star))).toBeLessThan(dmg(ULTIMATES.noel.effects));
    expect(healSum(all(light))).toBeLessThan(healSum(ULTIMATES.selene.effects));
    expect(healSum(all(light))).toBe(180 + SKY_LANTERN.heal);
    expect(buffMax(all(guard), 1)).toBeLessThan(safiraBuff);
    expect(buffMax(all(chain), -1)).toBeLessThan(safiraBuff);
    // the heal reaches the allies only, and every form keeps its original effects
    for (const [i, u] of sky.entries()) {
      expect(u.follow?.who, u.id).toBe('allies');
      expect(u.effects, u.id).toEqual(HERO_ULTIMATES[i].effects);
      expect(u.owner, u.id).toBe('hero');
    }
  });
});
