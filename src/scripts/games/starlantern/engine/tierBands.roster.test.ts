/**
 * Band 22j, the roster on the higher difficulties (roster plan B12, spec §9.3; ruling 5): every new boss at the depths 10–25
 * it is met at, on Nightmare's magic tier with N3's party and affixes and on Hell's rare tier with H2's (a trigger or 常駐
 * combo, every pair of affixes, ten fights a pair), against the lantern-eater in the same cell: its win rate at least the
 * eater's − 0.10, and the bare party's at most the bare eater's + 0.10. Every warden met in Hell between depths 20 and 25
 * (depth 23: no warden stands on 20 or 25) wins ≥ .75 over every pair, as HE asks of an elite. Recorded in plan B2; it must
 * pass in the go-live tasks (plan L). Opt-in, every roster id live:
 *
 *   BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/tierBands.roster.test.ts --testTimeout=3000000
 *
 * Report lines start with `[roster-tier]`.
 */
import { describe, expect, it } from 'vitest';
import { AFFIX_IDS, type AffixId } from '../data/affixes';
import { ENEMIES } from '../data/enemies';
import { LEGACY_ENEMY_IDS, REGION_BOSSES, bossFor, wardenFor, wardenGroup } from '../data/monsters';
import type { RegionId } from '../data/regions';
import { MAX_LEVEL } from './party';
import { depthLevel } from './scaling';
import { AFFIX_PAIRS, HELL_BOSS_SEEDS, TIER_SEEDS, measureCell, pooled, tierLineup, withTrigger, type TierCell, type TierRun } from './tierBands';
import { withRosterLive } from './testing';

const on = process.env.BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;
const say = (line: string) => { if (report) console.info(`[roster-tier] ${line}`); };
const line = (label: string, r: TierRun) => `${label} rate=${r.rate.toFixed(3)} hpLoss=${r.hpLoss.toFixed(3)} rounds=${r.rounds.toFixed(2)} fights=${r.fights}`;

const ROSTER = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
const LANDS = Object.keys(REGION_BOSSES) as RegionId[];
const levelAt = (d: number) => Math.min(MAX_LEVEL, depthLevel(d));

/** A boss cell as N3 (Nightmare, magic, one affix) or H2 (Hell, rare with a trigger, a pair, ten fights) builds it. */
function cell(depth: number, region: RegionId, group: string[], hell: boolean, affixes: readonly AffixId[], bare: boolean): TierCell {
  const tier = bare ? 'bare' : hell ? 'rare' : 'magic';
  const lineup = tierLineup(levelAt(depth), 'boss', tier);
  return {
    depth, region, kind: 'boss', groups: [group], difficulty: hell ? 'hell' : 'nightmare', affixes,
    lineup: hell && !bare ? withTrigger(lineup, levelAt(depth)) : lineup, seeds: hell ? HELL_BOSS_SEEDS : TIER_SEEDS,
  };
}

describe.skipIf(!on)('band 22j: the roster on Nightmare and Hell (roster plan B12)', () => {
  const eaters = new Map<string, TierRun>();
  /** The lantern-eater's pooled run in the same cells (measured with nothing live, the way the old bands see it). */
  const eater = (depth: number, region: RegionId, hell: boolean, bare: boolean): TierRun => {
    const key = `${depth} ${region} ${hell} ${bare}`;
    let r = eaters.get(key);
    if (!r) {
      r = pooled((hell ? AFFIX_PAIRS : AFFIX_IDS.map((a) => [a] as const)).map((a) => measureCell(cell(depth, region, ['lanterneater'], hell, a, bare))));
      eaters.set(key, r);
      say(line(`lanterneater ${region} d${depth} ${hell ? 'hell' : 'nightmare'} ${bare ? 'bare' : 'built'}`, r));
    }
    return r;
  };

  it('22j every new boss holds the lantern-eater\'s odds, built and bare', () => {
    const cells = withRosterLive(ROSTER, () => (['mainline', ...LANDS] as RegionId[]).flatMap((region) => [10, 15, 20, 25]
      .map((depth) => ({ region, depth, group: bossFor(region, depth) })).filter((c) => c.group[0] !== 'lanterneater')));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) for (const hell of [false, true]) {
      const runs = (bare: boolean) => withRosterLive(ROSTER, () =>
        pooled((hell ? AFFIX_PAIRS : AFFIX_IDS.map((a) => [a] as const)).map((a) => measureCell(cell(c.depth, c.region, c.group, hell, a, bare)))));
      const built = runs(false), bare = runs(true);
      const label = `${c.group[0]} ${c.region} d${c.depth} ${hell ? 'hell rare' : 'nightmare magic'}`;
      say(line(label, built));
      say(line(`${label} bare`, bare));
      ex(built.rate, label).toBeGreaterThanOrEqual(eater(c.depth, c.region, hell, false).rate - 0.1);
      ex(bare.rate, `${label} bare`).toBeLessThanOrEqual(eater(c.depth, c.region, hell, true).rate + 0.1);
    }
  }, 3_000_000);

  it('22j every warden met in Hell at depth 23 wins >= .75 over every pair', () => {
    for (const region of ['mainline', ...LANDS] as RegionId[]) withRosterLive(ROSTER, () => {
      const id = wardenFor(region, 23);
      if (!id) return;
      const group = wardenGroup(id);
      const runs = AFFIX_PAIRS.map((p) => measureCell({
        depth: 23, region, kind: 'elite', groups: [group], difficulty: 'hell', affixes: p, lineup: tierLineup(levelAt(23), 'elite', 'rare'), seeds: HELL_BOSS_SEEDS,
      }));
      const r = pooled(runs);
      say(line(`warden ${id} ${region} d23 hell rare`, r));
      ex(r.rate, `${id} ${region}`).toBeGreaterThanOrEqual(0.75);
    });
  }, 3_000_000);
});
