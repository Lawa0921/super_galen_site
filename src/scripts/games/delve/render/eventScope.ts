// eventScope.ts — 事件表現的歸屬：co-op 時別人的事件也會流進本地的事件迴圈，
// 「只屬於自己的表現」（HUD、鏡頭、提示、畫在本地玩家身上的特效）要用 isMine 擋掉。
import type { DelveEvent } from '../engine/game';
import type { Pid } from '../engine/actor';
import { PLAYER_H, PLAYER_W, TILE_SIZE } from '../engine/constants';

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

/** 開金寶箱 / 地城門的提示：只給自己（別人的 → null，背包也不跟著刷新） */
export function unlockToast(e: DelveEvent, localPid: Pid): string | null {
  if (e.type !== 'unlock' || !isMine(e, localPid)) return null;
  return e.item === 'golden_key' ? '用金鑰匙打開了金寶箱' : '用地城鑰匙打開了門';
}

/** 別人在畫面往外這麼多格內，他的音效 / 提示照放（挖掘 / 揮擊的位置離身體最多幾格） */
export const HEAR_MARGIN = 6;
/** 只是「附近聽得到 / 看得到」的事件（音效 / 小提示）：別人在畫面外就略過；首領 / 據點 / 睡覺這類世界層級的不在內 */
const NEARBY: ReadonlySet<DelveEvent['type']> = new Set<DelveEvent['type']>([
  'attack', 'hit', 'kill', 'splash', 'liquidtool', 'fish', 'crate', 'eat', 'toss', 'loot', 'chain', 'airjump', 'climb',
  'heal', 'shot', 'impact', 'mine', 'place', 'unlock', 'door',
]);

/**
 * 別人的事件、而他在畫面外（HEAR_MARGIN 格之外）→ true：不放音效 / 提示。
 * 位置看事件的主人（views = 這一幀畫的其他玩家；身體中心換成 tile）；自己的 / 沒 pid 的 / 不知道在哪的 → false（照舊）
 */
export function offscreenOther(
  e: DelveEvent, localPid: Pid, views: readonly { pid: Pid; pose: { x: number; y: number } }[],
  near: (tx: number, ty: number, margin: number) => boolean,
): boolean {
  if (isMine(e, localPid) || !NEARBY.has(e.type)) return false;
  const v = views.find((q) => q.pid === e.pid);
  if (!v) return false;
  return !near(Math.floor((v.pose.x + PLAYER_W / 2) / TILE_SIZE), Math.floor((v.pose.y + PLAYER_H / 2) / TILE_SIZE), HEAR_MARGIN);
}

/** 揮擊音效：大家都聽得到（含別人的）；回傳這一下會不會動到背包（投擲 / 弓） */
export interface AttackSound { bow(): void; magic(): void; throwSfx(): void; swing(heavy: boolean): void }
export function attackSfx(kind: string, sound: AttackSound): boolean {
  if (kind === 'bow') sound.bow(); else if (kind === 'staff') sound.magic();
  else if (kind === 'throw' || kind === 'boomerang') sound.throwSfx(); else sound.swing(kind === 'broadsword');
  return kind === 'throw' || kind === 'bow';
}
