// eventScope.ts — 事件表現的歸屬：co-op 時別人的事件也會流進本地的事件迴圈，
// 「只屬於自己的表現」（HUD、鏡頭、提示、畫在本地玩家身上的特效）要用 isMine 擋掉。
import type { DelveEvent } from '../engine/game';
import type { Pid } from '../engine/actor';

/** 這個事件是不是本地玩家自己的（沒有 pid = 單機 / 世界事件 → 算自己的，單機行為不變） */
export function isMine(e: DelveEvent, localPid: Pid): boolean {
  return e.pid === undefined || e.pid === localPid;
}

/** 生死相關的個人表現（main.ts 事件迴圈抽出，方便測） */
export interface LifeIo {
  /** 死亡：音效 + 關背包 */
  onDeath(): void;
  /** 甦醒提示 */
  onRespawn(): void;
  /** 不滅：音效 + 提示 */
  onUndying(): void;
}

/** death / respawn / undying 只對自己觸發；回傳是否為這三種事件（不論是不是自己的） */
export function lifeEvent(e: DelveEvent, localPid: Pid, io: LifeIo): boolean {
  if (e.type !== 'death' && e.type !== 'respawn' && e.type !== 'undying') return false;
  if (!isMine(e, localPid)) return true;
  if (e.type === 'death') io.onDeath();
  else if (e.type === 'respawn') io.onRespawn();
  else io.onUndying();
  return true;
}
