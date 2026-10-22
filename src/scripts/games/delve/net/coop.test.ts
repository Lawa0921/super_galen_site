// coop.test.ts — M-B3 驗收（Task 11）A1、A2、A6–A10：同一行程裡的房主 + 客人，經 LoopbackNet（arena 平地小世界）。
// 每條結束前 run 到靜止，再斷言 sameTiles(i) 是 []（客人同步集合內每個 chunk 與房主逐層相等）。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { TILE_SIZE } from '../engine/constants';
import type { DelveGame } from '../engine/game';
import type { PlayerActor } from '../engine/actor';
import type { ItemId } from '../engine/items';
import { NetLoop, type Ticker } from './loop';
import { END_TEXT, type NetGuest } from './guest';
import { coopRig, FRAME, FLOOR, type Rig } from './testRig';

/** 靜止：輸入放開後跑這麼久（延遲 + 重送 + 一個 char 週期都夠） */
const REST_MS = 2000;

class FakeTicker implements Ticker {
  cb: ((n: number) => void) | null = null;
  start(cb: (n: number) => void): void { this.cb = cb; }
  stop(): void { this.cb = null; }
  fire(now: number): void { this.cb?.(now); }
}

const actorOf = (r: Rig, g: NetGuest): PlayerActor => r.hostGame.actors.get(g.pid!)!;
const invCount = (game: DelveGame, item: ItemId): number => game.local.inventory.count(item);
const slotOf = (game: DelveGame, item: ItemId): number => game.local.inventory.slots.findIndex((s) => s?.item === item);
const tileX = (b: { x: number; w: number }): number => Math.floor((b.x + b.w / 2) / TILE_SIZE);

/** 跑到 cond 為真（最多 maxMs）；回傳是否達成 */
function until(r: Rig, cond: () => boolean, maxMs: number): boolean {
  for (let t = 0; t < maxMs; t += FRAME) { if (cond()) return true; r.run(FRAME); }
  return cond();
}

/** 客人按住挖 (x, y)，直到房主那格變成空氣（最多 maxMs），放開 */
function guestDig(r: Rig, g: NetGuest, x: number, y: number, maxMs = 6000): boolean {
  g.game!.setAim(x, y);
  g.game!.setMining(true);
  const ok = until(r, () => r.hostGame.world.getFg(x, y) === T.AIR, maxMs);
  g.game!.setMining(false);
  return ok;
}

/** 客人拿 item 對 (x, y) 按一下使用（放置），等到房主那格是 tile（最多 maxMs） */
function guestPlace(r: Rig, g: NetGuest, item: ItemId, x: number, y: number, tile: number, maxMs = 3000): boolean {
  const slot = slotOf(g.game!, item);
  if (slot < 0) return false;
  g.game!.selectSlot(slot);
  g.game!.setAim(x, y);
  g.game!.setUse(true);
  r.run(FRAME);
  g.game!.setUse(false);
  return until(r, () => r.hostGame.world.getFg(x, y) === tile, maxMs);
}

describe('A1 客人挖／放 → 一致（arena）', () => {
  it('挖 (45, 60) 泥土：兩邊都是空氣、房主端 p1 +1 dirt、客人經 char +1；放回去：兩邊都是 DIRT', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    expect(g.state).toBe('live');
    hg.world.setFg(45, FLOOR, T.DIRT);
    r.run(500);
    expect(g.game!.world.getFg(45, FLOOR)).toBe(T.DIRT);
    const a = actorOf(r, g);
    const host0 = a.inventory.count('dirt'), mine0 = invCount(g.game!, 'dirt');
    expect(guestDig(r, g, 45, FLOOR)).toBe(true);
    // 掉落物在 5 格外（MAGNET_TILES 邊緣）：客人往右走兩步去撿
    g.game!.setMoveX(1);
    expect(until(r, () => r.count('dirt').drops === 0, 2000)).toBe(true);
    g.game!.setMoveX(0);
    r.run(REST_MS);
    expect(hg.world.getFg(45, FLOOR)).toBe(T.AIR);
    expect(g.game!.world.getFg(45, FLOOR)).toBe(T.AIR);
    expect(a.inventory.count('dirt')).toBe(host0 + 1);
    expect(invCount(g.game!, 'dirt')).toBe(mine0 + 1);
    expect(r.count('dirt').drops).toBe(0);
    // 放回去
    expect(guestPlace(r, g, 'dirt', 45, FLOOR, T.DIRT)).toBe(true);
    r.run(REST_MS);
    expect(hg.world.getFg(45, FLOOR)).toBe(T.DIRT);
    expect(g.game!.world.getFg(45, FLOOR)).toBe(T.DIRT);
    expect(a.inventory.count('dirt')).toBe(host0);
    expect(invCount(g.game!, 'dirt')).toBe(mine0);
    expect(r.synced(0)).toContain(1);
    expect(r.sameTiles(0)).toEqual([]);
  });
});

