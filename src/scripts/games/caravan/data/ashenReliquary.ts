import type { CompanionRecord, SaveData } from '../save';
import { companyConstitutionState } from './constitution';
import { COMPANY_OFFICES, companyOfficeState } from './offices';
import { companyRetentionState } from './retention';

export type ReliquaryStageId = 1 | 2 | 3;
export type ReliquaryEndingId = 'sealed' | 'claimed' | 'shattered';
export type ReliquaryRouteId =
  | 'read-runes' | 'shield-march' | 'hidden-path'
  | 'consecrate-choir' | 'decode-lament' | 'parley-echoes'
  | 'seal-reliquary' | 'claim-ember' | 'shatter-vessel';

export interface ReliquaryReward {
  gold: number;
  reputation: number;
  inventory: Record<string, number>;
  skillPoints: number;
  bondAll: number;
  flag?: string;
}

export interface ReliquaryRoute {
  id: ReliquaryRouteId;
  name: string;
  description: string;
  score: number;
  threshold: number;
  goldCost: number;
  reputationCost: number;
  inventoryCost: Record<string, number>;
  reward: ReliquaryReward;
  eligible: boolean;
  blockers: string[];
  ending?: ReliquaryEndingId;
}

export interface ReliquaryStage {
  id: ReliquaryStageId;
  title: string;
  description: string;
  routes: ReliquaryRoute[];
  completedRouteId: ReliquaryRouteId | null;
  locked: boolean;
}

export interface AshenReliquaryState {
  unlocked: boolean;
  unlockReason: string;
  completed: boolean;
  ending: ReliquaryEndingId | null;
  currentStage: ReliquaryStageId | null;
  stages: ReliquaryStage[];
  warnings: string[];
}

export interface ReliquaryResolution {
  stageId: ReliquaryStageId;
  routeId: ReliquaryRouteId;
  reward: ReliquaryReward;
  ending: ReliquaryEndingId | null;
  receipt: string;
}

const ENDINGS: ReliquaryEndingId[] = ['sealed', 'claimed', 'shattered'];
const STAGE_ROUTES: Record<ReliquaryStageId, ReliquaryRouteId[]> = {
  1: ['read-runes', 'shield-march', 'hidden-path'],
  2: ['consecrate-choir', 'decode-lament', 'parley-echoes'],
  3: ['seal-reliquary', 'claim-ember', 'shatter-vessel'],
};

function bondTier(value: number | undefined): number {
  const bond = value ?? 0;
  if (bond >= 9) return 3;
  if (bond >= 5) return 2;
  if (bond >= 2) return 1;
  return 0;
}

function potential(record: CompanionRecord, stat: 'str' | 'dex' | 'int' | 'cha' | 'con'): number {
  return record.growth?.potential?.[stat] ?? 0;
}

function skill(record: CompanionRecord, id: string): number {
  return record.skills?.[id] ?? 0;
}

function careerCount(save: SaveData, pathId: string): number {
  return [save.protagonist, ...save.companions].filter((member) =>
    (member.careerMilestones ?? []).some((milestone) => milestone.pathId === pathId)
  ).length;
}

function healthyCompanions(save: SaveData): CompanionRecord[] {
  return save.companions.filter((member) => member.injuredForTrips <= 0);
}

function officeBonus(save: SaveData, domain: 'escort' | 'frontier' | 'trade' | 'fellowship' | 'relic'): number {
  const state = companyOfficeState(save);
  return state.assignments
    .filter((assignment) => COMPANY_OFFICES[assignment.officeId].domain === domain)
    .reduce((sum, assignment) => sum + assignment.tier, 0);
}

function clauseBonus(save: SaveData, clauseId: string): number {
  return companyConstitutionState(save).active === clauseId ? 2 : 0;
}

function knownPractice(save: SaveData, id: 'expertise' | 'capital' | 'solidarity'): number {
  return save.flags[`company-risk-practice:${id}`] === true ? 1 : 0;
}

function completedRoute(save: SaveData, stage: ReliquaryStageId): ReliquaryRouteId | null {
  const prefix = `ashen-reliquary:stage:${stage}:`;
  const matches = Object.keys(save.flags).filter((key) => key.startsWith(prefix) && save.flags[key] === true);
  if (matches.length !== 1) return null;
  const id = matches[0].slice(prefix.length) as ReliquaryRouteId;
  return STAGE_ROUTES[stage].includes(id) ? id : null;
}

function endingFromSave(save: SaveData): ReliquaryEndingId | null {
  const active = ENDINGS.filter((ending) => save.flags[`ashen-reliquary:ending:${ending}`] === true);
  return active.length === 1 ? active[0] : null;
}

