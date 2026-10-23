/**
 * The Hell bands (spec §6.2 with the controller ruling of 2026-10-23): rare runes with a trigger or 常駐 combo win the
 * Hell boss at d25 and the crowds at d20–25, each harder than on Nightmare; the bare default does not win the boss; the
 * Hell elites are no wall; no boss falls inside three rounds even to the epic ceiling. d30 and the magic tier are reported
 * only. Opt-in (BANDS=1, npm run test:starlantern:bands -- tierBands.hell); every number reported with BALANCE_REPORT set:
 * one `[hell]` line a cell, the pooled lines of each band, then the crowd gap of each depth (rare and magic against bare).
 */
import { describe, expect, it } from 'vitest';
import { HELL_BANDS, bandCells, bandLine, bandMisses, frozenMisses, gapLine, measureBand, measureHellReport, poolOf, pooled, pooledLines, shallowHellMisses } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[hell] ${line}`); };

describe.skipIf(!on)('the Hell bands (difficulty plan Tasks 5a-5b)', () => {
  it('reports every tier band number', () => {
    for (const band of HELL_BANDS) {
      const runs = measureBand(band);
      for (const m of runs) {
        say(bandLine(band, m.cell.label!, m.run, m.twin));
        expect(m.run.fights, `${band} ${m.cell.label}`).toBeGreaterThan(0);
      }
      say(bandLine(band, 'all', pooled(runs.map((m) => m.run)), pooled(runs.map((m) => m.twin))));
      for (const line of pooledLines(band, measureBand)) say(line);
      for (const line of bandMisses(band, measureBand)) say(`miss ${line}`);
    }
    // The crowd gap a depth (report only): H1 (rare) and H3's magic crowd cells against H3's bare ones, every group pooled.
    const h3 = measureBand('H3');
    const crowd = bandCells('H1').length;
    for (const d of [20, 25, 30]) {
      const at = (runs: typeof h3) => pooled(runs.filter((m) => m.cell.kind === 'crowd' && m.cell.depth === d).map((m) => m.run));
      const bare = at(h3.slice(h3.length / 2));
      say(gapLine(d, bare, at(measureBand('H1')), 'rare'));
      say(gapLine(d, bare, at(h3.slice(0, crowd)), 'magic'));
    }
    // Hell below d25 (T4-T5 review): reachable but under no band; every cell and each depth's pool, reported only.
    const below = measureHellReport();
    for (const m of below) {
      say(bandLine('HR', m.cell.label!, m.run, m.twin));
      expect(m.run.fights, `HR ${m.cell.label}`).toBeGreaterThan(0);
    }
    // The bosses split by lineup: rare with a trigger (as H2) and the bare default (as H3; its intent .40 or less).
    for (const [d, kind, tier] of [[15, 'crowd', 'rare'], [15, 'boss', 'rare'], [15, 'boss', 'bare'], [20, 'boss', 'rare'], [20, 'boss', 'bare']] as const) {
      const p = poolOf(below.filter((m) => m.cell.depth === d && m.cell.kind === kind && (m.cell.lineup.runeTier ?? 'bare') === tier));
      say(`HR d${d} ${kind} ${tier} pooled rate ${p.run.rate.toFixed(3)} loss ${p.run.hpLoss.toFixed(3)} (normal loss ${p.twin.hpLoss.toFixed(3)}, nightmare loss ${p.nightmare.hpLoss.toFixed(3)})${tier === 'bare' && kind === 'boss' ? ' asserted (HS)' : ' reported only'}`);
    }
    for (const line of shallowHellMisses(below)) say(`miss ${line}`);
  }, 3_000_000);

  it('HS the bare default loses the Hell boss at d15 and d20 too (controller ruling after Task 6b)', () => {
    expect(shallowHellMisses(measureHellReport())).toEqual([]);
  }, 3_000_000);

  it('H1 Hell crowds are won with rare runes, harder than Nightmare', () => {
    expect(bandMisses('H1', measureBand)).toEqual([]);
  }, 3_000_000);

  it('H2 the Hell boss falls to rare runes with a trigger or lasting combo, harder than Nightmare', () => {
    expect(bandMisses('H2', measureBand)).toEqual([]);
  }, 3_000_000);

  it('H3 the bare default loses the Hell boss', () => {
    expect(bandMisses('H3', measureBand)).toEqual([]);
  }, 3_000_000);

  it('H4 no boss falls inside three rounds', () => {
    expect(bandMisses('H4', measureBand)).toEqual([]);
  }, 3_000_000);

  it('HE no Hell elite is a wall', () => {
    expect(bandMisses('HE', measureBand)).toEqual([]);
  }, 3_000_000);

  it('HX the party is never frozen', () => {
    expect(HELL_BANDS.flatMap((b) => frozenMisses(b, measureBand(b)))).toEqual([]);
  }, 3_000_000);
});
