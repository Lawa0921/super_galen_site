// boat.test.ts — 小木船：水線、能不能上船、在水上開（加速 / 減速 / 撞岸停 / 擱淺）；遊戲層的上下船、呼吸、合成
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T, W } from './tiles';
import { makeBody, type Body } from './physics';
import { BOAT_SPEED, BOAT_DRAFT, boatWaterline, canBoard, stepBoat } from './boat';
import { DelveGame, MAX_BREATH, PRIVATE_EVENTS, type DelveEvent } from './game';
import { RECIPES } from './crafting';
import { ITEMS, type ItemId } from './items';
import { TILE_SIZE as S, FIXED_DT, PLAYER_H } from './constants';

/**
 * 60×40 世界：第 30 列以下石頭；x 10..49、y 24..29 是一池 40 格寬、6 格深的水（量 255）。
 * 兩岸 x ≤ 9 / x ≥ 50 從第 23 列往下是石頭（岸比水面高一格）。
 */
const POOL = { x0: 10, x1: 49, top: 24, floor: 30 };
function pool(): World {
  const w = new World(60, 40);
  for (let y = POOL.floor; y < 40; y++) for (let x = 0; x < 60; x++) w.setFg(x, y, T.STONE);
  for (let y = POOL.top - 1; y < POOL.floor; y++) for (let x = 0; x < 60; x++) if (x < POOL.x0 || x > POOL.x1) w.setFg(x, y, T.STONE);
  for (let y = POOL.top; y < POOL.floor; y++) for (let x = POOL.x0; x <= POOL.x1; x++) w.setLiquid(x, y, 255, LIQ.WATER);
  return w;
}
/** 腳底剛好踩在水面上（還沒碰到水）的身體，中心在第 tx 欄 */
function atSurface(tx: number): Body {
  const b = makeBody(0, 0);
  b.x = tx * S + S / 2 - b.w / 2;
  b.y = POOL.top * S - b.h;
  return b;
}
const WL = POOL.top * S;

describe('水線 / 上船條件', () => {
  it('水面上：水線 = 水面 px；乾地上：沒有水線', () => {
    const w = pool();
    expect(boatWaterline(w, atSurface(20))).toBe(WL);
    const dry = makeBody(3 * S, (POOL.top - 1) * S - PLAYER_H);
    expect(boatWaterline(w, dry)).toBeNull();
  });
  it('canBoard：踩在水面上 / 半身泡水 → 可以；乾地上 → 不行', () => {
    const w = pool();
    expect(canBoard(w, atSurface(20))).toBe(true);
    const wade = atSurface(30); wade.y += 12;
    expect(canBoard(w, wade)).toBe(true);
    expect(canBoard(w, makeBody(3 * S, (POOL.top - 1) * S - PLAYER_H))).toBe(false);
  });
  it('沉在深水底（水面在腳底 2 格以外）→ 沒有水線、不能上船', () => {
    const w = new World(40, 40);
    for (let y = 30; y < 40; y++) for (let x = 0; x < 40; x++) w.setFg(x, y, T.STONE);
    for (let y = 10; y < 30; y++) for (let x = 0; x < 40; x++) w.setLiquid(x, y, 255, LIQ.WATER);
    const b = makeBody(20 * S, 30 * S - PLAYER_H);
    expect(boatWaterline(w, b)).toBeNull();
    expect(canBoard(w, b)).toBe(false);
  });
  it('熔岩 / 蜂蜜不是水：不能上船', () => {
    const w = new World(40, 40);
    for (let y = 30; y < 40; y++) for (let x = 0; x < 40; x++) w.setFg(x, y, T.STONE);
    for (let y = 24; y < 30; y++) for (let x = 0; x < 40; x++) w.setLiquid(x, y, 255, LIQ.LAVA);
    const b = makeBody(20 * S, 24 * S - PLAYER_H);
    expect(canBoard(w, b)).toBe(false);
  });
});

