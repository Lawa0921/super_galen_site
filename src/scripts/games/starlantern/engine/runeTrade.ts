import { RUNE_BUY, RUNE_SELL, RUNE_STOCK } from '../data/runeEconomy';
import { RUNE_STACK, parseRuneKey, runeKey, type RuneRef } from '../data/runes';
import { PERKS } from '../data/story/fragments';
import { bagCount, ownedCount } from './sockets';
import type { GameState } from './state';
import { hasPerk } from './story/fragments';

/**
 * Trading runes in town (spec §6.5, plan 8f): Orik sells four common runes once runes are open and buys any rune in the
 * bag back. Pure; Game.buyRune/sellRune check the phase and save. Prices: data/runeEconomy. Never changes `s`.
 */

/** Why a rune trade is refused; `essence` is fusion's alone (Task 5). */
export type RuneTradeFail = 'closed' | 'invalid' | 'gold' | 'full' | 'stock' | 'essence';
type Traded = { ok: true; state: GameState } | { ok: false; reason: RuneTradeFail };

const isQty = (n: number): boolean => Number.isInteger(n) && n > 0;
const known = (r: RuneRef): boolean => parseRuneKey(runeKey(r)) !== null;

/** What the shop sells now: RUNE_STOCK at the common tier once runes are open, else nothing. */
export function runeStock(s: Pick<GameState, 'runesOpen'>): RuneRef[] {
  return s.runesOpen ? RUNE_STOCK.map((id) => ({ id, tier: 'common' })) : [];
}

/** What the shop asks for `r`: its RUNE_BUY price less Orik's discount, as priceOf takes it; undefined when not for sale. */
export function runeBuyPrice(s: GameState, r: RuneRef): number | undefined {
  const price = RUNE_BUY[r.tier];
  if (price === undefined || !runeStock(s).some((x) => x.id === r.id && x.tier === r.tier)) return undefined;
  return hasPerk(s, 'shop-discount') ? Math.ceil(price * (100 - PERKS.shopDiscountPct) / 100) : price;
}

/** The most of `r` the player can buy now: what the gold pays for, up to the stack (bag and sockets); 0 when not for sale. */
export function runeBuyMax(s: GameState, r: RuneRef): number {
  const price = runeBuyPrice(s, r);
  if (price === undefined) return 0;
  return Math.max(0, Math.min(Math.floor(s.gold / price), RUNE_STACK - ownedCount(s, r)));
}

/** Buy `qty` of `r` (plan 8f ruling 8). Past the stack it is refused (`full`): the player chose it, so nothing turns to gold. */
export function buyRune(s: GameState, r: RuneRef, qty = 1): Traded {
  if (!isQty(qty)) return { ok: false, reason: 'invalid' };
  if (!s.runesOpen) return { ok: false, reason: 'closed' };
  const price = runeBuyPrice(s, r);
  if (price === undefined) return { ok: false, reason: 'invalid' };
  if (ownedCount(s, r) + qty > RUNE_STACK) return { ok: false, reason: 'full' };
  if (s.gold < price * qty) return { ok: false, reason: 'gold' };
  const k = runeKey(r);
  return { ok: true, state: { ...s, gold: s.gold - price * qty, runes: { ...s.runes, [k]: bagCount(s, r) + qty } } };
}

/** What the shop pays for one `r`: RUNE_SELL by tier, never discounted. */
export const runeSellPrice = (r: RuneRef): number => RUNE_SELL[r.tier];

/** The most of `r` the player can sell: the bag's alone (a socketed rune comes out first, plan 8f ruling 13). */
export const runeSellMax = (s: GameState, r: RuneRef): number => bagCount(s, r);

/** Sell `qty` of `r` from the bag; open runes are not needed, what the bag holds can always go. */
export function sellRunes(s: GameState, r: RuneRef, qty: number): Traded {
  if (!isQty(qty) || !known(r)) return { ok: false, reason: 'invalid' };
  const have = bagCount(s, r);
  if (have < qty) return { ok: false, reason: 'stock' };
  const runes = { ...s.runes };
  const k = runeKey(r);
  if (have === qty) delete runes[k]; else runes[k] = have - qty;
  return { ok: true, state: { ...s, gold: s.gold + runeSellPrice(r) * qty, runes } };
}
