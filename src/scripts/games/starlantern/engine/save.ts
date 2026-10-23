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
import { defaultTree, heroTree, memoriesOf, validBuild } from './progression';
import { SAVE_VERSION, type GameState } from './state';
import { repairRuneFields } from './sockets';
import { buildOf } from '../data/builds';
import { BANTER_PAIRS, GROUP_GATE, isSceneId, type BanterPair } from '../data/story/scenes';
import { MAX_WAITED } from './story/events';
import { ABSORB_CAP, ABSORB_GAIN, TOWN_FRAGMENTS } from '../data/story/fragments';
import { chainLength } from '../data/story/chains';
import { NIGHT_BEATS } from '../data/story.zh-TW';
import type { CharacterId, ItemInstance, Member, Slot } from './types';

export const SAVE_KEY = 'starlantern-save';
export const BACKUP_KEY = 'starlantern-save-backup';
/**
 * The first version 8 text this browser ever read (plan 8d): written once before the migration writes anything, never
 * overwritten. BACKUP_KEY is not enough on its own, since any later corrupt or other-version read (an old tab left open
 * over the update, say) writes over it.
 */
export const V8_KEY = 'starlantern-save-v8';

export type SaveStorage = { getItem(k: string): string | null; setItem(k: string, v: string): void };
/** `migrated`: the save was an older version, brought up to this one on the way in (its text is kept in V8_KEY). */
export type LoadResult = { status: 'ok'; state: GameState; migrated?: true } | { status: 'empty' } | { status: 'corrupt' } | { status: 'version' };

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
  // story depth Task 6: each banter pair's wait, a real pair only, a whole number up to MAX_WAITED (as `pity`'s 999)
  if (v.confession !== undefined && v.confession !== 'dinner' && v.confession !== 'depth30') return false;   // story depth Task 15 review
  // story L: untold memories, each once, never seen nor queued; tonight's picks among them
  if (v.untold !== undefined && !(isUniqueList(v.untold, (x) => isSceneId(x) && x.startsWith('mem:')) && v.untold.every((id) => !(v.seen as unknown[]).includes(id) && !(v.queue as unknown[]).includes(id)))) return false;
  if (v.tonight !== undefined && !(isUniqueList(v.tonight, isSceneId) && v.tonight.every((id) => ((v.untold ?? []) as unknown[]).includes(id)))) return false;
  // story L: the beat cursor, a line of the pool (none while the pool is empty)
  if (v.beat !== undefined && !(Number.isInteger(v.beat) && (v.beat as number) >= 0 && (v.beat as number) < NIGHT_BEATS.lines.length)) return false;
  // story L: a group scene's chances, one of the three groups not yet seen, 0 or 1
  if (v.reacts !== undefined && !(isObj(v.reacts) && Object.entries(v.reacts).every(([k, n]) => Object.hasOwn(GROUP_GATE, k) && !(v.seen as unknown[]).includes(k) && (n === 0 || n === 1)))) return false;
  if (v.waited !== undefined && !(isObj(v.waited) && Object.entries(v.waited).every(([k, n]) => BANTER_PAIRS.includes(k as BanterPair) && Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_WAITED))) return false;
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
    if (m.freeRespec !== undefined && m.freeRespec !== true) return false;
    if (m.build !== undefined && !(typeof m.build === 'string' && buildOf(id, m.build))) return false;
    if (!validBuild(id, m.level as number, m.tree, m.talents, memoriesOf(m as Pick<Member, 'id' | 'memories'>))) return false;
  }
  // Every uid once, bag and worn together, and all of them below nextUid.
  if (new Set(uids).size !== uids.length || uids.some((u) => u >= (d.nextUid as number))) return false;
  if (!Array.isArray(d.codex) || !d.codex.every((id) => has(SPECIALS, id) || has(SETS, id))) return false;
  if (!['off', 'common', 'magic'].includes(d.autoJunk as string)) return false;
  if (!isStory(d.story)) return false;
  // Rin's reveal is only ever queued once she holds all her pieces; the oath it sets needs them (see validMemory).
  if ((d.story as { queue: unknown[] }).queue.includes('rin-reveal') && memoriesOf((p.roster as Record<string, Member>).rin) !== chainLength('rin')) return false;
  // story L: an untold piece is one she has met and holds (`mem:<c>:<k>`, k up to her pieces)
  const untold = ((d.story as { untold?: string[] }).untold ?? []);
  if (!untold.every((id) => {
    const [, c, k] = id.split(':');
    return (p.recruited as unknown[]).includes(c) && Number(k) <= memoriesOf((p.roster as Record<string, Member>)[c]);
  })) return false;
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

