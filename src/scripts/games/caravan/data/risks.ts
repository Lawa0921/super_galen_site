import type { SaveData } from '../save';
import { companyConstitutionState } from './constitution';
import { governedPayrollBreakdown } from './governance';
import { acceptedOperationalInitiatives } from './operations';
import { COMPANY_OFFICES, companyOfficeState } from './offices';

export type CompanyRiskDimension = 'finance' | 'health' | 'logistics' | 'governance' | 'morale';
export type RiskResponseRouteId = 'expertise' | 'capital' | 'solidarity';

export interface CompanyRiskFactor {
  id: string;
  dimension: CompanyRiskDimension;
  label: string;
  value: number;
  detail: string;
}

export interface CompanyRiskScore {
  dimension: CompanyRiskDimension;
  name: string;
  score: number;
  factors: CompanyRiskFactor[];
}

export interface CompanyRiskLedger {
  cycle: number;
  scores: CompanyRiskScore[];
  highest: CompanyRiskDimension;
  highestScore: number;
  stable: boolean;
  practices: RiskResponseRouteId[];
  warnings: string[];
}

export interface RiskResponseRoute {
  id: RiskResponseRouteId;
  name: string;
  description: string;
  score: number;
  threshold: number;
  goldCost: number;
  inventoryCost: Record<string, number>;
  eligible: boolean;
  blockers: string[];
  practiceAlreadyKnown: boolean;
}

export interface CompanyRiskCrisis {
  cycle: number;
  dimension: CompanyRiskDimension;
  title: string;
  description: string;
  severity: 1 | 2 | 3;
  resolved: boolean;
  receipt: string;
  mandatePenalty: string;
  routes: RiskResponseRoute[];
}

export interface RiskResolution {
  cycle: number;
  dimension: CompanyRiskDimension;
  routeId: RiskResponseRouteId;
  receipt: string;
  learnedPractice: boolean;
}

const DIMENSION_NAMES: Record<CompanyRiskDimension, string> = {
  finance: '財務曝險',
  health: '傷病負荷',
  logistics: '補給韌性',
  governance: '治理失焦',
  morale: '同袍士氣',
};

const CRISES: Record<CompanyRiskDimension, { title: string; description: string; penalty: string }> = {
  finance: {
    title: '現金流斷層',
    description: '固定維護、人事與遠征薪餉已逼近公司可動用現金。',
    penalty: '資本解法成本提高，所有委託現金報酬下降。',
  },
  health: {
    title: '傷病連鎖',
    description: '傷員比例提高，健康成員必須反覆承擔額外工作。',
    penalty: '實地解法門檻提高。',
  },
  logistics: {
    title: '補給斷裂',
    description: '現有乾糧與運輸能力不足以支撐公司的活動規模。',
    penalty: '實地解法需要額外乾糧。',
  },
  governance: {
    title: '權責失焦',
    description: '工程、憲章、職務或營運資料之間出現過多例外與警告。',
    penalty: '專業解法門檻提高。',
  },
  morale: {
    title: '營地離心',
    description: '低羈絆與重複缺陷讓旅伴對風險分配失去信任。',
    penalty: '實地解法門檻提高，聲望報酬下降。',
  },
};

const DIMENSION_ORDER: CompanyRiskDimension[] = ['finance', 'health', 'logistics', 'governance', 'morale'];
const ROUTE_ORDER: RiskResponseRouteId[] = ['expertise', 'capital', 'solidarity'];

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

function activeStance(save: SaveData): 'balanced' | 'lean' | 'ambitious' {
  const active = (['balanced', 'lean', 'ambitious'] as const)
    .filter((id) => save.flags[`operating-stance:${id}`] === true);
  return active.length === 1 ? active[0] : 'balanced';
}

function practiceFlag(routeId: RiskResponseRouteId): string {
  return `company-risk-practice:${routeId}`;
}

function cycleReceipt(cycle: number): string {
  return `company-risk-cycle:${cycle}`;
}

function addFactor(
  factors: CompanyRiskFactor[],
  dimension: CompanyRiskDimension,
  id: string,
  label: string,
  value: number,
  detail: string,
): void {
  if (value !== 0) factors.push({ id, dimension, label, value, detail });
}

