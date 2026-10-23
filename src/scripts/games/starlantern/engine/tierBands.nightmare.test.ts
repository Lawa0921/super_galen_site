/**
 * The Nightmare bands (spec §6.2 with the controller ruling of 2026-10-23): magic runes win the crowds and, from d15, the
 * boss of every affix, each harder than on Normal; the bare default loses the boss by a margin; no affix is a death
 * sentence; the odd lineups and the regions' riders hold. Opt-in (BANDS=1, npm run test:starlantern:bands --
 * tierBands.nightmare); every number reported with BALANCE_REPORT set: one `[nightmare]` line a cell, the pooled lines of
 * each band, then the crowd gap of each depth (magic against bare, report only).
 */
import { describe, expect, it } from 'vitest';
import { NIGHTMARE_BANDS, bandLine, bandMisses, frozenMisses, gapLine, measureBand, pooled, pooledLines } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[nightmare] ${line}`); };

describe.skipIf(!on)('the Nightmare bands (difficulty plan Tasks 5a-5b)', () => {
  it('reports every tier band number', () => {
    for (const band of NIGHTMARE_BANDS) {
      const runs = measureBand(band);
      for (const m of runs) {
        say(bandLine(band, m.cell.label!, m.run, m.twin));
        expect(m.run.fights, `${band} ${m.cell.label}`).toBeGreaterThan(0);
      }
      say(bandLine(band, 'all', pooled(runs.map((m) => m.run)), pooled(runs.map((m) => m.twin))));
      for (const line of pooledLines(band, measureBand)) say(line);
    }
    // The crowd gap a depth: N1 (magic) against N4's crowd cells (bare), every group of the floor pooled.
    const n4 = measureBand('N4');
    for (const d of [10, 15, 20, 25]) {
      const magic = pooled(measureBand('N1').filter((m) => m.cell.depth === d).map((m) => m.run));
      const bare = pooled(n4.filter((m) => m.cell.kind === 'crowd' && m.cell.depth === d).map((m) => m.run));
      say(gapLine(d, bare, magic, 'magic'));
    }
  }, 3_000_000);

  it('N1 Nightmare crowds are won with magic runes, harder than Normal', () => {
    expect(bandMisses('N1', measureBand)).toEqual([]);
  }, 3_000_000);

  it('N2 no affix is a death sentence', () => {
    expect(bandMisses('N2', measureBand)).toEqual([]);
  }, 3_000_000);

  it('N3 the Nightmare boss falls to magic runes, harder than Normal', () => {
    expect(bandMisses('N3', measureBand)).toEqual([]);
  }, 3_000_000);

  it('N4 no runes, no Nightmare boss', () => {
    expect(bandMisses('N4', measureBand)).toEqual([]);
  }, 3_000_000);

  it('N5 odd lineups still work', () => {
    expect(bandMisses('N5', measureBand)).toEqual([]);
  }, 3_000_000);

  it("N6 every region's rider is survivable", () => {
    expect(bandMisses('N6', measureBand)).toEqual([]);
  }, 3_000_000);

  it('HX the party is never frozen', () => {
    expect(NIGHTMARE_BANDS.flatMap((b) => frozenMisses(b, measureBand(b)))).toEqual([]);
  }, 3_000_000);
});
