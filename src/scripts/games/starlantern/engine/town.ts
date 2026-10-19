import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { addGear, BAG_SIZE, sortBag, type AutoJunk } from './loot/bag';
import { itemSlot, sellPrice } from './loot/item';
import { resetBuild, newTree } from './progression';
import { hasPerk } from './story/fragments';
import { PERKS } from '../data/story/fragments';
import { defaultSlotFor, slotsFor, statsOf } from './party';
import type { GameState } from './state';
import type { CharacterId, ItemInstance, Member, Party, Slot } from './types';

type FailReason = 'gold' | 'locked' | 'stock' | 'invalid' | 'full';
export type TownResult = { ok: true; state: GameState } | { ok: false; reason: FailReason };

const fail = (reason: FailReason): TownResult => ({ ok: false, reason });

export function addItem(inv: Record<string, number>, id: string, qty: number): void {
  const n = (inv[id] ?? 0) + qty;
  if (n > 0) inv[id] = n;
  else delete inv[id];
}

export function clampToMax(m: Member): void {
  const s = statsOf(m);
  m.hp = Math.min(m.hp, s.hp);
  m.tp = Math.min(m.tp, s.tp);
}

export function sell(s: GameState, matId: string, qty: number): TownResult {
  const mat = MATERIALS[matId];
  if (!mat || !Number.isInteger(qty) || qty <= 0) return fail('invalid');
  if ((s.inventory[matId] ?? 0) < qty) return fail('stock');
  const n = structuredClone(s);
  addItem(n.inventory, matId, -qty);
  n.sold[matId] = (n.sold[matId] ?? 0) + qty;
  n.gold += mat.price * qty;
  return { ok: true, state: n };
}

/** The junk materials held: each id with its units and their price, and the totals (what `sellJunk` sells and pays). */
export function junkTotals(s: GameState): { n: number; g: number; lines: { id: string; n: number; g: number }[] } {
  const lines = Object.entries(s.inventory).filter(([id, c]) => MATERIALS[id]?.kind === 'junk' && c > 0).map(([id, c]) => ({ id, n: c, g: MATERIALS[id].price * c }));
  return { n: lines.reduce((t, l) => t + l.n, 0), g: lines.reduce((t, l) => t + l.g, 0), lines };
}

/** Sells every junk material at once; it counts toward the sell-to-unlock tally like any material sale. */
export function sellJunk(s: GameState): TownResult {
  const { lines } = junkTotals(s);
  if (!lines.length) return fail('stock');
  const n = structuredClone(s);
  for (const l of lines) {
    addItem(n.inventory, l.id, -l.n);
    n.sold[l.id] = (n.sold[l.id] ?? 0) + l.n;
    n.gold += l.g;
  }
  return { ok: true, state: n };
}

export function isUnlocked(s: GameState, equipId: string): boolean {
  const e = EQUIPMENT[equipId];
  return !!e && (e.unlock ?? []).every((u) => (s.sold[u.mat] ?? 0) >= u.qty);
}

/** What the shop asks for `id` (a consumable or a base): the listed price, less PERKS.shopDiscountPct once Orik's fragment is home. */
export function priceOf(s: GameState, id: string): number | undefined {
  const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price;
  if (price === undefined) return undefined;
  return hasPerk(s, 'shop-discount') ? Math.ceil(price * (100 - PERKS.shopDiscountPct) / 100) : price;
}

export function buy(s: GameState, id: string): TownResult {
  const price = priceOf(s, id);
  if (price === undefined) return fail('invalid');
  if (EQUIPMENT[id] && !isUnlocked(s, id)) return fail('locked');
  if (s.gold < price) return fail('gold');
  if (EQUIPMENT[id] && s.bag.length >= BAG_SIZE) return fail('full');
  const n = structuredClone(s);
  n.gold -= price;
  if (EQUIPMENT[id]) addGear(n, id);
  else addItem(n.inventory, id, 1);
  return { ok: true, state: n };
}

