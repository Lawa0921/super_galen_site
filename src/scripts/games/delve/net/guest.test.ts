// guest.test.ts — NetGuest（Task 9）：真的 NetHost + NetGuest、arena 平地小世界、LoopbackNet。
// tick：每 1000/60 ms 依序 net.advance → host.frame → guest.frame，步數各由自己的 FixedStepper 算。
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { BIOME, LIQ } from '../engine/world';
import { GEN_VERSION, TILE_SIZE } from '../engine/constants';
import { OUTER_GEN_VERSION } from '../engine/legacy/chunkgen/index';
import { makeEnemy } from '../engine/enemies';
import { normalizeAppearance } from '../engine/appearance';
import { FixedStepper } from '../render/model';
import { createCharacter, type DelveCharacter } from '../save/character';
import type { HeldChar, VisitSave } from '../save/worldSave';
import { LoopbackNet } from './loopback';
import type { Channel, NetLink, Payload } from './link';
import { encodeBulk } from './codec';
import { snapshotWorld } from './snapshot';
import { CHK_MS, INTERP_DELAY_MS, WS_HZ } from './protocol';
import { NetHost } from './host';
import { END_TEXT, NetGuest, type GuestState, type NetGuestOptions } from './guest';

const FLOOR = 60;
const BUILD = 'test-build';
const FRAME = 1000 / 60;
const LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

/** 平地小世界（同 host.test.ts）：y ≥ 60 石頭；本地玩家與出生點在 (40, 59)；白天、和平 */
function arena(): DelveGame {
  const g = new DelveGame({ seed: 'host', width: 160, height: 100 });
  const w = g.world;
  g.liquids.setSprings([]);
  for (let y = 0; y < w.height; y++) for (let x = 0; x < w.width; x++) {
    w.setLiquid(x, y, 0, LIQ.NONE);
    w.setFg(x, y, y >= FLOOR ? T.STONE : T.AIR);
    w.setWall(x, y, W.NONE);
  }
  for (let x = 0; x < w.width; x++) { w.surface[x] = FLOOR; w.biome[x] = BIOME.FOREST; }
  g.spawn.x = 40; g.spawn.y = FLOOR - 1;
  g.teleport(40, FLOOR - 1);
  g.setDate({ season: 1, day: 2, hour: 12 });
  g.peaceful = true;
  g.drainEvents();
  return g;
}

let baseChar: DelveCharacter | null = null;
let charNo = 0;
function hero(): DelveCharacter {
  baseChar ??= createCharacter('乙', normalizeAppearance(undefined), 0);
  return { ...JSON.parse(JSON.stringify(baseChar)) as DelveCharacter, id: `gchar-${++charNo}` };
}

/** 測試用：客人端的 bulk 晚一幀才交給 NetGuest（零延遲時 welcome 與 snap 同一幀到，看不到 syncing） */
class LateBulk implements NetLink {
  private cbs: ((ch: Channel, d: Payload) => void)[] = [];
  private held: Payload[] = [];
  constructor(private readonly inner: NetLink) {
    inner.onMessage((ch, d) => { if (ch === 'bulk') this.held.push(d); else for (const cb of this.cbs) cb(ch, d); });
  }
  get open(): boolean { return this.inner.open; }
  send(ch: Channel, d: Payload): void { this.inner.send(ch, d); }
  onMessage(cb: (ch: Channel, d: Payload) => void): void { this.cbs.push(cb); }
  onClose(cb: (reason: string) => void): void { this.inner.onClose(cb); }
  close(reason?: string): void { this.inner.close(reason); }
  buffered(ch: Channel): number { return this.inner.buffered(ch); }
  release(): void { const l = this.held; this.held = []; for (const d of l) for (const cb of this.cbs) cb('bulk', d); }
}

