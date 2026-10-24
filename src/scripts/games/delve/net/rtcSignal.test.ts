import { describe, it, expect, vi, afterEach } from 'vitest';
import { LoopbackNet } from './loopback';
import { FakeBatchSignal, FakeSignal, fakePeerFactory, manualTicker } from './fakeRtc';
import {
  RoomHost, joinRoom, JoinError, normalizeRoom, HOST_POLL_MS, HOST_PASS_TIMEOUT_MS, JOIN_IDLE_MS, ACK_TIMEOUT_MS,
  ACK_POLL_MS, JOIN_SLOTS, DELVE_NS, realSignalApi, HOST_POLL_BACKOFF, HOST_POLL_MAX_MS, JOIN_ERROR_TEXT, hostOpenErrorText,
  SERVICE_DOWN_PASSES, SIGNAL_REQ_BUDGET_MS, WORST_CASE_SIGNAL_REQS, GUEST_WORST_WAIT_MS,
} from './rtcSignal';
import { ICE_GATHER_TIMEOUT_MS } from '../../tetris/net/webrtcTransport';
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

  it('poll 未到間隔不掃第二輪（第一輪空的 → 間隔退讓成 HOST_POLL_MS × 1.5）', async () => {
    const { api, host } = setup();
    await host.open(0);
    host.poll(0); await settle();
    const g1 = api.calls.get;
    expect(g1).toBe(JOIN_SLOTS);
    host.poll(1000); host.poll(2999); host.poll(HOST_POLL_MS * HOST_POLL_BACKOFF - 1); await settle();
    expect(api.calls.get).toBe(g1);
    host.poll(HOST_POLL_MS * HOST_POLL_BACKOFF); await settle();
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
    host.poll(HOST_POLL_MS); await settle();      // 房主在 A 的 ack 還沒被讀之前就處理 B
    open();                                       // 這時 A 才繼續輪詢
    const [linkA, linkB] = await Promise.all([a, b]);
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

describe('rtcSignal 批次讀槽（getMany）', () => {
  afterEach(() => vi.unstubAllGlobals());

  function batchSetup() {
    const net = new LoopbackNet();
    const api = new FakeBatchSignal();
    const makePeer = fakePeerFactory(net);
    const links: NetLink[] = [];
    const host = new RoomHost(api, makePeer, (l) => links.push(l));
    return { net, api, makePeer, links, host };
  }

  it('api 有 getMany → 一輪只發一次 getMany，不逐槽 get', async () => {
    const { api, host } = batchSetup();
    await host.open(0);
    host.poll(0); await settle();
    expect(api.calls.getMany).toBe(1);
    expect(api.calls.get).toBe(0);
    expect(api.manySlots[0]).toEqual(Array.from({ length: JOIN_SLOTS }, (_, i) => `guest-${i}-offer`));
  });

  it('getMany 版房主照樣接得到客人（seen / 墓碑 / 握手不變）', async () => {
    const { net, api, makePeer, links, host } = batchSetup();
    const room = await host.open(0);
    const joining = joinRoom(api, makePeer, room, clock());
    await settle();
    host.poll(0);
    const guestLink = await joining;
    await settle();
    expect(links).toHaveLength(1);
    expect(api.store.get(`${room}:guest-0-offer`)).toBe('');   // 墓碑照清
    const got: unknown[] = [];
    links[0].onMessage((_ch, d) => got.push(d));
    guestLink.send('ctrl', 'hi');
    net.advance(10); net.flush();
    expect(got).toEqual(['hi']);
  });

  it('getMany 版：同一個 offer id 只處理一次', async () => {
    const { api, makePeer, links, host } = batchSetup();
    const room = await host.open(0);
    const guest = makePeer();
    const offer = await guest.createOffer();
    const raw = JSON.stringify({ id: 'dup', offer });
    api.store.set(`${room}:guest-2-offer`, raw);
    host.poll(0); await settle();
    await guest.acceptAnswer(`fake-answer:${offer}`);
    await settle();
    api.store.set(`${room}:guest-2-offer`, raw);
    host.poll(HOST_POLL_MS); await settle();
    expect(links).toHaveLength(1);
  });

  it('realSignalApi.getMany 打一次 GET ?slots=（房號帶 DELVE_NS），依 slots 順序回值', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      urls.push(url);
      return { ok: true, status: 200, json: async () => ({ data: { 'guest-0-offer': null, 'guest-1-offer': 'x' } }) } as unknown as Response;
    });
    expect(realSignalApi.getMany).toBeTypeOf('function');
    const got = await realSignalApi.getMany!('ABCDE', ['guest-0-offer', 'guest-1-offer']);
    expect(got).toEqual([null, 'x']);
    expect(urls).toHaveLength(1);
    const u = new URL(urls[0], 'http://localhost');
    expect(u.searchParams.get('room')).toBe(`${DELVE_NS}ABCDE`);
    expect(u.searchParams.get('slots')).toBe('guest-0-offer,guest-1-offer');
  });
});

