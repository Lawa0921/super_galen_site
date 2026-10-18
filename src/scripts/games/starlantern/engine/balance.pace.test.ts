import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS } from '../data/characters';
import { MEETINGS } from '../data/meetings';
import { chainLength } from '../data/story/chains';
import type { CharacterId } from './types';
import { memoryPace, paceHome } from './story/expect';

/**
 * Band 20, the memory pace (plan 6c Task 1; the thresholds are the plan's): the user's rule that each character gets a
 * new piece roughly every three to five floors. `memoryPace` walks each character's home road from depth 1 and records
 * the depth each piece drops on; a companion counts from her meeting depth.
 */
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;

/** The depth a character's pace starts from: 1 for the hero and Rin, else her meeting depth. */
const start = (id: CharacterId): number => MEETINGS.find((m) => m.id === id)?.depth ?? 1;
const gaps = (p: number[]): number[] => p.slice(1).map((d, i) => d - p[i]);

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

  it('20b the first piece comes soon', () => {
    for (const id of CHARACTER_IDS) {
      const first = memoryPace(id)[0];
      ex(first, id).toBeDefined();
      ex(first - start(id), id).toBeLessThanOrEqual(5);
    }
  });

  it('20c a new piece every three to five floors', () => {
    for (const id of CHARACTER_IDS) {
      const p = memoryPace(id);
      ex(p.length, id).toBeGreaterThan(1);
      const mean = (p[p.length - 1] - p[0]) / (p.length - 1);
      ex(mean, `${id} mean`).toBeGreaterThanOrEqual(3);
      ex(mean, `${id} mean`).toBeLessThanOrEqual(5);
      for (const [i, g] of gaps(p).entries()) {
        ex(g, `${id} gap ${i + 1}->${i + 2}`).toBeGreaterThanOrEqual(2);
        ex(g, `${id} gap ${i + 1}->${i + 2}`).toBeLessThanOrEqual(6);
      }
    }
  });

  it('20d Rin chooses before the finale', () => {
    const rin = memoryPace('rin');
    ex(rin[chainLength('rin') - 1], 'rin piece 7').toBeDefined();
    ex(rin[chainLength('rin') - 1], 'rin piece 7').toBeLessThanOrEqual(27);
  });
});
