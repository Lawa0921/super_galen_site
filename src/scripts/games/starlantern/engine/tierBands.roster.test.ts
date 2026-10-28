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
import { LEGACY_ENEMY_IDS, REGION_BOSSES, ROSTER_LIVE, bossFor, wardenFor, wardenGroup } from '../data/monsters';
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
/** The boss of a boss group (its parts lead the line: data/monsters.ts bossFor). */
const bossOf = (group: string[]): string => group.find((id) => ENEMIES[id].boss) ?? group[0];
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

/**
 * Controller ruling 2026-10-28 (plan L1b): 22j's cells still red for bosses and wardens that are not live yet, each named,
 * each the acceptance item of its own go-live wave (plan L2–L4). A deferred cell is still measured and printed (`deferred
 * to Ln`), only not asserted; every other cell must pass. Its wave's go-live commit removes it (pinned below).
 */
const DEFERRED_22J: Record<string, { wave: 'L2' | 'L3' | 'L4'; id: string }> = {
  'bog-leviathan mire d15 hell rare bare': { wave: 'L4', id: 'bog-leviathan' },
  'bog-leviathan mire d15 nightmare magic bare': { wave: 'L4', id: 'bog-leviathan' },
  'faceless-host shade d20 hell rare bare': { wave: 'L4', id: 'faceless-host' },
  'grey-blight mire d25 hell rare': { wave: 'L4', id: 'grey-blight' },
  'grey-blight mire d25 nightmare magic': { wave: 'L4', id: 'grey-blight' },
  'last-commander iron d15 hell rare bare': { wave: 'L4', id: 'last-commander' },
  'last-commander iron d15 nightmare magic bare': { wave: 'L4', id: 'last-commander' },
  'shadow-parade shade d15 hell rare': { wave: 'L4', id: 'shadow-parade' },
  'shadow-parade shade d15 nightmare magic': { wave: 'L4', id: 'shadow-parade' },
  'siege-titan iron d10 hell rare bare': { wave: 'L4', id: 'siege-titan' },
  'siege-titan iron d10 nightmare magic bare': { wave: 'L4', id: 'siege-titan' },
  'vault-dragon shade d10 hell rare bare': { wave: 'L4', id: 'vault-dragon' },
  'gate-breaker iron': { wave: 'L4', id: 'gate-breaker' },
  'grey-elder mire': { wave: 'L4', id: 'grey-elder' },
  'locked-vault shade': { wave: 'L4', id: 'locked-vault' },
};
/**
 * Spec §0 item 22 (plan L2b; the user's direction 2026-10-28, balance is not the priority): 22j's cells of a live boss or
 * warden still red after its wave's one simple tuning attempt. Each is still measured and printed (`exception`) and held to
 * its own floor instead, the measured rate less .01. Pinned below; backlog F6.
 */
const EXCEPTION_22J: Record<string, { min?: number; max?: number; why: string }> = {
  'requiem-conductor mainline': { min: 0.397, why: 'its attempt (召集歌隊 two calls → one) moved nothing (.421); back at two; the choir it calls mends every foe (item 22)' },
  // Spec §0 item 23 (plan L3b; controller ruling 2026-10-28): the third wave's cells still red after their one attempt, a
  // built cell held to its measured rate less .01, a bare one (the party that spent no points should lose) to its rate plus
  // .01, each rounded outward to three places. An attempt that moved a cell toward the eater's odds is kept; one that moved nothing is back at the spec. Backlog F7.
  'mirage-city blaze d15 nightmare magic': { min: 0.719, why: 'its attempt (幻之火 110 → 90, 城門崩落 160 → 130) took .621 to .729 against the eater .958 (item 23)' },
  'mirage-city blaze d15 hell rare': { min: 0.74, why: 'its attempt took .664 to .750 against the eater .964 (item 23)' },
  'ember-tyrant blaze d20 nightmare magic bare': { max: 0.748, why: 'its attempt (烈焰之拳 160/165 → 195/200) took the bare party .783 to .738 against the eater .550 (item 23)' },
  'ember-tyrant blaze d20 hell rare bare': { max: 0.418, why: 'its attempt took the bare party .450 to .407 against the eater .293 (item 23)' },
  'rime-sovereign frost d20 nightmare magic': { min: 0.585, why: 'two pillars that mend and guard it; its attempt (冰之加護 25 → 15) moved nothing (.600), back at 25 (item 23)' },
  'rime-sovereign frost d20 hell rare': { min: 0.525, why: 'its attempt moved nothing (.557), back at the spec (item 23)' },
  'white-silence frost d25 nightmare magic bare': { max: 0.748, why: 'its attempt (冰柱落下 175/.35 → 205/.45) took the bare party .771 to .738 against the eater .446 (item 23)' },
  'white-silence frost d25 hell rare bare': { max: 0.625, why: 'its attempt took the bare party .643 to .614 against the eater .229 (item 23)' },
  'storm-conductor storm d25 nightmare magic bare': { max: 0.61, why: 'its attempt (雷杖 190 → 225) took the bare party .742 to .600 against the eater .217 (item 23)' },
  'storm-conductor storm d25 hell rare bare': { max: 0.553, why: 'its attempt took the bare party .636 to .543 against the eater .050 (item 23)' },
  'ice-shrine frost': { min: 0.697, why: 'its attempt (喚醒狛犬 two calls → one) took Hell depth 23 .236 to .707 (item 23)' },
};
/** L3b review: a bare cell holds its rate from above only (`max`), every other from below only (`min`). */
function directionBreaks22J(t: Record<string, { min?: number; max?: number; why: string }>): string[] {
  return Object.entries(t).flatMap(([k, e]) => {
    if (k.endsWith(' bare')) return e.max !== undefined && e.min === undefined ? [] : [`${k}: not max only`];
    return e.min !== undefined && e.max === undefined ? [] : [`${k}: not min only`];
  });
}
const excepted = (label: string, rate: number): boolean => {
  const e = EXCEPTION_22J[label];
  if (!e) return false;
  say(`exception ${label}: ${e.why}; ${e.min !== undefined ? `floor >= ${e.min.toFixed(3)}` : `ceiling <= ${e.max!.toFixed(3)}`}`);
  if (e.min !== undefined) ex(rate, `${label} (exception floor)`).toBeGreaterThanOrEqual(e.min);
  if (e.max !== undefined) ex(rate, `${label} (exception ceiling)`).toBeLessThanOrEqual(e.max);
  return true;
};
const deferred = (label: string): boolean => {
  const d = DEFERRED_22J[label];
  if (d) say(`deferred to ${d.wave}: ${label}`);
  return !!d;
};

