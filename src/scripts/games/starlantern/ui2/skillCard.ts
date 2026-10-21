import { CHARACTERS } from '../data/characters';
import { RESERVE_CAP, RUNES, RUNE_IDS, RUNE_TIERS, exclusiveGroupOf, parseRuneKey, type RuneRef, type RuneTier } from '../data/runes';
import { T } from '../data/text.zh-TW';
import { fromMember, runeView, skillCost, skillFor } from '../engine/battle';
import { battleReservePct, lastingBarrierLoss, WHEEL } from '../engine/mechanics/runes';
import { statsOf } from '../engine/party';
import { treeCost } from '../engine/progression';
import { runeNotes, runeWhy, skillTags } from '../engine/runes';
import { ELEMENT_AILMENT } from '../engine/skills';
import {
  bagCount, moveRune, ownedCount, socketCount, socketRune, unsocketRune, type SocketAt, type SocketFail,
} from '../engine/sockets';
import type { GameState } from '../engine/state';
import type { Effect, Member, Party, SkillDef } from '../engine/types';

/**
 * The skill card (plan 8g Task 3, spec §6.8): one model of a skill as a member casts it, before and after a rune, read
 * by the workshop, the status page, the battle menu and the tree's variant preview. Pure functions: every number is the
 * engine's own (skillFor, skillCost, treeCost, battleReservePct), and a preview is the engine's socketing run on the
 * state, never a copy of its rules; nothing passed in is changed.
 */

const W = T.ui2.workshop;

export type CardKey = 'target' | 'hits' | 'element' | 'power' | 'heal' | 'effect' | 'turns' | 'tp' | 'hp' | 'tpMax';
const KEYS: readonly CardKey[] = ['target', 'hits', 'element', 'power', 'heal', 'effect', 'turns', 'tp', 'hp', 'tpMax'];
const ROW: Record<CardKey, string> = W.row;

/** `tpPlain`: her max TP out of battle, which a comparison shows on the side that has no `tpMax` row. */
export interface Card { name: string; tags: string[]; rows: { key: CardKey; text: string }[]; adds: string[]; tpPlain: string }

type Damage = Extract<Effect, { kind: 'damage' }>;
const isDamage = (e: Effect): e is Damage => e.kind === 'damage';
/** A number as the card shows it: rounded, for show only. */
const num = (v: number): string => String(Math.round(v));
/** The values of one row: one when they agree, 「／」 between them when the effects differ. */
const joined = (vals: string[]): string => [...new Set(vals)].join(W.join);
const pct = (chance: number): number => Math.round(chance * 100);

/** Each ailment once, at its highest chance. */
function strongest(list: { status: keyof typeof T.ailment; chance: number }[]): [keyof typeof T.ailment, number][] {
  const out = new Map<keyof typeof T.ailment, number>();
  for (const a of list) out.set(a.status, Math.max(out.get(a.status) ?? 0, a.chance));
  return [...out];
}

/** What the skill does beyond its rows (plan 8g ruling 7), read from the skill as it is: never a rune's sentence. */
function addsOf(def: SkillDef): string[] {
  const A = W.add;
  const out: string[] = [];
  const dmg = def.effects.filter(isDamage);
  for (const [status, chance] of strongest(dmg.flatMap((e) => e.onHit ?? []))) out.push(A.onHit(pct(chance), T.ailment[status]));
  const inflicts = def.effects.flatMap((e) => (e.kind === 'inflict' ? [e] : []));
  for (const [status, chance] of strongest(inflicts)) out.push(A.inflict(pct(chance), T.ailment[status]));
  const after = dmg.find((e) => e.aftermath);
  if (after) out.push(A.aftermath(T.ailment[ELEMENT_AILMENT[after.element]]));
  const drain = dmg.find((e) => e.drainPct !== undefined)?.drainPct;
  if (drain !== undefined) out.push(A.drain(drain));
  const regain = dmg.find((e) => e.tpPerHit !== undefined)?.tpPerHit;
  if (regain !== undefined) out.push(A.regain(regain));
  if (dmg.some((e) => e.armorBreak)) out.push(A.armorBreak);
  if (def.effects.some((e) => e.kind === 'cure')) out.push(A.cure);
  const spill = def.effects.flatMap((e) => (e.kind === 'heal' && e.overflowPct !== undefined ? [e.overflowPct] : []));
  if (spill.length) out.push(A.spill(Math.max(...spill)));
  const r = def.runeRules;
  if (r?.trigger) out.push(A.trigger(A.when[r.trigger.on], r.trigger.pct));
  if (r?.twice) out.push(A.twice);
  if (r?.bounce) out.push(A.bounce(r.bounce.bounces, r.bounce.dropPct));
  if (r?.reprise !== undefined) out.push(A.reprise(r.reprise));
  if (r?.sync !== undefined) out.push(A.sync(r.sync));
  if (r?.lasting) out.push(A.lasting(r.lasting.pct, r.lasting.reservePct));
  if (r?.wheel) out.push(A.wheel(...(WHEEL.map((el) => T.element[el]) as [string, string, string])));
  return out;
}

