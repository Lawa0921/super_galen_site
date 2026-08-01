import type { SaveData } from '../save';
import { isValidCompanyCharterProgress } from './charters';
import { acceptedOperationalInitiatives } from './operations';

export type MandateDomain = 'escort' | 'frontier' | 'trade' | 'fellowship' | 'relic';
export type MandateRouteId = 'expertise' | 'capital' | 'field';

export interface MandateReward {
  gold: number;
  reputation: number;
  inventory: Record<string, number>;
  bondAll: number;
  skillPoints: number;
}

export interface MandateRoute {
  id: MandateRouteId;
  name: string;
  description: string;
  score: number;
  threshold: number;
  goldCost: number;
  inventoryCost: Record<string, number>;
  eligible: boolean;
  blockers: string[];
}

export interface CompanyMandate {
  id: string;
  domain: MandateDomain;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3;
  primaryStat: 'str' | 'dex' | 'int' | 'cha' | 'con';
  primarySkill: 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';
  reward: MandateReward;
  routes: MandateRoute[];
}

export interface MandateAgenda {
  cycle: number;
  receipt: string;
  completed: boolean;
  completedMandateId: string | null;
  completedRouteId: MandateRouteId | null;
  mandates: CompanyMandate[];
}

export interface MandateCompletion {
  cycle: number;
  mandateId: string;
  routeId: MandateRouteId;
  reward: MandateReward;
  receipt: string;
}

interface MandateTemplate {
  domain: MandateDomain;
  title: string;
  description: string;
  stat: CompanyMandate['primaryStat'];
  skill: CompanyMandate['primarySkill'];
  affinity: string[];
  rewardItems: string[];
}

const TEMPLATES: MandateTemplate[] = [
  {
    domain: 'escort', title: '危路護運合約',
    description: '一支高價商隊必須穿越盜匪與斷橋並存的路段。',
    stat: 'str', skill: 'martial', affinity: ['iron-vanguard', 'bound-fellowship'],
    rewardItems: ['war-tonic', 'ore'],
  },
  {
    domain: 'frontier', title: '失落支線測繪',
    description: '舊地圖出現互相矛盾的岔路，需要重新建立可靠路線。',
    stat: 'dex', skill: 'scouting', affinity: ['far-horizon', 'relic-covenant'],
    rewardItems: ['tattered-map', 'torch'],
  },
  {
    domain: 'trade', title: '價格崩落調停',
    description: '兩地商人互相壓價，商隊必須建立新的交換秩序。',
    stat: 'cha', skill: 'negotiation', affinity: ['ledger-guild', 'far-horizon'],
    rewardItems: ['spice-pouch', 'dried-rations'],
  },
  {
    domain: 'fellowship', title: '營地信任危機',
    description: '長途壓力造成隊員與雇工對立，需要重新協調責任。',
    stat: 'con', skill: 'survival', affinity: ['bound-fellowship', 'ledger-guild'],
    rewardItems: ['bandage', 'dried-rations'],
  },
  {
    domain: 'relic', title: '遺珍真偽鑑定',
    description: '一件可能改寫商路歷史的遺物，需要在消息外洩前完成鑑定。',
    stat: 'int', skill: 'lore', affinity: ['relic-covenant', 'far-horizon'],
    rewardItems: ['herb', 'tattered-map'],
  },
];

const ROUTE_NAMES: Record<MandateRouteId, string> = {
  expertise: '專業解法', capital: '資本解法', field: '實地解法',
};

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
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

function careerCount(save: SaveData, pathId: string): number {
  return [save.protagonist, ...save.companions].reduce((sum, member) =>
    sum + ((member.careerMilestones ?? []).some((milestone) => milestone.pathId === pathId) ? 1 : 0), 0);
}

