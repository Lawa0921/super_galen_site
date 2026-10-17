import { describe, expect, it } from 'vitest';
import type { CharacterId, Member, Stats } from '../engine/types';
import { AFFINITY_MUL, ALL_AFFINITY_SHARE, CONVERT, convertPrimary } from '../engine/stats';
import { defaultTree, newTree, nodeRank, raiseNode, skillPoints } from '../engine/progression';
import { CHARACTERS, CHARACTER_IDS, LEGACY_CHARACTER_IDS, rulesOf } from './characters';
import { HERO_PEAK_SHARE } from './hero';
import { SKILLS } from './skills';
import { DEFAULT_CAPSTONE, NODES, TREES } from './trees';

/** The eight original companions. */
const EIGHT: CharacterId[] = LEGACY_CHARACTER_IDS;
const KEYS: (keyof Stats)[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
};
const total = (st: Stats) => KEYS.reduce((n, k) => n + st[k], 0);
const hero = () => CHARACTERS['hero' as CharacterId];
const heroNodes = () => TREES['hero' as CharacterId].branches.flatMap((b) => b.nodes);

describe('hero', () => {
  it('is the returner 洛恩, a melee front-liner of every affinity and a weapon master, with the hero rules', () => {
    expect(EIGHT).toHaveLength(8);
    expect(hero()).toMatchObject({ id: 'hero', title: '歸來者', name: '洛恩', row: 'front', melee: true, affinity: 'all', weaponMaster: true });
    expect(rulesOf('hero' as CharacterId)).toEqual({ curve: 'hero', branches: 5, capstones: 2, boardCols: 6, maxKeystones: 3 });
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
    const t = TREES['hero' as CharacterId];
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

  it("the hero's default tree spends his whole curve legally, aiming at the sword's abyss node", () => {
    const id = 'hero' as CharacterId;
    for (const level of [1, 2, 10, 30, 50]) {
      const tree = defaultTree(id, level);
      const label = `Lv${level}`;
      expect(Object.values(tree).reduce((n, r) => n + r, 0) - 1, label).toBe(skillPoints(level, 'hero'));
      const caps = Object.keys(tree).filter((n) => tree[n] > 0 && NODES[n].tier === 4);
      for (const c of caps) expect(NODES[c].branch, label).toBe(DEFAULT_CAPSTONE[id]);
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
    const actives = heroNodes().filter((n) => n.kind === 'active').map((n) => n.skill);
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
    const effects = heroNodes().filter((n) => n.kind === 'active').flatMap((n) => SKILLS[n.skill].effects);
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