describe('stepBoat', () => {
  it('moveX = 1 開 1 秒：速度 ≥ 0.9 × BOAT_SPEED、身體底部貼著水線 + 吃水、沒往下沉', () => {
    const w = pool(), b = atSurface(12);
    let r = { afloat: true };
    for (let i = 0; i < 60; i++) {
      r = stepBoat(w, w, b, 1, FIXED_DT);
      expect(r.afloat).toBe(true);
      expect(Math.abs(b.y + b.h - (WL + BOAT_DRAFT))).toBeLessThanOrEqual(1);
    }
    expect(b.vx).toBeGreaterThanOrEqual(0.9 * BOAT_SPEED);
    expect(b.vx).toBeLessThanOrEqual(BOAT_SPEED);
    expect(b.vy).toBe(0);
  });
  it('放開方向 → 慢慢減速到停（不會瞬間停）', () => {
    const w = pool(), b = atSurface(12);
    for (let i = 0; i < 60; i++) stepBoat(w, w, b, 1, FIXED_DT);
    const v0 = b.vx;
    stepBoat(w, w, b, 0, FIXED_DT);
    expect(b.vx).toBeLessThan(v0);
    expect(b.vx).toBeGreaterThan(v0 * 0.9);
    for (let i = 0; i < 120; i++) stepBoat(w, w, b, 0, FIXED_DT);
    expect(b.vx).toBe(0);
  });
  it('撞岸 → 停在岸邊、不穿牆、不爬上岸，仍浮著', () => {
    const w = pool(), b = atSurface(40);
    let r = { afloat: true };
    for (let i = 0; i < 300; i++) r = stepBoat(w, w, b, 1, FIXED_DT);
    expect(r.afloat).toBe(true);
    expect(b.x + b.w).toBeLessThanOrEqual((POOL.x1 + 1) * S + 1e-6);
    expect(b.x + b.w).toBeGreaterThan((POOL.x1 + 1) * S - 1);
    expect(b.vx).toBe(0);
    expect(Math.abs(b.y + b.h - (WL + BOAT_DRAFT))).toBeLessThanOrEqual(1);
  });
  it('往左也一樣撞岸停住', () => {
    const w = pool(), b = atSurface(16);
    for (let i = 0; i < 300; i++) stepBoat(w, w, b, -1, FIXED_DT);
    expect(b.x).toBeGreaterThanOrEqual(POOL.x0 * S - 1e-6);
    expect(b.x).toBeLessThan(POOL.x0 * S + 1);
  });
  it('水被抽乾 → afloat === false', () => {
    const w = pool(), b = atSurface(20);
    expect(stepBoat(w, w, b, 0, FIXED_DT).afloat).toBe(true);
    for (let y = POOL.top; y < POOL.floor; y++) for (let x = POOL.x0; x <= POOL.x1; x++) w.setLiquid(x, y, 0, LIQ.NONE);
    expect(stepBoat(w, w, b, 0, FIXED_DT).afloat).toBe(false);
  });
});

