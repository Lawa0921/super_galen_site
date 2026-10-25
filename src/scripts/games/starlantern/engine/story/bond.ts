import {
  ROMANCEABLE, BOND_GATE, BOND_CAP, BOND_MAX, BOND_PCT, BOND_PER_PIECE, BOND_RUN_CAP, BOND_SCALE, BOND_START, BOND_TIER_AT, DANGER_PCT, GIFTABLE,
  GIFT_MOOD, GIFT_REPEAT_FULL, GIFT_TASTE, GIFT_VALUE, RIN_GIFT_MOOD_BEFORE_OATH, TALK_POINTS, TONE_PREF, type BondTier, type Companion,
  type Taste, type Tone,
} from '../../data/story/bond';
import { GIFT_LINES, rinOathLines, type GiftPools } from '../../data/bond.zh-TW';
import type { StoryMood } from '../../render/artPaths';
import { chainLength } from '../../data/story/chains';
import { gateExpired, gateOpen, storyPieces } from './events';
import { BONDS_WRITTEN, ROMANCES_WRITTEN, bondScene, type SceneId } from '../../data/story/scenes';
import { CHARACTER_IDS } from '../../data/characters';
import type { Run } from '../dungeon/run';
import { CHARACTERS } from '../../data/characters';
import { dayOf } from '../calendar';
import { memoriesOf } from '../progression';
import type { GameState } from '../state';
import type { BondRecord, CharacterId, GiftId, Member, Party, Sheet } from '../types';

/**
 * Bond (好感度) as pure functions of what has happened (bond plan Task 1; spec §4). No rng of any kind: every point is an
 * event already in the save. The score is never stored; it is derived from `Member.bond` and the pieces she holds.
 */

/**
 * The bond switches (bond plan ruling 5), as `FORCED_GLIMMERS`: `scale` multiplies the battle bonus (0 turns it off, spec
 * §5.5); `earn` lets the field points be earned. Shipped code never changes them; tests go through `withBondScale`
 * (engine/testing.ts) and set `earn` back in a `finally`.
 */
export const BOND_SWITCH: { earn: boolean; scale: number } = { earn: true, scale: BOND_SCALE };

/** Her record, or an empty one when she has earned nothing yet. */
export function bondOf(m: Pick<Member, 'bond'>): BondRecord {
  return m.bond ?? { talk: 0, field: 0, gifts: {} };
}

/**
 * How `c` takes `mat` (spec §6.2): null when it is not giftable. `healed` (her memories all told) turns a declined material
 * into its healed taste, when it has one.
 */
export function tasteOf(c: Companion, mat: GiftId, healed: boolean): Taste | null {
  if (!GIFTABLE.includes(mat)) return null;
  const t = GIFT_TASTE[c];
  if (t.loved.includes(mat)) return 'loved';
  if (t.liked.includes(mat)) return 'liked';
  if (t.declined.includes(mat)) return (healed && t.healed[mat]) || 'declined';
  return 'neutral';
}

/**
 * The points her gifts are worth, before the gift cap: each material's first GIFT_REPEAT_FULL are worth its taste, every
 * one after is worth 1. A gift is read with her healed taste: a material she took was never declined then, and healing
 * changes only declined ones, so both readings agree (tested). The hero has none.
 */
export function giftPoints(m: Pick<Member, 'id' | 'bond'>): number {
  if (m.id === 'hero') return 0;
  let sum = 0;
  for (const [mat, count] of Object.entries(bondOf(m).gifts)) {
    const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const taste = tasteOf(m.id, mat, true);
    if (n === 0 || taste === null || taste === 'declined') continue;
    sum += GIFT_VALUE[taste] * Math.min(n, GIFT_REPEAT_FULL) + Math.max(0, n - GIFT_REPEAT_FULL);
  }
  return sum;
}

/**
 * Her bond, 0..BOND_MAX (spec §4.1, §0 D2): BOND_START, BOND_PER_PIECE for each piece she holds, and each source up to its
 * own cap. The hero has none.
 */
