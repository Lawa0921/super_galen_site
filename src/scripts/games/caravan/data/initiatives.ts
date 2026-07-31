import type { SaveData } from '../save';
import type { StatBlock } from '../types';
import { effectiveStats } from '../roster';
import type { CareerPathId } from './careers';
import {
  companyCharterMetrics,
  isValidCompanyCharterProgress,
} from './charters';
import type { CompanyCharterId } from './charters';
import { ITEMS } from './items';

export type CompanyInitiativeId =
  | 'escort-network'
  | 'frontier-office'
  | 'trade-consortium'
  | 'fellowship-hall'
  | 'relic-workshop';
export type CompanyInitiativeStage = 1 | 2 | 3;
export type CompanyInitiativeRouteId = 'expertise' | 'capital' | 'field';

export interface CompanyInitiativeDef {
  id: CompanyInitiativeId;
  name: string;
  desc: string;
  primaryStat: keyof StatBlock;
  primarySkill: CareerPathId;
  secondaryStat: keyof StatBlock;
  capitalItem: string;
  fieldItems: [string, string];
  affinity: CompanyCharterId[];
}

export interface InitiativeRequirement {
  id: string;
  label: string;
  current: string;
  target: string;
  met: boolean;
}

export interface InitiativeCost {
  gold?: number;
  skillPoints?: number;
  inventory?: Record<string, number>;
}

export interface InitiativeReward {
  stats?: Partial<StatBlock>;
  maxHp?: number;
  skill?: { id: CareerPathId; amount: number };
  skillPoints?: number;
  gold?: number;
  reputation?: number;
  inventory?: Record<string, number>;
  wagonLevels?: number;
  bondAll?: number;
}

export interface CompanyInitiativeOption {
  projectId: CompanyInitiativeId;
  stage: CompanyInitiativeStage;
  routeId: CompanyInitiativeRouteId;
  routeName: string;
  routeDesc: string;
  requirements: InitiativeRequirement[];
  cost: InitiativeCost;
  reward: InitiativeReward;
  affordable: boolean;
  available: boolean;
  blockingReasons: string[];
}

export interface CompanyInitiativeHistoryEntry {
  stage: CompanyInitiativeStage;
  routeId: CompanyInitiativeRouteId | null;
  routeName: string;
  conflict: boolean;
}

export interface CompanyInitiativeCard {
  id: CompanyInitiativeId;
  name: string;
  desc: string;
  completedStage: number;
  nextStage: CompanyInitiativeStage | null;
  history: CompanyInitiativeHistoryEntry[];
  options: CompanyInitiativeOption[];
}

export interface CompanyInitiativeBoard {
  stageCapacity: Record<CompanyInitiativeStage, { used: number; cap: number }>;
  projects: CompanyInitiativeCard[];
  warnings: string[];
}

const INITIATIVE_STAGE_CAP: Record<CompanyInitiativeStage, number> = { 1: 3, 2: 2, 3: 1 };
const INITIATIVE_ROUTE_ORDER: CompanyInitiativeRouteId[] = ['expertise', 'capital', 'field'];
const STAGES: CompanyInitiativeStage[] = [1, 2, 3];
const ROUTE_NAMES: Record<CompanyInitiativeRouteId, string> = {
  expertise: '專業方案',
  capital: '資本方案',
  field: '實地方案',
};
const ROUTE_DESCS: Record<CompanyInitiativeRouteId, string> = {
  expertise: '消耗自由技能點，以角色能力與潛力建立專業體系。',
  capital: '投入金幣與產業物資，換取商隊基礎設施與組織聲望。',
  field: '消耗遠征補給，依探索、編隊與羈絆成果完成工程。',
};

export const COMPANY_INITIATIVE_ORDER: CompanyInitiativeId[] = [
  'escort-network',
  'frontier-office',
  'trade-consortium',
  'fellowship-hall',
  'relic-workshop',
];