function rig(latency = 0, lateBulk = false) {
  const game = arena();
  const net = new LoopbackNet(latency ? { latencyMs: [latency, latency] } : {});
  const visits = new Map<string, VisitSave>(), held = new Map<string, HeldChar>();
  const host = new NetHost(game, {
    build: BUILD, worldId: 'w1',
    visits: { get: (k) => visits.get(k), put: (k, v) => { visits.set(k, v); }, getHeld: (k) => held.get(k), putHeld: (k, h) => { if (h) held.set(k, h); else held.delete(k); } },
  });
  host.open();
  const hs = new FixedStepper(), gs = new FixedStepper();
  let now = 0;
  let guest: NetGuest | null = null;
  let link: NetLink | null = null;
  let late: LateBulk | null = null;
  const states: GuestState[] = [];
  const tick = (): void => {
    now += FRAME;
    net.advance(FRAME);
    host.frame(now, hs.advance(FRAME / 1000));
    if (guest) {
      guest.frame(now, gs.advance(FRAME / 1000));
      if (states[states.length - 1] !== guest.state) states.push(guest.state);
    }
    late?.release();
  };
  const run = (ms: number): void => { const n = Math.round(ms / FRAME); for (let i = 0; i < n; i++) tick(); };
  const join = (o: Partial<NetGuestOptions> = {}): NetGuest => {
    const p = net.pair();
    host.accept(p.host);
    link = p.guest;
    late = lateBulk ? new LateBulk(p.guest) : null;
    guest = new NetGuest(late ?? p.guest, { build: BUILD, character: hero(), ...o });
    states.length = 0;
    states.push(guest.state);
    return guest;
  };
  /** 重連：新的一對連線 */
  const rejoin = (): void => {
    const p = net.pair();
    host.accept(p.host);
    link = p.guest;
    guest!.reconnect(p.guest);
  };
  return { game, net, host, tick, run, join, rejoin, states, get now() { return now; }, get link() { return link!; } };
}

function chunkEq(a: DelveGame, b: DelveGame, cx: number, cy: number): boolean {
  const p = a.world.readChunk(cx, cy), q = b.world.readChunk(cx, cy);
  if (!p || !q) return false;
  return LAYERS.every((L) => p[L].every((v, i) => v === q[L][i]));
}

describe('NetGuest 加入', () => {
  it('connecting → syncing → live；replica、localPid p1；live 之後 1 秒每個 chunk 與房主逐層相等', () => {
    const r = rig(0, true);
    const g = r.join();
    expect(g.state).toBe('connecting');
    expect(g.game).toBeNull();
    for (let i = 0; i < 120 && g.state !== 'live'; i++) r.tick();
    expect(r.states).toEqual(['connecting', 'syncing', 'live']);
    expect(g.game!.mode).toBe('replica');
    expect(g.game!.localPid).toBe('p1');
    expect(g.pid).toBe('p1');
    // 一開始（generateWorld 的地形）與 arena 的平地不同
    const w = r.game.world;
    let diff0 = 0;
    for (let cx = 0; cx < w.width / 32; cx++) for (let cy = 0; cy < w.chunksY; cy++) if (!chunkEq(r.game, g.game!, cx, cy)) diff0++;
    expect(diff0).toBeGreaterThan(0);
    r.run(1000);
    for (let cx = 0; cx < w.width / 32; cx++) for (let cy = 0; cy < w.chunksY; cy++) {
      expect(chunkEq(r.game, g.game!, cx, cy), `chunk ${cx},${cy}`).toBe(true);
      expect(g.sync!.state(w.chunkIndex(cx, cy))).toBe('live');
    }
    // 本地身體在房主給的位置（沒有在生成的地形裡掉下去）
    const a = r.game.actors.get('p1')!.player, me = g.game!.local.player;
    expect(me.x).toBe(a.x);
    expect(Math.abs(me.y - a.y)).toBeLessThanOrEqual(1);
  });
});

