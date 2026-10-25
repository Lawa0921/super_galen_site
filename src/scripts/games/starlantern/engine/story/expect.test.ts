import { describe, expect, it } from 'vitest';
import { CHAINS, chainLength, type CalendarNow, type MoonPhase } from '../../data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN } from '../../data/story/fragments';
import { floorOf, newRun } from '../dungeon/run';
import { STANDARD_LINEUP } from '../party';
import type { CharacterId } from '../types';
import { EXPECT_ELITE_EVERY, EXPECT_SEED, expectedMemories, memoryPace, walkFloor } from './expect';
import { memoriesOf } from '../progression';
import { FORCED_GLIMMERS, applyPieces, eligible, forcedGlimmers, pityAfterFloor, type Pity } from './memories';
import { MEMORY_PITY } from '../../data/story/chains';
import { meet } from '../party';
import { mulberry32 } from '../rng';
import { newGame } from '../state';

describe('expectedMemories (spec §9.4 point 7)', () => {
  it('the expectation grows with depth and stays within every chain', () => {
    const last: Partial<Record<CharacterId, number>> = {};
    for (let d = 1; d <= 30; d++) {
      const e = expectedMemories(d, STANDARD_LINEUP);
      expect(Object.keys(e).sort(), `depth ${d}`).toEqual([...STANDARD_LINEUP].sort());
      for (const id of STANDARD_LINEUP) {
        const { memories, absorbed, oath } = e[id];
        expect(memories, `${id} depth ${d}`).toBeGreaterThanOrEqual(last[id] ?? 0);
        expect(memories, `${id} depth ${d}`).toBeLessThanOrEqual(chainLength(id));
        expect(absorbed.length, `${id} depth ${d}`).toBeLessThanOrEqual(ABSORB_CAP);
        expect(oath, `${id} depth ${d}`).toBe(id === 'rin' && memories === chainLength('rin'));
        last[id] = memories;
      }
    }
  });

  it("the hero's expected pieces follow the drop schedule", () => {
    // A hand trace of the main road, depths 1-10, for the standard five (hero, Rin, Chizuru, Noel, Selene; Noel's chain
    // is storm-only, and the expectation meets everyone at depth 1). The natural glimmer falls on depth 7 (every
    // round(1 / GLIMMER_CHANCE) = 7), elites on 3, 6 and 9 (EXPECT_ELITE_EVERY), bosses on 3, 5 and 10. Piece depths
    // (2026-10-19 pace): hero 3, 5, 7, 9, 11 ...; Rin 1, 3, 6, 8, 11 ...; Selene 3, 6, 9 ...; Chizuru 5, 7, 10 ... A key chain
    // (hero, Rin) beats every companion; between them the longer wait wins, a tie goes to Rin. Pity counts the floors a
    // chain could drop on and did not; MEMORY_PITY (2) forces a glimmer, at most FORCED_GLIMMERS.max (2) a floor, in
    // roster order. Rin's catch-up glimmer starts at her 7th piece's depth (17), past this trace.
    const schedule: [depth: number, source: string, who: CharacterId | null][] = [
      [1, 'forced glimmer', 'rin'],        // Rin's first piece is always forced on the main road
      [3, 'elite', 'rin'],                 // the hero (piece 1) is a candidate, so no roll; hero and Rin (piece 2) both wait 0: the tie goes to Rin, Rin 2
      [3, 'boss', 'hero'],                 // Rin's piece 3 waits for depth 6, the hero is the only key chain: hero 1; Selene (piece 1 at 3) waited: pity 1
      [5, 'forced glimmer', 'selene'],     // Selene waited 3 and 4 (no source on 4): pity 2, Selene 1
      [5, 'boss', 'hero'],                 // hero (piece 2 at 5) is the only key chain (Rin's piece 3 waits for 6): hero 2; Chizuru (piece 1 at 5) pity 1
      [6, 'elite', 'rin'],                 // no hero piece opens before 7, so the elite rolls; the floor's first draw is under ELITE_PIECE_CHANCE: Rin (key) 3; Chizuru pity 2
      [7, 'forced glimmer', 'chizuru'],    // Chizuru waited 5 and 6: Chizuru 1 (Selene's piece 2 opened on 6, so she is at pity 1)
      [7, 'glimmer', 'hero'],              // the natural glimmer: the hero (piece 3 at 7) is the only key chain that can drop: hero 3; Selene pity 2
      [8, 'forced glimmer', 'selene'],     // Selene 2; Rin (piece 4 at 8) and Chizuru (piece 2 at 7) wait: pity 1 each; no other source on 8
      [9, 'elite', 'rin'],                 // hero (piece 4 at 9) waits 0, Rin 1: the longer wait wins, Rin 4 (no roll, the hero is a candidate); hero pity 1, Chizuru 2
      [10, 'forced glimmer', 'chizuru'],   // Chizuru waited 8 and 9: Chizuru 2
      [10, 'boss', 'hero'],                // Rin's piece 5 waits for 11, the hero is the only key chain: hero 4
    ];
    // The expectation of a depth is what the party holds on ARRIVING there: every floor above it is cleared, and its own
    // drops have not happened yet. So arriving at 10 counts the rows of depths 1-9 (hero 3, 5, 7: 3; Rin 1, 3, 6, 9: 4)
    // and leaves out the depth-10 boss; arriving at 11 counts the whole trace (hero 4, Rin 4). Both chains are main-road
    // only, so the other regions add nothing.
    const count = (id: CharacterId, before: number) => schedule.filter(([d, , who]) => d < before && who === id).length;
    for (const arrive of [1, 4, 10, 11]) {
      const e = expectedMemories(arrive, STANDARD_LINEUP);
      expect(e.hero.memories, `hero arriving at ${arrive}`).toBe(count('hero', arrive));
      expect(e.rin.memories, `rin arriving at ${arrive}`).toBe(count('rin', arrive));
    }
    expect(count('hero', 10)).toBe(3);
    expect(count('rin', 10)).toBe(4);
  });

  it("a depth's own drops wait for the next depth: arriving at the finale does not hold the finale's piece", () => {
    // The hero's last piece is boss-only at depth 30 (the finale itself), and HERO_TOPUP's depth-30 top-up is paid by
    // that same boss, so whoever arrives at depth 30 cannot hold it yet.
    const last = CHAINS.hero.pieces[chainLength('hero') - 1];
    expect(last.bossOnly).toBe(true);
    expect(last.minDepth).toBe(30);
    expect(expectedMemories(30, STANDARD_LINEUP).hero.memories).toBe(chainLength('hero') - 1);   // nine pieces: all but the finale's own
    expect(expectedMemories(31, STANDARD_LINEUP).hero.memories).toBe(chainLength('hero'));
    // Arriving at depth 1 nothing has dropped and no shard has been found.
    for (const [id, e] of Object.entries(expectedMemories(1, STANDARD_LINEUP))) {
      expect(e.memories, id).toBe(0);
      expect(e.absorbed, id).toEqual([]);
    }
  });

  it('a changed memory knob is never answered from the cache', () => {
    const before = expectedMemories(20, STANDARD_LINEUP);
    const gained = (e: typeof before) => STANDARD_LINEUP.flatMap((id) => e[id].absorbed);
    expect(gained(before).length).toBeGreaterThan(0);
    const saved = structuredClone(ABSORB_GAIN);
    try {
      for (const g of Object.keys(ABSORB_GAIN) as (keyof typeof ABSORB_GAIN)[]) {
        for (const k of Object.keys(ABSORB_GAIN[g]) as (keyof (typeof ABSORB_GAIN)[typeof g])[]) ABSORB_GAIN[g][k] += 100;
      }
      const after = expectedMemories(20, STANDARD_LINEUP);
      for (const a of gained(after)) expect(a.amount).toBeGreaterThan(100);
    } finally {
      for (const g of Object.keys(saved) as (keyof typeof saved)[]) Object.assign(ABSORB_GAIN[g], saved[g]);
    }
    expect(expectedMemories(20, STANDARD_LINEUP)).toEqual(before);
    // The forced-glimmer cap is a knob too: with no forced glimmer a floor, Rin's first piece and every pity glimmer are
    // gone, so some depth of the expectation of the four main-road chains, and Selene's pace, answer differently while it
    // is changed. (With the 2026-10-19 tables a cap of 1 never binds on the main road, so it would show nothing.)
    const road: CharacterId[] = ['hero', 'rin', 'selene', 'bobby'];
    const every = () => Array.from({ length: 30 }, (_, i) => expectedMemories(i + 1, road));
    const all = every();
    const pace = memoryPace('selene');
    const max = FORCED_GLIMMERS.max;
    try {
      FORCED_GLIMMERS.max = 0;
      expect(every()).not.toEqual(all);
      expect(memoryPace('selene')).not.toEqual(pace);
    } finally {
      FORCED_GLIMMERS.max = max;
    }
    expect(every()).toEqual(all);
    expect(memoryPace('selene')).toEqual(pace);
  });

  it("the forced-glimmer cap holds at its value: Lorne's pity and Rin's catch-up take the two slots, and the third chain waits a floor without losing its piece", () => {
    // Final review issue 5: with MEMORY_PITY = 2, pity and Rin's catch-up contend for the forced slots more often.
    expect(FORCED_GLIMMERS.max).toBe(2);
    let party = meet(newGame(mulberry32(1), 1, ['hero', 'rin']).party, 'bobby', 1);
    const depth = CHAINS.bobby.pieces[0].minDepth;   // bobby's first piece opens here; Lorne's next and Rin's first are open too
    for (const id of ['hero', 'rin', 'bobby'] as CharacterId[]) expect(eligible(party, id, { region: 'mainline', depth, source: 'glimmer' }), id).toBe(true);
    let pity: Pity = { hero: MEMORY_PITY, bobby: MEMORY_PITY };   // Rin has no piece yet: her catch-up forces her slot
    const first = forcedGlimmers(party, pity, 'mainline', depth);
    expect(first).toEqual(['hero', 'rin']);   // three contenders, two slots, roster order
    // the one left out keeps her pity, and is forced on the next floor: nothing is lost
    party = applyPieces(party, first).party;
    pity = pityAfterFloor(party, pity, 'mainline', depth, first);
    expect(pity.bobby).toBe(MEMORY_PITY + 1);
    expect(forcedGlimmers(party, pity, 'mainline', depth + 1)).toEqual(['bobby']);
    // the cap's value is what binds: one slot fewer drops Rin, one more lets all three in
    const max = FORCED_GLIMMERS.max;
    try {
      const fresh = meet(newGame(mulberry32(1), 1, ['hero', 'rin']).party, 'bobby', 1);
      const contended: Pity = { hero: MEMORY_PITY, bobby: MEMORY_PITY };
      FORCED_GLIMMERS.max = max - 1;
      expect(forcedGlimmers(fresh, contended, 'mainline', depth)).toEqual(['hero']);
      FORCED_GLIMMERS.max = max + 1;
      expect(forcedGlimmers(fresh, contended, 'mainline', depth)).toEqual(['hero', 'rin', 'bobby']);
    } finally {
      FORCED_GLIMMERS.max = max;
    }
  });

  it('the elite rate behind EXPECT_ELITE_EVERY is honest', () => {
    let elites = 0, floors = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const run = newRun(seed, 'mainline', 'plain', 1);
      for (let d = 1; d <= 12; d++) {
        elites += floorOf(run, d).contents.filter((c) => c.kind === 'elite').length;
        floors++;
      }
    }
    const mean = elites / floors;
    expect(mean).toBeGreaterThanOrEqual(1 / (EXPECT_ELITE_EVERY + 1));
    expect(mean).toBeLessThanOrEqual(1 / (EXPECT_ELITE_EVERY - 1));
  });

  it('the same depth always expects the same', () => {
    for (const d of [1, 10, 25]) expect(expectedMemories(d, STANDARD_LINEUP)).toEqual(expectedMemories(d, STANDARD_LINEUP));
    // A caller that changes what it was given does not change the next answer.
    const a = expectedMemories(12, STANDARD_LINEUP);
    a.hero.absorbed.push({ stat: 'hp', amount: 999 });
    a.hero.memories = 99;
    expect(expectedMemories(12, STANDARD_LINEUP).hero.memories).toBeLessThanOrEqual(chainLength('hero'));
    expect(expectedMemories(12, STANDARD_LINEUP).hero.absorbed).not.toContainEqual({ stat: 'hp', amount: 999 });
  });
});

