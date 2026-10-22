/**
 * Builds at work (spec §16, plan 8h Task 3): the tree, talents and sockets a build lays out at a level, the policy a member
 * follows, and the policy's words. Pure: nothing here draws or changes what it is given.
 */
import { BUILDS, buildOf, type BuildDef } from '../data/builds';
import { RUNES, RUNE_SLOT_LEVELS, runeKey, tiersOf, type RuneId, type RuneRef, type RuneTier } from '../data/runes';
import { RUNE_STOCK } from '../data/runeEconomy';
import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { PolicyRule, PolicyTable } from './policy';
import { heroTalents, heroTree, learnedSkills, memoriesOf, talentsFor, treeFor } from './progression';
import { MAX_LEVEL } from './party';
import type { GameState } from './state';
import { clampToMax, respecPrice } from './town';
import { bagCount, socketCount, socketRune, socketable, type SocketFail } from './sockets';
import { chainLength } from '../data/story/chains';
import type { CharacterId, Member, Party } from './types';
import type { Action, BattleState } from './battle';
import { choose } from './sim';

/** The tree `b` lays out for `id` at `level` (the hero's from his HERO_BUILDS build). */
export function buildTree(id: CharacterId, level: number, b: BuildDef, memories = 0): Record<string, number> {
  if (id === 'hero') return heroTree(level, b.hero ?? 'balanced', memories);
  return treeFor(id, level, memories, { first: b.first, sides: b.sides, capstone: b.capstone });
}

/** The talents `b` lays out for `id` at `level` (the hero's from his HERO_BUILDS build). */
export function buildTalents(id: CharacterId, level: number, b: BuildDef): Record<string, number> {
  if (id === 'hero') return heroTalents(level, b.hero ?? 'balanced');
  return talentsFor(id, level, { talents: b.talents, keystones: b.keystones });
}

/**
 * The runes `b` suggests for `m`, as her sockets would hold them: only skills she can socket now (`socketable`), each its
 * first `socketCount(level)` runes, at `tier` (a legendary rune at its one tier).
 */
export function buildSockets(m: Member, b: BuildDef, tier: RuneTier): Record<string, (RuneRef | null)[]> {
  const open = socketCount(m.level);
  const out: Record<string, (RuneRef | null)[]> = {};
  for (const skill of socketable(m)) {
    const ids = (b.runes[skill] ?? []).slice(0, open);
    if (ids.length) out[skill] = ids.map((id) => ({ id, tier: RUNES[id].group === 'legendary' ? tiersOf(id)[0] : tier }));
  }
  return out;
}

/** The policy `m` follows: her build's (`m.build`), else the standard one. */
export function policyOf(m: Member): readonly PolicyRule[] {
  const b = m.build === undefined ? undefined : buildOf(m.id, m.build);
  return (b ?? BUILDS[m.id][0]).policy;
}

/** Every roster member's policy, as `choose` reads a table. */
export function partyPolicies(p: Party): PolicyTable {
  return Object.fromEntries((Object.keys(p.roster) as CharacterId[]).map((id) => [id, policyOf(p.roster[id])]));
}

const nameOf = (skill: string): string => SKILLS[skill]?.name ?? skill;

/** One sentence for one rule, from its own numbers and names. */
function ruleText(r: PolicyRule): string {
  const R = T.build.rule;
  switch (r.kind) {
    case 'ensure-barrier': return R.ensureBarrier(r.skills.map(nameOf), !!r.big, r.below);
    case 'ensure-device': return R.ensureDevice(r.skills.map(nameOf), !!r.big);
    case 'ensure-mark': return R.ensureMark(nameOf(r.skill), !!r.big, r.below);
    case 'alternate': return R.alternate(!!r.repeat);
    case 'spend-at': return R.spendAt(T.build.gauge[r.gauge], r.min, nameOf(r.skill), r.of === 'maxHp');
    case 'heal-below': return R.healBelow(r.pct);
    case 'strongest-damage': return R.strongest(!!r.aoe);
    case 'ensure-taunt': return R.ensureTaunt(nameOf(r.skill));
    case 'ensure-cover': return R.ensureCover(nameOf(r.skill));
    case 'release-at': return R.releaseAt(r.min, nameOf(r.skill));
    case 'at-phase': return R.atPhase(T.mech.phase[r.phase], nameOf(r.skill));
    case 'execute-below': return R.executeBelow(r.pct, nameOf(r.skill));
    case 'cast-unless-last': return R.castUnlessLast(nameOf(r.skill));
    case 'cast-when': return R.castWhen(nameOf(r.skill), !!r.big, !!r.whileAbsent);
    case 'echo': return r.min === undefined ? R.echo : R.echoAt(r.min);
  }
}

/** The policy of `b` in words, one sentence a rule; a build with no rules has the one sentence of the plain player. */
export function policyText(b: BuildDef): string[] {
  return b.policy.length ? b.policy.map(ruleText) : [T.build.rule.none];
}