describe('rtcSignal 閒置退讓（idle backoff）', () => {
  /** 從 t 開始連跑 n 輪空的掃描（每輪剛好在到期時 poll）；回傳最後一輪開始的時間 */
  async function emptyPasses(host: RoomHost, t: number, n: number): Promise<number> {
    let last = t;
    for (let i = 0; i < n; i++) {
      last = t;
      host.poll(t); await settle();
      t += host.pollIntervalMs;
    }
    return last;
  }

  it('常數：3 秒起跳、×1.5、上限 10 秒；最壞情況仍在客人的 ack 逾時內', () => {
    expect(HOST_POLL_MS).toBe(3000);
    expect(HOST_POLL_BACKOFF).toBe(1.5);
    expect(HOST_POLL_MAX_MS).toBe(10_000);
    // 正常最壞：房主剛掃完才寫 offer → 最多等 HOST_POLL_MAX_MS 才被看到，再多一輪 ack 輪詢
    expect(HOST_POLL_MAX_MS + ACK_POLL_MS).toBeLessThan(ACK_TIMEOUT_MS);
  });

  it('最壞等待預算：退讓上限 + 一輪卡住 + ICE 收集 + 4 次請求延遲 + ack 輪詢 < ACK_TIMEOUT_MS', () => {
    expect(SIGNAL_REQ_BUDGET_MS).toBe(1000);
    // 房主讀槽（MGET）、清 offer 墓碑、寫 ack、客人讀 ack
    expect(WORST_CASE_SIGNAL_REQS).toBe(4);
    // 一輪卡住：被放棄後要等 max(HOST_PASS_TIMEOUT_MS, 間隔) 才重掃
    const expected = HOST_POLL_MAX_MS + Math.max(HOST_PASS_TIMEOUT_MS, HOST_POLL_MAX_MS)
      + ICE_GATHER_TIMEOUT_MS + WORST_CASE_SIGNAL_REQS * SIGNAL_REQ_BUDGET_MS + ACK_POLL_MS;
    expect(GUEST_WORST_WAIT_MS).toBe(expected);
    expect(GUEST_WORST_WAIT_MS).toBeLessThan(ACK_TIMEOUT_MS);
  });

  it('沒有新 offer 的每一輪 → 間隔 ×1.5，封頂 10 秒；到期前不掃', async () => {
    const { api, host } = setup();
    await host.open(0);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
    const seen: number[] = [];
    let t = 0;
    for (let i = 0; i < 6; i++) {
      const before = api.calls.get;
      host.poll(t); await settle();
      expect(api.calls.get - before).toBe(JOIN_SLOTS);
      seen.push(host.pollIntervalMs);
      // 下一輪到期前一毫秒：不掃
      host.poll(t + host.pollIntervalMs - 1); await settle();
      expect(api.calls.get - before).toBe(JOIN_SLOTS);
      t += host.pollIntervalMs;
    }
    expect(seen).toEqual([4500, 6750, HOST_POLL_MAX_MS, HOST_POLL_MAX_MS, HOST_POLL_MAX_MS, HOST_POLL_MAX_MS]);
  });

  it('看到新 offer → 間隔回到 3 秒', async () => {
    const { api, makePeer, host } = setup();
    const room = await host.open(0);
    const t = await emptyPasses(host, 0, 4);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MAX_MS);
    const guest = makePeer();
    const offer = await guest.createOffer();
    api.store.set(`${room}:guest-1-offer`, JSON.stringify({ id: 'g', offer }));
    host.poll(t + HOST_POLL_MAX_MS); await settle();
    expect(api.store.get(`${room}:guest-1-offer`)).toBe('');   // 收走了
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
  });

  it('reopen → 間隔回到 3 秒', async () => {
    const { host } = setup();
    await host.open(0);
    const t = await emptyPasses(host, 0, 4);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MAX_MS);
    host.stopJoin();
    host.reopen(t + 1);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
  });

  it('客人握手結束 → 間隔回到 3 秒（握手期間的空輪照樣退讓）', async () => {
    const { api, makePeer, links, host } = setup();
    const room = await host.open(0);
    const guest = makePeer();
    const offer = await guest.createOffer();
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'g', offer }));
    host.poll(0); await settle();                 // 收下 offer、寫 ack，等客人接 answer
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
    await emptyPasses(host, HOST_POLL_MS, 4);     // 客人慢吞吞：房主空掃幾輪
    expect(host.pollIntervalMs).toBe(HOST_POLL_MAX_MS);
    await guest.acceptAnswer(`fake-answer:${offer}`);
    await settle();
    expect(links).toHaveLength(1);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
  });

  it('最壞情況：房主退讓到上限、客人剛好在一輪之後才寫 offer → 仍在 HOST_POLL_MAX_MS + ACK_POLL_MS 內連上', async () => {
    const { api, makePeer, links, host } = setup();
    let t = 0;
    const room = await host.open(0);
    const last = await emptyPasses(host, 0, 4);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MAX_MS);
    t = last + 1;                                  // 上一輪剛掃完
    host.poll(t); await settle();                  // 還沒到期：不掃
    const start = t;
    // 客人的時鐘就是房主的時鐘：每次 sleep 推進時間後房主照常 poll（同一個 loop 的感覺）
    const c = {
      now: () => t,
      sleep: async (ms: number) => { t += ms; host.poll(t); await settle(); },
    };
    const link = await joinRoom(api, makePeer, room, c);
    await settle();
    expect(link).toBeTruthy();
    expect(links).toHaveLength(1);
    const waited = t - start;
    expect(waited).toBeGreaterThan(HOST_POLL_MAX_MS - ACK_POLL_MS * 2);   // 確實吃到退讓
    expect(waited).toBeLessThanOrEqual(HOST_POLL_MAX_MS + ACK_POLL_MS);
    expect(waited).toBeLessThan(ACK_TIMEOUT_MS);
    expect(host.pollIntervalMs).toBe(HOST_POLL_MS);
  });
});

