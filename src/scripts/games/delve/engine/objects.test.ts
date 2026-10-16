// objects.test.ts — 裝飾物件、支撐連鎖、可替換植物、陶罐掉落、挖掘等級
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { FIXED_DT } from './constants';
import { potLoot } from './loot';

const SMALL = { width: 160, height: 100 };

function arena(seed = 'arena', px = 60, floorY = 60): DelveGame {
  const g = new DelveGame({ seed, ...SMALL });
  const w = g.world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 30; x < 100; x++) {
      w.setFg(x, y, y >= floorY ? T.STONE : T.AIR);
      w.setWall(x, y, W.NONE);
    }
  }
  g.teleport(px, floorY - 1);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function runFor(g: DelveGame, seconds: number): void {
  const n = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < n; i++) g.step(FIXED_DT);
}
function slotOf(g: DelveGame, item: string): number {
  return g.inventory.slots.findIndex((s) => s?.item === item);
}

describe('裝飾物件', () => {
  it('高草一下就挖掉、不掉東西', () => {
    const g = arena();
    g.world.setFg(62, 59, T.TALL_GRASS);
    g.setAim(62, 59); g.setMining(true);
    runFor(g, 0.2);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
    const total = g.inventory.slots.reduce((n, s) => n + (s ? s.count : 0), 0);
    expect(total).toBe(11); // 木鎬 + 10 火把
  });
  it('蘑菇 / 小石頭 / 南瓜 掉落', () => {
    const g = arena();
    g.world.setFg(61, 59, T.MUSHROOM);
    g.world.setFg(62, 59, T.SMALL_ROCK);
    g.world.setFg(63, 59, T.PUMPKIN);
    g.mineInstant(61, 59); g.mineInstant(62, 59); g.mineInstant(63, 59);
    expect(g.inventory.count('mushroom')).toBe(1);
    expect(g.inventory.count('stone')).toBe(1);
    expect(g.inventory.count('pumpkin')).toBe(1);
  });
  it('挖掉地面 → 上面的花跟著掉（floor 支撐）', () => {
    const g = arena();
    g.world.setFg(62, 59, T.FLOWER);
    g.mineInstant(62, 60);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
  });
  it('牆不算地面植物的支撐（不像火把）', () => {
    const g = arena();
    g.world.setWall(62, 59, W.DIRT_WALL);
    g.world.setFg(62, 59, T.MUSHROOM);
    g.mineInstant(62, 60);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
    expect(g.inventory.count('mushroom')).toBe(1);
  });
  it('仙人掌一節一節：砍底下那節整株倒', () => {
    const g = arena();
    g.world.setFg(62, 60, T.SAND);
    for (let y = 56; y <= 59; y++) g.world.setFg(62, y, T.CACTUS);
    g.mineInstant(62, 59);
    for (let y = 56; y <= 59; y++) expect(g.world.getFg(62, y)).toBe(T.AIR);
    expect(g.inventory.count('cactus')).toBe(4);
  });
  it('藤蔓垂吊：挖掉天花板，整串藤蔓掉落', () => {
    const g = arena();
    g.world.setFg(64, 50, T.STONE);
    for (let y = 51; y <= 54; y++) g.world.setFg(64, y, T.VINE);
    g.world.setFg(66, 50, T.STONE); g.world.setFg(66, 51, T.STALACTITE);
    g.mineInstant(64, 50);
    for (let y = 51; y <= 54; y++) expect(g.world.getFg(64, y)).toBe(T.AIR);
    expect(g.world.getFg(66, 51)).toBe(T.STALACTITE);
    // 從中間剪斷藤蔓：上半段留著
    for (let y = 51; y <= 54; y++) g.world.setFg(64, y, T.VINE);
    g.world.setFg(64, 50, T.STONE);
    g.mineInstant(64, 52);
    expect(g.world.getFg(64, 51)).toBe(T.VINE);
    expect(g.world.getFg(64, 53)).toBe(T.AIR);
    expect(g.world.getFg(64, 54)).toBe(T.AIR);
  });
  it('放方塊時直接蓋掉高草 / 花', () => {
    const g = arena();
    g.give('dirt', 5);
    g.world.setFg(63, 59, T.TALL_GRASS);
    g.selectSlot(slotOf(g, 'dirt'));
    g.setAim(63, 59); g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.world.getFg(63, 59)).toBe(T.DIRT);
    expect(g.inventory.count('dirt')).toBe(4);
  });
  it('地面型物件（南瓜）放置需要下方實心', () => {
    const g = arena();
    g.give('pumpkin', 2);
    g.selectSlot(slotOf(g, 'pumpkin'));
    g.world.setWall(63, 57, W.DIRT_WALL);
    g.setAim(63, 57); g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.world.getFg(63, 57)).toBe(T.AIR); // 懸空（只有背牆）不行
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'support')).toBe(true);
    runFor(g, 0.3);
    g.setAim(63, 59); g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.world.getFg(63, 59)).toBe(T.PUMPKIN);
  });
});

describe('陶罐', () => {
  it('打破陶罐 → 依 seed + 座標的確定性掉落進背包', () => {
    const g = arena('pots');
    g.world.setFg(62, 59, T.POT);
    const loot = potLoot(g.seed, 62, 59, g.depthFrac(62, 59));
    g.mineInstant(62, 59);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
    for (const s of loot) expect(g.inventory.count(s.item)).toBeGreaterThanOrEqual(s.n);
    const potEv = g.drainEvents().find((e) => e.type === 'mine' && e.tile === T.POT);
    expect(potEv).toBeDefined();
  });
});

describe('挖掘等級', () => {
  it('金礦：鐵鎬挖不動、銀鎬可以', () => {
    const g = arena();
    g.give('iron_pickaxe', 1);
    g.world.setFg(61, 60, T.GOLD_ORE);
    g.setAim(61, 60); g.setMining(true);
    runFor(g, 3);
    expect(g.world.getFg(61, 60)).toBe(T.GOLD_ORE);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'tier')).toBe(true);
    g.give('silver_pickaxe', 1);
    runFor(g, 3);
    expect(g.world.getFg(61, 60)).toBe(T.AIR);
    expect(g.inventory.count('gold_ore')).toBe(1);
  });
  it('金鎬最快', () => {
    const time = (pick: 'silver_pickaxe' | 'gold_pickaxe'): number => {
      const g = arena();
      g.give(pick, 1);
      g.world.setFg(61, 60, T.GRANITE);
      g.setAim(61, 60); g.setMining(true);
      let t = 0;
      while (g.world.getFg(61, 60) !== T.AIR && t < 10) { g.step(FIXED_DT); t += FIXED_DT; }
      return t;
    };
    expect(time('gold_pickaxe')).toBeLessThan(time('silver_pickaxe'));
  });
});
