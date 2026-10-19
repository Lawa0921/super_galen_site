import { describe, it, expect } from 'vitest';
import { ACT_DEPTHS, CHAT_GATE } from '../../data/story/scenes';
import { chainLength } from '../../data/story/chains';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { arrivalScenes, chatOpen, markRead, nextChat, onReturn, sceneDone, settleBellkeeper, settleOpening, storyStage, afterWin } from './events';

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
    // continuity fix 4: the bellkeeper comes on the next return, after the act that waited
    expect(arrivalScenes(returned(done), { chat: false })).toEqual(['act2', 'bellkeeper-arrives']);
  });

  it("her choice sends the bellkeeper to town on the next arrival, once, played, skipped or auto", () => {
    for (const how of ['played', 'skipped', 'auto'] as const) {
      const done = sceneDone(returned(withMemories(base(), 'rin', chainLength('rin'))), 'rin-reveal', how);
      expect(done.story.queue, how).toEqual(['bellkeeper-arrives']);
      expect(arrivalScenes(done, { chat: false }), how).toEqual(['bellkeeper-arrives']);   // the reload or the next return
      const met = sceneDone(returned(done), 'bellkeeper-arrives', 'played');
      expect(returned(met).story.queue, how).toEqual([]);
      expect(sceneDone(met, 'rin-reveal', how).story.queue, how).toEqual([]);   // a replay from the handbook sends no one again
    }
    // he comes after the acts and before the hero's late memories
    const s = base();
    s.story.queue = ['mem:hero:9', 'bellkeeper-arrives', 'act4'];
    expect(arrivalScenes(s, { chat: false })).toEqual(['act4', 'bellkeeper-arrives', 'mem:hero:9']);
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
    expect(settleBellkeeper(waiting)).toBe(waiting);   // queued: this version, untouched
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
    expect(arrivalScenes(s, { chat: true })).toEqual(['chat:noel:1']);
  });

  it('a chat waits for the one before it, and a spent character offers none', () => {
    const s = base();
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4', 'chat:rin:1', 'chat:rin:2', 'chat:rin:3', 'chat:rin:4');
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
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4');
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
    s.story.seen.push('chat:hero:1', 'chat:hero:2', 'chat:hero:3', 'chat:hero:4');
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
