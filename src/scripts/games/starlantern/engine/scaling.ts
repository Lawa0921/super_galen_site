import { CHARACTERS, LEGACY_CHARACTER_IDS } from '../data/characters';
import { ABYSS } from '../data/hero';
import { CONDITIONS, type ConditionDef } from '../data/conditions';
import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import type { RegionDef, RegionId } from '../data/regions';
import { terrainOf } from './dungeon/run';
import { expToNext } from './party';
import { depthLevel } from './levels';
import { pick, type Rng } from './rng';
import type { TierDef } from '../data/difficulty';
import { compensation, enemySecondary } from './stats';
import type { Element, EnemyDef, EnemySkill, StatKey, Stats } from './types';

export { depthLevel } from './levels';

/** The abyss capstones' bonus at `depth`, in percent: ABYSS.perDepth per floor, never over ABYSS.cap. */
export const abyssPct = (depth: number): number => Math.min(ABYSS.cap, ABYSS.perDepth * Math.max(0, depth));

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
  // The party stat baseline is the original eight: newer characters do not move the tuned enemy curve.
  const cs = LEGACY_CHARACTER_IDS.map((id) => CHARACTERS[id]);
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

/**
 * Plan 6b Task 20c's knob for the deep road: past `fromDepth` an enemy's level (its growth and ENEMY_POWER) climbs
 * `levelsPerDepth` per depth instead of the depth level's 4, and its hp, atk and mag are multiplied by `1 + power`.
 * Exp, gold, item levels, the depth-clear grant and the suggested level stay on `depthLevel`. Task 20a added it at its
 * start values, which leave every fight bit-identical (scaling.test: "the deep knobs at their start values change nothing").
 */
export const DEEP_ENEMIES = { fromDepth: 11, levelsPerDepth: 4, power: 0 };
/** The level an enemy is met at on `depth`: the depth level up to DEEP_ENEMIES.fromDepth, then DEEP_ENEMIES.levelsPerDepth a depth. */
export const enemyLevelAt = (depth: number): number =>
  depth <= DEEP_ENEMIES.fromDepth ? depthLevel(depth) : depthLevel(DEEP_ENEMIES.fromDepth) + DEEP_ENEMIES.levelsPerDepth * (depth - DEEP_ENEMIES.fromDepth);
/** The deep road's extra multiplier on an enemy's hp, atk and mag: 1 up to DEEP_ENEMIES.fromDepth, then 1 + DEEP_ENEMIES.power. */
export const deepPower = (depth: number): number => (depth <= DEEP_ENEMIES.fromDepth ? 1 : 1 + DEEP_ENEMIES.power);

