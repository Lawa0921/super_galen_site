import { REGIONS, type RegionId } from '../../data/regions';
import { CHAINS, ELITE_PIECE_CHANCE, GLIMMER_CHANCE, HERO_TOPUP, MEMORY_PITY, chainLength } from '../../data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN, SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS, shardGrade, type ShardGrade } from '../../data/story/fragments';
import { isBossDepth, newRun } from '../dungeon/run';
import { mix } from '../loot/drops';
import { memoriesOf } from '../progression';
import { mulberry32 } from '../rng';
import { newGame, type GameState } from '../state';
import type { AbsorbGain, CharacterId } from '../types';
import { absorb, fragmentItem, lootFragments } from './fragments';
import { applyPieces, forcedGlimmers, pieceDrops, pityAfterFloor, type Pity } from './memories';

/** The expectation meets one elite every this many floors (the real generator: at most one a floor, 7/100 a room). */
export const EXPECT_ELITE_EVERY = 3;
/** Seeds the expectation's own draws; nothing in a real game reads it. */
export const EXPECT_SEED = 0x6b;

/** What one member is expected to hold on arriving at a depth. */
export interface Expected { memories: number; absorbed: AbsorbGain[]; oath: boolean }

type Source = 'elite' | 'boss';

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
 * known underestimate. Pure: the same depth, ids and memory knobs always give the same, and every call gets its own
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
  CHAINS, HERO_TOPUP, MEMORY_PITY, ELITE_PIECE_CHANCE, GLIMMER_CHANCE, ABSORB_CAP, ABSORB_GAIN, SHARD_DROP, TOWN_DROP, TOWN_FRAGMENTS,
  EXPECT_ELITE_EVERY, EXPECT_SEED,
]);

function compute(depth: number, ids: CharacterId[]): Record<CharacterId, Expected> {
  let s: GameState = newGame(mulberry32(EXPECT_SEED), EXPECT_SEED, ids);
  s = { ...s, inventory: {} };
  let pity: Pity = {};
  const shards: ShardGrade[] = [];
  const order = Object.keys(REGIONS) as RegionId[];
  const named = new Set(ids.flatMap((id) => CHAINS[id].pieces.flatMap((p) => p.regions)));
  const regions = order.filter((r) => r === 'mainline' || named.has(r));
  const glimmerEvery = Math.round(1 / GLIMMER_CHANCE);

  for (const region of regions) {
    const run = newRun(EXPECT_SEED, region, 'plain', 1);
    for (let d = 1; d < depth; d++) {   // arriving at `depth`: its own drops come after the fight
      const rng = mulberry32(mix(mix(EXPECT_SEED, order.indexOf(region)), d));
      const dropped: CharacterId[] = [];
      const take = (got: CharacterId[]) => {
        s = { ...s, party: applyPieces(s.party, got).party };
        dropped.push(...got);
        pity = { ...pity, ...Object.fromEntries(got.map((id) => [id, 0])) };   // a piece resets its chain at once, as the game does
      };
      const glimmers: (CharacterId | undefined)[] = [...forcedGlimmers(s.party, pity, region, d), ...(d % glimmerEvery === 0 ? [undefined] : [])];
      for (const who of glimmers) {
        const got = pieceDrops(s.party, pity, { region, depth: d, source: 'glimmer', who }, rng);
        if (got.length > 0) take(got);
        else shards.push(shardGrade(d, rng()));
      }
      const sources: Source[] = [];
      if (d % EXPECT_ELITE_EVERY === 0) sources.push('elite');
      if (isBossDepth(region, d)) sources.push('boss');
      for (const source of sources) {
        take(pieceDrops(s.party, pity, { region, depth: d, source }, rng));
        for (const g of lootFragments(s, run, { region, depth: d, source }, rng)) {
          if (g.kind === 'shard') shards.push(g.grade);
          else s = { ...s, inventory: { ...s.inventory, [fragmentItem(g)!]: 1 } };
        }
      }
      pity = pityAfterFloor(s.party, pity, region, d, dropped);
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