describe('NetGuest 走路互相看得到', () => {
  it('客人走 1 秒 → 房主端 p1 與客人相差 ≤ 1 px；房主走 → peers 裡的 h 在 0.3 秒內跟上（2 px）', () => {
    const r = rig();
    const g = r.join();
    r.run(1500);
    const me = g.game!.local.player;
    const x0 = me.x;
    g.game!.setMoveX(1);
    r.run(1000);
    g.game!.setMoveX(0);
    r.run(500);
    expect(me.x).toBeGreaterThan(x0 + 3 * TILE_SIZE);
    expect(Math.abs(r.game.actors.get('p1')!.player.x - me.x)).toBeLessThanOrEqual(1);
    // 房主本地走動
    const hb = r.game.local.player;
    const hx0 = hb.x;
    r.game.setMoveX(-1);
    r.run(1000);
    r.game.setMoveX(0);
    for (let i = 0; i < 120 && hb.vx !== 0; i++) r.tick();
    expect(hb.x).toBeLessThan(hx0 - 3 * TILE_SIZE);
    r.run(300);
    const h = g.peers().find((p) => p.pid === 'h')!;
    expect(h).toBeDefined();
    expect(Math.abs(h.x - hb.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(h.y - hb.y)).toBeLessThanOrEqual(2);
    expect(h.nick).toBe('房主');
    expect(h.look).not.toBeNull();
    expect(g.peers().some((p) => p.pid === 'p1')).toBe(false);
  });
});

describe('NetGuest 怪物進 replica 的列表', () => {
  it('房主在客人旁邊放一隻史萊姆 → 0.5 秒後 replica 有同 id 的一隻，位置差 ≤ 一個內插延遲的位移', () => {
    const r = rig();
    const g = r.join();
    r.run(1500);
    const p1 = r.game.actors.get('p1')!.player;
    const e = makeEnemy(9001, 'gel_blob', p1.x + 5 * TILE_SIZE, p1.y + p1.h);
    r.game.enemies.push(e);
    const hist: { t: number; x: number; y: number }[] = [];
    for (let i = 0; i < 30; i++) { r.tick(); hist.push({ t: r.now, x: e.body.x, y: e.body.y }); }
    const ge = g.game!.enemies.find((q) => q.id === 9001)!;
    expect(ge).toBeDefined();
    expect(ge.kind).toBe('gel_blob');
    // 內插延遲 + 一個 ws 週期 + 兩幀之內房主走過的範圍
    const win = hist.filter((h) => h.t >= r.now - (INTERP_DELAY_MS + 1000 / WS_HZ + 2 * FRAME));
    const xs = win.map((h) => h.x), ys = win.map((h) => h.y);
    expect(ge.body.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1);
    expect(ge.body.x).toBeLessThanOrEqual(Math.max(...xs) + 1);
    expect(ge.body.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1);
    expect(ge.body.y).toBeLessThanOrEqual(Math.max(...ys) + 1);
    // 房主那隻消失 → replica 也消失
    r.game.enemies = r.game.enemies.filter((q) => q !== e);
    r.run(300);
    expect(g.game!.enemies.some((q) => q.id === 9001)).toBe(false);
  });
});

describe('NetGuest 樂觀放置', () => {
  it('被拒的放置回滾：先變 DIRT（樂觀）→ ack ok:false 後變 STONE；背包 dirt 數不變', () => {
    const r = rig(100);
    const g = r.join();
    r.run(2500);
    expect(g.state).toBe('live');
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => r.game.give('dirt', 10));
    r.run(600);
    const loc = g.game!.local;
    const slot = loc.inventory.slots.findIndex((s) => s?.item === 'dirt');
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThan(10);
    const dirt0 = loc.inventory.count('dirt');
    expect(dirt0).toBe(10);
    const gw = g.game!.world;
    expect(gw.getFg(45, FLOOR - 1)).toBe(T.AIR);
    expect(g.sync!.state(gw.chunkIndex(1, 1))).toBe('live');
    g.game!.selectSlot(slot);
    g.game!.setAim(45, FLOOR - 1);
    g.game!.setUse(true);
    r.tick();
    expect(gw.getFg(45, FLOOR - 1)).toBe(T.DIRT);
    // 房主在指令到達之前先在那格放石頭
    r.game.world.setFg(45, FLOOR - 1, T.STONE);
    g.game!.setUse(false);
    r.run(600);
    expect(r.game.world.getFg(45, FLOOR - 1)).toBe(T.STONE);
    expect(gw.getFg(45, FLOOR - 1)).toBe(T.STONE);
    expect(loc.inventory.count('dirt')).toBe(dirt0);
    expect(r.game.withActor(a, () => r.game.inventory.count('dirt'))).toBe(dirt0);
  });

  it('被拒且房主沒動那格 → 還原成空氣；被接受 → 留著，背包經 char 少一個', () => {
    const r = rig(100);
    const g = r.join();
    r.run(2500);
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => r.game.give('dirt', 10));
    r.run(600);
    const loc = g.game!.local, gw = g.game!.world;
    const slot = loc.inventory.slots.findIndex((s) => s?.item === 'dirt');
    g.game!.selectSlot(slot);
    // 被拒：瞄準懸空、沒有支撐的格（房主 support 擋）→ 不樂觀（客人端也看得出沒支撐），格子維持空氣
    g.game!.setAim(46, FLOOR - 5);
    g.game!.setUse(true);
    r.tick();
    g.game!.setUse(false);
    expect(gw.getFg(46, FLOOR - 5)).toBe(T.AIR);
    r.run(600);
    expect(gw.getFg(46, FLOOR - 5)).toBe(T.AIR);
    // 被拒：房主本地站在那格（客人預測只看自己的身體 → 樂觀放下）→ ack ok:false → 還原成空氣
    r.game.teleport(45, FLOOR - 1);
    r.run(300);
    g.game!.setAim(45, FLOOR - 1);
    g.game!.setUse(true);
    r.tick();
    g.game!.setUse(false);
    expect(gw.getFg(45, FLOOR - 1)).toBe(T.DIRT);
    r.run(600);
    expect(r.game.world.getFg(45, FLOOR - 1)).toBe(T.AIR);
    expect(gw.getFg(45, FLOOR - 1)).toBe(T.AIR);
    expect(loc.inventory.count('dirt')).toBe(10);
    // 被接受（房主身體在 45..46 欄、客人在 39..41 欄）
    g.game!.setAim(43, FLOOR - 1);
    g.game!.setUse(true);
    r.tick();
    g.game!.setUse(false);
    expect(gw.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    r.run(600);
    expect(r.game.world.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    expect(gw.getFg(43, FLOOR - 1)).toBe(T.DIRT);
    expect(loc.inventory.count('dirt')).toBe(9);
  });
});

describe('NetGuest 快捷欄選取', () => {
  it('延遲 100 ms、buff 生效中連續換格 20 次 → 房主的 char 不會把選取改回去；房主最後跟上', () => {
    const r = rig(100);
    const g = r.join();
    r.run(2500);
    expect(g.state).toBe('live');
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => { r.game.buffs.bless = r.game.time + 120; });
    r.run(600);
    expect(g.game!.local.buffs.bless).toBeDefined();
    const loc = g.game!.local;
    let reverted = 0, last = 0;
    for (let k = 0; k < 20; k++) {
      last = (k * 3 + 1) % 10;
      g.game!.selectSlot(last);
      for (let i = 0; i < 24; i++) { r.tick(); if (loc.inventory.selected !== last) reverted++; }
    }
    expect(reverted).toBe(0);
    r.run(600);
    expect(loc.inventory.selected).toBe(last);
    expect(a.inventory.selected).toBe(last);
  });
});

