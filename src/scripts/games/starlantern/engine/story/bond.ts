import {
  BOND_CAP, BOND_MAX, BOND_PER_PIECE, BOND_START, BOND_TIER_AT, GIFTABLE, GIFT_REPEAT_FULL, GIFT_TASTE, GIFT_VALUE,
  type BondTier, type Companion, type Taste,
} from '../../data/story/bond';
import { dayOf } from '../calendar';
import { memoriesOf } from '../progression';
import type { GameState } from '../state';
import type { BondRecord, GiftId, Member } from '../types';

/**
 * Bond (好感度) as pure functions of what has happened (bond plan Task 1; spec §4). No rng of any kind: every point is an
 * event already in the save. The score is never stored; it is derived from `Member.bond` and the pieces she holds.
 */

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
