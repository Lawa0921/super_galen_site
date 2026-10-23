// host.test.ts — NetHost（Task 8）：握手、開房基準、sum → col、tiles 興趣範圍、cmd／ack／char／chk、ps、事件分送、逾時、垃圾訊息、關房。
// 房主 = arena（平地小世界）+ LoopbackNet（零延遲）；客人端是手寫的 ScriptedGuest：直接送 JSON／bytes、把收到的訊息依 t 收集。
import { describe, it, expect } from 'vitest';
import { DelveGame } from '../engine/game';
import { T, W } from '../engine/tiles';
import { LIQ } from '../engine/world';
import { BIOME } from '../engine/world';
import { li, type Column, type ColumnLayers, type ColumnSource } from '../engine/column';
import { chunkOfX } from '../engine/coords';
import { PLAYER_H, TILE_SIZE } from '../engine/constants';
import { normalizeAppearance } from '../engine/appearance';
import { rollGear } from '../engine/gear';
import { Rng } from '../engine/rng';
import { createCharacter, type DelveCharacter } from '../save/character';
import type { HeldChar, VisitSave } from '../save/worldSave';
import { LoopbackNet } from './loopback';
import type { Channel, NetLink, Payload } from './link';
import { decodeBulk } from './codec';
import { columnSums } from './chunkSync';
import { BOUNDARY_OPS, CHK_MS, LINGER_MS, MAX_GUESTS, NET_TILE_COLS, PROTO, PS_GROUND, SAVE_DEBOUNCE_MS, WS_HZ, type BulkHead, type Ws } from './protocol';
import { makeEnemy } from '../engine/enemies';
import { NetHost } from './host';

const FLOOR = 60;
const BUILD = 'test-build';
const FRAME = 1000 / 60;
/**
 * 8 人（房主 + 7 位客人都在挖 + 揮）、40 隻怪、20 個掉落物的一則 ws 上限（位元組）。逐項給額度：
 * 一位玩家 230（量到 204：pose 帶 attack + mining；再留攀邊 / 釣魚的空間）、一隻怪 110（量到 102，kind 名字長短不一）、
 * 一個掉落物 64（量到 56）、外框 100 → 7620。瘦身前量到 8101（players 重複帶位置 / 速度、座標沒取整）會超過
 */
const WS_BUDGET = 8 * 230 + 40 * 110 + 20 * 64 + 100;

/** 平地小世界（同 actors.test.ts）：y ≥ 60 石頭；本地玩家站在 (40, 59)；出生點也在 (40, 59)；白天、和平 */
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

class StoneSource implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 0; y < col.height; y++) for (let x = x0; x < x1; x++) col.fg[li(x, y)] = T.STONE;
  }
  surfaceAt(): number { return 0; }
  biomeAt(): number { return 0; }
  layersAt(): ColumnLayers { return { rock: 10, deep: 50, molten: 90 }; }
}
/** 無限小世界：中央 200 欄、外圍全是石頭；出生點在 x 40 */
function infinite(): DelveGame {
  const g = new DelveGame({ seed: 'host-inf', width: 200, height: 100, peaceful: true, bounds: 'infinite', columnSource: new StoneSource() });
  g.liquids.setSprings([]);
  g.spawn.x = 40;
  g.teleport(40, g.spawn.y);
  g.drainEvents();
  return g;
}

type Msg = { t: string; [k: string]: unknown };
/** 手寫的客人端：直接送 JSON／bytes，收到的訊息依通道收集 */
class ScriptedGuest {
  readonly ctrl: Msg[] = [];
  readonly state: Msg[] = [];
  readonly bulk: { head: BulkHead; payload: Uint8Array }[] = [];
  closed = false;
  constructor(readonly link: NetLink) {
    link.onMessage((ch: Channel, d: Payload) => {
      if (ch === 'bulk') { const m = typeof d === 'string' ? null : decodeBulk(d); if (m) this.bulk.push(m); return; }
      if (typeof d !== 'string') return;
      (ch === 'ctrl' ? this.ctrl : this.state).push(JSON.parse(d) as Msg);
    });
    link.onClose(() => { this.closed = true; });
  }
  send(o: unknown): void { this.link.send('ctrl', JSON.stringify(o)); }
  ps(o: unknown): void { this.link.send('state', JSON.stringify(o)); }
  of(t: string): Msg[] { return this.ctrl.filter((m) => m.t === t); }
  last(t: string): Msg | undefined { const l = this.of(t); return l[l.length - 1]; }
  bulkOf(t: string): { head: BulkHead; payload: Uint8Array }[] { return this.bulk.filter((m) => m.head.t === t); }
}

let baseChar: DelveCharacter | null = null;
let charNo = 0;
function hero(o: Partial<DelveCharacter> = {}): DelveCharacter {
  baseChar ??= createCharacter('乙', normalizeAppearance(undefined), 0);
  return { ...JSON.parse(JSON.stringify(baseChar)) as DelveCharacter, id: `char-${++charNo}`, ...o };
}
const hello = (c: DelveCharacter, o: Record<string, unknown> = {}) => ({ t: 'hello', proto: PROTO, build: BUILD, charId: c.id, nick: c.nick, character: c, ...o });

