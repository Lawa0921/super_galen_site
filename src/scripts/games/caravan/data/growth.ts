import type { CharacterGenesis, GenesisTraitId } from './genesis';
import type { StatBlock } from '../types';

export type PotentialScore = 1 | 2 | 3 | 4 | 5;

export interface GrowthProfile {
  potential: Record<keyof StatBlock, PotentialScore>;
}

export interface GrowthCombatBonuses {
  stats: Partial<StatBlock>;
  maxHp: number;
  defense: number;
  damageBonus: number;
}

const STAT_ORDER: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];

/** 每條出身有兩個長期成長傾向，讓同一職業因人生經歷產生不同曲線。 */
const LIFEPATH_AFFINITIES: Record<GenesisTraitId, Array<keyof StatBlock>> = {
  seasoned: ['int', 'cha'],
  brawny: ['str', 'con'],
  nimble: ['dex', 'con'],
  learned: ['int', 'dex'],
  charming: ['cha', 'dex'],
  tough: ['con', 'str'],
};

function clampPotential(value: number): PotentialScore {
  return Math.max(1, Math.min(5, Math.round(value))) as PotentialScore;
}

/**
 * 潛力由最終創角屬性、出身傾向、天賦與缺陷共同構成：
 * - 擲骰與配點高於職業基準，會提高對應潛力。
 * - 天賦方向 +2、缺陷方向 -1。
 * - 出身的兩個長期傾向各 +1。
 */
export function deriveGrowthProfile(
  stats: StatBlock,
  jobBaseline: StatBlock,
  genesis: CharacterGenesis,
): GrowthProfile {
  const potential = {} as Record<keyof StatBlock, PotentialScore>;
  const affinities = new Set(LIFEPATH_AFFINITIES[genesis.lifepathId]);

  for (const stat of STAT_ORDER) {
    const offset = stats[stat] - jobBaseline[stat];
    let score = 2;
    if (offset >= 3) score += 2;
    else if (offset >= 1) score += 1;
    else if (offset <= -2) score -= 1;
    if (affinities.has(stat)) score += 1;
    if (genesis.aptitudeId === stat) score += 2;
    if (genesis.burdenId === stat) score -= 1;
    potential[stat] = clampPotential(score);
  }

  return { potential };
}

export function isValidGrowthProfile(value: unknown): value is GrowthProfile {
  if (typeof value !== 'object' || value === null) return false;
  const profile = value as Record<string, unknown>;
  if (typeof profile.potential !== 'object' || profile.potential === null) return false;
  const potential = profile.potential as Record<string, unknown>;
  return STAT_ORDER.every((stat) =>
    Number.isInteger(potential[stat]) &&
    (potential[stat] as number) >= 1 &&
    (potential[stat] as number) <= 5
  );
}

/**
 * 每個等級（Lv2～Lv5）展開一點潛在屬性。
 * 使用加權公平分配：高潛力會更常成長，但不會四點全部灌進同一屬性。
 */
export function latentStatBonuses(
  profile: GrowthProfile | undefined,
  level: number,
): Partial<StatBlock> {
  if (!isValidGrowthProfile(profile)) return {};
  const steps = Math.max(0, Math.min(4, Math.floor(level) - 1));
  const result: StatBlock = { str: 0, dex: 0, int: 0, cha: 0, con: 0 };

  for (let step = 0; step < steps; step++) {
    let selected = STAT_ORDER[0];
    let bestScore = -Infinity;
    for (const stat of STAT_ORDER) {
      const fairness = profile.potential[stat] / (result[stat] + 1);
      if (fairness > bestScore) {
        bestScore = fairness;
        selected = stat;
      }
    }
    result[selected] += 1;
  }

  return Object.fromEntries(
    STAT_ORDER.filter((stat) => result[stat] > 0).map((stat) => [stat, result[stat]])
  ) as Partial<StatBlock>;
}

/**
 * 潛力在戰鬥中的衍生成長。所有增益 Lv1 都是 0；Lv5 仍被嚴格限制：
 * - 潛在屬性總和 4
 * - 額外生命最多 5
 * - 額外防禦最多 2
 * - 額外固定傷害最多 3
 */
export function growthCombatBonuses(
  profile: GrowthProfile | undefined,
  level: number,
): GrowthCombatBonuses {
  if (!isValidGrowthProfile(profile) || level <= 1) {
    return { stats: {}, maxHp: 0, defense: 0, damageBonus: 0 };
  }
  const levels = Math.max(0, Math.min(4, Math.floor(level) - 1));
  const offensePotential = Math.max(
    profile.potential.str,
    profile.potential.dex,
    profile.potential.int,
    profile.potential.cha,
  );
  return {
    stats: latentStatBonuses(profile, level),
    maxHp: Math.min(5, Math.floor((levels * profile.potential.con) / 4)),
    defense: Math.min(
      2,
      Math.floor((levels * Math.max(0, profile.potential.dex + profile.potential.con - 2)) / 16),
    ),
    damageBonus: Math.min(3, Math.floor((levels * Math.max(0, offensePotential - 2)) / 4)),
  };
}

export function growthSignature(profile: GrowthProfile | undefined): string {
  if (!isValidGrowthProfile(profile)) return '—';
  return STAT_ORDER.map((stat) => `${stat.toUpperCase()}${profile.potential[stat]}`).join('·');
}
