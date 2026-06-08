// generate.heart.test.ts — heart can appear in hiddenPowerUps; generation stays reproducible
import { describe, it, expect } from 'vitest';
import { generateFloor } from './generate';

describe('generateFloor: heart powerup', () => {
  it('heart can appear as a hidden powerup (scan enough seeds to find one)', () => {
    let found = false;
    for (let seed = 1; seed <= 200 && !found; seed++) {
      const { hiddenPowerUps } = generateFloor(seed, 1);
      for (const kind of Object.values(hiddenPowerUps)) {
        if (kind === 'heart') { found = true; break; }
      }
    }
    expect(found).toBe(true);
  });

  it('generation with heart is fully reproducible (same seed = same result)', () => {
    // Use a seed range that may include hearts; reproducibility must always hold
    for (const seed of [1, 7, 42, 123]) {
      const a = generateFloor(seed, 1);
      const b = generateFloor(seed, 1);
      expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
    }
  });

  it('heart is rare — majority of drops across many seeds are non-heart', () => {
    let total = 0;
    let hearts = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const { hiddenPowerUps } = generateFloor(seed, 1);
      for (const kind of Object.values(hiddenPowerUps)) {
        total++;
        if (kind === 'heart') hearts++;
      }
    }
    // ~10% heart rate; allow generous margin (0%..30%)
    expect(total).toBeGreaterThan(0);
    const ratio = hearts / total;
    expect(ratio).toBeLessThan(0.30);
  });
});