function rig(world: 'arena' | 'infinite' = 'arena', maxGuests?: number, nick?: string) {
  const game = world === 'arena' ? arena() : infinite();
  const net = new LoopbackNet();
  const visits = new Map<string, VisitSave>(), held = new Map<string, HeldChar>();
  const puts: string[] = [];
  const saves: number[] = [];
  let now = 0;
  const host = new NetHost(game, {
    build: BUILD, worldId: 'w1', maxGuests, nick,
    visits: {
      get: (k) => visits.get(k), put: (k, v) => { puts.push(k); visits.set(k, v); },
      getHeld: (k) => held.get(k), putHeld: (k, h) => { if (h) held.set(k, h); else held.delete(k); },
    },
    requestSave: () => { saves.push(now); },
  });
  host.open();
  /** 一幀：網路前進 ms、房主跑 steps 步 */
  const tick = (ms = FRAME, steps = 1): void => { now += ms; net.advance(ms); host.frame(now, steps); };
  const run = (ms: number, steps = 1): void => { const n = Math.round(ms / FRAME); for (let i = 0; i < n; i++) tick(FRAME, steps); };
  const connect = (): ScriptedGuest => { const p = net.pair(); host.accept(p.host); return new ScriptedGuest(p.guest); };
  /** 連線 → hello → welcome → ready → live */
  const join = (c: DelveCharacter = hero()): ScriptedGuest => {
    const g = connect();
    g.send(hello(c));
    tick(); tick();
    g.send({ t: 'ready' });
    tick(); tick();
    return g;
  };
  return { game, net, host, visits, held, puts, saves, tick, run, connect, join, get now() { return now; } };
}

/** 客人 p1 站在地上、左緣 x（px）的 ps */
function psAt(seq: number, x: number, o: Record<string, unknown> = {}) {
  return { t: 'ps', seq, tseq: 0, x, y: FLOOR * TILE_SIZE - PLAYER_H, vx: 0, vy: 0, flags: PS_GROUND, facing: 1, aim: [41, FLOOR], mine: false, use: false, slot: 0, mt: null, ...o };
}

