import {
  ACTIVE_RANK_PCT, DEFAULT_CAPSTONE, DEFAULT_FIRST, LEGACY_LEARN_LEVEL, NODES, TIER_GATE, TREES, branchNodes, tierNodes, type MechKnob, type TreeNode,
} from '../data/trees';
import type { SkillMod } from '../data/gear';
import { SKILLS } from '../data/skills';
import {
  BOARDS, DEFAULT_KEYSTONES, MEMORY_KEYSTONES, TALENT_NODES, TALENT_PER, TALENT_SCALE, boardPoints, keystoneCount, rankOf, talentBlocker, type BoardKeystoneId, type KeystoneId, type TalentBlocker,
} from '../data/talents';
import { rulesOf } from '../data/characters';
import { ABYSS_UNLOCK, HERO_BUILDS, type HeroBuild } from '../data/hero';
import { HERO_ULTIMATES, RIN_DAWN, SKY_LANTERN, ULTIMATES, skyForm } from '../data/ultimates';
import type { AnyStat, CharacterId, GrowthRules, Member, Sheet, UltimateDef } from './types';
import { stackMods } from './skills';
import { chainLength } from '../data/story/chains';

/**
 * Skill-tree rules: points per level, what a member may raise next, and the default build.
 * The data and its rules are described in data/trees.ts; this file is the only place that applies them.
 */

/** A curve other than the two known ones is a bug at the call site (e.g. `.map(skillPoints)` passing an index): fail loudly. */
function assertCurve(curve: unknown): void {
  if (curve !== 'companion' && curve !== 'hero') throw new Error(`unknown growth curve: ${String(curve)}`);
}

/**
 * Skill points earned by `level`. Companion curve: one per level up to Lv4, then one on every odd level (5, 7, ... 49), so
 * Lv50 is 26. Hero curve: one per level plus one every second level, (L - 1) + floor((L - 1) / 2), so Lv50 is 73.
 */
export function skillPoints(level: number, curve: GrowthRules['curve'] = 'companion'): number {
  assertCurve(curve);
  if (!(level > 1)) return 0;
  if (curve === 'hero') return (level - 1) + Math.floor((level - 1) / 2);
  return level <= 4 ? level - 1 : 3 + Math.floor((level - 3) / 2);
}

/**
 * Talent points earned by `level`. Companion curve: one on every even level from Lv6 (6, 8, ... 50), so Lv50 is 23.
 * Hero curve: one on every level from Lv6, max(0, L - 5), so Lv50 is 45.
 */
export function talentPoints(level: number, curve: GrowthRules['curve'] = 'companion'): number {
  assertCurve(curve);
  if (level < 6 || !Number.isFinite(level)) return 0;
  return curve === 'hero' ? level - 5 : Math.floor((level - 4) / 2);
}

/**
 * Why a node cannot take its next rank, in the order they are checked: the structural reasons first, so a member with no
 * points left still learns what stands in the way; 'points' only for a node that is otherwise open.
 * 'pair': the other side of the node's pair holds points (plan 8d; `swapPair` moves them instead).
 * 'abyss': the hero's tier-4 node of that branch needs more memories than he has (ABYSS_UNLOCK).
 */
export type RaiseFail = 'unknown' | 'max' | 'pair' | 'req' | 'gate' | 'abyss' | 'capstone' | 'points';

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
  TREES[id].branches.flatMap((b) => branchNodes(b).filter((x) => x.node.kind === 'active').map((x) => x.node.skill!));

/** The skills a member knows: the active nodes they hold at rank 1 or more, in tree order. */
export const learnedSkills = (m: Member): string[] =>
  TREES[m.id].branches.flatMap((b) => branchNodes(b).filter((x) => x.node.kind === 'active' && rankIn(m.tree, x.node.id) > 0).map((x) => x.node.skill!));

/**
 * The tree's rewrites of `skill` for these ranks, as the two stages battle.ts `skillFor` applies one after another (its
 * only source for the tree): first the active node's own rank (`rankMod`; left out when it changes nothing), then
 * `mods[rank - 1]` of every variant node of that skill held at rank 1 or more, stacked into one by `stackMods` in tree order
 * (left out when none is held). A rank above a node's max reads as the max; a junk rank reads as 0.
 * The order and the stacking rules: engine/skills.ts `patchSkill`.
 */
