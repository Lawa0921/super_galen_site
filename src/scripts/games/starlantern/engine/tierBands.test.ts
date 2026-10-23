/**
 * The difficulty bands' measurements (difficulty plan Task 0): who a cell fields and how a cell is measured. Small and
 * quick; the bands themselves are opt-in (tierBands.{baseline,nightmare,hell}.test.ts, BANDS=1).
 */
import { describe, expect, it } from 'vitest';
import { BUILDS, buildOf } from '../data/builds';
import { STANDARD_LINEUP } from './party';
import { ODD_LINEUPS } from './sim';
import { encounterTable } from './scaling';
import { BASELINE_DEPTHS, BASELINE_TIERS, FEASIBLE, baselineLine, measureCell, pullsApart, roadCell, tierLineup, TIER_SEEDS, type TierRun } from './tierBands';
import type { CharacterId } from './types';

describe('difficulty band measurements (difficulty plan Task 0)', () => {
  it('tierLineup picks each member\'s build for the cell', () => {
    expect(TIER_SEEDS).toBe(40);
    const l = tierLineup(38, 'crowd', 'magic');
    expect(l.runeTier).toBe('magic');
    expect(l.ids).toEqual(STANDARD_LINEUP);
    const build = l.build!;
    // 暴走流星 is suggested from Lv 40: at Lv 38 Noel wears the next build that qualifies.
    expect(buildOf('noel', 'meteor')!.minLevel).toBe(40);
    expect(build.noel).toBeDefined();
    expect(build.noel).not.toBe('meteor');
    expect(build.noel).toBe(BUILDS.noel.find((b) => b.key !== 'standard' && (b.minLevel ?? 0) <= 38)!.key);
    for (const id of STANDARD_LINEUP) {
      const key = build[id];
      expect(key, id).toBeDefined();
      const worn = buildOf(id, key!)!;
      expect(worn.key, id).not.toBe('standard');
      expect((worn.minLevel ?? 0) <= 38, id).toBe(true);
      const hasCrowd = BUILDS[id].some((b) => b.scenario === 'crowd' && (b.minLevel ?? 0) <= 38);
      if (hasCrowd) expect(worn.scenario, id).toBe('crowd');
    }
    expect(l.heroBuild).toBe(buildOf('hero', build.hero!)!.hero);
    // An elite cell is fought as a crowd; a boss cell picks the boss builds.
    expect(tierLineup(38, 'elite', 'magic')).toEqual(l);
    const boss = tierLineup(50, 'boss', 'rare');
    expect(boss.runeTier).toBe('rare');
    for (const id of STANDARD_LINEUP) {
      const has = BUILDS[id].some((b) => b.scenario === 'boss');
      if (has) expect(buildOf(id, boss.build![id]!)!.scenario, id).toBe('boss');
    }
    // A hero fill: the hero wears the build whose `hero` is the fill.
    const ids: CharacterId[] = ['hero', 'rin', 'scarlet', 'chizuru', 'safira'];
    const fill = tierLineup(50, 'crowd', 'magic', ids, 'healer');
    expect(fill.ids).toEqual(ids);
    expect(buildOf('hero', fill.build!.hero!)!.hero).toBe('healer');
    expect(fill.heroBuild).toBe('healer');
    // Every fill of the odd lineups resolves at every level a cell is measured at (Lv 38 and the cap); none throws.
    for (const [k, odd] of Object.entries(ODD_LINEUPS)) for (const level of [38, 50]) for (const kind of ['crowd', 'boss'] as const) {
      const l = tierLineup(level, kind, 'magic', odd.ids, odd.fill);
      expect(l.heroBuild, `${k} Lv${level} ${kind}`).toBe(odd.fill);
    }
    // A fill the hero has no build for throws (the balanced hero's only rune build is 殘響, which is no fill).
    expect(() => tierLineup(50, 'crowd', 'magic', ['hero'], 'tank-x' as never)).toThrow(/no rune build for the fill/);
    // Bare: the default, no build and no runes.
    const bare = tierLineup(38, 'crowd', 'bare');
    expect(bare.build).toBeUndefined();
    expect(bare.runeTier).toBeUndefined();
    expect(bare.heroBuild).toBeUndefined();
  });

  it('measureCell is deterministic and counts the cap as a loss', () => {
    const groups = encounterTable('mainline', 3);
    const cell = { depth: 3, region: 'mainline' as const, kind: 'crowd' as const, groups, lineup: tierLineup(10, 'crowd', 'magic'), seeds: 2 };
    const a = measureCell(cell);
    expect(measureCell(cell)).toEqual(a);
    expect(a.fights).toBe(groups.length * 2);
    expect(a.rate).toBeGreaterThan(0);
    expect(a.rounds).toBeGreaterThan(0);
    expect(a.minRounds).toBeGreaterThan(0);
    expect(a.minRounds).toBeLessThanOrEqual(a.rounds);
    expect(a.partyFrozen).toBe(0);
    // A fight that reaches the 60-round cap is lost: a lone healer hero cannot fell two Lantern-eaters, nor they him.
    const stall = measureCell({ depth: 5, region: 'mainline', kind: 'crowd', groups: [['lanterneater', 'lanterneater']], lineup: { ids: ['hero'], heroBuild: 'healer' }, seeds: 2, enhance: 0 });
    expect(stall.fights).toBe(2);
    expect(stall.minRounds).toBe(60);
    expect(stall.hpLoss).toBeLessThan(1);
    expect(stall.rate).toBe(0);
  });

  it('a road cell is the floor\'s groups or its Lantern-eater, the cell\'s lineup at the depth\'s level', () => {
    expect(BASELINE_DEPTHS).toEqual([10, 15, 20, 25, 30]);
    expect(BASELINE_TIERS).toEqual(['bare', 'magic', 'rare']);
    expect(roadCell(10, 'boss', 'magic')).toEqual({ depth: 10, region: 'mainline', kind: 'boss', groups: [['lanterneater']], lineup: tierLineup(38, 'boss', 'magic') });
    // Past Lv 50 the level holds at the cap.
    expect(roadCell(20, 'crowd', 'bare')).toEqual({ depth: 20, region: 'mainline', kind: 'crowd', groups: encounterTable('mainline', 20), lineup: tierLineup(50, 'crowd', 'bare') });
    expect(roadCell(20, 'crowd', 'rare', 'nightmare').difficulty).toBe('nightmare');
    expect(baselineLine(10, 'magic', 'boss', { rate: 0.95, hpLoss: 0.1234, rounds: 7.125, minRounds: 5, partyFrozen: 0, fights: 40 }))
      .toBe('d10 magic boss rate 0.950 loss 0.123 rounds 7.13 min 5');
  });

  it('the feasibility gate: at a boss magic pulls apart from bare by HP lost and by rounds; a crowd is reported', () => {
    // Controller ruling on Task 0b: the gate holds at the bosses (both thresholds); Normal crowds are reported only.
    expect(FEASIBLE).toEqual({ depths: [10, 15, 20, 25], lossGap: 0.10, roundsRatio: 0.8, gated: ['boss'] });
    const run = (hpLoss: number, rounds: number): TierRun => ({ rate: 1, hpLoss, rounds, minRounds: 1, partyFrozen: 0, fights: 1 });
    expect(pullsApart(run(0.31, 10), run(0.20, 8))).toBe(true);
    // Either threshold alone is not enough.
    expect(pullsApart(run(0.31, 10), run(0.20, 10))).toBe(false);
    expect(pullsApart(run(0.30, 10), run(0.21, 8))).toBe(false);
    expect(pullsApart(run(0.30, 10), run(0.21, 8.1))).toBe(false);
    expect(pullsApart(run(0.12, 3.35), run(0.12, 2.82))).toBe(false);
  });
});
