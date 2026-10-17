// game.furniture.test.ts — 首領戰利品可以放（地上 / 牆上）、家具（桌 / 椅 / 書架 / 旗幟 / 燈柱 / 畫 / 蠟燭）、
// 木板牆可以放 / 拆、有家具的房子算安全（不生怪）。
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T, W, tileDef } from './tiles';
import { FIXED_DT } from './constants';
import { ITEMS, type ItemId } from './items';
import { findRecipe } from './crafting';
import { homeNear } from './spawn';
import { chestLoot } from './loot';

const SMALL = { width: 160, height: 100 };

function arena(): DelveGame {
  const g = new DelveGame({ seed: 'furnish', ...SMALL, peaceful: true });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 30; x < 100; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, W.NONE); w.setLiquid(x, y, 0, 0); }
  g.teleport(50, 59);
  for (let i = 0; i < 5; i++) g.step(FIXED_DT);
  g.drainEvents();
  return g;
}
function hold(g: DelveGame, item: ItemId, n = 1): void {
  g.give(item, n);
  const i = g.inventory.slots.findIndex((s) => s?.item === item);
  g.inventory.swap(i, 0);
  g.selectSlot(0);
}
function place(g: DelveGame, item: ItemId, x: number, y: number, n = 1): boolean {
  hold(g, item, n);
  return g.tryPlace(x, y);
}

describe('首領戰利品', () => {
  it('守望者戰利品放在地上（立座）', () => {
    const g = arena();
    expect(ITEMS.warden_trophy.place).toBe(T.TROPHY);
    expect(place(g, 'warden_trophy', 53, 59)).toBe(true);
    expect(g.world.getFg(53, 59)).toBe(T.TROPHY);
  });
  it('也可以掛在牆上（後面有背景牆、下面懸空）；拆掉後拿回戰利品', () => {
    const g = arena();
    g.world.setWall(53, 55, W.PLANK_WALL);
    expect(place(g, 'warden_trophy', 53, 55)).toBe(true);
    expect(g.world.getFg(53, 55)).toBe(T.TROPHY);
    expect(g.inventory.count('warden_trophy')).toBe(0);
    g.mineInstant(53, 55);
    expect(g.inventory.count('warden_trophy')).toBe(1);
  });
  it('懸空又沒有牆 → 不能放', () => {
    const g = arena();
    expect(place(g, 'warden_trophy', 53, 55)).toBe(false);
  });
});

describe('家具', () => {
  it('桌子 / 椅子 / 書架 / 旗幟 / 燈柱 / 蠟燭都做得出來、放得下；蠟燭與戰利品可以放桌上', () => {
    const g = arena();
    for (const id of ['table', 'chair', 'bookshelf', 'banner', 'lantern_post', 'candle', 'plank_wall'] as ItemId[]) {
      expect(findRecipe(id), id).toBeDefined();
      expect(ITEMS[id].place ?? ITEMS[id].placeWall, id).toBeDefined();
    }
    expect(place(g, 'table', 52, 59)).toBe(true);
    expect(place(g, 'chair', 54, 59)).toBe(true);
    expect(place(g, 'candle', 52, 58)).toBe(true);
    expect(place(g, 'bookshelf', 55, 59)).toBe(true);
    expect(place(g, 'lantern_post', 48, 59)).toBe(true);
    expect(tileDef(T.LANTERN_POST).light).toBeGreaterThan(0.5);
    g.world.setFg(51, 55, T.STONE);
    expect(place(g, 'banner', 51, 56)).toBe(true);
    // 拆桌子 → 上面的蠟燭一起掉
    g.mineInstant(52, 59);
    expect(g.world.getFg(52, 58)).toBe(T.AIR);
    expect(g.inventory.count('table')).toBeGreaterThanOrEqual(1);
    expect(g.inventory.count('candle')).toBeGreaterThanOrEqual(1);
  });
  it('畫：地城寶箱有機會開出來；要掛在背景牆上', () => {
    let found = false;
    for (let k = 0; k < 60 && !found; k++) found = chestLoot('paint', k, 7, 'dungeon', 0.5).some((s) => s?.item === 'painting');
    expect(found).toBe(true);
    const g = arena();
    expect(place(g, 'painting', 53, 55)).toBe(false);
    g.world.setWall(53, 55, W.PLANK_WALL);
    expect(place(g, 'painting', 53, 55)).toBe(true);
    expect(g.world.getFg(53, 55)).toBe(T.PAINTING);
  });
  it('木板牆：放在空格（要貼著實心或別的牆）、挖空格可以拆回來', () => {
    const g = arena();
    hold(g, 'plank_wall', 5);
    expect(g.tryPlace(52, 59)).toBe(true);
    expect(g.world.getWall(52, 59)).toBe(W.PLANK_WALL);
    expect(g.tryPlace(52, 58)).toBe(true);
    expect(g.tryPlace(52, 40)).toBe(false); // 懸空
    g.setAim(52, 58); g.setMining(true);
    for (let i = 0; i < 90; i++) g.step(FIXED_DT);
    g.setMining(false);
    expect(g.world.getWall(52, 58)).toBe(W.NONE);
    expect(g.inventory.count('plank_wall')).toBe(4);
  });
});

describe('有家具的房子算安全', () => {
  it('木板牆的房間裡有桌子 + 椅子（或床）+ 燈 → 附近不生怪；缺一樣就不算', () => {
    const g = arena(), w = g.world;
    for (let y = 52; y < 60; y++) for (let x = 40; x < 56; x++) w.setWall(x, y, W.PLANK_WALL);
    w.setFg(46, 59, T.TABLE);
    w.setFg(48, 59, T.CHAIR);
    expect(homeNear(w, 60, 55)).toBe(false);
    w.setFg(44, 57, T.TORCH);
    expect(homeNear(w, 60, 55)).toBe(true);
    expect(homeNear(w, 46 + 40, 55)).toBe(false);
    w.setWall(46, 59, W.NONE);
    expect(homeNear(w, 60, 55)).toBe(false);
  });
});
