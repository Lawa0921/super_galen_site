/**
 * The difficulty tiers' draws (difficulty plan Task 3, ruling 6): an elite's or a boss's affixes come from a stream of
 * their own keyed by the spot, so the same run meets the same affixes at the same spot however often it comes back
 * (fleeing, a reload). No counter, nothing on `Run`; `game.rng`, the loot and rune streams never draw for them.
 */
import { AFFIX_IDS, type AffixId } from '../data/affixes';
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

/** `n` different affixes from the stream of (seed, depth, at), drawn without putting back; none for 0. */
export function rollAffixes(seed: number, depth: number, n: number, at?: Pos): AffixId[] {
  if (n <= 0) return [];
  const rng = affixRng(seed, depth, at);
  const pool = [...AFFIX_IDS];
  const out: AffixId[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}
