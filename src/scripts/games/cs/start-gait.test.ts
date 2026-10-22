import { describe, expect, it } from 'vitest';
import { createStartGaitPlan, sampleStartGait } from './start-gait';
import { createStopGaitPlan, sampleStopGait, type StopFeet } from './stop-gait';
import { WALK_GAIT, RUN_GAIT, sampleSteadyFoot } from './steady-gait';

const idle = (body = 5, offset = 0): StopFeet => [
  { phase: 'stance', distance: body + offset, clearance: 0, pitch: 0 },
  { phase: 'stance', distance: body - offset, clearance: 0, pitch: 0 },
];

describe('starting from planted feet using actual travelled distance', () => {
  it('does not move feet when there is no displacement and preserves the first supporting anchor', () => {
    for (const profile of [WALK_GAIT, RUN_GAIT]) {
      const feet = idle(5, .014); feet[1].distance = 5 - .013;
      const plan = createStartGaitPlan(5, feet, profile);
      expect(sampleStartGait(plan, 0)).toEqual(feet);
      for (const fraction of [.1, .4, .8]) {
        const travel = Math.min(plan.firstTouchdownDistance, profile.duty / 2 * profile.cycleDistance) * fraction, pose = sampleStartGait(plan, travel);
        expect(pose[0].distance).toBe(feet[0].distance);
        expect(pose[0].phase).toBe('stance');
        expect(pose[1].phase).toBe('swing');
        expect(pose[1].clearance).toBeGreaterThan(0);
        expect(sampleStartGait(plan, travel)).toEqual(pose);
      }
    }
  });

  it('retains the run flight interval between the first liftoff and the first touchdown', () => {
    const plan = createStartGaitPlan(5, idle(), RUN_GAIT);
    const liftoff = RUN_GAIT.duty / 2 * RUN_GAIT.cycleDistance;
    const flight = sampleStartGait(plan, (liftoff + plan.firstTouchdownDistance) / 2);
    expect(flight.every(f => f.phase === 'swing' && f.clearance > 0)).toBe(true);
  });

  it('joins the first touchdown and first complete cycle continuously', () => {
    for (const profile of [WALK_GAIT, RUN_GAIT]) {
      const plan = createStartGaitPlan(5, idle(5, -.014), profile);
      for (const boundary of [plan.firstTouchdownDistance, profile.duty / 2 * profile.cycleDistance, (1 - profile.duty / 2) * profile.cycleDistance]) {
        const a = sampleStartGait(plan, boundary - 1e-8), b = sampleStartGait(plan, boundary + 1e-8);
        for (let i = 0; i < 2; i++) for (const key of ['distance', 'clearance', 'pitch'] as const)
          expect(Math.abs(a[i][key] - b[i][key])).toBeLessThan(1e-6);
      }
      const landed = sampleStartGait(plan, plan.firstTouchdownDistance);
      expect(landed[1].distance).toBeCloseTo(5 + profile.cycleDistance / 2, 12);
      expect(landed[1].clearance).toBeCloseTo(0, 12);
      for (const travel of [profile.cycleDistance, 1.4 * profile.cycleDistance, 2.1 * profile.cycleDistance]) {
        const pose = sampleStartGait(plan, travel);
        for (let i = 0; i < 2; i++) {
          const expected = sampleSteadyFoot(profile.duty / 2 + travel / profile.cycleDistance + i * .5, profile);
          expect(pose[i].distance).toBeCloseTo(expected.distance + 5 - (profile.duty / 2 + i * .5) * profile.cycleDistance, 12);
          expect(pose[i].clearance).toBe(expected.clearance);
          expect(pose[i].pitch).toBe(expected.pitch);
        }
      }
    }
  });

  it('can stop during startup, settle, and restart from the same planted feet', () => {
    for (const profile of [WALK_GAIT, RUN_GAIT]) {
      const start = createStartGaitPlan(5, idle(5, .014), profile);
      for (const travel of [start.firstTouchdownDistance / 2, start.firstTouchdownDistance + .02, profile.cycleDistance * .7]) {
        const moving = sampleStartGait(start, travel), stop = createStopGaitPlan(5 + travel, moving);
        expect(sampleStopGait(stop, 0)).toEqual(moving);
        const settled = sampleStopGait(stop, stop.duration + 1), restart = createStartGaitPlan(5 + travel, settled, profile);
        expect(sampleStartGait(restart, 0)).toEqual(settled);
        expect(sampleStartGait(restart, restart.firstTouchdownDistance)[1].distance).toBeCloseTo(5 + travel + profile.cycleDistance / 2, 12);
      }
    }
  });

  it('copies its input snapshot and uses caller-owned output without changing the plan', () => {
    const feet = idle(), profile = { ...WALK_GAIT }, plan = createStartGaitPlan(5, feet, profile), saved = JSON.stringify(plan);
    feet[0].distance = 100; profile.cycleDistance = 100;
    const output = idle();
    expect(sampleStartGait(plan, .2, output)).toBe(output);
    expect(JSON.stringify(plan)).toBe(saved);
    expect(sampleStartGait(plan, 0)).toEqual(idle());
  });

  it('rejects a non-neutral start, invalid calibration and backwards or invalid travel', () => {
    expect(() => createStartGaitPlan(NaN, idle(), WALK_GAIT)).toThrow();
    expect(() => createStartGaitPlan(5, idle(5, .016), WALK_GAIT)).toThrow();
    expect(() => createStartGaitPlan(5, [{ ...idle()[0], phase: 'swing' }, idle()[1]], WALK_GAIT)).toThrow();
    expect(() => createStartGaitPlan(5, [{ ...idle()[0], pitch: .01 }, idle()[1]], WALK_GAIT)).toThrow();
    expect(() => createStartGaitPlan(5, idle(), { ...WALK_GAIT, duty: 1 })).toThrow();
    const plan = createStartGaitPlan(5, idle(), WALK_GAIT);
    expect(() => sampleStartGait(plan, -.001)).toThrow();
    expect(() => sampleStartGait(plan, NaN)).toThrow();
  });
});
