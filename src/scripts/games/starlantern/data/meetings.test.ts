import { describe, it, expect } from 'vitest';
import { MEETINGS, rescuesFor, favouredRegions } from './meetings';
import { REGIONS } from './regions';
import { LEGACY_CHARACTER_IDS } from './characters';

describe('meetings', () => {
  it('the eight companions are each met once, in a real region', () => {
    expect(MEETINGS.map((m) => m.id).sort()).toEqual([...LEGACY_CHARACTER_IDS].sort());
    for (const m of MEETINGS) {
      expect(REGIONS[m.region]).toBeDefined();
      expect(m.depth).toBeGreaterThan(0);
    }
  });

  it('no two companions share a region and depth', () => {
    const keys = MEETINGS.map((m) => m.region + ':' + m.depth);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('rescuesFor drops whoever is met', () => {
    expect(rescuesFor('mainline', ['hero', 'rin'])).toEqual({ 2: 'selene', 6: 'bobby' });
    expect(rescuesFor('mainline', ['hero', 'rin', 'selene'])).toEqual({ 6: 'bobby' });
    expect(rescuesFor('frost', ['chizuru'])).toEqual({});
  });

  it('favouredRegions lists the non-mainline regions with someone unmet', () => {
    expect(favouredRegions(['hero', 'rin']).sort()).toEqual(['blaze', 'frost', 'iron', 'mire', 'shade', 'storm']);
    expect(favouredRegions(['hero', 'rin', 'chizuru', 'scarlet']).sort()).toEqual(['blaze', 'mire', 'shade', 'storm']);
    expect(favouredRegions(LEGACY_CHARACTER_IDS)).toEqual([]);
  });
});
