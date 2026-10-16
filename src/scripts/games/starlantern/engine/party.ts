import { GRID_SIZE, MAX_ACTIVE } from './formation';
import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { SKILLS } from '../data/skills';
import { SETS, SPECIALS } from '../data/gear';
import { itemSlot, itemStats } from './loot/item';
import { newTree } from './progression';
import { PARTY_BASE, PRIMARY_KEYS, capSheet, convertPrimary, emptySheet, naturalPrimary } from './stats';
import type { AnyStat, CharacterId, GearSlot, ItemInstance, Member, Party, Passive, PrimaryKey, Sheet, Slot, StatKey, Stats } from './types';

/** Level cap; deep floors (depthLevel 2 + 4 per depth) need room past 20. Progression design §6. */
export const MAX_LEVEL = 50;
export const STARTING_RECRUITS: CharacterId[] = ['scarlet', 'chizuru', 'liz', 'noel', 'selene'];
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
export type StatSource = 'base' | 'growth' | 'gear' | 'set' | 'primary';

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
  // Natural primaries are shown here but never converted; only gear and set primaries convert.
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
  const prim: Partial<Record<PrimaryKey, number>> = {};
  for (const k of PRIMARY_KEYS) {
    const n = (gear[k] ?? 0) + (set[k] ?? 0);
    if (n) prim[k] = n;
  }
  return [
    { source: 'base', stats: base }, { source: 'growth', stats: growth }, { source: 'gear', stats: gear },
    { source: 'set', stats: set }, { source: 'primary', stats: convertPrimary(prim, def.affinity) },
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

export function newParty(): Party {
  return {
    roster: Object.fromEntries(CHARACTER_IDS.map((id) => [id, newMember(id)])) as Record<CharacterId, Member>,
    recruited: [...STARTING_RECRUITS],
    grid: ['scarlet', 'chizuru', 'liz', null, null, null, 'noel', null, 'selene'],
  };
}

export function recruit(p: Party, id: CharacterId): Party {
  return p.recruited.includes(id) ? p : { ...p, recruited: [...p.recruited, id] };
}

/** Members on the field, front row first, left to right. */
export function activeIds(p: Party): CharacterId[] {
  return p.grid.filter((id): id is CharacterId => id !== null);
}

export { rowOfCell } from './formation';

export function setFormation(
  p: Party, grid: (CharacterId | null)[],
): { ok: true; party: Party } | { ok: false; reason: 'size' | 'not-recruited' | 'duplicate' | 'empty' | 'too-many' } {
  if (grid.length !== GRID_SIZE) return { ok: false, reason: 'size' };
  const ids = grid.filter((id): id is CharacterId => id !== null);
  if (ids.some((id) => !p.recruited.includes(id))) return { ok: false, reason: 'not-recruited' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate' };
  if (ids.length === 0) return { ok: false, reason: 'empty' };
  if (ids.length > MAX_ACTIVE) return { ok: false, reason: 'too-many' };
  return { ok: true, party: { ...p, grid: [...grid] } };
}

export function learnedSkills(id: CharacterId, level: number): string[] {
  return CHARACTERS[id].skills.filter((s) => (SKILLS[s].learnLevel ?? 1) <= level);
}

export function gainExp(m: Member, amount: number): { member: Member; levels: number; learned: string[] } {
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
  const had = new Set(learnedSkills(m.id, m.level));
  return { member: next, levels: level - m.level, learned: learnedSkills(m.id, level).filter((s) => !had.has(s)) };
}

/** What one member got from an exp award: levels gained (0 when none) and skills learned on the way. */
export type LevelUp = { id: CharacterId; levels: number; learned: string[] };

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
    results.push({ id, levels: r.levels, learned: r.learned });
  }
  return { party: { ...p, roster }, results };
}

export function hasPassive(p: Party, passive: Passive): boolean {
  return activeIds(p).some((id) => {
    const m = p.roster[id];
    return m.hp > 0 && learnedSkills(id, m.level).some((s) => SKILLS[s].passive === passive);
  });
}