export function bondPoints(m: Pick<Member, 'id' | 'memories' | 'bond'>): number {
  if (m.id === 'hero') return 0;
  const b = bondOf(m);
  const sum = BOND_START + BOND_PER_PIECE * memoriesOf(m)
    + Math.min(b.talk, BOND_CAP.talk) + Math.min(giftPoints(m), BOND_CAP.gift) + Math.min(b.field, BOND_CAP.field);
  return Math.max(0, Math.min(BOND_MAX, sum));
}

/** The tier `points` reaches (BOND_TIER_AT). */
export function tierAt(points: number): BondTier {
  let tier = 0;
  for (let t = 1; t < BOND_TIER_AT.length; t++) if (points >= BOND_TIER_AT[t]) tier = t;
  return tier as BondTier;
}

/**
 * Today's gifts and talk (bond plan ruling 10): what `story.bondDay` holds when it is today (`dayOf`), and nothing on any
 * other day. Every read of `gifted` and `talked` goes through here.
 */
export function today(s: GameState): { gifted: Companion[]; talked: boolean } {
  const st = s.story;
  if (st.bondDay !== dayOf(s)) return { gifted: [], talked: false };
  return { gifted: [...(st.gifted ?? [])], talked: st.talked === true };
}

/** Her tier; the hero's is always 0. */
export const bondTier = (m: Pick<Member, 'id' | 'memories' | 'bond'>): BondTier => tierAt(bondPoints(m));

/** The stats the bond adds to (spec §5.1): never spd (turn order, and Rin's fastest base), tp, crit, the gauge or primaries. */
const BOND_STATS = ['hp', 'atk', 'def', 'mag', 'res'] as const;
/**
 * The battle bonus (spec §5.1): BOND_PCT of her tier, of her own natural stats only (base plus growth to her level; no gear,
 * set, talent or memory), each rounded down. Nothing for the hero, at scale 0, at tier 0, or with no record at all (spec
 * §5.3): pieces alone make a tier, and the sim's parties hold pieces (the memory expectation) but never a record, so no
 * frozen band moves. In play a record comes with the first floor gone down together, the first gift or the first talk.
 */
export function bondStats(m: Pick<Member, 'id' | 'level' | 'memories' | 'bond'>, scale = BOND_SWITCH.scale): Partial<Sheet> {
  if (m.id === 'hero' || !m.bond || scale === 0) return {};
  const pct = BOND_PCT[bondTier(m)];
  if (pct === 0) return {};
  const def = CHARACTERS[m.id];
  const out: Partial<Sheet> = {};
  for (const k of BOND_STATS) out[k] = Math.floor(((def.base[k] + def.growth[k] * (m.level - 1)) * pct * scale) / 100);
  return out;
}

/** In danger (bond plan ruling 3, spec §0 D4): down, or at DANGER_PCT of her max HP or less. */
export const inDanger = (c: { hp: number; max: { hp: number } }): boolean => c.hp <= 0 || c.hp * 100 <= c.max.hp * DANGER_PCT;

/**
 * Field points (spec §4.3): `pts` for each companion of `ids` (the hero passed over), up to what the dive has left of
 * BOND_RUN_CAP (`run.bond`) and her lifetime BOND_CAP.field. Pure: a new party and what each one gained; the caller adds
 * `gained` to `run.bond`. Switched off (`BOND_SWITCH.earn` false), the party comes back as it was.
 */
export function addField(party: Party, run: Pick<Run, 'bond'>, ids: readonly CharacterId[], pts: number): { party: Party; gained: Partial<Record<Companion, number>> } {
  const gained: Partial<Record<Companion, number>> = {};
  if (!BOND_SWITCH.earn) return { party, gained };
  let roster = party.roster;
  for (const id of ids) {
    if (id === 'hero') continue;
    const m = roster[id];
    const b = bondOf(m);
    const add = Math.min(pts, BOND_RUN_CAP - (run.bond[id] ?? 0) - (gained[id] ?? 0), BOND_CAP.field - b.field);
    if (add <= 0) continue;
    roster = { ...roster, [id]: { ...m, bond: { ...b, gifts: { ...b.gifts }, field: b.field + add } } };
    gained[id] = (gained[id] ?? 0) + add;
  }
  return { party: roster === party.roster ? party : { ...party, roster }, gained };
}

