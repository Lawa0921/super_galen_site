/**
 * The rune bands (spec §12.4, plan 8h Task 5a): every suggested rune build measured in its scenario against her standard
 * build, its ceiling at the top tier, and one rune at a time on its first skill. This task reports every number (with
 * BALANCE_REPORT set) and asserts only that each was measured; plan 8h Task 5b holds them to their bands.
 */
import { describe, expect, it } from 'vitest';
import { BUILDS, type BuildDef } from '../data/builds';
import { CHARACTER_IDS } from '../data/characters';
import {
  BUILD_LEVELS, CEILING_DEPTHS, bareLineup, buildLineup, firstRuneSkill, measureBuild, measureCeiling, measureOneRune, oneRuneCandidates,
  standardLineup,
} from './buildBands';
import { parityDepth } from './parity';
import { partyAt } from './sim';

const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const say = (line: string) => { if (report) console.info(`[builds] ${line}`); };
const f2 = (n: number) => n.toFixed(2);

/** Skills the sim never cast before step ⑧ (plan 8h ruling 11k): each build that plays one should now cast it. */
const UNCAST_BEFORE = ['cover', 'atoning-flame', 'clap', 'mirage-step', 'barrier', 'overclock', 'emergency-repair', 'moon-recall', 'full-moon-night', 'jackpot', 'flame-burst'];

describe('the rune bands (plan 8h)', () => {
  it('reports every rune band number', () => {
    const builds: BuildDef[] = CHARACTER_IDS.flatMap((id) => BUILDS[id].filter((b) => b.key !== 'standard'));
    const seenAll = new Set<string>();
    let measured = 0;
    for (const b of builds) {
      const tag = `${b.owner}/${b.key}`;
      for (const level of BUILD_LEVELS) {
        const scenario = b.scenario!;
        const seen = new Set<string>();
        const std = measureBuild(b.owner, standardLineup(b.owner), scenario, level);
        const run = measureBuild(b.owner, buildLineup(b.owner, b.key), scenario, level, seen);
        const bare = measureBuild(b.owner, bareLineup(b.owner, b.key), scenario, level);
        const pct = std.perRound ? ((run.perRound - std.perRound) * 100) / std.perRound : 0;
        say(`${tag} Lv${level} ${scenario} standard ${f2(std.perRound)} build ${f2(run.perRound)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) bare ${f2(bare.perRound)} win ${f2(run.rate)}/${f2(std.rate)}`);
        for (const [skill, s] of Object.entries(run.bySkill)) say(`skill ${tag} Lv${level} ${skill} casts ${s.casts} per-cast ${f2(s.casts ? s.total / s.casts : 0)}`);
        if (run.bossFrozen) say(`frozen ${tag} Lv${level} ${run.bossFrozen}`);
        // A socketed skill the build never casts in its own fights (the review's check: reported, not asserted).
        const sockets = partyAt(level, { ...buildLineup(b.owner, b.key), expect: true }, parityDepth(level)).roster[b.owner].sockets ?? {};
        const idle = Object.keys(sockets).filter((s) => !seen.has(s));
        if (idle.length) say(`idle-rune ${tag} Lv${level} ${idle.join(' ')}`);
        for (const s of seen) seenAll.add(s);
        expect(run.rounds, `${tag} Lv${level}`).toBeGreaterThan(0);
        expect(std.rounds, `${tag} Lv${level}`).toBeGreaterThan(0);
        measured++;
      }
      for (const depth of CEILING_DEPTHS) {
        for (const mode of ['plain', 'deep'] as const) {
          const rounds = measureCeiling(b.owner, b.key, depth, mode);
          say(`ceiling ${tag} d${depth} ${mode} min ${Math.min(...rounds)}`);
          expect(rounds.length).toBeGreaterThan(0);
        }
      }
      const skill = firstRuneSkill(b.owner, b.key);
      const without = measureOneRune(b.owner, b.key, null);
      for (const r of oneRuneCandidates(b.owner, b.key)) {
        const withIt = measureOneRune(b.owner, b.key, r);
        const ratio = without.perCast ? withIt.perCast / without.perCast : 0;
        say(`one-rune ${tag} ${skill}+${r.id} ${f2(ratio)} casts ${withIt.casts}/${without.casts}`);
      }
    }
    say(`uncast ${UNCAST_BEFORE.filter((s) => !seenAll.has(s)).join(' ') || '(none)'}`);
    expect(measured).toBe(builds.length * BUILD_LEVELS.length);
  });
});
