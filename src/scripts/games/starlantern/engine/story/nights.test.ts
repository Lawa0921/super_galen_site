import { describe, expect, it } from 'vitest';
import type { ScriptLine } from '../../data/story.zh-TW';
import { memScene, type SceneId } from '../../data/story/scenes';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { continuing, eveMemories, nextBeat, nightCap, owedPieces, pickMemories, planNight, restoreNight, type NightBeats } from './nights';

/** A new game with the prologue behind it. */
const base = (): GameState => {
  const s = newGame();
  s.story.queue = [];
  s.story.seen = ['prologue'];
  return s;
};
/** `id`'s owner met and holding at least that piece, the pieces before it told. */
const holds = (s: GameState, id: SceneId): void => {
  const [, c, k] = id.split(':') as [string, CharacterId, string];
  if (!s.party.recruited.includes(c)) s.party = meet(s.party, c, 1);
  const m = s.party.roster[c];
  m.memories = Math.max(m.memories ?? 0, Number(k));
  for (let n = 1; n < Number(k); n++) {
    const told = memScene(c, n);
    if (!s.story.seen.includes(told) && !ids.includes(told)) s.story.seen.push(told);
  }
};
let ids: SceneId[] = [];
/** A game whose untold memories are `list`, in pickup order (each owner met, holding it, the earlier ones told). */
const untold = (list: SceneId[], prep?: (s: GameState) => void): GameState => {
  const s = base();
  ids = list;
  prep?.(s);
  for (const id of list) holds(s, id);
  s.story.untold = [...list];
  return s;
};
const m = (c: CharacterId, k: number) => memScene(c, k);
const allWarm = () => 'warm' as const;
const allHeavy = () => 'heavy' as const;

