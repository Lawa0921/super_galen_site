import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  negotiateHostFfa,
  negotiateJoinFfa,
  negotiateHostFfaGuestInit,
  negotiateJoinFfaGuestInit,
  claimGuestSlot,
  buildFfaInit,
  parseFfaInit,
  reportFfaRanked,
  takeoverTransport,
  wrapChannel,
  type FfaSignalClient,
  type FfaInitMsg,
  type FfaHostAnswerPeer,
  type FfaGuestOfferPeer,
} from './ffaNetMain';
import { FfaLockstep, type FfaFrameMsg, type FfaLockstepTransport } from './ffaLockstep';
import { buildFfaResultMessage, verifySignature } from './auth';
import { Wallet } from 'ethers';

afterEach(() => vi.restoreAllMocks());

/**
 * Mock signal store：用一個 Map 模擬 /api/signal 的 room/slot 鍵值。
 * 提供與 signalClient 同形狀的 createRoom/putSlot/getSlot/pollSlot。
 */
function makeMockSignal(): FfaSignalClient & {
  store: Map<string, string>;
  puts: Array<{ slot: string; data: string }>;
} {
  const store = new Map<string, string>();
  const puts: Array<{ slot: string; data: string }> = [];
  const key = (room: string, slot: string) => `${room}:${slot}`;
  let roomSeq = 0;
  return {
    store,
    puts,
    async createRoom() {
      const room = `ROOM${roomSeq++}`;
      return room;
    },
    async putSlot(room, slot, data) {
      store.set(key(room, slot), data);
      puts.push({ slot, data });
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
// 1. 握手序列：host 開房 → guests 寫 answer → host 收齊 → 寫 ack + ffa-init
// ─────────────────────────────────────────────────────────────────────────
describe('握手序列（negotiateHostFfa / negotiateJoinFfa）', () => {
  it('host 開房寫 host-offer；3 guest 各寫 answer；host 收齊→寫 ack + ffa-init；各端拿到相同 seed + playerIds 順序', async () => {
    const signal = makeMockSignal();

    // 注入一個假的 RTC peer 工廠：createOffer 回固定字串、acceptAnswer no-op、waitOpen resolve。
    const fakeOffer = 'OFFER-SDP';
    const peerFactory = () => ({
      createOffer: async () => fakeOffer,
      acceptAnswer: async (_a: string) => {},
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null as ((r: string) => void) | null },
    });

    // 三個 guest 預先把自己的 answer 寫進 store（模擬它們並行加入）。
    const room = 'ROOM0'; // createRoom 第一個房號
    await signal.putSlot(room, 'guest-0-answer', JSON.stringify({ id: 'g0', answer: 'ANS0' }));
    await signal.putSlot(room, 'guest-1-answer', JSON.stringify({ id: 'g1', answer: 'ANS1' }));
    await signal.putSlot(room, 'guest-2-answer', JSON.stringify({ id: 'g2', answer: 'ANS2' }));

    const result = await negotiateHostFfa({
      hostId: 'host',
      maxGuests: 3,
      expectedGuests: 3,
      signal,
      peerFactory,
      collectWindowMs: 0, // 測試不等待
    });

    // host-offer 必須被寫入
    expect(signal.store.get(`${room}:host-offer`)).toBeTruthy();

    // 每個連上的 guest 都應收到 host-ack-{idx} + ffa-init
    expect(signal.store.get(`${room}:host-ack-0`)).toBeTruthy();
    expect(signal.store.get(`${room}:host-ack-1`)).toBeTruthy();
    expect(signal.store.get(`${room}:host-ack-2`)).toBeTruthy();

    // ffa-init 被廣播（每個 guest 一份，內含 seed + playerIds）
    const init0 = parseFfaInit(signal.store.get(`${room}:host-ack-0`)!);
    const init1 = parseFfaInit(signal.store.get(`${room}:host-ack-1`)!);
    const init2 = parseFfaInit(signal.store.get(`${room}:host-ack-2`)!);
    expect(init0).not.toBeNull();
    // 三份 init 的 seed + playerIds 完全相同
    expect(init0!.seed).toBe(init1!.seed);
    expect(init1!.seed).toBe(init2!.seed);
    expect(init0!.playerIds).toEqual(init1!.playerIds);
    expect(init1!.playerIds).toEqual(init2!.playerIds);

    // host 自己回傳的 seed/playerIds 也一致
    expect(result.seed).toBe(init0!.seed);
    expect(result.playerIds).toEqual(init0!.playerIds);

    // matchId 內嵌 seed（base36），ffa-match.ts 才能驗 replay
    expect(parseInt(result.matchId.split('-')[1], 36)).toBe(result.seed);
  });

  it('negotiateJoinFfa：guest 取 host-offer、回 guest-{idx}-answer、等 host-ack-{idx} 拿 ffa-init → 與 host 相同 seed/playerIds', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMX';

    // 先擺好 host-offer。
    await signal.putSlot(room, 'host-offer', 'OFFER-SDP');

    // guest 端假 peer：createAnswer 回字串、waitOpen resolve。
    const peerFactory = () => ({
      createAnswer: async (_o: string) => 'ANS-FROM-GUEST',
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null as ((r: string) => void) | null },
    });

    // host 端會在收到 answer 後寫 ack+init；這裡先放一份預期的 init。
    const seed = 123456;
    const playerIds = ['host', 'g0', 'g1'];
    const initPayload = buildFfaInit({ seed, playerIds, yourIndex: 1 });
    await signal.putSlot(room, 'host-ack-0', initPayload);

    const result = await negotiateJoinFfa({
      room,
      guestId: 'g0',
      slotIndex: 0,
      signal,
      peerFactory,
    });

    // guest 寫了 guest-0-answer（含自己的 id + answer）
    const ansRaw = signal.store.get(`${room}:guest-0-answer`)!;
    expect(ansRaw).toBeTruthy();
    const ans = JSON.parse(ansRaw) as { id: string; answer: string };
    expect(ans.id).toBe('g0');
    expect(ans.answer).toBe('ANS-FROM-GUEST');

    // guest 拿到的 seed/playerIds 與 host 廣播的一致
    expect(result.seed).toBe(seed);
    expect(result.playerIds).toEqual(playerIds);
    expect(result.localId).toBe('g0');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. ffa-init 內容：playerIds 包含 host + 連上的 guest、順序穩定（host 在前、guest 依 index）
// ─────────────────────────────────────────────────────────────────────────
describe('ffa-init 內容（buildFfaInit / parseFfaInit）', () => {
  it('playerIds host 在前、guest 依 index 升序；round-trip 後 seed/playerIds/yourIndex 不變', () => {
    const seed = 0xC0FFEE;
    const playerIds = ['host', 'g0', 'g1', 'g2'];
    const raw = buildFfaInit({ seed, playerIds, yourIndex: 2 });
    const parsed = parseFfaInit(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.seed).toBe(seed);
    expect(parsed!.playerIds).toEqual(playerIds);
    expect(parsed!.yourIndex).toBe(2);
  });

  it('negotiateHostFfa 順序：host 第一、guest 依 slot index 升序（亂序加入仍穩定）', async () => {
    const signal = makeMockSignal();
    const room = 'ROOM0';
    const peerFactory = () => ({
      createOffer: async () => 'OFFER',
      acceptAnswer: async () => {},
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null as ((r: string) => void) | null },
    });
    // 故意讓 slot 2 先寫、slot 0 後寫，驗證最終順序仍以 index 排序。
    await signal.putSlot(room, 'guest-2-answer', JSON.stringify({ id: 'charlie', answer: 'A2' }));
    await signal.putSlot(room, 'guest-0-answer', JSON.stringify({ id: 'alice', answer: 'A0' }));
    await signal.putSlot(room, 'guest-1-answer', JSON.stringify({ id: 'bob', answer: 'A1' }));

    const result = await negotiateHostFfa({
      hostId: 'HOST',
      maxGuests: 3,
      expectedGuests: 3,
      signal,
      peerFactory,
      collectWindowMs: 0,
    });
    expect(result.playerIds).toEqual(['HOST', 'alice', 'bob', 'charlie']);
  });

  it('parseFfaInit：畸形輸入回 null（不丟例外）', () => {
    expect(parseFfaInit('not-json')).toBeNull();
    expect(parseFfaInit(JSON.stringify({ t: 'nope' }))).toBeNull();
    expect(parseFfaInit(JSON.stringify({ t: 'ffa-init', seed: 'x', playerIds: [] }))).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. KO 回報：本機簽章後 POST /api/ffa-match，body 形狀正確、withTimeout 不丟未捕捉例外
// ─────────────────────────────────────────────────────────────────────────
describe('KO 簽章回報（reportFfaRanked）', () => {
  it('對局結束後本機簽章並 POST，body 含 matchId/reporterId/standings/signature/replay；簽章可被 verifySignature 驗證', async () => {
    const wallet = Wallet.createRandom();
    const reporterId = wallet.address;
    const seed = 999;
    const matchId = `ROOM0-${seed.toString(36)}`;
    const standings = [reporterId, '0xdead', '0xbeef']; // index0 = 冠軍
    const replay = { seed, playerIds: standings, frameCount: 10, events: [] };

    let captured: { url: string; body: Record<string, unknown> } | null = null;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      captured = { url, body: JSON.parse((init!.body as string)) };
      return { ok: true, json: async () => ({ outcome: 'pending' }) } as unknown as Response;
    });

    const outcome = await reportFfaRanked({
      matchId,
      reporterId,
      standings,
      replay,
      signMessage: (m: string) => wallet.signMessage(m),
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(outcome).toBe('pending');
    expect(captured).not.toBeNull();
    expect(captured!.url).toBe('/api/ffa-match');
    const body = captured!.body;
    expect(body.matchId).toBe(matchId);
    expect(body.reporterId).toBe(reporterId);
    expect(body.standings).toEqual(standings);
    expect(typeof body.signature).toBe('string');
    expect(body.replay).toEqual(replay);

    // 簽章對 buildFfaResultMessage(matchId, standings, [1..N]) 可驗證
    const placements = standings.map((_, i) => i + 1);
    const message = buildFfaResultMessage(matchId, standings, placements);
    expect(verifySignature(message, body.signature as string, reporterId)).toBe(true);
  });

  it('沒有 signMessage（casual）→ 不送出、回 null', async () => {
    const fetchFn = vi.fn();
    const outcome = await reportFfaRanked({
      matchId: 'R-1',
      reporterId: 'casual',
      standings: ['casual', 'x'],
      replay: { seed: 1, playerIds: ['casual', 'x'], frameCount: 1, events: [] },
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(outcome).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetch 逾時 → reportFfaRanked 不丟未捕捉例外，回 null（withTimeout 行為）', async () => {
    const wallet = Wallet.createRandom();
    // fetch 永不 resolve
    const fetchFn = vi.fn(() => new Promise<Response>(() => {}));
    const outcome = await reportFfaRanked({
      matchId: `R-${(5).toString(36)}`,
      reporterId: wallet.address,
      standings: [wallet.address, '0xaa'],
      replay: { seed: 5, playerIds: [wallet.address, '0xaa'], frameCount: 1, events: [] },
      signMessage: (m: string) => wallet.signMessage(m),
      fetchFn: fetchFn as unknown as typeof fetch,
      timeoutMs: 20,
    });
    expect(outcome).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. onMessage 立即接管不丟幀：建 lockstep 前就有 frame 進來 → 暫存佇列回放後 lockstep 收到
// ─────────────────────────────────────────────────────────────────────────
describe('onMessage 立即接管不丟幀（takeoverTransport）', () => {
  it('lockstep 建立前進來的幀，回放後 lockstep inbox 反映（confirmedFrame 推進）', () => {
    // 一個最小 mock underlying transport：可在綁 onMessage 前後手動觸發訊息。
    let underlyingCb: ((m: FfaFrameMsg) => void) | null = null;
    const underlying: FfaLockstepTransport = {
      send: (_m: FfaFrameMsg) => {},
      onMessage: (fn) => { underlyingCb = fn; },
    };

    // 立即接管：takeover 馬上對 underlying 綁 onMessage（暫存佇列），回傳一個包裝 transport。
    const wrapped = takeoverTransport(underlying);

    // 在 lockstep 尚未建立時，遠端就送來「其他兩位玩家」對 frame 0..7 的輸入。
    // 注意：FfaLockstep 會預填 frame 0..inputDelay-1（預設 3），所以早到的幀必須落在
    // 預填窗之外（frame >= 3）才能真正驗到「沒被丟」。
    const playerIds = ['me', 'a', 'b'];
    for (const p of ['a', 'b']) {
      for (let f = 0; f < 8; f++) {
        const msg: FfaFrameMsg = { f, p, a: [] };
        underlyingCb!(msg); // 模擬「載入空檔」收到幀 → 應進暫存佇列
      }
    }

    // 現在用「包裝 transport」建立 lockstep；其 onMessage 綁定後，暫存佇列應被回放。
    const lockstep = new FfaLockstep({ playerIds, localId: 'me', seed: 1, transport: wrapped });

    // 本地連續 tick：每 tick 送出 sendFrame+inputDelay 的本地輸入，逐步湊齊各幀。
    for (let i = 0; i < 8; i++) lockstep.tick([]);

    // 若早到的幀（frame 3..7）被丟，全員湊不齊那些幀，confirmedFrame 會卡在預填窗 (3)。
    // 暫存佇列正確回放 → confirmedFrame 應推進到預填窗之外。
    expect(lockstep.confirmedFrame).toBeGreaterThan(3);
  });

  it('包裝 transport 的 send 透傳到 underlying；接管後即時訊息也送達 lockstep cb', () => {
    let underlyingCb: ((m: FfaFrameMsg) => void) | null = null;
    const sent: FfaFrameMsg[] = [];
    const underlying: FfaLockstepTransport = {
      send: (m) => sent.push(m),
      onMessage: (fn) => { underlyingCb = fn; },
    };
    const wrapped = takeoverTransport(underlying);
    const got: FfaFrameMsg[] = [];
    wrapped.onMessage((m) => got.push(m));

    // 綁定後即時訊息應直接到 cb（不經佇列）
    underlyingCb!({ f: 9, p: 'a', a: [] });
    expect(got).toEqual([{ f: 9, p: 'a', a: [] }]);

    // send 透傳
    wrapped.send({ f: 0, p: 'me', a: ['left'] });
    expect(sent).toEqual([{ f: 0, p: 'me', a: ['left'] }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. 邊界：guest 數 0（只有 host，N=1）合理處理；roomCode 不存在 join 失敗回明確錯誤
// ─────────────────────────────────────────────────────────────────────────
describe('邊界處理', () => {
  it('expectedGuests=0（只有 host，N=1）→ 拒絕（FFA 至少需 2 人）', async () => {
    const signal = makeMockSignal();
    const peerFactory = () => ({
      createOffer: async () => 'OFFER',
      acceptAnswer: async () => {},
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null as ((r: string) => void) | null },
    });
    await expect(
      negotiateHostFfa({
        hostId: 'host',
        maxGuests: 7,
        expectedGuests: 0,
        signal,
        peerFactory,
        collectWindowMs: 0,
      }),
    ).rejects.toThrow(/at least 2|至少|guest/i);
  });

  it('join 時 roomCode 不存在（host-offer 取不到）→ 明確錯誤', async () => {
    const signal = makeMockSignal();
    const peerFactory = () => ({
      createAnswer: async () => 'ANS',
      waitOpen: async () => {},
      channel: { send: () => {}, open: true, onmessage: null as ((r: string) => void) | null },
    });
    await expect(
      negotiateJoinFfa({
        room: 'NOPE',
        guestId: 'g0',
        slotIndex: 0,
        signal,
        peerFactory,
      }),
    ).rejects.toThrow(/offer|timeout|host/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. guest-initiated 真實 WebRTC 握手（T11）：每 guest 各自 offer，host 各自 answer
// ─────────────────────────────────────────────────────────────────────────
describe('guest-initiated 握手（negotiateHostFfaGuestInit / negotiateJoinFfaGuestInit）', () => {
  function makeHostPeer(): FfaHostAnswerPeer {
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
    } as unknown as FfaHostAnswerPeer;
  }

  it('host 輪詢 guest-{i}-offer → createAnswer → 寫 host-ack-{i}；組裝 playerIds host 在前、依 index 升序', async () => {
    const signal = makeMockSignal();
    const room = 'ROOM0';
    // 兩個 guest 依序 claim slot 0、1 並寫 offer
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'alice', offer: 'OFF0' }));
    await signal.putSlot(room, 'guest-1-offer', JSON.stringify({ id: 'bob', offer: 'OFF1' }));

    const result = await negotiateHostFfaGuestInit({
      hostId: 'HOST',
      maxGuests: 7,
      expectedGuests: 2,
      signal,
      peerFactory: makeHostPeer,
      pollOpts: { timeoutMs: 50, intervalMs: 0 },
    });

    expect(result.playerIds).toEqual(['HOST', 'alice', 'bob']);
    expect(result.guestPeers.length).toBe(2);
    // host 對每個 guest 都寫了 answer 到 host-ack-{i}
    expect(signal.store.get(`${room}:host-ack-0`)).toBe('ANSWER-SDP');
    expect(signal.store.get(`${room}:host-ack-1`)).toBe('ANSWER-SDP');
    // matchId 內嵌 seed（base36）
    expect(parseInt(result.matchId.split('-')[1], 36)).toBe(result.seed);
  });

  it('guest：claim 最低空 slot → 寫 guest-{idx}-offer → 等 host-ack-{idx} answer → acceptAnswer', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMX';
    // host 預先放好 host-ack-0 = answer（模擬 host 已回應 slot 0）
    await signal.putSlot(room, 'host-ack-0', 'ANSWER-FROM-HOST');

    let acceptedAnswer: string | null = null;
    const peerFactory = (): FfaGuestOfferPeer => {
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
      } as unknown as FfaGuestOfferPeer;
    };

    const result = await negotiateJoinFfaGuestInit({
      room,
      guestId: 'alice',
      signal,
      peerFactory,
      pollOpts: { timeoutMs: 50, intervalMs: 0 },
    });

    expect(result.slotIndex).toBe(0);
    expect(result.localId).toBe('alice');
    // guest 寫了 guest-0-offer（含 id + offer）
    const off = JSON.parse(signal.store.get(`${room}:guest-0-offer`)!) as { id: string; offer: string };
    expect(off.id).toBe('alice');
    expect(off.offer).toBe('OFFER-FROM-GUEST');
    // guest acceptAnswer 收到 host 的 answer
    expect(acceptedAnswer).toBe('ANSWER-FROM-HOST');
  });

  it('claimGuestSlot：選最低未被占用的 slot（已占用者跳過）', async () => {
    const signal = makeMockSignal();
    const room = 'R';
    // slot 0 已被占用
    await signal.putSlot(room, 'guest-0-offer', JSON.stringify({ id: 'x', offer: 'o' }));
    const idx = await claimGuestSlot(signal, room, 'alice', 'OFFER-A', 7);
    expect(idx).toBe(1);
    const off = JSON.parse(signal.store.get(`${room}:guest-1-offer`)!) as { id: string };
    expect(off.id).toBe('alice');
  });

  it('claimGuestSlot：全部 slot 占滿 → 拋出明確錯誤', async () => {
    const signal = makeMockSignal();
    const room = 'R';
    for (let i = 0; i < 7; i++) {
      await signal.putSlot(room, `guest-${i}-offer`, JSON.stringify({ id: `x${i}`, offer: 'o' }));
    }
    await expect(claimGuestSlot(signal, room, 'alice', 'OFFER-A', 7)).rejects.toThrow(/full|滿|slot/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. wrapChannel：把 WebRtcTransport 風格物件包成 RelayChannel（send/open/onmessage）
// ─────────────────────────────────────────────────────────────────────────
describe('wrapChannel（RelayChannel 卡接）', () => {
  it('send 透傳、open 反映底層、onMessage 回呼掛在 onmessage setter 上', () => {
    const sent: string[] = [];
    let opened = false;
    let msgCb: ((d: string) => void) | null = null;
    const fakeTransport = {
      send: (d: string) => sent.push(d),
      onMessage: (cb: (d: string) => void) => { msgCb = cb; },
      get isOpen() { return opened; },
    };
    const ch = wrapChannel(fakeTransport);
    // open 反映底層
    expect(ch.open).toBe(false);
    opened = true;
    expect(ch.open).toBe(true);
    // send 透傳
    ch.send('hello');
    expect(sent).toEqual(['hello']);
    // 設定 onmessage → 底層收到訊息時轉發
    const got: string[] = [];
    ch.onmessage = (r) => got.push(r);
    msgCb!('frame-data');
    expect(got).toEqual(['frame-data']);
  });
});
