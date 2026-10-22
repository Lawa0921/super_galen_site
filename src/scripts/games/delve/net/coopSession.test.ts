// coopSession.test.ts — CoopHostSession／CoopGuestSession（M-C Task 6）：假信令 + 假 peer（LoopbackNet）+ 手動 ticker。
// 虛擬時間：每幀 net.advance → 兩邊的 ticker → 到期的 sleep → 讓出一個 macrotask（信令都是 promise）。
import { describe, it, expect } from 'vitest';
import { normalizeAppearance } from '../engine/appearance';
import type { DelveGame } from '../engine/game';
import type { ItemId } from '../engine/items';
import { createCharacter, type DelveCharacter } from '../save/character';
import type { HeldChar, VisitSave } from '../save/worldSave';
import { LoopbackNet } from './loopback';
import { FakeSignal, fakePeerFactory, manualTicker } from './fakeRtc';
import type { Ticker } from './loop';
import type { RtcPeer } from './rtcLink';
import { END_TEXT } from './guest';
import { LINGER_MS } from './protocol';
import { arenaGame, BUILD, FRAME } from './testRig';
import { CoopHostSession } from './hostSession';
import { CoopGuestSession } from './guestSession';

const WORLD = 'w-coop';
const settle = () => new Promise<void>((r) => setTimeout(r, 0));
/** 每幀讓微任務跑一段（假信令與假 peer 都只靠 promise；沒跑完的留到下一幀繼續）：比每幀一個 macrotask 快很多，全套負載下也不逾時 */
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** 手動 ticker，另外記著 loop 有沒有在跑 */
function trackedTicker(): Ticker & { fire(nowMs: number): void; running: boolean } {
  const m = manualTicker();
  const t = {
    running: false,
    start(cb: (nowMs: number) => void, everyMs: number) { t.running = true; m.start(cb, everyMs); },
    stop() { t.running = false; m.stop(); },
    fire(nowMs: number) { m.fire(nowMs); },
  };
  return t;
}

interface Saved { c: DelveCharacter; world: string | null }
interface G { s: CoopGuestSession; ticker: ReturnType<typeof trackedTicker>; saved: Saved[]; peers: RtcPeer[]; character: DelveCharacter }

function setup() {
  const net = new LoopbackNet();
  const signal = new FakeSignal();
  const makePeer = fakePeerFactory(net);
  const hostGame = arenaGame();
  const visits = new Map<string, VisitSave>();
  const held = new Map<string, HeldChar>();
  const store = {
    worldId: WORLD,
    get: (k: string) => visits.get(k), put: (k: string, v: VisitSave) => { visits.set(k, v); },
    getHeld: (k: string) => held.get(k), putHeld: (k: string, h: HeldChar | null) => { if (h) held.set(k, h); else held.delete(k); },
  };
  let saves = 0;
  const hostTicker = trackedTicker();
  const host = new CoopHostSession(hostGame, {
    signal, makePeer, ticker: hostTicker, build: BUILD, visits: store, requestSave: () => { saves++; }, nick: '房主',
  });
  let t = 0;
  const sleeps: { at: number; r: () => void }[] = [];
  const guests: G[] = [];
  const env = {
    net, signal, hostGame, host, hostTicker, held, guests,
    get t() { return t; },
    get saves() { return saves; },
    /** false：不再觸發房主的 ticker（模擬房主分頁直接關掉） */
    driveHost: true,
    addGuest(nick = '乙'): G {
      const character = { ...createCharacter(nick, normalizeAppearance(undefined), 0), id: `char-${guests.length}` };
      const ticker = trackedTicker();
      const saved: Saved[] = [], peers: RtcPeer[] = [];
      const s = new CoopGuestSession({
        signal, ticker, build: BUILD, character,
        makePeer: () => { const p = makePeer(); peers.push(p); return p; },
        persist: async (c, world) => { saved.push({ c, world }); },
        now: () => 1_000_000 + t,
        sleep: (ms) => new Promise<void>((r) => { sleeps.push({ at: t + ms, r }); }),
      });
      const g = { s, ticker, saved, peers, character };
      guests.push(g);
      return g;
    },
    async run(ms: number): Promise<void> {
      for (let k = 0, n = Math.round(ms / FRAME); k < n; k++) {
        t += FRAME;
        net.advance(FRAME);
        if (env.driveHost) hostTicker.fire(t);
        for (const g of guests) g.ticker.fire(t);
        for (const sl of sleeps.filter((x) => x.at <= t)) { sleeps.splice(sleeps.indexOf(sl), 1); sl.r(); }
        await drain();
      }
    },
    async until(cond: () => boolean, maxMs: number): Promise<boolean> {
      for (let ms = 0; ms < maxMs; ms += FRAME) { if (cond()) return true; await env.run(FRAME); }
      return cond();
    },
    /** 開房並讓客人加入到雙方都 live */
    async joined(nick = '乙'): Promise<G> {
      const room = host.room ?? await host.open();
      const g = env.addGuest(nick);
      const err = g.s.join(room).then(() => null, (e: unknown) => e);
      const ok = await env.until(() => g.s.phase === 'live' && host.players().some((p) => !p.self && p.nick === nick && p.phase === 'live'), 15_000);
      expect(await err).toBeNull();
      expect(ok).toBe(true);
      await env.run(500);
      return g;
    },
  };
  return env;
}

