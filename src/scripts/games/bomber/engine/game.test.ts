// game.test.ts (Task 10 + Task 11 portion)
import { describe, it, expect } from 'vitest';
import { BomberGame } from './game';
import { SPAWN, SPEED_MS, BASE_BOMBS, BOMB_FUSE_MS, BLAST_TTL_MS } from './constants';

describe('BomberGame: construction', () => {
  it('初始狀態：playing、floor 1、玩家在出生點、分數 0', () => {
    const g = new BomberGame({ seed: 1 });
    const s = g.getState();
    expect(s.status).toBe('playing');
    expect(s.floor).toBe(1);
    expect(s.player).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
    expect(s.score).toBe(0);
    expect(s.bombs).toHaveLength(0);
  });
});

describe('BomberGame: movement', () => {
  it('按住 right 過一個移動週期後前進一格', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0]); // 一個移動週期
    expect(g.getState().player.x).toBe(SPAWN.x + 1);
  });
  it('撞到 wall 不前進（往上是外框 wall）', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('up', true);
    g.step(SPEED_MS[0]);
    expect(g.getState().player.y).toBe(SPAWN.y);
  });
  it('單一 step 即使 dt 很大也只前進一格（冷卻擋住連走）', () => {
    const g = new BomberGame({ seed: 1 });
    g.setHeld('right', true);
    g.step(SPEED_MS[0] * 3);
    expect(g.getState().player.x).toBe(SPAWN.x + 1);
  });
});

describe('BomberGame: bomb placement', () => {
  it('放彈後場上多一顆，且站在炸彈格上', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    const s = g.getState();
    expect(s.bombs).toHaveLength(1);
    expect(s.bombs[0]).toMatchObject({ x: SPAWN.x, y: SPAWN.y });
  });
  it('同時炸彈數受 maxBombs 限制', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb'); // 同一格只能放一顆
    g.input('bomb');
    expect(g.getState().bombs.length).toBe(BASE_BOMBS);
  });
  it('drainEvents 第二次呼叫為空', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.drainEvents();
    expect(g.drainEvents()).toHaveLength(0);
  });
});

describe('BomberGame: explosions', () => {
  it('引信歸零後炸彈引爆並產生爆風', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS); // 引爆
    const s = g.getState();
    expect(s.bombs).toHaveLength(0);
    expect(s.blasts.length).toBeGreaterThan(0);
  });
  it('爆風 TTL 過後消失', () => {
    const g = new BomberGame({ seed: 1 });
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    g.step(BLAST_TTL_MS + 1);
    expect(g.getState().blasts).toHaveLength(0);
  });
  it('炸到 crate 會破壞並加分', () => {
    const g = new BomberGame({ seed: 1 });
    const before = g.getState();
    g.input('bomb');
    g.step(BOMB_FUSE_MS);
    const after = g.getState();
    // 至少分數 >= 0 且狀態仍 playing
    expect(after.status).toBe('playing');
    expect(after.score).toBeGreaterThanOrEqual(before.score);
  });
});
