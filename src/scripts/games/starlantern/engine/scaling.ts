import { CHARACTERS } from '../data/characters';
import { CONDITIONS, type ConditionDef } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import type { RegionDef, RegionId } from '../data/regions';
import { terrainOf } from './dungeon/run';
import { expToNext } from './party';
import { depthLevel } from './levels';
import { pick, type Rng } from './rng';
import { compensation, enemySecondary } from './stats';
import type { Element, EnemyDef, StatKey, Stats } from './types';

export { depthLevel } from './levels';

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
/** Share of four levels at a depth's level paid for clearing it (taking its stairs down). */
export const DEPTH_CLEAR_SHARE = 0.6;

/**
 * Exp for clearing a depth, paid when the party takes the stairs down: DEPTH_CLEAR_SHARE of the four levels at the
 * depth level, so one clear of a depth (fights and this together) lands near the next depth's suggested level (balance test 12).
 */
export function depthClearExp(depth: number): number {
  const lv = depthLevel(depth);
  return Math.round(DEPTH_CLEAR_SHARE * need(lv, lv + 4));
}

const rewardGrowth = (def: EnemyDef, depth: number): number => {
  const lv = depthLevel(depth);
  if (lv <= homeLevel(def)) return 1;
  const [a, b] = HOME_SPAN[def.floor];
  return need(lv, lv + 4) / need(a, b);
};

const ELITE: Partial<Record<StatKey, number>> = { hp: 2.2, atk: 1.3 };
const ELITE_REWARD = 3;
/** Chance that a monster met in a random region also drops that region's material (the 主要掉落 on the portal card). */
export const REGION_DROP_CHANCE = 0.15;
const DEEP_FROM = 4;
/**
 * Region traits scale in: below this depth a regional monster keeps its own resists, not the region's, and iron's
 * 鐵壁重擊 stays out. A first visit to mire or iron would otherwise halve every physical hit of a Lv1 party. The rest of
 * the region (element tint, name, stat trait, weak points, other region skills, material) applies from depth 1.
 */
export const REGION_TRAITS_FROM = 2;
/** Regions whose skill also waits for REGION_TRAITS_FROM: iron's row hit. */
const SKILL_SCALES_IN: ReadonlySet<RegionId> = new Set<RegionId>(['iron']);

/** Name prefix of a region's variants: 「熾焰・荊棘狼」. */
const PREFIX: Record<RegionId, string> = { mainline: '', blaze: '熾焰', frost: '霜凍', storm: '雷鳴', mire: '腐毒', shade: '暗影', iron: '鋼鐵' };

/**
 * Region traits as plain stat changes (spec §3.0): mire monsters are tough, storm ones fast, iron ones armoured but
 * hit softer. Shade's evasive trait is real evasion and crit (stats.enemySecondary), not a stat change.
 */
const TRAIT: Partial<Record<NonNullable<RegionDef['trait']>, Partial<Record<StatKey, number>>>> = {
  poison: { hp: 1.3 },
  swift: { spd: 1.3 },
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
 * It carries the secondaries of its depth and region (`sec`), and its stats pay for them last (stats.compensation).
 * Returns a new definition; `def` is untouched.
 */
export function scaleEnemy(def: EnemyDef, depth: number, region: RegionDef, elite: boolean, condition: ConditionDef = CONDITIONS.plain): EnemyDef {
  let stats = mul({ ...def.stats }, growth(def, depth));
  if (region.trait && TRAIT[region.trait]) stats = mul(stats, TRAIT[region.trait]!);
  if (elite) stats = mul(stats, ELITE);
  if (condition.enemyAtkMul !== 1) stats = mul(stats, { atk: condition.enemyAtkMul, mag: condition.enemyAtkMul });
  const sec = enemySecondary(depthLevel(depth), homeLevel(def), region.trait);
  stats = mul(stats, compensation(sec));
  const reward = rewardGrowth(def, depth) * (elite ? ELITE_REWARD : 1);
  const regional = region.id !== 'mainline';
  const early = depth < REGION_TRAITS_FROM;
  const skill = region.skill && !(early && SKILL_SCALES_IN.has(region.id)) ? region.skill : null;
  const name = [depth >= DEEP_FROM ? '深層' : '', PREFIX[region.id], def.name].filter(Boolean).join('・');
  return {
    ...def,
    name: `${elite ? '★' : ''}${name}`,
    stats,
    sec,
    weak: regional ? [...region.weak] : [...def.weak],
    resist: regional && !early ? [...region.resist] : [...def.resist],
    skills: skill ? [...def.skills, skill] : [...def.skills],
    exp: Math.round(def.exp * reward * condition.expMul),
    gold: Math.round(def.gold * reward * condition.goldMul),
    drops: [...def.drops.map((d) => ({ ...d })), ...(regional && region.material ? [{ mat: region.material, chance: REGION_DROP_CHANCE }] : [])],
  };
}

/**
 * The enemy side's knob for party progression power that the stat curves miss: skill-tree ranks and mod nodes now
 * (plan 5b Task 8) and talents (Task 9) now, not keystones (Task 10 tuned KEYSTONE_VALUES and left this knob as it was). Every enemy in a fight, bosses
 * included, has its HP, atk and mag multiplied by `enemyPower(level)`, `level` being its level in that fight (the depth
 * level, or its home level without a scale): 1 up to level `from`, then `1 + amount` above it. A step, not a slope: the
 * default tree's bonuses are mostly bought by Lv11-14, and a per-level slope swamps the deep bands (see the Task 8 and
 * Task 9 sweeps in the commits that set it). The normal enemies of floors 1-3 (up to Lv10) keep their tuned numbers; the
 * depth-3 boss is fought at its home level (BOSS_HOME, Lv12), above `from`, so it does get the boost (band 6 is tuned
 * with it).
 */
export const ENEMY_POWER = { from: 10, amount: 0.26 };
export const enemyPower = (level: number): number => (level > ENEMY_POWER.from ? 1 + ENEMY_POWER.amount : 1);

/** A monster with ENEMY_POWER applied at `level`; a new definition, `def` untouched (the same one at power 1). */
export function empower(def: EnemyDef, level: number): EnemyDef {
  const k = enemyPower(level);
  return k === 1 ? def : { ...def, stats: mul(def.stats, { hp: k, atk: k, mag: k }) };
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
