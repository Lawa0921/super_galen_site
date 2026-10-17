// swim.ts — 身體與液體的接觸量測 + 介質係數（玩家 / 怪物 / 掉落物共用；純函式）。
//   · liquidContact：取身體中心那一欄，逐列算液面（量 / 255 × 16 px；上方也有液體的格算滿），
//     加總和身體重疊的高度 → frac（0..1）、主要種類、頭（身體頂端往下 6 px 那點）在不在液體裡。
//   · liquidMedium：給 entities.stepFalling 的 Medium（重力 / 阻力 / 落速倍率；掉落物另有浮力）。
//   · playerMedium：給 physics.stepPlayer 的玩家係數（跑速 / 跳躍 / 游泳）。
import type { World } from './world';
import { LIQ, LIQ_MAX } from './liquidKind';
import { AIR, type Medium } from './entities';
import { TILE_SIZE as S } from './constants';

export interface LiquidContact {
  /** 主要接觸的液體（LIQ.*；沒有 = NONE） */
  type: number;
  /** 身體高度被淹沒的比例 0..1 */
  frac: number;
  /** 頭在液體裡（會消耗呼吸） */
  head: boolean;
}
export const NO_CONTACT: LiquidContact = Object.freeze({ type: LIQ.NONE, frac: 0, head: false }) as LiquidContact;

export interface BoxLike { x: number; y: number; w: number; h: number; }

/** 第 ty 列、第 tx 欄液體頂端的 px y（沒有液體 = Infinity） */
function liquidTop(w: World, tx: number, ty: number): number {
  const a = w.getLiquid(tx, ty);
  if (a === 0) return Infinity;
  if (w.getLiquid(tx, ty - 1) > 0) return ty * S;
  return (ty + 1) * S - (a / LIQ_MAX) * S;
}

export function liquidContact(w: World, b: BoxLike): LiquidContact {
  const tx = Math.floor((b.x + b.w / 2) / S);
  const ty0 = Math.floor(b.y / S), ty1 = Math.floor((b.y + b.h - 1e-6) / S);
  let water = 0, lava = 0, honey = 0;
  const bot = b.y + b.h;
  for (let ty = ty0; ty <= ty1; ty++) {
    const top = liquidTop(w, tx, ty);
    if (top === Infinity) continue;
    const ov = Math.min(bot, (ty + 1) * S) - Math.max(b.y, top);
    if (ov <= 0) continue;
    const t = w.getLiquidType(tx, ty);
    if (t === LIQ.WATER) water += ov; else if (t === LIQ.LAVA) lava += ov; else if (t === LIQ.HONEY) honey += ov;
  }
  const sum = water + lava + honey;
  if (sum <= 0) return NO_CONTACT;
  const type = lava >= water && lava >= honey ? LIQ.LAVA : honey > water ? LIQ.HONEY : LIQ.WATER;
  const hy = b.y + Math.min(6, b.h * 0.2), hty = Math.floor(hy / S);
  const head = liquidTop(w, tx, hty) <= hy;
  return { type, frac: Math.min(1, sum / b.h), head };
}

/** 掉落物在液體裡的浮力（px/s²，× 浸入比例） */
export const ITEM_BUOY: Record<number, number> = { [LIQ.WATER]: 1000, [LIQ.LAVA]: 1000, [LIQ.HONEY]: 640 };
const WATER_M: Medium = { gravityMul: 0.5, dragMul: 3, maxFallMul: 0.5 };
const HONEY_M: Medium = { gravityMul: 0.3, dragMul: 7, maxFallMul: 0.3 };

/** 實體介質：有接觸就整個套用液體係數（泰拉的「濕了」判定）；item = 掉落物（加浮力） */
export function liquidMedium(c: LiquidContact, item = false): Medium {
  if (c.frac <= 0 || c.type === LIQ.NONE) return AIR;
  const base = c.type === LIQ.HONEY ? HONEY_M : WATER_M;
  if (!item) return base;
  return { ...base, buoy: (ITEM_BUOY[c.type] ?? 0) * c.frac };
}

/** 玩家在液體裡的移動係數 */
export interface PlayerMedium {
  gravityMul: number; maxFallMul: number; runMul: number; jumpMul: number;
  /** 碰到液體（任何深度）：按跳可以起跳（游出水面 / 從水裡跳） */
  inLiquid: boolean;
  /** 夠深（≥ SWIM_FRAC）：按住跳往上游 */
  swim: boolean;
  swimSpeed: number; swimAccel: number;
}
export const SWIM_FRAC = 0.3;
export function playerMedium(c: LiquidContact): PlayerMedium | undefined {
  if (c.frac <= 0 || c.type === LIQ.NONE) return undefined;
  const swim = c.frac >= SWIM_FRAC;
  if (c.type === LIQ.HONEY) return { gravityMul: 0.3, maxFallMul: 0.3, runMul: 0.35, jumpMul: 0.55, inLiquid: true, swim, swimSpeed: 70, swimAccel: 420 };
  return { gravityMul: 0.5, maxFallMul: 0.5, runMul: 0.5, jumpMul: 0.75, inLiquid: true, swim, swimSpeed: 170, swimAccel: 900 };
}
