// player.test.ts
import { describe, it, expect } from 'vitest';
import { makePlayer, movePlayer, hitPlayer, tickPlayer } from './player';
import { FIELD_W, PLAYER_SPEED, FOCUS_SPEED, INVULN_MS, PLAYER_SPAWN } from './constants';

describe('player', () => {
  it('makePlayer 以出生點與預設資源初始化', () => {
    const p = makePlayer();
    expect(p.x).toBe(PLAYER_SPAWN.x);
    expect(p.lives).toBe(3);
    expect(p.bombs).toBe(3);
    expect(p.power).toBe(1);
    expect(p.alive).toBe(true);
  });

  it('movePlayer 依方向與 dt 位移（一般速度）', () => {
    const p = makePlayer();
    const x0 = p.x;
    movePlayer(p, { dx: 1, dy: 0 }, 1000, 1); // 1 秒、移速倍率 1
    expect(p.x).toBeCloseTo(Math.min(x0 + PLAYER_SPEED, FIELD_W)); // 會被鉗在場內
  });

  it('低速模式速度減半', () => {
    const p = makePlayer();
    p.focus = true;
    const x0 = p.x;
    movePlayer(p, { dx: -1, dy: 0 }, 100, 1);
    expect(x0 - p.x).toBeCloseTo(FOCUS_SPEED * 0.1, 1);
  });

  it('斜向移動做向量正規化（不會 1.414 倍速）', () => {
    const p = makePlayer();
    const x0 = p.x, y0 = p.y;
    movePlayer(p, { dx: 1, dy: 1 }, 100, 1);
    const dist = Math.hypot(p.x - x0, p.y - y0);
    expect(dist).toBeCloseTo(PLAYER_SPEED * 0.1, 1);
  });

  it('位置鉗制在場域內', () => {
    const p = makePlayer();
    p.x = 2; p.y = 2;
    movePlayer(p, { dx: -1, dy: -1 }, 5000, 1);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });

  it('hitPlayer 扣命、降火力、給無敵、回到出生點', () => {
    const p = makePlayer();
    p.power = 3; p.x = 100; p.y = 100;
    hitPlayer(p);
    expect(p.lives).toBe(2);
    expect(p.power).toBe(2);
    expect(p.invulnMs).toBe(INVULN_MS);
    expect(p.x).toBe(PLAYER_SPAWN.x);
  });

  it('火力最低 1，命歸零時 alive=false', () => {
    const p = makePlayer();
    p.power = 1; p.lives = 1;
    hitPlayer(p);
    expect(p.power).toBe(1);
    expect(p.lives).toBe(0);
    expect(p.alive).toBe(false);
  });

  it('無敵期間 hitPlayer 不扣命', () => {
    const p = makePlayer();
    hitPlayer(p);
    const lives = p.lives;
    hitPlayer(p);
    expect(p.lives).toBe(lives);
  });

  it('tickPlayer 遞減無敵與開火冷卻', () => {
    const p = makePlayer();
    p.invulnMs = 500; p.fireCdMs = 80;
    tickPlayer(p, 100);
    expect(p.invulnMs).toBe(400);
    expect(p.fireCdMs).toBe(0); // 不為負
  });
});
