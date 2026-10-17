import { SHARD_DROP, SHARD_IDS, TOWN_DROP, TOWN_FRAGMENTS, shardGrade, type TownFragmentId } from '../../data/story/fragments';
import type { RegionId } from '../../data/regions';
import type { Run } from '../dungeon/run';
import type { Rng } from '../rng';
import type { GameState } from '../state';
import type { FragmentGain } from './memories';

export type FragmentSource = 'boss' | 'elite' | 'chest' | 'vault';
export interface FragmentCtx { region: RegionId; depth: number; source: FragmentSource }

/** The run-pack item a gain turns into; undefined for a memory piece, which is never carried. */
export function fragmentItem(g: FragmentGain): string | undefined {
  if (g.kind === 'shard') return SHARD_IDS[g.grade];
  if (g.kind === 'town') return `tf-${g.id}`;
  return undefined;
}

/** The gain an item id stands for, the inverse of fragmentItem; undefined for anything that is not a fragment. */
export function gainOf(item: string): FragmentGain | undefined {
  const grade = (Object.keys(SHARD_IDS) as (keyof typeof SHARD_IDS)[]).find((k) => SHARD_IDS[k] === item);
  if (grade) return { kind: 'shard', grade };
  const town = TOWN_FRAGMENTS.find((f) => f.item === item);
  return town ? { kind: 'town', id: town.id } : undefined;
}

/**
 * Whether townsfolk fragment `id` may drop now: the place and depth fit, and it is not already returned, in the town
 * bag, in the run pack, or rolled this run for a chest or vault that has not paid it out yet.
 */
export function townFragmentEligible(s: GameState, run: Run | null, id: TownFragmentId, region: RegionId, depth: number): boolean {
  const def = TOWN_FRAGMENTS.find((f) => f.id === id);
  if (!def) return false;
  if (def.regions !== 'any' && !def.regions.includes(region)) return false;
  if (depth < def.minDepth) return false;
  if (s.story.returned.includes(id) || (s.inventory[def.item] ?? 0) > 0) return false;
  if (!run) return true;
  if ((run.loot.items[def.item] ?? 0) > 0) return false;
  return !Object.values(run.rolls).some((r) => r.frags?.includes(def.item));
}

/**
 * What a drop source leaves in fragments: a boss always one ownerless shard (other sources on SHARD_DROP), and at most
 * one townsfolk fragment, the first eligible in table order, on TOWN_DROP. Draws only from `rng` (the memory stream).
 */
export function lootFragments(s: GameState, run: Run, ctx: FragmentCtx, rng: Rng): FragmentGain[] {
  const out: FragmentGain[] = [];
  if (ctx.source === 'boss' || rng() < SHARD_DROP[ctx.source]) out.push({ kind: 'shard', grade: shardGrade(ctx.depth, rng()) });
  const open = TOWN_FRAGMENTS.filter((f) => townFragmentEligible(s, run, f.id, ctx.region, ctx.depth));
  if (open.length > 0 && rng() < TOWN_DROP[ctx.source]) out.push({ kind: 'town', id: open[0].id });
  return out;
}