function reward(
  gold: number,
  reputation: number,
  inventory: Record<string, number> = {},
  skillPoints = 0,
  bondAll = 0,
  flag?: string,
): ReliquaryReward {
  return { gold, reputation, inventory, skillPoints, bondAll, flag };
}

function refreshEligibility(save: SaveData, route: Omit<ReliquaryRoute, 'eligible' | 'blockers'>): ReliquaryRoute {
  const blockers: string[] = [];
  if (route.score < route.threshold) blockers.push(`能力 ${route.score}，需要 ${route.threshold}`);
  if (save.gold < route.goldCost) blockers.push(`金幣不足，需要 ${route.goldCost} G`);
  if (save.reputation < route.reputationCost) blockers.push(`聲望不足，需要 ${route.reputationCost}`);
  for (const [itemId, count] of Object.entries(route.inventoryCost)) {
    if ((save.inventory[itemId] ?? 0) < count) blockers.push(`${itemId} 不足，需要 ${count}`);
  }
  return { ...route, eligible: blockers.length === 0, blockers };
}

function stageOneRoutes(save: SaveData): ReliquaryRoute[] {
  const hero = save.protagonist;
  const runeScore = Math.floor(hero.stats.int / 4) + skill(hero, 'lore') + potential(hero, 'int')
    + officeBonus(save, 'relic') + clauseBonus(save, 'open-knowledge') + knownPractice(save, 'expertise');
  const shieldScore = Math.floor(hero.stats.str / 4) + skill(hero, 'martial') + potential(hero, 'str')
    + officeBonus(save, 'escort') + clauseBonus(save, 'martial-priority');
  const pathScore = Math.floor(hero.stats.dex / 4) + skill(hero, 'scouting') + potential(hero, 'dex')
    + officeBonus(save, 'frontier') + clauseBonus(save, 'exploration-duty');
  return [
    refreshEligibility(save, {
      id: 'read-runes', name: '以古符熄滅灰燼風',
      description: '解讀聖匣守衛留下的龍語封印，從魔法風暴的節點間穿行。',
      score: runeScore, threshold: 8, goldCost: 0, reputationCost: 0,
      inventoryCost: { torch: 1, herb: 1 }, reward: reward(10, 1, { 'tattered-map': 1 }),
    }),
    refreshEligibility(save, {
      id: 'shield-march', name: '結盾穿越亡者堤道',
      description: '由護衛承受灰燼騎士的衝鋒，硬生生奪下通往地窟的石橋。',
      score: shieldScore, threshold: 8, goldCost: 0, reputationCost: 0,
      inventoryCost: { bandage: 1 }, reward: reward(16, 1, { ore: 1 }),
    }),
    refreshEligibility(save, {
      id: 'hidden-path', name: '追隨妖火尋找隱道',
      description: '讓斥候辨認不受詛咒侵蝕的獸徑，繞過堤道上的亡魂軍列。',
      score: pathScore, threshold: 8, goldCost: 0, reputationCost: 0,
      inventoryCost: { 'dried-rations': 2 }, reward: reward(8, 1, { torch: 1 }),
    }),
  ];
}

function stageTwoRoutes(save: SaveData): ReliquaryRoute[] {
  const hero = save.protagonist;
  const clerics = [hero, ...save.companions].filter((member) => member.job === 'cleric').length;
  const registered = save.companions.filter((member) => !!member.genesis && !!member.growth).length;
  const healthyBond = healthyCompanions(save).reduce((sum, member) => sum + bondTier(member.bond), 0);
  const retention = companyRetentionState(save);
  const partners = retention.profiles.filter((profile) => profile.contract === 'partnership').length;
  const sanctifyScore = Math.floor(hero.stats.cha / 4) + skill(hero, 'survival') + clerics * 2
    + officeBonus(save, 'fellowship') + clauseBonus(save, 'fellowship-dividend') + knownPractice(save, 'solidarity');
  const decodeScore = Math.floor(hero.stats.int / 4) + skill(hero, 'lore') + potential(hero, 'int')
    + careerCount(save, 'lore') + officeBonus(save, 'relic') + clauseBonus(save, 'open-knowledge');
  const parleyScore = Math.floor(hero.stats.cha / 4) + skill(hero, 'negotiation') + potential(hero, 'cha')
    + partners * 2 + Math.min(3, healthyBond) + Math.min(2, registered) + officeBonus(save, 'trade');
  return [
    refreshEligibility(save, {
      id: 'consecrate-choir', name: '重唱失落聖歌',
      description: '由牧師與同袍接續被詛咒吞沒的禱詞，使無聲唱詩班重新記起自己的名字。',
      score: sanctifyScore, threshold: 10, goldCost: 0, reputationCost: 1,
      inventoryCost: { herb: 2 }, reward: reward(12, 2, { bandage: 1 }, 0, 1),
    }),
    refreshEligibility(save, {
      id: 'decode-lament', name: '解讀黑曜哀歌',
      description: '從牆上的燒蝕譜記重建封印儀式，找出聖匣真正的主人。',
      score: decodeScore, threshold: 10, goldCost: 0, reputationCost: 0,
      inventoryCost: { 'tattered-map': 1 }, reward: reward(8, 2, { herb: 1 }, 1),
    }),
    refreshEligibility(save, {
      id: 'parley-echoes', name: '與死者回聲立約',
      description: '以分贓誓言與真名交換通行，承諾不讓聖匣再次成為王侯的武器。',
      score: parleyScore, threshold: 10, goldCost: 25, reputationCost: 0,
      inventoryCost: { 'spice-pouch': 1 }, reward: reward(30, 1, {}, 0, 2),
    }),
  ];
}

