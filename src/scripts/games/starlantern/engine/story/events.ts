import { CHARACTER_IDS } from '../../data/characters';
import { chainLength } from '../../data/story/chains';
import { ACT_DEPTHS, ACT_NODES, ALONE, BANTER_COUNT, BANTER_GATE, BANTER_PAIRS, CHAT_COUNT, CHAT_GATE, DEPARTURE_SCENES, HEAVY_MAJORS, HOME_OWNERS, STAGES, banterScene, banterTwo, heavyScene, homeScene, isHeavyArrival, type ActNode, type BanterPair, type SceneId, type Stage, type StoryGate } from '../../data/story/scenes';
import { memoriesOf } from '../progression';
import type { GameState, StoryState } from '../state';
import type { CharacterId } from '../types';

/**
 * Where the story stands, from what the player has done (the handbook and the town lines follow it). An act counts once it
 * has played: a node still waiting in the queue (held back by one heavy scene an arrival) moves nothing yet (story depth
 * plan ruling 5). An old save with the node and no queue entry counts as before.
 */
export function storyStage(s: GameState): Stage {
  const { story } = s;
  const played = (node: ActNode): boolean => story.nodes.includes(node) && !story.queue.includes(node);
  if (story.finaleCleared) return 'after';
  if (played('act4')) return 'act4';
  if (played('act3')) return 'act3';
  if (played('act2')) return 'act2';
  if (story.act1Cleared || s.dungeon.reached.mainline >= 2) return 'act1';
  return 'prologue';
}

/** Whether the party has ever won a fight: someone met has a level or exp to show for it (absorbing and memories give neither). Old saves only. */
const hasFought = (s: GameState): boolean => s.party.recruited.some((id) => {
  const m = s.party.roster[id];
  return !!m && (m.level > 1 || m.exp > 0);
});

/**
 * A fight is won: the first one Rin fought in queues `first-return` (Task 10b), which plays on the arrival that follows,
 * whichever way the party gets home. Her first trust in a fight is only true if she was in it (the hero may go down alone,
 * with Rin out of the formation). Pure: `fighters` are the party's combatants in that fight.
 */
export function afterWin(story: StoryState, fighters: readonly string[]): StoryState {
  if (!fighters.includes('rin') || story.seen.includes('first-return') || story.queue.includes('first-return')) return story;
  return { ...story, queue: [...story.queue, 'first-return'] };
}

/**
 * What a return to town adds to the queue: each act whose depth was reached, Rin's reveal once she holds every piece, and
 * the homecoming of each companion whose ending the town holds, once her memories are whole (continuity fix 2).
 * Pure: it returns the new story block and leaves the state alone. No act waits on anyone's fragment count (spec §2).
 */
export function onReturn(s: GameState): StoryState {
  const story: StoryState = { ...s.story, queue: [...s.story.queue], nodes: [...s.story.nodes] };
  for (const node of ACT_NODES) {
    if (s.dungeon.reached.mainline >= ACT_DEPTHS[node] && !story.nodes.includes(node)) {
      story.nodes.push(node);
      if (!story.queue.includes(node) && !story.seen.includes(node)) story.queue.push(node);
    }
  }
  const rin = s.party.roster.rin;
  if (memoriesOf(rin) >= chainLength('rin') && !rin.oath && !story.seen.includes('rin-reveal') && !story.queue.includes('rin-reveal')) story.queue.push('rin-reveal');
  for (const c of HOME_OWNERS) {
    const id = homeScene(c);
    if (!s.party.recruited.includes(c) || memoriesOf(s.party.roster[c]) < chainLength(c)) continue;
    if (!story.seen.includes(id) && !story.queue.includes(id)) story.queue.push(id);
  }
  // Story depth (plan ruling 6): the lone morning, once his ninth piece is seen or waiting and her choice is made, until the
  // finale; it plays on a departure (`Game.departScene`). The festival, once, on the first return after the finale.
  const owed = (id: SceneId): boolean => !story.seen.includes(id) && !story.queue.includes(id);
  const ninth = story.seen.includes('mem:hero:9') || story.queue.includes('mem:hero:9');
  if (ninth && rin?.oath && !story.finaleCleared && owed('hero-alone')) story.queue.push('hero-alone');
  if (story.finaleCleared && owed('epilogue')) story.queue.push('epilogue');
  return story;
}

