import type { CompanionRecord, SaveData } from '../save';
import { STARTING_PROFILE } from '../save';
import type { StatBlock } from '../types';
import {
  GENESIS_LIFEPATHS,
  genesisName,
  resolveCharacterGenesis,
} from './genesis';
import type { GenesisTraitId } from './genesis';
import {
  creationGrowthSeed,
  deriveGrowthProfile,
  growthSignature,
  realizedGrowthBonuses,
} from './growth';
import type { GrowthProfile } from './growth';
import {
  CAREER_LEVELS,
  CAREER_PATHS,
  chooseCareerMilestone,
} from './careers';
import type { CareerMilestone, CareerPathId } from './careers';

export interface CompanionOriginPreview {
  companionId: string;
  name: string;
  lifepathId: GenesisTraitId;
  lifepathName: string;
  genesisName: string;
  growth: GrowthProfile;
  growthSignature: string;
  careerMilestones: CareerMilestone[];
  careerSequence: string;
  statBonuses: Partial<StatBlock>;
  maxHpBonus: number;
  skillBonuses: Partial<Record<CareerPathId, number>>;
  alreadyRegistered: boolean;
}

const LIFEPATH_ORDER = Object.keys(GENESIS_LIFEPATHS) as GenesisTraitId[];
const GENESIS_TRAITS = new Set<GenesisTraitId>(LIFEPATH_ORDER);
const STAT_ORDER: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function selectedLifepath(record: CompanionRecord): GenesisTraitId {
  if (record.trait && GENESIS_TRAITS.has(record.trait as GenesisTraitId)) {
    return record.trait as GenesisTraitId;
  }
  const seed = `${record.id}|${record.name}|${record.job}|${record.level}`;
  return LIFEPATH_ORDER[stableHash(seed) % LIFEPATH_ORDER.length];
}

function addStats(
  target: Partial<StatBlock>,
  source: Partial<StatBlock>,
): void {
  for (const stat of STAT_ORDER) {
    const value = source[stat] ?? 0;
    if (value !== 0) target[stat] = (target[stat] ?? 0) + value;
  }
}

function originPackage(record: CompanionRecord): CompanionOriginPreview {
  const lifepathId = selectedLifepath(record);
  const resolved = resolveCharacterGenesis(record.stats, lifepathId);
  if (!resolved) throw new Error(`無法為旅伴「${record.name}」解析命運`);
  const baseline = STARTING_PROFILE[record.job].stats;
  const growth = deriveGrowthProfile(record.stats, baseline, resolved.profile);
  const seed = creationGrowthSeed(growth);
  const realized = realizedGrowthBonuses(growth, record.level);
  const statBonuses: Partial<StatBlock> = {};
  addStats(statBonuses, seed.stats);
  addStats(statBonuses, realized.stats);

  const skillBonuses: Partial<Record<CareerPathId, number>> = {};
  for (const [skillId, rank] of Object.entries(resolved.effects.skills) as Array<[CareerPathId, number]>) {
    if (rank > 0) skillBonuses[skillId] = rank;
  }

  const projectedStats = { ...record.stats };
  for (const stat of STAT_ORDER) projectedStats[stat] += statBonuses[stat] ?? 0;
  const projectedSkills = { ...(record.skills ?? {}) };
  for (const [skillId, rank] of Object.entries(skillBonuses) as Array<[CareerPathId, number]>) {
    projectedSkills[skillId] = Math.min(5, (projectedSkills[skillId] ?? 0) + rank);
  }
  const careerMilestones = CAREER_LEVELS
    .filter((level) => level <= Math.max(1, Math.min(5, Math.floor(record.level))))
    .map((level) => chooseCareerMilestone({
      stats: projectedStats,
      skills: projectedSkills,
      growth,
    }, level));

  return {
    companionId: record.id,
    name: record.name,
    lifepathId,
    lifepathName: GENESIS_LIFEPATHS[lifepathId].name,
    genesisName: genesisName(resolved.profile),
    growth,
    growthSignature: growthSignature(growth),
    careerMilestones,
    careerSequence: careerMilestones.length > 0
      ? careerMilestones.map((milestone) => CAREER_PATHS[milestone.pathId].name).join(' → ')
      : '尚未形成',
    statBonuses,
    maxHpBonus: seed.maxHp + realized.maxHp + resolved.effects.maxHpDelta,
    skillBonuses,
    alreadyRegistered: !!record.genesis && !!record.growth,
  };
}

export function previewCompanionOrigin(
  save: SaveData,
  companionId: string,
): CompanionOriginPreview {
  const record = save.companions.find((companion) => companion.id === companionId);
  if (!record) throw new Error(`找不到旅伴「${companionId}」`);
  return originPackage(record);
}

export function previewAllCompanionOrigins(save: SaveData): CompanionOriginPreview[] {
  return save.companions.map((companion) => originPackage(companion));
}

/**
 * 原子登記旅伴身世。只補角色能力層，不補發出身的金幣、物資、聲望或自由技能點。
 */
export function registerCompanionOrigin(
  save: SaveData,
  companionId: string,
): CompanionOriginPreview {
  const record = save.companions.find((companion) => companion.id === companionId);
  if (!record) throw new Error(`找不到旅伴「${companionId}」`);
  if (record.genesis || record.growth) throw new Error(`${record.name} 已完成身世登記`);

  const preview = originPackage(record);
  const resolved = resolveCharacterGenesis(record.stats, preview.lifepathId);
  if (!resolved) throw new Error(`無法為旅伴「${record.name}」建立命運`);

  // 全部資料先在複本計算完成，再一次性寫入，避免半套狀態。
  const nextStats = { ...record.stats };
  for (const stat of STAT_ORDER) nextStats[stat] += preview.statBonuses[stat] ?? 0;
  const nextSkills = { ...(record.skills ?? {}) };
  for (const [skillId, rank] of Object.entries(preview.skillBonuses) as Array<[CareerPathId, number]>) {
    nextSkills[skillId] = Math.min(5, (nextSkills[skillId] ?? 0) + rank);
  }

  record.stats = nextStats;
  record.maxHp = Math.max(8, record.maxHp + preview.maxHpBonus);
  record.skills = nextSkills;
  record.genesis = resolved.profile;
  record.growth = preview.growth;
  record.growthRealizedLevel = Math.max(1, Math.min(5, Math.floor(record.level)));
  record.careerMilestones = preview.careerMilestones.map((milestone) => ({ ...milestone }));
  return { ...preview, alreadyRegistered: true };
}

export function companionOriginFingerprint(preview: CompanionOriginPreview): string {
  return [
    preview.companionId,
    preview.genesisName,
    preview.growthSignature,
    preview.careerMilestones.map((milestone) => `${milestone.level}:${milestone.pathId}`).join(','),
  ].join('|');
}