function expertiseScore(save: SaveData, template: MandateTemplate): number {
  const protagonist = save.protagonist;
  const stat = protagonist.stats[template.stat] ?? 0;
  const skill = protagonist.skills?.[template.skill] ?? 0;
  const potential = protagonist.growth?.potential?.[template.stat] ?? 0;
  const careers = careerCount(save, template.skill);
  const charter = isValidCompanyCharterProgress(save.companyCharter) ? save.companyCharter : null;
  const charterBonus = charter && template.affinity.includes(charter.id) ? charter.tier : 0;
  return Math.floor(stat / 4) + skill + potential + Math.min(2, careers) + charterBonus;
}

function capitalScore(save: SaveData): number {
  const initiatives = acceptedOperationalInitiatives(save).accepted.length;
  const stance = activeStance(save);
  return Math.floor(save.gold / 60) + Math.max(0, Math.floor(save.wagonLevel)) +
    Math.min(4, initiatives) + (stance === 'ambitious' ? 2 : 0);
}

function fieldScore(save: SaveData): number {
  const healthy = save.companions.filter((member) => member.injuredForTrips === 0);
  const bond = healthy.reduce((sum, member) => sum + bondTier(member.bond), 0);
  const registered = healthy.filter((member) => member.genesis && member.growth).length;
  const stance = activeStance(save);
  return Math.min(4, healthy.length) + Math.min(5, bond) + Math.min(3, registered) +
    Math.min(3, save.visitedBossDungeons.length) + (stance === 'lean' ? 1 : 0);
}

function inventoryBlockers(save: SaveData, costs: Record<string, number>): string[] {
  return Object.entries(costs)
    .filter(([itemId, count]) => (save.inventory[itemId] ?? 0) < count)
    .map(([itemId, count]) => `${itemId} 不足，需要 ${count}`);
}

function routeFor(
  save: SaveData,
  template: MandateTemplate,
  routeId: MandateRouteId,
  difficulty: 1 | 2 | 3,
): MandateRoute {
  const threshold = 6 + difficulty * 2;
  const goldCost = routeId === 'expertise' ? 5 * difficulty : routeId === 'capital' ? 30 * difficulty : 0;
  const inventoryCost = routeId === 'field' ? { 'dried-rations': difficulty } : {};
  const score = routeId === 'expertise'
    ? expertiseScore(save, template)
    : routeId === 'capital'
      ? capitalScore(save)
      : fieldScore(save);
  const blockers = inventoryBlockers(save, inventoryCost);
  if (score < threshold) blockers.push(`能力分數 ${score}，需要 ${threshold}`);
  if (save.gold < goldCost) blockers.push(`金幣不足，需要 ${goldCost} G`);
  return {
    id: routeId,
    name: ROUTE_NAMES[routeId],
    description: routeId === 'expertise'
      ? `以${template.skill}技能、${template.stat}潛力、職涯與特許解決。`
      : routeId === 'capital'
        ? '以金幣、馬車、工程規模與擴張治理調度資源。'
        : '以健康旅伴、身世登記、羈絆、探索與精簡治理完成。',
    score,
    threshold,
    goldCost,
    inventoryCost,
    eligible: blockers.length === 0,
    blockers,
  };
}

function rewardFor(template: MandateTemplate, difficulty: 1 | 2 | 3): MandateReward {
  const baseGold: Record<MandateDomain, number> = {
    escort: 22, frontier: 14, trade: 30, fellowship: 10, relic: 16,
  };
  const itemId = template.rewardItems[(difficulty - 1) % template.rewardItems.length];
  return {
    gold: baseGold[template.domain] + difficulty * 12,
    reputation: template.domain === 'trade' || template.domain === 'fellowship' ? difficulty + 1 : difficulty,
    inventory: { [itemId]: difficulty },
    bondAll: template.domain === 'fellowship' ? difficulty : 0,
    skillPoints: template.domain === 'relic' && difficulty === 3 ? 1 : 0,
  };
}

function cycleReceipt(cycle: number): string {
  return `company-mandate-cycle:${cycle}`;
}

