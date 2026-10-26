import { afterEach, describe, it, expect } from 'vitest';
import { ACT_DEPTHS, ACT_NODES, ALONE, DEPARTURE_SCENES, EVE_DEPTH, FINALE_DEPTH, BANTER_COUNT, BANTER_PAYOFFS, BANTER_GATE, BANTER_PAIRS, CHAT_GATE, CLOSING_PIECES, GROUP_GATE, GROUP_MIN_LINES, HEAVY_ARRIVAL, REACTIONS, SCENE_TIME, SEASON_SCENES, groupScene, isNightSlot, sceneTime, heavyScene, isHeavyArrival, lineCap, memScene, sceneKind, type BanterPair, type SceneId } from '../../data/story/scenes';
import { chainLength } from '../../data/story/chains';
import { CHARACTER_IDS } from '../../data/characters';
import { meet } from '../party';
import { MEETINGS } from '../../data/meetings';
import { memoryPace } from './expect';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { arrivalScenes, banterOpen, chatOpen, gateExpired, gateOpen, markRead, nextBanter, nextChat, nextReaction, onReturn, openPairs, sceneDone, settleBellkeeper, settleOpening, storyPieces, storyStage, toldCount, afterWin, calendarOf, nextSeasonScene } from './events';
import { SPRING_AFTER, dayOf, nextDay } from '../calendar';
import { constRng, withTold } from '../testing';
import { Game } from '../game';
import { DAWN_BACKLOG, dawnMemory, eveMemories, nextBeat, orderNight, planNight } from './nights';
import { memoryTone } from '../../data/story/tone';
import { NIGHT_BEATS } from '../../data/story.zh-TW';
import { ENDINGS_WRITTEN, memScene as memOf } from '../../data/story/scenes';
import { nextEnding } from './events';
import type { Companion } from '../../data/story/bond';

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

