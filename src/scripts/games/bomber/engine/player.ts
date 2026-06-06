// player.ts
import type { Player, Dir, Vec } from './types';
import { SPEED_MS, SPAWN, BASE_FIRE, BASE_BOMBS, START_LIVES } from './constants';

export function speedMs(speedLevel: number): number {
  return SPEED_MS[Math.min(Math.max(speedLevel, 0), SPEED_MS.length - 1)];
}

export function dirDelta(dir: Dir): Vec {
  switch (dir) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

/** 以基礎能力在出生點建立玩家。 */
export function makePlayer(): Player {
  return {
    x: SPAWN.x, y: SPAWN.y, prevX: SPAWN.x, prevY: SPAWN.y, dir: 'down',
    lives: START_LIVES, fireRange: BASE_FIRE, maxBombs: BASE_BOMBS, speedLevel: 0,
    shield: false, invulnMs: 0, moveCooldownMs: 0, alive: true,
  };
}
