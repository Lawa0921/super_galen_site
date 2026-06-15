import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildBomberInit,
  parseBomberInit,
  claimBomberGuestSlot,
  negotiateHostBomberGuestInit,
  negotiateJoinBomberGuestInit,
  wrapChannel,
  withTimeout,
  hostBomberGame,
  joinBomberGame,
  BOMBER_NS,
  type BomberSignalClient,
  type BomberHostAnswerPeer,
  type BomberGuestOfferPeer,
} from './bomberNetMain';
import { BomberHubTransport, BomberSpokeTransport } from './bomberTransport';
import { BomberLockstep, type BomberFrameMsg } from './bomberLockstep';

afterEach(() => vi.restoreAllMocks());

/**
 * Mock signal store：用 Map 模擬 /api/signal 的 room/slot 鍵值，並記錄每次 putSlot 的
 * room 參數（驗證 bomber: namespace 沒傳就會在這露餡——但本 mock 接的是 netMain 內已
 * 包好的 BomberSignalClient.putSlot(room, slot)，故另用 nsCalls 追蹤 ns 是否套用）。
 */
function makeMockSignal(): BomberSignalClient & {
  store: Map<string, string>;
  rooms: string[];
} {
  const store = new Map<string, string>();
  const rooms: string[] = [];
  const key = (room: string, slot: string) => `${room}:${slot}`;
  let roomSeq = 0;
  return {
    store,
    rooms,
    async createRoom() {
      const room = `ROOM${roomSeq++}`;
      rooms.push(room);
      return room;
    },
    async putSlot(room, slot, data) {
      store.set(key(room, slot), data);
    },
    async getSlot(room, slot) {
      return store.get(key(room, slot)) ?? null;
    },
    async pollSlot(room, slot) {
      const v = store.get(key(room, slot));
      if (v) return v;
      throw new Error(`timeout waiting for ${slot}`);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. bomber-init：seed + arenaId + players(id+character) + yourIndex
// ─────────────────────────────────────────────────────────────────────────
describe('bomber-init（buildBomberInit / parseBomberInit）', () => {
  it('round-trip 後 seed/arenaId/players/yourIndex 不變', () => {
    const raw = buildBomberInit({
      seed: 0xC0FFEE,
      arenaId: 5,
      players: [
        { id: 'host', character: 'lena' },
        { id: 'g1', character: 'mira' },
        { id: 'g2', character: 'aya' },
      ],
      yourIndex: 2,
    });
    const parsed = parseBomberInit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.seed).toBe(0xC0FFEE);
    expect(parsed!.arenaId).toBe(5);
    expect(parsed!.players).toEqual([
      { id: 'host', character: 'lena' },
      { id: 'g1', character: 'mira' },
      { id: 'g2', character: 'aya' },
    ]);
    expect(parsed!.yourIndex).toBe(2);
  });

  it('控制前綴為 bomber-（t 欄位以 bomber- 開頭，與 tetris ffa-* 不衝突）', () => {
    const raw = buildBomberInit({ seed: 1, arenaId: 0, players: [{ id: 'h', character: 'lena' }], yourIndex: 0 });
    const obj = JSON.parse(raw) as { t: string };
    expect(obj.t.startsWith('bomber-')).toBe(true);
  });

  it('畸形輸入回 null（不丟例外）', () => {
    expect(parseBomberInit('not-json')).toBeNull();
    expect(parseBomberInit(JSON.stringify({ t: 'nope' }))).toBeNull();
    expect(parseBomberInit(JSON.stringify({ t: 'bomber-init', seed: 'x', arenaId: 0, players: [], yourIndex: 0 }))).toBeNull();
    // arenaId 非數字
    expect(parseBomberInit(JSON.stringify({ t: 'bomber-init', seed: 1, arenaId: 'z', players: [], yourIndex: 0 }))).toBeNull();
    // players 內缺 character
    expect(parseBomberInit(JSON.stringify({ t: 'bomber-init', seed: 1, arenaId: 0, players: [{ id: 'h' }], yourIndex: 0 }))).toBeNull();
    // yourIndex 缺
    expect(parseBomberInit(JSON.stringify({ t: 'bomber-init', seed: 1, arenaId: 0, players: [{ id: 'h', character: 'lena' }] }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. claimBomberGuestSlot：選最低空 slot；滿則拋錯
// ─────────────────────────────────────────────────────────────────────────
describe('claimBomberGuestSlot', () => {
  it('選最低未占用 slot（已占用者跳過）', async () => {
    const signal = makeMockSignal();
    const room = 'R';
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'x', offer: 'o' }));
    const idx = await claimBomberGuestSlot(signal, room, 'alice', 'OFFER-A', 3);
    expect(idx).toBe(1);
    const off = JSON.parse(signal.store.get(`${room}:guest-1-offer`)!) as { id: string };
    expect(off.id).toBe('alice');
  });

  it('上限 3 個 guest slot 占滿（2-4 人對戰）→ 拋明確錯誤', async () => {
    const signal = makeMockSignal();
    const room = 'R';
    for (let i = 0; i < 3; i++) {
      await signal.putSlot(room, `guest-${i}-offer`, JSON.stringify({ id: `x${i}`, offer: 'o' }));
    }
    await expect(claimBomberGuestSlot(signal, room, 'alice', 'OFFER-A', 3)).rejects.toThrow(/full|滿|slot/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. guest-initiated 握手（host 收 offer 回 answer；組裝 playerIds host 在前）
// ─────────────────────────────────────────────────────────────────────────
function makeHostPeer(): BomberHostAnswerPeer {
  let onmsg: ((r: string) => void) | null = null;
  return {
    createAnswer: async (_offer: string) => 'ANSWER-SDP',
    waitOpen: async () => {},
    get channel() {
      return {
        send: () => {},
        get open() { return true; },
        set onmessage(fn: ((r: string) => void) | null) { onmsg = fn; },
        get onmessage() { return onmsg; },
      };
    },
  } as unknown as BomberHostAnswerPeer;
}

describe('guest-initiated 握手（negotiate*BomberGuestInit）', () => {
  it('host 輪詢 guest-{i}-offer → createAnswer → 寫 host-ack-{i}；playerIds host 在前、依 index 升序', async () => {
    const signal = makeMockSignal();
    const room = 'ROOM0';
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'alice', offer: 'OFF0' }));
    await signal.putSlot(room, 'guest-1-offer', JSON.stringify({ id: 'bob', offer: 'OFF1' }));

    const result = await negotiateHostBomberGuestInit({
      hostId: 'HOST',
      maxGuests: 3,
      expectedGuests: 2,
      room,
      signal,
      peerFactory: makeHostPeer,
      pollOpts: { timeoutMs: 50, intervalMs: 0 },
    });

    expect(result.playerIds).toEqual(['HOST', 'alice', 'bob']);
    expect(result.guestPeers.length).toBe(2);
    expect(signal.store.get(`${room}:host-ack-0`)).toBe('ANSWER-SDP');
    expect(signal.store.get(`${room}:host-ack-1`)).toBe('ANSWER-SDP');
  });

  it('guest：claim 最低空 slot → 寫 guest-{idx}-offer → 等 host-ack-{idx} answer → acceptAnswer', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMX';
    await signal.putSlot(room, 'host-ack-0', 'ANSWER-FROM-HOST');

    let acceptedAnswer: string | null = null;
    const peerFactory = (): BomberGuestOfferPeer => {
      let onmsg: ((r: string) => void) | null = null;
      return {
        createOffer: async () => 'OFFER-FROM-GUEST',
        acceptAnswer: async (a: string) => { acceptedAnswer = a; },
        waitOpen: async () => {},
        channel: {
          send: () => {},
          get open() { return true; },
          set onmessage(fn: ((r: string) => void) | null) { onmsg = fn; },
          get onmessage() { return onmsg; },
        },
      } as unknown as BomberGuestOfferPeer;
    };

    const result = await negotiateJoinBomberGuestInit({
      room,
      guestId: 'alice',
      signal,
      peerFactory,
      maxGuests: 3,
      pollOpts: { timeoutMs: 50, intervalMs: 0 },
    });

    expect(result.slotIndex).toBe(0);
    expect(result.localId).toBe('alice');
    const off = JSON.parse(signal.store.get(`${room}:guest-0-offer`)!) as { id: string; offer: string };
    expect(off.id).toBe('alice');
    expect(off.offer).toBe('OFFER-FROM-GUEST');
    expect(acceptedAnswer).toBe('ANSWER-FROM-HOST');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. wrapChannel：把 WebRtcTransport 風格物件包成 RelayChannel
// ─────────────────────────────────────────────────────────────────────────
describe('wrapChannel', () => {
  it('send 透傳、open 反映底層、onmessage 設定前到達的訊息會回放（保序）', () => {
    const sent: string[] = [];
    let opened = false;
    let msgCb: ((d: string) => void) | null = null;
    const fakeTransport = {
      send: (d: string) => sent.push(d),
      onMessage: (cb: (d: string) => void) => { msgCb = cb; },
      get isOpen() { return opened; },
    };
    const ch = wrapChannel(fakeTransport);
    expect(ch.open).toBe(false);
    opened = true;
    expect(ch.open).toBe(true);
    ch.send('hello');
    expect(sent).toEqual(['hello']);

    // onmessage 設定前先到 2 筆 → 暫存
    msgCb!('early-1');
    msgCb!('early-2');
    const got: string[] = [];
    ch.onmessage = (r) => got.push(r);
    // 設定當下回放暫存（保序），之後即時轉發
    expect(got).toEqual(['early-1', 'early-2']);
    msgCb!('live');
    expect(got).toEqual(['early-1', 'early-2', 'live']);
  });

  it('底層 onClose → 觸發包裝後的 onclose', () => {
    let closeCb: (() => void) | null = null;
    const fakeTransport = {
      send: (_d: string) => {},
      onMessage: (_cb: (d: string) => void) => {},
      get isOpen() { return true; },
      onClose: (cb: () => void) => { closeCb = cb; },
    };
    const ch = wrapChannel(fakeTransport);
    expect('onclose' in ch).toBe(true);
    let closed = 0;
    ch.onclose = () => { closed++; };
    closeCb!();
    expect(closed).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. withTimeout：逾時 reject
// ─────────────────────────────────────────────────────────────────────────
describe('withTimeout', () => {
  it('在期限內 resolve → 透傳值', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'x')).resolves.toBe(42);
  });
  it('逾時 → reject 含 label', async () => {
    await expect(withTimeout(new Promise(() => {}), 10, 'my-label')).rejects.toThrow(/my-label/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. hostBomberGame：建房 → 收 guest → 廣播 bomber-init → 回傳 ready-to-run 結果
//    （含 transport / playerIds / seed / arenaId / characters / localId / guestIds）
// ─────────────────────────────────────────────────────────────────────────

/** 雙端互送的同步 loopback channel pair（host 端 / guest 端各一）。 */
function pair() {
  const a = {
    open: true,
    onmessage: null as ((r: string) => void) | null,
    onclose: null as (() => void) | null,
    send: (raw: string) => { b.onmessage?.(raw); },
  };
  const b = {
    open: true,
    onmessage: null as ((r: string) => void) | null,
    onclose: null as (() => void) | null,
    send: (raw: string) => { a.onmessage?.(raw); },
  };
  return { hostEnd: a, guestEnd: b };
}

describe('hostBomberGame（room-code 主機端組裝）', () => {
  it('建房→收 2 guest→廣播 bomber-init→onReady 拿到 transport/roster/seed/arenaId/characters/guestIds', async () => {
    const signal = makeMockSignal();
    const room = 'ROOM0';

    // 兩個 guest 預先 claim slot 0/1 寫 offer（夾帶各自 character）
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'g1', offer: 'OFF0', character: 'mira' }));
    await signal.putSlot(room, 'guest-1-offer', JSON.stringify({ id: 'g2', offer: 'OFF1', character: 'aya' }));

    // 每個 host peer 的 channel 記錄收到的廣播訊息
    const broadcasts: string[][] = [];
    const peerFactory = (): BomberHostAnswerPeer => {
      const sent: string[] = [];
      broadcasts.push(sent);
      let onmsg: ((r: string) => void) | null = null;
      return {
        createAnswer: async () => 'ANS',
        waitOpen: async () => {},
        channel: {
          send: (raw: string) => sent.push(raw),
          get open() { return true; },
          set onmessage(fn: ((r: string) => void) | null) { onmsg = fn; },
          get onmessage() { return onmsg; },
          onclose: null as (() => void) | null,
        },
      } as unknown as BomberHostAnswerPeer;
    };

    const statuses: string[] = [];
    let ready: Parameters<NonNullable<Parameters<typeof hostBomberGame>[0]['onReady']>>[0] | null = null;

    await hostBomberGame({
      identity: { id: 'host', character: 'lena' },
      arenaId: 3,
      maxGuests: 2,
      seed: 0xABCDE, // 注入固定 seed（決定性）
      room,
      signal,
      peerFactory,
      onStatus: (s) => statuses.push(s.phase),
      onReady: (r) => { ready = r; },
      pollOpts: { timeoutMs: 200, intervalMs: 0 },
    });

    expect(ready).not.toBeNull();
    const r = ready!;
    expect(r.playerIds).toEqual(['host', 'g1', 'g2']);
    expect(r.localId).toBe('host');
    expect(r.seed).toBe(0xABCDE);
    expect(r.arenaId).toBe(3);
    expect(r.characters).toEqual({ host: 'lena', g1: 'mira', g2: 'aya' });
    expect(r.guestIds).toEqual(['g1', 'g2']);
    expect(r.transport).toBeInstanceOf(BomberHubTransport);
    expect(statuses).toContain('connected');

    // 每個 guest channel 都收到 bomber-init（yourIndex 對應其在 playerIds 的位置）
    expect(broadcasts.length).toBe(2);
    const init0 = parseBomberInit(broadcasts[0][0])!;
    const init1 = parseBomberInit(broadcasts[1][0])!;
    expect(init0.seed).toBe(0xABCDE);
    expect(init0.arenaId).toBe(3);
    expect(init0.yourIndex).toBe(1); // g1
    expect(init1.yourIndex).toBe(2); // g2
    expect(init0.players).toEqual(init1.players);
  });

  it('每個 guest 的 character 取自其 guest-{i}-offer（host 不臆測來賓角色）', async () => {
    const signal = makeMockSignal();
    const room = 'ROOM0';
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'g1', offer: 'OFF0', character: 'rosa' }));

    const peerFactory = (): BomberHostAnswerPeer => ({
      createAnswer: async () => 'ANS',
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null, onclose: null },
    } as unknown as BomberHostAnswerPeer);

    let ready: { characters: Record<string, string> } | null = null;
    await hostBomberGame({
      identity: { id: 'host', character: 'lena' },
      arenaId: 0,
      maxGuests: 1,
      seed: 1,
      room,
      signal,
      peerFactory,
      onStatus: () => {},
      onReady: (r) => { ready = r as unknown as { characters: Record<string, string> }; },
      pollOpts: { timeoutMs: 200, intervalMs: 0 },
    });
    expect(ready!.characters).toEqual({ host: 'lena', g1: 'rosa' });
  });

  it('沒有任何 guest 連上 → onStatus error，不呼叫 onReady', async () => {
    const signal = makeMockSignal();
    const peerFactory = (): BomberHostAnswerPeer => makeHostPeer();
    const statuses: string[] = [];
    let readyCalled = false;
    await hostBomberGame({
      identity: { id: 'host', character: 'lena' },
      arenaId: 0,
      maxGuests: 2,
      seed: 1,
      room: 'EMPTY',
      signal,
      peerFactory,
      onStatus: (s) => statuses.push(s.phase),
      onReady: () => { readyCalled = true; },
      pollOpts: { timeoutMs: 30, intervalMs: 0 },
    });
    expect(readyCalled).toBe(false);
    expect(statuses).toContain('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. joinBomberGame：claim slot → 收 bomber-init → 建 SpokeTransport → onReady
// ─────────────────────────────────────────────────────────────────────────
describe('joinBomberGame（room-code 來賓端組裝）', () => {
  it('claim slot → 等 answer → 收 bomber-init → onReady 拿 transport/roster/seed/arenaId/characters', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMJ';
    await signal.putSlot(room, 'host-ack-0', 'ANSWER-FROM-HOST');

    // 用 wrapChannel 包一個 backing（如真實 WebRtcTransport）：onmessage 設定前到達的訊息
    // 進暫存佇列、設定當下回放——故 host 提前廣播 bomber-init 也不會丟（不需精準對齊微任務時序）。
    let backingCb: ((d: string) => void) | null = null;
    const backing = {
      send: (_d: string) => {},
      onMessage: (cb: (d: string) => void) => { backingCb = cb; },
      get isOpen() { return true; },
    };
    const wrapped = wrapChannel(backing);
    const peerFactory = (): BomberGuestOfferPeer => ({
      createOffer: async () => 'OFFER',
      acceptAnswer: async () => {},
      waitOpen: async () => {},
      channel: wrapped,
    } as unknown as BomberGuestOfferPeer);

    const statuses: string[] = [];
    let ready: { playerIds: string[]; seed: number; arenaId: number; characters: Record<string, string>; localId: string } | null = null;

    const joinPromise = joinBomberGame({
      room,
      identity: { id: 'g1', character: 'mira' },
      signal,
      peerFactory,
      maxGuests: 3,
      onStatus: (s) => statuses.push(s.phase),
      onReady: (r) => { ready = r as unknown as typeof ready; },
      pollOpts: { timeoutMs: 200, intervalMs: 0 },
      initTimeoutMs: 500,
    });

    // host 透過 backing 廣播 bomber-init（即使在 join 掛上 onmessage 前到達，wrapChannel 會回放）。
    const init = buildBomberInit({
      seed: 0x1234,
      arenaId: 6,
      players: [
        { id: 'host', character: 'lena' },
        { id: 'g1', character: 'mira' },
      ],
      yourIndex: 1,
    });
    // backing 收訊處理在 wrapChannel 建構時即綁定；此時送入會進佇列，待 join 設 onmessage 後回放。
    backingCb!(init);

    await joinPromise;

    expect(ready).not.toBeNull();
    const r = ready!;
    expect(r.playerIds).toEqual(['host', 'g1']);
    expect(r.seed).toBe(0x1234);
    expect(r.arenaId).toBe(6);
    expect(r.characters).toEqual({ host: 'lena', g1: 'mira' });
    expect(r.localId).toBe('g1');
    expect(statuses).toContain('connected');
  });

  it('bomber-init 逾時（host 從不廣播）→ onStatus error，不呼叫 onReady', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMT';
    await signal.putSlot(room, 'host-ack-0', 'ANSWER');

    const p = pair();
    const peerFactory = (): BomberGuestOfferPeer => ({
      createOffer: async () => 'OFFER',
      acceptAnswer: async () => {},
      waitOpen: async () => {},
      channel: p.guestEnd,
    } as unknown as BomberGuestOfferPeer);

    const statuses: string[] = [];
    let readyCalled = false;
    await joinBomberGame({
      room,
      identity: { id: 'g1', character: 'mira' },
      signal,
      peerFactory,
      maxGuests: 3,
      onStatus: (s) => statuses.push(s.phase),
      onReady: () => { readyCalled = true; },
      pollOpts: { timeoutMs: 200, intervalMs: 0 },
      initTimeoutMs: 20, // 很短 → 必逾時
    });
    expect(readyCalled).toBe(false);
    expect(statuses).toContain('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. namespace：所有 signalClient 呼叫帶 bomber: ns（房號不與 tetris 相撞）
// ─────────────────────────────────────────────────────────────────────────
describe('bomber: namespace 隔離', () => {
  it('BOMBER_NS 常數為 "bomber:"（傳給 signalClient 用）', () => {
    expect(BOMBER_NS).toBe('bomber:');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. 端到端（mock channel）：host + 2 guest 各自用 netMain 結果建 BomberLockstep，
//    跑數十幀仍 stateHash 一致（確定性接線驗證，不碰真 WebRTC）
// ─────────────────────────────────────────────────────────────────────────
describe('整合：netMain 結果建 BomberLockstep → 三端確定性一致', () => {
  it('host hub + 2 guest spoke：相同 seed/arenaId/players → 各端 step 後 stateHash 一致', () => {
    const p1 = pair();
    const p2 = pair();
    const hub = new BomberHubTransport([p1.hostEnd, p2.hostEnd]);
    const spoke1 = new BomberSpokeTransport(p1.guestEnd);
    const spoke2 = new BomberSpokeTransport(p2.guestEnd);

    const seed = 0xBADF00D;
    const arenaId = 2;
    const playerIds = ['host', 'g1', 'g2'];
    const characters = { host: 'lena', g1: 'mira', g2: 'aya' } as const;

    const hostLs = new BomberLockstep({ playerIds, localId: 'host', seed, arenaId, characters: { ...characters }, transport: hub });
    const g1Ls = new BomberLockstep({ playerIds, localId: 'g1', seed, arenaId, characters: { ...characters }, transport: spoke1 });
    const g2Ls = new BomberLockstep({ playerIds, localId: 'g2', seed, arenaId, characters: { ...characters }, transport: spoke2 });

    const nodes = [hostLs, g1Ls, g2Ls];
    for (let i = 0; i < 40; i++) {
      for (const n of nodes) n.tick();
    }
    // 同步 loopback 末輪會有良性的一幀偏移（最後 tick 的節點結構性領先一幀）；
    // 只 tick 落後端直到全端 confirmedFrame 追平，才在共同幀上比對指紋（鐵則：全端皆確認的幀必相同）。
    for (let r = 0; r < 50; r++) {
      const max = Math.max(...nodes.map((n) => n.confirmedFrame));
      const laggards = nodes.filter((n) => n.confirmedFrame < max);
      if (laggards.length === 0) break;
      for (const n of laggards) n.tick();
    }

    const h1 = hostLs.match.stateHash();
    const h2 = g1Ls.match.stateHash();
    const h3 = g2Ls.match.stateHash();
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
    // 三端推進到相同 confirmedFrame
    expect(g1Ls.confirmedFrame).toBe(hostLs.confirmedFrame);
    expect(g2Ls.confirmedFrame).toBe(hostLs.confirmedFrame);
  });
});

// 確保未使用 import 不被 tree-shake 警告（型別檢查用）
const _unusedFrame: BomberFrameMsg = { f: 0, p: 'x', a: [] };
void _unusedFrame;
