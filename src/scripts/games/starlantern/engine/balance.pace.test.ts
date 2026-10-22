import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { MEETINGS } from '../data/meetings';
import { HERO_TOPUP, chainLength } from '../data/story/chains';
import type { CharacterId } from './types';
import { memoryPace, paceHome } from './story/expect';

/**
 * Band 20, the memory pace: the user's rule that each character gets a new piece every two or three floors (2026-10-19,
 * replacing plan 6c Task 1's three to five). `memoryPace` walks each character's home road from depth 1 and records the
 * depth each piece drops on; a companion counts from her meeting depth. The fixed points stay outside the rule: Rin's
 * first piece waits on the first floor, and the hero's last two pieces are the top-ups of the depth-25 and depth-30 bosses.
 */
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;

/** The depth a character's pace starts from: 1 (the game's start) for the hero and Rin, else her meeting depth. */
const start = (id: CharacterId): number => MEETINGS.find((m) => m.id === id)?.depth ?? 1;
const gaps = (p: number[]): number[] => p.slice(1).map((d, i) => d - p[i]);
/** The fewest and most floors from one piece to the next, and from the meeting (or the game's start) to the first. */
const GAP = { min: 2, max: 3 };
/** The hero's pieces paced by the rule; the rest are the HERO_TOPUP bosses. */
const heroPaced = (): number => chainLength('hero') - HERO_TOPUP.length;

describe('balance 20: the memory pace', () => {
  if (report) {
    for (const id of CHARACTER_IDS) {
      const p = memoryPace(id);
      const g = gaps(p);
      const mean = p.length > 1 ? (p[p.length - 1] - p[0]) / (p.length - 1) : NaN;
      console.info(`[pace] ${id} ${paceHome(id)}@${start(id)} pieces=${p.join(',')} gaps=${g.join(',')} mean=${mean.toFixed(2)}`);
    }
  }

  it('20a every chain completes on its home road', () => {
    for (const id of CHARACTER_IDS) ex(memoryPace(id).length, id).toBe(chainLength(id));
  });

  it('20b the first piece comes two or three floors in', () => {
    for (const id of CHARACTER_IDS) {
      const first = memoryPace(id)[0];
      ex(first, id).toBeDefined();
      if (id === 'rin') { ex(first, 'rin waits on the first floor').toBe(1); continue; }
      ex(first - start(id), id).toBeGreaterThanOrEqual(GAP.min);
      ex(first - start(id), id).toBeLessThanOrEqual(GAP.max);
    }
  });

  it('20c a new piece every two or three floors', () => {
    for (const id of CHARACTER_IDS) {
      const p = memoryPace(id);
      ex(p.length, id).toBeGreaterThan(1);
      const paced = id === 'hero' ? heroPaced() : p.length;
      for (const [i, g] of gaps(p).slice(0, paced - 1).entries()) {
        ex(g, `${id} gap ${i + 1}->${i + 2}`).toBeGreaterThanOrEqual(GAP.min);
        ex(g, `${id} gap ${i + 1}->${i + 2}`).toBeLessThanOrEqual(GAP.max);
      }
    }
    // The hero's 8->9 and 9->10 gaps are exempt: those pieces are the depth-25 and depth-30 bosses' top-ups.
    ex(memoryPace('hero').slice(heroPaced()), 'hero top-ups').toEqual(HERO_TOPUP.map((t) => t.depth));
  });

  it('20d Rin chooses before the finale', () => {
    const rin = memoryPace('rin');
    ex(rin[chainLength('rin') - 1], 'rin piece 7').toBeDefined();
    ex(rin[chainLength('rin') - 1], 'rin piece 7').toBeLessThanOrEqual(27);
  });
});
