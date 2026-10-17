import { BASE_RECIPES, CONSUMABLE_RECIPES, CRAFT_MAGIC_CHANCE, SET_RECIPE, baseGold, type Cost } from '../../data/forge';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { mintUid, BAG_SIZE } from '../loot/bag';
import { itemLevel, rollItem } from '../loot/item';
import { mulberry32, type Rng } from '../rng';
import type { GameState } from '../state';
import type { GearSlot, ItemInstance } from '../types';
import { addItem } from '../town';
import { addCost, canPay, forgeRng, pay, type ForgeResult } from './cost';

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The item level crafted gear gets: a monster drop's level at the deepest depth reached in any region. */
export function craftLevel(s: GameState): number {
  return itemLevel(Math.max(1, ...Object.values(s.dungeon.reached)), 'monster');
}

/** What crafting `qty` of consumable `id` costs; null when there is no recipe or qty is not a positive integer. */
export function itemRecipeCost(id: string, qty: number): Cost | null {
  if (!has(CONSUMABLE_RECIPES, id) || !Number.isInteger(qty) || qty <= 0) return null;
  const r = CONSUMABLE_RECIPES[id];
  return { gold: r.gold * qty, mats: Object.fromEntries(Object.entries(r.mats).map(([m, n]) => [m, n * qty])) };
}

/** Crafts consumables into the inventory. Draws nothing; never touches `sold`. */
export function craftItem(s: GameState, id: string, qty: number): ForgeResult<{ id: string; qty: number }> {
  const cost = itemRecipeCost(id, qty);
  if (!cost) return { ok: false, reason: 'invalid' };
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, cost);
  addItem(n.inventory, id, qty);
  return { ok: true, state: n, out: { id, qty } };
}

/** The recipe for a base in `slot`: BASE_RECIPES plus baseGold at the current craft level. */
export function baseCost(s: GameState, slot: GearSlot): Cost {
  return { gold: baseGold(craftLevel(s)), mats: { ...BASE_RECIPES[slot] } };
}

/** Crafts a base in `slot`: common, or magic with CRAFT_MAGIC_CHANCE, at craftLevel. Full bag is checked before paying. Without `rng` it draws once. */
export function craftBase(s: GameState, slot: GearSlot, rng?: Rng): ForgeResult<{ item: ItemInstance }> {
  if (!has(BASE_RECIPES, slot)) return { ok: false, reason: 'invalid' };
  if ((s.bag ?? []).length >= BAG_SIZE) return { ok: false, reason: 'full' };
  const cost = baseCost(s, slot);
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, cost);
  // One forge draw seeds the whole pick, so crafting moves `forgeDraws` exactly once.
  const draw = rng ?? mulberry32(Math.floor(forgeRng(n)() * 0x100000000));
  const rarity = draw() < CRAFT_MAGIC_CHANCE ? 'magic' : 'common';
  const item = rollItem(draw, { uid: mintUid(n), ilvl: craftLevel(s), rarity, slot });
  n.bag.push(item);
  return { ok: true, state: n, out: { item } };
}

const setOf = (pieceId: string) => (has(SPECIALS, pieceId) && SPECIALS[pieceId].rarity === 'set' ? SETS[SPECIALS[pieceId].set ?? ''] ?? null : null);

/** The price of a set piece: its region's material, a star tear and gold; null when `pieceId` is not a set piece. */
export function setCost(pieceId: string): Cost | null {
  const set = setOf(pieceId);
  const mat = set ? REGIONS[set.region].material : null;
  if (!set || !mat) return null;
  return addCost({ gold: SET_RECIPE.gold, mats: { [mat]: SET_RECIPE.regionQty } }, { gold: 0, mats: { [SET_RECIPE.rare]: SET_RECIPE.rareQty } });
}

/** Crafts set piece `pieceId` (the pity path); the piece and its set enter the codex. Without `rng` it draws once. */
export function craftSet(s: GameState, pieceId: string, rng?: Rng): ForgeResult<{ item: ItemInstance }> {
  const cost = setCost(pieceId);
  const set = setOf(pieceId);
  if (!cost || !set) return { ok: false, reason: 'invalid' };
  if ((s.bag ?? []).length >= BAG_SIZE) return { ok: false, reason: 'full' };
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, cost);
  const draw = rng ?? mulberry32(Math.floor(forgeRng(n)() * 0x100000000));
  const item = rollItem(draw, { uid: mintUid(n), ilvl: craftLevel(s), rarity: 'set', special: pieceId });
  n.bag.push(item);
  for (const id of [pieceId, set.id]) if (!n.codex.includes(id)) n.codex.push(id);
  return { ok: true, state: n, out: { item } };
}