describe('NetHost 握手', () => {
  it('hello → welcome 與 bulk snap；actor 加進遊戲', () => {
    const r = rig();
    const g = r.connect();
    g.send(hello(hero()));
    r.tick(); r.tick();
    const w = g.last('welcome')!;
    expect(w).toBeDefined();
    expect(w.pid).toBe('p1');
    expect(w.seed).toBe(r.game.seed);
    expect(w.w).toBe(160);
    expect(w.h).toBe(100);
    expect(w.bounds).toBe('legacy');
    const a = r.game.actors.get('p1')!;
    expect(w.you).toEqual({ x: a.player.x, y: a.player.y });
    expect((w.players as { pid: string }[]).map((p) => p.pid)).toEqual(['h']);
    const snap = g.bulkOf('snap');
    expect(snap.length).toBe(1);
    expect((snap[0].head as { snap: { visit: unknown } }).snap.visit).not.toBeNull();
    expect(r.game.actors.has('p1')).toBe(true);
    expect(r.host.guests()[0]).toMatchObject({ pid: 'p1', phase: 'syncing' });
    g.send({ t: 'ready' });
    r.tick(); r.tick();
    expect(r.host.guests()[0].phase).toBe('live');
    expect(r.game.mode).toBe('host');
  });

  it('拒絕：proto／build 不同、滿了、角色不合法、同 charId', () => {
    const r = rig();
    const reject = (m: unknown): string | undefined => {
      const g = r.connect();
      g.send(m);
      r.tick(); r.tick();
      return g.last('reject')?.reason as string | undefined;
    };
    expect(reject(hello(hero(), { proto: 2 }))).toBe('proto');
    expect(reject(hello(hero(), { build: 'other' }))).toBe('proto');
    const bad = hero();
    bad.combat = { ...bad.combat, hp: 1e9 };
    expect(reject(hello(bad))).toBe('char');
    const c1 = hero();
    r.join(c1);
    expect(reject(hello({ ...c1 }))).toBe('charInUse');
    for (let i = 0; i < 6; i++) r.join();
    expect([...r.game.actors.keys()]).toEqual(['h', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(reject(hello(hero()))).toBe('full');
    expect(r.game.actors.size).toBe(8);
  });

  it('客人看到的房主暱稱 = opts.nick（welcome players、房主換裝的 look）；沒給才是「房主」', () => {
    const r = rig('arena', undefined, '甲');
    const g = r.join();
    const host = (g.last('welcome')!.players as { pid: string; nick: string }[]).find((p) => p.pid === 'h');
    expect(host?.nick).toBe('甲');
    r.game.act({ op: 'bodyLook', look: { ...r.game.appearance, hair: (r.game.appearance.hair + 1) % 4 } });
    r.run(2000);
    const looks = g.of('look').filter((m) => m.pid === 'h');
    expect(looks.length).toBeGreaterThan(0);
    expect(looks.every((m) => m.nick === '甲')).toBe(true);
    const r2 = rig();
    const g2 = r2.join();
    expect((g2.last('welcome')!.players as { pid: string; nick: string }[]).find((p) => p.pid === 'h')?.nick).toBe('房主');
  });

  it('pid 取最小的空號；其他客人收到新來的 look', () => {
    const r = rig();
    const a = r.join(), b = r.join();
    expect(b.last('welcome')!.pid).toBe('p2');
    expect(a.of('look').some((m) => m.pid === 'p2')).toBe(true);
    a.send({ t: 'bye', reason: 'leave' });
    r.tick(); r.tick();
    expect(b.of('gone').map((m) => m.pid)).toEqual(['p1']);
    const c = r.join();
    expect(c.last('welcome')!.pid).toBe('p1');
  });
});

describe('NetHost 開房基準與 chunk 同步', () => {
  it('open() 之前改過的格子不會出現在任何 tiles；之後的會', () => {
    const r = rig();
    const g = r.join();
    r.run(500);
    const cells = (): number[][] => g.of('tiles').flatMap((m) => (m.batches as { tiles: number[] }[]).flatMap((b) => {
      const out: number[][] = [];
      for (let i = 0; i < b.tiles.length; i += 5) out.push(b.tiles.slice(i, i + 5));
      return out;
    }));
    expect(cells()).toEqual([]);
    r.game.world.setFg(45, FLOOR + 2, T.AIR);
    r.run(100);
    expect(cells()).toEqual([[45, FLOOR + 2, T.AIR, W.NONE, 0]]);
  });

  it('sum → 每欄一則 col：改過的 chunk 在 diff 裡、沒改過的不在', () => {
    const r = rig();
    const ref = arena();                         // 同 seed、同樣蓋好、沒改過的世界
    r.game.world.setFg(70, 70, T.AIR);           // cx 2、cy 2
    r.game.world.setFg(130, 40, T.STONE);        // cx 4、cy 1
    const g = r.join();
    for (let cx = 0; cx <= 4; cx++) g.send({ t: 'sum', cx, sums: columnSums(ref.world, cx) });
    r.tick(); r.tick();
    const cols = g.bulkOf('col').map((m) => m.head as Extract<BulkHead, { t: 'col' }>);
    expect(cols.map((c) => c.cx)).toEqual([0, 1, 2, 3, 4]);
    expect(cols.map((c) => c.diff.map((d) => d.cy))).toEqual([[], [], [2], [], [1]]);
    for (const c of cols) expect(c.revs.length).toBe(r.game.world.chunksY);
  });

  it('tiles 只給範圍內的客人（無限世界）', () => {
    const r = rig('infinite');
    const g = r.join();
    const w = r.game.world;
    const p1 = r.game.actors.get('p1')!;
    const gcx = chunkOfX(Math.floor((p1.player.x + p1.player.w / 2) / TILE_SIZE));
    expect(gcx).toBe(1);
    const y = r.game.spawn.y + 1;
    w.setFg(40, y, w.getFg(40, y) === T.AIR ? T.STONE : T.AIR);
    r.run(100);
    const batches = (): { chunk: number }[] => g.of('tiles').flatMap((m) => m.batches as { chunk: number }[]);
    expect(batches().some((b) => w.chunkCoords(b.chunk).cx === 1)).toBe(true);
    const n = batches().length;
    const far = 40 + 32 * 20;
    r.game.teleport(far, 50);
    w.setFg(far, 50, T.AIR);
    r.run(200);
    expect(batches().slice(n).filter((b) => Math.abs(w.chunkCoords(b.chunk).cx - gcx) > NET_TILE_COLS)).toEqual([]);
    expect(batches().some((b) => w.chunkCoords(b.chunk).cx === chunkOfX(far))).toBe(false);
  });

  it('full 批次：送標記，也在 bulk 送整塊 chunk', () => {
    const r = rig();
    const g = r.join();
    const w = r.game.world;
    const key = w.chunkIndex(1, 1);
    w.edits.markFull(key);
    r.run(100);
    const marks = g.of('tiles').flatMap((m) => m.batches as { chunk: number; full: boolean }[]).filter((b) => b.full);
    expect(marks.map((b) => b.chunk)).toEqual([key]);
    expect(g.bulkOf('chunk').map((m) => (m.head as { key: number }).key)).toEqual([key]);
  });
});

describe('NetHost cmd／ack／char／chk', () => {
  it('cmd craft → ack ok，之後一則 char 含 planks', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => r.game.give('wood', 5));
    r.run(300);
    g.send({ t: 'cmd', seq: 7, cmd: { op: 'craft', recipe: 'planks' } });
    r.run(300);
    expect(g.of('ack')).toEqual([{ t: 'ack', seq: 7, ok: true }]);
    const ch = g.last('char')!;
    expect(JSON.stringify(ch.character)).toContain('"planks"');
    expect(BOUNDARY_OPS.has('craft')).toBe(false);
    expect(BOUNDARY_OPS.has('chestDeposit')).toBe(true);
  });

  it('跨邊界 cmd → 同一幀有 chk（rev 單調、character.rev === rev）；requestSave 2 秒防抖恰好一次', () => {
    const r = rig();
    const g = r.join();
    r.run(200);
    expect(g.of('chk')).toEqual([]);
    g.send({ t: 'cmd', seq: 1, cmd: { op: 'chestDeposit', slot: 0 } });
    r.tick(); r.tick();
    expect(g.of('ack').length).toBe(1);
    expect(g.of('chk').length).toBe(1);
    r.run(500);
    g.send({ t: 'cmd', seq: 2, cmd: { op: 'toss', slot: 0, n: 1 } });
    r.tick(); r.tick();
    const chk = g.of('chk') as unknown as { rev: number; character: DelveCharacter }[];
    expect(chk.length).toBe(2);
    expect(chk[1].rev).toBeGreaterThan(chk[0].rev);
    for (const c of chk) expect(c.character.rev).toBe(c.rev);
    expect(r.saves).toEqual([]);
    r.run(2100);
    expect(r.saves.length).toBe(1);
    r.run(3000);
    expect(r.saves.length).toBe(1);
  });

  it('跨邊界 cmd 每秒一則、連續 10 秒 → 第一則後約 2 秒就存一次，之後也定期存（防抖有最長等待）', () => {
    const r = rig();
    const g = r.join();
    r.run(200);
    const t0 = r.now;
    for (let i = 0; i < 10; i++) {
      g.send({ t: 'cmd', seq: 1 + i, cmd: { op: 'toss', slot: 0, n: 1 } });
      r.run(1000);
    }
    expect(r.saves.length).toBeGreaterThanOrEqual(3);
    expect(r.saves[0] - t0).toBeLessThanOrEqual(2000 + 3 * FRAME);
    for (let i = 1; i < r.saves.length; i++) expect(r.saves[i] - r.saves[i - 1]).toBeLessThanOrEqual(3000 + 3 * FRAME);
  });

  it('buff 生效中、其他欄位不變 → 不會每 200 ms 送一則 char；buff 延長才送（送出的剩餘秒數照舊精確）', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    r.game.withActor(a, () => { r.game.buffs.bless = r.game.time + 120; });
    r.run(1000);
    const n0 = g.of('char').length;
    expect(n0).toBeGreaterThan(0);
    expect((g.last('char')!.character as DelveCharacter).buffsLeft.bless).toBeGreaterThan(100);
    r.run(3000);
    expect(g.of('char').length - n0).toBeLessThanOrEqual(1);
    r.game.withActor(a, () => { r.game.buffs.bless = r.game.time + 300; });
    r.run(400);
    const left = (g.last('char')!.character as DelveCharacter).buffsLeft.bless!;
    expect(left).toBeGreaterThan(299);
    expect(left).toBeLessThanOrEqual(300);
  });

  it('30 秒定時 chk', () => {
    const r = rig();
    const g = r.join();
    r.run(CHK_MS - 500, 0);
    expect(g.of('chk').length).toBe(0);
    r.run(1000, 0);
    expect(g.of('chk').length).toBe(1);
  });

  it('每 1 ms 一則 cmd，共 200 則 → 至少 100 則 rate，房主不拋', () => {
    const r = rig();
    const g = r.join();
    for (let i = 0; i < 200; i++) {
      g.send({ t: 'cmd', seq: 100 + i, cmd: { op: 'respec' } });
      r.tick(1, 0);
    }
    r.tick(); r.tick();
    const acks = g.of('ack');
    expect(acks.length).toBe(200);
    expect(acks.map((m) => m.seq)).toEqual(Array.from({ length: 200 }, (_, i) => 100 + i));
    expect(acks.filter((m) => m.reason === 'rate' && m.ok === false).length).toBeGreaterThanOrEqual(100);
    expect(r.host.guests()[0].phase).toBe('live');
  });
});

