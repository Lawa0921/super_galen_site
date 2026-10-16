import { describe, it, expect } from 'vitest';
import { ACTIVE_RANK_PCT, DEFAULT_CAPSTONE, LEGACY_LEARN_LEVEL, NODES, TREES, nodeDesc, nodeName } from './trees';
import { CHARACTERS } from './characters';
import { SKILLS } from './skills';
import { POWERS } from './gear';
import { defaultTree, nodeRank, raiseNode } from '../engine/progression';
import { newMember } from '../engine/party';
import type { CharacterId, Member } from '../engine/types';

const ids = Object.keys(TREES) as CharacterId[];
const allNodes = () => ids.flatMap((id) => TREES[id]!.branches.flatMap((b) => b.nodes));

describe('skill trees', () => {
  it('every character has a tree', () => {
    expect([...ids].sort()).toEqual(Object.keys(CHARACTERS).sort());
    expect(ids).toHaveLength(8);
  });

  it("every skill in SKILLS is an active node of exactly one tree, its owner's", () => {
    for (const s of Object.values(SKILLS)) {
      const owners = ids.filter((id) => TREES[id]!.branches.some((b) => b.nodes.some((n) => n.kind === 'active' && n.id === s.id)));
      expect(owners, s.id).toEqual([s.owner]);
    }
  });

  it('DEFAULT_CAPSTONE names a branch for every character; scarlet takes the flame', () => {
    for (const id of ids) expect([0, 1, 2], id).toContain(DEFAULT_CAPSTONE[id]);
    expect(DEFAULT_CAPSTONE.scarlet).toBe(1);
    expect(TREES.scarlet.branches[1].nodes[4].id).toBe('crimson-end');
    for (const id of ids.filter((x) => x !== 'scarlet')) expect(DEFAULT_CAPSTONE[id], id).toBe(0);
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

  it('each tree has 3 branches of 5 nodes and node ids are unique across trees', () => {
    for (const id of ids) {
      expect(TREES[id]!.branches, id).toHaveLength(3);
      for (const b of TREES[id]!.branches) expect(b.nodes, `${id}:${b.name}`).toHaveLength(5);
    }
    const all = allNodes().map((n) => n.id);
    expect(new Set(all).size).toBe(all.length);
    expect(Object.keys(NODES).sort()).toEqual([...all].sort());
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

  it('mod nodes carry one mod per rank and powerPct rises with rank', () => {
    for (const n of allNodes().filter((x) => x.kind === 'mod')) {
      expect(n.mods, n.id).toHaveLength(n.maxRank);
      const pcts = n.mods!.map((m) => m.powerPct).filter((p) => p !== undefined) as number[];
      if (pcts.length) {
        expect(pcts, n.id).toHaveLength(n.maxRank);
        for (let i = 1; i < pcts.length; i++) expect(pcts[i], n.id).toBeGreaterThan(pcts[i - 1]);
      }
      const tp = n.mods!.map((m) => m.tpDelta).filter((p) => p !== undefined) as number[];
      for (let i = 1; i < tp.length; i++) expect(tp[i], n.id).toBeLessThan(tp[i - 1]);
    }
  });

  it('an active above rank 1 has an effect that powerPct scales (damage, heal, buff, turret)', () => {
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
        let m: Member = { ...newMember(id), level: 50 };
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

  it('the old kit is in the tree at its old level', () => {
    let count = 0;
    for (const id of ids) {
      const actives = new Set(TREES[id]!.branches.flatMap((b) => b.nodes).filter((n) => n.kind === 'active').map((n) => n.id));
      for (const s of CHARACTERS[id].skills) {
        expect(actives.has(s), `${id}:${s}`).toBe(true);
        expect(LEGACY_LEARN_LEVEL[s], s).toBe(SKILLS[s].learnLevel);
        count++;
      }
    }
    expect(count).toBe(27);
    expect(Object.keys(LEGACY_LEARN_LEVEL)).toHaveLength(27);
  });

  it('ACTIVE_RANK_PCT[0] is 100', () => {
    expect(ACTIVE_RANK_PCT).toEqual([100, 110, 120]);
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