// ── 遊戲層 ──
const SMALL = { width: 160, height: 100 };
/** x 30..100 清空、第 60 列以下石頭；x 40..90、y 54..59 是一池 6 格深的水（兩側石牆圍住） */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'boat', ...SMALL, peaceful: true });
  g.levels.locked = true;
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 0; y < w.height; y++) { w.setFg(29, y, T.STONE); w.setFg(100, y, T.STONE); }
  for (let y = 52; y < 60; y++) { w.setFg(39, y, T.STONE); w.setFg(91, y, T.STONE); }
  for (let y = 54; y < 60; y++) for (let x = 40; x <= 90; x++) w.setLiquid(x, y, 255, LIQ.WATER);
  g.liquids.settle(200);
  g.teleport(35, 59);
  run(g, 0.1);
  g.drainEvents();
  return g;
}
function run(g: DelveGame, seconds: number): void {
  for (let i = 0, n = Math.round(seconds / FIXED_DT); i < n; i++) g.step(FIXED_DT);
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
/** 站到水面上（腳底 = 水面）、手持船、按一下使用 */
function board(g: DelveGame, tx = 60): DelveEvent[] {
  hold(g, 'boat');
  g.teleport(tx, 53);
  g.drainEvents();
  g.setAim(tx, 50);
  g.setUse(true); g.step(FIXED_DT); g.setUse(false);
  return g.drainEvents();
}

describe('遊戲層：上船 / 下船', () => {
  it('道具與配方：小木船、工作台、木板 18 + 繩索 4；use = boat、一次一艘', () => {
    expect(ITEMS.boat).toMatchObject({ id: 'boat', name: { zh: '小木船', en: 'Boat' }, maxStack: 1, use: 'boat' });
    const r = RECIPES.find((x) => x.id === 'boat')!;
    expect(r.out).toEqual({ item: 'boat', n: 1 });
    expect(r.station).toBe('workbench');
    expect(r.inputs).toEqual([{ item: 'planks', n: 18 }, { item: 'rope', n: 4 }]);
    expect(PRIVATE_EVENTS.has('boat')).toBe(true);
  });
  it('手持船在水面按使用 → boating、事件 boat on、身體貼齊水線；船沒被用掉', () => {
    const g = arena();
    const ev = board(g);
    expect(g.local.boating).toBe(true);
    expect(ev.some((e) => e.type === 'boat' && e.on)).toBe(true);
    const p = g.player;
    expect(Math.abs(p.y + p.h - (54 * S + BOAT_DRAFT))).toBeLessThanOrEqual(1);
    expect(g.inventory.count('boat')).toBe(1);
  });
  it('乾地上按使用 → 什麼都不做', () => {
    const g = arena();
    hold(g, 'boat');
    g.setAim(35, 55);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.local.boating).toBe(false);
    expect(g.drainEvents().some((e) => e.type === 'boat')).toBe(false);
    expect(g.inventory.count('boat')).toBe(1);
  });
  it('按住使用往水裡掉 → 一碰到水面就上船（沒上成不算用掉這次按住）', () => {
    const g = arena();
    hold(g, 'boat');
    g.teleport(60, 48);
    g.setAim(60, 45);
    g.setUse(true); run(g, 1.5); g.setUse(false);
    expect(g.local.boating).toBe(true);
    expect(Math.abs(g.player.y + g.player.h - (54 * S + BOAT_DRAFT))).toBeLessThanOrEqual(1);
  });
  it('船上 10 秒：呼吸不變、不會沉、不會自己下船', () => {
    const g = arena();
    board(g);
    run(g, 10);
    expect(g.local.boating).toBe(true);
    expect(g.breath).toBe(MAX_BREATH);
    const p = g.player;
    expect(Math.abs(p.y + p.h - (54 * S + BOAT_DRAFT))).toBeLessThanOrEqual(1);
  });
  it('按住右：船速遠快於游泳，撞到池邊停下', () => {
    const g = arena();
    board(g, 45);
    const x0 = g.player.x;
    g.setMoveX(1); run(g, 1);
    expect(g.player.vx).toBeGreaterThanOrEqual(0.9 * BOAT_SPEED);
    expect(g.player.x - x0).toBeGreaterThan(10 * S);
    run(g, 3);
    expect(g.local.boating).toBe(true);
    expect(g.player.x + g.player.w).toBeLessThanOrEqual(91 * S + 1e-6);
    g.setMoveX(0);
  });
  it('按跳 → 下船（往上跳）+ 事件 boat off', () => {
    const g = arena();
    board(g);
    run(g, 0.2);
    g.setJump(true); g.step(FIXED_DT);
    expect(g.local.boating).toBe(false);
    expect(g.player.vy).toBeLessThan(0);
    expect(g.drainEvents().some((e) => e.type === 'boat' && !e.on)).toBe(true);
    g.setJump(false);
  });
  it('水被抽乾 → 自動下船', () => {
    const g = arena();
    board(g);
    for (let y = 54; y < 60; y++) for (let x = 40; x <= 90; x++) g.world.setLiquid(x, y, 0, LIQ.NONE);
    g.step(FIXED_DT);
    expect(g.local.boating).toBe(false);
    expect(g.drainEvents().some((e) => e.type === 'boat' && !e.on)).toBe(true);
  });
  it('傳送 / 死亡 → 下船', () => {
    const g = arena();
    board(g);
    g.teleport(35, 59);
    expect(g.local.boating).toBe(false);
    board(g);
    g.hp = 1;
    (g as unknown as { die(): void }).die();
    expect(g.local.boating).toBe(false);
  });
  it('船上不能挖 / 放東西', () => {
    const g = arena();
    g.give('gold_pickaxe');
    board(g);
    g.world.setFg(62, 50, T.DIRT);
    g.setAim(62, 50);
    g.setMining(true); run(g, 2); g.setMining(false);
    expect(g.world.getFg(62, 50)).toBe(T.DIRT);
  });
  it('合成：工作台旁、木板 18 + 繩索 4 才行', () => {
    const g = arena();
    g.give('planks', 17); g.give('rope', 4);
    expect(g.craft('boat').ok).toBe(false);
    g.world.setFg(33, 59, T.WORKBENCH);
    expect(g.craft('boat').ok).toBe(false);
    g.give('planks', 1);
    expect(g.craft('boat').ok).toBe(true);
    expect(g.inventory.count('boat')).toBe(1);
    expect(g.inventory.count('planks')).toBe(0);
    expect(g.inventory.count('rope')).toBe(0);
  });
});