export function treeMods(ranks: Record<string, number>, skill: string): SkillMod[] {
  const rank = rankMod(ranks, skill);
  const nodes = nodeMods(ranks, skill);
  return [...(rank ? [rank] : []), ...(nodes.length ? [stackMods(nodes)] : [])];
}

const activeNode = (skill: string) => (has(NODES, skill) && NODES[skill].node.kind === 'active' ? NODES[skill] : undefined);

/**
 * The rank a combatant's `ranks` hold in the active node of `skill`, read as `rankIn` reads a tree: an own key holding a
 * positive integer, capped at the node's max; anything else (and a skill with no active node) is 0.
 */
export function skillRank(ranks: unknown, skill: string): number {
  const info = activeNode(skill);
  return info ? Math.min(rankIn(ranks, skill), info.node.maxRank) : 0;
}

/**
 * The active node's own rank as a rewrite of the skill's primary effect, or undefined when it changes nothing (rank 0, or
 * 100%): a skill that deals damage, heals or sets a device scales its power (`powerPct`; a debuff riding on it is left
 * alone); a pure buff or debuff skill scales its percent (`buffPct`). A skill with neither costs 1 TP less a rank (`tpDelta`),
 * or lasts a round longer a rank when its node says `rank: 'turns'` (`turnsDelta`).
 */
export function rankMod(ranks: Record<string, number>, skill: string): SkillMod | undefined {
  const rank = skillRank(ranks, skill);
  const pct = rank > 0 ? ACTIVE_RANK_PCT[rank - 1] : 100;
  if (pct === 100) return undefined;
  // A skill with nothing to scale (plan 8c: hex, mark) costs 1 TP less for each rank above the first instead; one whose
  // node says 'turns' (the veil, whose TP its mod node cuts) lasts a round longer for each.
  const scaled = pctMod(skill, pct);
  if (scaled) return scaled;
  if (activeNode(skill)?.node.rank === 'turns') return { turnsDelta: rank - 1 };
  return (SKILLS[skill]?.tp ?? 0) > 0 ? { tpDelta: 1 - rank } : undefined;
}

/**
 * `pct` percent as a rewrite of the skill's primary effect, or undefined when it changes nothing (100%, or a skill with
 * nothing to scale): damage, heal and device skills scale their power (`powerPct`); a pure buff or debuff skill its percent.
 */
export function pctMod(skill: string, pct: number): SkillMod | undefined {
  if (pct === 100) return undefined;
  const kinds = SKILLS[skill]?.effects.map((e) => e.kind) ?? [];
  if (kinds.some((k) => k === 'damage' || k === 'heal' || k === 'device' || k === 'barrier' || k === 'gauge')) return { powerPct: pct };
  return kinds.includes('buff') ? { buffPct: pct } : undefined;
}

/** `mods[rank - 1]` of every variant node of `skill` held at rank 1 or more, in tree order (a pair's A side before its B). */
export function nodeMods(ranks: Record<string, number>, skill: string): SkillMod[] {
  const info = activeNode(skill);
  if (!info) return [];
  const out: SkillMod[] = [];
  for (const b of TREES[info.owner].branches) for (const { node: n } of branchNodes(b)) {
    if (n.kind !== 'variant' || n.skill !== skill) continue;
    const r = Math.min(rankIn(ranks, n.id), n.maxRank);
    if (r > 0) out.push(n.mods![r - 1]);
  }
  return out;
}

/**
 * The hero's main branch: the one whose nodes hold the most ranks (the free first rank counts), read as `rankIn` reads a
 * tree; a tie goes to the lower branch index.
 */
export function heroMainBranch(ranks: Record<string, number>): number {
  let best = 0;
  let most = -1;
  TREES.hero.branches.forEach((b, i) => {
    const held = branchNodes(b).reduce((n, x) => n + rankIn(ranks, x.node.id), 0);
    if (held > most) { best = i; most = held; }
  });
  return best;
}

