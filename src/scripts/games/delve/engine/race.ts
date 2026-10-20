// race.ts — 種族被動表（純資料）。種族索引見 appearance.ts 的 RACES；數值加在 SKILL_CAPS 之外（不吃技能上限）。
// 壞索引 / 缺值一律當人類。每族只動自己的欄位，其餘為中性值（加成 0、倍率 1）。
import { RACES, type RaceId } from './appearance';

export interface RaceMods {
  /** 經驗加成（%） */
  xpPct: number;
  /** 額外光源半徑 */
  light: number;
  /** 挖掘速度倍率 */
  mineMul: number;
  /** 額外免傷摔落格數 */
  safeFall: number;
  /** 跳躍「高度」倍率（遊戲端換成初速時開根號：高度 ∝ 初速²） */
  jumpMul: number;
  /** 燃燒傷害倍率 */
  burnMul: number;
  /** 岩漿傷害倍率 */
  lavaMul: number;
}

const NEUTRAL: RaceMods = { xpPct: 0, light: 0, mineMul: 1, safeFall: 0, jumpMul: 1, burnMul: 1, lavaMul: 1 };
const MODS: Record<RaceId, RaceMods> = {
  human: { ...NEUTRAL, xpPct: 10 },
  elf: { ...NEUTRAL, light: 1 },
  dwarf: { ...NEUTRAL, mineMul: 1.15 },
  catfolk: { ...NEUTRAL, safeFall: 6, jumpMul: 1.08 },
  dragonkin: { ...NEUTRAL, burnMul: 0.5, lavaMul: 0.75 },
};

/** 種族索引 → 被動（壞索引 → 人類）；回傳新物件，呼叫端改了也不影響表 */
export function raceMods(race: number): RaceMods {
  const id = (Number.isInteger(race) ? RACES[race]?.id : undefined) as RaceId | undefined;
  return { ...MODS[id ?? 'human'] };
}

/** 外觀畫面的一行說明 */
export const RACE_BLURB: Record<RaceId, string> = {
  human: '人類：經驗值 +10%',
  elf: '精靈：視野（光源）+1',
  dwarf: '矮人：挖掘速度 +15%',
  catfolk: '貓族：摔落多耐 6 格、跳得更高 +8%',
  dragonkin: '龍裔：燃燒傷害 -50%、岩漿傷害 -25%',
};
