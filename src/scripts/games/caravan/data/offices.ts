import type { CompanionRecord, SaveData } from '../save';

export type CompanyOfficeId = 'escort-marshal' | 'surveyor' | 'trade-director' | 'fellowship-delegate' | 'relic-curator';
export type OfficeDomain = 'escort' | 'frontier' | 'trade' | 'fellowship' | 'relic';

export interface CompanyOfficeDef {
  id: CompanyOfficeId;
  name: string;
  domain: OfficeDomain;
  stat: 'str' | 'dex' | 'int' | 'cha' | 'con';
  skill: 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';
  career: 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';
  description: string;
}

export interface OfficeAssignment {
  officeId: CompanyOfficeId;
  memberId: string;
  memberName: string;
  qualification: number;
  tier: 1 | 2;
  bondTier: number;
}

export interface CompanyOfficeState {
  assignments: OfficeAssignment[];
  warnings: string[];
}

export interface OfficeCandidate {
  officeId: CompanyOfficeId;
  memberId: string;
  memberName: string;
  qualification: number;
  threshold: number;
  eligible: boolean;
  blockers: string[];
  appointmentCost: number;
}

export const COMPANY_OFFICES: Record<CompanyOfficeId, CompanyOfficeDef> = {
  'escort-marshal': {
    id: 'escort-marshal', name: '護運總管', domain: 'escort', stat: 'str', skill: 'martial', career: 'martial',
    description: '統籌護衛、路障與武裝通行規則。',
  },
  surveyor: {
    id: 'surveyor', name: '測繪官', domain: 'frontier', stat: 'dex', skill: 'scouting', career: 'scouting',
    description: '管理路線情報、前線標記與失落支線。',
  },
  'trade-director': {
    id: 'trade-director', name: '商務監', domain: 'trade', stat: 'cha', skill: 'negotiation', career: 'negotiation',
    description: '負責合約、擔保與跨鎮價格秩序。',
  },
  'fellowship-delegate': {
    id: 'fellowship-delegate', name: '同袍代表', domain: 'fellowship', stat: 'con', skill: 'survival', career: 'survival',
    description: '代表旅伴協調分工、休養與風險分配。',
  },
  'relic-curator': {
    id: 'relic-curator', name: '遺珍學監', domain: 'relic', stat: 'int', skill: 'lore', career: 'lore',
    description: '主持鑑定、檔案與危險知識的保管。',
  },
};

export const COMPANY_OFFICE_ORDER = Object.keys(COMPANY_OFFICES) as CompanyOfficeId[];
const MAX_OFFICES = 3;
const QUALIFICATION_THRESHOLD = 8;

function assignmentPrefix(officeId: CompanyOfficeId): string {
  return `company-office:${officeId}:`;
}

function historyFlag(officeId: CompanyOfficeId): string {
  return `company-office-history:${officeId}`;
}

function bondTier(value: number | undefined): number {
  const bond = value ?? 0;
  if (bond >= 9) return 3;
  if (bond >= 5) return 2;
  if (bond >= 2) return 1;
  return 0;
}

function qualification(record: CompanionRecord, officeId: CompanyOfficeId): number {
  const office = COMPANY_OFFICES[officeId];
  const stat = Math.floor((record.stats[office.stat] ?? 0) / 4);
  const skill = record.skills?.[office.skill] ?? 0;
  const potential = record.growth?.potential?.[office.stat] ?? 0;
  const career = (record.careerMilestones ?? []).some((entry) => entry.pathId === office.career) ? 2 : 0;
  return stat + skill + potential + career + bondTier(record.bond);
}

function activeKeys(save: SaveData, officeId: CompanyOfficeId): string[] {
  const prefix = assignmentPrefix(officeId);
  return Object.keys(save.flags).filter((key) => key.startsWith(prefix) && save.flags[key] === true);
}

