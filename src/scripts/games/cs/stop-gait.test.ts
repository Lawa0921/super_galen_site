import { describe, expect, it } from 'vitest';
import { createStopGaitPlan, sampleStopGait, type StopFeet } from './stop-gait';

const feet = (): StopFeet => [
  { phase: 'stance', distance: 1.83, clearance: 0, pitch: -.1 },
  { phase: 'swing', distance: 2.1, clearance: .08, pitch: .07 },
];

describe('stopping from a captured world-space gait pose', () => {
  it('keeps the captured pose at time zero and plants airborne feet without moving the supporting anchor', () => {
    const initial = feet(), plan = createStopGaitPlan(2, initial);
    expect(sampleStopGait(plan, 0)).toEqual(initial);
    for (const t of [.02, .08, .15]) {
      const pose = sampleStopGait(plan, t);
      expect(pose[0].distance).toBe(1.83);
      expect(pose[0].phase).toBe('stance');
      expect(pose[1].clearance).toBeGreaterThanOrEqual(0);
      expect(pose[1].clearance).toBeLessThan(.08 + .045);
    }
    const planted = sampleStopGait(plan, .18);
    expect(planted[1]).toEqual({ phase: 'stance', distance: 2, clearance: 0, pitch: 0 });
  });

  it('lifts a nearly grounded swing foot instead of sliding it horizontally along the floor', () => {
    const initial = feet(); initial[1].clearance = 1e-8;
    const plan = createStopGaitPlan(2, initial);
    expect(sampleStopGait(plan, 0)).toEqual(initial);
    expect(sampleStopGait(plan, .09)[1].clearance).toBeGreaterThan(.04);
    expect(sampleStopGait(plan, .18)[1].clearance).toBe(0);
  });

  it('settles displaced feet in sequence then stays still indefinitely', () => {
    const plan = createStopGaitPlan(2, [
      { phase: 'stance', distance: 1.8, clearance: 0, pitch: 0 },
      { phase: 'stance', distance: 2.1, clearance: 0, pitch: 0 },
    ]);
    const first = sampleStopGait(plan, .12);
    expect(first[0].phase).toBe('swing');
    expect(first[0].clearance).toBeGreaterThan(0);
    expect(first[1].distance).toBe(2.1);
    expect(first[1].phase).toBe('stance');
    const second = sampleStopGait(plan, .36);
    expect(second[0]).toEqual({ phase: 'stance', distance: 2, clearance: 0, pitch: 0 });
    expect(second[1].phase).toBe('swing');
    const end = sampleStopGait(plan, plan.duration);
    expect(end.every(f => f.phase === 'stance' && f.distance === 2 && f.clearance === 0 && f.pitch === 0)).toBe(true);
    expect(sampleStopGait(plan, plan.duration + 60)).toEqual(end);
  });

  it('copies captured state, reuses output, and has no position or pitch jumps at segment boundaries', () => {
    const initial = feet(), plan = createStopGaitPlan(2, initial), saved = JSON.stringify(plan);
    initial[0].distance = 999;
    const output = feet();
    expect(sampleStopGait(plan, .2, output)).toBe(output);
    for (const boundary of [.18, plan.duration]) {
      const before = sampleStopGait(plan, boundary - 1e-7), after = sampleStopGait(plan, boundary + 1e-7);
      for (let i = 0; i < 2; i++) for (const key of ['distance', 'clearance', 'pitch'] as const)
        expect(Math.abs(before[i][key] - after[i][key])).toBeLessThan(1e-6);
    }
    expect(JSON.stringify(plan)).toBe(saved);
  });

  it('leaves a neutral idle stance alone and rejects invalid snapshots or time', () => {
    const idle: StopFeet = [0, 1].map(() => ({ phase: 'stance', distance: 2, clearance: 0, pitch: 0 })) as StopFeet;
    const plan = createStopGaitPlan(2, idle);
    expect(plan.duration).toBe(0);
    expect(sampleStopGait(plan, 0)).toEqual(idle);
    expect(() => createStopGaitPlan(NaN, idle)).toThrow();
    expect(() => createStopGaitPlan(2, [{ ...idle[0], clearance: -.1 }, idle[1]])).toThrow();
    expect(() => createStopGaitPlan(2, [{ ...idle[0], clearance: .01 }, idle[1]])).toThrow();
    expect(() => createStopGaitPlan(2, [{ ...idle[0], pitch: 1 }, idle[1]])).toThrow();
    expect(() => sampleStopGait(plan, -1)).toThrow();
    expect(() => sampleStopGait(plan, NaN)).toThrow();
  });
});
