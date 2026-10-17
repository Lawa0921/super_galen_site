// combat.ts — 戰鬥數值（純函式）：裝備 → 玩家數值、防禦減傷、暴擊、擊退抗性。
//   受傷 = max(1, round(原始 − 防禦/2))（玩家與怪物同一套）；暴擊 ×2；擊退 × (1 − 抗性)。
import { ITEMS, type ArmorSetId } from './items';
import type { Equipment } from './equipment';
import type { Rng } from './rng';

export const BASE_HP = 100;
/** 生命晶核：每顆 +20，最多到 MAX_HP_CAP（不含飾品加成） */
export const LIFE_CORE_HP = 20;
export const MAX_HP_CAP = 300;
export const BASE_MANA = 40;

export interface SetBonus { defense: number; damage: number; crit: number; text: string; }
/** 全套加成 */
export const SET_BONUS: Record<ArmorSetId, SetBonus> = {
  wood: { defense: 1, damage: 0, crit: 0, text: '防禦 +1' },
  copper: { defense: 2, damage: 0, crit: 0, text: '防禦 +2' },
  iron: { defense: 3, damage: 0, crit: 0, text: '防禦 +3' },
  gold: { defense: 4, damage: 0, crit: 0.05, text: '防禦 +4、暴擊 +5%' },
  bone: { defense: 2, damage: 0.12, crit: 0, text: '防禦 +2、傷害 +12%' },
  molten: { defense: 4, damage: 0.12, crit: 0.05, text: '防禦 +4、傷害 +12%、暴擊 +5%' },
};

export interface PlayerStats {
  defense: number;
  /** 傷害倍率（1 = 基礎） */
  damageMul: number;
  /** 額外暴擊率（加在武器基礎暴擊上） */
  crit: number;
  /** 飾品帶來的最大生命加成 */
  maxHpBonus: number;
  /** 回血速度倍率 */
  regenMul: number;
  setBonus: ArmorSetId | null;
}

export function computeStats(eq: Equipment): PlayerStats {
  let defense = 0, damage = 0, crit = 0, maxHp = 0, regen = 0;
  const h = eq.get('head'), b = eq.get('body'), l = eq.get('legs');
  for (const it of [h, b, l]) if (it) defense += ITEMS[it].armor?.defense ?? 0;
  let setBonus: ArmorSetId | null = null;
  const sh = h ? ITEMS[h].armor?.set : undefined;
  if (sh && b && l && ITEMS[b].armor?.set === sh && ITEMS[l].armor?.set === sh) {
    setBonus = sh;
    const sb = SET_BONUS[sh];
    defense += sb.defense; damage += sb.damage; crit += sb.crit;
  }
  for (const a of eq.accessories()) {
    const s = ITEMS[a].stats;
    if (!s) continue;
    defense += s.defense ?? 0; damage += s.damage ?? 0; crit += s.crit ?? 0; maxHp += s.maxHp ?? 0; regen += s.regen ?? 0;
  }
  return { defense, damageMul: 1 + damage, crit, maxHpBonus: maxHp, regenMul: 1 + regen, setBonus };
}

/** 玩家受到的傷害 */
export function damageTaken(raw: number, defense: number): number {
  return Math.max(1, Math.round(raw - defense / 2));
}
/** 怪物受到的傷害（同公式；分開命名方便日後調整） */
export function enemyDamage(raw: number, defense: number): number {
  return Math.max(1, Math.round(raw - defense / 2));
}
export function rollCrit(chance: number, rng: Rng): boolean {
  return chance > 0 && rng.next() < chance;
}
export function knockbackScale(kb: number, resist: number): number {
  return kb * Math.max(0, Math.min(1, 1 - resist));
}

/** 摔落：超過 safe 格才受傷，每多一格 FALL_DMG_PER_TILE */
export const SAFE_FALL_TILES = 24;
export const FALL_DMG_PER_TILE = 7;
export function fallDamage(tiles: number, safe: number = SAFE_FALL_TILES): number {
  return tiles > safe ? Math.round((tiles - safe) * FALL_DMG_PER_TILE) : 0;
}

/** 回血：沒被打 REGEN_DELAY 秒後開始，速度隨時間增加（hp/s） */
export const REGEN_DELAY = 5;
export function regenRate(sinceHit: number, mul = 1): number {
  if (sinceHit < REGEN_DELAY) return 0;
  return Math.min(8, 1.5 + (sinceHit - REGEN_DELAY) * 0.6) * mul;
}
