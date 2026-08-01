import type { ExpeditionPlan, SaveData } from '../save';
import type { CompanyInitiativeId } from './initiatives';
import {
  companyPayrollBreakdown,
  type CompanyOperatingEntry,
  type CompanyPayrollBreakdown,
} from './operations';

export type OperatingStanceId = 'lean' | 'balanced' | 'ambitious';

export interface OperatingStanceDef {
  id: OperatingStanceId;
  name: string;
  desc: string;
  maintenanceFactor: number;
  activeFactorDelta: number;
  reserveFactorDelta: number;
  discountFactor: number;
}

export const OPERATING_STANCE_ORDER: OperatingStanceId[] = ['lean', 'balanced', 'ambitious'];
export const OPERATING_STANCES: Record<OperatingStanceId, OperatingStanceDef> = {
  lean: {
    id: 'lean',
    name: '精簡營運',
    desc: '固定維護費減半，但臨時調度使出征薪餉與後備費率提高。適合現金吃緊時避免軟鎖。',
    maintenanceFactor: 0.5,
    activeFactorDelta: 0.05,
    reserveFactorDelta: 0.03,
    discountFactor: 0.75,
  },
  balanced: {
    id: 'balanced',
    name: '標準營運',
    desc: '完整沿用工程原本的維護、效率、忠誠與職涯折扣。',
    maintenanceFactor: 1,
    activeFactorDelta: 0,
    reserveFactorDelta: 0,
    discountFactor: 1,
  },
  ambitious: {
    id: 'ambitious',
    name: '擴張營運',
    desc: '固定維護費提高 25%，換取更低的出征與後備人力成本。適合成熟大型商隊。',
    maintenanceFactor: 1.25,
    activeFactorDelta: -0.04,
    reserveFactorDelta: -0.02,
    discountFactor: 1,
  },
};

export interface GovernanceProjectState {
  projectId: CompanyInitiativeId;
  projectName: string;
  highestStage: number;
  suspended: boolean;
  restartCost: number;
  entries: CompanyOperatingEntry[];
}

export interface GovernedPayrollBreakdown extends CompanyPayrollBreakdown {
  stanceId: OperatingStanceId;
  stanceName: string;
  suspendedProjectIds: CompanyInitiativeId[];
  governanceWarnings: string[];
}

const PROJECT_ORDER: CompanyInitiativeId[] = [
  'escort-network', 'frontier-office', 'trade-consortium', 'fellowship-hall', 'relic-workshop',
];
const STANCE_FLAG_PREFIX = 'operating-stance:';
const SUSPEND_FLAG_PREFIX = 'operating-suspended:';
const STANCE_CHANGE_COST = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isOperatingStanceId(value: unknown): value is OperatingStanceId {
  return value === 'lean' || value === 'balanced' || value === 'ambitious';
}

export function currentOperatingStance(save: SaveData): OperatingStanceId {
  const selected = OPERATING_STANCE_ORDER.filter((id) => save.flags[`${STANCE_FLAG_PREFIX}${id}`] === true);
  return selected.length === 1 ? selected[0] : 'balanced';
}

export function isProjectSuspended(save: SaveData, projectId: CompanyInitiativeId): boolean {
  return save.flags[`${SUSPEND_FLAG_PREFIX}${projectId}`] === true;
}

export function governanceProjects(save: SaveData, candidate?: ExpeditionPlan): GovernanceProjectState[] {
  const base = companyPayrollBreakdown(save, candidate);
  return PROJECT_ORDER
    .map((projectId) => {
      const entries = base.entries.filter((entry) => entry.projectId === projectId);
      const highestStage = entries.reduce((max, entry) => Math.max(max, entry.stage), 0);
      return {
        projectId,
        projectName: entries[0]?.projectName ?? projectId,
        highestStage,
        suspended: isProjectSuspended(save, projectId),
        restartCost: highestStage * 15,
        entries,
      };
    })
    .filter((project) => project.highestStage > 0);
}

/**
 * 在 M29 正式薪餉明細上重算治理結果。標準姿態且無暫停時必須精確等於 M29。
 */
