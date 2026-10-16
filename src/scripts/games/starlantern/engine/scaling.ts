import { ENEMIES } from '../data/enemies';
import { FLOORS } from '../data/floors';
import type { RegionDef, RegionId } from '../data/regions';
import { terrainOf } from './dungeon/run';
import { pick, randInt, type Rng } from './rng';
import type { Element, EnemyDef, StatKey, Stats } from './types';

/** The party level a depth is tuned for (spec §3.7): 2, 6, 10, 14 … */
export const depthLevel = (depth: number): number => 2 + 4 * (depth - 1);

/** Growth per depth past the first cycle (depths 1-3 keep the tuned numbers). */
const PER_DEPTH: Partial<Record<StatKey, number>> = { hp: 1.12, atk: 1.12, mag: 1.12, def: 1.08, res: 1.08 };
const FIRST_CYCLE = 3;
/**
 * Exp and gold grow by this per depth below the first, from depth 4 on (1.15^(depth-1)). The first cycle keeps its
 * tuned rewards: 1.15 and 1.32 on depths 2-3 would push the floor-3 levelling pace under balance test 2-3's band.
 */
const REWARD_PER_DEPTH = 1.15;
const ELITE: Partial<Record<StatKey, number>> = { hp: 2.2, atk: 1.3 };
const ELITE_REWARD = 3;

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

/** A monster as met at this depth, in this region, possibly as an elite. Returns a new definition; `def` is untouched. */
export function scaleEnemy(def: EnemyDef, depth: number, region: RegionDef, elite: boolean): EnemyDef {
  const deep = Math.max(0, depth - FIRST_CYCLE);
  let stats = { ...def.stats };
  if (deep > 0) stats = mul(stats, Object.fromEntries(Object.entries(PER_DEPTH).map(([k, m]) => [k, m ** deep])));
  if (region.trait && TRAIT[region.trait]) stats = mul(stats, TRAIT[region.trait]!);
  if (elite) stats = mul(stats, ELITE);
  const reward = (deep > 0 ? REWARD_PER_DEPTH ** (depth - 1) : 1) * (elite ? ELITE_REWARD : 1);
  const regional = region.id !== 'mainline';
  const name = [depth > FIRST_CYCLE ? '深層' : '', PREFIX[region.id], def.name].filter(Boolean).join('・');
  return {
    ...def,
    name: `${elite ? '★' : ''}${name}`,
    stats,
    weak: regional ? [...region.weak] : [...def.weak],
    resist: regional ? [...region.resist] : [...def.resist],
    skills: region.skill ? [...def.skills, region.skill] : [...def.skills],
    exp: Math.round(def.exp * reward),
    gold: Math.round(def.gold * reward),
    drops: def.drops.map((d) => ({ ...d })),
  };
}

/** The ordinary monsters: every one but the boss (eight today; spec §3.7's "nine" counts the boss). */
export const NORMAL_ENEMIES: string[] = Object.values(ENEMIES).filter((e) => !e.boss).map((e) => e.id);

/**
 * The monsters of one random encounter. The mainline uses the encounter table of the depth's terrain; a random
 * region throws together 1-3 of all ordinary monsters (spec §3.7), but keeps monsters of a deeper home floor away from
 * depths 1 and 2 so a fresh party is not met by temple golems.
 */
export function encounterGroup(region: RegionId, depth: number, rng: Rng): string[] {
  if (region === 'mainline') return [...pick(rng, FLOORS[terrainOf(region, depth) - 1].encounters)];
  const pool = NORMAL_ENEMIES.filter((id) => ENEMIES[id].floor <= depth);
  return Array.from({ length: randInt(rng, 1, 3) }, () => pick(rng, pool));
}
