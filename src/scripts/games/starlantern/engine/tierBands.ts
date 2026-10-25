/**
 * The difficulty bands' measurements (difficulty plan Task 0, spec §6.2): who a cell fields (each member's suggested build
 * for the cell, rulings 12–13) and what a cell gives (win rate, HP lost, rounds, rounds the party spent frozen). Pure
 * measurement: it changes no fight. Every fight draws from its own seeded rng; nothing here draws from any other stream.
 */
import { BUILDS, buildOf, type BuildDef, type BuildScenario } from '../data/builds';
import { CHARACTER_IDS } from '../data/characters';
import { ENHANCE_MAX, expectedEnhance } from '../data/forge';
import type { HeroBuild } from '../data/hero';
import type { RegionId } from '../data/regions';
import { RUNES, type RuneTier } from '../data/runes';
import { AFFIX_EXCLUDE, AFFIX_IDS, type AffixId } from '../data/affixes';
import { tierOf } from '../data/difficulty';
import type { BattleScale, Difficulty } from './battle';
import { depthLevel } from './levels';
import { MAX_LEVEL, STANDARD_LINEUP } from './party';
import { encounterTable } from './scaling';
import { parityLineups } from './parity';
import { ODD_LINEUPS, kitParty, lineupPolicies, setSimTrace, simBattle, type Lineup } from './sim';
import { socketCount } from './sockets';
import { BOND_SWITCH } from './story/bond';
import { rollCrowdAffix, type CrowdAffix } from './tiers';
import type { CharacterId, Rarity } from './types';

/** What a cell is: a crowd of an encounter group, the same group with its first foe an elite, or the floor's boss. */
export type CellKind = 'crowd' | 'elite' | 'boss';
/** Seeds a cell is measured over, k x 7919 for k = 1..n. */
export const TIER_SEEDS = 40;

/** The build scenario a cell kind picks (ruling 12): an elite cell is fought as a crowd. */
const scenarioOf = (kind: CellKind): BuildScenario => (kind === 'boss' ? 'boss' : 'crowd');

/**
 * `id`'s build for a cell (ruling 12): her first rune build in `scenario` suggested at `level`; else her first rune build
 * suggested at `level`; else none (her standard). The hero with `heroFill` wears the rune build whose `hero` is the fill
 * (ruling 13).
 */
function pickBuild(id: CharacterId, level: number, scenario: BuildScenario, heroFill?: HeroBuild): BuildDef | undefined {
  const runeBuilds = BUILDS[id].filter((b) => b.key !== 'standard' && (b.minLevel ?? 0) <= level);
  if (id === 'hero' && heroFill) {
    // A fill with no build would quietly field the standard hero (T0-T1 review, minor 4): a test hook mends nothing.
    const fill = runeBuilds.find((b) => b.hero === heroFill);
    if (!fill) throw new Error(`the hero has no rune build for the fill ${heroFill} at Lv ${level}`);
    return fill;
  }
  return runeBuilds.find((b) => b.scenario === scenario) ?? runeBuilds[0];
}

/**
 * The lineup a difficulty cell fields at `level` (rulings 12–13): `ids` (default the standard five), each on her build for
 * `kind` at `runeTier`, the hero's `heroBuild` the `hero` of the build he wears; `'bare'` is the default party, no build
 * and no rune.
 */
export function tierLineup(level: number, kind: CellKind, runeTier: RuneTier | 'bare', ids?: CharacterId[], heroFill?: HeroBuild): Lineup {
  const members = ids ?? STANDARD_LINEUP;
  if (runeTier === 'bare') return { ids: [...members] };
  const build: Partial<Record<CharacterId, string>> = {};
  let heroBuild: HeroBuild | undefined;
  for (const id of members) {
    const b = pickBuild(id, level, scenarioOf(kind), heroFill);
    if (!b) continue;
    build[id] = b.key;
    if (id === 'hero') heroBuild = b.hero;
  }
  return { ids: [...members], build, runeTier, ...(heroBuild ? { heroBuild } : {}) };
}

/**
 * One cell of a difficulty band: the encounter groups fought at `depth` in `region`, as a crowd, with the first foe an
 * elite, or as the boss; the difficulty and the affixes carried in the fight's scale; the lineup; seeds (default
 * TIER_SEEDS) and the gear's enhance (default `expectedEnhance(depth)`).
 */
export interface TierCell {
  depth: number; region: RegionId; kind: CellKind; groups: string[][]; difficulty?: Difficulty; affixes?: readonly AffixId[];
  lineup: Lineup; seeds?: number; enhance?: number;
  /** The kit's one rarity (H4: band 14's rare kit), else every piece drawn from the depth's weights. */
  rarity?: Rarity;
  /** How a band reports the cell; no bearing on the fight. */
  label?: string;
}

/**
 * What a cell gave: the win rate; the HP lost and the rounds, each a mean over the fights; the fewest rounds a fight took;
 * the rounds that ended with a party member frozen; how many fights.
 */
