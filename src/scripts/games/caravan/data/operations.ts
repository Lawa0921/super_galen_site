import type { CompanionRecord, ExpeditionPlan, ExpeditionRole, SaveData } from '../save';
import type {
  CompanyInitiativeId,
  CompanyInitiativeRouteId,
  CompanyInitiativeStage,
} from './initiatives';
import { isValidCompanyCharterProgress } from './charters';

export interface CompanyOperatingEntry {
  projectId: CompanyInitiativeId;
  projectName: string;
  stage: CompanyInitiativeStage;
  routeId: CompanyInitiativeRouteId;
  routeName: string;
  baseMaintenance: number;
  efficiencyCredit: number;
  affinityCredit: number;
  netMaintenance: number;
  activeFactorDelta: number;
  reserveFactorDelta: number;
}

export interface CompanyOperatingProfile {
  activeWageFactor: number;
  reserveWageFactor: number;
  fixedUpkeep: number;
  loyaltyDiscount: number;
  diversityDiscount: number;
  entries: CompanyOperatingEntry[];
  warnings: string[];
}

export interface CompanyPayrollBreakdown extends CompanyOperatingProfile {
  activeBase: number;
  activeAdjusted: number;
  reserveBase: number;
  reserveAdjusted: number;
  quartermasterFactor: number;
  gross: number;
  total: number;
}

interface ProjectMeta {
  name: string;
  primaryStat: 'str' | 'dex' | 'int' | 'cha' | 'con';
  primarySkill: 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';
  affinity: string[];
}

const PROJECT_ORDER: CompanyInitiativeId[] = [
  'escort-network', 'frontier-office', 'trade-consortium', 'fellowship-hall', 'relic-workshop',
];
const PROJECTS: Record<CompanyInitiativeId, ProjectMeta> = {
  'escort-network': { name: '跨鎮護運網', primaryStat: 'str', primarySkill: 'martial', affinity: ['iron-vanguard', 'bound-fellowship'] },
  'frontier-office': { name: '遠境測繪局', primaryStat: 'dex', primarySkill: 'scouting', affinity: ['far-horizon', 'relic-covenant'] },
  'trade-consortium': { name: '跨鎮交易聯盟', primaryStat: 'cha', primarySkill: 'negotiation', affinity: ['ledger-guild', 'far-horizon'] },
  'fellowship-hall': { name: '同袍議事廳', primaryStat: 'cha', primarySkill: 'survival', affinity: ['bound-fellowship', 'ledger-guild'] },
  'relic-workshop': { name: '遺珍研究工坊', primaryStat: 'int', primarySkill: 'lore', affinity: ['relic-covenant', 'far-horizon'] },
};
const ROUTES: CompanyInitiativeRouteId[] = ['expertise', 'capital', 'field'];
const STAGES: CompanyInitiativeStage[] = [1, 2, 3];
const STAGE_CAP: Record<CompanyInitiativeStage, number> = { 1: 3, 2: 2, 3: 1 };
const BASE_MAINTENANCE: Record<CompanyInitiativeStage, number> = { 1: 4, 2: 8, 3: 13 };
const ROUTE_NAMES: Record<CompanyInitiativeRouteId, string> = {
  expertise: '專業方案', capital: '資本方案', field: '實地方案',
};
const RESERVE_WAGE_FACTOR = 0.25;
const QUARTERMASTER_FACTOR = 0.5;
const ROLE_ORDER: ExpeditionRole[] = ['captain', 'scout', 'quartermaster', 'medic'];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function receiptKey(projectId: CompanyInitiativeId, stage: CompanyInitiativeStage, routeId: CompanyInitiativeRouteId): string {
  return `company-initiative:${projectId}:${stage}:${routeId}`;
}

function routesAtStage(save: SaveData, projectId: CompanyInitiativeId, stage: CompanyInitiativeStage): CompanyInitiativeRouteId[] {
  return ROUTES.filter((routeId) => save.flags[receiptKey(projectId, stage, routeId)] === true);
}

interface AcceptedInitiative {
  projectId: CompanyInitiativeId;
  stage: CompanyInitiativeStage;
  routeId: CompanyInitiativeRouteId;
}

