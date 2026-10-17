// entities.ts — 通用實體（掉落物 / 投射物 / 怪物共用）的物理與容器。純邏輯，不碰 DOM。
//   · 物理：沿用 physics.moveBody（AABB vs tile 分軸 + 子步），外加重力 / 最大落速 / 彈跳。
//   · 介質（Medium）：PhysEnv.mediumAt 回傳身體所在介質（空氣 / 水 / 熔岩 / 蜂蜜，見 swim.ts）的
//     重力、阻力、最大落速倍率（掉落物另有浮力），所有實體自動套用（不必改各 AI）。
//   · 掉落物：彈跳落地、靠近玩家時被吸過去（磁石 = 吸取半徑變大），碰到就撿；背包放不下就留在地上。
import { moveBody, type Body, type MoveResult, type SolidQuery } from './physics';
import { ITEMS, type ItemId } from './items';
import { TILE_SIZE as S } from './constants';

// ── 介質 ───────────────────────────────────────────────
export interface Medium {
  gravityMul: number; dragMul: number; maxFallMul: number;
  /** 往上的浮力（px/s²；已乘浸入比例）——掉落物浮在液面 */
  buoy?: number;
}
export const AIR: Medium = { gravityMul: 1, dragMul: 1, maxFallMul: 1 };
export interface PhysEnv extends SolidQuery {
  /** 身體所在的介質（見 swim.ts；省略 = 空氣） */
  mediumAt?(b: Body): Medium;
  /** 掉落物用的介質（含浮力）；省略 = 同 mediumAt */
  itemMediumAt?(b: Body): Medium;
  /** 身體和液體的接觸（swim.liquidContact）；怪物 AI 用 */
  contactAt?(b: Body): { type: number; frac: number; head: boolean };
  /** tile 的液體（量 + 種類）；怕水的步行怪用 */
  liquidAt?(tx: number, ty: number): { amount: number; type: number };
}
export interface FallPhys { gravity: number; maxFall: number; }
export const ENTITY_GRAVITY = 1200;
export const ENTITY_MAX_FALL = 620;

/** 受重力的一步：回傳 moveBody 結果 + 撞地前的 vy（彈跳 / 落地判斷用） */
export function stepFalling(q: PhysEnv, b: Body, dt: number, phys: FallPhys = { gravity: ENTITY_GRAVITY, maxFall: ENTITY_MAX_FALL }, allowStep = false, item = false): MoveResult & { impactVy: number } {
  const m = (item ? q.itemMediumAt?.(b) : undefined) ?? q.mediumAt?.(b) ?? AIR;
  b.vy = Math.min(phys.maxFall * m.maxFallMul, b.vy + phys.gravity * m.gravityMul * dt);
  if (m.dragMul !== 1) { b.vx /= 1 + (m.dragMul - 1) * dt * 4; }
  if (m.buoy) { b.vy -= m.buoy * dt; b.vy /= 1 + (m.dragMul - 1) * dt; }
  const pre = b.vy;
  const res = moveBody(q, b, dt, allowStep && b.onGround);
  return { ...res, impactVy: res.hitY && pre > 0 ? pre : 0 };
}
/** 不受重力（飛行）的一步：撞牆時反彈（bounce 0..1） */
export function stepFlying(q: PhysEnv, b: Body, dt: number, bounce = 0.5): MoveResult {
  const vx = b.vx, vy = b.vy;
  const res = moveBody(q, b, dt, false);
  if (res.hitX) b.vx = -vx * bounce;
  if (res.hitY) b.vy = -vy * bounce;
  b.onGround = false;
  return res;
}
/** 穿牆移動（幽靈 / 首領 / 被吸取的掉落物） */
export function stepNoClip(b: Body, dt: number): void {
  b.x += b.vx * dt; b.y += b.vy * dt; b.onGround = false;
}

