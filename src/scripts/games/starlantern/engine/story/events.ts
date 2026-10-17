import { CHARACTER_IDS } from '../../data/characters';
import { chainLength } from '../../data/story/chains';
import { ACT_DEPTHS, CHAT_COUNT, type ActNode, type SceneId, type Stage } from '../../data/story/scenes';
import { memoriesOf } from '../progression';
import type { GameState, StoryState } from '../state';

const ACT_NODES = Object.keys(ACT_DEPTHS) as ActNode[];

/** Where the story stands, from what the player has done (the handbook and the town lines follow it). */
export function storyStage(s: GameState): Stage {
  const { story } = s;
  if (story.finaleCleared) return 'after';
  if (story.nodes.includes('act4')) return 'act4';
  if (story.nodes.includes('act3')) return 'act3';
  if (story.nodes.includes('act2')) return 'act2';
  if (story.act1Cleared || s.dungeon.reached.mainline >= 2) return 'act1';
  return 'prologue';
}

/**
 * What a return to town adds to the queue: each act whose depth was reached, and Rin's reveal once she holds every piece.
 * Pure: it returns the new story block and leaves the state alone. Nobody else's fragment count matters (spec §2).
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
  return story;
}

/** Play order for the queue: Act 1's close, the acts, the hero's late memories by piece, then the rest as they came. */
const rank = (id: SceneId): number => {
  if (id === 'act1-after') return 0;
  if (id === 'act2') return 1;
  if (id === 'act3') return 2;
  if (id === 'act4') return 3;
  if (id.startsWith('mem:hero:')) return 4 + Number(id.slice('mem:hero:'.length)) / 1000;
  return 5;
};

/** The next chat for a return to town: whoever has said least among the people met, their next one in order. */
export function nextChat(s: GameState): SceneId | null {
  const seen = new Set<SceneId>(s.story.seen);
  let best: { id: SceneId; heard: number } | null = null;
  for (const who of CHARACTER_IDS) {
    if (!s.party.recruited.includes(who)) continue;
    let heard = 0;
    let next: SceneId | null = null;
    for (let n = 1; n <= CHAT_COUNT[who]; n++) {
      const id: SceneId = `chat:${who}:${n}`;
      if (seen.has(id)) { heard++; continue; }
      if (!next && (n === 1 || seen.has(`chat:${who}:${n - 1}`))) next = id;
    }
    if (next && (!best || heard < best.heard)) best = { id: next, heard };
  }
  return best?.id ?? null;
}

/**
 * The scenes this arrival in town should play, in order. Rin's reveal plays alone (the rest wait for the next return).
 * `chat` is true only for a return to town: a new game or a reload never adds a chat.
 */
export function arrivalScenes(s: GameState, o: { chat: boolean }): SceneId[] {
  if (s.story.queue.includes('rin-reveal')) return ['rin-reveal'];
  const list = [...s.story.queue].sort((a, b) => rank(a) - rank(b));
  const chat = o.chat ? nextChat(s) : null;
  return chat ? [...list, chat] : list;
}

/** A scene is over, played or skipped; `auto` is one the player's story setting never showed, so it also reads as new. */
export function sceneDone(s: GameState, id: SceneId, how: 'played' | 'skipped' | 'auto'): GameState {
  const story: StoryState = { ...s.story, queue: s.story.queue.filter((q) => q !== id), seen: [...s.story.seen], fresh: [...s.story.fresh] };
  if (!story.seen.includes(id)) story.seen.push(id);
  if (how === 'auto' && !story.fresh.includes(id)) story.fresh.push(id);
  if (id !== 'rin-reveal') return { ...s, story };
  // Her choice is made: the oath, and the reports that follow it (spec §5.3).
  const party = { ...s.party, roster: { ...s.party.roster, rin: { ...s.party.roster.rin, oath: true as const } } };
  return { ...s, story, party };
}

/** The handbook opened it: it is no longer new. */
export function markRead(s: GameState, id: SceneId): GameState {
  return { ...s, story: { ...s.story, fresh: s.story.fresh.filter((f) => f !== id) } };
}