/** 僅採用循序、單一路線且未超過 3／2／1 組合上限的工程收據。 */
export function acceptedOperationalInitiatives(save: SaveData): {
  accepted: AcceptedInitiative[];
  warnings: string[];
} {
  const accepted: AcceptedInitiative[] = [];
  const warnings: string[] = [];
  let previous = new Set<CompanyInitiativeId>();
  for (const stage of STAGES) {
    const candidates: AcceptedInitiative[] = [];
    for (const projectId of PROJECT_ORDER) {
      const routes = routesAtStage(save, projectId, stage);
      if (routes.length > 1) {
        warnings.push(`${PROJECTS[projectId].name}第 ${stage} 階存在衝突方案，營運效果不採計。`);
        continue;
      }
      if (routes.length === 0) continue;
      if (stage > 1 && !previous.has(projectId)) {
        warnings.push(`${PROJECTS[projectId].name}第 ${stage} 階缺少前置工程，營運效果不採計。`);
        continue;
      }
      candidates.push({ projectId, stage, routeId: routes[0] });
    }
    if (candidates.length > STAGE_CAP[stage]) {
      warnings.push(`第 ${stage} 階工程收據超過上限 ${STAGE_CAP[stage]}，僅採計固定順序中的前 ${STAGE_CAP[stage]} 項。`);
    }
    const stageAccepted = candidates.slice(0, STAGE_CAP[stage]);
    accepted.push(...stageAccepted);
    previous = new Set(stageAccepted.map((entry) => entry.projectId));
  }
  return { accepted, warnings };
}

function bondTier(bond: number | undefined): number {
  const value = bond ?? 0;
  if (value >= 9) return 3;
  if (value >= 5) return 2;
  if (value >= 2) return 1;
  return 0;
}

function bondTierTotal(save: SaveData): number {
  return save.companions.reduce((sum, companion) => sum + bondTier(companion.bond), 0);
}

function careerDiversity(save: SaveData): number {
  return new Set(
    (save.protagonist.careerMilestones ?? [])
      .map((milestone) => milestone?.pathId)
      .filter((pathId): pathId is string => typeof pathId === 'string')
  ).size;
}

function routeEfficiency(save: SaveData, receipt: AcceptedInitiative, maintenance: number): number {
  const project = PROJECTS[receipt.projectId];
  if (receipt.routeId === 'expertise') {
    const skill = save.protagonist.skills?.[project.primarySkill] ?? 0;
    const potential = save.protagonist.growth?.potential?.[project.primaryStat] ?? 0;
    return Math.min(maintenance, Math.floor((Math.max(0, skill) + Math.max(0, potential)) / 2));
  }
  if (receipt.routeId === 'capital') return Math.min(maintenance, Math.max(0, Math.floor(save.wagonLevel)));
  return Math.min(maintenance, Math.floor(bondTierTotal(save) / 2));
}

function projectAdjustments(projectId: CompanyInitiativeId, stage: CompanyInitiativeStage) {
  switch (projectId) {
    case 'escort-network': return { maintenance: 0, active: -0.01 * stage, reserve: 0 };
    case 'frontier-office': return { maintenance: 0, active: 0.005 * stage, reserve: -0.005 * stage };
    case 'trade-consortium': return { maintenance: stage * 2, active: -0.005 * stage, reserve: 0 };
    case 'fellowship-hall': return { maintenance: 0, active: 0, reserve: -0.01 * stage };
    case 'relic-workshop': return { maintenance: stage, active: 0.01 * stage, reserve: 0 };
  }
}

function routeAdjustments(stage: CompanyInitiativeStage, routeId: CompanyInitiativeRouteId) {
  if (routeId === 'expertise') return { maintenance: 2, active: -0.01 * stage, reserve: 0 };
  if (routeId === 'capital') return { maintenance: 4, active: -0.015 * stage, reserve: -0.01 * stage };
  return { maintenance: 0, active: 0.005 * stage, reserve: -0.015 * stage };
}

