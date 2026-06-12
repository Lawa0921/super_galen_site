// rng.test.ts
import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('同 seed 產生相同序列', () => {
    const a = createRng(42), b = createRng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('值域在 [0,1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 100; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});