const slotOf = (game: DelveGame, item: ItemId): number => game.local.inventory.slots.findIndex((s) => s?.item === item);
const toss = (g: G): void => { const game = g.s.game!; game.act({ op: 'toss', slot: slotOf(game, 'torch'), n: 1 }); };

describe('CoopHostSession／CoopGuestSession', { timeout: 20_000 }, () => {
  it('房主開房 → 客人加入 → 雙方 players/peers 都有 2 人，客人 phase=live', async () => {
    const e = setup();
    const room = await e.host.open();
    expect(room).toBe('ABCDE');
    expect(e.host.room).toBe('ABCDE');
    expect(e.host.joining).toBe(true);
    expect(e.hostGame.mode).toBe('host');
    const g = await e.joined('乙');
    expect(g.s.phase).toBe('live');
    expect(g.s.worldId).toBe(WORLD);
    const ps = e.host.players();
    expect(ps).toHaveLength(2);
    expect(ps[0]).toEqual({ pid: e.hostGame.localPid, nick: '房主', self: true, rttMs: null, phase: 'live' });
    expect(ps[1]).toMatchObject({ nick: '乙', self: false, phase: 'live' });
    expect(ps[1].pid).toBe(g.s.game!.localPid);
    // 客人看到房主（自己 + 一位同伴 = 2 人）
    await e.until(() => g.s.peers().length === 1, 2000);
    expect(g.s.peers().map((p) => p.pid)).toEqual([e.hostGame.localPid]);
    await e.run(2500);
    expect(g.s.rttMs).not.toBeNull();
    expect(e.host.players()[1].rttMs).not.toBeNull();
  });

  it('poll 只靠 loop 驅動', async () => {
    const e = setup();
    await e.host.open();
    await settle();
    const before = { ...e.signal.calls };
    // 時間過去、微任務跑完，但 ticker 沒有觸發 → 一次信令請求都沒有
    e.net.advance(10_000);
    await settle(); await settle();
    expect(e.signal.calls).toEqual(before);
    e.hostTicker.fire(1);
    await settle();
    expect(e.signal.calls.get).toBeGreaterThan(before.get);
  });

  it('onChange 收到 join 與 leave，nick 正確', async () => {
    const e = setup();
    const evs: { type: string; nick: string }[] = [];
    e.host.onChange((ev) => evs.push(ev));
    const g = await e.joined('丙');
    expect(evs).toEqual([{ type: 'join', nick: '丙' }]);
    void g.s.leave();
    expect(await e.until(() => evs.length === 2, 3000)).toBe(true);
    expect(evs[1]).toEqual({ type: 'leave', nick: '丙' });
    expect(e.host.players()).toHaveLength(1);
  });

  it('客人收到 chk → persist 的 savedAt > 0、pendingWorld=null', async () => {
    const e = setup();
    const g = await e.joined();
    const n0 = g.saved.length;
    toss(g);
    expect(await e.until(() => g.saved.length > n0, 1000)).toBe(true);
    const last = g.saved[g.saved.length - 1];
    expect(last.world).toBeNull();
    expect(last.c.savedAt).toBeGreaterThan(0);
    expect(last.c.id).toBe(g.character.id);
  });

  it('客人 leave → persist 最後一份 chk，phase=ended，link 關閉', async () => {
    const e = setup();
    const g = await e.joined();
    const phases: string[] = [];
    g.s.onPhase((p) => phases.push(p));
    const n0 = g.saved.length;
    let done = false;
    void g.s.leave().then(() => { done = true; });
    expect(g.s.phase).toBe('ended');
    expect(phases).toEqual(['ended']);
    expect(await e.until(() => done, 4000)).toBe(true);
    expect(g.saved.length).toBe(n0 + 1);
    const last = g.saved[g.saved.length - 1];
    expect(last.world).toBeNull();
    expect(last.c.savedAt).toBeGreaterThan(0);
    expect(g.peers[0].link.open).toBe(false);
    expect(g.ticker.running).toBe(false);
    expect(g.s.endText).toBe(END_TEXT.leave);
  });

  it('房主 close → 客人 endText 是 END_TEXT.closed，最後 chk 已 persist', async () => {
    const e = setup();
    const g = await e.joined();
    const n0 = g.saved.length;
    let closed = false;
    void e.host.close().then(() => { closed = true; });
    expect(await e.until(() => g.s.phase === 'ended', 1000)).toBe(true);
    expect(g.s.endText).toBe(END_TEXT.closed);
    expect(await e.until(() => closed && !g.ticker.running, LINGER_MS + 2000)).toBe(true);
    expect(g.saved.length).toBe(n0 + 1);
    const last = g.saved[g.saved.length - 1];
    expect(last.world).toBeNull();
    expect(last.c.savedAt).toBeGreaterThan(0);
    // 客人寫好之後的 chkAck 在延遲關閉期間送到：房主清掉 held
    expect(e.held.has(g.character.id)).toBe(false);
    expect(g.peers[0].link.open).toBe(false);
  });

  it('房主沒關連線（分頁直接沒了）→ 客人 ended 後 LINGER_MS + 1000 自己關連線、停 loop', async () => {
    const e = setup();
    const g = await e.joined();
    void e.host.close();
    e.driveHost = false;
    expect(await e.until(() => g.s.phase === 'ended', 1000)).toBe(true);
    await e.run(LINGER_MS + 500);
    expect(g.peers[0].link.open).toBe(true);
    expect(g.ticker.running).toBe(true);
    await e.run(1000);
    expect(g.peers[0].link.open).toBe(false);
    expect(g.ticker.running).toBe(false);
  });

  it('跨邊界操作後立刻斷線 → persist 帶 pendingWorld=worldId', async () => {
    const e = setup();
    const g = await e.joined();
    // 先拿到一份 chk（toss 觸發），之後才有 lastCheckpoint 可存
    const k0 = g.saved.length;
    toss(g);
    expect(await e.until(() => g.saved.length > k0, 1000)).toBe(true);
    await e.run(200);
    const chk = g.saved[g.saved.length - 1].c;
    const n0 = g.saved.length;
    toss(g);
    e.net.sever(g.peers[0].link);
    expect(await e.until(() => !g.ticker.running, 1000)).toBe(true);
    expect(g.s.phase).toBe('ended');
    expect(g.s.endText).toBe(END_TEXT.hostGone);
    expect(g.saved.length).toBe(n0 + 1);
    const last = g.saved[n0];
    expect(last.world).toBe(WORLD);
    expect(last.c.savedAt).toBeGreaterThan(0);
    expect({ ...last.c, savedAt: 0 }).toEqual({ ...chk, savedAt: 0 });
  });

  it('跨邊界操作後馬上 leave → 房主最後的 chk 涵蓋它 → 不標 pendingWorld', async () => {
    const e = setup();
    const g = await e.joined();
    const k0 = g.saved.length;
    toss(g);   // 先有一份 lastCheckpoint
    expect(await e.until(() => g.saved.length > k0, 1000)).toBe(true);
    await e.run(200);
    const n0 = g.saved.length;
    toss(g);
    let done = false;
    void g.s.leave().then(() => { done = true; });
    expect(await e.until(() => done, 4000)).toBe(true);
    expect(g.saved.length).toBe(n0 + 1);
    expect(g.saved.every((x) => x.world === null)).toBe(true);
  });

  it('close() resolve 後 game.mode === solo、loop 停止', async () => {
    const e = setup();
    await e.joined();
    let closed = false;
    void e.host.close().then(() => { closed = true; });
    expect(e.host.joining).toBe(false);
    expect(await e.until(() => closed, LINGER_MS + 1000)).toBe(true);
    expect(e.hostGame.mode).toBe('solo');
    expect(e.hostTicker.running).toBe(false);
    expect(e.host.room).toBeNull();
    expect(e.saves).toBeGreaterThan(0);
  });

  it('加入失敗 → reject JoinError、phase=failed', async () => {
    const e = setup();
    const g = e.addGuest();
    await expect(g.s.join('ABC')).rejects.toMatchObject({ code: 'badRoom' });
    expect(g.s.phase).toBe('failed');
  });
});
