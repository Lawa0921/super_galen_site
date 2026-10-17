import { describe, it, expect } from 'vitest';
import {
  canRaiseNode, canRaiseTalent, defaultTalents, defaultTree, freeNode, keystonesOf, learnedSkills, legacyDue, newTree, nodeRank, raiseNode,
  raiseTalent, skillPoints, skillPointsLeft, talentPoints, talentPointsLeft, talentStats, treeSkills, ultimateFor, validBuild,
  heroMainBranch, heroTalents, heroTree, memoriesOf,
} from './progression';
import { chainLength } from '../data/story/chains';
import { HERO_ULTIMATES, ULTIMATES } from '../data/ultimates';
import { gainExp, newMember } from './party';
import { CHARACTERS, rulesOf } from '../data/characters';
import { mulberry32 } from './rng';
import { DEFAULT_CAPSTONE, LEGACY_LEARN_LEVEL, NODES, TIER_GATE, TREES } from '../data/trees';
import { BOARDS, DEFAULT_KEYSTONES, MEMORY_KEYSTONES, TALENT_PER, TALENT_SCALE, talentBlocker } from '../data/talents';
import { ABYSS_UNLOCK, HERO_BUILDS, type HeroBuild } from '../data/hero';
import type { AnyStat, CharacterId, Member } from './types';

/** The companions: the curve, point counts and talent boards below are theirs (the hero's tree is tested in data/hero.test.ts). */
const ids = (Object.keys(TREES) as CharacterId[]).filter((id): id is Exclude<CharacterId, 'hero'> => rulesOf(id).curve === 'companion');
const at = (id: CharacterId, level: number, tree?: Record<string, number>): Member =>
  ({ ...newMember(id), level, ...(tree ? { tree } : {}) });
/** Raises a node and returns the new member; fails the test when the raise is refused. */
const up = (m: Member, node: string, times = 1): Member => {
  for (let i = 0; i < times; i++) {
    const r = raiseNode(m, node);
    if (!r.ok) throw new Error(`${node} refused: ${r.reason}`);
    m = r.member;
  }
  return m;
};
/** Points a tree can take: every rank but the free one, and one ultimate only. */
const capacity = (id: CharacterId) =>
  TREES[id].branches.reduce((s, b) => s + b.nodes.slice(0, 4).reduce((t, n) => t + n.maxRank, 0), 0) - 1 /* free */ + 1 /* one ultimate */;
const spent = (tree: Record<string, number>) => Object.values(tree).reduce((s, r) => s + r, 0) - 1;

