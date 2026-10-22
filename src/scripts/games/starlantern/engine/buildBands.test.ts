import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABYSS } from '../data/hero';
import { BUILD_LEVELS, BUILD_SEEDS, DEEP_LINEUP, buildLineup, measureBuild, scenarioFights } from './buildBands';
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
    expect(crowd.map((f) => f.enemyIds)).toEqual(groups);
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
    // Count her casts as the log shows them, through a trace installed around the measurement.
    let acts = 0;
    const trace: SimTrace = {
      round(_a, before, after) {
        const rin = before.party.find((c) => c.key === 'rin');
        const name = rin ? skillFor(rin, 'rin-needle')?.name : undefined;
        acts += after.log.filter((e) => e.type === 'act' && e.actor === 'rin' && e.label === name).length;
      },
      end() {},
    };
    setSimTrace(trace);
    const a = measureBuild('rin', lineup, 'boss', 35, seen);
    setSimTrace(null);
    const b = measureBuild('rin', lineup, 'boss', 35);
    expect(a).toEqual(b);
    expect(a.rounds).toBeGreaterThan(0);
    expect(a.perRound).toBeGreaterThan(0);
    expect(a.bySkill['rin-needle'].casts).toBe(acts);
    expect(acts).toBeGreaterThan(0);
    expect(seen.has('rin-needle')).toBe(true);
    expect(a.minBossRounds).toBeGreaterThan(0);
  });

  it("the deep lineup is balance.test.ts's", () => {
    expect(DEEP_LINEUP).toEqual({ memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced' });
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'balance.test.ts'), 'utf8');
    expect(src).toContain("const MEMORIES_BUILD: HeroBuild = 'balanced';");
    expect(src).toContain('const DEEP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: MEMORIES_BUILD };');
  });
});
