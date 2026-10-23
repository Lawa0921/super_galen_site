/**
 * The Normal baseline of the difficulty bands (difficulty plan Task 0): the main road at depths 10–30, the default party
 * bare and the cell's builds at the magic and the rare tier, a crowd of every encounter group and the Lantern-eater, on
 * Normal. Opt-in (BANDS=1, npm run test:starlantern:bands -- tierBands.baseline); every number reported with
 * BALANCE_REPORT set, one `[tiers-base]` line a cell (engine/__fixtures__/tiers/baseline.normal.txt keeps them sorted).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BASELINE_DEPTHS, BASELINE_TIERS, FEASIBLE, baselineLine, feasibility, feasibilityLine, normalRoad } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[tiers-base] ${line}`); };

describe.skipIf(!on)('the difficulty bands: the Normal baseline (difficulty plan Task 0)', () => {
  it('every baseline cell is measured on Normal; the bare default as the fixture keeps it', () => {
    const lines: string[] = [];
    for (const depth of BASELINE_DEPTHS) for (const tier of BASELINE_TIERS) for (const kind of ['crowd', 'boss'] as const) {
      const r = normalRoad(depth, kind, tier);
      const line = baselineLine(depth, tier, kind, r);
      say(line);
      lines.push(`[tiers-base] ${line}`);
      expect(r.fights, `d${depth} ${tier} ${kind}`).toBeGreaterThan(0);
    }
    // The bare default on Normal does not move (T0-T1 review, minor 5): its lines are the fixture's, sorted as it keeps
    // them. The build cells are reported, not pinned: a build's own policy may change (Task 2 gave the cure builds a
    // cure-ailment rule, which moved the magic and rare crowds at depths 15, 25 and 30; the fixture keeps Task 0's lines).
    const bare = (l: string) => l.includes(' bare ');
    const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/tiers/baseline.normal.txt'), 'utf8');
    expect(lines.filter(bare).sort()).toEqual(fixture.replace(/\r/g, '').trimEnd().split('\n').filter(bare));
    expect(lines.filter(bare)).toHaveLength(BASELINE_DEPTHS.length * 2);
  }, 3_000_000);

  it('magic runes already pull apart from bare on Normal, at every boss', () => {
    // Controller ruling on Task 0b: the bosses are gated on both thresholds; the crowds are reported only.
    const rows = feasibility();
    for (const r of rows) console.info(`[tiers-feasible] ${feasibilityLine(r)}`);
    expect(rows.filter((r) => r.gated).length).toBe(FEASIBLE.depths.length);
    expect(rows.filter((r) => r.gated && !r.ok).map(feasibilityLine), rows.map(feasibilityLine).join('\n')).toEqual([]);
  }, 3_000_000);
});