/** One effect's 效果 words and its rounds, for a buff, a debuff, a barrier, a device or an exposure. */
function effectOf(e: Effect): { text: string; turns: number } | undefined {
  switch (e.kind) {
    case 'buff': return { text: W.buff(T.stat[e.stat], Math.round(e.pct)), turns: e.turns };
    case 'barrier': return { text: e.barrier === 'guard' ? W.guard(Math.round(e.power)) : W.purify(Math.round(e.power)), turns: e.turns };
    case 'device': return { text: W.device(Math.round(e.power)), turns: e.turns };
    case 'expose': return { text: W.expose, turns: e.turns };
    default: return undefined;
  }
}

/** Her max TP in battle with this much held back: the same sum as applyLasting's. */
const battleMax = (tp: number, held: number): number => Math.floor((tp * (100 - held)) / 100);

/**
 * The card of `skill` as `m` casts it with the runes in her slots now (plan 8g rulings 6 and 7); undefined for no such
 * skill. For a preview, run the engine's socketing on a copy of the state first (`previewOf`) and read the card of the
 * member in its result.
 */
export function cardOf(m: Member, skill: string): Card | undefined {
  const c = fromMember(m, 0);
  const def = skillFor(c, skill);
  const view = runeView(c, skill, []);
  if (!def || !view) return undefined;
  const all = def.target === 'enemies' || def.target === 'allies';
  const rows: Card['rows'] = [{ key: 'target', text: W.target[def.target] }];
  const dmg = def.effects.filter(isDamage);
  if (dmg.length) {
    rows.push({ key: 'hits', text: joined(dmg.map((e) => String(e.hits ?? 1))) });
    rows.push({ key: 'element', text: joined(dmg.map((e) => T.element[e.element])) });
    const power = joined(dmg.map((e) => num(e.power)));
    rows.push({ key: 'power', text: all ? W.each(power) : power });
  }
  const heals = def.effects.flatMap((e) => (e.kind === 'heal' ? [num(e.power)] : e.kind === 'revive' ? [W.pct(Math.round(e.hpPct * 100))] : []));
  if (heals.length) rows.push({ key: 'heal', text: joined(heals) });
  const effects = def.effects.flatMap((e) => { const x = effectOf(e); return x ? [x] : []; });
  if (effects.length) {
    rows.push({ key: 'effect', text: joined(effects.map((x) => x.text)) });
    rows.push({ key: 'turns', text: joined(effects.map((x) => String(x.turns))) });
  }
  rows.push({ key: 'tp', text: String(treeCost(m, skill, skillCost(c, skill))) });
  if (def.hpCost) rows.push({ key: 'hp', text: W.pct(Math.round(def.hpCost * 100)) });
  const tp = statsOf(m).tp;
  const held = battleReservePct(c);
  if (held > 0) rows.push({ key: 'tpMax', text: String(battleMax(tp, held)) });
  return { name: def.name, tags: skillTags(view.def).map((t) => T.rune.tag[t]), rows, adds: addsOf(def), tpPlain: String(tp) };
}

export interface CardLine { key: CardKey; label: string; before: string; after: string; changed: boolean }

/**
 * Two cards side by side: the rows of either, in CardKey order (a row one side lacks reads 「—」, or her plain max TP
 * for `tpMax`); the 附加 lines added, removed and kept; `changes`, the rows that changed plus the lines added or removed.
 */
export function compareCards(before: Card, after: Card): { lines: CardLine[]; added: string[]; removed: string[]; kept: string[]; changes: number } {
  const text = (card: Card, key: CardKey) => card.rows.find((r) => r.key === key)?.text ?? (key === 'tpMax' ? card.tpPlain : W.none);
  const has = (card: Card, key: CardKey) => card.rows.some((r) => r.key === key);
  const lines = KEYS.filter((k) => has(before, k) || has(after, k)).map((key): CardLine => {
    const b = text(before, key), a = text(after, key);
    return { key, label: ROW[key], before: b, after: a, changed: b !== a };
  });
  const added = after.adds.filter((x) => !before.adds.includes(x));
  const removed = before.adds.filter((x) => !after.adds.includes(x));
  const kept = after.adds.filter((x) => before.adds.includes(x));
  return { lines, added, removed, kept, changes: lines.filter((l) => l.changed).length + added.length + removed.length };
}

