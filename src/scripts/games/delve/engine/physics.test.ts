// physics.test.ts
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { makeBody, moveBody, stepPlayer, overlapsSolid, type Body, type PlayerMotion } from './physics';
import { TILE_SIZE as S, FIXED_DT, PLAYER_H, PLAYER_W, MAX_FALL } from './constants';

/** 20×20 世界、第 15 列為地板 */
function flat(): World {
  const w = new World(40, 20);
  for (let x = 0; x < 40; x++) for (let y = 15; y < 20; y++) w.setFg(x, y, T.STONE);
  return w;
}
function standOn(w: World, tx: number, groundRow: number): Body {
  void w;
  return makeBody(tx * S + 2, groundRow * S - PLAYER_H);
}
const idle = (): PlayerMotion => ({ jumpTimer: 0, jumpWasHeld: false });

describe('physics', () => {
  it('makeBody 用玩家尺寸', () => {
    const b = makeBody(0, 0);
    expect(b.w).toBe(PLAYER_W);
    expect(b.h).toBe(PLAYER_H);
  });
  it('自由落下後落在地面上、vy 歸零、onGround', () => {
    const w = flat();
    const b = makeBody(5 * S, 2 * S);
    const m = idle();
    for (let i = 0; i < 180; i++) stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    expect(b.onGround).toBe(true);
    expect(b.vy).toBe(0);
    expect(b.y + b.h).toBeCloseTo(15 * S, 5);
  });
  it('落下速度受終端速度限制', () => {
    const w = new World(10, 400);
    const b = makeBody(2 * S, 0);
    const m = idle();
    for (let i = 0; i < 120; i++) stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    expect(b.vy).toBeLessThanOrEqual(MAX_FALL);
  });
  it('高速水平移動不會穿牆', () => {
    const w = flat();
    for (let y = 0; y < 15; y++) w.setFg(10, y, T.STONE);
    const b = standOn(w, 3, 15);
    b.vx = 200000;
    moveBody(w, b, FIXED_DT);
    expect(b.x + b.w).toBeLessThanOrEqual(10 * S);
    expect(b.vx).toBe(0);
    expect(overlapsSolid(w, b.x, b.y, b.w, b.h)).toBe(false);
  });
  it('高速下落不會穿過一格厚地板', () => {
    const w = new World(10, 60);
    for (let x = 0; x < 10; x++) w.setFg(x, 40, T.STONE);
    const b = makeBody(2 * S, 2 * S);
    b.vy = 500000;
    moveBody(w, b, FIXED_DT);
    expect(b.y + b.h).toBeCloseTo(40 * S, 5);
    expect(b.onGround).toBe(true);
  });
  it('向左高速也不穿牆', () => {
    const w = flat();
    for (let y = 0; y < 15; y++) w.setFg(2, y, T.STONE);
    const b = standOn(w, 8, 15);
    b.vx = -200000;
    moveBody(w, b, FIXED_DT);
    expect(b.x).toBeGreaterThanOrEqual(3 * S);
  });
  it('走路自動踏上 1 格高的台階', () => {
    const w = flat();
    for (let x = 8; x < 40; x++) w.setFg(x, 14, T.STONE);
    const b = standOn(w, 4, 15);
    const m = idle();
    for (let i = 0; i < 5; i++) stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    expect(b.onGround).toBe(true);
    for (let i = 0; i < 90; i++) stepPlayer(w, b, m, { moveX: 1, jump: false }, FIXED_DT);
    expect(b.x).toBeGreaterThan(9 * S);
    expect(b.y + b.h).toBeCloseTo(14 * S, 5);
    expect(b.gfxOffY).toBeGreaterThanOrEqual(0);
  });
  it('2 格高的牆擋住、不會自動踏上', () => {
    const w = flat();
    for (let x = 8; x < 40; x++) { w.setFg(x, 14, T.STONE); w.setFg(x, 13, T.STONE); }
    const b = standOn(w, 4, 15);
    const m = idle();
    for (let i = 0; i < 90; i++) stepPlayer(w, b, m, { moveX: 1, jump: false }, FIXED_DT);
    expect(b.x + b.w).toBeLessThanOrEqual(8 * S);
    expect(b.y + b.h).toBeCloseTo(15 * S, 5);
  });
  it('台階上方頭頂空間不足時不踏上', () => {
    const w = flat();
    w.setFg(8, 14, T.STONE);
    for (let x = 6; x < 12; x++) w.setFg(x, 11, T.STONE); // 低天花板：踏上去頭會卡
    const b = standOn(w, 4, 15);
    expect(overlapsSolid(w, b.x, b.y, b.w, b.h)).toBe(false);
    const m = idle();
    for (let i = 0; i < 60; i++) stepPlayer(w, b, m, { moveX: 1, jump: false }, FIXED_DT);
    expect(overlapsSolid(w, b.x, b.y, b.w, b.h)).toBe(false);
    expect(b.x + b.w).toBeLessThanOrEqual(8 * S);
    expect(b.y + b.h).toBeCloseTo(15 * S, 5);
  });
  it('跳躍：離地超過 2 格再落回', () => {
    const w = flat();
    const b = standOn(w, 5, 15);
    const m = idle();
    stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    let minY = b.y;
    for (let i = 0; i < 20; i++) { stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT); minY = Math.min(minY, b.y); }
    for (let i = 0; i < 120; i++) { stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT); minY = Math.min(minY, b.y); }
    expect(15 * S - PLAYER_H - minY).toBeGreaterThan(2 * S);
    expect(b.onGround).toBe(true);
  });
  it('按住跳躍不會連跳（需放開）', () => {
    const w = flat();
    const b = standOn(w, 5, 15);
    const m = idle();
    stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    for (let i = 0; i < 200; i++) stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT);
    expect(b.onGround).toBe(true);
    expect(b.vy).toBe(0);
  });
  it('撞天花板停止上升', () => {
    const w = flat();
    for (let x = 0; x < 40; x++) w.setFg(x, 10, T.STONE);
    const b = standOn(w, 5, 15);
    const m = idle();
    stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT);
    for (let i = 0; i < 30; i++) stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT);
    expect(b.y).toBeGreaterThanOrEqual(11 * S);
  });
  it('世界左右邊界是牆', () => {
    const w = flat();
    const b = standOn(w, 0, 15);
    b.x = 1;
    b.vx = -5000;
    moveBody(w, b, FIXED_DT);
    expect(b.x).toBe(0);
  });
});
