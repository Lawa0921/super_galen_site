import { EQUIPMENT } from '../data/equipment';
import { ITEMS } from '../data/items';
import { MATERIALS } from '../data/materials';
import { statsOf } from './party';
import type { GameState } from './state';
import type { CharacterId, Member, Party, Slot } from './types';

export type TownResult = { ok: true; state: GameState } | { ok: false; reason: 'gold' | 'locked' | 'stock' | 'invalid' };

const fail = (reason: 'gold' | 'locked' | 'stock' | 'invalid'): TownResult => ({ ok: false, reason });

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
  const n = structuredClone(s);
  n.gold -= price;
  addItem(n.inventory, id, 1);
  return { ok: true, state: n };
}

export function equip(s: GameState, memberId: CharacterId, equipId: string): TownResult {
  const e = EQUIPMENT[equipId];
  if (!e) return fail('invalid');
  if ((s.inventory[equipId] ?? 0) <= 0) return fail('stock');
  const n = structuredClone(s);
  const m = n.party.roster[memberId];
  const prev = m.equip[e.slot];
  if (prev) addItem(n.inventory, prev, 1);
  addItem(n.inventory, equipId, -1);
  m.equip[e.slot] = equipId;
  clampToMax(m);
  return { ok: true, state: n };
}

export function unequip(s: GameState, memberId: CharacterId, slot: Slot): TownResult {
  const prev = s.party.roster[memberId].equip[slot];
  if (!prev) return fail('invalid');
  const n = structuredClone(s);
  const m = n.party.roster[memberId];
  delete m.equip[slot];
  addItem(n.inventory, prev, 1);
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
