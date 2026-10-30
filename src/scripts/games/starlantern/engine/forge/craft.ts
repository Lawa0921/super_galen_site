import { BASE_RECIPES, CONSUMABLE_RECIPES, CRAFT_MAGIC_CHANCE, OWN_RECIPE, SET_RECIPE, baseGold, ownGold, setGold, type Cost } from '../../data/forge';
import { MATERIALS } from '../../data/materials';
import { ROSTER_LIVE } from '../../data/monsters';
import { SETS, SPECIALS } from '../../data/gear';
import { REGIONS } from '../../data/regions';
import { mintUid, BAG_SIZE } from '../loot/bag';
import { MAX_REACHED } from '../levels';
import { itemLevel, rollItem } from '../loot/item';
import { mulberry32, type Rng } from '../rng';
import type { GameState } from '../state';
import type { GearSlot, ItemInstance } from '../types';
import { addItem } from '../town';
import { hasPerk } from '../story/fragments';
import { PERKS } from '../../data/story/fragments';
import { addCost, canPay, forgeRng, pay, type ForgeResult } from './cost';
import { GATHER_RECIPES } from '../../data/gather';

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** The item level crafted gear gets: a monster drop's level at the deepest depth reached in any region (capped at MAX_REACHED, so a hostile save cannot inflate it). */
export function craftLevel(s: GameState): number {
  return itemLevel(Math.min(MAX_REACHED, Math.max(1, ...Object.values(s.dungeon.reached))), 'monster');
}

/**
 * What crafting `qty` of consumable `id` costs; null when there is no recipe or qty is not a positive integer. `alt`: its
 * second recipe, from gathered goods (GATHER_RECIPES, gathering spec §7.2); the gate is the Game's (`gatherOpen`).
 */
export function itemRecipeCost(id: string, qty: number, alt = false): Cost | null {
  const recipes = alt ? GATHER_RECIPES : CONSUMABLE_RECIPES;
  if (!has(recipes, id) || !Number.isInteger(qty) || qty <= 0) return null;
  const r = recipes[id];
  return { gold: r.gold * qty, mats: Object.fromEntries(Object.entries(r.mats).map(([m, n]) => [m, n * qty])) };
}

/** Crafts consumables into the inventory, by the first recipe or (`alt`) the gathered one. Draws nothing; never touches `sold`. */
export function craftItem(s: GameState, id: string, qty: number, alt = false): ForgeResult<{ id: string; qty: number }> {
  const cost = itemRecipeCost(id, qty, alt);
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

/** The set recipe in force: Doran's master (his returned fragment) takes PERKS.setRecipeLess off the region material, never below one. */
export function setRecipeOf(s: GameState): typeof SET_RECIPE {
  return hasPerk(s, 'set-recipe') ? { ...SET_RECIPE, regionQty: Math.max(1, SET_RECIPE.regionQty - PERKS.setRecipeLess) } : SET_RECIPE;
}

/** The price of a set piece: its region's material, a star tear and setGold at the current craft level; null when `pieceId` is not a set piece. */
export function setCost(s: GameState, pieceId: string): Cost | null {
  const set = setOf(pieceId);
  const mat = set ? REGIONS[set.region].material : null;
  if (!set || !mat) return null;
  const recipe = setRecipeOf(s);
  return addCost({ gold: setGold(craftLevel(s)), mats: { [mat]: recipe.regionQty } }, { gold: 0, mats: { [recipe.rare]: recipe.rareQty } });
}

/** Crafts set piece `pieceId` (the pity path); the piece and its set enter the codex. Without `rng` it draws once. */
export function craftSet(s: GameState, pieceId: string, rng?: Rng): ForgeResult<{ item: ItemInstance }> {
  const cost = setCost(s, pieceId);
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

/** Roster plan Task C4 (ruling 15): the trophy or keepsake an own unique is crafted from (its owner's); none for any other piece. */
export function ownTrophyOf(uniqueId: string): string | undefined {
  const owner = has(SPECIALS, uniqueId) ? SPECIALS[uniqueId].owner : undefined;
  if (!owner) return undefined;
  return Object.values(MATERIALS).find((m) => m.owner === owner && (m.kind === 'trophy' || m.kind === 'keepsake'))?.id;
}

/** The price of an own unique: OWN_RECIPE's trophy or keepsake and star tear, and ownGold at the current craft level; null for any other piece. */
export function ownCost(s: GameState, uniqueId: string): Cost | null {
  const trophy = ownTrophyOf(uniqueId);
  if (!trophy) return null;
  return { gold: ownGold(craftLevel(s)), mats: { [trophy]: OWN_RECIPE.trophyQty, [OWN_RECIPE.rare]: OWN_RECIPE.rareQty } };
}

/** The own uniques of every live boss and warden, in SPECIALS order (none while nothing is live): the forge's 專屬裝備 rows. */
export const ownUniques = (): string[] => Object.values(SPECIALS).filter((s) => s.owner && ROSTER_LIVE.has(s.owner)).map((s) => s.id);

/** Whether the bestiary has the owner of `uniqueId` felled once at least: the craft's condition (ruling 15). */
export const ownerFelled = (s: GameState, uniqueId: string): boolean => {
  const owner = has(SPECIALS, uniqueId) ? SPECIALS[uniqueId].owner : undefined;
  return !!owner && (s.bestiary?.[owner]?.felled ?? 0) >= 1;
};

/**
 * Roster plan Task C4 (spec §7.3, ruling 15): crafts the own unique `uniqueId` (the pity path for a boss or warden that would
 * not drop it), once its owner is live and the bestiary has it felled; the piece enters the codex. As craftSet: without
 * `rng` it draws once. Refusals, in order: invalid (not an own unique, owner not live), unbeaten, full, gold/mats.
 */
export function craftOwnUnique(s: GameState, uniqueId: string, rng?: Rng): ForgeResult<{ item: ItemInstance }> {
  const cost = ownCost(s, uniqueId);
  const sp = cost ? SPECIALS[uniqueId] : undefined;
  if (!cost || !sp?.owner || !ROSTER_LIVE.has(sp.owner)) return { ok: false, reason: 'invalid' };
  if (!ownerFelled(s, uniqueId)) return { ok: false, reason: 'unbeaten' };
  if ((s.bag ?? []).length >= BAG_SIZE) return { ok: false, reason: 'full' };
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, cost);
  const draw = rng ?? mulberry32(Math.floor(forgeRng(n)() * 0x100000000));
  const item = rollItem(draw, { uid: mintUid(n), ilvl: craftLevel(s), rarity: sp.rarity, special: uniqueId });
  n.bag.push(item);
  if (!n.codex.includes(uniqueId)) n.codex.push(uniqueId);
  return { ok: true, state: n, out: { item } };
}
