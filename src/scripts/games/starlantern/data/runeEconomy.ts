import type { RuneId, RuneTier } from './runes';

/**
 * The rune economy (spec §6.5, plan 8f): drop chances, the shop's stock and prices, and what a fusion costs. Numbers
 * only; engine/loot/runes.ts rolls the drops and engine/runeTrade.ts trades. Not frozen: a test may overwrite a value for
 * a moment and put it back (like STARLIT_CHANCE).
 */

/** The chance one foe, chest, vault or elite drops a rune (plan 8f ruling 1, 3). A boss always drops one. */
export const RUNE_DROP: Record<'monster' | 'chest' | 'vault' | 'elite', number> = { monster: 0.03, chest: 0.10, vault: 0.10, elite: 0.25 };

/** The chance a rune an elite or a boss drops is legendary (plan 8f ruling 1: fixed, not on the rarityWeights curve). */
export const RUNE_LEGENDARY: Record<'elite' | 'boss', number> = { elite: 0.02, boss: 0.08 };

/** The runes Orik sells once runes are open, all of the common tier (plan 8f ruling 8). */
export const RUNE_STOCK: readonly RuneId[] = ['spread', 'multistrike', 'thrift', 'extend'];

/** What the shop asks for a rune, by tier, before Orik's discount; only the common tier is sold. */
export const RUNE_BUY: Partial<Record<RuneTier, number>> = { common: 100 };

/** What the shop pays for a rune, by tier; never discounted. */
export const RUNE_SELL: Record<RuneTier, number> = { common: 25, magic: 60, rare: 150, epic: 350, legendary: 500 };

/** Three runes of one id and tier make one of the next tier for this gold and one essence (plan 8f ruling 9). */
export const RUNE_FUSE: Record<'common' | 'magic' | 'rare', { to: RuneTier; gold: number; essence: string }> = {
  common: { to: 'magic', gold: 30, essence: 'essence-common' },
  magic: { to: 'rare', gold: 80, essence: 'essence-magic' },
  rare: { to: 'epic', gold: 200, essence: 'essence-rare' },
};
