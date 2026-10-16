import { CONDITIONS, type ConditionId } from '../../data/conditions';
import { REGIONS, type RegionId } from '../../data/regions';
import type { FloorMap } from '../map';
import { mulberry32 } from '../rng';
import type { BuffStat } from '../types';
import { genFloor } from './gen';
import { fillRooms, type Content } from './rooms';

/** A gate's destination: where it leads and the run condition there. */
export interface Portal { region: RegionId; condition: ConditionId }

export interface RunFloor { map: FloorMap; contents: Content[] }

/** One trip into the labyrinth: from departure until the party is back in town. */
export interface Run {
  seed: number; region: RegionId; condition: ConditionId; startDepth: number;
  /** Floors generated so far, by depth; each is made on first visit. */
  floors: Map<number, RunFloor>;
  /** Opened chests as `depth:x,y`. */
  opened: Set<string>;
  /** Explored cells (`x,y`) by depth. */
  explored: Record<number, string[]>;
  loot: { items: Record<string, number>; gold: number };
  /** Chest and vault contents, fixed the first time they are rolled (key `chest:`/`vault:` + depth:x,y). */
  rolls: Record<string, { item: string; qty: number }>;
  usedFountain: boolean;
  altarBuffs: { stat: BuffStat; pct: number }[];
  /** Depths whose vault key the party holds. */
  keys: Set<number>;
}

export function newRun(seed: number, region: RegionId, condition: ConditionId, startDepth: number): Run {
  return {
    seed, region, condition, startDepth, floors: new Map(), opened: new Set(), explored: {},
    loot: { items: {}, gold: 0 }, rolls: {}, usedFountain: false, altarBuffs: [], keys: new Set(),
  };
}

/** Every fifth depth holds a boss; the mainline story boss waits on depth 3. */
export const isBossDepth = (region: RegionId, depth: number): boolean => depth % 5 === 0 || (region === 'mainline' && depth === 3);

/** The tile theme (1-3) of a depth: the region's own, or the mainline's cycle through all three. */
export function terrainOf(region: RegionId, depth: number): 1 | 2 | 3 {
  const t = REGIONS[region].terrain;
  return t === 'cycle' ? (((depth - 1) % 3) + 1) as 1 | 2 | 3 : t;
}

/**
 * Depths a gate can start from. The mainline keeps its shortcuts to every floor reached; elsewhere a run starts at
 * depth 1 or at a multiple of 5 no deeper than the region's deepest reached.
 */
export function startDepths(region: RegionId, reached: number): number[] {
  if (region === 'mainline') return Array.from({ length: Math.max(1, reached) }, (_, i) => i + 1);
  const out = [1];
  for (let d = 5; d <= reached; d += 5) out.push(d);
  return out;
}

/** Seed of one floor: a fixed mix of the run seed and the depth. */
const floorSeed = (seed: number, depth: number): number => (Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) + Math.imul(depth, 0x85ebca6b)) >>> 0;

/** The floor at a depth of this run, generated on first visit and cached afterwards. */
export function floorOf(run: Run, depth: number): RunFloor {
  const cached = run.floors.get(depth);
  if (cached) return cached;
  const seed = floorSeed(run.seed, depth);
  const g = genFloor(seed, { depth, boss: isBossDepth(run.region, depth) });
  const f = fillRooms(g, mulberry32(seed ^ 0x27d4eb2f), CONDITIONS[run.condition]);
  run.floors.set(depth, f);
  return f;
}
