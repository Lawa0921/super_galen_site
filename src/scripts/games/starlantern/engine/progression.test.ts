import { describe, it, expect } from 'vitest';
import {
  canRaiseNode, defaultTree, freeNode, learnedSkills, legacyDue, newTree, nodeRank, raiseNode, skillPoints, skillPointsLeft, talentPoints,
  treeSkills,
} from './progression';
import { newMember } from './party';
import { DEFAULT_CAPSTONE, LEGACY_LEARN_LEVEL, NODES, TIER_GATE, TREES } from '../data/trees';
import type { CharacterId, Member } from './types';

const ids = Object.keys(TREES) as CharacterId[];
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
    expect([1, 2, 4, 5, 6, 7, 50].map(skillPoints)).toEqual([0, 1, 3, 4, 4, 5, 26]);
    expect([5, 6, 7, 8, 50].map(talentPoints)).toEqual([0, 1, 1, 2, 23]);
    for (let L = 1; L <= 50; L++) expect(skillPoints(L) + talentPoints(L), `Lv${L}`).toBe(L - 1);
  });

  it('no tree fills by Lv50', () => {
    expect(Object.fromEntries(ids.map((id) => [id, capacity(id)]))).toEqual({
      noel: 36, chizuru: 36, liz: 32, sylvie: 36, scarlet: 34, selene: 30, safira: 36, bobby: 34,
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
