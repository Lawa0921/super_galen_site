import { describe, expect, it } from 'vitest';
import { MAP, canStand, findPath, wallDistance } from './map';

describe('old quarter collision contract', () => {
  it('blocks elevated shots at the upper story of the western street building', () => {
    expect(wallDistance([-15, 5, 8], [0, 0, -1])).toBeCloseTo(4);
  });
  it('preserves low cover height so shots above crates remain unobstructed', () => {
    expect(wallDistance([-18, 1.3, -5], [0, 0, -1])).toBeCloseTo(4);
    expect(wallDistance([-18, 1.75, -5], [0, 0, -1])).toBeGreaterThan(20);
  });
  it('keeps both spawn areas connected to both objective centers without crossing walls', () => {
    for (const spawnZ of [-23, 23]) for (const site of MAP.sites) {
      const route = findPath(0, spawnZ, site.x, site.z);
      expect(route.length).toBeGreaterThan(0);
      expect(route.every(point => canStand(point.x, point.z))).toBe(true);
      expect(route.at(-1)).toEqual({ x: site.x, z: site.z });
    }
  });
});
