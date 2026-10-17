import { describe, it, expect } from 'vitest';
import { ACT_DEPTHS } from '../../data/story/scenes';
import { chainLength } from '../../data/story/chains';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { arrivalScenes, markRead, nextChat, onReturn, sceneDone, storyStage } from './events';

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
    expect(arrivalScenes(s, { chat: false })).toEqual(['act2', 'act4', 'mem:hero:7', 'mem:hero:10', 'town:anna']);
  });

  it("Rin's reveal plays alone on the first return after her seventh piece", () => {
    const s = withMemories(base(), 'rin', chainLength('rin'));
    s.story.queue = ['act2'];
    const back = returned(s);
    expect(back.story.queue).toEqual(['act2', 'rin-reveal']);
    expect(arrivalScenes(back, { chat: true })).toEqual(['rin-reveal']);
    const done = sceneDone(back, 'rin-reveal', 'played');
    expect(arrivalScenes(returned(done), { chat: false })).toEqual(['act2']);
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
    expect(nextChat(s)).toBe('chat:hero:1');
    s.story.seen.push('chat:hero:1');
    expect(nextChat(s)).toBe('chat:rin:1');
    s.story.seen.push('chat:rin:1');
    expect(nextChat(s)).toBe('chat:hero:2');   // tied at one each, so CHARACTER_IDS breaks it
    s.party = meet(s.party, 'noel', 1);
    expect(nextChat(s)).toBe('chat:noel:1');   // nobody has heard from her yet
    expect(arrivalScenes(s, { chat: true })).toEqual(['chat:noel:1']);
  });

  it('a chat waits for the one before it, and a spent character offers none', () => {
    const s = base();
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4');
    expect(nextChat(s)).toBeNull();
    const t = base();
    t.story.seen.push('chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4', 'chat:hero:2');   // the second was seen without the first: the first is the one offered
    expect(nextChat(t)).toBe('chat:hero:1');
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