/** Sells the bag items `uids` at their sell price. Sold gear never counts toward `sold`, so it unlocks nothing. */
export function sellGear(s: GameState, uids: number[]): TownResult {
  if (uids.length === 0 || new Set(uids).size !== uids.length) return fail('invalid');
  if (uids.some((u) => !s.bag.some((it) => it.uid === u))) return fail('stock');
  const n = structuredClone(s);
  n.gold += n.bag.filter((it) => uids.includes(it.uid)).reduce((sum, it) => sum + sellPrice(it), 0);
  n.bag = n.bag.filter((it) => !uids.includes(it.uid));
  return { ok: true, state: n };
}

/** Flips the junk mark on a bag item. */
export function toggleJunk(s: GameState, uid: number): TownResult {
  if (!s.bag.some((it) => it.uid === uid)) return fail('stock');
  const n = structuredClone(s);
  const it = n.bag.find((x) => x.uid === uid)!;
  if (it.junk) delete it.junk;
  else it.junk = true;
  return { ok: true, state: n };
}

export function setAutoJunk(s: GameState, mode: AutoJunk): TownResult {
  if (!['off', 'common', 'magic'].includes(mode)) return fail('invalid');
  const n = structuredClone(s);
  n.autoJunk = mode;
  return { ok: true, state: n };
}

export function sortBagIn(s: GameState, by: 'rarity' | 'slot' | 'ilvl'): TownResult {
  const n = structuredClone(s);
  n.bag = sortBag(n.bag, by);
  return { ok: true, state: n };
}

/** A change of gear against a list of pieces (the town bag, or the run pack): the new state and the new list, or why not. */
export type WearResult<F extends string> = { ok: true; state: GameState; list: ItemInstance[] } | { ok: false; reason: F };

/**
 * The one slot swap behind every change of gear: wears piece `uid` from `list` in `slot` (or its default slot), and what
 * the slot held takes its place in the list. Wearing a piece clears its junk mark: the player wants it. HP and TP are
 * clamped to the new maximum. Pure: `s` and `list` are never touched.
 */
export function wearFrom(s: GameState, list: ItemInstance[], memberId: CharacterId, uid: number, slot?: Slot): WearResult<'invalid' | 'stock'> {
  const m = s.party.roster[memberId];
  if (!m) return { ok: false, reason: 'invalid' };
  const i = list.findIndex((it) => it.uid === uid);
  if (i < 0) return { ok: false, reason: 'stock' };
  const it = list[i];
  if (!EQUIPMENT[it.base]) return { ok: false, reason: 'invalid' };
  const target = slot ?? defaultSlotFor(m, it);
  if (!slotsFor(itemSlot(it)).includes(target)) return { ok: false, reason: 'invalid' };
  const state = structuredClone(s);
  const next = structuredClone(list);
  const nm = state.party.roster[memberId];
  const prev = nm.equip[target];
  const [wearing] = prev ? next.splice(i, 1, prev) : next.splice(i, 1);
  delete wearing.junk;
  nm.equip[target] = wearing;
  clampToMax(nm);
  return { ok: true, state, list: next };
}

/**
 * Takes off what is in `slot` and adds it to the end of `list`. `room` is how many pieces `list` may hold, so a piece that
 * would have nowhere to go is refused (`full`) and nothing is ever lost. Pure, and HP and TP are clamped.
 */
export function takeOffInto(s: GameState, list: ItemInstance[], memberId: CharacterId, slot: Slot, room: number): WearResult<'invalid' | 'full'> {
  const prev = s.party.roster[memberId]?.equip[slot];
  if (!prev) return { ok: false, reason: 'invalid' };
  if (list.length + 1 > room) return { ok: false, reason: 'full' };
  const state = structuredClone(s);
  const m = state.party.roster[memberId];
  const it = m.equip[slot]!;
  delete m.equip[slot];
  clampToMax(m);
  return { ok: true, state, list: [...structuredClone(list), it] };
}

