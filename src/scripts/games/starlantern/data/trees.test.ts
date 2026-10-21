import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTIVE_RANK_PCT, DEFAULT_CAPSTONE, DEFAULT_FIRST, INNATE, LEGACY_LEARN_LEVEL, NODES, P, TREES, V0, branchNodes, nodeDesc, nodeName, nodeText, tierNodes, type TreeNode } from './trees';
import { withNode } from '../engine/testing';
import { CHARACTERS, rulesOf } from './characters';
import { SKILLS } from './skills';
import { POWERS } from './gear';
import { defaultTree, freeNode, newTree, nodeRank, raiseNode } from '../engine/progression';
import { newMember } from '../engine/party';
import type { CharacterId, Member } from '../engine/types';

const ids = Object.keys(TREES) as CharacterId[];
/** Every node, B sides of pairs too. */
const allNodes = () => ids.flatMap((id) => TREES[id]!.branches.flatMap((b) => branchNodes(b).map((x) => x.node)));

describe('skill trees', () => {
  /** Points a tree can take (plan 8d ruling 4): every rank of tiers 0-3 (a pair is one cell), less the free one, plus one ultimate. */
  const capacity = (branches: { maxRank: number }[][]) =>
    branches.reduce((s, b) => s + b.slice(0, 4).reduce((t, n) => t + n.maxRank, 0), 0) - 1 /* free */ + 1 /* one ultimate */;

  it('every tree keeps its 8b capacity and shape', () => {
    const fixture = join(dirname(fileURLToPath(import.meta.url)), '..', 'engine', '__fixtures__', 'roster-8b.json');
    const was = (JSON.parse(readFileSync(fixture, 'utf8')) as { trees: Record<string, { id: string; maxRank: number }[][]> }).trees;
    expect(Object.keys(TREES).sort()).toEqual(Object.keys(was).sort());
    for (const id of ids) {
      const now = TREES[id].branches;
      expect(now.map((b) => b.nodes.length), id).toEqual(was[id].map((b) => b.length));
      now.forEach((b, i) => b.nodes.forEach((a, t) => {
        expect(a.maxRank, `${id} ${i}/${t}`).toBe(was[id][i][t].maxRank);
        if (!a.pair) return;
        expect(a.pair.kind, `${id} ${i}/${t} pair`).toBe(a.kind);
        expect(a.pair.maxRank, `${id} ${i}/${t} pair`).toBe(a.maxRank);
        expect(a.pair.pair, `${id} ${i}/${t} pair`).toBeUndefined();
      }));
      expect(capacity(now.map((b) => b.nodes)), id).toBe(capacity(was[id]));
    }
  });

  it('every DEFAULT_FIRST node is an A side of its owner that the standard build reaches', () => {
    /** What is wrong with the list: a node of someone else (or none), a B side, a cell the standard build never takes. */
    const problems = (): string[] => Object.entries(DEFAULT_FIRST).flatMap(([id, list]) => (list ?? []).flatMap((n) => {
      const info = Object.prototype.hasOwnProperty.call(NODES, n) ? NODES[n] : undefined;
      if (!info || info.owner !== id) return [`${id}: ${n} is not in her tree`];
      if (id === 'hero') return [`hero: ${n} (his build follows HERO_BUILDS)`];
      if (TREES[id as CharacterId].branches[info.branch].nodes[info.tier] !== info.node) return [`${id}: ${n} is a B side`];
      if (info.tier === 4 && info.branch !== DEFAULT_CAPSTONE[id as Exclude<CharacterId, 'hero'>]) return [`${id}: ${n} is an ultimate the build never aims for`];
      return (defaultTree(id as CharacterId, 50)[n] ?? 0) >= 1 ? [] : [`${id}: ${n} is never learned`];
    }));
    expect(problems()).toEqual([]);
    // The guard itself catches each kind of mistake.
    const restore = withNode('noel', 0, 1, P(TREES.noel.branches[0].nodes[1], V0('test-star-b', '測試星', 'fire-star', '測試', [{ powerPct: 101 }])));
    const before = { ...DEFAULT_FIRST };
    try {
      for (const [id, n] of [['rin', 'noel-star-twin'], ['noel', 'nope'], ['noel', 'test-star-b'], ['noel', 'blizzard'], ['hero', 'hero-slash']] as const) {
        for (const k of Object.keys(DEFAULT_FIRST)) delete DEFAULT_FIRST[k as CharacterId];
        DEFAULT_FIRST[id] = [n];
        expect(problems(), `${id} ${n}`).toHaveLength(1);
      }
    } finally {
      for (const k of Object.keys(DEFAULT_FIRST)) delete DEFAULT_FIRST[k as CharacterId];
      Object.assign(DEFAULT_FIRST, before);
      restore();
    }
  });

  it('every node is reachable through branchNodes and NODES knows its pair', () => {
    const all = ids.flatMap((id) => TREES[id].branches.flatMap((b) => branchNodes(b).map((x) => x.node.id)));
    expect(Object.keys(NODES).sort()).toEqual([...all].sort());
    for (const id of ids) for (const b of TREES[id].branches) {
      branchNodes(b).forEach(({ node, tier }) => {
        expect(tierNodes(b, tier).map((n) => n.id), node.id).toContain(node.id);
        expect(NODES[node.id].tier, node.id).toBe(tier);
      });
      b.nodes.forEach((a, tier) => {
        expect(tierNodes(b, tier), a.id).toEqual(a.pair ? [a, a.pair] : [a]);
        if (!a.pair) { expect(NODES[a.id].pair, a.id).toBeUndefined(); return; }
        expect(NODES[a.id].pair, a.id).toBe(a.pair.id);
        expect(NODES[a.pair.id].pair, a.pair.id).toBe(a.id);
        expect(NODES[a.pair.id].tier, a.pair.id).toBe(tier);
      });
    }
  });

  it('every character has a tree', () => {
    expect([...ids].sort()).toEqual(Object.keys(CHARACTERS).sort());
  });

  it("every skill in SKILLS is an active node of exactly one tree, its owner's, or innate to its owner", () => {
    for (const s of Object.values(SKILLS)) {
      const owners = ids.filter((id) => TREES[id]!.branches.some((b) => b.nodes.some((n) => n.kind === 'active' && n.id === s.id)));
      const innate = ids.filter((id) => (INNATE[id] ?? []).includes(s.id));
      expect([...owners, ...innate], s.id).toEqual([s.owner]);
    }
  });

  it('DEFAULT_CAPSTONE names a branch for every companion; scarlet takes the flame and rin the backstab', () => {
    const companions = ids.filter((id): id is Exclude<CharacterId, 'hero'> => id !== 'hero');
    expect(Object.keys(DEFAULT_CAPSTONE).sort()).toEqual(companions.map((id) => id as string).sort());
    for (const id of companions) expect(DEFAULT_CAPSTONE[id], id).toBeLessThan(rulesOf(id).branches);
    expect(DEFAULT_CAPSTONE.scarlet).toBe(1);
    expect(TREES.scarlet.branches[1].nodes[4].id).toBe('crimson-end');
    expect(DEFAULT_CAPSTONE.rin).toBe(1);
    for (const id of companions.filter((x) => x !== 'scarlet' && x !== 'rin')) expect(DEFAULT_CAPSTONE[id], id).toBe(0);
  });

  it('no node lowers an HP cost any more (plan 8d Task 7: 炎環節制 became 炎環斬・燎原)', () => {
    expect(allNodes().filter((n) => n.mods?.some((m) => m.hpCost !== undefined)).map((n) => n.id)).toEqual([]);
    expect(NODES['scarlet-ring-up']).toBeUndefined();
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
      expect(NODES[n.skill!].node, n.skill).toBe(n);
    }
  });

  it('active nodes are skills of their owner; variants name an active node of the same tree; mechanic nodes turn a knob', () => {
    for (const id of ids) {
      const nodes = TREES[id]!.branches.flatMap((b) => branchNodes(b).map((x) => x.node));
      const actives = new Set(nodes.filter((n) => n.kind === 'active').map((n) => n.id));
      for (const n of nodes) {
        if (n.kind === 'active') {
          expect(n.id).toBe(n.skill);
          expect(SKILLS[n.skill!], n.id).toBeDefined();
          expect(SKILLS[n.skill!].owner).toBe(id);
          expect(n.name ?? n.desc ?? n.mods).toBeUndefined();
        } else if (n.kind === 'mech') {
          // A mechanic node: a name, a knob, one value and one sentence a rank; no skill.
          expect(n.skill, n.id).toBeUndefined();
          expect(n.name, n.id).toBeTruthy();
          expect(n.knob, n.id).toBeTruthy();
          expect(n.values, n.id).toHaveLength(n.maxRank);
          expect(n.say, n.id).toBeDefined();
        } else {
          expect(actives.has(n.skill!) || (INNATE[id] ?? []).includes(n.skill!), `${n.id} -> ${n.skill}`).toBe(true);
          // A plan 8d variant has a label and a sentence; a plan 8c one (V0) still has its name and words.
          if (n.label !== undefined) expect(n.say, n.id).toBeDefined();
          else { expect(n.name, n.id).toBeTruthy(); expect(n.desc, n.id).toBeTruthy(); }
        }
      }
    }
  });

  it('mod nodes carry one mod per rank and powerPct and buffPct rise with rank', () => {
    for (const n of allNodes().filter((x) => x.kind === 'variant')) {
      expect(n.mods, n.id).toHaveLength(n.maxRank);
      for (const key of ['powerPct', 'buffPct'] as const) {
        const pcts = n.mods!.map((m) => m[key]).filter((p) => p !== undefined) as number[];
        if (!pcts.length) continue;
        expect(pcts, `${n.id} ${key}`).toHaveLength(n.maxRank);
        for (let i = 1; i < pcts.length; i++) expect(pcts[i], `${n.id} ${key}`).toBeGreaterThan(pcts[i - 1]);
      }
      // A plan 8c TP cut falls with every rank; a plan 8d variant's TP change is its rule (凝光's +1), never rising.
      const tp = n.mods!.map((m) => m.tpDelta).filter((p) => p !== undefined) as number[];
      for (let i = 1; i < tp.length; i++) {
        if (n.label === undefined) expect(tp[i], n.id).toBeLessThan(tp[i - 1]);
        else expect(tp[i], n.id).toBeLessThanOrEqual(tp[i - 1]);
      }
    }
  });

  it('a mod node deepens a buff or debuff only when its text says so', () => {
    for (const n of allNodes().filter((x) => x.kind === 'variant')) {
      const says = /削弱|提升幅度/.test(n.desc ?? nodeText(n.id, 1));
      expect(n.mods!.some((m) => m.buffPct !== undefined), n.id).toBe(says);
      if (says) expect(SKILLS[n.skill!].effects.some((e) => e.kind === 'buff'), n.id).toBe(true);
    }
  });

  it('深鑿 (破甲強化 until plan 8d Task 6) lengthens the debuff, and says so', () => {
    const n = NODES['sylvie-sunder-deep'].node;
    expect(n.mods!.map((m) => m.turns)).toEqual([5, 6, 7]);
    for (let r = 1; r <= 3; r++) expect(nodeText(n.id, r)).toContain(`${n.mods![r - 1].turns} 回合`);
  });

  it('every power mod node (powerPct or powerDelta) names a skill that deals damage, heals, sets a device, raises a barrier or fills a gauge', () => {
    const power = allNodes().filter((n) => n.kind === 'variant' && n.mods!.some((m) => m.powerPct !== undefined || m.powerDelta !== undefined));
    expect(power.map((n) => n.id)).toContain('twin-turret');
    expect(power.map((n) => n.id)).toContain('safira-clap-encore');   // 拍手・安可: its power is the gauge it fills (plan 8d Task 7)
    for (const n of power) {
      expect(SKILLS[n.skill!].effects.some((e) => e.kind === 'damage' || e.kind === 'heal' || e.kind === 'device' || e.kind === 'barrier' || e.kind === 'gauge'), n.id).toBe(true);
    }
  });

  it('a skill whose HP cost a mod node lowers does not state a fixed HP percent (none is left since plan 8d Task 7)', () => {
    const lowered = [...new Set(allNodes().filter((n) => n.mods?.some((m) => m.hpCost !== undefined)).map((n) => n.skill!))];
    expect(lowered).toEqual([]);
    expect(SKILLS['blaze-ring'].desc).not.toMatch(/\d+\s*%/);
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

  it('an active above rank 1 has an effect its rank scales (damage, heal or turret by powerPct; a pure buff by buffPct), or a TP cost its rank lowers', () => {
    for (const n of allNodes().filter((x) => x.kind === 'active' && x.maxRank > 1)) {
      const kinds = SKILLS[n.skill!].effects.map((e) => e.kind);
      // Plan 8c: a skill with nothing to scale costs 1 TP less a rank (so it needs TP to spare), or lasts longer a rank.
      const scales = kinds.some((k) => ['damage', 'heal', 'buff', 'device', 'barrier', 'gauge'].includes(k));
      expect(scales || SKILLS[n.skill!].tp > n.maxRank || n.rank === 'turns', n.id).toBe(true);
    }
  });

  it('branch 0 tier 0 is a non-passive skill (the free one) and every tier-4 node has maxRank 1', () => {
    for (const id of ids) {
      const t = TREES[id]!;
      const free = t.branches[0].nodes[0];
      expect(free.kind).toBe('active');
      expect(SKILLS[free.skill!].passive).toBeUndefined();
      for (const b of t.branches) expect(b.nodes[4].maxRank).toBe(1);
    }
  });

  it('every tier is reachable', () => {
    // Climb each branch alone at Lv50, tier by tier to max rank, with the engine's own rules (Infinity memories, so the hero's abyss tiers are open).
    for (const id of ids) {
      TREES[id]!.branches.forEach((b) => {
        let m: Member = { ...newMember(id), level: 50 };
        for (const n of b.nodes) {
          while (nodeRank(m, n.id) < n.maxRank) {
            const r = raiseNode(m, n.id, Infinity);
            if (!r.ok) throw new Error(`${id}:${b.name} ${n.id} refused: ${r.reason}`);
            m = r.member;
          }
        }
      });
    }
  });

  it('indexes nodes by owner, branch and tier', () => {
    expect(NODES['flame-wave']).toMatchObject({ owner: 'noel', branch: 0, tier: 2 });
    expect(NODES.pickpocket).toMatchObject({ owner: 'liz', branch: 0, tier: 1 });
    expect(nodeName('sweep')).toBe(SKILLS.sweep.name);
    expect(nodeName('bobby-turret-up')).toBe('砲台強化');   // a plan 8c node still standing (V0)
    expect(nodeDesc('bobby-turret-up')).toBeTruthy();
    expect(nodeName('noel-star-twin')).toBe('火之星彈・連星');
    expect(nodeName('noel-calm')).toBe('冷靜');
    expect(NODES['noel-star-heavy']).toMatchObject({ owner: 'noel', branch: 0, tier: 1, pair: 'noel-star-twin' });
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

describe('node words (plan 8d)', () => {
  /** Every number a rank's mod or value holds, as its words would say it: a chance in (0, 1) as a percent. */
  const numbersOf = (n: TreeNode, r: number): number[] => {
    const out: number[] = [];
    const walk = (v: unknown, key = ''): void => {
      if (key === 'notes') return;
      if (typeof v === 'number') out.push(v > 0 && v < 1 ? Math.round(v * 100) : Math.abs(v));
      else if (Array.isArray(v)) v.forEach((x) => walk(x));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k);
    };
    if (n.kind === 'mech') walk(n.values![r - 1]); else walk(n.mods![r - 1]);
    return out;
  };

  it('node words name their own numbers', () => {
    const owners = ['noel', 'rin', 'chizuru', 'selene', 'liz', 'sylvie', 'scarlet', 'safira'] as const;   // Task 9 widens this to every tree
    let checked = 0;
    for (const id of owners) for (const b of TREES[id].branches) for (const { node } of branchNodes(b)) {
      if (node.kind === 'active') continue;
      expect(node.say, node.id).toBeDefined();
      for (let r = 1; r <= node.maxRank; r++) {
        const text = nodeText(node.id, r);
        expect(text, `${node.id} r${r}`).toMatch(/。$/);
        // A whole number in the words: 「30%」 is not inside 「130%」.
        const says = (v: number) => new RegExp(`(?<![0-9.])${v}(?![0-9.])`).test(text);
        // A zero is said in words (即興 r3: 「拍子不變」, plan 8d Task 7).
        for (const v of numbersOf(node, r)) if (v !== 0) expect(says(v), `${node.id} r${r} names ${v}: ${text}`).toBe(true);
        if (r > 1) {
          const was = numbersOf(node, r - 1), now = numbersOf(node, r);
          was.forEach((v, i) => { if (v !== now[i]) expect(says(v), `${node.id} r${r} still says ${v}: ${text}`).toBe(false); });
        }
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(30);
  });
});
