import { CHARACTERS } from '../data/characters';
import { CONDITIONS, type ConditionDef } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import type { RegionDef, RegionId } from '../data/regions';
import { terrainOf } from './dungeon/run';
import { expToNext } from './party';
import { pick, type Rng } from './rng';
import type { Element, EnemyDef, StatKey, Stats } from './types';

/** The party level a depth is tuned for (spec §3.7): 2, 6, 10, 14 … */
export const depthLevel = (depth: number): number => 2 + 4 * (depth - 1);

/**
 * Depth growth (spec §3.7): a monster is lifted from its home level (the depth level of the floor it was made for) to
 * the depth level where it is met, by as much as an average party grows between those levels. Each stat follows the
 * party stat it is measured against, so a deep fight plays like the same monster at home:
 * - atk / mag keep the share of party HP they take, through party def / res (damage = atk * 60 / (40 + def));
 * - hp keeps the number of party hits it takes, through party atk / mag and the monster's own grown def;
 * - def / res / spd follow party def / res / spd.
 * A monster at or below its home level is unchanged, so the mainline's first cycle keeps its tuned numbers.
 */
const STAT_KEYS: StatKey[] = ['hp', 'tp', 'atk', 'def', 'mag', 'res', 'spd'];
const AVG = (() => {
  const cs = Object.values(CHARACTERS);
  const avg = (pick: (c: (typeof cs)[number]) => Stats) =>
    Object.fromEntries(STAT_KEYS.map((k) => [k, cs.reduce((n, c) => n + pick(c)[k], 0) / cs.length])) as Stats;
  return { base: avg((c) => c.base), growth: avg((c) => c.growth) };
})();
const partyStat = (k: StatKey, level: number): number => AVG.base[k] + AVG.growth[k] * (level - 1);
/** The boss is tuned for a party around level 12 (balance test 6: real fight at 11, reliable at 13). */
const BOSS_HOME = 12;
/** Softens the hp/atk/mag growth a little: the party also gains skills and gauge with levels, which the stat ratio misses. */
const DAMPING = 0.9;
export const homeLevel = (def: EnemyDef): number => (def.boss ? BOSS_HOME : depthLevel(def.floor));

function growth(def: EnemyDef, depth: number): Partial<Record<StatKey, number>> {
  const home = homeLevel(def);
  const lv = Math.max(home, depthLevel(depth));
  if (lv === home) return {};
  const r = (k: StatKey) => partyStat(k, lv) / partyStat(k, home);
  const damp = (m: number) => m ** DAMPING;
  const hpShare = r('hp');
  const defM = r('def');
  const grownDef = def.stats.def * defM;
  return {
    atk: damp(hpShare * (40 + partyStat('def', lv)) / (40 + partyStat('def', home))),
    mag: damp(hpShare * (40 + partyStat('res', lv)) / (40 + partyStat('res', home))),
    hp: damp(((r('atk') + r('mag')) / 2) * (40 + grownDef) / (40 + def.stats.def)),
    def: defM,
    res: r('res'),
    spd: r('spd'),
  };
}

/**
 * Exp and gold follow the level curve: four levels at the depth level take as many fights as the floor's levelling
 * span did at home (the spans balance test 2-3 holds at 10-18 fights).
 */
const HOME_SPAN: Record<1 | 2 | 3, [number, number]> = { 1: [1, 5], 2: [5, 8], 3: [8, 11] };
const need = (from: number, to: number): number => {
  let n = 0;
  for (let l = from; l < to; l++) n += expToNext(l);
  return n;
};
const rewardGrowth = (def: EnemyDef, depth: number): number => {
  const lv = depthLevel(depth);
  if (lv <= homeLevel(def)) return 1;
  const [a, b] = HOME_SPAN[def.floor];
  return need(lv, lv + 4) / need(a, b);
};

const ELITE: Partial<Record<StatKey, number>> = { hp: 2.2, atk: 1.3 };
const ELITE_REWARD = 3;
const DEEP_FROM = 4;

