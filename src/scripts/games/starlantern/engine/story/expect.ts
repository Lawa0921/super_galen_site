import { REGIONS, type RegionId } from '../../data/regions';
import { CHAINS, ELITE_PIECE_CHANCE, GLIMMER_CHANCE, HERO_TOPUP, MEMORY_PITY, chainLength, type CalendarNow } from '../../data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN, SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS, shardGrade, type ShardGrade } from '../../data/story/fragments';
import { isBossDepth, newRun, type Run } from '../dungeon/run';
import { mix } from '../loot/drops';
import { memoriesOf } from '../progression';
import { mulberry32 } from '../rng';
import { newGame, type GameState } from '../state';
import type { AbsorbGain, CharacterId } from '../types';
import { absorb, fragmentItem, lootFragments } from './fragments';
import { MEETINGS } from '../../data/meetings';
import { meet } from '../party';
import { FORCED_GLIMMERS, applyPieces, forcedGlimmers, pieceDrops, pityAfterFloor, type Pity } from './memories';

/** The expectation meets one elite every this many floors (the real generator: at most one a floor, 7/100 a room). */
export const EXPECT_ELITE_EVERY = 3;
/** Seeds the expectation's own draws; nothing in a real game reads it. */
export const EXPECT_SEED = 0x6b;

/** What one member is expected to hold on arriving at a depth. */
export interface Expected { memories: number; absorbed: AbsorbGain[]; oath: boolean }

type Source = 'elite' | 'boss';

const REGION_ORDER = Object.keys(REGIONS) as RegionId[];

const cache = new Map<string, Record<CharacterId, Expected>>();

/**
 * The memory expectation of spec §9.4 point 7: what a party of just `ids` (all met) holds on ARRIVING at `depth`, having
 * walked the main road and then every other region its chains name (in REGIONS order), each from depth 1 to `depth - 1`.
 * A fight at `depth` happens before that floor's own drops, so they are left out: arriving at depth 1 holds nothing, and
 * the finale's boss-only piece is not held by the party that fights the finale. On each
 * floor, in this order: the forced glimmers, a natural glimmer every round(1 / GLIMMER_CHANCE) floors, an elite every
 * EXPECT_ELITE_EVERY floors and the boss of a boss depth. Each drop goes through the real rules (`forcedGlimmers`,
 * `pieceDrops`, `lootFragments`, `pityAfterFloor`) on one rng per floor, `mulberry32(mix(mix(EXPECT_SEED, region index), depth))`.
 * A glimmer that holds no piece leaves an ownerless shard, as in the game. A townsfolk fragment is kept out of later
 * rolls, as the town bag keeps it; it gives no stats. The ownerless shards are then absorbed in `ids` order, round
 * robin, by the real `absorb` (its cap included); no line is shown. Rin's oath holds once her chain is whole (her reveal
 * plays on the next return to town). Chest and vault shards (SHARD_DROP.chest, .vault) are not modelled, so shards are a
 * known underestimate. Nor is the calendar (time and moon plan ruling 3): every floor walks with no moon, so Selene's
 * second, fourth and fifth pieces (full, full, new moon) come earlier here than in a game, the same kind of known error
 * (the plan's Task 3 measures how much). Pure: the same depth, ids and memory knobs always give the same, and every call gets its own
 * copy; the cache is keyed on the knobs' current values, so a knob changed at test time is never answered stale.
 */
export function expectedMemories(depth: number, ids: CharacterId[]): Record<CharacterId, Expected> {
  const key = `${depth}:${ids.join(',')}:${knobs()}`;
  let out = cache.get(key);
  if (!out) {
    out = compute(depth, ids);
    cache.set(key, out);
  }
  return structuredClone(out);
}

/** Every value the expectation reads that a tuning pass may change. */
const knobs = (): string => JSON.stringify([
  CHAINS, HERO_TOPUP, MEMORY_PITY, ELITE_PIECE_CHANCE, GLIMMER_CHANCE, FORCED_GLIMMERS, ABSORB_CAP, ABSORB_GAIN, SHARD_DROP, TOWN_DROP, TOWN_FRAGMENTS,
  EXPECT_ELITE_EVERY, EXPECT_SEED,
]);

function compute(depth: number, ids: CharacterId[]): Record<CharacterId, Expected> {
  let s: GameState = newGame(mulberry32(EXPECT_SEED), EXPECT_SEED, ids);
  s = { ...s, inventory: {} };
  let pity: Pity = {};
  const shards: ShardGrade[] = [];
  const named = new Set(ids.flatMap((id) => CHAINS[id].pieces.flatMap((p) => p.regions)));
  const regions = REGION_ORDER.filter((r) => r === 'mainline' || named.has(r));
  for (const region of regions) {
    const run = newRun(EXPECT_SEED, region, 'plain', 1);
    for (let d = 1; d < depth; d++) {   // arriving at `depth`: its own drops come after the fight
      const floor = walkFloor(s, pity, region, d, run);
      s = floor.state;
      pity = floor.pity;
      shards.push(...floor.shards);
    }
  }

  let turn = 0;
  for (const grade of shards) {
    for (let tried = 0; tried < ids.length; tried++) {
      const id = ids[turn++ % ids.length];
      const r = absorb({ ...s, inventory: { ...s.inventory, [SHARD_IDS[grade]]: 1 } }, id, grade);
      if (r.ok) { s = r.state; break; }
    }
  }

  return Object.fromEntries(ids.map((id) => {
    const m = s.party.roster[id];
    const memories = memoriesOf(m);
    return [id, { memories, absorbed: [...(m.absorbed ?? [])], oath: id === 'rin' && memories >= chainLength('rin') }];
  })) as Record<CharacterId, Expected>;
}

