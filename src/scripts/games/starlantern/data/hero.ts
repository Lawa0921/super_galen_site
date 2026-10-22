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
 * (plan 6a Task 19c): it takes a flexible keystone set, fills guard, sword and star (sword before star, so ten memories
 * reach the sword capstone) and leans its talents on HP and STR. The healing branch is left to Selene, so the hero's
 * sustain no longer flattens the full-party bands. Task 20 (band 18, any lineup works): the mage fills star and light
 * two to one (a pure star hero fell to slash skills once star was full, which iron and mire resist, and had no heal),
 * and the sword leans its talents on STR and HP.
 */
export type HeroBuild = 'balanced' | 'sword' | 'mage' | 'healer' | 'tank';
/** `nodes` (optional, plan 6a Task 20): tree nodes the build raises first, in this order; heroTree falls back to `branches`. */
export interface HeroBuildDef { branches: number[]; talents: AnyStat[]; row: Row; weapon: string; keystones?: KeystoneId[]; nodes?: string[] }
export const HERO_BUILDS: Record<HeroBuild, HeroBuildDef> = {
  balanced: { branches: [1, 0, 2], talents: ['hp', 'str'], row: 'front', weapon: 'iron-sword', keystones: ['last-stand', 'crit-tp', 'opening-gauge'] },
  sword: { branches: [0], talents: ['str', 'hp'], row: 'front', weapon: 'iron-sword' },
  mage: { branches: [2, 2, 3], talents: ['int', 'mag'], row: 'back', weapon: 'wooden-staff' },
  healer: { branches: [3], talents: ['wil', 'hp'], row: 'back', weapon: 'wooden-staff' },
  tank: { branches: [1], talents: ['hp', 'def'], row: 'front', weapon: 'thorn-spear' },
};