describe('NetGuest 世界層級的先後', () => {
  it('ctrl 的 world（較新）比 bulk 的加入 snap 先到 → snap 不蓋掉世界層級，只套它的 visit', () => {
    const hg = arena();
    hg.local.markers.push({ x: 33, y: 44 });
    const old = snapshotWorld(hg, hg.visitOf(hg.localPid, 0));
    hg.kills = { gel_blob: 5 };
    hg.world.keysUsed = 2;
    const fresh = snapshotWorld(hg, null);
    const net = new LoopbackNet();
    const p = net.pair();
    p.host.onMessage((ch, d) => {
      if (ch !== 'ctrl' || typeof d !== 'string' || (JSON.parse(d) as { t: string }).t !== 'hello') return;
      p.host.send('ctrl', JSON.stringify({
        t: 'welcome', pid: 'p1', worldId: 'w', seed: 'host', genVersion: GEN_VERSION, outerGenVersion: OUTER_GEN_VERSION,
        bounds: 'legacy', w: 160, h: 100, time: 0, tick: 0, peaceful: true, you: { x: 640, y: 900 }, players: [],
      }));
      p.host.send('ctrl', JSON.stringify({ t: 'world', snap: fresh }));
      p.host.send('bulk', encodeBulk({ t: 'snap', snap: old }));
    });
    const g = new NetGuest(p.guest, { build: BUILD, character: hero(), createReplica: () => arena() });
    for (let i = 1; i <= 5; i++) { net.advance(FRAME); g.frame(i * FRAME, 1); }
    expect(g.state).toBe('live');
    expect(g.game!.kills).toEqual({ gel_blob: 5 });
    expect(g.game!.world.keysUsed).toBe(2);
    expect(g.game!.local.markers).toEqual([{ x: 33, y: 44 }]);
  });
});

