import { describe, it, expect } from 'vitest';
import { LoopbackNet } from './loopback';
import { FakeSignal, fakePeerFactory, manualTicker } from './fakeRtc';
import {
  RoomHost, joinRoom, JoinError, normalizeRoom, HOST_POLL_MS, JOIN_IDLE_MS, ACK_TIMEOUT_MS, ACK_POLL_MS, JOIN_SLOTS,
} from './rtcSignal';
import type { NetLink } from './link';

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/** 虛擬時間：sleep 只推進時鐘並讓出微任務 */
function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; await flush(); } };
}

function setup() {
  const net = new LoopbackNet();
  const api = new FakeSignal();
  const makePeer = fakePeerFactory(net);
  const links: NetLink[] = [];
  const host = new RoomHost(api, makePeer, (l) => links.push(l));
  return { net, api, makePeer, links, host };
}

describe('rtcSignal', () => {
  it('host open 回房號；guest join 後雙方拿到同一對 link', async () => {
    const { net, api, makePeer, links, host } = setup();
    const room = await host.open(0);
    expect(room).toBe('ABCDE');
    const c = clock();
    const joining = joinRoom(api, makePeer, room, c);
    await flush();
    host.poll(0);
    const guestLink = await joining;
    await flush();
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
    await flush();
    host.poll(0);
    await joining;
    expect(links).toHaveLength(1);
    expect(normalizeRoom('ABCDO')).toBeNull();
    const before = { ...api.calls };
    for (const bad of ['ABCD1', 'ABCDO', 'ABC']) {
      await expect(joinRoom(api, makePeer, bad, c)).rejects.toMatchObject({ code: 'badRoom' });
    }
    expect(api.calls).toEqual(before);
  });

  it('殘留的別人 host-ack 被忽略', async () => {
    const { api, makePeer, host } = setup();
    const room = await host.open(0);
    api.store.set(`${room}:host-ack-0`, JSON.stringify({ id: 'someone-else', answer: 'stale' }));
    const c = clock();
    const joining = joinRoom(api, makePeer, room, c);
    await flush();
    host.poll(0);
    await expect(joining).resolves.toBeTruthy();
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

  it('poll 3 秒內只掃一輪', async () => {
    const { api, host } = setup();
    await host.open(0);
    host.poll(0); await flush();
    const g1 = api.calls.get;
    expect(g1).toBe(JOIN_SLOTS);
    host.poll(1000); host.poll(2999); await flush();
    expect(api.calls.get).toBe(g1);
    host.poll(HOST_POLL_MS); await flush();
    expect(api.calls.get).toBe(g1 * 2);
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
    host.poll(0); await flush();
    api.store.set(`${room}:guest-0-offer`, raw);   // 同 id 再出現
    host.poll(HOST_POLL_MS); await flush();
    expect(links).toHaveLength(1);
  });

  it('失敗的客人不影響輪詢', async () => {
    const { api, links, host } = setup();
    const room = await host.open(0);
    api.store.set(`${room}:guest-0-offer`, JSON.stringify({ id: 'bad', offer: 'unknown-token' }));
    host.poll(0); await flush();
    expect(links).toHaveLength(0);
    expect(api.store.get(`${room}:guest-0-offer`)).toBe('');
    host.poll(HOST_POLL_MS); await flush();   // 仍可輪詢
    expect(api.calls.get).toBe(JOIN_SLOTS * 2);
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