// review 5: the after-story and romance registries go back to what is registered, not to empty
const regAdd = <T,>(reg: T[], ...xs: T[]): void => { for (const x of xs) if (!reg.includes(x)) reg.push(x); };
const ENDINGS_BASE = [...ENDINGS_WRITTEN];
const endingsBack = (): void => { ENDINGS_WRITTEN.splice(0, ENDINGS_WRITTEN.length, ...ENDINGS_BASE); };

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
    // story L: her last piece told, not only held (so it is never still waiting in the queue beside her homecoming)
    let s = withTold(base(), 'sylvie', chainLength('sylvie') - 1);
    s.story.seen.push('chat:hero:1');
    expect(onReturn(s).queue).toEqual([]);
    s = withTold(s, 'sylvie', chainLength('sylvie'));
    s.story.queue = ['act3'];
    const back = returned(s);
    expect(back.story.queue).toEqual(['act3', 'home:sylvie']);
    const order = arrivalScenes(back, { chat: true });
    expect(order.slice(0, 2)).toEqual(['act3', 'home:sylvie']);
    expect(order[2]).toMatch(/^chat:/);
    expect(returned(back).story.queue.filter((x) => x === 'home:sylvie')).toHaveLength(1);   // waiting, not doubled
    expect(onReturn(sceneDone(back, 'home:sylvie', 'played')).queue).not.toContain('home:sylvie');
  });

  it('only the endings the town holds have a homecoming', () => {
    let s = base();
    for (const id of ['selene', 'noel', 'bobby', 'scarlet', 'chizuru', 'safira', 'liz'] as CharacterId[]) s = withTold(s, id, chainLength(id));
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
    // story L Task 12: her second chat waits for her memories told whole (CHAT_GATE)
    s.story.seen.push(...[1, 2, 3, 4, 5].map((n) => `mem:sylvie:${n}` as SceneId));
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
    const s = withTold(base(), 'liz', chainLength('liz'));
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
    let s = meetAll(base(), ['noel']);
    const id: SceneId = 'banter:noel-rin:1';
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(false);
    expect(nextBanter(s, { [id]: { stage: 'act2' } })).toBeNull();
    s.story.nodes = ['act2'];
    expect(banterOpen(s, id, { [id]: { stage: 'act2' } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { oath: true } })).toBe(false);
    s.party.roster.rin.oath = true;
    expect(banterOpen(s, id, { [id]: { stage: 'act2', oath: true } })).toBe(true);
    expect(banterOpen(s, id, { [id]: { full: 'noel' } })).toBe(false);
    s = withTold(s, 'noel', chainLength('noel'));
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
    let s = meetAll(base(), ['noel', 'bobby', 'chizuru']);
    const id: SceneId = 'banter:noel-rin:1';
    const chat: SceneId = 'chat:noel:2';
    // before her choice: open until she makes it, closed after
    expect(banterOpen(s, id, { [id]: { beforeChoice: true } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { beforeChoice: true } })).toBe(true);
    // pieces: each named one holds at least that many
    expect(banterOpen(s, id, { [id]: { pieces: { noel: 1 } } })).toBe(false);
    expect(chatOpen(s, chat, { [chat]: { pieces: { noel: 1 } } })).toBe(false);
    s = withTold(s, 'noel', 1);
    expect(banterOpen(s, id, { [id]: { pieces: { noel: 1 } } })).toBe(true);
    expect(chatOpen(s, chat, { [chat]: { pieces: { noel: 1 } } })).toBe(true);
    s = withTold(s, 'bobby', 3);
    expect(banterOpen(s, id, { [id]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(false);   // only one of the two at three
    expect(chatOpen(s, chat, { [chat]: { pieces: { bobby: 3, chizuru: 3 } } })).toBe(false);
    s = withTold(s, 'chizuru', 3);
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
    s = withTold(s, 'noel', chainLength('noel'));
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
    const s = withTold(allChatsSeen(meetAll(base(), ['liz', 'scarlet', 'noel', 'safira', 'sylvie'])), 'scarlet', chainLength('scarlet'));
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
   * A scripted play (story depth Task 6; story L Task 6): a return to town at each depth in `depths`. Everyone is met at her
   * `MEETINGS` depth (`route: 'mainline-first'`: Selene and Bobby on the main road at theirs, the others together on the
   * first return past act 4's depth, as a player who takes the main road to act 4 first). Each one holds what `memoryPace`
   * has dropped by that depth (Lorne up to eight, then nine from the depth-25 top-up); a new piece goes to the end of
   * `untold`, by depth and then `CHARACTER_IDS`. Each return plays as `Game.arrive` does: `onReturn`, the day
   * (`arrivalScenes`, with the three group scenes registered), the night (`planNight`); the owed pieces first, then the day,
   * the group scene, the night, each through `sceneDone`, and the dawn's pick is kept (`dawnMemory`). Each departure plays
   * as `Game.departScenes` would offer: the dawn's one memory (controller ruling 2026-10-24; not on the eve's own
   * departure, nor while a reveal or confession waits), the night before the descent and its memories (`eveMemories`),
   * then the lone morning. After the last return the finale plays as `Game.finalePieces` does (the pieces of the last dive held untold, the eve as its fallback, any act owed,
   * Lorne's pieces and his tenth), then `afterFinale` returns, numbered 100 + k in `played`.
   * Returns the state after it all, each payoff's opening and playing depth, every return whose two banters shared a pair,
   * every night's count, every owed piece played late, where each act and group scene played, and the memories left
   * untold once the finale is over.
   */
  const PAYOFFS: SceneId[] = ['banter:rin-scarlet:3', 'banter:rin-selene:2', 'banter:safira-sylvie:3', 'banter:liz-scarlet:3', 'banter:noel-selene:3', 'banter:chizuru-noel:2'];
  /** The design §6 setup/payoff banters outside ruling 9's six (Task 6 review): measured too. */
  const SETUP_PAYOFFS: SceneId[] = ['banter:bobby-chizuru:2', 'banter:chizuru-rin:2', 'banter:safira-sylvie:2', 'banter:safira-sylvie:3', 'banter:rin-selene:2', 'banter:rin-scarlet:3'];
  /** The three group scenes, registered as the writing tasks will register them (story L spec §5.3). */
  const REACT = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' } as const;
  /** One night: when, the pieces the day owed, the night's memories (the eve's too), and the beats between them. */
  interface NightCount { at: string; owed: SceneId[]; night: SceneId[]; beats: number; alone: boolean }
  /** A beat taken between two memories (story L Task 8): where, the memory before and its tone, the pool index (-1: none). */
  interface BeatTaken { at: string; prev: SceneId; heavy: boolean; i: number; tone?: 'quiet' | 'lively' }
  /** A return as the script played it, from the state it started in (review: cross-checked against `Game.arrive`). */
  interface ArriveCheck { at: number; state: GameState; afterFinale: boolean; tonight: SceneId[]; dawn?: SceneId; arrival: SceneId[]; night: SceneId[] }
  /** A departure as the script played it, from the state it started in (cross-checked against `Game.departScenes`). */
  interface DepartCheck { at: number; state: GameState; scenes: SceneId[]; eve: SceneId[] }
  const scriptedPlay = (depths: number[], afterFinale = 0, route: 'all' | 'mainline-first' = 'all') => {
    let s = base();
    s.story.seen.push('prologue-inn', 'first-return', 'act1-after');
    s.story.act1Cleared = true;
    s.story.untold = [];
    const pace = Object.fromEntries(CHARACTER_IDS.map((id) => [id, memoryPace(id)])) as Record<CharacterId, number[]>;
    const opened: Partial<Record<SceneId, number>> = {};
    const played: Partial<Record<SceneId, number>> = {};
    const samePair: string[] = [];
    const trace: string[] = [];
    const nights: NightCount[] = [];
    const late: string[] = [];
    const dawns: SceneId[] = [];
    const arrivals: ArriveCheck[] = [];
    const departures: DepartCheck[] = [];
    /** Every beat the playthrough takes, as `Game.takeBeat` would (story L Task 8): its pool index, its tone, the memory before. */
    const beats: BeatTaken[] = [];
    /** The beats between `ids`, a night's (or the eve's) memories in play order, moving the cursor as `Game.takeBeat` does. */
    const beatNight = (at: string, ids: SceneId[]) => {
      for (let k = 1; k < ids.length; k++) {
        const r = nextBeat(s, ids[k - 1], ids[k]);
        beats.push({ at, prev: ids[k - 1], heavy: memoryTone(ids[k - 1]) === 'heavy', i: r ? r.at : -1, tone: r?.line.tone });
        if (r) s = { ...s, story: { ...s.story, beat: (r.at + 1) % NIGHT_BEATS.lines.length } };
      }
    };
    /** Where each act, each group scene and the lone morning played: the return's depth (100 + k after the finale), or 'finale'. */
    const where: Partial<Record<SceneId, number | 'finale'>> = {};
    const late4 = depths.find((t) => t > ACT_DEPTHS.act4) ?? Infinity;
    const metBy = (id: CharacterId, t: number): boolean => {
      const m = MEETINGS.find((x) => x.id === id);
      if (!m) return true;
      return route === 'all' || m.region === 'mainline' ? t >= m.depth : t >= late4;
    };
    /** What `id` holds at depth `t`: her pace; Lorne at most eight, nine from depth 25 (the top-up). */
    const heldAt = (id: CharacterId, t: number): number => {
      const n = pace[id].filter((d) => d <= t).length;
      return id === 'hero' ? (t >= 25 ? 9 : Math.min(n, 8)) : n;
    };
    /** Meet whoever is due and take the pieces dropped by depth `t`: held at once, untold until a night tells them. */
    const take = (t: number) => {
      for (const m of MEETINGS) if (metBy(m.id, t) && !s.party.recruited.includes(m.id)) s.party = meet(s.party, m.id, 1);
      const gained: { id: CharacterId; k: number; d: number }[] = [];
      for (const id of CHARACTER_IDS) {
        if (!s.party.recruited.includes(id)) continue;
        const had = s.party.roster[id].memories ?? 0;
        const n = heldAt(id, t);
        for (let k = had + 1; k <= n; k++) gained.push({ id, k, d: id === 'hero' && k === 9 ? 25 : (pace[id][k - 1] ?? t) });
        s.party.roster[id].memories = Math.max(had, n);
      }
      gained.sort((a, b) => a.d - b.d || CHARACTER_IDS.indexOf(a.id) - CHARACTER_IDS.indexOf(b.id));
      s = { ...s, story: { ...s.story, untold: [...(s.story.untold ?? []), ...gained.map((g) => memScene(g.id, g.k))] } };
    };
    /** `c`'s pieces held and not told yet. */
    const untoldOf = (c: CharacterId): SceneId[] => Array.from({ length: s.party.roster[c]?.memories ?? 0 }, (_, i) => memScene(c, i + 1)).filter((id) => !s.story.seen.includes(id));
    /** Plays `id`, first checking that no piece it needs is still untold (spec §4.3's table). */
    const play = (id: SceneId, at: number | 'finale') => {
      if ((['act2', 'act3', 'act4', 'bellkeeper-arrives'] as SceneId[]).includes(id)) {
        const owed = [...untoldOf('hero'), ...untoldOf('rin')].filter((m) => !(at === 'finale' && m.startsWith('mem:hero:')));
        if (owed.length) late.push(`${at}: ${id} before ${owed.join(' ')}`);
      }
      if (ALONE.includes(id) && untoldOf('rin').length) late.push(`${at}: ${id} before ${untoldOf('rin').join(' ')}`);
      if (id.startsWith('banter:') && played[id] === undefined && at !== 'finale') played[id] = at;
      if ((ACT_NODES as SceneId[]).includes(id) || id.startsWith('group:') || id === 'hero-alone') where[id] = at;
      s = sceneDone(s, id, 'played', REACT);
    };
    /** A return to town, as `Game.arrive` and the town play it. */
    const arrive = (at: number, afterFinaleReturn: boolean) => {
      const from = structuredClone(s);
      s = { ...s, story: onReturn(s) };
      if (at < 100) for (const id of [...PAYOFFS, ...SETUP_PAYOFFS]) if (opened[id] === undefined && banterOpen(s, id)) {
        const [pair, n] = [id.split(':')[1], Number(id.split(':')[2])];
        const prev = `banter:${pair}:${n - 1}` as SceneId;
        if (n === 1 || s.story.seen.includes(prev) || gateExpired(s, BANTER_GATE[prev])) opened[id] = at;
      }
      // bond plan Task 20: the after-stories take the chat slot as `Game.arrive` gives them (`nextEnding`), now that they are written
      const day = arrivalScenes(s, { chat: true, afterFinale: afterFinaleReturn, reactions: REACT, ending: (st) => nextEnding(st) });
      const plan = planNight(s, day);
      const dawn = dawnMemory(s, [...plan.before, ...plan.night]);
      s = { ...s, story: { ...s.story, tonight: [...plan.before, ...plan.night], dawn: dawn ?? undefined } };
      // the reaction slot's night scene: a group scene, or after the finale the spring festival (time and moon Task 7)
      const group = day.filter(isNightSlot);
      const daytime = day.filter((id) => !isNightSlot(id));
      const festival = group.find((id) => id.startsWith('season:'));
      s = { ...s, story: { ...s.story, festival } };
      if (!festival) delete s.story.festival;
      arrivals.push({ at, state: from, afterFinale: afterFinaleReturn, tonight: [...plan.before, ...plan.night], dawn: dawn ?? undefined, arrival: [...plan.before, ...daytime], night: orderNight([...group, ...plan.night]) });
      trace.push(`${at}: ${plan.before.length ? `[${plan.before.join(' ')}] ` : ''}${daytime.join(' ')}${group.length ? ` | ${group.join(' ')}` : ''} | night ${plan.night.join(' ') || '-'} (untold ${(s.story.untold ?? []).length}, pairs ready ${openPairs(s)})`);
      const pairs = day.filter((id) => id.startsWith('banter:')).map((id) => id.split(':')[1]);
      if (at < 100 && new Set(pairs).size !== pairs.length) samePair.push(`${at}: ${pairs.join(', ')}`);
      nights.push({ at: String(at), owed: plan.before, night: plan.night, beats: Math.max(0, plan.night.length - 1), alone: day.some((id) => ALONE.includes(id)) });
      beatNight(String(at), plan.night);
      for (const id of [...plan.before, ...daytime, ...group, ...plan.night]) play(id, at);
      // time and moon Task 1: the return ends the dive's day, as Game.arrive does
      s = { ...s, story: { ...s.story, day: nextDay(dayOf(s)) } };
    };
    /**
     * A departure, as `Game.departScenes` offers: the dawn, the eve and its memories, then the lone morning. A copy of the
     * engine's rule; 'the script plays each return and departure as the real engine does' checks it against
     * `Game.departScenes` on every state it starts from (final review: the copy must not drift).
     */
    const depart = (at: number) => {
      const check: DepartCheck = { at, state: structuredClone(s), scenes: [], eve: [] };
      departures.push(check);
      const alone = ALONE.some((id) => s.story.queue.includes(id));
      const untold = s.story.untold ?? [];
      const dawn = s.story.dawn;
      // 【控制者裁定 2026-10-24】 a reveal or confession waiting blocks the dawn; so does the eve's own departure
      if (!alone && !s.story.queue.includes('finale-eve') && dawn && untold.includes(dawn) && untold.length >= DAWN_BACKLOG) {
        trace.push(`${at} departs: dawn ${dawn}`);
        dawns.push(dawn);
        check.scenes.push(dawn);
        play(dawn, at);
      }
      if (alone) return;
      if (s.story.queue.includes('finale-eve')) {
        check.scenes.push('finale-eve');
        play('finale-eve', at);
        const eve = eveMemories(s);
        check.eve = eve;
        s = { ...s, story: { ...s.story, tonight: (s.story.tonight ?? []).filter((id) => !eve.includes(id)) } };
        trace.push(`${at} departs: finale-eve | ${eve.join(' ') || '-'}`);
        nights.push({ at: `eve ${at}`, owed: [], night: eve, beats: Math.max(0, eve.length - 1), alone: false });
        beatNight(`eve ${at}`, eve);
        for (const id of eve) play(id, at);
      }
      if (s.story.queue.includes('hero-alone') && s.story.seen.includes('mem:hero:9') && s.story.seen.includes('bellkeeper-arrives')) {
        trace.push(`${at} departs: hero-alone`);
        check.scenes.push('hero-alone');
        play('hero-alone', at);
      }
    };
    for (const t of depths) {
      s.dungeon.reached.mainline = Math.max(s.dungeon.reached.mainline, t);
      take(t);
      arrive(t, false);
      depart(t);
    }
    const before = PAYOFFS.filter((id) => s.story.seen.includes(id));
    const atLastReturn = [...(s.story.untold ?? [])];
    // The finale (Game.finalePieces): the last dive's pieces held untold, then its own list, then the finale.
    s.dungeon.reached.mainline = FINALE_DEPTH;
    take(FINALE_DEPTH);
    const oath = !!s.party.roster.rin.oath;
    const acts = ACT_NODES.filter((node) => !s.story.seen.includes(node));
    const confess: SceneId[] = s.story.queue.includes('rin-confess') ? ['rin-confess'] : [];
    const keeper: SceneId[] = s.story.queue.includes('bellkeeper-arrives') || confess.length ? ['bellkeeper-arrives'] : [];
    const heroPieces = [...(s.story.untold ?? []).filter((id) => id.startsWith('mem:hero:')), 'mem:hero:10' as SceneId];
    s = { ...s, story: { ...s.story, untold: (s.story.untold ?? []).filter((id) => !id.startsWith('mem:hero:')), queue: s.story.queue.filter((id) => !id.startsWith('mem:hero:') && !acts.includes(id as never) && !confess.includes(id) && !keeper.includes(id)) } };
    s.party.roster.hero.memories = 10;
    const eveOwed = !s.story.seen.includes('finale-eve');
    const eve = eveOwed ? eveMemories(s) : [];
    if (eveOwed) nights.push({ at: 'eve finale', owed: [], night: eve, beats: Math.max(0, eve.length - 1), alone: false });
    if (eveOwed) beatNight('eve finale', eve);
    // time and moon Task 7: the finale writes the spring day, as the game does
    s = { ...s, story: { ...s.story, finaleCleared: true, springDay: dayOf(s) + SPRING_AFTER, queue: s.story.queue.filter((id) => !DEPARTURE_SCENES.includes(id)) } };
    if (!s.story.seen.includes('hero-alone')) s = { ...s, story: { ...s.story, seen: [...s.story.seen, 'hero-alone'], fresh: [...s.story.fresh, 'hero-alone'] } };
    const finale: SceneId[] = [...(eveOwed ? ['finale-eve' as SceneId, ...eve] : []), ...acts, ...confess, ...keeper, ...heroPieces, 'finale'];
    trace.push(`finale: ${finale.join(' ')}`);
    for (const id of finale) play(id, 'finale');
    const unplayed = [...(s.story.untold ?? [])];
    for (let k = 1; k <= afterFinale; k++) arrive(100 + k, k === 1);
    const report = [...PAYOFFS, ...SETUP_PAYOFFS.filter((id) => !PAYOFFS.includes(id))].map((id) => `${id}: opens ${opened[id] ?? '-'}, plays ${played[id] ?? '-'}`).join('\n');
    return { s, report, samePair, trace, before, played, nights, late, where, unplayed, oath, atLastReturn, dawns, arrivals, departures, beats };
  };

  it('scripted play: every payoff banter plays before the finale', () => {
    const { s, report, samePair } = scriptedPlay(Array.from({ length: 29 }, (_, i) => i + 1));
    for (const id of PAYOFFS) expect(s.story.seen, report).toContain(id);
    for (const id of SETUP_PAYOFFS) expect(s.story.seen, `§6: ${report}`).toContain(id);   // Task 6 review: the §6 ones too
    expect(samePair).toEqual([]);   // never one pair twice on a return (Task 6 review)
  });

  it('scripted play, a return every second depth: every payoff by the finale or within three returns after it (Task 6 rulings)', () => {
    // Controller rulings: heavy returns stay banter-free; a pair on the way to one of the six designed payoffs ranks first;
    // after the finale a return other than the festival's plays up to three banters, from two pairs at least. Story L
    // (task-4-6-report.md): one before the finale, the other five in the second and third returns after it.
    const depths = Array.from({ length: 15 }, (_, i) => 2 * i + 1);   // 1, 3, …, 29
    const { s, report, trace, samePair, before, played } = scriptedPlay(depths, 3);
    for (const id of PAYOFFS) expect(s.story.seen, `${report}\n${trace.join('\n')}`).toContain(id);
    // Task 6 review: the §6 setup/payoffs outside the six, measured, no rule added: all but bobby-chizuru:2 land by the third
    // return after the finale (its :1 is never heard before the finale here); it lands on the sixth (time and moon Task 8:
    // the fifth return after the finale is the spring festival's, SPRING_AFTER days on, with no banter)
    expect(SETUP_PAYOFFS.filter((id) => !s.story.seen.includes(id)), `§6: ${report}\n${trace.join('\n')}`).toEqual(['banter:bobby-chizuru:2']);
    const five = scriptedPlay(depths, 6);
    for (const id of SETUP_PAYOFFS) expect(five.s.story.seen, `§6: ${five.report}`).toContain(id);
    expect(five.played['banter:bobby-chizuru:2']).toBe(106);
    expect(five.trace.find((l) => l.startsWith('105:'))).toMatch(/season:spring/);
    // Story L Task 6 (controller ruling 2026-10-24): the payoffs wait for the pieces told at night, so the count before the
    // finale is a measured pin (it was 4 before story L); the guarantee is the one above, every payoff by the third return
    // after the finale. Measured: Selene's before it (depth 29), Scarlet's on the third return after it. Controller
    // ruling 2026-10-24 (a waiting reveal or confession blocks the dawn): Chizuru and Noel's payoff now lands before the
    // finale too (depth 29), so two do.
    expect(before.length, report).toBe(2);
    expect([played['banter:rin-selene:2'], played['banter:chizuru-noel:2'], played['banter:rin-scarlet:3']], report).toEqual([29, 29, 103]);
    expect(samePair).toEqual([]);
  });

  // ---- Story L Task 6 (controller rulings 2026-10-23 and 2026-10-24): the scripted plays through the nights ----

  const EVERY_FLOOR = Array.from({ length: 29 }, (_, i) => i + 1);         // 1, 2, …, 29
  const EVERY_SECOND = Array.from({ length: 15 }, (_, i) => 2 * i + 1);    // 1, 3, …, 29
  const EVERY_THIRD = Array.from({ length: 10 }, (_, i) => 3 * i + 1);     // 1, 4, …, 28
  /**
   * The three players and the most memories each may leave untold once the finale is over. Spec §13: 3, 8 and 15. The
   * player who returns every third floor is held to 20 by the controller's ruling of 2026-10-24: one who returns that
   * seldom chooses to skip town, and every piece left stays readable in the handbook as 新 (measured 19 with the dawn).
   */
  const PLAYERS: [string, number[], number][] = [['every floor', EVERY_FLOOR, 3], ['every 2nd floor', EVERY_SECOND, 8], ['every 3rd floor', EVERY_THIRD, 20]];
  const tell = (r: ReturnType<typeof scriptedPlay>) => r.trace.join('\n');

  for (const [name, depths, most] of PLAYERS) {
    it(`scripted play (${name}): unplayed memories after the finale ≤ ${most}`, () => {
      const r = scriptedPlay(depths);
      expect(r.oath, 'her choice is made before the finale').toBe(true);
      expect(r.unplayed.length, `${r.unplayed.join(' ')}\n${tell(r)}`).toBeLessThanOrEqual(most);
    });

    it(`scripted play (${name}): no night plays more than three memories beyond the owed ones, and the dawn plays`, () => {
      const r = scriptedPlay(depths, 3);
      for (const n of r.nights) expect(n.night.length, `${n.at}\n${tell(r)}`).toBeLessThanOrEqual(3);
      expect(r.dawns.length, tell(r)).toBeGreaterThan(0);   // one a departure at most, by construction
      // controller ruling 3 (2026-10-23): a reveal or confession night, its owed pieces and all, stays small
      for (const n of r.nights.filter((x) => x.alone)) expect(n.owed.length + n.night.length, `${n.at}\n${tell(r)}`).toBeLessThanOrEqual(5);
    });

    it(`scripted play (${name}): no owed memory is ever late, and the lone morning plays on a departure`, () => {
      const r = scriptedPlay(depths, 3);
      expect(r.late, tell(r)).toEqual([]);
      // review: the lone morning plays in town, not folded into the finale (measured: on the departure from depth 25)
      expect(typeof r.where['hero-alone'], tell(r)).toBe('number');
      expect(r.where['hero-alone'], tell(r)).not.toBe('finale');
    });

    it(`scripted play (${name}): each group scene plays on its act's arrival, and none after the finale`, () => {
      const r = scriptedPlay(depths, 3);
      for (const node of ACT_NODES) {
        expect(typeof r.where[node], `${node}\n${tell(r)}`).toBe('number');   // the act played on a return, not the finale
        expect(r.where[groupScene(node)], `${node}\n${tell(r)}`).toBe(r.where[node]);
      }
    });
  }

  it('scripted play (mainline-first): the group scenes played are recorded; each one missed has expired, none plays late', () => {
    // Controller ruling 2026-10-24: a player who rushes the main road skips the scenes that need the companions met
    // on the side roads. Recorded in task-4-6-report.md. A group that plays still plays inside its two chances.
    // Measured: every floor plays none of the three (acts 2 and 3 before their casts are met; act 4's second chance falls
    // on the reveal day); every 2nd floor plays only act 4's, on its own arrival (21).
    const measured: [number[], Partial<Record<SceneId, number>>][] = [[EVERY_FLOOR, {}], [EVERY_SECOND, { 'group:act4': 21 }]];
    for (const [depths, want] of measured) {
      const r = scriptedPlay(depths, 3, 'mainline-first');
      const played = Object.fromEntries(ACT_NODES.map((node) => [groupScene(node), r.where[groupScene(node)]]).filter(([, at]) => at !== undefined));
      expect(played, tell(r)).toEqual(want);
      for (const [g, at] of Object.entries(played)) {
        const act = r.where[g.slice('group:'.length) as SceneId] as number;
        expect([act, depths[depths.indexOf(act) + 1]], `${g}\n${tell(r)}`).toContain(at);   // inside its two chances
      }
      expect(Object.keys(r.s.story.reacts ?? {}), tell(r)).toEqual([]);
      expect(r.late, tell(r)).toEqual([]);
    }
  });

  it('scripted play: the script plays each return and departure as the real engine does (review)', () => {
    // `scriptedPlay` reimplements `Game.arrive` and `Game.departScenes`; on the very states each scripted play reached, the
    // engine must pick the same night, dawn, arrival and night order, the same departure scenes and the same eve.
    type Engine = { arrive(afterFinale?: boolean): void };
    Object.assign(REACTIONS, REACT);
    try {
      let arrivals = 0;
      let departures = 0;
      let dawned = 0;
      let eves = 0;
      for (const [depths, route] of [[EVERY_FLOOR, 'all'], [EVERY_SECOND, 'all'], [EVERY_THIRD, 'all'], [EVERY_FLOOR, 'mainline-first'], [EVERY_SECOND, 'mainline-first']] as const) {
        const r = scriptedPlay([...depths], 3, route);
        for (const a of r.arrivals) {
          const g = new Game(constRng(0.99), null, structuredClone(a.state));
          (g as unknown as Engine).arrive(a.afterFinale);
          const label = `${route} ${depths.length} returns, at ${a.at}`;
          expect(g.state.story.tonight, label).toEqual(a.tonight);
          expect(g.state.story.dawn, label).toBe(a.dawn);
          expect(g.arrival, label).toEqual(a.arrival);
          expect(g.night, label).toEqual(a.night);
          arrivals++;
        }
        for (const d of r.departures) {
          const g = new Game(constRng(0.99), null, structuredClone(d.state));
          const label = `${route} ${depths.length} returns, departing ${d.at}`;
          expect(g.departScenes(), label).toEqual(d.scenes);
          if (d.scenes.includes('finale-eve')) {
            expect(g.sceneDone('finale-eve', 'played'), label).toBe(true);
            expect(g.eve, label).toEqual(d.eve);
            expect(g.departScenes(), label).toEqual(d.scenes.filter((id) => id === 'hero-alone'));
          }
          departures++;
          if (d.scenes.some((id) => id.startsWith('mem:'))) dawned++;
          if (d.scenes.includes('finale-eve')) eves++;
        }
      }
      expect(arrivals).toBeGreaterThan(80);
      expect(departures).toBeGreaterThan(60);
      // final review: the cross-check covers each branch of the copied rule, the dawn and the eve, not only plain departures
      expect(dawned).toBeGreaterThan(10);
      expect(eves).toBeGreaterThanOrEqual(3);
    } finally {
      for (const k of Object.keys(REACT)) delete REACTIONS[k as keyof typeof REACT];
    }
  });

  it('scripted play (every floor): the beats of one playthrough fit the pool', () => {
    // spec §4.4.1: forty lines; the pool is written in Task 8, so until then the spec's forty is the bound
    const r = scriptedPlay(EVERY_FLOOR, 3);
    const beats = r.nights.reduce((a, n) => a + n.beats, 0);
    expect(beats, tell(r)).toBeLessThanOrEqual(NIGHT_BEATS.lines.length || 40);
  });

  // Story L Task 8 (cold read): a beat fits the memory before it, and one playthrough never hears a beat twice.
  for (const [name, depths] of [['every floor', EVERY_FLOOR], ['every 2nd floor', EVERY_SECOND], ['every 3rd floor', EVERY_THIRD]] as const) {
    it(`scripted play (${name}): every beat is taken, quiet after a heavy memory, and none twice in one playthrough`, () => {
      const r = scriptedPlay([...depths], 3);
      const tell2 = `${r.beats.map((b) => `${b.at} ${b.prev}${b.heavy ? '(heavy)' : ''} -> ${b.i} ${b.tone ?? '-'}`).join('\n')}`;
      expect(r.beats.length, tell2).toBe(r.nights.reduce((a, n) => a + n.beats, 0));
      expect(r.beats.filter((b) => b.i < 0), tell2).toEqual([]);
      expect(r.beats.filter((b) => b.heavy && b.tone !== 'quiet'), tell2).toEqual([]);
      const seen = r.beats.map((b) => b.i);
      expect(new Set(seen).size, tell2).toBe(seen.length);
    });
  }

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
    let s = withTold(base(), 'scarlet', 5);
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

describe('story L: told pieces and the met gate (Task 1)', () => {
  it("a companion's full and pieces read the pieces told, not held", () => {
    let s = withMemories(base(), 'safira', 2);
    s = withTold(s, 'safira', 1);
    expect(gateOpen(s, { pieces: { safira: 2 } })).toBe(false);
    s = withTold(s, 'safira', 2);
    expect(gateOpen(s, { pieces: { safira: 2 } })).toBe(true);
    const len = chainLength('safira');
    let f = withTold(withMemories(base(), 'safira', len), 'safira', len - 1);
    expect(gateOpen(f, { full: 'safira' })).toBe(false);
    expect(storyPieces(f, 'safira')).toBe(len - 1);
    f = withTold(f, 'safira', len);
    expect(gateOpen(f, { full: 'safira' })).toBe(true);
  });

  it('the hero and Rin read the pieces held', () => {
    const len = chainLength('hero');
    const s = withTold(withMemories(base(), 'hero', len), 'hero', len - 1);
    expect(gateOpen(s, { full: 'hero' })).toBe(true);
    expect(storyPieces(s, 'hero')).toBe(len);
    const r = withMemories(base(), 'rin', 4);
    expect(toldCount(r, 'rin')).toBe(0);
    expect(gateOpen(r, { pieces: { rin: 4 } })).toBe(true);
  });

  it('the reveal still queues once Rin holds all seven, some untold', () => {
    const s = withTold(withMemories(base(), 'rin', chainLength('rin')), 'rin', chainLength('rin') - 2);
    expect(toldCount(s, 'rin')).toBe(chainLength('rin') - 2);
    expect(onReturn(s).queue).toContain('rin-reveal');
  });

  it('a homecoming waits for her last piece told', () => {
    const len = chainLength('sylvie');
    const s = withTold(withMemories(base(), 'sylvie', len), 'sylvie', len - 1);
    expect(onReturn(s).queue).not.toContain('home:sylvie');
    expect(onReturn(withTold(s, 'sylvie', len)).queue).toContain('home:sylvie');
  });

  it('a met gate opens once every one named is met', () => {
    const s = base();
    expect(gateOpen(s, { met: ['selene', 'noel'] })).toBe(false);
    s.party = meet(s.party, 'selene', 1);
    expect(gateOpen(s, { met: ['selene', 'noel'] })).toBe(false);
    s.party = meet(s.party, 'noel', 1);
    expect(gateOpen(s, { met: ['selene', 'noel'] })).toBe(true);
    expect(gateOpen(s, { met: [] })).toBe(true);
  });

  it('toldCount counts her memory scenes in seen, in any order', () => {
    const s = withMemories(base(), 'noel', 3);
    s.story.seen.push('mem:noel:1', 'mem:noel:3', 'mem:selene:2', 'chat:noel:1');
    expect(toldCount(s, 'noel')).toBe(2);
    expect(toldCount(base(), 'noel')).toBe(0);
  });

  it('group ids are kind group, capped at fourteen, heavy', () => {
    expect(groupScene('act2')).toBe('group:act2');
    for (const node of ['act2', 'act3', 'act4'] as const) {
      const id = groupScene(node);
      expect(sceneKind(id)).toBe('group');
      expect(lineCap(id)).toBe(14);   // twelve in spec §5.1; fourteen since the cold read (room for a reaction after the turn)
      expect(heavyScene(id)).toBe(true);
    }
    expect(GROUP_MIN_LINES).toBe(8);
  });

  it('GROUP_GATE matches the cast table', () => {
    expect(GROUP_GATE).toEqual({
      'group:act2': { met: ['selene', 'noel'] },
      'group:act3': { met: ['sylvie', 'bobby'], beforeChoice: true },
      'group:act4': { met: ['liz', 'scarlet', 'chizuru', 'safira'] },
    });
    expect(REACTIONS).toEqual({});   // no group scene is written yet (Task 9-11 register them)
  });
});

describe('story L: pieces wait to be told (Task 2a)', () => {
  it('sceneDone takes a memory out of untold and tonight', () => {
    const s = withMemories(base(), 'rin', 2);
    s.story.untold = ['mem:rin:1', 'mem:rin:2'];
    s.story.tonight = ['mem:rin:1'];
    const done = sceneDone(s, 'mem:rin:1', 'played');
    expect(done.story.untold).toEqual(['mem:rin:2']);
    expect(done.story.tonight).toEqual([]);
    expect(done.story.seen).toContain('mem:rin:1');
    expect(sceneDone(base(), 'act2', 'played').story.untold).toBeUndefined();   // nothing added where there was nothing
  });

  it('the lone morning counts a ninth piece still untold', () => {
    const s = withMemories(base(), 'hero', 9);
    s.party.roster.rin.oath = true;
    expect(onReturn(s).queue).not.toContain('hero-alone');
    s.story.untold = ['mem:hero:9'];
    expect(onReturn(s).queue).toContain('hero-alone');
  });
});

describe('story L: the night before the descent (Task 3d)', () => {
  /** Her choice made, the acts and the keeper behind them, the main road reached to `reached`. */
  const chose = (reached: number): GameState => {
    const s = withMemories(base(), 'rin', chainLength('rin'));
    s.party.roster.rin.oath = true;
    s.story.seen.push('rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'act2', 'act3', 'act4');
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.dungeon.reached.mainline = reached;
    return s;
  };

  it('the eve is queued once her choice is made and the main road reaches twenty-six, never on an arrival', () => {
    const s = returned(chose(EVE_DEPTH));
    expect(EVE_DEPTH).toBe(26);
    expect(s.story.queue).toEqual(['finale-eve']);
    expect(arrivalScenes(s, { chat: true })).not.toContain('finale-eve');
    expect(arrivalScenes(s, { chat: false })).not.toContain('finale-eve');
    expect(returned(s).story.queue.filter((id) => id === 'finale-eve')).toHaveLength(1);   // once
    const told = chose(28);
    told.story.seen.push('finale-eve');
    expect(returned(told).story.queue).not.toContain('finale-eve');
    const after = chose(30);
    after.story.act1Cleared = true;
    after.story.finaleCleared = true;
    expect(returned(after).story.queue).not.toContain('finale-eve');
  });

  it('not before her choice, nor below twenty-six', () => {
    expect(returned(chose(EVE_DEPTH - 1)).story.queue).not.toContain('finale-eve');
    const before = chose(29);
    delete before.party.roster.rin.oath;
    before.story.seen = before.story.seen.filter((id) => id !== 'rin-reveal' && id !== 'rin-confess' && id !== 'bellkeeper-arrives');
    expect(returned(before).story.queue).not.toContain('finale-eve');
  });
});

describe('story L: the reaction slot (Task 5)', () => {
  const R = { act2: 'group:act2', act3: 'group:act3', act4: 'group:act4' } as const;
  const kinds = (ids: SceneId[]) => ids.filter((id) => id.startsWith('chat:') || id.startsWith('banter:'));
  /** In town with `ids` met (Lorne and Rin are), the act `node` reached and queued, the acts before it played. */
  const at = (node: 'act2' | 'act3' | 'act4' | null, ids: CharacterId[]): GameState => {
    const s = base();
    for (const id of ids) withMemories(s, id, 0);
    if (node) {
      s.dungeon.reached.mainline = ACT_DEPTHS[node];
      for (const n of ['act2', 'act3', 'act4'] as const) {
        if (ACT_DEPTHS[n] > ACT_DEPTHS[node]) continue;
        s.story.nodes.push(n);
        if (n === node) s.story.queue.push(n); else s.story.seen.push(n);
      }
    }
    return s;
  };
  const done = (s: GameState, id: SceneId): GameState => sceneDone(s, id, 'played', R);

  it('group:act2 plays on the arrival act2 plays, its cast met, and takes the chat and banter', () => {
    const s = at('act2', ['selene', 'noel', 'liz']);
    const day = arrivalScenes(s, { chat: true, reactions: R });
    expect(day).toEqual(['act2', 'group:act2']);
    expect(kinds(day)).toEqual([]);
    // the registry empty (no script yet), the arrival is what it was
    expect(arrivalScenes(s, { chat: true })).not.toContain('group:act2');
    expect(kinds(arrivalScenes(s, { chat: true })).length).toBeGreaterThan(0);
    expect(nextReaction(s, ['act2'], R)).toBe('group:act2');
    // the act said, it holds its group's chances; the group said, they are spent
    const after = done(s, 'act2');
    expect(after.story.reacts).toEqual({ 'group:act2': 0 });
    const heard = done(after, 'group:act2');
    expect(heard.story.reacts).toEqual({});
    expect(heard.story.seen).toContain('group:act2');
    // the chat and the banter come back on the next return
    const next = returned(heard);
    const nextDay = arrivalScenes(next, { chat: true, reactions: R });
    expect(nextDay).not.toContain('group:act2');
    expect(kinds(nextDay).length).toBeGreaterThan(0);
  });

  it('a group scene waits for its cast one more return, then expires', () => {
    // act 2's arrival: Noel not met, so no group, and the chat slot is as before
    let s = at('act2', ['selene']);
    const day = arrivalScenes(s, { chat: true, reactions: R });
    expect(day).not.toContain('group:act2');
    expect(day).toEqual(arrivalScenes(s, { chat: true }));
    s = done(s, 'act2');
    expect(s.story.reacts).toEqual({ 'group:act2': 0 });
    // the next return: its second chance
    s = returned(s);
    expect(s.story.reacts).toEqual({ 'group:act2': 1 });
    const met = withMemories(structuredClone(s), 'noel', 0);
    expect(arrivalScenes(met, { chat: true, reactions: R })).toEqual(['group:act2']);
    expect(arrivalScenes(s, { chat: true, reactions: R })).not.toContain('group:act2');   // still not met
    // one more return: gone, met or not
    s = returned(s);
    expect(s.story.reacts).toEqual({});
    withMemories(s, 'noel', 0);
    expect(arrivalScenes(s, { chat: true, reactions: R })).not.toContain('group:act2');
    expect(nextReaction(s, [], R)).toBeNull();
  });

  it("a group scene's second chance is lost when the next act plays", () => {
    const s = at('act3', ['selene', 'noel']);
    s.story.reacts = { 'group:act2': 1 };
    // the next act in the day: the group before it is passed over (and act 3's own needs Sylvie and Bobby)
    expect(nextReaction(s, ['act3'], R)).toBeNull();
    const day = arrivalScenes(s, { chat: true, reactions: R });
    expect(day[0]).toBe('act3');
    expect(day).not.toContain('group:act2');
    const zero = structuredClone(s);
    zero.story.reacts = { 'group:act2': 0 };
    expect(nextReaction(zero, ['act3'], R)).toBeNull();
    // and once the next act is said, the earlier group is gone: a reload does not bring it back after it
    const after = done(s, 'act3');
    expect(after.story.reacts).toEqual({ 'group:act3': 0 });
    expect(arrivalScenes(after, { chat: false, reactions: R })).toEqual([]);
    // with act 3's cast met as well, act 3's own group plays
    const cast = at('act3', ['selene', 'noel', 'sylvie', 'bobby']);
    cast.story.reacts = { 'group:act2': 0 };
    expect(nextReaction(cast, ['act3'], R)).toBe('group:act3');
  });

  it("group:act3 expires on Rin's choice", () => {
    const s = at('act3', ['sylvie', 'bobby']);
    expect(nextReaction(s, ['act3'], R)).toBe('group:act3');
    s.party.roster.rin.oath = true;
    expect(nextReaction(s, ['act3'], R)).toBeNull();
    s.story.reacts = { 'group:act3': 1 };
    expect(nextReaction(s, [], R)).toBeNull();
    expect(arrivalScenes(s, { chat: false, reactions: R })).not.toContain('group:act3');
  });

  it('no reaction on a reveal or a confession arrival, and that arrival spends a chance', () => {
    const s = at(null, ['selene', 'noel']);
    withMemories(s, 'rin', chainLength('rin'));
    s.story.seen.push('act2');
    s.story.nodes = ['act2'];
    s.dungeon.reached.mainline = ACT_DEPTHS.act2;
    s.story.reacts = { 'group:act2': 0 };
    const reveal = returned(s);
    expect(reveal.story.queue).toEqual(['rin-reveal']);
    expect(arrivalScenes(reveal, { chat: true, reactions: R })).toEqual(['rin-reveal']);
    expect(reveal.story.reacts).toEqual({ 'group:act2': 1 });
    const confess = returned(done(reveal, 'rin-reveal'));
    expect(arrivalScenes(confess, { chat: true, reactions: R })).toEqual(['rin-confess']);
    expect(confess.story.reacts).toEqual({});
  });

  it('a reload fills the reaction slot but no chat', () => {
    const s = at(null, ['selene', 'noel']);
    s.story.seen.push('act2');
    s.story.nodes = ['act2'];
    s.dungeon.reached.mainline = ACT_DEPTHS.act2;
    s.story.reacts = { 'group:act2': 0 };
    expect(arrivalScenes(s, { chat: false, reactions: R })).toEqual(['group:act2']);
    expect(arrivalScenes(s, { chat: false })).toEqual([]);
    expect(arrivalScenes(s, { chat: true, reactions: R })).toEqual(['group:act2']);
  });

  it('after the finale no act opens a chance and no group is offered (spec §4.8, §5.3)', () => {
    const s = at('act4', ['liz', 'scarlet', 'chizuru', 'safira']);
    s.story.act1Cleared = true;
    s.story.finaleCleared = true;
    expect(nextReaction(s, ['act4'], R)).toBeNull();
    expect(done(s, 'act4').story.reacts ?? {}).toEqual({});
    s.story.reacts = { 'group:act4': 0 };
    expect(nextReaction(s, [], R)).toBeNull();
  });
});

describe('time and moon: the calendar of a state (Task 1)', () => {
  it('calendarOf reads the day, the stage and the time given', () => {
    const s = base();
    expect(calendarOf(s)).toEqual({ day: 1, moon: 'waning', season: 'autumn', time: 'day' });
    s.story.day = 4;
    expect(calendarOf(s, 'night')).toEqual({ day: 4, moon: 'full', season: 'autumn', time: 'night' });
    // act 3 played: winter
    s.story.nodes = ['act2', 'act3'];
    s.story.seen.push('act2', 'act3');
    s.dungeon.reached.mainline = ACT_DEPTHS.act3;
    expect(calendarOf(s)).toMatchObject({ day: 4, moon: 'full', season: 'winter' });
    // still waiting in the queue, act 3 moves nothing yet
    s.story.queue = ['act3'];
    expect(calendarOf(s).season).toBe('autumn');
    s.story.queue = [];
    // the finale cleared on day 6: winter until springDay, then spring
    s.story.act1Cleared = true;
    s.story.finaleCleared = true;
    s.story.day = 6;
    s.story.springDay = 10;
    expect(calendarOf(s)).toMatchObject({ day: 6, moon: 'new', season: 'winter' });
    s.story.day = 10;
    expect(calendarOf(s)).toMatchObject({ day: 10, moon: 'new', season: 'spring' });
  });
});

describe('time and moon: the spring festival (Task 7)', () => {
  /** Task 8 wrote and registered the festival: the tests read the real registration. */
  const register = () => { expect(SEASON_SCENES.spring).toBe('season:spring'); };
  /** After the finale, Rin's choice made, Chizuru's five pieces told and (unless `home: false`) her homecoming seen; spring from `springDay`. */
  const after = (o: { day?: number; springDay?: number; home?: boolean } = {}): GameState => {
    const s = base();
    s.story.act1Cleared = true;
    s.story.finaleCleared = true;
    s.story.nodes = ['act2', 'act3', 'act4'];
    s.story.seen.push('prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'finale', 'epilogue');
    s.dungeon.reached.mainline = 30;
    withMemories(s, 'rin', chainLength('rin'));
    s.party.roster.rin.oath = true;
    withMemories(s, 'chizuru', chainLength('chizuru'));
    for (let n = 1; n <= chainLength('chizuru'); n++) s.story.seen.push(memScene('chizuru', n));
    if (o.home ?? true) s.story.seen.push('home:chizuru');
    s.story.day = o.day ?? 20;
    s.story.springDay = o.springDay ?? 20;
    return s;
  };

  it('the spring festival waits for spring and the shrine', () => {
    register();
    const s = after();
    expect(nextSeasonScene(s, dayOf(s))).toBe('season:spring');
    expect(arrivalScenes(s, { chat: true }).at(-1)).toBe('season:spring');
    // one condition short, none
    const before = after();
    before.story.finaleCleared = false;
    expect(arrivalScenes(before, { chat: true })).not.toContain('season:spring');
    expect(arrivalScenes(after({ day: 19 }), { chat: true })).not.toContain('season:spring');   // the night of day 19: winter
    expect(arrivalScenes(after({ home: false }), { chat: true })).not.toContain('season:spring');
    const seen = after();
    seen.story.seen.push('season:spring');
    expect(arrivalScenes(seen, { chat: true })).not.toContain('season:spring');
    // a reload never decides it again (Task 7 review): only what the return recorded plays, until seen
    expect(arrivalScenes(after({ day: 21 }), { chat: false })).not.toContain('season:spring');
    const recorded = after({ day: 21 });
    recorded.story.festival = 'season:spring';
    expect(arrivalScenes(recorded, { chat: false }).at(-1)).toBe('season:spring');
    recorded.story.seen.push('season:spring');
    expect(arrivalScenes(recorded, { chat: false })).not.toContain('season:spring');
    // after spring has come, it stays: any later return
    expect(arrivalScenes(after({ day: 400 }), { chat: true }).at(-1)).toBe('season:spring');
  });

  it('it never enters the queue', () => {
    register();
    const back = returned(after());
    expect(back.story.queue).not.toContain('season:spring');
    expect(arrivalScenes(back, { chat: true }).at(-1)).toBe('season:spring');
  });

  it('the return that plays the homecoming does not play the festival; the next spring return does', () => {
    register();
    const first = returned(after({ home: false }));
    expect(first.story.queue).toContain('home:chizuru');
    const day = arrivalScenes(first, { chat: true });
    expect(day).toContain('home:chizuru');
    expect(day).not.toContain('season:spring');
    const next = returned(sceneDone(first, 'home:chizuru', 'played'));
    expect(arrivalScenes(next, { chat: true }).at(-1)).toBe('season:spring');
  });

  it('no chat or banter follows the festival, after-finale banters included', () => {
    register();
    const s = after();
    for (const c of ['noel', 'selene', 'liz', 'scarlet', 'safira', 'sylvie', 'bobby'] as CharacterId[]) withMemories(s, c, 0);
    const heard = { ...s, story: { ...s.story, seen: [...s.story.seen, 'season:spring' as SceneId] } };
    const usual = arrivalScenes(heard, { chat: true });
    expect(usual.some((id) => id.startsWith('banter:') || id.startsWith('chat:')), usual.join(' ')).toBe(true);   // without it, the town talks
    const festival = arrivalScenes(s, { chat: true });
    expect(festival.at(-1)).toBe('season:spring');
    expect(festival.filter((id) => id.startsWith('banter:') || id.startsWith('chat:'))).toEqual([]);
  });

  it('it is not offered while unregistered', () => {
    const s = after();
    delete SEASON_SCENES.spring;
    try {
      expect(nextSeasonScene(s, dayOf(s))).toBeNull();
      expect(arrivalScenes(s, { chat: true })).not.toContain('season:spring');
    } finally {
      SEASON_SCENES.spring = 'season:spring';
    }
  });

  it('it is a night scene of the home kind, at most ten lines', () => {
    expect(sceneKind('season:spring')).toBe('home');
    expect(SCENE_TIME['season:spring']).toBe('night');
    expect(sceneTime('season:spring')).toBe('night');
    expect(lineCap('season:spring')).toBe(10);
    expect(isHeavyArrival('season:spring')).toBe(true);
    expect(isNightSlot('season:spring')).toBe(true);
    expect(isNightSlot('group:act2')).toBe(true);
    expect(isNightSlot('home:chizuru')).toBe(false);
  });
});

describe('heart-to-hearts in the story (bond plan Task 9)', () => {
  it("a bond scene marks the day's talk", () => {
    const s = base();
    s.story.day = 5;
    s.story.bondDay = 4;
    s.story.gifted = ['rin'];
    const after = sceneDone(s, 'bond:rin:1', 'played');
    expect([after.story.bondDay, after.story.talked, after.story.gifted]).toEqual([5, true, []]);   // yesterday's gifts cleared
    const same = base();
    same.story.day = 5;
    same.story.bondDay = 5;
    same.story.gifted = ['rin'];
    expect(sceneDone(same, 'bond:rin:1', 'skipped').story.gifted).toEqual(['rin']);   // today's kept
    expect(sceneDone(s, 'chat:rin:1', 'played').story.talked).toBeUndefined();   // only a bond scene
    expect(s.story.talked).toBeUndefined();
  });

  it('arrivalScenes is unchanged by bond', () => {
    const acts = (): GameState => { const s = base(); s.story.queue = ['mem:hero:10', 'town:anna', 'act4', 'mem:hero:7', 'act2']; return s; };
    const home = (): GameState => { const s = withMemories(base(), 'liz', chainLength('liz')); for (let k = 1; k <= chainLength('liz'); k++) s.story.seen.push(`mem:liz:${k}`); s.story.queue = ['home:liz']; return s; };
    const quiet = (): GameState => withMemories(base(), 'selene', 2);
    // measured on the code before bond plan Task 9, written down
    expect(arrivalScenes(acts(), { chat: false })).toEqual(['act2', 'mem:hero:7', 'mem:hero:10', 'town:anna']);
    expect(arrivalScenes(home(), { chat: true })).toEqual(['home:liz', 'chat:hero:1']);
    expect(arrivalScenes(quiet(), { chat: false })).toEqual([]);
    const bonded = (s: GameState): GameState => {
      for (const c of s.party.recruited) if (c !== 'hero') s.party.roster[c].bond = { talk: 12, field: 40, gifts: {} };
      s.story.bondDay = 1;
      s.story.talked = true;
      s.story.seen.push('bond:rin:1');
      return s;
    };
    expect(arrivalScenes(bonded(acts()), { chat: false })).toEqual(arrivalScenes(acts(), { chat: false }));
    expect(arrivalScenes(bonded(home()), { chat: true })).toEqual(arrivalScenes(home(), { chat: true }));
    expect(arrivalScenes(bonded(quiet()), { chat: false })).toEqual(arrivalScenes(quiet(), { chat: false }));
  });

  it('bond scenes never enter the queue', () => {
    const s = base();
    const done = sceneDone(s, 'bond:rin:1', 'played');
    expect(done.story.queue).toEqual([]);
    expect(onReturn(done).queue.some((q) => q.startsWith('bond:'))).toBe(false);
  });
});

// ---- bond plan Task 10: the states the after-finale tests read
/** After the finale, on the return the festival is owed: the act nodes passed, the festival queued. */
const finaleDone = (): GameState => {
  const s = base();
  s.story.act1Cleared = true;
  s.story.finaleCleared = true;
  s.dungeon.reached.mainline = 30;
  s.story.nodes = ['act2', 'act3', 'act4'];
  s.story.seen.push('prologue-inn', 'first-return', 'act1-after', 'act2', 'act3', 'act4', 'group:act2', 'group:act3', 'group:act4', 'finale');
  s.party.roster.rin.memories = chainLength('rin');
  s.party.roster.rin.oath = true;
  for (let k = 1; k <= chainLength('rin'); k++) s.story.seen.push(memOf('rin', k));
  for (let n = 1; n <= 4; n++) s.story.seen.push(`chat:rin:${n}` as SceneId);
  for (let n = 1; n <= 5; n++) s.story.seen.push(`chat:hero:${n}` as SceneId);
  s.story.seen.push('rin-reveal', 'rin-confess', 'bellkeeper-arrives', 'hero-alone', 'finale-eve');
  return s;
};
/** The return after the festival: it is seen; Liz met and whole, her homecoming seen. */
const afterFestival = (home = true): GameState => {
  const s = finaleDone();
  s.story.seen.push('epilogue');
  withMemories(s, 'liz', chainLength('liz'));
  for (let k = 1; k <= chainLength('liz'); k++) s.story.seen.push(memOf('liz', k));
  for (let n = 1; n <= 2; n++) s.story.seen.push(`chat:liz:${n}` as SceneId);
  if (home) s.story.seen.push('home:liz');
  return s;
};

describe('after the finale: the endings (bond plan Task 10)', () => {
  /** Endings registered for the test (the registry starts empty), put back after. */
  /** These after-stories registered, and only these (bond plan Task 20 registered all nine). */
  const withEndings = <T,>(cs: Companion[], f: () => T): T => { ENDINGS_WRITTEN.splice(0, ENDINGS_WRITTEN.length, ...cs); try { return f(); } finally { endingsBack(); } };
  const back = (s: GameState) => arrivalScenes(s, { chat: true, ending: (st) => nextEnding(st) });

  it("the festival's return is as it was", () => withEndings(['liz'], () => {
    const a = finaleDone();
    withMemories(a, 'liz', chainLength('liz'));
    for (let k = 1; k <= chainLength('liz'); k++) a.story.seen.push(memOf('liz', k));
    a.story.seen.push('home:liz');
    a.story.queue = ['epilogue'];
    // measured before bond plan Task 10: the festival, a light chat after it, no banter
    expect(arrivalScenes(a, { chat: true, afterFinale: true })).toEqual(['epilogue', 'chat:liz:1']);
    expect(arrivalScenes(a, { chat: true, afterFinale: true, ending: (st) => nextEnding(st) })).toEqual(['epilogue', 'chat:liz:1']);
    expect(nextEnding(a)).toBeNull();   // the festival not seen yet
  }));

  it("endings take the chat's place, from the next return", () => withEndings(['liz', 'noel'], () => {
    const s = afterFestival();
    expect(arrivalScenes(s, { chat: true })).toEqual([]);   // measured before: nothing owed, no chat, no banter (no pair met)
    expect(back(s)).toEqual(['ending:liz']);                 // no banter: no pair is met
    s.story.seen.push('ending:liz');
    expect(back(s)).toEqual([]);                             // Noel is not met
    withMemories(s, 'noel', chainLength('noel'));
    for (let k = 1; k <= chainLength('noel'); k++) s.story.seen.push(memOf('noel', k));
    for (let n = 1; n <= 2; n++) s.story.seen.push(`chat:noel:${n}` as SceneId);
    expect(nextEnding(s)).toBe('ending:noel');
    const order = back(s);
    expect(order[0]).toBe('ending:noel');
    expect(order.filter((x) => x.startsWith('banter:'))).toEqual(order.slice(1));   // an ending is light: banters may follow
  }));

  it("the spring festival's return plays no ending; the next return does", () => withEndings(['liz'], () => {
    const d = afterFestival();
    withMemories(d, 'chizuru', chainLength('chizuru'));
    for (let k = 1; k <= chainLength('chizuru'); k++) d.story.seen.push(memOf('chizuru', k));
    d.story.seen.push('home:chizuru', 'chat:chizuru:1', 'chat:chizuru:2');
    d.story.day = 30;
    d.story.springDay = 20;
    expect(SEASON_SCENES.spring).toBe('season:spring');
    expect(nextEnding(d)).toBe('ending:liz');
    expect(back(d)).toEqual(['season:spring']);   // measured before: the festival alone
    d.story.seen.push('season:spring');
    const next = back(d);
    expect(next[0]).toBe('ending:liz');
    expect(next.slice(1).every((x) => x.startsWith('banter:'))).toBe(true);
  }));

  it('a homecoming and its ending never share an arrival', () => withEndings(['liz'], () => {
    const c = afterFestival(false);
    c.story.queue = ['home:liz'];
    expect(back(c)).toEqual(['home:liz']);   // measured before, and still no ending with it
    c.story.queue = [];
    c.story.seen.push('home:liz');
    expect(back(c)).toEqual(['ending:liz']);
  }));

  it("Chizuru's ending waits for the spring festival", () => withEndings(['chizuru'], () => {
    const s = afterFestival();
    withMemories(s, 'chizuru', chainLength('chizuru'));
    for (let k = 1; k <= chainLength('chizuru'); k++) s.story.seen.push(memOf('chizuru', k));
    s.story.seen.push('home:chizuru');
    expect(nextEnding(s)).toBeNull();   // the festival is registered and not seen
    s.story.seen.push('season:spring');
    expect(nextEnding(s)).toBe('ending:chizuru');
    const spring = SEASON_SCENES.spring;
    s.story.seen.pop();
    delete SEASON_SCENES.spring;
    try { expect(nextEnding(s)).toBe('ending:chizuru'); } finally { SEASON_SCENES.spring = spring; }   // none registered: no wait
  }));

  it('an ending needs no bond; a late meeting still gets hers; none before the finale; unwritten ones are passed over', () => withEndings(['liz', 'sylvie'], () => {
    const s = afterFestival();
    expect(s.party.roster.liz.bond).toBeUndefined();   // 10 + 15: no record at all
    expect(nextEnding(s)).toBe('ending:liz');
    const late = afterFestival();
    late.party.recruited = late.party.recruited.filter((c) => c !== 'liz');
    expect(nextEnding(late)).toBeNull();
    withMemories(late, 'sylvie', chainLength('sylvie'));   // met after the finale
    for (let k = 1; k <= chainLength('sylvie'); k++) late.story.seen.push(memOf('sylvie', k));
    late.story.seen.push('home:sylvie');
    expect(nextEnding(late)).toBe('ending:sylvie');
    const early = afterFestival();
    early.story.finaleCleared = false;
    expect(nextEnding(early)).toBeNull();
    const noFestival = afterFestival();
    noFestival.story.seen = noFestival.story.seen.filter((x) => x !== 'epilogue');
    expect(nextEnding(noFestival)).toBeNull();
    expect(nextEnding(afterFestival(), [])).toBeNull();   // not written
    expect(nextEnding(afterFestival())).toBe('ending:liz');
  }));

  it('a queued romance is heavy', () => {
    const s = afterFestival();
    withMemories(s, 'noel', 1);
    withMemories(s, 'selene', 1);
    expect(arrivalScenes(s, { chat: true }).some((x) => x.startsWith('banter:'))).toBe(true);
    s.story.queue = ['romance:liz'];
    const r = arrivalScenes(s, { chat: true });
    expect(r[0]).toBe('romance:liz');
    expect(r.some((x) => x.startsWith('banter:'))).toBe(false);
  });

  it('the night, the dawn and the reactions are untouched', () => {
    const s = afterFestival();
    // one of Lorne's pieces held and untold, so the night and the dawn have something to pick
    s.party.roster.hero.memories = 2;
    s.story.seen.push('mem:hero:1');
    s.story.untold = ['mem:hero:2'];
    const plain = arrivalScenes(s, { chat: true });
    const pick = () => withEndings(['liz'], () => back(s));
    const ending = pick();
    expect(ending).toEqual([...plain, 'ending:liz']);
    expect(planNight(s, ending)).toEqual(planNight(s, plain));
    // the dawn as Game.arrive picks it, from the night each list plans (review fix: no longer the same call twice)
    const tonight = (day: SceneId[]) => { const p = planNight(s, day); return [...p.before, ...p.night]; };
    expect(dawnMemory(s, tonight(ending))).toEqual(dawnMemory(s, tonight(plain)));
    expect(tonight(plain).length + (dawnMemory(s, tonight(plain)) ? 1 : 0)).toBe(1);   // the piece is the night's or the dawn's
    expect(nextReaction(s, ending)).toEqual(nextReaction(s, plain));
    expect(nextSeasonScene(s, dayOf(s))).toBeNull();
  });
});

describe('a romance cut short, in the story (bond plan Task 11)', () => {
  it('the queue still ranks a romance as a day scene', () => {
    const s = afterFestival();
    s.story.queue = ['romance:liz'];
    expect(arrivalScenes(s, { chat: true })).toEqual(['romance:liz']);   // moving it to the night is Game's
    expect(arrivalScenes(s, { chat: false })).toEqual(['romance:liz']);
    expect(isNightSlot('romance:liz')).toBe(true);
    expect(isNightSlot('ending:liz')).toBe(false);
  });
});
