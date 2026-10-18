import { describe, expect, it } from 'vitest';
import { kitParty, simBattle, winRate, ODD_LINEUPS, type Lineup } from './sim';
import { STANDARD_LINEUP } from './party';
import { depthLevel, encounterTable } from './scaling';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { ABYSS, type HeroBuild } from '../data/hero';
import type { RegionId } from '../data/regions';
import type { CharacterId, Row } from './types';

/**
 * Band 18, "any lineup works" (spec §4.5, §9.4 point 9; plan 6a Task 20). The four lopsided lineups of ODD_LINEUPS and
 * the standard five, each with every hero build, at depths 4 and 8 (the depth level, the region's encounter table,
 * 20 seeds per group, no gear but a caster hero's own staff: plan 6b Task 20a, hand-off M9). The matrix is measured once;
 * the bands below read it.
 */
const BUILDS: HeroBuild[] = ['balanced', 'sword', 'mage', 'healer', 'tank'];
const DEPTHS = [4, 8];
type LineupKey = keyof typeof ODD_LINEUPS | 'standard';
const LINEUPS: Record<LineupKey, { ids: CharacterId[]; heroRow?: Row; regions: RegionId[] }> = {
  ...ODD_LINEUPS,
  standard: { ids: STANDARD_LINEUP, regions: ['mainline'] },
};

interface Cell { lineup: LineupKey; build: HeroBuild; depth: number; region: RegionId; rate: number; hpLoss: number }

const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;

const cells: Cell[] = [];
const matrix = (): Cell[] => {
  if (cells.length) return cells;
  for (const [lineup, l] of Object.entries(LINEUPS) as [LineupKey, (typeof LINEUPS)[LineupKey]][]) {
    for (const build of BUILDS) for (const depth of DEPTHS) for (const region of l.regions) {
      const r = winRate(depthLevel(depth), encounterTable(region, depth), false, 20, { depth, region }, undefined, undefined, 'skill', 0,
        { ids: l.ids, heroBuild: build, heroRow: l.heroRow, armHero: true });
      cells.push({ lineup, build, depth, region, ...r });
    }
  }
  if (report) {
    for (const c of cells) console.info(`[lineups] ${c.lineup} ${c.build} d${c.depth} ${c.region} rate=${c.rate.toFixed(3)} hpLoss=${c.hpLoss.toFixed(3)}`);
  }
  return cells;
};
const label = (c: Cell) => `${c.lineup} ${c.build} depth ${c.depth} ${c.region}`;

describe('balance 18: any lineup works with the right hero build', () => {
  it('18a fill. every lopsided lineup with its fill build wins >= .85 and loses 10-45% HP', () => {
    const picked = matrix().filter((c) => c.lineup !== 'standard' && c.build === ODD_LINEUPS[c.lineup].fill);
    expect(picked, 'the cells it reads').toHaveLength(10);
    for (const c of picked) {
      ex(c.rate, label(c)).toBeGreaterThanOrEqual(0.85);
      ex(c.hpLoss, label(c)).toBeGreaterThanOrEqual(0.1);
      ex(c.hpLoss, label(c)).toBeLessThanOrEqual(0.45);
    }
  }, 300_000);

  it('18b floor. every lopsided lineup with the balanced build wins >= .75', () => {
    const picked = matrix().filter((c) => c.lineup !== 'standard' && c.build === 'balanced');
    expect(picked, 'the cells it reads').toHaveLength(10);
    for (const c of picked) ex(c.rate, label(c)).toBeGreaterThanOrEqual(0.75);
  }, 300_000);

  it('18c freedom. the standard five win >= .85 with every hero build', () => {
    const picked = matrix().filter((c) => c.lineup === 'standard');
    expect(picked, 'the cells it reads').toHaveLength(BUILDS.length * DEPTHS.length);
    for (const c of picked) ex(c.rate, label(c)).toBeGreaterThanOrEqual(0.85);
  }, 300_000);

  it('18d ceiling. no cell of the matrix loses under 10% HP', () => {
    expect(matrix(), 'the cells it reads').toHaveLength(60);
    for (const c of matrix()) ex(c.hpLoss, label(c)).toBeGreaterThanOrEqual(0.1);
  }, 300_000);

  it('18e no one-round boss. the standard five with every build, ten memories and the abyss at its cap', () => {
    for (const build of BUILDS) {
      const lineup: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: build };
      const fight = (d: number, seed: number, enhance: number) =>
        simBattle(kitParty(depthLevel(d), d, seed, 'rare', enhance, lineup), ['lanterneater'], true, seed, { depth: d, region: 'mainline' }, undefined, 'skill', lineup.abyss);
      for (const d of [5, 10]) {
        let plain = 0, maxed = 0;
        for (let seed = 1; seed <= 20; seed++) {
          const r = fight(d, seed, expectedEnhance(d));
          ex(r.rounds, `${build} depth ${d} seed ${seed}`).toBeGreaterThanOrEqual(3);
          const m = fight(d, seed, ENHANCE_MAX);
          ex(m.rounds, `${build} depth ${d} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
          plain += r.rounds; maxed += m.rounds;
        }
        if (report) console.info(`[lineups] 18e ${build} d${d} rounds=${(plain / 20).toFixed(2)} +${ENHANCE_MAX} rounds=${(maxed / 20).toFixed(2)}`);
      }
    }
  }, 300_000);
});