export function companyOfficeState(save: SaveData): CompanyOfficeState {
  const assignments: OfficeAssignment[] = [];
  const warnings: string[] = [];
  const usedMembers = new Set<string>();

  for (const officeId of COMPANY_OFFICE_ORDER) {
    const keys = activeKeys(save, officeId);
    if (keys.length > 1) {
      warnings.push(`${COMPANY_OFFICES[officeId].name}同時存在多名任職者，該席位不採計。`);
      continue;
    }
    if (keys.length === 0) continue;
    const memberId = keys[0].slice(assignmentPrefix(officeId).length);
    const record = save.companions.find((member) => member.id === memberId);
    if (!record) {
      warnings.push(`${COMPANY_OFFICES[officeId].name}的任職者已不在商隊，該席位不採計。`);
      continue;
    }
    if (usedMembers.has(memberId)) {
      warnings.push(`${record.name}同時擔任多個公司職務，相關重複席位不採計。`);
      continue;
    }
    if (!record.genesis || !record.growth) {
      warnings.push(`${record.name}尚未完成身世登記，${COMPANY_OFFICES[officeId].name}不採計。`);
      continue;
    }
    const score = qualification(record, officeId);
    if (score < QUALIFICATION_THRESHOLD) {
      warnings.push(`${record.name}已不符合${COMPANY_OFFICES[officeId].name}資格，該席位不採計。`);
      continue;
    }
    usedMembers.add(memberId);
    assignments.push({
      officeId,
      memberId,
      memberName: record.name,
      qualification: score,
      tier: score >= 12 ? 2 : 1,
      bondTier: bondTier(record.bond),
    });
  }
  if (assignments.length > MAX_OFFICES) {
    warnings.push(`有效公司職務超過 ${MAX_OFFICES} 席，僅採計固定順序中的前三席。`);
  }
  return { assignments: assignments.slice(0, MAX_OFFICES), warnings };
}

export function officeCandidate(save: SaveData, officeId: CompanyOfficeId, memberId: string): OfficeCandidate {
  const office = COMPANY_OFFICES[officeId];
  if (!office) throw new Error(`未知公司職務「${officeId}」`);
  const record = save.companions.find((member) => member.id === memberId);
  if (!record) throw new Error(`找不到旅伴「${memberId}」`);
  const state = companyOfficeState(save);
  const blockers: string[] = [];
  const score = qualification(record, officeId);
  if (!record.genesis || !record.growth) blockers.push('旅伴尚未完成身世登記。');
  if (record.injuredForTrips > 0) blockers.push('旅伴正在養傷。');
  if (score < QUALIFICATION_THRESHOLD) blockers.push(`資格分數 ${score}，需要 ${QUALIFICATION_THRESHOLD}。`);
  const current = state.assignments.find((entry) => entry.officeId === officeId);
  if (current?.memberId === memberId) blockers.push('目前已由此旅伴擔任。');
  const otherOffice = state.assignments.find((entry) => entry.memberId === memberId && entry.officeId !== officeId);
  if (otherOffice) blockers.push(`此旅伴已擔任${COMPANY_OFFICES[otherOffice.officeId].name}。`);
  if (!current && state.assignments.length >= MAX_OFFICES) blockers.push(`公司最多設置 ${MAX_OFFICES} 席職務。`);
  const cost = current || save.flags[historyFlag(officeId)] === true ? 25 : state.assignments.length * 10;
  if (save.gold < cost) blockers.push(`金幣不足，需要 ${cost} G。`);
  return {
    officeId,
    memberId,
    memberName: record.name,
    qualification: score,
    threshold: QUALIFICATION_THRESHOLD,
    eligible: blockers.length === 0,
    blockers,
    appointmentCost: cost,
  };
}

/** 原子任命或撤換職務。 */
export function appointCompanyOfficer(save: SaveData, officeId: CompanyOfficeId, memberId: string): OfficeAssignment {
  const candidate = officeCandidate(save, officeId, memberId);
  if (!candidate.eligible) throw new Error(candidate.blockers.join('；'));
  const state = companyOfficeState(save);
  const current = state.assignments.find((entry) => entry.officeId === officeId);
  save.gold -= candidate.appointmentCost;
  if (current) save.flags[`${assignmentPrefix(officeId)}${current.memberId}`] = false;
  save.flags[`${assignmentPrefix(officeId)}${memberId}`] = true;
  save.flags[historyFlag(officeId)] = true;
  const record = save.companions.find((member) => member.id === memberId)!;
  const score = qualification(record, officeId);
  return {
    officeId,
    memberId,
    memberName: record.name,
    qualification: score,
    tier: score >= 12 ? 2 : 1,
    bondTier: bondTier(record.bond),
  };
}

export function dismissCompanyOfficer(save: SaveData, officeId: CompanyOfficeId): void {
  const state = companyOfficeState(save);
  const current = state.assignments.find((entry) => entry.officeId === officeId);
  if (!current) throw new Error(`${COMPANY_OFFICES[officeId].name}目前沒有有效任職者。`);
  save.flags[`${assignmentPrefix(officeId)}${current.memberId}`] = false;
  save.flags[historyFlag(officeId)] = true;
}