/** `b`'s line as the screens show it: its suggested level after it when it has one (ruling E2: 「建議 Lv N 以上」). */
export function pitchOf(b: BuildDef): string {
  return b.minLevel === undefined ? b.intro : `${b.intro}${T.build.minLevel(b.minLevel)}`;
}

/** A suggested rune the bag does not hold, and where one is found (plan 8h ruling 12). */
/**
 * A suggested rune the bag does not hold, and where one is found (`from`); or one the slot refused (`refused`: 常駐's TP
 * reserve, or a clash with a rune already on the skill), which no shop would mend.
 */
export type MissingRune = { skill: string; id: RuneId; from: 'shop' | 'drop' | 'legendary' } | { skill: string; id: RuneId; refused: SocketFail };
/**
 * A suggested rune whose slot or skill is not open yet: the level it opens at, or (the hero's abyss skills) the memories
 * it waits for.
 */
export type LaterRune = { skill: string; id: RuneId; level: number } | { skill: string; id: RuneId; memories: number };

/** Where a rune is found: Orik's shop sells it, monsters and chests drop it, or (a legendary) elites and bosses. */
export function runeSource(id: RuneId): 'shop' | 'drop' | 'legendary' {
  if ((RUNE_STOCK as readonly RuneId[]).includes(id)) return 'shop';
  return RUNES[id].group === 'legendary' ? 'legendary' : 'drop';
}

const sameRecord = (a: Record<string, number>, b: Record<string, number>): boolean =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

/** The best tier of `id` in the bag (legendary at its one), or null. */
function bestInBag(s: Pick<GameState, 'runes'>, id: RuneId): RuneRef | null {
  for (const tier of [...tiersOf(id)].reverse()) if (bagCount(s, { id, tier }) > 0) return { id, tier };
  return null;
}

/** `m` laid out by `b` at her level: the tree (her memories counted) and the talents. */
const laidOut = (m: Member, b: BuildDef): { tree: Record<string, number>; talents: Record<string, number> } =>
  ({ tree: buildTree(m.id, m.level, b, memoriesOf(m)), talents: buildTalents(m.id, m.level, b) });

/** Whether any point of `now` would have to move to reach `to` (a node or talent `to` holds fewer ranks of). */
const moves = (now: Record<string, number>, to: Record<string, number>): boolean => Object.keys(now).some((k) => (to[k] ?? 0) < now[k]);

/** Each worn rune, by its key, and how many of it. */
function wornCounts(m: Member): Record<string, number> {
  const out: Record<string, number> = {};
  for (const cells of Object.values(m.sockets ?? {})) for (const r of cells) if (r) out[runeKey(r)] = (out[runeKey(r)] ?? 0) + 1;
  return out;
}

/**
 * `b` laid out on `id` (plan 8h ruling 12), gold aside: her tree and talents become the build's at her level; every rune
 * she wears goes back to the bag; then, skill by skill in the build's order, each open slot takes the best tier of its
 * suggested rune the bag holds. Nothing is taken from a teammate. Never changes `s`.
 */
function lay(s: GameState, id: CharacterId, b: BuildDef): { state: GameState; placed: RuneRef[]; missing: MissingRune[]; later: LaterRune[] } {
  const n = structuredClone(s);
  const old = n.party.roster[id];
  const member: Member = { ...old, ...laidOut(old, b), build: b.key };
  if (moves(old.tree, member.tree) || moves(old.talents, member.talents)) delete member.freeRespec;
  // Every rune she wears back to the bag.
  const runes = { ...n.runes };
  for (const [k, c] of Object.entries(wornCounts(old))) runes[k] = (runes[k] ?? 0) + c;
  delete member.sockets;
  clampToMax(member);
  let state: GameState = { ...n, runes, party: { ...n.party, roster: { ...n.party.roster, [id]: member } } };
  const placed: RuneRef[] = [], missing: MissingRune[] = [], later: LaterRune[] = [];
  const known = socketable(member);
  const open = socketCount(member.level);
  for (const [skill, ids] of Object.entries(b.runes)) {
    const opensAt = known.includes(skill) ? { level: member.level } : learnedAt(member, b, skill);
    ids.forEach((rid, slot) => {
      if (!known.includes(skill) || slot >= open) {
        later.push('memories' in opensAt ? { skill, id: rid, memories: opensAt.memories } : { skill, id: rid, level: Math.max(opensAt.level, RUNE_SLOT_LEVELS[slot]) });
        return;
      }
      const ref = bestInBag(state, rid);
      if (!ref) { missing.push({ skill, id: rid, from: runeSource(rid) }); return; }
      const put = socketRune(state, id, skill, slot, ref);
      if (put.ok) { state = put.state; placed.push(ref); } else missing.push({ skill, id: rid, refused: put.reason });
    });
  }
  return { state, placed, missing, later };
}

/**
 * What applying `key` to `id` would cost, and what it would change (the screen asks first when it costs, changes her
 * tree or talents, or takes a worn rune off its slot). `cost`: the respec's, only when a point she spent would move
 * (`moves`; a build that only adds to her points is free); a free respec pays. `changes`: her tree or talents differ.
 * `strips`: a rune she wears would not be back in the same slot afterwards (Task 7 review).
 */
