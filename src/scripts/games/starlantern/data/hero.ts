import type { AnyStat, Row } from '../engine/types';
import type { KeystoneId } from './talents';

/** Each of the hero's roles peaks at this share of the specialist companion's (plan 6a; Task 9 guards it). */
export const HERO_PEAK_SHARE = 0.85;

/** The abyss capstones' depth bonus (spec 4.2): percent added per floor of depth, and the most it ever adds. */
export const ABYSS = { perDepth: 1, cap: 30 };

/** Memories of the hero each abyss capstone needs, by branch (sword, guard, star, light, chain). */
export const ABYSS_UNLOCK = [2, 4, 6, 8, 10];

/**
 * The hero's default builds (spec 4.5): the tree branches he fills in turn, the talent stats he leans on, how he fights,
 * and the keystones he takes (default DEFAULT_KEYSTONES.hero, the tank set). The balanced build is not a regen tank
 * (plan 6a Task 19c): it takes a flexible keystone set and fills guard, star and sword, leaving the healing branch to
 * Selene, so its sustain no longer flattens the full-party bands.
 */
export type HeroBuild = 'balanced' | 'sword' | 'mage' | 'healer' | 'tank';
export const HERO_BUILDS: Record<HeroBuild, { branches: number[]; talents: AnyStat[]; row: Row; weapon: string; keystones?: KeystoneId[] }> = {
  balanced: { branches: [1, 2, 0], talents: ['str', 'wil'], row: 'front', weapon: 'iron-sword', keystones: ['last-stand', 'crit-tp', 'opening-gauge'] },
  sword: { branches: [0], talents: ['str', 'atk'], row: 'front', weapon: 'iron-sword' },
  mage: { branches: [2], talents: ['int', 'mag'], row: 'back', weapon: 'wooden-staff' },
  healer: { branches: [3], talents: ['wil', 'hp'], row: 'back', weapon: 'wooden-staff' },
  tank: { branches: [1], talents: ['hp', 'def'], row: 'front', weapon: 'thorn-spear' },
};
