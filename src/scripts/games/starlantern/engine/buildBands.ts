/**
 * The rune bands' measurements (spec §12.4, plan 8h rulings 7–10, Task 5a): a suggested build worn in the sim, in its
 * own scenario, against the same lineup with her standard build; the ceiling of every build at the top tier; one rune at
 * a time on a build's first skill. Only the measurements live here: builds.bands.test.ts reports them (and plan 8h Task
 * 5b holds them to their bands). Every fight draws from its own seeded rng; nothing here draws from any other stream.
 */
import { BUILDS, buildOf, type BuildScenario } from '../data/builds';
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
/** One rune on a skill makes each cast of it at most this many times what the cast gives without it (spec §12.4). */
export const ONE_RUNE_MAX = 1.6;
/** The ceiling's depths and seeds (plan 8h ruling 8). */
export const CEILING_DEPTHS = [5, 10] as const;
export const CEILING_SEEDS = 20;
/** balance.test.ts's DEEP: ten memories on the hero and the abyss at its cap, the balanced hero (equality test). */
export const DEEP_LINEUP: Lineup = { memories: 10, abyss: ABYSS.cap, heroBuild: 'balanced' };

/** What a build gave in a set of fights: its owner's contribution per round, the win rate, and her skills one by one. */
export interface BuildRun {
  perRound: number; rate: number; rounds: number;
  bySkill: Record<string, { total: number; casts: number }>;
  /** The fewest rounds a boss fight of the set took (0 with no boss fight). */
  minBossRounds: number;
  /** Rounds a boss ended frozen (plan 8h ruling 10: never). */
  bossFrozen: number;
}

export interface BandFight { enemyIds: string[]; boss: boolean; scale: BattleScale; seeds: number }

/**
 * The fights of a scenario at `level`'s depth on the main road (plan 8h ruling 7): `boss` the Lantern-eater, `crowd`
 * every group of the depth, `long` every group with its first foe an elite; `general` every group and the Lantern-eater
 * (the parity cell), ten seeds each.
 */
export function scenarioFights(s: BuildScenario | 'general', level: number): BandFight[] {
  const depth = parityDepth(level);
  const scale = { depth, region: 'mainline' as const };
  const groups = encounterTable('mainline', depth);
  const boss: BandFight = { enemyIds: ['lanterneater'], boss: true, scale, seeds: BUILD_SEEDS.boss };
  switch (s) {
    case 'boss': return [boss];
    case 'crowd': return groups.map((g) => ({ enemyIds: g, boss: false, scale, seeds: BUILD_SEEDS.crowd }));
    case 'long': return groups.map((g) => ({ enemyIds: g, boss: false, scale: { ...scale, elite: g[0] }, seeds: BUILD_SEEDS.long }));
    case 'general': return [...groups.map((g) => ({ enemyIds: g, boss: false, scale, seeds: 10 })), { ...boss, seeds: 10 }];
  }
}

/**
 * `lineup` in `scenario` at `level`: the parity kit (`kitParty(level, depth, 1, …, expectedEnhance(depth))`, memories as
 * expected), one ledger split by skill, `owner`'s contribution per round. With `seen`, every skill `owner` chose (and
 * 'echo') goes into it. A trace already installed still sees every round.
 */
export function measureBuild(owner: CharacterId, lineup: Lineup, scenario: BuildScenario | 'general', level: number, seen?: Set<string>): BuildRun {
  const depth = parityDepth(level);
  const ledger = newLedger({ bySkill: true });
  const policies = lineupPolicies(lineup);
  let rounds = 0, wins = 0, n = 0, minBoss = Infinity, frozen = 0;
  const prev = setSimTrace({
    round(actions, before, after) {
      prev?.round(actions, before, after);
      const a = actions[owner];
      if (seen && a?.kind === 'skill') seen.add(a.skill);
      if (seen && a?.kind === 'echo') seen.add('echo');
      frozen += after.enemies.filter((e) => e.boss && e.frozen).length;
    },
    end(r) { prev?.end(r); },
  });
  try {
    for (const f of scenarioFights(scenario, level)) for (let k = 1; k <= f.seeds; k++) {
      const party = kitParty(level, depth, 1, undefined, expectedEnhance(depth), { ...lineup, expect: true });
      const r = simBattle(party, f.enemyIds, f.boss, k * 7919, f.scale, undefined, 'skill', lineup.abyss, undefined, { ledger, policies });
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
  return { perRound: rounds ? totalOf(mine) / rounds : 0, rate: n ? wins / n : 0, rounds, bySkill, minBossRounds: minBoss === Infinity ? 0 : minBoss, bossFrozen: frozen };
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

/**
 * The build at Lv 50 in the general fights with its first skill holding `rune` alone (or nothing), its other skills as the
 * build has them (plan 8h ruling 9): that skill's contribution per cast, and its casts.
 */
export function measureOneRune(owner: CharacterId, key: string, rune: RuneRef | null): { perCast: number; casts: number } {
  const level = BUILD_LEVELS[1];
  const base = buildLineup(owner, key);
  const worn = partyAt(level, { ...base, expect: true }, parityDepth(level)).roster[owner].sockets ?? {};
  const skill = firstRuneSkill(owner, key);
  const runes: Record<string, RuneRef[]> = {};
  for (const [s, refs] of Object.entries(worn)) runes[s] = refs.filter((r): r is RuneRef => r !== null);
  runes[skill] = rune ? [rune] : [];
  const run = measureBuild(owner, { ...base, runes: { [owner]: runes } }, 'general', level);
  const s = run.bySkill[skill] ?? { total: 0, casts: 0 };
  return { perCast: s.casts ? s.total / s.casts : 0, casts: s.casts };
}
