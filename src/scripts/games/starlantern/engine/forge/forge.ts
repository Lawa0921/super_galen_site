import { DISMANTLE, REGION_AFFIX_GROUP } from '../../data/forge';
import { addItem, clampToMax } from '../town';
import { pick } from '../rng';
import { rollValue } from '../loot/item';
import type { GameState } from '../state';
import type { AnyStat, ItemInstance } from '../types';
import type { Rng } from '../rng';
import { canPay, enhanceChance, enhanceCost, findItem, forgeRng, pay, rerollCost, swapPool, type ForgeResult, type RerollOpts } from './cost';

/** The essences a set of gear dismantles into: the sum of DISMANTLE by rarity. */
export function dismantleYield(its: ItemInstance[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of its) for (const [id, n] of Object.entries(DISMANTLE[it.rarity] ?? {})) out[id] = (out[id] ?? 0) + n;
  return out;
}

/** Breaks bag items down into essences. Worn gear is not in the bag, so it is refused; enhance levels give nothing back. */
export function dismantle(s: GameState, uids: number[]): ForgeResult<{ essences: Record<string, number> }> {
  if (!Array.isArray(uids) || uids.length === 0 || new Set(uids).size !== uids.length) return { ok: false, reason: 'invalid' };
  const bag = s.bag ?? [];
  if (uids.some((u) => !bag.some((it) => it.uid === u))) return { ok: false, reason: 'stock' };
  const n = structuredClone(s);
  const gone = n.bag.filter((it) => uids.includes(it.uid));
  const essences = dismantleYield(gone);
  n.bag = n.bag.filter((it) => !uids.includes(it.uid));
  for (const [id, q] of Object.entries(essences)) addItem(n.inventory, id, q);
  return { ok: true, state: n, out: { essences } };
}

/** Raises an item (bag or worn) by one level. Pays first; from the attempt that is below certainty it draws once and may fail, keeping the level. */
export function enhance(s: GameState, uid: number, rng?: Rng): ForgeResult<{ success: boolean; level: number }> {
  const found = findItem(s, uid);
  if (!found) return { ok: false, reason: 'stock' };
  const cost = enhanceCost(found.it);
  if (!cost) return { ok: false, reason: 'max' };
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  const target = findItem(n, uid);
  if (!target) return { ok: false, reason: 'stock' };
  pay(n, cost);
  const chance = enhanceChance(target.it);
  const success = chance >= 1 || (rng ?? forgeRng(n))() < chance;
  if (success) target.it.enhance += 1;
  return { ok: true, state: n, out: { success, level: target.it.enhance } };
}

/**
 * Rerolls one affix: its value, or (swap) its key too. The first reroll locks that index for good.
 * Refusals, in order: stock, invalid (plain / bad index), affixLocked, invalid (swap on unique/set), invalid (bad mat), none (empty pool), gold/mats.
 */
export function reroll(
  s: GameState, uid: number, index: number, o: RerollOpts, rng?: Rng,
): ForgeResult<{ before: { key: AnyStat; value: number }; after: { key: AnyStat; value: number } }> {
  const found = findItem(s, uid);
  if (!found) return { ok: false, reason: 'stock' };
  const it = found.it;
  if (it.rarity === 'common' || !Number.isInteger(index) || index < 0 || index >= it.affixes.length) return { ok: false, reason: 'invalid' };
  if (it.locked !== undefined && it.locked !== index) return { ok: false, reason: 'affixLocked' };
  if (o.swap && (it.rarity === 'unique' || it.rarity === 'set')) return { ok: false, reason: 'invalid' };
  if (o.mat !== undefined && (!o.swap || !Object.prototype.hasOwnProperty.call(REGION_AFFIX_GROUP, o.mat))) return { ok: false, reason: 'invalid' };
  const pool = o.swap ? swapPool(it, index, o.mat) : [];
  if (o.swap && pool.length === 0) return { ok: false, reason: 'none' };
  const cost = rerollCost(it, o);
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  const target = findItem(n, uid);
  if (!target) return { ok: false, reason: 'stock' };
  pay(n, cost);
  const draw = rng ?? forgeRng(n);
  const before = { ...target.it.affixes[index] };
  const key = o.swap ? pick(draw, pool) : before.key;
  const after = { key, value: rollValue(draw, key, target.it.ilvl, target.it.rarity) };
  target.it.affixes[index] = after;
  target.it.locked = index;
  if (target.member) clampToMax(n.party.roster[target.member]);
  return { ok: true, state: n, out: { before, after: { ...after } } };
}