function stageThreeRoutes(save: SaveData): ReliquaryRoute[] {
  const hero = save.protagonist;
  const stageOne = completedRoute(save, 1);
  const stageTwo = completedRoute(save, 2);
  const clerics = [hero, ...save.companions].filter((member) => member.job === 'cleric').length;
  const relicAspirants = companyRetentionState(save).profiles.filter((profile) => profile.aspiration === 'relic').length;
  const sealScore = Math.floor(hero.stats.int / 4) + skill(hero, 'lore') + clerics * 2
    + officeBonus(save, 'relic') + clauseBonus(save, 'open-knowledge')
    + (stageOne === 'read-runes' ? 2 : 0) + (stageTwo === 'consecrate-choir' || stageTwo === 'decode-lament' ? 2 : 0);
  const claimScore = Math.floor(Math.max(hero.stats.int, hero.stats.cha) / 4) + skill(hero, 'lore')
    + skill(hero, 'negotiation') + potential(hero, 'int') + relicAspirants
    + clauseBonus(save, 'commercial-supremacy') + (stageTwo === 'parley-echoes' ? 2 : 0);
  const shatterScore = Math.floor(hero.stats.str / 4) + skill(hero, 'martial') + potential(hero, 'str')
    + officeBonus(save, 'escort') + clauseBonus(save, 'martial-priority')
    + (stageOne === 'shield-march' ? 2 : 0);
  return [
    refreshEligibility(save, {
      id: 'seal-reliquary', name: '以聖火重新封印',
      description: '接受教會與亡者共同見證，讓龍燼沉睡，保留其知識但拒絕使用其力量。',
      score: sealScore, threshold: 13, goldCost: 0, reputationCost: 2,
      inventoryCost: { herb: 2, bandage: 1 },
      reward: reward(35, 6, { 'tattered-map': 1 }, 1, 1, 'relic:saint-ember'), ending: 'sealed',
    }),
    refreshEligibility(save, {
      id: 'claim-ember', name: '奪取龍燼心核',
      description: '承受聖匣詛咒，把古龍殘火帶回商隊；力量巨大，但教會與旅伴都會記得這個選擇。',
      score: claimScore, threshold: 13, goldCost: 40, reputationCost: 0,
      inventoryCost: { 'war-tonic': 1 },
      reward: reward(110, -2, {}, 2, 0, 'relic:ember-heart'), ending: 'claimed',
    }),
    refreshEligibility(save, {
      id: 'shatter-vessel', name: '擊碎聖匣與龍骨鎖',
      description: '拒絕所有王權、教權與法師塔的索求，將危險知識連同容器一併毀滅。',
      score: shatterScore, threshold: 13, goldCost: 0, reputationCost: 0,
      inventoryCost: { bandage: 2, ore: 1 },
      reward: reward(60, 4, { ore: 3 }, 0, 1, 'relic:dragonbone-shard'), ending: 'shattered',
    }),
  ];
}

function warnings(save: SaveData): string[] {
  const result: string[] = [];
  for (const stage of [1, 2, 3] as ReliquaryStageId[]) {
    const prefix = `ashen-reliquary:stage:${stage}:`;
    const active = Object.keys(save.flags).filter((key) => key.startsWith(prefix) && save.flags[key] === true);
    if (active.length > 1) result.push(`灰燼聖匣第 ${stage} 幕同時存在多條路線收據。`);
  }
  const endings = ENDINGS.filter((ending) => save.flags[`ashen-reliquary:ending:${ending}`] === true);
  if (endings.length > 1) result.push('灰燼聖匣同時存在多個結局，所有結局效果停用。');
  return result;
}