describe('story L: the night planner (Task 3a)', () => {
  it('Lorne and Rin first', () => {
    // backlog 5, cap 2
    const s = untold([m('selene', 2), m('hero', 3), m('rin', 4), m('safira', 2), m('noel', 1)]);
    expect(planNight(s, [])).toEqual({ before: [], night: [m('hero', 3), m('rin', 4)] });
  });

  it('with a backlog of three, only Lorne plays', () => {
    // backlog 3, cap 1
    const s = untold([m('selene', 2), m('hero', 3), m('rin', 4)]);
    expect(planNight(s, [])).toEqual({ before: [], night: [m('hero', 3)] });
  });

  it("a companion in today's chat, banter or group scene goes ahead of one who waited longer", () => {
    // backlog 4, cap 2: Safira and Sylvie waited longest
    const list = [m('safira', 1), m('sylvie', 1), m('noel', 1), m('selene', 1)];
    const s = untold(list);
    expect(planNight(s, []).night).toEqual([m('safira', 1), m('sylvie', 1)]);
    expect(planNight(s, ['chat:noel:1']).night).toEqual([m('noel', 1), m('safira', 1)]);
    expect(planNight(s, ['banter:noel-selene:1']).night).toEqual([m('noel', 1), m('selene', 1)]);
    expect(planNight(s, ['group:act2']).night).toEqual([m('noel', 1), m('selene', 1)]);
    expect(continuing(s, 'noel', ['chat:noel:1'])).toBe(true);
    expect(continuing(s, 'safira', ['chat:noel:1'])).toBe(false);
  });

  it('a companion whose next piece opens her next banter goes ahead', () => {
    // backlog 4, cap 2. Noel has told two; her third opens `banter:noel-selene:2` (pieces: { noel: 3 }), the pair's next.
    const s = untold([m('safira', 1), m('sylvie', 1), m('noel', 3), m('bobby', 1)], (st) => {
      st.party = meet(st.party, 'selene', 1);
      st.story.seen.push('banter:noel-selene:1');
    });
    expect(continuing(s, 'noel', [])).toBe(true);
    expect(continuing(s, 'safira', [])).toBe(false);
    expect(planNight(s, []).night).toEqual([m('noel', 3), m('safira', 1)]);
    // without Selene met the banter cannot open: Noel waits her turn
    const alone = untold([m('safira', 1), m('sylvie', 1), m('noel', 3), m('bobby', 1)], (st) => { st.story.seen.push('banter:noel-selene:1'); });
    expect(continuing(alone, 'noel', [])).toBe(false);
  });

  it('waited longest is pickup order, then roster order', () => {
    // backlog 4, cap 2
    expect(planNight(untold([m('bobby', 1), m('noel', 1), m('selene', 1), m('safira', 1)]), []).night).toEqual([m('bobby', 1), m('noel', 1)]);
    expect(planNight(untold([m('selene', 1), m('safira', 1), m('noel', 1), m('bobby', 1)]), []).night).toEqual([m('selene', 1), m('safira', 1)]);
  });

  it('nightCap follows the backlog', () => {
    expect([0, 1, 3, 4, 6, 7, 30].map(nightCap)).toEqual([0, 1, 1, 2, 2, 3, 3]);
  });

  it('the cap leaves out the owed pieces', () => {
    // seven untold, two owed: backlog 5, cap 2
    const s = untold([m('hero', 3), m('selene', 1), m('noel', 1), m('hero', 4), m('safira', 1), m('sylvie', 1), m('bobby', 1)]);
    expect(planNight(s, ['act3'])).toEqual({ before: [m('hero', 3), m('hero', 4)], night: [m('selene', 1), m('noel', 1)] });
  });

  it('owed pieces play before the act that needs them, Lorne and Rin interleaved', () => {
    const s = untold([m('hero', 3), m('hero', 4), m('rin', 4), m('rin', 5), m('selene', 1)]);
    const want = [m('hero', 3), m('rin', 4), m('hero', 4), m('rin', 5)];
    for (const day of [['act2'], ['act3', 'chat:selene:1'], ['act4'], ['bellkeeper-arrives']] as SceneId[][]) expect(owedPieces(s, day)).toEqual(want);
    expect(owedPieces(s, ['chat:selene:1'])).toEqual([]);
    expect(planNight(s, ['act2']).before).toEqual(want);
    // backlog 1 after the owed four: one more
    expect(planNight(s, ['act2']).night).toEqual([m('selene', 1)]);
  });

  it("Rin's untold pieces all play before her reveal, beyond the cap; Lorne's wait", () => {
    const s = untold([m('rin', 6), m('selene', 1), m('hero', 5), m('noel', 1), m('rin', 7), m('safira', 1), m('bobby', 1)]);
    const plan = planNight(s, ['rin-reveal']);
    expect(plan).toEqual({ before: [m('rin', 6), m('rin', 7)], night: [] });
    expect(s.story.untold).toContain(m('hero', 5));
  });

  it('the confession day owes only Rin\'s, and plays nothing else', () => {
    const s = untold([m('hero', 5), m('selene', 1), m('safira', 1), m('noel', 1)]);
    expect(planNight(s, ['rin-confess'])).toEqual({ before: [], night: [] });
  });

  it("while the lone morning is queued, Lorne's ninth is owed on any arrival", () => {
    const s = untold([m('hero', 8), m('selene', 1), m('hero', 9), m('noel', 1)], (st) => { st.story.queue = ['hero-alone']; });
    const plan = planNight(s, ['chat:selene:1']);
    expect(plan.before).toEqual([m('hero', 8), m('hero', 9)]);
    expect(plan.night).toEqual([m('selene', 1)]);   // backlog 2, cap 1
    expect(owedPieces({ ...s, story: { ...s.story, queue: [] } }, ['chat:selene:1'])).toEqual([]);
  });

  it('never the same one twice in a row; a companion once a night; Lorne or Rin at most twice, apart', () => {
    // backlog 7, cap 3
    const s = untold([m('hero', 3), m('hero', 4), m('selene', 1), m('selene', 2), m('noel', 1), m('safira', 1), m('bobby', 1)]);
    expect(pickMemories(s, [], 3, [], allWarm)).toEqual([m('hero', 3), m('selene', 1), m('hero', 4)]);
    // two a night cannot hold Lorne twice apart: his second waits
    expect(pickMemories(s, [], 2, [], allWarm)).toEqual([m('hero', 3), m('selene', 1)]);
    // Lorne and Rin twice each: three a night hold two of one, one of the other, never side by side
    const both = untold([m('hero', 3), m('hero', 4), m('rin', 4), m('rin', 5), m('selene', 1), m('noel', 1), m('safira', 1)]);
    const night = pickMemories(both, [], 3, [], allWarm);
    expect(night).toEqual([m('hero', 3), m('rin', 4), m('hero', 4)]);
    // nobody to stand between: one of Lorne's only
    expect(pickMemories(untold([m('hero', 3), m('hero', 4)]), [], 3, [], allWarm)).toEqual([m('hero', 3)]);
  });

  it('three a night hold a warm one when a warm candidate exists', () => {
    // backlog 7, cap 3: the first three are heavy, the fourth warm
    const list = [m('selene', 1), m('noel', 1), m('safira', 1), m('bobby', 1), m('sylvie', 1), m('liz', 1), m('scarlet', 1)];
    const s = untold(list);
    const tone = (id: SceneId) => (id === m('bobby', 1) || id === m('liz', 1) ? 'warm' as const : 'heavy' as const);
    expect(pickMemories(s, [], 3, [], tone)).toEqual([m('selene', 1), m('noel', 1), m('bobby', 1)]);
    // none warm: the first three stay
    expect(pickMemories(s, [], 3, [], allHeavy)).toEqual([m('selene', 1), m('noel', 1), m('safira', 1)]);
    // two a night are left alone
    expect(pickMemories(s, [], 2, [], tone)).toEqual([m('selene', 1), m('noel', 1)]);
  });

  it('a closing piece plays last', () => {
    // backlog 4, cap 2: Selene's fifth closes her chain
    const s = untold([m('selene', 5), m('noel', 1), m('safira', 1), m('bobby', 1)]);
    expect(planNight(s, []).night).toEqual([m('noel', 1), m('selene', 5)]);
  });

  describe('the beat between two memories (spec §4.4.1)', () => {
    const N = (text: string): ScriptLine => ({ who: 'narrator', text });
    const L = (who: CharacterId, text: string): ScriptLine => ({ who, text });
    const pool: NightBeats = { lines: [L('noel', 'n1'), L('selene', 's1'), L('safira', 'f1'), N('night1')] };

    it('a beat is the first fitting line from the cursor: never a memory\'s owner, an unmet one skipped, narration always fits; the cursor wraps', () => {
      const s = untold([m('noel', 1), m('safira', 1)]);
      // Noel owns the one before, Selene is not met, Safira owns the next: the narration
      expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: N('night1'), at: 3 });
      s.party = meet(s.party, 'selene', 1);
      expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: L('selene', 's1'), at: 1 });
      // from the cursor on
      s.story.beat = 2;
      expect(nextBeat(s, m('noel', 1), m('selene', 1), pool)).toEqual({ line: L('safira', 'f1'), at: 2 });
      // past the end it wraps to the start
      s.story.beat = 1;
      expect(nextBeat(s, m('selene', 1), m('safira', 1), { lines: [L('noel', 'n1'), L('safira', 'f1')] })).toEqual({ line: L('noel', 'n1'), at: 0 });
      // nothing fits, or no pool: none
      expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [L('noel', 'n1'), L('safira', 'f1')] })).toBeNull();
      expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [] })).toBeNull();
      expect(nextBeat(s, m('noel', 1), m('safira', 1))).toBeNull();   // the pool is written later (Task 8)
    });

    it('a beat is the same after a reload', () => {
      const s = untold([m('noel', 1), m('safira', 1)], (st) => { st.party = meet(st.party, 'selene', 1); });
      s.story.beat = 1;
      const again = JSON.parse(JSON.stringify(s)) as GameState;
      expect(nextBeat(again, m('noel', 1), m('safira', 1), pool)).toEqual(nextBeat(s, m('noel', 1), m('safira', 1), pool));
    });
  });

  it("eveMemories picks up to three companions' pieces by the night order", () => {
    // backlog 8 (Lorne's ninth aside, the finale's)
    const list = [m('hero', 9), m('selene', 1), m('noel', 1), m('safira', 1), m('bobby', 1), m('sylvie', 1), m('liz', 1), m('scarlet', 1)];
    const s = untold(list);
    const eve = eveMemories(s);
    expect(eve).toHaveLength(3);
    expect(eve.every((id) => !id.startsWith('mem:hero:') && !id.startsWith('mem:rin:') && list.includes(id))).toBe(true);
    expect(eve).toEqual(pickMemories(s, [], 3, [m('hero', 9)]));
    expect(eve.slice(0, 2)).toEqual([m('selene', 1), m('noel', 1)]);
    expect(eveMemories(untold([m('hero', 9), m('selene', 1)]))).toEqual([m('selene', 1)]);
    expect(eveMemories(untold([]))).toEqual([]);
  });

  it('restoreNight reads what tonight still holds; owed pieces lead again', () => {
    const s = untold([m('hero', 3), m('selene', 1), m('noel', 1), m('safira', 1)]);
    s.story.tonight = [m('hero', 3), m('selene', 1), m('noel', 1)];
    expect(restoreNight(s, ['act2'])).toEqual({ before: [m('hero', 3)], night: [m('selene', 1), m('noel', 1)] });
    expect(restoreNight(s, [])).toEqual({ before: [], night: [m('hero', 3), m('selene', 1), m('noel', 1)] });
    // one told since: only the rest
    s.story.seen.push(m('selene', 1));
    s.story.untold = s.story.untold!.filter((id) => id !== m('selene', 1));
    s.story.tonight = s.story.tonight.filter((id) => id !== m('selene', 1));
    expect(restoreNight(s, [])).toEqual({ before: [], night: [m('hero', 3), m('noel', 1)] });
    expect(restoreNight(base(), [])).toEqual({ before: [], night: [] });
  });

  it('planNight is pure: the same state gives the same plan, nothing written, no rng', () => {
    const s = untold([m('hero', 3), m('selene', 1), m('rin', 4), m('noel', 1), m('safira', 1), m('bobby', 1), m('sylvie', 1), m('liz', 1)]);
    const before = JSON.stringify(s);
    const a = planNight(s, ['act2']);
    const b = planNight(s, ['act2']);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(before);
    eveMemories(s); restoreNight(s, ['act2']); pickMemories(s, [], 3);
    expect(JSON.stringify(s)).toBe(before);
  });
});
