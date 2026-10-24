import { describe, expect, it } from 'vitest';
import type { ScriptLine } from '../../data/story.zh-TW';
import { NIGHT_RANK, memScene, type SceneId } from '../../data/story/scenes';
import { meet } from '../party';
import { newGame, type GameState } from '../state';
import type { CharacterId } from '../types';
import { NIGHT_BEATS } from '../../data/story.zh-TW';
import { DAWN_BACKLOG, continuing, dawnMemory, eveMemories, nextBeat, nightCap, orderNight, owedPieces, pickMemories, planNight, restoreNight, type NightBeats } from './nights';
import { tonightMoon } from '../calendar';
import type { MoonPhase } from '../../data/story/chains';
import type { NightBeat } from '../../data/story.zh-TW';

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

  it("on Rin's confession day nobody else's piece is owed, the lone morning queued or not (review)", () => {
    // spec §4.3: an ALONE day owes Rin's only; the lone morning's hero pieces wait for the next arrival that is not ALONE
    const s = untold([m('hero', 8), m('selene', 1), m('hero', 9), m('noel', 1)], (st) => { st.story.queue = ['hero-alone']; });
    expect(owedPieces(s, ['rin-confess'])).toEqual([]);
    expect(planNight(s, ['rin-confess'])).toEqual({ before: [], night: [] });
    expect(owedPieces(s, ['rin-reveal'])).toEqual([]);
    expect(owedPieces(s, ['chat:selene:1'])).toEqual([m('hero', 8), m('hero', 9)]);   // the next arrival owes them
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
      // the default pool is the written one (Task 8): narration always fits, so a night of two memories always has a beat
      expect(nextBeat(s, m('noel', 1), m('safira', 1))).toEqual(nextBeat(s, m('noel', 1), m('safira', 1), NIGHT_BEATS));
      expect(nextBeat(s, m('noel', 1), m('safira', 1))).not.toBeNull();
    });

    it('a beat is the same after a reload', () => {
      const s = untold([m('noel', 1), m('safira', 1)], (st) => { st.party = meet(st.party, 'selene', 1); });
      s.story.beat = 1;
      const again = JSON.parse(JSON.stringify(s)) as GameState;
      expect(nextBeat(again, m('noel', 1), m('safira', 1), pool)).toEqual(nextBeat(s, m('noel', 1), m('safira', 1), pool));
    });

    // Story L Task 8 (cold read): a beat fits the memory it follows. After a heavy memory only a quiet beat; a lively one
    // (a joke, a show-off, clapping) only after a warm memory. An untagged line fits either.
    it('after a heavy memory only a quiet beat; a lively one only after a warm memory; the cursor skips ahead to it', () => {
      const Q = (text: string): ScriptLine & { tone: 'quiet' } => ({ who: 'narrator', text, tone: 'quiet' });
      const J = (text: string): ScriptLine & { tone: 'lively' } => ({ who: 'narrator', text, tone: 'lively' });
      const toned: NightBeats = { lines: [J('j0'), J('j1'), Q('q2'), J('j3'), Q('q4')] };
      const s = untold([m('noel', 1), m('safira', 1)]);
      const heavy = (id: SceneId) => (id === m('noel', 1) ? 'heavy' as const : 'warm' as const);
      // the memory before is heavy: the lively lines are passed over, from the cursor on
      expect(nextBeat(s, m('noel', 1), m('safira', 1), toned, heavy)).toEqual({ line: Q('q2'), at: 2 });
      s.story.beat = 3;
      expect(nextBeat(s, m('noel', 1), m('safira', 1), toned, heavy)).toEqual({ line: Q('q4'), at: 4 });
      s.story.beat = 0;
      // the memory before is warm: any line fits, the cursor's first
      expect(nextBeat(s, m('safira', 1), m('noel', 1), toned, heavy)).toEqual({ line: J('j0'), at: 0 });
      expect(nextBeat(s, m('noel', 1), m('safira', 1), toned, allWarm)).toEqual({ line: J('j0'), at: 0 });
      // only the one before counts: a heavy memory after a lively beat does not hold it back
      expect(nextBeat(s, m('safira', 1), m('noel', 1), toned, allWarm)?.line.tone).toBe('lively');
      // a pool with no quiet line has nothing after a heavy memory; an untagged line fits either
      expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [J('j0'), J('j1')] }, allHeavy)).toBeNull();
      expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [J('j0'), { who: 'narrator', text: 'n1' }] }, allHeavy)).toEqual({ line: { who: 'narrator', text: 'n1' }, at: 1 });
      // the real pool: its memory tones by default, and a reload picks the same
      const sad = (['mem:rin:6', 'mem:hero:5'] as SceneId[]);
      for (const id of sad) {
        const st = untold([id, m('safira', 1)]);
        for (let at = 0; at < NIGHT_BEATS.lines.length; at++) {
          st.story.beat = at;
          const r = nextBeat(st, id, m('safira', 1));
          expect(r, `${id} from ${at}`).not.toBeNull();
          expect(r!.line.tone, `${id} from ${at}: ${r!.line.text}`).toBe('quiet');
          expect(nextBeat(JSON.parse(JSON.stringify(st)) as GameState, id, m('safira', 1))).toEqual(r);
        }
      }
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

