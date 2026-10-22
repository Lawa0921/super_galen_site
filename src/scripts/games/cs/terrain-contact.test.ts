import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createTriangleFloorProbe } from './terrain-contact';

describe('shoe triangle and tread intersection', () => {
  const probe = createTriangleFloorProbe();
  const a = new Vector3(-1, 0, 0), b = new Vector3(1, 2, 0), c = new Vector3(0, 1, 2);
  it('finds contact inside a triangle even when all authored vertices lie outside the tread', () => {
    expect(probe(a, b, c, { minX: .1, maxX: .5, minZ: .2, maxZ: .4 })).toBeCloseTo(1.1, 10);
  });
  it('has no contact outside the actual surface and interpolates through the step edge', () => {
    expect(probe(a, b, c, { minX: 1.001, maxX: 2, minZ: 0, maxZ: 1 })).toBe(Infinity);
    for (let x = -.5; x <= .5; x += .001) {
      expect(probe(a, b, c, { minX: x, maxX: 2, minZ: 0, maxZ: 2 })).toBeCloseTo(x + 1, 10);
    }
  });
  it('handles a vertical shoe edge and zero projected area without NaN', () => {
    const box = { minX: 0, maxX: 1, minZ: 0, maxZ: 1 };
    expect(probe(new Vector3(0, .2, 0), new Vector3(0, .8, 0), new Vector3(0, .4, 1), box)).toBe(.2);
    expect(probe(new Vector3(-.001, .2, 0), new Vector3(-.001, .8, 0), new Vector3(-.001, .4, 1), box)).toBe(Infinity);
  });
});
