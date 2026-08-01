import type { CompanionRecord, SaveData } from '../save';
import { companyConstitutionState } from './constitution';
import { COMPANY_OFFICES, companyOfficeState } from './offices';
import { companyRiskCrisis } from './risks';

export type CompanionAspirationId = 'escort' | 'frontier' | 'trade' | 'fellowship' | 'relic';
export type RetentionContractId = 'security' | 'autonomy' | 'partnership';

export interface RetentionFactor {
  id: string;
  label: string;
  value: number;
  detail: string;
}

export interface CompanionRetentionProfile {
  memberId: string;
  memberName: string;
  aspiration: CompanionAspirationId;
  aspirationName: string;
  satisfaction: number;
  factors: RetentionFactor[];
  contract: RetentionContractId | null;
  contractName: string | null;
  dispute: boolean;
  disputeSeverity: 0 | 1 | 2 | 3;
}

export interface CompanyRetentionState {
  profiles: CompanionRetentionProfile[];
  activeContracts: number;
  dispute: CompanionRetentionProfile | null;
  warnings: string[];
}

export interface RetentionContractOffer {
  memberId: string;
  memberName: string;
  contractId: RetentionContractId;
  contractName: string;
  description: string;
  goldCost: number;
  reputationCost: number;
  eligible: boolean;
  blockers: string[];
}

export const ASPIRATION_NAMES: Record<CompanionAspirationId, string> = {
  escort: '武勳與護運',
  frontier: '遠境與探索',
  trade: '財富與交易',
  fellowship: '同袍與安定',
  relic: '知識與遺珍',
};

export const RETENTION_CONTRACTS: Record<RetentionContractId, { name: string; description: string }> = {
  security: {
    name: '安全保障契約',
    description: '提高留任滿意度；每項公司委託固定支付 3 G 保障津貼。',
  },
  autonomy: {
    name: '行動自主契約',
    description: '對應志向領域的實地能力提高，但每次實地解法額外消耗一份乾糧。',
  },
  partnership: {
    name: '利益合夥契約',
    description: '大幅提高留任滿意度並在完成委託後增加羈絆；所有委託現金報酬分成 10%。',
  },
};

const ASPIRATION_ORDER: CompanionAspirationId[] = ['escort', 'frontier', 'trade', 'fellowship', 'relic'];
const CONTRACT_ORDER: RetentionContractId[] = ['security', 'autonomy', 'partnership'];
const MAX_CONTRACTS = 3;

function bondTier(value: number | undefined): number {
  const bond = value ?? 0;
  if (bond >= 9) return 3;
  if (bond >= 5) return 2;
  if (bond >= 2) return 1;
  return 0;
}

function contractFlag(memberId: string, contractId: RetentionContractId): string {
  return `company-retention:${memberId}:${contractId}`;
}

function historyFlag(memberId: string): string {
  return `company-retention-history:${memberId}`;
}

function activeStance(save: SaveData): 'balanced' | 'lean' | 'ambitious' {
  const active = (['balanced', 'lean', 'ambitious'] as const)
    .filter((id) => save.flags[`operating-stance:${id}`] === true);
  return active.length === 1 ? active[0] : 'balanced';
}

function aspirationFromCareer(record: CompanionRecord): CompanionAspirationId | null {
  const latest = [...(record.careerMilestones ?? [])]
    .sort((a, b) => b.level - a.level)[0]?.pathId;
  switch (latest) {
    case 'martial': return 'escort';
    case 'scouting': return 'frontier';
    case 'negotiation': return 'trade';
    case 'survival': return 'fellowship';
    case 'lore': return 'relic';
    default: return null;
  }
}

export function companionAspiration(record: CompanionRecord): CompanionAspirationId {
  const career = aspirationFromCareer(record);
  if (career) return career;
  if (record.trait === 'greedy') return 'trade';
  if (record.trait === 'frugal') return 'fellowship';
  switch (record.genesis?.lifepathId) {
    case 'brawny': return 'escort';
    case 'nimble': return 'frontier';
    case 'charming': return 'trade';
    case 'tough': return 'fellowship';
    case 'learned': return 'relic';
    case 'seasoned': return ASPIRATION_ORDER[record.id.length % ASPIRATION_ORDER.length];
  }
  switch (record.job) {
    case 'swordsman': return 'escort';
    case 'ranger': return 'frontier';
    case 'mage': return 'relic';
    case 'cleric': return 'fellowship';
  }
}

