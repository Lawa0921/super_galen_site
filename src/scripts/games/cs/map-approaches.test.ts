import { describe, expect, it } from 'vitest';
import { MAP, canStand, clearRoute, findPath, visible, wallDistance } from './map';

describe('covered site approaches', () => {
  it('breaks spawn-to-site sightlines without sealing approaches', () => {
    for (const z of [-23, 23]) for (const site of MAP.sites) {
      expect(visible({ x: 0, z }, site)).toBe(false);
      const path = findPath(0, z, site.x, site.z); expect(path.length).toBeGreaterThan(0);
      let previous = { x: 0, z }; for (const point of path) { expect(clearRoute(previous, point)).toBe(true); previous = point; }
    }
  });
  it('provides low cover with visible upper space and retains two warehouse flanks', () => {
    for (const sign of [-1, 1]) {
      expect(canStand(sign * 9, .5)).toBe(false);
      expect(wallDistance([sign * 9, 1.58, 5], [0, 0, -1])).toBeCloseTo(3);
      expect(wallDistance([sign * 9, 1.75, 5], [0, 0, -1])).toBeGreaterThan(3);
      expect(clearRoute({ x: sign * 7, z: 7 }, { x: sign * 7, z: -7 })).toBe(true);
    }
  });
});
