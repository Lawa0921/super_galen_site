// player.test.ts
import { describe, it, expect } from 'vitest';
import { speedMs, dirDelta, makePlayer } from './player';
import { SPEED_MS, SPAWN, BASE_FIRE, BASE_BOMBS, START_LIVES } from './constants';

describe('speedMs', () => {
  it('依 speedLevel 取移動耗時、超出上限取最快', () => {
    expect(speedMs(0)).toBe(SPEED_MS[0]);
    expect(speedMs(99)).toBe(SPEED_MS[SPEED_MS.length - 1]);
  });
});

describe('dirDelta', () => {
  it('四方向位移正確', () => {
    expect(dirDelta('up')).toEqual({ x: 0, y: -1 });
    expect(dirDelta('right')).toEqual({ x: 1, y: 0 });
    expect(dirDelta('down')).toEqual({ x: 0, y: 1 });
    expect(dirDelta('left')).toEqual({ x: -1, y: 0 });
  });
});

describe('makePlayer', () => {
  it('在出生點以基礎能力建立', () => {
    const p = makePlayer();
    expect(p).toMatchObject({ x: SPAWN.x, y: SPAWN.y, fireRange: BASE_FIRE, maxBombs: BASE_BOMBS, lives: START_LIVES, speedLevel: 0, shield: false, alive: true });
  });
});
