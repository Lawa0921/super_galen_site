/**
 * Builds at work (spec §16, plan 8h Task 3): the tree, talents and sockets a build lays out at a level, the policy a member
 * follows, and the policy's words. Pure: nothing here draws or changes what it is given.
 */
import { BUILDS, buildOf, type BuildDef } from '../data/builds';
import { RUNES, tiersOf, type RuneRef, type RuneTier } from '../data/runes';
import { SKILLS } from '../data/skills';
import { T } from '../data/text.zh-TW';
import type { PolicyRule, PolicyTable } from './policy';
import { heroTalents, heroTree, talentsFor, treeFor } from './progression';
import { socketCount, socketable } from './sockets';
import type { CharacterId, Member, Party } from './types';

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
