import type { JobId } from './jobs';
import type { StatBlock } from '../types';
import type { SaveData } from '../save';
import {
  STARTING_PROFILE,
  newGame,
  realizeSaveGrowth,
  realizeSaveCareer,
} from '../save';
import {
  XP_TABLE,
  applyLevelUp,
  spendSkillPoint,
} from '../roster';
import type { CharacterGenesis, GenesisTraitId } from './genesis';
import {
  GENESIS_APTITUDES,
  GENESIS_BURDENS,
  GENESIS_LIFEPATHS,
  genesisName,
} from './genesis';
import type { GrowthProfile } from './growth';
import { growthSignature } from './growth';
import type { CareerLevel, CareerPathId } from './careers';
import {
  CAREER_LEVELS,
  CAREER_PATHS,
  careerScorecard,
} from './careers';
import type { CompanyCharterId } from './charters';
import {
  COMPANY_CHARTERS,
  COMPANY_CHARTER_ORDER,
  chooseCompanyCharter,
  companyCharterScorecard,
} from './charters';

export const FORGE_STAT_ORDER: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];
export const FORGE_STAT_NAMES: Record<keyof StatBlock, string> = {
  str: '力量', dex: '敏捷', int: '智力', cha: '魅力', con: '體質',
};

export interface ForgeTrainingChoice {
  allocation: Partial<StatBlock>;
  skillId: CareerPathId | null;
}

export interface GenesisForgeInput {
  job: JobId;
  trait: GenesisTraitId | null;
  statRoll: StatBlock;
  allocation: Partial<StatBlock>;
  training: Record<CareerLevel, ForgeTrainingChoice>;
}

export interface ForgeCharacterSnapshot {
  level: number;
  xp: number;
  stats: StatBlock;
  maxHp: number;
  skills: Record<string, number>;
  skillPoints: number;
}

export interface ForgeCareerProjection {
  level: CareerLevel;
  pathId: CareerPathId;
  pathName: string;
  selectedScore: number;
  scorecard: Record<CareerPathId, number>;
  plannedAllocation: Partial<StatBlock>;
  plannedSkillId: CareerPathId | null;
  skillApplied: boolean;
  snapshot: ForgeCharacterSnapshot;
}

export interface ForgeCharterProjection {
  id: CompanyCharterId;
  name: string;
  scorecard: Record<CompanyCharterId, number>;
}

export interface GenesisForgePreview {
  genesis: CharacterGenesis | null;
  genesisName: string;
  lifepathName: string;
  aptitudeName: string;
  burdenName: string;
  growth: GrowthProfile | null;
  growthSignature: string;
  initial: ForgeCharacterSnapshot & {
    gold: number;
    reputation: number;
    inventory: Record<string, number>;
  };
  projectedCareers: ForgeCareerProjection[];
  projectedCharter: ForgeCharterProjection | null;
  final: ForgeCharacterSnapshot;
  developmentSignature: string;
}

const PRIMARY_STAT: Record<JobId, keyof StatBlock> = {
  swordsman: 'str', ranger: 'dex', mage: 'int', cleric: 'cha',
};
const PRIMARY_SKILL: Record<JobId, CareerPathId> = {
  swordsman: 'martial', ranger: 'scouting', mage: 'lore', cleric: 'negotiation',
};

function cloneStats(stats: StatBlock): StatBlock {
  return { str: stats.str, dex: stats.dex, int: stats.int, cha: stats.cha, con: stats.con };
}

function cloneAllocation(allocation: Partial<StatBlock>): Partial<StatBlock> {
  return Object.fromEntries(
    FORGE_STAT_ORDER
      .filter((stat) => (allocation[stat] ?? 0) !== 0)
      .map((stat) => [stat, allocation[stat] ?? 0]),
  ) as Partial<StatBlock>;
}

function snapshot(save: SaveData): ForgeCharacterSnapshot {
  const record = save.protagonist;
  return {
    level: record.level,
    xp: record.xp,
    stats: cloneStats(record.stats),
    maxHp: record.maxHp,
    skills: { ...(record.skills ?? {}) },
    skillPoints: record.skillPoints ?? 0,
  };
}

function assertExactPoints(allocation: Partial<StatBlock>, expected: number, label: string): void {
  let total = 0;
  for (const stat of FORGE_STAT_ORDER) {
    const value = allocation[stat] ?? 0;
    if (!Number.isInteger(value) || value < 0) throw new Error(`${label}的${FORGE_STAT_NAMES[stat]}必須是非負整數`);
    total += value;
  }
  if (total !== expected) throw new Error(`${label}必須恰好配置 ${expected} 點（目前 ${total} 點）`);
}

export function validateGenesisForgeInput(input: GenesisForgeInput): void {
  if (!(input.job in STARTING_PROFILE)) throw new Error(`未知職業「${String(input.job)}」`);
  assertExactPoints(input.allocation, 3, '創角配置');
  newGame(1, {
    job: input.job,
    trait: input.trait,
    statRoll: cloneStats(input.statRoll),
    allocation: cloneAllocation(input.allocation),
  });
  for (const level of CAREER_LEVELS) {
    const plan = input.training[level];
    if (!plan) throw new Error(`缺少 Lv${level} 訓練計畫`);
    assertExactPoints(plan.allocation, 2, `Lv${level} 屬性配置`);
    if (plan.skillId !== null && !(plan.skillId in CAREER_PATHS)) {
      throw new Error(`Lv${level} 包含未知技能「${String(plan.skillId)}」`);
    }
  }
}

