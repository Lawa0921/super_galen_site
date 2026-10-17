import { describe, it, expect } from 'vitest';
import { rollPortals, validPortals } from './portals';
import { mulberry32 } from './rng';
import { REGIONS, type RegionId } from '../data/regions';

describe('rollPortals', () => {
  it('the mainline portal is always first and the other two differ', () => {
    for (let seed = 0; seed < 300; seed++) {
      const p = rollPortals(mulberry32(seed));
      expect(p).toHaveLength(3);
      expect(p[0].region).toBe('mainline');
      expect(p[1].region).not.toBe('mainline');
      expect(p[2].region).not.toBe('mainline');
      expect(p[1].region).not.toBe(p[2].region);
      expect(validPortals(p)).toBe(true);
    }
  });
  it('is deterministic under a seed and varies across seeds', () => {
    expect(rollPortals(mulberry32(7))).toEqual(rollPortals(mulberry32(7)));
    const sets = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(rollPortals(mulberry32(i)))));
    expect(sets.size).toBeGreaterThan(5);
  });
  it('terminates and stays valid on a constant rng', () => {
    for (const v of [0, 0.5, 0.999999]) expect(validPortals(rollPortals(() => v))).toBe(true);
  });
  it('validPortals rejects malformed sets', () => {
    const ok = rollPortals(mulberry32(1));
    expect(validPortals(ok)).toBe(true);
    expect(validPortals(undefined)).toBe(false);
    expect(validPortals(ok.slice(0, 2))).toBe(false);
    expect(validPortals([ok[1], ok[0], ok[2]])).toBe(false);
    expect(validPortals([ok[0], ok[1], ok[1]])).toBe(false);
    expect(validPortals([ok[0], ok[1], { region: 'nowhere', condition: 'plain' }])).toBe(false);
    expect(validPortals([ok[0], ok[1], { ...ok[2], condition: 'rain' }])).toBe(false);
    expect(validPortals([ok[0], ok[1], null])).toBe(false);
  });
});

describe('rollPortals favouring', () => {
  const ALL = Object.keys(REGIONS) as RegionId[];
  it('equal weights draw exactly as before', () => {
    for (let seed = 0; seed < 100; seed++) {
      expect(rollPortals(mulberry32(seed), ALL)).toEqual(rollPortals(mulberry32(seed)));
      expect(rollPortals(mulberry32(seed), [])).toEqual(rollPortals(mulberry32(seed)));
    }
  });
  it('a favoured region turns up about twice as often', () => {
    const rng = mulberry32(2024);
    const hits: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) for (const p of rollPortals(rng, ['iron']).slice(1)) hits[p.region] = (hits[p.region] ?? 0) + 1;
    const others = ALL.filter((r) => r !== 'mainline' && r !== 'iron');
    const avg = others.reduce((s, r) => s + (hits[r] ?? 0), 0) / others.length;
    expect(hits.iron / avg).toBeGreaterThan(1.6);
    expect(hits.iron / avg).toBeLessThan(2.4);
  });
  it('stays valid and finishes on a constant rng', () => {
    for (const v of [0, 0.5, 0.999999]) expect(validPortals(rollPortals(() => v, ['iron', 'frost']))).toBe(true);
  });
});
