import type { WeaponId } from './engine';

// Cosmetic envelopes only. Aim direction, spread and damage stay in engine.ts.
export const SHOT_PRESENTATION = {
  pistol: { flashSize: .19, flashLife: .055, kick: .052, recovery: 24, light: .55 },
  smg: { flashSize: .17, flashLife: .052, kick: .045, recovery: 30, light: .4 },
  rifle: { flashSize: .26, flashLife: .072, kick: .092, recovery: 23, light: .9 },
  sniper: { flashSize: .34, flashLife: .085, kick: .125, recovery: 17, light: 1.15 },
} as const;

export function shotEnvelope(weapon: WeaponId, age: number, aiming: boolean, reducedMotion: boolean) {
  if (!Number.isFinite(age) || age < 0 || age > .4) return { kick: 0, light: 0 };
  const p = SHOT_PRESENTATION[weapon];
  return {
    kick: reducedMotion ? 0 : p.kick * Math.exp(-age * p.recovery) * (aiming ? .55 : 1),
    light: age >= p.flashLife ? 0 : p.light * (1 - age / p.flashLife) ** 2,
  };
}