describe('NetHost ps', () => {
  it('合法走路被採用；瞬移 → teleport、px 不跳；舊 tseq／舊 seq 被忽略；NaN 丟掉', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    let x = a.player.x, seq = 0;
    for (let i = 0; i < 10; i++) {
      x += 9;
      g.ps(psAt(++seq, x, { vx: 180 }));
      r.run(50);
    }
    expect(a.player.x).toBe(x);
    // 瞬移 500 格
    g.ps(psAt(++seq, x + 500 * TILE_SIZE, { vx: 180 }));
    r.run(50);
    expect(a.player.x).toBe(x);
    const tp = g.last('teleport')!;
    expect(tp).toMatchObject({ x, tseq: 1 });
    // 還沒收到 teleport 的舊 tseq：忽略
    g.ps(psAt(++seq, x + 9, { tseq: 0 }));
    r.run(50);
    expect(a.player.x).toBe(x);
    // 回報新 tseq：照常採用
    g.ps(psAt(++seq, x + 9, { tseq: 1 }));
    r.run(50);
    expect(a.player.x).toBe(x + 9);
    // 舊 seq（亂序晚到）：忽略
    g.ps(psAt(seq - 1, x + 18, { tseq: 1 }));
    r.run(50);
    expect(a.player.x).toBe(x + 9);
    // NaN / Infinity / 壞 JSON：丟掉、不拋
    g.ps({ ...psAt(++seq, x + 18, { tseq: 1 }), x: NaN });
    g.link.send('state', '{"t":"ps","x":NaN}');
    g.link.send('state', JSON.stringify(psAt(++seq, 0, { tseq: 1 })).replace('"x":0', '"x":1e999'));
    r.run(50);
    expect(a.player.x).toBe(x + 9);
    expect(r.host.guests()[0].phase).toBe('live');
  });

  it('ps 帶挖／用／瞄準／選格；停 600 ms → 放開挖', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    g.ps(psAt(1, a.player.x, { mine: true, aim: [41, FLOOR], slot: 2 }));
    r.run(50);
    const inp = r.game.input('p1');
    expect(inp.mining).toBe(true);
    expect(inp.aim).toEqual({ x: 41, y: FLOOR });
    expect(inp.selected).toBe(2);
    r.run(600);
    expect(r.game.input('p1').mining).toBe(false);
  });
});

