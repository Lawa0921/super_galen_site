// physics.rope.test.ts — 繩索攀爬（重疊繩索欄時按上 / 下爬、不受重力；跳離；頂端掛住、側移上岸）與移動能力（跳躍靴 / 疾行靴）
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { makeBody, stepPlayer, overlapsRope, type PlayerMotion, type MoveControl } from './physics';
import { TILE_SIZE as S, FIXED_DT, PLAYER_H, PLAYER_W, RUN_SPEED, JUMP_SPEED } from './constants';

/** 40×60 世界：第 50 列以下石頭；x=10 欄第 20..49 列是繩索；x 0..8 第 20 列以下實心（左側高台，台面在第 20 列頂） */
function world(): World {
  const w = new World(40, 60);
  for (let x = 0; x < 40; x++) for (let y = 50; y < 60; y++) w.setFg(x, y, T.STONE);
  for (let x = 0; x <= 8; x++) for (let y = 20; y < 50; y++) w.setFg(x, y, T.STONE);
  for (let y = 20; y < 50; y++) w.setFg(10, y, T.ROPE);
  return w;
}
const motion = (): PlayerMotion => ({ jumpTimer: 0, jumpWasHeld: false, climbing: false });
const run = (w: World, b: ReturnType<typeof makeBody>, m: PlayerMotion, ctl: MoveControl, n: number): void => {
  for (let i = 0; i < n; i++) stepPlayer(w, b, m, ctl, FIXED_DT);
};
/** 身體中心對準第 tx 欄 */
const atCol = (tx: number, feetRow: number) => makeBody(tx * S + S / 2 - PLAYER_W / 2, feetRow * S - PLAYER_H);

describe('繩索攀爬', () => {
  it('overlapsRope：身體中心欄與身高範圍內有繩索才算', () => {
    const w = world();
    expect(overlapsRope(w, atCol(10, 50))).toBe(true);
    expect(overlapsRope(w, atCol(13, 50))).toBe(false);
    expect(overlapsRope(w, atCol(10, 15))).toBe(false); // 繩索頂端（第 20 列）之上
  });
  it('站在繩索底部按「上」→ 往上爬（越爬越高），放開 → 掛在繩上不掉', () => {
    const w = world(), b = atCol(10, 50), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 10);
    const y0 = b.y;
    run(w, b, m, { moveX: 0, jump: false, up: true }, 60);
    expect(m.climbing).toBe(true);
    expect(b.y).toBeLessThan(y0 - 4 * S);
    const y1 = b.y;
    run(w, b, m, { moveX: 0, jump: false }, 60);
    expect(b.y).toBeCloseTo(y1, 5);
    expect(m.climbing).toBe(true);
  });
  it('不在繩索上時「上」= 跳（W 鍵照舊能跳）', () => {
    const w = world(), b = atCol(20, 50), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 5);
    const y0 = b.y;
    let minY = y0;
    for (let i = 0; i < 30; i++) { stepPlayer(w, b, m, { moveX: 0, jump: false, up: true }, FIXED_DT); minY = Math.min(minY, b.y); }
    expect(minY).toBeLessThan(y0 - 2 * S);
    expect(m.climbing).toBe(false);
  });
  it('攀爬中按「下」往下爬；按跳躍 → 跳離繩索（恢復重力）', () => {
    const w = world(), b = atCol(10, 40), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 2);
    expect(m.climbing).toBe(true);
    const y0 = b.y;
    run(w, b, m, { moveX: 0, jump: false, drop: true }, 30);
    expect(b.y).toBeGreaterThan(y0 + S);
    run(w, b, m, { moveX: 1, jump: true }, 1);
    expect(m.climbing).toBe(false);
    run(w, b, m, { moveX: 1, jump: false }, 120);
    expect(b.onGround).toBe(true);
  });
  it('爬到頂端會停在繩頂（不會越過繩索往上飄），側移可以上到旁邊的高台', () => {
    const w = world(), b = atCol(10, 45), m = motion();
    run(w, b, m, { moveX: 0, jump: false, up: true }, 400);
    expect(m.climbing).toBe(true);
    // 腳底停在繩頂那列附近
    expect(Math.abs(b.y + b.h - 20 * S)).toBeLessThanOrEqual(2);
    run(w, b, m, { moveX: -1, jump: false, up: true }, 60);
    run(w, b, m, { moveX: -1, jump: false }, 30);
    expect(b.x + b.w).toBeLessThan(9 * S + 1);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(20 * S, 3);
  });
  it('掉落時經過繩索不會自動抓住（要按上 / 下）', () => {
    const w = world(), b = atCol(10, 25), m = motion();
    run(w, b, m, { moveX: 0, jump: false }, 120);
    expect(m.climbing).toBe(false);
    expect(b.y + b.h).toBeCloseTo(50 * S, 3);
  });
});

describe('移動能力', () => {
  it('runMul：疾行靴跑得更快', () => {
    const w = world();
    const a = atCol(15, 50), b = atCol(15, 50), ma = motion(), mb = motion();
    run(w, a, ma, { moveX: 1, jump: false }, 40);
    for (let i = 0; i < 40; i++) stepPlayer(w, b, mb, { moveX: 1, jump: false }, FIXED_DT, { runMul: 1.4 });
    expect(Math.abs(a.vx)).toBeCloseTo(RUN_SPEED, 0);
    expect(b.x - a.x).toBeGreaterThan(30);
  });
  it('jumpMul：跳躍靴跳得更高', () => {
    const peak = (stats?: { jumpMul: number }): number => {
      const w = world(), b = atCol(25, 50), m = motion();
      run(w, b, m, { moveX: 0, jump: false }, 5);
      let min = b.y;
      for (let i = 0; i < 80; i++) { stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT, stats); min = Math.min(min, b.y); }
      return b.y - min + (50 * S - PLAYER_H - b.y);
    };
    expect(peak({ jumpMul: 1.3 })).toBeGreaterThan(peak() * 1.3);
    expect(JUMP_SPEED).toBeGreaterThan(0);
  });
});
