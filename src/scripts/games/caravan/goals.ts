import type { SaveData } from './save';

/**
 * M12 商會晉升階梯：遊戲的主目標線。
 * 聲望來源：完成遠征 +5、首殺 boss +10（expedition.ts settle/finishCombat）。
 * 門檻對齊既有內容解鎖：40=霧嶺古道、60=鹽晶洞窟（data/locations.ts minReputation）。
 */
export interface RankDef {
  id: string;
  name: string;
  /** 晉升到此階所需聲望 */
  minReputation: number;
  /** 晉升到此階所需 boss 首殺數（save.visitedBossDungeons.length） */
  requiredBossClears?: number;
  /** 此階的敘事定位／解鎖說明（目標卡顯示） */
  desc: string;
}

export const RANKS: RankDef[] = [
  { id: 'peddler', name: '行腳商', minReputation: 0,
    desc: '一輛馬車、一袋銅幣——一切從這條路開始。' },
  { id: 'apprentice', name: '見習商人', minReputation: 20,
    desc: '你的名字開始在酒館裡流傳。' },
  { id: 'chartered', name: '特許商人', minReputation: 40,
    desc: '商會授予特許狀——霧嶺古道的商路為你敞開。' },
  { id: 'magnate', name: '商會重鎮', minReputation: 60,
    desc: '你的商隊無人不曉——鹽晶洞窟的傳聞正等著你。' },
  { id: 'guildmaster', name: '商會之主', minReputation: 100, requiredBossClears: 3,
    desc: '討平三大魔窟、聲望百里傳頌——你就是商會的傳奇。' },
];

function meets(save: SaveData, rank: RankDef): boolean {
  if (save.reputation < rank.minReputation) return false;
  if (rank.requiredBossClears !== undefined && save.visitedBossDungeons.length < rank.requiredBossClears) {
    return false;
  }
  return true;
}

/** 目前階級：滿足條件的最高階 */
export function currentRank(save: SaveData): RankDef {
  let current = RANKS[0];
  for (const rank of RANKS) {
    if (meets(save, rank)) current = rank;
  }
  return current;
}

/** 下一階；已達頂階回 null */
export function nextRank(save: SaveData): RankDef | null {
  const idx = RANKS.indexOf(currentRank(save));
  return RANKS[idx + 1] ?? null;
}

export interface RankProgress {
  reputation: { have: number; need: number };
  bossClears?: { have: number; need: number };
}

/** 距下一階的缺口；頂階回 null */
export function rankProgress(save: SaveData): RankProgress | null {
  const next = nextRank(save);
  if (!next) return null;
  const progress: RankProgress = {
    reputation: { have: save.reputation, need: next.minReputation },
  };
  if (next.requiredBossClears !== undefined) {
    progress.bossClears = { have: save.visitedBossDungeons.length, need: next.requiredBossClears };
  }
  return progress;
}

export function isFinalRank(save: SaveData): boolean {
  return nextRank(save) === null;
}
