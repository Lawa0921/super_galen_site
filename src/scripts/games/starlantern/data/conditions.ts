export type ConditionId = 'fog' | 'bounty' | 'fierce' | 'calm' | 'starfall' | 'plain';

export interface ConditionDef {
  id: ConditionId; name: string; desc: string;
  encounterMul: number; enemyAtkMul: number; expMul: number; goldMul: number; dropMul: number;
  /** Multiplies the rare and legendary weights of a gear drop. */
  rarityMul: number;
  extraChests: number; extraTraps: number; eliteEveryFloor: boolean;
  /** Reveal radius around the party. */
  sight: 0 | 1;
}

const base = { encounterMul: 1, enemyAtkMul: 1, expMul: 1, goldMul: 1, dropMul: 1, rarityMul: 1, extraChests: 0, extraTraps: 0, eliteEveryFloor: false, sight: 1 } as const;

export const CONDITIONS: Record<ConditionId, ConditionDef> = {
  fog: { ...base, id: 'fog', name: '濃霧', desc: '視野只有自己這一格，遇敵率 -20%', encounterMul: 0.8, sight: 0 },
  bounty: { ...base, id: 'bounty', name: '豐收', desc: '寶箱多 1 個，素材掉落 +50%', extraChests: 1, dropMul: 1.5, rarityMul: 1.5 },
  fierce: { ...base, id: 'fierce', name: '兇暴', desc: '敵人攻擊 +20%，經驗值 +30%', enemyAtkMul: 1.2, expMul: 1.3, rarityMul: 1.25 },
  calm: { ...base, id: 'calm', name: '靜謐', desc: '遇敵率 -40%，陷阱 +1', encounterMul: 0.6, extraTraps: 1 },
  starfall: { ...base, id: 'starfall', name: '星落', desc: '每層必有 1 個菁英怪，金幣 +50%', goldMul: 1.5, eliteEveryFloor: true },
  plain: { ...base, id: 'plain', name: '平穩', desc: '沒有特殊效果' },
};
