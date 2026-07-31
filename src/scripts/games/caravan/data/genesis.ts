import type { StatBlock } from '../types';

export type GenesisTraitId = 'seasoned' | 'brawny' | 'nimble' | 'learned' | 'charming' | 'tough';
export type GenesisAptitudeId = keyof StatBlock;
export type GenesisBurdenId = keyof StatBlock;
export type GenesisSkillId = 'martial' | 'scouting' | 'lore' | 'negotiation' | 'survival';

export interface GenesisEffects {
  goldDelta: number;
  reputationDelta: number;
  maxHpDelta: number;
  inventory: Record<string, number>;
  skills: Partial<Record<GenesisSkillId, number>>;
  skillPoints: number;
}

export interface GenesisPathDef extends GenesisEffects {
  id: string;
  name: string;
  desc: string;
}

export interface CharacterGenesis {
  lifepathId: GenesisTraitId;
  aptitudeId: GenesisAptitudeId;
  burdenId: GenesisBurdenId;
}

const emptyEffects = (): GenesisEffects => ({
  goldDelta: 0,
  reputationDelta: 0,
  maxHpDelta: 0,
  inventory: {},
  skills: {},
  skillPoints: 0,
});

/**
 * M22 出身道路：直接沿用創角既有六種「出身特性」，不增加一個只換皮的選單。
 * 每條道路都同時影響經濟、聲望、技能、物資或生命，讓特性成為完整開局策略。
 */
export const GENESIS_LIFEPATHS: Record<GenesisTraitId, GenesisPathDef> = {
  seasoned: {
    id: 'seasoned', name: '流浪老手',
    desc: '熟悉商路與人情：聲望 +4、博識 1、破損地圖與乾糧各 1。',
    goldDelta: 0, reputationDelta: 4, maxHpDelta: 0,
    inventory: { 'tattered-map': 1, 'dried-rations': 1 },
    skills: { lore: 1 }, skillPoints: 0,
  },
  brawny: {
    id: 'brawny', name: '苦役鬥士',
    desc: '用傷痕換來力量：生命 +2、武藝 1、行軍補劑 1，但起始金幣 -20。',
    goldDelta: -20, reputationDelta: 0, maxHpDelta: 2,
    inventory: { 'war-tonic': 1 },
    skills: { martial: 1 }, skillPoints: 0,
  },
  nimble: {
    id: 'nimble', name: '邊境跑商',
    desc: '懂得找路與避險：偵查 1、火把 1、乾糧 2，但起始金幣 -10。',
    goldDelta: -10, reputationDelta: 0, maxHpDelta: 0,
    inventory: { torch: 1, 'dried-rations': 2 },
    skills: { scouting: 1 }, skillPoints: 0,
  },
  learned: {
    id: 'learned', name: '失學書吏',
    desc: '帶著知識重新起步：聲望 +1、博識 1、自由技能點 1、地圖與藥草各 1，但金幣 -15。',
    goldDelta: -15, reputationDelta: 1, maxHpDelta: 0,
    inventory: { 'tattered-map': 1, herb: 1 },
    skills: { lore: 1 }, skillPoints: 1,
  },
  charming: {
    id: 'charming', name: '市井掮客',
    desc: '人脈就是本錢：金幣 +35、聲望 +1、交涉 1、香料包 1，但生命 -1。',
    goldDelta: 35, reputationDelta: 1, maxHpDelta: -1,
    inventory: { 'spice-pouch': 1 },
    skills: { negotiation: 1 }, skillPoints: 0,
  },
  tough: {
    id: 'tough', name: '礦難倖存者',
    desc: '撐過地底災難：生命 +3、生存 1、繃帶 2，但起始金幣 -25。',
    goldDelta: -25, reputationDelta: 0, maxHpDelta: 3,
    inventory: { bandage: 2 },
    skills: { survival: 1 }, skillPoints: 0,
  },
};

