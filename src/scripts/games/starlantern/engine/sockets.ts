import { CHARACTER_IDS } from '../data/characters';
import { RESERVE_CAP, RUNES, RUNE_SLOT_LEVELS, RUNE_STACK, exclusiveGroupOf, parseRuneKey, runeKey, type RuneRef } from '../data/runes';
import { SKILLS } from '../data/skills';
import { MAX_LEVEL } from './party';
import { learnedSkills } from './progression';
import type { GameState } from './state';
import type { CharacterId, Member } from './types';

/**
 * Rune sockets and the rune bag (spec §6.5, plan 8e Task 2): which skills take runes, how many slots a level opens,
 * socketing and unsocketing, the runes a respec hands back, and the save's rune fields (checked and repaired on load).
 * Whether a socketed rune works is engine/runes.ts `runeStates`: a rune that does not fit may sit in a slot, greyed.
 */

/** Slots each active skill has at this member level: 0 below Lv5, then 1, 2 and 3 from Lv5, 20 and 35. */
export const socketCount = (level: number): number => RUNE_SLOT_LEVELS.filter((l) => level >= l).length;

/** The skills of `m` that take runes: learned (her innate ones too) and not passive (plan 8e ruling 16). */
export const socketable = (m: Member): string[] => learnedSkills(m).filter((id) => !SKILLS[id]?.passive);

/** How many of this rune are in the bag (not socketed). */
export const bagCount = (s: Pick<GameState, 'runes'>, r: RuneRef): number => s.runes?.[runeKey(r)] ?? 0;

/**
 * How many of this rune the player owns (plan 8f ruling 13): the bag and every member's sockets, on the field or not. The
 * number RUNE_STACK caps, and the 「持有」 the screens show; only the bag's can be sold or fused.
 */
export function ownedCount(s: Pick<GameState, 'runes' | 'party'>, r: RuneRef): number {
  let n = bagCount(s, r);
  for (const m of Object.values(s.party.roster)) {
    for (const cells of Object.values(m.sockets ?? {})) for (const c of cells) if (c && c.id === r.id && c.tier === r.tier) n++;
  }
  return n;
}

/** 常駐's reserve of one rune, in percent of max TP (data/runes RUNE_NUMBERS). */
const reserveOf = (r: RuneRef | null): number => (r?.id === 'lasting' ? RUNES.lasting.mod(r.tier).lasting!.reservePct : 0);

/**
 * The max TP her socketed 常駐 runes hold back, in percent, whether they fit or not: the cap on socketing (`reserve`) and
 * on repair only. What a battle holds back counts the working ones alone (Task 7).
 */
export const reservedTpPct = (m: Pick<Member, 'sockets'>): number =>
  Object.values(m.sockets ?? {}).flat().reduce((a, r) => a + reserveOf(r), 0);

const isRef = (v: unknown): v is RuneRef => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  return Object.keys(o).length === 2 && typeof o.id === 'string' && typeof o.tier === 'string' && parseRuneKey(`${o.id}@${o.tier}`) !== null;
};
const addBag = (runes: Record<string, number>, r: RuneRef, n = 1): void => {
  const k = runeKey(r);
  runes[k] = (runes[k] ?? 0) + n;
  if (runes[k] === 0) delete runes[k];
};
/** Why `r` cannot sit beside `others` on one skill: the same rune, or one of its exclusive group. */
const clash = (r: RuneRef, others: readonly (RuneRef | null)[]): 'same' | 'group' | null => {
  if (others.some((o) => o?.id === r.id)) return 'same';
  const g = exclusiveGroupOf(r.id);
  return g && others.some((o) => o && exclusiveGroupOf(o.id) === g) ? 'group' : null;
};
/** A slot list without the empty cells at its end. */
const trimmed = (cells: (RuneRef | null)[]): (RuneRef | null)[] => {
  let n = cells.length;
  while (n > 0 && cells[n - 1] === null) n--;
  return cells.slice(0, n);
};

export type SocketFail = 'invalid' | 'none' | 'slot' | 'same' | 'group' | 'reserve';

/**
 * Socket `r` from the bag into slot `slot` of a recruited member's skill; what the slot held goes back to the bag. A rune
 * whose tags do not fit may go in (spec §6.6 rule 4: it shows greyed and does nothing). Never changes `s`.
 */
export function socketRune(s: GameState, id: CharacterId, skill: string, slot: number, r: RuneRef): { ok: true; state: GameState } | { ok: false; reason: SocketFail } {
  const m = s.party.roster[id];
  if (!m || !s.party.recruited.includes(id) || !socketable(m).includes(skill) || !isRef({ id: r.id, tier: r.tier })) return { ok: false, reason: 'invalid' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= socketCount(m.level)) return { ok: false, reason: 'slot' };
  if (bagCount(s, r) < 1) return { ok: false, reason: 'none' };
  const cells = m.sockets?.[skill] ?? [];
  const held = cells[slot] ?? null;
  const why = clash(r, cells.filter((_, i) => i !== slot));
  if (why) return { ok: false, reason: why };
  if (reservedTpPct(m) - reserveOf(held) + reserveOf(r) > RESERVE_CAP) return { ok: false, reason: 'reserve' };
  const runes = { ...s.runes };
  addBag(runes, r, -1);
  if (held) addBag(runes, held);
  const next = [...cells];
  while (next.length < slot) next.push(null);
  next[slot] = { id: r.id, tier: r.tier };
  const member: Member = { ...m, sockets: { ...m.sockets, [skill]: next } };
  return { ok: true, state: { ...s, runes, party: { ...s.party, roster: { ...s.party.roster, [id]: member } } } };
}

