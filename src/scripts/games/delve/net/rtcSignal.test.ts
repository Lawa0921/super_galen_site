import { describe, it, expect } from 'vitest';
import { LoopbackNet } from './loopback';
import { FakeSignal, fakePeerFactory, manualTicker } from './fakeRtc';
import {
  RoomHost, joinRoom, JoinError, normalizeRoom, HOST_POLL_MS, HOST_PASS_TIMEOUT_MS, JOIN_IDLE_MS, ACK_TIMEOUT_MS,
  ACK_POLL_MS, JOIN_SLOTS,
} from './rtcSignal';
import type { NetLink } from './link';
import type { RtcPeer } from './rtcLink';

/** 讓出一個 macrotask：所有已排的微任務與 0ms 計時器都先跑完 */
const settle = async (n = 1) => { for (let i = 0; i < n; i++) await new Promise<void>((r) => setTimeout(r, 0)); };

/** 虛擬時間：sleep 只推進時鐘並讓出 macrotask（讓測試有機會在客人輪詢之間動作） */
function clock(gate?: () => Promise<void>) {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; if (gate) await gate(); await settle(); } };
}

function setup() {
  const net = new LoopbackNet();
  const api = new FakeSignal();
  const peers: RtcPeer[] = [];
  const makePeer = fakePeerFactory(net, (p) => peers.push(p));
  const links: NetLink[] = [];
  const host = new RoomHost(api, makePeer, (l) => links.push(l));
  return { net, api, makePeer, peers, links, host };
}