/**
 * The ultimate `id` fights with: the hero's Lantern Key takes the form of his main branch, and lights up (the Sky Lantern)
 * with every memory; Rin throws the dawn blade once she has sworn her oath; a companion has one ultimate.
 * `m` is the fighter's memories and oath (a Combatant or a Member).
 */
export function ultimateFor(id: CharacterId, ranks?: Record<string, number>, m?: { memories?: number; oath?: true }): UltimateDef {
  if (id === 'hero') {
    const form = HERO_ULTIMATES[heroMainBranch(ranks ?? {})];
    return memoriesOf({ id, memories: m?.memories }) >= SKY_LANTERN.memories ? skyForm(form) : form;
  }
  return id === 'rin' && m?.oath ? RIN_DAWN : ULTIMATES[id];
}

/** Ranks held in the character's own nodes (B sides too); ids of other trees or unknown ids are ignored. */
function ranksHeld(id: CharacterId, tree: unknown): number {
  let n = 0;
  for (const b of TREES[id].branches) for (const x of branchNodes(b)) n += rankIn(tree, x.node.id);
  return n;
}

const pointsLeft = (id: CharacterId, level: number, tree: unknown): number => skillPoints(level, rulesOf(id).curve) - (ranksHeld(id, tree) - 1);

export const skillPointsLeft = (m: Member): number => pointsLeft(m.id, m.level, m.tree);

function check(id: CharacterId, level: number, tree: unknown, node: string, memories: number): RaiseFail | null {
  const info = has(NODES, node) ? NODES[node] : undefined;
  if (!info || info.owner !== id) return 'unknown';
  if (rankIn(tree, node) >= info.node.maxRank) return 'max';
  if (info.pair !== undefined && rankIn(tree, info.pair) > 0) return 'pair';
  const branch = TREES[id].branches[info.branch];
  const held = (t: number) => tierNodes(branch, t).reduce((n, x) => n + rankIn(tree, x.id), 0);
  if (info.tier > 0 && held(info.tier - 1) === 0) return 'req';
  let below = 0;
  for (let t = 0; t < info.tier; t++) below += held(t);
  if (info.branch === 0 && info.tier > 0) below -= Math.min(1, rankIn(tree, branch.nodes[0].id));
  if (below < TIER_GATE[info.tier]) return 'gate';
  if (id === 'hero' && info.tier === 4 && !(memories >= ABYSS_UNLOCK[info.branch])) return 'abyss';   // `!(>=)`, so a NaN count keeps the node shut
  if (info.tier === 4 && TREES[id].branches.filter((b, i) => i !== info.branch && tierNodes(b, 4).some((x) => rankIn(tree, x.id) > 0)).length >= rulesOf(id).capstones) return 'capstone';
  if (pointsLeft(id, level, tree) <= 0) return 'points';
  return null;
}

/**
 * The memory pieces `m` holds: the only way the game reads the count. A count that is not a finite number, or is
 * negative, is 0; otherwise it is whole pieces, never more than the member's chain has.
 */
export function memoriesOf(m: Pick<Member, 'id' | 'memories'>): number {
  const n = m.memories;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return 0;
  return Math.min(chainLength(m.id), Math.floor(n));
}

/**
 * Why `node` cannot take its next rank, checked in the order of RaiseFail; null when it can. Never throws.
 * `memories` is the hero's memory count, which the abyss nodes wait for (ABYSS_UNLOCK); it defaults to the member's own.
 */
export const canRaiseNode = (m: Member, node: string, memories = memoriesOf(m)): RaiseFail | null => check(m.id, m.level, m.tree, node, memories);

/**
 * The other side of `node`'s pair takes all its points over to `node` (plan 8d ruling 3: free outside battle, no inn), on
 * a copy; the member passed in is never changed. The tiers above stay legal: they need some node of this tier to hold
 * points, and the gate counts the tier's points whichever side holds them. 'unknown': not a node of this member's pairs;
 * 'empty': the other side holds no points.
 */
