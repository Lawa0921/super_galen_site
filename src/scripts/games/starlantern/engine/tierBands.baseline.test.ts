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
  it('every baseline cell is measured on Normal, as the fixture keeps it', () => {
    const lines: string[] = [];
    for (const depth of BASELINE_DEPTHS) for (const tier of BASELINE_TIERS) for (const kind of ['crowd', 'boss'] as const) {
      const r = normalRoad(depth, kind, tier);
      const line = baselineLine(depth, tier, kind, r);
      say(line);
      lines.push(`[tiers-base] ${line}`);
      expect(r.fights, `d${depth} ${tier} ${kind}`).toBeGreaterThan(0);
    }
    // Normal does not move (T0-T1 review, minor 5; controller ruling on Task 2): every line, the bare default and the
    // builds alike, is the fixture's, sorted as it keeps them.
    const fixture = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '__fixtures__/tiers/baseline.normal.txt'), 'utf8');
    expect(lines.sort()).toEqual(fixture.replace(/\r/g, '').trimEnd().split('\n'));
  }, 3_000_000);

  it('magic runes already pull apart from bare on Normal, at every boss', () => {
    // Controller ruling on Task 0b: the bosses are gated on both thresholds; the crowds are reported only.
    const rows = feasibility();
    for (const r of rows) console.info(`[tiers-feasible] ${feasibilityLine(r)}`);
    expect(rows.filter((r) => r.gated).length).toBe(FEASIBLE.depths.length);
    expect(rows.filter((r) => r.gated && !r.ok).map(feasibilityLine), rows.map(feasibilityLine).join('\n')).toEqual([]);
  }, 3_000_000);
});