export interface TierRun { rate: number; hpLoss: number; rounds: number; minRounds: number; partyFrozen: number; fights: number }

/**
 * The crowd affix a cell's fight `k` of group `gi` meets (controller ruling 2026-10-23): on a tier with a crowd affix
 * chance (Hell), a crowd cell draws it as the game does, the group and the fight as the spot; none otherwise.
 */
export function cellCrowdAffix(c: TierCell, gi: number, k: number): CrowdAffix | undefined {
  const chance = tierOf(c.difficulty)?.crowdAffixChance ?? 0;
  return chance > 0 && c.kind === 'crowd' ? rollCrowdAffix(k * 7919, c.depth, { x: gi, y: k }, chance) : undefined;
}

/**
 * Measures a cell: every group x seed k x 7919 (k = 1..seeds), the party `kitParty(min(MAX_LEVEL, depthLevel(depth)),
 * depth, 1, …, enhance, { …lineup, expect: true })` (built once, a copy a fight), the lineup's own policies. A fight that
 * reaches the round cap is a loss. A trace already installed is set aside while this measures.
 */
export function measureCell(c: TierCell): TierRun {
  const seeds = c.seeds ?? TIER_SEEDS;
  const level = Math.min(MAX_LEVEL, depthLevel(c.depth));
  const kit = kitParty(level, c.depth, 1, c.rarity, c.enhance ?? expectedEnhance(c.depth), { ...c.lineup, expect: true });
  const policies = lineupPolicies(c.lineup);
  let wins = 0, loss = 0, rounds = 0, minRounds = Infinity, frozen = 0, n = 0;
  const prev = setSimTrace({
    round(_a, _before, after) { if (after.party.some((p) => p.frozen)) frozen++; },
    end() {},
  });
  try {
    for (const [gi, g] of c.groups.entries()) {
      const scale: BattleScale = {
        depth: c.depth, region: c.region,
        ...(c.kind === 'elite' ? { elite: g[0] } : {}),
        ...(c.difficulty ? { difficulty: c.difficulty } : {}),
        ...(c.affixes ? { affixes: c.affixes } : {}),
      };
      for (let k = 1; k <= seeds; k++) {
        // Hell's crowd affix (controller ruling 2026-10-23), drawn as the game draws it, the group and seed as the spot.
        const ca = cellCrowdAffix(c, gi, k);
        const r = simBattle(structuredClone(kit), g, c.kind === 'boss', k * 7919, ca ? { ...scale, crowdAffix: ca } : scale, undefined, 'skill', c.lineup.abyss, undefined, { policies });
        n++;
        loss += r.hpLoss;
        rounds += r.rounds;
        minRounds = Math.min(minRounds, r.rounds);
        // A fight still going at simBattle's round cap is not won: a loss.
        if (r.outcome === 'win') wins++;
      }
    }
  } finally {
    setSimTrace(prev);
  }
  return { rate: n ? wins / n : 0, hpLoss: n ? loss / n : 0, rounds: n ? rounds / n : 0, minRounds: minRounds === Infinity ? 0 : minRounds, partyFrozen: frozen, fights: n };
}

/** The depths of the Normal baseline (difficulty plan Task 0): the main road, every five floors from the Nightmare's opening. */
export const BASELINE_DEPTHS = [10, 15, 20, 25, 30] as const;
/** The lineups the baseline fields: the default party bare, and the cell's builds at the magic and the rare tier. */
export const BASELINE_TIERS = ['bare', 'magic', 'rare'] as const;

/**
 * The main road's cell of `kind` at `depth` (crowd: every encounter group of the floor; boss: the Lantern-eater), the
 * standard five on `tier`, at `difficulty` (default Normal: none in the scale).
 */
export function roadCell(depth: number, kind: 'crowd' | 'boss', tier: RuneTier | 'bare', difficulty?: Difficulty): TierCell {
  const level = Math.min(MAX_LEVEL, depthLevel(depth));
  return {
    depth, region: 'mainline', kind, groups: kind === 'boss' ? [['lanterneater']] : encounterTable('mainline', depth),
    lineup: tierLineup(level, kind, tier), ...(difficulty ? { difficulty } : {}),
  };
}

const roadRuns = new Map<string, TierRun>();

/** `roadCell(depth, kind, tier)` on Normal, measured once (the baseline and the feasibility gate share it). */
export function normalRoad(depth: number, kind: 'crowd' | 'boss', tier: RuneTier | 'bare'): TierRun {
  const key = `${depth}|${kind}|${tier}`;
  let run = roadRuns.get(key);
  if (!run) roadRuns.set(key, (run = measureCell(roadCell(depth, kind, tier))));
  return run;
}

