// player.ts
import type { PlayerState } from './types';
import {
  FIELD_W, FIELD_H, PLAYER_SPEED, FOCUS_SPEED, PLAYER_SPAWN,
  START_LIVES, START_BOMBS, INVULN_MS, POWER_MAX,
} from './constants';

export function makePlayer(): PlayerState {
  return {
    x: PLAYER_SPAWN.x, y: PLAYER_SPAWN.y,
    lives: START_LIVES, bombs: START_BOMBS,
    power: 1, focus: false, invulnMs: 0, fireCdMs: 0, alive: true,
  };
}

/** dx/dy ∈ {-1,0,1}；speedMult 來自遺物（咒速羽毛）。 */
export function movePlayer(p: PlayerState, dir: { dx: number; dy: number }, dtMs: number, speedMult: number): void {
  let { dx, dy } = dir;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  dx /= len; dy /= len;
  const speed = (p.focus ? FOCUS_SPEED : PLAYER_SPEED) * speedMult;
  p.x = Math.min(FIELD_W, Math.max(0, p.x + dx * speed * (dtMs / 1000)));
  p.y = Math.min(FIELD_H, Math.max(0, p.y + dy * speed * (dtMs / 1000)));
}

/** 被彈：無敵中無效；扣命降火力、回出生點、給無敵；命盡 alive=false。 */
export function hitPlayer(p: PlayerState): void {
  if (p.invulnMs > 0 || !p.alive) return;
  p.lives -= 1;
  p.power = Math.max(1, p.power - 1);
  p.invulnMs = INVULN_MS;
  p.x = PLAYER_SPAWN.x; p.y = PLAYER_SPAWN.y;
  if (p.lives <= 0) { p.lives = 0; p.alive = false; }
}

export function tickPlayer(p: PlayerState, dtMs: number): void {
  p.invulnMs = Math.max(0, p.invulnMs - dtMs);
  p.fireCdMs = Math.max(0, p.fireCdMs - dtMs);
}

export function gainPower(p: PlayerState): void {
  p.power = Math.min(POWER_MAX, p.power + 1);
}
