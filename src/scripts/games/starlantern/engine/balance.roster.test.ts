/**
 * Band 22, the monster roster against the lantern-eater and its own kin (roster plan B12, spec §9.3; the thresholds are the
 * bands' they copy, none of their helpers imported, as balance.bond.test.ts does). 22e is withdrawn (ruling 4); 22j is the
 * higher difficulties' (engine/tierBands.roster.test.ts). The roster's fights are measured with every roster id live
 * (summons call only live foes, and the old foes' deep traits come with a roster table); 22c and 22d measure the tables as
 * the live set has them (nothing live: the legacy tables, which must already be green), and report the full roster's.
 * Opt-in, so the full suite keeps its speed:
 *
 *   ROSTER_BANDS=1 BALANCE_REPORT=1 rtk proxy npx vitest run src/scripts/games/starlantern/engine/balance.roster.test.ts --testTimeout=300000
 *
 * Report lines start with `[roster]` (the sim gate's grep does not take them). 22g only reports.
 */
import { describe, expect, it } from 'vitest';
import { ENEMIES } from '../data/enemies';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { SPECIALS } from '../data/gear';
import { LEGACY_ENEMY_IDS, REGION_BOSSES, ROSTER_LIVE, TREASURE, bandOf, bossFor, wardenFor, wardenGroup } from '../data/monsters';
import type { RegionId } from '../data/regions';
import { createBattle, resolveRound } from './battle';
import { choose } from './choose';
import { rollItem } from './loot/item';
import { MAX_LEVEL, SLOTS, statsOf } from './party';
import { mulberry32 } from './rng';
import { depthLevel, encounterTable, legacyEncounterTable } from './scaling';
import { ODD_LINEUPS, kitParty, simBattle, winRate, type Lineup } from './sim';
import { withRosterLive, withRosterOnly } from './testing';
import type { AnyStat, CharacterId, EnemyDef, Party, Slot } from './types';

const on = process.env.ROSTER_BANDS === '1';
const report = !!process.env.BALANCE_REPORT && process.env.BALANCE_REPORT !== '0';
const ex = report ? expect.soft : expect;
const say = (line: string) => { if (report) console.info(`[roster] ${line}`); };
const f3 = (x: number) => x.toFixed(3);
const sayRun = (label: string, r: { rate?: number; hpLoss?: number; rounds?: number }) =>
  say(`${label}${r.rate === undefined ? '' : ` rate=${f3(r.rate)}`}${r.hpLoss === undefined ? '' : ` hpLoss=${f3(r.hpLoss)}`}${r.rounds === undefined ? '' : ` rounds=${r.rounds.toFixed(2)}`}`);

const LANDS = Object.keys(REGION_BOSSES) as Exclude<RegionId, 'mainline'>[];
const ROSTER = Object.keys(ENEMIES).filter((id) => !LEGACY_ENEMY_IDS.includes(id));
const allLive = <T>(f: () => T): T => withRosterLive(ROSTER, f);
const levelAt = (d: number) => Math.min(MAX_LEVEL, depthLevel(d));
/** Whether two encounter tables are the same groups (nothing live: the legacy table itself). */
const sameTables = (a: string[][], b: string[][]) => JSON.stringify(a) === JSON.stringify(b);
/** As band 19a: the standard five with the memory expectation, a monster kit of the depth at its expected enhance. */
const EXPECT: Lineup = { expect: true };
const KITS = 3;

/** The expected party's mean over KITS kits of `seeds` fights a group (band 19a's measure, fewer kits). */
function expected(d: number, region: RegionId, groups: string[][], seeds = 8, lineup: Lineup = EXPECT): { rate: number; hpLoss: number } {
  let rate = 0, hpLoss = 0;
  for (let kit = 1; kit <= KITS; kit++) {
    const r = winRate(levelAt(d), groups, false, seeds, { depth: d, region }, undefined, kit, 'skill', expectedEnhance(d), lineup);
    rate += r.rate / KITS;
    hpLoss += r.hpLoss / KITS;
  }
  return { rate, hpLoss };
}

/** Spec §5.1's archetype of a roster species, read off its gold (std and support share 21: support has more mag than atk). */
type Arch = 'swarm' | 'std' | 'heavy' | 'caster' | 'support';
function archOf(d: EnemyDef): Arch {
  if (d.gold === 11) return 'swarm';
  if (d.gold === 31) return 'heavy';
  if (d.gold === 29) return 'caster';
  return d.stats.mag > d.stats.atk ? 'support' : 'std';
}
/** The old foe of each archetype's shape, the reference group of 22a (swarms of three, the rest pairs). */
const REFERENCE: Record<Arch, string> = { swarm: 'bat', std: 'lizard', heavy: 'golem', caster: 'shade', support: 'wisp' };
const PAIRED = new Set(['mist-twin', 'ice-komainu']);
const groupOf = (id: string, arch: Arch) => (arch === 'swarm' && !PAIRED.has(id) ? [id, id, id] : [id, id]);

/** Where an ordinary species is first met: its band's first depth on the main road, depth 4 in its home region. */
function firstMet(d: EnemyDef): { depth: number; region: RegionId } {
  if (d.home) return { depth: 4, region: d.home };
  let depth = 4;
  while (bandOf(depth) !== d.band) depth++;
  return { depth, region: 'mainline' };
}