describe('progression', () => {
  it('skill points on every level to 4, then odd levels for skills and even levels for talents', () => {
    expect([1, 2, 4, 5, 6, 7, 50].map((L) => skillPoints(L))).toEqual([0, 1, 3, 4, 4, 5, 26]);
    expect([5, 6, 7, 8, 50].map((L) => talentPoints(L))).toEqual([0, 1, 1, 2, 23]);
    for (let L = 1; L <= 50; L++) expect(skillPoints(L) + talentPoints(L), `Lv${L}`).toBe(L - 1);
  });

  it('hero curve: skill points are one per level plus one every second level', () => {
    expect(skillPoints(50, 'hero')).toBe(73);
    expect(skillPoints(1, 'hero')).toBe(0);
    expect(skillPoints(3, 'hero')).toBe(3);
  });

  it("the hero's ultimate follows his deepest branch", () => {
    expect(HERO_ULTIMATES.map((u) => u.id)).toEqual(['ult-hero-sword', 'ult-hero-guard', 'ult-hero-star', 'ult-hero-light', 'ult-hero-chain']);
    expect(ULTIMATES.hero).toBe(HERO_ULTIMATES[0]);
    const hero = newMember('hero');
    expect(skillPointsLeft({ ...hero, level: 50 })).toBe(skillPoints(50, rulesOf('hero').curve));
    expect(skillPoints(50, rulesOf('hero').curve)).toBe(73);
    // a new hero holds only the free slash: the sword form
    expect(heroMainBranch(hero.tree)).toBe(0);
    expect(ultimateFor('hero', hero.tree).id).toBe('ult-hero-sword');
    expect(ultimateFor('hero').id).toBe('ult-hero-sword');
    // three points in 祈光 (branch 3) outweigh the free slash
    const light = up({ ...hero, level: 50 }, 'hero-mend', 3);
    expect(heroMainBranch(light.tree)).toBe(3);
    expect(ultimateFor('hero', light.tree).id).toBe('ult-hero-light');
    // every other branch picks its own form too
    for (const [node, branch, form] of [['hero-guard', 1, 'guard'], ['hero-flare', 2, 'star'], ['hero-shackle', 4, 'chain']] as const) {
      const m = up({ ...hero, level: 50 }, node, 3);
      expect(heroMainBranch(m.tree), form).toBe(branch);
      expect(ultimateFor('hero', m.tree).id, form).toBe(`ult-hero-${form}`);
    }
    // sword 2 and 祈光 2: the tie goes to the lower branch, the sword
    const tie = up(up({ ...hero, level: 50 }, 'hero-slash'), 'hero-mend', 2);
    expect(heroMainBranch(tie.tree)).toBe(0);
    expect(ultimateFor('hero', tie.tree).id).toBe('ult-hero-sword');
    // the companions keep their own, whatever the ranks
    expect(ultimateFor('noel', light.tree)).toBe(ULTIMATES.noel);
    expect(ultimateFor('rin')).toBe(ULTIMATES.rin);
  });

  it('hero curve: talent points from Lv6', () => {
    expect(talentPoints(5, 'hero')).toBe(0);
    expect(talentPoints(6, 'hero')).toBe(1);
    expect(talentPoints(50, 'hero')).toBe(45);
  });

  it('companion curve is unchanged', () => {
    for (let L = 1; L <= 50; L++) {
      expect(skillPoints(L), `skill Lv${L}`).toBe(skillPoints(L, 'companion'));
      expect(talentPoints(L), `talent Lv${L}`).toBe(talentPoints(L, 'companion'));
    }
    expect(skillPoints(50)).toBe(26);
    expect(talentPoints(50)).toBe(23);
  });

  it('an unknown curve throws instead of reading as companion', () => {
    expect(() => skillPoints(10, 3 as never)).toThrow();
    expect(() => talentPoints(10, 'x' as never)).toThrow();
    expect(() => [1, 2].map(skillPoints as (n: number) => number)).toThrow();
  });

  it('every rulesOf reader honours a per-character override', () => {
    const noel = CHARACTERS.noel;
    const original = noel.rules;
    // Everything but the ultimates and the first branch's tiers 0-3 at max, plus ultimate 0 held: a second ultimate is the question.
    const full: Record<string, number> = {};
    for (const b of TREES.noel.branches) for (const n of b.nodes.slice(0, 4)) full[n.id] = n.maxRank;
    const held = { ...full, [TREES.noel.branches[0].nodes[4].id]: 1 };
    const second = TREES.noel.branches[1].nodes[4].id;
    const keys = { 'noel-t00': 5, 'noel-t01': 5, 'noel-t02': 5, 'noel-k0': 1, 'noel-k1': 1 };
    const probe = () => ({
      skillLeft: skillPointsLeft({ ...newMember('noel'), level: 50 }),
      talentLeft: talentPointsLeft({ ...newMember('noel'), level: 50 }),
      second: canRaiseNode({ ...newMember('noel'), level: 50, tree: held }, second),
      third: talentBlocker('noel', 'noel-k2', keys),
      gained: gainExp({ ...newMember('noel'), level: 1, exp: 0 }, 1e9).points,
    });
    try {
      noel.rules = undefined;
      expect(probe()).toEqual({ skillLeft: 26, talentLeft: 23, second: 'capstone', third: 'keystone-cap', gained: { skill: 26, talent: 23 } });
      noel.rules = { capstones: 2, maxKeystones: 3, curve: 'hero' };
      const p = probe();
      expect(p.skillLeft).toBe(73);
      expect(p.talentLeft).toBe(45);
      expect(p.second).not.toBe('capstone');
      expect(p.third).toBeNull();
      expect(p.gained).toEqual({ skill: 73, talent: 45 });
    } finally {
      noel.rules = original;
    }
  });

  it('no tree fills by Lv50', () => {
    expect(Object.fromEntries(ids.map((id) => [id, capacity(id)]))).toEqual({
      noel: 36, chizuru: 36, liz: 32, sylvie: 36, scarlet: 34, selene: 30, safira: 36, bobby: 34, rin: 36,
    });
    for (const id of ids) {
      expect(capacity(id), id).toBeGreaterThan(skillPoints(50));
      const fill = skillPoints(50) / capacity(id);
      expect(fill, id).toBeGreaterThan(0.6);
      expect(fill, id).toBeLessThan(0.9);
    }
  });

  it('a new member knows only the free first skill', () => {
    const m = newMember('noel');
    expect(m.tree).toEqual({ 'fire-star': 1 });
    expect(m.talents).toEqual({});
    expect(skillPointsLeft(m)).toBe(0);
    expect(freeNode('noel')).toBe('fire-star');
    for (const id of ids) expect(newTree(id), id).toEqual({ [TREES[id].branches[0].nodes[0].id]: 1 });
  });

  it('raising spends a point and is refused without points, past max, without the previous node, under the gate', () => {
    const lv2 = up(at('noel', 2), 'ice-star');
    expect(nodeRank(lv2, 'ice-star')).toBe(1);
    expect(skillPointsLeft(lv2)).toBe(0);
    expect(canRaiseNode(lv2, 'ice-star')).toBe('points');

    expect(canRaiseNode(at('noel', 10), 'noel-ice-up')).toBe('req');

    let m = up(up(at('noel', 10), 'ice-star'), 'noel-ice-up');
    expect(TIER_GATE[2]).toBe(2);
    m = up(m, 'frost-bind');
    expect(TIER_GATE[3]).toBe(4);
    expect(canRaiseNode(m, 'noel-bind-up')).toBe('gate');

    const maxed = up(at('noel', 10), 'fire-star', 2);
    expect(nodeRank(maxed, 'fire-star')).toBe(3);
    expect(canRaiseNode(maxed, 'fire-star')).toBe('max');

    expect(canRaiseNode(at('noel', 10), 'sweep')).toBe('unknown');
  });

  it('with no points left the structural reason comes first; 點數不足 only for a node that is otherwise legal', () => {
    expect(skillPointsLeft(at('noel', 1))).toBe(0);
    expect(canRaiseNode(at('noel', 1), 'noel-ice-up')).toBe('req');
    expect(canRaiseNode(at('noel', 1), 'ice-star')).toBe('points');
    const gated = up(at('noel', 2), 'noel-fire-up');               // the one point spent: tiers below flame-wave hold 1 of 2
    expect(skillPointsLeft(gated)).toBe(0);
    expect(canRaiseNode(gated, 'flame-wave')).toBe('gate');
    const maxed = up(at('noel', 3), 'fire-star', 2);
    expect(skillPointsLeft(maxed)).toBe(0);
    expect(canRaiseNode(maxed, 'fire-star')).toBe('max');
    let m = at('noel', 50);
    for (const [node, n] of [['fire-star', 2], ['noel-fire-up', 3], ['flame-wave', 1], ['noel-wave-up', 1], ['inferno', 1],
      ['hex', 3], ['thunder-star', 3], ['noel-hex-up', 1], ['noel-thunder-up', 1]] as const) m = up(m, node, n);
    for (const node of ['ice-star', 'noel-ice-up', 'frost-bind', 'noel-bind-up']) while (skillPointsLeft(m) > 0 && canRaiseNode(m, node) === null) m = up(m, node);
    expect(skillPointsLeft(m)).toBe(0);
    expect(canRaiseNode(m, 'judgement')).toBe('capstone');
  });

  it('the free rank does not count toward the branch gate', () => {
    let m = up(at('noel', 10), 'noel-fire-up');
    expect(canRaiseNode(m, 'flame-wave')).toBe('gate');
    m = up(m, 'fire-star');
    expect(canRaiseNode(m, 'flame-wave')).toBeNull();
    expect(up(m, 'flame-wave').tree['flame-wave']).toBe(1);
  });

  it('only one capstone per character', () => {
    let m = at('noel', 50);
    m = up(m, 'fire-star', 2);
    m = up(m, 'noel-fire-up', 3);
    m = up(m, 'flame-wave');
    m = up(m, 'noel-wave-up');
    m = up(m, 'inferno');
    m = up(m, 'hex', 3);
    m = up(m, 'thunder-star', 3);
    m = up(m, 'noel-hex-up');
    m = up(m, 'noel-thunder-up');
    expect(skillPointsLeft(m)).toBeGreaterThan(0);
    expect(canRaiseNode(m, 'judgement')).toBe('capstone');
    // The same build without inferno may take judgement: the refusal is the capstone rule alone.
    expect(canRaiseNode({ ...m, tree: { ...m.tree, inferno: 0 } }, 'judgement')).toBeNull();
  });

  it('a refused raise changes nothing and raiseNode never mutates its input', () => {
    const m = at('noel', 2);
    const before = structuredClone(m);
    const ok = raiseNode(m, 'ice-star');
    expect(ok.ok).toBe(true);
    expect(m).toEqual(before);
    const bad = raiseNode(m, 'noel-ice-up');
    expect(bad).toEqual({ ok: false, reason: 'req' });
    expect(m).toEqual(before);
  });

  it('unknown, foreign and inherited ids and hostile trees give a reason, never a throw', () => {
    const m = at('noel', 10);
    for (const id of ['', 'nope', 'sweep', '__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
      expect(canRaiseNode(m, id), id).toBe('unknown');
      expect(raiseNode(m, id), id).toEqual({ ok: false, reason: 'unknown' });
      expect(nodeRank(m, id), id).toBe(0);
    }
    const hostile = [null, 5, 'x', [], { 'fire-star': 'x', 'ice-star': -2, hex: 1.5, frost: Infinity }];
    for (const tree of hostile) {
      const h = { ...m, tree } as unknown as Member;
      expect(() => canRaiseNode(h, 'ice-star')).not.toThrow();
      expect(() => raiseNode(h, 'ice-star')).not.toThrow();
      expect(() => skillPointsLeft(h)).not.toThrow();
      expect(nodeRank(h, 'ice-star')).toBe(0);
      expect(nodeRank(h, 'hex')).toBe(0);
    }
    const noTree = { ...m } as Partial<Member>;
    delete noTree.tree;
    expect(() => canRaiseNode(noTree as Member, 'fire-star')).not.toThrow();
  });

  it('defaultTree spends every point it legally can', () => {
    for (const id of ids) {
      for (const level of [1, 2, 3, 5, 10, 20, 38, 50]) {
        const tree = defaultTree(id, level);
        const label = `${id} Lv${level}`;
        expect(spent(tree), label).toBe(Math.min(skillPoints(level), capacity(id)));
        const caps = Object.keys(tree).filter((n) => tree[n] > 0 && NODES[n].tier === 4);
        expect(caps.length, label).toBeLessThanOrEqual(1);
        for (const c of caps) expect(NODES[c].branch, label).toBe(DEFAULT_CAPSTONE[id]);
        // Replay from a new tree, branch by branch and tier by tier, with the engine's own rules.
        let m = at(id, level);
        TREES[id].branches.forEach((b) => b.nodes.forEach((n) => {
          const want = tree[n.id] ?? 0;
          while (nodeRank(m, n.id) < want) m = up(m, n.id);
        }));
        expect(m.tree, label).toEqual(Object.fromEntries(Object.entries(tree).filter(([, r]) => r > 0)));
      }
    }
  });

  it('defaultTree learns every old skill at its old level, or at the first level with a skill point after it', () => {
    const table: Record<string, number> = {
      'ice-star': 2, hex: 4, 'thunder-star': 5,
      ward: 3, pierce: 5,
      stealth: 2, 'treasure-sense': 4, 'triple-slash': 5,
      'pin-shot': 3, 'arrow-rain': 5,
      'flame-burst': 3, 'iron-wall': 5,
      cleanse: 2, dream: 4, rebirth: 5,
      'war-dance': 3, mirage: 5,
      tinker: 2, barrier: 4,
    };
    const learned: Record<string, number> = {};
    for (const [skill, old] of Object.entries(LEGACY_LEARN_LEVEL)) {
      const owner = NODES[skill].owner;
      let L = 1;
      while ((defaultTree(owner, L)[skill] ?? 0) < 1) L++;
      if (old === 1) {
        expect(L, skill).toBe(1);
        expect(freeNode(owner), skill).toBe(skill);
        continue;
      }
      learned[skill] = L;
      expect(L, skill).toBeLessThanOrEqual(old);
      let due = old;
      while (skillPoints(due) <= skillPoints(due - 1)) due--;
      expect(L, skill).toBe(due);
      expect(legacyDue(skill), skill).toBe(due);
    }
    expect(learned).toEqual(table);
  });

  it('early points go to upgrades, not to old skills ahead of time', () => {
    const t = defaultTree('noel', 3);
    expect((t['noel-fire-up'] ?? 0) + (t['noel-ice-up'] ?? 0)).toBeGreaterThanOrEqual(1);
    expect(t.hex ?? 0).toBe(0);
    expect(t['thunder-star'] ?? 0).toBe(0);
  });

  it('at Lv50 the default tree spends all 26 points and still has an open node', () => {
    for (const id of ids) {
      const tree = defaultTree(id, 50);
      expect(spent(tree), id).toBe(26);
      const m = at(id, 50, tree);
      expect(skillPointsLeft(m), id).toBe(0);
      const next = at(id, 51, tree);
      const open = Object.keys(NODES).filter((n) => NODES[n].owner === id && canRaiseNode(next, n) === null);
      expect(open.length, id).toBeGreaterThan(0);
    }
  });

  it('learnedSkills follows the tree, in tree order', () => {
    expect(learnedSkills(newMember('liz'))).toEqual(['twin-slash']);
    expect(learnedSkills(at('liz', 10, { 'twin-slash': 1, stealth: 1, quickstep: 2 }))).toEqual(['twin-slash', 'stealth', 'quickstep']);
    // Tree order, not the order of the record; mod nodes and ids of other trees are not skills of this member.
    expect(learnedSkills(at('liz', 10, { quickstep: 1, stealth: 1, 'twin-slash': 1, 'fire-star': 1 }))).toEqual(['twin-slash', 'stealth', 'quickstep']);
    expect(learnedSkills(at('noel', 10, { 'fire-star': 1, 'noel-fire-up': 2, 'ice-star': 0 }))).toEqual(['fire-star']);
  });

  it("treeSkills('noel') has the 4 old skills and 5 new ones", () => {
    const all = treeSkills('noel');
    expect(all).toHaveLength(9);
    for (const s of ['fire-star', 'ice-star', 'hex', 'thunder-star', 'flame-wave', 'inferno', 'frost-bind', 'blizzard', 'judgement']) expect(all, s).toContain(s);
  });
});

/** A talent rank's bonus to `stat`, as the rules compute it: never a literal, so retuning TALENT_SCALE keeps these tests. */
const per = (stat: AnyStat) => TALENT_PER[stat]! * TALENT_SCALE;
const tal = (id: CharacterId, level: number, talents: Record<string, number> = {}): Member => ({ ...newMember(id), level, talents });
/** Raises a talent and returns the new member; fails the test when the raise is refused. */
const upT = (m: Member, node: string, times = 1): Member => {
  for (let i = 0; i < times; i++) {
    const r = raiseTalent(m, node);
    if (!r.ok) throw new Error(`${node} refused: ${r.reason}`);
    m = r.member;
  }
  return m;
};

describe('talents', () => {
  it('row 0 is open; a lower row needs a raised node diagonally or straight above', () => {
    const lv6 = tal('noel', 6);
    expect(talentPointsLeft(lv6)).toBe(1);
    expect(canRaiseTalent(lv6, 'noel-t10')).toBe('adjacent');
    expect(raiseTalent(lv6, 'noel-t10')).toEqual({ ok: false, reason: 'adjacent' });
    const one = upT(lv6, 'noel-t00');
    expect(lv6.talents).toEqual({});                       // the member passed in is untouched
    expect(one.talents).toEqual({ 'noel-t00': 1 });
    expect(talentPointsLeft(one)).toBe(0);
    expect(canRaiseTalent(one, 'noel-t01')).toBe('points');
    // No point left: a node that is shut anyway says why it is shut, not that the points ran out.
    expect(canRaiseTalent(one, 'noel-t13')).toBe('adjacent');
    expect(canRaiseTalent(one, 'noel-k0')).toBe('gate');
    const lv8 = { ...one, level: 8 };                      // one point left
    expect(canRaiseTalent(lv8, 'noel-t13')).toBe('adjacent');
    expect(canRaiseTalent(lv8, 'noel-t11')).toBeNull();    // diagonal
    expect(upT(lv8, 'noel-t10').talents).toEqual({ 'noel-t00': 1, 'noel-t10': 1 });
  });

  it('a normal node stops at 5', () => {
    const m = upT(tal('noel', 50), 'noel-t00', 5);
    expect(canRaiseTalent(m, 'noel-t00')).toBe('max');
    expect(talentPointsLeft(m)).toBe(talentPoints(50) - 5);
  });

  it('keystones need 12 board points and nothing else', () => {
    const eleven = upT(upT(upT(tal('noel', 50), 'noel-t00', 5), 'noel-t01', 5), 'noel-t02', 1);
    expect(canRaiseTalent(eleven, 'noel-k0')).toBe('gate');
    expect(upT(upT(eleven, 'noel-t02'), 'noel-k0').talents['noel-k0']).toBe(1);
    // All 12 on rows 0-1 and nothing near row 5: keystones ignore adjacency.
    const rows01 = upT(upT(upT(tal('noel', 50), 'noel-t00', 5), 'noel-t01', 5), 'noel-t10', 2);
    expect(BOARDS.noel.filter((n) => n.row === 5).every((n) => !rows01.talents[n.id])).toBe(true);
    expect(canRaiseTalent(rows01, 'noel-k0')).toBeNull();
    expect(keystonesOf(upT(rows01, 'noel-k0'))).toEqual(['weak-tp']);
  });

  it("at most 2 keystones, and only the character's own", () => {
    const base = upT(upT(upT(tal('noel', 50), 'noel-t00', 5), 'noel-t01', 5), 'noel-t02', 2);
    const two = upT(upT(base, 'noel-k0'), 'noel-k1');
    expect(keystonesOf(two)).toEqual(['weak-tp', 'opening-gauge']);
    expect(canRaiseTalent(two, 'noel-k2')).toBe('keystones');
    expect(canRaiseTalent({ ...two, level: 26 }, 'noel-k2')).toBe('keystones');   // 14 spent of 11 earned: still the cap first
    expect(canRaiseTalent(two, 'noel-k0')).toBe('max');
    expect(canRaiseTalent(base, 'chizuru-k0')).toBe('unknown');
    expect(canRaiseTalent(base, 'chizuru-t00')).toBe('unknown');
    expect(canRaiseTalent(base, 'nope')).toBe('unknown');
  });

  it('a hostile talent record never throws and junk ranks count as 0', () => {
    const junk = tal('noel', 8, { 'noel-t00': 'x' as unknown as number, 'noel-t01': -2, 'noel-t02': 1.5, 'chizuru-t00': 5 } as Record<string, number>);
    expect(talentPointsLeft(junk)).toBe(2);
    expect(talentStats(junk)).toEqual({});
    expect(keystonesOf(junk)).toEqual([]);
    expect(canRaiseTalent(junk, 'noel-t10')).toBe('adjacent');
    for (const t of [null, undefined, 3, 'x', []] as unknown[]) {
      const m = { ...tal('noel', 8), talents: t as Record<string, number> };
      expect(() => [talentPointsLeft(m), talentStats(m), keystonesOf(m), canRaiseTalent(m, 'noel-t00')]).not.toThrow();
      expect(talentPointsLeft(m)).toBe(2);
      expect(canRaiseTalent(m, 'noel-t00')).toBeNull();
    }
  });

  it('talentStats multiplies per-rank values', () => {
    const m = upT(tal('noel', 12), 'noel-t00', 3);   // Lv12: 4 points
    expect(BOARDS.noel.find((n) => n.id === 'noel-t00')!.stat).toBe('int');
    expect(talentStats(m)).toEqual({ int: 3 * per('int') });
    expect(talentStats(upT(m, 'noel-t01'))).toEqual({ int: 3 * per('int'), mag: per('mag') });
    expect(talentStats(tal('noel', 10))).toEqual({});
  });

  it('defaultTalents spends every point legally with at most the 2 default keystones', () => {
    for (const id of ids) for (const level of [4, 5, 6, 20, 30, 38, 50]) {
      const t = defaultTalents(id, level);
      const label = `${id} Lv${level}`;
      expect(Object.values(t).reduce((s, r) => s + r, 0), label).toBe(talentPoints(level));
      const held = BOARDS[id].filter((n) => n.keystone && t[n.id]).map((n) => n.keystone!);
      expect(held.length, label).toBeLessThanOrEqual(2);
      for (const k of held) expect(DEFAULT_KEYSTONES[id], label).toContain(k);
      // Replayed from nothing, one rank at a time: normal nodes by (row, col), keystones last.
      const order = [...BOARDS[id].filter((n) => !n.keystone).sort((a, b) => a.row - b.row || a.col - b.col), ...BOARDS[id].filter((n) => n.keystone)];
      let m = tal(id, level);
      for (const n of order) if (t[n.id]) m = upT(m, n.id, t[n.id]);
      expect(m.talents, label).toEqual(t);
      expect(talentPointsLeft(m), label).toBe(0);
    }
    expect(keystonesOf(tal('noel', 50, defaultTalents('noel', 50)))).toEqual(DEFAULT_KEYSTONES.noel);
  });
});

describe('validBuild', () => {
  const b0 = (id: CharacterId, i: number) => TREES[id].branches[i].nodes[0].id;
  it('accepts every default build', () => {
    for (const id of ids) for (const level of [1, 10, 30, 50]) {
      expect(validBuild(id, level, defaultTree(id, level), defaultTalents(id, level)), `${id} Lv${level}`).toBe(true);
    }
  });
  it('accepts the fresh build and a partly spent one, in any key order', () => {
    expect(validBuild('liz', 1, newTree('liz'), {})).toBe(true);
    const tree = { [b0('liz', 2)]: 1, [freeNode('liz')]: 2 };
    expect(validBuild('liz', 4, tree, { 'liz-t00': 1 })).toBe(false); // Lv4 has no talent points
    expect(validBuild('liz', 6, tree, { 'liz-t00': 1 })).toBe(true);
    expect(validBuild('liz', 6, tree, {})).toBe(true);
  });
  it('accepts a build whatever the key order, deepest nodes and keystones first', () => {
    const rev = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).reverse());
    for (const id of ids) {
      expect(validBuild(id, 50, rev(defaultTree(id, 50)), rev(defaultTalents(id, 50))), id).toBe(true);
    }
  });
  it('accepts random legal builds with their keys shuffled', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rnd = mulberry32(seed);
      const id = ids[seed % ids.length];
      let m = at(id, 1 + Math.floor(rnd() * 50));
      const nodes = TREES[id].branches.flatMap((b) => b.nodes.map((n) => n.id));
      const talents = BOARDS[id].map((n) => n.id);
      for (let i = 0; i < 400; i++) {
        const t = rnd() < 0.5;
        const pool = t ? talents : nodes;
        const node = pool[Math.floor(rnd() * pool.length)];
        const r = t ? raiseTalent(m, node) : raiseNode(m, node);
        if (r.ok) m = r.member;
      }
      const shuffle = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(() => rnd() - 0.5));
      expect(validBuild(id, m.level, shuffle(m.tree), shuffle(m.talents)), `seed ${seed}`).toBe(true);
    }
  });
  it('rejects shapes that are not a build', () => {
    const t = newTree('liz');
    for (const bad of [undefined, null, 5, 'x', [], [1]]) {
      expect(validBuild('liz', 50, bad, {})).toBe(false);
      expect(validBuild('liz', 50, t, bad)).toBe(false);
    }
    expect(validBuild('liz', 50, { ...t, nope: 1 }, {})).toBe(false);
    expect(validBuild('liz', 50, JSON.parse('{"__proto__":1}'), {})).toBe(false);
    expect(validBuild('liz', 50, { ...t, [b0('noel', 0)]: 1 }, {})).toBe(false); // another character's node
    for (const r of [0, -1, 1.5, NaN, Infinity, '1', null, 4]) expect(validBuild('liz', 50, { [freeNode('liz')]: r }, {}), String(r)).toBe(false);
    expect(validBuild('liz', 50, {}, {})).toBe(false); // free node missing
    expect(validBuild('liz', 50, { [b0('liz', 1)]: 1 }, {})).toBe(false);
    expect(validBuild('liz', 50, t, { 'liz-t00': 6 })).toBe(false);
    expect(validBuild('liz', 50, t, { 'liz-t00': 0 })).toBe(false);
    expect(validBuild('liz', 50, t, JSON.parse('{"__proto__":1}'))).toBe(false);
    for (const level of [1.5, NaN, Infinity, '10' as unknown as number]) expect(validBuild('liz', level, t, {})).toBe(false);
  });
  it('rejects builds the rules would not allow', () => {
    expect(validBuild('liz', 2, { [freeNode('liz')]: 1, [b0('liz', 1)]: 1, [b0('liz', 2)]: 1 }, {})).toBe(false); // overspent
    expect(validBuild('liz', 50, defaultTree('liz', 50), { 'liz-t30': 1 })).toBe(false); // not adjacent
    expect(validBuild('liz', 50, newTree('liz'), { 'liz-t00': 1, 'liz-t01': 1, 'liz-t02': 1 })).toBe(true);
    expect(validBuild('liz', 50, newTree('liz'), { 'liz-k0': 1 })).toBe(false); // keystone gate
  });
});

