// motion.ts — 房主檢查客人回報的移動（C11、spec §5.3）：速度上限與不卡進實心。
// 不信任客人：數值不合法 → 'bad'；位移超過上限 → 'fast'；身體壓進實心 → 'solid'。不通過的由房主送 teleport 拉回。
// 純函式：不碰 RNG、不讀時間（dtSec 由呼叫端傳入）。
import type { RemoteMotion } from '../engine/actor';
import type { PhysEnv } from '../engine/entities';
import { overlapsSolid } from '../engine/physics';
import { JUMP_SPEED, MAX_FALL, RUN_SPEED, TILE_SIZE } from '../engine/constants';
import { DASH_SPEED } from '../engine/skills';
import { BOAT_SPEED } from '../engine/boat';

/** 水平速度上限（px/s）：最快的水平移動（跑速 × 2 涵蓋飾品 / 詞條、突進、划船）再 × 1.5 */
export const MOVE_MAX_VX = Math.max(RUN_SPEED * 2, DASH_SPEED, BOAT_SPEED) * 1.5;
/** 垂直速度上限（px/s）：最大落速 / 兩倍起跳速度再 × 1.5 */
export const MOVE_MAX_VY = Math.max(MAX_FALL, JUMP_SPEED * 2) * 1.5;
/** 位移容差（px）：抖動、上台階、攀邊 */
export const MOVE_TOL_PX = 2 * TILE_SIZE;
/** dtSec 的範圍（秒）：太短的間隔不讓上限變得苛刻、太長的（客人背景節流）不讓瞬移合法 */
const DT_MIN = 0.05, DT_MAX = 2;

export type MoveCheck = 'ok' | 'fast' | 'solid' | 'bad';

const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 檢查一筆回報：prev = 上一筆被接受的位置（null = 第一筆，只檢查 solid）；dtSec = 距上一筆的秒數（夾在 [0.05, 2]）；
 * body = 身體大小（px）；env = 碰撞查詢。
 */
export function checkMove(prev: { x: number; y: number } | null, next: RemoteMotion, dtSec: number, body: { w: number; h: number }, env: PhysEnv): MoveCheck {
  if (!fin(next.x) || !fin(next.y) || !fin(next.vx) || !fin(next.vy)) return 'bad';
  if (typeof next.onGround !== 'boolean' || typeof next.boating !== 'boolean' || typeof next.climbing !== 'boolean') return 'bad';
  if (next.facing !== 1 && next.facing !== -1) return 'bad';
  if (Math.abs(next.vx) > MOVE_MAX_VX || Math.abs(next.vy) > MOVE_MAX_VY) return 'fast';
  if (prev) {
    if (!fin(prev.x) || !fin(prev.y)) return 'bad';
    const dt = fin(dtSec) ? Math.max(DT_MIN, Math.min(DT_MAX, dtSec)) : DT_MIN;
    if (Math.abs(next.x - prev.x) > MOVE_MAX_VX * dt + MOVE_TOL_PX) return 'fast';
    if (Math.abs(next.y - prev.y) > MOVE_MAX_VY * dt + MOVE_TOL_PX) return 'fast';
  }
  if (overlapsSolid(env, next.x, next.y, body.w, body.h)) return 'solid';
  return 'ok';
}
