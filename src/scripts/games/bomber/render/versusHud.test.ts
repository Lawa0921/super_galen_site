import { describe, it, expect } from 'vitest';
import { abilityRatio, suddenDeathHud } from './versusHud';
import {
  SUDDEN_DEATH_AT_MS,
  RING_INTERVAL_MS,
  MAX_COLLAPSE_RING,
} from '../versus/versusMatch';

describe('abilityRatio (recharge fill 0→1)', () => {
  it('full cooldown → 0 (just used)', () => {
    expect(abilityRatio(9000, 9000)).toBe(0);
  });

  it('zero cooldown → 1 (ready)', () => {
    expect(abilityRatio(0, 9000)).toBe(1);
  });

  it('half cooldown → 0.5', () => {
    expect(abilityRatio(4500, 9000)).toBeCloseTo(0.5, 6);
  });

  it('clamps over-full cooldown to 0', () => {
    expect(abilityRatio(12000, 9000)).toBe(0);
  });

  it('clamps negative cooldown to 1', () => {
    expect(abilityRatio(-500, 9000)).toBe(1);
  });

  it('maxMs <= 0 → 1 (treated as ready / no cooldown)', () => {
    expect(abilityRatio(5000, 0)).toBe(1);
    expect(abilityRatio(5000, -1)).toBe(1);
  });
});

describe('suddenDeathHud (deterministic, elapsedMs only)', () => {
  it('before sudden death: phase=pre, counts seconds down to 120s', () => {
    const r0 = suddenDeathHud(0);
    expect(r0.phase).toBe('pre');
    expect(r0.ring).toBe(0);
    expect(r0.secondsToNext).toBe(SUDDEN_DEATH_AT_MS / 1000); // 120

    // 119.0s remaining → ceil(1000ms) = 1
    const r119 = suddenDeathHud(SUDDEN_DEATH_AT_MS - 1000);
    expect(r119.phase).toBe('pre');
    expect(r119.secondsToNext).toBe(1);

    // 119.5s elapsed → 0.5s remaining → ceil = 1
    const rHalf = suddenDeathHud(SUDDEN_DEATH_AT_MS - 500);
    expect(rHalf.phase).toBe('pre');
    expect(rHalf.secondsToNext).toBe(1);
  });

  it('at 120s exactly: phase=collapsing, ring 1, counts to ring 2', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(1);
    // next collapse at 123s → 3s away → ceil = 3
    expect(r.secondsToNext).toBe(RING_INTERVAL_MS / 1000);
  });

  it('at 123s: ring 2 has just collapsed, counts to ring 3', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + RING_INTERVAL_MS);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(2);
    expect(r.secondsToNext).toBe(RING_INTERVAL_MS / 1000);
  });

  it('at 126s: last ring (3) collapsed → phase=final', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + (MAX_COLLAPSE_RING - 1) * RING_INTERVAL_MS);
    expect(r.phase).toBe('final');
    expect(r.ring).toBe(MAX_COLLAPSE_RING);
  });

  it('past the last ring: stays final, ring stays at max', () => {
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + 10 * RING_INTERVAL_MS);
    expect(r.phase).toBe('final');
    expect(r.ring).toBe(MAX_COLLAPSE_RING);
  });

  it('mid-collapse interval: ring stays, secondsToNext counts down to next ring', () => {
    // 1.0s into the first collapse interval → 2.0s until ring 2 → ceil = 2
    const r = suddenDeathHud(SUDDEN_DEATH_AT_MS + 1000);
    expect(r.phase).toBe('collapsing');
    expect(r.ring).toBe(1);
    expect(r.secondsToNext).toBe(2);
  });

  it('is pure: same elapsed → same result', () => {
    const t = SUDDEN_DEATH_AT_MS + 1500;
    expect(suddenDeathHud(t)).toEqual(suddenDeathHud(t));
  });
});
