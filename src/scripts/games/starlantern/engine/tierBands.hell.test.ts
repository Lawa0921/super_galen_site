/**
 * The Hell bands (spec §6.2 H1–H4, difficulty plan Task 5a): rare runes with a trigger or 常駐 win Hell; Nightmare's magic
 * and the bare default do not; no boss falls inside three rounds even to the epic ceiling. Opt-in (BANDS=1, npm run
 * test:starlantern:bands -- tierBands.hell); every number reported with BALANCE_REPORT set, one `[hell]` line a cell, then
 * the crowd gap of each depth (rare and magic against bare) and the Hell elites (report only).
 */
import { describe, expect, it } from 'vitest';
import { HELL_BANDS, bandCells, bandLine, gapLine, hellEliteCells, measureBand, measureCells, pooled } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[hell] ${line}`); };

describe.skipIf(!on)('the Hell bands (difficulty plan Task 5a)', () => {
  it('reports every tier band number', () => {
    for (const band of HELL_BANDS) {
      const runs = measureBand(band);
      for (const m of runs) {
        say(bandLine(band, m.cell.label!, m.run, m.twin));
        expect(m.run.fights, `${band} ${m.cell.label}`).toBeGreaterThan(0);
      }
      say(bandLine(band, 'all', pooled(runs.map((m) => m.run)), pooled(runs.map((m) => m.twin))));
    }
    // The crowd gap a depth: H1 (rare) and H3's magic crowd cells against H3's bare ones, every group of the floor pooled.
    const h3 = measureBand('H3');
    const crowd = bandCells('H1').length;
    for (const d of [20, 25, 30]) {
      const at = (runs: typeof h3) => pooled(runs.filter((m) => m.cell.kind === 'crowd' && m.cell.depth === d).map((m) => m.run));
      const bare = at(h3.slice(h3.length / 2));
      say(gapLine(d, bare, at(measureBand('H1')), 'rare'));
      say(gapLine(d, bare, at(h3.slice(0, crowd)), 'magic'));
    }
    // The Hell elites, report only (no band holds them): every group at 25 with each pair of affixes.
    for (const m of measureCells(hellEliteCells())) say(bandLine('HE', m.cell.label!, m.run, m.twin));
  }, 3_000_000);
});