describe('story L: the reaction slot and the night (Task 5)', () => {
  it("a group scene's companions are continuing that night", () => {
    // Selene and Noel are act 2's group; Safira waited longer, but they speak tonight
    const s = untold([m('safira', 1), m('selene', 2), m('noel', 1), m('bobby', 1)]);
    expect(continuing(s, 'selene', [])).toBe(false);
    expect(continuing(s, 'selene', ['act2', 'group:act2'])).toBe(true);
    expect(continuing(s, 'noel', ['group:act2'])).toBe(true);
    expect(continuing(s, 'safira', ['group:act2'])).toBe(false);
    // backlog 4, cap 2: the two of the group, ahead of Safira
    expect(pickMemories(s, ['group:act2'], 2)).toEqual([m('selene', 2), m('noel', 1)]);
    expect(pickMemories(s, [], 2)).toEqual([m('safira', 1), m('selene', 2)]);
    expect(planNight(s, ['group:act2']).night).toEqual([m('selene', 2), m('noel', 1)]);
  });
});

describe('story L: the dawn before departure (controller ruling 2026-10-24)', () => {
  it('no dawn below a backlog of four once the night is told', () => {
    expect(DAWN_BACKLOG).toBe(4);
    const s = untold([m('selene', 1), m('noel', 1), m('safira', 1), m('bobby', 1), m('liz', 1)]);
    expect(dawnMemory(s, [m('selene', 1), m('noel', 1)], allHeavy)).toBeNull();   // three left
    expect(dawnMemory(s, [m('selene', 1)], allHeavy)).toBe(m('noel', 1));        // four left: waited longest
    expect(dawnMemory(untold([m('selene', 1), m('noel', 1), m('safira', 1)]), [], allHeavy)).toBeNull();
  });

  it("the dawn picks by the scheduler order, a warm one first, never the owner of the night's last memory", () => {
    const s = untold([m('safira', 1), m('bobby', 1), m('liz', 1), m('sylvie', 1), m('noel', 1)]);
    expect(dawnMemory(s, [], allHeavy)).toBe(m('safira', 1));                     // waited longest
    expect(dawnMemory(s, [], (id) => (id === m('liz', 1) ? 'warm' : 'heavy'))).toBe(m('liz', 1));   // a warm one first
    // the night's last memory was Safira's: her next piece is not the dawn's, even ranked first
    const two = untold([m('safira', 1), m('safira', 2), m('bobby', 1), m('liz', 1), m('sylvie', 1), m('noel', 1)]);
    expect(dawnMemory(two, [m('safira', 1)], allHeavy)).toBe(m('bobby', 1));
    expect(dawnMemory(two, [m('bobby', 1), m('safira', 1)], (id) => (id === m('safira', 2) ? 'warm' : 'heavy'))).toBe(m('liz', 1));
    // the scheduler's own order: Lorne first
    expect(dawnMemory(untold([m('selene', 1), m('noel', 1), m('safira', 1), m('hero', 3)]), [], allHeavy)).toBe(m('hero', 3));
  });

  it('dawnMemory is pure: the same state gives the same pick, nothing written', () => {
    const s = untold([m('safira', 1), m('bobby', 1), m('liz', 1), m('sylvie', 1), m('noel', 1)]);
    const before = JSON.stringify(s);
    expect(dawnMemory(s, [m('noel', 1)])).toBe(dawnMemory(s, [m('noel', 1)]));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('time and moon: the beats keep to the moon (Task 6)', () => {
  const N = (text: string, moon?: MoonPhase[]): NightBeat => ({ who: 'narrator', text, ...(moon ? { moon } : {}) });
  const pool: NightBeats = { lines: [N('full', ['full']), N('lit', ['waxing', 'full', 'waning']), N('any')] };
  /** The day whose night (the day before) is under `moon`. */
  const tonightUnder = (s: GameState, moon: MoonPhase) => { s.story.day = [1, 2, 3, 4].find((d) => tonightMoon({ ...s, story: { ...s.story, day: d } }) === moon)!; };

  it("a beat whose moon is not tonight's is passed over, and the cursor lands after the one said", () => {
    const s = untold([m('noel', 1), m('safira', 1)]);
    tonightUnder(s, 'new');
    expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: N('any'), at: 2 });
    tonightUnder(s, 'waning');
    expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: N('lit', ['waxing', 'full', 'waning']), at: 1 });
    tonightUnder(s, 'full');
    expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: N('full', ['full']), at: 0 });
    // from the cursor on, wrapping: under the new moon both moon lines are skipped and not used up
    tonightUnder(s, 'new');
    s.story.beat = 0;
    const r = nextBeat(s, m('noel', 1), m('safira', 1), pool)!;
    expect(r.at).toBe(2);
    s.story.beat = (r.at + 1) % pool.lines.length;   // the caller moves the cursor past the one said
    tonightUnder(s, 'full');
    expect(nextBeat(s, m('noel', 1), m('safira', 1), pool)).toEqual({ line: N('full', ['full']), at: 0 });
    // a pool whose every line waits on another moon has nothing
    tonightUnder(s, 'waxing');
    expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [N('full', ['full'])] })).toBeNull();
  });

  it('a beat with no moon fits any night', () => {
    const s = untold([m('noel', 1), m('safira', 1)]);
    for (const moon of ['new', 'waxing', 'full', 'waning'] as MoonPhase[]) {
      tonightUnder(s, moon);
      expect(nextBeat(s, m('noel', 1), m('safira', 1), { lines: [N('any')] }), moon).toEqual({ line: N('any'), at: 0 });
    }
  });

  it("the eve's beats read the night before the departure", () => {
    // the eve is told on the departure's day, before it: its night is the day before's, as a return's is
    const list = [m('selene', 1), m('noel', 1), m('safira', 1), m('bobby', 1)];
    const s = untold(list);
    s.story.day = 5;   // departing on day 5: last night was day 4's, a full moon
    expect(tonightMoon(s)).toBe('full');
    const eve = eveMemories(s);
    expect(eve.length).toBeGreaterThanOrEqual(2);
    expect(nextBeat(s, eve[0], eve[1], pool)).toEqual({ line: N('full', ['full']), at: 0 });
    s.story.day = 6;   // last night was day 5's, the waning moon
    expect(nextBeat(s, eve[0], eve[1], pool)?.at).toBe(1);
  });
});

describe('time and moon: the festival night (Task 7)', () => {
  it('a festival night tells no memory; they wait for the next night', () => {
    const s = untold([m('noel', 1), m('safira', 1), m('bobby', 1)]);
    expect(planNight(s, ['season:spring'])).toEqual({ before: [], night: [] });
    expect(planNight(s, []).night.length).toBeGreaterThan(0);   // the next return's night picks as usual
    expect(s.story.untold).toEqual([m('noel', 1), m('safira', 1), m('bobby', 1)]);
  });

  it('the night is ordered group, season, memory', () => {
    expect(NIGHT_RANK).toEqual({ group: 0, season: 1, memory: 2 });
    expect(orderNight([m('noel', 1), 'season:spring', m('liz', 1), 'group:act2'])).toEqual(['group:act2', 'season:spring', m('noel', 1), m('liz', 1)]);
  });
});
