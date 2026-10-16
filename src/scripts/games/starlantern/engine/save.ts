import { CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { AFFIXES, RARITIES, SPECIALS } from '../data/gear';
import { REGIONS } from '../data/regions';
import { validPortals } from './portals';
import { GRID_SIZE, MAX_ACTIVE } from './formation';
import { BAG_SIZE } from './loot/bag';
import { itemSlot } from './loot/item';
import { MAX_LEVEL, SLOTS, slotsFor } from './party';
import { SAVE_VERSION, type GameState } from './state';
import type { ItemInstance, Slot } from './types';

export const SAVE_KEY = 'starlantern-save';
export const BACKUP_KEY = 'starlantern-save-backup';

export type SaveStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
export type LoadResult = { status: 'ok'; state: GameState } | { status: 'empty' } | { status: 'corrupt' } | { status: 'version' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
const isCounts = (v: unknown) => isObj(v) && Object.values(v).every(isCount);
const isIdList = (v: unknown, nullable = false) =>
  Array.isArray(v) && v.every((x) => (nullable && x === null) || CHARACTER_IDS.includes(x));
const ELEMENTS = ['phys', 'fire', 'ice', 'thunder'];
const isListMap = (v: unknown, ok: (x: unknown) => boolean) => isObj(v) && Object.values(v).every((l) => Array.isArray(l) && l.every(ok));
const has = (o: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/** One piece of gear: a known base, rarity, affix keys and special, with sane numbers. */
function isItem(v: unknown): v is ItemInstance {
  if (!isObj(v) || !isCount(v.uid) || !has(EQUIPMENT, v.base) || !RARITIES.includes(v.rarity as never)) return false;
  if (!Number.isInteger(v.ilvl) || (v.ilvl as number) < 1 || !isCount(v.enhance)) return false;
  if (v.special !== undefined && !has(SPECIALS, v.special)) return false;
  if (v.junk !== undefined && typeof v.junk !== 'boolean') return false;
  return Array.isArray(v.affixes) && v.affixes.every((a) => isObj(a) && has(AFFIXES, a.key) && Number.isFinite(a.value));
}

function isValid(d: Record<string, unknown>): boolean {
  if (!isCount(d.gold) || !isCounts(d.inventory) || !isCounts(d.sold)) return false;
  if (!isListMap(d.revealed, (x) => ELEMENTS.includes(x as string))) return false;
  const p = d.party;
  if (!isObj(p) || !isObj(p.roster) || !isIdList(p.recruited)) return false;
  if (!isIdList(p.grid, true) || (p.grid as unknown[]).length !== GRID_SIZE) return false;
  const placed = (p.grid as unknown[]).filter((x) => x !== null);
  if (!placed.length || placed.length > MAX_ACTIVE) return false;
  if (new Set(placed).size !== placed.length || placed.some((x) => !(p.recruited as unknown[]).includes(x))) return false;
  if (!Array.isArray(d.bag) || d.bag.length > BAG_SIZE || !d.bag.every(isItem)) return false;
  if (!Number.isInteger(d.nextUid)) return false;
  const uids: number[] = (d.bag as ItemInstance[]).map((it) => it.uid);
  for (const id of CHARACTER_IDS) {
    const m = (p.roster as Record<string, unknown>)[id];
    if (!isObj(m) || m.id !== id || !isObj(m.equip)) return false;
    if (m.limit !== undefined && !(typeof m.limit === 'number' && m.limit >= 0 && m.limit <= 100)) return false;
    for (const [slot, it] of Object.entries(m.equip)) {
      if (!SLOTS.includes(slot as Slot) || !isItem(it)) return false;
      if (!slotsFor(itemSlot(it)).includes(slot as Slot)) return false;
      uids.push(it.uid);
    }
    if (!Number.isInteger(m.level) || (m.level as number) < 1 || (m.level as number) > MAX_LEVEL) return false;
    if (!isCount(m.exp) || !isCount(m.hp) || !isCount(m.tp)) return false;
  }
  // Every uid once, bag and worn together, and all of them below nextUid.
  if (new Set(uids).size !== uids.length || uids.some((u) => u >= (d.nextUid as number))) return false;
  const g = d.dungeon;
  if (!isObj(g) || !isObj(g.reached) || typeof g.bossDefeated !== 'boolean') return false;
  const reached = g.reached;
  const regions = Object.keys(REGIONS);
  if (!validPortals(g.portals)) return false;
  if (Object.keys(reached).length !== regions.length) return false;
  return regions.every((r) => Number.isInteger(reached[r]) && (reached[r] as number) >= 1);
}

export function saveGame(storage: SaveStorage, s: GameState): boolean {
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

function backup(storage: SaveStorage, raw: string): void {
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* storage full or denied: nothing more we can do */ }
}

export function loadGame(storage: SaveStorage): LoadResult {
  let raw: string | null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { status: 'empty' }; }
  if (raw === null) return { status: 'empty' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { backup(storage, raw); return { status: 'corrupt' }; }
  if (!isObj(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  if (data.version !== SAVE_VERSION) { backup(storage, raw); return { status: 'version' }; }
  if (!isValid(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  return { status: 'ok', state: data as unknown as GameState };
}
