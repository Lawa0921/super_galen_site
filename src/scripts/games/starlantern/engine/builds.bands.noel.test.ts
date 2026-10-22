/**
 * The rune bands of noel's builds (spec §12.4, plan 8h Task 5b): opt-in (BANDS=1, npm run test:starlantern:bands), one file
 * a member so two workers can share them; every number reported with BALANCE_REPORT set. A build is judged by its role
 * (controller rulings E1–E4); any known exception is the controller's to decide, still checked to fail, and reported.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  BAND_EXCEPTIONS, ONE_RUNE_EXCEPTIONS, ONE_RUNE_MAX, ONE_RUNE_MAX_LEGENDARY, RUNE_VALUE_PCT, UNCAST, WIN_SLACK_FIGHTS, bandResults, type OwnerResult,
} from './buildBands';
import { buildOf } from '../data/builds';
import { SKILLS } from '../data/skills';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[builds] ${line}`); };

describe.skipIf(!on)('the rune bands: noel (plan 8h)', () => {
  let r: OwnerResult;
  beforeAll(() => { r = bandResults('noel', say); }, 3_000_000);

  it('a suggested build earns its place in its own fight, as its role is judged', () => {
    expect(r.builds.length).toBeGreaterThan(0);
    for (const b of r.builds) {
      const role = buildOf('noel', b.key)!.role;
      const fails = b.levels.flatMap((l) => {
        const why: string[] = [];
        const at = `Lv${l.level}`;
        // Every role: each skill that holds a rune is cast (a trigger's cast counts; 常駐 works uncast).
        if (l.idle.length) why.push(`${at} runes on skills never cast: ${l.idle.join(' ')}`);
        if (role === 'heal') {
          // E4: the party wins as often and loses no more members in the ordeal; her contribution is reported only.
          if (l.run.wins < l.std.wins) why.push(`${at} wins ${l.run.wins} < ${l.std.wins} of ${l.run.fights}`);
          if (l.run.partyKos > l.std.partyKos) why.push(`${at} KOs ${l.run.partyKos} > ${l.std.partyKos}`);
          return why;
        }
        if (role === 'gauge') {
          // E3: the party wins as often; the gauge she feeds is reported apart.
          if (l.run.wins < l.std.wins) why.push(`${at} wins ${l.run.wins} < ${l.std.wins} of ${l.run.fights}`);
        } else {
          // §12.4 with E1: a fifth more, and no more than WIN_SLACK_FIGHTS fights lost beyond the standard's.
          if (l.run.perRound < (l.std.perRound * (100 + RUNE_VALUE_PCT)) / 100) why.push(`${at} ${l.run.perRound.toFixed(1)} < ${l.std.perRound.toFixed(1)} x ${1 + RUNE_VALUE_PCT / 100}`);
          if (l.run.wins < l.std.wins - WIN_SLACK_FIGHTS) why.push(`${at} wins ${l.run.wins} < ${l.std.wins} - ${WIN_SLACK_FIGHTS} of ${l.run.fights}`);
        }
        if (l.run.perRound <= l.bare.perRound) why.push(`${at} runes do not pay: ${l.run.perRound.toFixed(1)} <= bare ${l.bare.perRound.toFixed(1)}`);
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
      const max = o.legendary ? ONE_RUNE_MAX_LEGENDARY : ONE_RUNE_MAX;
      const known = ONE_RUNE_EXCEPTIONS[o.label];
      if (known) {
        say(`blocked ${o.label} ${o.ratio.toFixed(2)} (decider: ${known.decider})`);
        expect(o.ratio, `${o.label} is under ${max} now: take it off ONE_RUNE_EXCEPTIONS`).toBeGreaterThan(max);
      } else expect(o.ratio, o.label).toBeLessThanOrEqual(max);
    }
  });

  it('a boss is never frozen', () => {
    for (const b of r.builds) for (const l of b.levels) expect(l.run.bossFrozen, `${b.tag} Lv${l.level}`).toBe(0);
  });

  it('every node 8c and 8d left unmeasured is cast by some build of hers', () => {
    for (const s of r.uncast) expect(UNCAST[s], `${s} is not cast and has no reason in UNCAST`).toBeTruthy();
    // And nothing stays in UNCAST once a build of hers casts it.
    for (const s of Object.keys(UNCAST).filter((x) => SKILLS[x]?.owner === 'noel')) expect(r.uncast, `${s} is cast now: take it off UNCAST`).toContain(s);
  });
});
