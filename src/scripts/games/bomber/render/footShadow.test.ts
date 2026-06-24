import { describe, it, expect } from 'vitest';
import {
  footShadowGeom,
  SHADOW_FOOT_FRAC,
  SHADOW_RX_FRAC,
  SHADOW_RY_FRAC,
} from './footShadow';

describe('footShadowGeom (foot-shadow ellipse geometry)', () => {
  const cell = 40;
  const ox = 10;
  const oy = 6;

  it('centre x matches the sprite x (cell centre at interpolated col)', () => {
    const g = footShadowGeom(3, 5, cell, ox, oy, 1);
    // sprite x = ox + rx*cell + cell/2
    expect(g.cx).toBe(ox + 3 * cell + cell / 2);
  });

  it('centre y sits near the feet (below the cell centre)', () => {
    const g = footShadowGeom(3, 5, cell, ox, oy, 1);
    const cellCentreY = oy + 5 * cell + cell / 2;
    expect(g.cy).toBe(oy + 5 * cell + cell * SHADOW_FOOT_FRAC);
    // SHADOW_FOOT_FRAC (0.8) > 0.5 → shadow is below the sprite centre, at the feet
    expect(g.cy).toBeGreaterThan(cellCentreY);
  });

  it('radii are flattened (rx > ry) for a ground shadow', () => {
    const g = footShadowGeom(0, 0, cell, ox, oy, 1);
    expect(g.rx).toBe(cell * SHADOW_RX_FRAC);
    expect(g.ry).toBe(cell * SHADOW_RY_FRAC);
    expect(g.rx).toBeGreaterThan(g.ry);
  });

  it('scales radii by the size multiplier (bigger entities → bigger shadows)', () => {
    const small = footShadowGeom(0, 0, cell, ox, oy, 0.55);
    const big = footShadowGeom(0, 0, cell, ox, oy, 0.98);
    expect(big.rx).toBeGreaterThan(small.rx);
    expect(big.ry).toBeGreaterThan(small.ry);
    expect(small.rx).toBeCloseTo(cell * SHADOW_RX_FRAC * 0.55, 6);
    expect(big.ry).toBeCloseTo(cell * SHADOW_RY_FRAC * 0.98, 6);
  });

  it('is pure: same inputs → identical geometry across calls', () => {
    const a = footShadowGeom(2.5, 4.25, cell, ox, oy, 0.85);
    const b = footShadowGeom(2.5, 4.25, cell, ox, oy, 0.85);
    expect(a).toEqual(b);
  });

  it('tracks interpolated (fractional) coords for smooth movement', () => {
    const mid = footShadowGeom(2.5, 0, cell, ox, oy, 1);
    const at2 = footShadowGeom(2, 0, cell, ox, oy, 1);
    const at3 = footShadowGeom(3, 0, cell, ox, oy, 1);
    expect(mid.cx).toBeCloseTo((at2.cx + at3.cx) / 2, 6);
  });
});
