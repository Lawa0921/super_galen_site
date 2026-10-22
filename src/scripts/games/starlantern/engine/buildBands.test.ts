import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABYSS } from '../data/hero';
import { BUILD_LEVELS, BUILD_SEEDS, DEEP_LINEUP, buildLineup, measureBuild, measureStandard, scenarioFights, standardLineup } from './buildBands';
import { parityDepth } from './parity';
import { encounterTable } from './scaling';
import { setSimTrace, type SimTrace } from './sim';
import { skillFor } from './battle';

describe('rune band measurements (plan 8h Task 5a)', () => {
  it('the fights of each scenario', () => {
    expect(BUILD_LEVELS).toEqual([35, 50]);
    const depth = parityDepth(35);
    const groups = encounterTable('mainline', depth);
    const boss = scenarioFights('boss', 35);
    expect(boss).toEqual([{ enemyIds: ['lanterneater'], boss: true, scale: { depth, region: 'mainline' }, seeds: BUILD_SEEDS.boss }]);
    expect(BUILD_SEEDS).toEqual({ boss: 40, crowd: 10, long: 10 });
    const crowd = scenarioFights('crowd', 35);
    // A crowd is two groups at once, each with the next (plan 8h Task 5b, H2: one group alone fell in about a round at Lv 50).
    expect(crowd.map((f) => f.enemyIds)).toEqual(groups.map((g, i) => [...g, ...groups[(i + 1) % groups.length]]));
    expect(crowd.every((f) => !f.boss && f.seeds === 10 && f.scale.elite === undefined)).toBe(true);
    const long = scenarioFights('long', 35);
    expect(long.map((f) => f.scale.elite)).toEqual(groups.map((g) => g[0]));
    expect(long.every((f) => f.seeds === 10)).toBe(true);
    const general = scenarioFights('general', 35);
    expect(general.map((f) => f.enemyIds)).toEqual([...groups, ['lanterneater']]);
    expect(general.every((f) => f.seeds === 10)).toBe(true);
  });

  it('a measurement is the same twice, and its casts are the casts the fights show', () => {
    const lineup = buildLineup('rin', 'silent');
    const seen = new Set<string>();
    // Count her casts of each skill as the log shows them, through a trace installed around the measurement.
    const ids = ['rin-mark', 'rin-needle', 'rin-fan', 'rin-backstab', 'rin-veil', 'rin-execute'];
    const byLog: Record<string, number> = {};
    let acts = 0;
    const trace: SimTrace = {
      round(_a, before, after) {
        const rin = before.party.find((c) => c.key === 'rin');
        for (const id of ids) {
          const name = rin ? skillFor(rin, id)?.name : undefined;
          const n = after.log.filter((e) => e.type === 'act' && e.actor === 'rin' && e.label === name).length;
          byLog[id] = (byLog[id] ?? 0) + n;
          acts += n;
        }
      },
      end() {},
    };
    setSimTrace(trace);
    const a = measureBuild('rin', lineup, 'boss', 35, seen, { forward: true });
    // Without asking, an earlier trace is not told (plan 8h Task 5b, H4).
    const before = acts;
    measureBuild('rin', lineup, 'boss', 35);
    expect(acts).toBe(before);
    setSimTrace(null);
    const b = measureBuild('rin', lineup, 'boss', 35);
    expect(a).toEqual(b);
    expect(a.rounds).toBeGreaterThan(0);
    expect(a.perRound).toBeGreaterThan(0);
    expect(acts).toBeGreaterThan(0);
    for (const id of ids) expect(a.bySkill[id]?.casts ?? 0, id).toBe(byLog[id]);
    expect(seen.has('rin-execute')).toBe(true);
    expect(a.minBossRounds).toBeGreaterThan(0);
  });

  it('the standard and bare measurements are cached', () => {
    const one = measureStandard('rin', 'boss', 35);
    expect(measureStandard('rin', 'boss', 35)).toBe(one);
    expect(one).toEqual(measureBuild('rin', standardLineup('rin'), 'boss', 35));
  });

  it("the deep lineup is balance.test.ts's", () => {
    expect(DEEP_LINEUP).toEqual({ memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced' });
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'balance.test.ts'), 'utf8');
    expect(src).toContain("const MEMORIES_BUILD: HeroBuild = 'balanced';");
    expect(src).toContain('const DEEP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: MEMORIES_BUILD };');
  });
});
