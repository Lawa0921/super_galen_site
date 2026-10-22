/**
 * The rune bands of noel's builds (spec §12.4, plan 8h): opt-in (BANDS=1, npm run test:starlantern:bands), one file a
 * member so two workers can share them. Reports every number with BALANCE_REPORT set; asserts only that each was measured.
 */
import { describe, expect, it } from 'vitest';
import { BUILDS } from '../data/builds';
import { BUILD_LEVELS, reportBuilds } from './buildBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';

describe.skipIf(!on)('the rune bands: noel (plan 8h)', () => {
  it('reports every rune band number', () => {
    const n = reportBuilds('noel', (line) => { if (report) console.info(`[builds] ${line}`); });
    expect(n).toBe((BUILDS.noel.length - 1) * BUILD_LEVELS.length);
  });
});