function completedMandateDomain(save: SaveData): CompanionAspirationId | null {
  const cycle = Math.max(0, Math.floor(save.marketSeed));
  const prefix = `company-mandate:${cycle}:`;
  const key = Object.keys(save.flags)
    .find((flag) => flag.startsWith(prefix) && save.flags[flag] === true);
  if (!key) return null;
  const mandateId = key.slice(prefix.length).split(':')[0];
  const domain = mandateId.split('-')[0] as CompanionAspirationId;
  return ASPIRATION_ORDER.includes(domain) ? domain : null;
}

function constitutionModifier(save: SaveData, aspiration: CompanionAspirationId): RetentionFactor | null {
  const clause = companyConstitutionState(save).active;
  if (!clause) return null;
  const aligned: Partial<Record<CompanionAspirationId, string[]>> = {
    escort: ['martial-priority'],
    frontier: ['exploration-duty'],
    trade: ['commercial-supremacy'],
    fellowship: ['fellowship-dividend'],
    relic: ['open-knowledge', 'exploration-duty'],
  };
  const conflicts: Partial<Record<CompanionAspirationId, string[]>> = {
    escort: ['commercial-supremacy'],
    frontier: ['commercial-supremacy'],
    trade: ['martial-priority', 'fellowship-dividend'],
    fellowship: ['commercial-supremacy', 'martial-priority'],
    relic: ['martial-priority'],
  };
  if (aligned[aspiration]?.includes(clause)) {
    return { id: 'constitution-aligned', label: '公司憲章符合志向', value: 2, detail: clause };
  }
  if (conflicts[aspiration]?.includes(clause)) {
    return { id: 'constitution-conflict', label: '公司憲章違背志向', value: aspiration === 'fellowship' ? -2 : -1, detail: clause };
  }
  return null;
}

function preferredStance(aspiration: CompanionAspirationId): 'balanced' | 'lean' | 'ambitious' {
  if (aspiration === 'escort' || aspiration === 'trade') return 'ambitious';
  if (aspiration === 'frontier') return 'lean';
  return 'balanced';
}

function burdenAspiration(record: CompanionRecord): CompanionAspirationId | null {
  switch (record.genesis?.burdenId) {
    case 'str': return 'escort';
    case 'dex': return 'frontier';
    case 'cha': return 'trade';
    case 'con': return 'fellowship';
    case 'int': return 'relic';
    default: return null;
  }
}

