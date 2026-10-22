import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABYSS } from '../data/hero';
import {
  BAND_EXCEPTIONS, ORDEAL_FLOORS, BUILD_LEVELS, BUILD_SEEDS, DEEP_LINEUP, ONE_RUNE_EXCEPTIONS, ONE_RUNE_MAX, ONE_RUNE_MAX_LEGENDARY, UNCAST, UNCAST_BEFORE, WIN_SLACK_FIGHTS, buildLevels,
  buildLineup, firstRuneSkill, measureBuild, measureStandard,
  scenarioFights, standardLineup,
} from './buildBands';
import { BUILDS, buildOf } from '../data/builds';
import type { CharacterId } from './types';
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
    // E4: the healers' ordeal is the Lantern-eater deeper still: four floors at Lv35, six at Lv50 (the review: two left
    // every standard party winning every fight, so the comparison said nothing).
    expect(ORDEAL_FLOORS).toEqual({ 35: 4, 50: 6 });
    expect(scenarioFights('ordeal', 35)).toEqual([{ enemyIds: ['lanterneater'], boss: true, scale: { depth: depth + 4, region: 'mainline' }, seeds: BUILD_SEEDS.boss }]);
    expect(scenarioFights('ordeal', 50)[0].scale.depth).toBe(parityDepth(50) + 6);
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
    let kos = 0;
    const trace: SimTrace = {
      round(_a, before, after) {
        const rin = before.party.find((c) => c.key === 'rin');
        kos += after.log.filter((e) => e.type === 'ko' && before.party.some((c) => c.key === e.target)).length;
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
    // The party's KOs over the fights, as the log shows them (the healers' band, ruling E4); wins as a count (E1).
    expect(a.partyKos).toBe(kos);
    expect(a.wins).toBe(Math.round(a.rate * a.fights));
  });

  it('a triggered cast counts as a cast of its skill', () => {
    // 反擊之壁's 炎環斬 is cast by 受擊觸發 alone: the review counted it idle.
    const seen = new Set<string>();
    measureBuild('scarlet', buildLineup('scarlet', 'riposte'), 'long', 35, seen);
    expect(seen.has('blaze-ring')).toBe(true);
  });

  it('the standard and bare measurements are cached', () => {
    const one = measureStandard('rin', 'boss', 35);
    expect(measureStandard('rin', 'boss', 35)).toBe(one);
    expect(one).toEqual(measureBuild('rin', standardLineup('rin'), 'boss', 35));
  });

  it('the levels a build is measured at, and how it is judged (controller rulings E1-E4)', () => {
    expect(WIN_SLACK_FIGHTS).toBe(2);
    expect([ONE_RUNE_MAX, ONE_RUNE_MAX_LEGENDARY]).toEqual([1.6, 2.0]);
    expect(buildLevels(buildOf('noel', 'meteor')!)).toEqual([50]);
    expect(buildLevels(buildOf('bobby', 'factory')!)).toEqual([50]);
    expect(buildLevels(buildOf('noel', 'cycle')!)).toEqual([35, 50]);
    expect([buildOf('safira', 'festival')!.role, buildOf('hero', 'healer')!.role, buildOf('selene', 'fullmoon')!.role]).toEqual(['gauge', 'heal', 'heal']);
    expect([buildOf('hero', 'healer')!.scenario, buildOf('selene', 'fullmoon')!.scenario]).toEqual(['ordeal', 'ordeal']);
  });

  it('every known exception is a real build, named for the controller, with a reason', () => {
    for (const [tag, e] of Object.entries(BAND_EXCEPTIONS)) {
      const [owner, key] = tag.split('/') as [CharacterId, string];
      expect(buildOf(owner, key), tag).toBeDefined();
      expect([e.decider, e.reason.length > 0], tag).toEqual(['controller', true]);
    }
    for (const [label, e] of Object.entries(ONE_RUNE_EXCEPTIONS)) {
      const [tag, pair] = label.split(' ');
      const [owner, key] = tag.split('/') as [CharacterId, string];
      expect(buildOf(owner, key), label).toBeDefined();
      expect(pair.startsWith(`${firstRuneSkill(owner, key)}+`), label).toBe(true);
      expect([e.decider, e.reason.length > 0], label).toEqual(['controller', true]);
    }
    // The uncast list holds only skills no build casts, each with a reason; 全面整備 is an ultimate no build takes.
    for (const [skill, why] of Object.entries(UNCAST)) expect(UNCAST_BEFORE.includes(skill) && why.length > 0, skill).toBe(true);
    for (const b of BUILDS.bobby) expect(b.capstone === undefined || b.capstone !== 1, b.key).toBe(true);
  });

  it("the deep lineup is balance.test.ts's", () => {
    expect(DEEP_LINEUP).toEqual({ memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced' });
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'balance.test.ts'), 'utf8');
    expect(src).toContain("const MEMORIES_BUILD: HeroBuild = 'balanced';");
    expect(src).toContain('const DEEP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: MEMORIES_BUILD };');
  });
});