describe('NetGuest 重連', () => {
  it('rev 表在 welcome 重來：reconnect 之後 sync.rev(k) === 0，再同步一次後與房主一致', () => {
    const r = rig();
    const g = r.join();
    r.run(1500);
    const w = r.game.world, key = w.chunkIndex(1, 1);
    w.setFg(50, FLOOR - 3, T.STONE);
    w.setFg(51, FLOOR - 3, T.STONE);
    r.run(300);
    expect(w.edits.rev(key)).toBeGreaterThan(0);
    expect(g.sync!.rev(key)).toBe(w.edits.rev(key));
    const old = g.game;
    r.net.sever(r.link);
    r.tick();
    expect(g.state).toBe('ended');
    r.rejoin();
    expect(g.state).toBe('connecting');
    expect(g.game).toBeNull();
    for (let i = 0; i < 120 && g.state === 'connecting'; i++) r.tick();
    expect(g.game).not.toBe(old);
    expect(g.sync!.rev(key)).toBe(0);
    r.run(1000);
    expect(g.state).toBe('live');
    expect(g.sync!.rev(key)).toBe(w.edits.rev(key));
    expect(g.game!.world.getFg(51, FLOOR - 3)).toBe(T.STONE);
  });
});

describe('NetGuest 重連拿到房主較新的角色', () => {
  it('斷線前撿到但沒收到 chk → 重連時房主用 held（rev 較新）→ 客人收到那份 char', () => {
    const r = rig();
    const g = r.join();
    r.run(1500);
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => r.game.give('copper_bar', 5));
    r.run(400);
    expect(g.game!.local.inventory.count('copper_bar')).toBe(5);
    expect(g.lastCheckpoint).toBeNull();
    r.net.sever(r.link);
    r.tick();
    r.rejoin();
    for (let i = 0; i < 120 && g.state !== 'live'; i++) r.tick();
    r.run(500);
    expect(g.state).toBe('live');
    expect(g.game!.local.inventory.count('copper_bar')).toBe(5);
  });
});

describe('NetGuest teleport', () => {
  it('teleport 清掉跳躍計時、攀爬、攀邊、坐船、摔落高度（同房主的 teleport()）', () => {
    const r = rig();
    const g = r.join();
    r.run(1500);
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => r.game.teleport(60, FLOOR - 1));
    r.tick();                                          // 房主這一幀送出 teleport
    const loc = g.game!.local;
    loc.motion.jumpTimer = 0.3;
    loc.motion.climbing = true;
    loc.motion.mantle = { x0: loc.player.x, y0: loc.player.y, x1: loc.player.x + 8, y1: loc.player.y - 16, t: 0, dur: 0.2, edgeX: 0, edgeY: 0 } as never;
    loc.boating = true;
    loc.fallPeak = 123;
    r.net.advance(FRAME);
    g.frame(r.now + FRAME, 0);                         // 只收訊、不跑步（看 handler 本身清掉了什麼）
    expect(loc.player.x).toBe(a.player.x);
    expect(loc.player.y).toBe(a.player.y);
    expect(loc.motion.jumpTimer).toBe(0);
    expect(loc.motion.climbing).toBe(false);
    expect(loc.motion.mantle ?? null).toBeNull();
    expect(loc.boating).toBe(false);
    expect(loc.fallPeak).toBeNull();
  });
});

describe('NetGuest checkpoint', () => {
  it('toss → onCheckpoint 一則（背包少了那格）；30 秒後再一則', () => {
    const r = rig();
    const calls: { c: DelveCharacter; rev: number }[] = [];
    const g = r.join({ onCheckpoint: (c, rev) => { calls.push({ c, rev }); } });
    r.run(1500);
    expect(calls).toEqual([]);
    const slot = g.game!.local.inventory.slots.findIndex((s) => s?.item === 'torch');
    expect(slot).toBeGreaterThanOrEqual(0);
    g.game!.act({ op: 'toss', slot });
    r.run(200);
    expect(calls.length).toBe(1);
    expect(calls[0].c.inventory.slots[slot]).toBeNull();
    expect(calls[0].c.rev).toBe(calls[0].rev);
    expect(g.lastCheckpoint).toEqual({ rev: calls[0].rev, character: calls[0].c, upTo: 1 });
    r.run(CHK_MS);
    expect(calls.length).toBe(2);
    expect(calls[1].rev).toBeGreaterThan(calls[0].rev);
  });
});

