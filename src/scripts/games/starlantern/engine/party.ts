import { GRID_SIZE, MAX_ACTIVE, ROWS } from './formation';
import { CHARACTERS, CHARACTER_IDS, rulesOf } from '../data/characters';
import { SKILLS } from '../data/skills';
import { depthLevel } from './levels';
import { SETS, SPECIALS } from '../data/gear';
import { itemSlot, itemStats } from './loot/item';
import { learnedSkills, newTree, skillPoints, talentPoints, talentStats } from './progression';
import { PARTY_BASE, PRIMARY_KEYS, capSheet, convertPrimary, emptySheet, naturalPrimary } from './stats';
import type { AnyStat, CharacterId, GearSlot, ItemInstance, Member, Party, Passive, PrimaryKey, Row, Sheet, Slot, StatKey, Stats } from './types';

/** Level cap; deep floors (depthLevel 2 + 4 per depth) need room past 20. Progression design §6. */
export const MAX_LEVEL = 50;
/** Who a new game starts with: the hero at the front and Rin. */
export const START_LINEUP: CharacterId[] = ['hero', 'rin'];
/** The party the game now starts with and the simulation's full party (spec 9.4): the hero, Rin, Chizuru, Noel, Selene. */
export const STANDARD_LINEUP: CharacterId[] = ['hero', 'rin', 'chizuru', 'noel', 'selene'];
/** The five the simulation fielded before the hero existed; the default of partyAt and kitParty so the balance stays bit-identical. */
export const LEGACY_LINEUP: CharacterId[] = ['scarlet', 'chizuru', 'liz', 'noel', 'selene'];
/** Where the legacy five stood (the old newParty grid), so column and cross attacks hit the same people as before. */
export const LEGACY_GRID: (CharacterId | null)[] = ['scarlet', 'chizuru', 'liz', null, null, null, 'noel', null, 'selene'];
const STAT_KEYS: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
export const SLOTS: Slot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'neck', 'ring1', 'ring2'];

/** The member slots a piece of this gear slot may go in. */
export function slotsFor(g: GearSlot): Slot[] {
  return g === 'ring' ? ['ring1', 'ring2'] : [g];
}

/** Where an item goes when no slot is chosen. The ring rule lives only here: the first empty ring slot, else ring1. */
export function defaultSlotFor(m: Member, it: ItemInstance): Slot {
  const slots = slotsFor(itemSlot(it));
  return slots.find((s) => !m.equip[s]) ?? slots[0];
}

export const expToNext = (level: number): number => Math.floor(14 * level ** 1.3);

/** Where a member's numbers come from; later systems (enchanting, talents) add a source here and the character sheet grows a column. */
export type StatSource = 'base' | 'growth' | 'gear' | 'set' | 'talent' | 'primary';

const worn = (m: Member): ItemInstance[] => SLOTS.map((s) => m.equip[s]).filter((it): it is ItemInstance => !!it);

function addInto(out: Partial<Sheet>, add: Partial<Sheet>): void {
  for (const [k, v] of Object.entries(add) as [AnyStat, number][]) out[k] = (out[k] ?? 0) + v;
}

/** Pieces worn of each set; the same set piece worn twice (two rings) counts once. */
export function setCounts(m: Member): Record<string, number> {
  const seen = new Set<string>();
  const out: Record<string, number> = {};
  for (const it of worn(m)) {
    const set = it.special ? SPECIALS[it.special]?.set : undefined;
    if (!set || seen.has(it.special!)) continue;
    seen.add(it.special!);
    out[set] = (out[set] ?? 0) + 1;
  }
  return out;
}

