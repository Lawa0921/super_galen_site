import type { SaveData } from '../save';
import {
  officeMandateAgenda,
} from './officeMandates';
import type {
  CompanyMandate,
  MandateCompletion,
  MandateReward,
  MandateRoute,
  MandateRouteId,
} from './mandates';
import { companyRiskCrisis, type CompanyRiskCrisis } from './risks';

export type RiskMandateAgenda = ReturnType<typeof officeMandateAgenda> & {
  riskCrisis: CompanyRiskCrisis | null;
  riskPenaltyActive: boolean;
};

function cloneReward(reward: MandateReward): MandateReward {
  return { ...reward, inventory: { ...reward.inventory } };
}

function cloneRoute(route: MandateRoute): MandateRoute {
  return {
    ...route,
    inventoryCost: { ...route.inventoryCost },
    blockers: [...route.blockers],
  };
}

function refreshEligibility(save: SaveData, route: MandateRoute): MandateRoute {
  const blockers = route.blockers.filter((entry) =>
    !entry.startsWith('能力分數 ') &&
    !entry.startsWith('金幣不足') &&
    !entry.includes('不足，需要')
  );
  if (route.score < route.threshold) blockers.push(`能力分數 ${route.score}，需要 ${route.threshold}`);
  if (save.gold < route.goldCost) blockers.push(`金幣不足，需要 ${route.goldCost} G`);
  for (const [itemId, count] of Object.entries(route.inventoryCost)) {
    if ((save.inventory[itemId] ?? 0) < count) blockers.push(`${itemId} 不足，需要 ${count}`);
  }
  return { ...route, blockers, eligible: blockers.length === 0 };
}

function applyCrisisToMandate(save: SaveData, mandate: CompanyMandate, crisis: CompanyRiskCrisis): CompanyMandate {
  const reward = cloneReward(mandate.reward);
  const routes = mandate.routes.map(cloneRoute);
  if (crisis.dimension === 'finance') {
    reward.gold = Math.max(0, reward.gold - crisis.severity * 5);
    for (const route of routes) if (route.id === 'capital') route.goldCost += crisis.severity * 10;
  }
  if (crisis.dimension === 'health') {
    for (const route of routes) if (route.id === 'field') route.threshold += crisis.severity;
  }
  if (crisis.dimension === 'logistics') {
    for (const route of routes) {
      if (route.id === 'field') {
        route.inventoryCost['dried-rations'] = (route.inventoryCost['dried-rations'] ?? 0) + crisis.severity;
      }
    }
  }
  if (crisis.dimension === 'governance') {
    for (const route of routes) if (route.id === 'expertise') route.threshold += crisis.severity;
  }
  if (crisis.dimension === 'morale') {
    reward.reputation = Math.max(0, reward.reputation - crisis.severity);
    for (const route of routes) if (route.id === 'field') route.threshold += 1;
  }
  return {
    ...mandate,
    reward,
    routes: routes.map((route) => refreshEligibility(save, route)),
  };
}

export function riskMandateAgenda(save: SaveData): RiskMandateAgenda {
  const base = officeMandateAgenda(save);
  const crisis = companyRiskCrisis(save);
  const active = !!crisis && !crisis.resolved;
  return {
    ...base,
    riskCrisis: crisis,
    riskPenaltyActive: active,
    mandates: active
      ? base.mandates.map((mandate) => applyCrisisToMandate(save, mandate, crisis))
      : base.mandates,
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

/** 使用最新風險、憲章與職務資料原子結算公司委託。 */
export function completeRiskMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): MandateCompletion {
  const agenda = riskMandateAgenda(save);
  if (agenda.completed) throw new Error('本市場週期的公司委託已經完成。');
  const organizationWarnings = [...agenda.constitutionWarnings, ...agenda.officeWarnings];
  if (organizationWarnings.length > 0) throw new Error(organizationWarnings.join('；'));
  const mandate = agenda.mandates.find((entry) => entry.id === mandateId);
  if (!mandate) throw new Error(`找不到公司委託「${mandateId}」`);
  const route = mandate.routes.find((entry) => entry.id === routeId);
  if (!route) throw new Error(`找不到解法「${routeId}」`);
  if (!route.eligible) throw new Error(route.blockers.join('；'));

  const preciseReceipt = `company-mandate:${agenda.cycle}:${mandate.id}:${route.id}`;
  if (save.flags[agenda.receipt] === true || save.flags[preciseReceipt] === true) {
    throw new Error('這項公司委託已經結算。');
  }

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
    reward: cloneReward(mandate.reward),
    receipt: preciseReceipt,
  };
}
