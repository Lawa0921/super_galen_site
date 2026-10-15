import { CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { MAX_LEVEL } from './party';
import { SAVE_VERSION, type GameState } from './state';

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
const isStrings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isListMap = (v: unknown, ok: (x: unknown) => boolean) => isObj(v) && Object.values(v).every((l) => Array.isArray(l) && l.every(ok));

function isValid(d: Record<string, unknown>): boolean {
  if (!isCount(d.gold) || !isCounts(d.inventory) || !isCounts(d.sold)) return false;
  if (!isListMap(d.revealed, (x) => ELEMENTS.includes(x as string))) return false;
  const p = d.party;
  if (!isObj(p) || !isObj(p.roster) || !isIdList(p.recruited)) return false;
  if (!isIdList(p.front, true) || !isIdList(p.back, true) || (p.front as unknown[]).length !== 3 || (p.back as unknown[]).length !== 2) return false;
  const placed = [...(p.front as unknown[]), ...(p.back as unknown[])].filter((x) => x !== null);
  if (new Set(placed).size !== placed.length || placed.some((x) => !(p.recruited as unknown[]).includes(x))) return false;
  for (const id of CHARACTER_IDS) {
    const m = (p.roster as Record<string, unknown>)[id];
    if (!isObj(m) || m.id !== id || !isObj(m.equip)) return false;
    if (m.limit !== undefined && !(typeof m.limit === 'number' && m.limit >= 0 && m.limit <= 100)) return false;
    for (const [slot, eid] of Object.entries(m.equip)) if (EQUIPMENT[eid as string]?.slot !== slot) return false;
    if (!Number.isInteger(m.level) || (m.level as number) < 1 || (m.level as number) > MAX_LEVEL) return false;
    if (!isCount(m.exp) || !isCount(m.hp) || !isCount(m.tp)) return false;
  }
  const g = d.dungeon;
  if (!isObj(g) || !Number.isInteger(g.reachedFloor) || (g.reachedFloor as number) < 1 || (g.reachedFloor as number) > 3) return false;
  return isListMap(g.explored, (x) => typeof x === 'string') && isStrings(g.opened) && typeof g.bossDefeated === 'boolean';
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