/**
 * A maxed record (bond plan Task 3, for band 21): every cap but the memories, the gifts her two loved materials 9 each
 * (4 × 2 + 7 = 15 apiece, 30 in all). 10 + 12 + 30 + 40 = 92: 心契 without a single piece.
 */
export function maxBondRecord(c: Companion): BondRecord {
  const [a, b] = GIFT_TASTE[c].loved;
  return { talk: BOND_CAP.talk, field: BOND_CAP.field, gifts: { [a]: 9, [b]: 9 } };
}

/** A gift's outcome (spec §6.3, §6.4). Taken or handed back, the new state comes with it; a failure changes nothing. */
export type GiveResult =
  | { ok: true; c: Companion; mat: GiftId; taste: Taste; healed: boolean; count: number; gained: number; state: GameState }
  | { ok: false; reason: 'hero' | 'unmet' | 'today' | 'stock' | 'ungiftable' | 'unwritten' };

/** Her reaction lines (bond plan ruling 6): Rin's after her choice are their own table; undefined while not written. */
export function giftPools(s: GameState, c: Companion, pools: Partial<Record<Companion, GiftPools>> = GIFT_LINES, rinOath: GiftPools | null = rinOathLines()): GiftPools | undefined {
  if (c === 'rin' && !rinOath) return undefined;   // Rin is offered once both of her tables are written (plan ruling 6)
  return c === 'rin' && s.party.roster.rin?.oath ? rinOath ?? undefined : pools[c];
}

/**
 * One gift of `mat` to `c` (bond plan Task 6, spec §6.3), a pure function. Fails for the hero, someone not met, one who
 * already took a gift today, a material not held or not giftable, or one whose reactions are not written (Rin: both of her
 * tables). Declined: nothing is used up or recorded but `refused`, and it is not today's gift. Taken: one less in the
 * inventory, her count up, today's gift hers. Her taste is the healed one once her pieces are all told (spec §0 D2).
 */
export function giveGift(s: GameState, c: Companion, mat: GiftId, pools: Partial<Record<Companion, GiftPools>> = GIFT_LINES, rinOath: GiftPools | null = rinOathLines()): GiveResult {
  if ((c as string) === 'hero') return { ok: false, reason: 'hero' };
  if (!s.party.recruited.includes(c)) return { ok: false, reason: 'unmet' };
  if (today(s).gifted.includes(c)) return { ok: false, reason: 'today' };
  if ((s.inventory[mat] ?? 0) < 1) return { ok: false, reason: 'stock' };
  if (!GIFTABLE.includes(mat)) return { ok: false, reason: 'ungiftable' };
  if (!pools[c] || (c === 'rin' && !rinOath)) return { ok: false, reason: 'unwritten' };
  const healed = storyPieces(s, c) >= chainLength(c);
  const taste = tasteOf(c, mat, healed)!;
  const m = s.party.roster[c];
  const b = bondOf(m);
  const n = structuredClone(s);
  if (taste === 'declined') {
    const refused = b.refused?.includes(mat) ? b.refused : [...(b.refused ?? []), mat];
    n.party.roster[c] = { ...n.party.roster[c], bond: { ...structuredClone(b), refused: [...refused] } };
    return { ok: true, c, mat, taste, healed: false, count: 0, gained: 0, state: n };
  }
  const count = (b.gifts[mat] ?? 0) + 1;
  const after = { ...structuredClone(b), gifts: { ...b.gifts, [mat]: count } };
  n.party.roster[c] = { ...n.party.roster[c], bond: after };
  const left = (n.inventory[mat] ?? 0) - 1;
  if (left > 0) n.inventory[mat] = left;
  else delete n.inventory[mat];
  const day = dayOf(s);
  const story = n.story;
  if (story.bondDay !== day) { story.gifted = []; delete story.talked; }
  story.bondDay = day;
  story.gifted = [...(story.gifted ?? []), c];
  const gained = Math.min(giftPoints(n.party.roster[c]), BOND_CAP.gift) - Math.min(giftPoints(m), BOND_CAP.gift);
  return { ok: true, c, mat, taste, healed: healed && GIFT_TASTE[c].declined.includes(mat), count, gained, state: n };
}