export function swapPair(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: 'unknown' | 'empty' } {
  const info = has(NODES, node) ? NODES[node] : undefined;
  if (!info || info.owner !== m.id || info.pair === undefined) return { ok: false, reason: 'unknown' };
  const other = rankIn(m.tree, info.pair);
  if (other === 0) return { ok: false, reason: 'empty' };
  const tree = { ...m.tree, [node]: other };
  delete tree[info.pair];
  return { ok: true, member: { ...m, tree } };
}

/**
 * The value a mechanic knob takes from `owner`'s held mechanic node for `k`: `values[rank - 1]` (a rank above the max reads
 * as the max), or undefined when no such node holds a rank; the ranks are read as `rankIn` reads a tree, so junk is 0.
 * A mechanic module reads `mechKnob(c.ranks, owner, k) ?? its constant`; it never draws.
 */
export function mechKnob(ranks: unknown, owner: CharacterId, k: MechKnob): number | undefined {
  for (const b of TREES[owner].branches) for (const { node } of branchNodes(b)) {
    if (node.kind !== 'mech' || node.knob !== k) continue;
    const r = Math.min(rankIn(ranks, node.id), node.maxRank);
    if (r > 0) return node.values![r - 1];
  }
  return undefined;
}

/** One more rank in `node`, on a copy; the member passed in is never changed. */
export function raiseNode(m: Member, node: string, memories = memoriesOf(m)): { ok: true; member: Member } | { ok: false; reason: RaiseFail } {
  const reason = canRaiseNode(m, node, memories);
  if (reason) return { ok: false, reason };
  return { ok: true, member: { ...m, tree: { ...m.tree, [node]: nodeRank(m, node) + 1 } } };
}

/** The level at which the default build learns an old skill: the last level up to its old level that pays a skill point. */
export function legacyDue(skill: string): number {
  const old = has(LEGACY_LEARN_LEVEL, skill) ? LEGACY_LEARN_LEVEL[skill] : 1;
  // Deliberately the companion curve: legacy skills belong to the eight companions only.
  for (let L = old; L > 1; L--) if (skillPoints(L) > skillPoints(L - 1)) return L;
  return 1;
}

/**
 * The build a member of `level` gets when nobody chose: one point at a time, in this order of kinds —
 * 1. old skills that are due, smallest old level first; 2. the first node of DEFAULT_FIRST[id] not yet learned that can
 * be (learned, rank 0 to 1; its later ranks come as upgrades); 3. upgrades: ranks of skills already learned, variants of
 * them, and mechanic nodes whose tier above holds points; 4. other new nodes, but not old skills before they are due;
 * 5. old skills early, only when nothing else is open.
 * Within a kind, lowest (rank, tier, branch) first. Ultimates other than DEFAULT_CAPSTONE's branch are never taken, and
 * neither is the B side of a pair (plan 8d ruling 5).
 * `memories` is the hero's memory count (abyss nodes wait for it, ABYSS_UNLOCK); the default 0 keeps them shut.
 */
