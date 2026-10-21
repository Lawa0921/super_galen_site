// entities.ts — 通用實體（掉落物 / 投射物 / 怪物共用）的物理與容器。純邏輯，不碰 DOM。
//   · 物理：沿用 physics.moveBody（AABB vs tile 分軸 + 子步），外加重力 / 最大落速 / 彈跳。
//   · 介質（Medium）：PhysEnv.mediumAt 回傳身體所在介質（空氣 / 水 / 熔岩 / 蜂蜜，見 swim.ts）的
//     重力、阻力、最大落速倍率（掉落物另有浮力），所有實體自動套用（不必改各 AI）。
//   · 掉落物：彈跳落地、靠近玩家時被吸過去（磁石 = 吸取半徑變大），碰到就撿；背包放不下就留在地上。
import { moveBody, type Body, type MoveResult, type SolidQuery } from './physics';
import { ITEMS, type ItemId } from './items';
import type { Gear } from './gear';
import { cloneTint, type Tint } from './tint';
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
/**
 * gear = 帶詞條的裝備；tint = 帶顏色的時裝（兩者都一件一個、不合併）。
 * owner / ownerDelay = 玩家丟出的（tossSlot）：丟的人 ownerDelay 秒內撿不回來、也吸不過去，其他人照常撿。
 * 只有丟出的才有這兩個鍵；倒數完就刪掉（之後當一般掉落物）。不存檔。
 */
export interface DroppedItem { id: number; item: ItemId; count: number; body: Body; age: number; pickDelay: number; grabbed: boolean; gear?: Gear; tint?: Tint; owner?: string; ownerDelay?: number; }
/** 丟出的人與他的撿取延遲（秒） */
export interface TossOwner { pid: string; delay: number; }
export const ITEM_SIZE = 10;
/** 玩家 AABB 往外擴張多少 px 算「碰到」 */
export const PICKUP_GRAB_PX = 14;
/** 吸取半徑（格）：一般 / 裝了磁石 */
export const MAGNET_TILES = 5;
export const LODESTONE_TILES = 12;
export const MAX_DROPS = 300;
/** 同種掉落物在這個距離內（px）合併成一堆 */
const MERGE_PX = 14;

/** 一個能撿東西的玩家 */
export interface Picker {
  /** 玩家 AABB */
  body: Body;
  /** 能收下的數量（0 = 背包滿） */
  room(item: ItemId, n: number): number;
  /** 收進背包，回傳實際收下的數量（gear = 帶詞條的裝備；tint = 帶顏色的時裝） */
  take(item: ItemId, n: number, gear?: Gear, tint?: Tint): number;
  /** 吸取半徑（px） */
  magnetPx: number;
  /** 玩家死亡時不撿 */
  canPickup: boolean;
  /** 玩家 id：自己丟出、還在倒數的掉落物略過他 */
  pid?: string;
}

export interface PickupHost {
  /** 所有玩家（順序 = 距離相同時的優先順序） */
  pickers: Picker[];
  /** 活動範圍（px）：離每個玩家都更遠的掉落物不更新（凍結） */
  activePx: number;
}

export class DropList {
  readonly list: DroppedItem[] = [];
  private nextId = 1;

