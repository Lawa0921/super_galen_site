import type { CompanionRecord, SaveData } from '../save';
import type { GenesisAptitudeId, GenesisBurdenId, GenesisTraitId } from './genesis';
import { GENESIS_APTITUDES, GENESIS_BURDENS, GENESIS_LIFEPATHS } from './genesis';
import type { CareerPathId } from './careers';
import { CAREER_PATHS, isValidCareerMilestone } from './careers';

export interface ChemistryMember {
  id: string;
  name: string;
  isProtagonist: boolean;
  registered: boolean;
  lifepathId: GenesisTraitId | null;
  aptitudeId: GenesisAptitudeId | null;
  burdenId: GenesisBurdenId | null;
  latestCareerId: CareerPathId | null;
  bond: number;
  bondTier: number;
}

export interface ChemistryFactor {
  id: string;
  label: string;
  value: number;
  detail: string;
}

export interface TeamChemistryProfile {
  memberIds: string[];
  members: ChemistryMember[];
  factors: ChemistryFactor[];
  rawScore: number;
  score: number;
  grade: '衝突' | '生疏' | '穩定' | '默契' | '同心';
  councilNumber: number;
  councilCost: number;
  bondReward: number;
  eligible: boolean;
  blockingReasons: string[];
  signature: string;
}

export interface CouncilResult {
  councilNumber: number;
  cost: number;
  bondReward: number;
  affectedCompanionIds: string[];
  receipt: string;
}

const COUNCIL_COSTS = [30, 60, 100] as const;
const MAX_COUNCILS = COUNCIL_COSTS.length;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function bondTier(value: number | undefined): number {
  const bond = value ?? 0;
  if (bond >= 9) return 3;
  if (bond >= 5) return 2;
  if (bond >= 2) return 1;
  return 0;
}

function latestCareer(record: CompanionRecord): CareerPathId | null {
  const valid = (record.careerMilestones ?? [])
    .filter(isValidCareerMilestone)
    .sort((a, b) => b.level - a.level);
  return valid[0]?.pathId ?? null;
}

function memberById(save: SaveData, id: string): CompanionRecord | undefined {
  return id === save.protagonist.id
    ? save.protagonist
    : save.companions.find((companion) => companion.id === id);
}

function councilCount(save: SaveData): number {
  let count = 0;
  for (let index = 1; index <= MAX_COUNCILS; index++) {
    if (save.flags[`company-council-slot:${index}`] === true) count++;
  }
  return count;
}

function chemistryMember(save: SaveData, id: string): ChemistryMember {
  const record = memberById(save, id);
  if (!record) throw new Error(`找不到成員「${id}」`);
  const genesis = record.genesis;
  return {
    id: record.id,
    name: record.name,
    isProtagonist: record.id === save.protagonist.id,
    registered: !!genesis && !!record.growth,
    lifepathId: genesis?.lifepathId ?? null,
    aptitudeId: genesis?.aptitudeId ?? null,
    burdenId: genesis?.burdenId ?? null,
    latestCareerId: latestCareer(record),
    bond: record.id === save.protagonist.id ? 0 : (record.bond ?? 0),
    bondTier: record.id === save.protagonist.id ? 0 : bondTier(record.bond),
  };
}

function factor(id: string, label: string, value: number, detail: string): ChemistryFactor {
  return { id, label, value, detail };
}

function grade(score: number): TeamChemistryProfile['grade'] {
  if (score <= -2) return '衝突';
  if (score < 0) return '生疏';
  if (score === 0) return '穩定';
  if (score <= 2) return '默契';
  return '同心';
}

function canonicalIds(memberIds: string[]): string[] {
  return [...new Set(memberIds)].sort((a, b) => a.localeCompare(b));
}

/**
 * M32 隊伍化學反應：只讀分析正式成員資料，不修改存檔。
 * 分數被硬限制在 -2～+3，避免取代屬性、技能、職務與既有羈絆系統。
 */