/**
 * One cleared floor of the expectation, in this order: the forced glimmers, a natural glimmer every
 * round(1 / GLIMMER_CHANCE) floors, an elite every EXPECT_ELITE_EVERY floors and the boss of a boss depth, each through
 * the real rules on the floor's own rng, `mulberry32(mix(mix(EXPECT_SEED, region index), depth))`; then the pity of the
 * floor. A glimmer that holds no piece leaves an ownerless shard; a townsfolk fragment goes into the inventory. The
 * given state and pity are not changed. `cal` (time and moon ruling 3): the day the floor is walked on, for the forced
 * glimmers and the pieces, as the game passes it; the pity takes none. Absent (the expectation, the pace, the sim), the
 * floor is as it always was.
 */
export function walkFloor(s: GameState, pity: Pity, region: RegionId, depth: number, run: Run, cal?: CalendarNow): { state: GameState; pity: Pity; shards: ShardGrade[] } {
  const rng = mulberry32(mix(mix(EXPECT_SEED, REGION_ORDER.indexOf(region)), depth));
  const shards: ShardGrade[] = [];
  const dropped: CharacterId[] = [];
  const take = (got: CharacterId[]) => {
    s = { ...s, party: applyPieces(s.party, got).party };
    dropped.push(...got);
    pity = { ...pity, ...Object.fromEntries(got.map((id) => [id, 0])) };   // a piece resets its chain at once, as the game does
  };
  const glimmerEvery = Math.round(1 / GLIMMER_CHANCE);
  const at = cal ? { cal } : {};
  const glimmers: (CharacterId | undefined)[] = [...forcedGlimmers(s.party, pity, region, depth, cal), ...(depth % glimmerEvery === 0 ? [undefined] : [])];
  for (const who of glimmers) {
    const got = pieceDrops(s.party, pity, { region, depth, source: 'glimmer', who, ...at }, rng);
    if (got.length > 0) take(got);
    else shards.push(shardGrade(depth, rng()));
  }
  const sources: Source[] = [];
  if (depth % EXPECT_ELITE_EVERY === 0) sources.push('elite');
  if (isBossDepth(region, depth)) sources.push('boss');
  for (const source of sources) {
    take(pieceDrops(s.party, pity, { region, depth, source, ...at }, rng));
    for (const g of lootFragments(s, run, { region, depth, source }, rng)) {
      if (g.kind === 'shard') shards.push(g.grade);
      else s = { ...s, inventory: { ...s.inventory, [fragmentItem(g)!]: 1 } };
    }
  }
  return { state: s, pity: pityAfterFloor(s.party, pity, region, depth, dropped), shards };
}

/** How deep `memoryPace` walks: past the finale, so a late chain still shows where it would end. */
export const PACE_DEPTH = 40;

/** The road a character's pace is measured on: the main road for the hero and Rin, else the region she is met in. */
export function paceHome(id: CharacterId): RegionId {
  return MEETINGS.find((m) => m.id === id)?.region ?? 'mainline';
}

const paceCache = new Map<string, number[]>();

/**
 * The depth each of `id`'s pieces drops on (index k - 1 for piece k), walking her home road (`paceHome`) from depth 1 to
 * PACE_DEPTH floor by floor with `walkFloor`. The hero and Rin are met from depth 1; every companion whose home is the
 * same road joins on her meeting depth, and that floor's own drops count. Shards are not absorbed. Shorter than the
 * chain when it does not complete. This is not `expectedMemories`: that one meets everyone at depth 1, walks the main
 * road and then the other regions, and counts what is held on arriving. Pure, cached on the knobs' current values.
 */
export function memoryPace(id: CharacterId): number[] {
  const key = `${id}:${knobs()}`;
  let out = paceCache.get(key);
  if (!out) {
    out = computePace(id);
    paceCache.set(key, out);
  }
  return [...out];
}

function computePace(id: CharacterId): number[] {
  const home = paceHome(id);
  let s: GameState = newGame(mulberry32(EXPECT_SEED), EXPECT_SEED, ['hero', 'rin']);
  s = { ...s, inventory: {} };
  let pity: Pity = {};
  const run = newRun(EXPECT_SEED, home, 'plain', 1);
  const held = () => (s.party.roster[id] ? memoriesOf(s.party.roster[id]) : 0);
  const out: number[] = [];
  for (let d = 1; d <= PACE_DEPTH; d++) {
    for (const m of MEETINGS) if (m.region === home && m.depth === d) s = { ...s, party: meet(s.party, m.id, 1) };
    const before = held();
    const floor = walkFloor(s, pity, home, d, run);
    s = floor.state;
    pity = floor.pity;
    for (let n = before; n < held(); n++) out.push(d);
  }
  return out;
}