describe('NetGuest 主機離線', () => {
  it('host.close() → ended、主機已離線、lastCheckpoint 是最後那則', () => {
    const r = rig();
    const calls: { c: DelveCharacter; rev: number }[] = [];
    const g = r.join({ onCheckpoint: (c, rev) => { calls.push({ c, rev }); } });
    r.run(1500);
    r.host.close();
    r.tick(); r.tick();
    expect(g.state).toBe('ended');
    expect(g.endText).toBe('主機已離線');
    expect(END_TEXT.hostGone).toBe('主機已離線');
    expect(calls.length).toBe(1);
    expect(g.lastCheckpoint).toEqual({ rev: calls[0].rev, character: calls[0].c, upTo: 0 });
    expect(r.link.open).toBe(true);                // 連線由房主延遲關閉（LINGER_MS），客人不自己關
  });

  it('sever → ended、主機已離線、lastCheckpoint 是最後那則', () => {
    const r = rig();
    const calls: { c: DelveCharacter; rev: number }[] = [];
    const g = r.join({ onCheckpoint: (c, rev) => { calls.push({ c, rev }); } });
    r.run(1500);
    const slot = g.game!.local.inventory.slots.findIndex((s) => s?.item === 'torch');
    g.game!.act({ op: 'toss', slot });
    r.run(200);
    expect(calls.length).toBe(1);
    r.net.sever(r.link);
    r.tick();
    expect(g.state).toBe('ended');
    expect(g.endText).toBe('主機已離線');
    expect(g.lastCheckpoint).toEqual({ rev: calls[0].rev, character: calls[0].c, upTo: 1 });
  });

  it('房主沉默超過 HOST_TIMEOUT_MS → ended hostGone', () => {
    const net = new LoopbackNet();
    const p = net.pair();
    const g = new NetGuest(p.guest, { build: BUILD, character: hero() });
    g.frame(0, 0);
    g.frame(89_000, 0);
    expect(g.state).toBe('connecting');
    g.frame(91_000, 0);
    expect(g.state).toBe('ended');
    expect(g.endText).toBe('主機已離線');
  });

  it('leave → bye leave、ended 已離開；房主移除 actor；最後的 chk 收得到', () => {
    const r = rig();
    const calls: { c: DelveCharacter; rev: number }[] = [];
    const g = r.join({ onCheckpoint: (c, rev) => { calls.push({ c, rev }); } });
    r.run(1500);
    g.leave();
    expect(g.state).toBe('ended');
    expect(g.endText).toBe('已離開');
    r.run(200);
    expect(r.game.actors.has('p1')).toBe(false);
    expect(calls.length).toBe(1);
    expect(r.link.open).toBe(false);
  });
});