/**
 * Play order for the queue: the prologue and its inn night, the first return, Act 1's close, the acts, the bellkeeper's
 * arrival, the hero's late memories by piece, then the rest as they came, and the homecomings last (behind every story
 * scene, a companion's own last piece included; ahead of the chat, which comes after the whole queue). The first return
 * sits ahead of everything a return can bring, so it never waits behind a chat nor follows the "three days later" of Act 1.
 */
const rank = (id: SceneId): number => {
  if (id === 'prologue') return -3;
  if (id === 'epilogue') return -0.5;   // the festival: first on the return after the finale
  if (id === 'prologue-inn') return -2;
  if (id === 'first-return') return -1;
  if (id === 'act1-after') return 0;
  if (id === 'act2') return 1;
  if (id === 'act3') return 2;
  if (id === 'act4') return 3;
  if (id === 'rin-confess') return 3.4;
  if (id === 'bellkeeper-arrives') return 3.5;
  if (id.startsWith('mem:hero:')) return 4 + Number(id.slice('mem:hero:'.length)) / 1000;
  if (id.startsWith('home:')) return 6;
  return 5;
};

/** How many memory pieces `c` holds; one not met yet holds none. */
const piecesOf = (s: GameState, c: CharacterId): number => {
  const m = s.party.roster[c];
  return m ? memoriesOf(m) : 0;
};

/**
 * Whether a gate holds (`StoryGate`): every kind it names. No gate always holds. `stage`: reached; `oath`: her choice made;
 * `full`: all of that one's memories; `beforeChoice`: her choice not made yet; `pieces`: each one named holds at least that
 * many; `seen`: every scene named is in `story.seen`.
 */
export function gateOpen(s: GameState, g: StoryGate | undefined): boolean {
  if (!g) return true;
  if (g.stage && STAGES.indexOf(storyStage(s)) < STAGES.indexOf(g.stage)) return false;
  if (g.oath && !s.party.roster.rin?.oath) return false;
  if (g.full && piecesOf(s, g.full) < chainLength(g.full)) return false;
  if (g.beforeChoice && s.party.roster.rin?.oath) return false;
  if (g.pieces && (Object.entries(g.pieces) as [CharacterId, number][]).some(([c, n]) => piecesOf(s, c) < n)) return false;
  if (g.seen && !g.seen.every((id) => s.story.seen.includes(id))) return false;
  return true;
}

/**
 * Whether a gate can never open again: a `beforeChoice` gate once Rin has made her choice. A scene behind it is passed over
 * for good: it never plays, and it no longer holds back the next one of its line (it is not written into `story.seen`).
 */
export function gateExpired(s: GameState, g: StoryGate | undefined): boolean {
  return !!g?.beforeChoice && !!s.party.roster.rin?.oath;
}

/** Whether a chat may be offered yet: its gate holds (`gateOpen`). A chat with no gate is always open. */
export function chatOpen(s: GameState, id: SceneId, gates: Partial<Record<SceneId, StoryGate>> = CHAT_GATE): boolean {
  return gateOpen(s, gates[id]);
}

/**
 * The next chat for a return to town: whoever has said least among the people met, their next one in order.
 * A person whose next chat is still gated is not a candidate this time, and what comes after it waits too. An expired chat
 * (`gateExpired`) is passed over: it counts as heard, never plays, and does not hold back the one after it.
 * `light` (a heavy arrival, story depth plan ruling 5): a chat that is not heavy (`heavyScene`) first; a heavy one only when
 * no light one is ready.
 */
export function nextChat(s: GameState, gates: Partial<Record<SceneId, StoryGate>> = CHAT_GATE, light = false): SceneId | null {
  return (light ? pickChat(s, gates, true) : null) ?? pickChat(s, gates, false);
}

