/**
 * The rune bands' measurements (spec §12.4, plan 8h rulings 7–10, Task 5a): a suggested build worn in the sim, in its
 * own scenario, against the same lineup with her standard build; the ceiling of every build at the top tier; one rune at
 * a time on a build's first skill. Only the measurements live here: builds.bands.test.ts reports them (and plan 8h Task
 * 5b holds them to their bands). Every fight draws from its own seeded rng; nothing here draws from any other stream.
 */
import { BUILDS, buildOf, type BuildDef, type BuildScenario } from '../data/builds';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import { ABYSS } from '../data/hero';
import { RUNES, RUNE_IDS, type RuneRef, type RuneTier } from '../data/runes';
import { SKILLS } from '../data/skills';
import { fromMember, runeView, type BattleScale } from './battle';
import { newLedger, totalOf } from './ledger';
import { depthLevel } from './levels';
import { parityDepth, parityLineups } from './parity';
import { encounterTable } from './scaling';
import { kitParty, lineupPolicies, partyAt, setSimTrace, simBattle, type Lineup } from './sim';
import type { CharacterId } from './types';

/** The levels the rune bands measure at (plan 8h ruling 7): every slot open. */
export const BUILD_LEVELS = [35, 50] as const;
/** Seeds a fight is measured over, k x 7919 for k = 1..n, by scenario. */
export const BUILD_SEEDS = { boss: 40, crowd: 10, long: 10 } as const;
/** A build in its scenario gives at least this much more per round than her standard (spec §12.4). */
export const RUNE_VALUE_PCT = 20;
/**
 * One rune on a build's first skill makes her contribution per round at most this many times what it is without it
 * (spec §12.4, read per round: controller ruling R1); a legendary rune at most ONE_RUNE_MAX_LEGENDARY (ruling B1).
 */
export const ONE_RUNE_MAX = 1.6;
export const ONE_RUNE_MAX_LEGENDARY = 2.0;
/**
 * A build may win this many fights fewer than her standard and still pass, its contribution up a fifth (ruling E1: 2 of
 * 40, read as two fights of the set, so a 30-fight crowd set allows 2 of 30).
 */
export const WIN_SLACK_FIGHTS = 2;

/** The band levels a build is measured at: from its `minLevel` (ruling E2). */
export const buildLevels = (b: BuildDef): number[] => BUILD_LEVELS.filter((l) => l >= (b.minLevel ?? 0));
/** The ceiling's depths and seeds (plan 8h ruling 8). */
export const CEILING_DEPTHS = [5, 10] as const;
export const CEILING_SEEDS = 20;
/** balance.test.ts's DEEP: ten memories on the hero and the abyss at its cap, the balanced hero (equality test). */
export const DEEP_LINEUP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced' };

/**
 * What a build gave in a set of fights: its owner's contribution per round (her buffs on the others' hits included, plan
 * 8h Task 5b H3), the gauge she fed the others per round (apart), the win rate, and her skills one by one.
 */
export interface BuildRun {
  perRound: number; gaugePerRound: number; rate: number; rounds: number;
  /** How many fights the set had. */
  fights: number;
  bySkill: Record<string, { total: number; casts: number }>;
  /** The fewest rounds a boss fight of the set took (0 with no boss fight). */
  minBossRounds: number;
  /** Rounds a boss ended frozen (plan 8h ruling 10: never). */
  bossFrozen: number;
  /** Party members felled over the fights (the healers' band, ruling E4). */
  partyKos: number;
}

export interface BandFight { enemyIds: string[]; boss: boolean; scale: BattleScale; seeds: number }

/**
 * The fights of a scenario at `level`'s depth on the main road (plan 8h ruling 7): `boss` the Lantern-eater, `crowd`
 * every group of the depth together with the next one (plan 8h Task 5b H2: one group alone fell in about a round at Lv 50,
 * so the fight was decided by who reached its HP first), `long` every group with its first foe an elite; `general` every
 * group and the Lantern-eater (the parity cell), ten seeds each.
 */
