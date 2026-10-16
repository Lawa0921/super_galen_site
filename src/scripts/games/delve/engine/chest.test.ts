// chest.test.ts — 箱子：開啟 / 拿取 / 放入 / 挖掉 / 放置 / 距離關閉
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W } from './tiles';
import { CHUNK, FIXED_DT } from './constants';
import { CHEST_SLOTS } from './loot';

const SMALL = { width: 160, height: 100 };

function arena(seed = 'chests'): DelveGame {
  const g = new DelveGame({ seed, ...SMALL });
  const w = g.world;
  for (let y = 0; y < w.height; y++) {
    for (let x = 30; x < 100; x++) {
      w.setFg(x, y, y >= 60 ? T.STONE : T.AIR);
      w.setWall(x, y, W.NONE);
    }
  }
  g.teleport(60, 59);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.world.modifiedChunks.clear();
  g.drainEvents();
  return g;
}
function withChest(g: DelveGame, x = 62, y = 59): void {
  g.world.setFg(x, y, T.CHEST);
  const slots = g.world.chests.get(g.world.idx(x, y))!;
  slots[0] = { item: 'gold_ore', count: 5 };
  slots[3] = { item: 'torch', count: 7 };
  g.world.modifiedChunks.clear();
}

describe('箱子', () => {
  it('放上 CHEST tile 會建立空箱；換成別的 tile 會移除', () => {
    const g = arena();
    g.world.setFg(62, 59, T.CHEST);
    const s = g.world.chests.get(g.world.idx(62, 59));
    expect(s).toBeDefined();
    expect(s!.length).toBe(CHEST_SLOTS);
    expect(s!.every((x) => x === null)).toBe(true);
    g.world.setFg(62, 59, T.AIR);
    expect(g.world.chests.has(g.world.idx(62, 59))).toBe(false);
  });
  it('interact 開箱（在觸及範圍內），事件 chest open', () => {
    const g = arena();
    withChest(g);
    expect(g.interact(62, 59)).toBe(true);
    expect(g.openChest).toEqual({ x: 62, y: 59 });
    expect(g.drainEvents()).toContainEqual({ type: 'chest', open: true, x: 62, y: 59 });
    expect(g.chestSlots()?.[0]).toEqual({ item: 'gold_ore', count: 5 });
    expect(g.getState().chest).toEqual({ x: 62, y: 59 });
  });
  it('太遠不能開', () => {
    const g = arena();
    withChest(g, 90, 59);
    expect(g.interact(90, 59)).toBe(false);
    expect(g.openChest).toBeNull();
  });
  it('右鍵（use）對著箱子＝開箱，就算手上拿著方塊也不放置', () => {
    const g = arena();
    withChest(g);
    g.give('dirt', 10);
    g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'dirt'));
    g.setAim(62, 59); g.setUse(true);
    for (let i = 0; i < 10; i++) g.step(FIXED_DT);
    g.setUse(false);
    expect(g.openChest).toEqual({ x: 62, y: 59 });
    expect(g.inventory.count('dirt')).toBe(10);
  });
  it('拿一格 / 全部拿取；箱子內容變動算修改過的 chunk', () => {
    const g = arena();
    withChest(g);
    g.interact(62, 59);
    expect(g.takeChestSlot(3)).toBe(true);
    expect(g.inventory.count('torch')).toBe(17);
    expect(g.chestSlots()?.[3]).toBeNull();
    const ci = g.world.chunkIndex(Math.floor(62 / CHUNK), Math.floor(59 / CHUNK));
    expect(g.world.modifiedChunks.has(ci)).toBe(true);
    expect(g.takeAllFromChest()).toBe(5);
    expect(g.inventory.count('gold_ore')).toBe(5);
    expect(g.chestSlots()!.every((s) => s === null)).toBe(true);
  });
  it('放入：背包某格整堆放進箱子（先疊到同種堆）', () => {
    const g = arena();
    withChest(g);
    g.give('gold_ore', 3);
    g.interact(62, 59);
    const slot = g.inventory.slots.findIndex((s) => s?.item === 'gold_ore');
    expect(g.depositToChest(slot)).toBe(true);
    expect(g.inventory.count('gold_ore')).toBe(0);
    expect(g.chestSlots()?.[0]).toEqual({ item: 'gold_ore', count: 8 });
  });
  it('箱子沒空不能挖；拿空後挖掉掉落箱子道具', () => {
    const g = arena();
    withChest(g);
    g.setAim(62, 59); g.setMining(true);
    for (let i = 0; i < 120; i++) g.step(FIXED_DT);
    expect(g.world.getFg(62, 59)).toBe(T.CHEST);
    expect(g.drainEvents().some((e) => e.type === 'blocked' && e.reason === 'chest')).toBe(true);
    g.setMining(false);
    g.interact(62, 59);
    g.takeAllFromChest();
    g.setMining(true);
    for (let i = 0; i < 120; i++) g.step(FIXED_DT);
    expect(g.world.getFg(62, 59)).toBe(T.AIR);
    expect(g.inventory.count('chest')).toBe(1);
    expect(g.world.chests.has(g.world.idx(62, 59))).toBe(false);
    expect(g.openChest).toBeNull();
  });
  it('放置箱子需要地面、放下是空箱', () => {
    const g = arena();
    g.give('chest', 1);
    g.selectSlot(g.inventory.slots.findIndex((s) => s?.item === 'chest'));
    g.setAim(63, 59); g.setUse(true); g.step(FIXED_DT); g.setUse(false);
    expect(g.world.getFg(63, 59)).toBe(T.CHEST);
    expect(g.world.chests.get(g.world.idx(63, 59))!.every((s) => s === null)).toBe(true);
  });
  it('走遠會自動關箱', () => {
    const g = arena();
    withChest(g);
    g.interact(62, 59);
    g.drainEvents();
    g.teleport(90, 59);
    g.step(FIXED_DT);
    expect(g.openChest).toBeNull();
    expect(g.drainEvents()).toContainEqual({ type: 'chest', open: false, x: 62, y: 59 });
  });
});