  /**
   * 在 (x,y)（px，中心）丟出一堆道具；同種靜止的堆就近合併（帶詞條的裝備 / 帶顏色的時裝不合併、一件一個）。
   * owner = 玩家丟出的：帶 owner 的堆只跟同一個 owner 的堆合併（併進去時倒數取較長的），一般掉落物照舊互相合併。
   */
  spawn(item: ItemId, count: number, x: number, y: number, vx = 0, vy = -120, pickDelay = 0, gear?: Gear, tint?: Tint, owner?: TossOwner): DroppedItem | null {
    if (count <= 0) return null;
    const max = ITEMS[item].maxStack;
    const mark = (d: DroppedItem): DroppedItem => {
      if (owner) { d.owner = owner.pid; d.ownerDelay = owner.delay; }
      return d;
    };
    if (gear || tint) {
      const d: DroppedItem = mark({
        id: this.nextId++, item, count: 1, age: 0, pickDelay, grabbed: false,
        body: { x: x - ITEM_SIZE / 2, y: y - ITEM_SIZE / 2, w: ITEM_SIZE, h: ITEM_SIZE, vx, vy, onGround: false, gfxOffY: 0 },
      });
      if (gear) d.gear = gear;
      if (tint) d.tint = cloneTint(tint);
      this.list.push(d);
      while (this.list.length > MAX_DROPS) this.list.shift();
      return d;
    }
    for (const d of this.list) {
      if (d.item !== item || d.count >= max || d.grabbed || d.gear || d.tint || d.owner !== owner?.pid) continue;
      const c = centerOf(d.body);
      if (Math.abs(c.x - x) < MERGE_PX && Math.abs(c.y - y) < MERGE_PX) {
        const k = Math.min(count, max - d.count);
        d.count += k; count -= k;
        if (owner) d.ownerDelay = Math.max(d.ownerDelay ?? 0, owner.delay);
        if (count <= 0) return d;
      }
    }
    let last: DroppedItem | null = null;
    while (count > 0) {
      const k = Math.min(count, max);
      count -= k;
      last = mark({
        id: this.nextId++, item, count: k, age: 0, pickDelay, grabbed: false,
        body: { x: x - ITEM_SIZE / 2, y: y - ITEM_SIZE / 2, w: ITEM_SIZE, h: ITEM_SIZE, vx, vy, onGround: false, gfxOffY: 0 },
      });
      this.list.push(last);
    }
    while (this.list.length > MAX_DROPS) this.list.shift();
    return last;
  }

  /**
   * 每步：物理（彈跳）→ 吸取 → 撿起。每個掉落物只歸一個人：距離最近、活著、背包收得下的那個玩家吸 / 撿
   * （距離相同取 pickers 順序在前的）；丟出的人在 ownerDelay 倒數完之前不算（撿不到也吸不到）。
   * 回傳這步撿到的 [item, n, gear, tint, picker 的索引]。
   */
  step(q: PhysEnv, host: PickupHost, dt: number): [ItemId, number, Gear | undefined, Tint | undefined, number][] {
    const got: [ItemId, number, Gear | undefined, Tint | undefined, number][] = [];
    const ps = host.pickers.map((pk) => {
      const p = pk.body;
      return {
        pk, cx: p.x + p.w / 2, cy: p.y + p.h / 2, m2: pk.magnetPx * pk.magnetPx,
        grab: { x: p.x - PICKUP_GRAB_PX, y: p.y - PICKUP_GRAB_PX, w: p.w + PICKUP_GRAB_PX * 2, h: p.h + PICKUP_GRAB_PX * 2 },
      };
    });
    const ap2 = host.activePx * host.activePx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i], b = d.body;
      const bx = b.x + b.w / 2, by = b.y + b.h / 2;
      // 離每個玩家都超過活動範圍 → 凍結
      let near = false;
      for (const p of ps) { const dx = p.cx - bx, dy = p.cy - by; if (dx * dx + dy * dy <= ap2) { near = true; break; } }
      if (!near) continue;
      d.age += dt;
      if (d.pickDelay > 0) d.pickDelay -= dt;
      if (d.ownerDelay !== undefined) {
        d.ownerDelay -= dt;
        if (d.ownerDelay <= 0) { delete d.owner; delete d.ownerDelay; }
      }
      // 歸誰：最近的、可以撿的人
      let k = -1, r2 = Infinity, dx = 0, dy = 0;
      if (d.pickDelay <= 0) {
        for (let j = 0; j < ps.length; j++) {
          const p = ps[j];
          if (!p.pk.canPickup) continue;
          if (d.owner !== undefined && p.pk.pid === d.owner) continue; // 自己丟的、還在倒數（倒數完 owner 就刪了）
          const ex = p.cx - bx, ey = p.cy - by, e2 = ex * ex + ey * ey;
          if (e2 >= r2 || p.pk.room(d.item, 1) <= 0) continue;
          k = j; r2 = e2; dx = ex; dy = ey;
        }
      }
      const ready = k >= 0;
      if (ready && overlaps(b, ps[k].grab)) {
        const n = ps[k].pk.take(d.item, d.count, d.gear, d.tint);
        if (n > 0) {
          got.push([d.item, n, d.gear, d.tint, k]);
          d.count -= n;
          if (d.count <= 0) { this.list.splice(i, 1); continue; }
        }
      }
      if (ready && r2 < ps[k].m2) {
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
