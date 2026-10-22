// remotePlayers.ts — 其他玩家的來源（C9 / M-C2）：房主從 game.actors（poseOf）、客人從 NetGuest.peers()（內插過的 pose）
//   整理成 RemoteView；畫的部分交給 avatarDraw（跟本地玩家同一個 painter）。
import type { DelveGame } from '../engine/game';
import type { Pid } from '../engine/actor';
import { dollKey, type DollLook } from '../engine/doll';
import type { PlayerPose } from '../engine/pose';
import type { PeerView } from '../net/guest';

/**
 * 一位其他玩家：pose = 畫他需要的全部；time = pose.attack.at 對應的時鐘（世界時間秒：
 * 房主 = game.time；客人 = 跟身體內插同一個延遲時鐘 NetGuest.peerTime()，揮擊不會比身體早 100 ms）
 */
export interface RemoteView { pid: Pid; nick: string; pose: PlayerPose; look: DollLook | null; key: string; time: number }

/** 房主：game.actors 裡非本地的玩家 */
export function hostRemoteViews(game: DelveGame): RemoteView[] {
  const out: RemoteView[] = [];
  for (const a of game.actors.values()) {
    if (a.pid === game.localPid) continue;
    const d = game.withActor(a, () => game.doll());
    out.push({ pid: a.pid, nick: a.who?.nick ?? '', pose: game.poseOf(a.pid), look: d.look, key: d.key, time: game.time });
  }
  return out;
}

/** 客人：peers()（已內插）+ 內插用的那個時鐘 */
export function guestRemoteViews(peers: readonly PeerView[], time: number): RemoteView[] {
  return peers.map((p) => ({ pid: p.pid, nick: p.nick, pose: p.pose, look: p.look, key: p.look ? dollKey(p.look) : '', time }));
}
