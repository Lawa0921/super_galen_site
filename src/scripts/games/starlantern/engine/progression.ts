import { DEFAULT_CAPSTONE, LEGACY_LEARN_LEVEL, NODES, TIER_GATE, TREES, type TreeNode } from '../data/trees';
import type { CharacterId, Member } from './types';

/**
 * Skill-tree rules: points per level, what a member may raise next, and the default build.
 * The data and its rules are described in data/trees.ts; this file is the only place that applies them.
 */

/** Skill points earned by `level`: one per level up to Lv4, then one on every odd level (5, 7, ... 49). Lv50 is 26. */
export function skillPoints(level: number): number {
  if (!(level > 1)) return 0;
  return level <= 4 ? level - 1 : 3 + Math.floor((level - 3) / 2);
}

/** Talent points earned by `level`: one on every even level from Lv6 (6, 8, ... 50). Lv50 is 23. */
export function talentPoints(level: number): number {
  return level < 6 || !Number.isFinite(level) ? 0 : Math.floor((level - 4) / 2);
}

export type RaiseFail = 'unknown' | 'max' | 'points' | 'req' | 'gate' | 'capstone';

const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

/** The tier-0 node of branch 0, which every member holds at rank 1 for free. */
export const freeNode = (id: CharacterId): string => TREES[id].branches[0].nodes[0].id;

export const newTree = (id: CharacterId): Record<string, number> => ({ [freeNode(id)]: 1 });

/** A rank from a tree that may come from a hostile save: anything but a positive integer reads as 0. */
function rankIn(tree: unknown, node: string): number {
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree) || !has(tree, node)) return 0;
  const r = (tree as Record<string, unknown>)[node];
  return Number.isInteger(r) && (r as number) > 0 ? (r as number) : 0;
}

export const nodeRank = (m: Member, node: string): number => rankIn(m.tree, node);

/** Every active node's skill in the character's tree (passives too), in tree order: branch 0 tiers 0-4, then branch 1, then 2. */
export const treeSkills = (id: CharacterId): string[] =>
  TREES[id].branches.flatMap((b) => b.nodes.filter((n) => n.kind === 'active').map((n) => n.skill));

/** The skills a member knows: the active nodes they hold at rank 1 or more, in tree order. */
export const learnedSkills = (m: Member): string[] =>
  TREES[m.id].branches.flatMap((b) => b.nodes.filter((n) => n.kind === 'active' && rankIn(m.tree, n.id) > 0).map((n) => n.skill));

/** Ranks held in the character's own nodes; ids of other trees or unknown ids are ignored. */
function ranksHeld(id: CharacterId, tree: unknown): number {
  let n = 0;
  for (const b of TREES[id].branches) for (const node of b.nodes) n += rankIn(tree, node.id);
  return n;
}

const pointsLeft = (id: CharacterId, level: number, tree: unknown): number => skillPoints(level) - (ranksHeld(id, tree) - 1);

export const skillPointsLeft = (m: Member): number => pointsLeft(m.id, m.level, m.tree);

function check(id: CharacterId, level: number, tree: unknown, node: string): RaiseFail | null {
  const info = has(NODES, node) ? NODES[node] : undefined;
  if (!info || info.owner !== id) return 'unknown';
  if (rankIn(tree, node) >= info.node.maxRank) return 'max';
  if (pointsLeft(id, level, tree) <= 0) return 'points';
  const branch = TREES[id].branches[info.branch].nodes;
  if (info.tier > 0 && rankIn(tree, branch[info.tier - 1].id) === 0) return 'req';
  let below = 0;
  for (let t = 0; t < info.tier; t++) below += rankIn(tree, branch[t].id);
  if (info.branch === 0 && info.tier > 0) below -= Math.min(1, rankIn(tree, branch[0].id));
  if (below < TIER_GATE[info.tier]) return 'gate';
  if (info.tier === 4 && TREES[id].branches.some((b) => b.nodes[4].id !== node && rankIn(tree, b.nodes[4].id) > 0)) return 'capstone';
  return null;
}

/** Why `node` cannot take its next rank, checked in the order of RaiseFail; null when it can. Never throws. */
export const canRaiseNode = (m: Member, node: string): RaiseFail | null => check(m.id, m.level, m.tree, node);

/** One more rank in `node`, on a copy; the member passed in is never changed. */
export function raiseNode(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: RaiseFail } {
  const reason = canRaiseNode(m, node);
  if (reason) return { ok: false, reason };
  return { ok: true, member: { ...m, tree: { ...m.tree, [node]: nodeRank(m, node) + 1 } } };
}

/** The level at which the default build learns an old skill: the last level up to its old level that pays a skill point. */
export function legacyDue(skill: string): number {
  const old = has(LEGACY_LEARN_LEVEL, skill) ? LEGACY_LEARN_LEVEL[skill] : 1;
  for (let L = old; L > 1; L--) if (skillPoints(L) > skillPoints(L - 1)) return L;
  return 1;
}

/**
 * The build a member of `level` gets when nobody chose: one point at a time, in this order of kinds —
 * 1. old skills that are due, smallest old level first; 2. ranks and mods of skills already learned;
 * 3. other new nodes, but not old skills before they are due; 4. old skills early, only when nothing else is open.
 * Within a kind, lowest (rank, tier, branch) first. Ultimates other than DEFAULT_CAPSTONE's branch are never taken.
 */
export function defaultTree(id: CharacterId, level: number): Record<string, number> {
  const tree = newTree(id);
  const nodes: { node: TreeNode; branch: number; tier: number }[] = [];
  TREES[id].branches.forEach((b, branch) => b.nodes.forEach((node, tier) => {
    if (tier < 4 || branch === DEFAULT_CAPSTONE[id]) nodes.push({ node, branch, tier });
  }));
  const legacy = (n: TreeNode) => n.kind === 'active' && has(LEGACY_LEARN_LEVEL, n.id) && NODES[n.id].owner === id;
  const order = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
    rankIn(tree, a.node.id) - rankIn(tree, b.node.id) || a.tier - b.tier || a.branch - b.branch;
  const byOld = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
    LEGACY_LEARN_LEVEL[a.node.id] - LEGACY_LEARN_LEVEL[b.node.id] || order(a, b);

  for (let L = 2; L <= level; L++) {
    for (let p = skillPoints(L) - skillPoints(L - 1); p > 0; p--) {
      const unlearnedOld = nodes.filter((x) => legacy(x.node) && rankIn(tree, x.node.id) === 0);
      const due = unlearnedOld.filter((x) => legacyDue(x.node.id) <= L).sort(byOld);
      const upgrades = nodes.filter((x) => x.node.kind === 'active'
        ? rankIn(tree, x.node.id) >= 1
        : rankIn(tree, x.node.skill) >= 1).sort(order);
      const fresh = nodes.filter((x) => !upgrades.includes(x) && !unlearnedOld.includes(x)).sort(order);
      const early = unlearnedOld.filter((x) => !due.includes(x)).sort(byOld);
      const pick = [due, upgrades, fresh, early]
        .map((kind) => kind.find((x) => check(id, L, tree, x.node.id) === null))
        .find((x) => x !== undefined);
      if (!pick) return tree;
      tree[pick.node.id] = rankIn(tree, pick.node.id) + 1;
    }
  }
  return tree;
}
