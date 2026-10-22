import { randInt, type Rng } from './rng';

export type Danger = 'green' | 'yellow' | 'red';
export const YELLOW_AT = 40;
export const RED_AT = 75;
export const ENCOUNTER_MAX = 100;

export function danger(value: number): Danger {
  return value >= RED_AT ? 'red' : value >= YELLOW_AT ? 'yellow' : 'green';
}

export function advance(value: number, rng: Rng, rate: [number, number], modifier = 1): { value: number; encounter: boolean } {
  const v = Math.min(ENCOUNTER_MAX, value + Math.round(randInt(rng, rate[0], rate[1]) * modifier));
  if (v >= ENCOUNTER_MAX) return { value: 0, encounter: true };
  if (v >= YELLOW_AT && rng() < (v - YELLOW_AT) / 120) return { value: 0, encounter: true };
  return { value: v, encounter: false };
}
