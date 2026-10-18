import { ABSORB_CAP, ABSORB_GAIN, PERKS, SHARD_DROP, SHARD_IDS, SHARD_PRICE, TOWN_DROP, TOWN_FRAGMENTS, shardGrade, type ShardGrade, type TownFragmentId, type TownPerk } from '../../data/story/fragments';
import { STORY } from '../../data/story.zh-TW';
import { mix } from '../loot/drops';
import { pick, mulberry32 } from '../rng';
import { addItem, type TownResult } from '../town';
import type { AbsorbGain, CharacterId, StatKey } from '../types';
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

const isGrade = (g: unknown): g is ShardGrade => typeof g === 'string' && Object.prototype.hasOwnProperty.call(SHARD_PRICE, g);
/** The stats a shard can raise, in the table's own order (the save check reads the same keys). */
const STATS = Object.keys(ABSORB_GAIN.dim) as StatKey[];

/** Whether the fragment that gives `perk` has been returned to its owner. */
export function hasPerk(s: GameState, perk: TownPerk): boolean {
  return TOWN_FRAGMENTS.some((f) => f.perk === perk && s.story.returned.includes(f.id));
}

/**
 * Gives townsfolk fragment `id` back: it must be in the town bag and not returned before. The fragment is removed, the
 * id recorded, and the reward paid in gold and items. A fragment is returned once per save.
 */
export function returnFragment(s: GameState, id: TownFragmentId): TownResult {
  const def = TOWN_FRAGMENTS.find((f) => f.id === id);
  if (!def || s.story.returned.includes(id)) return { ok: false, reason: 'invalid' };
  if ((s.inventory[def.item] ?? 0) < 1) return { ok: false, reason: 'stock' };
  const n = structuredClone(s);
  addItem(n.inventory, def.item, -1);
  n.story.returned.push(id);
  n.gold += def.reward.gold ?? 0;
  for (const [item, qty] of Object.entries(def.reward.items ?? {})) addItem(n.inventory, item, qty);
  return { ok: true, state: n };
}

/** What the guild pays for one shard; Anna's returned fragment lifts it. */
export function shardPrice(s: GameState, grade: ShardGrade): number {
  const base = SHARD_PRICE[grade];
  return hasPerk(s, 'shard-price') ? Math.round(base * PERKS.shardPriceMul) : base;
}

/** Sells `qty` shards of one grade. A shard sale never counts toward `sold`, so it unlocks nothing. */
export function sellShards(s: GameState, grade: ShardGrade, qty: number): TownResult {
  if (!isGrade(grade) || !Number.isSafeInteger(qty) || qty <= 0) return { ok: false, reason: 'invalid' };
  const id = SHARD_IDS[grade];
  const have = s.inventory[id] ?? 0;
  if (have < qty) return { ok: false, reason: 'stock' };
  const inventory = { ...s.inventory, [id]: have - qty };
  if (inventory[id] === 0) delete inventory[id];
  return { ok: true, state: { ...s, gold: s.gold + shardPrice(s, grade) * qty, inventory } };
}

export const ABSORB_SALT = 0x1f83d9ab;

/** The absorbing stream: seeded by the save and how much the party has absorbed, so a reload cannot re-roll. */
export function absorbRng(s: GameState): Rng {
  const total = Object.values(s.party.roster).reduce((n, m) => n + (m.absorbed?.length ?? 0), 0);
  return mulberry32(mix(s.forgeSalt ^ ABSORB_SALT, total));
}

export type AbsorbResult =
  | { ok: true; state: GameState; gain: AbsorbGain; line: string }
  | { ok: false; reason: 'invalid' | 'stock' | 'cap' };

/** One shard into a member who was met: a random stat from the grade's table, a line, one shard fewer. */
export function absorb(s: GameState, id: CharacterId, grade: ShardGrade): AbsorbResult {
  if (!isGrade(grade) || !s.party.recruited.includes(id)) return { ok: false, reason: 'invalid' };
  const key = SHARD_IDS[grade];
  const have = s.inventory[key] ?? 0;
  if (have < 1) return { ok: false, reason: 'stock' };
  const member = s.party.roster[id];
  const list = member.absorbed ?? [];
  if (list.length >= ABSORB_CAP) return { ok: false, reason: 'cap' };
  const rng = absorbRng(s);
  const stat = pick(rng, STATS);
  const gain: AbsorbGain = { stat, amount: ABSORB_GAIN[grade][stat] };
  const line = pick(rng, STORY.absorb);
  const inventory = { ...s.inventory, [key]: have - 1 };
  if (inventory[key] === 0) delete inventory[key];
  const roster = { ...s.party.roster, [id]: { ...member, absorbed: [...list, gain] } };
  return { ok: true, state: { ...s, inventory, party: { ...s.party, roster } }, gain, line };
}
