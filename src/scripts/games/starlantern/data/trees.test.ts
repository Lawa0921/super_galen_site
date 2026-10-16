import { describe, it, expect } from 'vitest';
import { ACTIVE_RANK_PCT, LEGACY_LEARN_LEVEL, NODES, TIER_GATE, TREES, nodeDesc, nodeName } from './trees';
import { CHARACTERS } from './characters';
import { SKILLS } from './skills';
import { POWERS } from './gear';
import type { CharacterId } from '../engine/types';

const ids = Object.keys(TREES) as CharacterId[];
const allNodes = () => ids.flatMap((id) => TREES[id]!.branches.flatMap((b) => b.nodes));

describe('skill trees', () => {
  it('covers the first four characters', () => {
    expect(ids.sort()).toEqual(['chizuru', 'liz', 'noel', 'sylvie']);
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
    for (const id of ids) {
      TREES[id]!.branches.forEach((b, bi) => {
        for (let t = 0; t < 5; t++) {
          const below = b.nodes.slice(0, t).reduce((s, n) => s + n.maxRank, 0) - (bi === 0 && t > 0 ? 1 : 0);
          expect(below, `${id}:${b.name} tier ${t}`).toBeGreaterThanOrEqual(TIER_GATE[t]);
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
    expect(count).toBe(14);
    expect(Object.keys(LEGACY_LEARN_LEVEL)).toHaveLength(14);
  });

  it('ACTIVE_RANK_PCT[0] is 100', () => {
    expect(ACTIVE_RANK_PCT).toEqual([100, 110, 120]);
  });

  it('every legendary power names an active node of a tree', () => {
    for (const p of Object.values(POWERS)) {
      const owner = SKILLS[p.skill]?.owner as CharacterId | undefined;
      if (!owner || !TREES[owner]) continue;
      expect(NODES[p.skill]?.node.kind, p.id).toBe('active');
    }
  });
});