export function defaultTree(id: CharacterId, level: number, memories = 0): Record<string, number> {
  if (id === 'hero') return heroTree(level, 'balanced', memories);
  const tree = newTree(id);
  const nodes: { node: TreeNode; branch: number; tier: number }[] = [];
  TREES[id].branches.forEach((b, branch) => b.nodes.forEach((node, tier) => {
    if (tier < 4 || branch === DEFAULT_CAPSTONE[id]) nodes.push({ node, branch, tier });   // A sides only: never a B
  }));
  const first = (DEFAULT_FIRST[id] ?? []).map((n) => nodes.find((x) => x.node.id === n)).filter((x) => x !== undefined);
  const learned = (x: (typeof nodes)[number]) => {
    if (x.node.kind === 'active') return rankIn(tree, x.node.id) >= 1;
    if (x.node.kind === 'variant') return rankIn(tree, x.node.skill!) >= 1;
    return x.tier > 0 && tierNodes(TREES[id].branches[x.branch], x.tier - 1).some((n) => rankIn(tree, n.id) > 0);
  };
  const legacy = (n: TreeNode) => n.kind === 'active' && has(LEGACY_LEARN_LEVEL, n.id) && NODES[n.id].owner === id;
  const order = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
    rankIn(tree, a.node.id) - rankIn(tree, b.node.id) || a.tier - b.tier || a.branch - b.branch;
  const byOld = (a: (typeof nodes)[number], b: (typeof nodes)[number]) =>
    LEGACY_LEARN_LEVEL[a.node.id] - LEGACY_LEARN_LEVEL[b.node.id] || order(a, b);

  const curve = rulesOf(id).curve;
  for (let L = 2; L <= level; L++) {
    for (let p = skillPoints(L, curve) - skillPoints(L - 1, curve); p > 0; p--) {
      const unlearnedOld = nodes.filter((x) => legacy(x.node) && rankIn(tree, x.node.id) === 0);
      const due = unlearnedOld.filter((x) => legacyDue(x.node.id) <= L).sort(byOld);
      const firsts = first.filter((x) => rankIn(tree, x.node.id) === 0);
      const upgrades = nodes.filter(learned).sort(order);
      const fresh = nodes.filter((x) => !upgrades.includes(x) && !unlearnedOld.includes(x)).sort(order);
      const early = unlearnedOld.filter((x) => !due.includes(x)).sort(byOld);
      const pick = [due, firsts, upgrades, fresh, early]
        .map((kind) => kind.find((x) => check(id, L, tree, x.node.id, memories) === null))
        .find((x) => x !== undefined);
      if (!pick) return tree;
      tree[pick.node.id] = rankIn(tree, pick.node.id) + 1;
    }
  }
  return tree;
}

/**
 * The hero's tree for a build: one point at a time, to the first of the build's `nodes` that can take it, else the
 * build's branches in turn (inside a branch the open node, tier 4 included, of lowest (rank, tier)); when none of them
 * has an open node, the other branches in index order. Every point passes `check`, so an abyss capstone is taken only
 * once `memories` allow it.
 */
export function heroTree(level: number, build: HeroBuild = 'balanced', memories = 0): Record<string, number> {
  const tree = newTree('hero');
  const mine = HERO_BUILDS[build].branches;
  const first = HERO_BUILDS[build].nodes ?? [];
  const others = TREES.hero.branches.map((_, i) => i).filter((i) => !mine.includes(i));
  // A sides only: the standard build never takes a B (plan 8d ruling 5).
  const open = (L: number, branch: number): string | undefined => TREES.hero.branches[branch].nodes
    .map((node, tier) => ({ id: node.id, tier }))
    .filter((x) => check('hero', L, tree, x.id, memories) === null)
    .sort((a, b) => rankIn(tree, a.id) - rankIn(tree, b.id) || a.tier - b.tier)[0]?.id;
  let turn = 0;
  for (let L = 2; L <= level; L++) {
    for (let p = skillPoints(L, 'hero') - skillPoints(L - 1, 'hero'); p > 0; p--) {
      let node = first.find((id) => check('hero', L, tree, id, memories) === null);
      for (let i = 0; i < mine.length && !node; i++) {
        const slot = (turn + i) % mine.length;
        node = open(L, mine[slot]);
        if (node) turn = slot + 1;
      }
      for (let i = 0; i < others.length && !node; i++) node = open(L, others[i]);
      if (!node) return tree;
      tree[node] = rankIn(tree, node) + 1;
    }
  }
  return tree;
}

/*
 * Talent rules. The board rules live in data/talents.ts (`talentBlocker`); this adds the member's points.
 */

/**
 * Why a talent node cannot take its next rank, in the order they are checked: the structural reasons first (as RaiseFail),
 * so a member with no points left still learns what stands in the way; 'points' only for a node that is otherwise open.
 */
export type TalentFail = 'unknown' | 'max' | 'adjacent' | 'gate' | 'keystones' | 'points';

const BLOCKER: Record<TalentBlocker, TalentFail> = {
  unknown: 'unknown', maxed: 'max', adjacency: 'adjacent', gate: 'gate', 'keystone-cap': 'keystones',
};

