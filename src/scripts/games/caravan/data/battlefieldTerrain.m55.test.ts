import { describe, expect, it } from 'vitest';
import {
  BATTLEFIELD_TERRAINS,
  battlefieldTerrain,
  projectileCoverProfile,
  rearCoverForSide,
} from './battlefieldTerrain.m55';

describe('M55 battlefield terrain and projectile cover rules', () => {
  it('keeps open ground behavior identical to pre-M55 combat', () => {
    const open = battlefieldTerrain('open-ground')!;
    expect(projectileCoverProfile(open, 'enemy', 'back', 'ranged', false, true)).toMatchObject({
      grade: 'none', hitModifier: 0, applies: false,
    });
  });

  it('gives a protected rear rank bounded physical projectile cover', () => {
    const bridge = battlefieldTerrain('broken-stone-bridge')!;
    expect(projectileCoverProfile(bridge, 'enemy', 'back', 'ranged', false, true)).toMatchObject({
      grade: 'partial', hitModifier: -1, applies: true,
    });
    expect(projectileCoverProfile(BATTLEFIELD_TERRAINS['ruined-battlements'], 'enemy', 'back', 'ranged', false, true)).toMatchObject({
      grade: 'strong', hitModifier: -2, applies: true,
    });
  });

  it('uses side-specific cover instead of granting the same fortification to both armies', () => {
    const walls = BATTLEFIELD_TERRAINS['ruined-battlements'];
    expect(rearCoverForSide(walls, 'party')).toBe('partial');
    expect(rearCoverForSide(walls, 'enemy')).toBe('strong');
    expect(projectileCoverProfile(walls, 'party', 'back', 'ranged', false, true).hitModifier).toBe(-1);
    expect(projectileCoverProfile(walls, 'enemy', 'back', 'ranged', false, true).hitModifier).toBe(-2);
  });

  it('never turns projectile cover into a melee or reach tax', () => {
    const bridge = BATTLEFIELD_TERRAINS['broken-stone-bridge'];
    expect(projectileCoverProfile(bridge, 'enemy', 'back', 'melee', false, true).hitModifier).toBe(0);
    expect(projectileCoverProfile(bridge, 'enemy', 'back', 'reach', false, true).hitModifier).toBe(0);
  });

  it('keeps genuine spellcraft separate from mundane projectile cover', () => {
    const bridge = BATTLEFIELD_TERRAINS['broken-stone-bridge'];
    expect(projectileCoverProfile(bridge, 'enemy', 'back', 'mystic', true, true)).toMatchObject({
      hitModifier: 0, applies: false,
    });
  });

  it('does not protect frontline bodies merely because terrain exists', () => {
    const bridge = BATTLEFIELD_TERRAINS['broken-stone-bridge'];
    expect(projectileCoverProfile(bridge, 'enemy', 'front', 'ranged', false, true)).toMatchObject({
      hitModifier: 0, applies: false,
    });
  });

  it('removes rear cover once no living frontline can hold the shooting lane', () => {
    const bridge = BATTLEFIELD_TERRAINS['broken-stone-bridge'];
    expect(projectileCoverProfile(bridge, 'enemy', 'back', 'ranged', false, false)).toMatchObject({
      hitModifier: 0, applies: false,
    });
  });

  it('keeps cover penalties bounded so terrain changes choices rather than forbidding attacks', () => {
    const penalties = Object.values(BATTLEFIELD_TERRAINS).flatMap((terrain) => [
      projectileCoverProfile(terrain, 'party', 'back', 'ranged', false, true).hitModifier,
      projectileCoverProfile(terrain, 'enemy', 'back', 'ranged', false, true).hitModifier,
    ]);
    expect(Math.min(...penalties)).toBeGreaterThanOrEqual(-2);
    expect(Math.max(...penalties)).toBe(0);
  });
});