describe('NetHost 事件分送（C7）', () => {
  it('p1 撿到東西 → ev 有 pickup；房主本地 craft 是私人的，p1 收不到，drainEvents(h) 還拿得到', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    r.game.teleport(120, FLOOR - 1);              // 房主本地走遠：掉落物給最近的玩家
    r.game.drops.spawn('torch', 3, a.player.x + a.player.w / 2, a.player.y + a.player.h / 2, 0, 0);
    r.run(500);
    expect(g.of('ev').flatMap((m) => m.list as { type: string }[]).some((e) => e.type === 'pickup')).toBe(true);
    r.game.give('wood', 2);
    expect(r.game.act({ op: 'craft', recipe: 'planks' })).toEqual({ ok: true });
    r.run(200);
    const all = [...g.of('ev'), ...g.of('pub')].flatMap((m) => m.list as { type: string }[]);
    expect(all.some((e) => e.type === 'craft')).toBe(false);
    expect(r.game.drainEvents('h').some((e) => e.type === 'craft')).toBe(true);
  });
});

describe('NetHost 逾時與關閉', () => {
  it('沉默 89 秒還在；91 秒 → 移除、visits.put、其他客人收到 gone', () => {
    const r = rig();
    const g = r.join(), other = r.join();
    const c = r.host.guests().find((i) => i.pid === 'p1')!;
    for (let s = 0; s < 89; s++) {
      other.send({ t: 'ready' });
      for (let i = 0; i < 10; i++) r.tick(100, 0);
    }
    const info = r.host.guests().find((i) => i.pid === 'p1')!;
    expect(info).toBeDefined();
    expect(info.silentMs).toBeGreaterThanOrEqual(89_000);
    for (let s = 0; s < 2; s++) {
      other.send({ t: 'ready' });
      for (let i = 0; i < 10; i++) r.tick(100, 0);
    }
    r.tick(); r.tick();
    expect(r.game.actors.has('p1')).toBe(false);
    expect(r.puts).toEqual([c.charId]);
    expect(other.of('gone').map((m) => m.pid)).toEqual(['p1']);
    expect(g.last('bye')).toMatchObject({ reason: 'timeout' });
    expect(r.host.guests().map((i) => i.pid)).toEqual(['p2']);
  });

  it('客人端 close() → 同一幀就移除', () => {
    const r = rig();
    const g = r.join();
    g.link.close();
    r.tick(0);
    expect(r.game.actors.has('p1')).toBe(false);
    expect(r.puts.length).toBe(1);
    expect(r.host.guests()).toEqual([]);
  });

  it('重連：held 的角色 rev 較新 → 用房主那份；位置是斷線前的 visit', () => {
    const r = rig();
    const c = hero({ rev: 3 });
    const g = r.join(c);
    const a = r.game.actors.get('p1')!;
    expect(JSON.stringify(c.inventory)).not.toContain('"copper_bar"');
    r.game.withActor(a, () => r.game.give('copper_bar', 5));
    r.run(100);
    r.net.sever(g.link);
    r.tick();
    expect(r.game.actors.has('p1')).toBe(false);
    const g2 = r.join(c);
    const b = r.game.actors.get('p1')!;
    expect(JSON.stringify(r.game.characterOf('p1', 0).inventory)).toContain('"copper_bar"');
    expect(r.visits.has(c.id)).toBe(true);
    expect(b.player.x).toBe(r.visits.get(c.id)!.pos.x);
    expect(g2.last('welcome')).toBeDefined();
    // 再斷一次；這次 hello 帶的 rev 較大 → 用 hello 那份（沒有 copper_bar）
    g2.link.close();
    r.tick();
    r.join({ ...c, rev: 100 });
    expect(JSON.stringify(r.game.characterOf('p1', 0).inventory)).not.toContain('"copper_bar"');
  });

  it('撿到有詞條的裝備 → 同一幀送 chk', () => {
    const r = rig();
    const g = r.join();
    const a = r.game.actors.get('p1')!;
    r.game.teleport(120, FLOOR - 1);
    r.run(200);
    const n = g.of('chk').length;
    const gear = rollGear('iron_sword', new Rng('t'), { rarity: 2, ilvl: 1 });
    r.game.drops.spawn('iron_sword', 1, a.player.x + a.player.w / 2, a.player.y + a.player.h / 2, 0, 0, 0, gear);
    let frames = 0;
    while (!g.of('ev').flatMap((m) => m.list as { type: string; rarity?: number }[]).some((e) => e.type === 'pickup' && e.rarity === 2) && frames < 120) { r.tick(); frames++; }
    expect(frames).toBeLessThan(120);
    // ev 與 chk 在同一幀送出
    const kinds = g.ctrl.map((m) => m.t);
    expect(g.of('chk').length).toBe(n + 1);
    expect(kinds.lastIndexOf('chk')).toBeGreaterThan(kinds.lastIndexOf('ev'));
  });

  it('close：每位客人收到一則 chk 與 bye closed；actor 只剩本地、mode 回 solo', () => {
    const r = rig();
    const a = r.join(), b = r.join();
    r.host.close();
    r.net.flush();
    for (const g of [a, b]) {
      const kinds = g.ctrl.map((m) => m.t);
      expect(kinds.filter((t) => t === 'chk').length).toBe(1);
      expect(g.last('bye')).toMatchObject({ reason: 'closed' });
      expect(kinds.lastIndexOf('chk')).toBeLessThan(kinds.lastIndexOf('bye'));
    }
    expect(r.game.actors.size).toBe(1);
    expect(r.game.mode).toBe('solo');
    expect(r.puts.length).toBe(2);
  });

  it('closeLingering：延遲關閉中的連線立刻全部關掉（不等 LINGER_MS）', () => {
    const r = rig();
    const a = r.join(), b = r.join();
    r.host.close();
    r.net.flush();
    expect(r.host.lingering).toBe(2);
    expect(a.closed || b.closed).toBe(false);
    r.host.closeLingering();
    expect(r.host.lingering).toBe(0);
    expect(a.closed && b.closed).toBe(true);
  });
});

