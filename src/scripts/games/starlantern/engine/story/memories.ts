import { CHARACTER_IDS } from '../../data/characters';
import type { RegionId } from '../../data/regions';
import { CHAINS, ELITE_PIECE_CHANCE, HERO_TOPUP, MEMORY_PITY, whenHolds, type FragmentSource } from '../../data/story/chains';
import type { ShardGrade, TownFragmentId } from '../../data/story/fragments';
import type { CharacterId, Party } from '../types';
import { memoriesOf } from '../progression';
import { mulberry32, pick, type Rng } from '../rng';
import { mix } from '../loot/drops';
import type { Run } from '../dungeon/run';

/** Floors cleared without a piece, per chain. */
export type Pity = Partial<Record<CharacterId, number>>;

/** What a drop source hands out. `play` is filled by the game (Task 5); the rules here always say false. */
export type FragmentGain =
  | { kind: 'piece'; id: CharacterId; n: number; play: boolean }
  | { kind: 'shard'; grade: ShardGrade }
  | { kind: 'town'; id: TownFragmentId };

export interface PieceCtx { region: RegionId; depth: number; source: FragmentSource; who?: CharacterId }

/** Salts the memory drops' own rng, so a drop never takes a draw from the loot rolls. */
export const MEMORY_SALT = 0x510e527f;
/** The next memory-drop rng of a run: seeded from the run seed and the count of drops so far, which it advances. */
export const memoryRng = (run: Run): Rng => mulberry32(mix(run.seed ^ MEMORY_SALT, run.memoryDraws++));

/** Equal to the bound `isStory` puts on `story.pity`, so a long game never writes a save that will not load. */
export const MAX_PITY = 999;
/** Most chains one floor can force a glimmer for. */
const MAX_FORCED = 2;

/** The number of `id`'s next piece (1-based), or null when the chain is complete. */
export function nextPiece(p: Party, id: CharacterId): number | null {
  const n = memoriesOf(p.roster[id]) + 1;
  return n > CHAINS[id].pieces.length ? null : n;
}

/** Whether `id`'s next piece can drop here: met, the piece's regions, depth, calendar and (for boss-only pieces) source. */
export function eligible(p: Party, id: CharacterId, ctx: PieceCtx): boolean {
  if (!p.recruited.includes(id)) return false;
  const n = nextPiece(p, id);
  if (n === null) return false;
  const piece = CHAINS[id].pieces[n - 1];
  if (!piece.regions.includes(ctx.region)) return false;
  if (!Number.isFinite(ctx.depth) || ctx.depth < piece.minDepth) return false;
  if (!whenHolds(piece.when)) return false;
  if (piece.bossOnly && ctx.source !== 'boss') return false;
  return true;
}

/** Who gets a piece from this drop (spec §7.2): a named glimmer, the hero's top-up, then the story chains, then the longest wait. */
export function pieceDrops(p: Party, pity: Pity, ctx: PieceCtx, rng: Rng): CharacterId[] {
  if (ctx.who) return eligible(p, ctx.who, ctx) ? [ctx.who] : [];

  if (ctx.source === 'boss' && eligible(p, 'hero', ctx)) {
    const reached = HERO_TOPUP.filter((t) => ctx.depth >= t.depth);
    if (reached.length > 0) {
      const to = Math.max(...reached.map((t) => t.to));
      const count = to - memoriesOf(p.roster.hero);
      if (count > 0) return Array<CharacterId>(count).fill('hero');
    }
  }

  const candidates = CHARACTER_IDS.filter((id) => eligible(p, id, ctx));
  if (candidates.length === 0) return [];
  if (ctx.source === 'elite' && !candidates.includes('hero') && !(rng() < ELITE_PIECE_CHANCE)) return [];

  const keyed = candidates.filter((id) => CHAINS[id].key);
  const pool = keyed.length > 0 ? keyed : candidates;
  const wait = (id: CharacterId) => pity[id] ?? 0;
  const longest = Math.max(...pool.map(wait));
  const tied = pool.filter((id) => wait(id) === longest);
  if (keyed.length > 0) return [tied.includes('rin') ? 'rin' : tied[0]];
  return [pick(rng, tied)];
}

/** Pity after a cleared floor: chains that could drop here and did not gain 1 (to MAX_PITY); a chain that dropped resets to 0. */
export function pityAfterFloor(p: Party, pity: Pity, region: RegionId, depth: number, dropped: CharacterId[]): Pity {
  const next: Pity = { ...pity };
  const ctx: PieceCtx = { region, depth, source: 'glimmer' };
  for (const id of CHARACTER_IDS) {
    if (dropped.includes(id)) next[id] = 0;
    else if (eligible(p, id, ctx)) next[id] = Math.min(MAX_PITY, (pity[id] ?? 0) + 1);
  }
  return next;
}

/** Chains whose glimmer on this floor must hold their piece: pity at MEMORY_PITY, Rin's first piece on the main road. At most two. */
export function forcedGlimmers(p: Party, pity: Pity, region: RegionId, depth: number): CharacterId[] {
  const ctx: PieceCtx = { region, depth, source: 'glimmer' };
  return CHARACTER_IDS.filter((id) => {
    if (!eligible(p, id, ctx)) return false;
    if (id === 'rin' && region === 'mainline' && memoriesOf(p.roster.rin) === 0) return true;
    return (pity[id] ?? 0) >= MEMORY_PITY;
  }).slice(0, MAX_FORCED);
}

/** Adds one piece per entry, in order; an id with no member, or a complete chain, is skipped; `gained` numbers each piece. The given party is not changed. */
export function applyPieces(p: Party, ids: CharacterId[]): { party: Party; gained: { id: CharacterId; n: number }[] } {
  const roster = { ...p.roster };
  const gained: { id: CharacterId; n: number }[] = [];
  for (const id of ids) {
    if (!roster[id]) continue;
    const n = memoriesOf(roster[id]) + 1;
    if (n > CHAINS[id].pieces.length) continue;
    roster[id] = { ...roster[id], memories: n };
    gained.push({ id, n });
  }
  return { party: { ...p, roster }, gained };
}
