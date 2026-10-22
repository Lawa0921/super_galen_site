// eventScope.ts — 事件表現的歸屬：co-op 時別人的事件也會流進本地的事件迴圈，
// 「只屬於自己的表現」（HUD、鏡頭、提示、畫在本地玩家身上的特效）要用 isMine 擋掉。
import type { DelveEvent } from '../engine/game';
import type { Pid } from '../engine/actor';

/** 這個事件是不是本地玩家自己的（沒有 pid = 單機 / 世界事件 → 算自己的，單機行為不變） */
export function isMine(e: DelveEvent, localPid: Pid): boolean {
  return e.pid === undefined || e.pid === localPid;
}

/** 生死 / 睡覺相關的個人表現（main.ts 事件迴圈抽出，方便測） */
export interface LifeIo {
  /** 死亡：音效 + 關背包 */
  onDeath(): void;
  /** 甦醒提示 */
  onRespawn(): void;
  /** 不滅：音效 + 提示 */
  onUndying(): void;
  /** 就寢：音效 + 關背包 */
  onSleepStart(): void;
  /** 隊友倒下 / 回來的低調提示（nick 空 = 「隊友」） */
  onOtherDown(nick: string): void;
  onOtherBack(nick: string): void;
  /** pid → 暱稱（沒有 = ''） */
  nickOf(pid: Pid): string;
}

/** death / respawn / undying / sleep start 只對自己觸發（別人的 death / respawn 只給一行隊友提示）；回傳是否已處理 */
export function lifeEvent(e: DelveEvent, localPid: Pid, io: LifeIo): boolean {
  if (e.type === 'sleep') {
    if (e.phase !== 'start') return false;
    if (isMine(e, localPid)) io.onSleepStart();
    return true;
  }
  if (e.type !== 'death' && e.type !== 'respawn' && e.type !== 'undying') return false;
  if (!isMine(e, localPid)) {
    if (e.type === 'death') io.onOtherDown(io.nickOf(e.pid as Pid) || '隊友');
    else if (e.type === 'respawn') io.onOtherBack(io.nickOf(e.pid as Pid) || '隊友');
    return true;
  }
  if (e.type === 'death') io.onDeath();
  else if (e.type === 'respawn') io.onRespawn();
  else io.onUndying();
  return true;
}

/** 揮擊音效：大家都聽得到（含別人的）；回傳這一下會不會動到背包（投擲 / 弓） */
export interface AttackSound { bow(): void; magic(): void; throwSfx(): void; swing(heavy: boolean): void }
export function attackSfx(kind: string, sound: AttackSound): boolean {
  if (kind === 'bow') sound.bow(); else if (kind === 'staff') sound.magic();
  else if (kind === 'throw' || kind === 'boomerang') sound.throwSfx(); else sound.swing(kind === 'broadsword');
  return kind === 'throw' || kind === 'bow';
}