/** A talent record that may come from a hostile save, as the board rules read it: anything but a plain object is empty. */
const talentsOf = (m: Member): Record<string, number> =>
  typeof m.talents === 'object' && m.talents !== null && !Array.isArray(m.talents) ? m.talents : {};

/** Talent points earned and not spent; ranks on other boards, unknown ids and junk ranks are not spent points. */
export function talentPointsLeft(m: Member): number {
  const t = talentsOf(m);
  return talentPoints(m.level, rulesOf(m.id).curve) - boardPoints(m.id, t) - keystoneCount(m.id, t);
}

/** Why `node` cannot take its next rank, checked in the order of TalentFail; null when it can. Never throws. */
export function canRaiseTalent(m: Member, node: string): TalentFail | null {
  const blocker = talentBlocker(m.id, node, talentsOf(m));
  if (blocker) return BLOCKER[blocker];
  return talentPointsLeft(m) <= 0 ? 'points' : null;
}

/** One more rank in `node`, on a copy; the member passed in is never changed. */
export function raiseTalent(m: Member, node: string): { ok: true; member: Member } | { ok: false; reason: TalentFail } {
  const reason = canRaiseTalent(m, node);
  if (reason) return { ok: false, reason };
  const t = talentsOf(m);
  const held = BOARDS[m.id].find((n) => n.id === node)!;
  return { ok: true, member: { ...m, talents: { ...t, [node]: rankOf(held, t) + 1 } } };
}

/** What the member's normal talent nodes add: per rank, the node's stat by TALENT_PER[stat] x TALENT_SCALE. */
export function talentStats(m: Member): Partial<Sheet> {
  const t = talentsOf(m);
  const out: Partial<Sheet> = {};
  for (const n of BOARDS[m.id]) {
    const r = n.stat ? rankOf(n, t) : 0;
    if (r > 0) out[n.stat as AnyStat] = (out[n.stat as AnyStat] ?? 0) + r * TALENT_PER[n.stat!]! * TALENT_SCALE;
  }
  return out;
}

/** The keystones the member holds on her talent board, in board order (what the cap and the point count see). */
export function boardKeystonesOf(m: Member): BoardKeystoneId[] {
  const t = talentsOf(m);
  return BOARDS[m.id].filter((n) => n.keystone && rankOf(n, t) > 0).map((n) => n.keystone!);
}

/** Whether the member's memory keystone is awake: a companion has every piece of her chain, Rin has sworn her oath, the hero never. */
export function memoryKeystoneAwake(m: Member): boolean {
  if (m.id === 'hero') return false;
  return m.id === 'rin' ? !!m.oath : memoriesOf(m) >= chainLength(m.id);
}

/** The keystones a member holds: her board's, then her memory keystone once awake. The memory one is on no board, so it takes no cap slot and no point. */
export function keystonesOf(m: Member): KeystoneId[] {
  const held = boardKeystonesOf(m);
  return m.id !== 'hero' && memoryKeystoneAwake(m) ? [...held, MEMORY_KEYSTONES[m.id]] : held;
}

/**
 * The talents a member of `level` gets when nobody chose: talentPoints(level) points, one at a time; a keystone of
 * DEFAULT_KEYSTONES when one can be taken, else the open normal node of lowest (rank, row, col).
 */
export function defaultTalents(id: CharacterId, level: number): Record<string, number> {
  if (id === 'hero') return heroTalents(level, 'balanced');
  const t: Record<string, number> = {};
  const keystones = DEFAULT_KEYSTONES[id].map((k) => BOARDS[id].find((n) => n.keystone === k)!);
  const normal = BOARDS[id].filter((n) => !n.keystone);
  for (let p = talentPoints(level, rulesOf(id).curve); p > 0; p--) {
    const pick = keystones.find((n) => talentBlocker(id, n.id, t) === null)
      ?? normal.filter((n) => talentBlocker(id, n.id, t) === null)
        .sort((a, b) => rankOf(a, t) - rankOf(b, t) || a.row - b.row || a.col - b.col)[0];
    if (!pick) break;
    t[pick.id] = rankOf(pick, t) + 1;
  }
  return t;
}

