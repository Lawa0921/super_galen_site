// toss.test.ts — 丟出背包格（co-op M-B2 Task 3，B7）：tossSlot 經 act / exec 的 'toss'，
// 丟的人 TOSS_OWNER_DELAY 秒內撿不回來、其他人立刻撿得到、數量守恆、owner 不存檔。
import { describe, it, expect } from 'vitest';
import { DelveGame, TOSS_OWNER_DELAY, TOSS_VX, TOSS_VY, type DelveEvent } from './game';
import { T, W } from './tiles';
import { BIOME, LIQ } from './world';
import { FIXED_DT, INV_SIZE, TILE_SIZE } from './constants';
import { createCharacter } from '../save/character';
import { normalizeAppearance } from './appearance';
import { snapshotGame, restoreGame } from '../save/serialize';
import type { PlayerActor } from './actor';
import { ITEMS, type ItemId } from './items';
import { overlapsSolid } from './physics';
import type { Tint } from './tint';

const FLOOR = 60;

/** 平地小世界：y ≥ 60 石頭、x 40..69 地表是泥土；本地玩家站在 (40, 59)（同 actors.test.ts） */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'actors', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  for (let x = 40; x < 70; x++) w.setFg(x, FLOOR, T.DIRT);
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainEvents();
  return g;
}

const hero = () => createCharacter('乙', normalizeAppearance(undefined), 0);
function steps(g: DelveGame, n: number): void { for (let i = 0; i < n; i++) g.step(FIXED_DT); }
const ground = (g: DelveGame, item: ItemId) => g.drops.list.filter((d) => d.item === item).reduce((n, d) => n + d.count, 0);
/** 把 n 個 item 放進第 0 格（先清空背包裡同種的，免得起始背包干擾數量） */
function holdAt0(g: DelveGame, item: ItemId, n: number): void {
  const inv = g.inventory;
  inv.slots = inv.slots.map((s) => (s && s.item === item ? null : s));
  inv.slots[0] = { item, count: n };
  inv.select(0);
}

