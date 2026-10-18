import { describe, expect, it } from 'vitest';
import { CHAINS, chainLength } from '../../data/story/chains';
import { ABSORB_CAP, ABSORB_GAIN } from '../../data/story/fragments';
import { floorOf, newRun } from '../dungeon/run';
import { STANDARD_LINEUP } from '../party';
import type { CharacterId } from '../types';
import { EXPECT_ELITE_EVERY, expectedMemories, memoryPace } from './expect';
import { FORCED_GLIMMERS } from './memories';

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
    // is storm-only). Natural glimmers fall on depths 4 and 8 (every round(1 / GLIMMER_CHANCE) = 4), elites on 3, 6 and 9
    // (EXPECT_ELITE_EVERY), bosses on 3, 5 and 10. Piece depths (plan 6c Task 1): hero 3, 5, 7, 9, 12 ...; Rin 1, 3, 5,
    // 8, 13 ...; Selene 3, 6, 11 ...; Chizuru 8, 12 ... A key chain (hero, Rin) beats every companion; between them the
    // longer wait wins, a tie goes to Rin. Pity counts the floors a chain could drop on and did not; MEMORY_PITY (3)
    // forces a glimmer. Rin's catch-up glimmer starts at her 7th piece's depth (22), past this trace.
    const schedule: [depth: number, source: string, who: CharacterId | null][] = [
      [1, 'forced glimmer', 'rin'],        // Rin's first piece is always forced on the main road
      [3, 'elite', 'rin'],                 // the hero (piece 1) is a candidate, so no roll; hero and Rin (piece 2) both wait 0: the tie goes to Rin, Rin 2
      [3, 'boss', 'hero'],                 // Rin's piece 3 waits for depth 5, the hero is the only key chain: hero 1
      [4, 'glimmer', 'selene'],            // no key chain can drop (hero 2 and Rin 3 wait for 5); Selene (piece 1 at 3) is alone: Selene 1
      [5, 'boss', 'rin'],                  // hero (piece 2) and Rin (piece 3) both wait 0 (neither could drop on 4): the tie goes to Rin, Rin 3
      [6, 'elite', 'hero'],                // Rin's piece 4 waits for depth 8, the hero is the only key chain (no roll): hero 2
      [8, 'glimmer', 'hero'],              // hero waited 1 (7), Rin 0 (piece 4 opens here): hero 3; Selene (piece 2) is at pity 2, not forced yet
      [9, 'forced glimmer', 'selene'],     // Selene waited 6, 7 and 8: pity 3, Selene 2
      [9, 'elite', 'rin'],                 // hero waited 0 (dropped on 8), Rin 1 (8): Rin 4
      [10, 'boss', 'hero'],                // Rin's piece 5 waits for depth 13, the hero is the only key chain: hero 4
    ];
    // The expectation of a depth is what the party holds on ARRIVING there: every floor above it is cleared, and its own
    // drops have not happened yet. So arriving at 10 counts the rows of depths 1-9 (hero 3, 6, 8: 3; Rin 1, 3, 5, 9: 4)
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
    // The forced-glimmer cap is a knob too: one forced glimmer a floor starves the later chains of the roster, so some
    // depth of the expectation of the four main-road chains, and Selene's pace, answer differently while it is changed.
    const road: CharacterId[] = ['hero', 'rin', 'selene', 'bobby'];
    const every = () => Array.from({ length: 30 }, (_, i) => expectedMemories(i + 1, road));
    const all = every();
    const pace = memoryPace('selene');
    const max = FORCED_GLIMMERS.max;
    try {
      FORCED_GLIMMERS.max = 1;
      expect(every()).not.toEqual(all);
      expect(memoryPace('selene')).not.toEqual(pace);
    } finally {
      FORCED_GLIMMERS.max = max;
    }
    expect(every()).toEqual(all);
    expect(memoryPace('selene')).toEqual(pace);
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
