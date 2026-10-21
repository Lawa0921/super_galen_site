import { CHARACTER_IDS } from '../data/characters';
import { EQUIPMENT } from '../data/equipment';
import { ENHANCE_MAX } from '../data/forge';
import { AFFIXES, RARITIES, SETS, SPECIALS, STARLIT_RARITIES } from '../data/gear';
import { REGIONS } from '../data/regions';
import { validPortals } from './portals';
import { GRID_SIZE, MAX_ACTIVE } from './formation';
import { addGear, BAG_SIZE } from './loot/bag';
import { itemSlot } from './loot/item';
import { MAX_ILVL, MAX_REACHED } from './levels';
import { MAX_LEVEL, SLOTS, slotsFor } from './party';
import { memoriesOf, validBuild } from './progression';
import { SAVE_VERSION, type GameState } from './state';
import { isSceneId } from '../data/story/scenes';
import { ABSORB_CAP, ABSORB_GAIN, TOWN_FRAGMENTS } from '../data/story/fragments';
import { chainLength } from '../data/story/chains';
import { LEGACY_NODE_IDS } from '../data/trees';
import type { CharacterId, ItemInstance, Member, Slot } from './types';

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
/**
 * A member's memory fields: `memories` a whole count within the member's chain, `absorbed` a short list of gains that
 * are each one entry of the ABSORB_GAIN table (changing that table needs a SAVE_VERSION bump once saves ship), and
 * `oath` only on Rin with every piece.
 */
const validMemory = (id: CharacterId, m: Record<string, unknown>): boolean => {
  if (m.memories !== undefined && !(isCount(m.memories) && (m.memories as number) <= chainLength(id))) return false;
  if (m.absorbed !== undefined) {
    if (!Array.isArray(m.absorbed) || m.absorbed.length > ABSORB_CAP) return false;
    const grades = Object.values(ABSORB_GAIN);
    const stats = Object.keys(ABSORB_GAIN.dim);
    if (!m.absorbed.every((a) => isObj(a) && stats.includes(a.stat as string) && grades.some((g) => g[a.stat as keyof typeof g] === a.amount))) return false;
  }
  if (m.oath !== undefined && !(m.oath === true && id === 'rin' && m.memories === chainLength('rin'))) return false;
  return true;
};
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
  // Plan 5g: a starlit flag is only ever true, and only on a legendary, unique or set special item.
  if (v.starlit !== undefined && !(v.starlit === true && v.special !== undefined && STARLIT_RARITIES.includes(v.rarity as never))) return false;
  if (!Array.isArray(v.affixes)) return false;
  if (v.locked !== undefined && !(Number.isInteger(v.locked) && (v.locked as number) >= 0 && (v.locked as number) < v.affixes.length)) return false;
  return v.affixes.every((a) => isObj(a) && has(AFFIXES, a.key) && Number.isFinite(a.value) && Math.abs(a.value as number) <= MAX_AFFIX);
}

const ACT_NODES = ['act2', 'act3', 'act4'];
const isUniqueList = (v: unknown, ok: (x: unknown) => boolean): v is unknown[] => Array.isArray(v) && v.every(ok) && new Set(v).size === v.length;

/** The story block: flags, scene lists without repeats (fresh within seen, queue apart from seen), node and fragment lists, pity counts. */
function isStory(v: unknown): boolean {
  if (!isObj(v) || typeof v.act1Cleared !== 'boolean' || typeof v.finaleCleared !== 'boolean' || typeof v.fed !== 'boolean') return false;
  if (v.finaleCleared && !v.act1Cleared) return false;
  if (!isUniqueList(v.seen, isSceneId) || !isUniqueList(v.fresh, isSceneId) || !isUniqueList(v.queue, isSceneId)) return false;
  if (v.fresh.some((id) => !(v.seen as unknown[]).includes(id)) || v.queue.some((id) => (v.seen as unknown[]).includes(id))) return false;
  if (!isUniqueList(v.nodes, (x) => ACT_NODES.includes(x as string))) return false;
  if (!isUniqueList(v.returned, (x) => TOWN_FRAGMENTS.some((f) => f.id === x))) return false;
  return isObj(v.pity) && Object.entries(v.pity).every(([k, n]) => CHARACTER_IDS.includes(k as never) && Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 999);
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
    if (!validMemory(id, m)) return false;
    if (!validBuild(id, m.level as number, m.tree, m.talents, memoriesOf(m as Pick<Member, 'id' | 'memories'>))) return false;
  }
  // Every uid once, bag and worn together, and all of them below nextUid.
  if (new Set(uids).size !== uids.length || uids.some((u) => u >= (d.nextUid as number))) return false;
  if (!Array.isArray(d.codex) || !d.codex.every((id) => has(SPECIALS, id) || has(SETS, id))) return false;
  if (!['off', 'common', 'magic'].includes(d.autoJunk as string)) return false;
  if (!isStory(d.story)) return false;
  // Rin's reveal is only ever queued once she holds all her pieces; the oath it sets needs them (see validMemory).
  if ((d.story as { queue: unknown[] }).queue.includes('rin-reveal') && memoriesOf((p.roster as Record<string, Member>).rin) !== chainLength('rin')) return false;
  const g = d.dungeon;
  if (!isObj(g) || !isObj(g.reached)) return false;
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

/**
 * B1 ruling: banters are cosmetic, so a banter id this build does not know (renamed, removed, or heard on a newer build before a
 * rollback) is dropped from the story's scene lists, and from a `heard` record keyed by it, instead of making the save corrupt.
 * Any other unknown scene id is left for `isStory` to refuse, as before.
 */
function dropUnknownBanters(data: Record<string, unknown>): void {
  const story = data.story;
  if (!isObj(story)) return;
  const unknown = (x: unknown): boolean => typeof x === 'string' && x.startsWith('banter:') && !isSceneId(x);
  for (const k of ['seen', 'fresh', 'queue'] as const) {
    const list = story[k];
    if (Array.isArray(list)) story[k] = list.filter((x) => !unknown(x));
  }
  if (isObj(story.heard)) for (const k of Object.keys(story.heard)) if (unknown(k)) delete story.heard[k];
}

/**
 * Plan 8c ruling 1: a node a roster change replaced is renamed to its successor in every member's tree, ranks kept (only
 * when the new id is not there already; both present is left for validation). Anything but an object is left alone.
 */
export function upgradeTreeIds(data: Record<string, unknown>): void {
  const party = data.party;
  if (!isObj(party) || !isObj(party.roster)) return;
  for (const m of Object.values(party.roster)) {
    if (!isObj(m) || !isObj(m.tree)) continue;
    const tree = m.tree;
    for (const [old, now] of Object.entries(LEGACY_NODE_IDS)) {
      if (!has(tree, old)) continue;
      // Both there (a save written mid-change): the new one stands, the old one goes.
      if (!has(tree, now)) tree[now] = tree[old];
      delete tree[old];
    }
  }
}

export function loadGame(storage: SaveStorage): LoadResult {
  let raw: string | null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { status: 'empty' }; }
  if (raw === null) return { status: 'empty' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { backup(storage, raw); return { status: 'corrupt' }; }
  if (!isObj(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  if (data.version !== SAVE_VERSION) { backup(storage, raw); return { status: 'version' }; }
  dropUnknownBanters(data);
  upgradeTreeIds(data);
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