export const COMPANY_INITIATIVES: Record<CompanyInitiativeId, CompanyInitiativeDef> = {
  'escort-network': {
    id: 'escort-network',
    name: '跨鎮護運網',
    desc: '把前排武力、裝備與同袍經驗整理成可複製的護運制度。',
    primaryStat: 'str', primarySkill: 'martial', secondaryStat: 'con',
    capitalItem: 'ore', fieldItems: ['bandage', 'war-tonic'],
    affinity: ['iron-vanguard', 'bound-fellowship'],
  },
  'frontier-office': {
    id: 'frontier-office',
    name: '遠境測繪局',
    desc: '整合斥候、補給、地圖與新地點情報，建立穩定拓荒能力。',
    primaryStat: 'dex', primarySkill: 'scouting', secondaryStat: 'int',
    capitalItem: 'tattered-map', fieldItems: ['torch', 'dried-rations'],
    affinity: ['far-horizon', 'relic-covenant'],
  },
  'trade-consortium': {
    id: 'trade-consortium',
    name: '跨鎮交易聯盟',
    desc: '結合交涉、帳務、馬車與交易貨，建立長期商業網絡。',
    primaryStat: 'cha', primarySkill: 'negotiation', secondaryStat: 'int',
    capitalItem: 'salt', fieldItems: ['spice-pouch', 'salt'],
    affinity: ['ledger-guild', 'far-horizon'],
  },
  'fellowship-hall': {
    id: 'fellowship-hall',
    name: '同袍議事廳',
    desc: '把職涯差異、遠征職務與羈絆轉化為可持續的團隊制度。',
    primaryStat: 'cha', primarySkill: 'survival', secondaryStat: 'con',
    capitalItem: 'bandage', fieldItems: ['dried-rations', 'bandage'],
    affinity: ['bound-fellowship', 'ledger-guild'],
  },
  'relic-workshop': {
    id: 'relic-workshop',
    name: '遺珍研究工坊',
    desc: '以首領戰績、學識、強化與遺珍素材建立危險研究體系。',
    primaryStat: 'int', primarySkill: 'lore', secondaryStat: 'con',
    capitalItem: 'ore', fieldItems: ['ore', 'tattered-map'],
    affinity: ['relic-covenant', 'far-horizon'],
  },
};

function requirement(
  id: string,
  label: string,
  current: number | boolean,
  target: number | boolean,
  met: boolean,
): InitiativeRequirement {
  const show = (value: number | boolean) => typeof value === 'boolean'
    ? (value ? '已完成' : '未完成')
    : String(value);
  return { id, label, current: show(current), target: show(target), met };
}

export function initiativeReceiptKey(
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): string {
  return `company-initiative:${projectId}:${stage}:${routeId}`;
}

export function initiativeRoutesAtStage(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): CompanyInitiativeRouteId[] {
  return INITIATIVE_ROUTE_ORDER.filter((routeId) =>
    save.flags[initiativeReceiptKey(projectId, stage, routeId)] === true
  );
}

export function completedInitiativeRoute(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): CompanyInitiativeRouteId | null {
  return initiativeRoutesAtStage(save, projectId, stage)[0] ?? null;
}

export function initiativeStageUsage(
  save: SaveData,
  stage: CompanyInitiativeStage,
): number {
  return COMPANY_INITIATIVE_ORDER.filter((projectId) =>
    completedInitiativeRoute(save, projectId, stage) !== null
  ).length;
}

export function initiativeCompletedStage(
  save: SaveData,
  projectId: CompanyInitiativeId,
): number {
  let completed = 0;
  for (const stage of STAGES) {
    if (!completedInitiativeRoute(save, projectId, stage)) break;
    completed = stage;
  }
  return completed;
}

export function nextInitiativeStage(
  save: SaveData,
  projectId: CompanyInitiativeId,
): CompanyInitiativeStage | null {
  const next = initiativeCompletedStage(save, projectId) + 1;
  return next >= 1 && next <= 3 ? next as CompanyInitiativeStage : null;
}