function pickChat(s: GameState, gates: Partial<Record<SceneId, StoryGate>>, lightOnly: boolean): SceneId | null {
  const seen = new Set<SceneId>(s.story.seen);
  let best: { id: SceneId; heard: number } | null = null;
  for (const who of CHARACTER_IDS) {
    if (!s.party.recruited.includes(who)) continue;
    let heard = 0;
    let next: SceneId | null = null;
    let open = true;   // the one before is seen or passed over
    for (let n = 1; n <= CHAT_COUNT[who]; n++) {
      const id: SceneId = `chat:${who}:${n}`;
      if (seen.has(id) || gateExpired(s, gates[id])) { heard++; open = true; continue; }
      if (!next && open && chatOpen(s, id, gates)) next = id;
      open = false;
    }
    if (next && lightOnly && heavyScene(next)) continue;
    if (next && (!best || heard < best.heard)) best = { id: next, heard };
  }
  return best?.id ?? null;
}

/**
 * Whether a banter may play (B1): both of its two met, and its gate holding (`gateOpen`), as a chat's does. No gate opens a
 * banter whose two are not both met.
 */
export function banterOpen(s: GameState, id: SceneId, gates: Partial<Record<SceneId, StoryGate>> = BANTER_GATE): boolean {
  if (!banterTwo(id).every((c) => s.party.recruited.includes(c))) return false;
  return gateOpen(s, gates[id]);
}

/**
 * The banter for a return to town (B1), picked without any rng: the pair heard least among those with one ready, then the
 * pairs' fixed order (`BANTER_PAIRS`). A pair offers its banters in order: one still gated holds back the ones after it,
 * like a chat. A heard banter is never offered again (the handbook replays it), so none repeats before every open one has played.
 * An expired banter (`gateExpired`) is passed over, as a chat is: counted as heard, never offered, holding nothing back.
 */
export function nextBanter(s: GameState, gates: Partial<Record<SceneId, StoryGate>> = BANTER_GATE, count: Partial<Record<BanterPair, number>> = BANTER_COUNT): SceneId | null {
  const seen = new Set<SceneId>(s.story.seen);
  const pairs = count === BANTER_COUNT ? BANTER_PAIRS : (Object.keys(count) as BanterPair[]).sort();
  let best: { id: SceneId; heard: number } | null = null;
  for (const pair of pairs) {
    let heard = 0;
    let next: SceneId | null = null;
    let open = true;   // the one before is seen or passed over
    for (let n = 1; n <= (count[pair] ?? 0); n++) {
      const id = banterScene(pair, n);
      if (seen.has(id) || gateExpired(s, gates[id])) { heard++; open = true; continue; }
      if (!next && open && banterOpen(s, id, gates)) next = id;
      open = false;
    }
    if (next && (!best || heard < best.heard)) best = { id: next, heard };
  }
  return best?.id ?? null;
}

/**
 * The scenes this arrival in town should play, in order. Rin's reveal plays alone (the rest wait for the next return); so
 * does her confession (story depth: `ALONE`, the reveal first). Of the heavy major scenes (`HEAVY_MAJORS`) only the first
 * plays; the others stay in the queue for the next return. A departure scene (`DEPARTURE_SCENES`) never plays here. On a
 * heavy arrival the chat slot goes to a light chat first (`nextChat`'s `light`).
 * `chat` is true only for a return to town: a new game or a reload never adds a chat, nor a banter. On a return the queue
 * plays first (the opening, the acts, the bellkeeper, the memories, the homecomings), then one chat, then one banter (B1):
 * a banter never goes ahead of anything the story owes, and it plays even when no chat is due. No banter follows a heavy
 * arrival (`HEAVY_ARRIVAL`, or `afterFinale`: the return right after the ending); it waits for the next return. The heavy
 * check reads the queue and the scene in the chat slot: `slot` fills that slot, `nextChat` by default (6d: an ending first).
 */