describe('NetHost held 與 chkAck（C1）', () => {
  it('chk.upTo = 處理過的最大 cmd seq；ackedRev 跟著 chkAck 走', () => {
    const r = rig();
    const g = r.join();
    g.send({ t: 'cmd', seq: 4, cmd: { op: 'swap', a: 0, b: 1 } });
    g.send({ t: 'cmd', seq: 9, cmd: { op: 'toss', slot: 0, n: 1 } });
    r.tick(); r.tick();
    const chk = g.last('chk') as unknown as { rev: number; upTo: number };
    expect(chk.upTo).toBe(9);
    expect(r.host.guests()[0].ackedRev).toBe(0);
    g.send({ t: 'chkAck', rev: chk.rev });
    r.tick(); r.tick();
    expect(r.host.guests()[0].ackedRev).toBe(chk.rev);
    g.send({ t: 'chkAck', rev: 0 });                    // 舊的 ack 不會倒退
    r.tick(); r.tick();
    expect(r.host.guests()[0].ackedRev).toBe(chk.rev);
  });

  it('客人 bye → 最後的 chk + held、連線延遲關閉；ack 舊 rev 不清、ack 最後那份才清', () => {
    const r = rig();
    const c = hero();
    const g = r.join(c);
    g.send({ t: 'bye', reason: 'leave' });
    r.tick(); r.tick();
    const fin = g.last('chk') as unknown as { rev: number };
    expect(r.held.get(c.id)?.rev).toBe(fin.rev);
    expect(r.host.lingering).toBe(1);
    g.send({ t: 'chkAck', rev: fin.rev - 1 });
    r.tick(); r.tick();
    expect(r.held.get(c.id)?.rev).toBe(fin.rev);
    g.send({ t: 'chkAck', rev: fin.rev });
    r.tick(); r.tick();
    expect(r.held.has(c.id)).toBe(false);
    r.run(LINGER_MS);
    expect(r.host.lingering).toBe(0);
    expect(g.closed).toBe(true);
  });

  it('close 之後延遲中的連線送來最後那份的 chkAck → held 清掉、requestSave', () => {
    const r = rig();
    const c = hero();
    const g = r.join(c);
    r.host.close();
    const saves0 = r.saves.length;
    r.tick();
    const fin = g.last('chk') as unknown as { rev: number };
    expect(r.held.get(c.id)?.rev).toBe(fin.rev);
    g.send({ t: 'chkAck', rev: fin.rev });
    r.tick(); r.tick();
    expect(r.held.has(c.id)).toBe(false);
    expect(r.saves.length).toBe(saves0 + 1);             // 關房後 loop 可能不再跑：直接存，不走防抖
    r.run(SAVE_DEBOUNCE_MS + 100);
    expect(r.saves.length).toBe(saves0 + 1);
  });

  it('重新加入：held 的 rev 較新就用它；ready 之前 held 不清（中途存世界也還在），上線時的 chk 蓋過、ack 後才清', () => {
    const r = rig();
    const c = hero({ rev: 3 });
    const kept = { ...c, rev: 8, inventory: { ...c.inventory, slots: c.inventory.slots.map(() => null) } };
    r.held.set(c.id, { rev: 8, character: kept, at: 1 });
    const g = r.connect();
    g.send(hello(c));
    r.tick(); r.tick();
    expect(r.game.actors.get('p1')!.inventory.slots.every((s) => s === null)).toBe(true);
    expect(g.of('chk')).toEqual([]);
    // 客人還在 syncing（不送 ready）：過了存世界的防抖，held 仍是那份
    r.run(SAVE_DEBOUNCE_MS + 100);
    expect(r.held.get(c.id)).toEqual({ rev: 8, character: kept, at: 1 });
    g.send({ t: 'ready' });
    r.tick(); r.tick();
    const chk = g.of('chk') as unknown as { rev: number; character: DelveCharacter }[];
    expect(chk.length).toBe(1);
    expect(chk[0].rev).toBe(9);
    expect(chk[0].character.inventory.slots.every((s) => s === null)).toBe(true);
    expect(r.held.get(c.id)?.rev).toBe(9);              // 送出、還沒 ack 的那份
    g.send({ t: 'chkAck', rev: 9 });
    r.tick(); r.tick();
    expect(r.held.has(c.id)).toBe(false);
  });

  it('held 不用時（hello 較新）不送加入 chk；每份 chk 都寫成 held，還連著的客人 ack 後清掉（不另外存世界）', () => {
    const r = rig();
    const c = hero({ rev: 20 });
    r.held.set(c.id, { rev: 8, character: { ...c, rev: 8 }, at: 1 });
    const g = r.join(c);
    expect(g.of('chk')).toEqual([]);
    expect(r.held.has(c.id)).toBe(false);
    r.run(SAVE_DEBOUNCE_MS + 100);
    const saves0 = r.saves.length;
    r.run(CHK_MS);
    const chk = g.last('chk') as unknown as { rev: number };
    expect(chk.rev).toBe(21);
    expect(r.held.get(c.id)?.rev).toBe(21);
    g.send({ t: 'chkAck', rev: 21 });
    r.tick(); r.tick();
    expect(r.held.has(c.id)).toBe(false);
    r.run(SAVE_DEBOUNCE_MS + 100);
    expect(r.saves.length).toBe(saves0);
  });
});

