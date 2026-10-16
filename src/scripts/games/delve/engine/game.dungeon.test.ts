// game.dungeon.test.ts — 門（開 / 關 / 擋人）、上鎖的門 + 地城鑰匙、金寶箱 + 金鑰匙、古碑、陶罐鑰匙、木門 / 平台放置、
// 穿過平台、拿著提燈發光、真實地城裡用鑰匙一路開到寶藏室
import { describe, it, expect } from 'vitest';
import { DelveGame } from './game';
import { T } from './tiles';
import type { DelveEvent } from './game';

/** 小世界 + 手工場景：第 60 列以下石頭地板，玩家站在 (20, 59) */
function scene(): DelveGame {
  const g = new DelveGame({ seed: 'door-test', width: 120, height: 80 });
  const w = g.world;
  for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) { w.setFg(x, y, y >= 60 ? T.STONE : T.AIR); w.setWall(x, y, 0); }
  g.teleport(20, 59);
  for (let i = 0; i < 5; i++) g.step();
  g.drainEvents();
  return g;
}
const door = (g: DelveGame, x: number, top: number, id: number = T.DOOR_CLOSED): void => {
  for (let y = top; y < top + 3; y++) g.world.setFg(x, y, id);
};
const events = (g: DelveGame): DelveEvent[] => g.drainEvents();

describe('門', () => {
  it('互動切換開 / 關：整扇 3 格一起變；關著時擋路、開著時可通過', () => {
    const g = scene();
    door(g, 23, 57);
    expect(g.interact(23, 58)).toBe(true);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(23, y)).toBe(T.DOOR_OPEN);
    expect(events(g).some((e) => e.type === 'door' && e.open)).toBe(true);
    // 往右走過門
    g.setMoveX(1);
    for (let i = 0; i < 60; i++) g.step();
    expect(g.playerTile().x).toBeGreaterThan(24);
    g.setMoveX(0);
    // 回頭關門再試著走過去 → 被擋
    g.teleport(20, 59);
    expect(g.interact(23, 57)).toBe(true);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(23, y)).toBe(T.DOOR_CLOSED);
    g.setMoveX(1);
    for (let i = 0; i < 60; i++) g.step();
    expect(g.playerTile().x).toBeLessThanOrEqual(22);
  });
  it('站在門口時不能把門關上（不會把人夾在門裡）', () => {
    const g = scene();
    door(g, 20, 57, T.DOOR_OPEN);
    expect(g.interact(20, 58)).toBe(false);
    expect(g.world.getFg(20, 58)).toBe(T.DOOR_OPEN);
    expect(events(g).some((e) => e.type === 'blocked' && e.reason === 'body')).toBe(true);
  });
  it('按住「使用」對準門 → 只切換一次（不會一直開開關關）', () => {
    const g = scene();
    door(g, 23, 57);
    g.setAim(23, 58); g.setUse(true);
    for (let i = 0; i < 30; i++) g.step();
    g.setUse(false);
    expect(g.world.getFg(23, 58)).toBe(T.DOOR_OPEN);
  });
  it('挖掉木門：整扇移除，掉 1 個木門；木門可以放回去（往上佔 3 格）', () => {
    const g = scene();
    door(g, 23, 57);
    expect(g.mineInstant(23, 58)).toBe(true);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(23, y)).toBe(T.AIR);
    expect(g.inventory.count('wooden_door')).toBe(1);
    g.inventory.selected = g.inventory.slots.findIndex((s) => s?.item === 'wooden_door');
    expect(g.tryPlace(24, 59)).toBe(true);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(24, y)).toBe(T.DOOR_CLOSED);
    expect(g.inventory.count('wooden_door')).toBe(0);
  });
  it('木門放不下（上方不夠 3 格）時拒絕', () => {
    const g = scene();
    g.give('wooden_door', 1);
    g.inventory.selected = g.inventory.slots.findIndex((s) => s?.item === 'wooden_door');
    g.world.setFg(24, 57, T.STONE);
    expect(g.tryPlace(24, 59)).toBe(false);
    expect(g.world.getFg(24, 59)).toBe(T.AIR);
  });
});