export function companyOperatingProfile(save: SaveData): CompanyOperatingProfile {
  const { accepted, warnings } = acceptedOperationalInitiatives(save);
  const charter = isValidCompanyCharterProgress(save.companyCharter) ? save.companyCharter : null;
  const entries: CompanyOperatingEntry[] = [];
  let activeFactor = 1;
  let reserveFactor = RESERVE_WAGE_FACTOR;
  let fixedUpkeep = 0;
  for (const receipt of accepted) {
    const project = PROJECTS[receipt.projectId];
    const projectDelta = projectAdjustments(receipt.projectId, receipt.stage);
    const routeDelta = routeAdjustments(receipt.stage, receipt.routeId);
    const baseMaintenance = BASE_MAINTENANCE[receipt.stage] + projectDelta.maintenance + routeDelta.maintenance;
    const efficiencyCredit = routeEfficiency(save, receipt, baseMaintenance);
    const affinityCredit = charter && project.affinity.includes(charter.id) ? receipt.stage : 0;
    const netMaintenance = Math.max(0, baseMaintenance - efficiencyCredit - affinityCredit);
    const activeFactorDelta = projectDelta.active + routeDelta.active;
    const reserveFactorDelta = projectDelta.reserve + routeDelta.reserve;
    fixedUpkeep += netMaintenance;
    activeFactor += activeFactorDelta;
    reserveFactor += reserveFactorDelta;
    entries.push({
      projectId: receipt.projectId,
      projectName: project.name,
      stage: receipt.stage,
      routeId: receipt.routeId,
      routeName: ROUTE_NAMES[receipt.routeId],
      baseMaintenance,
      efficiencyCredit,
      affinityCredit,
      netMaintenance,
      activeFactorDelta,
      reserveFactorDelta,
    });
  }
  const fellowshipStages = accepted.filter((entry) => entry.projectId === 'fellowship-hall').length;
  return {
    activeWageFactor: clamp(activeFactor, 0.8, 1.15),
    reserveWageFactor: clamp(reserveFactor, 0.08, 0.3),
    fixedUpkeep: Math.min(60, fixedUpkeep),
    loyaltyDiscount: Math.min(12, bondTierTotal(save) * fellowshipStages),
    diversityDiscount: accepted.length > 0 && careerDiversity(save) >= 3 ? 2 : 0,
    entries,
    warnings,
  };
}

function wagePerTrip(record: CompanionRecord): number {
  const traitDelta = record.trait === 'greedy' ? 3 : record.trait === 'frugal' ? -2 : 0;
  return 8 + record.level * 4 + traitDelta;
}

/**
 * 薪餉只需要知道健康出征者與軍需官是否存在；此處以純存檔資料重建同等規則，
 * 避免 economy → operations → roster → save → expedition → economy 的模組循環。
 */
function payrollPlan(save: SaveData, candidate?: ExpeditionPlan): ExpeditionPlan {
  const healthy = [save.protagonist, ...save.companions.filter((member) => member.injuredForTrips === 0)];
  const validIds = new Set(healthy.map((member) => member.id));
  const requested = candidate?.activeIds ?? save.expeditionPlan?.activeIds ?? healthy.map((member) => member.id);
  const desiredSize = candidate || save.expeditionPlan
    ? Math.min(4, Math.max(1, requested.length))
    : Math.min(4, healthy.length);
  const activeIds = [save.protagonist.id];
  for (const id of requested) {
    if (activeIds.length >= 4) break;
    if (id !== save.protagonist.id && validIds.has(id) && !activeIds.includes(id)) activeIds.push(id);
  }
  for (const member of healthy) {
    if (activeIds.length >= desiredSize) break;
    if (!activeIds.includes(member.id)) activeIds.push(member.id);
  }

  const requestedRoles = candidate?.roles ?? save.expeditionPlan?.roles ?? {};
  const roles: Partial<Record<ExpeditionRole, string>> = {};
  const assigned = new Set<string>();
  for (const role of ROLE_ORDER) {
    const holder = requestedRoles[role];
    if (holder && activeIds.includes(holder) && !assigned.has(holder)) {
      roles[role] = holder;
      assigned.add(holder);
    }
  }
  for (const role of ROLE_ORDER) {
    if (roles[role]) continue;
    const holder = activeIds.find((id) => !assigned.has(id));
    if (!holder) continue;
    roles[role] = holder;
    assigned.add(holder);
  }
  return { activeIds, positions: {}, roles };
}

export function companyPayrollBreakdown(save: SaveData, candidate?: ExpeditionPlan): CompanyPayrollBreakdown {
  const plan = payrollPlan(save, candidate);
  const activeIds = new Set(plan.activeIds);
  const activeBase = save.companions
    .filter((companion) => companion.injuredForTrips === 0 && activeIds.has(companion.id))
    .reduce((sum, companion) => sum + wagePerTrip(companion), 0);
  const reserveBase = save.companions
    .filter((companion) => companion.injuredForTrips === 0 && !activeIds.has(companion.id))
    .reduce((sum, companion) => sum + wagePerTrip(companion), 0);
  const profile = companyOperatingProfile(save);
  const quartermasterFactor = plan.roles.quartermaster ? QUARTERMASTER_FACTOR : 1;
  const activeAdjusted = Math.ceil(activeBase * profile.activeWageFactor);
  const reserveAdjusted = Math.ceil(reserveBase * profile.reserveWageFactor * quartermasterFactor);
  const gross = activeAdjusted + reserveAdjusted + profile.fixedUpkeep;
  const total = Math.max(0, gross - profile.loyaltyDiscount - profile.diversityDiscount);
  return {
    ...profile,
    activeBase,
    activeAdjusted,
    reserveBase,
    reserveAdjusted,
    quartermasterFactor,
    gross,
    total,
  };
}
