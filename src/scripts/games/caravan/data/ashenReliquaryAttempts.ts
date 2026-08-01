import type { SaveData } from '../save';
import { reliquaryBattleAccess, type ReliquaryBattleStage } from './ashenReliquaryCombat';

function attemptFlag(stage: ReliquaryBattleStage): string {
  return `ashen-reliquary:battle-attempt:${stage}`;
}

export interface ReliquaryAttemptStart {
  receipt: string;
  abandonmentPenalty: string | null;
}

/**
 * 戰鬥進場立即寫入嘗試收據。若上次嘗試未正常結算，代表玩家重整、關頁或中途逃避，
 * 再次進場會消耗一份乾糧；沒有乾糧時由隊長承受一趟養傷。
 */
export function beginReliquaryBattleAttempt(
  save: SaveData,
  stage: ReliquaryBattleStage,
): ReliquaryAttemptStart {
  const access = reliquaryBattleAccess(save, stage);
  if (!access.allowed) throw new Error(access.reason);
  const receipt = attemptFlag(stage);
  let abandonmentPenalty: string | null = null;
  if (save.flags[receipt] === true) {
    if ((save.inventory['dried-rations'] ?? 0) > 0) {
      save.inventory['dried-rations'] -= 1;
      abandonmentPenalty = '上次戰鬥未正常結算，重新集結消耗乾糧 1。';
    } else {
      save.protagonist.injuredForTrips = Math.max(save.protagonist.injuredForTrips, 1);
      abandonmentPenalty = '上次戰鬥未正常結算且沒有乾糧，隊長承受一趟養傷。';
    }
  }
  save.flags[receipt] = true;
  return { receipt, abandonmentPenalty };
}

/** 正常勝利、敗北或撤退都會關閉嘗試收據；只有中途關頁才留下。 */
export function finishReliquaryBattleAttempt(save: SaveData, stage: ReliquaryBattleStage): void {
  save.flags[attemptFlag(stage)] = false;
}