describe('上鎖的門與鑰匙', () => {
  it('沒有鑰匙打不開（提示上鎖）；有地城鑰匙 → 消耗一把、門打開並變成普通門', () => {
    const g = scene();
    door(g, 23, 57, T.DOOR_LOCKED);
    expect(g.interact(23, 58)).toBe(false);
    expect(g.world.getFg(23, 58)).toBe(T.DOOR_LOCKED);
    expect(events(g).some((e) => e.type === 'blocked' && e.reason === 'locked')).toBe(true);
    g.give('dungeon_key', 2);
    expect(g.interact(23, 58)).toBe(true);
    for (let y = 57; y < 60; y++) expect(g.world.getFg(23, y)).toBe(T.DOOR_OPEN);
    expect(g.inventory.count('dungeon_key')).toBe(1);
    expect(g.world.keysUsed).toBe(1);
    expect(events(g).some((e) => e.type === 'door' && e.unlocked)).toBe(true);
    // 之後就是普通的門：可以關上、不再要鑰匙
    g.teleport(19, 59);
    expect(g.interact(23, 58)).toBe(true);
    expect(g.world.getFg(23, 58)).toBe(T.DOOR_CLOSED);
    expect(g.interact(23, 58)).toBe(true);
    expect(g.inventory.count('dungeon_key')).toBe(1);
  });
  it('上鎖的門挖不動（提示上鎖）', () => {
    const g = scene();
    door(g, 23, 57, T.DOOR_LOCKED);
    g.give('gold_pickaxe', 1);
    g.setAim(23, 59); g.setMining(true);
    for (let i = 0; i < 200; i++) g.step();
    expect(g.world.getFg(23, 59)).toBe(T.DOOR_LOCKED);
    expect(events(g).some((e) => e.type === 'blocked' && e.reason === 'locked')).toBe(true);
  });
  it('金寶箱：沒金鑰匙打不開；有 → 消耗、記住已解鎖，之後再開不用鑰匙', () => {
    const g = scene();
    g.world.setFg(22, 59, T.LOCKED_CHEST);
    const i = g.world.idx(22, 59);
    g.world.chests.get(i)![0] = { item: 'rune_pickaxe', count: 1 };
    expect(g.interact(22, 59)).toBe(false);
    expect(g.openChest).toBeNull();
    g.give('golden_key', 1);
    expect(g.interact(22, 59)).toBe(true);
    expect(g.openChest).toEqual({ x: 22, y: 59 });
    expect(g.inventory.count('golden_key')).toBe(0);
    expect(g.world.unlocked.has(i)).toBe(true);
    expect(g.takeAllFromChest()).toBe(1);
    expect(g.inventory.count('rune_pickaxe')).toBe(1);
    g.closeChest();
    expect(g.interact(22, 59)).toBe(true);
    // 地城鑰匙開不了金寶箱
    g.world.setFg(26, 59, T.LOCKED_CHEST);
    g.closeChest();
    g.give('dungeon_key', 3);
    expect(g.interact(26, 59)).toBe(false);
  });
  it('古碑：互動顯示碑文事件', () => {
    const g = scene();
    g.world.setFg(22, 59, T.LORE_TABLET);
    expect(g.interact(22, 59)).toBe(true);
    const e = events(g).find((x) => x.type === 'lore');
    expect(e).toBeDefined();
  });
  it('生成時指定的陶罐會額外掉鑰匙', () => {
    const g = scene();
    g.world.setFg(22, 59, T.POT);
    g.world.potDrops.set(g.world.idx(22, 59), [{ item: 'dungeon_key', n: 1 }]);
    expect(g.mineInstant(22, 59)).toBe(true);
    expect(g.inventory.count('dungeon_key')).toBe(1);
  });
});