/** The member's sockets with `skill`'s slots set to `cells` (trimmed; an empty list drops the key, empty sockets the field). */
function withCells(m: Member, skill: string, cells: (RuneRef | null)[]): Member {
  const sockets = { ...m.sockets };
  const left = trimmed(cells);
  if (left.length) sockets[skill] = left; else delete sockets[skill];
  const out: Member = { ...m, sockets };
  if (!Object.keys(sockets).length) delete out.sockets;
  return out;
}

/** The rune in slot `slot` of the member's skill goes back to the bag. Never changes `s`. */
export function unsocketRune(s: GameState, id: CharacterId, skill: string, slot: number): { ok: true; state: GameState } | { ok: false; reason: 'invalid' | 'empty' } {
  const m = s.party.roster[id];
  if (!m || !s.party.recruited.includes(id) || !Number.isInteger(slot) || slot < 0) return { ok: false, reason: 'invalid' };
  const cells = m.sockets?.[skill] ?? [];
  const held = cells[slot] ?? null;
  if (!held) return { ok: false, reason: 'empty' };
  const runes = { ...s.runes };
  addBag(runes, held);
  const next = [...cells];
  next[slot] = null;
  return { ok: true, state: { ...s, runes, party: { ...s.party, roster: { ...s.party.roster, [id]: withCells(m, skill, next) } } } };
}

/** One slot of one member's skill. */
export interface SocketAt { id: CharacterId; skill: string; slot: number }

/**
 * The rune in `from` into `to` in one step (plan 8g Task 1; spec §6.5: from any member's skill to any member's): taken
 * out, then socketed as from the bag, what `to` held going to the bag. Either both happen or nothing does: a refusal
 * (the slot itself, an empty `from`, or the socketing's reason seen with `from` already emptied) changes neither side.
 * Never changes `s`.
 */
export function moveRune(s: GameState, from: SocketAt, to: SocketAt): { ok: true; state: GameState } | { ok: false; reason: SocketFail | 'empty' } {
  if (from.id === to.id && from.skill === to.skill && from.slot === to.slot) return { ok: false, reason: 'invalid' };
  const held = s.party.roster[from.id]?.sockets?.[from.skill]?.[from.slot] ?? null;
  const out = unsocketRune(s, from.id, from.skill, from.slot);
  if (!out.ok) return out;
  return socketRune(out.state, to.id, to.skill, to.slot, held!);
}

/**
 * The runes on skills the member no longer knows go back to the bag (plan 8e ruling 15: a respec never loses a rune).
 * The same object when there are none.
 */