/**
 * Her line for a gift (spec §4.6): no rng, the index is the count. Declined: that material's line; the first of a healed
 * material: its healing line; else her pool of that taste, line (count - 1) mod its length.
 */
export function giftLine(r: Extract<GiveResult, { ok: true }>, pools: GiftPools): string | undefined {
  if (r.taste === 'declined') return pools.declined[r.mat];
  if (r.healed && r.count === 1) return pools.healed[r.mat];
  const pool = pools[r.taste];
  return pool.length ? pool[(r.count - 1) % pool.length] : undefined;
}

/** Her face for a gift (spec §6.4): Rin before her choice always `normal` (her averted face waits on her 4th piece). */
export const giftMood = (c: Companion, taste: Taste, oath: boolean): StoryMood =>
  c === 'rin' && !oath ? RIN_GIFT_MOOD_BEFORE_OATH : GIFT_MOOD[c][taste];

/** A bond scene's choice (spec §7.2): her preferred tone 3, any other 2, none (skipped, or cancelled on the choice) 2. */
export const talkPoints = (c: Companion, tone: Tone | null): 2 | 3 =>
  (tone !== null && tone === TONE_PREF[c] ? TALK_POINTS.preferred : tone === null ? TALK_POINTS.skipped : TALK_POINTS.other) as 2 | 3;

/**
 * Her next heart-to-heart (bond plan Task 9, spec §8.2, §8.3): met and registered (`written`); her first bond scene neither
 * seen nor expired, every one before it seen or expired (never a skipped number); open when its gate holds (`gateOpen`:
 * a companion's pieces told, Rin's held, her choice) and her bond reaches its tier. An expired one (Rin's first two, once
 * she has chosen) is passed over, never seen. Null when none is open.
 */
export function nextBond(s: GameState, c: Companion, written: readonly Companion[] = BONDS_WRITTEN): SceneId | null {
  if (!written.includes(c) || !s.party.recruited.includes(c)) return null;
  for (const n of [1, 2, 3, 4] as const) {
    const id = bondScene(c, n);
    const gate = BOND_GATE[c][n];
    if (s.story.seen.includes(id) || gateExpired(s, gate)) continue;
    return gateOpen(s, gate) && bondTier(s.party.roster[c]) >= gate.tier ? id : null;
  }
  return null;
}

/** Every companion's open heart-to-heart (`nextBond`), in CHARACTER_IDS order. */
export const bondOpen = (s: GameState, written: readonly Companion[] = BONDS_WRITTEN): SceneId[] =>
  CHARACTER_IDS.flatMap((c) => (c === 'hero' ? [] : [nextBond(s, c, written)].filter((x): x is SceneId => x !== null)));

/**
 * Who may be asked on the night walk (bond plan ruling 12, spec §9.2): after the finale and the festival, while no one is
 * chosen; romanceable, met, registered (`written`), at 心契, her 心契 scene seen. Highest bond first, CHARACTER_IDS on a tie.
 */
export function romanceCandidates(s: GameState, written: readonly Companion[] = ROMANCES_WRITTEN): Companion[] {
  const st = s.story;
  if (!st.finaleCleared || !st.seen.includes('epilogue') || st.romance !== undefined) return [];
  const ok = ROMANCEABLE.filter((c) => written.includes(c) && s.party.recruited.includes(c) && bondTier(s.party.roster[c]) === 4 && st.seen.includes(bondScene(c, 4)));
  return ok.sort((a, b) => bondPoints(s.party.roster[b]) - bondPoints(s.party.roster[a]) || CHARACTER_IDS.indexOf(a) - CHARACTER_IDS.indexOf(b));
}