describe("the hero's abyss capstones", () => {
  const ALL = { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5,
    'hero-guard': 5, 'hero-guard-up': 5, 'hero-aegis': 5, 'hero-rally': 5 };
  const hero = (tree: Record<string, number>): Member => ({ ...newMember('hero'), level: 50, tree });
  const up2 = (m: Member, node: string): Member => {
    const r = raiseNode(m, node, 10);
    if (!r.ok) throw new Error(`${node} refused: ${r.reason}`);
    return r.member;
  };
  it('an abyss node waits for its memories', () => {
    const m = hero({ 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5 });
    expect(canRaiseNode(m, 'abyss-sword', ABYSS_UNLOCK[0] - 1)).toBe('abyss');
    expect(canRaiseNode(m, 'abyss-sword', ABYSS_UNLOCK[0])).toBeNull();
    expect(canRaiseNode(m, 'abyss-sword')).toBe('abyss');
    expect(raiseNode(m, 'abyss-sword')).toEqual({ ok: false, reason: 'abyss' });
    expect(raiseNode(m, 'abyss-sword', ABYSS_UNLOCK[0]).ok).toBe(true);
  });
  it('memoriesOf clamps a hostile count', () => {
    for (const id of ['hero', 'rin'] as const) {
      for (const bad of [NaN, Infinity, -Infinity, -3, undefined]) expect(memoriesOf({ id, memories: bad }), `${id} ${String(bad)}`).toBe(0);
      expect(memoriesOf({ id, memories: 2.7 })).toBe(2);
      expect(memoriesOf({ id, memories: 99 })).toBe(chainLength(id));
    }
  });
  it("the hero's own memories open his abyss node", () => {
    const tree = { 'hero-slash': 5, 'hero-sword-up': 5, 'hero-cleave': 5, 'hero-sunder': 5 };
    const m = hero(tree);
    expect(canRaiseNode({ ...m, memories: ABYSS_UNLOCK[0] }, 'abyss-sword')).toBeNull();
    expect(canRaiseNode({ ...m, memories: ABYSS_UNLOCK[0] - 1 }, 'abyss-sword')).toBe('abyss');
    expect(canRaiseNode({ ...m, memories: NaN }, 'abyss-sword')).toBe('abyss');
    expect(raiseNode({ ...m, memories: ABYSS_UNLOCK[0] }, 'abyss-sword').ok).toBe(true);
  });
  it("every branch's capstone opens at its own memory count, and not one short of it", () => {
    expect(ABYSS_UNLOCK).toEqual([2, 4, 6, 8, 10]);   // the spec's table: sword, guard, star, light, chain
    TREES.hero.branches.forEach((b, i) => {
      const cap = b.nodes[4].id;
      const tree = Object.fromEntries(b.nodes.slice(0, 4).map((n) => [n.id, n.maxRank]));
      const m = hero(tree);
      expect(canRaiseNode(m, cap, ABYSS_UNLOCK[i] - 1), `${cap} one short`).toBe('abyss');
      expect(canRaiseNode(m, cap, ABYSS_UNLOCK[i]), `${cap} at the count`).toBeNull();
    });
  });
  it('the hero holds two ultimates, not three', () => {
    let m = hero(ALL);
    m = up2(m, 'abyss-sword');
    m = up2(m, 'abyss-guard');
    m = { ...m, tree: { ...m.tree, 'hero-flare': 5, 'hero-star-up': 5, 'hero-frost': 5, 'hero-spark': 5 } };
    expect(canRaiseNode(m, 'abyss-star', 10)).toBe('capstone');
  });
  it('a companion still holds one', () => {
    expect(rulesOf('noel').capstones).toBe(1);
  });
});

