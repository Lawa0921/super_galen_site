import type {
  CompanionRecord,
  ExpeditionRole,
  FormationRow,
  SaveData,
} from '../save';
import type { StatBlock } from '../types';
import {
  EXPEDITION_ROLES,
  effectiveStats,
  memberRole,
  normalizeExpeditionPlan,
} from '../roster';
import { JOBS } from './jobs';
import { ITEMS } from './items';
import {
  GENESIS_APTITUDES,
  GENESIS_BURDENS,
  GENESIS_LIFEPATHS,
  genesisName,
  isGenesisTraitId,
} from './genesis';
import {
  CAREER_LEVELS,
  CAREER_PATHS,
  isValidCareerMilestone,
} from './careers';
import type { CareerLevel, CareerPathId } from './careers';
import {
  growthSignature,
  isValidGrowthProfile,
} from './growth';
import {
  COMPANY_CHARTERS,
  COMPANY_CHARTER_ORDER,
  chooseCompanyCharter,
  companyCharterMetrics,
  companyCharterScorecard,
  companyCharterTierEligible,
  isValidCompanyCharterProgress,
} from './charters';
import type {
  CompanyCharterId,
  CompanyCharterMetrics,
} from './charters';

const STAT_ORDER: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];
const STAT_LABELS: Record<keyof StatBlock, string> = {
  str: '力量', dex: '敏捷', int: '智力', cha: '魅力', con: '體質',
};

export type DossierAuditSeverity = 'warning' | 'error';

export interface DossierAuditItem {
  code: string;
  severity: DossierAuditSeverity;
  message: string;
}

export interface DossierStat {
  id: keyof StatBlock;
  name: string;
  base: number;
  effective: number;
  potential: number | null;
}

export interface DossierCareerEntry {
  level: CareerLevel;
  pathId: CareerPathId | null;
  name: string;
  score: number | null;
}

export interface DossierMember {
  id: string;
  name: string;
  job: string;
  level: number;
  row: FormationRow | 'reserve';
  role: ExpeditionRole | null;
  roleName: string | null;
  injuredForTrips: number;
  bond: number;
  equippedSlots: number;
}

export interface DossierCharterScore {
  id: CompanyCharterId;
  name: string;
  desc: string;
  score: number;
  locked: boolean;
}

export interface DossierRequirement {
  id: string;
  label: string;
  current: string;
  target: string;
  met: boolean;
}

export interface DossierCharter {
  currentId: CompanyCharterId | null;
  currentName: string;
  currentTier: number;
  candidateId: CompanyCharterId | null;
  candidateName: string;
  scores: DossierCharterScore[];
  nextTier: 1 | 2 | 3 | null;
  nextTierEligible: boolean;
  requirements: DossierRequirement[];
  metrics: CompanyCharterMetrics;
}

export interface CompanyDossier {
  generatedFromVersion: number;
  protagonist: {
    name: string;
    job: string;
    level: number;
    xp: number;
    maxHp: number;
    genesis: string;
    lifepath: string;
    aptitude: string;
    burden: string;
    growthSignature: string;
    stats: DossierStat[];
    careers: DossierCareerEntry[];
  };
  company: {
    gold: number;
    reputation: number;
    wagonLevel: number;
    inventoryKinds: number;
    companionCount: number;
    activeCount: number;
    members: DossierMember[];
  };
  charter: DossierCharter;
  audit: DossierAuditItem[];
}

function req(
  id: string,
  label: string,
  current: number | boolean,
  target: number | boolean,
  met: boolean,
): DossierRequirement {
  const show = (value: number | boolean) => typeof value === 'boolean' ? (value ? '已完成' : '未完成') : String(value);
  return { id, label, current: show(current), target: show(target), met };
}

/**
 * 與 M26 companyCharterTierEligible 使用相同門檻，拆成玩家可讀的逐項清單。
 * dossier 測試會對大量邊界快照比對 every(met) 與正式 eligibility，防止規則漂移。
 */