export function returnOrphanRunes(s: GameState, id: CharacterId): GameState {
  const m = s.party.roster[id];
  if (!m?.sockets) return s;
  const known = socketable(m);
  const lost = Object.keys(m.sockets).filter((k) => !known.includes(k));
  if (!lost.length) return s;
  const runes = { ...s.runes };
  let member = m;
  for (const k of lost) {
    for (const r of m.sockets[k]) if (r) addBag(runes, r);
    member = withCells(member, k, []);
  }
  return { ...s, runes, party: { ...s.party, roster: { ...s.party.roster, [id]: member } } };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;
/**
 * The members whose rune fields can be read: a known id, a whole level in range and a tree object. Any other member is
 * left alone here, for the save's validation to refuse.
 */
function readableMembers(d: Record<string, unknown>): Member[] {
  const party = d.party;
  if (!isObj(party) || !isObj(party.roster)) return [];
  const roster = party.roster;
  return CHARACTER_IDS.map((id) => roster[id]).filter((m): m is Member => isObj(m) && CHARACTER_IDS.includes(m.id as CharacterId)
    && Number.isInteger(m.level) && (m.level as number) >= 1 && (m.level as number) <= MAX_LEVEL && isObj(m.tree));
}

/** One member's sockets as the rules allow them (plan 8e ruling 16), checked slot by slot in learned order. */
function validSockets(m: Member): boolean {
  const sockets: unknown = m.sockets;
  if (sockets === undefined) return true;
  if (!isObj(sockets)) return false;
  const known = socketable(m);
  const slots = socketCount(m.level);
  for (const [skill, cells] of Object.entries(sockets)) {
    if (!known.includes(skill) || !Array.isArray(cells) || cells.length > slots) return false;
    if (!cells.every((c) => c === null || isRef(c))) return false;
    if (cells.some((c, i) => c && clash(c, cells.slice(0, i)))) return false;
  }
  return reservedTpPct(m) <= RESERVE_CAP;
}

/** Every rune key's count, bag and sockets together. */
function totals(d: Record<string, unknown>, members: Member[]): Map<string, number> {
  const out = new Map<string, number>();
  if (isObj(d.runes)) for (const [k, n] of Object.entries(d.runes)) out.set(k, (out.get(k) ?? 0) + (n as number));
  for (const m of members) for (const cells of Object.values(m.sockets ?? {})) for (const c of cells) if (c) out.set(runeKey(c), (out.get(runeKey(c)) ?? 0) + 1);
  return out;
}

/**
 * Whether a save's rune fields keep the rules: the runes-open and rune-tutorial flags (absent or true, plans 8f and
 * 8g), the bag (absent, or known keys with whole counts), each readable member's sockets (absent, or learned active
 * skills with at most socketCount slots of runes, no rune twice, one of each exclusive group, 常駐 within RESERVE_CAP),
 * and at most RUNE_STACK of any one rune, bag and sockets together.
 */
export function validRuneFields(d: Record<string, unknown>): boolean {
  if (d.runesOpen !== undefined && d.runesOpen !== true) return false;
  if (d.runeTutorialSeen !== undefined && d.runeTutorialSeen !== true) return false;
  if (d.runes !== undefined && !(isObj(d.runes) && Object.entries(d.runes).every(([k, n]) => parseRuneKey(k) !== null && isCount(n)))) return false;
  const members = readableMembers(d);
  if (!members.every(validSockets)) return false;
  return [...totals(d, members).values()].every((n) => n <= RUNE_STACK);
}

/**
 * Brings a save's rune fields within the rules in place (plan 8e ruling 19: repaired, never corrupt), so that
 * `validRuneFields(d)` holds after; fields that keep the rules are not touched at all. A runes-open or rune-tutorial
 * flag that is not `true` goes (plans 8f and 8g). A bag or sockets field that is no object goes; bag keys that are
 * unknown or not whole counts go; a slot that is no rune is emptied; a rune in the wrong place (a skill she does not
 * know or a passive, past her slots, a second of its id or group, a 常駐 past the cap in learned order) goes back to
 * the bag; past RUNE_STACK of one rune, the bag gives way.
 */
export function repairRuneFields(d: Record<string, unknown>): void {
  if (d.runesOpen !== undefined && d.runesOpen !== true) delete d.runesOpen;
  if (d.runeTutorialSeen !== undefined && d.runeTutorialSeen !== true) delete d.runeTutorialSeen;
  if (d.runes !== undefined && !isObj(d.runes)) delete d.runes;
  if (isObj(d.runes)) for (const [k, n] of Object.entries(d.runes)) if (parseRuneKey(k) === null || !isCount(n)) delete d.runes[k];
  const bag = (): Record<string, number> => (isObj(d.runes) ? d.runes : (d.runes = {})) as Record<string, number>;
  const members = readableMembers(d);
  for (const m of members) {
    const raw: unknown = m.sockets;
    if (raw === undefined) continue;
    if (!isObj(raw)) { delete m.sockets; continue; }
    const known = socketable(m);
    const slots = socketCount(m.level);
    const touched = new Set<string>();
    // Skills she does not know (or passives), and slot lists that are no list.
    for (const [skill, cells] of Object.entries(raw)) {
      if (known.includes(skill) && Array.isArray(cells)) continue;
      if (Array.isArray(cells)) for (const c of cells) if (isRef(c)) addBag(bag(), c);
      delete raw[skill];
      touched.add(skill);
    }
    let reserve = 0;
    const order = known.filter((k) => k in raw);
    for (const skill of order) {
      const cells = raw[skill] as unknown[];
      if (cells.length > slots) touched.add(skill);
      const kept: (RuneRef | null)[] = [];
      cells.forEach((c, i) => {
        if (!isRef(c)) { if (c !== null) touched.add(skill); kept.push(null); return; }
        if (i >= slots || clash(c, kept) || reserve + reserveOf(c) > RESERVE_CAP) {
          touched.add(skill); addBag(bag(), c); kept.push(null); return;
        }
        reserve += reserveOf(c);
        kept.push(c);
      });
      if (touched.has(skill)) {
        const left = trimmed(kept);
        if (left.length) raw[skill] = left; else delete raw[skill];
      }
    }
    if (touched.size && !Object.keys(raw).length) delete m.sockets;
  }
  // Past RUNE_STACK of one rune the bag gives way. The slots alone never pass it: one of a rune a skill, and a roster
  // can hold fewer skills than RUNE_STACK (guarded in engine/runes.test.ts).
  for (const [k, n] of totals(d, members)) {
    const b = d.runes as Record<string, number> | undefined;
    if (n <= RUNE_STACK || !b?.[k]) continue;
    b[k] -= Math.min(n - RUNE_STACK, b[k]);
    if (b[k] === 0) delete b[k];
  }
}