/** One baseline line: `[tiers-base] d<D> <tier> <kind> rate <a> loss <b> rounds <c> min <m>`, without the tag. */
export const baselineLine = (depth: number, tier: string, kind: string, r: TierRun): string =>
  `d${depth} ${tier} ${kind} rate ${r.rate.toFixed(3)} loss ${r.hpLoss.toFixed(3)} rounds ${r.rounds.toFixed(2)} min ${r.minRounds}`;

/**
 * The feasibility gate (difficulty plan ruling 16, Task 0b, with the controller's ruling on it): on Normal, at each depth,
 * the magic-tier builds must already pull apart from the bare default at the boss, by HP lost (`lossGap`) AND by rounds
 * (`roundsRatio`). The crowd rows are measured and reported, not gated: a Normal group falls in 2–4 rounds at Lv 50 either
 * way (a ceiling), so the crowd gap is measured under each difficulty in Task 5a instead.
 */
export const FEASIBLE = { depths: [10, 15, 20, 25], lossGap: 0.10, roundsRatio: 0.8, gated: ['boss'] } as const;

/** Whether `magic` pulls apart from `bare` as FEASIBLE asks: HP lost lower by `lossGap`, and rounds at most `roundsRatio` of bare's. */
export const pullsApart = (bare: TierRun, magic: TierRun): boolean =>
  bare.hpLoss - magic.hpLoss >= FEASIBLE.lossGap && magic.rounds <= FEASIBLE.roundsRatio * bare.rounds;

export interface FeasibleRow { depth: number; kind: 'crowd' | 'boss'; bare: TierRun; magic: TierRun; ok: boolean; gated: boolean }

/**
 * Every row of the feasibility gate: the crowd (every group of the floor, averaged) and the boss at each FEASIBLE depth;
 * `ok` whether it pulls apart, `gated` whether the gate holds it to that (the bosses).
 */
export function feasibility(): FeasibleRow[] {
  return FEASIBLE.depths.flatMap((depth) => (['crowd', 'boss'] as const).map((kind) => {
    const bare = normalRoad(depth, kind, 'bare');
    const magic = normalRoad(depth, kind, 'magic');
    return { depth, kind, bare, magic, ok: pullsApart(bare, magic), gated: (FEASIBLE.gated as readonly string[]).includes(kind) };
  }));
}

/** One feasibility row: `d<D> <kind> loss <bare>-><magic> (gap <g>) rounds <bare>-><magic> (ratio <r>) <ok|FAIL|reported>`. */
export const feasibilityLine = (r: FeasibleRow): string =>
  `d${r.depth} ${r.kind} loss ${r.bare.hpLoss.toFixed(3)}->${r.magic.hpLoss.toFixed(3)} (gap ${(r.bare.hpLoss - r.magic.hpLoss).toFixed(3)}) `
  + `rounds ${r.bare.rounds.toFixed(2)}->${r.magic.rounds.toFixed(2)} (ratio ${(r.bare.rounds ? r.magic.rounds / r.bare.rounds : 0).toFixed(3)}) `
  + `${r.gated ? (r.ok ? 'ok' : 'FAIL') : 'reported'}`;

/** The bands of the higher difficulties (spec §6.2 and its controller ruling of 2026-10-23): N1–N6 Nightmare, H1–H4 and HE Hell. */
export type BandId = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'H1' | 'H2' | 'H3' | 'H4' | 'HE';
export const NIGHTMARE_BANDS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'] as const;
export const HELL_BANDS = ['H1', 'H2', 'H3', 'H4', 'HE'] as const;
/** The seeds of a Hell boss or elite cell (spec §6.2 H2, H4: ten fights a pair of affixes). */
export const HELL_BOSS_SEEDS = 10;
/** The regions with a rider (data/regions.ts REGION_RIDER), as N6 measures them. */
export const RIDER_REGIONS: readonly RegionId[] = ['blaze', 'frost', 'storm', 'shade', 'iron'];

const levelAt = (depth: number): number => Math.min(MAX_LEVEL, depthLevel(depth));
const tierName = (l: Lineup): string => l.runeTier ?? 'bare';

/** Every pair of different affixes that may meet (AFFIX_EXCLUDE left out), in AFFIX_IDS order. */
export const AFFIX_PAIRS: readonly (readonly [AffixId, AffixId])[] =
  AFFIX_IDS.flatMap((a, i) => AFFIX_IDS.slice(i + 1).map((b) => [a, b] as const))
    .filter(([a, b]) => !AFFIX_EXCLUDE.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));

/** Every group of the main road at `depth`, one a cell (a crowd, or with `elite` its first foe an elite). */
function groupCells(depth: number, kind: 'crowd' | 'elite', difficulty: Difficulty, tier: RuneTier, affixes?: readonly AffixId[]): TierCell[] {
  return encounterTable('mainline', depth).map((g, i): TierCell => ({
    depth, region: 'mainline', kind, groups: [g], difficulty, ...(affixes ? { affixes } : {}),
    lineup: tierLineup(levelAt(depth), kind, tier),
    label: `d${depth} ${kind} g${i} ${g.join('+')}${affixes ? ` [${affixes.join('+')}]` : ''} ${tier}`,
  }));
}

