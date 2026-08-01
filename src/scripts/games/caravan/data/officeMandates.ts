import type { SaveData } from '../save';
import type {
  CompanyMandate,
  MandateCompletion,
  MandateReward,
  MandateRoute,
  MandateRouteId,
} from './mandates';
import {
  constitutionalMandateAgenda,
  type ConstitutionalMandateAgenda,
} from './constitutionalMandates';
import { companyOfficeState, COMPANY_OFFICES } from './offices';

export interface OfficeMandateAgenda extends ConstitutionalMandateAgenda {
  officeWarnings: string[];
  officeUpkeep: number;
}

function cloneReward(reward: MandateReward): MandateReward {
  return { ...reward, inventory: { ...reward.inventory } };
}

function cloneRoute(route: MandateRoute): MandateRoute {
  return { ...route, inventoryCost: { ...route.inventoryCost }, blockers: [...route.blockers] };
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

function applyOfficesToMandate(save: SaveData, mandate: CompanyMandate): CompanyMandate {
  const state = companyOfficeState(save);
  const reward = cloneReward(mandate.reward);
  reward.gold = Math.max(0, reward.gold - state.assignments.length * 3);
  const routes = mandate.routes.map(cloneRoute);
  const assignment = state.assignments.find((entry) => COMPANY_OFFICES[entry.officeId].domain === mandate.domain);
  if (assignment) {
    for (const route of routes) {
      if (route.id === 'expertise') route.score += assignment.tier;
      if (route.id === 'field' && assignment.bondTier >= 2) route.score += 1;
    }
  }
  return {
    ...mandate,
    reward,
    routes: routes.map((route) => refreshEligibility(save, route)),
  };
}

export function officeMandateAgenda(save: SaveData): OfficeMandateAgenda {
  const base = constitutionalMandateAgenda(save);
  const state = companyOfficeState(save);
  return {
    ...base,
    officeWarnings: state.warnings,
    officeUpkeep: state.assignments.length * 3,
    mandates: base.mandates.map((mandate) => applyOfficesToMandate(save, mandate)),
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

export function completeOfficeMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): MandateCompletion {
  const agenda = officeMandateAgenda(save);
  if (agenda.constitutionWarnings.length > 0) throw new Error(agenda.constitutionWarnings.join('；'));
  if (agenda.officeWarnings.length > 0) throw new Error(agenda.officeWarnings.join('；'));
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