export type RuneAction = { kind: 'bag'; ref: RuneRef } | { kind: 'move'; from: SocketAt } | { kind: 'remove' };

/** The engine's own socketing, moving or unsocketing at `at`, run on `s` (never changed): its result, as it is. */
export function previewOf(s: GameState, at: SocketAt, act: RuneAction): { ok: true; state: GameState } | { ok: false; reason: SocketFail | 'empty' } {
  switch (act.kind) {
    case 'bag': return socketRune(s, at.id, at.skill, at.slot, act.ref);
    case 'move': return moveRune(s, act.from, at);
    case 'remove': return unsocketRune(s, at.id, at.skill, at.slot);
  }
}

/**
 * Each of her open slots of `skill` (socketCount): empty, a rune that works, or one that does not (greyed in place,
 * spec §6.6 rule 4) with the one line that says why. Judged as a battle judges them (runeView, the runes in slot order).
 */
export function slotStates(m: Member, skill: string): { state: 'on' | 'off' | 'empty'; ref?: RuneRef; why?: string }[] {
  const cells = m.sockets?.[skill] ?? [];
  const refs = cells.filter((r): r is RuneRef => r !== null).map((r) => ({ id: r.id, tier: r.tier }));
  const states = runeView(fromMember(m, 0), skill, refs)?.states ?? [];
  let k = 0;
  return Array.from({ length: socketCount(m.level) }, (_, i) => {
    const r = cells[i] ?? null;
    if (!r) return { state: 'empty' as const };
    const miss = states[k++]?.miss ?? null;
    const ref = { id: r.id, tier: r.tier };
    return miss ? { state: 'off' as const, ref, why: runeWhy(miss) } : { state: 'on' as const, ref };
  });
}

export type RuneSource = { kind: 'bag'; ref: RuneRef; count: number } | { kind: 'socket'; ref: RuneRef; at: SocketAt };
export interface RuneChoice {
  source: RuneSource; section: 'bag' | 'move'; why: string | null; changes: number; notes: string[];
  owned: { all: number; bag: number; socketed: number }; giver?: string;
}

/** Why the engine turned a socketing down, in the words of T.rune.fail. */
function failWhy(reason: SocketFail | 'empty', s: GameState, at: SocketAt, ref: RuneRef, from?: SocketAt): string {
  const F = T.rune.fail;
  switch (reason) {
    case 'reserve': return F.reserve(RESERVE_CAP);
    case 'same': return F.same(RUNES[ref.id].name);
    case 'group': {
      const g = exclusiveGroupOf(ref.id);
      const cells = s.party.roster[at.id]?.sockets?.[at.skill] ?? [];
      const other = cells.find((r, i) => r && i !== at.slot && !(from && from.id === at.id && from.skill === at.skill && from.slot === i)
        && exclusiveGroupOf(r.id) === g);
      return F.group(RUNES[other?.id ?? ref.id].name);
    }
    default: return F[reason];
  }
}

const TIER_RANK: readonly RuneTier[] = [...RUNE_TIERS, 'legendary'];
/**
 * The choices, by what they read: the party and the bag. The game changes `state.party` and `state.runes` in place (a
 * fight's runes, a level), each time to a new object, so a key on the state itself would go stale.
 */
const CACHE = new WeakMap<Party, WeakMap<object, Map<string, readonly RuneChoice[]>>>();
const NO_RUNES = {};

/**
 * The runes that could go into `at` (plan 8g ruling 5): the bag (one row a rune and tier), then every rune in another
 * slot of a recruited member, hers included. Each row is previewed by the engine: refused, `why` is the reason; taken
 * but greyed in that slot, `why` is the slot's; `changes` counts the card's changed rows and lines; `notes`, what the
 * rune says on this skill (runeNotes) and the two-barrier warning; a move names what its giver loses (her changed
 * rows, then her lost 附加 lines marked −), unless it stays on the same skill. Within each section: the ones that work first, then the most changes, then RUNE_IDS order, then the higher tier. Cached per party,
 * bag and slot, and frozen: the caller must not sort or change it.
 */