/** The Lantern-eater of the main road at `depth` with `affixes`. */
function bossCell(depth: number, difficulty: Difficulty, tier: RuneTier, affixes: readonly AffixId[], seeds?: number): TierCell {
  return {
    depth, region: 'mainline', kind: 'boss', groups: [['lanterneater']], difficulty, affixes,
    lineup: tierLineup(levelAt(depth), 'boss', tier), ...(seeds ? { seeds } : {}),
    label: `d${depth} boss [${affixes.join('+')}] ${tier}`,
  };
}

/** The same cell with the default party, no build and no rune (N4, H3). */
function bareOf(c: TierCell): TierCell {
  return { ...c, lineup: tierLineup(levelAt(c.depth), c.kind, 'bare'), label: c.label?.replace(tierName(c.lineup), 'bare') };
}

/** The same cell with the cell's builds at `tier` (H3: Nightmare's magic). */
function atTier(c: TierCell, tier: RuneTier): TierCell {
  return { ...c, lineup: tierLineup(levelAt(c.depth), c.kind, tier), label: c.label?.replace(tierName(c.lineup), tier) };
}

/**
 * The lineup with a trigger or 常駐 combo (controller ruling 2026-10-23, H2): as it is when it already has one; else the
 * first member in party order with a rune build that sockets one at `level` wears her first such build (the standard
 * five's boss lineup: Chizuru on 穩守).
 */
export function withTrigger(l: Lineup, level: number): Lineup {
  if (hasTriggerOrLasting(l, level)) return l;
  for (const id of l.ids ?? STANDARD_LINEUP) {
    const b = BUILDS[id].find((x) => x.key !== 'standard' && (x.minLevel ?? 0) <= level && hasTriggerOrLasting({ build: { [id]: x.key } }, level));
    if (b) return { ...l, build: { ...l.build, [id]: b.key }, ...(id === 'hero' ? { heroBuild: b.hero ?? 'balanced' } : {}) };
  }
  return l;
}

/**
 * H4's lineup: `owner` on her build `key` in her parity lineup (where band 14 and the rune bands' ceiling field her), every
 * other member on her boss build (ruling 12), all at the epic tier; the hero's `heroBuild` the `hero` of the build he wears.
 */
function ceilingLineup(owner: CharacterId, key: string): Lineup {
  const ids = parityLineups().find((l) => l.measured.includes(owner))!.ids;
  const base = tierLineup(MAX_LEVEL, 'boss', 'epic', ids);
  const build = { ...base.build, [owner]: key };
  const heroBuild = buildOf('hero', build.hero!)?.hero ?? 'balanced';
  return { ...base, build, heroBuild };
}

/**
 * Hell below d25 (T4-T5 review): reachable, since depths are shared and Hell is chosen a run, but under no band; measured
 * and reported only, never asserted. The d15 crowds as H1 builds them, the d15 and d20 bosses as H2 does, and the same
 * bosses again with the bare default (the controller after Task 6a: the intent is H3's .40 or less there too).
 */
export function hellReportCells(): TierCell[] {
  const bosses = [15, 20].flatMap((d) => AFFIX_PAIRS.map((p) => {
    const c = bossCell(d, 'hell', 'rare', p, HELL_BOSS_SEEDS);
    return { ...c, lineup: withTrigger(c.lineup, levelAt(d)) };
  }));
  return [...groupCells(15, 'crowd', 'hell', 'rare'), ...bosses, ...bosses.map(bareOf)];
}

/**
 * Shallow Hell's one assertion (controller ruling after Task 6b, its one tuning round on the d20–24 boss factors): the bare
 * default pooled at most .40 against the Hell boss at d15 and d20, as H3 holds it at d25. The rare boss pooled at least
 * .80 there (T6a-T7a review 2: the tuning round left d20 exactly on that floor, so it is asserted, counted in wins). The
 * d15 crowds stay reported only.
 */
export const SHALLOW_HELL_BARE = { depths: [15, 20], bareRate: 0.40, rareRate: 0.80 } as const;

/**
 * Whether a pooled run won at least `floor` of its fights, counted in whole wins: a pooled rate a hair under the floor in
 * floats (.79999…) is still the same number of wins, and the wins a floor asks for are rounded up once, never by noise.
 */
export const winsAtLeast = (r: TierRun, floor: number): boolean => Math.round(r.rate * r.fights) >= Math.ceil(floor * r.fights - 1e-9);