describe('NetGuest 拒絕與版本', () => {
  /** 手寫的房主端：收到 hello 就回一則（可改過的）welcome */
  function scripted(patch: Record<string, unknown>, character: DelveCharacter = hero()) {
    const net = new LoopbackNet();
    const p = net.pair();
    p.host.onMessage((ch, d) => {
      if (ch !== 'ctrl' || typeof d !== 'string') return;
      const m = JSON.parse(d) as { t: string };
      if (m.t !== 'hello') return;
      p.host.send('ctrl', JSON.stringify({
        t: 'welcome', pid: 'p1', worldId: 'w', seed: 'host', genVersion: GEN_VERSION, outerGenVersion: OUTER_GEN_VERSION,
        bounds: 'legacy', w: 160, h: 100, time: 0, tick: 0, peaceful: true, you: { x: 640, y: 900 }, players: [], ...patch,
      }));
    });
    let made = 0;
    const g = new NetGuest(p.guest, { build: BUILD, character, createReplica: () => { made++; return arena(); } });
    let now = 0;
    const tick = (): void => { now += FRAME; net.advance(FRAME); g.frame(now, 1); };
    return { net, p, g, tick, get made() { return made; } };
  }

  it('genVersion 不同 → ended 世界版本不同，無法加入（不建 replica）', () => {
    const s = scripted({ genVersion: GEN_VERSION + 1 });
    for (let i = 0; i < 5; i++) s.tick();
    expect(s.g.state).toBe('ended');
    expect(s.g.endText).toBe('世界版本不同，無法加入');
    expect(s.made).toBe(0);
    expect(s.g.game).toBeNull();
  });

  it('welcome 先把時間設成房主的再套角色：buff 以房主時間計', () => {
    const s = scripted({ time: 5000 }, { ...hero(), buffsLeft: { bless: 60 } });
    for (let i = 0; i < 3; i++) s.tick();
    expect(s.g.state).toBe('syncing');
    expect(s.made).toBe(1);
    expect(s.g.game!.local.buffs.bless).toBe(5060);
  });

  it('bulk snap 比 welcome 先到（兩條可靠通道彼此不保證順序）→ 先留著，welcome 之後套上 → live、送 ready', () => {
    const net = new LoopbackNet();
    const p = net.pair();
    const got: string[] = [];
    p.host.onMessage((ch, d) => {
      if (ch !== 'ctrl' || typeof d !== 'string') return;
      const m = JSON.parse(d) as { t: string };
      got.push(m.t);
      if (m.t !== 'hello') return;
      // 先送 bulk 的 snap，再送 ctrl 的 welcome（零延遲：依送出順序到達）
      p.host.send('bulk', encodeBulk({ t: 'snap', snap: snapshotWorld(arena(), null) }));
      p.host.send('ctrl', JSON.stringify({
        t: 'welcome', pid: 'p1', worldId: 'w', seed: 'host', genVersion: GEN_VERSION, outerGenVersion: OUTER_GEN_VERSION,
        bounds: 'legacy', w: 160, h: 100, time: 0, tick: 0, peaceful: true, you: { x: 640, y: 900 }, players: [],
      }));
    });
    const g = new NetGuest(p.guest, { build: BUILD, character: hero(), createReplica: () => arena() });
    for (let i = 1; i <= 5; i++) { net.advance(FRAME); g.frame(i * FRAME, 1); }
    expect(g.state).toBe('live');
    net.advance(FRAME);
    expect(got.slice(0, 2)).toEqual(['hello', 'ready']);
  });

  it('outerGenVersion 不同 → 一樣', () => {
    const s = scripted({ outerGenVersion: OUTER_GEN_VERSION + 1 });
    for (let i = 0; i < 5; i++) s.tick();
    expect(s.g.endText).toBe('世界版本不同，無法加入');
    expect(s.made).toBe(0);
  });

  it('reject full → ended 房間已滿（連線由房主延遲關閉，客人不自己關）', () => {
    const net = new LoopbackNet();
    const p = net.pair();
    p.host.onMessage(() => { p.host.send('ctrl', JSON.stringify({ t: 'reject', reason: 'full' })); });
    const g = new NetGuest(p.guest, { build: BUILD, character: hero() });
    for (let i = 1; i < 5; i++) { net.advance(FRAME); g.frame(i * FRAME, 1); }
    expect(g.state).toBe('ended');
    expect(g.endText).toBe('房間已滿');
    expect(p.guest.open).toBe(true);
    expect(END_TEXT).toMatchObject({
      full: '房間已滿', proto: '版本不同，請重新整理頁面', gen: '世界版本不同，無法加入', charInUse: '這個角色已經在房間裡',
      char: '角色檔格式不正確', closed: '主機已離線', hostGone: '主機已離線', timeout: '連線逾時', leave: '已離開',
    });
  });

  it('房主送垃圾：frame 不拋、仍是 live、之後正常訊息照收', () => {
    const r = rig();
    const net = r.net;
    const p = net.pair();
    r.host.accept(p.host);
    const g = new NetGuest(p.guest, { build: BUILD, character: hero() });
    let now = 0;
    const hs = new FixedStepper(), gs = new FixedStepper();
    const tick = (): void => { now += FRAME; net.advance(FRAME); r.host.frame(now, hs.advance(FRAME / 1000)); g.frame(now, gs.advance(FRAME / 1000)); };
    for (let i = 0; i < 60; i++) tick();
    expect(g.state).toBe('live');
    const junk: [Parameters<NetLink['send']>[0], string | Uint8Array][] = [
      ['ctrl', 'not json'], ['ctrl', 'null'], ['ctrl', '[]'], ['ctrl', '{"t":"nuke"}'],
      ['ctrl', '{"t":"tiles","batches":5}'], ['ctrl', '{"t":"tiles","batches":[{"chunk":1,"rev":99,"tiles":[1,2],"chests":"x","full":false}]}'],
      ['ctrl', '{"t":"ev","list":7}'], ['ctrl', '{"t":"char","character":null}'], ['ctrl', '{"t":"world","snap":{}}'],
      ['ctrl', '{"t":"teleport","x":"a"}'], ['ctrl', '{"t":"ack","seq":1}'], ['ctrl', '{"t":"look"}'], ['ctrl', '{"t":"gone"}'],
      ['ctrl', new Uint8Array([1])],
      ['state', 'garbage'], ['state', '{"t":"ws","tick":1e12,"players":5}'], ['state', '{"t":"ws","tick":"x"}'],
      ['bulk', new Uint8Array([255, 255, 255, 255, 1])], ['bulk', 'text'],
      ['bulk', encodeBulk({ t: 'col', cx: 1, revs: [1], diff: [] })],
      ['bulk', encodeBulk({ t: 'chunk', key: 3, rev: 9, chests: [] }, new Uint8Array([9, 9]))],
      ['bulk', encodeBulk({ t: 'liq', chunks: [1, 2] }, new Uint8Array([1]))],
      ['bulk', encodeBulk({ t: 'snap', snap: null as never })],
    ];
    expect(() => {
      for (const [ch, d] of junk) p.host.send(ch, d);
      for (let i = 0; i < 30; i++) tick();
    }).not.toThrow();
    expect(g.state).toBe('live');
    // 自己的技能開始 / 冷卻是本地已預測過的 → 丟掉；別的私人事件與別人的技能事件照收
    g.game!.drainEvents();
    p.host.send('ctrl', JSON.stringify({ t: 'ev', list: [
      { type: 'skill', skill: 'dash', phase: 'start', x: 0, y: 0, n: 0, pid: g.pid },
      { type: 'skill', skill: 'dash', phase: 'cd', x: 0, y: 0, n: 3, pid: g.pid },
      { type: 'skill', skill: 'slam', phase: 'land', x: 0, y: 0, n: 1, pid: g.pid },
      { type: 'craft', recipe: 'planks', item: 'planks', n: 1, pid: g.pid },
    ] }));
    p.host.send('ctrl', JSON.stringify({ t: 'pub', list: [{ type: 'skill', skill: 'dash', phase: 'start', x: 0, y: 0, n: 0, pid: 'h' }] }));
    tick();
    const evs = g.game!.drainEvents().map((e) => (e.type === 'skill' ? `${e.type}:${e.phase}:${e.pid}` : `${e.type}:${e.pid}`));
    expect(evs).toEqual(['skill:land:p1', 'craft:p1', 'skill:start:h']);
    r.game.world.setFg(50, FLOOR - 3, T.STONE);
    for (let i = 0; i < 30; i++) tick();
    expect(g.game!.world.getFg(50, FLOOR - 3)).toBe(T.STONE);
    expect(g.peers().some((q) => q.pid === 'h')).toBe(true);
    // 副本在半套用的狀態上拋例外：那一幀的工作丟掉、不拋出 frame、日誌照樣清掉，之後照常
    const rep = g.game!;
    const step = rep.step;
    rep.step = () => { throw new Error('boom'); };
    rep.world.setFg(60, FLOOR - 3, T.STONE);
    expect(() => { for (let i = 0; i < 5; i++) tick(); }).not.toThrow();
    expect(rep.world.edits.drain()).toEqual([]);
    rep.step = step;
    r.game.world.setFg(52, FLOOR - 3, T.STONE);
    for (let i = 0; i < 30; i++) tick();
    expect(g.state).toBe('live');
    expect(rep.world.getFg(52, FLOOR - 3)).toBe(T.STONE);
  });
});
