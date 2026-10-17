import { CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { ENHANCE_MAX } from '../data/forge';
import { AFFIXES, RARITIES, SETS, SPECIALS } from '../data/gear';
import { REGIONS } from '../data/regions';
import { validPortals } from './portals';
import { GRID_SIZE, MAX_ACTIVE } from './formation';
import { addGear, BAG_SIZE } from './loot/bag';
import { itemSlot } from './loot/item';
import { MAX_ILVL, MAX_REACHED } from './levels';
import { MAX_LEVEL, SLOTS, slotsFor } from './party';
import { validBuild } from './progression';
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
/** Far above any depth the game reaches; bounds hostile boss-kill keys. */
const MAX_DEPTH = 9999;
/** A boss-kill key: `region:depth`, a known region and a depth from 1 to MAX_DEPTH. */
const isBossKey = (k: string): boolean => {
  const m = /^([a-z]+):(\d{1,4})$/.exec(k);
  return !!m && has(REGIONS, m[1]) && Number(m[2]) >= 1 && Number(m[2]) <= MAX_DEPTH;
};

/** The largest affix value a save may hold, either sign: far above any roll, low enough that sums stay finite. */
const MAX_AFFIX = 10000;
/** The largest nextUid a save may hold: far below Number.MAX_SAFE_INTEGER, so minting can never leave the safe range. */
const MAX_UID = 1e9;

/** One piece of gear: a known base, rarity, affix keys and special, with sane numbers. */
function isItem(v: unknown): v is ItemInstance {
  if (!isObj(v) || !isCount(v.uid) || !has(EQUIPMENT, v.base) || !RARITIES.includes(v.rarity as never)) return false;
  if (!Number.isInteger(v.ilvl) || (v.ilvl as number) < 1 || (v.ilvl as number) > MAX_ILVL || !Number.isInteger(v.enhance) || (v.enhance as number) < 0 || (v.enhance as number) > ENHANCE_MAX) return false;
  if (v.special !== undefined && !has(SPECIALS, v.special)) return false;
  if (v.junk !== undefined && typeof v.junk !== 'boolean') return false;
  if (!Array.isArray(v.affixes)) return false;
  if (v.locked !== undefined && !(Number.isInteger(v.locked) && (v.locked as number) >= 0 && (v.locked as number) < v.affixes.length)) return false;
  return v.affixes.every((a) => isObj(a) && has(AFFIXES, a.key) && Number.isFinite(a.value) && Math.abs(a.value as number) <= MAX_AFFIX);
}

function isValid(d: Record<string, unknown>): boolean {
  if (!isCount(d.gold) || !isCounts(d.inventory) || !isCounts(d.sold)) return false;
  if (!isListMap(d.revealed, (x) => ELEMENTS.includes(x as string))) return false;
  const p = d.party;
  if (!isObj(p) || !isObj(p.roster) || !isIdList(p.recruited)) return false;
  if (new Set(p.recruited as unknown[]).size !== (p.recruited as unknown[]).length) return false;
  if (!isIdList(p.grid, true) || (p.grid as unknown[]).length !== GRID_SIZE) return false;
  const placed = (p.grid as unknown[]).filter((x) => x !== null);
  if (!placed.length || placed.length > MAX_ACTIVE) return false;
  if (new Set(placed).size !== placed.length || placed.some((x) => !(p.recruited as unknown[]).includes(x))) return false;
  // The hero always takes the field: recruited, and standing on the grid.
  if (!(p.recruited as unknown[]).includes('hero') || !placed.includes('hero')) return false;
  if (!Array.isArray(d.bag) || d.bag.length > BAG_SIZE || !d.bag.every(isItem)) return false;
  if (!Number.isSafeInteger(d.nextUid) || (d.nextUid as number) < 1 || (d.nextUid as number) > MAX_UID) return false;
  if (!Number.isSafeInteger(d.forgeDraws) || (d.forgeDraws as number) < 0 || (d.forgeDraws as number) > MAX_UID) return false;
  if (!Number.isSafeInteger(d.forgeSalt)) return false;
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
    // Memories are 0 until plan 6b, which reads the hero's memory-piece count from the save.
    if (!validBuild(id, m.level as number, m.tree, m.talents, 0)) return false;
  }
  // Every uid once, bag and worn together, and all of them below nextUid.
  if (new Set(uids).size !== uids.length || uids.some((u) => u >= (d.nextUid as number))) return false;
  if (!Array.isArray(d.codex) || !d.codex.every((id) => has(SPECIALS, id) || has(SETS, id))) return false;
  if (!['off', 'common', 'magic'].includes(d.autoJunk as string)) return false;
  const g = d.dungeon;
  if (!isObj(g) || !isObj(g.reached) || typeof g.bossDefeated !== 'boolean') return false;
  const reached = g.reached;
  const regions = Object.keys(REGIONS);
  if (!validPortals(g.portals)) return false;
  if (!isCounts(g.bossKills) || !Object.keys(g.bossKills as object).every(isBossKey)) return false;
  if (Object.keys(reached).length !== regions.length) return false;
  return regions.every((r) => Number.isInteger(reached[r]) && (reached[r] as number) >= 1 && (reached[r] as number) <= MAX_REACHED);
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
  const state = data as unknown as GameState;
  // The game never writes a codex id twice; a hand-edited save that does is tidied rather than refused.
  state.codex = [...new Set(state.codex)];
  return { status: 'ok', state: convertGearStock(state) };
}

/**
 * Gear base ids that earlier builds left in `inventory` become common bag items, until the bag is full.
 * What does not fit stays in `inventory` (nothing is lost) and is tried again on the next load.
 */
function convertGearStock(s: GameState): GameState {
  for (const id of Object.keys(s.inventory)) {
    if (!has(EQUIPMENT, id)) continue;
    while (s.inventory[id] > 0 && s.bag.length < BAG_SIZE) {
      addGear(s, id);
      s.inventory[id]--;
    }
    if (s.inventory[id] === 0) delete s.inventory[id];
  }
  return s;
}