/** What shallow Hell misses of SHALLOW_HELL_BARE over `runs` (hellReportCells measured); no boss fight of a kind is a miss. */
export function shallowHellMisses(runs: readonly BandRun[]): string[] {
  const S = SHALLOW_HELL_BARE;
  return S.depths.flatMap((d) => {
    const boss = (rare: boolean) => pooled(runs.filter((m) => m.cell.kind === 'boss' && m.cell.depth === d && !!m.cell.lineup.runeTier === rare).map((m) => m.run));
    const bare = boss(false), rare = boss(true);
    return [
      ...(!bare.fights ? [`HR d${d}: no bare boss fight measured`] : bare.rate > S.bareRate ? [`HR d${d}: bare boss rate ${f3(bare.rate)} > ${S.bareRate}`] : []),
      ...(!rare.fights ? [`HR d${d}: no rare boss fight measured`] : !winsAtLeast(rare, S.rareRate) ? [`HR d${d}: rare boss rate ${f3(rare.rate)} < ${S.rareRate}`] : []),
    ];
  });
}

let hellReportRuns: BandRun[] | undefined;
/** hellReportCells measured once (with their Nightmare twins) and kept, as measureBand keeps a band's. */
export const measureHellReport = (): BandRun[] => (hellReportRuns ??= measureCells(hellReportCells(), true));

/** The cells of a band (spec §6.2; difficulty plan Task 5a, rulings 12–14; the controller ruling of 2026-10-23). */
export function bandCells(band: BandId): TierCell[] {
  switch (band) {
    case 'N1': return [10, 15, 20, 25].flatMap((d) => groupCells(d, 'crowd', 'nightmare', 'magic'));
    case 'N2': return [10, 20].flatMap((d) => AFFIX_IDS.flatMap((a) => groupCells(d, 'elite', 'nightmare', 'magic', [a])));
    case 'N3': return [10, 15, 20, 25].flatMap((d) => AFFIX_IDS.map((a) => bossCell(d, 'nightmare', 'magic', [a])));
    case 'N4': return [...bandCells('N1'), ...bandCells('N3')].map(bareOf);
    case 'N5': return Object.entries(ODD_LINEUPS).flatMap(([name, odd]) => odd.regions.map((region): TierCell => ({
      depth: 15, region, kind: 'crowd', groups: encounterTable(region, 15), difficulty: 'nightmare',
      lineup: { ...tierLineup(levelAt(15), 'crowd', 'magic', odd.ids, odd.fill), ...(odd.heroRow ? { heroRow: odd.heroRow } : {}) },
      label: `d15 ${name} ${region} magic`,
    })));
    case 'N6': return RIDER_REGIONS.flatMap((region) => [10, 20].map((depth): TierCell => ({
      depth, region, kind: 'crowd', groups: encounterTable(region, depth), difficulty: 'nightmare',
      lineup: tierLineup(levelAt(depth), 'crowd', 'magic'), label: `d${depth} ${region} crowd magic`,
    })));
    case 'H1': return [20, 25, 30].flatMap((d) => groupCells(d, 'crowd', 'hell', 'rare'));
    case 'H2': return [25, 30].flatMap((d) => AFFIX_PAIRS.map((p) => {
      const c = bossCell(d, 'hell', 'rare', p, HELL_BOSS_SEEDS);
      return { ...c, lineup: withTrigger(c.lineup, levelAt(d)) };
    }));
    case 'H3': {
      const cells = [...bandCells('H1'), ...bandCells('H2')];
      return [...cells.map((c) => atTier(c, 'magic')), ...cells.map(bareOf)];
    }
    case 'H4': return CHARACTER_IDS.flatMap((owner) => BUILDS[owner].filter((b) => b.key !== 'standard').flatMap((b) =>
      [25, 30].flatMap((d) => AFFIX_PAIRS.map((p): TierCell => ({
        ...bossCell(d, 'hell', 'epic', p, HELL_BOSS_SEEDS), lineup: ceilingLineup(owner, b.key), rarity: 'rare', enhance: ENHANCE_MAX,
        label: `d${d} boss [${p.join('+')}] epic ${owner}:${b.key}`,
      })))));
    case 'HE': return [20, 25].flatMap((d) => AFFIX_PAIRS.flatMap((p) => groupCells(d, 'elite', 'hell', 'rare', p).map((c) => ({ ...c, seeds: HELL_BOSS_SEEDS }))));
  }
}

/**
 * Whether a lineup wears a trigger rune or 常駐 (spec §6.2, Hell): any member's build sockets one among the runes it
 * holds at `level` (the first `socketCount(level)` of each skill's, as `buildSockets` takes them).
 */
export function hasTriggerOrLasting(l: Lineup, level: number): boolean {
  const open = socketCount(level);
  return Object.entries(l.build ?? {}).some(([id, key]) => {
    const b = key === undefined ? undefined : buildOf(id as CharacterId, key);
    return !!b && Object.values(b.runes).some((ids) => ids.slice(0, open).some((r) => r === 'lasting' || RUNES[r].group === 'trigger'));
  });
}

/** The cell's twin on Normal (ruling 14): the same lineup and seeds, no difficulty, no affixes. */
export function normalTwin(c: TierCell): TierCell {
  const { difficulty: _d, affixes: _a, ...rest } = c;
  return rest;
}

