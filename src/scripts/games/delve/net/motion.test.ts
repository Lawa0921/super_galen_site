// motion.test.ts — 房主檢查客人回報的移動（C11）：速度上限、不卡進實心、不合法的數值。
import { describe, it, expect } from 'vitest';
import { World } from '../engine/world';
import { T } from '../engine/tiles';
import { PLAYER_H, PLAYER_W, TILE_SIZE } from '../engine/constants';
import type { RemoteMotion } from '../engine/actor';
import { checkMove, MOVE_MAX_VX, MOVE_MAX_VY, MOVE_TOL_PX } from './motion';

const FLOOR = 40;
const body = { w: PLAYER_W, h: PLAYER_H };

/** 平地：y ≥ 40 石頭，其餘空氣 */
function flat(): World {
  const w = new World(64, 64);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
  return w;
}

/** 腳底站在地面上、左緣 x（px） */
const at = (x: number, vx = 0, o: Partial<RemoteMotion> = {}): RemoteMotion => ({
  x, y: FLOOR * TILE_SIZE - PLAYER_H, vx, vy: 0, onGround: true, boating: false, climbing: false, facing: 1, ...o,
});

describe('checkMove', () => {
  const w = flat();
  const x0 = 10 * TILE_SIZE;

  it('常數：速度上限 = 最快移動 × 1.5、容差 2 格', () => {
    expect(MOVE_MAX_VX).toBe(840);
    expect(MOVE_MAX_VY).toBe(900);
    expect(MOVE_TOL_PX).toBe(2 * TILE_SIZE);
  });

  it('走路一步（dt 0.05、位移 9 px）→ ok', () => {
    expect(checkMove(at(x0), at(x0 + 9, 180), 0.05, body, w)).toBe('ok');
  });

  it('dt 0.05 位移 500 px → fast', () => {
    expect(checkMove(at(x0), at(x0 + 500, 180), 0.05, body, w)).toBe('fast');
  });

  it('位置落在石頭裡 → solid', () => {
    const inStone = at(x0, 0, { y: (FLOOR + 2) * TILE_SIZE });
    expect(checkMove(at(x0), { ...inStone, y: FLOOR * TILE_SIZE - PLAYER_H + 8 }, 0.05, body, w)).toBe('solid');
    expect(checkMove(null, inStone, 0.05, body, w)).toBe('solid');
  });

  it('NaN / 無限大 → bad', () => {
    expect(checkMove(at(x0), at(Number.NaN), 0.05, body, w)).toBe('bad');
    expect(checkMove(at(x0), at(x0, Number.POSITIVE_INFINITY), 0.05, body, w)).toBe('bad');
    expect(checkMove(null, { ...at(x0), vy: Number.NaN }, 0.05, body, w)).toBe('bad');
  });

  it('prev null 且合法 → ok（第一筆只檢查 solid，不看位移）', () => {
    expect(checkMove(null, at(40 * TILE_SIZE), 0.05, body, w)).toBe('ok');
  });

  it('坐船 270 px/s 持續 1 秒 → ok', () => {
    expect(checkMove(at(x0), at(x0 + 270, 270, { boating: true }), 1, body, w)).toBe('ok');
  });

  it('突進 560 px/s 0.2 秒 → ok', () => {
    expect(checkMove(at(x0), at(x0 + 112, 560), 0.2, body, w)).toBe('ok');
  });

  it('dtSec 夾在 [0.05, 2]：dt 0 當 0.05、dt 10 當 2', () => {
    expect(checkMove(at(x0), at(x0 + 60, 180), 0, body, w)).toBe('ok');
    expect(checkMove(at(x0), at(x0 + 80, 180), 0, body, w)).toBe('fast');
    expect(checkMove(at(x0), at(x0 + 600, 180), 10, body, w)).toBe('ok');
  });
});