export function scenarioFights(s: BuildScenario | 'general', level: number): BandFight[] {
  const depth = parityDepth(level);
  const scale = { depth, region: 'mainline' as const };
  const groups = encounterTable('mainline', depth);
  const boss: BandFight = { enemyIds: ['lanterneater'], boss: true, scale, seeds: BUILD_SEEDS.boss };
  switch (s) {
    case 'boss': return [boss];
    case 'crowd': return groups.map((g, i) => ({ enemyIds: [...g, ...groups[(i + 1) % groups.length]], boss: false, scale, seeds: BUILD_SEEDS.crowd }));
    case 'long': return groups.map((g) => ({ enemyIds: g, boss: false, scale: { ...scale, elite: g[0] }, seeds: BUILD_SEEDS.long }));
    case 'general': return [...groups.map((g) => ({ enemyIds: g, boss: false, scale, seeds: 10 })), { ...boss, seeds: 10 }];
    case 'ordeal': return [{ ...boss, scale: { depth: depth + 2, region: 'mainline' } }];
  }
}

/**
 * `lineup` in `scenario` at `level`: the parity kit (`kitParty(level, depth, 1, …, expectedEnhance(depth))`, memories as
 * expected; built once, a copy a fight), one ledger split by skill and crediting buff givers, `owner`'s contribution per
 * round. With `seen`, every skill `owner` chose (and 'echo') goes into it. With `forward`, a trace already installed sees
 * every round too (plan 8h Task 5b H4); else it is set aside while this measures.
 */
export function measureBuild(owner: CharacterId, lineup: Lineup, scenario: BuildScenario | 'general', level: number, seen?: Set<string>, opts: { forward?: true } = {}): BuildRun {
  const depth = parityDepth(level);
  const ledger = newLedger({ bySkill: true, buffGivers: true });
  const policies = lineupPolicies(lineup);
  const kit = kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ...lineup, expect: true });
  let rounds = 0, wins = 0, n = 0, minBoss = Infinity, frozen = 0, kos = 0;
  const prev = setSimTrace({
    round(actions, before, after) {
      if (opts.forward) prev?.round(actions, before, after);
      const a = actions[owner];
      if (seen && a?.kind === 'skill') seen.add(a.skill);
      if (seen && a?.kind === 'echo') seen.add('echo');
      frozen += after.enemies.filter((e) => e.boss && e.frozen).length;
      kos += after.log.filter((e) => e.type === 'ko' && before.party.some((c) => c.key === e.target)).length;
    },
    end(r) { if (opts.forward) prev?.end(r); },
  });
  try {
    for (const f of scenarioFights(scenario, level)) for (let k = 1; k <= f.seeds; k++) {
      const r = simBattle(structuredClone(kit), f.enemyIds, f.boss, k * 7919, f.scale, undefined, 'skill', lineup.abyss, undefined, { ledger, policies });
      rounds += r.rounds; n++;
      if (r.outcome === 'win') wins++;
      if (f.boss) minBoss = Math.min(minBoss, r.rounds);
    }
  } finally {
    setSimTrace(prev);
  }
  const bySkill: BuildRun['bySkill'] = {};
  for (const [id, c] of Object.entries(ledger.bySkill ?? {})) if (SKILLS[id]?.owner === owner) bySkill[id] = { total: totalOf(c), casts: c.casts };
  const mine = ledger.by[owner] ?? { damage: 0, healing: 0, prevented: 0, shield: 0 };
  const gauge = ledger.gauge?.[owner] ?? 0;
  return {
    perRound: rounds ? totalOf(mine) / rounds : 0, gaugePerRound: rounds ? gauge / rounds : 0, rate: n ? wins / n : 0, rounds, fights: n, bySkill,
    minBossRounds: minBoss === Infinity ? 0 : minBoss, bossFrozen: frozen, partyKos: kos,
  };
}

const standardRuns = new Map<string, BuildRun>();

