import type { SaveData } from '../save';
import {
  retentionMandateAgenda,
} from './retentionMandates';
import type {
  CompanyMandate,
  MandateCompletion,
  MandateReward,
  MandateRoute,
  MandateRouteId,
} from './mandates';
import { ashenReliquaryState, type ReliquaryEndingId } from './ashenReliquary';

export type FantasyMandateAgenda = ReturnType<typeof retentionMandateAgenda> & {
  reliquaryEnding: ReliquaryEndingId | null;
  reliquaryEffect: string | null;
  reliquaryWarnings: string[];
};

export interface FantasyMandateCompletion extends MandateCompletion {
  partnershipBondIds: string[];
  reliquaryEnding: ReliquaryEndingId | null;
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

function applyEnding(
  save: SaveData,
  mandate: CompanyMandate,
  ending: ReliquaryEndingId | null,
): CompanyMandate {
  if (!ending) return mandate;
  const reward = cloneReward(mandate.reward);
  const routes = mandate.routes.map(cloneRoute);

  if (ending === 'sealed') {
    // 聖焰由修道會保管：獲得宗教與遺珍協助，但所有委託需繳納少量聖堂什一稅。
    reward.gold = Math.max(0, reward.gold - 2);
    if (mandate.domain === 'relic' || mandate.domain === 'fellowship') {
      for (const route of routes) if (route.id === 'expertise') route.score += 1;
    }
  }

  if (ending === 'claimed') {
    // 龍燼心核強化秘法，但詛咒使補給腐敗並損害名聲。
    reward.reputation = Math.max(0, reward.reputation - 1);
    if (mandate.domain === 'relic') {
      for (const route of routes) if (route.id === 'expertise') route.score += 2;
    }
    for (const route of routes) {
      if (route.id === 'field') {
        route.inventoryCost['dried-rations'] = (route.inventoryCost['dried-rations'] ?? 0) + 1;
      }
    }
  }

  if (ending === 'shattered') {
    // 龍骨碎片成為護衛圖騰；代價是遺失聖匣中的古代知識。
    if (mandate.domain === 'escort') {
      for (const route of routes) if (route.id === 'field') route.score += 1;
    }
    if (mandate.domain === 'relic') {
      reward.reputation = Math.max(0, reward.reputation - 1);
      for (const route of routes) if (route.id === 'expertise') route.threshold += 1;
    }
  }

  return {
    ...mandate,
    reward,
    routes: routes.map((route) => refreshEligibility(save, route)),
  };
}

function effectText(ending: ReliquaryEndingId | null): string | null {
  if (ending === 'sealed') return '聖焰封印：遺珍與同袍專業能力提高，但每項委託繳納 2 G 聖堂什一稅。';
  if (ending === 'claimed') return '龍燼詛咒：遺珍專業能力大幅提高，但實地行動多耗乾糧，委託聲望受損。';
  if (ending === 'shattered') return '龍骨戰旗：護運實地能力提高，但遺珍研究更困難且聲望報酬下降。';
  return null;
}

export function fantasyMandateAgenda(save: SaveData): FantasyMandateAgenda {
  const base = retentionMandateAgenda(save);
  const reliquary = ashenReliquaryState(save);
  const ending = reliquary.completed && reliquary.warnings.length === 0 ? reliquary.ending : null;
  return {
    ...base,
    reliquaryEnding: ending,
    reliquaryEffect: effectText(ending),
    reliquaryWarnings: reliquary.warnings,
    mandates: base.mandates.map((mandate) => applyEnding(save, mandate, ending)),
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

/** 使用最新誓約、官職、危機、旅伴承諾與世界任務結局原子結算行會委託。 */
export function completeFantasyMandate(
  save: SaveData,
  mandateId: string,
  routeId: MandateRouteId,
): FantasyMandateCompletion {
  const agenda = fantasyMandateAgenda(save);
  if (agenda.completed) throw new Error('本市場週期的行會委託已經完成。');
  const warnings = [
    ...agenda.constitutionWarnings,
    ...agenda.officeWarnings,
    ...agenda.retentionWarnings,
    ...agenda.reliquaryWarnings,
  ];
  if (warnings.length > 0) throw new Error(warnings.join('；'));
  const mandate = agenda.mandates.find((entry) => entry.id === mandateId);
  if (!mandate) throw new Error(`找不到行會委託「${mandateId}」`);
  const route = mandate.routes.find((entry) => entry.id === routeId);
  if (!route) throw new Error(`找不到解法「${routeId}」`);
  if (!route.eligible) throw new Error(route.blockers.join('；'));

  const preciseReceipt = `company-mandate:${agenda.cycle}:${mandate.id}:${route.id}`;
  if (save.flags[agenda.receipt] === true || save.flags[preciseReceipt] === true) {
    throw new Error('這項行會委託已經結算。');
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
    reliquaryEnding: agenda.reliquaryEnding,
  };
}
