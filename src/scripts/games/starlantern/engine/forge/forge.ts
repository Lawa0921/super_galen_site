import { DISMANTLE, FUSE_NEXT, REGION_AFFIX_GROUP } from '../../data/forge';
import { AFFIXES, generalLegendaries } from '../../data/gear';
import { ENEMIES } from '../../data/enemies';
import { noteInscribed } from '../bestiary';
import { mintUid } from '../loot/bag';
import { addItem, clampToMax } from '../town';
import { mulberry32, pick } from '../rng';
import { itemSlot, maxValue, rollItem, rollValue } from '../loot/item';
import type { GameState } from '../state';
import type { AnyStat, GearSlot, ItemInstance } from '../types';
import type { Rng } from '../rng';
import { canPay, enhanceChance, enhanceCost, findItem, forgeRng, fuseCost, fuseSlots, inscribeCost, pay, rerollCost, swapPool, type ForgeResult, type RerollOpts } from './cost';

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
 * A starlit piece (plan 5g) keeps every affix at its maximum: its value reroll is refused, and its swap draws only the key.
 * Refusals, in order: stock, invalid (plain / bad index), affixLocked, invalid (value reroll on starlit), invalid (swap on unique/set),
 * invalid (bad mat), none (empty pool), gold/mats.
 */
export function reroll(
  s: GameState, uid: number, index: number, o: RerollOpts, rng?: Rng,
): ForgeResult<{ before: { key: AnyStat; value: number }; after: { key: AnyStat; value: number } }> {
  const found = findItem(s, uid);
  if (!found) return { ok: false, reason: 'stock' };
  const it = found.it;
  if (it.rarity === 'common' || !Number.isInteger(index) || index < 0 || index >= it.affixes.length) return { ok: false, reason: 'invalid' };
  if (it.locked !== undefined && it.locked !== index) return { ok: false, reason: 'affixLocked' };
  if (it.starlit && !o.swap) return { ok: false, reason: 'invalid' };
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
  const after = { key, value: target.it.starlit ? maxValue(key, target.it.ilvl) : rollValue(draw, key, target.it.ilvl, target.it.rarity) };
  target.it.affixes[index] = after;
  target.it.locked = index;
  if (target.member) clampToMax(n.party.roster[target.member]);
  return { ok: true, state: n, out: { before, after: { ...after } } };
}

/**
 * Fuses three bag items of one rarity (common, magic or rare) into one random item a tier up, at the floored average item level.
 * A chosen `slot` costs extra and must be in `fuseSlots(target)`; a legendary is always a general one. Pure: refusals change nothing.
 * Refusals, in order: invalid (not three distinct uids), stock, invalid (rarity / slot), gold/mats. Without `rng` it draws once (`forgeDraws` + 1).
 */
export function fuse(s: GameState, uids: number[], slot?: GearSlot, rng?: Rng): ForgeResult<{ item: ItemInstance }> {
  if (!Array.isArray(uids) || uids.length !== 3 || new Set(uids).size !== 3) return { ok: false, reason: 'invalid' };
  const bag = s.bag ?? [];
  const inputs = uids.map((u) => bag.find((it) => it.uid === u));
  if (inputs.some((it) => !it)) return { ok: false, reason: 'stock' };
  const gear = inputs as ItemInstance[];
  const rarity = gear[0].rarity;
  if (gear.some((it) => it.rarity !== rarity) || !Object.prototype.hasOwnProperty.call(FUSE_NEXT, rarity)) return { ok: false, reason: 'invalid' };
  const target = FUSE_NEXT[rarity as keyof typeof FUSE_NEXT];
  if (slot !== undefined && !fuseSlots(target).includes(slot)) return { ok: false, reason: 'invalid' };
  const cost = fuseCost(target, slot);
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  pay(n, cost);
  // One forge draw seeds the whole pick, so a fusion moves `forgeDraws` exactly once however many numbers it takes.
  const draw = rng ?? mulberry32(Math.floor(forgeRng(n)() * 0x100000000));
  const ilvl = Math.floor(gear.reduce((sum, it) => sum + it.ilvl, 0) / 3);
  const uid = mintUid(n);
  let item: ItemInstance;
  if (target === 'legendary') {
    const pool = generalLegendaries().filter((g) => slot === undefined || g.slot === slot);
    item = rollItem(draw, { uid, ilvl, rarity: target, special: pick(draw, pool).id });
  } else {
    item = rollItem(draw, { uid, ilvl, rarity: target, slot });
  }
  n.bag = n.bag.filter((it) => !uids.includes(it.uid));
  n.bag.push(item);
  if (item.special && !n.codex.includes(item.special)) n.codex.push(item.special);
  return { ok: true, state: n, out: { item } };
}

/**
 * Roster plan Task C4 (spec §7.1, ruling 16): 銘刻, a reroll that turns affix `index` into `species`' inscription key, its
 * value rolled in the piece's own range on one forge draw. It locks the affix as any reroll does, marks the piece with the
 * species, and the bestiary notes the inscription. Only a magic, rare or epic piece (never a special one) can take it.
 * Refusals, in order: stock, invalid (special / no affix there / no such species), affixLocked, none (the slot cannot take
 * the key, or another affix already holds it), gold/mats. Without `rng` it draws once (`forgeDraws` + 1).
 */
export function inscribeAt(s: GameState, uid: number, index: number, species: string, rng?: Rng): ForgeResult<{ before: { key: AnyStat; value: number }; after: { key: AnyStat; value: number } }> {
  const found = findItem(s, uid);
  if (!found) return { ok: false, reason: 'stock' };
  const it = found.it;
  const key = ENEMIES[species]?.inscribe;
  const cost = inscribeCost(it, species);
  if (it.special || !Number.isInteger(index) || index < 0 || index >= it.affixes.length || !key || !cost) return { ok: false, reason: 'invalid' };
  if (it.locked !== undefined && it.locked !== index) return { ok: false, reason: 'affixLocked' };
  if (!AFFIXES[key].slots.includes(itemSlot(it)) || it.affixes.some((a, i) => i !== index && a.key === key)) return { ok: false, reason: 'none' };
  const lacking = canPay(s, cost);
  if (lacking) return { ok: false, reason: lacking };
  const n = structuredClone(s);
  const target = findItem(n, uid);
  if (!target) return { ok: false, reason: 'stock' };
  pay(n, cost);
  const draw = rng ?? forgeRng(n);
  const before = { ...target.it.affixes[index] };
  const after = { key, value: rollValue(draw, key, target.it.ilvl, target.it.rarity) };
  target.it.affixes[index] = after;
  target.it.locked = index;
  target.it.inscription = species;
  noteInscribed(n, species);
  if (target.member) clampToMax(n.party.roster[target.member]);
  return { ok: true, state: n, out: { before, after: { ...after } } };
}
