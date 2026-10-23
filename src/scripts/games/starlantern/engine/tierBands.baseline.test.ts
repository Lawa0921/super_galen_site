/**
 * The Normal baseline of the difficulty bands (difficulty plan Task 0): the main road at depths 10–30, the default party
 * bare and the cell's builds at the magic and the rare tier, a crowd of every encounter group and the Lantern-eater, on
 * Normal. Opt-in (BANDS=1, npm run test:starlantern:bands -- tierBands.baseline); every number reported with
 * BALANCE_REPORT set, one `[tiers-base]` line a cell (engine/__fixtures__/tiers/baseline.normal.txt keeps them sorted).
 */
import { describe, expect, it } from 'vitest';
import { BASELINE_DEPTHS, BASELINE_TIERS, baselineLine, normalRoad } from './tierBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[tiers-base] ${line}`); };

describe.skipIf(!on)('the difficulty bands: the Normal baseline (difficulty plan Task 0)', () => {
  it('every baseline cell is measured on Normal', () => {
    for (const depth of BASELINE_DEPTHS) for (const tier of BASELINE_TIERS) for (const kind of ['crowd', 'boss'] as const) {
      const r = normalRoad(depth, kind, tier);
      say(baselineLine(depth, tier, kind, r));
      expect(r.fights, `d${depth} ${tier} ${kind}`).toBeGreaterThan(0);
    }
  }, 3_000_000);
});