/**
 * A Hell cell's twins on Nightmare (controller ruling 2026-10-23): the same lineup and seeds at Nightmare; a crowd as it is
 * (Nightmare crowds wear no affix), a boss's pair [a, b] as the two Nightmare cells [a] and [b] (over every pair, each
 * affix weighs the same).
 */
export function nightmareTwins(c: TierCell): TierCell[] {
  const { label: _l, ...rest } = c;
  if (!c.affixes?.length) return [{ ...rest, difficulty: 'nightmare' }];
  return c.affixes.map((a) => ({ ...rest, difficulty: 'nightmare' as const, affixes: [a] }));
}

const cellRuns = new Map<string, TierRun>();

/**
 * A cell's measurement key: the cell (its label aside) and the bond's battle scale (bond plan Task 4), so band 21 can
 * measure a maxed bond, and the bond switched off, in the same process as the plain bands without one answering another.
 */
export function cellKey(c: TierCell): string {
  const { label: _l, ...t } = c;
  return JSON.stringify({ ...t, bondScale: BOND_SWITCH.scale });
}

/** A cell measured once (its label aside): twins shared between cells are run once. */
function measureOnce(c: TierCell): TierRun {
  const { label: _l, ...t } = c;
  const key = cellKey(c);
  let run = cellRuns.get(key);
  if (!run) cellRuns.set(key, (run = measureCell(t)));
  return run;
}

/** `normalTwin(c)` measured once a twin (cells that differ only in their affixes share one). */
export const measureTwin = (c: TierCell): TierRun => measureOnce(normalTwin(c));

/** Runs pooled as one: rate, HP lost and rounds weighted by fights; the fewest rounds and the frozen rounds over all. */
export function pooled(runs: readonly TierRun[]): TierRun {
  const n = runs.reduce((a, r) => a + r.fights, 0);
  const w = (f: (r: TierRun) => number) => (n ? runs.reduce((a, r) => a + f(r) * r.fights, 0) / n : 0);
  return {
    rate: w((r) => r.rate), hpLoss: w((r) => r.hpLoss), rounds: w((r) => r.rounds),
    minRounds: runs.length ? Math.min(...runs.map((r) => r.minRounds)) : 0, partyFrozen: runs.reduce((a, r) => a + r.partyFrozen, 0), fights: n,
  };
}

/** One band line, without the tier's tag: `<band> <cell> rate <a> loss <b> rounds <c> (normal <c0>, x<r>) min <m> frozen <f>`. */
export const bandLine = (band: string, label: string, r: TierRun, twin: TierRun): string =>
  `${band} ${label} rate ${r.rate.toFixed(3)} loss ${r.hpLoss.toFixed(3)} rounds ${r.rounds.toFixed(2)} `
  + `(normal ${twin.rounds.toFixed(2)}, x${(twin.rounds ? r.rounds / twin.rounds : 0).toFixed(2)}) min ${r.minRounds} frozen ${r.partyFrozen}`;

/** One crowd gap line (Task 0b ruling, reported under each tier): the cell builds against bare at a depth, as feasibilityLine. */
export const gapLine = (depth: number, bare: TierRun, built: TierRun, tier: string): string =>
  `gap ${tier}-vs-bare ${feasibilityLine({ depth, kind: 'crowd', bare, magic: built, ok: false, gated: false })}`;

/** One cell measured, with its Normal twin, and for H1 and H2 its Nightmare twins pooled. */
export interface BandRun { cell: TierCell; run: TierRun; twin: TierRun; nightmare?: TierRun }

const bandRuns = new Map<string, BandRun[]>();

/** A band's measurement key (bond plan Task 4): the band, the lineup merged into its cells, and the bond's battle scale. */
export const bandKey = (band: BandId, extra?: Partial<Lineup>): string => `${band}|${JSON.stringify(extra ?? null)}|${BOND_SWITCH.scale}`;

/** `cells` with `extra` merged into each one's lineup (band 21's maxed bond); the cells given are not changed. */
export const withLineup = (cells: readonly TierCell[], extra: Partial<Lineup>): TierCell[] =>
  cells.map((c) => ({ ...c, lineup: { ...c.lineup, ...extra } }));

/** Every cell of `cells` measured, each with its twin (and with `nightmare`, its Nightmare twins pooled). */
export const measureCells = (cells: readonly TierCell[], nightmare = false): BandRun[] => cells.map((cell) => ({
  cell, run: measureOnce(cell), twin: measureTwin(cell), ...(nightmare ? { nightmare: pooled(nightmareTwins(cell).map(measureOnce)) } : {}),
}));

/**
 * Every cell of a band measured, with its twins; once a band (a file's tests share it). `extra` is merged into every
 * cell's lineup (band 21: `{ bond: 'max' }`); with none, and the bond at its scale, the numbers are the band's own.
 */
