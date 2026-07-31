import type { CareerMilestone, CareerPathId } from './careers';
import { isValidCareerMilestone } from './careers';
import type { CharacterGenesis } from './genesis';
import type { GrowthProfile } from './growth';
import type { StatBlock } from '../types';

export type CompanyCharterId =
  | 'iron-vanguard'
  | 'far-horizon'
  | 'ledger-guild'
  | 'bound-fellowship'
  | 'relic-covenant';
export type CompanyCharterTier = 0 | 1 | 2 | 3;

export interface CompanyCharterProgress {
  id: CompanyCharterId;
  tier: CompanyCharterTier;
}

export interface CompanyCharterReward {
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

export interface CompanyCharterMember {
  id: string;
  job: 'swordsman' | 'ranger' | 'mage' | 'cleric';
  injuredForTrips: number;
  bond?: number;
  equipment: { weapon: string | null; armor: string | null; trinket: string | null };
  equipmentPlus?: { weapon: number; armor: number; trinket: number };
}

export interface CompanyCharterSnapshot {
  protagonist: CompanyCharterMember & {
    genesis?: CharacterGenesis;
    growth?: GrowthProfile;
    careerMilestones?: CareerMilestone[];
    specialization?: string | null;
  };
  companions: CompanyCharterMember[];
  expeditionPlan?: {
    activeIds: string[];
    positions: Record<string, 'front' | 'back'>;
    roles: Partial<Record<'captain' | 'scout' | 'quartermaster' | 'medic', string>>;
  };
  gold: number;
  reputation: number;
  wagonLevel: number;
  inventory: Record<string, number>;
  flags: Record<string, boolean>;
  visitedBossDungeons: string[];
}

export interface CompanyCharterMetrics {
  careerCount: number;
  distinctCareers: number;
  careerCounts: Record<CareerPathId, number>;
  activeCount: number;
  frontCount: number;
  backCount: number;
  armedCount: number;
  equippedCount: number;
  equipmentPlusTotal: number;
  assignedRoles: number;
  hasCaptain: boolean;
  hasScout: boolean;
  hasQuartermaster: boolean;
  hasMedic: boolean;
  companionCount: number;
  bondTotal: number;
  discoveredCount: number;
  bossCount: number;
  routeSupplies: number;
  tradeGoods: number;
  relicSupplies: number;
}

export interface CompanyCharterDef {
  id: CompanyCharterId;
  name: string;
  desc: string;
}

export const COMPANY_CHARTER_ORDER: CompanyCharterId[] = [
  'iron-vanguard',
  'far-horizon',
  'ledger-guild',
  'bound-fellowship',
  'relic-covenant',
];

export const COMPANY_CHARTERS: Record<CompanyCharterId, CompanyCharterDef> = {
  'iron-vanguard': {
    id: 'iron-vanguard',
    name: '鐵衛戰團特許',
    desc: '以前排、武藝、武裝與聲望建立護運威信。',
  },
  'far-horizon': {
    id: 'far-horizon',
    name: '遠境拓荒特許',
    desc: '以斥候、路線補給與新地點發現拓展商路。',
  },
  'ledger-guild': {
    id: 'ledger-guild',
    name: '金帳商會特許',
    desc: '把交涉、學識、軍需與馬車資產整合成商業優勢。',
  },
  'bound-fellowship': {
    id: 'bound-fellowship',
    name: '同袍盟約特許',
    desc: '以多元職涯、完整職務與旅伴羈絆建立穩定團隊。',
  },
  'relic-covenant': {
    id: 'relic-covenant',
    name: '遺珍尋跡特許',
    desc: '以知識、生存、首領探索與裝備強化追逐危險遺物。',
  },
};

const emptyCareerCounts = (): Record<CareerPathId, number> => ({
  martial: 0,
  scouting: 0,
  lore: 0,
  negotiation: 0,
  survival: 0,
});

function inventoryCount(inventory: Record<string, number>, ids: string[]): number {
  return ids.reduce((sum, id) => sum + Math.max(0, inventory[id] ?? 0), 0);
}

function equipmentCount(member: CompanyCharterMember): number {
  return Object.values(member.equipment).filter(Boolean).length;
}

function equipmentPlus(member: CompanyCharterMember): number {
  return Object.values(member.equipmentPlus ?? {}).reduce((sum, value) => sum + Math.max(0, value), 0);
}

/** 將角色、編隊、經濟、探索與關係狀態壓成同一份特許判定指標。 */
export function companyCharterMetrics(snapshot: CompanyCharterSnapshot): CompanyCharterMetrics {
  const careers = (snapshot.protagonist.careerMilestones ?? []).filter(isValidCareerMilestone);
  const careerCounts = emptyCareerCounts();
  for (const milestone of careers) careerCounts[milestone.pathId] += 1;

  const healthy = [
    snapshot.protagonist,
    ...snapshot.companions.filter((member) => member.injuredForTrips === 0),
  ];
  const healthyIds = new Set(healthy.map((member) => member.id));
  const requested = snapshot.expeditionPlan?.activeIds ?? healthy.map((member) => member.id);
  const activeIds: string[] = [snapshot.protagonist.id];
  for (const id of requested) {
    if (activeIds.length >= 4) break;
    if (id !== snapshot.protagonist.id && healthyIds.has(id) && !activeIds.includes(id)) activeIds.push(id);
  }
  const active = activeIds
    .map((id) => healthy.find((member) => member.id === id))
    .filter((member): member is CompanyCharterMember => member !== undefined);
  const positions = snapshot.expeditionPlan?.positions ?? {};
  const roles = snapshot.expeditionPlan?.roles ?? {};
  const roleHolders = new Set(Object.values(roles).filter((id): id is string => !!id && activeIds.includes(id)));

  const frontCount = active.filter((member) =>
    (positions[member.id] ?? (member.job === 'swordsman' ? 'front' : 'back')) === 'front'
  ).length;
  const armedCount = active.filter((member) => !!member.equipment.weapon).length;
  const equippedCount = active.reduce((sum, member) => sum + equipmentCount(member), 0);
  const equipmentPlusTotal = active.reduce((sum, member) => sum + equipmentPlus(member), 0);

  return {
    careerCount: careers.length,
    distinctCareers: Object.values(careerCounts).filter((count) => count > 0).length,
    careerCounts,
    activeCount: active.length,
    frontCount,
    backCount: Math.max(0, active.length - frontCount),
    armedCount,
    equippedCount,
    equipmentPlusTotal,
    assignedRoles: roleHolders.size,
    hasCaptain: !!roles.captain && activeIds.includes(roles.captain),
    hasScout: !!roles.scout && activeIds.includes(roles.scout),
    hasQuartermaster: !!roles.quartermaster && activeIds.includes(roles.quartermaster),
    hasMedic: !!roles.medic && activeIds.includes(roles.medic),
    companionCount: snapshot.companions.length,
    bondTotal: snapshot.companions.reduce((sum, member) => sum + Math.max(0, member.bond ?? 0), 0),
    discoveredCount: Object.entries(snapshot.flags)
      .filter(([key, value]) => value && key.startsWith('discovered:')).length,
    bossCount: new Set(snapshot.visitedBossDungeons).size,
    routeSupplies: inventoryCount(snapshot.inventory, ['torch', 'tattered-map', 'dried-rations']),
    tradeGoods: inventoryCount(snapshot.inventory, ['salt', 'spice-pouch', 'silver-locket', 'goblin-earring']),
    relicSupplies: inventoryCount(snapshot.inventory, ['ore', 'tattered-map', 'overseer-ledger', 'den-idol']),
  };
}

function potential(snapshot: CompanyCharterSnapshot, stat: keyof StatBlock): number {
  return snapshot.protagonist.growth?.potential?.[stat] ?? 0;
}

function genesisBonus(snapshot: CompanyCharterSnapshot, ids: string[]): number {
  const genesis = snapshot.protagonist.genesis;
  return genesis && ids.includes(genesis.lifepathId) ? 3 : 0;
}

export function companyCharterScorecard(
  snapshot: CompanyCharterSnapshot,
): Record<CompanyCharterId, number> {
  const m = companyCharterMetrics(snapshot);
  return {
    'iron-vanguard':
      m.careerCounts.martial * 4 + m.frontCount * 2 + m.armedCount + m.equipmentPlusTotal +
      potential(snapshot, 'str') + genesisBonus(snapshot, ['brawny', 'tough']),
    'far-horizon':
      m.careerCounts.scouting * 4 + (m.hasScout ? 3 : 0) + m.backCount + m.routeSupplies +
      m.discoveredCount * 2 + potential(snapshot, 'dex') + genesisBonus(snapshot, ['nimble', 'seasoned']),
    'ledger-guild':
      m.careerCounts.negotiation * 3 + m.careerCounts.lore * 2 + (m.hasQuartermaster ? 3 : 0) +
      (m.hasCaptain ? 1 : 0) + snapshot.wagonLevel * 3 + m.tradeGoods + Math.floor(snapshot.gold / 150) +
      potential(snapshot, 'cha') + potential(snapshot, 'int') + genesisBonus(snapshot, ['charming', 'learned']),
    'bound-fellowship':
      m.distinctCareers * 3 + m.companionCount * 2 + Math.min(8, m.bondTotal) + m.assignedRoles * 2 +
      potential(snapshot, 'cha') + potential(snapshot, 'con') + genesisBonus(snapshot, ['seasoned']),
    'relic-covenant':
      m.careerCounts.lore * 3 + m.careerCounts.survival * 2 + m.bossCount * 4 +
      m.equipmentPlusTotal * 2 + m.relicSupplies + potential(snapshot, 'int') + potential(snapshot, 'con') +
      genesisBonus(snapshot, ['learned', 'tough']),
  };
}

/** 特許在首次符合門檻時依整體商隊狀態鎖定；平手採固定順序。 */
export function chooseCompanyCharter(snapshot: CompanyCharterSnapshot): CompanyCharterId | null {
  const metrics = companyCharterMetrics(snapshot);
  if (snapshot.reputation < 10 || metrics.careerCount < 1) return null;
  const scores = companyCharterScorecard(snapshot);
  let selected = COMPANY_CHARTER_ORDER[0];
  for (const id of COMPANY_CHARTER_ORDER.slice(1)) {
    if (scores[id] > scores[selected]) selected = id;
  }
  return selected;
}

export function companyCharterTierEligible(
  snapshot: CompanyCharterSnapshot,
  id: CompanyCharterId,
  tier: 1 | 2 | 3,
): boolean {
  const m = companyCharterMetrics(snapshot);
  if (tier === 1) return snapshot.reputation >= 10 && m.careerCount >= 1;

  if (tier === 2) {
    switch (id) {
      case 'iron-vanguard':
        return snapshot.reputation >= 25 &&
          (m.careerCounts.martial >= 2 || m.frontCount >= 2) &&
          (m.armedCount >= 2 || m.equipmentPlusTotal >= 1);
      case 'far-horizon':
        return snapshot.reputation >= 25 &&
          (m.careerCounts.scouting >= 2 || m.hasScout) &&
          m.routeSupplies >= 2 && m.discoveredCount >= 1;
      case 'ledger-guild':
        return snapshot.reputation >= 25 &&
          m.careerCounts.negotiation + m.careerCounts.lore >= 2 &&
          (m.hasQuartermaster || snapshot.wagonLevel >= 1) && snapshot.gold >= 250;
      case 'bound-fellowship':
        return snapshot.reputation >= 20 && m.companionCount >= 2 &&
          m.distinctCareers >= 2 && m.bondTotal >= 2 && m.assignedRoles >= 2;
      case 'relic-covenant':
        return snapshot.reputation >= 25 && m.bossCount >= 1 &&
          m.careerCounts.lore + m.careerCounts.survival >= 2 &&
          (m.relicSupplies >= 2 || m.equipmentPlusTotal >= 1);
    }
  }

  switch (id) {
    case 'iron-vanguard':
      return snapshot.reputation >= 50 && m.careerCounts.martial >= 3 &&
        m.frontCount >= 2 && m.equippedCount >= 6;
    case 'far-horizon':
      return snapshot.reputation >= 50 && m.careerCounts.scouting >= 3 &&
        m.hasScout && m.discoveredCount >= 2;
    case 'ledger-guild':
      return snapshot.reputation >= 50 &&
        m.careerCounts.negotiation + m.careerCounts.lore >= 3 &&
        snapshot.wagonLevel >= 2 && snapshot.gold >= 500;
    case 'bound-fellowship':
      return snapshot.reputation >= 45 && m.companionCount >= 3 &&
        m.distinctCareers >= 3 && m.bondTotal >= 6 && m.assignedRoles >= 3;
    case 'relic-covenant':
      return snapshot.reputation >= 50 && m.bossCount >= 2 &&
        m.careerCounts.lore + m.careerCounts.survival >= 3 && m.equipmentPlusTotal >= 2;
  }
}

const CHARTER_REWARDS: Record<CompanyCharterId, Record<1 | 2 | 3, CompanyCharterReward>> = {
  'iron-vanguard': {
    1: { stats: { str: 1 }, inventory: { 'war-tonic': 1 } },
    2: { maxHp: 2, skill: { id: 'martial', amount: 1 }, reputation: 2 },
    3: { stats: { str: 1 }, maxHp: 2, reputation: 4, inventory: { 'war-tonic': 2, ore: 1 } },
  },
  'far-horizon': {
    1: { stats: { dex: 1 }, inventory: { torch: 2, 'dried-rations': 1 } },
    2: { skill: { id: 'scouting', amount: 1 }, gold: 20, inventory: { 'tattered-map': 1 } },
    3: { stats: { dex: 1 }, skillPoints: 1, reputation: 4, inventory: { torch: 2, 'tattered-map': 1 } },
  },
  'ledger-guild': {
    1: { stats: { cha: 1 }, gold: 40, inventory: { 'spice-pouch': 1 } },
    2: { skill: { id: 'negotiation', amount: 1 }, gold: 30, wagonLevels: 1 },
    3: { stats: { cha: 1 }, gold: 80, reputation: 5, wagonLevels: 1 },
  },
  'bound-fellowship': {
    1: { skillPoints: 1, inventory: { bandage: 1 }, bondAll: 1 },
    2: { stats: { cha: 1, con: 1 }, reputation: 3, bondAll: 1 },
    3: { maxHp: 2, reputation: 5, inventory: { bandage: 2 }, bondAll: 2 },
  },
  'relic-covenant': {
    1: { stats: { int: 1 }, inventory: { 'tattered-map': 1, ore: 1 } },
    2: { skill: { id: 'lore', amount: 1 }, gold: 30, inventory: { ore: 2 } },
    3: { stats: { int: 1 }, skillPoints: 1, gold: 60, reputation: 5, inventory: { ore: 3 } },
  },
};

export function companyCharterReward(
  id: CompanyCharterId,
  tier: 1 | 2 | 3,
): CompanyCharterReward {
  const reward = CHARTER_REWARDS[id][tier];
  return {
    ...reward,
    stats: reward.stats ? { ...reward.stats } : undefined,
    skill: reward.skill ? { ...reward.skill } : undefined,
    inventory: reward.inventory ? { ...reward.inventory } : undefined,
  };
}

export function isCompanyCharterId(value: unknown): value is CompanyCharterId {
  return typeof value === 'string' && value in COMPANY_CHARTERS;
}

export function isCompanyCharterTier(value: unknown): value is CompanyCharterTier {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 3;
}

export function isValidCompanyCharterProgress(value: unknown): value is CompanyCharterProgress {
  if (typeof value !== 'object' || value === null) return false;
  const progress = value as Record<string, unknown>;
  return isCompanyCharterId(progress.id) && isCompanyCharterTier(progress.tier);
}

export function companyCharterName(progress: CompanyCharterProgress | undefined): string {
  return progress && isValidCompanyCharterProgress(progress)
    ? `${COMPANY_CHARTERS[progress.id].name}・第 ${progress.tier} 章`
    : '尚未取得特許';
}
