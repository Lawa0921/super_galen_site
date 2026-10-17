// swim.test.ts — 身體與液體的接觸（浸入比例 / 頭在水下 / 種類）、介質係數、玩家在液體裡的移動
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T } from './tiles';
import { makeBody, stepPlayer, type PlayerMotion } from './physics';
import { liquidContact, liquidMedium, playerMedium, NO_CONTACT } from './swim';
import { stepFalling } from './entities';
import { TILE_SIZE as S, FIXED_DT, MAX_FALL, RUN_SPEED, PLAYER_H } from './constants';

/** 40×40 世界：第 30 列以下石頭；x 5..34、y 10..29 是一池深水（量 255） */
function pool(type: number = LIQ.WATER, amount = 255): World {
  const w = new World(40, 40);
  for (let y = 30; y < 40; y++) for (let x = 0; x < 40; x++) w.fg[w.idx(x, y)] = T.STONE;
  for (let y = 10; y < 30; y++) for (let x = 5; x < 35; x++) w.setLiquid(x, y, amount, type);
  return w;
}
const idle = (): PlayerMotion => ({ jumpTimer: 0, jumpWasHeld: false });

describe('liquidContact', () => {
  it('空氣中：沒有接觸', () => {
    const w = pool();
    const c = liquidContact(w, makeBody(1 * S, 2 * S));
    expect(c).toEqual(NO_CONTACT);
  });
  it('一半泡在水裡：frac ≈ 0.5、頭在水面上', () => {
    const w = new World(20, 20);
    for (let x = 0; x < 20; x++) for (let y = 10; y < 20; y++) w.setLiquid(x, y, 255, LIQ.WATER);
    const b = makeBody(5 * S, 10 * S - PLAYER_H / 2);
    const c = liquidContact(w, b);
    expect(c.type).toBe(LIQ.WATER);
    expect(c.frac).toBeCloseTo(0.5, 1);
    expect(c.head).toBe(false);
  });
  it('整個沉在水裡：frac = 1、頭在水下', () => {
    const w = pool();
    const c = liquidContact(w, makeBody(15 * S, 15 * S));
    expect(c.frac).toBeCloseTo(1, 5);
    expect(c.head).toBe(true);
  });
  it('部分量的格：液面在格內（量 128 ≈ 半格）', () => {
    const w = new World(20, 20);
    w.setLiquid(5, 10, 128, LIQ.LAVA);
    const b = makeBody(5 * S, 10 * S, 10, 16);
    const c = liquidContact(w, b);
    expect(c.type).toBe(LIQ.LAVA);
    expect(c.frac).toBeGreaterThan(0.4);
    expect(c.frac).toBeLessThan(0.6);
  });
  it('上方也有液體的格算滿（落下的水柱）', () => {
    const w = new World(20, 20);
    w.setLiquid(5, 9, 40, LIQ.WATER); w.setLiquid(5, 10, 40, LIQ.WATER);
    const c = liquidContact(w, makeBody(5 * S, 10 * S, 10, 16));
    expect(c.frac).toBeCloseTo(1, 5);
  });
});

describe('介質', () => {
  it('水 / 熔岩 / 蜂蜜都讓重力與落速變小；蜂蜜最黏', () => {
    for (const t of [LIQ.WATER, LIQ.LAVA, LIQ.HONEY]) {
      const m = liquidMedium({ type: t, frac: 1, head: true });
      expect(m.gravityMul).toBeLessThan(1);
      expect(m.maxFallMul).toBeLessThan(1);
    }
    expect(liquidMedium({ type: LIQ.HONEY, frac: 1, head: true }).dragMul)
      .toBeGreaterThan(liquidMedium({ type: LIQ.WATER, frac: 1, head: true }).dragMul);
    expect(liquidMedium(NO_CONTACT).gravityMul).toBe(1);
  });
  it('掉落物在水中浮起來（浮力）', () => {
    const w = pool();
    const b = { x: 15 * S, y: 25 * S, w: 10, h: 10, vx: 0, vy: 0, onGround: false, gfxOffY: 0 };
    const env = { isSolid: (x: number, y: number) => w.isSolid(x, y), mediumAt: (q: typeof b) => liquidMedium(liquidContact(w, q)), itemMediumAt: (q: typeof b) => liquidMedium(liquidContact(w, q), true) };
    for (let i = 0; i < 600; i++) stepFalling(env, b, FIXED_DT, undefined, false, true);
    // 停在水面附近（第 10 列頂端 = 160 px）
    expect(b.y).toBeLessThan(11 * S);
    expect(b.y).toBeGreaterThan(9 * S);
  });
});

describe('玩家在液體裡', () => {
  it('水中落下較慢（終端速度約一半）', () => {
    const w = pool();
    const b = makeBody(15 * S, 10 * S), m = idle();
    for (let i = 0; i < 40; i++) stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
    expect(b.vy).toBeGreaterThan(0);
    expect(b.vy).toBeLessThanOrEqual(MAX_FALL * 0.5 + 1e-6);
  });
  it('水中跑得比較慢', () => {
    const w = pool();
    for (let x = 0; x < 40; x++) w.fg[w.idx(x, 20)] = T.STONE; // 水底地板
    const b = makeBody(10 * S, 20 * S - PLAYER_H), m = idle();
    for (let i = 0; i < 90; i++) stepPlayer(w, b, m, { moveX: 1, jump: false }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
    expect(b.vx).toBeGreaterThan(RUN_SPEED * 0.3);
    expect(b.vx).toBeLessThan(RUN_SPEED * 0.7);
  });
  it('按住跳躍 → 往上游；放開 → 慢慢沉', () => {
    const w = pool();
    const b = makeBody(15 * S, 22 * S), m = idle();
    const y0 = b.y;
    for (let i = 0; i < 60; i++) stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
    expect(b.y).toBeLessThan(y0 - 3 * S);
    const y1 = b.y;
    for (let i = 0; i < 60; i++) stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
    expect(b.y).toBeGreaterThan(y1);
  });
  it('游到水面按跳可以跳出水', () => {
    const w = pool();
    const b = makeBody(15 * S, 10 * S - PLAYER_H * 0.6), m = idle();
    // 先放開一刻，再按下跳（新的按壓）
    stepPlayer(w, b, m, { moveX: 0, jump: false }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
    let minY = b.y;
    for (let i = 0; i < 30; i++) {
      stepPlayer(w, b, m, { moveX: 0, jump: true }, FIXED_DT, {}, playerMedium(liquidContact(w, b)));
      minY = Math.min(minY, b.y);
    }
    expect(minY + PLAYER_H).toBeLessThan(10 * S); // 腳離開水面
  });
});
