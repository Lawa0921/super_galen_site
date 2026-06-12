// collision.ts
import type { PlayerState } from './types';
import type { BulletPool } from './bullet';
import { PLAYER_HIT_R, GRAZE_R } from './constants';

export function circleHit(ax: number, ay: number, ar: number, bx: number, by: number, br: number): boolean {
  const dx = ax - bx, dy = ay - by, rr = ar + br;
  return dx * dx + dy * dy < rr * rr;
}

export interface SweepResult { hit: boolean; grazes: number; }

/**
 * 自機 vs 全部敵彈：先判被彈（內圈，命中即回收該彈），再判擦彈（外圈，每彈一次）。
 * 無敵中不判被彈（仍可擦彈累積超載）。
 */
export function sweepPlayerVsBullets(p: PlayerState, pool: BulletPool, hitboxMult: number): SweepResult {
  const hitR = PLAYER_HIT_R * hitboxMult;
  let grazes = 0;
  let hit = false;
  for (const b of pool.items) {
    if (!b.active) continue;
    if (p.invulnMs <= 0 && circleHit(p.x, p.y, hitR, b.x, b.y, b.r)) {
      b.active = false;
      hit = true;
      continue;
    }
    if (!b.grazed && circleHit(p.x, p.y, GRAZE_R, b.x, b.y, b.r)) {
      b.grazed = true;
      grazes++;
    }
  }
  return { hit, grazes };
}