export function governedPayrollBreakdown(
  save: SaveData,
  candidate?: ExpeditionPlan,
): GovernedPayrollBreakdown {
  const base = companyPayrollBreakdown(save, candidate);
  const stanceId = currentOperatingStance(save);
  const stance = OPERATING_STANCES[stanceId];
  const governanceWarnings: string[] = [];
  const stanceFlags = OPERATING_STANCE_ORDER.filter((id) => save.flags[`${STANCE_FLAG_PREFIX}${id}`] === true);
  if (stanceFlags.length > 1) governanceWarnings.push('偵測到多個營運姿態旗標，已安全回退為標準營運。');

  const activeEntries = base.entries.filter((entry) => !isProjectSuspended(save, entry.projectId));
  const suspendedProjectIds = PROJECT_ORDER.filter((projectId) =>
    base.entries.some((entry) => entry.projectId === projectId) && isProjectSuspended(save, projectId),
  );

  let activeWageFactor = 1 + stance.activeFactorDelta;
  let reserveWageFactor = 0.25 + stance.reserveFactorDelta;
  let fixedUpkeep = 0;
  for (const entry of activeEntries) {
    activeWageFactor += entry.activeFactorDelta;
    reserveWageFactor += entry.reserveFactorDelta;
    fixedUpkeep += entry.netMaintenance;
  }
  activeWageFactor = clamp(activeWageFactor, 0.8, 1.15);
  reserveWageFactor = clamp(reserveWageFactor, 0.08, 0.3);
  fixedUpkeep = Math.min(60, Math.ceil(fixedUpkeep * stance.maintenanceFactor));

  const fellowshipActive = activeEntries.some((entry) => entry.projectId === 'fellowship-hall');
  const loyaltyDiscount = fellowshipActive
    ? Math.floor(base.loyaltyDiscount * stance.discountFactor)
    : 0;
  const diversityDiscount = activeEntries.length > 0
    ? Math.floor(base.diversityDiscount * stance.discountFactor)
    : 0;
  const activeAdjusted = Math.ceil(base.activeBase * activeWageFactor);
  const reserveAdjusted = Math.ceil(base.reserveBase * reserveWageFactor * base.quartermasterFactor);
  const gross = activeAdjusted + reserveAdjusted + fixedUpkeep;
  const total = Math.max(0, gross - loyaltyDiscount - diversityDiscount);

  return {
    ...base,
    activeWageFactor,
    reserveWageFactor,
    fixedUpkeep,
    loyaltyDiscount,
    diversityDiscount,
    entries: activeEntries,
    activeAdjusted,
    reserveAdjusted,
    gross,
    total,
    stanceId,
    stanceName: stance.name,
    suspendedProjectIds,
    governanceWarnings,
    warnings: [...base.warnings, ...governanceWarnings],
  };
}

/** 原子切換姿態；第一次從舊檔預設標準切換免費，後續每次需 10 G。 */
export function setOperatingStance(save: SaveData, next: OperatingStanceId): void {
  if (!isOperatingStanceId(next)) throw new Error(`未知營運姿態「${String(next)}」`);
  const current = currentOperatingStance(save);
  if (current === next) return;
  const hasExplicitStance = OPERATING_STANCE_ORDER.some((id) => save.flags[`${STANCE_FLAG_PREFIX}${id}`] === true);
  const cost = hasExplicitStance ? STANCE_CHANGE_COST : 0;
  if (save.gold < cost) throw new Error(`切換營運姿態需要 ${cost} G`);

  save.gold -= cost;
  for (const id of OPERATING_STANCE_ORDER) delete save.flags[`${STANCE_FLAG_PREFIX}${id}`];
  save.flags[`${STANCE_FLAG_PREFIX}${next}`] = true;
}

/** 暫停免費；重新啟動依最高完成階段支付 15/30/45 G，防止出發前免費切換套利。 */
export function setProjectSuspended(
  save: SaveData,
  projectId: CompanyInitiativeId,
  suspended: boolean,
): void {
  if (!PROJECT_ORDER.includes(projectId)) throw new Error(`未知工程「${String(projectId)}」`);
  const project = governanceProjects(save).find((entry) => entry.projectId === projectId);
  if (!project) throw new Error('此工程尚未形成有效營運效果。');
  if (project.suspended === suspended) return;

  const flag = `${SUSPEND_FLAG_PREFIX}${projectId}`;
  if (suspended) {
    save.flags[flag] = true;
    return;
  }
  if (save.gold < project.restartCost) throw new Error(`重新啟動需要 ${project.restartCost} G`);
  save.gold -= project.restartCost;
  delete save.flags[flag];
}