function initiativeBaseRequirements(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): InitiativeRequirement[] {
  const project = COMPANY_INITIATIVES[projectId];
  const metrics = companyCharterMetrics(save);
  const charter = isValidCompanyCharterProgress(save.companyCharter) ? save.companyCharter : null;
  const reputationTarget = ({ 1: 10, 2: 25, 3: 45 } as const)[stage];
  const requirements: InitiativeRequirement[] = [
    requirement('charter-tier', '商隊特許章節', charter?.tier ?? 0, stage, !!charter && charter.tier >= stage),
    requirement('career-count', '已形成職涯里程碑', metrics.careerCount, stage, metrics.careerCount >= stage),
    requirement('reputation', '商隊聲望', save.reputation, reputationTarget, save.reputation >= reputationTarget),
  ];

  if (stage === 3) {
    const affinity = !!charter && project.affinity.includes(charter.id);
    requirements.push(requirement(
      'charter-affinity',
      '特許與工程相性，或至少三種職涯形成混合能力',
      affinity || metrics.distinctCareers >= 3,
      true,
      affinity || metrics.distinctCareers >= 3,
    ));
  }

  switch (projectId) {
    case 'escort-network':
      if (stage === 1) requirements.push(
        requirement('active', '健康出征人數', metrics.activeCount, 2, metrics.activeCount >= 2),
        requirement('front', '前排出征人數', metrics.frontCount, 1, metrics.frontCount >= 1),
        requirement('armed', '持武器出征者', metrics.armedCount, 1, metrics.armedCount >= 1),
      );
      if (stage === 2) requirements.push(
        requirement('active', '健康出征人數', metrics.activeCount, 3, metrics.activeCount >= 3),
        requirement('front', '前排出征人數', metrics.frontCount, 2, metrics.frontCount >= 2),
        requirement('escort-careers', '武鬥與生存里程碑合計', metrics.careerCounts.martial + metrics.careerCounts.survival, 2, metrics.careerCounts.martial + metrics.careerCounts.survival >= 2),
        requirement('plus', '出征裝備強化總和', metrics.equipmentPlusTotal, 1, metrics.equipmentPlusTotal >= 1),
      );
      if (stage === 3) requirements.push(
        requirement('active', '滿編健康出征隊', metrics.activeCount, 4, metrics.activeCount >= 4),
        requirement('front', '前排出征人數', metrics.frontCount, 2, metrics.frontCount >= 2),
        requirement('equipment', '出征裝備欄總數', metrics.equippedCount, 6, metrics.equippedCount >= 6),
        requirement('bond', '旅伴羈絆總和', metrics.bondTotal, 4, metrics.bondTotal >= 4),
      );
      break;
    case 'frontier-office':
      if (stage === 1) requirements.push(
        requirement('scout', '斥候里程碑或有效斥候職務', Math.max(metrics.careerCounts.scouting, metrics.hasScout ? 1 : 0), 1, metrics.careerCounts.scouting >= 1 || metrics.hasScout),
        requirement('supplies', '路線補給總數', metrics.routeSupplies, 2, metrics.routeSupplies >= 2),
        requirement('back', '後排出征人數', metrics.backCount, 1, metrics.backCount >= 1),
      );
      if (stage === 2) requirements.push(
        requirement('discovery', '已發現地點', metrics.discoveredCount, 1, metrics.discoveredCount >= 1),
        requirement('back', '後排出征人數', metrics.backCount, 2, metrics.backCount >= 2),
        requirement('frontier-careers', '斥候與學識里程碑合計', metrics.careerCounts.scouting + metrics.careerCounts.lore, 2, metrics.careerCounts.scouting + metrics.careerCounts.lore >= 2),
        requirement('supplies', '路線補給總數', metrics.routeSupplies, 3, metrics.routeSupplies >= 3),
      );
      if (stage === 3) requirements.push(
        requirement('discovery', '已發現地點', metrics.discoveredCount, 2, metrics.discoveredCount >= 2),
        requirement('scout-role', '有效斥候職務', metrics.hasScout, true, metrics.hasScout),
        requirement('back', '後排出征人數', metrics.backCount, 2, metrics.backCount >= 2),
        requirement('bond', '旅伴羈絆總和', metrics.bondTotal, 3, metrics.bondTotal >= 3),
      );
      break;
    case 'trade-consortium': {
      const ledgerCareers = metrics.careerCounts.negotiation + metrics.careerCounts.lore;
      if (stage === 1) requirements.push(
        requirement('ledger-careers', '交涉與學識里程碑合計', ledgerCareers, 1, ledgerCareers >= 1),
        requirement('leadership-role', '有效隊長或軍需官', metrics.hasCaptain || metrics.hasQuartermaster, true, metrics.hasCaptain || metrics.hasQuartermaster),
        requirement('gold', '持有金幣', save.gold, 150, save.gold >= 150),
      );
      if (stage === 2) requirements.push(
        requirement('wagon', '馬車等級', save.wagonLevel, 1, save.wagonLevel >= 1),
        requirement('trade-goods', '交易貨物總數', metrics.tradeGoods, 2, metrics.tradeGoods >= 2),
        requirement('ledger-careers', '交涉與學識里程碑合計', ledgerCareers, 2, ledgerCareers >= 2),
        requirement('gold', '持有金幣', save.gold, 300, save.gold >= 300),
      );
      if (stage === 3) requirements.push(
        requirement('wagon', '馬車等級', save.wagonLevel, 2, save.wagonLevel >= 2),
        requirement('gold', '持有金幣', save.gold, 550, save.gold >= 550),
        requirement('ledger-careers', '交涉與學識里程碑合計', ledgerCareers, 3, ledgerCareers >= 3),
        requirement('roles', '有效遠征職務', metrics.assignedRoles, 2, metrics.assignedRoles >= 2),
      );
      break;
    }
    case 'fellowship-hall':
      if (stage === 1) requirements.push(
        requirement('companions', '旅伴人數', metrics.companionCount, 2, metrics.companionCount >= 2),
        requirement('variety', '不同職涯種類', metrics.distinctCareers, 2, metrics.distinctCareers >= 2),
        requirement('roles', '有效遠征職務', metrics.assignedRoles, 2, metrics.assignedRoles >= 2),
      );
      if (stage === 2) requirements.push(
        requirement('active', '健康出征人數', metrics.activeCount, 3, metrics.activeCount >= 3),
        requirement('bond', '旅伴羈絆總和', metrics.bondTotal, 3, metrics.bondTotal >= 3),
        requirement('careers', '已形成職涯里程碑', metrics.careerCount, 3, metrics.careerCount >= 3),
        requirement('care-role', '有效隊長或醫護', metrics.hasCaptain || metrics.hasMedic, true, metrics.hasCaptain || metrics.hasMedic),
      );
      if (stage === 3) requirements.push(
        requirement('companions', '旅伴人數', metrics.companionCount, 3, metrics.companionCount >= 3),
        requirement('bond', '旅伴羈絆總和', metrics.bondTotal, 7, metrics.bondTotal >= 7),
        requirement('roles', '有效遠征職務', metrics.assignedRoles, 3, metrics.assignedRoles >= 3),
        requirement('variety', '不同職涯種類', metrics.distinctCareers, 3, metrics.distinctCareers >= 3),
      );
      break;
    case 'relic-workshop': {
      const relicCareers = metrics.careerCounts.lore + metrics.careerCounts.survival;
      if (stage === 1) requirements.push(
        requirement('boss', '已擊破首領地城', metrics.bossCount, 1, metrics.bossCount >= 1),
        requirement('relic-careers', '學識與生存里程碑合計', relicCareers, 1, relicCareers >= 1),
        requirement('relic-assets', '遺珍物資至少 2，或強化總和至少 1', Math.max(metrics.relicSupplies, metrics.equipmentPlusTotal), 2, metrics.relicSupplies >= 2 || metrics.equipmentPlusTotal >= 1),
      );
      if (stage === 2) requirements.push(
        requirement('boss', '已擊破首領地城', metrics.bossCount, 1, metrics.bossCount >= 1),
        requirement('relic-careers', '學識與生存里程碑合計', relicCareers, 2, relicCareers >= 2),
        requirement('plus', '出征裝備強化總和', metrics.equipmentPlusTotal, 2, metrics.equipmentPlusTotal >= 2),
      );
      if (stage === 3) requirements.push(
        requirement('boss', '已擊破首領地城', metrics.bossCount, 2, metrics.bossCount >= 2),
        requirement('relic-careers', '學識與生存里程碑合計', relicCareers, 3, relicCareers >= 3),
        requirement('plus', '出征裝備強化總和', metrics.equipmentPlusTotal, 3, metrics.equipmentPlusTotal >= 3),
        requirement('relic-supplies', '遺珍物資總數', metrics.relicSupplies, 4, metrics.relicSupplies >= 4),
      );
      break;
    }
  }

  requirements.push(requirement(
    'stage-capacity',
    `第 ${stage} 階工程名額`,
    initiativeStageUsage(save, stage),
    INITIATIVE_STAGE_CAP[stage],
    initiativeStageUsage(save, stage) < INITIATIVE_STAGE_CAP[stage],
  ));
  return requirements;
}

