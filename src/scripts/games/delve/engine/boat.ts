// boat.ts — 小木船（純函式）：找水線、判斷能不能上船、船上的一步（水平加速 / 放開減速 / 撞實心停、每刻貼齊水線）。
//   · 水線：身體中心那欄、腳底上下 2 格內「上一格沒有液體」的水格 → 那格的液面 px y（同 swim.ts 的液面算法）。
//   · 船上身體的腳底 = 水線 + BOAT_DRAFT（吃水）；不套游泳係數、不受重力。
//   · 擱淺（水沒了 / 貼齊水線會卡進實心）→ afloat = false，由遊戲層讓玩家下船。
import type { World } from './world';
import { LIQ, LIQ_MAX } from './liquidKind';
import { liquidContact } from './swim';
import { moveBody, overlapsSolid, type Body, type SolidQuery } from './physics';
import { TILE_SIZE as S } from './constants';

/** 船速上限 px/s、加速 px/s²、放開方向時的減速 px/s²、吃水 px（腳底在水線下多深） */
export const BOAT_SPEED = 270, BOAT_ACCEL = 600, BOAT_DRAG = 400, BOAT_DRAFT = 4;
/** 往腳底上下找水面的範圍（格） */
const SEARCH = 2;

/** 第 ty 列是不是水的表面（這格是水、上一格沒有液體） */
function isSurface(w: World, tx: number, ty: number): boolean {
  return w.getLiquid(tx, ty) > 0 && w.getLiquidType(tx, ty) === LIQ.WATER && w.getLiquid(tx, ty - 1) === 0;
}

/** 船身中心那欄、腳底上下 2 格內的水面 px y；沒有水 → null */
export function boatWaterline(w: World, b: Body): number | null {
  const tx = Math.floor((b.x + b.w / 2) / S), fr = Math.floor((b.y + b.h) / S);
  for (let ty = fr - SEARCH; ty <= fr + SEARCH; ty++) {
    if (isSurface(w, tx, ty)) return (ty + 1) * S - (w.getLiquid(tx, ty) / LIQ_MAX) * S;
  }
  return null;
}

/** 貼齊水線時身體的 y */
function floatY(b: Body, wl: number): number { return wl + BOAT_DRAFT - b.h; }

/** 身體碰到水（frac > 0）或腳下那格是水面；而且找得到水線、貼上去不會卡進實心 */
export function canBoard(w: World, b: Body): boolean {
  const c = liquidContact(w, b);
  const touch = (c.frac > 0 && c.type === LIQ.WATER) || isSurface(w, Math.floor((b.x + b.w / 2) / S), Math.floor((b.y + b.h) / S));
  if (!touch) return false;
  const wl = boatWaterline(w, b);
  return wl !== null && !overlapsSolid(w, b.x, floatY(b, wl), b.w, b.h);
}

function approach(v: number, target: number, amount: number): number {
  if (v < target) return Math.min(target, v + amount);
  if (v > target) return Math.max(target, v - amount);
  return v;
}

/** 貼齊水線；找不到水線或貼上去會卡進實心 → false（身體不動） */
function snap(q: SolidQuery, w: World, b: Body): boolean {
  const wl = boatWaterline(w, b);
  if (wl === null) return false;
  const y = floatY(b, wl);
  if (overlapsSolid(q, b.x, y, b.w, b.h)) return false;
  b.y = y;
  return true;
}

/**
 * 船上的一個固定步：貼水線 → 水平往 moveX × BOAT_SPEED 加速（放開時 BOAT_DRAG 減速）→ moveBody（不爬坡，撞到實心停）→ 再貼水線。
 * afloat = false：擱淺 / 水沒了（身體停在原地，由呼叫端讓玩家下船）。
 */
export function stepBoat(q: SolidQuery, w: World, b: Body, moveX: -1 | 0 | 1, dt: number): { afloat: boolean } {
  b.vy = 0;
  if (!snap(q, w, b)) { b.onGround = false; return { afloat: false }; }
  b.vx = moveX !== 0 ? approach(b.vx, moveX * BOAT_SPEED, BOAT_ACCEL * dt) : approach(b.vx, 0, BOAT_DRAG * dt);
  moveBody(q, b, dt, false);
  b.vy = 0;
  if (!snap(q, w, b)) { b.onGround = false; return { afloat: false }; }
  // 站在船上：動畫 / 摔落判定當成站著
  b.onGround = true;
  if (b.gfxOffY > 0) b.gfxOffY = Math.max(0, b.gfxOffY - 120 * dt);
  return { afloat: true };
}