export function measureBand(band: BandId, extra?: Partial<Lineup>): BandRun[] {
  const key = bandKey(band, extra);
  let runs = bandRuns.get(key);
  if (!runs) {
    const cells = extra ? withLineup(bandCells(band), extra) : bandCells(band);
    bandRuns.set(key, (runs = measureCells(cells, band === 'H1' || band === 'H2')));
  }
  return runs;
}

/**
 * The bands' thresholds (spec §6.2 with the controller ruling of 2026-10-23; Task 5b may not move them). Each asserted
 * band pools its cells a depth (`depths`): N1 every crowd group, N3 every affix, N4 the bare bosses against N3 at the same
 * depth, H1 every crowd group, H2 every pair, H3 the bare bosses, HE every group and pair. "Harder than" is a pooled HP
 * lost strictly above the twin's (N1, N3: Normal; H1, H2: Nightmare). Cells at other depths are reported only.
 */
export const TIER_BANDS = {
  N1: { depths: [10, 15, 20, 25], rate: 0.90 },
  N2: { rate: 0.80, belowMean: 0.15 },
  N3: { depths: [15, 20, 25], rate: 0.80 },
  N4: { depths: [15, 20, 25], bareRate: 0.70, belowMagic: 0.20 },
  N5: { rate: 0.75 },
  N6: { rate: 0.80 },
  H1: { depths: [20, 25], rate: 0.85 },
  H2: { depths: [25], rate: 0.75 },
  H3: { depths: [25], bareRate: 0.40 },
  H4: { minRounds: 3 },
  HE: { depths: [20, 25], rate: 0.75, pairFloor: 0.40 },
} as const;

/**
 * The curve (controller ruling 2026-10-23): within a tier the effective difficulty does not drop as the depth rises, read
 * as the pooled HP lost over the Normal twin's at each depth listed, never more than `slack` under the depth before.
 */
export const CURVE = { slack: 0.03, N1: [10, 15, 20, 25], N3: [10, 15, 20, 25], H1: [20, 25] } as const;

const f3 = (x: number): string => x.toFixed(3);
const at = (runs: readonly BandRun[], depth: number, kind?: CellKind) => runs.filter((m) => m.cell.depth === depth && (!kind || m.cell.kind === kind));
/** The runs pooled: the cells', their Normal twins', their Nightmare twins'. */
export const poolOf = (runs: readonly BandRun[]) => ({
  run: pooled(runs.map((m) => m.run)), twin: pooled(runs.map((m) => m.twin)),
  nightmare: pooled(runs.flatMap((m) => (m.nightmare ? [m.nightmare] : []))),
});

/**
 * What a band misses of TIER_BANDS, one line a miss (empty when the band holds). `runsOf` gives a band's runs (N4 reads
 * N3's at the same depth).
 */