export function dossierCharterRequirements(
  save: SaveData,
  id: CompanyCharterId,
  tier: 1 | 2 | 3,
): DossierRequirement[] {
  const m = companyCharterMetrics(save);
  if (tier === 1) {
    return [
      req('reputation', '商隊聲望', save.reputation, 10, save.reputation >= 10),
      req('career', '至少形成一個職涯里程碑', m.careerCount, 1, m.careerCount >= 1),
    ];
  }

  if (tier === 2) {
    switch (id) {
      case 'iron-vanguard':
        return [
          req('reputation', '商隊聲望', save.reputation, 25, save.reputation >= 25),
          req('martial-front', '武鬥里程碑至少 2，或前排至少 2 人', Math.max(m.careerCounts.martial, m.frontCount), 2, m.careerCounts.martial >= 2 || m.frontCount >= 2),
          req('armed-plus', '出征武器至少 2，或裝備強化總和至少 1', Math.max(m.armedCount, m.equipmentPlusTotal), 2, m.armedCount >= 2 || m.equipmentPlusTotal >= 1),
        ];
      case 'far-horizon':
        return [
          req('reputation', '商隊聲望', save.reputation, 25, save.reputation >= 25),
          req('scouting-role', '斥候里程碑至少 2，或已指派斥候', Math.max(m.careerCounts.scouting, m.hasScout ? 2 : 0), 2, m.careerCounts.scouting >= 2 || m.hasScout),
          req('route-supplies', '路線補給總數', m.routeSupplies, 2, m.routeSupplies >= 2),
          req('discovery', '已發現地點', m.discoveredCount, 1, m.discoveredCount >= 1),
        ];
      case 'ledger-guild':
        return [
          req('reputation', '商隊聲望', save.reputation, 25, save.reputation >= 25),
          req('ledger-careers', '交涉與學識里程碑合計', m.careerCounts.negotiation + m.careerCounts.lore, 2, m.careerCounts.negotiation + m.careerCounts.lore >= 2),
          req('quartermaster-wagon', '已指派軍需官，或馬車至少 Lv1', Math.max(m.hasQuartermaster ? 1 : 0, save.wagonLevel), 1, m.hasQuartermaster || save.wagonLevel >= 1),
          req('gold', '持有金幣', save.gold, 250, save.gold >= 250),
        ];
      case 'bound-fellowship':
        return [
          req('reputation', '商隊聲望', save.reputation, 20, save.reputation >= 20),
          req('companions', '旅伴人數', m.companionCount, 2, m.companionCount >= 2),
          req('career-variety', '不同職涯種類', m.distinctCareers, 2, m.distinctCareers >= 2),
          req('bond', '旅伴羈絆總和', m.bondTotal, 2, m.bondTotal >= 2),
          req('roles', '有效遠征職務', m.assignedRoles, 2, m.assignedRoles >= 2),
        ];
      case 'relic-covenant':
        return [
          req('reputation', '商隊聲望', save.reputation, 25, save.reputation >= 25),
          req('boss', '已擊破首領地城', m.bossCount, 1, m.bossCount >= 1),
          req('relic-careers', '學識與生存里程碑合計', m.careerCounts.lore + m.careerCounts.survival, 2, m.careerCounts.lore + m.careerCounts.survival >= 2),
          req('relic-assets', '遺珍物資至少 2，或強化總和至少 1', Math.max(m.relicSupplies, m.equipmentPlusTotal), 2, m.relicSupplies >= 2 || m.equipmentPlusTotal >= 1),
        ];
    }
  }

  switch (id) {
    case 'iron-vanguard':
      return [
        req('reputation', '商隊聲望', save.reputation, 50, save.reputation >= 50),
        req('martial', '武鬥里程碑', m.careerCounts.martial, 3, m.careerCounts.martial >= 3),
        req('front', '前排出征者', m.frontCount, 2, m.frontCount >= 2),
        req('equipment', '出征裝備欄總數', m.equippedCount, 6, m.equippedCount >= 6),
      ];
    case 'far-horizon':
      return [
        req('reputation', '商隊聲望', save.reputation, 50, save.reputation >= 50),
        req('scouting', '斥候里程碑', m.careerCounts.scouting, 3, m.careerCounts.scouting >= 3),
        req('scout-role', '指派有效斥候', m.hasScout, true, m.hasScout),
        req('discovery', '已發現地點', m.discoveredCount, 2, m.discoveredCount >= 2),
      ];
    case 'ledger-guild':
      return [
        req('reputation', '商隊聲望', save.reputation, 50, save.reputation >= 50),
        req('ledger-careers', '交涉與學識里程碑合計', m.careerCounts.negotiation + m.careerCounts.lore, 3, m.careerCounts.negotiation + m.careerCounts.lore >= 3),
        req('wagon', '馬車等級', save.wagonLevel, 2, save.wagonLevel >= 2),
        req('gold', '持有金幣', save.gold, 500, save.gold >= 500),
      ];
    case 'bound-fellowship':
      return [
        req('reputation', '商隊聲望', save.reputation, 45, save.reputation >= 45),
        req('companions', '旅伴人數', m.companionCount, 3, m.companionCount >= 3),
        req('career-variety', '不同職涯種類', m.distinctCareers, 3, m.distinctCareers >= 3),
        req('bond', '旅伴羈絆總和', m.bondTotal, 6, m.bondTotal >= 6),
        req('roles', '有效遠征職務', m.assignedRoles, 3, m.assignedRoles >= 3),
      ];
    case 'relic-covenant':
      return [
        req('reputation', '商隊聲望', save.reputation, 50, save.reputation >= 50),
        req('boss', '已擊破首領地城', m.bossCount, 2, m.bossCount >= 2),
        req('relic-careers', '學識與生存里程碑合計', m.careerCounts.lore + m.careerCounts.survival, 3, m.careerCounts.lore + m.careerCounts.survival >= 3),
        req('plus', '出征裝備強化總和', m.equipmentPlusTotal, 2, m.equipmentPlusTotal >= 2),
      ];
  }
}

