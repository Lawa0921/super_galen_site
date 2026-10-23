import { describe, expect, it } from 'vitest';
import { STORY } from '../../data/story.zh-TW';
import { newGame, type GameState } from '../state';
import { bellkeeperPool } from './keeper';

/** A game past her choice; `arrived` when the bellkeeper's arrival has played. */
const chosen = (arrived = true): GameState => {
  const s = newGame();
  s.party.roster.rin.oath = true;
  s.story.seen.push('rin-reveal', 'rin-confess', ...(arrived ? (['bellkeeper-arrives'] as const) : []));
  return s;
};
const BOY = /指路的少年/;

describe('the bellkeeper in town (story depth Task 4)', () => {
  it("the bellkeeper's line about the boy at the gate waits for Glen's piece", () => {
    const s = chosen();
    expect(bellkeeperPool(s).length).toBeGreaterThan(0);
    expect(bellkeeperPool(s).some((t) => BOY.test(t))).toBe(false);
    s.story.returned = ['glen'];
    expect(bellkeeperPool(s).filter((t) => BOY.test(t))).toHaveLength(1);
    // every line of his pool is one of his oath lines, as the town shows it
    expect(bellkeeperPool(s).every((t) => STORY.bellkeeper.oath.some((l) => l.text === t))).toBe(true);
    expect(bellkeeperPool(s)).toHaveLength(STORY.bellkeeper.oath.length);
  });

  it('he says nothing before he has come to town, and his after lines once the finale is over', () => {
    expect(bellkeeperPool(newGame())).toEqual([]);
    expect(bellkeeperPool(chosen(false))).toEqual([]);   // her choice made, his arrival not played yet
    const done = chosen();
    done.story.finaleCleared = true;
    expect(bellkeeperPool(done)).toEqual(STORY.bellkeeper.after);
    expect(STORY.bellkeeper.after).toHaveLength(4);
  });
});
