// rng.test.ts
import { describe, it, expect } from 'vitest';
import { xmur3, sfc32, Rng, subSeed } from './rng';

describe('rng', () => {
  it('xmur3 同字串給同 32-bit 序列、不同字串不同', () => {
    const a = xmur3('hello'), b = xmur3('hello'), c = xmur3('hellp');
    const av = [a(), a(), a()], bv = [b(), b(), b()], cv = [c(), c(), c()];
    expect(av).toEqual(bv);
    expect(av).not.toEqual(cv);
    for (const v of av) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(2 ** 32); }
  });
  it('sfc32 值域 [0,1) 且可重現', () => {
    const r1 = sfc32(1, 2, 3, 4), r2 = sfc32(1, 2, 3, 4);
    for (let i = 0; i < 200; i++) { const v = r1(); expect(v).toBe(r2()); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
  it('Rng.int 為 max-exclusive，涵蓋全部值', () => {
    const r = new Rng('seed');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) { const v = r.int(3, 7); expect(v).toBeGreaterThanOrEqual(3); expect(v).toBeLessThan(7); seen.add(v); }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
  it('Rng.range 浮點區間 & chance', () => {
    const r = new Rng(123);
    for (let i = 0; i < 100; i++) { const v = r.range(-1, 1); expect(v).toBeGreaterThanOrEqual(-1); expect(v).toBeLessThan(1); }
    expect(new Rng(1).chance(1)).toBe(true);
  });
  it('subSeed：同 seed+pass 相同，不同 pass 不同', () => {
    const a = subSeed('w', 'caves'), b = subSeed('w', 'caves'), c = subSeed('w', 'ores');
    const av = [a.next(), a.next()], bv = [b.next(), b.next()], cv = [c.next(), c.next()];
    expect(av).toEqual(bv);
    expect(av).not.toEqual(cv);
  });
});