describe('band 22j names its exceptions (spec §0 item 22, plan L2b)', () => {
  it('exactly the requiem conductor in Hell at depth 23, with its floor, and the third wave cells (item 23)', () => {
    expect(Object.fromEntries(Object.entries(EXCEPTION_22J).map(([k, e]) => [k, e.min ?? e.max]))).toEqual({
      'requiem-conductor mainline': 0.397,
      // Spec §0 item 23 (plan L3b): a built cell holds its rate from below, a bare cell from above.
      'mirage-city blaze d15 nightmare magic': 0.719,
      'mirage-city blaze d15 hell rare': 0.74,
      'ember-tyrant blaze d20 nightmare magic bare': 0.748,
      'ember-tyrant blaze d20 hell rare bare': 0.418,
      'rime-sovereign frost d20 nightmare magic': 0.585,
      'rime-sovereign frost d20 hell rare': 0.525,
      'white-silence frost d25 nightmare magic bare': 0.748,
      'white-silence frost d25 hell rare bare': 0.625,
      'storm-conductor storm d25 nightmare magic bare': 0.61,
      'storm-conductor storm d25 hell rare bare': 0.553,
      'ice-shrine frost': 0.697,
    });
    for (const [k, e] of Object.entries(EXCEPTION_22J)) expect([k.endsWith(' bare'), e.max !== undefined, e.min === undefined], k).toEqual([k.endsWith(' bare'), k.endsWith(' bare'), k.endsWith(' bare')]);
    for (const e of Object.values(EXCEPTION_22J)) expect(e.why, e.why).toMatch(/item 2[23]/);
  });
  it('each cell holds one direction: a bare cell from above only, every other from below only (L3b review)', () => {
    expect(directionBreaks22J(EXCEPTION_22J)).toEqual([]);
    expect(directionBreaks22J({ ...EXCEPTION_22J, 'ice-shrine frost': { min: 0.697, max: 0.9, why: 'x' } })).toEqual(['ice-shrine frost: not min only']);
    expect(directionBreaks22J({ ...EXCEPTION_22J, 'ember-tyrant blaze d20 hell rare bare': { min: 0.418, why: 'x' } })).toEqual(['ember-tyrant blaze d20 hell rare bare: not max only']);
  });
});

describe('band 22j defers only what is not live yet (controller ruling 2026-10-28)', () => {
  const liveDeferred = () => [...new Set(Object.values(DEFERRED_22J).map((d) => d.id))].filter((id) => ROSTER_LIVE.has(id));
  it('no live boss or warden keeps a deferred cell', () => {
    expect(liveDeferred()).toEqual([]);
    withRosterLive(['grey-elder'], () => expect(liveDeferred()).toEqual(['grey-elder']));
  });
  it('every deferred cell names a roster boss or warden', () => {
    for (const [label, d] of Object.entries(DEFERRED_22J)) {
      expect(ENEMIES[d.id], label).toBeDefined();
      expect(label.startsWith(`${d.id} `), label).toBe(true);
    }
  });
});

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
      .map((depth) => ({ region, depth, group: bossFor(region, depth) })).filter((c) => c.group.at(-1) !== 'lanterneater')));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) for (const hell of [false, true]) {
      const runs = (bare: boolean) => withRosterLive(ROSTER, () =>
        pooled((hell ? AFFIX_PAIRS : AFFIX_IDS.map((a) => [a] as const)).map((a) => measureCell(cell(c.depth, c.region, c.group, hell, a, bare)))));
      const built = runs(false), bare = runs(true);
      const label = `${bossOf(c.group)} ${c.region} d${c.depth} ${hell ? 'hell rare' : 'nightmare magic'}`;
      say(line(label, built));
      say(line(`${label} bare`, bare));
      if (!deferred(label) && !excepted(label, built.rate)) ex(built.rate, label).toBeGreaterThanOrEqual(eater(c.depth, c.region, hell, false).rate - 0.1);
      if (!deferred(`${label} bare`) && !excepted(`${label} bare`, bare.rate)) ex(bare.rate, `${label} bare`).toBeLessThanOrEqual(eater(c.depth, c.region, hell, true).rate + 0.1);
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
      if (!deferred(`${id} ${region}`) && !excepted(`${id} ${region}`, r.rate)) ex(r.rate, `${id} ${region}`).toBeGreaterThanOrEqual(0.75);
    });
  }, 3_000_000);
});
