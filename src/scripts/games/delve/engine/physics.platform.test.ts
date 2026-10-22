// physics.platform.test.ts — 單向平台：只從上方落下時擋住；從下方跳上來可穿過；按住「下」穿過去
import { describe, it, expect } from 'vitest';
import { World } from './world';
import { T } from './tiles';
import { makeBody, stepPlayer, type PlayerMotion } from './physics';
import { TILE_SIZE as S, FIXED_DT, PLAYER_H } from './constants';

/** 30×40 世界：第 30 列石頭地板、第 20 列 x 5..15 一排平台 */
function world(): World {
  const w = new World(30, 40);
  for (let x = 0; x < 30; x++) for (let y = 30; y < 40; y++) w.setFg(x, y, T.STONE);
  for (let x = 5; x <= 15; x++) w.setFg(x, 20, T.PLATFORM);
  return w;
}
const idle = (): PlayerMotion => ({ jumpTimer: 0, jumpWasHeld: false });
const run = (w: World, b: ReturnType<typeof makeBody>, m: PlayerMotion, ctl: { moveX: number; jump: boolean; drop?: boolean }, n: number): void => {
  for (let i = 0; i < n; i++) stepPlayer(w, b, m, ctl, FIXED_DT);
};

describe('單向平台', () => {
  it('從上方落下：停在平台頂、onGround', () => {
    const w = world(), b = makeBody(8 * S, 10 * S - PLAYER_H), m = idle();
    run(w, b, m, { moveX: 0, jump: false }, 120);
    expect(b.onGround).toBe(true);
    expect(b.y + b.h).toBeCloseTo(20 * S, 5);
  });
  it('站在平台上很穩（多幀不下沉）', () => {
    const w = world(), b = makeBody(8 * S, 20 * S - PLAYER_H), m = idle();
    run(w, b, m, { moveX: 0, jump: false }, 200);
    expect(b.y + b.h).toBeCloseTo(20 * S, 5);
    expect(b.onGround).toBe(true);
  });
  it('從平台下方往上跳可以穿過，落下時站上平台', () => {
    const w = world(), b = makeBody(8 * S, 30 * S - PLAYER_H), m = idle();
    run(w, b, m, { moveX: 0, jump: false }, 10);
    expect(b.onGround).toBe(true);
    // 平台在腳底上方 10 格：跳不到那麼高 → 先把地板墊高到第 25 列（腳底到平台 5 格，跳得上去）
    for (let x = 0; x < 30; x++) for (let y = 25; y < 30; y++) w.setFg(x, y, T.STONE);
    b.y = 25 * S - PLAYER_H; b.vy = 0;
    run(w, b, m, { moveX: 0, jump: false }, 5);
    let minY = b.y;
    for (let i = 0; i < 90; i++) { stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT); minY = Math.min(minY, b.y); }
    run(w, b, m, { moveX: 0, jump: false }, 120);
    expect(minY + b.h).toBeLessThan(20 * S); // 腳底曾高過平台頂（穿過去了）
    expect(b.y + b.h).toBeCloseTo(20 * S, 5); // 落回時站在平台上
    expect(b.onGround).toBe(true);
  });
  it('按住「下」會從平台掉下去，落到地板', () => {
    const w = world(), b = makeBody(8 * S, 20 * S - PLAYER_H), m = idle();
    run(w, b, m, { moveX: 0, jump: false }, 5);
    run(w, b, m, { moveX: 0, jump: false, drop: true }, 8);
    run(w, b, m, { moveX: 0, jump: false }, 120);
    expect(b.y + b.h).toBeCloseTo(30 * S, 5);
  });
  it('水平走過平台那一列不會被擋（平台不是牆）', () => {
    const w = world(), b = makeBody(1 * S, 30 * S - PLAYER_H), m = idle();
    for (let x = 0; x < 30; x++) w.setFg(x, 19, T.AIR);
    // 讓平台位在頭部高度：地板墊到第 22 列 → 身體佔 19.4..22
    for (let x = 0; x < 30; x++) for (let y = 22; y < 30; y++) w.setFg(x, y, T.STONE);
    b.y = 22 * S - PLAYER_H;
    run(w, b, m, { moveX: 1, jump: false }, 90);
    expect(b.x).toBeGreaterThan(16 * S);
  });
  it('不在平台欄（走出邊緣）就會掉下去', () => {
    const w = world(), b = makeBody(14 * S, 20 * S - PLAYER_H), m = idle();
    run(w, b, m, { moveX: 1, jump: false }, 120);
    expect(b.y + b.h).toBeCloseTo(30 * S, 5);
  });
});
