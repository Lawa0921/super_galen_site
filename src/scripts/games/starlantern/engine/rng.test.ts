import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, pick } from './rng';

describe('rng', () => {
  it('mulberry32 is deterministic per seed and stays in [0,1)', () => {
    const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
    const xs = Array.from({ length: 50 }, () => a());
    expect(xs).toEqual(Array.from({ length: 50 }, () => b()));
    expect(xs).not.toEqual(Array.from({ length: 50 }, () => c()));
    for (const x of xs) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); }
  });
  it('randInt covers both ends inclusively', () => {
    expect(randInt(() => 0, 3, 7)).toBe(3);
    expect(randInt(() => 0.9999, 3, 7)).toBe(7);
  });
  it('pick indexes by rng', () => {
    expect(pick(() => 0, ['a', 'b', 'c'])).toBe('a');
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
  });
});