/** Name prefix of a region's variants: 「熾焰・荊棘狼」. */
const PREFIX: Record<RegionId, string> = { mainline: '', blaze: '熾焰', frost: '霜凍', storm: '雷鳴', mire: '腐毒', shade: '暗影', iron: '鋼鐵' };

/**
 * Region traits as plain stat changes (spec §3.0): mire monsters are tough, storm ones fast, shade ones quick to act,
 * iron ones armoured but hit softer. Evasion, crits and blocking are not in the battle engine; this is the stand-in.
 */
const TRAIT: Partial<Record<NonNullable<RegionDef['trait']>, Partial<Record<StatKey, number>>>> = {
  poison: { hp: 1.3 },
  swift: { spd: 1.3 },
  evasive: { spd: 1.15 },
  armored: { def: 1.4, atk: 0.9 },
};

/** Battle-screen tint of a region's variants: its element, or `phys` for the element-less regions (mire, shade, iron). */
export function regionTint(region: RegionDef): Element | undefined {
  if (region.id === 'mainline') return undefined;
  return region.element ?? 'phys';
}

function mul(stats: Stats, by: Partial<Record<StatKey, number>>): Stats {
  const out = { ...stats };
  for (const [k, m] of Object.entries(by) as [StatKey, number][]) out[k] = Math.round(out[k] * m);
  return out;
}

/**
 * A monster as met at this depth, in this region, possibly as an elite, under a run condition (default: none).
 * Returns a new definition; `def` is untouched.
 */
export function scaleEnemy(def: EnemyDef, depth: number, region: RegionDef, elite: boolean, condition: ConditionDef = CONDITIONS.plain): EnemyDef {
  let stats = mul({ ...def.stats }, growth(def, depth));
  if (region.trait && TRAIT[region.trait]) stats = mul(stats, TRAIT[region.trait]!);
  if (elite) stats = mul(stats, ELITE);
  if (condition.enemyAtkMul !== 1) stats = mul(stats, { atk: condition.enemyAtkMul, mag: condition.enemyAtkMul });
  const reward = rewardGrowth(def, depth) * (elite ? ELITE_REWARD : 1);
  const regional = region.id !== 'mainline';
  const name = [depth >= DEEP_FROM ? '深層' : '', PREFIX[region.id], def.name].filter(Boolean).join('・');
  return {
    ...def,
    name: `${elite ? '★' : ''}${name}`,
    stats,
    weak: regional ? [...region.weak] : [...def.weak],
    resist: regional ? [...region.resist] : [...def.resist],
    skills: region.skill ? [...def.skills, region.skill] : [...def.skills],
    exp: Math.round(def.exp * reward * condition.expMul),
    gold: Math.round(def.gold * reward * condition.goldMul),
    drops: def.drops.map((d) => ({ ...d })),
  };
}

/** The ordinary monsters: every one but the boss (eight today; spec §3.7's "nine" counts the boss). */
export const NORMAL_ENEMIES: string[] = Object.values(ENEMIES).filter((e) => !e.boss).map((e) => e.id);

/**
 * The groups a random encounter is drawn from (`encounterGroup` picks one). The mainline uses the encounter table of the depth's terrain. A random region
 * draws from the groups of all three tables together, so every ordinary monster turns up (spec §3.7) in groups of
 * 1-3 that were balanced as a whole; tables of a deeper home floor stay away from depths 1 and 2, so a fresh party is
 * not met by temple golems.
 */
export function encounterTable(region: RegionId, depth: number): string[][] {
  if (region === 'mainline') return FLOORS[terrainOf(region, depth) - 1].encounters;
  return FLOORS.filter((f) => f.id <= depth).flatMap((f) => f.encounters);
}

export function encounterGroup(region: RegionId, depth: number, rng: Rng): string[] {
  return [...pick(rng, encounterTable(region, depth))];
}
