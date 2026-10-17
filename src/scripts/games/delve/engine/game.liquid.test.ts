// game.liquid.test.ts — 遊戲層的液體：模擬接進 step、游泳 / 呼吸 / 溺水、熔岩傷害 + 著火 + 熔殼護符、
// 蜂蜜回血、落水不摔傷、濺水事件、水桶 / 海綿、掉落物浮起、怪物（怕水 / 火系怪碰水會死 / 水生怪）。
import { describe, it, expect } from 'vitest';
import { DelveGame, MAX_BREATH, BURN_TIME, type DelveEvent } from './game';
import { T, W } from './tiles';
import { LIQ } from './world';
import { FIXED_DT, TILE_SIZE as S } from './constants';
import type { ItemId } from './items';

const SMALL = { width: 160, height: 100 };

/**
 * 測試場：x 30..100 清空（含液體），floorY 以下石頭；x poolX0..poolX1、y poolTop..floorY-1 是一池液體
 * （兩側各一道石牆圍住）。玩家站在 (px, floorY-1)。
 */
function arena(opts: { px?: number; floorY?: number; pool?: { x0: number; x1: number; top: number; type?: number } } = {}): DelveGame {
  const { px = 40, floorY = 60, pool } = opts;
  const g = new DelveGame({ seed: 'liquid', ...SMALL, peaceful: true });
  const w = g.world;
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) w.setLiquid(x, y, 0, LIQ.NONE);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= floorY ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); }
  for (let y = 0; y < w.height; y++) { w.setFg(29, y, T.STONE); w.setFg(100, y, T.STONE); } // 封住兩側，液體不會流進世界
  if (pool) {
    for (let y = pool.top - 2; y < floorY; y++) { w.setFg(pool.x0 - 1, y, T.STONE); w.setFg(pool.x1 + 1, y, T.STONE); }
    for (let y = pool.top; y < floorY; y++) for (let x = pool.x0; x <= pool.x1; x++) w.setLiquid(x, y, 255, pool.type ?? LIQ.WATER);
  }
  g.liquids.settle(200);
  g.teleport(px, floorY - 1);
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
const evs = (g: DelveGame): DelveEvent[] => g.drainEvents();

describe('液體模擬接進遊戲', () => {
  it('每一刻都會跑液體模擬：倒進空中的水會落到地上', () => {
    const g = arena();
    for (let y = 55; y < 60; y++) { g.world.setFg(65, y, T.STONE); g.world.setFg(75, y, T.STONE); } // 地上一個小盆
    g.liquids.pour(70, 40, LIQ.WATER, 255);
    run(g, 2);
    expect(g.world.getLiquid(70, 40)).toBe(0);
    let below = 0;
    for (let x = 66; x < 75; x++) below += g.world.getLiquid(x, 59);
    expect(below).toBeGreaterThan(200);
  });
  it('挖開水壩（真的挖）→ 水流出來', () => {
    const g = arena({ px: 52, pool: { x0: 55, x1: 70, top: 50 } });
    g.give('gold_pickaxe');
    // 左牆 x=54：玩家站在 52，挖 (54,58)、(54,59)
    for (const y of [59, 58]) {
      g.setAim(54, y); g.setMining(true); run(g, 2); g.setMining(false);
      expect(g.world.getFg(54, y)).toBe(T.AIR);
    }
    run(g, 3);
    let out = 0;
    for (let x = 31; x < 54; x++) out += g.world.getLiquid(x, 59);
    expect(out).toBeGreaterThan(255 * 3);
  });
  it('水碰到熔岩 → 黑曜石 + liquid 事件', () => {
    const g = arena();
    g.world.setLiquid(70, 59, 255, LIQ.LAVA); g.liquids.add(70, 59);
    g.liquids.pour(70, 50, LIQ.WATER, 255);
    run(g, 1.5);
    expect(g.world.getFg(70, 59)).toBe(T.OBSIDIAN);
    expect(evs(g).some((e) => e.type === 'liquid' && e.kind === 'obsidian')).toBe(true);
  });
});