function profileFor(
  save: SaveData,
  record: CompanionRecord,
  contract: RetentionContractId | null,
): CompanionRetentionProfile {
  const aspiration = companionAspiration(record);
  const factors: RetentionFactor[] = [
    { id: 'baseline', label: '基本留任意願', value: 5, detail: '所有旅伴的共同基準' },
  ];
  const tier = bondTier(record.bond);
  if (tier > 0) factors.push({ id: 'bond', label: '共同經歷與羈絆', value: tier, detail: `羈絆階級 ${tier}` });
  if (!record.genesis || !record.growth) {
    factors.push({ id: 'unregistered', label: '身世尚未登記', value: -1, detail: '公司尚未真正理解其長期目標' });
  }

  const office = companyOfficeState(save).assignments.find((entry) => entry.memberId === record.id);
  if (office) {
    const domain = COMPANY_OFFICES[office.officeId].domain;
    factors.push({
      id: 'office',
      label: domain === aspiration ? '職務符合志向' : '獲得公司職責',
      value: domain === aspiration ? 2 : 1,
      detail: COMPANY_OFFICES[office.officeId].name,
    });
  }

  const constitution = constitutionModifier(save, aspiration);
  if (constitution) factors.push(constitution);
  const stance = activeStance(save);
  if (stance === preferredStance(aspiration)) {
    factors.push({ id: 'stance', label: '營運姿態符合期待', value: 1, detail: stance });
  }

  const completed = completedMandateDomain(save);
  if (completed) {
    factors.push({
      id: 'mandate',
      label: completed === aspiration ? '公司本期投入其志向' : '公司本期忽略其志向',
      value: completed === aspiration ? 2 : -1,
      detail: ASPIRATION_NAMES[completed],
    });
  }

  if (record.injuredForTrips > 0) {
    factors.push({ id: 'injured', label: '帶傷承擔公司責任', value: -2, detail: `仍需休養 ${record.injuredForTrips} 趟` });
  }
  const crisis = companyRiskCrisis(save);
  if (crisis && !crisis.resolved) {
    if (crisis.dimension === 'morale') factors.push({ id: 'morale-crisis', label: '營地離心', value: -2, detail: crisis.title });
    else if (crisis.dimension === 'health' || crisis.dimension === 'governance') {
      factors.push({ id: 'company-crisis', label: '公司危機壓力', value: -1, detail: crisis.title });
    }
  }
  if (burdenAspiration(record) === aspiration) {
    factors.push({ id: 'burden', label: '命運缺陷阻礙志向', value: -1, detail: record.genesis?.burdenId ?? '' });
  }
  if (record.trait === 'greedy' && aspiration === 'trade') {
    factors.push({ id: 'trait-aligned', label: '個性追求與志向一致', value: 1, detail: 'greedy' });
  }
  if (record.trait === 'frugal' && aspiration === 'fellowship') {
    factors.push({ id: 'trait-aligned', label: '個性追求與志向一致', value: 1, detail: 'frugal' });
  }

  if (contract) {
    const bonus = contract === 'security' ? 3 : contract === 'autonomy' ? 2 : 4;
    factors.push({ id: `contract-${contract}`, label: RETENTION_CONTRACTS[contract].name, value: bonus, detail: '公司已作出長期承諾' });
  }

  const satisfaction = factors.reduce((sum, factor) => sum + factor.value, 0);
  const disputeSeverity = satisfaction <= 0 ? 3 : satisfaction === 1 ? 2 : satisfaction === 2 ? 1 : 0;
  return {
    memberId: record.id,
    memberName: record.name,
    aspiration,
    aspirationName: ASPIRATION_NAMES[aspiration],
    satisfaction,
    factors,
    contract,
    contractName: contract ? RETENTION_CONTRACTS[contract].name : null,
    dispute: disputeSeverity > 0,
    disputeSeverity,
  };
}

function rawContractMap(save: SaveData): { accepted: Map<string, RetentionContractId>; warnings: string[] } {
  const accepted = new Map<string, RetentionContractId>();
  const warnings: string[] = [];
  const validMembers = new Set(save.companions.map((member) => member.id));

  for (const member of save.companions) {
    const active = CONTRACT_ORDER.filter((contractId) => save.flags[contractFlag(member.id, contractId)] === true);
    if (active.length > 1) {
      warnings.push(`${member.name}同時存在多份留任契約，所有契約效果停用。`);
      continue;
    }
    if (active.length === 1) accepted.set(member.id, active[0]);
  }

  for (const key of Object.keys(save.flags)) {
    if (!key.startsWith('company-retention:') || save.flags[key] !== true) continue;
    const body = key.slice('company-retention:'.length);
    const contractId = CONTRACT_ORDER.find((id) => body.endsWith(`:${id}`));
    const memberId = contractId ? body.slice(0, -(contractId.length + 1)) : '';
    if (!contractId || !validMembers.has(memberId)) warnings.push(`留任契約「${key}」找不到有效旅伴或契約類型。`);
  }

  const ordered = [...accepted.entries()].sort(([a], [b]) => a.localeCompare(b));
  if (ordered.length > MAX_CONTRACTS) {
    warnings.push(`有效留任契約超過 ${MAX_CONTRACTS} 份，僅採計旅伴編號排序中的前三份。`);
    accepted.clear();
    for (const [memberId, contractId] of ordered.slice(0, MAX_CONTRACTS)) accepted.set(memberId, contractId);
  }
  return { accepted, warnings };
}

export function companyRetentionState(save: SaveData): CompanyRetentionState {
  const contracts = rawContractMap(save);
  const profiles = save.companions
    .map((member) => profileFor(save, member, contracts.accepted.get(member.id) ?? null))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const dispute = profiles
    .filter((profile) => profile.dispute)
    .sort((a, b) => a.satisfaction - b.satisfaction || a.memberId.localeCompare(b.memberId))[0] ?? null;
  return {
    profiles,
    activeContracts: contracts.accepted.size,
    dispute,
    warnings: contracts.warnings,
  };
}

function hasMatchingCareer(record: CompanionRecord, aspiration: CompanionAspirationId): boolean {
  return aspirationFromCareer(record) === aspiration;
}