export function bandMisses(band: BandId, runsOf: (b: BandId) => readonly BandRun[]): string[] {
  const out: string[] = [];
  const runs = runsOf(band);
  const harder = (d: number, p: ReturnType<typeof poolOf>, vs: 'normal' | 'nightmare') => {
    const t = vs === 'normal' ? p.twin : p.nightmare;
    if (!(p.run.hpLoss > t.hpLoss)) out.push(`${band} d${d}: loss ${f3(p.run.hpLoss)} not above the ${vs} twin's ${f3(t.hpLoss)}`);
  };
  switch (band) {
    case 'N1': case 'N3': case 'H1': case 'H2': {
      const t = TIER_BANDS[band];
      for (const d of t.depths) {
        const p = poolOf(at(runs, d));
        if (p.run.rate < t.rate) out.push(`${band} d${d}: rate ${f3(p.run.rate)} < ${t.rate}`);
        harder(d, p, band[0] === 'N' ? 'normal' : 'nightmare');
      }
      if (band !== 'H2') {
        // Each depth against the highest of every shallower one (T4-T5 review), so a slow slide cannot pass step by step.
        const deltas = CURVE[band].map((d) => { const p = poolOf(at(runs, d)); return { d, delta: p.run.hpLoss - p.twin.hpLoss }; });
        let top = deltas[0];
        for (const b of deltas.slice(1)) {
          if (b.delta < top.delta - CURVE.slack) out.push(`${band} d${b.d}: the loss over the normal twin ${f3(b.delta)} drops more than ${CURVE.slack} under d${top.d}'s ${f3(top.delta)}`);
          if (b.delta > top.delta) top = b;
        }
      }
      break;
    }
    case 'N2': {
      const t = TIER_BANDS.N2;
      for (const depth of [...new Set(runs.map((m) => m.cell.depth))]) {
        const here = at(runs, depth);
        const by = AFFIX_IDS.map((a) => ({ a, r: pooled(here.filter((m) => m.cell.affixes?.[0] === a).map((m) => m.run)) }));
        const mean = by.reduce((s, x) => s + x.r.rate, 0) / by.length;
        for (const { a, r } of by) {
          if (r.rate < t.rate) out.push(`N2 d${depth} [${a}]: rate ${f3(r.rate)} < ${t.rate}`);
          if (r.rate < mean - t.belowMean) out.push(`N2 d${depth} [${a}]: rate ${f3(r.rate)} below the mean ${f3(mean)} by more than ${t.belowMean}`);
        }
      }
      break;
    }
    case 'N4': {
      const t = TIER_BANDS.N4;
      for (const d of t.depths) {
        const bare = pooled(at(runs, d, 'boss').map((m) => m.run));
        const magic = pooled(at(runsOf('N3'), d).map((m) => m.run));
        if (!bare.fights) { out.push(`N4 d${d}: no bare boss fight measured`); continue; }   // never a pass by default
        if (bare.rate > t.bareRate) out.push(`N4 d${d}: bare rate ${f3(bare.rate)} > ${t.bareRate}`);
        if (bare.rate > magic.rate - t.belowMagic) out.push(`N4 d${d}: bare rate ${f3(bare.rate)} not ${t.belowMagic} under magic's ${f3(magic.rate)}`);
      }
      break;
    }
    case 'N5': case 'N6': {
      const t = TIER_BANDS[band];
      for (const m of runs) if (m.run.rate < t.rate) out.push(`${band} ${m.cell.label}: rate ${f3(m.run.rate)} < ${t.rate}`);
      break;
    }
    case 'H3': {
      const t = TIER_BANDS.H3;
      for (const d of t.depths) {
        const bare = pooled(at(runs, d, 'boss').filter((m) => !m.cell.lineup.runeTier).map((m) => m.run));
        if (!bare.fights) { out.push(`H3 d${d}: no bare boss fight measured`); continue; }   // never a pass by default
        if (bare.rate > t.bareRate) out.push(`H3 d${d}: bare boss rate ${f3(bare.rate)} > ${t.bareRate}`);
      }
      break;
    }
    case 'H4': {
      for (const m of runs) if (m.run.minRounds < TIER_BANDS.H4.minRounds) out.push(`H4 ${m.cell.label}: a fight of ${m.run.minRounds} rounds < ${TIER_BANDS.H4.minRounds}`);
      break;
    }
    case 'HE': {
      const t = TIER_BANDS.HE;
      for (const d of t.depths) {
        const here = at(runs, d);
        const p = pooled(here.map((m) => m.run));
        if (p.rate < t.rate) out.push(`HE d${d}: rate ${f3(p.rate)} < ${t.rate}`);
        for (const pair of AFFIX_PAIRS) {
          const r = pooled(here.filter((m) => m.cell.affixes?.join('+') === pair.join('+')).map((m) => m.run));
          if (r.fights && r.rate < t.pairFloor) out.push(`HE d${d} [${pair.join('+')}]: rate ${f3(r.rate)} < ${t.pairFloor}`);
        }
      }
      break;
    }
  }
  return out;
}

/** HX (spec §6.2): every cell whose party spent a round frozen, one line a cell. */
export const frozenMisses = (band: string, runs: readonly BandRun[]): string[] =>
  runs.filter((m) => m.run.partyFrozen !== 0).map((m) => `${band} ${m.cell.label}: frozen ${m.run.partyFrozen}`);

/**
 * The pooled lines of a band's asserted depths, for the report: `<band> d<D> pooled rate <a> loss <b> (normal loss <n>[,
 * nightmare loss <m>])`; N4 and H3 their bare bosses, HE every pair's rate.
 */
export function pooledLines(band: BandId, runsOf: (b: BandId) => readonly BandRun[]): string[] {
  const runs = runsOf(band);
  const depths = [...new Set(runs.map((m) => m.cell.depth))].sort((a, b) => a - b);
  return depths.flatMap((d) => {
    const kinds = band === 'N4' || band === 'H3' ? (['crowd', 'boss'] as const) : [undefined];
    return kinds.flatMap((kind) => {
      const tiers = band === 'H3' ? (['magic', 'bare'] as const) : [undefined];
      return tiers.flatMap((tier) => {
        const here = at(runs, d, kind).filter((m) => !tier || tierName(m.cell.lineup) === tier);
        if (!here.length) return [];
        const p = poolOf(here);
        const nm = here.some((m) => m.nightmare) ? `, nightmare loss ${f3(p.nightmare.hpLoss)}` : '';
        const head = `${band} d${d}${kind ? ` ${kind}` : ''}${tier ? ` ${tier}` : ''} pooled rate ${f3(p.run.rate)} loss ${f3(p.run.hpLoss)} (normal loss ${f3(p.twin.hpLoss)}${nm})`;
        if (band !== 'HE') return [head];
        return [head, ...AFFIX_PAIRS.map((pair) => {
          const r = pooled(here.filter((m) => m.cell.affixes?.join('+') === pair.join('+')).map((m) => m.run));
          return `${band} d${d} pair [${pair.join('+')}] pooled rate ${f3(r.rate)} loss ${f3(r.hpLoss)}`;
        })];
      });
    });
  });
}