/** Legendary powers of the worn gear, each once. */
export function powersOf(m: Member): string[] {
  const out: string[] = [];
  for (const it of worn(m)) {
    const p = it.special ? SPECIALS[it.special]?.power : undefined;
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

export function statSources(m: Member): { source: StatSource; stats: Partial<Sheet> }[] {
  const def = CHARACTERS[m.id];
  // Natural primaries are shown here but never converted; only gear, set and talent primaries convert.
  const base: Partial<Sheet> = { ...def.base, ...PARTY_BASE, ...naturalPrimary(def, m.level) };
  const growth: Partial<Sheet> = {};
  for (const k of STAT_KEYS) growth[k] = def.growth[k] * (m.level - 1);
  const gear: Partial<Sheet> = {};
  for (const it of worn(m)) addInto(gear, itemStats(it));
  const set: Partial<Sheet> = {};
  for (const [id, n] of Object.entries(setCounts(m))) {
    const s = SETS[id];
    if (!s) continue;
    if (n >= 2) addInto(set, s.two);
    if (n >= 4) addInto(set, s.four);
  }
  const talent = talentStats(m);
  const prim: Partial<Record<PrimaryKey, number>> = {};
  for (const k of PRIMARY_KEYS) {
    const n = (gear[k] ?? 0) + (set[k] ?? 0) + (talent[k] ?? 0);
    if (n) prim[k] = n;
  }
  return [
    { source: 'base', stats: base }, { source: 'growth', stats: growth }, { source: 'gear', stats: gear },
    { source: 'set', stats: set }, { source: 'talent', stats: talent }, { source: 'primary', stats: convertPrimary(prim, def.affinity) },
  ];
}

/** Every source added up, then held to the caps. */
export function sheetOf(m: Member): Sheet {
  const out = emptySheet();
  for (const part of statSources(m)) addInto(out, part.stats);
  return capSheet(out);
}

export function statsOf(m: Member): Stats {
  const sheet = sheetOf(m);
  const out = {} as Stats;
  // Rounded down; the epsilon keeps a float sum such as 7.9999999 from losing a point.
  for (const k of STAT_KEYS) out[k] = Math.floor(sheet[k] + 1e-9);
  return out;
}

export function newMember(id: CharacterId): Member {
  const m: Member = { id, level: 1, exp: 0, hp: 0, tp: 0, equip: {}, tree: newTree(id), talents: {} };
  const s = statsOf(m);
  return { ...m, hp: s.hp, tp: s.tp };
}

export function newParty(start: CharacterId[] = START_LINEUP): Party {
  return partyWith(start);
}

/** A copy of `grid` with `id` in the first empty cell of `row`; a full row spills to the middle row, then the other. The caller keeps the party under five. */
export function placeInGrid(grid: (CharacterId | null)[], id: CharacterId, row: Row): (CharacterId | null)[] {
  const out = [...grid];
  for (const r of [row, 'middle' as Row, ...ROWS.filter((x) => x !== row && x !== 'middle')]) {
    const base = ROWS.indexOf(r) * 3;
    const cell = [0, 1, 2].map((i) => base + i).find((c) => out[c] === null);
    if (cell !== undefined) { out[cell] = id; return out; }
  }
  return out;
}

/** Everyone in the roster, `ids` recruited and standing on the grid: as given, else each on their own row (the hero on `heroRow`). The legacy five keep the old grid. */
export function partyWith(ids: CharacterId[], heroRow: Row = 'front', grid?: (CharacterId | null)[]): Party {
  let g = grid ? [...grid] : undefined;
  if (!g && ids.length === LEGACY_LINEUP.length && ids.every((id, i) => id === LEGACY_LINEUP[i])) g = [...LEGACY_GRID];
  if (!g) {
    g = Array<CharacterId | null>(GRID_SIZE).fill(null);
    for (const id of ids) g = placeInGrid(g, id, id === 'hero' ? heroRow : CHARACTERS[id].row);
  }
  return {
    roster: Object.fromEntries(CHARACTER_IDS.map((id) => [id, newMember(id)])) as Record<CharacterId, Member>,
    recruited: [...ids],
    grid: g,
  };
}

/** Members on the field, front row first, left to right. */
export function activeIds(p: Party): CharacterId[] {
  return p.grid.filter((id): id is CharacterId => id !== null);
}

export { rowOfCell } from './formation';

export type SetFormationFail = 'size' | 'not-recruited' | 'duplicate' | 'empty' | 'too-many' | 'no-hero';

/** The hero always takes the field: a formation without them is refused (`no-hero`, checked last). */
export function setFormation(
  p: Party, grid: (CharacterId | null)[],
): { ok: true; party: Party } | { ok: false; reason: SetFormationFail } {
  if (grid.length !== GRID_SIZE) return { ok: false, reason: 'size' };
  const ids = grid.filter((id): id is CharacterId => id !== null);
  if (ids.some((id) => !p.recruited.includes(id))) return { ok: false, reason: 'not-recruited' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate' };
  if (ids.length === 0) return { ok: false, reason: 'empty' };
  if (ids.length > MAX_ACTIVE) return { ok: false, reason: 'too-many' };
  if (!ids.includes('hero')) return { ok: false, reason: 'no-hero' };
  return { ok: true, party: { ...p, grid: [...grid] } };
}

/** Skill and talent points a level-up earns. */
export type Points = { skill: number; talent: number };

export function gainExp(m: Member, amount: number): { member: Member; levels: number; points: Points } {
  let level = m.level;
  let exp = m.exp + amount;
  while (level < MAX_LEVEL && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level++;
  }
  if (level === MAX_LEVEL) exp = 0;
  const before = statsOf(m);
  const next: Member = { ...m, level, exp };
  const after = statsOf(next);
  next.hp = m.hp > 0 ? Math.min(after.hp, m.hp + after.hp - before.hp) : 0;
  next.tp = Math.min(after.tp, m.tp + after.tp - before.tp);
  const curve = rulesOf(m.id).curve;
  const points = { skill: skillPoints(level, curve) - skillPoints(m.level, curve), talent: talentPoints(level, curve) - talentPoints(m.level, curve) };
  // Points are never spent here: the player spends them on the status screen's tree and talent tabs.
  return { member: next, levels: level - m.level, points };
}

/** What one member got from an exp award: levels gained (0 when none) and the points they brought. */
export type LevelUp = { id: CharacterId; levels: number; points: Points };

export function awardExp(
  p: Party, amount: number, survivors: CharacterId[],
): { party: Party; results: LevelUp[] } {
  const active = activeIds(p);
  const roster = { ...p.roster };
  const results: LevelUp[] = [];
  for (const id of p.recruited) {
    const share = !active.includes(id) ? Math.floor(amount / 2) : survivors.includes(id) ? amount : 0;
    if (share <= 0) continue;
    const r = gainExp(roster[id], share);
    roster[id] = r.member;
    results.push({ id, levels: r.levels, points: r.points });
  }
  return { party: { ...p, roster }, results };
}

export function hasPassive(p: Party, passive: Passive): boolean {
  return activeIds(p).some((id) => {
    const m = p.roster[id];
    return m.hp > 0 && learnedSkills(m).some((s) => SKILLS[s].passive === passive);
  });
}

/** The level a newcomer joins at (spec 9.2): the field's average, at least the depth's level less two, never past the field's best. */
export function joinLevel(p: Party, depth: number): number {
  const levels = activeIds(p).map((id) => p.roster[id].level);
  if (levels.length === 0) return 1;
  const avg = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  return Math.min(MAX_LEVEL, Math.max(1, Math.min(Math.max(...levels), Math.max(avg, depthLevel(depth) - 2))));
}

/** Meets a companion: she joins at the given level with the free rank only (points are spent on the status screen), full HP and TP, on the field while there is room, else on the bench. */
export function meet(p: Party, id: CharacterId, level: number): Party {
  if (p.recruited.includes(id)) return p;
  const base: Member = { ...newMember(id), level, tree: newTree(id), talents: {} };
  const s = statsOf(base);
  const member: Member = { ...base, hp: s.hp, tp: s.tp };
  const grid = activeIds(p).length < MAX_ACTIVE ? placeInGrid(p.grid, id, CHARACTERS[id].row) : p.grid;
  return { ...p, roster: { ...p.roster, [id]: member }, recruited: [...p.recruited, id], grid };
}