function growth(def: EnemyDef, depth: number): Partial<Record<StatKey, number>> {
  const home = homeLevel(def);
  const lv = Math.max(home, enemyLevelAt(depth));
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

/** How a monster's exp and gold grow with depth (exported for the tests of a tier's reward: one rounding). */
export const rewardGrowth = (def: EnemyDef, depth: number): number => {
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

export function mul(stats: Stats, by: Partial<Record<StatKey, number>>): Stats {
  const out = { ...stats };
  for (const [k, m] of Object.entries(by) as [StatKey, number][]) out[k] = Math.round(out[k] * m);
  return out;
}

/**
 * A monster as met at this depth, in this region, possibly as an elite, under a run condition (default: none).
 * It carries the secondaries of its depth and region (`sec`), and its stats pay for them last (stats.compensation).
 * With a difficulty `tier` (data/difficulty.ts; null for Normal, which takes none of this path): hp and atk/mag are
 * multiplied after the condition and before compensation; its own skills' and the region skill's chances rise to
 * `max(chance, min(chanceCap, chance x chanceMul))` (difficulty plan ruling 3); exp and gold are rounded once (ruling 9).
 * Returns a new definition; `def` is untouched.
 */
export function scaleEnemy(def: EnemyDef, depth: number, region: RegionDef, elite: boolean, condition: ConditionDef = CONDITIONS.plain, tier: TierDef | null = null): EnemyDef {
  let stats = mul({ ...def.stats }, growth(def, depth));
  if (region.trait && TRAIT[region.trait]) stats = mul(stats, TRAIT[region.trait]!);
  if (elite) stats = mul(stats, ELITE);
  if (condition.enemyAtkMul !== 1) stats = mul(stats, { atk: condition.enemyAtkMul, mag: condition.enemyAtkMul });
  if (tier) stats = mul(stats, { hp: tier.hp, atk: tier.atk, mag: tier.atk });
  const sec = enemySecondary(depthLevel(depth), homeLevel(def), region.trait);
  stats = mul(stats, compensation(sec));
  const reward = rewardGrowth(def, depth) * (elite ? ELITE_REWARD : 1);
  const regional = region.id !== 'mainline';
  const early = depth < REGION_TRAITS_FROM;
  const skill = region.skill && !(early && SKILL_SCALES_IN.has(region.id)) ? region.skill : null;
  const name = [depth >= DEEP_FROM ? '深層' : '', PREFIX[region.id], def.name].filter(Boolean).join('・');
  // A tier's skill odds (ruling 3): raised to the cap, never lowered; the region's skill object is copied, not changed.
  const raise = (k: EnemySkill): EnemySkill => (tier ? { ...k, chance: Math.max(k.chance, Math.min(tier.chanceCap, k.chance * tier.chanceMul)) } : k);
  return {
    ...def,
    name: `${elite ? '★' : ''}${name}`,
    stats,
    sec,
    // A named story foe keeps its own elements: the region's belong to its monsters.
    weak: regional && !def.story ? [...region.weak] : [...def.weak],
    resist: regional && !early && !def.story ? [...region.resist] : [...def.resist],
    skills: tier ? (skill ? [...def.skills, skill] : def.skills).map(raise) : skill ? [...def.skills, skill] : [...def.skills],
    // With a tier, one rounding (ruling 9); without, the line as it was.
    exp: tier ? Math.round(def.exp * reward * condition.expMul * tier.reward) : Math.round(def.exp * reward * condition.expMul),
    gold: tier ? Math.round(def.gold * reward * condition.goldMul * tier.reward) : Math.round(def.gold * reward * condition.goldMul),
    drops: [...def.drops.map((d) => ({ ...d })), ...(regional && region.material ? [{ mat: region.material, chance: REGION_DROP_CHANCE }] : [])],
  };
}

/**
 * The enemy side's knob for party progression power that the stat curves miss: skill-tree ranks and mod nodes now
 * (plan 5b Task 8) and talents (Task 9) now, not keystones (Task 10 tuned KEYSTONE_VALUES and left this knob as it was). Every enemy in a fight, bosses
 * included, has its HP, atk and mag multiplied by `enemyPower(level)`, `level` being its level in that fight (the depth
 * level, or its home level without a scale): 1 up to level `from`, then `1 + amount` above it, plus
 * `amount2 + ramp * (level - from2)` above `from2`. Mostly a step: the default tree's bonuses are mostly bought by
 * Lv11-14, and a steep per-level slope swamps the deep bands (see the plan 5b Task 8 and Task 9 sweeps in the commits
 * that set it). The second step and small ramp above `from2` (plan 5c Task 4) answer forge enhancement, which the party
 * is expected to grow a level every two depths (`expectedEnhance`); they start above the boss's home level, so band 6
 * keeps its tuning (see that task's sweeps in the commits that set them). The normal enemies of floors 1-3 (up to Lv10) keep their tuned numbers; the
 * depth-3 boss is fought at its home level (BOSS_HOME, Lv12), above `from`, so it does get the boost (band 6 is tuned
 * with it). Plan 6a Task 19c retuned it for the hero-led lineup: amount 0.26 -> 0.3 (the boss at Lv12: band 16's benching
 * check), amount2 0.04 -> 0.26 and ramp 0.004 -> 0.002 (bands 9 and 10 against band 8's elites). Task 20: ramp 0.002 ->
 * 0.0012 (band 18b, the all-physical lineup with the balanced hero in iron at depth 8, against band 10 memories at depth 8).
 */
export const ENEMY_POWER = { from: 10, amount: 0.3, from2: 12, amount2: 0.26, ramp: 0.0012 };
export const enemyPower = (level: number): number => {
  if (level <= ENEMY_POWER.from) return 1;
  const deep = level > ENEMY_POWER.from2 ? ENEMY_POWER.amount2 + ENEMY_POWER.ramp * (level - ENEMY_POWER.from2) : 0;
  return 1 + ENEMY_POWER.amount + deep;
};

/** A monster with ENEMY_POWER applied at `level`; a new definition, `def` untouched (the same one at power 1). */
export function empower(def: EnemyDef, level: number): EnemyDef {
  const k = enemyPower(level);
  return k === 1 ? def : { ...def, stats: mul(def.stats, { hp: k, atk: k, mag: k }) };
}

/** How many members stand in the formation, as a row of the party-size tables: one hero alone reads the 2-member row. */
export type PartySize = 2 | 3 | 4 | 5;
export const sizeOf = (n: number): PartySize => Math.min(5, Math.max(2, Math.round(n))) as PartySize;
/**
 * Enemy hp / atk / mag multiplier by party size (spec 9.4 point 1, `0.4 + 0.12n`). Each row is its own knob; the full
 * party's row is fixed at 1 so a five-member fight plays exactly as it was tuned.
 */
export const PARTY_SCALE: Record<PartySize, number> = { 2: 0.58, 3: 0.76, 4: 0.88, 5: 1 };
/** The most enemies in an ordinary group by party size (spec 9.4 point 2, `n + 1`). */
export const GROUP_CAP: Record<PartySize, number> = { 2: 3, 3: 4, 4: 5, 5: 6 };
/** Overrides GROUP_CAP at depth 1 only; empty today. */
export const FIRST_DEPTH_CAP: Partial<Record<PartySize, number>> = {};
export const partyScale = (n: number): number => PARTY_SCALE[sizeOf(n)];
/**
 * The same multiplier for a boss fight. A boss group is never trimmed by GROUP_CAP, so a small party meets all of it:
 * its own table, tuned apart from PARTY_SCALE (band 16). [5] is fixed at 1, and the table is non-decreasing in size.
 */
export const BOSS_PARTY_SCALE: Record<PartySize, number> = { 2: 0.62, 3: 0.96, 4: 1, 5: 1 };
export const bossPartyScale = (n: number): number => BOSS_PARTY_SCALE[sizeOf(n)];
export const groupCap = (n: number, depth: number): number => (depth === 1 ? FIRST_DEPTH_CAP[sizeOf(n)] : undefined) ?? GROUP_CAP[sizeOf(n)];

/** The ordinary monsters: every one but the boss (eight today; spec §3.7's "nine" counts the boss). */
export const NORMAL_ENEMIES: string[] = Object.values(ENEMIES).filter((e) => !e.boss && !e.story).map((e) => e.id);

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