describe('游泳 / 呼吸', () => {
  it('頭在水下會消耗呼吸；用完開始溺水扣血（hurt cause=drown）；出水後補回', () => {
    const g = arena({ px: 60, pool: { x0: 50, x1: 75, top: 40 } });
    expect(g.getState().breath).toBeGreaterThan(MAX_BREATH - 0.2); // arena 已經在水下跑了 0.1 秒
    expect(g.getState().liquid.head).toBe(true);
    run(g, 3);
    expect(g.getState().breath).toBeLessThan(MAX_BREATH);
    const before = g.hp;
    run(g, 25);
    expect(g.getState().breath).toBe(0);
    expect(g.hp).toBeLessThan(before);
    expect(evs(g).some((e) => e.type === 'hurt' && e.cause === 'drown')).toBe(true);
    g.teleport(40, 59);
    run(g, 4);
    expect(g.getState().breath).toBe(MAX_BREATH);
  });
  it('跳進水裡不會摔傷，而且有濺水事件', () => {
    const g = arena({ px: 60, pool: { x0: 50, x1: 75, top: 45 } });
    g.teleport(60, 10); // 從 35 格高掉下來（沒有水會摔死）
    const hp = g.hp;
    run(g, 4);
    expect(g.hp).toBe(hp);
    expect(evs(g).some((e) => e.type === 'splash' && e.liquid === LIQ.WATER)).toBe(true);
  });
  it('在水裡按住跳往上游', () => {
    const g = arena({ px: 60, pool: { x0: 50, x1: 75, top: 40 } });
    const y0 = g.player.y;
    g.setJump(true);
    run(g, 1);
    expect(g.player.y).toBeLessThan(y0 - 4 * S);
  });
});

describe('熔岩 / 蜂蜜', () => {
  it('碰到熔岩：受傷、著火（離開後持續扣血），進水會熄滅', () => {
    const g = arena({ px: 60, pool: { x0: 55, x1: 65, top: 57, type: LIQ.LAVA } });
    run(g, 0.2);
    expect(g.hp).toBeLessThan(g.maxHp());
    expect(g.getState().burning).toBeGreaterThan(0);
    g.teleport(40, 59); run(g, 1); evs(g);
    g.teleport(60, 59); run(g, 0.1);
    expect(evs(g).some((e) => e.type === 'hurt' && e.cause === 'lava')).toBe(true);
    g.teleport(40, 59);
    const hp = g.hp;
    run(g, 1.5);
    expect(g.hp).toBeLessThan(hp); // 燃燒中
    expect(evs(g).some((e) => e.type === 'hurt' && e.cause === 'burn')).toBe(true);
    // 跳進水裡熄火
    for (let y = 50; y < 60; y++) for (let x = 85; x < 95; x++) g.world.setLiquid(x, y, 255, LIQ.WATER);
    g.teleport(90, 59);
    run(g, 0.2);
    expect(g.getState().burning).toBe(0);
    expect(BURN_TIME).toBeGreaterThan(2);
  });
  it('熔殼護符：熔岩不傷身、不著火', () => {
    const g = arena({ px: 40 });
    g.give('magma_ward');
    expect(g.equipFromInventory(g.inventory.slots.findIndex((s) => s?.item === 'magma_ward'))).toBe(true);
    for (let y = 55; y < 60; y++) for (let x = 55; x < 66; x++) g.world.setLiquid(x, y, 255, LIQ.LAVA);
    g.teleport(60, 59);
    run(g, 2);
    expect(g.hp).toBe(g.maxHp());
    expect(g.getState().burning).toBe(0);
  });
  it('蜂蜜：移動變慢、慢慢回血', () => {
    const g = arena({ px: 60, pool: { x0: 50, x1: 75, top: 56, type: LIQ.HONEY } });
    g.hp = 50;
    g.setMoveX(1);
    run(g, 1);
    expect(Math.abs(g.player.vx)).toBeLessThan(90);
    g.setMoveX(0);
    const hp = g.hp;
    run(g, 2);
    expect(g.hp).toBeGreaterThan(hp + 1);
    expect(g.getState().honey).toBeGreaterThan(0);
  });
});