export function arrivalScenes(s: GameState, o: { chat: boolean; afterFinale?: boolean; slot?: (s: GameState) => SceneId | null }): SceneId[] {
  const alone = ALONE.find((id) => s.story.queue.includes(id));
  if (alone) return [alone];
  const sorted = s.story.queue.filter((id) => !DEPARTURE_SCENES.includes(id)).sort((a, b) => rank(a) - rank(b));
  const major = sorted.find((id) => HEAVY_MAJORS.has(id));
  const list = sorted.filter((id) => !HEAVY_MAJORS.has(id) || id === major);
  if (!o.chat) return list;
  const heavyList = list.some(isHeavyArrival);
  const chat = (o.slot ?? ((st: GameState) => nextChat(st, CHAT_GATE, heavyList)))(s);
  const heavy = !!o.afterFinale || [...list, ...(chat ? [chat] : [])].some(isHeavyArrival);
  const banter = heavy ? null : nextBanter(s);
  return [...list, ...(chat ? [chat] : []), ...(banter ? [banter] : [])];
}

/**
 * A save from before Task 10b, brought up to the opening scenes without replaying what it is already past. Every game of
 * this version holds the inn night in its queue or seen from its first moment (`newStory`), so a save without it anywhere
 * is an old one, and only an old one is changed. Past its prologue, the inn night counts as seen; past a won fight, the
 * first return does too. What it counts as seen is not new (no 新 mark): the player was there.
 */
export function settleOpening(s: GameState): GameState {
  const { story } = s;
  if (story.seen.includes('prologue-inn') || story.queue.includes('prologue-inn')) return s;
  const seen = [...story.seen];
  const queue = [...story.queue];
  if (queue.includes('prologue')) queue.splice(queue.indexOf('prologue') + 1, 0, 'prologue-inn');
  else seen.push('prologue-inn');
  if (hasFought(s) && !seen.includes('first-return') && !queue.includes('first-return')) seen.push('first-return');
  return { ...s, story: { ...story, seen, queue } };
}

/** A scene is over, played or skipped; `auto` is one the player's story setting never showed, so it also reads as new. */
export function sceneDone(s: GameState, id: SceneId, how: 'played' | 'skipped' | 'auto'): GameState {
  const story: StoryState = { ...s.story, queue: s.story.queue.filter((q) => q !== id), seen: [...s.story.seen], fresh: [...s.story.fresh] };
  if (!story.seen.includes(id)) story.seen.push(id);
  if (how === 'auto' && !story.fresh.includes(id)) story.fresh.push(id);
  const queueOnce = (next: SceneId): void => { if (!story.seen.includes(next) && !story.queue.includes(next)) story.queue.push(next); };
  // Story depth: once she has told the table, her bell no longer answering the society's brings its keeper to town on the
  // next arrival (continuity fix 4, spec §5.2), once.
  if (id === 'rin-confess') queueOnce('bellkeeper-arrives');
  if (id !== 'rin-reveal') return { ...s, story };
  // Her choice is made: the oath, and the reports that follow it (spec §5.3). She tells the others at dinner on the next
  // return (story depth: `rin-confess`), once.
  queueOnce('rin-confess');
  const party = { ...s.party, roster: { ...s.party.roster, rin: { ...s.party.roster.rin, oath: true as const } } };
  return { ...s, story, party };
}

/**
 * A save from before the bellkeeper's arrival scene (continuity fix 4), brought up to it without playing it late. Every game
 * of this version queues the arrival the moment her choice is made, so a save past her choice without it anywhere is an
 * old one: it counts as seen (the player has met him in the town's lines), not new. Any other save is returned as it is.
 */
export function settleBellkeeper(s: GameState): GameState {
  const { story } = s;
  if (!s.party.roster.rin?.oath || story.seen.includes('bellkeeper-arrives') || story.queue.includes('bellkeeper-arrives')) return s;
  if (story.queue.includes('rin-confess')) return s;   // story depth plan ruling 4: the keeper is queued once the confession has played
  return { ...s, story: { ...story, seen: [...story.seen, 'bellkeeper-arrives'] } };
}

/** The handbook opened it: it is no longer new. */
export function markRead(s: GameState, id: SceneId): GameState {
  return { ...s, story: { ...s.story, fresh: s.story.fresh.filter((f) => f !== id) } };
}