function expertiseRequirements(
  save: SaveData,
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
): InitiativeRequirement[] {
  const effective = effectiveStats(save.protagonist);
  const statTarget = 11 + stage * 2;
  const skill = save.protagonist.skills?.[project.primarySkill] ?? 0;
  const potential = save.protagonist.growth?.potential?.[project.primaryStat] ?? 0;
  const mastery = Math.max(skill, potential);
  const masteryTarget = stage + 1;
  return [
    requirement('expert-stat', `${project.primaryStat.toUpperCase()} 有效屬性`, effective[project.primaryStat], statTarget, effective[project.primaryStat] >= statTarget),
    requirement('expert-mastery', `${project.primarySkill} 技能 rank 或對應潛力`, mastery, masteryTarget, mastery >= masteryTarget),
  ];
}

function capitalRequirements(
  save: SaveData,
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
  cost: InitiativeCost,
): InitiativeRequirement[] {
  const goldCost = cost.gold ?? 0;
  const itemCost = cost.inventory?.[project.capitalItem] ?? 0;
  const liquidityTarget = goldCost + stage * 40;
  return [
    requirement('capital-liquidity', '支付後仍保留的營運資金門檻', save.gold, liquidityTarget, save.gold >= liquidityTarget),
    requirement('capital-material', `${ITEMS[project.capitalItem]?.name ?? project.capitalItem} 投資`, save.inventory[project.capitalItem] ?? 0, itemCost, (save.inventory[project.capitalItem] ?? 0) >= itemCost),
  ];
}