export function applyCost(s: GameState, id: CharacterId, key: string): { cost: number; changes: boolean; moves: boolean; strips: boolean } | null {
  const m = s.party.roster[id];
  const b = buildOf(id, key);
  if (!m || !b || !s.party.recruited.includes(id)) return null;
  const { tree, talents } = laidOut(m, b);
  const changes = !sameRecord(tree, m.tree) || !sameRecord(talents, m.talents);
  const moved = moves(m.tree, tree) || moves(m.talents, talents);
  const after = lay(s, id, b).state.party.roster[id];
  const strips = Object.entries(m.sockets ?? {}).some(([skill, cells]) => cells.some((r, i) => {
    const now = after.sockets?.[skill]?.[i];
    return !!r && !(now && now.id === r.id && now.tier === r.tier);
  }));
  return { cost: moved ? respecPrice(m) : 0, changes, moves: moved, strips };
}

/**
 * One-click apply (plan 8h ruling 12; the layout: `lay`), at `applyCost`'s price; a free respec pays and is used up.
 * `missing`: suggested runes the bag lacks, and where they are found; `later`: those whose slot or skill is not open yet,
 * with the level it opens; `returned`: how many of her worn runes ended in the bag. She follows the build from then on.
 * Never changes `s`; draws nothing.
 */
export function applyBuild(s: GameState, id: CharacterId, key: string):
  { ok: true; state: GameState; cost: number; placed: RuneRef[]; missing: MissingRune[]; later: LaterRune[]; returned: number } | { ok: false; reason: 'invalid' | 'gold' } {
  const price = applyCost(s, id, key);
  if (!price) return { ok: false, reason: 'invalid' };
  if (s.gold < price.cost) return { ok: false, reason: 'gold' };
  const r = lay(s, id, buildOf(id, key)!);
  const worn = wornCounts(s.party.roster[id]);
  const kept = wornCounts(r.state.party.roster[id]);
  const returned = Object.entries(worn).reduce((t, [k, c]) => t + Math.max(0, c - (kept[k] ?? 0)), 0);
  return { ok: true, state: { ...r.state, gold: r.state.gold - price.cost }, cost: price.cost, placed: r.placed, missing: r.missing, later: r.later, returned };
}

/**
 * When `b` has `m` know `skill`: the first level at or above hers, with her memories; else (the hero's abyss skills, Task 6
 * review I1) the fewest memories with which some level does.
 */
function learnedAt(m: Member, b: BuildDef, skill: string): { level: number } | { memories: number } {
  const knows = (L: number, mem: number) => learnedSkills({ ...m, level: L, tree: buildTree(m.id, L, b, mem) }).includes(skill);
  for (let L = m.level; L <= MAX_LEVEL; L++) if (knows(L, memoriesOf(m))) return { level: L };
  for (let mem = memoriesOf(m) + 1; mem <= chainLength(m.id); mem++) if (knows(MAX_LEVEL, mem)) return { memories: mem };
  return { level: MAX_LEVEL };
}

/**
 * Following at a level-up (plan 8h ruling 13): each of `ids` who follows a build takes its tree and talents at her level,
 * and each slot that is open and empty on a suggested skill takes the best of its rune in the bag; what she wears stays.
 * Members who follow nothing are left as they are; with nothing to change, the same object comes back. Draws nothing.
 */
export function followUp(s: GameState, ids: readonly CharacterId[]): GameState {
  let state = s;
  for (const id of ids) {
    const m = state.party.roster[id];
    const b = m?.build === undefined ? undefined : buildOf(id, m.build);
    if (!m || !b) continue;
    const { tree, talents } = laidOut(m, b);
    if (!sameRecord(tree, m.tree) || !sameRecord(talents, m.talents)) {
      state = { ...state, party: { ...state.party, roster: { ...state.party.roster, [id]: { ...m, tree, talents } } } };
    }
    const now = state.party.roster[id];
    const known = socketable(now);
    const open = socketCount(now.level);
    for (const [skill, rids] of Object.entries(b.runes)) {
      if (!known.includes(skill)) continue;
      rids.forEach((rid, slot) => {
        if (slot >= open || state.party.roster[id].sockets?.[skill]?.[slot]) return;
        const ref = bestInBag(state, rid);
        const put = ref && socketRune(state, id, skill, slot, ref);
        if (put && put.ok) state = put.state;
      });
    }
  }
  return state;
}

/**
 * The battle's 「自動」 (plan 8h ruling 15): what each of `who` does this round, by the party's policies (each member's
 * followed build, else her standard one): `choose`, kept to `who`, so commands already given stay. A full gauge fires the
 * ultimate first (choose). Draws nothing.
 */
export function autoActions(s: BattleState, p: Party, who: readonly string[]): Record<string, Action> {
  const all = choose(s, p, partyPolicies(p));
  return Object.fromEntries(who.flatMap((k) => (all[k] ? [[k, all[k]]] : [])));
}