export function ashenReliquaryState(save: SaveData): AshenReliquaryState {
  const completedRoutes = {
    1: completedRoute(save, 1),
    2: completedRoute(save, 2),
    3: completedRoute(save, 3),
  };
  const unlocked = save.reputation >= 25
    || companyConstitutionState(save).active === 'open-knowledge'
    || officeBonus(save, 'relic') > 0;
  const ending = endingFromSave(save);
  const completed = save.flags['world-quest:ashen-reliquary:completed'] === true && ending !== null;
  const currentStage: ReliquaryStageId | null = completed
    ? null
    : !completedRoutes[1] ? 1 : !completedRoutes[2] ? 2 : 3;
  const stages: ReliquaryStage[] = [
    {
      id: 1,
      title: '第一幕：灰燼堤道',
      description: '通往山腹修道院的堤道被灰燼騎士與龍火風暴封鎖。',
      routes: stageOneRoutes(save),
      completedRouteId: completedRoutes[1],
      locked: currentStage !== 1 && !completedRoutes[1],
    },
    {
      id: 2,
      title: '第二幕：無聲唱詩窟',
      description: '失去舌頭的修士亡魂仍在反覆演唱一段無聲聖歌。',
      routes: stageTwoRoutes(save),
      completedRouteId: completedRoutes[2],
      locked: !completedRoutes[1],
    },
    {
      id: 3,
      title: '第三幕：龍燼聖匣',
      description: '聖匣中的古龍心火醒來，要求商隊在封印、力量與毀滅之間作出選擇。',
      routes: stageThreeRoutes(save),
      completedRouteId: completedRoutes[3],
      locked: !completedRoutes[2],
    },
  ];
  return {
    unlocked,
    unlockReason: unlocked
      ? '商隊已取得足夠聲望、秘法學識或遺珍官員的引薦。'
      : '需要聲望 25、知識公開誓約，或一名有效遺珍學監。',
    completed,
    ending,
    currentStage,
    stages,
    warnings: warnings(save),
  };
}

function applyReward(save: SaveData, gained: ReliquaryReward): void {
  save.gold += gained.gold;
  save.reputation += gained.reputation;
  for (const [itemId, count] of Object.entries(gained.inventory)) {
    if (count > 0) save.inventory[itemId] = (save.inventory[itemId] ?? 0) + count;
  }
  if (gained.skillPoints > 0) save.protagonist.skillPoints = (save.protagonist.skillPoints ?? 0) + gained.skillPoints;
  if (gained.bondAll > 0) {
    for (const companion of save.companions) companion.bond = (companion.bond ?? 0) + gained.bondAll;
  }
  if (gained.flag) save.flags[gained.flag] = true;
}

/** 使用最新存檔重新預覽，再原子結算單一幕。 */
export function resolveAshenReliquary(
  save: SaveData,
  stageId: ReliquaryStageId,
  routeId: ReliquaryRouteId,
): ReliquaryResolution {
  const state = ashenReliquaryState(save);
  if (!state.unlocked) throw new Error(state.unlockReason);
  if (state.warnings.length > 0) throw new Error(state.warnings.join('；'));
  if (state.completed) throw new Error('灰燼聖匣的命運已經決定。');
  if (state.currentStage !== stageId) throw new Error(`目前只能處理第 ${state.currentStage ?? 0} 幕。`);
  const stage = state.stages.find((entry) => entry.id === stageId)!;
  const route = stage.routes.find((entry) => entry.id === routeId);
  if (!route) throw new Error(`第 ${stageId} 幕不存在路線「${routeId}」。`);
  if (!route.eligible) throw new Error(route.blockers.join('；'));
  const stageReceipt = `ashen-reliquary:stage:${stageId}:${route.id}`;
  const stagePrefix = `ashen-reliquary:stage:${stageId}:`;
  if (Object.keys(save.flags).some((key) => key.startsWith(stagePrefix) && save.flags[key] === true)) {
    throw new Error(`第 ${stageId} 幕已經完成。`);
  }

  save.gold -= route.goldCost;
  save.reputation -= route.reputationCost;
  for (const [itemId, count] of Object.entries(route.inventoryCost)) {
    save.inventory[itemId] = (save.inventory[itemId] ?? 0) - count;
  }
  applyReward(save, route.reward);
  save.flags[stageReceipt] = true;

  let ending: ReliquaryEndingId | null = null;
  if (stageId === 3) {
    if (!route.ending) throw new Error('最終幕路線缺少結局。');
    ending = route.ending;
    save.flags[`ashen-reliquary:ending:${ending}`] = true;
    save.flags['world-quest:ashen-reliquary:completed'] = true;
    if (ending === 'claimed') save.flags['curse:dragon-ember'] = true;
  }

  return {
    stageId,
    routeId: route.id,
    reward: { ...route.reward, inventory: { ...route.reward.inventory } },
    ending,
    receipt: stageReceipt,
  };
}