function fieldRequirements(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): InitiativeRequirement[] {
  const m = companyCharterMetrics(save);
  switch (projectId) {
    case 'escort-network':
      return [requirement('field-bond', '旅伴羈絆總和', m.bondTotal, stage * 2, m.bondTotal >= stage * 2)];
    case 'frontier-office':
      return [requirement('field-discovery', '已發現地點', m.discoveredCount, stage, m.discoveredCount >= stage)];
    case 'trade-consortium':
      return [
        requirement('field-trade', '交易貨物總數', m.tradeGoods, stage + 1, m.tradeGoods >= stage + 1),
        requirement('field-leader', '有效隊長或軍需官', m.hasCaptain || m.hasQuartermaster, true, m.hasCaptain || m.hasQuartermaster),
      ];
    case 'fellowship-hall':
      return [requirement('field-bond', '旅伴羈絆總和', m.bondTotal, stage * 3, m.bondTotal >= stage * 3)];
    case 'relic-workshop':
      return [
        requirement('field-boss', '已擊破首領地城', m.bossCount, stage === 3 ? 2 : 1, m.bossCount >= (stage === 3 ? 2 : 1)),
        requirement('field-relic', '遺珍物資總數', m.relicSupplies, stage + 1, m.relicSupplies >= stage + 1),
      ];
  }
}