/** The boss of a boss group (its parts lead the line: data/monsters.ts bossFor). */
const bossOf = (group: string[]): string => group.find((id) => ENEMIES[id].boss) ?? group[0];
/**
 * The coordinator's ruling on band 22's measure (2026-10-26): where the legacy reference itself misses a band's absolute
 * window at that depth, the roster cell is judged against the legacy value at the same depth and lineup instead, within
 * the tolerance: no more than TOL.rate fewer wins and no more than TOL.hpLoss more HP lost (being easier than a reference
 * the party already cannot hold is no fault of the roster). Every absolute threshold that the reference meets still holds.
 */
const TOL = { rate: 0.1, hpLoss: 0.08 } as const;
const inBand = (r: { rate: number; hpLoss: number }, floor = 0.1) => r.rate >= 0.85 && r.hpLoss >= floor && r.hpLoss <= 0.45;
function judgeRelative(label: string, r: { rate: number; hpLoss: number }, legacy: { rate: number; hpLoss: number }): void {
  say(`${label} judged against the legacy rate=${f3(legacy.rate)} hpLoss=${f3(legacy.hpLoss)}`);
  ex(r.rate, `${label} against the legacy`).toBeGreaterThanOrEqual(legacy.rate - TOL.rate);
  ex(r.hpLoss, `${label} against the legacy`).toBeLessThanOrEqual(legacy.hpLoss + TOL.hpLoss);
}
function judgeAbsolute(label: string, r: { rate: number; hpLoss: number }): void {
  ex(r.rate, label).toBeGreaterThanOrEqual(0.85);
  ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
  ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
}
/** The deepest depth a tuned expected party exists for (band 19a: 15, 20, 25; the finale's 19b is a boss, not a warden). */
const EXPECTED_DEPTH_MAX = 25;

const ORDINARY = ROSTER.filter((id) => !ENEMIES[id].boss && !ENEMIES[id].rank && !TREASURE.has(id));

/**
 * Ruling 21 (spec §0 item 21, plan L1b): the named exceptions to 22a, where a cell conflicts with a frozen band and the
 * frozen band wins. Each is judged against a floor instead, its tuned value less .01, so it cannot get easier unseen; its
 * line says `exception` in the report. No other cell is excepted (pinned below, outside the opt-in run).
 * - the paper moth: swarm fodder (its trait: one sweep clears it); every moth damage that lifts the expected party's loss
 *   toward the bats' sinks an unequipped party against its elite moths (frozen band 8).
 * - the mist twins: a region's table at depths 10-15 takes the C band's first six groups, the twins among them, with the
 *   region's elements (iron: they resist phys); above 雙影 320 the unequipped party of frozen band 7 falls under .85 at
 *   iron depth 10, and below 380 the expected party's loss falls under the bats' less .08.
 */
const EXCEPTION_22A: Record<string, { floor?: number; ceiling?: number; why: string }> = {
  'paper-moth': { floor: 0.099, why: 'swarm fodder; conflicts with frozen band 8 (ruling 21)' },
  'mist-twin': { floor: 0.171, why: 'the region element override; conflicts with frozen band 7 at iron depth 10 (ruling 21)' },
  // Spec §0 item 22 (plan L2b): its one attempt (燭火 90 → 80) did not bring the loss under .45 (.477), so it is back at 90
  // and held to its measured .457 plus .01. Three fuses that burn the whole party as they fall: the trait says to fell them
  // one by one. Backlog F6.
  'wick-shade': { ceiling: 0.467, why: 'three fuses that each burn the whole party as they fall; one attempt spent (item 22)' },
  // Spec §0 item 23 (plan L3b; controller ruling 2026-10-28): the fire and frost natives first met at depth 4 whose one
  // attempt moved nothing or made it worse, back at the spec's numbers and held to their measured loss less .01 (rounded
  // outward to three places). Backlog F7.
  'ash-mourner': { floor: 0.031, why: 'a support that mends and lifts magic; its attempt (灰燼 130/.5 → 160/.6) moved nothing (.041 → .043) (item 23)' },
  'forge-hound': { floor: 0.052, why: 'its attempt (熔吼 .25 → .35, 熔牙 145 → 175) made it softer (.062 → .032): more turns spent winding up (item 23)' },
  'frozen-pilgrim': { floor: 0, why: 'its pair is felled in the ice before it thaws; its attempt (冰之祈 140/.4 → 170/.5) moved nothing (.000) (item 23)' },
  'sand-scorpion': { floor: 0.095, why: 'in the band but .132 under its reference; its attempt (毒針 135 → 165) gave .123 and put 22c blaze d25 over .45 (item 23)' },
};

/**
 * Spec §0 item 22 (plan L2b; the user's direction 2026-10-28, balance is not the priority): band 22's cells of a live
 * species still red after its wave's one simple tuning attempt. Each is still measured and printed (`exception`) and held
 * to its own bound instead of the band's, its measured value after the attempt less .01 (a rate's floor) or plus .01 (a
 * 22b distance's ceiling), so it cannot get worse unseen. Pinned below; each has its backlog entry (plan F6).
 */
