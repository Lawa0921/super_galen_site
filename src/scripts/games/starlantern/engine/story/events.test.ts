import { describe, it, expect } from 'vitest';
import { ACT_DEPTHS, BANTER_COUNT, BANTER_GATE, BANTER_PAIRS, CHAT_GATE, CLOSING_PIECES, HEAVY_ARRIVAL, isHeavyArrival, type BanterPair, type SceneId } from '../../data/story/scenes';
import { chainLength } from '../../data/story/chains';
import { CHARACTER_IDS } from '../../data/characters';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { arrivalScenes, banterOpen, chatOpen, markRead, nextBanter, nextChat, onReturn, sceneDone, settleBellkeeper, settleOpening, storyStage, afterWin } from './events';

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
    // B1: Noel and Rin are both met, so their banter follows the one chat.
    expect(arrivalScenes(s, { chat: true })).toEqual(['chat:noel:1', 'banter:noel-rin:1']);
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
      'bobby-chizuru', 'bobby-liz', 'bobby-noel', 'bobby-sylvie', 'chizuru-rin', 'chizuru-safira', 'chizuru-scarlet', 'liz-noel', 'liz-scarlet',
      'liz-selene', 'noel-rin', 'noel-selene', 'rin-scarlet', 'rin-sylvie', 'safira-scarlet', 'safira-sylvie', 'scarlet-selene', 'selene-sylvie',
    ]);
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

  it('one banter per return, after the chat, behind every light story scene a return can bring', () => {
    const s = meetAll(base(), ['noel', 'safira', 'sylvie', 'liz', 'scarlet']);
    s.party.roster.safira.memories = chainLength('safira');
    // fix round 3: a middle memory piece is light; only the closing pieces are heavy
    s.story.queue = ['home:safira', 'town:orik', 'mem:noel:2', 'first-return', 'act1-after', 'mem:hero:7', 'prologue-inn'];
    const order = arrivalScenes(s, { chat: true });
    const story = ['prologue-inn', 'first-return', 'act1-after', 'mem:hero:7', 'town:orik', 'mem:noel:2', 'home:safira'];
    expect(order.slice(0, 7)).toEqual(story);
    expect(order[7]).toMatch(/^chat:/);
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
    expect([...HEAVY_ARRIVAL]).toEqual(expect.arrayContaining(['rin-reveal', 'bellkeeper-arrives', 'act2', 'act3', 'act4', ...CLOSING_PIECES, 'ending:', 'romance:', 'epilogue']));
    expect(HEAVY_ARRIVAL).not.toContain('mem:');
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
    for (const id of ['rin-reveal', 'bellkeeper-arrives', 'act3', 'mem:noel:5', 'mem:hero:9', 'mem:rin:6', 'epilogue', 'ending:noel', 'romance:rin']) expect(isHeavyArrival(id), id).toBe(true);
    // her homecoming stays light (her happy ending, the warm line last), and so do the middle pieces
    for (const id of ['mem:noel:4', 'mem:hero:8', 'mem:rin:5', 'mem:rin:1', 'mem:hero:1']) expect(isHeavyArrival(id), id).toBe(false);
    for (const id of ['first-return', 'act1-after', 'prologue-inn', 'home:safira', 'home:liz', 'town:orik', 'chat:noel:1', 'banter:noel-rin:1']) expect(isHeavyArrival(id), id).toBe(false);
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
    expect(played).toEqual([
      'banter:liz-scarlet:1', 'banter:noel-rin:1', 'banter:safira-sylvie:1',
      'banter:noel-rin:2', 'banter:safira-sylvie:2', 'banter:noel-rin:3',
    ]);
    expect(nextBanter(s, {}, count)).toBeNull();   // all played: none repeats on a return (the handbook replays them)
  });

  it('a pair met late catches up before the others talk again', () => {
    const count: Partial<Record<BanterPair, number>> = { 'liz-scarlet': 2, 'noel-rin': 2 };
    const s = meetAll(base(), ['noel']);
    s.story.seen.push('banter:noel-rin:1');
    meetAll(s, ['liz', 'scarlet']);
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

  it('every pair counted has at least one banter', () => {
    for (const p of BANTER_PAIRS) expect(BANTER_COUNT[p]!, p).toBeGreaterThan(0);
  });
});
