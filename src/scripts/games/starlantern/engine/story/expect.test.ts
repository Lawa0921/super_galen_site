import { describe, expect, it } from 'vitest';
import { chainLength } from '../../data/story/chains';
import { ABSORB_CAP } from '../../data/story/fragments';
import { floorOf, newRun } from '../dungeon/run';
import { STANDARD_LINEUP } from '../party';
import type { CharacterId } from '../types';
import { EXPECT_ELITE_EVERY, expectedMemories } from './expect';

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
    // (EXPECT_ELITE_EVERY), bosses on 3, 5 and 10. Piece depths: hero 4, 6, 9 ...; Rin 1, 3, 4, 6, 8, 10 ...; a
    // companion 1, 1, 1, 6, 6. A key chain (hero, Rin) beats every companion; between them the longer wait wins, a tie
    // goes to Rin. Pity counts the floors a chain could drop on and did not; MEMORY_PITY (3) forces a glimmer.
    const schedule: [depth: number, source: string, who: CharacterId | null][] = [
      [1, 'forced glimmer', 'rin'],        // Rin's first piece is always forced on the main road
      [3, 'elite', null],                  // the hero (piece 1 at depth 4) is not a candidate, so the elite needs a 0.35 roll; the floor's first draw is 0.8128
      [3, 'boss', 'rin'],                  // Rin is the only key chain eligible (piece 2 at depth 3): Rin 2
      [4, 'forced glimmer', 'chizuru'],    // Chizuru waited depths 1-3: pity 3
      [4, 'forced glimmer', 'selene'],     // Selene waited depths 1-3: pity 3
      [4, 'glimmer', 'rin'],               // hero (piece 1) and Rin (piece 3) both at pity 0: the tie goes to Rin, Rin 3
      [5, 'boss', 'hero'],                 // Rin's piece 4 waits for depth 6, the hero is the only key chain: hero 1
      [6, 'elite', 'rin'],                 // the hero is a candidate (no roll); hero pity 0 (dropped on 5), Rin 0 (not eligible on 5): tie, Rin 4
      [8, 'forced glimmer', 'chizuru'],    // pity 3 again (depths 5-7)
      [8, 'forced glimmer', 'selene'],     // pity 3 again (depths 5-7)
      [8, 'glimmer', 'hero'],              // hero pity 2 (6, 7), Rin 0 (piece 5 waits for depth 8): hero 2
      [9, 'elite', 'rin'],                 // hero pity 0 (dropped on 8), Rin 1 (8): Rin 5
      [10, 'boss', 'hero'],                // hero pity 1 (9), Rin 0 (dropped on 9): hero 3
    ];
    const count = (id: CharacterId) => schedule.filter(([, , who]) => who === id).length;
    const e = expectedMemories(10, STANDARD_LINEUP);
    expect(e.hero.memories).toBe(count('hero'));
    expect(e.rin.memories).toBe(count('rin'));   // Rin's chain is main-road only, so the other regions add nothing
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