const EXCEPTION_22: Record<string, { min?: number; max?: number; why: string }> = {
  '22b gorged-beast mainline d25': { max: 0.135, why: 'the attempt that greened its 22f and 22j cells (吞光 85 → 75, 啃食 130 → 100) left it .125 off the lantern-eater (item 22)' },
  '22d noHeal mainline d20': { min: 0.764, why: 'the D table after its one attempt (four groups swapped for band 19a), .563 → .774 (item 22)' },
  '22d allPhys mainline d20': { min: 0.757, why: 'the D table after its one attempt (four groups swapped for band 19a), .587 → .767 (item 22)' },
  '22f old-city-archon mainline d20 noTank': { min: 0.59, why: 'its attempt (王權 160 → 130) moved nothing (.6) and cost allPhys; back at 160 (item 22)' },
  // Spec §0 item 23 (plan L3b; controller ruling 2026-10-28): the third wave's cells still red after their one attempt. An
  // attempt that moved a cell toward its band and turned no other red is kept, its bound on the value it gave (±.01, rounded
  // outward to three places); one that moved nothing is back at the spec's numbers. Backlog F7.
  '22b mirage-city blaze d30': { max: 0.135, why: 'neither wins at depth 30 (0 to the eater .125); the attempt (幻之火 110 → 90, 城門崩落 160 → 130) kept for its 22f noHeal (item 23)' },
  '22b rift-maw frost d30': { max: 0.135, why: 'neither wins at depth 30 (0 to the eater .125); its attempt (裂口之息 .5 → .35 past half) moved nothing (item 23)' },
  '22b rime-sovereign frost d20': { max: 0.135, why: 'it wins 1.0 to the eater .875 at depth 20, where 22j finds it the harder; its attempt (冰之加護 25 → 15) moved nothing (item 23)' },
  '22b white-silence frost d25': { max: 0.198, why: 'its attempt (冰柱落下 175/.35 → 205/.45) took .75 to .563 against the eater .375; kept (item 23)' },
  '22c frost d25': { min: 0.705, why: 'the komainu pairs at depth 25 (.125, 0); their attempt (hp ×0.85) moved nothing and turned 22a red (item 23)' },
  '22c frost d25 loss': { max: 0.531, why: 'the loss of the same cell (.521); the komainu attempt is back at the spec (item 23)' },
  '22f mirage-city blaze d15 allPhys': { min: 0.79, why: 'the attempt that greened its noHeal (.7 → .9) left allPhys at .8 to the eater 1.0 (item 23)' },
  '22f rift-maw frost d15 allPhys': { min: 0.79, why: 'its attempt (裂口之息 .5 → .35 past half) moved nothing (.8 to the eater 1.0) (item 23)' },
};
/**
 * L3b review: the direction each exception holds, one bound a cell. 22a: the wick shade a ceiling only, every other a floor
 * only. Item 22's table: a 22b distance and a loss from above only (`max`), every other rate from below only (`min`).
 */
function directionBreaks22A(t: Record<string, { floor?: number; ceiling?: number; why: string }>): string[] {
  return Object.entries(t).flatMap(([id, e]) => {
    if (e.floor !== undefined && e.ceiling !== undefined) return [`${id}: floor and ceiling`];
    if (id === 'wick-shade' ? e.ceiling === undefined : e.floor === undefined) return [`${id}: the wrong bound`];
    return [];
  });
}
function directionBreaks22(t: Record<string, { min?: number; max?: number; why: string }>): string[] {
  return Object.entries(t).flatMap(([k, e]) => {
    const fromAbove = k.startsWith('22b') || k.endsWith(' loss');
    if (fromAbove) return e.max !== undefined && e.min === undefined ? [] : [`${k}: not max only`];
    return e.min !== undefined && e.max === undefined ? [] : [`${k}: not min only`];
  });
}
/** A cell of EXCEPTION_22: asserts its own bound on `value`, says so, and returns true; false for every other cell. */
const exceptedCell = (label: string, value: number): boolean => {
  const e = EXCEPTION_22[label];
  if (!e) return false;
  say(`exception ${label}: ${e.why}; ${e.min !== undefined ? `floor >= ${f3(e.min)}` : `ceiling <= ${f3(e.max!)}`}`);
  if (e.min !== undefined) ex(value, `${label} (exception floor)`).toBeGreaterThanOrEqual(e.min);
  if (e.max !== undefined) ex(value, `${label} (exception ceiling)`).toBeLessThanOrEqual(e.max);
  return true;
};

describe('band 22a names its exceptions (ruling 21)', () => {
  it('exactly the paper moth and the mist twins, each with its floor, and the wick shade with its ceiling (item 22)', () => {
    expect(Object.keys(EXCEPTION_22A).sort()).toEqual(['ash-mourner', 'forge-hound', 'frozen-pilgrim', 'mist-twin', 'paper-moth', 'sand-scorpion', 'wick-shade']);
    expect(EXCEPTION_22A['paper-moth'].floor).toBe(0.099);
    expect(EXCEPTION_22A['mist-twin']?.floor).toBe(0.171);
    expect(EXCEPTION_22A['wick-shade']).toMatchObject({ ceiling: 0.467 });
    expect(EXCEPTION_22A['wick-shade']?.floor).toBeUndefined();
    // Spec §0 item 23 (plan L3b): the fire and frost natives whose one attempt moved nothing, each on its measured loss less .01
    // (the frozen pilgrim held at nothing: its pair is felled in the ice).
    expect(Object.fromEntries(['ash-mourner', 'forge-hound', 'frozen-pilgrim', 'sand-scorpion'].map((id) => [id, EXCEPTION_22A[id].floor])))
      .toEqual({ 'ash-mourner': 0.031, 'forge-hound': 0.052, 'frozen-pilgrim': 0, 'sand-scorpion': 0.095 });
  });
  it('each cell holds one direction: the wick shade a ceiling only, every other a floor only (L3b review)', () => {
    expect(directionBreaks22A(EXCEPTION_22A)).toEqual([]);
    // The check bites: a floor cell given a ceiling too, and the ceiling cell given a floor.
    expect(directionBreaks22A({ ...EXCEPTION_22A, 'forge-hound': { floor: 0.052, ceiling: 0.2, why: 'x' } })).toEqual(['forge-hound: floor and ceiling']);
    expect(directionBreaks22A({ ...EXCEPTION_22A, 'wick-shade': { floor: 0.1, ceiling: 0.467, why: 'x' } })).toEqual(['wick-shade: floor and ceiling']);
  });
});

