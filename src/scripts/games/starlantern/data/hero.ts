import type { AnyStat, Row } from '../engine/types';

/** Each of the hero's roles peaks at this share of the specialist companion's (plan 6a; Task 9 guards it). */
export const HERO_PEAK_SHARE = 0.85;

/** The abyss capstones' depth bonus (spec 4.2): percent added per floor of depth, and the most it ever adds. */
export const ABYSS = { perDepth: 1, cap: 30 };

/** Memories of the hero each abyss capstone needs, by branch (sword, guard, star, light, chain). */
export const ABYSS_UNLOCK = [2, 4, 6, 8, 10];

/** The hero's default builds (spec 4.5): the tree branches he fills in turn, the talent stats he leans on, and how he fights. */
export type HeroBuild = 'balanced' | 'sword' | 'mage' | 'healer' | 'tank';
export const HERO_BUILDS: Record<HeroBuild, { branches: number[]; talents: AnyStat[]; row: Row; weapon: string }> = {
  balanced: { branches: [0, 1, 3], talents: ['str', 'wil'], row: 'front', weapon: 'iron-sword' },
  sword: { branches: [0], talents: ['str', 'atk'], row: 'front', weapon: 'iron-sword' },
  mage: { branches: [2], talents: ['int', 'mag'], row: 'back', weapon: 'wooden-staff' },
  healer: { branches: [3], talents: ['wil', 'hp'], row: 'back', weapon: 'wooden-staff' },
  tank: { branches: [1], talents: ['hp', 'def'], row: 'front', weapon: 'thorn-spear' },
};
