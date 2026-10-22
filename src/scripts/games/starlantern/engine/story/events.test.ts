import { describe, it, expect } from 'vitest';
import { ACT_DEPTHS, ALONE, BANTER_COUNT, BANTER_PAYOFFS, BANTER_GATE, BANTER_PAIRS, CHAT_GATE, CLOSING_PIECES, HEAVY_ARRIVAL, isHeavyArrival, type BanterPair, type SceneId } from '../../data/story/scenes';
import { chainLength } from '../../data/story/chains';
import { CHARACTER_IDS } from '../../data/characters';
import { meet } from '../party';
import { MEETINGS } from '../../data/meetings';
import { memoryPace } from './expect';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { arrivalScenes, banterOpen, chatOpen, gateExpired, gateOpen, markRead, nextBanter, nextChat, onReturn, openPairs, sceneDone, settleBellkeeper, settleOpening, storyStage, afterWin } from './events';

/** A new game with the prologue already behind it, so only what a test adds is waiting. */
const base = (): GameState => {
  const s = newGame();
  s.story.queue = [];
  s.story.seen = ['prologue'];
  return s;
};
const withMemories = (s: GameState, id: CharacterId, n: number): GameState => {
  if (!s.party.recruited.includes(id)) s.party = meet(s.party, id, 1);
  s.party.roster[id].memories = n;
  return s;
};
const returned = (s: GameState): GameState => ({ ...s, story: onReturn(s) });