/** Writes `raw` under `key` only when nothing is there yet. */
function keepOnce(storage: SaveStorage, key: string, raw: string): void {
  try { if (storage.getItem(key) === null) storage.setItem(key, raw); } catch { /* storage full or denied */ }
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
 * Version 8 to 9 (plan 8d, spec §14): the skill trees were reworked, so every member's tree is spent again on the standard
 * build for their level (the hero's on the balanced build, with his memories) and each gets one free respec at the inn.
 * Talents, gear, memories and every other field are left alone. A member that is not an object with a known id and a
 * whole level from 1 to MAX_LEVEL is left as it is, for the validation to refuse.
 * Since the old tree is thrown away, a version 8 save whose only fault is its tree (unknown ids, overspent, not an
 * object) is repaired on purpose and loads as ok; any other fault still makes it corrupt.
 */
export function migrate8to9(d: Record<string, unknown>): void {
  const party = d.party;
  if (isObj(party) && isObj(party.roster)) {
    for (const m of Object.values(party.roster)) {
      if (!isObj(m) || !CHARACTER_IDS.includes(m.id as CharacterId)) continue;
      const level = m.level;
      if (!Number.isInteger(level) || (level as number) < 1 || (level as number) > MAX_LEVEL) continue;
      const id = m.id as CharacterId;
      m.tree = id === 'hero' ? heroTree(level as number, 'balanced', memoriesOf(m as Pick<Member, 'id' | 'memories'>)) : defaultTree(id, level as number);
      m.freeRespec = true;
    }
  }
  d.version = 9;
}

/**
 * A followed build that is not one of the member's own suggested builds is dropped (plan 8h Task 6): she then follows
 * nothing, and the save is not corrupt. Members the save cannot read are left for the validation to refuse.
 */
function repairBuildField(d: Record<string, unknown>): void {
  const roster = isObj(d.party) && isObj(d.party.roster) ? d.party.roster : null;
  if (!roster) return;
  for (const id of CHARACTER_IDS) {
    const m = roster[id];
    if (isObj(m) && m.build !== undefined && !(typeof m.build === 'string' && buildOf(id, m.build))) delete m.build;
  }
}

export function loadGame(storage: SaveStorage): LoadResult {
  let raw: string | null;
  try { raw = storage.getItem(SAVE_KEY); } catch { return { status: 'empty' }; }
  if (raw === null) return { status: 'empty' };
  let data: unknown;
  try { data = JSON.parse(raw); } catch { backup(storage, raw); return { status: 'corrupt' }; }
  if (!isObj(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  // The migrations, oldest first. The version 8 text is kept in V8_KEY (once, never overwritten) and BACKUP_KEY is left
  // alone, so neither a later read nor this one can write over progress kept there.
  const migrated = data.version === 8;
  if (migrated) { keepOnce(storage, V8_KEY, raw); migrate8to9(data); }
  if (data.version !== SAVE_VERSION) { backup(storage, raw); return { status: 'version' }; }
  dropUnknownBanters(data);
  // Rune fields that break the rules are put right, never a corrupt save (plan 8e ruling 19); isValid leaves them alone.
  repairRuneFields(data);
  repairBuildField(data);
  if (!isValid(data)) { backup(storage, raw); return { status: 'corrupt' }; }
  const state = data as unknown as GameState;
  // The game never writes a codex id twice; a hand-edited save that does is tidied rather than refused.
  state.codex = [...new Set(state.codex)];
  return { status: 'ok', state: convertGearStock(state), ...(migrated ? { migrated: true as const } : {}) };
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