/** 最強屬性形成的天賦方向；玩家可透過擲骰與配點主動改變。 */
export const GENESIS_APTITUDES: Record<GenesisAptitudeId, GenesisPathDef> = {
  str: {
    id: 'str', name: '武勇天賦', desc: '生命 +1、武藝 +1、行軍補劑 1，金幣 -5。',
    goldDelta: -5, reputationDelta: 0, maxHpDelta: 1,
    inventory: { 'war-tonic': 1 }, skills: { martial: 1 }, skillPoints: 0,
  },
  dex: {
    id: 'dex', name: '機敏天賦', desc: '偵查 +1、火把 1。',
    goldDelta: 0, reputationDelta: 0, maxHpDelta: 0,
    inventory: { torch: 1 }, skills: { scouting: 1 }, skillPoints: 0,
  },
  int: {
    id: 'int', name: '求知天賦', desc: '博識 +1、自由技能點 1、破損地圖 1，金幣 -5。',
    goldDelta: -5, reputationDelta: 0, maxHpDelta: 0,
    inventory: { 'tattered-map': 1 }, skills: { lore: 1 }, skillPoints: 1,
  },
  cha: {
    id: 'cha', name: '領袖天賦', desc: '金幣 +20、聲望 +1、交涉 +1、香料包 1。',
    goldDelta: 20, reputationDelta: 1, maxHpDelta: 0,
    inventory: { 'spice-pouch': 1 }, skills: { negotiation: 1 }, skillPoints: 0,
  },
  con: {
    id: 'con', name: '韌性天賦', desc: '生命 +3、生存 +1、繃帶 1，金幣 -10。',
    goldDelta: -10, reputationDelta: 0, maxHpDelta: 3,
    inventory: { bandage: 1 }, skills: { survival: 1 }, skillPoints: 0,
  },
};

/** 最弱屬性形成的開局缺陷；只增加壓力，不會鎖死任何職業。 */
export const GENESIS_BURDENS: Record<GenesisBurdenId, GenesisPathDef> = {
  str: {
    id: 'str', name: '人手不足', desc: '搬運與護衛必須外包，起始金幣 -15。',
    ...emptyEffects(), goldDelta: -15,
  },
  dex: {
    id: 'dex', name: '舊傷遲滯', desc: '生命 -1、起始金幣 -5。',
    ...emptyEffects(), goldDelta: -5, maxHpDelta: -1,
  },
  int: {
    id: 'int', name: '帳目生疏', desc: '為錯誤採購付出代價，起始金幣 -10。',
    ...emptyEffects(), goldDelta: -10,
  },
  cha: {
    id: 'cha', name: '名聲不佳', desc: '議價與擔保成本較高，起始金幣 -20。',
    ...emptyEffects(), goldDelta: -20,
  },
  con: {
    id: 'con', name: '體弱多病', desc: '生命 -3。',
    ...emptyEffects(), maxHpDelta: -3,
  },
};

const STAT_ORDER: Array<keyof StatBlock> = ['str', 'dex', 'int', 'cha', 'con'];

function extremeStat(stats: StatBlock, direction: 'high' | 'low'): keyof StatBlock {
  const order = direction === 'high' ? STAT_ORDER : [...STAT_ORDER].reverse();
  return order.reduce((best, stat) => {
    if (direction === 'high') return stats[stat] > stats[best] ? stat : best;
    return stats[stat] < stats[best] ? stat : best;
  }, order[0]);
}

function mergeEffects(...effects: GenesisEffects[]): GenesisEffects {
  const merged = emptyEffects();
  for (const effect of effects) {
    merged.goldDelta += effect.goldDelta;
    merged.reputationDelta += effect.reputationDelta;
    merged.maxHpDelta += effect.maxHpDelta;
    merged.skillPoints += effect.skillPoints;
    for (const [itemId, count] of Object.entries(effect.inventory)) {
      merged.inventory[itemId] = (merged.inventory[itemId] ?? 0) + count;
    }
    for (const [skillId, rank] of Object.entries(effect.skills) as Array<[GenesisSkillId, number]>) {
      merged.skills[skillId] = (merged.skills[skillId] ?? 0) + rank;
    }
  }
  return merged;
}

export function isGenesisTraitId(value: unknown): value is GenesisTraitId {
  return typeof value === 'string' && value in GENESIS_LIFEPATHS;
}

/**
 * 「無特性」維持舊版完全相容；六種可選出身才啟動命運矩陣。
 * 最強／最弱屬性由擲骰與配點後的實際數值決定，平手採固定順序，確保存檔可重現。
 */
export function resolveCharacterGenesis(
  stats: StatBlock,
  trait: string | null | undefined,
): { profile: CharacterGenesis; effects: GenesisEffects } | null {
  if (!isGenesisTraitId(trait)) return null;
  const aptitudeId = extremeStat(stats, 'high');
  const burdenId = extremeStat(stats, 'low');
  const profile: CharacterGenesis = { lifepathId: trait, aptitudeId, burdenId };
  const effects = mergeEffects(
    GENESIS_LIFEPATHS[trait],
    GENESIS_APTITUDES[aptitudeId],
    GENESIS_BURDENS[burdenId],
  );
  return { profile, effects };
}

export function genesisName(profile: CharacterGenesis): string {
  return `${GENESIS_LIFEPATHS[profile.lifepathId].name}／${GENESIS_APTITUDES[profile.aptitudeId].name}／${GENESIS_BURDENS[profile.burdenId].name}`;
}