/** Wears the bag item `uid` in `slot` (or its default slot); whatever was there goes back into the bag in its place. */
export function equip(s: GameState, memberId: CharacterId, uid: number, slot?: Slot): TownResult {
  const r = wearFrom(s, s.bag, memberId, uid, slot);
  if (!r.ok) return r;
  r.state.bag = r.list;
  return { ok: true, state: r.state };
}

/** Takes off what is in `slot` and puts it in the bag; a full bag refuses, so nothing is ever lost. */
export function unequip(s: GameState, memberId: CharacterId, slot: Slot): TownResult {
  const r = takeOffInto(s, s.bag, memberId, slot, BAG_SIZE);
  if (!r.ok) return r;
  r.state.bag = r.list;
  return { ok: true, state: r.state };
}

export function innCost(p: Party): number {
  return 10 + 2 * p.recruited.reduce((sum, id) => sum + p.roster[id].level, 0);
}

export function rest(s: GameState): TownResult {
  const cost = innCost(s.party);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  n.gold -= cost;
  if (hasPerk(n, 'inn-meal')) n.story.fed = true;   // Marta's meal waits for the next departure
  for (const id of n.party.recruited) {
    const m = n.party.roster[id];
    if (m.hp <= 0) continue;
    const st = statsOf(m);
    m.hp = st.hp;
    m.tp = st.tp;
  }
  return { ok: true, state: n };
}

export const reviveCost = (level: number): number => 20 * level;

export function revive(s: GameState, memberId: CharacterId): TownResult {
  const m = s.party.roster[memberId];
  if (!m || m.hp > 0) return fail('invalid');
  const cost = reviveCost(m.level);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  const st = statsOf(n.party.roster[memberId]);
  n.gold -= cost;
  n.party.roster[memberId].hp = st.hp;
  n.party.roster[memberId].tp = st.tp;
  return { ok: true, state: n };
}

/** Whether the member holds anything beyond the free first rank. */
export function hasSpent(m: Member): boolean {
  const fresh = newTree(m.id);
  return Object.keys(m.talents).length > 0
    || Object.keys(m.tree).length !== Object.keys(fresh).length || Object.keys(fresh).some((k) => m.tree[k] !== fresh[k]);
}

export const respecCost = (level: number): number => 25 * level;

/**
 * Resets a member's skill tree and talents together for gold. Refused when nothing has been spent, or when the member is
 * unknown. The points come back unspent; HP and TP are held to the new maximum.
 */
export function respec(s: GameState, memberId: CharacterId): TownResult {
  const m = s.party.roster[memberId];
  if (!m || !s.party.recruited.includes(memberId)) return fail('invalid');
  if (!hasSpent(m)) return fail('invalid');
  const cost = respecCost(m.level);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  n.gold -= cost;
  n.party.roster[memberId] = resetBuild(n.party.roster[memberId]);
  clampToMax(n.party.roster[memberId]);
  return { ok: true, state: n };
}

/** Use a recovery item in the labyrinth: ally items on the living, deadAlly items on the fallen. */
export function useFieldItem(s: GameState, itemId: string, targetId: CharacterId): TownResult {
  const def = ITEMS[itemId];
  if (!def || (def.target !== 'ally' && def.target !== 'deadAlly')) return fail('invalid');
  if ((s.inventory[itemId] ?? 0) <= 0) return fail('stock');
  const m = s.party.roster[targetId];
  if (!m || !s.party.recruited.includes(targetId)) return fail('invalid');
  if ((def.target === 'deadAlly') !== (m.hp <= 0)) return fail('invalid');
  const n = structuredClone(s);
  const t = n.party.roster[targetId];
  const max = statsOf(t);
  for (const e of def.effects) {
    if (e.kind === 'restore') { t.hp = Math.min(max.hp, t.hp + (e.hp ?? 0)); t.tp = Math.min(max.tp, t.tp + (e.tp ?? 0)); }
    if (e.kind === 'heal') t.hp = Math.min(max.hp, t.hp + e.power);
    if (e.kind === 'revive') t.hp = Math.max(1, Math.floor(max.hp * e.hpPct));
  }
  addItem(n.inventory, itemId, -1);
  return { ok: true, state: n };
}
