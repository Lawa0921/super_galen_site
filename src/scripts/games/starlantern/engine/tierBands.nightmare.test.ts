/**
 * The Nightmare bands (spec §6.2 N1–N6, difficulty plan Task 5a): magic runes on the cell's builds win the crowds, the
 * elites of every affix, the boss and the odd lineups; the bare default does not. Opt-in (BANDS=1, npm run
 * test:starlantern:bands -- tierBands.nightmare); every number reported with BALANCE_REPORT set, one `[nightmare]` line a
 * cell, then the crowd gap of each depth (magic against bare, the Task 0b ruling).
 */
import { describe, expect, it } from 'vitest';
import { NIGHTMARE_BANDS, bandLine, gapLine, measureBand, pooled } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[nightmare] ${line}`); };

describe.skipIf(!on)('the Nightmare bands (difficulty plan Task 5a)', () => {
  it('reports every tier band number', () => {
    for (const band of NIGHTMARE_BANDS) {
      const runs = measureBand(band);
      for (const m of runs) {
        say(bandLine(band, m.cell.label!, m.run, m.twin));
        expect(m.run.fights, `${band} ${m.cell.label}`).toBeGreaterThan(0);
      }
      say(bandLine(band, 'all', pooled(runs.map((m) => m.run)), pooled(runs.map((m) => m.twin))));
    }
    // The crowd gap a depth: N1 (magic) against N4's crowd cells (bare), every group of the floor pooled.
    const n4 = measureBand('N4');
    for (const d of [10, 15, 20, 25]) {
      const magic = pooled(measureBand('N1').filter((m) => m.cell.depth === d).map((m) => m.run));
      const bare = pooled(n4.filter((m) => m.cell.kind === 'crowd' && m.cell.depth === d).map((m) => m.run));
      say(gapLine(d, bare, magic, 'magic'));
    }
  }, 3_000_000);
});
