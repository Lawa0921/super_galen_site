/**
 * The rune bands of chizuru's builds (spec §12.4, plan 8h Task 5b): opt-in (BANDS=1, npm run test:starlantern:bands), one file
 * a member so two workers can share them; every number reported with BALANCE_REPORT set. Known exceptions are the
 * controller's to decide: each is still checked to fail, and reported, never skipped.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { BUILD_LEVELS, BAND_EXCEPTIONS, ONE_RUNE_EXCEPTIONS, ONE_RUNE_MAX, RUNE_VALUE_PCT, UNCAST, bandResults, type OwnerResult } from './buildBands';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[builds] ${line}`); };

describe.skipIf(!on)('the rune bands: chizuru (plan 8h)', () => {
  let r: OwnerResult;
  beforeAll(() => { r = bandResults('chizuru', say); }, 3_000_000);

  it('a suggested build at magic is worth a fifth more in its own fight, and its runes pay', () => {
    expect(r.builds.length).toBeGreaterThan(0);
    for (const b of r.builds) {
      const fails = b.levels.flatMap((l) => {
        const why: string[] = [];
        if (l.run.perRound < (l.std.perRound * (100 + RUNE_VALUE_PCT)) / 100) why.push(`Lv${l.level} ${l.run.perRound.toFixed(1)} < ${l.std.perRound.toFixed(1)} x ${1 + RUNE_VALUE_PCT / 100}`);
        if (l.run.rate < l.std.rate) why.push(`Lv${l.level} win ${l.run.rate.toFixed(2)} < ${l.std.rate.toFixed(2)}`);
        if (l.run.perRound <= l.bare.perRound) why.push(`Lv${l.level} runes do not pay: ${l.run.perRound.toFixed(1)} <= bare ${l.bare.perRound.toFixed(1)}`);
        return why;
      });
      const known = BAND_EXCEPTIONS[b.tag];
      if (known) {
        say(`known-exception ${b.tag} (decider: ${known.decider}): ${fails.join('; ')}`);
        expect(fails, `${b.tag} passes now: take it off BAND_EXCEPTIONS`).not.toEqual([]);
      } else expect(fails, b.tag).toEqual([]);
    }
  });

  it('the strongest builds still never one-round a boss', () => {
    for (const b of r.builds) for (const c of b.ceilings) expect(c.min, `${b.tag} d${c.depth} ${c.mode}`).toBeGreaterThanOrEqual(2);
  });

  it('no single rune is the one right answer', () => {
    for (const b of r.builds) for (const o of b.oneRune) {
      const known = ONE_RUNE_EXCEPTIONS[o.label];
      if (known) {
        say(`blocked ${o.label} ${o.ratio.toFixed(2)} (decider: ${known.decider})`);
        expect(o.ratio, `${o.label} is under ${ONE_RUNE_MAX} now: take it off ONE_RUNE_EXCEPTIONS`).toBeGreaterThan(ONE_RUNE_MAX);
      } else expect(o.ratio, o.label).toBeLessThanOrEqual(ONE_RUNE_MAX);
    }
  });

  it('a boss is never frozen', () => {
    for (const b of r.builds) for (const l of b.levels) expect(l.run.bossFrozen, `${b.tag} Lv${l.level}`).toBe(0);
  });

  it('every node 8c and 8d left unmeasured is cast by some build of hers', () => {
    for (const s of r.uncast) expect(UNCAST[s], `${s} is not cast and has no reason in UNCAST`).toBeTruthy();
  });
});