describe('rtcSignal', () => {
  it('host open 回房號；guest join 後雙方拿到同一對 link', async () => {
    const { net, api, makePeer, links, host } = setup();
    const room = await host.open(0);
    expect(room).toBe('ABCDE');
    const joining = joinRoom(api, makePeer, room, clock());
    await settle();
    host.poll(0);
    const guestLink = await joining;
    await settle();
    expect(links).toHaveLength(1);
    const got: unknown[] = [];
    links[0].onMessage((_ch, d) => got.push(d));
    guestLink.send('ctrl', 'hi');
    net.advance(10); net.flush();
    expect(got).toEqual(['hi']);
  });

  it('房號小寫加空白可加入；含 O 或 1 直接 badRoom 且沒有呼叫 api', async () => {
    const { api, makePeer, links, host } = setup();
    await host.open(0);
    const c = clock();
    const joining = joinRoom(api, makePeer, '  abcde ', c);
    await settle();
    host.poll(0);
    await joining;
    await settle();
    expect(links).toHaveLength(1);
    expect(normalizeRoom('ABCDO')).toBeNull();
    const before = { ...api.calls };
    for (const bad of ['ABCD1', 'ABCDO', 'ABC']) {
      await expect(joinRoom(api, makePeer, bad, c)).rejects.toMatchObject({ code: 'badRoom' });
    }
    expect(api.calls).toEqual(before);
  });

  it('殘留的別人 host-ack 被忽略', async () => {
    const { net, api, makePeer, links, host } = setup();
    const room = await host.open(0);
    // 客人寫完 offer 後，槽位上冒出別人的 ack（id 不同）
    const put = api.put.bind(api);
    api.put = async (r, slot, data) => {
      await put(r, slot, data);
      if (slot === 'guest-0-offer' && data) api.store.set(`${r}:host-ack-0`, JSON.stringify({ id: 'someone-else', answer: 'stale' }));
    };
    const joining = joinRoom(api, makePeer, room, clock());
    await settle(2);   // 客人至少讀過一次殘留 ack
    host.poll(0);
    const guestLink = await joining;
    await settle();
    expect(links).toHaveLength(1);
    const got: unknown[] = [];
    links[0].onMessage((_ch, d) => got.push(d));
    guestLink.send('ctrl', 'ok');
    net.advance(10); net.flush();
    expect(got).toEqual(['ok']);
  });

  it('4 個槽都被占 → full', async () => {
    const { api, makePeer } = setup();
    for (let i = 0; i < JOIN_SLOTS; i++) api.store.set(`ABCDE:guest-${i}-offer`, JSON.stringify({ id: `x${i}`, offer: 'o' }));
    const err = await joinRoom(api, makePeer, 'ABCDE', clock()).catch((e) => e);
    expect(err).toBeInstanceOf(JoinError);
    expect(err.code).toBe('full');
  });

  it('沒有房主 → 30 秒後 noHost，且自己的 offer 槽被清成空字串', async () => {
    const { api, makePeer } = setup();
    const c = clock();
    const err = await joinRoom(api, makePeer, 'ABCDE', c).catch((e) => e);
    expect(err.code).toBe('noHost');
    expect(c.now()).toBeGreaterThanOrEqual(ACK_TIMEOUT_MS - ACK_POLL_MS);
    expect(api.store.get('ABCDE:guest-0-offer')).toBe('');
  });

  it('noHost 時槽位已被別人占走 → 不清別人的 offer', async () => {
    const { api, makePeer } = setup();
    const c = clock();
    const other = JSON.stringify({ id: 'other', offer: 'o' });
    const sleep = c.sleep;
    c.sleep = async (ms) => { api.store.set('ABCDE:guest-0-offer', other); await sleep(ms); };
    const err = await joinRoom(api, makePeer, 'ABCDE', c).catch((e) => e);
    expect(err.code).toBe('noHost');
    expect(api.store.get('ABCDE:guest-0-offer')).toBe(other);
  });

  it('poll 3 秒內只掃一輪', async () => {
    const { api, host } = setup();
    await host.open(0);
    host.poll(0); await settle();
    const g1 = api.calls.get;
    expect(g1).toBe(JOIN_SLOTS);
    host.poll(1000); host.poll(2999); await settle();
    expect(api.calls.get).toBe(g1);
    host.poll(HOST_POLL_MS); await settle();
    expect(api.calls.get).toBe(g1 * 2);
  });

  it('上一輪還在跑（get 卡住）→ poll 不會疊第二輪；卡太久則放棄該輪重掃', async () => {
    const { api, host } = setup();
    await host.open(0);
    let release!: () => void;
    api.hold = new Promise<void>((r) => { release = r; });
    host.poll(0); await settle();
    expect(api.calls.get).toBe(JOIN_SLOTS);
    host.poll(HOST_POLL_MS + 1); await settle();
    expect(api.calls.get).toBe(JOIN_SLOTS);            // 沒疊
    host.poll(HOST_PASS_TIMEOUT_MS + 1); await settle();
    expect(api.calls.get).toBe(JOIN_SLOTS * 2);        // 逾時後重新開一輪
    release();
    await settle();
  });

  it('開放 10 分鐘沒人來 → joining=false；reopen 後恢復', async () => {
    const { host } = setup();
    await host.open(0);
    host.poll(JOIN_IDLE_MS - 1);
    expect(host.joining).toBe(true);
    host.poll(JOIN_IDLE_MS + 1);
    expect(host.joining).toBe(false);
    host.reopen(JOIN_IDLE_MS + 5);
    expect(host.joining).toBe(true);
    expect(host.room).toBe('ABCDE');
  });

  it('同一個 offer id 只處理一次', async () => {
    const { api, makePeer, links, host } = setup();
    const room = await host.open(0);
    const guest = makePeer();
    const offer = await guest.createOffer();
    const raw = JSON.stringify({ id: 'dup', offer });
    api.store.set(`${room}:guest-0-offer`, raw);
    host.poll(0); await settle();
    await guest.acceptAnswer(`fake-answer:${offer}`);
    await settle();
    api.store.set(`${room}:guest-0-offer`, raw);   // 同 id 再出現
    host.poll(HOST_POLL_MS); await settle();
    expect(links).toHaveLength(1);
  });

  it('失敗的客人不影響輪詢，且其 peer 的 link 被關掉', async () => {
    const { api, peers, links, host } = setup();
    const room = await host.open(0);
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'bad', offer: 'unknown-token' }));
    host.poll(0); await settle();
    expect(links).toHaveLength(0);
    expect(api.store.get(`${room}:guest-0-offer`)).toBe('');
    expect(peers).toHaveLength(1);
    const before = api.calls.get;
    host.poll(HOST_POLL_MS); await settle();   // 仍可輪詢
    expect(api.calls.get - before).toBeGreaterThanOrEqual(JOIN_SLOTS);
  });

  it('握手失敗（客人沒接 answer 就取消）→ 房主關閉該 peer、不呼叫 onLink', async () => {
    const net = new LoopbackNet();
    const api = new FakeSignal();
    const peers: RtcPeer[] = [];
    const base = fakePeerFactory(net, (p) => peers.push(p));
    const links: NetLink[] = [];
    // 房主端 waitOpen 直接失敗
    const host = new RoomHost(api, () => {
      const p = base();
      return { get link() { return p.link; }, createOffer: () => p.createOffer(), createAnswer: (o: string) => p.createAnswer(o), acceptAnswer: (a: string) => p.acceptAnswer(a), waitOpen: async () => { throw new Error('rtc open timeout'); } };
    }, (l) => links.push(l));
    const room = await host.open(0);
    const guest = base();
    const offer = await guest.createOffer();
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'g', offer }));
    host.poll(0); await settle();
    expect(links).toHaveLength(0);
    const hostPeer = peers[1];
    expect(hostPeer.link.open).toBe(false);
    expect(api.store.get(`${room}:host-ack-0`)).toBe('');   // 握手結束後房主清掉 ack
  });

  it('兩位客人前後腳加入：第二位在第一位讀 ack 之前開始 → 兩位都連上', async () => {
    const { net, api, makePeer, links, host } = setup();
    const room = await host.open(0);
    let open!: () => void;
    let gate = new Promise<void>((r) => { open = r; });
    const a = joinRoom(api, makePeer, room, clock(() => gate));
    await settle();
    host.poll(0); await settle();                 // 房主收走 A 的 offer、寫了 ack-0，等 A 收下
    expect(api.store.get(`${room}:guest-0-offer`)).toBe('');
    const b = joinRoom(api, makePeer, room, clock());   // A 還沒讀 ack
    await settle(2);
    open();                                       // A 繼續輪詢，讀到自己的 ack
    const linkA = await a;
    await settle(3);
    host.poll(HOST_POLL_MS); await settle();
    const linkB = await b;
    await settle();
    expect(links).toHaveLength(2);
    const got: unknown[][] = [[], []];
    links.forEach((l, i) => l.onMessage((_c, d) => got[i].push(d)));
    linkA.send('ctrl', 'A'); linkB.send('ctrl', 'B');
    net.advance(10); net.flush();
    expect(got.flat().sort()).toEqual(['A', 'B']);
    gate = Promise.resolve();
  });

  it('close() 會關掉進行中的 peer，之後 onLink 絕不再被呼叫', async () => {
    const { api, makePeer, peers, links, host } = setup();
    const room = await host.open(0);
    const guest = makePeer();
    const offer = await guest.createOffer();
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'g', offer }));
    host.poll(0); await settle();                 // 房主正在等客人接 answer
    const hostPeer = peers[1];
    expect(hostPeer.link.open).toBe(true);
    host.close();
    expect(hostPeer.link.open).toBe(false);
    await guest.acceptAnswer(`fake-answer:${offer}`).catch(() => {});
    await settle();
    expect(links).toHaveLength(0);
    expect(host.room).toBeNull();
  });

  it('pass 進行中 close() → 不再清墓碑、不再開新 peer', async () => {
    const { api, makePeer, peers, host } = setup();
    const room = await host.open(0);
    const guest = makePeer();
    const offer = await guest.createOffer();
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'g', offer }));
    let release!: () => void;
    api.hold = new Promise<void>((r) => { release = r; });
    host.poll(0); await settle();
    host.close();
    release(); await settle();
    expect(peers).toHaveLength(1);                 // 只有測試自己的 guest
    expect(api.store.get(`${room}:guest-0-offer`)).not.toBe('');
  });

  it('manualTicker fire 只在 start 後有效', () => {
    const t = manualTicker();
    const seen: number[] = [];
    t.fire(1);
    t.start((n) => seen.push(n), 10);
    t.fire(2);
    t.stop();
    t.fire(3);
    expect(seen).toEqual([2]);
  });
});