/** A plain record whose every key passes `known` and whose every value is an integer from 1 up to `max(key)`. */
function shapeOk(v: unknown, known: (k: string) => boolean, max: (k: string) => number): v is Record<string, number> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  return Object.entries(v).every(([k, r]) => known(k) && Number.isInteger(r) && (r as number) >= 1 && (r as number) <= max(k));
}

/**
 * Whether a saved build is one a player could have reached: a whole level, ranks in range on the character's own nodes
 * with the free node held, and then the build replayed from empty (`newTree`, no talents) through `canRaiseNode` /
 * `canRaiseTalent`, one point at a time, until both equal what was saved. The replay applies the points, adjacency,
 * gate, ultimate and keystone rules, so they live only above. The rules never get harder after a raise (apart from the
 * ultimate and keystone caps, which a legal build respects), so the order of the replay does not matter.
 * Never throws, for any input.
 */
export function validBuild(id: CharacterId, level: number, tree: unknown, talents: unknown, memories = 0): boolean {
  if (!Number.isInteger(level) || level < 1) return false;
  const ownNode = (k: string) => has(NODES, k) && NODES[k].owner === id;
  const ownTalent = (k: string) => has(TALENT_NODES, k) && TALENT_NODES[k].owner === id;
  if (!shapeOk(tree, ownNode, (k) => NODES[k].node.maxRank) || !shapeOk(talents, ownTalent, (k) => TALENT_NODES[k].node.maxRank)) return false;
  if (!has(tree, freeNode(id))) return false;
  // The rules read only id, level, tree and talents of a member, so the rest is neutral; revisit if a rule ever reads gear.
  let m: Member = { id, level, exp: 0, hp: 0, tp: 0, equip: {}, tree: newTree(id), talents: {} };
  for (let progress = true; progress;) {
    progress = false;
    for (const node of Object.keys(tree)) {
      if (nodeRank(m, node) >= tree[node]) continue;
      const r = raiseNode(m, node, memories);
      if (r.ok) { m = r.member; progress = true; }
    }
  }
  for (let progress = true; progress;) {
    progress = false;
    for (const node of Object.keys(talents)) {
      if ((m.talents[node] ?? 0) >= talents[node]) continue;
      const r = raiseTalent(m, node);
      if (r.ok) { m = r.member; progress = true; }
    }
  }
  return Object.keys(tree).length === Object.keys(m.tree).length && Object.keys(tree).every((k) => m.tree[k] === tree[k])
    && Object.keys(talents).length === Object.keys(m.talents).length && Object.keys(talents).every((k) => m.talents[k] === talents[k]);
}

/** The build back to its start: the free first rank held, nothing else spent, so every point is available again. */
export const resetBuild = (m: Member): Member => ({ ...m, tree: newTree(m.id), talents: {} });

/**
 * The hero's talents for a build: talentPoints(level) points, one at a time; a keystone of the build's keystones
 * (HERO_BUILDS, default DEFAULT_KEYSTONES.hero) when one can be taken, else the open normal node of lowest (rank, row, col) whose stat the build leans on, else any open normal node.
 */
export function heroTalents(level: number, build: HeroBuild = 'balanced'): Record<string, number> {
  const t: Record<string, number> = {};
  const keystones = (HERO_BUILDS[build].keystones ?? DEFAULT_KEYSTONES.hero).map((k) => BOARDS.hero.find((n) => n.keystone === k)!);
  const normal = BOARDS.hero.filter((n) => !n.keystone);
  const lean = HERO_BUILDS[build].talents;
  const lowest = (nodes: typeof normal) => nodes.filter((n) => talentBlocker('hero', n.id, t) === null)
    .sort((a, b) => rankOf(a, t) - rankOf(b, t) || a.row - b.row || a.col - b.col)[0];
  for (let p = talentPoints(level, 'hero'); p > 0; p--) {
    const pick = keystones.find((n) => talentBlocker('hero', n.id, t) === null)
      ?? lowest(normal.filter((n) => n.stat && lean.includes(n.stat))) ?? lowest(normal);
    if (!pick) break;
    t[pick.id] = rankOf(pick, t) + 1;
  }
  return t;
}
