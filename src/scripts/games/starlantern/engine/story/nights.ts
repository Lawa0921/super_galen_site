import { CHARACTER_IDS } from '../../data/characters';
import { NIGHT_BEATS, type NightBeat, type NightBeats } from '../../data/story.zh-TW';
import { ALONE, BANTER_COUNT, BANTER_GATE, BANTER_PAIRS, CHAT_COUNT, CHAT_GATE, CLOSING_PIECES, GROUP_GATE, banterScene, banterTwo, type GroupScene, type SceneId, type StoryGate } from '../../data/story/scenes';
import { memoryTone } from '../../data/story/tone';
import type { GameState } from '../state';
import type { CharacterId } from '../types';
import { banterOpen, chatOpen, gateExpired } from './events';

export type { NightBeats };

/**
 * Story L spec §4.3–§4.6: what a return's night plays. `before`: the memories the story owes before the day's scene that
 * needs them (Lorne's and Rin's), at the front of the day's list; `night`: the night's memories, after the day's notices.
 */
export interface NightPlan { before: SceneId[]; night: SceneId[] }

/** A night's fatigue guard reads each memory's tone (`memoryTone`); tests may give their own. */
export type ToneOf = (id: SceneId) => 'warm' | 'heavy';

const ownerOf = (id: SceneId): CharacterId => id.split(':')[1] as CharacterId;
const pieceNo = (id: SceneId): number => Number(id.split(':')[2]);
/** Lorne and Rin: first in a night, two a night at most (never side by side); a companion plays once a night. */
const keyed = (c: CharacterId): boolean => c === 'hero' || c === 'rin';
/** The days that need Lorne's and Rin's pieces told first: the acts and the bellkeeper's arrival (spec §4.3). */
const MAIN_DAYS: readonly SceneId[] = ['act2', 'act3', 'act4', 'bellkeeper-arrives'];

