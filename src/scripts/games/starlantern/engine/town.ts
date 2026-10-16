import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { BAG_SIZE, sortBag, type AutoJunk } from './loot/bag';
import { itemSlot, rollItem, sellPrice } from './loot/item';
import { mulberry32 } from './rng';
import { defaultSlotFor, slotsFor, statsOf } from './party';
import type { GameState } from './state';
import type { CharacterId, Member, Party, Slot } from './types';

type FailReason = 'gold' | 'locked' | 'stock' | 'invalid' | 'full';
export type TownResult = { ok: true; state: GameState } | { ok: false; reason: FailReason };

const fail = (reason: FailReason): TownResult => ({ ok: false, reason });

export function addItem(inv: Record<string, number>, id: string, qty: number): void {
  const n = (inv[id] ?? 0) + qty;
  if (n > 0) inv[id] = n;
  else delete inv[id];
}

function clampToMax(m: Member): void {
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

export function isUnlocked(s: GameState, equipId: string): boolean {
  const e = EQUIPMENT[equipId];
  return !!e && (e.unlock ?? []).every((u) => (s.sold[u.mat] ?? 0) >= u.qty);
}

export function buy(s: GameState, id: string): TownResult {
  const price = ITEMS[id]?.price ?? EQUIPMENT[id]?.price;
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

/** Hands out the next item uid: returns `s.nextUid` and moves it on by one (mutates `s`; call it on a copy). */
export function mintUid(s: GameState): number {
  return s.nextUid++;
}

/** Puts a plain common item of gear base `id` at its own level in the bag (mutates `s`; call it on a copy, with room in the bag). */
export function addGear(s: GameState, id: string): void {
  s.bag.push(rollItem(mulberry32(0), { uid: mintUid(s), ilvl: EQUIPMENT[id].ilvl, rarity: 'common', base: id }));
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

/** Wears the bag item `uid` in `slot` (or its default slot); whatever was there goes back into the bag in its place. */
export function equip(s: GameState, memberId: CharacterId, uid: number, slot?: Slot): TownResult {
  const m = s.party.roster[memberId];
  if (!m) return fail('invalid');
  const i = s.bag.findIndex((it) => it.uid === uid);
  if (i < 0) return fail('stock');
  const it = s.bag[i];
  if (!EQUIPMENT[it.base]) return fail('invalid');
  const target = slot ?? defaultSlotFor(m, it);
  if (!slotsFor(itemSlot(it)).includes(target)) return fail('invalid');
  const n = structuredClone(s);
  const nm = n.party.roster[memberId];
  const prev = nm.equip[target];
  const [wearing] = prev ? n.bag.splice(i, 1, prev) : n.bag.splice(i, 1);
  nm.equip[target] = wearing;
  clampToMax(nm);
  return { ok: true, state: n };
}

/** Takes off what is in `slot` and puts it in the bag; a full bag refuses, so nothing is ever lost. */
export function unequip(s: GameState, memberId: CharacterId, slot: Slot): TownResult {
  const prev = s.party.roster[memberId]?.equip[slot];
  if (!prev) return fail('invalid');
  if (s.bag.length >= BAG_SIZE) return fail('full');
  const n = structuredClone(s);
  const m = n.party.roster[memberId];
  const it = m.equip[slot]!;
  delete m.equip[slot];
  n.bag.push(it);
  clampToMax(m);
  return { ok: true, state: n };
}

export function innCost(p: Party): number {
  return 10 + 2 * p.recruited.reduce((sum, id) => sum + p.roster[id].level, 0);
}

export function rest(s: GameState): TownResult {
  const cost = innCost(s.party);
  if (s.gold < cost) return fail('gold');
  const n = structuredClone(s);
  n.gold -= cost;
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
