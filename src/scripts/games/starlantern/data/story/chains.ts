import type { CharacterId, PrimaryKey } from '../../engine/types';
import type { RegionId } from '../regions';

export type MoonPhase = 'new' | 'waxing' | 'full' | 'waning';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
/** Calendar gate of a memory piece (spec §11.1). */
export interface When { moon?: MoonPhase[]; time?: 'day' | 'night'; season?: Season[] }

/** Always true until item 4 (the calendar) lands. */
export const whenHolds = (_w?: When): boolean => true;

/** `gather` is the hook for item 5; nothing in plan 6b uses it. */
export type FragmentSource = 'boss' | 'elite' | 'glimmer' | 'chest' | 'vault' | 'gather';

export interface PieceDef { regions: RegionId[]; minDepth: number; bossOnly?: true; when?: When }
/** `key` marks a story-critical chain (the hero, Rin). */
export interface ChainDef { pieces: PieceDef[]; gain: Partial<Record<PrimaryKey, number>>; key: boolean }

export const HERO_TOPUP: { depth: number; to: number }[] = [{ depth: 25, to: 9 }, { depth: 30, to: 10 }];
export const MEMORY_PITY = 3;
export const ELITE_PIECE_CHANCE = 0.35;
export const GLIMMER_CHANCE = 0.25;
/** Scales the `memory` source of stats on its own (spec §12). */
export const MEMORY_SCALE = 1;

const mainRoad = (depths: number[], bossFrom = Infinity): PieceDef[] =>
  depths.map((minDepth, i) => (i >= bossFrom ? { regions: ['mainline'], minDepth, bossOnly: true } : { regions: ['mainline'], minDepth }));

const COMPANION_DEPTHS = [1, 1, 1, 6, 6];
/** A companion chain: every piece drops from all of `regions` (spec §7.3). `whens` maps a piece index to its calendar gate. */
const companion = (regions: RegionId[], key: PrimaryKey, whens: Record<number, When> = {}): ChainDef => ({
  pieces: COMPANION_DEPTHS.map((minDepth, i) => {
    const p: PieceDef = { regions: [...regions], minDepth };
    if (whens[i]) p.when = whens[i];
    return p;
  }),
  gain: { [key]: 2 },
  key: false,
});

export const CHAINS: Record<CharacterId, ChainDef> = {
  hero: { pieces: mainRoad([4, 6, 9, 12, 15, 18, 21, 24, 25, 30], 8), gain: { str: 1, int: 1, agi: 1, wil: 1 }, key: true },
  rin: { pieces: mainRoad([1, 3, 4, 6, 8, 10, 15]), gain: { agi: 2 }, key: true },
  selene: companion(['mainline', 'frost'], 'wil', { 1: { moon: ['full'] }, 3: { moon: ['full'] }, 4: { moon: ['new'] } }),
  chizuru: companion(['frost', 'mainline'], 'str'),
  safira: companion(['blaze'], 'agi'),
  sylvie: companion(['mire'], 'agi'),
  noel: companion(['storm'], 'int'),
  bobby: companion(['mainline', 'iron'], 'int'),
  liz: companion(['shade'], 'agi'),
  scarlet: companion(['iron'], 'str'),
};

export const chainLength = (id: CharacterId): number => CHAINS[id].pieces.length;