function burdenDuplication(save: SaveData): number {
  const counts = new Map<string, number>();
  for (const member of [save.protagonist, ...save.companions]) {
    const burden = member.genesis?.burdenId;
    if (burden) counts.set(burden, (counts.get(burden) ?? 0) + 1);
  }
  return [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

export function companyRiskLedger(save: SaveData): CompanyRiskLedger {
  const cycle = Math.max(0, Math.floor(save.marketSeed));
  const factors: CompanyRiskFactor[] = [];
  const payroll = governedPayrollBreakdown(save);
  const officeState = companyOfficeState(save);
  const constitution = companyConstitutionState(save);
  const initiatives = acceptedOperationalInitiatives(save);
  const stance = activeStance(save);
  const roster = [save.protagonist, ...save.companions];
  const healthyCompanions = save.companions.filter((member) => member.injuredForTrips === 0);

  if (payroll.total > save.gold) {
    addFactor(factors, 'finance', 'payroll-over-cash', '薪餉超過現金', 3, `${payroll.total} G > ${save.gold} G`);
  } else if (payroll.total * 2 > save.gold) {
    addFactor(factors, 'finance', 'payroll-half-cash', '現金緩衝不足', 2, `現金不足兩次薪餉`);
  } else if (payroll.total * 4 > save.gold) {
    addFactor(factors, 'finance', 'payroll-quarter-cash', '現金緩衝偏薄', 1, `現金不足四次薪餉`);
  }
  if (payroll.fixedUpkeep >= 20) {
    addFactor(factors, 'finance', 'heavy-upkeep', '固定維護偏高', 1, `${payroll.fixedUpkeep} G`);
  }
  if (stance === 'ambitious') addFactor(factors, 'finance', 'ambitious-exposure', '擴張營運曝險', 1, '擴張姿態提高固定承諾');
  if (save.flags[practiceFlag('capital')] === true) addFactor(factors, 'finance', 'capital-practice', '風險準備金', -1, '永久財務慣例');

  const injured = roster.filter((member) => member.injuredForTrips > 0).length;
  if (injured > 0) addFactor(factors, 'health', 'injured-members', '現有傷員', Math.min(3, injured), `${injured} 人養傷`);
  if (injured > 0 && injured * 2 >= roster.length) {
    addFactor(factors, 'health', 'injury-concentration', '傷病集中', 1, '至少半數成員受傷');
  }
  if (save.flags[practiceFlag('solidarity')] === true) addFactor(factors, 'health', 'solidarity-health', '互助公約', -1, '永久照護慣例');

  const rations = save.inventory['dried-rations'] ?? 0;
  const fieldNeed = Math.max(1, healthyCompanions.length);
  if (save.companions.length > 0 && rations === 0) {
    addFactor(factors, 'logistics', 'no-rations', '乾糧耗盡', 3, '沒有任何乾糧');
  } else if (rations < fieldNeed) {
    addFactor(factors, 'logistics', 'low-rations', '乾糧不足一輪', 2, `${rations} / ${fieldNeed}`);
  } else if (rations < fieldNeed * 2) {
    addFactor(factors, 'logistics', 'thin-rations', '乾糧緩衝偏薄', 1, `${rations} / ${fieldNeed * 2}`);
  }
  if (save.wagonLevel <= 0 && initiatives.accepted.length >= 2) {
    addFactor(factors, 'logistics', 'asset-mismatch', '工程超過運輸底盤', 1, '多項工程但馬車未升級');
  }
  if (constitution.active === 'exploration-duty') {
    addFactor(factors, 'logistics', 'exploration-obligation', '探索補給義務', 1, '公司憲章要求持續前進');
  }
  if (save.flags[practiceFlag('expertise')] === true) addFactor(factors, 'logistics', 'expertise-logistics', '內控慣例', -1, '永久流程慣例');

  if (officeState.warnings.length > 0) {
    addFactor(factors, 'governance', 'office-warnings', '職務資料例外', Math.min(2, officeState.warnings.length), `${officeState.warnings.length} 項`);
  }
  if (constitution.warnings.length > 0) {
    addFactor(factors, 'governance', 'constitution-warnings', '憲章資料例外', Math.min(2, constitution.warnings.length), `${constitution.warnings.length} 項`);
  }
  if (payroll.warnings.length > 0) {
    addFactor(factors, 'governance', 'operating-warnings', '營運收據例外', Math.min(2, payroll.warnings.length), `${payroll.warnings.length} 項`);
  }
  if (initiatives.warnings.length > 0) {
    addFactor(factors, 'governance', 'initiative-warnings', '工程收據例外', Math.min(2, initiatives.warnings.length), `${initiatives.warnings.length} 項`);
  }
  if (save.flags[practiceFlag('expertise')] === true) addFactor(factors, 'governance', 'expertise-governance', '內控慣例', -1, '永久治理慣例');

  const bondSum = save.companions.reduce((sum, member) => sum + bondTier(member.bond), 0);
  if (save.companions.length >= 2 && bondSum === 0) {
    addFactor(factors, 'morale', 'no-bond', '缺乏共同經歷', 2, '所有旅伴仍無羈絆階級');
  } else if (save.companions.length > 0 && bondSum < save.companions.length) {
    addFactor(factors, 'morale', 'thin-bond', '羈絆覆蓋不足', 1, `階級合計 ${bondSum}`);
  }
  const duplicatedBurden = burdenDuplication(save);
  if (duplicatedBurden > 0) {
    addFactor(factors, 'morale', 'shared-burdens', '重複缺陷互相放大', Math.min(2, duplicatedBurden), `${duplicatedBurden} 個重疊缺陷`);
  }
  if (constitution.active === 'fellowship-dividend') addFactor(factors, 'morale', 'fellowship-clause', '同袍分紅保障', -1, '公司憲章降低離心風險');
  if (save.flags[practiceFlag('solidarity')] === true) addFactor(factors, 'morale', 'solidarity-morale', '互助公約', -1, '永久同袍慣例');

  const scores = DIMENSION_ORDER.map((dimension) => ({
    dimension,
    name: DIMENSION_NAMES[dimension],
    score: clamp(factors.filter((entry) => entry.dimension === dimension).reduce((sum, entry) => sum + entry.value, 0), 0, 6),
    factors: factors.filter((entry) => entry.dimension === dimension),
  }));
  const highestScore = Math.max(...scores.map((entry) => entry.score));
  const tied = scores.filter((entry) => entry.score === highestScore);
  const highest = tied[(cycle + save.createdAt) % tied.length]?.dimension ?? 'finance';
  const practices = ROUTE_ORDER.filter((routeId) => save.flags[practiceFlag(routeId)] === true);
  return {
    cycle,
    scores,
    highest,
    highestScore,
    stable: highestScore < 3,
    practices,
    warnings: [...officeState.warnings, ...constitution.warnings, ...payroll.warnings, ...initiatives.warnings],
  };
}

function expertiseProfile(dimension: CompanyRiskDimension): { stat: 'str' | 'dex' | 'int' | 'cha' | 'con'; skill: string; domain: string } {
  switch (dimension) {
    case 'finance': return { stat: 'cha', skill: 'negotiation', domain: 'trade' };
    case 'health': return { stat: 'con', skill: 'survival', domain: 'fellowship' };
    case 'logistics': return { stat: 'dex', skill: 'scouting', domain: 'frontier' };
    case 'governance': return { stat: 'int', skill: 'lore', domain: 'relic' };
    case 'morale': return { stat: 'cha', skill: 'negotiation', domain: 'fellowship' };
  }
}

function responseRoutes(save: SaveData, dimension: CompanyRiskDimension, severity: 1 | 2 | 3): RiskResponseRoute[] {
  const threshold = 6 + severity * 2;
  const profile = expertiseProfile(dimension);
  const officeState = companyOfficeState(save);
  const matchingOffice = officeState.assignments.filter((entry) => COMPANY_OFFICES[entry.officeId].domain === profile.domain).length;
  const expertiseScore = Math.floor((save.protagonist.stats[profile.stat] ?? 0) / 4) +
    (save.protagonist.skills?.[profile.skill] ?? 0) +
    (save.protagonist.growth?.potential?.[profile.stat] ?? 0) + matchingOffice;
  const capitalScore = Math.floor(save.gold / 60) + Math.max(0, Math.floor(save.wagonLevel)) +
    Math.min(4, acceptedOperationalInitiatives(save).accepted.length) + (activeStance(save) === 'ambitious' ? 2 : 0);
  const healthy = save.companions.filter((member) => member.injuredForTrips === 0);
  const solidarityScore = Math.min(4, healthy.length) +
    Math.min(5, healthy.reduce((sum, member) => sum + bondTier(member.bond), 0)) +
    Math.min(3, healthy.filter((member) => member.genesis && member.growth).length);

  return ROUTE_ORDER.map((routeId) => {
    const score = routeId === 'expertise' ? expertiseScore : routeId === 'capital' ? capitalScore : solidarityScore;
    const goldCost = routeId === 'expertise' ? severity * 5 : routeId === 'capital' ? severity * 25 : 0;
    const inventoryCost = routeId === 'solidarity' ? { 'dried-rations': severity } : {};
    const blockers: string[] = [];
    if (score < threshold) blockers.push(`能力分數 ${score}，需要 ${threshold}`);
    if (save.gold < goldCost) blockers.push(`金幣不足，需要 ${goldCost} G`);
    for (const [itemId, count] of Object.entries(inventoryCost)) {
      if ((save.inventory[itemId] ?? 0) < count) blockers.push(`${itemId} 不足，需要 ${count}`);
    }
    return {
      id: routeId,
      name: routeId === 'expertise' ? '專業整頓' : routeId === 'capital' ? '資本緩衝' : '同袍協議',
      description: routeId === 'expertise'
        ? '以對應屬性、技能、潛力與公司官員修正流程。'
        : routeId === 'capital'
          ? '以現金、馬車與既有工程建立短期緩衝。'
          : '以健康旅伴、身世理解與羈絆重新分配風險。',
      score,
      threshold,
      goldCost,
      inventoryCost,
      eligible: blockers.length === 0,
      blockers,
      practiceAlreadyKnown: save.flags[practiceFlag(routeId)] === true,
    };
  });
}

export function companyRiskCrisis(save: SaveData): CompanyRiskCrisis | null {
  const ledger = companyRiskLedger(save);
  if (ledger.stable) return null;
  const severity = clamp(ledger.highestScore - 2, 1, 3) as 1 | 2 | 3;
  const definition = CRISES[ledger.highest];
  return {
    cycle: ledger.cycle,
    dimension: ledger.highest,
    title: definition.title,
    description: definition.description,
    severity,
    resolved: save.flags[cycleReceipt(ledger.cycle)] === true,
    receipt: cycleReceipt(ledger.cycle),
    mandatePenalty: definition.penalty,
    routes: responseRoutes(save, ledger.highest, severity),
  };
}

/** 原子化解決當期公司危機，並永久記錄首次使用的風險慣例。 */
export function resolveCompanyRisk(save: SaveData, routeId: RiskResponseRouteId): RiskResolution {
  const crisis = companyRiskCrisis(save);
  if (!crisis) throw new Error('目前沒有達到門檻的公司危機。');
  if (crisis.resolved) throw new Error('本市場週期的公司危機已經解決。');
  const route = crisis.routes.find((entry) => entry.id === routeId);
  if (!route) throw new Error(`找不到危機解法「${routeId}」`);
  if (!route.eligible) throw new Error(route.blockers.join('；'));
  const preciseReceipt = `company-risk:${crisis.cycle}:${crisis.dimension}:${routeId}`;
  if (save.flags[preciseReceipt] === true || save.flags[crisis.receipt] === true) throw new Error('這項危機已經結算。');

  save.gold -= route.goldCost;
  for (const [itemId, count] of Object.entries(route.inventoryCost)) {
    save.inventory[itemId] = (save.inventory[itemId] ?? 0) - count;
  }
  if (routeId === 'expertise') save.reputation += 1;
  if (routeId === 'solidarity') {
    for (const companion of save.companions) companion.bond = (companion.bond ?? 0) + 1;
  }
  const learnedPractice = save.flags[practiceFlag(routeId)] !== true;
  save.flags[practiceFlag(routeId)] = true;
  save.flags[crisis.receipt] = true;
  save.flags[preciseReceipt] = true;
  return {
    cycle: crisis.cycle,
    dimension: crisis.dimension,
    routeId,
    receipt: preciseReceipt,
    learnedPractice,
  };
}