function equippedSlots(record: CompanionRecord): number {
  return Object.values(record.equipment).filter((id) => typeof id === 'string' && id.length > 0).length;
}

function buildAudit(save: SaveData): DossierAuditItem[] {
  const audit: DossierAuditItem[] = [];
  const protagonist = save.protagonist as CompanionRecord;
  const genesis = protagonist.genesis;
  if (genesis) {
    if (!isGenesisTraitId(genesis.lifepathId) || !(genesis.aptitudeId in GENESIS_APTITUDES) || !(genesis.burdenId in GENESIS_BURDENS)) {
      audit.push({ code: 'invalid-genesis', severity: 'error', message: '角色命運資料包含不存在的出身、天賦或缺陷。' });
    }
    if (!protagonist.growth) {
      audit.push({ code: 'missing-growth', severity: 'error', message: '角色已有命運，但缺少五維潛力資料。' });
    }
  }
  if (protagonist.growth && !isValidGrowthProfile(protagonist.growth)) {
    audit.push({ code: 'invalid-growth', severity: 'error', message: '五維潛力超出 1～5 或缺少欄位，遊戲不應給予成長加成。' });
  }
  if (protagonist.growth && (!Number.isInteger(protagonist.growthRealizedLevel) || (protagonist.growthRealizedLevel ?? 0) < 1 || (protagonist.growthRealizedLevel ?? 0) > 5)) {
    audit.push({ code: 'growth-level', severity: 'warning', message: '潛力實現等級標記無效，下一次保存會依目前等級重新整理。' });
  }

  const milestones = Array.isArray(protagonist.careerMilestones) ? protagonist.careerMilestones : [];
  const validLevels = milestones.filter(isValidCareerMilestone).map((m) => m.level);
  if (milestones.some((m) => !isValidCareerMilestone(m))) {
    audit.push({ code: 'invalid-career', severity: 'warning', message: '職涯歷史包含非法紀錄，下一次進度交易會忽略該筆資料。' });
  }
  if (new Set(validLevels).size !== validLevels.length) {
    audit.push({ code: 'duplicate-career', severity: 'warning', message: '同一等級存在重複職涯紀錄，可能阻礙正確的里程碑顯示。' });
  }

  if (save.companyCharter !== undefined && !isValidCompanyCharterProgress(save.companyCharter)) {
    audit.push({ code: 'invalid-charter', severity: 'error', message: '商隊特許資料無效，不能據此發放章節獎勵。' });
  }
  if (isValidCompanyCharterProgress(save.companyCharter)) {
    for (let tier = 1; tier <= save.companyCharter.tier; tier++) {
      const receipt = `company-charter-reward:${save.companyCharter.id}:${tier}`;
      if (!save.flags[receipt]) {
        audit.push({ code: `missing-receipt-${tier}`, severity: 'warning', message: `特許第 ${tier} 章缺少獎勵收據旗標，進度與資源可能不同步。` });
      }
    }
  }

  const members = [save.protagonist, ...save.companions];
  const ids = new Set(members.map((member) => member.id));
  const plan = save.expeditionPlan;
  if (plan) {
    if (new Set(plan.activeIds).size !== plan.activeIds.length) {
      audit.push({ code: 'duplicate-active', severity: 'warning', message: '出征名單包含重複角色。' });
    }
    if (plan.activeIds.some((id) => !ids.has(id))) {
      audit.push({ code: 'missing-active', severity: 'warning', message: '出征名單包含已不存在的角色。' });
    }
    const roleIds = Object.values(plan.roles).filter((id): id is string => typeof id === 'string');
    if (new Set(roleIds).size !== roleIds.length) {
      audit.push({ code: 'duplicate-role', severity: 'warning', message: '同一角色被指派到多個互斥遠征職務。' });
    }
    if (roleIds.some((id) => !plan.activeIds.includes(id))) {
      audit.push({ code: 'reserve-role', severity: 'warning', message: '遠征職務指派給未出征的角色。' });
    }
  }

  for (const member of members) {
    for (const [slot, itemId] of Object.entries(member.equipment)) {
      if (itemId && !ITEMS[itemId]) {
        audit.push({ code: `unknown-equipment-${member.id}-${slot}`, severity: 'error', message: `${member.name} 的${slot}欄引用不存在的裝備「${itemId}」。` });
      }
    }
    for (const [skillId, rank] of Object.entries(member.skills ?? {})) {
      if (!Number.isInteger(rank) || rank < 0 || rank > 5 || !(skillId in CAREER_PATHS)) {
        audit.push({ code: `invalid-skill-${member.id}-${skillId}`, severity: 'error', message: `${member.name} 的技能「${skillId}」rank ${rank} 不合法。` });
      }
    }
    for (const stat of STAT_ORDER) {
      if (!Number.isFinite(member.stats[stat])) {
        audit.push({ code: `invalid-stat-${member.id}-${stat}`, severity: 'error', message: `${member.name} 的${STAT_LABELS[stat]}不是有效數字。` });
      }
    }
  }
  for (const [itemId, count] of Object.entries(save.inventory)) {
    if (!ITEMS[itemId]) audit.push({ code: `unknown-item-${itemId}`, severity: 'warning', message: `背包包含不存在的物品「${itemId}」。` });
    if (!Number.isInteger(count) || count < 0) audit.push({ code: `invalid-count-${itemId}`, severity: 'error', message: `物品「${itemId}」數量 ${count} 不合法。` });
  }
  return audit;
}

