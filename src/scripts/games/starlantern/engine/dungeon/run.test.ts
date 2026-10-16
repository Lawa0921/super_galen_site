import { describe, expect, it } from 'vitest';
import { floorOf, isBossDepth, newRun, startDepths, terrainOf } from './run';

describe('newRun', () => {
  it('starts empty: nothing opened, explored, carried or used', () => {
    const r = newRun(42, 'blaze', 'fog', 5);
    expect([r.seed, r.region, r.condition, r.startDepth]).toEqual([42, 'blaze', 'fog', 5]);
    expect([r.floors.size, r.opened.size, r.explored, r.loot, r.usedFountain, r.altarBuffs, r.keys.size])
      .toEqual([0, 0, {}, { items: {}, gold: 0 }, false, [], 0]);
  });
});

describe('floorOf', () => {
  it('generates a floor on first visit and returns the same one afterwards', () => {
    const r = newRun(7, 'mainline', 'plain', 1);
    const a = floorOf(r, 1);
    expect(floorOf(r, 1)).toBe(a);
    expect(r.floors.size).toBe(1);
  });

  it('is decided by the run seed and the depth', () => {
    const a = floorOf(newRun(7, 'frost', 'plain', 1), 2);
    const b = floorOf(newRun(7, 'frost', 'plain', 1), 2);
    expect(b.map.tiles).toEqual(a.map.tiles);
    expect(b.contents).toEqual(a.contents);
    expect(floorOf(newRun(8, 'frost', 'plain', 1), 2).map.tiles).not.toEqual(a.map.tiles);
    expect(floorOf(newRun(7, 'frost', 'plain', 1), 3).map.tiles).not.toEqual(a.map.tiles);
  });

  it('puts a boss on every fifth depth and on the mainline depth 3, with no stairs down there', () => {
    const boss = (region: 'mainline' | 'storm', depth: number) => floorOf(newRun(11, region, 'plain', 1), depth).map;
    expect(boss('mainline', 3).boss).not.toBeNull();
    expect(boss('mainline', 3).down).toBeNull();
    expect(boss('storm', 3).boss).toBeNull();
    expect(boss('storm', 3).down).not.toBeNull();
    expect(boss('storm', 5).boss).not.toBeNull();
    expect(boss('storm', 10).boss).not.toBeNull();
    expect([isBossDepth('mainline', 3), isBossDepth('storm', 3), isBossDepth('storm', 5), isBossDepth('mainline', 4)])
      .toEqual([true, false, true, false]);
  });

  it('fills rooms with contents under the run condition', () => {
    const f = floorOf(newRun(5, 'mire', 'bounty', 1), 2);
    const chests = f.contents.filter((c) => c.kind === 'chest');
    expect(chests.length).toBeGreaterThanOrEqual(2);   // one chest room at least, plus the bounty chest
    for (const c of chests) expect(f.map.tiles[c.at.y][c.at.x]).toBe('chest');
  });
});

describe('terrainOf', () => {
  it('cycles the three themes on the mainline and keeps a region theme fixed', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((d) => terrainOf('mainline', d))).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect([1, 4, 9].map((d) => terrainOf('blaze', d))).toEqual([2, 2, 2]);
    expect(terrainOf('mire', 12)).toBe(1);
  });
});

describe('startDepths', () => {
  it('offers depth 1 and every multiple of 5 up to the deepest reached, outside the mainline', () => {
    expect(startDepths('blaze', 1)).toEqual([1]);
    expect(startDepths('blaze', 4)).toEqual([1]);
    expect(startDepths('blaze', 12)).toEqual([1, 5, 10]);
  });
  it('offers every reached floor on the mainline', () => {
    expect(startDepths('mainline', 3)).toEqual([1, 2, 3]);
  });
});
