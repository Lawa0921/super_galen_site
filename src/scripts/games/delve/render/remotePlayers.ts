// remotePlayers.ts — 其他玩家的身體（C9）：房主從 game.actors、客人從 NetGuest.peers() 取 RemoteView，
//   每個 pid 一個 PlayerAnimator，畫紙娃娃身體 + 頭兩張（v1 不畫手持物和揮擊手臂）。
import type { DelveGame } from '../engine/game';
import { dollKey, type DollLook } from '../engine/doll';
import { PLAYER_H, PLAYER_W } from '../engine/constants';
import type { PeerView } from '../net/guest';
import { FH, FW, type Sprites } from './sprites';
import { PlayerAnimator } from './playerAnim';
import { SHEET, type SheetAnim } from './avatarArt';

export interface RemoteView { pid: string; nick: string; look: DollLook | null; key: string; x: number; y: number; vx: number; vy: number; facing: 1 | -1; dead: boolean }

/** 房主：game.actors 裡非本地的玩家 */
export function hostRemoteViews(game: DelveGame): RemoteView[] {
  const out: RemoteView[] = [];
  for (const a of game.actors.values()) {
    if (a.pid === game.localPid) continue;
    const d = game.withActor(a, () => game.doll());
    out.push({
      pid: a.pid, nick: a.who?.nick ?? '', look: d.look, key: d.key,
      x: a.player.x, y: a.player.y, vx: a.player.vx, vy: a.player.vy, facing: a.facing, dead: a.dead,
    });
  }
  return out;
}

/** 客人：PeerView 沒帶速度 → 用前一幀的位置差 / dt 算；不在清單裡的 pid 狀態丟掉 */
export class GuestViews {
  private last = new Map<string, { x: number; y: number }>();
  views(peers: PeerView[], dt: number): RemoteView[] {
    const out: RemoteView[] = [], next = new Map<string, { x: number; y: number }>();
    for (const p of peers) {
      const prev = this.last.get(p.pid);
      const vx = prev && dt > 0 ? (p.x - prev.x) / dt : 0, vy = prev && dt > 0 ? (p.y - prev.y) / dt : 0;
      next.set(p.pid, { x: p.x, y: p.y });
      out.push({ pid: p.pid, nick: p.nick, look: p.look, key: p.look ? dollKey(p.look) : '', x: p.x, y: p.y, vx, vy, facing: p.facing, dead: p.dead });
    }
    this.last = next;
    return out;
  }
}

export class RemotePlayers {
  private anims = new Map<string, PlayerAnimator>();
  get size(): number { return this.anims.size; }

  /** toPx：世界座標（Body，px）→ 繪製座標（含鏡頭）。畫在人物腳底置中 */
  draw(ctx: CanvasRenderingContext2D, sprites: Sprites, views: RemoteView[], dt: number, toPx: (x: number, y: number) => { x: number; y: number }): void {
    const seen = new Set<string>();
    for (const v of views) {
      seen.add(v.pid);
      let an = this.anims.get(v.pid);
      if (!an) { an = new PlayerAnimator(); this.anims.set(v.pid, an); }
      const o = an.update({ dt, dead: v.dead, climbing: false, mantle: null, onGround: Math.abs(v.vy) < 0.05, vx: v.vx, vy: v.vy, swim: false, sinceHurt: 99 });
      if (v.dead || !v.look) continue;
      const sheetAnim = o.anim as SheetAnim;
      const cell = SHEET[sheetAnim];
      if (!cell) continue;
      const fi = cell[0] + Math.min(o.frame, cell[1] - 1);
      const sheet = sprites.sheetFor(v.look, v.key, fi);
      const meta = sheet.meta[fi];
      if (!meta || !sheet.ready(fi)) continue;
      const c = toPx(Math.round(v.x + PLAYER_W / 2), Math.round(v.y + PLAYER_H));
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(v.facing, 1);
      const ox = -FW / 2 + (meta.ox ?? 0), oy = -FH;
      ctx.drawImage(sheet.canvas, fi * FW, 0, FW, FH, ox, oy, FW, FH);
      ctx.drawImage(sheet.canvas, fi * FW, FH, FW, FH, ox, oy, FW, FH);
      ctx.restore();
    }
    for (const k of this.anims.keys()) if (!seen.has(k)) this.anims.delete(k);
  }
}
