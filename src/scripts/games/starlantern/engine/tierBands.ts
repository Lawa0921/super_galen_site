/**
 * The difficulty bands' measurements (difficulty plan Task 0, spec §6.2): who a cell fields (each member's suggested build
 * for the cell, rulings 12–13) and what a cell gives (win rate, HP lost, rounds, rounds the party spent frozen). Pure
 * measurement: it changes no fight. Every fight draws from its own seeded rng; nothing here draws from any other stream.
 */
import { BUILDS, type BuildDef, type BuildScenario } from '../data/builds';
import { expectedEnhance } from '../data/forge';
import type { HeroBuild } from '../data/hero';
import type { RegionId } from '../data/regions';
import type { RuneTier } from '../data/runes';
import type { BattleScale, Difficulty } from './battle';
import { depthLevel } from './levels';
import { MAX_LEVEL, STANDARD_LINEUP } from './party';
import { encounterTable } from './scaling';
import { kitParty, lineupPolicies, setSimTrace, simBattle, type Lineup } from './sim';
import type { CharacterId } from './types';

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
  depth: number; region: RegionId; kind: CellKind; groups: string[][]; difficulty?: Difficulty; affixes?: readonly string[];
  lineup: Lineup; seeds?: number; enhance?: number;
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
  const kit = kitParty(level, c.depth, 1, undefined, c.enhance ?? expectedEnhance(c.depth), { ...c.lineup, expect: true });
  const policies = lineupPolicies(c.lineup);
  let wins = 0, loss = 0, rounds = 0, minRounds = Infinity, frozen = 0, n = 0;
  const prev = setSimTrace({
    round(_a, _before, after) { if (after.party.some((p) => p.frozen)) frozen++; },
    end() {},
  });
  try {
    for (const g of c.groups) {
      const scale = {
        depth: c.depth, region: c.region,
        ...(c.kind === 'elite' ? { elite: g[0] } : {}),
        ...(c.difficulty ? { difficulty: c.difficulty } : {}),
        ...(c.affixes ? { affixes: c.affixes } : {}),
      } as BattleScale;   // TODO(difficulty plan Task 3): drop the cast once BattleScale carries `affixes` (T0-T1 review, minor 3).
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