/** 建立只讀商隊檔案；不會寫入、補發獎勵或正規化原始存檔。 */
export function buildCompanyDossier(save: SaveData): CompanyDossier {
  const protagonist = save.protagonist;
  const effective = effectiveStats(protagonist);
  const genesis = protagonist.genesis;
  const stats: DossierStat[] = STAT_ORDER.map((id) => ({
    id,
    name: STAT_LABELS[id],
    base: protagonist.stats[id],
    effective: effective[id],
    potential: isValidGrowthProfile(protagonist.growth) ? protagonist.growth.potential[id] : null,
  }));

  const careerByLevel = new Map(
    (protagonist.careerMilestones ?? [])
      .filter(isValidCareerMilestone)
      .map((milestone) => [milestone.level, milestone]),
  );
  const careers: DossierCareerEntry[] = CAREER_LEVELS.map((level) => {
    const milestone = careerByLevel.get(level);
    return milestone
      ? { level, pathId: milestone.pathId, name: CAREER_PATHS[milestone.pathId].name, score: milestone.score }
      : { level, pathId: null, name: '尚未形成', score: null };
  });

  const plan = normalizeExpeditionPlan(save);
  const memberMap = new Map([save.protagonist, ...save.companions].map((member) => [member.id, member]));
  const activeSet = new Set(plan.activeIds);
  const members: DossierMember[] = [save.protagonist, ...save.companions].map((member) => {
    const active = activeSet.has(member.id);
    const role = active ? memberRole(plan, member.id) : null;
    return {
      id: member.id,
      name: member.name,
      job: JOBS[member.job].name,
      level: member.level,
      row: active ? (plan.positions[member.id] ?? 'front') : 'reserve',
      role,
      roleName: role ? EXPEDITION_ROLES[role].name : null,
      injuredForTrips: member.injuredForTrips,
      bond: member.bond ?? 0,
      equippedSlots: equippedSlots(member),
    };
  });
  void memberMap;

  const metrics = companyCharterMetrics(save);
  const scorecard = companyCharterScorecard(save);
  const current = isValidCompanyCharterProgress(save.companyCharter) ? save.companyCharter : null;
  const candidateId = current?.id ?? chooseCompanyCharter(save);
  const scores = COMPANY_CHARTER_ORDER
    .map((id) => ({
      id,
      name: COMPANY_CHARTERS[id].name,
      desc: COMPANY_CHARTERS[id].desc,
      score: scorecard[id],
      locked: current?.id === id,
    }))
    .sort((a, b) => b.score - a.score || COMPANY_CHARTER_ORDER.indexOf(a.id) - COMPANY_CHARTER_ORDER.indexOf(b.id));
  const nextTier = current
    ? (current.tier < 3 ? (current.tier + 1) as 1 | 2 | 3 : null)
    : 1;
  const targetId = current?.id ?? candidateId;
  const requirements = targetId && nextTier ? dossierCharterRequirements(save, targetId, nextTier) : [];
  const nextTierEligible = targetId && nextTier
    ? companyCharterTierEligible(save, targetId, nextTier)
    : false;

  return {
    generatedFromVersion: save.version,
    protagonist: {
      name: protagonist.name,
      job: JOBS[protagonist.job].name,
      level: protagonist.level,
      xp: protagonist.xp,
      maxHp: protagonist.maxHp,
      genesis: genesis ? genesisName(genesis) : '舊版角色／未啟用命運矩陣',
      lifepath: genesis && isGenesisTraitId(genesis.lifepathId) ? GENESIS_LIFEPATHS[genesis.lifepathId].name : '—',
      aptitude: genesis && genesis.aptitudeId in GENESIS_APTITUDES ? GENESIS_APTITUDES[genesis.aptitudeId].name : '—',
      burden: genesis && genesis.burdenId in GENESIS_BURDENS ? GENESIS_BURDENS[genesis.burdenId].name : '—',
      growthSignature: growthSignature(protagonist.growth),
      stats,
      careers,
    },
    company: {
      gold: save.gold,
      reputation: save.reputation,
      wagonLevel: save.wagonLevel,
      inventoryKinds: Object.values(save.inventory).filter((count) => count > 0).length,
      companionCount: save.companions.length,
      activeCount: plan.activeIds.length,
      members,
    },
    charter: {
      currentId: current?.id ?? null,
      currentName: current ? COMPANY_CHARTERS[current.id].name : '尚未取得特許',
      currentTier: current?.tier ?? 0,
      candidateId,
      candidateName: candidateId ? COMPANY_CHARTERS[candidateId].name : '尚未形成候選',
      scores,
      nextTier,
      nextTierEligible,
      requirements,
      metrics,
    },
    audit: buildAudit(save),
  };
}