describe('hero builds', () => {
  const heroBranch = (node: string) => NODES[node].branch;
  /** Points per branch, not counting the free first rank. */
  const perBranch = (tree: Record<string, number>) => {
    const out = [0, 0, 0, 0, 0];
    for (const [k, r] of Object.entries(tree)) out[heroBranch(k)] += r - (k === freeNode('hero') ? 1 : 0);
    return out;
  };
  const builds = Object.keys(HERO_BUILDS) as HeroBuild[];
  it('defaults are the balanced build', () => {
    expect(defaultTree('hero', 30)).toEqual(heroTree(30, 'balanced', 0));
    expect(defaultTalents('hero', 30)).toEqual(heroTalents(30, 'balanced'));
  });
  it('balanced spreads over guard, star and sword, not light or chain (plan 6a Task 19c)', () => {
    const [a, b, c, d, e] = perBranch(heroTree(20));
    expect(Math.max(a, b, c) - Math.min(a, b, c)).toBeLessThanOrEqual(1);
    expect(d).toBe(0);
    expect(e).toBe(0);
  });
  it('a pure build stays in its branch until it is full', () => {
    // The tank (guard only) is the pure single-branch build since Task 20 gave the mage a share of light.
    const cap1 = TREES.hero.branches[1].nodes.slice(0, 4).reduce((s, n) => s + n.maxRank, 0);
    let L = 1;
    while (skillPoints(L + 1, 'hero') <= cap1) L++;
    const at1 = perBranch(heroTree(L, 'tank'));
    expect(at1.filter((_, i) => i !== 1).every((n) => n === 0)).toBe(true);
    expect(at1[1]).toBe(skillPoints(L, 'hero'));
    const over = perBranch(heroTree(L + 1, 'tank'));
    expect(over[1]).toBe(cap1);
    expect(over[0]).toBe(skillPoints(L + 1, 'hero') - cap1);
  });
  it('the mage is star first: two points of star for every point of light, nothing else (plan 6a Task 20)', () => {
    for (const level of [6, 10, 14, 20]) {
      const [a, b, c, d, e] = perBranch(heroTree(level, 'mage'));
      expect(a + b + e, `Lv${level}`).toBe(0);
      expect(d, `Lv${level}`).toBeGreaterThan(0);
      expect(c, `Lv${level} star`).toBeGreaterThanOrEqual(2 * d - 1);
      expect(c, `Lv${level} star`).toBeLessThanOrEqual(2 * d + 1);   // two to one, not just "at least"
    }
  });
  it('no capstone without memories; a build takes its own with them', () => {
    const caps = (t: Record<string, number>) => Object.keys(t).filter((k) => k.startsWith('abyss-'));
    expect(caps(heroTree(50, 'balanced', 0))).toEqual([]);
    expect(caps(defaultTree('hero', 50))).toEqual([]);   // the default build waits for memories too
    const held = caps(heroTree(50, 'balanced', 10));
    expect(held).toHaveLength(2);
    for (const k of held) expect(HERO_BUILDS.balanced.branches).toContain(heroBranch(k));
  });
  it('every build is a legal build', () => {
    for (const b of builds) for (const L of [1, 10, 30, 50]) {
      for (const memories of [0, 2, 6, 8, 10]) {
        expect(validBuild('hero', L, heroTree(L, b, memories), heroTalents(L, b), memories), `${b} Lv${L} m${memories}`).toBe(true);
      }
    }
  });
  it('the balanced build is not a regen tank; the tank build keeps the tank set', () => {
    const held = (b: HeroBuild) => BOARDS.hero.filter((n) => n.keystone && heroTalents(50, b)[n.id]).map((n) => n.keystone!);
    expect(new Set(held('balanced'))).toEqual(new Set(HERO_BUILDS.balanced.keystones));
    expect(held('balanced')).not.toContain('regen');
    expect(held('balanced')).not.toContain('taunt-guard');
    expect(new Set(held('tank'))).toEqual(new Set(DEFAULT_KEYSTONES.hero));
    for (const b of ['sword', 'mage', 'healer'] as const) expect(new Set(held(b)), b).toEqual(new Set(DEFAULT_KEYSTONES.hero));
  });
  it('balanced talents lean on HP and STR (plan 6a Task 19c)', () => {
    const t = heroTalents(30, 'balanced');
    let all = 0;
    let lean = 0;
    for (const n of BOARDS.hero) {
      if (n.keystone) continue;
      const r = t[n.id] ?? 0;
      all += r;
      if (n.stat === 'hp' || n.stat === 'str') lean += r;
    }
    expect(lean * 2).toBeGreaterThanOrEqual(all);
  });
  it('a mage leans on INT and MAG', () => {
    const share = (build: HeroBuild) => {
      const t = heroTalents(30, build);
      let all = 0;
      let magic = 0;
      for (const n of BOARDS.hero) {
        if (n.keystone) continue;
        all += t[n.id] ?? 0;
        if (n.stat === 'int' || n.stat === 'mag') magic += t[n.id] ?? 0;
      }
      return magic / all;
    };
    expect(share('mage')).toBeGreaterThanOrEqual(0.5);
    expect(share('mage')).toBeGreaterThan(share('balanced'));
  });
  it('a build with nodes fills them first, in order, then follows its branches (plan 6a Task 20)', () => {
    const saved = HERO_BUILDS.mage;
    try {
      HERO_BUILDS.mage = { ...saved, nodes: ['hero-frost', 'hero-flare'] };
      const t = heroTree(12, 'mage');
      const plain = { ...saved };
      delete plain.nodes;
      HERO_BUILDS.mage = plain;
      const without = heroTree(12, 'mage');
      // hero-frost needs hero-flare (tier 0) first: the listed order is tried point by point, the first open node wins.
      expect(t['hero-frost']).toBe(5);
      expect(t['hero-flare']).toBeGreaterThanOrEqual(1);
      expect(without['hero-frost']).toBeLessThan(5);
      expect(Object.values(t).reduce((s, n) => s + n, 0)).toBe(Object.values(without).reduce((s, n) => s + n, 0));
      HERO_BUILDS.mage = { ...saved, nodes: ['hero-frost', 'hero-flare'] };
      for (const L of [1, 10, 30, 50]) expect(validBuild('hero', L, heroTree(L, 'mage'), heroTalents(L, 'mage'), 0), `Lv${L}`).toBe(true);
    } finally {
      HERO_BUILDS.mage = saved;
    }
  });
});

