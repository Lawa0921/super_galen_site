import type { SaveData } from '../save';
import {
  riskMandateAgenda,
} from './riskMandates';
import type {
  CompanyMandate,
  MandateCompletion,
  MandateReward,
  MandateRoute,
  MandateRouteId,
} from './mandates';
import {
  companyRetentionState,
  type CompanionRetentionProfile,
} from './retention';

export type RetentionMandateAgenda = ReturnType<typeof riskMandateAgenda> & {
  retentionProfiles: CompanionRetentionProfile[];
  retentionWarnings: string[];
  retentionDispute: CompanionRetentionProfile | null;
  securityStipend: number;
  partnershipShareRate: number;
};

export interface RetentionMandateCompletion extends MandateCompletion {
  partnershipBondIds: string[];
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

function applyRetentionToMandate(
  save: SaveData,
  mandate: CompanyMandate,
  profiles: CompanionRetentionProfile[],
  dispute: CompanionRetentionProfile | null,
): CompanyMandate {
  const reward = cloneReward(mandate.reward);
  const routes = mandate.routes.map(cloneRoute);
  const securityCount = profiles.filter((profile) => profile.contract === 'security').length;
  const partnershipCount = profiles.filter((profile) => profile.contract === 'partnership').length;
  const autonomyCount = profiles.filter((profile) =>
    profile.contract === 'autonomy' && profile.aspiration === mandate.domain
  ).length;

  reward.gold = Math.max(0, reward.gold - securityCount * 3);
  if (partnershipCount > 0) {
    reward.gold = Math.max(0, Math.floor(reward.gold * (1 - Math.min(0.3, partnershipCount * 0.1))));
  }

  if (autonomyCount > 0) {
    for (const route of routes) {
      if (route.id !== 'field') continue;
      route.score += Math.min(2, autonomyCount);
      route.inventoryCost['dried-rations'] = (route.inventoryCost['dried-rations'] ?? 0) + autonomyCount;
    }
  }

  if (dispute) {
    reward.gold = Math.max(0, reward.gold - dispute.disputeSeverity * 2);
    if (mandate.domain === dispute.aspiration) {
      reward.reputation = Math.max(0, reward.reputation - 1);
      for (const route of routes) {
        if (route.id === 'field') route.threshold += dispute.disputeSeverity;
      }
    }
  }

  return {
    ...mandate,
    reward,
    routes: routes.map((route) => refreshEligibility(save, route)),
  };
}

export function retentionMandateAgenda(save: SaveData): RetentionMandateAgenda {
  const base = riskMandateAgenda(save);
  const retention = companyRetentionState(save);
  const securityCount = retention.profiles.filter((profile) => profile.contract === 'security').length;
  const partnershipCount = retention.profiles.filter((profile) => profile.contract === 'partnership').length;
  return {
    ...base,
    retentionProfiles: retention.profiles,
    retentionWarnings: retention.warnings,
    retentionDispute: retention.dispute,
    securityStipend: securityCount * 3,
    partnershipShareRate: Math.min(0.3, partnershipCount * 0.1),
    mandates: base.mandates.map((mandate) =>
      applyRetentionToMandate(save, mandate, retention.profiles, retention.dispute)
    ),
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

/** 使用最新風險、憲章、職務與留任契約原子結算公司委託。 */
export function completeRetentionMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): RetentionMandateCompletion {
  const agenda = retentionMandateAgenda(save);
  if (agenda.completed) throw new Error('本市場週期的公司委託已經完成。');
  const organizationWarnings = [
    ...agenda.constitutionWarnings,
    ...agenda.officeWarnings,
    ...agenda.retentionWarnings,
  ];
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
  const partnershipBondIds = agenda.retentionProfiles
    .filter((profile) => profile.contract === 'partnership')
    .map((profile) => profile.memberId);
  for (const memberId of partnershipBondIds) {
    const member = save.companions.find((entry) => entry.id === memberId);
    if (member) member.bond = (member.bond ?? 0) + 1;
  }
  save.flags[agenda.receipt] = true;
  save.flags[preciseReceipt] = true;

  return {
    cycle: agenda.cycle,
    mandateId: mandate.id,
    routeId: route.id,
    reward: cloneReward(mandate.reward),
    receipt: preciseReceipt,
    partnershipBondIds,
  };
}