/** `owner` on her standard build in `scenario` at `level`, measured once (plan 8h Task 5b: every build of hers compares with it). */
export function measureStandard(owner: CharacterId, scenario: BuildScenario | 'general', level: number): BuildRun {
  const key = `${owner}|${scenario}|${level}`;
  let run = standardRuns.get(key);
  if (!run) standardRuns.set(key, (run = measureBuild(owner, standardLineup(owner), scenario, level)));
  return run;
}

/** The parity lineup `owner` is measured in. */
const lineupOf = (owner: CharacterId): CharacterId[] => parityLineups().find((l) => l.measured.includes(owner))!.ids;

/** `owner` wearing her build `key` in her parity lineup (the hero's row and weapon by its `hero`), at `tier` (default magic). */
export function buildLineup(owner: CharacterId, key: string, tier?: RuneTier): Lineup {
  const b = buildOf(owner, key);
  if (!b) throw new Error(`${owner} has no build ${key}`);
  return { ids: lineupOf(owner), build: { [owner]: key }, ...(owner === 'hero' ? { heroBuild: b.hero ?? 'balanced' } : {}), ...(tier ? { runeTier: tier } : {}) };
}

/** The same lineup, `owner` on her standard build (no runes, the default policy). */
export function standardLineup(owner: CharacterId): Lineup {
  return { ids: lineupOf(owner) };
}

/** The same build with no rune at all on its owner. */
export function bareLineup(owner: CharacterId, key: string): Lineup {
  return { ...buildLineup(owner, key), runes: { [owner]: {} } };
}

/**
 * The ceiling (plan 8h ruling 8): `owner`'s build `key` at the epic tier in her lineup, every other member on her first
 * rune build (the hero on 劍技, or with `deep` on the build of DEEP's balanced hero), rare kits at +ENHANCE_MAX, against
 * the Lantern-eater of `depth` at its depth level; with `deep`, DEEP's memories and abyss. The rounds of each seed.
 */
export function measureCeiling(owner: CharacterId, key: string, depth: number, mode: 'plain' | 'deep'): number[] {
  const ids = lineupOf(owner);
  const heroKey = owner === 'hero' ? key : mode === 'deep' ? BUILDS.hero.find((b) => b.key !== 'standard' && b.hero === DEEP_LINEUP.heroBuild)!.key : 'sword';
  const build: Partial<Record<CharacterId, string>> = {};
  for (const id of ids) build[id] = id === owner ? key : id === 'hero' ? heroKey : BUILDS[id][1].key;
  const lineup: Lineup = { ...(mode === 'deep' ? DEEP_LINEUP : {}), ids, build, runeTier: 'epic', heroBuild: buildOf('hero', heroKey)!.hero ?? 'balanced' };
  const policies = lineupPolicies(lineup);
  const level = depthLevel(depth);
  const out: number[] = [];
  for (let seed = 1; seed <= CEILING_SEEDS; seed++) {
    const party = kitParty(level, depth, seed, 'rare', ENHANCE_MAX, lineup);
    out.push(simBattle(party, ['lanterneater'], true, seed, { depth, region: 'mainline' }, undefined, 'skill', lineup.abyss, undefined, { policies }).rounds);
  }
  return out;
}

/** The first skill a build suggests runes for (plan 8h ruling 9). */
export const firstRuneSkill = (owner: CharacterId, key: string): string => Object.keys(buildOf(owner, key)!.runes)[0];

/** Every rune that works alone on the build's first skill at Lv 50: a plain rune at the magic tier, a legendary at its one. */
export function oneRuneCandidates(owner: CharacterId, key: string): RuneRef[] {
  const level = BUILD_LEVELS[1];
  const m = partyAt(level, { ...buildLineup(owner, key), expect: true }, parityDepth(level)).roster[owner];
  const c = fromMember(m, 0);
  const skill = firstRuneSkill(owner, key);
  return RUNE_IDS.map((id): RuneRef => ({ id, tier: RUNES[id].group === 'legendary' ? 'legendary' : 'magic' }))
    .filter((r) => runeView(c, skill, [r])?.states[0].miss === null);
}