export function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
export function centerOf(b: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

// ── 掉落物 ─────────────────────────────────────────────
export interface DroppedItem { id: number; item: ItemId; count: number; body: Body; age: number; pickDelay: number; grabbed: boolean; }
export const ITEM_SIZE = 10;
/** 玩家 AABB 往外擴張多少 px 算「碰到」 */
export const PICKUP_GRAB_PX = 14;
/** 吸取半徑（格）：一般 / 裝了磁石 */
export const MAGNET_TILES = 5;
export const LODESTONE_TILES = 12;
export const MAX_DROPS = 300;
/** 同種掉落物在這個距離內（px）合併成一堆 */
const MERGE_PX = 14;

export interface PickupHost {
  /** 玩家 AABB */
  player: Body;
  /** 能收下的數量（0 = 背包滿） */
  room(item: ItemId, n: number): number;
  /** 收進背包，回傳實際收下的數量 */
  take(item: ItemId, n: number): number;
  /** 吸取半徑（px） */
  magnetPx: number;
  /** 活動範圍（px）：離玩家更遠的掉落物不更新（凍結） */
  activePx: number;
  /** 玩家死亡時不撿 */
  canPickup: boolean;
}

export class DropList {
  readonly list: DroppedItem[] = [];
  private nextId = 1;

  /** 在 (x,y)（px，中心）丟出一堆道具；同種靜止的堆就近合併 */
  spawn(item: ItemId, count: number, x: number, y: number, vx = 0, vy = -120, pickDelay = 0): DroppedItem | null {
    if (count <= 0) return null;
    const max = ITEMS[item].maxStack;
    for (const d of this.list) {
      if (d.item !== item || d.count >= max || d.grabbed) continue;
      const c = centerOf(d.body);
      if (Math.abs(c.x - x) < MERGE_PX && Math.abs(c.y - y) < MERGE_PX) {
        const k = Math.min(count, max - d.count);
        d.count += k; count -= k;
        if (count <= 0) return d;
      }
    }
    let last: DroppedItem | null = null;
    while (count > 0) {
      const k = Math.min(count, max);
      count -= k;
      last = {
        id: this.nextId++, item, count: k, age: 0, pickDelay, grabbed: false,
        body: { x: x - ITEM_SIZE / 2, y: y - ITEM_SIZE / 2, w: ITEM_SIZE, h: ITEM_SIZE, vx, vy, onGround: false, gfxOffY: 0 },
      };
      this.list.push(last);
    }
    while (this.list.length > MAX_DROPS) this.list.shift();
    return last;
  }

  /** 每步：物理（彈跳）→ 吸取 → 撿起。回傳這步撿到的 [item, n]。 */
  step(q: PhysEnv, host: PickupHost, dt: number): [ItemId, number][] {
    const got: [ItemId, number][] = [];
    const p = host.player, pcx = p.x + p.w / 2, pcy = p.y + p.h / 2;
    const grab = { x: p.x - PICKUP_GRAB_PX, y: p.y - PICKUP_GRAB_PX, w: p.w + PICKUP_GRAB_PX * 2, h: p.h + PICKUP_GRAB_PX * 2 };
    const ap2 = host.activePx * host.activePx, m2 = host.magnetPx * host.magnetPx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], b = d.body;
      const dx = pcx - (b.x + b.w / 2), dy = pcy - (b.y + b.h / 2), r2 = dx * dx + dy * dy;
      if (r2 > ap2) continue;
      d.age += dt;
      if (d.pickDelay > 0) d.pickDelay -= dt;
      const ready = host.canPickup && d.pickDelay <= 0 && host.room(d.item, 1) > 0;
      if (ready && overlaps(b, grab)) {
        const n = host.take(d.item, d.count);
        if (n > 0) {
          got.push([d.item, n]);
          d.count -= n;
          if (d.count <= 0) { this.list.splice(i, 1); continue; }
        }
      }
      if (ready && r2 < m2) {
        // 被吸過去：穿牆直線飛向玩家，越近越快
        d.grabbed = true;
        const r = Math.sqrt(r2) || 1, sp = Math.min(520, 180 + d.age * 260);
        b.vx += ((dx / r) * sp - b.vx) * Math.min(1, dt * 10);
        b.vy += ((dy / r) * sp - b.vy) * Math.min(1, dt * 10);
        stepNoClip(b, dt);
        continue;
      }
      if (d.grabbed) {
        // 吸到一半背包滿了 / 跑出半徑：恢復掉落（若卡在牆裡就往上推出）
        d.grabbed = false;
        b.vx *= 0.3; b.vy = Math.min(b.vy, 0);
      }
      const r = stepFalling(q, b, dt, undefined, false, true);
      if (r.impactVy > 140) b.vy = -r.impactVy * 0.32;
      if (b.onGround) b.vx *= Math.max(0, 1 - dt * 10);
      else b.vx *= Math.max(0, 1 - dt * 0.8);
    }
    return got;
  }

  /** 範圍內（px 矩形）的掉落物 */
  inRect(x: number, y: number, w: number, h: number): DroppedItem[] {
    return this.list.filter((d) => d.body.x < x + w && d.body.x + d.body.w > x && d.body.y < y + h && d.body.y + d.body.h > y);
  }
  clear(): void { this.list.length = 0; }
}

/** 掉落物生成時的初速：往上彈、左右隨機（seed 由呼叫端提供 0..1 值） */
export function popVelocity(u: number, v: number): { vx: number; vy: number } {
  return { vx: (u - 0.5) * 160, vy: -140 - v * 100 };
}
export const TILE_PX = S;