describe('液體工具', () => {
  it('空桶舀水 → 水桶；倒出來 → 空桶 + 那格有水', () => {
    const g = arena({ px: 48, pool: { x0: 50, x1: 60, top: 56 } });
    hold(g, 'bucket');
    g.setAim(50, 57); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.inventory.count('water_bucket')).toBe(1);
    expect(g.inventory.count('bucket')).toBe(0);
    const i = g.inventory.slots.findIndex((s) => s?.item === 'water_bucket');
    g.inventory.swap(i, 0); g.selectSlot(0);
    g.setAim(45, 55); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.inventory.count('bucket')).toBe(1);
    let poured = 0;
    for (let y = 55; y < 60; y++) poured += g.world.getLiquid(45, y);
    expect(poured).toBeGreaterThan(0);
  });
  it('熔岩桶倒進水裡 → 黑曜石', () => {
    const g = arena({ px: 48, pool: { x0: 50, x1: 60, top: 56 } });
    hold(g, 'lava_bucket');
    g.setAim(51, 57); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.world.getFg(51, 57)).toBe(T.OBSIDIAN);
  });
  it('薄薄一層水（不到半桶）舀不起來（不能無中生有）', () => {
    const g = arena({ px: 48 });
    g.world.setLiquid(50, 59, 40, LIQ.WATER);
    hold(g, 'bucket');
    g.setAim(50, 59); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.inventory.count('water_bucket')).toBe(0);
    expect(g.inventory.count('bucket')).toBe(1);
  });
  it('站在水裡往腳下倒熔岩 → 被擋（不會把黑曜石蓋在自己身上）', () => {
    const g = arena({ px: 55, pool: { x0: 50, x1: 60, top: 57 } });
    hold(g, 'lava_bucket');
    const f = g.feetTile();
    g.setAim(f.x, f.y); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.world.getFg(f.x, f.y)).not.toBe(T.OBSIDIAN);
    expect(g.inventory.count('lava_bucket')).toBe(1);
  });
  it('海綿吸掉水', () => {
    const g = arena({ px: 48, pool: { x0: 50, x1: 52, top: 58 } });
    const before = g.world.liquidTotal();
    hold(g, 'sponge');
    g.setAim(51, 59); g.setUse(true); run(g, 0.05); g.setUse(false);
    expect(g.world.liquidTotal()).toBeLessThan(before);
  });
});

describe('掉落物 / 怪物', () => {
  it('掉進水裡的道具浮到水面', () => {
    const g = arena({ px: 35, pool: { x0: 60, x1: 80, top: 45 } });
    g.drops.spawn('gel', 1, 70 * S, 57 * S, 0, 0);
    run(g, 4);
    const d = g.drops.list[0];
    expect(d).toBeDefined();
    expect(d.body.y).toBeLessThan(46 * S);
    expect(d.body.y).toBeGreaterThan(43 * S);
  });
  it('火系怪（熔岩蝠）碰水會死', () => {
    const g = arena({ px: 35, pool: { x0: 60, x1: 80, top: 45 } });
    const e = g.spawnEnemy('magma_bat', 70, 55);
    run(g, 3);
    expect(g.enemies.includes(e)).toBe(false);
  });
  it('一般怪物在熔岩裡受傷', () => {
    const g = arena({ px: 35, pool: { x0: 60, x1: 80, top: 50, type: LIQ.LAVA } });
    const e = g.spawnEnemy('rock_crab', 70, 59);
    run(g, 1);
    expect(e.hp).toBeLessThan(e.maxHp);
  });
  it('步行怪不會走進水裡（停在岸邊）', () => {
    const g = arena({ px: 90 });
    // 地板上挖一個水坑（x 60..75、y 60..63），水面和地面齊平
    for (let y = 60; y < 64; y++) for (let x = 60; x <= 75; x++) { g.world.setFg(x, y, T.AIR); g.world.setLiquid(x, y, 255, LIQ.WATER); }
    g.liquids.settle(400);
    const e = g.spawnEnemy('night_walker', 50, 59);
    g.teleport(90, 59);
    run(g, 6);
    // 一直在水坑左邊
    expect(e.body.x + e.body.w).toBeLessThan(60.5 * S);
    expect(e.body.y + e.body.h).toBeLessThanOrEqual(60 * S + 0.01);
  });
  it('水生怪（鋸鰭魚）在水裡游向水裡的玩家', () => {
    const g = arena({ px: 60, pool: { x0: 45, x1: 80, top: 40 } });
    const e = g.spawnEnemy('razor_fin', 75, 50);
    const d0 = Math.abs(e.body.x - g.player.x);
    run(g, 1.5);
    expect(Math.abs(e.body.x - g.player.x)).toBeLessThan(d0 - 3 * S);
  });
  it('水生怪離開水就只能在地上彈跳（不會飛）', () => {
    const g = arena({ px: 40 });
    const e = g.spawnEnemy('razor_fin', 70, 40);
    run(g, 2);
    expect(e.body.y + e.body.h).toBeGreaterThan(58 * S);
  });
});
