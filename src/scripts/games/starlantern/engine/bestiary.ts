import { ENEMIES } from '../data/enemies';
import type { BattleState } from './battle';
import type { GameState } from './state';

/**
 * Roster plan Task C3 (spec §10, ruling 17): what the bestiary knows of one kind of foe. `seen`, the fights it was met in
 * (once a fight, however many came; a summon counts, a decoy does not); `felled`, how many of it the party has beaten (the
 * summoned too); `inscribed`, a piece with its inscription has been held.
 */
export interface BestiaryEntry { seen: number; felled: number; inscribed?: true }
/** By definition id: a region's tinted variant is the same kind. */
export type Bestiary = Record<string, BestiaryEntry>;

/**
 * Far above any play; keeps a hand-edited save's counts finite. The counts stop here too (PR C review L2), so a save at the
 * cap never turns corrupt one fight later.
 */
export const BESTIARY_MAX = 1e9;
const MAX_COUNT = BESTIARY_MAX;
const bump = (n: number): number => Math.min(MAX_COUNT, n + 1);

/** The kinds a fight shows now: each foe's definition id once, a decoy left out (it is its foe's phantom). */
export function speciesIn(b: BattleState): string[] {
  return [...new Set(b.enemies.filter((c) => !c.decoyOf).map((c) => c.defId))];
}

function entry(s: GameState, id: string): BestiaryEntry {
  const book = (s.bestiary ??= {});
  return (book[id] ??= { seen: 0, felled: 0 });
}

/** One more fight in which each of `ids` was met. Draws nothing. */
export function noteSeen(s: GameState, ids: readonly string[]): void {
  for (const id of ids) { const e = entry(s, id); e.seen = bump(e.seen); }
}

/** A won fight: each foe beaten in it (fallen, not fled, not a decoy) counts once. Draws nothing. */
export function noteFelled(s: GameState, b: BattleState): void {
  for (const c of b.enemies) if (!c.alive && !c.left && !c.decoyOf) { const e = entry(s, c.defId); e.felled = bump(e.felled); }
}

/** A piece with `species`' inscription came into the party's hands. Draws nothing. */
export function noteInscribed(s: GameState, species: string): void {
  entry(s, species).inscribed = true;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_COUNT;

/** The save's shape check (ruling 17): an object of entries, each two whole counts and `inscribed` only ever true. */
export function isBestiary(v: unknown): boolean {
  return isObj(v) && Object.values(v).every((e) => isObj(e) && isCount(e.seen) && isCount(e.felled) && (e.inscribed === undefined || e.inscribed === true));
}

/**
 * Ruling 17: a kind this build does not know (renamed, removed) is dropped from the bestiary on load, as an unknown
 * banter is (`dropUnknownBanters`), instead of making the save corrupt.
 */
export function repairBestiary(d: Record<string, unknown>): void {
  const book = d.bestiary;
  if (!isObj(book)) return;
  for (const id of Object.keys(book)) if (!Object.prototype.hasOwnProperty.call(ENEMIES, id)) delete book[id];
}