export interface OneRune { perRound: number; perCast: number; casts: number }

const withoutRuns = new Map<string, OneRune>();

/**
 * The build at Lv 50 in the general fights with its first skill holding `rune` alone (or nothing), its other skills as the
 * build has them (plan 8h ruling 9): her contribution per round (the band, controller ruling R1), and that skill's
 * contribution per cast and casts (reported). The run with nothing on it is measured once per build.
 */
export function measureOneRune(owner: CharacterId, key: string, rune: RuneRef | null): OneRune {
  const cacheKey = `${owner}|${key}`;
  if (!rune && withoutRuns.has(cacheKey)) return withoutRuns.get(cacheKey)!;
  const level = BUILD_LEVELS[1];
  const base = buildLineup(owner, key);
  const worn = partyAt(level, { ...base, expect: true }, parityDepth(level)).roster[owner].sockets ?? {};
  const skill = firstRuneSkill(owner, key);
  const runes: Record<string, RuneRef[]> = {};
  for (const [s, refs] of Object.entries(worn)) runes[s] = refs.filter((r): r is RuneRef => r !== null);
  runes[skill] = rune ? [rune] : [];
  const run = measureBuild(owner, { ...base, runes: { [owner]: runes } }, 'general', level);
  const s = run.bySkill[skill] ?? { total: 0, casts: 0 };
  const out = { perRound: run.perRound, perCast: s.casts ? s.total / s.casts : 0, casts: s.casts };
  if (!rune) withoutRuns.set(cacheKey, out);
  return out;
}

/** Skills the sim never cast before step ⑧ (plan 8h ruling 11k), and 赤心's 火焰爆: each build that plays one casts it. */
export const UNCAST_BEFORE = ['cover', 'atoning-flame', 'clap', 'mirage-step', 'barrier', 'overclock', 'emergency-repair', 'moon-recall', 'full-moon-night', 'jackpot', 'flame-burst'];

/** The 11k skills no build casts, each with why (plan 8h Task 5b; controller ruling R5 for 收回). */
export const UNCAST: Readonly<Record<string, string>> = {
  'emergency-repair': '全面整備 is the ultimate of the 整備 branch, and no build of Bobby\'s takes that branch (砲台工廠 and 電網 take 砲台 and 護盾).',
  'atoning-flame': '贖火 is the ultimate of the 鐵壁 branch, and since Scarlet\'s one build swap (ruling E5) no build of hers takes that branch (反擊之壁 and 紅蓮餘燼 take 烈焰).',
  'moon-recall': '收回 steps the moon back from 下弦, but 滿月聖女 holds the full moon with 滿月之夜 past the end of every measured fight, so the moon never wanes for it (controller ruling R5: dropped from coverage).',
};

/**
 * Builds that fail the §12.4 band after tuning (plan 8h Task 5b, three rounds), kept as known exceptions for the
 * controller to decide; the band test checks each still fails (a fixed one must leave the list) and reports it.
 */
export const BAND_EXCEPTIONS: Readonly<Record<string, { decider: 'controller'; reason: string }>> = {};

/**
 * Single runes over ONE_RUNE_MAX that only a §6.7 number would bring under (plan 8h Task 5b: BLOCKED, the controller's),
 * keyed `<owner>/<key> <skill>+<rune>`.
 */
export const ONE_RUNE_EXCEPTIONS: Readonly<Record<string, { decider: 'controller'; reason: string }>> = {};

const f2 = (n: number) => n.toFixed(2);

export interface LevelResult { level: number; std: BuildRun; run: BuildRun; bare: BuildRun; idle: string[] }
export interface BuildResult {
  key: string; tag: string; levels: LevelResult[];
  ceilings: { depth: number; mode: 'plain' | 'deep'; min: number }[];
  oneRune: { label: string; ratio: number; perCast: number; casts: number; castsWithout: number; legendary: boolean }[];
}
export interface OwnerResult { builds: BuildResult[]; seen50: Set<string>; uncast: string[] }

