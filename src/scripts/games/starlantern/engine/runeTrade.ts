import { RUNE_BUY, RUNE_FUSE, RUNE_FUSE_IN, RUNE_SELL, RUNE_STOCK } from '../data/runeEconomy';
import { RUNE_IDS, RUNE_STACK, RUNE_TIERS, parseRuneKey, runeKey, type RuneRef, type RuneTier } from '../data/runes';
import { canPay, pay } from './forge/cost';
import { bagCount, ownedCount } from './sockets';
import type { GameState } from './state';
import { shopPrice } from './town';

/**
 * Trading runes in town (spec §6.5, plan 8f): Orik sells four common runes once runes are open and buys any rune in the
 * bag back; the forge fuses three of a kind into the next tier. Pure; Game.buyRune/sellRune/fuseRune check the phase
 * and save. Prices: data/runeEconomy. Never changes `s`.
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

/** What the shop asks for `r`: its RUNE_BUY price less Orik's discount (town `shopPrice`); undefined when not for sale. */
export function runeBuyPrice(s: GameState, r: RuneRef): number | undefined {
  const price = RUNE_BUY[r.tier];
  if (price === undefined || !runeStock(s).some((x) => x.id === r.id && x.tier === r.tier)) return undefined;
  return shopPrice(s, price);
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

/** Why a fusion is refused: a trade reason, or `top` for a tier that fuses no higher (epic, legendary). */
export type RuneFuseFail = RuneTradeFail | 'top';

/** What fusing three of `r` makes and costs (plan 8f ruling 9); undefined for epic and legendary. */
export function fuseCostOf(r: RuneRef): { to: RuneRef; gold: number; essence: string } | undefined {
  const f = (RUNE_FUSE as Partial<Record<RuneTier, (typeof RUNE_FUSE)['common']>>)[r.tier];
  return f ? { to: { id: r.id, tier: f.to }, gold: f.gold, essence: f.essence } : undefined;
}

/**
 * Three of `r` from the bag, the gold and one essence make one of the next tier. Refused, in this order: a tier that fuses
 * no higher (`top`), fewer than three in the bag (`stock`; socketed ones do not count), the gold, the essence (named on
 * screen, not mixed up with the runes), and the next tier already at RUNE_STACK (bag and sockets, `full`). Open runes are
 * not needed; nothing is drawn (forgeDraws untouched).
 */
export function fuseRunes(s: GameState, r: RuneRef): { ok: true; state: GameState; made: RuneRef } | { ok: false; reason: RuneFuseFail } {
  const cost = fuseCostOf(r);
  if (!known(r)) return { ok: false, reason: 'invalid' };
  if (!cost) return { ok: false, reason: 'top' };
  if (bagCount(s, r) < RUNE_FUSE_IN) return { ok: false, reason: 'stock' };
  const lack = canPay(s, { gold: cost.gold, mats: { [cost.essence]: 1 } });
  if (lack) return { ok: false, reason: lack === 'gold' ? 'gold' : 'essence' };
  if (ownedCount(s, cost.to) >= RUNE_STACK) return { ok: false, reason: 'full' };
  const next: GameState = { ...s, inventory: { ...s.inventory } };
  pay(next, { gold: cost.gold, mats: { [cost.essence]: 1 } });
  const runes = { ...s.runes };
  const k = runeKey(r);
  const left = bagCount(s, r) - RUNE_FUSE_IN;
  if (left > 0) runes[k] = left; else delete runes[k];
  runes[runeKey(cost.to)] = bagCount(s, cost.to) + 1;
  return { ok: true, state: { ...next, runes }, made: cost.to };
}

const TIER_ORDER: readonly RuneTier[] = [...RUNE_TIERS, 'legendary'];
/** The order runes are listed in on every screen: RUNE_IDS order, then tier from common up. */
export const compareRunes = (a: RuneRef, b: RuneRef): number =>
  RUNE_IDS.indexOf(a.id) - RUNE_IDS.indexOf(b.id) || TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);

/** The runes in the bag (count above 0), in `compareRunes` order. */
export const bagRunes = (s: Pick<GameState, 'runes'>): RuneRef[] =>
  Object.entries(s.runes ?? {}).filter(([, n]) => n > 0).map(([k]) => parseRuneKey(k)).filter((r): r is RuneRef => r !== null).sort(compareRunes);
