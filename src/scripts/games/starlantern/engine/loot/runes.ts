import type { ConditionId } from '../../data/conditions';
import { RUNE_LEGENDARY, RUNE_SELL } from '../../data/runeEconomy';
import { RUNE_IDS, RUNES, RUNE_STACK, runeKey, type RuneId, type RuneRef } from '../../data/runes';
import type { Run } from '../dungeon/run';
import { mulberry32, pick, type Rng } from '../rng';
import { ownedCount } from '../sockets';
import type { GameState } from '../state';
import type { Pos } from '../types';
import { mix, rarityWeights, rollTier } from './drops';
import type { DropSource } from './item';

/**
 * Rune drops (spec §6.5, plan 8f): which rune a drop is, the stream it draws from, and putting it in the bag. Pure; the
 * Game wires them to battles, chests and vaults. Whether a drop happens at all is the caller's draw (data/runeEconomy).
 */

/** Plan 8f: the salt of the rune stream (the eighth SHA-256 initial value; see the other salts in this engine). */
export const RUNE_SALT = 0x5be0cd19;

/** The runes an ordinary drop picks from, in RUNE_IDS order: every group but the legendary one (26). */
export const NORMAL_RUNES: readonly RuneId[] = RUNE_IDS.filter((id) => RUNES[id].group !== 'legendary');
/** The legendary runes, in RUNE_IDS order (6). */
export const LEGENDARY_RUNES: readonly RuneId[] = RUNE_IDS.filter((id) => RUNES[id].group === 'legendary');

type RollTier = 'common' | 'magic' | 'rare' | 'epic';

/**
 * The weights of a rune's four ordinary tiers: the gear's first four (`rarityWeights`, its legendary tier dropped), a boss
 * on the elite row (plan 8f ruling 1, after rollBossGear's second piece). Magic and up are multiplied by `difficultyMul`
 * (spec §13 point 4; always 1 for now, plan 8f ruling 11).
 */
export function runeTierWeights(source: DropSource, depthLv: number, cond: ConditionId, difficultyMul = 1): Record<RollTier, number> {
  const w = rarityWeights(source === 'boss' ? 'elite' : source, depthLv, cond);
  return { common: w.common, magic: w.magic * difficultyMul, rare: w.rare * difficultyMul, epic: w.epic * difficultyMul };
}

/**
 * Which rune one drop is. An elite or a boss first draws whether it is legendary (RUNE_LEGENDARY) and, if so, picks one
 * of LEGENDARY_RUNES; otherwise one weighted tier draw (runeTierWeights, as rollTier walks) and one pick of NORMAL_RUNES.
 * So a roll always takes the same number of draws for its outcome (plan 8f ruling 12).
 */
export function rollRune(rng: Rng, source: DropSource, depthLv: number, cond: ConditionId, difficultyMul = 1): RuneRef {
  if ((source === 'elite' || source === 'boss') && rng() < RUNE_LEGENDARY[source]) return { id: pick(rng, LEGENDARY_RUNES), tier: 'legendary' };
  const tier = rollTier(rng, { ...runeTierWeights(source, depthLv, cond, difficultyMul), legendaryTier: 0 }) as RollTier;
  return { id: pick(rng, NORMAL_RUNES), tier };
}

/** A fresh rng for one battle's rune drops, on the rune stream (never `game.rng`, `lootRng` or `memoryRng`). */
export function runeRng(run: Run): Rng {
  return mulberry32(mix(run.seed ^ RUNE_SALT, run.runeDraws++));
}

/** The rune stream of a chest or vault at `at` on `depth`: fixed by the spot, so reopening one rolls the same; changes nothing. */
export function spotRuneRng(run: Run, depth: number, at: Pos): Rng {
  return mulberry32(mix(mix(mix(run.seed ^ RUNE_SALT, depth), at.x), at.y));
}

/**
 * One rune into the bag. When the player already owns RUNE_STACK of it (bag and sockets, `ownedCount`), it turns into its
 * sell price instead, paid straight into `state.gold` (plan 8f ruling 7). Never changes `s`.
 */
export function grantRune(s: GameState, r: RuneRef): { state: GameState; gold: number } {
  if (ownedCount(s, r) >= RUNE_STACK) {
    const gold = RUNE_SELL[r.tier];
    return { state: { ...s, gold: s.gold + gold }, gold };
  }
  const k = runeKey(r);
  return { state: { ...s, runes: { ...s.runes, [k]: (s.runes?.[k] ?? 0) + 1 } }, gold: 0 };
}
