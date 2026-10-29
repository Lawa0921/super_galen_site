import { describe, it, expect } from 'vitest';
import { advance, danger, ENCOUNTER_MAX, ENCOUNTER_PACE, YELLOW_AT } from './encounter';
import { mulberry32, randInt, type Rng } from './rng';
import { FLOORS } from '../data/floors';
import { terrainOf } from './dungeon/run';
import type { RegionId } from '../data/regions';

const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]; };

describe('danger', () => {
  it('maps the value to the indicator colour', () => {
    expect(danger(0)).toBe('green');
    expect(danger(39)).toBe('green');
    expect(danger(40)).toBe('yellow');
    expect(danger(74)).toBe('yellow');
    expect(danger(75)).toBe('red');
  });
});

describe('advance', () => {
  it('adds a step amount below the yellow line without rolling (a gain of 10 at the 0.7 pace is 7)', () => {
    expect(advance(0, seq(0.5), [6, 14])).toEqual({ value: 7, encounter: false });
  });
  it('always triggers at the cap and resets', () => {
    expect(advance(95, seq(0.5), [6, 14])).toEqual({ value: 0, encounter: true });
  });
  it('rolls once past the yellow line', () => {
    expect(advance(50, seq(0, 0), [6, 14])).toEqual({ value: 0, encounter: true });
    expect(advance(50, seq(0, 0.99), [6, 14])).toEqual({ value: 54, encounter: false });
  });
  it('scales the gain by the modifier (stealth) on top of the pace', () => {
    expect(advance(0, seq(0.5), [6, 14], 0.5)).toEqual({ value: 4, encounter: false });
  });
  it('scales the yellow-zone roll by the pace too', () => {
    // At 80 the old roll was (80 - 40) / 120 = 0.333; at the 0.7 pace it is 0.233, so a draw of 0.3 no longer triggers.
    expect(advance(76, seq(0, 0.3), [6, 6])).toEqual({ value: 80, encounter: false });
    expect(advance(76, seq(0, 0.2), [6, 6])).toEqual({ value: 0, encounter: true });
  });
  it('draws the same way per step: one gain draw, plus one roll only at or past the yellow line', () => {
    let n = 0;
    const counted = (r: Rng): Rng => () => { n++; return r(); };
    advance(0, counted(seq(0.5)), [6, 14]);
    expect(n).toBe(1);
    n = 0;
    advance(YELLOW_AT, counted(seq(0.5, 0.99)), [6, 14]);
    expect(n).toBe(2);
  });
});

/** The gauge rule before the 2026-10-29 pace ruling, kept here as the yardstick. */
function oldAdvance(value: number, rng: Rng, rate: [number, number], modifier = 1): { value: number; encounter: boolean } {
  const v = Math.min(ENCOUNTER_MAX, value + Math.round(randInt(rng, rate[0], rate[1]) * modifier));
  if (v >= ENCOUNTER_MAX) return { value: 0, encounter: true };
  if (v >= YELLOW_AT && rng() < (v - YELLOW_AT) / 120) return { value: 0, encounter: true };
  return { value: v, encounter: false };
}

/** Mean steps per encounter over 300 seeds x 1500 steps. */
function meanSteps(step: typeof advance, rate: [number, number], modifier: number): number {
  let steps = 0, fights = 0;
  for (let s = 1; s <= 300; s++) {
    const rng = mulberry32(s * 7919);
    let v = 0;
    for (let i = 0; i < 1500; i++) {
      const g = step(v, rng, rate, modifier);
      v = g.value;
      steps++;
      if (g.encounter) fights++;
    }
  }
  return steps / fights;
}

describe('encounter pace (2026-10-29, 使用者：「目前遇敵的機率有點太高了」→ about 30% fewer encounters)', () => {
  it('is one named knob at 0.7', () => {
    expect(ENCOUNTER_PACE).toBe(0.7);
  });
  const cases: [string, RegionId, number][] = [
    ['mainline floor 1', 'mainline', 1], ['mainline depth 12', 'mainline', 12], ['frost region depth 7', 'frost', 7], ['blaze region depth 10', 'blaze', 10],
  ];
  // 1: no modifier; 0.8: a foggy dive; 0.5: stealth (encounterDown); 0.3: stealth on a calm dive (0.5 x 0.6).
  for (const [label, region, depth] of cases) {
    for (const modifier of [1, 0.8, 0.5, 0.3]) {
      it(`${label} x${modifier}: about 1/0.7 (1.43x) the old steps per encounter`, () => {
        const rate = FLOORS[terrainOf(region, depth) - 1].rate;
        const before = meanSteps(oldAdvance, rate, modifier);
        const after = meanSteps(advance, rate, modifier);
        const msg = `${label} x${modifier}: ${before.toFixed(2)} -> ${after.toFixed(2)} steps`;
        expect(after / before, msg).toBeGreaterThanOrEqual(1.36);
        expect(after / before, msg).toBeLessThanOrEqual(1.52);
      });
    }
  }
});