function routeCost(
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): InitiativeCost {
  if (routeId === 'expertise') {
    return { skillPoints: stage === 3 ? 2 : 1 };
  }
  if (routeId === 'capital') {
    const gold = ({ 1: 120, 2: 260, 3: 480 } as const)[stage];
    return { gold, inventory: { [project.capitalItem]: stage === 3 ? 2 : 1 } };
  }
  const [first, second] = project.fieldItems;
  return {
    inventory: {
      [first]: stage,
      [second]: stage === 3 ? 2 : 1,
    },
  };
}

function expertiseReward(
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
): InitiativeReward {
  if (stage === 1) return { stats: { [project.primaryStat]: 1 } };
  if (stage === 2) return { skill: { id: project.primarySkill, amount: 1 }, maxHp: project.primarySkill === 'survival' ? 1 : 0 };
  return {
    stats: { [project.primaryStat]: 1 },
    skill: { id: project.primarySkill, amount: 1 },
    skillPoints: 1,
  };
}

function capitalReward(
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
): InitiativeReward {
  switch (projectId) {
    case 'escort-network':
      return stage === 1
        ? { reputation: 2, inventory: { 'war-tonic': 1 } }
        : stage === 2
          ? { reputation: 4, inventory: { 'war-tonic': 2, bandage: 1 } }
          : { reputation: 6, maxHp: 2, inventory: { 'war-tonic': 2, ore: 1 } };
    case 'frontier-office':
      return stage === 1
        ? { reputation: 2, inventory: { torch: 2 } }
        : stage === 2
          ? { reputation: 3, wagonLevels: 1, inventory: { 'tattered-map': 1 } }
          : { reputation: 5, wagonLevels: 1, skillPoints: 1, inventory: { torch: 2 } };
    case 'trade-consortium':
      return stage === 1
        ? { reputation: 2, wagonLevels: 1 }
        : stage === 2
          ? { reputation: 4, wagonLevels: 1, inventory: { 'spice-pouch': 1 } }
          : { reputation: 7, wagonLevels: 1, skillPoints: 1, inventory: { 'spice-pouch': 2 } };
    case 'fellowship-hall':
      return stage === 1
        ? { reputation: 2, bondAll: 1 }
        : stage === 2
          ? { reputation: 3, bondAll: 1, inventory: { bandage: 2 } }
          : { reputation: 5, bondAll: 2, skillPoints: 1, inventory: { bandage: 2 } };
    case 'relic-workshop':
      return stage === 1
        ? { reputation: 2, inventory: { ore: 2 } }
        : stage === 2
          ? { reputation: 4, inventory: { ore: 3, 'tattered-map': 1 } }
          : { reputation: 6, skillPoints: 1, inventory: { ore: 4, 'tattered-map': 1 } };
  }
}