describe('story triggers', () => {
  it('act nodes fire by depth alone', () => {
    const s = base();
    s.dungeon.reached.mainline = ACT_DEPTHS.act2;
    const first = returned(s);
    expect(first.story.queue).toEqual(['act2']);
    expect(first.story.nodes).toEqual(['act2']);
    first.dungeon.reached.mainline = ACT_DEPTHS.act3;
    const second = returned(first);
    expect(second.story.queue).toEqual(['act2', 'act3']);
    expect(second.story.nodes).toEqual(['act2', 'act3']);
    expect(returned(second).story.queue).toEqual(['act2', 'act3']);   // never a second time
  });

  it('a node that was already played is not queued again', () => {
    const s = base();
    s.dungeon.reached.mainline = ACT_DEPTHS.act2;
    s.story.nodes = ['act2'];
    s.story.seen.push('act2');
    expect(onReturn(s).queue).toEqual([]);
  });

  it('the queue plays in story order', () => {
    const s = base();
    s.story.queue = ['mem:hero:7', 'act3', 'act1-after'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['act1-after', 'act3', 'mem:hero:7']);
    s.story.queue = ['mem:hero:10', 'town:anna', 'act4', 'mem:hero:7', 'act2'];
    // story depth Task 3: one heavy major scene an arrival; act 4 waits in the queue for the next one
    expect(arrivalScenes(s, { chat: false })).toEqual(['act2', 'mem:hero:7', 'mem:hero:10', 'town:anna']);
  });

  it("Rin's reveal plays alone on the first return after her seventh piece", () => {
    const s = withMemories(base(), 'rin', chainLength('rin'));
    s.story.queue = ['act2'];
    const back = returned(s);
    expect(back.story.queue).toEqual(['act2', 'rin-reveal']);
    expect(arrivalScenes(back, { chat: true })).toEqual(['rin-reveal']);
    const done = sceneDone(back, 'rin-reveal', 'played');
    // story depth Task 3: her confession plays alone on the next return; the act that waited comes after it, and the
    // bellkeeper (continuity fix 4) once she has confessed, one heavy major scene an arrival
    expect(arrivalScenes(returned(done), { chat: false })).toEqual(['rin-confess']);
    const confessed = sceneDone(returned(done), 'rin-confess', 'played');
    expect(arrivalScenes(returned(confessed), { chat: false })).toEqual(['act2']);
    const acted = sceneDone(returned(confessed), 'act2', 'played');
    expect(arrivalScenes(returned(acted), { chat: false })).toEqual(['bellkeeper-arrives']);
  });

  it("her choice sends the bellkeeper to town on the arrival after her confession, once, played, skipped or auto", () => {
    for (const how of ['played', 'skipped', 'auto'] as const) {
      // story depth Task 3: her choice queues the confession; the confession queues the bellkeeper
      const chosen = sceneDone(returned(withMemories(base(), 'rin', chainLength('rin'))), 'rin-reveal', how);
      const done = sceneDone(returned(chosen), 'rin-confess', how);
      expect(done.story.queue, how).toEqual(['bellkeeper-arrives']);
      expect(arrivalScenes(done, { chat: false }), how).toEqual(['bellkeeper-arrives']);   // the reload or the next return
      const met = sceneDone(returned(done), 'bellkeeper-arrives', 'played');
      expect(returned(met).story.queue, how).toEqual([]);
      expect(sceneDone(met, 'rin-reveal', how).story.queue, how).toEqual([]);   // a replay from the handbook sends no one again
    }
    // he comes after the acts and before the hero's late memories; story depth Task 3: one heavy major scene an arrival,
    // so with act 4 waiting too he comes on the next one
    const s = base();
    s.story.queue = ['mem:hero:9', 'bellkeeper-arrives', 'act4'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['act4', 'mem:hero:9']);
    s.story.queue = ['mem:hero:9', 'bellkeeper-arrives'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['bellkeeper-arrives', 'mem:hero:9']);
  });

  it("an old save past her choice counts the bellkeeper's arrival as seen, not new; a save of this version is left alone", () => {
    const old = withMemories(base(), 'rin', chainLength('rin'));
    old.party.roster.rin.oath = true;
    old.story.seen.push('rin-reveal');
    const settled = settleBellkeeper(old);
    expect(settled.story.seen).toContain('bellkeeper-arrives');
    expect(settled.story.fresh).not.toContain('bellkeeper-arrives');
    expect(returned(settled).story.queue).toEqual([]);
    const before = withMemories(base(), 'rin', chainLength('rin'));
    expect(settleBellkeeper(before)).toBe(before);   // no choice yet
    const waiting = sceneDone(returned(withMemories(base(), 'rin', chainLength('rin'))), 'rin-reveal', 'played');
    expect(settleBellkeeper(waiting)).toBe(waiting);   // her confession queued (story depth Task 3): this version, untouched
    const confessed = sceneDone(waiting, 'rin-confess', 'played');
    expect(settleBellkeeper(confessed)).toBe(confessed);   // the bellkeeper queued: untouched
  });

  it('a homecoming waits for her last piece and plays once, behind the story and ahead of the chat', () => {
    const s = withMemories(base(), 'sylvie', chainLength('sylvie') - 1);
    s.story.seen.push('chat:hero:1');
    expect(onReturn(s).queue).toEqual([]);
    s.party.roster.sylvie.memories = chainLength('sylvie');
    s.story.queue = ['mem:sylvie:5', 'act3'];
    const back = returned(s);
    expect(back.story.queue).toEqual(['mem:sylvie:5', 'act3', 'home:sylvie']);
    const order = arrivalScenes(back, { chat: true });
    expect(order.slice(0, 3)).toEqual(['act3', 'mem:sylvie:5', 'home:sylvie']);
    expect(order[3]).toMatch(/^chat:/);
    expect(returned(back).story.queue.filter((x) => x === 'home:sylvie')).toHaveLength(1);   // waiting, not doubled
    expect(onReturn(sceneDone(back, 'home:sylvie', 'played')).queue).not.toContain('home:sylvie');
  });

  it('only the endings the town holds have a homecoming', () => {
    let s = base();
    for (const id of ['selene', 'noel', 'bobby', 'scarlet', 'chizuru', 'safira', 'liz'] as CharacterId[]) s = withMemories(s, id, chainLength(id));
    s = withMemories(s, 'hero', chainLength('hero'));
    expect(onReturn(s).queue).toEqual(['home:chizuru', 'home:safira', 'home:liz']);
  });

  it('the reveal is not queued twice, nor once it has been seen or her oath is sworn', () => {
    const s = withMemories(base(), 'rin', chainLength('rin'));
    const once = returned(s);
    expect(returned(once).story.queue.filter((x) => x === 'rin-reveal')).toHaveLength(1);
    expect(onReturn(sceneDone(once, 'rin-reveal', 'played')).queue).not.toContain('rin-reveal');
    const sworn = withMemories(base(), 'rin', chainLength('rin'));
    sworn.party.roster.rin.oath = true;
    expect(onReturn(sworn).queue).not.toContain('rin-reveal');
    expect(onReturn(withMemories(base(), 'rin', chainLength('rin') - 1)).queue).not.toContain('rin-reveal');
  });

  it('other pieces do not count toward the reveal', () => {
    const s = withMemories(withMemories(base(), 'hero', chainLength('hero')), 'noel', chainLength('noel'));
    expect(onReturn(s).queue).toEqual([]);
  });

  it('the reveal gives Rin her oath, played, skipped or auto', () => {
    for (const how of ['played', 'skipped', 'auto'] as const) {
      const s = returned(withMemories(base(), 'rin', chainLength('rin')));
      expect(s.party.roster.rin.oath, how).toBeUndefined();
      expect(sceneDone(s, 'rin-reveal', how).party.roster.rin.oath, how).toBe(true);
    }
  });

  it('skipping counts as seen; auto also marks it new', () => {
    const s = base();
    s.story.queue = ['act2', 'act3', 'act4'];
    const played = sceneDone(s, 'act2', 'played');
    expect(played.story).toMatchObject({ queue: ['act3', 'act4'], seen: ['prologue', 'act2'], fresh: [] });
    const skipped = sceneDone(played, 'act3', 'skipped');
    expect(skipped.story).toMatchObject({ queue: ['act4'], seen: ['prologue', 'act2', 'act3'], fresh: [] });
    const auto = sceneDone(skipped, 'act4', 'auto');
    expect(auto.story).toMatchObject({ queue: [], seen: ['prologue', 'act2', 'act3', 'act4'], fresh: ['act4'] });
    expect(markRead(auto, 'act4').story.fresh).toEqual([]);
  });

  it('a scene is never recorded twice', () => {
    const s = base();
    s.story.queue = ['act2'];
    const once = sceneDone(sceneDone(s, 'act2', 'auto'), 'act2', 'auto');
    expect(once.story.seen.filter((x) => x === 'act2')).toHaveLength(1);
    expect(once.story.fresh.filter((x) => x === 'act2')).toHaveLength(1);
  });

  it('one chat per return, from whoever has said least, met only', () => {
    const s = base();
    s.party = meet(s.party, 'rin', 1);
    // Hero and Rin are met; neither has said anything, so the hero (first in order) speaks.
    expect(nextChat(s, {})).toBe('chat:hero:1');
    s.story.seen.push('chat:hero:1');
    expect(nextChat(s, {})).toBe('chat:rin:1');
    s.story.seen.push('chat:rin:1');
    expect(nextChat(s, {})).toBe('chat:hero:2');   // tied at one each, so CHARACTER_IDS breaks it
    s.party = meet(s.party, 'noel', 1);
    expect(nextChat(s, {})).toBe('chat:noel:1');   // nobody has heard from her yet
    // B1: Noel and Rin are both met, so their banter follows the one chat.
    expect(arrivalScenes(s, { chat: true })).toEqual(['chat:noel:1', 'banter:noel-rin:1']);
  });

  it('a chat waits for the one before it, and a spent character offers none', () => {
    const s = base();
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:hero:5', 'chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4');
    expect(nextChat(s, {})).toBeNull();
    const t = base();
    t.story.seen.push('chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4', 'chat:hero:2');   // the second was seen without the first: the first is the one offered
    expect(nextChat(t, {})).toBe('chat:hero:1');
  });

  it('no chat without a return', () => {
    const s = base();
    s.party = meet(s.party, 'rin', 1);
    expect(arrivalScenes(s, { chat: false }).some((x) => x.startsWith('chat:'))).toBe(false);
    expect(arrivalScenes(s, { chat: true }).some((x) => x.startsWith('chat:'))).toBe(true);
  });

  it('the chat comes after the queue', () => {
    const s = base();
    s.story.queue = ['act2'];
    expect(arrivalScenes(s, { chat: true })).toEqual(['act2', 'chat:hero:1']);
  });

  it('the stage follows the acts', () => {
    const s = base();
    expect(storyStage(s)).toBe('prologue');
    s.dungeon.reached.mainline = 2;
    expect(storyStage(s)).toBe('act1');
    s.dungeon.reached.mainline = 1;
    s.story.act1Cleared = true;
    expect(storyStage(s)).toBe('act1');
    s.story.nodes = ['act2'];
    expect(storyStage(s)).toBe('act2');
    s.story.nodes = ['act2', 'act3'];
    expect(storyStage(s)).toBe('act3');
    s.story.nodes = ['act2', 'act3', 'act4'];
    expect(storyStage(s)).toBe('act4');
    s.story.finaleCleared = true;
    expect(storyStage(s)).toBe('after');
  });

  it('the story is a pure function of the state', () => {
    const s = withMemories(base(), 'rin', chainLength('rin'));
    s.dungeon.reached.mainline = ACT_DEPTHS.act3;
    s.story.queue = ['mem:hero:7'];
    const before = JSON.stringify(s);
    expect(onReturn(s)).toEqual(onReturn(s));
    expect(arrivalScenes(s, { chat: true })).toEqual(arrivalScenes(s, { chat: true }));
    sceneDone(s, 'mem:hero:7', 'played');
    markRead(s, 'act2');
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('chat gates', () => {
  const met = (): GameState => { const s = base(); s.party = meet(s.party, 'rin', 1); return s; };
  const rinSeen = (s: GameState, n: number) => { for (let i = 1; i <= n; i++) s.story.seen.push(`chat:rin:${i}`); };

  it('a gated chat waits and the others still talk', () => {
    const s = met();
    rinSeen(s, 1);
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:hero:5');
    const gates = { 'chat:rin:2': { stage: 'act3' as const } };
    s.dungeon.reached.mainline = 2;   // act1
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(false);
    expect(nextChat(s, gates)).toBeNull();   // hero spent; Rin waits, and her later chats wait with her
    rinSeen(s, 1);
    s.party = meet(s.party, 'noel', 1);
    expect(nextChat(s, gates)).toBe('chat:noel:1');   // someone else still talks
    s.story.nodes = ['act2', 'act3'];
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(true);
    s.story.seen.push('chat:noel:1');
    expect(nextChat(s, gates)).toBe('chat:rin:2');
  });

  it('an oath-gated chat waits for her choice', () => {
    const s = met();
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:hero:5');
    rinSeen(s, 1);
    const gates = { 'chat:rin:2': { oath: true as const } };
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(false);
    expect(nextChat(s, gates)).toBeNull();
    s.party.roster.rin.oath = true;
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(true);
    expect(nextChat(s, gates)).toBe('chat:rin:2');
  });

  it('a stage and an oath gate both have to hold', () => {
    const s = met();
    const gates = { 'chat:rin:2': { stage: 'act2' as const, oath: true as const } };
    s.party.roster.rin.oath = true;
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(false);   // stage not reached
    s.story.nodes = ['act2'];
    expect(chatOpen(s, 'chat:rin:2', gates)).toBe(true);
  });

  it('no gate, no change', () => {
    const s = base();
    s.party = meet(s.party, 'rin', 1);
    expect(chatOpen(s, 'chat:rin:1', {})).toBe(true);
    expect(nextChat(s, {})).toBe('chat:hero:1');
    s.story.seen.push('chat:hero:1');
    expect(nextChat(s, {})).toBe('chat:rin:1');
  });

  it("Lorne's and Rin's last chats stay open after the finale: late, they are heard, never lost (continuity fix 12)", () => {
    const s = met();
    s.party.roster.rin.oath = true;
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.story.finaleCleared = true;
    expect(chatOpen(s, 'chat:hero:4')).toBe(true);
    expect(chatOpen(s, 'chat:rin:4')).toBe(true);
  });

  it('no first chat is gated', () => {
    expect(Object.keys(CHAT_GATE).filter((id) => id.endsWith(':1'))).toEqual([]);
  });
});

// Story depth Task 3: the confession, the keeper, the lone morning and the festival; one heavy scene an arrival.
describe('story depth: when the scenes play (Task 3)', () => {
  const meetAll = (s: GameState, ids: CharacterId[]): GameState => { for (const id of ids) s.party = meet(s.party, id, 1); return s; };
  const rinWhole = (): GameState => withMemories(base(), 'rin', chainLength('rin'));

  it('her choice queues the confession; the confession queues the keeper', () => {
    for (const how of ['played', 'skipped', 'auto'] as const) {
      const chosen = sceneDone(returned(rinWhole()), 'rin-reveal', how);
      expect(chosen.party.roster.rin.oath, how).toBe(true);
      expect(chosen.story.queue, how).toEqual(['rin-confess']);
      const confessed = sceneDone(chosen, 'rin-confess', how);
      expect(confessed.story.queue, how).toEqual(['bellkeeper-arrives']);
      const met = sceneDone(confessed, 'bellkeeper-arrives', how);
      expect(met.story.queue, how).toEqual([]);
      // a replay from the handbook queues nothing again
      expect(sceneDone(met, 'rin-reveal', how).story.queue, how).toEqual([]);
      expect(sceneDone(met, 'rin-confess', how).story.queue, how).toEqual([]);
    }
  });

  it('the confession plays alone at its arrival, and the chat and banter wait', () => {
    const s = meetAll(rinWhole(), ['sylvie', 'noel']);
    s.party.roster.rin.oath = true;
    s.story.seen.push('rin-reveal');
    s.story.queue = ['rin-confess', 'home:sylvie'];
    expect(arrivalScenes(s, { chat: true })).toEqual(['rin-confess']);
    expect(arrivalScenes(s, { chat: false })).toEqual(['rin-confess']);
    s.story.queue = ['rin-reveal', 'rin-confess'];   // the reveal first, if both ever wait
    expect(arrivalScenes(s, { chat: true })).toEqual(['rin-reveal']);
  });

  it('one heavy major scene an arrival; the rest wait in the queue', () => {
    const s = base();
    s.story.seen.push('act2');
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.story.queue = ['act3', 'act4', 'home:sylvie'];
    const list = arrivalScenes(s, { chat: true });
    expect(list.slice(0, 2)).toEqual(['act3', 'home:sylvie']);
    expect(list).not.toContain('act4');
    expect(list.length).toBe(3);
    expect(list[2].startsWith('chat:')).toBe(true);   // the chat, and no banter after a heavy arrival
    expect(s.story.queue).toContain('act4');
    expect(arrivalScenes(s, { chat: false })).toEqual(['act3', 'home:sylvie']);
    // the keeper and the festival count too
    s.story.queue = ['bellkeeper-arrives', 'act4'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['act4']);
    s.story.queue = ['epilogue', 'home:liz'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['epilogue', 'home:liz']);
  });

  it('a heavy arrival gives the chat slot to a light chat', () => {
    const s = meetAll(base(), ['sylvie']);
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:rin:1', 'chat:sylvie:1', 'act2', 'act3');
    s.story.nodes = ['act2', 'act3', 'act4'];
    expect(nextChat(s)).toBe('chat:rin:2');   // tied at one each: Rin first, and her chat is heavy
    s.story.queue = ['act4'];
    expect(arrivalScenes(s, { chat: true })).toEqual(['act4', 'chat:sylvie:2']);
    expect(nextChat(s, CHAT_GATE, true)).toBe('chat:sylvie:2');
    s.story.seen.push('chat:sylvie:2');   // no light chat left: the heavy one after all
    expect(arrivalScenes(s, { chat: true })).toEqual(['act4', 'chat:rin:2']);
  });

  it('the lone morning is queued after the ninth piece, never played on arrival', () => {
    const s = rinWhole();
    s.party.roster.rin.oath = true;
    s.story.seen.push('rin-reveal', 'rin-confess', 'bellkeeper-arrives');
    s.story.queue = ['mem:hero:9'];
    const back = returned(s);
    expect(back.story.queue).toContain('hero-alone');
    expect(arrivalScenes(back, { chat: false })).toEqual(['mem:hero:9']);
    expect(arrivalScenes(back, { chat: true })).not.toContain('hero-alone');
    expect(returned(back).story.queue.filter((id) => id === 'hero-alone')).toHaveLength(1);   // once
    // the ninth piece already seen: queued all the same
    const seen9 = rinWhole();
    seen9.party.roster.rin.oath = true;
    seen9.story.seen.push('mem:hero:9');
    expect(returned(seen9).story.queue).toContain('hero-alone');
    // seen already, before her choice, no ninth piece, or past the finale: not queued
    const done = rinWhole();
    done.party.roster.rin.oath = true;
    done.story.seen.push('mem:hero:9', 'hero-alone');
    expect(returned(done).story.queue).not.toContain('hero-alone');
    const noOath = rinWhole();
    noOath.story.seen.push('mem:hero:9');
    expect(returned(noOath).story.queue).not.toContain('hero-alone');
    const no9 = rinWhole();
    no9.party.roster.rin.oath = true;
    expect(returned(no9).story.queue).not.toContain('hero-alone');
    const after = rinWhole();
    after.party.roster.rin.oath = true;
    after.story.seen.push('mem:hero:9');
    after.story.finaleCleared = true;
    expect(returned(after).story.queue).not.toContain('hero-alone');
  });

  it('an act waiting in the queue does not move the stage', () => {
    const s = base();
    s.dungeon.reached.mainline = ACT_DEPTHS.act4;
    s.story.seen.push('act2', 'chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4');
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.story.queue = ['act3', 'act4'];
    expect(storyStage(s)).toBe('act2');
    expect(nextChat(s)).toBeNull();   // chat:hero:4 waits for act 4 to play
    const three = sceneDone(s, 'act3', 'played');
    expect(storyStage(three)).toBe('act3');
    expect(nextChat(three)).toBeNull();
    const four = sceneDone(three, 'act4', 'played');
    expect(storyStage(four)).toBe('act4');
    expect(nextChat(four)).toBe('chat:hero:4');
    // an old save with the nodes and no queue counts as before
    const old = base();
    old.story.nodes = ['act2', 'act3', 'act4'];
    expect(storyStage(old)).toBe('act4');
  });

  it('the festival is the first scene after the finale', () => {
    const s = withMemories(base(), 'liz', chainLength('liz'));
    s.story.finaleCleared = true;
    const back = returned(s);
    expect(back.story.queue).toContain('epilogue');
    expect(arrivalScenes(back, { chat: false })[0]).toBe('epilogue');
    expect(arrivalScenes(back, { chat: false })).toContain('home:liz');
    expect(returned(back).story.queue.filter((id) => id === 'epilogue')).toHaveLength(1);
    const seen = sceneDone(back, 'epilogue', 'played');
    expect(returned(seen).story.queue).not.toContain('epilogue');
    expect(returned(base()).story.queue).not.toContain('epilogue');   // not before the finale
  });
});

// Task 10b: the inn night after the prologue, and the first return after a won fight (lore ledger I-81 to I-86).
describe('the opening: the inn night and the first return', () => {
  /** What a won fight leaves behind: someone in the party has earned exp. */
  const fought = (s: GameState): GameState => { s.party.roster.rin.exp = 1; return s; };

  it('a new game waits on the prologue and then the inn night, in that order, before the town', () => {
    const s = newGame();
    expect(s.story.queue).toEqual(['prologue', 'prologue-inn']);
    expect(arrivalScenes(s, { chat: false })).toEqual(['prologue', 'prologue-inn']);
    s.story.queue = ['prologue-inn', 'prologue'];   // a queue out of order still plays the prologue first
    expect(arrivalScenes(s, { chat: false })).toEqual(['prologue', 'prologue-inn']);
    const done = sceneDone(sceneDone(s, 'prologue', 'played'), 'prologue-inn', 'skipped');
    expect(done.story.queue).toEqual([]);
    expect(done.story.seen).toEqual(['prologue', 'prologue-inn']);
    expect(arrivalScenes(done, { chat: false })).toEqual([]);
  });

  /** A won fight with Rin in it, then home. */
  const wonWithRin = (s: GameState): GameState => ({ ...s, story: afterWin(s.story, ['hero', 'rin']) });

  it('the first fight Rin wins in queues the first-return scene, once; a return alone queues nothing', () => {
    const s = base();
    s.story.seen.push('prologue-inn');
    expect(onReturn(fought(s)).queue).toEqual([]);   // home, even after a win: the return itself queues nothing
    expect(afterWin(s.story, ['hero']).queue).toEqual([]);   // Rin out of the formation: she pulled no one out
    expect(afterWin(s.story, ['hero'])).toBe(s.story);
    const back = returned(wonWithRin(s));
    expect(back.story.queue).toEqual(['first-return']);
    expect(afterWin(back.story, ['hero', 'rin']).queue).toEqual(['first-return']);   // waiting, not doubled
    const done = sceneDone(back, 'first-return', 'played');
    expect(afterWin(done.story, ['rin']).queue).toEqual([]);   // never again
    expect(afterWin(sceneDone(back, 'first-return', 'skipped').story, ['rin']).queue).toEqual([]);
  });

  it('the first return plays before the acts, and the chat still comes after it', () => {
    const s = fought(base());
    s.story.seen.push('prologue-inn');
    s.dungeon.reached.mainline = ACT_DEPTHS.act2;
    s.story.queue = ['act1-after'];
    const back = returned(wonWithRin(s));
    expect(arrivalScenes(back, { chat: false })).toEqual(['first-return', 'act1-after', 'act2']);
    const withChat = arrivalScenes(back, { chat: true });
    expect(withChat.slice(0, 3)).toEqual(['first-return', 'act1-after', 'act2']);
    expect(withChat[3]).toMatch(/^chat:/);
    expect(withChat).toHaveLength(4);
  });

  it("Rin's reveal still plays alone, and the first return waits for the next arrival", () => {
    const s = withMemories(fought(base()), 'rin', chainLength('rin'));
    s.story.seen.push('prologue-inn');
    const back = returned(wonWithRin(s));
    expect(back.story.queue).toEqual(['first-return', 'rin-reveal']);
    expect(arrivalScenes(back, { chat: true })).toEqual(['rin-reveal']);
  });

  it('an old save already past the prologue counts the inn night as seen, not new', () => {
    const s = base();   // seen: the prologue; nothing waits (a save from before the inn night existed)
    const settled = settleOpening(s);
    expect(settled.story.seen).toEqual(['prologue', 'prologue-inn']);
    expect(settled.story.fresh).toEqual([]);
    expect(arrivalScenes(settled, { chat: false })).toEqual([]);
  });

  it('an old save still before its prologue gets the inn night after it', () => {
    const s = newGame();
    s.story.queue = ['prologue'];   // the old new game
    const settled = settleOpening(s);
    expect(settled.story.queue).toEqual(['prologue', 'prologue-inn']);
    expect(settled.story.seen).toEqual([]);
  });

  it('an old save that has already won a fight counts the first return as seen', () => {
    const s = fought(base());
    const settled = settleOpening(s);
    expect(settled.story.seen).toContain('first-return');
    expect(settled.story.fresh).not.toContain('first-return');
    expect(returned(settled).story.queue).toEqual([]);
    const lv = base();
    lv.party.roster.hero.level = 2;   // a level is a won fight too, whatever the exp now reads
    expect(settleOpening(lv).story.seen).toContain('first-return');
  });

  it('a save from this version is left as it is', () => {
    const fresh = newGame();
    expect(settleOpening(fresh)).toEqual(fresh);
    const mid = sceneDone(newGame(), 'prologue', 'played');   // the inn night still waits
    expect(settleOpening(mid)).toEqual(mid);
    const queued = returned(wonWithRin(fought(sceneDone(sceneDone(newGame(), 'prologue', 'played'), 'prologue-inn', 'played'))));
    expect(queued.story.queue).toEqual(['first-return']);
    expect(settleOpening(queued)).toEqual(queued);
    const unfought = sceneDone(sceneDone(newGame(), 'prologue', 'played'), 'prologue-inn', 'played');
    expect(settleOpening(unfought)).toEqual(unfought);
    // Levels without a return (a debug hand, or anything else) never make a save of this version look old.
    const leveled = sceneDone(sceneDone(newGame(), 'prologue', 'played'), 'prologue-inn', 'played');
    leveled.party.roster.hero.level = 10;
    expect(settleOpening(leveled)).toBe(leveled);
  });

  it('an old save without a prologue at all (a state written by hand) still gets the inn night as seen', () => {
    const s = newGame();
    s.story.queue = [];
    expect(settleOpening(s).story.seen).toEqual(['prologue-inn']);
  });
});

// B1: town banter. Two companions talk among themselves on a return, while Lorne listens (voice-pass sample §6).
describe('town banter', () => {
  const meetAll = (s: GameState, ids: CharacterId[]): GameState => { for (const id of ids) s.party = meet(s.party, id, 1); return s; };
  const allChatsSeen = (s: GameState): GameState => {
    for (const c of ['hero', 'rin', 'noel', 'safira', 'sylvie', 'liz', 'scarlet', 'chizuru', 'selene', 'bobby'] as CharacterId[]) {
      for (let n = 1; n <= 4; n++) if (!s.story.seen.includes(`chat:${c}:${n}` as SceneId)) s.story.seen.push(`chat:${c}:${n}` as SceneId);
    }
    return s;
  };

  it('the pairs are sorted and never the hero; the three sample banters keep their ids and stay ungated (B2 adds the rest)', () => {
    // the shipped pairs, in their fixed tie-break order (B2): ids are frozen once shipped, so this list only ever grows
    expect(BANTER_PAIRS).toEqual([
      'bobby-chizuru', 'bobby-liz', 'bobby-noel', 'bobby-sylvie', 'chizuru-noel', 'chizuru-rin', 'chizuru-safira', 'chizuru-scarlet', 'liz-noel',
      'liz-scarlet', 'liz-selene', 'noel-rin', 'noel-selene', 'rin-scarlet', 'rin-selene', 'rin-sylvie', 'safira-scarlet', 'safira-sylvie',
      'scarlet-selene', 'selene-sylvie',
    ]);   // story depth Task 4: chizuru-noel and rin-selene
    for (const p of BANTER_PAIRS) {
      const [a, b] = p.split('-');
      expect(a < b, p).toBe(true);
      expect(a).not.toBe('hero');
      expect(b).not.toBe('hero');
    }
    // B2: gates are only on banters that exist, never on a sample, and a full gate names one of the two
    for (const f of ['banter:liz-scarlet:1', 'banter:noel-rin:1', 'banter:safira-sylvie:1'] as SceneId[]) expect(BANTER_GATE[f], f).toBeUndefined();
    for (const [id, g] of Object.entries(BANTER_GATE)) {
      const [, pair, n] = id.split(':');
      expect(Number(n), id).toBeLessThanOrEqual(BANTER_COUNT[pair as BanterPair] ?? 0);
      if (g?.full) expect(pair.split('-'), id).toContain(g.full);
    }
  });

  it('a banter waits until both of its two are met', () => {
    const s = base();
    expect(nextBanter(s)).toBeNull();   // Lorne and Rin only: Lorne listens, he is never half of a pair
    expect(banterOpen(s, 'banter:noel-rin:1')).toBe(false);
    meetAll(s, ['safira']);
    expect(banterOpen(s, 'banter:safira-sylvie:1')).toBe(false);
    expect(nextBanter(s)).toBeNull();
    meetAll(s, ['sylvie']);
    expect(banterOpen(s, 'banter:safira-sylvie:1')).toBe(true);
    expect(nextBanter(s)).toBe('banter:safira-sylvie:1');
  });

  it('a gate holds a banter back, as CHAT_GATE does: stage, oath, a full memory', () => {
    const s = meetAll(base(), ['noel']);
    const id: SceneId = 'banter:noel-rin:1';
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(false);
    expect(nextBanter(s, { [id]: { stage: 'act2' } })).toBeNull();
    s.story.nodes = ['act2'];
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { oath: true } })).toBe(false);
    s.party.roster.rin.oath = true;
    expect(banterOpen(s, id, { [id]: { stage: 'act2', oath: true } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { full: 'noel' } })).toBe(false);
    s.party.roster.noel.memories = chainLength('noel');
    expect(banterOpen(s, id, { [id]: { full: 'noel' } })).toBe(true);
    // no gate opens a banter whose two are not both met
    expect(banterOpen(base(), id, {})).toBe(false);
  });

  it('the seventh night opens after the confession, with Scarlet met (story depth Task 4)', () => {
    const id: SceneId = 'banter:rin-scarlet:2';
    const s = base();
    expect(banterOpen(s, id)).toBe(false);   // Scarlet not met
    meetAll(s, ['scarlet']);
    s.party.roster.rin.oath = true;
    s.story.seen.push('rin-reveal');
    expect(banterOpen(s, id)).toBe(false);   // her choice made, the confession not heard yet
    s.story.seen.push('rin-confess');
    expect(banterOpen(s, id)).toBe(false);   // Task 15 review: told where? the seventh night needs the dinner
    s.story.confession = 'dinner';
    expect(banterOpen(s, id)).toBe(true);
    s.party.roster.rin.oath = undefined;   // a save without her oath (by hand): the gate still asks for it
    expect(banterOpen(s, id)).toBe(false);
  });

  it('a gate opens on each of its kinds (story depth)', () => {
    const s = meetAll(base(), ['noel', 'bobby', 'chizuru']);
    const id: SceneId = 'banter:noel-rin:1';
    const chat: SceneId = 'chat:noel:2';
    // before her choice: open until she makes it, closed after
    expect(banterOpen(s, id, { [id]: { beforeChoice: true } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { beforeChoice: true } })).toBe(true);
    // pieces: each named one holds at least that many
    expect(banterOpen(s, id, { [id]: { pieces: { noel: 1 } } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { pieces: { noel: 1 } } })).toBe(false);
    s.party.roster.noel.memories = 1;
    expect(banterOpen(s, id, { [id]: { pieces: { noel: 1 } } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { pieces: { noel: 1 } } })).toBe(true);
    s.party.roster.bobby.memories = 3;
    expect(banterOpen(s, id, { [id]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(false);   // only one of the two at three
    expect(chatOpen(s, chat, { [chat]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(false);
    s.party.roster.chizuru.memories = 3;
    expect(banterOpen(s, id, { [id]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(true);
    // seen: every named scene already seen
    expect(banterOpen(s, id, { [id]: { seen: ['rin-reveal'] } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { seen: ['rin-reveal'] } })).toBe(false);
    s.story.seen.push('rin-reveal');
    expect(banterOpen(s, id, { [id]: { seen: ['rin-reveal'] } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { seen: ['rin-reveal'] } })).toBe(true);
    // the kinds there were before: stage, oath, full
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { stage: 'act2' } })).toBe(false);
    s.story.nodes = ['act2'];
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { stage: 'act2' } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { full: 'noel' } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { full: 'noel' } })).toBe(false);
    s.party.roster.noel.memories = chainLength('noel');
    expect(banterOpen(s, id, { [id]: { full: 'noel' } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { full: 'noel' } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { oath: true } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { oath: true } })).toBe(false);
    s.party.roster.rin.oath = true;
    expect(banterOpen(s, id, { [id]: { oath: true } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { oath: true } })).toBe(true);
    // her choice made: a before-choice gate is closed for good, and expired
    expect(banterOpen(s, id, { [id]: { beforeChoice: true } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { beforeChoice: true } })).toBe(false);
    expect(gateExpired(s, { beforeChoice: true })).toBe(true);
    expect(gateExpired(s, { oath: true })).toBe(false);
    expect(gateExpired(s, undefined)).toBe(false);
    expect(gateOpen(s, undefined)).toBe(true);
  });

  it('the banters come after the chat, behind every light story scene a return can bring', () => {
    const s = meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']);
    s.party.roster.safira.memories = chainLength('safira');
    // fix round 3: a middle memory piece is light; only the closing pieces are heavy
    s.story.queue = ['home:safira', 'town:orik', 'mem:noel:2', 'first-return', 'act1-after', 'mem:hero:7', 'prologue-inn'];
    const order = arrivalScenes(s, { chat: true });
    const story = ['prologue-inn', 'first-return', 'act1-after', 'mem:hero:7', 'town:orik', 'mem:noel:2', 'home:safira'];
    expect(order.slice(0, 7)).toEqual(story);
    expect(order[7]).toMatch(/^chat:/);
    // story depth Task 6 review: something owed in the queue, so one banter, last (two only with nothing queued)
    expect(order[8]).toMatch(/^banter:/);
    expect(order).toHaveLength(9);
    expect(order.filter((id) => id.startsWith('banter:'))).toHaveLength(1);
    // with no chat due, the banter still comes last
    allChatsSeen(s);
    const quiet = arrivalScenes(s, { chat: true });
    expect(quiet.slice(0, 7)).toEqual(story);
    expect(quiet[7]).toMatch(/^banter:/);
    expect(quiet).toHaveLength(8);
  });

  it('no light banter after a heavy arrival: an act, the bellkeeper, a closing memory piece, her reveal or the finale return; it waits for the next return', () => {
    expect([...HEAVY_ARRIVAL]).toEqual(expect.arrayContaining(['rin-reveal', 'bellkeeper-arrives', 'act2', 'act3', 'act4', ...CLOSING_PIECES, 'romance:', 'epilogue']));
    expect(HEAVY_ARRIVAL).not.toContain('mem:');
    expect(HEAVY_ARRIVAL).not.toContain('ending:');   // final review ruling: a 後日談 is a happy after-story, light like home:*
    const s = meetAll(base(), ['noel']);
    s.story.seen.push('prologue-inn', 'rin-reveal');
    s.party.roster.rin.oath = true;
    for (const heavy of ['act2', 'act3', 'act4', 'bellkeeper-arrives', 'mem:hero:9', 'mem:hero:10', 'mem:rin:6', 'mem:rin:7', `mem:noel:${chainLength('noel')}`] as SceneId[]) {
      s.story.queue = ['first-return', heavy, 'town:orik', 'home:safira'];
      const order = arrivalScenes(s, { chat: true });
      expect(order.slice(0, 4), heavy).toEqual(['first-return', heavy, 'town:orik', 'home:safira']);   // already in rank order
      expect(order[4], heavy).toMatch(/^chat:/);   // the chat still comes
      expect(order.some((id) => id.startsWith('banter:')), heavy).toBe(false);
    }
    // the finale return: the arrival right after the ending
    s.story.queue = [];
    expect(arrivalScenes(s, { chat: true, afterFinale: true }).some((id) => id.startsWith('banter:'))).toBe(false);
    // not lost: the next return with nothing heavy brings it
    expect(arrivalScenes(s, { chat: true }).at(-1)).toBe('banter:noel-rin:1');
    // the predicate: exact ids, and the prefixes 6d's scenes will use
    for (const id of ['rin-reveal', 'bellkeeper-arrives', 'act3', 'mem:noel:5', 'mem:hero:9', 'mem:rin:6', 'epilogue', 'romance:rin', 'romance:liz']) expect(isHeavyArrival(id), id).toBe(true);
    // her homecoming stays light (her happy ending, the warm line last), and so do the middle pieces
    for (const id of ['mem:noel:4', 'mem:hero:8', 'mem:rin:5', 'mem:rin:1', 'mem:hero:1']) expect(isHeavyArrival(id), id).toBe(false);
    for (const id of ['first-return', 'act1-after', 'prologue-inn', 'home:safira', 'home:liz', 'town:orik', 'chat:noel:1', 'banter:noel-rin:1', 'ending:noel', 'ending:rin']) expect(isHeavyArrival(id), id).toBe(false);
  });

  it('the heavy check reads the chat slot too: a heavy scene there drops the banter, a light one keeps it (final review H1)', () => {
    const s = meetAll(base(), ['noel']);
    // today the slot holds a chat, which is light: the default is unchanged
    expect(arrivalScenes(s, { chat: true })).toEqual([nextChat(s)!, 'banter:noel-rin:1']);
    // 6d puts its own scenes in the slot (nextEnding ?? nextChat): a heavy one there is heavy for the whole arrival
    const heavy = 'romance:noel' as SceneId;
    expect(arrivalScenes(s, { chat: true, slot: () => heavy })).toEqual([heavy]);
    expect(arrivalScenes(s, { chat: true, slot: () => 'act3' })).toEqual(['act3']);
    // a light one keeps the banter after it; an empty slot still lets the banter play
    expect(arrivalScenes(s, { chat: true, slot: () => 'ending:noel' as SceneId })).toEqual(['ending:noel', 'banter:noel-rin:1']);
    expect(arrivalScenes(s, { chat: true, slot: () => null })).toEqual(['banter:noel-rin:1']);
    // no slot without a return
    expect(arrivalScenes(s, { chat: false, slot: () => heavy })).toEqual([]);
  });

  it('no banter without a return, and none beside her reveal', () => {
    const s = meetAll(base(), ['noel']);
    expect(arrivalScenes(s, { chat: false })).toEqual([]);   // a new game or a reload
    expect(arrivalScenes(s, { chat: true })).toContain('banter:noel-rin:1');
    s.party.roster.rin.memories = chainLength('rin');
    expect(arrivalScenes(returned(s), { chat: true })).toEqual(['rin-reveal']);
  });

  it('the closing pieces are derived from the chain lengths: every last piece, and the last two of Lorne and Rin (fix round 3)', () => {
    const want = CHARACTER_IDS.flatMap((id) => {
      const n = chainLength(id);
      return (id === 'hero' || id === 'rin' ? [n - 1, n] : [n]).map((k) => `mem:${id}:${k}`);
    });
    expect([...CLOSING_PIECES].sort()).toEqual(want.sort());
    expect(CLOSING_PIECES).toEqual(expect.arrayContaining(['mem:hero:9', 'mem:hero:10', 'mem:rin:6', 'mem:rin:7', 'mem:safira:5']));
    expect(CLOSING_PIECES).toHaveLength(CHARACTER_IDS.length + 2);
  });

  it('banters never enter the saved queue: onReturn queues none', () => {
    const s = meetAll(base(), ['noel', 'liz', 'scarlet']);
    expect(returned(s).story.queue.filter((id) => id.startsWith('banter:'))).toEqual([]);
  });

  it('least-heard pair first, then the fixed order; no banter twice until every unlocked one has played', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'noel-rin': 3, 'safira-sylvie': 2 };
    const s = allChatsSeen(meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']));
    const played: SceneId[] = [];
    for (let i = 0; i < 10; i++) {
      const id = nextBanter(s, {}, count);
      if (!id) break;
      expect(played, id).not.toContain(id);
      played.push(id);
      s.story.seen.push(id);
    }
    // story depth Task 6 (ruling 9, and the review's tie-break): a pair already started finishes first; among pairs not
    // started and heard alike, the one with more banters left
    expect(played).toEqual([
      'banter:noel-rin:1', 'banter:noel-rin:2', 'banter:noel-rin:3',
      'banter:safira-sylvie:1', 'banter:safira-sylvie:2', 'banter:liz-scarlet:1',
    ]);
    expect(nextBanter(s, {}, count)).toBeNull();   // all played: none repeats on a return (the handbook replays them)
  });

  it('a pair met late catches up before the others talk again', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 2, 'noel-rin': 2 };
    const s = meetAll(base(), ['noel']);
    s.story.seen.push('banter:noel-rin:1');
    meetAll(s, ['liz', 'scarlet']);
    // story depth Task 6 (ruling 9): the pair already started finishes first, then the late pair catches up
    expect(nextBanter(s, {}, count)).toBe('banter:noel-rin:2');
    s.story.seen.push('banter:noel-rin:2');
    expect(nextBanter(s, {}, count)).toBe('banter:liz-scarlet:1');
  });

  it('a gated banter waits, the ones after it in that pair wait too, and the other pairs still talk', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'noel-rin': 2 };
    const s = meetAll(base(), ['noel', 'liz', 'scarlet']);
    const gates = { 'banter:noel-rin:1': { stage: 'act3' as const } };
    expect(nextBanter(s, gates, count)).toBe('banter:liz-scarlet:1');
    s.story.seen.push('banter:liz-scarlet:1');
    expect(nextBanter(s, gates, count)).toBeNull();   // noel-rin:2 waits behind its gated first
    s.story.nodes = ['act2', 'act3'];
    expect(nextBanter(s, gates, count)).toBe('banter:noel-rin:1');
  });

  it('an expired banter neither plays nor holds back the next of its pair', () => {
    const count: Partial<Record<BanterPair, number>> = { 'rin-sylvie': 2 };
    const gates = { 'banter:rin-sylvie:1': { beforeChoice: true as const }, 'banter:rin-sylvie:2': { oath: true as const } };
    const s = meetAll(base(), ['sylvie']);
    expect(nextBanter(s, gates, count)).toBe('banter:rin-sylvie:1');   // before her choice
    s.party.roster.rin.oath = true;   // her choice made, :1 never heard
    expect(nextBanter(s, gates, count)).toBe('banter:rin-sylvie:2');
    expect(s.story.seen).not.toContain('banter:rin-sylvie:1');
    s.story.seen.push('banter:rin-sylvie:2');
    expect(nextBanter(s, gates, count)).toBeNull();   // the expired one is never offered
  });

  it('an expired banter counts toward its pair\'s heard: the other pair goes first (story depth Task 1 review)', () => {
    const count: Partial<Record<BanterPair, number>> = { 'noel-rin': 2, 'rin-sylvie': 2 };
    const gates = { 'banter:noel-rin:1': { beforeChoice: true as const } };
    const s = meetAll(base(), ['noel', 'sylvie']);
    expect(nextBanter(s, gates, count)).toBe('banter:noel-rin:1');   // both heard none: the fixed order
    s.party.roster.rin.oath = true;   // noel-rin:1 expired, never heard: it counts as heard
    expect(nextBanter(s, gates, count)).toBe('banter:rin-sylvie:1');
    s.story.seen.push('banter:rin-sylvie:1');
    // story depth Task 6 (ruling 9): rin-sylvie has started, noel-rin has not (its expired one starts nothing); neither pair
    // leads to a designed payoff (third ruling), so the payoff rule does not enter
    expect(nextBanter(s, gates, count)).toBe('banter:rin-sylvie:2');
    s.story.seen.push('banter:rin-sylvie:2');
    expect(nextBanter(s, gates, count)).toBe('banter:noel-rin:2');
  });

  it('a seen gate naming two scenes opens only once both are seen (story depth Task 1 review)', () => {
    const s = meetAll(base(), ['noel']);
    const id: SceneId = 'banter:noel-rin:1';
    const gates = { [id]: { seen: ['rin-reveal', 'act3'] as SceneId[] } };
    expect(banterOpen(s, id, gates)).toBe(false);
    s.story.seen.push('act3');
    expect(banterOpen(s, id, gates)).toBe(false);
    s.story.seen.push('rin-reveal');
    expect(banterOpen(s, id, gates)).toBe(true);
    expect(gateOpen(s, { seen: ['rin-reveal', 'act3', 'finale'] })).toBe(false);
  });

  it('an expired chat neither plays nor holds back the next one (story depth)', () => {
    const s = meetAll(base(), ['noel']);
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:hero:5', 'chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4');
    const gates = { 'chat:noel:1': { beforeChoice: true as const } };
    expect(nextChat(s, gates)).toBe('chat:noel:1');
    s.party.roster.rin.oath = true;
    expect(nextChat(s, gates)).toBe('chat:noel:2');
    expect(s.story.seen).not.toContain('chat:noel:1');
    s.story.seen.push('chat:noel:2');
    expect(nextChat(s, gates)).toBeNull();
  });

  it('the pick is a pure function of the state: no rng, nothing written', () => {
    const s = meetAll(base(), ['noel', 'liz', 'scarlet']);
    const before = JSON.stringify(s);
    expect(nextBanter(s)).toBe(nextBanter(s));
    expect(arrivalScenes(s, { chat: true })).toEqual(arrivalScenes(s, { chat: true }));
    expect(JSON.stringify(s)).toBe(before);
    expect(nextBanter.length).toBe(1);   // the state is its only required input: there is no rng to pass
  });

  it('a banter is recorded like any scene: seen, and new only when auto', () => {
    const s = meetAll(base(), ['noel']);
    const played = sceneDone(s, 'banter:noel-rin:1', 'played');
    expect(played.story.seen).toContain('banter:noel-rin:1');
    expect(played.story.fresh).not.toContain('banter:noel-rin:1');
    expect(nextBanter(played)).toBeNull();
    expect(sceneDone(s, 'banter:noel-rin:1', 'auto').story.fresh).toContain('banter:noel-rin:1');
  });

  // Story depth Task 6 (plan ruling 9): pairs finish what they start; a quiet return plays two.
  it('a pair already started goes ahead of one not started', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 2, 'noel-rin': 2, 'safira-sylvie': 2 };
    const s = allChatsSeen(meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']));
    expect(nextBanter(s, {}, count)).toBe('banter:liz-scarlet:1');   // none started: the fixed order
    s.story.seen.push('banter:safira-sylvie:1');
    expect(nextBanter(s, {}, count)).toBe('banter:safira-sylvie:2');   // started: it goes first, though it has heard more
    s.story.seen.push('banter:safira-sylvie:2');
    expect(nextBanter(s, {}, count)).toBe('banter:liz-scarlet:1');   // finished: back to least heard, then the order
  });

  it('an expired banter does not start its pair', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'rin-sylvie': 2 };
    const gates = { 'banter:rin-sylvie:1': { beforeChoice: true as const } };
    const s = allChatsSeen(meetAll(base(), ['sylvie', 'liz', 'scarlet']));
    s.party.roster.rin.oath = true;   // rin-sylvie:1 expired unheard; :2 is open
    expect(nextBanter(s, gates, count)).toBe('banter:liz-scarlet:1');   // not started: the order still decides (no designed payoff in this count)
    s.story.seen.push('banter:liz-scarlet:1');
    expect(nextBanter(s, gates, count)).toBe('banter:rin-sylvie:2');
  });

  it('a quiet return plays two banters when more than two pairs are ready', () => {
    const s = allChatsSeen(meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']));
    expect(openPairs(s)).toBeGreaterThanOrEqual(3);
    const two = arrivalScenes(s, { chat: true });
    expect(two).toHaveLength(2);
    expect(two.every((id) => id.startsWith('banter:'))).toBe(true);
    expect(new Set(two.map((id) => id.split(':')[1])).size).toBe(2);   // two different pairs
    // two pairs ready: one banter
    const few: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'noel-rin': 1 };
    expect(openPairs(s, {}, few)).toBe(2);
    const pair = allChatsSeen(meetAll(base(), ['liz', 'scarlet']));   // liz-scarlet and rin-scarlet
    expect(openPairs(pair)).toBe(2);
    expect(arrivalScenes(pair, { chat: true }).filter((id) => id.startsWith('banter:'))).toHaveLength(1);
    // ruling 9's pre-authorized fallback (Task 6 report) lifts only the no-chat condition: a chat due still plays two
    const chatty = meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']);
    expect(arrivalScenes(chatty, { chat: true }).filter((id) => id.startsWith('banter:'))).toHaveLength(2);
    // something in the queue: one banter (Task 6 review)
    const queued = allChatsSeen(meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']));
    queued.story.queue = ['mem:noel:2'];
    expect(arrivalScenes(queued, { chat: true }).filter((id) => id.startsWith('banter:'))).toHaveLength(1);
    // a heavy scene: none; the return after the finale: none
    queued.story.queue = ['act2'];
    queued.story.seen = queued.story.seen.filter((id) => id !== 'act2');
    expect(arrivalScenes(queued, { chat: true }).filter((id) => id.startsWith('banter:'))).toHaveLength(0);
    expect(arrivalScenes(s, { chat: true, afterFinale: true }).filter((id) => id.startsWith('banter:'))).toHaveLength(0);
    // no return: none
    expect(arrivalScenes(s, { chat: false })).toEqual([]);
  });

  it('the second banter of a return is never the same pair as the first (Task 6 review)', () => {
    const s = allChatsSeen(meetAll(base(), ['liz', 'scarlet', 'noel', 'safira', 'sylvie']));
    s.party.roster.scarlet.memories = chainLength('scarlet');
    s.story.nodes = ['act2', 'act3'];
    s.story.seen.push('act2', 'act3', 'banter:liz-scarlet:1');
    const banters = arrivalScenes(s, { chat: true }).filter((id) => id.startsWith('banter:'));
    expect(banters[0]).toBe('banter:liz-scarlet:2');   // started: first
    expect(banters).toHaveLength(2);
    expect(banters[1].split(':')[1]).not.toBe('liz-scarlet');   // its :3 is ready too, but waits for another return
  });

  it('among equals, the pair ready longest goes first, then the one with more banters left (Task 6 review)', () => {
    const s = allChatsSeen(meetAll(base(), ['noel', 'liz', 'scarlet']));
    const even: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 1, 'noel-rin': 1 };
    expect(nextBanter(s, {}, even)).toBe('banter:liz-scarlet:1');   // all equal: the fixed order
    s.story.waited = { 'noel-rin': 2, 'liz-scarlet': 1 };
    expect(nextBanter(s, {}, even)).toBe('banter:noel-rin:1');   // ready longer
    s.story.waited = {};
    expect(nextBanter(s, {}, { 'liz-scarlet': 1, 'noel-rin': 3 })).toBe('banter:noel-rin:1');   // more left
    // a return counts the wait of every pair with a banter ready; playing one of its banters resets it
    const back = returned(s);
    expect(back.story.waited).toEqual(expect.objectContaining({ 'liz-scarlet': 1, 'noel-rin': 1, 'rin-scarlet': 1 }));
    const again = returned(back);
    expect(again.story.waited?.['liz-scarlet']).toBe(2);
    const heard = sceneDone(again, 'banter:liz-scarlet:1', 'played');
    expect(heard.story.waited?.['liz-scarlet'] ?? 0).toBe(0);
    // Task 6 review: a pair no longer ready drops its wait at the next return (its :2 waits for act 2 here)
    const later = returned(heard);
    expect(later.story.waited?.['liz-scarlet']).toBeUndefined();
    expect(later.story.waited?.['noel-rin']).toBe(3);
    // and a wait never runs past the save's bound
    const long = { ...later, story: { ...later.story, waited: { 'noel-rin': 999 } } };
    expect(returned(long).story.waited?.['noel-rin']).toBe(999);
  });

  /**
   * A scripted play (story depth Task 6): a return to town at each depth in `depths`, everyone met at her `MEETINGS` depth,
   * memories by `memoryPace` (the hero's ninth piece the depth-25 top-up, queued for the return as takePieces does), every
   * arrival scene played, and the lone morning played at the next departure once `departScene` would offer it. Returns the
   * state after the last return, each payoff's opening and playing depth, and every return whose two banters shared a pair.
   */
  const PAYOFFS: SceneId[] = ['banter:rin-scarlet:3', 'banter:rin-selene:2', 'banter:safira-sylvie:3', 'banter:liz-scarlet:3', 'banter:noel-selene:3', 'banter:chizuru-noel:2'];
  /** The design §6 setup/payoff banters outside ruling 9's six (Task 6 review): measured too. */
  const SETUP_PAYOFFS: SceneId[] = ['banter:bobby-chizuru:2', 'banter:chizuru-rin:2', 'banter:safira-sylvie:2', 'banter:safira-sylvie:3', 'banter:rin-selene:2', 'banter:rin-scarlet:3'];
  const scriptedPlay = (depths: number[], afterFinale = 0) => {
    let s = base();
    s.story.seen.push('prologue-inn', 'first-return', 'act1-after');
    s.story.act1Cleared = true;
    const pace = Object.fromEntries(CHARACTER_IDS.map((id) => [id, memoryPace(id)])) as Record<CharacterId, number[]>;
    const opened: Partial<Record<SceneId, number>> = {};
    const played: Partial<Record<SceneId, number>> = {};
    const samePair: string[] = [];
    const trace: string[] = [];
    for (const t of depths) {
      s.dungeon.reached.mainline = Math.max(s.dungeon.reached.mainline, t);
      for (const m of MEETINGS) if (t >= m.depth && !s.party.recruited.includes(m.id)) s.party = meet(s.party, m.id, 1);
      for (const id of CHARACTER_IDS) {
        if (!s.party.recruited.includes(id)) continue;
        const n = pace[id].filter((d) => d <= t).length;
        s.party.roster[id].memories = id === 'hero' ? Math.min(n, 8) : n;
      }
      if (t >= 25 && (s.party.roster.hero.memories ?? 0) < 9) {
        s.party.roster.hero.memories = 9;
        if (!s.story.seen.includes('mem:hero:9') && !s.story.queue.includes('mem:hero:9')) s.story.queue.push('mem:hero:9');
      }
      s = { ...s, story: onReturn(s) };
      for (const id of [...PAYOFFS, ...SETUP_PAYOFFS]) if (opened[id] === undefined && banterOpen(s, id)) {
        const [pair, n] = [id.split(':')[1], Number(id.split(':')[2])];
        const prev = `banter:${pair}:${n - 1}` as SceneId;
        if (n === 1 || s.story.seen.includes(prev) || gateExpired(s, BANTER_GATE[prev])) opened[id] = t;
      }
      const arrival = arrivalScenes(s, { chat: true });
      trace.push(`${t}: ${arrival.join(' ')} (pairs ready ${openPairs(s)})`);
      const pairs = arrival.filter((id) => id.startsWith('banter:')).map((id) => id.split(':')[1]);
      if (new Set(pairs).size !== pairs.length) samePair.push(`${t}: ${pairs.join(', ')}`);
      for (const id of arrival) {
        if (id.startsWith('banter:') && played[id] === undefined) played[id] = t;
        s = sceneDone(s, id, 'played');
      }
      if (s.story.queue.includes('hero-alone') && s.story.seen.includes('mem:hero:9') && s.story.seen.includes('bellkeeper-arrives')
        && !ALONE.some((id) => s.story.queue.includes(id))) s = sceneDone(s, 'hero-alone', 'played');
    }
    // The finale (Game.finalePieces): it answers a lone morning still owed; then the returns after it, the first one heavy
    // (`afterFinale`: no banter), each one numbered 100 + k in `played`.
    const before = PAYOFFS.filter((id) => s.story.seen.includes(id));
    if (afterFinale > 0) {
      s = { ...s, story: { ...s.story, finaleCleared: true, seen: [...s.story.seen, 'finale', ...(s.story.seen.includes('hero-alone') ? [] : ['hero-alone' as SceneId])], queue: s.story.queue.filter((q) => q !== 'hero-alone') } };
      for (let k = 1; k <= afterFinale; k++) {
        s = { ...s, story: onReturn(s) };
        const arrival = arrivalScenes(s, { chat: true, afterFinale: k === 1 });
        trace.push(`after ${k}: ${arrival.join(' ')}`);
        for (const id of arrival) {
          if (id.startsWith('banter:') && played[id] === undefined) played[id] = 100 + k;
          s = sceneDone(s, id, 'played');
        }
      }
    }
    const report = [...PAYOFFS, ...SETUP_PAYOFFS.filter((id) => !PAYOFFS.includes(id))].map((id) => `${id}: opens ${opened[id] ?? '-'}, plays ${played[id] ?? '-'}`).join('\n');
    return { s, report, samePair, trace, before, played };
  };

  it('scripted play: every payoff banter plays before the finale', () => {
    const { s, report, samePair } = scriptedPlay(Array.from({ length: 29 }, (_, i) => i + 1));
    for (const id of PAYOFFS) expect(s.story.seen, report).toContain(id);
    for (const id of SETUP_PAYOFFS) expect(s.story.seen, `§6: ${report}`).toContain(id);   // Task 6 review: the §6 ones too
    expect(samePair).toEqual([]);   // never one pair twice on a return (Task 6 review)
  });

  it('scripted play, a return every second depth: every payoff by the finale or within three returns after it (Task 6 rulings)', () => {
    // Controller rulings: heavy returns stay banter-free; a pair on the way to one of the six designed payoffs ranks first;
    // after the finale a return other than the festival's plays up to three banters, from two pairs at least. Measured
    // (task-6-report.md): four before the finale, the other two in the second and third returns after it.
    const depths = Array.from({ length: 15 }, (_, i) => 2 * i + 1);   // 1, 3, …, 29
    const { s, report, trace, samePair, before, played } = scriptedPlay(depths, 3);
    for (const id of PAYOFFS) expect(s.story.seen, `${report}\n${trace.join('\n')}`).toContain(id);
    // Task 6 review: the §6 setup/payoffs outside the six, measured, no rule added: all but bobby-chizuru:2 land by the third
    // return after the finale (its :1 is never heard before the finale here); it lands on the fifth
    expect(SETUP_PAYOFFS.filter((id) => !s.story.seen.includes(id)), `§6: ${report}\n${trace.join('\n')}`).toEqual(['banter:bobby-chizuru:2']);
    const five = scriptedPlay(depths, 5);
    for (const id of SETUP_PAYOFFS) expect(five.s.story.seen, `§6: ${five.report}`).toContain(id);
    expect(five.played['banter:bobby-chizuru:2']).toBe(105);
    expect(before.length, report).toBe(4);
    // the two after the finale, on its second and third returns (the first is the festival's)
    expect([played['banter:rin-selene:2'], played['banter:rin-scarlet:3']], report).toEqual([102, 103]);
    expect(samePair).toEqual([]);
  });

  it('the six designed payoffs, and a pair on the way to one, go first; another pair\'s last banter does not (Task 6 third ruling)', () => {
    expect([...BANTER_PAYOFFS].sort()).toEqual([...PAYOFFS].sort());
    const s = allChatsSeen(meetAll(base(), ['noel', 'liz', 'scarlet']));
    s.story.seen.push('banter:noel-rin:1');   // noel-rin started; its :2 is its last, but no designed payoff
    expect(nextBanter(s)).toBe('banter:liz-scarlet:1');   // liz-scarlet leads to its payoff (:3): first, though not started
    s.story.seen.push('banter:liz-scarlet:1');
    const pace = nextBanter(s);
    expect(['banter:rin-scarlet:1', 'banter:liz-scarlet:2']).toContain(pace);   // still on the way to a payoff
    expect(pace).not.toBe('banter:noel-rin:2');
  });

  it('a pair whose next banter is its payoff goes ahead of the ready-longest and the one with more left (Task 6 ruling)', () => {
    // third ruling: "payoff" is one of the six designed ones (BANTER_PAYOFFS), or on the way to one
    const s = allChatsSeen(meetAll(base(), ['noel', 'liz', 'scarlet']));
    s.story.seen.push('banter:noel-rin:1');   // noel-rin started; it waited longer
    const count: Partial<Record<BanterPair, number>> = { 'noel-rin': 2, 'liz-scarlet': 3 };
    s.story.waited = { 'noel-rin': 5 };
    expect(nextBanter(s, {}, count)).toBe('banter:liz-scarlet:1');   // on the way to liz-scarlet:3, ahead of started, waited and more-left
    // the payoff itself, above a started pair and the least heard
    const t = allChatsSeen(meetAll(base(), ['noel', 'selene']));
    t.party.roster.rin.oath = true;   // rin-selene:1 expired: :2, her payoff, is ready and the pair has not started
    t.party.roster.selene.memories = chainLength('selene');
    t.story.seen.push('banter:noel-rin:1');   // noel-rin started, heard one
    const gates = { 'banter:rin-selene:1': { beforeChoice: true as const } };
    expect(nextBanter(t, gates, { 'noel-rin': 2, 'rin-selene': 2 })).toBe('banter:rin-selene:2');
  });

  it('after the finale, a return other than the festival\'s plays up to three banters, from two pairs at least (Task 6 ruling)', () => {
    const s = allChatsSeen(meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']));
    s.story.act1Cleared = true;
    s.story.finaleCleared = true;
    s.story.seen.push('epilogue');
    const after = arrivalScenes(s, { chat: true }).filter((id) => id.startsWith('banter:'));
    expect(after).toHaveLength(3);
    expect(new Set(after.map((id) => id.split(':')[1])).size).toBeGreaterThanOrEqual(2);
    expect(arrivalScenes(s, { chat: true, afterFinale: true }).filter((id) => id.startsWith('banter:'))).toEqual([]);   // the festival's return
    // one pair ready with two banters in a row: never three from it, nor two from it alone
    const one = allChatsSeen(meetAll(base(), ['liz', 'scarlet']));
    one.story.act1Cleared = true;
    one.story.finaleCleared = true;
    one.story.seen.push('epilogue', 'banter:rin-scarlet:1', 'banter:rin-scarlet:2', 'banter:rin-scarlet:3');   // only liz-scarlet left
    one.party.roster.scarlet.memories = chainLength('scarlet');
    one.story.nodes = ['act2', 'act3', 'act4'];
    one.story.seen.push('act2', 'act3', 'act4');
    const solo = arrivalScenes(one, { chat: true }).filter((id) => id.startsWith('banter:'));
    expect(solo).toEqual(['banter:liz-scarlet:1']);
  });

  it('every pair counted has at least one banter', () => {
    for (const p of BANTER_PAIRS) expect(BANTER_COUNT[p]!, p).toBeGreaterThan(0);
  });
});