describe('time and moon: the expectation and the moon (Task 2)', () => {
  const MOONS: MoonPhase[] = ['new', 'waxing', 'full', 'waning'];
  const cal = (moon: MoonPhase): CalendarNow => ({ moon, season: 'autumn', time: 'day' });
  const fresh = (ids: CharacterId[]) => ({ ...newGame(mulberry32(EXPECT_SEED), EXPECT_SEED, ids), inventory: {} });
  const road = () => newRun(EXPECT_SEED, 'mainline', 'plain', 1);

  it('walkFloor matches the calendar-free floor under every moon when no moon piece is due', () => {
    let s = fresh(['hero', 'rin', 'chizuru']);
    let pity: Pity = {};
    for (let d = 1; d <= 15; d++) {
      const plain = walkFloor(s, pity, 'mainline', d, road());
      for (const moon of MOONS) expect(walkFloor(s, pity, 'mainline', d, road(), cal(moon)), `depth ${d}, ${moon}`).toEqual(plain);
      s = plain.state;
      pity = plain.pity;
    }
  });

  it("with Selene's second piece due, only the full moon's floor gives it", () => {
    const s = fresh(['hero', 'selene']);
    s.party.roster.selene.memories = 1;
    const pity: Pity = { selene: MEMORY_PITY };
    for (const moon of MOONS) {
      const f = walkFloor(s, pity, 'mainline', 6, road(), cal(moon));
      if (moon === 'full') expect([memoriesOf(f.state.party.roster.selene), f.pity.selene], moon).toEqual([2, 0]);
      else expect([memoriesOf(f.state.party.roster.selene), f.pity.selene], moon).toEqual([1, MEMORY_PITY + 1]);
    }
    expect(memoriesOf(s.party.roster.selene)).toBe(1);   // the given state is not changed
  });

  it('the expectation takes no calendar', () => {
    expect(memoryPace('selene')).toEqual([5, 8, 11, 14, 17]);   // measured at Task 0 (baseline.md)
  });
});
