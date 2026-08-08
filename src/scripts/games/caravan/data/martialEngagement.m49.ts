import type { Move } from '../combat';
import type { FormationRow } from '../save';

export type EngagementBand = 'melee' | 'ranged' | 'mystic';

export interface FormationAttackProfile {
  engagement: EngagementBand;
  hitModifier: number;
  message: string;
}

/**
 * M49：把既有前後排從「只影響誰先挨打」提升成可預測的武器距離規則。
 * 真正的魔法由 arcana 規則判定，永遠優先視為 mystic，避免火球或重力術
 * 因為表面元素而被錯判成弓弩／近戰。
 */
export function engagementForMove(move: Move, isMystic: boolean): EngagementBand {
  if (isMystic) return 'mystic';
  if (move.engagement) return move.engagement;
  if (move.hitStat === 'dex' && move.element === 'pierce') return 'ranged';
  return 'melee';
}

/**
 * 不做硬性「不能出招」，避免文字介面出現按了沒反應的隱性規則。
 * 錯誤站位只給 -2 命中，並回傳可直接寫入戰鬥紀錄的理由。
 */
export function formationAttackProfile(
  row: FormationRow | undefined,
  move: Move,
  isMystic: boolean,
): FormationAttackProfile {
  const engagement = engagementForMove(move, isMystic);
  if (move.kind !== 'attack' || !row || engagement === 'mystic') {
    return { engagement, hitModifier: 0, message: '' };
  }
  if (engagement === 'melee' && row === 'back') {
    return {
      engagement,
      hitModifier: -2,
      message: `後排距離限制：${move.name}難以貼身施展，命中 -2。`,
    };
  }
  if (engagement === 'ranged' && row === 'front') {
    return {
      engagement,
      hitModifier: -2,
      message: `前排近身壓力：${move.name}難以穩定瞄準，命中 -2。`,
    };
  }
  return { engagement, hitModifier: 0, message: '' };
}

/**
 * M17 的守勢攔截原本沒有檢查站位，導致後排角色能隔空替前排擋刀。
 * 未帶 formationRow 的舊資料視同前排，維持舊存檔／測試相容。
 */
export function canGuardIntercept(row: FormationRow | undefined): boolean {
  return row !== 'back';
}