export function runeChoices(s: GameState, at: SocketAt): readonly RuneChoice[] {
  let byBag = CACHE.get(s.party);
  if (!byBag) CACHE.set(s.party, (byBag = new WeakMap()));
  let bySlot = byBag.get(s.runes ?? NO_RUNES);
  if (!bySlot) byBag.set(s.runes ?? NO_RUNES, (bySlot = new Map()));
  const key = `${at.id}:${at.skill}:${at.slot}`;
  const hit = bySlot.get(key);
  if (hit) return hit;
  const m = s.party.roster[at.id];
  const out: RuneChoice[] = [];
  if (m) {
    const now = cardOf(m, at.skill);
    const def = runeView(fromMember(m, 0), at.skill, [])?.def;
    const lossNow = lastingBarrierLoss(fromMember(m, 0));
    const choice = (source: RuneSource, section: RuneChoice['section']): RuneChoice => {
      const ref = source.ref;
      const all = ownedCount(s, ref), bag = bagCount(s, ref);
      const owned = { all, bag, socketed: all - bag };
      const from = source.kind === 'socket' ? source.at : undefined;
      const r = previewOf(s, at, from ? { kind: 'move', from } : { kind: 'bag', ref });
      if (!r.ok) return { source, section, why: failWhy(r.reason, s, at, ref, from), changes: 0, notes: [], owned };
      const after = r.state.party.roster[at.id];
      const slots = slotStates(after, at.skill);
      const mine = slots[at.slot];
      const why = mine?.state === 'off' ? mine.why ?? null : null;
      const card = cardOf(after, at.skill);
      const changes = now && card ? compareCards(now, card).changes : 0;
      const others = slots.flatMap((x, i) => (i !== at.slot && x.state === 'on' && x.ref ? [x.ref.id] : []));
      const notes = def ? runeNotes(def, ref.id, others) : [];
      if (lastingBarrierLoss(fromMember(after, 0)) > lossNow) notes.push(W.barrierClash);
      const out: RuneChoice = { source, section, why, changes, notes, owned };
      // A move within the skill itself takes nothing from anyone.
      if (from && !(from.id === at.id && from.skill === at.skill)) {
        const giverNow = s.party.roster[from.id];
        const was = cardOf(giverNow, from.skill), is = cardOf(r.state.party.roster[from.id], from.skill);
        const cmp = was && is ? compareCards(was, is) : undefined;
        const lost = cmp ? [...cmp.lines.filter((l) => l.changed).map((l) => W.arrow(l.before, l.after)), ...cmp.removed.map(W.lost)] : [];
        out.giver = W.giver(CHARACTERS[from.id].name, skillFor(fromMember(giverNow, 0), from.skill)?.name ?? from.skill, lost);
      }
      return out;
    };
    for (const [k, count] of Object.entries(s.runes ?? {})) {
      const ref = parseRuneKey(k);
      if (ref && count > 0) out.push(choice({ kind: 'bag', ref, count }, 'bag'));
    }
    for (const id of s.party.recruited) {
      for (const [skill, cells] of Object.entries(s.party.roster[id]?.sockets ?? {})) {
        cells.forEach((r, slot) => {
          if (!r || (id === at.id && skill === at.skill && slot === at.slot)) return;
          out.push(choice({ kind: 'socket', ref: { id: r.id, tier: r.tier }, at: { id, skill, slot } }, 'move'));
        });
      }
    }
  }
  const order = (c: RuneChoice) => [c.section === 'bag' ? 0 : 1, c.why === null ? 0 : 1, -c.changes, RUNE_IDS.indexOf(c.source.ref.id), -TIER_RANK.indexOf(c.source.ref.tier)];
  out.sort((a, b) => {
    const x = order(a), y = order(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  const frozen = Object.freeze(out.map((c) => Object.freeze(c)));
  bySlot.set(key, frozen);
  return frozen;
}

/** The battle menu's summary of a skill (plan 8g ruling 12): 「全體・威力 84・火」, a heal 「單體・回復 n」, else the target. */
export function battleLine(def: SkillDef): string {
  const parts: string[] = [W.target[def.target]];
  const d = def.effects.find(isDamage);
  const h = def.effects.find((e): e is Extract<Effect, { kind: 'heal' }> => e.kind === 'heal');
  if (d) parts.push(W.battle.power(Math.round(d.power)), T.element[d.element]);
  else if (h) parts.push(W.battle.heal(Math.round(h.power)));
  return parts.join(W.battle.sep);
}

/** Her max TP and what a battle leaves of it when her working 常駐 runes hold some back (plan 8g ruling 9); else null. */
export function reserveLine(m: Member): string | null {
  const held = battleReservePct(fromMember(m, 0));
  if (held <= 0) return null;
  const tp = statsOf(m).tp;
  return W.reserve(tp, battleMax(tp, held), held);
}