export function retentionContractOffer(
  save: SaveData,
  memberId: string,
  contractId: RetentionContractId,
): RetentionContractOffer {
  const contract = RETENTION_CONTRACTS[contractId];
  if (!contract) throw new Error(`未知留任契約「${contractId}」`);
  const member = save.companions.find((entry) => entry.id === memberId);
  if (!member) throw new Error(`找不到旅伴「${memberId}」`);
  const state = companyRetentionState(save);
  const profile = state.profiles.find((entry) => entry.memberId === memberId)!;
  const blockers: string[] = [];
  const current = profile.contract;
  let goldCost = contractId === 'security' ? 15 + member.level * 5 : contractId === 'partnership' ? 25 : 0;
  let reputationCost = contractId === 'autonomy' || contractId === 'partnership' ? 1 : 0;

  if (state.warnings.length > 0) blockers.push(...state.warnings);
  if (current === contractId) blockers.push('目前已採用此契約。');
  if (!current && state.activeContracts >= MAX_CONTRACTS) blockers.push(`公司最多同時維持 ${MAX_CONTRACTS} 份留任契約。`);
  if (current && current !== contractId) {
    goldCost += 20;
    reputationCost += 1;
  } else if (!current && save.flags[historyFlag(memberId)] === true) {
    goldCost += 10;
  }

  if (contractId === 'autonomy') {
    if (!member.genesis || !member.growth) blockers.push('行動自主契約要求先完成身世登記。');
    const office = companyOfficeState(save).assignments.find((entry) => entry.memberId === memberId);
    const officeMatches = office && COMPANY_OFFICES[office.officeId].domain === profile.aspiration;
    if (bondTier(member.bond) < 1) blockers.push('行動自主契約需要羈絆階級至少 1。');
    if (!hasMatchingCareer(member, profile.aspiration) && !officeMatches) blockers.push('需要匹配志向的職涯或公司職務。');
  }
  if (contractId === 'partnership') {
    if (!member.genesis || !member.growth) blockers.push('利益合夥契約要求先完成身世登記。');
    if (bondTier(member.bond) < 2) blockers.push('利益合夥契約需要羈絆階級至少 2。');
  }
  if (save.gold < goldCost) blockers.push(`金幣不足，需要 ${goldCost} G。`);
  if (save.reputation < reputationCost) blockers.push(`聲望不足，需要 ${reputationCost}。`);

  return {
    memberId,
    memberName: member.name,
    contractId,
    contractName: contract.name,
    description: contract.description,
    goldCost,
    reputationCost,
    eligible: blockers.length === 0,
    blockers,
  };
}

/** 原子簽訂或改訂留任契約。 */
export function signRetentionContract(
  save: SaveData,
  memberId: string,
  contractId: RetentionContractId,
): CompanionRetentionProfile {
  const offer = retentionContractOffer(save, memberId, contractId);
  if (!offer.eligible) throw new Error(offer.blockers.join('；'));
  const state = companyRetentionState(save);
  const current = state.profiles.find((profile) => profile.memberId === memberId)?.contract;
  save.gold -= offer.goldCost;
  save.reputation -= offer.reputationCost;
  if (current) save.flags[contractFlag(memberId, current)] = false;
  save.flags[contractFlag(memberId, contractId)] = true;
  save.flags[historyFlag(memberId)] = true;
  return companyRetentionState(save).profiles.find((profile) => profile.memberId === memberId)!;
}

/** 解約需要支付違約補償，避免每個委託前免費切換。 */
export function terminateRetentionContract(save: SaveData, memberId: string): void {
  const state = companyRetentionState(save);
  if (state.warnings.length > 0) throw new Error(state.warnings.join('；'));
  const profile = state.profiles.find((entry) => entry.memberId === memberId);
  if (!profile?.contract) throw new Error('此旅伴目前沒有有效留任契約。');
  const goldCost = 10;
  const reputationCost = 1;
  if (save.gold < goldCost) throw new Error(`解約補償需要 ${goldCost} G。`);
  if (save.reputation < reputationCost) throw new Error(`解約需要 ${reputationCost} 聲望。`);
  save.gold -= goldCost;
  save.reputation -= reputationCost;
  save.flags[contractFlag(memberId, profile.contract)] = false;
  save.flags[historyFlag(memberId)] = true;
}