export function defaultGenesisForgeInput(
  job: JobId = 'swordsman',
  trait: GenesisTraitId | null = 'seasoned',
): GenesisForgeInput {
  const primaryStat = PRIMARY_STAT[job];
  const primarySkill = PRIMARY_SKILL[job];
  const training = {} as Record<CareerLevel, ForgeTrainingChoice>;
  for (const level of CAREER_LEVELS) {
    training[level] = { allocation: { [primaryStat]: 2 }, skillId: primarySkill };
  }
  return {
    job,
    trait,
    statRoll: cloneStats(STARTING_PROFILE[job].stats),
    allocation: { [primaryStat]: 3 },
    training,
  };
}

export function createForgedSave(input: GenesisForgeInput, now: number = Date.now()): SaveData {
  validateGenesisForgeInput(input);
  return newGame(now, {
    job: input.job,
    trait: input.trait,
    statRoll: cloneStats(input.statRoll),
    allocation: cloneAllocation(input.allocation),
  });
}

export function previewGenesisForge(input: GenesisForgeInput): GenesisForgePreview {
  validateGenesisForgeInput(input);
  const save = createForgedSave(input, 1);
  const protagonist = save.protagonist;
  const initial = {
    ...snapshot(save),
    gold: save.gold,
    reputation: save.reputation,
    inventory: { ...save.inventory },
  };
  const projectedCareers: ForgeCareerProjection[] = [];

  for (const level of CAREER_LEVELS) {
    const plan = input.training[level];
    protagonist.xp = XP_TABLE[level];
    applyLevelUp(protagonist, cloneAllocation(plan.allocation));
    realizeSaveGrowth(save);
    const scorecard = careerScorecard({
      stats: protagonist.stats,
      skills: protagonist.skills,
      growth: protagonist.growth,
    });
    realizeSaveCareer(save);
    const milestone = protagonist.careerMilestones?.find((entry) => entry.level === level);
    if (!milestone) throw new Error(`Lv${level} 職涯預演未形成里程碑`);

    let skillApplied = false;
    if (plan.skillId !== null && (protagonist.skillPoints ?? 0) > 0) {
      const rank = protagonist.skills?.[plan.skillId] ?? 0;
      if (rank < 5) {
        spendSkillPoint(protagonist, plan.skillId);
        skillApplied = true;
      }
    }

    projectedCareers.push({
      level,
      pathId: milestone.pathId,
      pathName: CAREER_PATHS[milestone.pathId].name,
      selectedScore: milestone.score,
      scorecard: { ...scorecard },
      plannedAllocation: cloneAllocation(plan.allocation),
      plannedSkillId: plan.skillId,
      skillApplied,
      snapshot: snapshot(save),
    });
  }

  let projectedCharter: ForgeCharterProjection | null = null;
  if (protagonist.genesis && protagonist.growth) {
    const charterSave = JSON.parse(JSON.stringify(save)) as SaveData;
    charterSave.reputation = Math.max(10, charterSave.reputation);
    const id = chooseCompanyCharter(charterSave);
    if (id) {
      projectedCharter = {
        id,
        name: COMPANY_CHARTERS[id].name,
        scorecard: { ...companyCharterScorecard(charterSave) },
      };
    }
  }

  const genesis = protagonist.genesis ?? null;
  const growth = protagonist.growth ?? null;
  const careerSequence = projectedCareers.map((entry) => entry.pathId).join('>');
  const charterId = projectedCharter?.id ?? 'none';
  const developmentSignature = [
    genesis ? genesisName(genesis) : 'legacy',
    growthSignature(growth ?? undefined),
    careerSequence,
    charterId,
  ].join('|');

  return {
    genesis,
    genesisName: genesis ? genesisName(genesis) : '未啟用命運矩陣',
    lifepathName: genesis ? GENESIS_LIFEPATHS[genesis.lifepathId].name : '—',
    aptitudeName: genesis ? GENESIS_APTITUDES[genesis.aptitudeId].name : '—',
    burdenName: genesis ? GENESIS_BURDENS[genesis.burdenId].name : '—',
    growth,
    growthSignature: growthSignature(growth ?? undefined),
    initial,
    projectedCareers,
    projectedCharter,
    final: snapshot(save),
    developmentSignature,
  };
}

export function forgeFingerprint(preview: GenesisForgePreview): string {
  return preview.developmentSignature;
}

export function genesisForgeSearchSpace(): { total: string; explanation: string } {
  return {
    total: '206671500000000',
    explanation: '4 職業 × 6 出身 × 6⁵ 擲骰 × 35 創角配置 × 75⁴ 等級訓練',
  };
}

export function sortedCharterScores(
  projection: ForgeCharterProjection,
): Array<{ id: CompanyCharterId; name: string; score: number }> {
  return COMPANY_CHARTER_ORDER
    .map((id) => ({ id, name: COMPANY_CHARTERS[id].name, score: projection.scorecard[id] }))
    .sort((a, b) => b.score - a.score || COMPANY_CHARTER_ORDER.indexOf(a.id) - COMPANY_CHARTER_ORDER.indexOf(b.id));
}
