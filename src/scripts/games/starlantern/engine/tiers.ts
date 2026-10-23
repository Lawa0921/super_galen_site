/**
 * The difficulty tiers' draws (difficulty plan Task 3, ruling 6): an elite's or a boss's affixes come from a stream of
 * their own keyed by the spot, so the same run meets the same affixes at the same spot however often it comes back
 * (fleeing, a reload). No counter, nothing on `Run`; `game.rng`, the loot and rune streams never draw for them.
 */
import { AFFIX_EXCLUDE, AFFIX_IDS, type AffixId } from '../data/affixes';
import { mix } from './loot/drops';
import { mulberry32, type Rng } from './rng';
import type { Pos } from './types';

/** The affixes' salt: SHA-256's second initial word, used nowhere else in the engine. */
export const AFFIX_SALT = 0xbb67ae85;

/**
 * The affix stream: an elite's at `at` is `mix(mix(mix(seed ^ AFFIX_SALT, depth), x), y)` (as a spot's rune); a boss's,
 * one to a depth, `mix(seed ^ AFFIX_SALT, depth)`.
 */
export function affixRng(seed: number, depth: number, at?: Pos): Rng {
  const d = mix(seed ^ AFFIX_SALT, depth);
  return mulberry32(at ? mix(mix(d, at.x), at.y) : d);
}

/**
 * `n` different affixes from the stream of (seed, depth, at), drawn without putting back; none for 0. An affix drawn takes
 * its `exclude` partners (data/affixes.ts AFFIX_EXCLUDE) out of the pool with it.
 */
export function rollAffixes(seed: number, depth: number, n: number, at?: Pos, exclude: readonly (readonly [AffixId, AffixId])[] = AFFIX_EXCLUDE): AffixId[] {
  if (n <= 0) return [];
  const rng = affixRng(seed, depth, at);
  let pool = [...AFFIX_IDS];
  const out: AffixId[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    const a = pool.splice(Math.floor(rng() * pool.length), 1)[0];
    out.push(a);
    pool = pool.filter((b) => !exclude.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
  }
  return out;
}

/** A crowd's affix (controller ruling 2026-10-23): the foe `floor(pick x foes)` of the fight wears `id`. */
export interface CrowdAffix { pick: number; id: AffixId }

/**
 * Whether a plain crowd met at `at` has one foe with an affix, at `chance` (Hell's `crowdAffixChance`), and which: the
 * spot's affix stream (as an elite's) draws the chance, then the pick, then the affix. No counter: the same spot always
 * gives the same answer at the same chance.
 */
export function rollCrowdAffix(seed: number, depth: number, at: Pos, chance: number): CrowdAffix | undefined {
  if (chance <= 0) return undefined;
  const rng = affixRng(seed, depth, at);
  if (rng() >= chance) return undefined;
  const pick = rng();
  return { pick, id: AFFIX_IDS[Math.floor(rng() * AFFIX_IDS.length)] };
}