describe('tossSlot（act / exec 的 toss）', () => {
  it('丟出整格：背包清空、地上一堆帶 owner 與倒數、在 facing 那一側、toss 事件', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    const c = g.playerCenter();
    expect(g.facing).toBe(1);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    expect(g.inventory.count('dirt')).toBe(0);
    expect(g.drops.list).toHaveLength(1);
    const d = g.drops.list[0];
    expect(d).toMatchObject({ item: 'dirt', count: 10, owner: 'h', ownerDelay: TOSS_OWNER_DELAY });
    expect(TOSS_OWNER_DELAY).toBe(1.5);
    expect(d.body.x + d.body.w / 2).toBeGreaterThan(c.x);
    expect(d.body.vx).toBeGreaterThan(0);
    expect(d.body.vy).toBeLessThan(0);
    const ev = g.drainEvents();
    expect(ev.find((e) => e.type === 'toss')).toMatchObject({ type: 'toss', item: 'dirt', n: 10 });
  });

  it('往左看時丟到左邊', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    g.setMoveX(-1); steps(g, 1); g.setMoveX(0);
    expect(g.facing).toBe(-1);
    const c = g.playerCenter();
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    const d = g.drops.list[0];
    expect(d.body.x + d.body.w / 2).toBeLessThan(c.x);
    expect(d.body.vx).toBeLessThan(0);
  });

  it('丟出一部分', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    expect(g.act({ op: 'toss', slot: 0, n: 3 })).toBe(true);
    expect(g.inventory.count('dirt')).toBe(7);
    expect(ground(g, 'dirt')).toBe(3);
  });

  it('丟的人 1.5 秒內撿不回來，之後撿得回來', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    g.setMoveX(1); steps(g, 18); g.setMoveX(0);
    steps(g, 84 - 18); // 丟出後 1.4 秒
    expect(g.inventory.count('dirt')).toBe(0);
    expect(ground(g, 'dirt')).toBe(10);
    steps(g, 60);
    expect(g.inventory.count('dirt')).toBe(10);
    expect(g.drops.list).toHaveLength(0);
  });

  it('另一個人立刻撿得到、每一步數量守恆', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 42, y: FLOOR - 1 });
    holdAt0(g, 'dirt', 10);
    b.inventory.slots = b.inventory.slots.map((s) => (s && s.item === 'dirt' ? null : s));
    expect(g.facing).toBe(1);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    const total = () => g.local.inventory.count('dirt') + b.inventory.count('dirt') + ground(g, 'dirt');
    expect(total()).toBe(10);
    for (let i = 0; i < 120; i++) { g.step(FIXED_DT); expect(total()).toBe(10); }
    expect(b.inventory.count('dirt')).toBe(10);
    expect(g.local.inventory.count('dirt')).toBe(0);
  });

  it('exec(b, toss) 丟的是 B 的背包，owner 是 b；本地玩家立刻撿得到', () => {
    const g = arena();
    const b = g.addActor('b', hero(), { x: 38, y: FLOOR - 1 });
    b.inventory.slots = b.inventory.slots.map((s) => (s && s.item === 'gel' ? null : s));
    b.inventory.slots[0] = { item: 'gel', count: 5 };
    g.local.inventory.slots = g.local.inventory.slots.map((s) => (s && s.item === 'gel' ? null : s));
    expect(g.exec('b', { op: 'toss', slot: 0 })).toBe(true);
    expect(b.inventory.count('gel')).toBe(0);
    expect(g.drops.list[0]).toMatchObject({ item: 'gel', count: 5, owner: 'b' });
    const ev = g.drainEvents('b');
    expect(ev.find((e) => e.type === 'toss')).toMatchObject({ type: 'toss', item: 'gel', n: 5, pid: 'b' });
    steps(g, 120);
    expect(g.local.inventory.count('gel')).toBe(5);
  });

  it('撿的人背包滿：留在地上；丟的人過了倒數走過去就撿回', () => {
    const g = arena();
    const b: PlayerActor = g.addActor('b', hero(), { x: 42, y: FLOOR - 1 });
    holdAt0(g, 'dirt', 10);
    // 40 格全部塞滿滿堆的石頭
    b.inventory.slots = b.inventory.slots.map(() => ({ item: 'stone' as ItemId, count: ITEMS.stone.maxStack }));
    expect(b.inventory.slots.every((s) => s !== null)).toBe(true);
    expect(b.inventory.canAdd('dirt', 1)).toBe(false);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    steps(g, 120);
    expect(ground(g, 'dirt')).toBe(10);
    expect(b.inventory.count('dirt')).toBe(0);
    g.setMoveX(1); steps(g, 18); g.setMoveX(0);
    steps(g, 60);
    expect(g.local.inventory.count('dirt')).toBe(10);
    expect(ground(g, 'dirt')).toBe(0);
  });

  it('帶詞條的裝備原樣丟出；鎖定的裝備不能丟', () => {
    const g = arena();
    const gear = g.giveGear('iron_sword', 2);
    expect(gear).not.toBeNull();
    const slot = g.inventory.slots.findIndex((s) => s?.gear === gear);
    const before = structuredClone(g.inventory.slots[slot]!.gear);
    expect(g.act({ op: 'toss', slot })).toBe(true);
    expect(g.inventory.slots[slot]).toBeNull();
    const d = g.drops.list.find((q) => q.item === 'iron_sword')!;
    expect(d.count).toBe(1);
    expect(d.gear).toEqual(before);
    // 鎖定
    const g2 = arena();
    g2.giveGear('iron_sword', 2);
    const s2 = g2.inventory.slots.findIndex((s) => s?.item === 'iron_sword' && s.gear);
    expect(g2.toggleLock(s2)).toBe(true);
    const inv = structuredClone(g2.inventory.slots);
    g2.drainEvents();
    expect(g2.act({ op: 'toss', slot: s2 })).toBe(false);
    expect(g2.inventory.slots).toEqual(inv);
    expect(g2.drops.list).toHaveLength(0);
    const ev: DelveEvent[] = g2.drainEvents();
    expect(ev.find((e) => e.type === 'blocked')).toMatchObject({ type: 'blocked', reason: 'lockedtoss' });
  });

  it('帶顏色的時裝原樣丟出', () => {
    const g = arena();
    const tint: Tint = [3, 5];
    const vanity = (Object.keys(ITEMS) as ItemId[]).find((k) => ITEMS[k].vanity)!;
    g.inventory.slots[0] = { item: vanity, count: 1, tint: [3, 5] };
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    const d = g.drops.list.find((q) => q.item === vanity)!;
    expect(d.tint).toEqual(tint);
  });

  it('貼著牆丟：生成點不卡進牆、落在腳邊地上，旁人立刻撿得到', () => {
    const g = arena();
    // x = 42 那一欄立一道牆，往右走到貼牆
    for (let y = FLOOR - 6; y < FLOOR; y++) g.world.setFg(42, y, T.STONE);
    g.setMoveX(1); steps(g, 40); g.setMoveX(0); steps(g, 10);
    expect(g.facing).toBe(1);
    expect(g.player.x + g.player.w).toBeCloseTo(42 * TILE_SIZE);
    holdAt0(g, 'dirt', 10);
    const c = g.playerCenter();
    const solidAt = (d: { body: { x: number; y: number; w: number; h: number } }) =>
      overlapsSolid(g.env, d.body.x, d.body.y, d.body.w, d.body.h);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    const d = g.drops.list[0];
    expect(solidAt(d)).toBe(false);
    for (let i = 0; i < 60; i++) { g.step(FIXED_DT); expect(solidAt(d)).toBe(false); }
    expect(d.body.onGround).toBe(true);
    expect(d.body.y + d.body.h).toBeCloseTo(FLOOR * TILE_SIZE);
    expect(Math.abs(d.body.x + d.body.w / 2 - c.x)).toBeLessThan(TILE_SIZE);
    expect(d.body.x + d.body.w).toBeLessThanOrEqual(42 * TILE_SIZE);
    expect(ground(g, 'dirt')).toBe(10);

    // 旁人（站在左邊一格）不必等倒數就撿得到
    const g2 = arena();
    for (let y = FLOOR - 6; y < FLOOR; y++) g2.world.setFg(42, y, T.STONE);
    g2.setMoveX(1); steps(g2, 40); g2.setMoveX(0); steps(g2, 10);
    const b = g2.addActor('b', hero(), { x: 40, y: FLOOR - 1 });
    b.inventory.slots = b.inventory.slots.map((s) => (s && s.item === 'dirt' ? null : s));
    holdAt0(g2, 'dirt', 10);
    expect(g2.act({ op: 'toss', slot: 0 })).toBe(true);
    steps(g2, 60); // 1 秒 < TOSS_OWNER_DELAY
    expect(b.inventory.count('dirt')).toBe(10);
    expect(g2.local.inventory.count('dirt')).toBe(0);
  });

  it('不合法：空格、n = 0、n 大於數量、死亡中 → false，地上不變', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    const empty = g.inventory.slots.findIndex((s) => s === null);
    expect(g.act({ op: 'toss', slot: empty })).toBe(false);
    expect(g.act({ op: 'toss', slot: 0, n: 0 })).toBe(false);
    expect(g.act({ op: 'toss', slot: 0, n: 11 })).toBe(false);
    expect(g.act({ op: 'toss', slot: 0, n: 2.5 })).toBe(false);
    expect(g.act({ op: 'toss', slot: -1 })).toBe(false);
    expect(g.act({ op: 'toss', slot: INV_SIZE })).toBe(false);
    g.local.dead = true;
    expect(g.act({ op: 'toss', slot: 0 })).toBe(false);
    expect(g.drops.list).toHaveLength(0);
    expect(g.inventory.count('dirt')).toBe(10);
  });

  it('帶 owner 的堆不跟一般掉落物合併', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    const c = g.playerCenter();
    g.drops.spawn('dirt', 4, c.x + 10, c.y, 0, 0);
    expect(g.act({ op: 'toss', slot: 0, n: 3 })).toBe(true);
    expect(g.drops.list).toHaveLength(2);
    expect(g.drops.list.map((d) => d.count).sort()).toEqual([3, 4]);
    // 同一個人再丟：併進自己的那堆
    expect(g.act({ op: 'toss', slot: 0, n: 2 })).toBe(true);
    expect(g.drops.list).toHaveLength(2);
    expect(g.drops.list.find((d) => d.owner === 'h')!.count).toBe(5);
  });

  it('存檔形狀不變：owner / ownerDelay 不寫進存檔，讀回也沒有', () => {
    const g = arena();
    holdAt0(g, 'dirt', 10);
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    const snap = snapshotGame(g, 0);
    const d0 = snap.header.drops![0];
    expect(d0).toBeDefined();
    expect('owner' in d0).toBe(false);
    expect('ownerDelay' in d0).toBe(false);
    const r = restoreGame(snap);
    if (!r.ok) throw new Error(r.message);
    const rd = r.game.drops.list[0];
    expect(rd.count).toBe(10);
    expect('owner' in rd).toBe(false);
    expect('ownerDelay' in rd).toBe(false);
  });

  it('初速是 facing * TOSS_VX / -TOSS_VY，從玩家中心往 facing 偏 10 px', () => {
    const g = arena();
    holdAt0(g, 'dirt', 1);
    g.act({ op: 'toss', slot: 0 });
    const d = g.drops.list[0];
    expect([TOSS_VX, TOSS_VY]).toEqual([200, 150]);
    expect(d.body.vx).toBe(TOSS_VX);
    expect(d.body.vy).toBe(-TOSS_VY);
    expect(d.body.x + d.body.w / 2).toBeCloseTo(g.playerCenter().x + 10);
    expect(d.body.y + d.body.h / 2).toBeCloseTo(g.playerCenter().y);
  });
});

describe('丟出手上的東西（結束挖掘 / 收線）', () => {
  it('丟掉手上的工具會結束挖掘', () => {
    const g = arena();
    g.inventory.slots[0] = { item: 'wood_pickaxe', count: 1 };
    g.inventory.select(0);
    g.setAim(43, FLOOR);
    g.setMining(true);
    steps(g, 10);
    expect(g.cur.mining).not.toBeNull();
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    expect(g.local.mining).toBeNull();
  });

  it('丟掉釣竿會收線', () => {
    const g = arena();
    g.give('worm', 5);
    g.inventory.slots[0] = { item: 'wood_rod', count: 1 };
    g.inventory.select(0);
    g.setAim(43, FLOOR - 3);
    g.setUse(true); g.step(FIXED_DT); g.setUse(false); g.step(FIXED_DT);
    expect(g.local.fishing).not.toBeNull();
    expect(g.act({ op: 'toss', slot: 0 })).toBe(true);
    steps(g, 1);
    expect(g.local.fishing).toBeNull();
  });
});