describe('NetHost 垃圾訊息（Review Focus 3）', () => {
  it('垃圾進 ctrl／state／bulk：房主不拋、該客人仍連著、另一位的 ws 照常', () => {
    const r = rig();
    const bad = r.join(), good = r.join();
    r.run(200);
    const ws0 = good.state.filter((m) => m.t === 'ws').length;
    const junk: [Channel, Payload][] = [
      ['ctrl', 'not json'], ['ctrl', '{"t":"nuke"}'], ['ctrl', 'null'], ['ctrl', '[]'], ['ctrl', '5'],
      ['ctrl', JSON.stringify({ t: 'sum', cx: 999, sums: [0, 0, 0, 0] })],
      ['ctrl', JSON.stringify({ t: 'sum', cx: -1, sums: [0, 0, 0, 0] })],
      ['ctrl', JSON.stringify({ t: 'sum', cx: 1, sums: [0, 0] })],
      ['ctrl', JSON.stringify({ t: 'cmd', seq: 1, cmd: { op: 'nuke' } })],
      ['ctrl', JSON.stringify({ t: 'cmd', seq: -1, cmd: { op: 'respec' } })],
      ['ctrl', JSON.stringify({ t: 'hello', proto: PROTO, build: BUILD, charId: 'x', nick: 'x', character: {} })],
      ['ctrl', '{"__proto__":{"t":"ready"}}'],
      ['ctrl', new Uint8Array([1, 2, 3])],
      ['state', 'garbage'], ['state', '{"t":"ps"}'], ['state', new Uint8Array([9])],
      ['bulk', new Uint8Array([255, 255, 255, 255, 1])], ['bulk', 'text on bulk'],
    ];
    expect(() => {
      for (const [ch, d] of junk) bad.link.send(ch, d);
      for (let i = 0; i < 500; i++) bad.send({ t: 'cmd', seq: i, cmd: { op: 'respec' } });
      r.run(500);
    }).not.toThrow();
    expect(bad.closed).toBe(false);
    expect(r.host.guests().map((i) => [i.pid, i.phase])).toEqual([['p1', 'live'], ['p2', 'live']]);
    expect(good.state.filter((m) => m.t === 'ws').length).toBeGreaterThan(ws0 + 5);
    expect(bad.of('ack').filter((m) => m.reason === 'rate').length).toBeGreaterThan(400);
  });
});

