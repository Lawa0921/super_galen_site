import type { ExpeditionPlan, SaveData } from '../save';
import {
  EXPEDITION_ROLES,
  RESERVE_WAGE_FACTOR,
  bondTier,
  normalizeExpeditionPlan,
  wagePerTrip,
} from '../roster';
import {
  COMPANY_INITIATIVE_ORDER,
  COMPANY_INITIATIVES,
  initiativeRoutesAtStage,
} from './initiatives';
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

const STAGES: CompanyInitiativeStage[] = [1, 2, 3];
const STAGE_CAP: Record<CompanyInitiativeStage, number> = { 1: 3, 2: 2, 3: 1 };
const BASE_MAINTENANCE: Record<CompanyInitiativeStage, number> = { 1: 4, 2: 8, 3: 13 };
const ROUTE_NAMES: Record<CompanyInitiativeRouteId, string> = {
  expertise: '專業方案',
  capital: '資本方案',
  field: '實地方案',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

interface AcceptedInitiative {
  projectId: CompanyInitiativeId;
  stage: CompanyInitiativeStage;
  routeId: CompanyInitiativeRouteId;
}

/**
 * 僅採用循序、單一路線且未超過 3／2／1 組合上限的工程收據。
 * 髒旗標只產生警告，不會轉化成額外營運收益。
 */
export function acceptedOperationalInitiatives(save: SaveData): {
  accepted: AcceptedInitiative[];
  warnings: string[];
} {
  const accepted: AcceptedInitiative[] = [];
  const warnings: string[] = [];
  let previous = new Set<CompanyInitiativeId>();

  for (const stage of STAGES) {
    const candidates: AcceptedInitiative[] = [];
    for (const projectId of COMPANY_INITIATIVE_ORDER) {
      const routes = initiativeRoutesAtStage(save, projectId, stage);
      if (routes.length > 1) {
        warnings.push(`${COMPANY_INITIATIVES[projectId].name}第 ${stage} 階存在衝突方案，營運效果不採計。`);
        continue;
      }
      if (routes.length === 0) continue;
      if (stage > 1 && !previous.has(projectId)) {
        warnings.push(`${COMPANY_INITIATIVES[projectId].name}第 ${stage} 階缺少前置工程，營運效果不採計。`);
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

function routeEfficiency(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
  maintenance: number,
): number {
  const project = COMPANY_INITIATIVES[projectId];
  if (routeId === 'expertise') {
    const skill = save.protagonist.skills?.[project.primarySkill] ?? 0;
    const potential = save.protagonist.growth?.potential?.[project.primaryStat] ?? 0;
    return Math.min(maintenance, Math.floor((Math.max(0, skill) + Math.max(0, potential)) / 2));
  }
  if (routeId === 'capital') {
    return Math.min(maintenance, Math.max(0, Math.floor(save.wagonLevel)));
  }
  return Math.min(maintenance, Math.floor(bondTierTotal(save) / 2));
}

function projectAdjustments(
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): { maintenance: number; active: number; reserve: number } {
  switch (projectId) {
    case 'escort-network':
      return { maintenance: 0, active: -0.01 * stage, reserve: 0 };
    case 'frontier-office':
      return { maintenance: 0, active: 0.005 * stage, reserve: -0.005 * stage };
    case 'trade-consortium':
      return { maintenance: stage * 2, active: -0.005 * stage, reserve: 0 };
    case 'fellowship-hall':
      return { maintenance: 0, active: 0, reserve: -0.01 * stage };
    case 'relic-workshop':
      return { maintenance: stage, active: 0.01 * stage, reserve: 0 };
  }
}

function routeAdjustments(
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): { maintenance: number; active: number; reserve: number } {
  if (routeId === 'expertise') {
    return { maintenance: 2, active: -0.01 * stage, reserve: 0 };
  }
  if (routeId === 'capital') {
    return { maintenance: 4, active: -0.015 * stage, reserve: -0.01 * stage };
  }
  return { maintenance: 0, active: 0.005 * stage, reserve: -0.015 * stage };
}

/** 建立工程投資在每趟遠征中產生的持續薪餉與維護結構。 */
export function companyOperatingProfile(save: SaveData): CompanyOperatingProfile {
  const { accepted, warnings } = acceptedOperationalInitiatives(save);
  const charter = isValidCompanyCharterProgress(save.companyCharter) ? save.companyCharter : null;
  const entries: CompanyOperatingEntry[] = [];
  let activeFactor = 1;
  let reserveFactor = RESERVE_WAGE_FACTOR;
  let fixedUpkeep = 0;

  for (const receipt of accepted) {
    const project = COMPANY_INITIATIVES[receipt.projectId];
    const projectDelta = projectAdjustments(receipt.projectId, receipt.stage);
    const routeDelta = routeAdjustments(receipt.stage, receipt.routeId);
    const baseMaintenance = BASE_MAINTENANCE[receipt.stage] + projectDelta.maintenance + routeDelta.maintenance;
    const efficiencyCredit = routeEfficiency(
      save,
      receipt.projectId,
      receipt.stage,
      receipt.routeId,
      baseMaintenance,
    );
    const affinityCredit = charter && project.affinity.includes(charter.id)
      ? receipt.stage
      : 0;
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
  const loyaltyDiscount = Math.min(12, bondTierTotal(save) * fellowshipStages);
  const diversityDiscount = accepted.length > 0 && careerDiversity(save) >= 3 ? 2 : 0;

  return {
    activeWageFactor: clamp(activeFactor, 0.8, 1.15),
    reserveWageFactor: clamp(reserveFactor, 0.08, 0.3),
    fixedUpkeep: Math.min(60, fixedUpkeep),
    loyaltyDiscount,
    diversityDiscount,
    entries,
    warnings,
  };
}

/**
 * M29 營運薪餉：延續原本出征／後備／軍需官規則，再加入工程維護與制度效率。
 * 無工程收據時結果與 M17 totalWage 完全相同。
 */
export function companyPayrollBreakdown(
  save: SaveData,
  candidate?: ExpeditionPlan,
): CompanyPayrollBreakdown {
  const plan = normalizeExpeditionPlan(save, candidate);
  const activeIds = new Set(plan.activeIds);
  const activeBase = save.companions
    .filter((companion) => companion.injuredForTrips === 0 && activeIds.has(companion.id))
    .reduce((sum, companion) => sum + wagePerTrip(companion), 0);
  const reserveBase = save.companions
    .filter((companion) => companion.injuredForTrips === 0 && !activeIds.has(companion.id))
    .reduce((sum, companion) => sum + wagePerTrip(companion), 0);
  const profile = companyOperatingProfile(save);
  const quartermasterFactor = plan.roles.quartermaster
    ? (EXPEDITION_ROLES.quartermaster.reserveWageFactor ?? 1)
    : 1;
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