function fieldReward(
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
): InitiativeReward {
  switch (project.id) {
    case 'escort-network':
      return stage === 1
        ? { maxHp: 1, bondAll: 1 }
        : stage === 2
          ? { maxHp: 2, bondAll: 1, inventory: { bandage: 1 } }
          : { stats: { con: 1 }, maxHp: 3, bondAll: 1 };
    case 'frontier-office':
      return stage === 1
        ? { reputation: 1, inventory: { 'tattered-map': 1 } }
        : stage === 2
          ? { stats: { dex: 1 }, bondAll: 1, inventory: { torch: 1 } }
          : { skill: { id: 'scouting', amount: 1 }, skillPoints: 1, reputation: 3 };
    case 'trade-consortium':
      return stage === 1
        ? { gold: 30, reputation: 1 }
        : stage === 2
          ? { gold: 60, reputation: 2, bondAll: 1 }
          : { gold: 100, reputation: 4, stats: { int: 1 } };
    case 'fellowship-hall':
      return stage === 1
        ? { maxHp: 1, bondAll: 1 }
        : stage === 2
          ? { maxHp: 2, bondAll: 2 }
          : { stats: { cha: 1 }, maxHp: 2, bondAll: 2, reputation: 3 };
    case 'relic-workshop':
      return stage === 1
        ? { skill: { id: 'lore', amount: 1 }, inventory: { ore: 1 } }
        : stage === 2
          ? { stats: { int: 1 }, reputation: 2, inventory: { ore: 2 } }
          : { stats: { int: 1 }, skillPoints: 1, reputation: 4, inventory: { ore: 2 } };
  }
}

function routeReward(
  project: CompanyInitiativeDef,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): InitiativeReward {
  if (routeId === 'expertise') return expertiseReward(project, stage);
  if (routeId === 'capital') return capitalReward(project.id, stage);
  return fieldReward(project, stage);
}

function canAfford(save: SaveData, cost: InitiativeCost): boolean {
  if (save.gold < (cost.gold ?? 0)) return false;
  if ((save.protagonist.skillPoints ?? 0) < (cost.skillPoints ?? 0)) return false;
  for (const [itemId, count] of Object.entries(cost.inventory ?? {})) {
    if ((save.inventory[itemId] ?? 0) < count) return false;
  }
  return true;
}

export function buildCompanyInitiativeOption(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): CompanyInitiativeOption {
  const project = COMPANY_INITIATIVES[projectId];
  const cost = routeCost(project, stage, routeId);
  const routeRequirements = routeId === 'expertise'
    ? expertiseRequirements(save, project, stage)
    : routeId === 'capital'
      ? capitalRequirements(save, project, stage, cost)
      : fieldRequirements(save, projectId, stage);
  const requirements = [...initiativeBaseRequirements(save, projectId, stage), ...routeRequirements];
  const affordable = canAfford(save, cost);
  const expectedStage = nextInitiativeStage(save, projectId);
  const blockingReasons: string[] = [];
  if (expectedStage !== stage) blockingReasons.push(expectedStage === null ? '此工程已完成' : `必須先完成第 ${expectedStage} 階`);
  if (!requirements.every((entry) => entry.met)) blockingReasons.push('尚有工程條件未達成');
  if (!affordable) blockingReasons.push('資源不足');
  return {
    projectId,
    stage,
    routeId,
    routeName: ROUTE_NAMES[routeId],
    routeDesc: ROUTE_DESCS[routeId],
    requirements,
    cost,
    reward: routeReward(project, stage, routeId),
    affordable,
    available: blockingReasons.length === 0,
    blockingReasons,
  };
}

function applyCost(save: SaveData, cost: InitiativeCost): void {
  save.gold -= cost.gold ?? 0;
  save.protagonist.skillPoints = (save.protagonist.skillPoints ?? 0) - (cost.skillPoints ?? 0);
  for (const [itemId, count] of Object.entries(cost.inventory ?? {})) {
    const next = (save.inventory[itemId] ?? 0) - count;
    if (next > 0) save.inventory[itemId] = next;
    else delete save.inventory[itemId];
  }
}

