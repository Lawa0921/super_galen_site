import { randInt, type Rng } from './rng';

export type Danger = 'green' | 'yellow' | 'red';
export const YELLOW_AT = 40;
export const RED_AT = 75;
export const ENCOUNTER_MAX = 100;
/**
 * How fast the gauge fills, everywhere: every floor, every region, under every modifier. 2026-10-29 the user found
 * encounters too frequent (「目前遇敵的機率有點太高了，我覺得要調降一些」); the ruling (roguelike dungeon spec §0) is about
 * 30% fewer, so the gain of each step and the yellow-zone roll both scale by 0.7 and the mean steps per encounter grow by
 * about 1/0.7. The draws stay as they were: one gain draw per step, one roll only at or past the yellow line.
 */
export const ENCOUNTER_PACE = 0.7;

export function danger(value: number): Danger {
  return value >= RED_AT ? 'red' : value >= YELLOW_AT ? 'yellow' : 'green';
}

export function advance(value: number, rng: Rng, rate: [number, number], modifier = 1): { value: number; encounter: boolean } {
  const v = Math.min(ENCOUNTER_MAX, value + Math.round(randInt(rng, rate[0], rate[1]) * modifier * ENCOUNTER_PACE));
  if (v >= ENCOUNTER_MAX) return { value: 0, encounter: true };
  if (v >= YELLOW_AT && rng() < ((v - YELLOW_AT) / 120) * ENCOUNTER_PACE) return { value: 0, encounter: true };
  return { value: v, encounter: false };
}