/** `ids` in their order, but never one person twice running while someone else is left (each one's pieces keep their order). */
function interleave(ids: SceneId[]): SceneId[] {
  const left = [...ids];
  const out: SceneId[] = [];
  while (left.length) {
    const last = out.length ? ownerOf(out[out.length - 1]) : null;
    const i = left.findIndex((id) => ownerOf(id) !== last);
    out.push(left.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
}

/**
 * Spec §4.3's table: the memories this arrival owes before its day, in pickup order with Lorne and Rin interleaved.
 * - an act or the bellkeeper's arrival in `day`: every untold piece of Lorne's and Rin's;
 * - Rin's reveal or confession (`ALONE`): Rin's only;
 * - `hero-alone` in the queue, on any day but those: Lorne's untold pieces up to his ninth (they wait for the next
 *   arrival that is not `ALONE`).
 */
export function owedPieces(s: GameState, day: SceneId[]): SceneId[] {
  const main = day.some((id) => MAIN_DAYS.includes(id));
  const alone = day.some((id) => ALONE.includes(id));
  const lone = s.story.queue.includes('hero-alone');
  return interleave((s.story.untold ?? []).filter((id) => {
    const c = ownerOf(id);
    if (c === 'rin') return main || alone;
    if (c === 'hero') return !alone && (main || (lone && pieceNo(id) <= 9));
    return false;
  }));
}

/** Spec §4.3 (controller ruling): one memory a night for a backlog of one to three, two for four to six, three from seven. */
export function nightCap(backlog: number): number {
  return backlog <= 0 ? 0 : Math.min(3, Math.max(1, Math.ceil(backlog / 3)));
}

/** Whether `c` speaks in scene `id` of today's arrival: her chat, a banter of her pair, a group scene she is in. */
function speaksIn(id: SceneId, c: CharacterId): boolean {
  if (id.startsWith(`chat:${c}:`)) return true;
  if (id.startsWith('banter:')) return banterTwo(id).includes(c);
  if (id.startsWith('group:')) return !!GROUP_GATE[id as GroupScene]?.met?.includes(c);
  return false;
}

/** The first of `ids` neither seen nor passed over for good (an expired gate): the one that comes next in its line. */
const nextOf = (s: GameState, ids: SceneId[], gates: Partial<Record<SceneId, StoryGate>>): SceneId | null =>
  ids.find((id) => !s.story.seen.includes(id) && !gateExpired(s, gates[id])) ?? null;

/**
 * Spec §4.4's second tier: `c` is where the day's talk picks up. She speaks in today's arrival (`day`: her chat, a banter
 * of hers, a group scene she is in), or telling her next untold piece opens a gate shut now, on her next chat or on the
 * next banter of a pair of hers. The gates are the schedule's own (`chatOpen`, `banterOpen`), read as if the piece were told.
 */
export function continuing(s: GameState, c: CharacterId, day: SceneId[]): boolean {
  if (day.some((id) => speaksIn(id, c))) return true;
  const piece = (s.story.untold ?? []).filter((id) => ownerOf(id) === c).sort((a, b) => pieceNo(a) - pieceNo(b))[0];
  if (!piece) return false;
  const told: GameState = { ...s, story: { ...s.story, seen: [...s.story.seen, piece] } };
  const chat = nextOf(s, Array.from({ length: CHAT_COUNT[c] }, (_, i): SceneId => `chat:${c}:${i + 1}`), CHAT_GATE);
  if (chat && !chatOpen(s, chat) && chatOpen(told, chat)) return true;
  for (const pair of BANTER_PAIRS) {
    if (!banterTwo(banterScene(pair, 1)).includes(c)) continue;
    const id = nextOf(s, Array.from({ length: BANTER_COUNT[pair] ?? 0 }, (_, i) => banterScene(pair, i + 1)), BANTER_GATE);
    if (id && !banterOpen(s, id) && banterOpen(told, id)) return true;
  }
  return false;
}

/**
 * Spec §4.3–§4.4: up to `n` of the untold memories (leaving out `exclude`, the owed ones), in play order. Candidates: each
 * one's lowest untold piece, and Lorne's and Rin's next one too. Ranked by tier (Lorne and Rin; where the day's talk picks
 * up, `continuing`; the rest), then pickup order, then the roster's order. Taken in rank: a companion once, Lorne or Rin
 * twice, and a second only when someone can stand between (three a night). Three with no warm one: the third gives way to
 * the best-ranked warm candidate. Then a closing piece goes last, and no one plays twice running. No rng: a pure function.
 */
export function pickMemories(s: GameState, day: SceneId[], n: number, exclude: SceneId[] = [], tone: ToneOf = memoryTone): SceneId[] {
  if (n <= 0) return [];
  const ranked = rankMemories(s, day, exclude);
  const count = (list: SceneId[], c: CharacterId) => list.filter((id) => ownerOf(id) === c).length;
  // A second piece of one: Lorne's or Rin's only, after her first, with someone else in the night to stand between.
  const fits = (list: SceneId[], id: SceneId): boolean => {
    const c = ownerOf(id);
    const k = count(list, c);
    if (k >= (keyed(c) ? 2 : 1)) return false;
    if (k === 1 && n < 3) return false;
    const first = ranked.find((x) => ownerOf(x) === c);
    return first === id || list.includes(first!);
  };
  let picks: SceneId[] = [];
  for (const id of ranked) {
    if (picks.length >= n) break;
    if (fits(picks, id)) picks.push(id);
  }
  // With fewer than three, no one stands between a second piece and her first: it waits.
  if (picks.length < 3) picks = picks.filter((id, i) => picks.findIndex((x) => ownerOf(x) === ownerOf(id)) === i);
  // Three a night hold a warm one when a candidate is warm (spec §4.3).
  if (picks.length === 3 && !picks.some((id) => tone(id) === 'warm')) {
    const rest = picks.slice(0, 2);
    const warm = ranked.find((id) => !picks.includes(id) && tone(id) === 'warm' && fits(rest, id));
    if (warm) picks = [...rest, warm];
  }
  return arrange(picks);
}

/**
 * Spec §4.4's ranking of the untold memories (leaving out `exclude`): each one's lowest untold piece, and Lorne's and Rin's
 * next one too; by tier (Lorne and Rin; where the day's talk picks up, `continuing`; the rest), then pickup order, then
 * the roster's order. The night (`pickMemories`) and the dawn (`dawnMemory`) take from it.
 */
export function rankMemories(s: GameState, day: SceneId[], exclude: SceneId[] = []): SceneId[] {
  const untold = (s.story.untold ?? []).filter((id) => !exclude.includes(id));
  const byOwner = new Map<CharacterId, SceneId[]>();
  for (const id of untold) byOwner.set(ownerOf(id), [...(byOwner.get(ownerOf(id)) ?? []), id]);
  const cands: SceneId[] = [];
  const tierOf = new Map<CharacterId, number>();
  for (const [c, list] of byOwner) {
    cands.push(...[...list].sort((a, b) => pieceNo(a) - pieceNo(b)).slice(0, keyed(c) ? 2 : 1));
    tierOf.set(c, keyed(c) ? 1 : continuing(s, c, day) ? 2 : 3);
  }
  return cands.sort((a, b) => tierOf.get(ownerOf(a))! - tierOf.get(ownerOf(b))! || untold.indexOf(a) - untold.indexOf(b)
    || CHARACTER_IDS.indexOf(ownerOf(a)) - CHARACTER_IDS.indexOf(ownerOf(b)));
}

/** 【控制者裁定 2026-10-24】 The dawn before departure plays one memory only while this many or more are still untold. */
export const DAWN_BACKLOG = 4;

/**
 * 【控制者裁定 2026-10-24】 The dawn before departure: one memory told on the departure after a return, when `DAWN_BACKLOG`
 * or more are left untold once that return's night (`night`: its owed pieces and its memories, in play order) is told. By
 * the scheduler's order (`rankMemories`), a warm one first when there is one, never one of the night's last memory's owner.
 * Null when none. Pure: `Game.arrive` keeps the pick in `story.dawn`, so a reload offers the same one.
 */
export function dawnMemory(s: GameState, night: SceneId[], tone: ToneOf = memoryTone): SceneId | null {
  const told = night.filter((id) => id.startsWith('mem:'));
  const after: GameState = { ...s, story: { ...s.story, seen: [...s.story.seen, ...told], untold: (s.story.untold ?? []).filter((id) => !told.includes(id)) } };
  if ((after.story.untold ?? []).length < DAWN_BACKLOG) return null;
  const last = told.length ? ownerOf(told[told.length - 1]) : null;
  // one's lowest piece only (Lorne's and Rin's next one waits behind it), and never the night's last owner
  const ranked = rankMemories(after, []).filter((id, i, all) => ownerOf(id) !== last && all.findIndex((x) => ownerOf(x) === ownerOf(id)) === i);
  return ranked.find((id) => tone(id) === 'warm') ?? ranked[0] ?? null;
}

/** The closing pieces last; then no one twice running: the later one trades places with the next of someone else. */
function arrange(picks: SceneId[]): SceneId[] {
  const order = [...picks.filter((id) => !CLOSING_PIECES.includes(id)), ...picks.filter((id) => CLOSING_PIECES.includes(id))];
  for (let i = 1; i < order.length; i++) {
    const c = ownerOf(order[i]);
    if (ownerOf(order[i - 1]) !== c) continue;
    const j = order.findIndex((id, x) => x > i && ownerOf(id) !== c);
    if (j > 0) { [order[i], order[j]] = [order[j], order[i]]; continue; }
    // nobody after her: her earlier piece moves up past someone before it (each one's pieces keep their order)
    const k = order.findIndex((id, x) => x < i - 1 && ownerOf(id) !== c);
    if (k >= 0) [order[i - 1], order[k]] = [order[k], order[i - 1]];
  }
  return order;
}

/**
 * Spec §4.3, §4.6: this return's night. `before` is what the day owes (`owedPieces`); a reveal or confession day plays
 * nothing else. Otherwise the night is `pickMemories` up to the cap of the backlog left once the owed ones are out.
 */
export function planNight(s: GameState, day: SceneId[]): NightPlan {
  const before = owedPieces(s, day);
  if (day.some((id) => ALONE.includes(id))) return { before, night: [] };
  const backlog = (s.story.untold ?? []).length - before.length;
  return { before, night: pickMemories(s, day, nightCap(backlog), before) };
}

/**
 * Spec §4.6: a reload's night, picked again from nothing: what `story.tonight` still holds that is untold. The ones the day
 * owes (`owedPieces`) lead again; the others are the night.
 */
export function restoreNight(s: GameState, day: SceneId[]): NightPlan {
  const untold = s.story.untold ?? [];
  const left = (s.story.tonight ?? []).filter((id) => untold.includes(id) && !s.story.seen.includes(id));
  const owed = owedPieces(s, day);
  return { before: left.filter((id) => owed.includes(id)), night: left.filter((id) => !owed.includes(id)) };
}

/**
 * Spec §4.4.1: the beat between memories `prev` and `next`: from the cursor (`story.beat`) on, wrapping, the first line
 * that fits. A companion's fits once she is met and owns neither memory; narration always fits. Story L Task 8 (cold
 * read): the beat fits the memory it follows, so after a heavy one (`tone`) only a `quiet` line fits; a `lively` line
 * (a joke, a show-off, clapping) only after a warm one; an untagged line fits either. Null with no pool, or nothing
 * fitting. Pure: the caller moves the cursor past `at`.
 */
export function nextBeat(s: GameState, prev: SceneId, next: SceneId, pool: NightBeats = NIGHT_BEATS, tone: ToneOf = memoryTone): { line: NightBeat; at: number } | null {
  const n = pool.lines.length;
  if (!n) return null;
  const owners = [prev, next].filter((id) => id.startsWith('mem:')).map(ownerOf);
  const quietOnly = prev.startsWith('mem:') && tone(prev) === 'heavy';
  const fits = (l: NightBeat): boolean => {
    if (quietOnly && l.tone === 'lively') return false;
    if (!(CHARACTER_IDS as string[]).includes(l.who)) return true;
    const c = l.who as CharacterId;
    return s.party.recruited.includes(c) && !owners.includes(c);
  };
  const start = (s.story.beat ?? 0) % n;
  for (let k = 0; k < n; k++) {
    const at = (start + k) % n;
    if (fits(pool.lines[at])) return { line: pool.lines[at], at };
  }
  return null;
}

/** Spec §4.8: the eve's memories, up to three companions' (Lorne's and Rin's left out), in a night's order. */
export function eveMemories(s: GameState): SceneId[] {
  return pickMemories(s, [], 3, (s.story.untold ?? []).filter((id) => keyed(ownerOf(id))));
}
