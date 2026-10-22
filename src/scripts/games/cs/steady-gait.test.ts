import { describe, expect, it } from 'vitest';
import { sampleSteadyFoot, WALK_GAIT, RUN_GAIT } from './steady-gait';

describe('steady locomotion calibration trajectory', () => {
  it('holds the stance frame fixed in world space while the body advances', () => {
    const a = sampleSteadyFoot(.05, WALK_GAIT), b = sampleSteadyFoot(.5, WALK_GAIT);
    expect(a.phase).toBe('stance'); expect(b.phase).toBe('stance');
    expect(a.distance).toBeCloseTo(b.distance, 12);
    expect(a.clearance).toBe(0); expect(b.clearance).toBe(0);
    expect(a.pitch).toBeGreaterThan(0); expect(b.pitch).toBeLessThan(0);
  });

  it('is position and velocity continuous at lift-off and touchdown', () => {
    for (const profile of [WALK_GAIT, RUN_GAIT]) for (const boundary of [profile.duty, 1]) {
      const a = sampleSteadyFoot(boundary - 1e-6, profile), b = sampleSteadyFoot(boundary + 1e-6, profile);
      expect(Math.abs(a.distance - b.distance)).toBeLessThan(1e-9);
      expect(Math.abs(a.clearance - b.clearance)).toBeLessThan(1e-9);
      expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(1e-8);
    }
  });

  it('preserves one cycle distance and includes a running flight window', () => {
    const a = sampleSteadyFoot(.71, RUN_GAIT), b = sampleSteadyFoot(1.71, RUN_GAIT);
    expect(b.distance - a.distance).toBeCloseTo(RUN_GAIT.cycleDistance, 12);
    expect(b.pitch).toBeCloseTo(a.pitch, 12); expect(b.clearance).toBeCloseTo(a.clearance, 12);
    expect(sampleSteadyFoot(.46, RUN_GAIT).phase).toBe('swing');
    expect(sampleSteadyFoot(.96, RUN_GAIT).phase).toBe('swing');
    expect(sampleSteadyFoot(.46, WALK_GAIT).phase).toBe('stance');
  });

  it('supports negative startup cycles without losing the opposite stance anchor', () => {
    const a = sampleSteadyFoot(-.25, WALK_GAIT), b = sampleSteadyFoot(.75, WALK_GAIT);
    expect(b.distance - a.distance).toBeCloseTo(WALK_GAIT.cycleDistance, 12);
    expect(a.phase).toBe(b.phase);
    expect(() => sampleSteadyFoot(NaN, WALK_GAIT)).toThrow();
  });

  it('can accelerate the swing earlier without sacrificing a planted stance or smooth endpoints', () => {
    const profile = { cycleDistance: 2.4, duty: .24, lift: .16, drop: .08, swing: 'cruise' as const };
    const progress = (t: number) => (sampleSteadyFoot(profile.duty + (1 - profile.duty) * t, profile).distance - profile.duty / 2 * profile.cycleDistance) / profile.cycleDistance;
    expect(progress(.1)).toBeGreaterThan(.02); expect(progress(.5)).toBeCloseTo(.5, 12);
    let previous = 0;
    for (let i = 0; i <= 100; i++) { const value = progress(i / 100); expect(value).toBeGreaterThanOrEqual(previous - 1e-12); expect(value + progress(1 - i / 100)).toBeCloseTo(1, 10); previous = value; }
    for (const t of [0, 1]) expect(Math.abs(progress(t === 0 ? 1e-6 : 1 - 1e-6) - t) / 1e-6).toBeLessThan(1e-6);
    expect(sampleSteadyFoot(.02, profile).distance).toBe(sampleSteadyFoot(.20, profile).distance);
    expect(() => sampleSteadyFoot(0, { ...profile, swing: 'unknown' as never })).toThrow();
  });
});