function applyReward(save: SaveData, reward: InitiativeReward): void {
  for (const [stat, amount] of Object.entries(reward.stats ?? {}) as Array<[keyof StatBlock, number]>) {
    save.protagonist.stats[stat] += amount;
  }
  if (reward.maxHp) save.protagonist.maxHp += reward.maxHp;
  if (reward.skill) {
    const current = save.protagonist.skills?.[reward.skill.id] ?? 0;
    save.protagonist.skills = {
      ...(save.protagonist.skills ?? {}),
      [reward.skill.id]: Math.min(5, current + reward.skill.amount),
    };
  }
  if (reward.skillPoints) save.protagonist.skillPoints = (save.protagonist.skillPoints ?? 0) + reward.skillPoints;
  if (reward.gold) save.gold += reward.gold;
  if (reward.reputation) save.reputation += reward.reputation;
  for (const [itemId, count] of Object.entries(reward.inventory ?? {})) {
    if (count > 0) save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }
  if (reward.wagonLevels && save.wagonLevel < 6) {
    save.wagonLevel += Math.min(reward.wagonLevels, 6 - save.wagonLevel);
  }
  if (reward.bondAll) {
    for (const companion of save.companions) {
      companion.bond = (companion.bond ?? 0) + reward.bondAll;
    }
  }
}

/**
 * 原子完成一個工程路線：所有條件與成本先驗證，成功後才扣資源、發獎勵並寫收據。
 * 每工程必須循序完成，每階全商隊共用 3／2／1 個名額。
 */
export function completeCompanyInitiative(
  save: SaveData,
  projectId: CompanyInitiativeId,
  stage: CompanyInitiativeStage,
  routeId: CompanyInitiativeRouteId,
): CompanyInitiativeOption {
  if (!(projectId in COMPANY_INITIATIVES)) throw new Error(`未知商隊工程「${projectId}」`);
  if (!STAGES.includes(stage)) throw new Error(`非法工程階段「${stage}」`);
  if (!INITIATIVE_ROUTE_ORDER.includes(routeId)) throw new Error(`未知工程方案「${routeId}」`);
  const existing = initiativeRoutesAtStage(save, projectId, stage);
  if (existing.length > 0) throw new Error(`「${COMPANY_INITIATIVES[projectId].name}」第 ${stage} 階已完成`);
  const option = buildCompanyInitiativeOption(save, projectId, stage, routeId);
  if (!option.available) throw new Error(option.blockingReasons.join('；'));

  applyCost(save, option.cost);
  applyReward(save, option.reward);
  save.flags[initiativeReceiptKey(projectId, stage, routeId)] = true;
  return option;
}

export function buildCompanyInitiativeBoard(save: SaveData): CompanyInitiativeBoard {
  const warnings: string[] = [];
  const projects = COMPANY_INITIATIVE_ORDER.map((projectId) => {
    const history = STAGES.map((stage): CompanyInitiativeHistoryEntry => {
      const routes = initiativeRoutesAtStage(save, projectId, stage);
      if (routes.length > 1) warnings.push(`${COMPANY_INITIATIVES[projectId].name}第 ${stage} 階存在多個完成收據。`);
      const routeId = routes[0] ?? null;
      return {
        stage,
        routeId,
        routeName: routeId ? ROUTE_NAMES[routeId] : '尚未完成',
        conflict: routes.length > 1,
      };
    });
    const nextStage = nextInitiativeStage(save, projectId);
    return {
      id: projectId,
      name: COMPANY_INITIATIVES[projectId].name,
      desc: COMPANY_INITIATIVES[projectId].desc,
      completedStage: initiativeCompletedStage(save, projectId),
      nextStage,
      history,
      options: nextStage
        ? INITIATIVE_ROUTE_ORDER.map((routeId) => buildCompanyInitiativeOption(save, projectId, nextStage, routeId))
        : [],
    };
  });
  const stageCapacity = Object.fromEntries(STAGES.map((stage) => [
    stage,
    { used: initiativeStageUsage(save, stage), cap: INITIATIVE_STAGE_CAP[stage] },
  ])) as Record<CompanyInitiativeStage, { used: number; cap: number }>;
  for (const stage of STAGES) {
    if (stageCapacity[stage].used > stageCapacity[stage].cap) {
      warnings.push(`第 ${stage} 階工程完成數超過上限 ${stageCapacity[stage].cap}。`);
    }
  }
  return { stageCapacity, projects, warnings };
}
