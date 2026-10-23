/**
 * The difficulty tiers (spec §5.0, difficulty plan rulings 1–2): one table, one way in. Every multiplier of Nightmare and
 * Hell lives in TIERS; code reads it only through `tierOf`, which gives null for Normal (or no difficulty), so a Normal
 * fight neither multiplies by 1 nor draws once more: callers take the new path only `if (t)`. The `normal` row is the
 * identity, read by the tests and the handbook only.
 */
import type { Difficulty } from '../engine/battle';

/**
 * One tier. Enemies: `hp`, `atk` (atk and mag) multipliers; skill chances `max(chance, min(chanceCap, chance x
 * chanceMul))`; `rider` the chance of a region skill's extra ailment; `eliteAffixes` / `bossAffixes` how many affixes an
 * elite / a boss carries. Rewards: `reward` on exp and gold. Drops: `runeDrop` on the rune drop chance, `runeTierMul` the
 * rune tier multiplier (`difficultyMul`), `runeLegendary` on the legendary rune odds, `rarityMul` on the rare and epic gear
 * weights, `legendaryShareMul` on the legendary gear share (capped at `legendaryCap`), `ilvl` added to the item level,
 * `starlitMul` on the starlit chance and its cap. `crowdAffixChance` (controller ruling 2026-10-23): the chance a plain crowd
 * fight has one foe wearing one affix (Hell only).
 */
export interface TierDef {
  hp: number; atk: number; chanceMul: number; chanceCap: number; rider: number; eliteAffixes: number; bossAffixes: number;
  reward: number; runeDrop: number; runeTierMul: number; runeLegendary: number; rarityMul: number; legendaryShareMul: number;
  legendaryCap: number; ilvl: number; starlitMul: number; crowdAffixChance: number;
}

/** The tiers; the starting proposal of spec §5.0 (difficulty plan Task 5b may move only the enemy fields of the two higher rows). */
export const TIERS: Record<Difficulty, TierDef> = {
  // The identity: multipliers 1; the rider, affix counts, item level bonus, chance cap and crowd affix chance 0; no legendary cap.
  normal: {
    hp: 1, atk: 1, chanceMul: 1, chanceCap: 0, rider: 0, eliteAffixes: 0, bossAffixes: 0, reward: 1, runeDrop: 1, runeTierMul: 1,
    runeLegendary: 1, rarityMul: 1, legendaryShareMul: 1, legendaryCap: 1, ilvl: 0, starlitMul: 1, crowdAffixChance: 0,
  },
  nightmare: {
    hp: 1.35, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, rider: 0.25, eliteAffixes: 1, bossAffixes: 1, reward: 1.25, runeDrop: 1.25,
    runeTierMul: 1.5, runeLegendary: 1.5, rarityMul: 1.3, legendaryShareMul: 1.3, legendaryCap: 0.5, ilvl: 4, starlitMul: 1.5, crowdAffixChance: 0,
  },
  hell: {
    hp: 1.8, atk: 1.4, chanceMul: 2, chanceCap: 0.75, rider: 0.4, eliteAffixes: 2, bossAffixes: 2, reward: 1.5, runeDrop: 1.5,
    runeTierMul: 3, runeLegendary: 2, rarityMul: 1.6, legendaryShareMul: 1.6, legendaryCap: 0.5, ilvl: 8, starlitMul: 2, crowdAffixChance: 0.5,
  },
};

/** The tier a difficulty plays at: null for Normal and for no difficulty (ruling 1: Normal takes no new path). */
export function tierOf(d: Difficulty | undefined): TierDef | null {
  return d === undefined || d === 'normal' ? null : TIERS[d];
}
