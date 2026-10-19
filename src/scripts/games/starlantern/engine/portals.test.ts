import { describe, it, expect } from 'vitest';
import { rollPortals, validPortals, withLead } from './portals';
import type { Portal } from './dungeon/run';
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

describe('rollPortals with a lead (6c Task 16)', () => {
  const OTHERS = (Object.keys(REGIONS) as RegionId[]).filter((r) => r !== 'mainline');
  /** An rng that counts its draws. */
  const counted = (seed: number) => {
    const rng = mulberry32(seed);
    const c = { n: 0, rng: () => { c.n++; return rng(); } };
    return c;
  };

  it('always offers the lead region, and stays a valid set', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const lead of OTHERS) {
        for (const fav of [[], [lead], ['iron', 'frost']] as RegionId[][]) {
          const p = rollPortals(mulberry32(seed), fav, lead);
          expect(p.map((x) => x.region), `${seed} ${lead}`).toContain(lead);
          expect(validPortals(p)).toBe(true);
        }
      }
    }
  });

  it('takes exactly the draws of the plain roll, so the stream after it is the same', () => {
    for (let seed = 0; seed < 100; seed++) {
      for (const lead of [undefined, 'mainline', ...OTHERS] as (RegionId | undefined)[]) {
        const a = counted(seed), b = counted(seed);
        rollPortals(a.rng, ['frost'], lead);
        rollPortals(b.rng, ['frost']);
        expect(a.n).toBe(b.n);
        expect(a.rng()).toBe(b.rng());
      }
    }
  });

  it('changes nothing when the lead is already offered, is the main road, or there is none', () => {
    for (let seed = 0; seed < 100; seed++) {
      const plain = rollPortals(mulberry32(seed), ['storm']);
      expect(rollPortals(mulberry32(seed), ['storm'], undefined)).toEqual(plain);
      expect(rollPortals(mulberry32(seed), ['storm'], 'mainline')).toEqual(plain);
      for (const p of plain.slice(1)) expect(rollPortals(mulberry32(seed), ['storm'], p.region)).toEqual(plain);
    }
  });

  it('otherwise puts the lead in one slot after the roll, keeping that slot condition and the rest as rolled', () => {
    let replaced = 0;
    for (let seed = 0; seed < 200; seed++) {
      for (const lead of OTHERS) {
        const plain = rollPortals(mulberry32(seed));
        if (plain.some((p) => p.region === lead)) continue;
        replaced++;
        const p = rollPortals(mulberry32(seed), [], lead);
        expect(p[0]).toEqual(plain[0]);
        expect(p.map((x) => x.condition)).toEqual(plain.map((x) => x.condition));
        expect(p.filter((x, i) => x.region !== plain[i].region)).toHaveLength(1);
        expect(withLead(plain, lead)).toEqual(p);
      }
    }
    expect(replaced).toBeGreaterThan(0);
  });

  it('keeps another unmet region when it can: the slot without one gives way', () => {
    const base = [{ region: 'mainline', condition: 'plain' }, { region: 'storm', condition: 'plain' }, { region: 'iron', condition: 'plain' }] as Portal[];
    expect(withLead(base, 'frost').map((p) => p.region)).toEqual(['mainline', 'storm', 'frost']);
    expect(withLead(base, 'frost', ['iron']).map((p) => p.region)).toEqual(['mainline', 'frost', 'iron']);
    expect(withLead(base, 'frost', ['storm']).map((p) => p.region)).toEqual(['mainline', 'storm', 'frost']);
    expect(withLead(base, 'frost', ['storm', 'iron']).map((p) => p.region)).toEqual(['mainline', 'storm', 'frost']);
    expect(withLead(base, 'storm')).toBe(base);
  });
});