export function teamChemistryProfile(
  save: SaveData,
  memberIds: string[],
): TeamChemistryProfile {
  const ids = canonicalIds(memberIds);
  const blockingReasons: string[] = [];
  if (ids.length < 2 || ids.length > 4) blockingReasons.push('議事會需要 2～4 名成員。');
  if (!ids.includes(save.protagonist.id)) blockingReasons.push('隊長必須參與議事會。');

  const members: ChemistryMember[] = [];
  for (const id of ids) {
    const record = memberById(save, id);
    if (!record) {
      blockingReasons.push(`成員「${id}」已不存在。`);
      continue;
    }
    if (record.injuredForTrips > 0) blockingReasons.push(`${record.name} 正在養傷，無法參與。`);
    members.push(chemistryMember(save, id));
  }

  const factors: ChemistryFactor[] = [];
  const registered = members.filter((member) => member.registered);
  const distinctLifepaths = new Set(registered.map((member) => member.lifepathId)).size;
  if (distinctLifepaths >= 2) {
    const value = Math.min(2, distinctLifepaths - 1);
    factors.push(factor('lifepath-diversity', '不同道路的見聞', value, `${distinctLifepaths} 種出身互補`));
  }

  const distinctCareers = new Set(
    members.map((member) => member.latestCareerId).filter((id): id is CareerPathId => id !== null),
  ).size;
  if (distinctCareers >= 2) {
    factors.push(factor('career-coverage', '職涯互補', 1, `${distinctCareers} 種成熟職涯`));
  } else if (members.length >= 3 && distinctCareers === 1) {
    factors.push(factor('career-overlap', '方法過度單一', -1, '多人使用相同職涯方法'));
  }

  const aptitudes = new Set(
    registered.map((member) => member.aptitudeId).filter((id): id is GenesisAptitudeId => id !== null),
  );
  if (aptitudes.size >= 3) {
    factors.push(factor('aptitude-coverage', '天賦覆蓋', 1, `${aptitudes.size} 種天賦方向`));
  }

  const burdenCounts = new Map<GenesisBurdenId, number>();
  for (const member of registered) {
    if (member.burdenId) burdenCounts.set(member.burdenId, (burdenCounts.get(member.burdenId) ?? 0) + 1);
  }
  const burdenConflicts = [...burdenCounts.entries()].filter(([, count]) => count >= 2);
  if (burdenConflicts.length > 0) {
    const value = -Math.min(2, burdenConflicts.reduce((sum, [, count]) => sum + count - 1, 0));
    const detail = burdenConflicts
      .map(([id, count]) => `${GENESIS_BURDENS[id].name}×${count}`)
      .join('、');
    factors.push(factor('shared-burdens', '缺陷互相放大', value, detail));
  }

  const bondTierSum = members.reduce((sum, member) => sum + member.bondTier, 0);
  if (bondTierSum >= 3) {
    const value = bondTierSum >= 6 ? 2 : 1;
    factors.push(factor('earned-trust', '共同經歷', value, `羈絆階級合計 ${bondTierSum}`));
  }

  const unregisteredCount = members.filter((member) => !member.registered).length;
  if (unregisteredCount > 0) {
    factors.push(factor('unknown-histories', '彼此尚未理解', -1, `${unregisteredCount} 人尚未完成身世登記`));
  }

  const rawScore = factors.reduce((sum, entry) => sum + entry.value, 0);
  const score = clamp(rawScore, -2, 3);
  const completedCouncils = councilCount(save);
  const councilNumber = completedCouncils + 1;
  const councilCost: number = COUNCIL_COSTS[completedCouncils] ?? 0;
  const bondReward = score >= 3 ? 3 : score >= 1 ? 2 : 1;

  if (completedCouncils >= MAX_COUNCILS) blockingReasons.push('本商隊已完成三次正式議事會。');
  if (score < 0) blockingReasons.push('目前隊伍化學反應為負，請調整成員組合。');
  if (save.gold < councilCost) blockingReasons.push(`金幣不足，需要 ${councilCost} G。`);
  if (members.filter((member) => !member.isProtagonist).length === 0) {
    blockingReasons.push('至少需要一名旅伴參與。');
  }

  const signature = ids.map((id) => {
    const member = members.find((entry) => entry.id === id);
    return [id, member?.lifepathId ?? 'none', member?.latestCareerId ?? 'none'].join(':');
  }).join('|');

  return {
    memberIds: ids,
    members,
    factors,
    rawScore,
    score,
    grade: grade(score),
    councilNumber,
    councilCost,
    bondReward,
    eligible: blockingReasons.length === 0,
    blockingReasons,
    signature,
  };
}

/** 原子執行議事會；成功後只修改金幣、旅伴羈絆與防重收據。 */
export function conductTeamCouncil(
  save: SaveData,
  memberIds: string[],
): CouncilResult {
  const profile = teamChemistryProfile(save, memberIds);
  if (!profile.eligible) throw new Error(profile.blockingReasons.join(' '));

  const slotFlag = `company-council-slot:${profile.councilNumber}`;
  const receipt = `company-council:${profile.councilNumber}:${profile.signature}`;
  if (save.flags[slotFlag] === true || save.flags[receipt] === true) {
    throw new Error('這次議事會已經完成。');
  }

  // 全部驗證完成後才開始寫入。
  const affected = profile.members.filter((member) => !member.isProtagonist);
  save.gold -= profile.councilCost;
  for (const member of affected) {
    const record = save.companions.find((companion) => companion.id === member.id)!;
    record.bond = (record.bond ?? 0) + profile.bondReward;
  }
  save.flags[slotFlag] = true;
  save.flags[receipt] = true;

  return {
    councilNumber: profile.councilNumber,
    cost: profile.councilCost,
    bondReward: profile.bondReward,
    affectedCompanionIds: affected.map((member) => member.id),
    receipt,
  };
}

export function chemistryMemberDescription(member: ChemistryMember): string {
  const parts: string[] = [];
  if (member.lifepathId) parts.push(GENESIS_LIFEPATHS[member.lifepathId].name);
  if (member.aptitudeId) parts.push(GENESIS_APTITUDES[member.aptitudeId].name);
  if (member.burdenId) parts.push(GENESIS_BURDENS[member.burdenId].name);
  if (member.latestCareerId) parts.push(CAREER_PATHS[member.latestCareerId].name);
  return parts.length > 0 ? parts.join('・') : '身世尚未登記';
}