describe('NetHost ws 大小（8 人，最終修正）', () => {
  /** 房主 + 7 位客人都在挖 + 揮、附近 40 隻怪、20 個掉落物；數字都是沒取整的小數。回傳第 1 位客人收到的那則 ws（JSON 原文） */
  function busyWs(): { raw: string; ws: Ws } {
    const r = rig();
    const gs = Array.from({ length: 7 }, () => r.join());
    r.run(200);
    const game = r.game;
    let i = 0;
    for (const a of game.actors.values()) {
      const p = a.player;
      p.x = 600 + i * 23.456789123; p.y = FLOOR * TILE_SIZE - p.h - 0.123456789; p.vx = 87.33333333 * (i % 2 ? 1 : -1); p.vy = -213.456789;
      a.facing = i % 2 ? 1 : -1;
      a.mana = 37.866666667; a.hp = 87.5 - i / 3;
      a.attack = { item: 'wood_sword', kind: 'sword', t: 0.123456789, dur: 0.42, angle: -0.785398163, dir: 1, id: i + 1 };
      a.mining = { x: 37 + i, y: FLOOR, elapsed: 0.2345678, need: 0.6666667 };
      i++;
    }
    for (let k = 0; k < 40; k++) {
      const e = makeEnemy(1000 + k, k % 2 ? 'night_walker' : 'gel_blob', 400 + k * 13.3333333, FLOOR * TILE_SIZE - 0.37);
      e.body.vx = 70.123456; e.hp = 23.456; e.state = 'chase';
      game.enemies.push(e);
    }
    for (let k = 0; k < 20; k++) {
      game.drops.list.push({ id: 500 + k, item: 'dirt', count: 1 + k, age: 0, pickDelay: 0, grabbed: false,
        body: { x: 450 + k * 17.77777, y: FLOOR * TILE_SIZE - 20.3333333, w: 10, h: 10, vx: 33.3333, vy: -120.1234, onGround: false, gfxOffY: 0 } });
    }
    // 不跑模擬（steps 0）：狀態原樣留著，只等下一則 ws
    const g = gs[0], n0 = g.state.length;
    for (let k = 0; k < 10 && g.state.length === n0; k++) r.tick(FRAME, 0);
    const ws = g.state[g.state.length - 1] as unknown as Ws;
    expect(ws.t).toBe('ws');
    return { raw: JSON.stringify(ws), ws };
  }

  it('players 只帶 pid / hp / maxHp / mana / pose（位置、速度、面向、死活都在 pose 裡，不重複）；mana 取 2 位小數', () => {
    const { ws } = busyWs();
    expect(ws.players).toHaveLength(8);
    for (const p of ws.players) {
      expect(Object.keys(p).sort()).toEqual(['hp', 'mana', 'maxHp', 'pid', 'pose']);
      expect(p.mana).toBe(37.86);
      expect(p.pose[11]).not.toBeNull();   // mining
      expect(p.pose[10]).not.toBeNull();   // attack
    }
  });

  it('怪物 / 掉落物 / 投射物 / NPC 的座標與速度取 2 位小數', () => {
    const { ws } = busyWs();
    expect(ws.enemies).toHaveLength(40);
    expect(ws.drops).toHaveLength(20);
    const r2ok = (v: number): boolean => Math.round(v * 100) / 100 === v;
    for (const e of ws.enemies) expect(r2ok(e.x) && r2ok(e.y)).toBe(true);
    for (const d of ws.drops) expect(r2ok(d.x) && r2ok(d.y)).toBe(true);
  });

  it('一則 ws 的位元組在預算內（房主上傳 = 位元組 × 15 Hz × 7 位客人）', () => {
    const { raw } = busyWs();
    const bytes = new TextEncoder().encode(raw).length;
    const kbps = (bytes * WS_HZ * MAX_GUESTS) / 1024;
    const ws = JSON.parse(raw) as Ws, len = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;
    console.log(`[ws budget] 8 人 ws = ${bytes} B（players ${len(ws.players)}、enemies ${len(ws.enemies)}、drops ${len(ws.drops)}）；房主上傳 ≈ ${kbps.toFixed(1)} KB/s（${WS_HZ} Hz × ${MAX_GUESTS} 位客人）`);
    console.log(`[ws budget] 一位玩家 ${len(ws.players[1])} B：${JSON.stringify(ws.players[1])}`);
    console.log(`[ws budget] 一隻怪 ${len(ws.enemies[1])} B：${JSON.stringify(ws.enemies[1])}；一個掉落物 ${len(ws.drops[1])} B`);
    expect(bytes).toBeLessThan(WS_BUDGET);
  });
});
