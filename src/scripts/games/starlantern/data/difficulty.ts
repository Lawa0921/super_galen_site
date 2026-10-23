/**
 * The difficulty tiers (spec §5.0, difficulty plan rulings 1–2): one table, one way in. Every multiplier of Nightmare and
 * Hell lives in TIERS; code reads it only through `tierOf`, which gives null for Normal (or no difficulty), so a Normal
 * fight neither multiplies by 1 nor draws once more: callers take the new path only `if (t)`. The `normal` row is the
 * identity, read by the tests and the handbook only.
 */
import type { Difficulty } from '../engine/battle';

/**
 * The depth bands of a tier's enemy factors (controller ruling 2026-10-23): d10–14 (and anything shallower), d15–19,
 * d20–24, d25 on. One multiplier cannot fit a curve where a d15 boss falls in 7 rounds and a d25 one in 26–39.
 */
export const DEPTH_BANDS = [10, 15, 20, 25] as const;

/**
 * A tier's enemy factors over one depth band: `hp`, `atk` (atk and mag) multipliers; skill chances `max(chance,
 * min(chanceCap, chance x chanceMul))`; a boss's own `bossHp`, `bossAtk` on top (1 when left out; crowds and elites never).
 */
export interface DepthFactors { hp: number; atk: number; chanceMul: number; chanceCap: number; bossHp?: number; bossAtk?: number }

/**
 * One tier. Enemies: `enemy`, the factors of each DEPTH_BANDS band (`enemyFactors` reads a depth's); `rider` the chance of a region skill's extra ailment; `eliteAffixes` / `bossAffixes` how many affixes an
 * elite / a boss carries. Rewards: `reward` on exp and gold. Drops: `runeDrop` on the rune drop chance, `runeTierMul` the
 * rune tier multiplier (`difficultyMul`), `runeLegendary` on the legendary rune odds, `rarityMul` on the rare and epic gear
 * weights, `legendaryShareMul` on the legendary gear share (capped at `legendaryCap`), `ilvl` added to the item level,
 * `starlitMul` on the starlit chance and its cap. `crowdAffixChance` (controller ruling 2026-10-23): the chance a plain crowd
 * fight has one foe wearing one affix (Hell only).
 */
export interface TierDef {
  enemy: readonly DepthFactors[]; rider: number; eliteAffixes: number; bossAffixes: number;
  reward: number; runeDrop: number; runeTierMul: number; runeLegendary: number; rarityMul: number; legendaryShareMul: number;
  legendaryCap: number; ilvl: number; starlitMul: number; crowdAffixChance: number;
}

/**
 * The tiers; spec §5.0's starting proposal but for the enemy factors, which are Task 5b's depth table (the controller
 * ruling of 2026-10-23; Task 5b moves only those and `crowdAffixChance` of the two higher rows).
 */
export const TIERS: Record<Difficulty, TierDef> = {
  // The identity: multipliers 1; the rider, affix counts, item level bonus, chance cap and crowd affix chance 0; no legendary cap.
  normal: {
    enemy: DEPTH_BANDS.map(() => ({ hp: 1, atk: 1, chanceMul: 1, chanceCap: 0 })), rider: 0, eliteAffixes: 0, bossAffixes: 0, reward: 1, runeDrop: 1, runeTierMul: 1,
    runeLegendary: 1, rarityMul: 1, legendaryShareMul: 1, legendaryCap: 1, ilvl: 0, starlitMul: 1, crowdAffixChance: 0,
  },
  nightmare: {
    // d10–14, d15–19, d20–24, d25 on.
    enemy: [
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, bossHp: 1.5, bossAtk: 1.25 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6, bossHp: 0.85, bossAtk: 1.15 },
      { hp: 1.2, atk: 1.2, chanceMul: 1.5, chanceCap: 0.6 },
    ],
    rider: 0.25, eliteAffixes: 1, bossAffixes: 1, reward: 1.25, runeDrop: 1.25,
    runeTierMul: 1.5, runeLegendary: 1.5, rarityMul: 1.3, legendaryShareMul: 1.3, legendaryCap: 0.5, ilvl: 4, starlitMul: 1.5, crowdAffixChance: 0,
  },
  hell: {
    enemy: [
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75 },
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75, bossHp: 1.5, bossAtk: 1.25 },
      { hp: 1.2, atk: 1.2, chanceMul: 2, chanceCap: 0.75, bossHp: 0.85, bossAtk: 1.3 },
      { hp: 1.2, atk: 1.4, chanceMul: 2, chanceCap: 0.75 },
    ],
    rider: 0.4, eliteAffixes: 2, bossAffixes: 2, reward: 1.5, runeDrop: 1.5,
    runeTierMul: 3, runeLegendary: 2, rarityMul: 1.6, legendaryShareMul: 1.6, legendaryCap: 0.5, ilvl: 8, starlitMul: 2, crowdAffixChance: 0.5,
  },
};

/** The tier a difficulty plays at: null for Normal and for no difficulty (ruling 1: Normal takes no new path). */
export function tierOf(d: Difficulty | undefined): TierDef | null {
  return d === undefined || d === 'normal' ? null : TIERS[d];
}

/** The enemy factors of `t` at `depth`: its band in DEPTH_BANDS (the first for anything shallower than d15). */
export function enemyFactors(t: TierDef, depth: number): DepthFactors {
  let i = 0;
  for (let k = 1; k < DEPTH_BANDS.length; k++) if (depth >= DEPTH_BANDS[k]) i = k;
  return t.enemy[i];
}
