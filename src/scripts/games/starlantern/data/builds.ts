/**
 * The suggested builds (spec §16, plan 8h): for each character a "standard" build and the rune builds after it. One build
 * serves three ends: the tree and talents a click lays out, the runes it suggests for each skill, and the policy that drives
 * both the sim and the battle's 「自動」. The standard build is the default tree, talents and policy (engine/builds.test),
 * so wearing it changes nothing anywhere. A build's name and line are content, like a skill's name; its policy words are
 * made from its rules (engine/builds.ts policyText), never written twice.
 */
import type { PolicyRule } from '../engine/policy';
import type { AnyStat, CharacterId } from '../engine/types';
import { CHARACTER_IDS } from './characters';
import type { HeroBuild } from './hero';
import { DEFAULT_POLICIES } from './policies';
import type { RuneId } from './runes';
import type { KeystoneId } from './talents';
import { T } from './text.zh-TW';

/** Where a build is measured to shine (plan 8h ruling 7): a boss, a crowd, or a long fight. */
export type BuildScenario = 'boss' | 'crowd' | 'long';

/**
 * One build. `first`: nodes learned before the default order reaches them; `sides`: B sides taken in place of their A
 * sides; `capstone`: the branch whose ultimate it takes; `talents` / `keystones`: the stats its normal talent nodes lean
 * on and its keystones; `runes`: the runes it suggests per skill, slot by slot; `hero`: the hero's HERO_BUILDS tree and
 * talents (his builds take those, not the fields above).
 */
export interface BuildDef {
  key: string; owner: CharacterId; name: string; intro: string;
  hero?: HeroBuild; first?: string[]; sides?: string[]; capstone?: number; talents?: AnyStat[]; keystones?: KeystoneId[];
  runes: Readonly<Record<string, readonly RuneId[]>>;
  policy: readonly PolicyRule[];
  scenario?: BuildScenario;
}

/** A character's standard build: the default tree, talents and policy, no runes. */
const standard = (owner: CharacterId): BuildDef => ({
  key: 'standard', owner, name: T.build.standard.name, intro: T.build.standard.intro, runes: {},
  policy: DEFAULT_POLICIES[owner] ?? [], ...(owner === 'hero' ? { hero: 'balanced' as const } : {}),
});

/** Each character's builds, the standard one first. */
export const BUILDS: Record<CharacterId, readonly BuildDef[]> = Object.fromEntries(
  CHARACTER_IDS.map((id): [CharacterId, readonly BuildDef[]] => [id, [standard(id)]]),
) as Record<CharacterId, readonly BuildDef[]>;

/** `id`'s build `key`, if there is one. */
export function buildOf(id: CharacterId, key: string): BuildDef | undefined {
  return BUILDS[id]?.find((b) => b.key === key);
}
