import { describe, it, expect } from 'vitest';
import { ACTIVE_RANK_PCT, DEFAULT_CAPSTONE, LEGACY_LEARN_LEVEL, NODES, TREES, nodeDesc, nodeName } from './trees';
import { CHARACTERS, rulesOf } from './characters';
import { SKILLS } from './skills';
import { POWERS } from './gear';
import { defaultTree, freeNode, newTree, nodeRank, raiseNode } from '../engine/progression';
import type { CharacterId, Member } from '../engine/types';

const ids = Object.keys(TREES) as CharacterId[];
const allNodes = () => ids.flatMap((id) => TREES[id]!.branches.flatMap((b) => b.nodes));

describe('skill trees', () => {
  it('every character has a tree', () => {
    expect([...ids].sort()).toEqual(Object.keys(CHARACTERS).sort());
  });

  it("every skill in SKILLS is an active node of exactly one tree, its owner's", () => {
    for (const s of Object.values(SKILLS)) {
      const owners = ids.filter((id) => TREES[id]!.branches.some((b) => b.nodes.some((n) => n.kind === 'active' && n.id === s.id)));
      expect(owners, s.id).toEqual([s.owner]);
    }
  });

  it('DEFAULT_CAPSTONE names a branch for every character; scarlet takes the flame and rin the backstab', () => {
    for (const id of ids) expect(DEFAULT_CAPSTONE[id], id).toBeLessThan(rulesOf(id).branches);
    expect(DEFAULT_CAPSTONE.scarlet).toBe(1);
    expect(TREES.scarlet.branches[1].nodes[4].id).toBe('crimson-end');
    expect(DEFAULT_CAPSTONE.rin).toBe(1);
    for (const id of ids.filter((x) => x !== 'scarlet' && x !== 'rin')) expect(DEFAULT_CAPSTONE[id], id).toBe(0);
  });

  it('mod nodes that lower hpCost do so rank by rank', () => {
    const hp = allNodes().filter((n) => n.mods?.some((m) => m.hpCost !== undefined));
    expect(hp.map((n) => n.id)).toEqual(['scarlet-ring-up']);
    expect(hp[0].mods!.map((m) => m.hpCost)).toEqual([0.08, 0.06, 0.04]);
  });

  it('the default build learns every legacy skill by its old level', () => {
    // The point model and the build order live in engine/progression; this checks the data fits them.
    for (const [skill, old] of Object.entries(LEGACY_LEARN_LEVEL)) {
      const owner = NODES[skill].owner;
      expect(defaultTree(owner, old)[skill] ?? 0, `${owner}:${skill} at level ${old}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("each tree has its rules' branch count of 5 nodes each and node ids are unique across trees", () => {
    for (const id of ids) {
      expect(TREES[id]!.branches, id).toHaveLength(rulesOf(id).branches);
      for (const b of TREES[id]!.branches) expect(b.nodes, `${id}:${b.name}`).toHaveLength(5);
    }
    const all = allNodes().map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(NODES).sort()).toEqual([...all].sort());
  });

  it("an active node's id is its skill id, so a skill id finds its node (statusTabs and nodeRank rely on it)", () => {
    for (const n of allNodes().filter((x) => x.kind === 'active')) {
      expect(n.id, n.skill).toBe(n.skill);
      expect(NODES[n.skill].node, n.skill).toBe(n);
    }
  });

  it('active nodes are skills of their owner; mod nodes name an active node of the same tree', () => {
    for (const id of ids) {
      const nodes = TREES[id]!.branches.flatMap((b) => b.nodes);
      const actives = new Set(nodes.filter((n) => n.kind === 'active').map((n) => n.id));
      for (const n of nodes) {
        if (n.kind === 'active') {
          expect(n.id).toBe(n.skill);
          expect(SKILLS[n.skill], n.id).toBeDefined();
          expect(SKILLS[n.skill].owner).toBe(id);
          expect(n.name ?? n.desc ?? n.mods).toBeUndefined();
        } else {
          expect(actives.has(n.skill), `${n.id} -> ${n.skill}`).toBe(true);
          expect(n.name, n.id).toBeTruthy();
          expect(n.desc, n.id).toBeTruthy();
        }
      }
    }
  });

  it('mod nodes carry one mod per rank and powerPct and buffPct rise with rank', () => {
    for (const n of allNodes().filter((x) => x.kind === 'mod')) {
      expect(n.mods, n.id).toHaveLength(n.maxRank);
      for (const key of ['powerPct', 'buffPct'] as const) {
        const pcts = n.mods!.map((m) => m[key]).filter((p) => p !== undefined) as number[];
        if (!pcts.length) continue;
        expect(pcts, `${n.id} ${key}`).toHaveLength(n.maxRank);
        for (let i = 1; i < pcts.length; i++) expect(pcts[i], `${n.id} ${key}`).toBeGreaterThan(pcts[i - 1]);
      }
      const tp = n.mods!.map((m) => m.tpDelta).filter((p) => p !== undefined) as number[];
      for (let i = 1; i < tp.length; i++) expect(tp[i], n.id).toBeLessThan(tp[i - 1]);
    }
  });

  it('a mod node deepens a buff or debuff only when its text says so', () => {
    for (const n of allNodes().filter((x) => x.kind === 'mod')) {
      const says = /削弱|提升幅度/.test(n.desc!);
      expect(n.mods!.some((m) => m.buffPct !== undefined), n.id).toBe(says);
      if (says) expect(SKILLS[n.skill].effects.some((e) => e.kind === 'buff'), n.id).toBe(true);
    }
  });

  it('the frost-bind and snare-shot upgrades deepen the debuff along with the power, and say so', () => {
    for (const id of ['noel-bind-up', 'sylvie-snare-up']) {
      const n = NODES[id].node;
      expect(n.desc, id).toMatch(/削弱/);
      expect(n.mods!.map((m) => m.buffPct), id).toEqual(n.mods!.map((m) => m.powerPct));
    }
  });

  it('every power mod node (powerPct or powerDelta) names a skill that deals damage, heals or sets a turret', () => {
    const power = allNodes().filter((n) => n.kind === 'mod' && n.mods!.some((m) => m.powerPct !== undefined || m.powerDelta !== undefined));
    expect(power.map((n) => n.id)).toContain('twin-turret');
    for (const n of power) {
      expect(SKILLS[n.skill].effects.some((e) => e.kind === 'damage' || e.kind === 'heal' || e.kind === 'turret'), n.id).toBe(true);
    }
  });

  it('a skill whose HP cost a mod node lowers does not state a fixed HP percent', () => {
    const lowered = [...new Set(allNodes().filter((n) => n.mods?.some((m) => m.hpCost !== undefined)).map((n) => n.skill))];
    expect(lowered).toEqual(['blaze-ring']);
    for (const s of lowered) expect(SKILLS[s].desc, s).not.toMatch(/\d+\s*%/);
  });

  it("a power with absolute turns names each tree node whose turn bonus it overrides (lg-bobby and twin-turret)", () => {
    let checked = 0;
    for (const p of Object.values(POWERS).filter((x) => x.mod.turns !== undefined)) {
      expect(p.text, p.id).toContain(String(p.mod.turns));
      for (const n of allNodes().filter((x) => x.skill === p.skill && x.mods?.some((m) => m.turnsDelta !== undefined))) {
        expect(p.text, `${p.id} vs ${n.id}`).toContain(n.name!);
        checked++;
      }
    }
    expect(checked).toBe(1);
  });

  it('an active above rank 1 has an effect its rank scales (damage, heal or turret by powerPct; a pure buff by buffPct)', () => {
    for (const n of allNodes().filter((x) => x.kind === 'active' && x.maxRank > 1)) {
      const kinds = SKILLS[n.skill].effects.map((e) => e.kind);
      expect(kinds.some((k) => ['damage', 'heal', 'buff', 'turret'].includes(k)), n.id).toBe(true);
    }
  });

  it('branch 0 tier 0 is a non-passive skill (the free one) and every tier-4 node has maxRank 1', () => {
    for (const id of ids) {
      const t = TREES[id]!;
      const free = t.branches[0].nodes[0];
      expect(free.kind).toBe('active');
      expect(SKILLS[free.skill].passive).toBeUndefined();
      for (const b of t.branches) expect(b.nodes[4].maxRank).toBe(1);
    }
  });

  it('every tier is reachable', () => {
    // Climb each branch alone at Lv50, tier by tier to max rank, with the engine's own rules.
    for (const id of ids) {
      TREES[id]!.branches.forEach((b) => {
        // A bare member: the hero has no talent board (and so no newMember) until he joins the roster.
        let m: Member = { id, level: 50, exp: 0, hp: 0, tp: 0, equip: {}, tree: newTree(id), talents: {} };
        for (const n of b.nodes) {
          while (nodeRank(m, n.id) < n.maxRank) {
            const r = raiseNode(m, n.id);
            if (!r.ok) throw new Error(`${id}:${b.name} ${n.id} refused: ${r.reason}`);
            m = r.member;
          }
        }
      });
    }
  });

  it('indexes nodes by owner, branch and tier', () => {
    expect(NODES['flame-wave']).toMatchObject({ owner: 'noel', branch: 0, tier: 2 });
    expect(NODES['triple-slash']).toMatchObject({ owner: 'liz', branch: 0, tier: 1 });
    expect(nodeName('sweep')).toBe(SKILLS.sweep.name);
    expect(nodeName('noel-fire-up')).toBe('火星強化');
    expect(nodeDesc('noel-fire-up')).toBeTruthy();
    expect(nodeDesc('sweep')).toBe(SKILLS.sweep.desc);
  });

  it("every legacy skill is an active node in its owner's tree; level 1 ones are the free node", () => {
    for (const [skill, old] of Object.entries(LEGACY_LEARN_LEVEL)) {
      const owner = SKILLS[skill].owner;
      const actives = new Set(TREES[owner]!.branches.flatMap((b) => b.nodes).filter((n) => n.kind === 'active').map((n) => n.id));
      expect(actives.has(skill), `${owner}:${skill}`).toBe(true);
      if (old === 1) expect(freeNode(owner), skill).toBe(skill);
    }
    expect(Object.keys(LEGACY_LEARN_LEVEL)).toHaveLength(27);
  });

  it('ACTIVE_RANK_PCT has five ranks, starts at 100 and rises', () => {
    expect(ACTIVE_RANK_PCT).toEqual([100, 110, 120, 130, 140]);
  });

  it("every legendary power names an active node of its owner's tree", () => {
    for (const p of Object.values(POWERS)) {
      const owner = SKILLS[p.skill]?.owner as CharacterId;
      expect(owner, p.id).toBeDefined();
      expect(NODES[p.skill]?.node.kind, p.id).toBe('active');
      expect(NODES[p.skill].owner, p.id).toBe(owner);
    }
    expect(NODES.turret.owner).toBe('bobby');
    expect(NODES['iron-wall'].owner).toBe('scarlet');
  });
});