describe('A2 兩位客人（arena、guests: 2）', () => {
  it('A 放一格 → 房主與 B 一致；同一格同一刻 A 放、B 挖 → 三方一致', () => {
    const r = coopRig({ guests: 2 });
    const [A, B] = r.guests, hg = r.hostGame;
    expect(A.state).toBe('live');
    expect(B.state).toBe('live');
    hg.withActor(actorOf(r, A), () => hg.give('dirt', 10));
    r.run(600);
    expect(guestPlace(r, A, 'dirt', 43, FLOOR - 1, T.DIRT)).toBe(true);
    r.run(REST_MS);
    expect(hg.world.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    expect(A.game!.world.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    expect(B.game!.world.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    // 同一幀送出：A 放 (37, 59)、B 挖 (37, 59)
    const x = 37, y = FLOOR - 1;
    A.game!.selectSlot(slotOf(A.game!, 'dirt'));
    A.game!.setAim(x, y);
    A.game!.setUse(true);
    B.game!.setAim(x, y);
    B.game!.setMining(true);
    r.run(FRAME);
    A.game!.setUse(false);
    r.run(4000);
    B.game!.setMining(false);
    r.run(REST_MS);
    const v = hg.world.getFg(x, y);
    expect(A.game!.world.getFg(x, y)).toBe(v);
    expect(B.game!.world.getFg(x, y)).toBe(v);
    expect(r.sameTiles(0)).toEqual([]);
    expect(r.sameTiles(1)).toEqual([]);
    // 物品守恆：A 少的 dirt 不是在 B、就是在地上或格子裡
    const c = r.count('dirt');
    expect(c.host + c.guestsOnHost[0] + c.guestsOnHost[1] + c.drops + (v === T.DIRT ? 1 : 0) + 1).toBe(10);
  });
});

describe('A6 延遲 100–200 ms、30% 丟包（arena）', () => {
  it('位置收斂、挖放 10 格後 tiles 一致、dirt 數一致', () => {
    const r = coopRig({ latencyMs: [100, 200], loss: 0.3 });
    const g = r.guests[0], hg = r.hostGame, me = g.game!.local.player;
    expect(g.state).toBe('live');
    const a = actorOf(r, g);
    // 客人往右走 3 秒停下 → 1 秒內房主端 p1 與客人本地差 ≤ 1 px
    const x0 = me.x;
    g.game!.setMoveX(1);
    r.run(3000);
    g.game!.setMoveX(0);
    r.run(1000);
    expect(me.x).toBeGreaterThan(x0 + 10 * TILE_SIZE);
    expect(Math.abs(a.player.x - me.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(a.player.y - me.y)).toBeLessThanOrEqual(1);
    // 房主本地走動停下 → 1 秒內 peers 的 h 差 ≤ 2 px
    const hb = hg.local.player, hx0 = hb.x;
    hg.setMoveX(-1);
    r.run(1000);
    hg.setMoveX(0);
    r.run(1000);
    expect(hb.x).toBeLessThan(hx0 - 3 * TILE_SIZE);
    const h = g.peers().find((p) => p.pid === 'h')!;
    expect(h).toBeDefined();
    expect(Math.abs(h.x - hb.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(h.y - hb.y)).toBeLessThanOrEqual(2);
    // 客人連挖 10 格、放 10 格（腳下兩側，不挖自己站的那兩欄）
    hg.withActor(a, () => hg.give('dirt', 10));
    r.run(1000);
    const cx = tileX(me);
    const cells: [number, number][] = [];
    for (const dx of [-4, -3, -2, 2, 3, 4]) cells.push([cx + dx, FLOOR]);
    for (const dx of [-3, -2, 2, 3]) cells.push([cx + dx, FLOOR + 1]);
    for (const [x, y] of cells) expect(guestDig(r, g, x, y), `dig ${x},${y}`).toBe(true);
    r.run(REST_MS);
    for (const [x, y] of [...cells].reverse()) expect(guestPlace(r, g, 'dirt', x, y, T.DIRT), `place ${x},${y}`).toBe(true);
    r.run(REST_MS);
    for (const [x, y] of cells) {
      expect(hg.world.getFg(x, y)).toBe(T.DIRT);
      expect(g.game!.world.getFg(x, y)).toBe(T.DIRT);
    }
    expect(r.sameTiles(0)).toEqual([]);
    expect(invCount(g.game!, 'dirt')).toBe(a.inventory.count('dirt'));
    expect(r.net.stats().dropped).toBeGreaterThan(0);
  });
});

describe('A7 斷線重連（arena；Review Focus 4）', () => {
  it('撿 5 個 torch（沒有 chk）→ sever → 房主移除、visit 寫回 → 重連：背包有那 5 個（不是 10 個）、位置是斷線前的', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    // 房主走開（免得房主自己撿走）
    hg.teleport(120, FLOOR - 1);
    r.run(500);
    const a = actorOf(r, g);
    const torch0 = a.inventory.count('torch');
    expect(invCount(g.game!, 'torch')).toBe(torch0);
    const chk0 = r.checkpoints[0].length;
    const ft = { x: tileX(a.player), y: FLOOR - 1 };
    hg.dropAtTile('torch', 5, ft.x, ft.y);
    r.run(1500);
    expect(a.inventory.count('torch')).toBe(torch0 + 5);
    expect(invCount(g.game!, 'torch')).toBe(torch0 + 5);
    expect(r.checkpoints[0].length).toBe(chk0);
    const pos = { x: a.player.x, y: a.player.y };
    const charId = r.chars[0].id;
    r.net.sever(r.links[0]);
    r.run(100);
    expect(hg.actors.has('p1')).toBe(false);
    expect(r.visits.has(charId)).toBe(true);
    expect(r.visits.get(charId)!.pos.x).toBe(pos.x);
    expect(g.state).toBe('ended');
    r.reconnect(0);
    expect(until(r, () => g.state === 'live', 5000)).toBe(true);
    r.run(REST_MS);
    expect(invCount(g.game!, 'torch')).toBe(torch0 + 5);
    const b = actorOf(r, g);
    expect(b.inventory.count('torch')).toBe(torch0 + 5);
    expect(g.game!.local.player.x).toBe(pos.x);
    expect(Math.abs(g.game!.local.player.y - pos.y)).toBeLessThanOrEqual(1);
    expect(b.player.x).toBe(pos.x);
    expect(r.sameTiles(0)).toEqual([]);
  });

  it('客人沉默 30 秒（還沒逾時）→ 同 charId 從第二條連線 hello → reject charInUse；舊的那位恢復後照常 live', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    r.pause(0, true);
    r.run(30_000);
    expect(hg.actors.has('p1')).toBe(true);
    expect(r.host.guests()[0].phase).toBe('live');
    const g2 = r.join({ character: r.chars[0] });
    r.run(500);
    expect(g2.state).toBe('ended');
    expect(g2.endText).toBe(END_TEXT.charInUse);
    expect(r.host.guests().length).toBe(1);
    r.pause(0, false);
    const ps0 = r.ps[0];
    r.run(REST_MS);
    expect(g.state).toBe('live');
    expect(r.ps[0]).toBeGreaterThan(ps0);
    expect(hg.actors.has('p1')).toBe(true);
    // 恢復後照常：客人挖一格，房主那邊也變了
    hg.world.setFg(43, FLOOR, T.DIRT);
    r.run(500);
    expect(guestDig(r, g, 43, FLOOR)).toBe(true);
    r.run(REST_MS);
    expect(g.game!.world.getFg(43, FLOOR)).toBe(T.AIR);
    expect(r.sameTiles(0)).toEqual([]);
  });
});

describe('A8 房主分頁在背景不停（arena）', () => {
  it('NetLoop + FakeTicker 每 1000 ms 一次、共 20 次 → hostGame.time 前進 ≥ 19.9 秒；客人照常收 ws、live', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    r.driveHost = false;
    const t = new FakeTicker();
    const loop = new NetLoop(t, (n, s) => r.host.frame(n, s));
    loop.start();
    const time0 = hg.time;
    t.fire(r.now);
    hg.setMoveX(1);
    const seen: number[] = [];
    for (let i = 1; i <= 20; i++) {
      if (i === 10) hg.setMoveX(0);
      r.run(1000);
      t.fire(r.now);
      const h = g.peers().find((p) => p.pid === 'h');
      if (h) seen.push(h.x);
    }
    loop.stop();
    expect(hg.time - time0).toBeGreaterThanOrEqual(19.9);
    expect(g.state).toBe('live');
    expect(seen.length).toBe(20);
    expect(Math.max(...seen)).toBeGreaterThan(seen[0] + 3 * TILE_SIZE);
    r.driveHost = true;
    r.run(REST_MS);
    expect(r.sameTiles(0)).toEqual([]);
  });
});

describe('A9 客人分頁在背景（arena，非和平、客人旁邊一隻史萊姆）', () => {
  it('pause 60 秒：p1 沒被移除、px 不變、hp 下降；恢復後 1 秒內 ps 照常、仍是 live', () => {
    const r = coopRig({ peaceful: false });
    const g = r.guests[0], hg = r.hostGame;
    const a = actorOf(r, g);
    // 先離開出生點（不然死掉重生也在同一格，px 不變就證明不了什麼）
    g.game!.setMoveX(1);
    r.run(1500);
    g.game!.setMoveX(0);
    r.run(1000);
    expect(tileX(a.player)).toBeGreaterThan(50);
    const hp0 = a.hp, px0 = a.player.x;
    hg.spawnEnemy('gel_blob', tileX(a.player) + 2, FLOOR - 1);
    r.pause(0, true);
    let minHp = hp0, moved = 0, removed = false, died = false;
    const watch = (): void => {
      const b = hg.actors.get('p1');
      if (b !== a) { removed = true; return; }
      if (a.dead) died = true;
      minHp = Math.min(minHp, a.hp);
      moved = Math.max(moved, Math.abs(a.player.x - px0));
    };
    // 前 10 秒史萊姆照樣打得到（U9：照樣受傷）；之後清掉怪物、關掉自然生成，免得 60 秒內被打死重生
    r.run(10_000, watch);
    expect(minHp).toBeLessThan(hp0);
    expect(died).toBe(false);
    hg.enemies = [];
    hg.peaceful = true;
    r.run(50_000, watch);
    expect(removed).toBe(false);
    expect(died).toBe(false);
    expect(moved).toBe(0);
    expect(r.host.guests()[0].phase).toBe('live');
    r.pause(0, false);
    const ps0 = r.ps[0];
    r.run(1000);
    expect(r.ps[0]).toBeGreaterThan(ps0);
    expect(g.state).toBe('live');
    expect(r.host.guests()[0].silentMs).toBeLessThan(500);
    hg.enemies = [];
    r.run(REST_MS);
    expect(r.sameTiles(0)).toEqual([]);
  });
});

describe('A10 物品守恆（arena）', () => {
  it('客人丟 10 dirt、房主走過去撿 → 每一幀 host + p1 + drops === 10；互丟各 3 次 → 總數不變', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    const a = actorOf(r, g);
    hg.withActor(a, () => hg.give('dirt', 10));
    hg.teleport(48, FLOOR - 1);
    r.run(600);
    const total = (): number => { const c = r.count('dirt'); return c.host + c.guestsOnHost[0] + c.drops; };
    expect(total()).toBe(10);
    const bad: number[] = [];
    const check = (): void => { const n = total(); if (n !== 10) bad.push(n); };
    g.game!.act({ op: 'toss', slot: slotOf(g.game!, 'dirt') });
    r.run(200, check);
    expect(r.count('dirt').drops).toBe(10);
    // 房主走過去撿
    const drop = hg.drops.list.find((d) => d.item === 'dirt')!;
    hg.setMoveX(Math.sign(drop.body.x - hg.local.player.x) || -1);
    r.run(3000, () => { check(); if (r.count('dirt').drops === 0) hg.setMoveX(0); });
    hg.setMoveX(0);
    r.run(REST_MS, check);
    expect(bad).toEqual([]);
    expect(r.count('dirt').drops).toBe(0);
    expect(r.count('dirt').host).toBe(10);
    expect(invCount(g.game!, 'dirt')).toBe(0);
    // 互丟各 3 次：房主站在客人右邊 2 格、面向左丟；客人面向右丟
    hg.teleport(tileX(a.player) + 2, FLOOR - 1);
    hg.local.facing = -1;
    r.run(500, check);
    for (let i = 0; i < 3; i++) {
      hg.act({ op: 'toss', slot: slotOf(hg, 'dirt'), n: 1 });
      r.run(2500, check);
    }
    expect(a.inventory.count('dirt')).toBe(3);
    r.run(REST_MS, check);
    expect(invCount(g.game!, 'dirt')).toBe(3);
    g.game!.local.facing = 1;
    for (let i = 0; i < 3; i++) {
      g.game!.act({ op: 'toss', slot: slotOf(g.game!, 'dirt'), n: 1 });
      r.run(2500, check);
    }
    r.run(REST_MS, check);
    expect(bad).toEqual([]);
    expect(r.count('dirt').host).toBe(10);
    expect(a.inventory.count('dirt')).toBe(0);
    expect(r.sameTiles(0)).toEqual([]);
  });

  it('客人把 1 個 silver_coin 存進箱子（chk 到了）立刻 sever → 箱子 + 最後一次 chk === 1，重連後 retained 也不含那 1 個', () => {
    const r = coopRig();
    const g = r.guests[0], hg = r.hostGame;
    const a = actorOf(r, g);
    hg.teleport(120, FLOOR - 1);
    hg.withActor(a, () => hg.give('silver_coin', 1));
    const cx = tileX(a.player) + 2;
    hg.world.setFg(cx, FLOOR - 1, T.CHEST);
    r.run(600);
    expect(invCount(g.game!, 'silver_coin')).toBe(1);
    // 打開箱子（ps.use 對著箱子）
    g.game!.setAim(cx, FLOOR - 1);
    g.game!.setUse(true);
    r.run(200);
    g.game!.setUse(false);
    r.run(200);
    expect(hg.withActor(a, () => hg.chestSlots())).not.toBeNull();
    const chk0 = r.checkpoints[0].length;
    g.game!.act({ op: 'chestDeposit', slot: slotOf(g.game!, 'silver_coin') });
    expect(until(r, () => r.checkpoints[0].length > chk0, 1000)).toBe(true);
    r.net.sever(r.links[0]);
    r.run(100);
    const c = r.count('silver_coin');
    expect(c.chests).toBe(1);
    expect(c.chests + c.lastChk[0]).toBe(1);
    // 重連：房主 retained（rev 較新）也不含那 1 個
    r.reconnect(0);
    expect(until(r, () => g.state === 'live', 5000)).toBe(true);
    r.run(REST_MS);
    expect(invCount(g.game!, 'silver_coin')).toBe(0);
    expect(r.count('silver_coin').guestsOnHost[0]).toBe(0);
    expect(r.count('silver_coin').chests).toBe(1);
    expect(r.sameTiles(0)).toEqual([]);
  });

  it('記錄剩餘窗口：房主已存入、chk 還在路上就 sever → 客人的最後 chk 仍有那 1 個；同一場重連時 retained 較新，不複製', () => {
    const r = coopRig({ latencyMs: [50, 50] });
    const g = r.guests[0], hg = r.hostGame;
    const a = actorOf(r, g);
    hg.teleport(120, FLOOR - 1);
    hg.withActor(a, () => hg.give('silver_coin', 1));
    const cx = tileX(a.player) + 2;
    hg.world.setFg(cx, FLOOR - 1, T.CHEST);
    r.run(600);
    // 先拿到一則有那 1 個的 chk（toss 一個 torch 觸發）
    g.game!.act({ op: 'toss', slot: slotOf(g.game!, 'torch'), n: 1 });
    r.run(600);
    expect(r.count('silver_coin').lastChk[0]).toBe(1);
    g.game!.setAim(cx, FLOOR - 1);
    g.game!.setUse(true);
    r.run(300);
    g.game!.setUse(false);
    r.run(300);
    g.game!.act({ op: 'chestDeposit', slot: slotOf(g.game!, 'silver_coin') });
    expect(until(r, () => r.count('silver_coin').chests === 1, 1000)).toBe(true);
    r.net.sever(r.links[0]);
    r.run(100);
    const c = r.count('silver_coin');
    expect(c.chests + c.lastChk[0]).toBe(2);          // 已知窗口（spec §5.7：不追求零窗口）
    r.reconnect(0);
    expect(until(r, () => g.state === 'live', 5000)).toBe(true);
    r.run(REST_MS);
    expect(invCount(g.game!, 'silver_coin') + r.count('silver_coin').chests).toBe(1);
    expect(r.sameTiles(0)).toEqual([]);
  });
});
