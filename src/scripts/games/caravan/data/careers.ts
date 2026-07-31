import type { GrowthProfile } from './growth';
import type { StatBlock } from '../types';

export type CareerPathId = 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';
export type CareerLevel = 2 | 3 | 4 | 5;
export type CareerSkillId = CareerPathId;

export interface CareerPathDef {
  id: CareerPathId;
  name: string;
  stat: keyof StatBlock;
  skillId: CareerSkillId;
  desc: string;
}

export interface CareerReward {
  stats?: Partial<StatBlock>;
  maxHp?: number;
  skill?: { id: CareerSkillId; amount: number };
  skillPoints?: number;
  gold?: number;
  reputation?: number;
  inventory?: Record<string, number>;
}

export interface CareerMilestone {
  level: CareerLevel;
  pathId: CareerPathId;
  /** 選路當下的總分，供未來 UI 與存檔稽核；不參與獎勵重算。 */
  score: number;
}

export interface CareerSnapshot {
  stats: StatBlock;
  skills?: Record<string, number>;
  growth?: GrowthProfile;
}

export const CAREER_LEVELS: CareerLevel[] = [2, 3, 4, 5];

/** 平手時採固定順序，讓相同存檔在所有瀏覽器得到相同職涯。 */
export const CAREER_PATH_ORDER: CareerPathId[] = [
  'martial', 'scouting', 'lore', 'negotiation', 'survival',
];

export const CAREER_PATHS: Record<CareerPathId, CareerPathDef> = {
  martial: {
    id: 'martial', name: '武鬥之路', stat: 'str', skillId: 'martial',
    desc: '以力量、武藝與正面戰鬥作為商隊的開路手段。',
  },
  scouting: {
    id: 'scouting', name: '斥候之路', stat: 'dex', skillId: 'scouting',
    desc: '依靠敏捷、偵查與路線判讀避開不必要的損失。',
  },
  lore: {
    id: 'lore', name: '學識之路', stat: 'int', skillId: 'lore',
    desc: '把知識、古籍與軍需推演轉化為遠征優勢。',
  },
  negotiation: {
    id: 'negotiation', name: '交涉之路', stat: 'cha', skillId: 'negotiation',
    desc: '以魅力、名聲與交易手腕擴張商隊影響力。',
  },
  survival: {
    id: 'survival', name: '生存之路', stat: 'con', skillId: 'survival',
    desc: '靠體質、補給與野外經驗撐過漫長而惡劣的旅途。',
  },
};

/**
 * 每級獎勵都跨越不同系統；同一路線走到底也不會壟斷全部資源。
 * Lv2 是開路物資、Lv3 是技能形成、Lv4 是核心屬性、Lv5 是路線冠冕。
 */
const CAREER_REWARDS: Record<CareerLevel, Record<CareerPathId, CareerReward>> = {
  2: {
    martial: { maxHp: 1, inventory: { 'war-tonic': 1 } },
    scouting: { inventory: { torch: 1, 'dried-rations': 2 } },
    lore: { inventory: { 'tattered-map': 1, herb: 1 } },
    negotiation: { gold: 20, inventory: { 'spice-pouch': 1 } },
    survival: { maxHp: 2, inventory: { bandage: 1 } },
  },
  3: {
    martial: { skill: { id: 'martial', amount: 1 }, inventory: { ore: 1 } },
    scouting: { skill: { id: 'scouting', amount: 1 }, inventory: { 'tattered-map': 1 } },
    lore: { skill: { id: 'lore', amount: 1 }, inventory: { herb: 1 } },
    negotiation: { skill: { id: 'negotiation', amount: 1 }, gold: 15 },
    survival: { skill: { id: 'survival', amount: 1 }, inventory: { herb: 1 } },
  },
  4: {
    martial: { stats: { str: 1 }, inventory: { 'war-tonic': 1 } },
    scouting: { stats: { dex: 1 }, inventory: { torch: 1 } },
    lore: { stats: { int: 1 }, skillPoints: 1 },
    negotiation: { stats: { cha: 1 }, reputation: 1 },
    survival: { stats: { con: 1 }, maxHp: 1 },
  },
  5: {
    martial: { stats: { str: 1 }, maxHp: 2, inventory: { ore: 2 } },
    scouting: { stats: { dex: 1 }, skillPoints: 1, inventory: { 'tattered-map': 1 } },
    lore: { stats: { int: 1 }, skillPoints: 1, inventory: { 'tattered-map': 1 } },
    negotiation: { stats: { cha: 1 }, gold: 40, reputation: 2, inventory: { 'spice-pouch': 1 } },
    survival: { stats: { con: 1 }, maxHp: 3, inventory: { bandage: 2 } },
  },
};

export function careerScorecard(snapshot: CareerSnapshot): Record<CareerPathId, number> {
  const scores = {} as Record<CareerPathId, number>;
  for (const pathId of CAREER_PATH_ORDER) {
    const path = CAREER_PATHS[pathId];
    const statScore = snapshot.stats[path.stat];
    const skillScore = snapshot.skills?.[path.skillId] ?? 0;
    const potentialScore = snapshot.growth?.potential?.[path.stat] ?? 0;
    scores[pathId] = statScore + skillScore + potentialScore;
  }
  return scores;
}

/** 玩家可藉由升級配點與技能投資改變下一個里程碑；平手依固定路線順序。 */
export function chooseCareerMilestone(
  snapshot: CareerSnapshot,
  level: CareerLevel,
): CareerMilestone {
  const scores = careerScorecard(snapshot);
  let selected = CAREER_PATH_ORDER[0];
  for (const pathId of CAREER_PATH_ORDER.slice(1)) {
    if (scores[pathId] > scores[selected]) selected = pathId;
  }
  return { level, pathId: selected, score: scores[selected] };
}

export function careerReward(level: CareerLevel, pathId: CareerPathId): CareerReward {
  const reward = CAREER_REWARDS[level][pathId];
  return {
    ...reward,
    stats: reward.stats ? { ...reward.stats } : undefined,
    skill: reward.skill ? { ...reward.skill } : undefined,
    inventory: reward.inventory ? { ...reward.inventory } : undefined,
  };
}

export function isCareerPathId(value: unknown): value is CareerPathId {
  return typeof value === 'string' && value in CAREER_PATHS;
}

export function isCareerLevel(value: unknown): value is CareerLevel {
  return Number.isInteger(value) && CAREER_LEVELS.includes(value as CareerLevel);
}

export function isValidCareerMilestone(value: unknown): value is CareerMilestone {
  if (typeof value !== 'object' || value === null) return false;
  const milestone = value as Record<string, unknown>;
  return isCareerLevel(milestone.level) &&
    isCareerPathId(milestone.pathId) &&
    typeof milestone.score === 'number' &&
    Number.isFinite(milestone.score);
}

export function careerSequenceName(milestones: CareerMilestone[] | undefined): string {
  if (!Array.isArray(milestones) || milestones.length === 0) return '尚未形成';
  return [...milestones]
    .filter(isValidCareerMilestone)
    .sort((a, b) => a.level - b.level)
    .map((milestone) => CAREER_PATHS[milestone.pathId].name)
    .join(' → ');
}
