import { CHARACTERS, CHARACTER_IDS } from '../data/characters';
import { SKILLS } from '../data/skills';
import { EQUIPMENT } from '../data/equipment';
import type { CharacterId, Member, Party, Passive, Slot, StatKey, Stats } from './types';

export const MAX_LEVEL = 20;
export const STARTING_RECRUITS: CharacterId[] = ['scarlet', 'chizuru', 'liz', 'noel', 'selene'];
const STAT_KEYS: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
const SLOTS: Slot[] = ['weapon', 'armor', 'accessory'];

export const expToNext = (level: number): number => Math.floor(15 * level ** 1.6);

export function statsOf(m: Member): Stats {
  const def = CHARACTERS[m.id];
  const out = {} as Stats;
  for (const k of STAT_KEYS) out[k] = def.base[k] + def.growth[k] * (m.level - 1);
  for (const slot of SLOTS) {
    const id = m.equip[slot];
    const bonus = id ? EQUIPMENT[id]?.bonus : undefined;
    if (bonus) for (const k of STAT_KEYS) out[k] += bonus[k] ?? 0;
  }
  return out;
}

export function newMember(id: CharacterId): Member {
  const m: Member = { id, level: 1, exp: 0, hp: 0, tp: 0, equip: {} };
  const s = statsOf(m);
  return { ...m, hp: s.hp, tp: s.tp };
}

export function newParty(): Party {
  return {
    roster: Object.fromEntries(CHARACTER_IDS.map((id) => [id, newMember(id)])) as Record<CharacterId, Member>,
    recruited: [...STARTING_RECRUITS],
    front: ['scarlet', 'chizuru', 'liz'],
    back: ['noel', 'selene'],
  };
}

export function recruit(p: Party, id: CharacterId): Party {
  return p.recruited.includes(id) ? p : { ...p, recruited: [...p.recruited, id] };
}

export function activeIds(p: Party): CharacterId[] {
  return [...p.front, ...p.back].filter((id): id is CharacterId => id !== null);
}

export function setFormation(
  p: Party, front: (CharacterId | null)[], back: (CharacterId | null)[],
): { ok: true; party: Party } | { ok: false; reason: 'size' | 'not-recruited' | 'duplicate' | 'empty' } {
  if (front.length !== 3 || back.length !== 2) return { ok: false, reason: 'size' };
  const ids = [...front, ...back].filter((id): id is CharacterId => id !== null);
  if (ids.some((id) => !p.recruited.includes(id))) return { ok: false, reason: 'not-recruited' };
  if (new Set(ids).size !== ids.length) return { ok: false, reason: 'duplicate' };
  if (ids.length === 0) return { ok: false, reason: 'empty' };
  return { ok: true, party: { ...p, front: [...front], back: [...back] } };
}

export function learnedSkills(id: CharacterId, level: number): string[] {
  return CHARACTERS[id].skills.filter((s) => SKILLS[s].learnLevel <= level);
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

export function awardExp(
  p: Party, amount: number, survivors: CharacterId[],
): { party: Party; results: { id: CharacterId; levels: number; learned: string[] }[] } {
  const active = activeIds(p);
  const roster = { ...p.roster };
  const results: { id: CharacterId; levels: number; learned: string[] }[] = [];
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
