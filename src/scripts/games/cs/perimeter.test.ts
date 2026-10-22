import { describe, expect, it } from 'vitest';
import { canStand, wallDistance, visible } from './map';
import { worldImpact } from './ballistics';

const sides = [
  { o: [23, 1.58, 0], d: [1, 0, 0], edge: [23.64, 0], normal: [-1, 0, 0] },
  { o: [-23, 1.58, 0], d: [-1, 0, 0], edge: [-23.64, 0], normal: [1, 0, 0] },
  { o: [0, 1.58, 27], d: [0, 0, 1], edge: [0, 27.64], normal: [0, 0, -1] },
  { o: [0, 1.58, -27], d: [0, 0, -1], edge: [0, -27.64], normal: [0, 0, 1] },
];
describe('city scenery beyond the playable boundary', () => {
  it.each(sides)('keeps movement restricted while eye-height rays reach the exterior facade: $o', ({ o, d, edge, normal }) => {
    expect(canStand(o[0], o[2])).toBe(true);
    expect(canStand(...edge as [number, number])).toBe(false);
    expect(canStand(edge[0] * 1.01, edge[1] * 1.01)).toBe(false);
    expect(wallDistance(o, d)).toBeCloseTo(9, 2);
    const hit = worldImpact(o, d);
    expect(hit.distance).toBeCloseTo(9, 2);
    expect([hit.nx, hit.ny, hit.nz]).toEqual(normal);
    expect(hit.surface).toBe('stone');
    expect(visible({ x: o[0], z: o[2] }, { x: o[0] + d[0] * 3, z: o[2] + d[2] * 3 })).toBe(true);
  });
  it.each(sides)('hits the modeled low stone plinth and allows shots above the skyline: $o', ({ o, d }) => {
    const low = [o[0], .1, o[2]], high = [o[0], 45, o[2]];
    expect(worldImpact(low, d).distance).toBeCloseTo(1.01, 2);
    expect(wallDistance(low, d)).toBeCloseTo(worldImpact(low, d).distance, 5);
    expect(worldImpact(high, d)).toMatchObject({ distance: 150, surface: 'none' });
    expect(wallDistance(high, d)).toBe(150);
  });
  it('keeps downward ground and existing close cover ahead of the exterior', () => {
    expect(worldImpact([0, 2, 20], [0, -1, 0])).toMatchObject({ distance: 2, surface: 'ground' });
    expect(worldImpact([0, 2, 6], [0, 0, -1])).toMatchObject({ distance: 2, surface: 'stone' });
  });
});
