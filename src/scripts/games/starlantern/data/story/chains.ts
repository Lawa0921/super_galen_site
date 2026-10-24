import type { CharacterId, PrimaryKey } from '../../engine/types';
import type { RegionId } from '../regions';

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** Calendar gate of a memory piece (spec §11.1). */
export interface When { moon?: MoonPhase[]; time?: 'day' | 'night'; season?: Season[] }
/** Today as a piece's gate reads it (time and moon plan ruling 3; `engine/story/events.ts` `calendarOf`). */
export interface CalendarNow { moon: MoonPhase; season: Season; time: 'day' | 'night' }

/**
 * Whether a calendar gate holds today (time and moon ruling 3): every field written must match `cal`. With no gate, or no
 * calendar given (the expectation, the pace and the sim walk without one), it holds.
 */
export const whenHolds = (w?: When, cal?: CalendarNow): boolean => {
  if (!w || !cal) return true;
  if (w.moon && !w.moon.includes(cal.moon)) return false;
  if (w.time && w.time !== cal.time) return false;
  if (w.season && !w.season.includes(cal.season)) return false;
  return true;
};

/** `gather` is the hook for item 5; nothing in plan 6b uses it. */
export type FragmentSource = 'boss' | 'elite' | 'glimmer' | 'chest' | 'vault' | 'gather';

export interface PieceDef { regions: RegionId[]; minDepth: number; bossOnly?: true; when?: When }
/** `key` marks a story-critical chain (the hero, Rin). */
export interface ChainDef { pieces: PieceDef[]; gain: Partial<Record<PrimaryKey, number>>; key: boolean }

export const HERO_TOPUP: { depth: number; to: number }[] = [{ depth: 25, to: 9 }, { depth: 30, to: 10 }];
export const MEMORY_PITY = 2;
export const ELITE_PIECE_CHANCE = 0.35;
export const GLIMMER_CHANCE = 0.15;
/** Scales the `memory` source of stats on its own (spec §12). */
export const MEMORY_SCALE = 1;

const mainRoad = (depths: number[], bossFrom = Infinity): PieceDef[] =>
  depths.map((minDepth, i) => (i >= bossFrom ? { regions: ['mainline'], minDepth, bossOnly: true } : { regions: ['mainline'], minDepth }));

/**
 * A companion chain: every piece drops from all of `regions` (spec §7.3), piece i from `depths[i]` (each companion has
 * her own table, paced from her meeting depth: plan 6c Task 1). `whens` maps a piece index to its calendar gate.
 */
const companion = (regions: RegionId[], key: PrimaryKey, depths: number[], whens: Record<number, When> = {}): ChainDef => ({
  pieces: depths.map((minDepth, i) => {
    const p: PieceDef = { regions: [...regions], minDepth };
    if (whens[i]) p.when = whens[i];
    return p;
  }),
  gain: { [key]: 2 },
  key: false,
});

export const CHAINS: Record<CharacterId, ChainDef> = {
  hero: { pieces: mainRoad([3, 5, 7, 9, 11, 15, 17, 20, 25, 30], 8), gain: { str: 0.5, int: 0.5, agi: 0.5, wil: 0.5 }, key: true },
  rin: { pieces: mainRoad([1, 3, 6, 8, 11, 15, 17]), gain: { agi: 2 }, key: true },
  selene: companion(['mainline', 'frost'], 'wil', [3, 6, 9, 13, 15], { 1: { moon: ['full'] }, 3: { moon: ['full'] }, 4: { moon: ['new'] } }),
  chizuru: companion(['frost', 'mainline'], 'str', [5, 7, 10, 11, 15]),
  safira: companion(['blaze'], 'agi', [5, 7, 10, 12, 15]),
  sylvie: companion(['mire'], 'agi', [7, 10, 12, 15, 18]),
  noel: companion(['storm'], 'int', [7, 10, 12, 15, 16]),
  bobby: companion(['mainline', 'iron'], 'int', [7, 10, 13, 16, 17]),
  liz: companion(['shade'], 'agi', [9, 12, 15, 16, 21]),
  scarlet: companion(['iron'], 'str', [10, 11, 15, 16, 21]),
};

export const chainLength = (id: CharacterId): number => CHAINS[id].pieces.length;
