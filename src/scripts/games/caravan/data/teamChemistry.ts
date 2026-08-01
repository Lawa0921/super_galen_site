import type { CompanionRecord, SaveData } from '../save';

type LifepathId = 'seasoned' | 'brawny' | 'nimble' | 'learned' | 'charming' | 'tough';
type StatId = 'str' | 'dex' | 'int' | 'cha' | 'con';
type CareerId = 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';

export interface ChemistryMember {
  id: string;
  name: string;
  isProtagonist: boolean;
  registered: boolean;
  lifepathId: LifepathId | null;
  aptitudeId: StatId | null;
  burdenId: StatId | null;
  latestCareerId: CareerId | null;
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

const COUNCIL_COSTS: readonly number[] = [30, 60, 100];
const MAX_COUNCILS = 3;
const LIFEPATH_NAMES: Record<LifepathId, string> = {
  seasoned: '流浪老手',
  brawny: '苦役鬥士',
  nimble: '邊境跑商',
  learned: '失學書吏',
  charming: '市井掮客',
  tough: '礦難倖存者',
};
const APTITUDE_NAMES: Record<StatId, string> = {
  str: '武勇天賦', dex: '機敏天賦', int: '求知天賦', cha: '領袖天賦', con: '韌性天賦',
};
const BURDEN_NAMES: Record<StatId, string> = {
  str: '人手不足', dex: '舊傷遲滯', int: '帳目生疏', cha: '名聲不佳', con: '體弱多病',
};
const CAREER_NAMES: Record<CareerId, string> = {
  martial: '武鬥之路', scouting: '斥候之路', lore: '學識之路', negotiation: '交涉之路', survival: '生存之路',
};
const CAREER_IDS: readonly CareerId[] = ['martial', 'scouting', 'lore', 'negotiation', 'survival'];

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

function isCareerId(value: unknown): value is CareerId {
  return typeof value === 'string' && CAREER_IDS.includes(value as CareerId);
}

function latestCareer(record: CompanionRecord): CareerId | null {
  const milestones = Array.isArray(record.careerMilestones) ? record.careerMilestones : [];
  let bestLevel = -1;
  let selected: CareerId | null = null;
  for (const milestone of milestones) {
    if (!milestone || !isCareerId(milestone.pathId) || !Number.isFinite(milestone.level)) continue;
    if (milestone.level > bestLevel) {
      bestLevel = milestone.level;
      selected = milestone.pathId;
    }
  }
  return selected;
}

function memberById(save: SaveData, id: string): CompanionRecord | undefined {
  if (id === save.protagonist.id) return save.protagonist;
  return save.companions.find((companion) => companion.id === id);
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

function grade(score: number): TeamChemistryProfile['grade'] {
  if (score <= -2) return '衝突';
  if (score < 0) return '生疏';
  if (score === 0) return '穩定';
  if (score <= 2) return '默契';
  return '同心';
}

function canonicalIds(memberIds: string[]): string[] {
  const ids: string[] = [];
  for (const id of memberIds) {
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.sort((a, b) => a.localeCompare(b));
}

function addFactor(
  factors: ChemistryFactor[],
  id: string,
  label: string,
  value: number,
  detail: string,
): void {
  factors.push({ id, label, value, detail });
}

/**
 * 只讀分析正式成員資料。效果硬限制在 -2～+3，避免取代屬性、技能、職務或日常羈絆。
 */
export function teamChemistryProfile(save: SaveData, memberIds: string[]): TeamChemistryProfile {
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
  const lifepaths: string[] = [];
  const aptitudes: string[] = [];
  const careers: string[] = [];
  const burdenCounts: Record<string, number> = {};
  let unregisteredCount = 0;
  let bondTierSum = 0;

  for (const member of members) {
    if (!member.registered) unregisteredCount++;
    if (member.lifepathId && !lifepaths.includes(member.lifepathId)) lifepaths.push(member.lifepathId);
    if (member.aptitudeId && !aptitudes.includes(member.aptitudeId)) aptitudes.push(member.aptitudeId);
    if (member.latestCareerId && !careers.includes(member.latestCareerId)) careers.push(member.latestCareerId);
    if (member.burdenId) burdenCounts[member.burdenId] = (burdenCounts[member.burdenId] ?? 0) + 1;
    bondTierSum += member.bondTier;
  }

  if (lifepaths.length >= 2) {
    addFactor(factors, 'lifepath-diversity', '不同道路的見聞', Math.min(2, lifepaths.length - 1), `${lifepaths.length} 種出身互補`);
  }
  if (careers.length >= 2) {
    addFactor(factors, 'career-coverage', '職涯互補', 1, `${careers.length} 種成熟職涯`);
  } else if (members.length >= 3 && careers.length === 1) {
    addFactor(factors, 'career-overlap', '方法過度單一', -1, '多人使用相同職涯方法');
  }
  if (aptitudes.length >= 3) {
    addFactor(factors, 'aptitude-coverage', '天賦覆蓋', 1, `${aptitudes.length} 種天賦方向`);
  }

  let burdenPenalty = 0;
  const burdenDetails: string[] = [];
  for (const id of Object.keys(burdenCounts) as StatId[]) {
    const count = burdenCounts[id] ?? 0;
    if (count < 2) continue;
    burdenPenalty += count - 1;
    burdenDetails.push(`${BURDEN_NAMES[id]}×${count}`);
  }
  if (burdenPenalty > 0) {
    addFactor(factors, 'shared-burdens', '缺陷互相放大', -Math.min(2, burdenPenalty), burdenDetails.join('、'));
  }
  if (bondTierSum >= 3) {
    addFactor(factors, 'earned-trust', '共同經歷', bondTierSum >= 6 ? 2 : 1, `羈絆階級合計 ${bondTierSum}`);
  }
  if (unregisteredCount > 0) {
    addFactor(factors, 'unknown-histories', '彼此尚未理解', -1, `${unregisteredCount} 人尚未完成身世登記`);
  }

  let rawScore = 0;
  for (const entry of factors) rawScore += entry.value;
  const score = clamp(rawScore, -2, 3);
  const completedCouncils = councilCount(save);
  const councilNumber = completedCouncils + 1;
  const councilCost = COUNCIL_COSTS[completedCouncils] ?? 0;
  const bondReward = score >= 3 ? 3 : score >= 1 ? 2 : 1;

  if (completedCouncils >= MAX_COUNCILS) blockingReasons.push('本商隊已完成三次正式議事會。');
  if (score < 0) blockingReasons.push('目前隊伍化學反應為負，請調整成員組合。');
  if (save.gold < councilCost) blockingReasons.push(`金幣不足，需要 ${councilCost} G。`);
  if (!members.some((member) => !member.isProtagonist)) blockingReasons.push('至少需要一名旅伴參與。');

  const signatureParts: string[] = [];
  for (const id of ids) {
    const member = members.find((entry) => entry.id === id);
    signatureParts.push([id, member?.lifepathId ?? 'none', member?.latestCareerId ?? 'none'].join(':'));
  }

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
    signature: signatureParts.join('|'),
  };
}

/** 成功後只修改金幣、旅伴羈絆與防重收據。 */
export function conductTeamCouncil(save: SaveData, memberIds: string[]): CouncilResult {
  const profile = teamChemistryProfile(save, memberIds);
  if (!profile.eligible) throw new Error(profile.blockingReasons.join(' '));

  const slotFlag = `company-council-slot:${profile.councilNumber}`;
  const receipt = `company-council:${profile.councilNumber}:${profile.signature}`;
  if (save.flags[slotFlag] === true || save.flags[receipt] === true) throw new Error('這次議事會已經完成。');

  const affected = profile.members.filter((member) => !member.isProtagonist);
  save.gold -= profile.councilCost;
  for (const member of affected) {
    const record = save.companions.find((companion) => companion.id === member.id);
    if (!record) throw new Error(`成員「${member.id}」已不存在。`);
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
  if (member.lifepathId) parts.push(LIFEPATH_NAMES[member.lifepathId]);
  if (member.aptitudeId) parts.push(APTITUDE_NAMES[member.aptitudeId]);
  if (member.burdenId) parts.push(BURDEN_NAMES[member.burdenId]);
  if (member.latestCareerId) parts.push(CAREER_NAMES[member.latestCareerId]);
  return parts.length > 0 ? parts.join('・') : '身世尚未登記';
}