describe('rtcSignal 信令服務掛掉 → 誠實的錯誤（service）', () => {
  const down = () => Promise.reject(new Error('signal GET 500'));

  it('文案', () => {
    expect(JOIN_ERROR_TEXT.service).toBe('連線服務暫時無法使用，請稍後再試');
    expect(new JoinError('service').message).toBe('連線服務暫時無法使用，請稍後再試');
  });

  it('客人掃槽時 get 一直失敗 → 整段重掃一次，兩次都失敗才 service（不是 noHost）', async () => {
    const { api, makePeer } = setup();
    let calls = 0;
    api.get = () => { calls++; return down(); };
    const err = await joinRoom(api, makePeer, 'ABCDE', clock()).catch((e) => e);
    expect(err).toBeInstanceOf(JoinError);
    expect(err.code).toBe('service');
    expect(calls).toBe(2);   // 第一次掃描 + 重掃，各在第一個請求就失敗
  });

  it('客人掃槽時 put 一直失敗 → 重掃一次後 service', async () => {
    const { api, makePeer } = setup();
    let puts = 0;
    api.put = () => { puts++; return down(); };
    const err = await joinRoom(api, makePeer, 'ABCDE', clock()).catch((e) => e);
    expect(err.code).toBe('service');
    expect(puts).toBe(2);
  });

  it('客人掃槽只抖一次（第一個 get 失敗）→ 重掃成功、照常連上', async () => {
    const { api, makePeer, links, host } = setup();
    const room = await host.open(0);
    const get = api.get.bind(api);
    let failed = false;
    api.get = (r, slot) => { if (!failed) { failed = true; return down(); } return get(r, slot); };
    const joining = joinRoom(api, makePeer, room, clock());
    await settle(3);
    host.poll(0);
    await expect(joining).resolves.toBeTruthy();
    await settle();
    expect(links).toHaveLength(1);
  });

  it('第一次掃描已寫進 offer、讀回才失敗 → 重掃認得自己的 offer，不另佔一槽', async () => {
    const { api, makePeer, links, host } = setup();
    const room = await host.open(0);
    const get = api.get.bind(api);
    const put = api.put.bind(api);
    let wrote = false, failed = false;
    api.put = async (r, slot, data) => { await put(r, slot, data); if (data && slot.endsWith('-offer')) wrote = true; };
    api.get = (r, slot) => {
      if (wrote && !failed) { failed = true; return down(); }   // 寫完後的讀回失敗一次
      return get(r, slot);
    };
    const joining = joinRoom(api, makePeer, room, clock());
    await settle(3);
    const offers = [0, 1, 2, 3].map((i) => api.store.get(`${room}:guest-${i}-offer`)).filter((v) => v);
    expect(offers).toHaveLength(1);   // 只佔一槽
    host.poll(0);
    await expect(joining).resolves.toBeTruthy();
    await settle();
    expect(links).toHaveLength(1);
  });

  it('寫好 offer 之後每一次讀 ack 都失敗 → 逾時後 service', async () => {
    const { api, makePeer } = setup();
    const get = api.get.bind(api);
    let scanned = false;
    api.put = async (r, slot, data) => { await FakeSignal.prototype.put.call(api, r, slot, data); if (data) scanned = true; };
    api.get = async (r, slot) => {
      if (scanned && slot.startsWith('host-ack')) throw new Error('signal GET 503');
      return get(r, slot);
    };
    const c = clock();
    const err = await joinRoom(api, makePeer, 'ABCDE', c).catch((e) => e);
    expect(err.code).toBe('service');
    expect(c.now()).toBeGreaterThanOrEqual(ACK_TIMEOUT_MS - ACK_POLL_MS);
  });

  it('ack 輪詢有成功過（服務是通的、只是沒房主）→ 仍然 noHost', async () => {
    const { api, makePeer } = setup();
    const get = api.get.bind(api);
    let scanned = false, ackReads = 0;
    api.put = async (r, slot, data) => { await FakeSignal.prototype.put.call(api, r, slot, data); if (data) scanned = true; };
    api.get = async (r, slot) => {
      if (scanned && slot.startsWith('host-ack') && ackReads++ > 0) throw new Error('signal GET 503');
      return get(r, slot);
    };
    const err = await joinRoom(api, makePeer, 'ABCDE', clock()).catch((e) => e);
    expect(err.code).toBe('noHost');
  });

  it('房主 open 時 createRoom 失敗 → JoinError(service)', async () => {
    const { api, host } = setup();
    api.createRoom = down;
    const err = await host.open(0).catch((e) => e);
    expect(err).toBeInstanceOf(JoinError);
    expect(err.code).toBe('service');
    expect(host.room).toBeNull();
  });

  /** 剛好在到期時 poll 一輪；回傳下一輪的到期時間 */
  async function onePass(host: RoomHost, t: number): Promise<number> {
    host.poll(t); await settle();
    return t + host.pollIntervalMs;
  }

  it('逐槽 get：連續 2 輪全失敗 → serviceDown；恢復後 1 輪成功就清掉', async () => {
    expect(SERVICE_DOWN_PASSES).toBe(2);
    const { api, host } = setup();
    await host.open(0);
    expect(host.serviceDown).toBe(false);
    const get = api.get.bind(api);
    api.get = down;
    let t = await onePass(host, 0);
    expect(host.serviceDown).toBe(false);   // 抖一下不算
    t = await onePass(host, t);
    expect(host.serviceDown).toBe(true);
    api.get = get;
    await onePass(host, t);
    expect(host.serviceDown).toBe(false);
  });

  it('逐槽 get 只有部分失敗 → 不算 serviceDown', async () => {
    const { api, host } = setup();
    await host.open(0);
    const get = api.get.bind(api);
    api.get = async (r, slot) => (slot === 'guest-0-offer' ? down() : get(r, slot));
    host.poll(0); await settle();
    expect(host.serviceDown).toBe(false);
  });

  function batchHost() {
    const api = new FakeBatchSignal();
    const host = new RoomHost(api, fakePeerFactory(new LoopbackNet()), () => {});
    return { api, host };
  }

  it('getMany 只失敗 1 輪 → 不設 serviceDown', async () => {
    const { api, host } = batchHost();
    await host.open(0);
    const getMany = api.getMany.bind(api);
    api.getMany = down;
    const t = await onePass(host, 0);
    expect(host.serviceDown).toBe(false);
    api.getMany = getMany;
    await onePass(host, t);
    expect(host.serviceDown).toBe(false);
  });

  it('getMany 失敗、成功、失敗（不連續）→ 都不設', async () => {
    const { api, host } = batchHost();
    await host.open(0);
    const getMany = api.getMany.bind(api);
    api.getMany = down;
    let t = await onePass(host, 0);
    api.getMany = getMany;
    t = await onePass(host, t);
    api.getMany = down;
    await onePass(host, t);
    expect(host.serviceDown).toBe(false);
  });

  it('getMany 連續 2 輪失敗 → 設 serviceDown；之後成功 1 輪就清掉', async () => {
    const { api, host } = batchHost();
    await host.open(0);
    const getMany = api.getMany.bind(api);
    api.getMany = down;
    let t = await onePass(host, 0);
    t = await onePass(host, t);
    expect(host.serviceDown).toBe(true);
    api.getMany = getMany;
    await onePass(host, t);
    expect(host.serviceDown).toBe(false);
  });

  it('serviceDown 在 stopJoin 後保留，reopen 才清', async () => {
    const { api, host } = batchHost();
    await host.open(0);
    api.getMany = down;
    let t = await onePass(host, 0);
    t = await onePass(host, t);
    expect(host.serviceDown).toBe(true);
    host.stopJoin();
    expect(host.serviceDown).toBe(true);
    host.reopen(t);
    expect(host.serviceDown).toBe(false);
  });

  it('hostOpenErrorText：JoinError 用對應文案，其他錯誤帶前綴', () => {
    expect(hostOpenErrorText(new JoinError('service'))).toBe(JOIN_ERROR_TEXT.service);
    expect(hostOpenErrorText(new Error('coop host closed'))).toBe('開放加入失敗：coop host closed');
  });
});