/**
 * Every rune band number of `owner`'s rune builds (plan 8h Tasks 5a/5b), reported one line each through `say`: each build x
 * level in its scenario against her standard, its skills, idle socketed skills, frozen bosses; its ceiling; one rune at a
 * time on its first skill (her contribution per round, controller ruling R1); her 11k skills no build cast at Lv50.
 */
export function bandResults(owner: CharacterId, say: (line: string) => void): OwnerResult {
  const seen50 = new Set<string>();
  const out: BuildResult[] = [];
  for (const b of BUILDS[owner].filter((x) => x.key !== 'standard') as BuildDef[]) {
    const tag = `${b.owner}/${b.key}`;
    const levels: LevelResult[] = [];
    for (const level of buildLevels(b)) {
      const scenario = b.scenario!;
      const seen = new Set<string>();
      const std = measureStandard(owner, scenario, level);
      const run = measureBuild(owner, buildLineup(owner, b.key), scenario, level, seen);
      const bare = measureBuild(owner, bareLineup(owner, b.key), scenario, level);
      const pct = std.perRound ? ((run.perRound - std.perRound) * 100) / std.perRound : 0;
      say(`${tag} Lv${level} ${scenario} standard ${f2(std.perRound)} build ${f2(run.perRound)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) bare ${f2(bare.perRound)} win ${f2(run.rate)}/${f2(std.rate)} gauge ${f2(run.gaugePerRound)}/${f2(std.gaugePerRound)} rounds ${run.rounds}/${std.rounds} kos ${run.partyKos}/${std.partyKos}`);
      for (const [skill, s] of Object.entries(run.bySkill)) say(`skill ${tag} Lv${level} ${skill} casts ${s.casts} per-cast ${f2(s.casts ? s.total / s.casts : 0)}`);
      if (run.bossFrozen) say(`frozen ${tag} Lv${level} ${run.bossFrozen}`);
      const sockets = partyAt(level, { ...buildLineup(owner, b.key), expect: true }, parityDepth(level)).roster[owner].sockets ?? {};
      const idle = Object.keys(sockets).filter((s) => !seen.has(s));
      if (idle.length) say(`idle-rune ${tag} Lv${level} ${idle.join(' ')}`);
      if (level === BUILD_LEVELS[1]) for (const s of seen) seen50.add(s);
      levels.push({ level, std, run, bare, idle });
    }
    const ceilings: BuildResult['ceilings'] = [];
    for (const depth of CEILING_DEPTHS) {
      for (const mode of ['plain', 'deep'] as const) {
        const min = Math.min(...measureCeiling(owner, b.key, depth, mode));
        say(`ceiling ${tag} d${depth} ${mode} min ${min}`);
        ceilings.push({ depth, mode, min });
      }
    }
    const skill = firstRuneSkill(owner, b.key);
    const without = measureOneRune(owner, b.key, null);
    const oneRune: BuildResult['oneRune'] = [];
    for (const r of oneRuneCandidates(owner, b.key)) {
      const w = measureOneRune(owner, b.key, r);
      const ratio = without.perRound ? w.perRound / without.perRound : 0;
      const perCast = without.perCast ? w.perCast / without.perCast : 0;
      say(`one-rune ${tag} ${skill}+${r.id} ${f2(ratio)} per-cast ${f2(perCast)} casts ${w.casts}/${without.casts}`);
      oneRune.push({ label: `${tag} ${skill}+${r.id}`, ratio, perCast, casts: w.casts, castsWithout: without.casts, legendary: RUNES[r.id].group === 'legendary' });
    }
    out.push({ key: b.key, tag, levels, ceilings, oneRune });
  }
  const uncast = UNCAST_BEFORE.filter((s) => SKILLS[s]?.owner === owner && !seen50.has(s));
  if (uncast.length) say(`uncast ${owner} ${uncast.join(' ')}`);
  return { builds: out, seen50, uncast };
}