function completedChoice(save: SaveData, cycle: number): { mandateId: string; routeId: MandateRouteId } | null {
  const prefix = `company-mandate:${cycle}:`;
  const key = Object.keys(save.flags).find((flag) => flag.startsWith(prefix) && save.flags[flag] === true);
  if (!key) return null;
  const parts = key.slice(prefix.length).split(':');
  const routeId = parts.pop() as MandateRouteId | undefined;
  if (!routeId || !['expertise', 'capital', 'field'].includes(routeId)) return null;
  return { mandateId: parts.join(':'), routeId };
}

/** 每個 marketSeed 形成一個決定性週期；同一存檔與週期永遠得到相同三項議程。 */
export function companyMandateAgenda(save: SaveData): MandateAgenda {
  const cycle = Math.max(0, Math.floor(save.marketSeed));
  const ordered = [...TEMPLATES]
    .map((template) => ({ template, rank: hash(`${cycle}:${template.domain}:${save.protagonist.genesis?.lifepathId ?? 'legacy'}`) }))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 3);
  const mandates = ordered.map(({ template }, index) => {
    const difficulty = (1 + (hash(`${cycle}:${template.domain}:difficulty`) % 3)) as 1 | 2 | 3;
    const id = `${template.domain}-${cycle}-${index + 1}`;
    return {
      id,
      domain: template.domain,
      title: template.title,
      description: template.description,
      difficulty,
      primaryStat: template.stat,
      primarySkill: template.skill,
      reward: rewardFor(template, difficulty),
      routes: (['expertise', 'capital', 'field'] as MandateRouteId[])
        .map((routeId) => routeFor(save, template, routeId, difficulty)),
    };
  });
  const choice = completedChoice(save, cycle);
  return {
    cycle,
    receipt: cycleReceipt(cycle),
    completed: save.flags[cycleReceipt(cycle)] === true || choice !== null,
    completedMandateId: choice?.mandateId ?? null,
    completedRouteId: choice?.routeId ?? null,
    mandates,
  };
}

function applyReward(save: SaveData, reward: MandateReward): void {
  save.gold += reward.gold;
  save.reputation += reward.reputation;
  for (const [itemId, count] of Object.entries(reward.inventory)) {
    if (count > 0) save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }
  if (reward.bondAll > 0) {
    for (const companion of save.companions) companion.bond = (companion.bond ?? 0) + reward.bondAll;
  }
  if (reward.skillPoints > 0) save.protagonist.skillPoints = (save.protagonist.skillPoints ?? 0) + reward.skillPoints;
}

/** 原子完成一項公司委託；每週期只能完成一項，三種路線共享同一週期收據。 */
export function completeCompanyMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): MandateCompletion {
  const agenda = companyMandateAgenda(save);
  if (agenda.completed) throw new Error('本市場週期的公司委託已經完成。');
  const mandate = agenda.mandates.find((entry) => entry.id === mandateId);
  if (!mandate) throw new Error(`找不到公司委託「${mandateId}」`);
  const route = mandate.routes.find((entry) => entry.id === routeId);
  if (!route) throw new Error(`找不到解法「${routeId}」`);
  if (!route.eligible) throw new Error(route.blockers.join('；'));

  const preciseReceipt = `company-mandate:${agenda.cycle}:${mandate.id}:${route.id}`;
  if (save.flags[agenda.receipt] === true || save.flags[preciseReceipt] === true) {
    throw new Error('這項公司委託已經結算。');
  }

  // 所有驗證完成後才修改資源。
  save.gold -= route.goldCost;
  for (const [itemId, count] of Object.entries(route.inventoryCost)) {
    save.inventory[itemId] = (save.inventory[itemId] ?? 0) - count;
  }
  applyReward(save, mandate.reward);
  save.flags[agenda.receipt] = true;
  save.flags[preciseReceipt] = true;

  return {
    cycle: agenda.cycle,
    mandateId: mandate.id,
    routeId: route.id,
    reward: { ...mandate.reward, inventory: { ...mandate.reward.inventory } },
    receipt: preciseReceipt,
  };
}
