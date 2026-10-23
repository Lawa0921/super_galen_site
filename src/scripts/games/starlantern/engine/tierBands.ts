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
import { AFFIX_IDS, type AffixId } from '../data/affixes';
import type { BattleScale, Difficulty } from './battle';
import { depthLevel } from './levels';
import { MAX_LEVEL, STANDARD_LINEUP } from './party';
import { encounterTable } from './scaling';
import { parityLineups } from './parity';
import { ODD_LINEUPS, kitParty, lineupPolicies, setSimTrace, simBattle, type Lineup } from './sim';
import { socketCount } from './sockets';
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
    for (const g of c.groups) {
      const scale: BattleScale = {
        depth: c.depth, region: c.region,
        ...(c.kind === 'elite' ? { elite: g[0] } : {}),
        ...(c.difficulty ? { difficulty: c.difficulty } : {}),
        ...(c.affixes ? { affixes: c.affixes } : {}),
      };
      for (let k = 1; k <= seeds; k++) {
        const r = simBattle(structuredClone(kit), g, c.kind === 'boss', k * 7919, scale, undefined, 'skill', c.lineup.abyss, undefined, { policies });
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

/** The bands of the higher difficulties (spec §6.2): N1–N6 Nightmare, H1–H4 Hell. */
export type BandId = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'H1' | 'H2' | 'H3' | 'H4';
export const NIGHTMARE_BANDS = ['N1', 'N2', 'N3', 'N4', 'N5', 'N6'] as const;
export const HELL_BANDS = ['H1', 'H2', 'H3', 'H4'] as const;
/** The seeds of a Hell boss cell (spec §6.2 H2, H4: ten fights a pair of affixes). */
export const HELL_BOSS_SEEDS = 10;
/** The regions with a rider (data/regions.ts REGION_RIDER), as N6 measures them. */
export const RIDER_REGIONS: readonly RegionId[] = ['blaze', 'frost', 'storm', 'shade', 'iron'];

const levelAt = (depth: number): number => Math.min(MAX_LEVEL, depthLevel(depth));
const tierName = (l: Lineup): string => l.runeTier ?? 'bare';

/** Every pair of different affixes, in AFFIX_IDS order (15). */
export const AFFIX_PAIRS: readonly (readonly [AffixId, AffixId])[] =
  AFFIX_IDS.flatMap((a, i) => AFFIX_IDS.slice(i + 1).map((b) => [a, b] as const));

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

/** The cells of a band (spec §6.2; difficulty plan Task 5a, rulings 12–14). */
export function bandCells(band: BandId): TierCell[] {
  switch (band) {
    case 'N1': return [10, 15, 20, 25].flatMap((d) => groupCells(d, 'crowd', 'nightmare', 'magic'));
    case 'N2': return [10, 20].flatMap((d) => AFFIX_IDS.flatMap((a) => groupCells(d, 'elite', 'nightmare', 'magic', [a])));
    case 'N3': return [10, 20, 25].flatMap((d) => AFFIX_IDS.map((a) => bossCell(d, 'nightmare', 'magic', [a])));
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
    case 'H2': return [25, 30].flatMap((d) => AFFIX_PAIRS.map((p) => bossCell(d, 'hell', 'rare', p, HELL_BOSS_SEEDS)));
    case 'H3': {
      const cells = [...bandCells('H1'), ...bandCells('H2')];
      return [...cells.map((c) => atTier(c, 'magic')), ...cells.map(bareOf)];
    }
    case 'H4': return CHARACTER_IDS.flatMap((owner) => BUILDS[owner].filter((b) => b.key !== 'standard').flatMap((b) =>
      [25, 30].flatMap((d) => AFFIX_PAIRS.map((p): TierCell => ({
        ...bossCell(d, 'hell', 'epic', p, HELL_BOSS_SEEDS), lineup: ceilingLineup(owner, b.key), rarity: 'rare', enhance: ENHANCE_MAX,
        label: `d${d} boss [${p.join('+')}] epic ${owner}:${b.key}`,
      })))));
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

const twinRuns = new Map<string, TierRun>();

/** `normalTwin(c)` measured once a twin (cells that differ only in their affixes share one). */
export function measureTwin(c: TierCell): TierRun {
  const { label: _l, ...t } = normalTwin(c);
  const key = JSON.stringify(t);
  let run = twinRuns.get(key);
  if (!run) twinRuns.set(key, (run = measureCell(t)));
  return run;
}

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

/** A Hell elite at the depth, with each pair of affixes (report only: the T2–T3 review's 堅韌 elite, about 5.5x HP). */
export function hellEliteCells(depth = 25): TierCell[] {
  return AFFIX_PAIRS.flatMap((p) => groupCells(depth, 'elite', 'hell', 'rare', p).map((c) => ({ ...c, seeds: HELL_BOSS_SEEDS })));
}

/** One cell measured, with its Normal twin. */
export interface BandRun { cell: TierCell; run: TierRun; twin: TierRun }

const bandRuns = new Map<BandId, BandRun[]>();

/** Every cell of `cells` measured, each with its twin. */
export const measureCells = (cells: readonly TierCell[]): BandRun[] => cells.map((cell) => ({ cell, run: measureCell(cell), twin: measureTwin(cell) }));

/** Every cell of a band measured, with its twin; once a band (a file's tests share it). */
export function measureBand(band: BandId): BandRun[] {
  let runs = bandRuns.get(band);
  if (!runs) bandRuns.set(band, (runs = measureCells(bandCells(band))));
  return runs;
}
