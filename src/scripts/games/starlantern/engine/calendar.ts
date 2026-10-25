/**
 * The game's calendar (story-world spec §11.1, §12; time and moon plan rulings 1, 2, 6). A day is one departure (its return
 * and that night included) or one more night at the inn; it lives in the save as `story.day` and nothing here reads a real
 * clock. The moon turns once every four days, one phase a day; the season follows the story, not the days.
 * Pure arithmetic: only types come in, so the story modules may import it without a cycle (`calendarOf` in
 * `story/events.ts` hands in the stage).
 */
import type { MoonPhase, Season } from '../data/story/chains';
import type { Stage } from '../data/story/scenes';
import type { GameState } from './state';

/** The phases in the order the nights see them. */
export const MOON_ORDER: readonly MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
/** Where day 0 (the prologue's night) falls in `MOON_ORDER`: a full moon. */
export const MOON_EPOCH = 2;
/** The last day, as `MAX_PITY`: a long game never writes a save that will not load. */
export const MAX_DAY = 999999;
/** From the finale's clear to spring: one turn of the moon (ruling 6). */
export const SPRING_AFTER = 4;

/** Today: the save's day; a new game has none written and reads as day 1. */
export const dayOf = (s: GameState): number => s.story.day ?? 1;

/** The day after `day`, stopping at MAX_DAY. */
export const nextDay = (day: number): number => Math.min(MAX_DAY, day + 1);

/** The moon of a day: its departure and the night that ends it. Any whole number, negatives too. */
export const moonOf = (day: number): MoonPhase => MOON_ORDER[(((day + MOON_EPOCH) % 4) + 4) % 4];

/**
 * Tonight's moon: the night being told is the day before today's, since a return has already moved the day on (and the
 * night before the descent, told on a departure or in the finale, is the night before as well). A new game's first
 * night is day 0's: a full moon.
 */
export const tonightMoon = (s: GameState): MoonPhase => moonOf(dayOf(s) - 1);

/**
 * The season (ruling 6): autumn through Act 2, winter from Act 3 to the finale and after it, until `springDay`; spring
 * from that day on, and it stays. A cleared finale with no `springDay` written reads as spring already.
 */
export function seasonAt(stage: Stage, day: number, finaleCleared: boolean, springDay?: number): Season {
  if (stage === 'prologue' || stage === 'act1' || stage === 'act2') return 'autumn';
  if (stage === 'after' || finaleCleared) return springDay === undefined || day >= springDay ? 'spring' : 'winter';
  return 'winter';
}