describe('平台與提燈', () => {
  it('平台可以接著平台往外放（不需要牆）；站上平台會提示「按下穿過」', () => {
    const g = scene();
    g.give('platform', 5);
    g.inventory.selected = g.inventory.slots.findIndex((s) => s?.item === 'platform');
    g.world.setFg(25, 56, T.STONE);
    expect(g.tryPlace(24, 56)).toBe(true);
    expect(g.tryPlace(23, 56)).toBe(true);
    expect(g.tryPlace(22, 56)).toBe(true);
    expect(g.tryPlace(21, 50)).toBe(false); // 懸空沒有支撐
    // 站上平台
    g.teleport(23, 55);
    for (let i = 0; i < 10; i++) g.step();
    expect(g.player.onGround).toBe(true);
    expect(events(g).some((e) => e.type === 'hint')).toBe(true);
    // 按住下 → 掉下去
    g.setDrop(true);
    for (let i = 0; i < 40; i++) g.step();
    g.setDrop(false);
    expect(g.feetTile().y).toBe(59);
  });
  it('拿著探險提燈：玩家身邊的光比空手亮很多', () => {
    const g = scene();
    for (let y = 30; y < 60; y++) for (let x = 0; x < 120; x++) { g.world.setFg(x, y, y === 59 || y < 52 ? T.AIR : T.AIR); g.world.setWall(x, y, 2); }
    for (let x = 0; x < 120; x++) for (let y = 0; y < 50; y++) g.world.setFg(x, y, T.STONE);
    g.time = 0; // 夜
    const p = g.playerTile();
    const view = { x: p.x - 10, y: p.y - 6, w: 20, h: 12 };
    const dark = g.computeLight(view, g.heldLights()).get(p.x + 4, p.y);
    g.give('lantern', 1);
    g.inventory.selected = g.inventory.slots.findIndex((s) => s?.item === 'lantern');
    const lit = g.computeLight(view, g.heldLights()).get(p.x + 4, p.y);
    expect(lit).toBeGreaterThan(dark + 0.3);
  });
});

describe('真實地城：拿鑰匙一路開到寶藏室', () => {
  it('依生成資訊取得所有地城鑰匙 → 開所有上鎖的門 → 拿金鑰匙 → 開金寶箱拿到符文鎬', () => {
    const g = new DelveGame({ seed: 'alpha' });
    const d = g.dungeon!;
    expect(d).toBeTruthy();
    const w = g.world;
    // 拿鑰匙：箱子用互動 + 全拿、陶罐直接打破
    const grab = (k: { x: number; y: number; container: string }): void => {
      g.teleport(k.x, k.y);
      if (k.container === 'pot') { expect(g.mineInstant(k.x, k.y)).toBe(true); return; }
      expect(g.interact(k.x, k.y)).toBe(true);
      g.takeAllFromChest();
      g.closeChest();
    };
    for (const k of d.keys.filter((x) => !x.golden)) grab(k);
    expect(g.inventory.count('dungeon_key')).toBe(d.doors.filter((x) => x.locked).length);
    for (const dr of d.doors.filter((x) => x.locked)) {
      g.teleport(dr.x + (w.getFg(dr.x - 1, dr.y + 2) === T.AIR ? -1 : 1), dr.y + 2);
      expect(g.interact(dr.x, dr.y + 1)).toBe(true);
      expect(w.getFg(dr.x, dr.y)).toBe(T.DOOR_OPEN);
    }
    expect(g.inventory.count('dungeon_key')).toBe(0);
    grab(d.keys.find((x) => x.golden)!);
    expect(g.inventory.count('golden_key')).toBe(1);
    g.teleport(d.treasureChest.x + 1, d.treasureChest.y);
    expect(g.interact(d.treasureChest.x, d.treasureChest.y)).toBe(true);
    g.takeAllFromChest();
    expect(g.inventory.count('rune_pickaxe')).toBe(1);
    expect(w.keysUsed).toBe(d.doors.filter((x) => x.locked).length + 1);
  });
});
