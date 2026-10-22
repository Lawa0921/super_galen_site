import { describe, expect, it } from 'vitest';
import { ViewLighting } from './view-lighting';

const building = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, height: 6 };
const sun = [-1, 1, 0] as const;
describe('world lighting on the first-person weapon', () => {
  it('distinguishes a building shadow from open sky, including the roof edge', () => {
    const lighting = new ViewLighting([building], sun);
    expect(lighting.sample(4, 1.4, 0)).toBe(0);
    expect(lighting.sample(-4, 1.4, 0)).toBe(1);
    expect(lighting.sample(4, 6.5, 0)).toBe(1);
    expect(lighting.sample(4, 1.4, 4)).toBe(1);
  });
  it('smooths a shadow crossing consistently across frame rates and freezes while paused', () => {
    const a = new ViewLighting([building], sun), b = new ViewLighting([building], sun);
    a.update(-4, 1.4, 0, 1 / 60); b.update(-4, 1.4, 0, 1 / 60);
    a.update(4, 1.4, 0, .1); expect(a.exposure).toBeGreaterThan(0); expect(a.exposure).toBeLessThan(1);
    a.update(4, 1.4, 0, .1);
    for (let i = 0; i < 12; i++) b.update(4, 1.4, 0, 1 / 60);
    expect(a.exposure).toBeCloseTo(b.exposure, 10);
    const current = a.exposure; a.update(-4, 1.4, 0, 0); expect(a.exposure).toBe(current);
    a.reset(); a.update(-4, 1.4, 0, 1 / 60); expect(a.exposure).toBe(1);
  });
});
