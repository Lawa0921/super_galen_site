import type { SaveData } from '../save';
import {
  companyMandateAgenda,
  type CompanyMandate,
  type MandateAgenda,
  type MandateCompletion,
  type MandateReward,
  type MandateRoute,
  type MandateRouteId,
} from './mandates';
import { companyConstitutionState, type ConstitutionClauseId } from './constitution';

export interface ConstitutionalMandateAgenda extends MandateAgenda {
  constitution: ConstitutionClauseId | null;
  constitutionWarnings: string[];
}

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

function applyClauseToMandate(
  save: SaveData,
  mandate: CompanyMandate,
  clause: ConstitutionClauseId | null,
): CompanyMandate {
  const reward = cloneReward(mandate.reward);
  const routes = mandate.routes.map(cloneRoute);
  if (!clause) return { ...mandate, reward, routes };

  if (clause === 'martial-priority') {
    if (mandate.domain === 'escort') {
      for (const route of routes) route.score += route.id === 'field' ? 2 : 1;
    }
    if (mandate.domain === 'trade') {
      reward.gold = Math.max(0, Math.floor(reward.gold * 0.75));
      reward.reputation = Math.max(0, reward.reputation - 1);
    }
  }

  if (clause === 'open-knowledge') {
    for (const route of routes) {
      if (route.id === 'expertise') route.threshold = Math.max(1, route.threshold - 1);
      if (route.id === 'capital') route.goldCost += 10 * mandate.difficulty;
    }
    if (mandate.domain === 'relic') reward.skillPoints += 1;
  }

  if (clause === 'fellowship-dividend') {
    reward.gold = Math.max(0, Math.floor(reward.gold * 0.7));
    reward.reputation += 1;
    reward.bondAll += 1;
  }

  if (clause === 'commercial-supremacy') {
    if (mandate.domain === 'trade') {
      reward.gold += 20 + mandate.difficulty * 5;
      for (const route of routes) if (route.id === 'capital') route.score += 2;
    }
    for (const route of routes) {
      if (route.id === 'field') {
        route.inventoryCost['dried-rations'] = (route.inventoryCost['dried-rations'] ?? 0) + 1;
      }
    }
  }

  if (clause === 'exploration-duty') {
    if (mandate.domain === 'frontier' || mandate.domain === 'relic') {
      for (const route of routes) route.threshold = Math.max(1, route.threshold - 1);
    }
    for (const route of routes) {
      route.inventoryCost['dried-rations'] = (route.inventoryCost['dried-rations'] ?? 0) + 1;
    }
  }

  return {
    ...mandate,
    reward,
    routes: routes.map((route) => refreshEligibility(save, route)),
  };
}

export function constitutionalMandateAgenda(save: SaveData): ConstitutionalMandateAgenda {
  const base = companyMandateAgenda(save);
  const constitution = companyConstitutionState(save);
  return {
    ...base,
    constitution: constitution.active,
    constitutionWarnings: constitution.warnings,
    mandates: base.mandates.map((mandate) => applyClauseToMandate(save, mandate, constitution.active)),
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

export function completeConstitutionalMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): MandateCompletion {
  const agenda = constitutionalMandateAgenda(save);
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