describe('band 22 names its other exceptions (spec §0 item 22, plan L2b)', () => {
  it('exactly these cells, each with its own bound', () => {
    expect(Object.fromEntries(Object.entries(EXCEPTION_22).map(([k, e]) => [k, e.min ?? e.max]))).toEqual({
      '22b gorged-beast mainline d25': 0.135,
      '22d noHeal mainline d20': 0.764,
      '22d allPhys mainline d20': 0.757,
      '22f old-city-archon mainline d20 noTank': 0.59,
      // Spec §0 item 23 (plan L3b).
      '22b mirage-city blaze d30': 0.135,
      '22b rift-maw frost d30': 0.135,
      '22b rime-sovereign frost d20': 0.135,
      '22b white-silence frost d25': 0.198,
      '22c frost d25': 0.705,
      '22c frost d25 loss': 0.531,
      '22f mirage-city blaze d15 allPhys': 0.79,
      '22f rift-maw frost d15 allPhys': 0.79,
    });
    // A 22b cell bounds its distance from the lantern-eater from above, and a 22c loss cell its loss; every other one its
    // rate from below.
    expect(EXCEPTION_22['22b gorged-beast mainline d25'].max).toBe(0.135);
    for (const [k, e] of Object.entries(EXCEPTION_22)) if (!k.startsWith('22b') && !k.endsWith(' loss')) expect(e.max, k).toBeUndefined();
    for (const [k, e] of Object.entries(EXCEPTION_22)) if (k.endsWith(' loss')) expect(e.min, k).toBeUndefined();
    for (const e of Object.values(EXCEPTION_22)) expect(e.why, e.why).toMatch(/item 2[23]/);
  });
  it('each cell holds one direction: a 22b distance and a loss from above only, every other rate from below only (L3b review)', () => {
    expect(directionBreaks22(EXCEPTION_22)).toEqual([]);
    // The check bites: a 22b cell given a floor, a rate cell given a ceiling.
    expect(directionBreaks22({ ...EXCEPTION_22, '22b rift-maw frost d30': { min: 0.1, max: 0.135, why: 'x' } })).toEqual(['22b rift-maw frost d30: not max only']);
    expect(directionBreaks22({ ...EXCEPTION_22, '22c frost d25': { max: 0.705, why: 'x' } })).toEqual(['22c frost d25: not min only']);
  });
});

/**
 * Controller ruling 2026-10-28 (plan L1b): band 22's cells still red for species that are not live yet, each named, each
 * the acceptance item of its own go-live wave (plan L2–L4). A deferred cell is still measured and printed (`deferred to
 * Ln`), only not asserted; every other cell must pass. Its wave's go-live commit removes it (pinned below: no live species
 * keeps a deferred cell).
 */
const DEFERRED_22: Record<string, { wave: 'L2' | 'L3' | 'L4'; id: string }> = {
  '22a debt-collector (std) shade d4': { wave: 'L4', id: 'debt-collector' },
  '22a herald-engine (support) iron d4': { wave: 'L4', id: 'herald-engine' },
  '22a mirror-thief (std) shade d4': { wave: 'L4', id: 'mirror-thief' },
  '22a siege-crab (heavy) iron d4': { wave: 'L4', id: 'siege-crab' },
  '22a spore-moth (swarm) mire d4': { wave: 'L4', id: 'spore-moth' },
  '22a veil-stalker (std) shade d4': { wave: 'L4', id: 'veil-stalker' },
  '22b faceless-host shade d20': { wave: 'L4', id: 'faceless-host' },
  '22b fortress-colossus iron d20': { wave: 'L4', id: 'fortress-colossus' },
  '22b grey-blight mire d25': { wave: 'L4', id: 'grey-blight' },
  '22b shadow-parade shade d30': { wave: 'L4', id: 'shadow-parade' },
  '22b vault-dragon shade d25': { wave: 'L4', id: 'vault-dragon' },
  '22f grey-blight mire d10 allPhys': { wave: 'L4', id: 'grey-blight' },
  '22f shadow-parade shade d15 allPhys': { wave: 'L4', id: 'shadow-parade' },
  '22f shadow-parade shade d15 noHeal': { wave: 'L4', id: 'shadow-parade' },
  '22i gate-breaker iron d8': { wave: 'L4', id: 'gate-breaker' },
};
const deferredCell = (label: string): boolean => {
  const d = DEFERRED_22[label];
  if (d) say(`deferred to ${d.wave}: ${label}`);
  return !!d;
};

describe('band 22 defers only what is not live yet (controller ruling 2026-10-28)', () => {
  const liveDeferred = () => [...new Set(Object.values(DEFERRED_22).map((d) => d.id))].filter((id) => ROSTER_LIVE.has(id));
  it('no live species keeps a deferred cell', () => {
    expect(liveDeferred()).toEqual([]);
    // The check bites: a species gone live with its cell still deferred is caught.
    withRosterLive(['spore-moth'], () => expect(liveDeferred()).toEqual(['spore-moth']));
  });
  it('every deferred cell is a roster species of a later wave', () => {
    for (const [label, d] of Object.entries(DEFERRED_22)) {
      expect(ENEMIES[d.id], label).toBeDefined();
      expect(label, label).toContain(d.id);
    }
  });
});

