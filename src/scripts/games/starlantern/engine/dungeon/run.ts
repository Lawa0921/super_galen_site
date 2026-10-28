import { CONDITIONS, type ConditionId } from '../../data/conditions';
import type { Meetable } from '../../data/meetings';
import { REGIONS, type RegionId } from '../../data/regions';
import { wardenFor } from '../../data/monsters';
import type { FloorMap } from '../map';
import { mulberry32 } from '../rng';
import { GLIMMER_CHANCE } from '../../data/story/chains';
import type { BuffStat, CharacterId, ItemInstance } from '../types';
import type { Difficulty } from '../battle';
import { genFloor } from './gen';
import { fillRooms, placeRescue, placeSpecial, type Content } from './rooms';

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
  /** The run pack: materials, gold and gear found this run; banked on a safe return, lost on a wipe. */
  loot: { items: Record<string, number>; gold: number; gear: ItemInstance[] };
  /**
   * Chest and vault contents, fixed the first time they are rolled (key `chest:`/`vault:`/`vault-rare:` + depth:x,y).
   * A `frag:` key (`frag:depth:x,y`, or `frag:glimmer:x,y`) holds fragment item ids in `frags` (its `item` is empty, `qty` 0)
   * until the spot pays them out.
   */
  rolls: Record<string, { item: string; qty: number; frags?: string[] }>;
  /** Chest and vault gear, fixed the first time it is rolled (key `chest:`/`vault:` + depth:x,y). */
  gearRolls: Record<string, ItemInstance | null>;
  /** Gear left in an opened chest or vault because it did not fit (weight or a bag slot), by spot (`depth:x,y`); taken with `pickUpHere`. */
  waiting: Record<string, ItemInstance>;
  /** Loot draws taken so far; `lootRng` seeds each from the run seed and this count. */
  lootDraws: number;
  usedFountain: boolean;
  altarBuffs: { stat: BuffStat; pct: number }[];
  /** Depths whose vault key the party holds. */
  keys: Set<number>;
  /** Companions waiting to be rescued in this region, by the depth where they are met. */
  rescues: Record<number, Meetable>;
  /** Chains whose glimmer on a depth must hold their piece; set when the depth is first entered (before it is made). */
  glimmers: Record<number, CharacterId[]>;
  /** Memory drops taken so far; `memoryRng` seeds each from the run seed and this count. */
  memoryDraws: number;
  /** Chains that were given a piece on a depth this run. */
  dropped: Record<number, CharacterId[]>;
  /**
   * Trophy draws taken so far (roster plan Task C1, spec §7.5); `trophyRng` seeds each from the run seed, TROPHY_SALT and
   * this count. Only a roster foe's inscription or own-unique roll draws one, so the old roster never moves it.
   */
  trophyDraws: number;
  /** Rune draws taken in battle so far (plan 8f); `runeRng` seeds each from the run seed, RUNE_SALT and this count. */
  runeDraws: number;
  /**
   * The tier of this trip (difficulty plan Task 6a), set at departure and kept until town; absent on Normal, so a Normal
   * run is the run it always was. Not saved (a run never is).
   */
  difficulty?: Difficulty;
  /**
   * Bond plan Task 5 (spec §4.3): the field points each companion has earned on this dive, against BOND_RUN_CAP. Not saved
   * (a run never is); the points themselves go straight into `Member.bond.field`, so a wipe keeps them.
   */
  bond: Partial<Record<CharacterId, number>>;
}

export function newRun(seed: number, region: RegionId, condition: ConditionId, startDepth: number, rescues: Record<number, Meetable> = {}, difficulty?: Difficulty): Run {
  return {
    seed, region, condition, startDepth, floors: new Map(), opened: new Set(), explored: {},
    loot: { items: {}, gold: 0, gear: [] }, rolls: {}, gearRolls: {}, waiting: {}, lootDraws: 0, usedFountain: false, altarBuffs: [], keys: new Set(), rescues: { ...rescues },
    glimmers: {}, memoryDraws: 0, dropped: {}, runeDraws: 0, trophyDraws: 0, bond: {},
    ...(difficulty && difficulty !== 'normal' ? { difficulty } : {}),
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

/** Salts the rescue's own rng, so placing a rescue room moves nothing else on the floor. */
const RESCUE_SALT = 0x6a09e667;
/** Salts the glimmers' own rng, so placing them moves nothing else on the floor. */
export const GLIMMER_SALT = 0x9b05688c;
/**
 * Salts the warden room's own rng (roster plan ruling 10), so placing it moves nothing else on the floor: SHA-256's first
 * round constant, since all eight initial words are in use.
 */
export const WARDEN_SALT = 0x428a2f98;

/** The floor at a depth of this run, generated on first visit and cached afterwards. */
export function floorOf(run: Run, depth: number): RunFloor {
  const cached = run.floors.get(depth);
  if (cached) return cached;
  const seed = floorSeed(run.seed, depth);
  const g = genFloor(seed, { depth, boss: isBossDepth(run.region, depth) });
  const f = fillRooms(g, mulberry32(seed ^ 0x27d4eb2f), CONDITIONS[run.condition]);
  const who = run.rescues[depth];
  if (who) placeRescue(f, g, mulberry32(seed ^ RESCUE_SALT), who);
  const r = mulberry32(seed ^ GLIMMER_SALT);
  if (r() < GLIMMER_CHANCE) placeSpecial(f, g, r, { kind: 'glimmer' });
  for (const owner of run.glimmers[depth] ?? []) placeSpecial(f, g, r, { kind: 'glimmer', owner });
  // Last of all, so nothing above moves (ruling 10): a live warden's room on depths 8, 13, 18 ... (never a boss depth).
  const warden = isBossDepth(run.region, depth) ? null : wardenFor(run.region, depth);
  if (warden) placeSpecial(f, g, mulberry32(seed ^ WARDEN_SALT), { kind: 'warden', warden });
  run.floors.set(depth, f);
  return f;
}