describe('the confession remembers where it was told (Task 15 review, controller ruling)', () => {
  const confessed = (heroPieces: number): GameState => {
    let s = withMemories(base(), 'scarlet', 5);
    s = withMemories(s, 'hero', heroPieces);
    s.party.roster.rin.oath = true;
    s.story.seen.push('rin-reveal', 'banter:rin-scarlet:1');
    return sceneDone(s, 'rin-confess', 'played');
  };
  it('at dinner the seventh night waits for it; at the bottom it expires, and the torn rota comes next', () => {
    const dinner = confessed(chainLength('hero') - 1);
    expect(dinner.story.confession).toBe('dinner');
    expect(banterOpen(dinner, 'banter:rin-scarlet:2')).toBe(true);
    expect(gateExpired(dinner, BANTER_GATE['banter:rin-scarlet:2'])).toBe(false);
    const bottom = confessed(chainLength('hero'));
    expect(bottom.story.confession).toBe('depth30');
    expect(banterOpen(bottom, 'banter:rin-scarlet:2')).toBe(false);
    expect(gateExpired(bottom, BANTER_GATE['banter:rin-scarlet:2'])).toBe(true);
    // the pair goes on without it: with every other pair heard, the next is :3, never :2
    for (const p of BANTER_PAIRS) if (p !== 'rin-scarlet') for (let n = 1; n <= (BANTER_COUNT[p] ?? 0); n++) bottom.story.seen.push(`banter:${p}:${n}` as SceneId);
    expect(nextBanter(bottom)).toBe('banter:rin-scarlet:3');
    expect(bottom.story.seen).not.toContain('banter:rin-scarlet:2');
  });
  it('the auto-skipped confession (story off) records its place too', () => {
    const s = base();
    s.party.roster.rin.oath = true;
    expect(sceneDone(s, 'rin-confess', 'auto').story.confession).toBe('dinner');
  });
});