describe.skipIf(!on)('band 22: the roster against the lantern-eater and its own kin (roster plan B12)', () => {
  const refs = new Map<string, { rate: number; hpLoss: number }>();
  /** A reference group as the legacy roster meets it (nothing live, so no deep trait). */
  const reference = (arch: Arch, depth: number, region: RegionId) => {
    const key = `${arch} ${depth} ${region}`;
    let r = refs.get(key);
    if (!r) {
      const id = REFERENCE[arch];
      // L1b (controller ruling 2026-10-28): the yardstick as recorded, the game as it was with nothing live; a live wave
      // would give these old foes their deep traits where its table stands (this file is not frozen).
      r = withRosterOnly([], () => expected(depth, region, [arch === 'swarm' ? [id, id, id] : [id, id]]));
      refs.set(key, r);
      sayRun(`22a reference ${arch} (${id}) ${region} d${depth}`, r);
    }
    return r;
  };
  /**
   * The species judged against their reference because the reference misses the band (B2 review item 3: pinned, so a
   * reference that drifts out of band fails here rather than going relative unseen).
   */
  const RELATIVE_22A = [
    'lamp-wight', 'market-ghost', 'tongueless-bell', 'requiem-choir', 'ash-archivist', 'ember-maw', 'sorrow-crystal', 'deep-tendril',
    'music-box', 'paper-cranes', 'lost-shadow', 'returning-light',
    'snow-caller', 'storm-totem', 'charge-jelly', 'star-ember', 'stolen-tome', 'rot-lily', 'hush-acolyte',
  ];
  const relative22a: string[] = [];
  const parity = (ids: string[]) => {
    for (const id of ids) {
      const d = ENEMIES[id];
      const arch = archOf(d);
      const { depth, region } = firstMet(d);
      const ref = reference(arch, depth, region);
      const r = allLive(() => expected(depth, region, [groupOf(id, arch)]));
      const label = `22a ${id} (${arch}) ${region} d${depth}`;
      sayRun(label, { ...r, rounds: undefined });
      say(`${label} hpLoss-ref=${f3(r.hpLoss - ref.hpLoss)}`);
      if (deferredCell(label)) continue;
      const exception = EXCEPTION_22A[id];
      if (exception) {
        const bound = exception.floor !== undefined ? `floor hpLoss >= ${f3(exception.floor)}` : `ceiling hpLoss <= ${f3(exception.ceiling!)}`;
        say(`exception ${label}: ${exception.why}; ${bound}`);
        ex(r.rate, `${label} (exception)`).toBeGreaterThanOrEqual(0.85);
        ex(r.hpLoss, `${label} (exception floor)`).toBeGreaterThanOrEqual(exception.floor ?? 0.1);
        ex(r.hpLoss, `${label} (exception ceiling)`).toBeLessThanOrEqual(exception.ceiling ?? 0.45);
        continue;
      }
      // Where the reference itself misses the band, the species is judged against it (the ruling above); elsewhere as
      // before, absolute and within 0.08 of its reference (B2 review item 1: no depth is relative by itself).
      if (!inBand(ref)) { relative22a.push(id); judgeRelative(label, r, ref); continue; }
      judgeAbsolute(label, r);
      ex(Math.abs(r.hpLoss - ref.hpLoss), `${label} against ${REFERENCE[arch]}`).toBeLessThanOrEqual(0.08);
    }
  };

  it('22a species parity: the main road', () => {
    parity(ORDINARY.filter((id) => !ENEMIES[id].home));
    expect(relative22a, 'the main road\'s relative cells').toEqual(RELATIVE_22A.filter((id) => !ENEMIES[id].home));
  }, 600_000);
  it('22a species parity: the regions', () => {
    relative22a.length = 0;
    parity(ORDINARY.filter((id) => !!ENEMIES[id].home));
    expect(relative22a, 'the regions\' relative cells').toEqual(RELATIVE_22A.filter((id) => !!ENEMIES[id].home));
  }, 600_000);

  /** Every new boss and the depths it is met at (≤ 50): bossFor with everything live, the lantern-eater's cells left out. */
  const bossCells = (): { region: RegionId; depth: number; group: string[] }[] => allLive(() => {
    const out: { region: RegionId; depth: number; group: string[] }[] = [];
    for (const region of ['mainline', ...LANDS] as RegionId[]) for (let depth = 5; depth <= 50; depth += 5) {
      const group = bossFor(region, depth);
      if (group[0] !== 'lanterneater') out.push({ region, depth, group });
    }
    return out;
  });
  const bossFight = (party: Party, group: string[], seed: number, depth: number, region: RegionId) =>
    simBattle(party, group, true, seed, { depth, region });
  const bossRate = (group: string[], depth: number, region: RegionId, seeds: number, lineup: Lineup = EXPECT) => {
    let wins = 0, rounds = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const r = bossFight(kitParty(levelAt(depth), depth, seed, undefined, expectedEnhance(depth), lineup), group, seed, depth, region);
      if (r.outcome === 'win') wins++;
      rounds += r.rounds;
    }
    return { rate: wins / seeds, rounds: rounds / seeds };
  };

  const bossParity = (regions: RegionId[]) => {
    for (const c of bossCells().filter((x) => regions.includes(x.region))) {
      const boss = allLive(() => bossRate(c.group, c.depth, c.region, 16));
      const eater = bossRate(['lanterneater'], c.depth, c.region, 16);
      const label = `22b ${bossOf(c.group)} ${c.region} d${c.depth}`;
      sayRun(label, boss);
      sayRun(`${label} lanterneater`, eater);
      if (!deferredCell(label) && !exceptedCell(label, Math.abs(boss.rate - eater.rate))) ex(Math.abs(boss.rate - eater.rate), label).toBeLessThanOrEqual(0.1);
    }
  };
  it('22b boss parity: the main road', () => bossParity(['mainline']), 600_000);
  it('22b boss parity: blaze, frost, storm', () => bossParity(['blaze', 'frost', 'storm']), 900_000);
  it('22b boss parity: mire, shade, iron', () => bossParity(['mire', 'shade', 'iron']), 900_000);

  it('22b bands 11, 14 and 16 at each new boss\'s first depth', () => {
    const first = new Map<string, { region: RegionId; depth: number; group: string[] }>();
    for (const c of bossCells()) if (!first.has(bossOf(c.group))) first.set(bossOf(c.group), c);
    for (const c of first.values()) allLive(() => {
      const label = `22b ${bossOf(c.group)} ${c.region} d${c.depth}`;
      let rare = 0, maxed = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const r = bossFight(kitParty(levelAt(c.depth), c.depth, seed, 'rare', expectedEnhance(c.depth)), c.group, seed, c.depth, c.region);
        ex(r.rounds, `11 ${label} seed ${seed}`).toBeGreaterThanOrEqual(3);
        rare += r.rounds;
        const m = bossFight(kitParty(levelAt(c.depth), c.depth, seed, 'rare', ENHANCE_MAX), c.group, seed, c.depth, c.region);
        ex(m.rounds, `14 ${label} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        maxed += m.rounds;
      }
      sayRun(`${label} 11 rare`, { rounds: rare / 8 });
      sayRun(`${label} 14 +${ENHANCE_MAX}`, { rounds: maxed / 8 });
      // 16: benching never helps (two, three, four members at most the full party + 0.05, the same seeds and kits).
      const full = bossRate(c.group, c.depth, c.region, 20);
      for (const [name, ids] of [['two', ['hero', 'chizuru']], ['three', ['hero', 'rin', 'chizuru']], ['four', ['hero', 'rin', 'chizuru', 'noel']]] as const) {
        const r = bossRate(c.group, c.depth, c.region, 20, { ...EXPECT, ids: [...ids] as CharacterId[] });
        sayRun(`${label} 16 ${name}`, r);
        if (!deferredCell(`16 ${label} ${name}`)) ex(r.rate, `16 ${label} ${name} vs full ${f3(full.rate)}`).toBeLessThanOrEqual(full.rate + 0.05);
      }
    });
  }, 900_000);

  it('22c the regions deep: the expected party wins >= .85 and loses 10-45% at depths 15 and 25', () => {
    const relative22c: string[] = [];
    for (const region of LANDS) for (const d of [15, 25]) {
      const r = expected(d, region, encounterTable(region, d));
      const label = `22c ${region} d${d}`;
      sayRun(label, r);
      // The legacy table at the same depth (the same fights while nothing is live): the reference of the ruling above.
      const same = sameTables(encounterTable(region, d), legacyEncounterTable(region, d));
      // L1b: the legacy table as it was met with nothing live (no deep trait), as recorded.
      const legacy = same ? r : withRosterOnly([], () => expected(d, region, legacyEncounterTable(region, d)));
      if (exceptedCell(label, r.rate)) {
        // Item 23: the rate held to its floor; the loss to its own ceiling, or the band's.
        if (!exceptedCell(`${label} loss`, r.hpLoss)) { ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1); ex(r.hpLoss, label).toBeLessThanOrEqual(0.45); }
      } else if (inBand(legacy)) judgeAbsolute(label, r);
      else {
        relative22c.push(`${region} d${d}`);
        // While the tables are the same fights, the cell is its own reference: reported, not a gate (B2 review item 3).
        if (same) say(`${label} relative cell: report only while the table is the legacy one`); else judgeRelative(label, r, legacy);
      }
      // What the full roster's table gives (reported; it is asserted once the region's natives go live, plan L).
      sayRun(`${label} all live (report)`, allLive(() => expected(d, region, encounterTable(region, d))));
    }
    expect(relative22c).toEqual(['frost d15', 'mire d25', 'iron d25']);
  }, 900_000);

  /** 22d's party (ruling of this task): band 18a's lopsided lineups on their fill build, with band 19a's kit and memories. */
  const odd = (name: keyof typeof ODD_LINEUPS): Lineup => {
    const l = ODD_LINEUPS[name];
    return { ids: l.ids, heroBuild: l.fill, heroRow: l.heroRow, armHero: true, expect: true };
  };
  const ODD_CELLS: [keyof typeof ODD_LINEUPS, RegionId, number][] = [
    ...(Object.keys(ODD_LINEUPS) as (keyof typeof ODD_LINEUPS)[]).flatMap((n) => [12, 20, 35].map((d) => [n, 'mainline', d] as [keyof typeof ODD_LINEUPS, RegionId, number])),
    ['allPhys', 'iron', 12], ['allPhys', 'mire', 12], ['allMagic', 'storm', 12],
  ];
  it('22d lopsided lineups deep: wins >= .85 and loses 10-45%', () => {
    const relative22d: string[] = [];
    for (const [name, region, d] of ODD_CELLS) {
      const r = expected(d, region, encounterTable(region, d), 8, odd(name));
      const label = `22d ${name} ${region} d${d}`;
      sayRun(label, r);
      const same = sameTables(encounterTable(region, d), legacyEncounterTable(region, d));
      // L1b: the legacy table as it was met with nothing live (no deep trait), as recorded.
      const legacy = same ? r : withRosterOnly([], () => expected(d, region, legacyEncounterTable(region, d), 8, odd(name)));
      if (exceptedCell(label, r.rate)) {
        // Item 22: the rate held to its floor; the loss stays in the band.
        ex(r.hpLoss, label).toBeGreaterThanOrEqual(0.1);
        ex(r.hpLoss, label).toBeLessThanOrEqual(0.45);
      } else if (inBand(legacy)) judgeAbsolute(label, r);
      else {
        relative22d.push(`${name} ${region} d${d}`);
        if (same) say(`${label} relative cell: report only while the table is the legacy one`); else judgeRelative(label, r, legacy);
      }
      sayRun(`${label} all live (report)`, allLive(() => expected(d, region, encounterTable(region, d), 8, odd(name))));
    }
    expect(relative22d).toEqual(['noHeal mainline d35', 'noTank mainline d12', 'noTank mainline d35', 'allMagic mainline d12', 'allMagic mainline d35', 'allPhys mainline d35', 'allMagic storm d12']);
  }, 900_000);

  it('22f lopsided lineups against the bosses with calls, parts, forget, TP thieves, stalls and swallows', () => {
    const CODES = (d: EnemyDef) => [...d.skills, ...(d.stages ?? []).flatMap((s) => s.skills)].flatMap((k) => k.effects)
      .some((e) => e.kind === 'summon' || e.kind === 'delay' || e.kind === 'engulf' || (e.kind === 'inflict' && e.status === 'forget') || (e.kind === 'damage' && !!e.tpDrain)) || !!d.parts;
    const first = new Map<string, { region: RegionId; depth: number; group: string[] }>();
    for (const c of bossCells()) if (!first.has(bossOf(c.group)) && CODES(ENEMIES[bossOf(c.group)])) first.set(bossOf(c.group), c);
    for (const c of first.values()) for (const name of Object.keys(ODD_LINEUPS) as (keyof typeof ODD_LINEUPS)[]) {
      const boss = allLive(() => bossRate(c.group, c.depth, c.region, 10, odd(name)));
      const eater = bossRate(['lanterneater'], c.depth, c.region, 10, odd(name));
      const label = `22f ${bossOf(c.group)} ${c.region} d${c.depth} ${name}`;
      sayRun(label, boss);
      sayRun(`${label} lanterneater`, eater);
      if (!deferredCell(label) && !exceptedCell(label, boss.rate)) ex(boss.rate, label).toBeGreaterThanOrEqual(eater.rate - 0.1);
    }
  }, 900_000);

  it('22g treasure foes: how often the expected party fells one before it runs (report only)', () => {
    for (const [id, d] of [['hoarder', 4], ['hoarder', 9], ['gilded-hoarder', 25], ['gilded-hoarder', 30]] as const) allLive(() => {
      let felled = 0;
      const n = 30;
      for (let seed = 1; seed <= n; seed++) {
        const party = kitParty(levelAt(d), d, seed, undefined, expectedEnhance(d), EXPECT);
        const rng = mulberry32(seed * 7919);
        let s = createBattle({ party, enemyIds: [id], inventory: {}, revealed: {}, scale: { depth: d, region: 'mainline' } });
        for (let k = 0; k < 60 && s.outcome === 'ongoing'; k++) s = resolveRound(s, choose(s, party), rng);
        if (s.enemies.some((e) => !e.alive && !e.left)) felled++;
      }
      say(`22g ${id} mainline d${d} felled=${f3(felled / n)} (proposed 0.50-0.70)`);
    });
  }, 300_000);

  /** 22h's six strongest own uniques: a slot each, the one whose fixed keys strike hardest (fixed order on ties). */
  const STRIKE: AnyStat[] = ['atk', 'mag', 'str', 'int', 'agi', 'crit', 'critDmg', 'multi', 'fireDmg', 'iceDmg', 'thunderDmg', 'eliteDmg', 'vuln'];
  const CEILING_SLOTS: Slot[] = ['weapon', 'hands', 'head', 'neck', 'ring1', 'feet'];
  const ceilingParty = (d: number, seed: number): Party => {
    const p = kitParty(levelAt(d), d, seed, 'rare', ENHANCE_MAX);
    const owned = Object.values(SPECIALS).filter((sp) => sp.owner);
    let uid = 9000;
    for (const id of Object.keys(p.roster) as CharacterId[]) {
      const m = { ...p.roster[id], equip: { ...p.roster[id].equip } };
      for (const s of CEILING_SLOTS) {
        const slot = s === 'ring1' ? 'ring' : s;
        const best = owned.filter((sp) => sp.slot === slot).sort((a, b) => (b.fixed ?? []).filter((k) => STRIKE.includes(k)).length - (a.fixed ?? []).filter((k) => STRIKE.includes(k)).length)[0];
        if (!best) continue;
        const it = rollItem(mulberry32(uid), { uid: uid++, ilvl: m.equip[s]!.ilvl, rarity: best.rarity, special: best.id });
        m.equip[s] = { ...it, affixes: it.affixes.map((a) => ({ ...a })), enhance: ENHANCE_MAX };
      }
      const st = statsOf(m);
      p.roster[id] = { ...m, hp: st.hp, tp: st.tp };
    }
    return p;
  };
  it('22h the own-unique ceiling: no boss falls in one round, no table loses under 10%', () => {
    expect(SLOTS).toContain('ring1');
    const relative22h: number[] = [];
    for (const d of [10, 20]) allLive(() => {
      for (const group of [['lanterneater'], bossFor('mainline', d)]) {
        let rounds = 0;
        for (let seed = 1; seed <= 10; seed++) {
          const r = bossFight(ceilingParty(d, seed), group, seed, d, 'mainline');
          ex(r.rounds, `22h ${bossOf(group)} d${d} seed ${seed}`).toBeGreaterThanOrEqual(2);
          rounds += r.rounds;
        }
        sayRun(`22h ${bossOf(group)} d${d} ceiling`, { rounds: rounds / 10 });
      }
      let loss = 0, n = 0;
      for (const g of encounterTable('mainline', d)) for (let seed = 1; seed <= 4; seed++) {
        loss += simBattle(ceilingParty(d, seed), g, false, seed * 7919, { depth: d, region: 'mainline' }).hpLoss;
        n++;
      }
      sayRun(`22h mainline table d${d} ceiling`, { hpLoss: loss / n });
      // The same kit without the uniques (report): what the rare +ENHANCE_MAX kit alone leaves of the table.
      let plain = 0;
      for (const g of encounterTable('mainline', d)) for (let seed = 1; seed <= 4; seed++) {
        plain += simBattle(kitParty(levelAt(d), d, seed, 'rare', ENHANCE_MAX), g, false, seed * 7919, { depth: d, region: 'mainline' }).hpLoss;
      }
      sayRun(`22h mainline table d${d} rare +${ENHANCE_MAX} without uniques`, { hpLoss: plain / n });
      // The same kit without the uniques is the reference: where it already loses under 10%, the uniques may take no more
      // than the tolerance off what it loses (the ruling above).
      if (plain / n >= 0.1) ex(loss / n, `22h table d${d}`).toBeGreaterThanOrEqual(0.1);
      else {
        relative22h.push(d);
        say(`22h table d${d} judged against the kit without uniques hpLoss=${f3(plain / n)}`);
        ex(loss / n, `22h table d${d} against the kit without uniques`).toBeGreaterThanOrEqual(plain / n - TOL.hpLoss);
      }
    });
    // L2b (spec §0 item 22): 22h runs with everything live, so going live moved nothing; the D table's group swap did. The
    // rare +ENHANCE_MAX kit without uniques lost .247 at depth 20 before it and .076 after, so depth 20 is now judged
    // against that kit as depth 10 is (the B2 ruling).
    expect(relative22h).toEqual([10, 20]);
  }, 600_000);

  it('22i wardens: each at its first two depths wins >= .6, and a rare kit never fells one in under two rounds', () => {
    const cells: { id: string; region: RegionId; depth: number }[] = [];
    allLive(() => {
      for (const region of ['mainline', ...LANDS] as RegionId[]) for (let depth = 8; depth <= 60; depth += 5) {
        const id = wardenFor(region, depth);
        if (id && cells.filter((c) => c.id === id && c.region === region).length < 2) cells.push({ id, region, depth });
      }
    });
    expect(new Set(cells.map((c) => c.id)).size).toBe(11);
    // No tuned expected party exists past EXPECTED_DEPTH_MAX: those wardens are deferred to the go-live tasks, not passed.
    const deferred = cells.filter((c) => c.depth > EXPECTED_DEPTH_MAX);
    for (const c of deferred) say(`22i ${c.id} ${c.region} d${c.depth} deferred to L: no tuned expected party past depth ${EXPECTED_DEPTH_MAX} (bands 19a, 19b)`);
    expect(deferred.map((c) => `${c.id} d${c.depth}`)).toEqual(['lantern-brood d28', 'false-moon d33', 'bell-warden d38', 'toppled-automaton d43', 'requiem-conductor d48', 'lantern-brood d53']);
    for (const c of cells) allLive(() => {
      const group = wardenGroup(c.id);
      const scale = { depth: c.depth, region: c.region, elite: group[0] };
      // The ENHANCE_MAX check needs no tuned party (B2 review item 6): every warden takes it, the deferred ones too.
      const tuned = c.depth <= EXPECTED_DEPTH_MAX;
      let wins = 0;
      if (tuned) for (let kit = 1; kit <= KITS; kit++) for (let seed = 1; seed <= 6; seed++) {
        const r = simBattle(kitParty(levelAt(c.depth), c.depth, kit, undefined, expectedEnhance(c.depth), EXPECT), group, false, seed * 7919, scale);
        if (r.outcome === 'win') wins++;
      }
      const rate = wins / (KITS * 6);
      let rounds = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const r = simBattle(kitParty(levelAt(c.depth), c.depth, seed, 'rare', ENHANCE_MAX), group, false, seed * 7919, scale);
        ex(r.rounds, `22i ${c.id} d${c.depth} seed ${seed} +${ENHANCE_MAX}`).toBeGreaterThanOrEqual(2);
        rounds += r.rounds;
      }
      const label = `22i ${c.id} ${c.region} d${c.depth}`;
      if (!tuned) { sayRun(`${label} +${ENHANCE_MAX} (win rate deferred to L)`, { rounds: rounds / 6 }); return; }
      sayRun(label, { rate, rounds: rounds / 6 });
      if (!deferredCell(label)) ex(rate, label).toBeGreaterThanOrEqual(0.6);
    });
  }, 900_000);
});