describe('memory keystones', () => {
  /** Noel with 12 board points and both board keystones: the most a companion may hold. */
  const full = (id: 'noel' | 'selene' = 'noel'): Member => {
    const base = upT(upT(upT(tal(id, 50), `${id}-t00`, 5), `${id}-t01`, 5), `${id}-t02`, 2);
    return upT(upT(base, `${id}-k0`), `${id}-k1`);
  };
  it('a companion awakens her memory keystone with every piece', () => {
    const selene = tal('selene', 50);
    expect(keystonesOf({ ...selene, memories: chainLength('selene') - 1 })).not.toContain(MEMORY_KEYSTONES.selene);
    expect(keystonesOf({ ...selene, memories: chainLength('selene') })).toEqual([MEMORY_KEYSTONES.selene]);
    expect(MEMORY_KEYSTONES.selene).toBe('moon-promise');
    // Each companion wakes her own and no other.
    for (const id of ids.filter((c) => c !== 'rin')) {
      expect(keystonesOf({ ...tal(id, 50), memories: chainLength(id) }), id).toContain(MEMORY_KEYSTONES[id]);
      expect(keystonesOf(tal(id, 50)), id).not.toContain(MEMORY_KEYSTONES[id]);
    }
    // A junk count never wakes one.
    expect(keystonesOf({ ...selene, memories: NaN })).toEqual([]);
  });

  it('memory keystones never count against the cap', () => {
    const m = full();
    const awake = { ...m, memories: chainLength('noel') };
    expect(keystonesOf(m)).toHaveLength(2);
    expect(keystonesOf(awake)).toEqual([...keystonesOf(m), MEMORY_KEYSTONES.noel]);
    expect(keystonesOf(awake)).toHaveLength(3);
    expect(canRaiseTalent(awake, 'noel-k2')).toBe('keystones');
    expect(talentPointsLeft(awake)).toBe(talentPointsLeft(m));
    // The raise path ignores them too: a first board keystone is still allowed with the memory keystone awake.
    const one = upT(upT(upT(upT(tal('noel', 50), 'noel-t00', 5), 'noel-t01', 5), 'noel-t02', 2), 'noel-k0');
    expect(canRaiseTalent({ ...one, memories: chainLength('noel') }, 'noel-k1')).toBeNull();
  });

  it("Rin's keystone waits for her oath, not her seventh piece", () => {
    const rin = tal('rin', 50);
    expect(MEMORY_KEYSTONES.rin).toBe('unrung-bell');
    expect(keystonesOf({ ...rin, memories: chainLength('rin') })).toEqual([]);
    expect(keystonesOf({ ...rin, memories: chainLength('rin'), oath: true })).toEqual([MEMORY_KEYSTONES.rin]);
    expect(keystonesOf({ ...rin, memories: chainLength('rin') - 1, oath: true })).toEqual([MEMORY_KEYSTONES.rin]);
    expect(keystonesOf(rin)).toEqual([]);
  });

  it('the hero has no memory keystone', () => {
    const hero = { ...tal('hero', 50), memories: 10, oath: true as const };
    expect(keystonesOf(hero).filter((k) => (Object.values(MEMORY_KEYSTONES) as string[]).includes(k))).toEqual([]);
    expect(keystonesOf({ ...hero, memories: chainLength('hero') })).toEqual(keystonesOf(tal('hero', 50)));
  });
});
