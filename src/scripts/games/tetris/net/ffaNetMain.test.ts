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
  tapFrames,
  wrapChannel,
  checkSilence,
  FfaForfeitController,
  wireFfaForfeit,
  createGuestHostWatch,
  type FfaSignalClient,
  type FfaInitMsg,
  type FfaHostAnswerPeer,
  type FfaGuestOfferPeer,
} from './ffaNetMain';
import { FfaHubTransport, FfaSpokeTransport } from './ffaTransport';
import { FfaLockstep, INPUT_DELAY, type FfaFrameMsg, type FfaLockstepTransport } from './ffaLockstep';
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

  it('negotiateJoinFfaGuestInit：fixedSlot 指定槽位 → 直接寫該槽不掃描（快速配對免並發 claim race）', async () => {
    const signal = makeMockSignal();
    const room = 'ROOMF';
    // host 已回應 slot 1（slot 0 仍空 → 若有掃描會錯搶 slot 0）
    await signal.putSlot(room, 'host-ack-1', 'ANSWER-1');

    let acceptedAnswer: string | null = null;
    const peerFactory = (): FfaGuestOfferPeer => {
      let onmsg: ((r: string) => void) | null = null;
      return {
        createOffer: async () => 'OFFER-B',
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
      guestId: 'bob',
      signal,
      peerFactory,
      fixedSlot: 1,
      pollOpts: { timeoutMs: 50, intervalMs: 0 },
    });

    expect(result.slotIndex).toBe(1);
    // slot 0 完全未被碰；offer 直接落在 slot 1
    expect(signal.store.get(`${room}:guest-0-offer`)).toBeUndefined();
    const off = JSON.parse(signal.store.get(`${room}:guest-1-offer`)!) as { id: string; offer: string };
    expect(off.id).toBe('bob');
    expect(off.offer).toBe('OFFER-B');
    expect(acceptedAnswer).toBe('ANSWER-1');
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

  it('底層 onClose → 觸發包裝後的 onclose（真 WebRTC close 偵測路徑）', () => {
    let closeCb: (() => void) | null = null;
    const fakeTransport = {
      send: (_d: string) => {},
      onMessage: (_cb: (d: string) => void) => {},
      get isOpen() { return true; },
      onClose: (cb: () => void) => { closeCb = cb; },
    };
    const ch = wrapChannel(fakeTransport);
    // 包裝後必須帶有 onclose 可賦值屬性（FfaHub/Spoke 用 `'onclose' in ch` 判斷掛載）
    expect('onclose' in ch).toBe(true);
    let closed = 0;
    ch.onclose = () => { closed++; };
    closeCb!();
    expect(closed).toBe(1);
  });

  it('底層無 onClose（舊 backing）→ 仍可包裝，onclose 屬性存在但不觸發', () => {
    const fakeTransport = {
      send: (_d: string) => {},
      onMessage: (_cb: (d: string) => void) => {},
      get isOpen() { return true; },
    };
    const ch = wrapChannel(fakeTransport);
    expect('onclose' in ch).toBe(true); // 介面一致；無底層 close 來源時就是永不觸發
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. F5 中離續行：靜默偵測 / host 宣告廣播 / onControl 排程 / channel close / 整合
// ─────────────────────────────────────────────────────────────────────────

/** 控制訊息能力 mock transport（測 wireFfaForfeit 的接線，不碰真 WebRTC）。 */
function makeMockControlTransport() {
  let controlCb: ((m: Record<string, unknown>) => void) | null = null;
  let channelCloseCb: ((idx: number) => void) | null = null;
  let closeCb: (() => void) | null = null;
  const sent: Array<Record<string, unknown>> = [];
  return {
    sent,
    send: (_m: FfaFrameMsg) => {},
    onMessage: (_cb: (m: FfaFrameMsg) => void) => {},
    sendControl: (m: Record<string, unknown>) => { sent.push(m); },
    onControl: (cb: (m: Record<string, unknown>) => void) => { controlCb = cb; },
    onChannelClose: (cb: (idx: number) => void) => { channelCloseCb = cb; },
    onClose: (cb: () => void) => { closeCb = cb; },
    emitControl: (m: Record<string, unknown>) => controlCb?.(m),
    emitChannelClose: (idx: number) => channelCloseCb?.(idx),
    emitClose: () => closeCb?.(),
  };
}

describe('checkSilence（純函式靜默逾時判定）', () => {
  it('某 guest 超過 timeout 無訊息 → 回其 id；未超時 → []；剛好等於邊界不算超時', () => {
    const lastMsgAt = new Map<string, number>([['g1', 0], ['g2', 5_000]]);
    // g1 距今 10_001 > 10_000 → 超時；g2 距今 5_001 → 未超時
    expect(checkSilence(lastMsgAt, 10_001, 10_000)).toEqual(['g1']);
    // 都未超時
    expect(checkSilence(lastMsgAt, 9_000, 10_000)).toEqual([]);
    // 剛好邊界（now - at === timeout）不算超時（嚴格大於）
    expect(checkSilence(lastMsgAt, 10_000, 10_000)).toEqual([]);
  });
});

describe('createGuestHostWatch（guest 端 host 頻道靜默兜底偵測，Stage B）', () => {
  it('host 頻道靜默超過 timeout → onHostDown 觸發一次；noteActivity 重置計時', () => {
    let nowMs = 0;
    let downs = 0;
    const w = createGuestHostWatch({
      onHostDown: () => { downs++; },
      isActive: () => true,
      now: () => nowMs,
      timeoutMs: 10_000,
    });
    nowMs = 9_000;
    w.check();
    expect(downs).toBe(0); // 未超時
    nowMs = 10_000;
    w.check();
    expect(downs).toBe(0); // 剛好邊界（嚴格大於才算）
    nowMs = 10_001;
    w.check();
    expect(downs).toBe(1); // 超時 → 觸發
    nowMs = 10_002;
    w.check();
    expect(downs).toBe(1); // 觸發後計時已重置 → 不重複轟炸

    // 有活動（host 中繼幀）→ 重置；之後再靜默才會再觸發
    nowMs = 15_000;
    w.noteActivity();
    nowMs = 25_000;
    w.check();
    expect(downs).toBe(1); // 15000→25000 恰好 10000，未嚴格超時
    nowMs = 25_001;
    w.check();
    expect(downs).toBe(2);
  });

  it('isActive=false（遷移中/已中止/對局結束）→ 不計靜默且重置基準（恢復後重新起算）', () => {
    let nowMs = 0;
    let active = false;
    let downs = 0;
    const w = createGuestHostWatch({
      onHostDown: () => { downs++; },
      isActive: () => active,
      now: () => nowMs,
      timeoutMs: 10_000,
    });
    nowMs = 60_000;
    w.check(); // 非 active：不觸發、基準同步到 now
    expect(downs).toBe(0);
    active = true;
    nowMs = 65_000;
    w.check();
    expect(downs).toBe(0); // 恢復後僅累積 5s，不觸發
    nowMs = 70_001;
    w.check();
    expect(downs).toBe(1); // 自恢復基準起超過 10s → 觸發
  });

  it('silentMs：回傳 host 頻道目前靜默毫秒數（供倒數警示）；非 active 回 0；noteActivity 歸零', () => {
    let nowMs = 0;
    let active = true;
    const w = createGuestHostWatch({
      onHostDown: () => {},
      isActive: () => active,
      now: () => nowMs,
      timeoutMs: 30_000,
    });
    expect(w.silentMs()).toBe(0); // 建構當下無靜默
    nowMs = 12_000;
    expect(w.silentMs()).toBe(12_000); // 靜默 12s（已過警示門檻，UI 該顯示倒數）
    w.noteActivity();
    expect(w.silentMs()).toBe(0); // host 恢復送幀 → 歸零（警示消失）
    nowMs = 20_000;
    active = false; // 遷移中/中止/結果畫面：不顯示警示
    expect(w.silentMs()).toBe(0);
  });
});

describe('FfaForfeitController（host 宣告 + 廣播）', () => {
  it('F = lastFrame+1；廣播形狀 {t:"ffa-forfeit",p,f}；同 p 重複宣告只廣播一次；未知 p 忽略', () => {
    const sent: Array<Record<string, unknown>> = [];
    const ctl = new FfaForfeitController({
      guestIds: ['g1', 'g2'],
      sendControl: (m) => sent.push(m),
    });
    ctl.noteFrame({ f: 10, p: 'g1', a: [] });
    ctl.noteFrame({ f: 7, p: 'g1', a: [] }); // 取 max，不回退
    ctl.declareForfeit('g1');
    expect(sent).toEqual([{ t: 'ffa-forfeit', p: 'g1', f: 11 }]);
    ctl.declareForfeit('g1'); // 重複宣告 → 不再廣播
    expect(sent.length).toBe(1);
    ctl.declareForfeit('nobody'); // 不在 guestIds → 忽略
    expect(sent.length).toBe(1);
  });

  it('F 與 confirmedFrame 無關＝lastFrame+1（停滯後宣告不得產生不可達幀）', () => {
    // 回歸：silence 偵測在「鎖步已停滯（confirmedFrame == lastFrame+1）」後才宣告，
    // 若 F 取 max(lastFrame+1, confirmedFrame+1) 會得到 lastFrame+2 —— 沒有任何端
    // 能在缺 g1 輸入下推進到該幀 → 全員死鎖。F 必須恆為 lastFrame+1。
    const sent: Array<Record<string, unknown>> = [];
    const ctl = new FfaForfeitController({
      guestIds: ['g1'],
      sendControl: (m) => sent.push(m),
    });
    ctl.noteFrame({ f: 60, p: 'g1', a: [] }); // g1 最後幀 60 → 全員必停滯在 61
    ctl.declareForfeit('g1');
    expect(sent).toEqual([{ t: 'ffa-forfeit', p: 'g1', f: 61 }]);
  });

  it('guest 從未送過幀 → F = INPUT_DELAY（預填 0..delay-1 後的全員停滯點）', () => {
    // 各端因預填可推進到 simFrame = INPUT_DELAY 才停 → F 取 1 會造成各端
    // 套用幀不一致（max(F, 收到當下 simFrame) 不同）；F = INPUT_DELAY 唯一確定。
    const sent: Array<Record<string, unknown>> = [];
    const ctl = new FfaForfeitController({
      guestIds: ['g1'],
      sendControl: (m) => sent.push(m),
    });
    ctl.declareForfeit('g1');
    expect(sent).toEqual([{ t: 'ffa-forfeit', p: 'g1', f: INPUT_DELAY }]);
  });

  it('checkSilenceNow：靜默逾時的 guest 被宣告（注入 now）；已宣告者不重複', () => {
    const sent: Array<Record<string, unknown>> = [];
    let nowMs = 0;
    const ctl = new FfaForfeitController({
      guestIds: ['g1', 'g2'],
      sendControl: (m) => sent.push(m),
      now: () => nowMs,
      timeoutMs: 10_000,
    });
    nowMs = 5_000;
    ctl.noteFrame({ f: 3, p: 'g1', a: [] }); // g1 在 5s 有活動
    nowMs = 10_000;
    expect(ctl.checkSilenceNow()).toEqual([]); // g2 剛好邊界 → 未超時
    nowMs = 10_001;
    expect(ctl.checkSilenceNow()).toEqual(['g2']); // g2 超時 → 宣告（從未送幀 → F=INPUT_DELAY）
    expect(sent).toEqual([{ t: 'ffa-forfeit', p: 'g2', f: INPUT_DELAY }]);
    nowMs = 20_000;
    expect(ctl.checkSilenceNow()).toEqual(['g1']); // g1 也超時；g2 已宣告不重複
    expect(sent.length).toBe(2);
  });

  it('maxSilenceMs：回傳未宣告 guest 的最長靜默毫秒數（供畫面倒數警示）；已宣告者剔除', () => {
    let nowMs = 0;
    const ctl = new FfaForfeitController({
      guestIds: ['g1', 'g2'],
      sendControl: () => {},
      now: () => nowMs,
    });
    expect(ctl.maxSilenceMs()).toBe(0); // 建構當下無靜默
    nowMs = 4_000;
    ctl.noteFrame({ f: 1, p: 'g1', a: [] }); // g1 在 4s 有活動
    nowMs = 12_000;
    expect(ctl.maxSilenceMs()).toBe(12_000); // g2 從建構起靜默 12s > g1 的 8s
    ctl.declareForfeit('g2');
    expect(ctl.maxSilenceMs()).toBe(8_000); // g2 已宣告 → 只剩 g1
  });
});

describe('wireFfaForfeit（接線）', () => {
  const playerIds = ['host', 'g1', 'g2'];

  it('onControl 收合法 ffa-forfeit → scheduleForfeit(p,f)；壞 shape（p 不在名單 / f=NaN / f<0 / 非 forfeit）忽略', () => {
    const t = makeMockControlTransport();
    const scheduled: Array<[string, number]> = [];
    const lockstep = { scheduleForfeit: (p: string, f: number) => { scheduled.push([p, f]); }, confirmedFrame: 0 };
    wireFfaForfeit({ lockstep, playerIds, transport: t, setIntervalFn: () => 0 });

    t.emitControl({ t: 'ffa-forfeit', p: 'g1', f: 12 });
    expect(scheduled).toEqual([['g1', 12]]);

    t.emitControl({ t: 'ffa-forfeit', p: 'zz', f: 5 });       // p 不在名單
    t.emitControl({ t: 'ffa-forfeit', p: 'g2', f: NaN });      // f 非有限數
    t.emitControl({ t: 'ffa-forfeit', p: 'g2', f: -1 });       // f 負數
    t.emitControl({ t: 'ffa-forfeit', p: 'g2', f: '5' });      // f 非數字
    t.emitControl({ t: 'ffa-leave' });                          // 非 forfeit 控制訊息
    expect(scheduled).toEqual([['g1', 12]]);
  });

  it('host 端：onChannelClose(idx) → 宣告該 idx 對應 guest 的 forfeit 並廣播', () => {
    const t = makeMockControlTransport();
    const lockstep = { scheduleForfeit: () => {}, confirmedFrame: 0 };
    const ctl = wireFfaForfeit({
      lockstep, playerIds, transport: t,
      guestIds: ['g1', 'g2'],
      setIntervalFn: () => 0,
    });
    expect(ctl).not.toBeNull();
    t.emitChannelClose(1); // channels[1] ↔ g2（從未送幀 → F=INPUT_DELAY）
    expect(t.sent).toEqual([{ t: 'ffa-forfeit', p: 'g2', f: INPUT_DELAY }]);
  });

  it('guest 端：host 頻道 close → onHostClose 被觸發（disconnected 路徑）', () => {
    const t = makeMockControlTransport();
    const lockstep = { scheduleForfeit: () => {}, confirmedFrame: 0 };
    const onHostClose = vi.fn();
    const ctl = wireFfaForfeit({ lockstep, playerIds, transport: t, onHostClose, setIntervalFn: () => 0 });
    expect(ctl).toBeNull(); // 無 guestIds → 非 host，不建偵測控制器
    t.emitClose();
    expect(onHostClose).toHaveBeenCalledTimes(1);
  });
});

describe('F5 整合：真 FfaLockstep + Hub/Spoke mock channels — guest 離開後續行並判敗', () => {
  it('一 guest 送 ffa-leave → host 廣播 forfeit → host 與另一 guest 的 lockstep 都判敗該玩家並續行', () => {
    // 同步 loopback channel pair：兩端互送
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
    const p1 = pair();
    const p2 = pair();
    const hub = new FfaHubTransport([p1.hostEnd, p2.hostEnd]);
    const spoke1 = new FfaSpokeTransport(p1.guestEnd);
    const spoke2 = new FfaSpokeTransport(p2.guestEnd);

    const playerIds = ['host', 'g1', 'g2'];
    let hostCtl: FfaForfeitController | null = null;
    const hostLs = new FfaLockstep({
      playerIds, localId: 'host', seed: 7,
      transport: takeoverTransport(tapFrames(hub, (m) => hostCtl?.noteFrame(m))),
    });
    const g1Ls = new FfaLockstep({ playerIds, localId: 'g1', seed: 7, transport: takeoverTransport(spoke1) });
    const g2Ls = new FfaLockstep({ playerIds, localId: 'g2', seed: 7, transport: takeoverTransport(spoke2) });

    hostCtl = wireFfaForfeit({ lockstep: hostLs, playerIds, transport: hub, guestIds: ['g1', 'g2'], setIntervalFn: () => 0 });
    wireFfaForfeit({ lockstep: g1Ls, playerIds, transport: spoke1 });
    wireFfaForfeit({ lockstep: g2Ls, playerIds, transport: spoke2 });

    // 三端各 tick 5 幀（g2 的 lastFrame = 4+3 = 7 → F = 8）
    for (let i = 0; i < 5; i++) { hostLs.tick([]); g1Ls.tick([]); g2Ls.tick([]); }

    // g2 主動離開：ffa-leave 快速路徑 → hub onChannelClose → host 宣告並廣播
    spoke2.sendControl({ t: 'ffa-leave' });

    // host 與 g1 續行（g2 不再 tick）→ 推進過 F 後 g2 被判敗
    for (let i = 0; i < 30; i++) { hostLs.tick([]); g1Ls.tick([]); }

    expect(hostLs.getMatch().getPlacement().get('g2')).toBe(3);
    expect(g1Ls.getMatch().getPlacement().get('g2')).toBe(3);
    // 對局未凍結：confirmedFrame 推進超過棄權幀
    expect(hostLs.confirmedFrame).toBeGreaterThan(8);
    expect(g1Ls.confirmedFrame).toBeGreaterThan(8);
    // replay 含 forfeits 紀錄（兩端一致）
    expect(hostLs.getReplay().forfeits.map((x) => x.p)).toEqual(['g2']);
    expect(g1Ls.getReplay().forfeits).toEqual(hostLs.getReplay().forfeits);
  });

  it('回歸：鎖步已停滯（confirmedFrame 追平 lastFrame+1）後才宣告 → 仍能套用棄權續行（不死鎖）', () => {
    // 對應真實時序：guest 關閉分頁 → 其餘端把該 guest 既有輸入消化完、停滯 10 秒 →
    // silence 逾時才宣告。宣告當下 confirmedFrame == lastFrame+1，F 若被「防禦性」
    // 抬到 confirmedFrame+1 = lastFrame+2 → 永不可達 → 全員凍結（e2e 抓到的死鎖）。
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
    const p1 = pair();
    const p2 = pair();
    const hub = new FfaHubTransport([p1.hostEnd, p2.hostEnd]);
    const spoke1 = new FfaSpokeTransport(p1.guestEnd);
    const spoke2 = new FfaSpokeTransport(p2.guestEnd);

    const playerIds = ['host', 'g1', 'g2'];
    let hostCtl: FfaForfeitController | null = null;
    const hostLs = new FfaLockstep({
      playerIds, localId: 'host', seed: 11,
      transport: takeoverTransport(tapFrames(hub, (m) => hostCtl?.noteFrame(m))),
    });
    const g1Ls = new FfaLockstep({ playerIds, localId: 'g1', seed: 11, transport: takeoverTransport(spoke1) });
    const g2Ls = new FfaLockstep({ playerIds, localId: 'g2', seed: 11, transport: takeoverTransport(spoke2) });

    hostCtl = wireFfaForfeit({ lockstep: hostLs, playerIds, transport: hub, guestIds: ['g1', 'g2'], setIntervalFn: () => 0 });
    wireFfaForfeit({ lockstep: g1Ls, playerIds, transport: spoke1 });
    wireFfaForfeit({ lockstep: g2Ls, playerIds, transport: spoke2 });

    // 三端各 tick 5 幀後 g2 靜默（模擬關閉分頁：不送 leave、不再 tick）
    for (let i = 0; i < 5; i++) { hostLs.tick([]); g1Ls.tick([]); g2Ls.tick([]); }

    // host 與 g1 繼續 tick 把 g2 的既有輸入消化完 → 停滯（confirmedFrame == lastFrame+1）
    for (let i = 0; i < 20; i++) { hostLs.tick([]); g1Ls.tick([]); }
    const stalled = hostLs.confirmedFrame;
    expect(g1Ls.confirmedFrame).toBe(stalled); // 兩端同點停滯

    // 停滯「之後」host 才宣告（= silence 逾時的時序）
    hostCtl!.declareForfeit('g2');

    // 必須能套用棄權並續行（修正前：F = stalled+1 永不可達 → 凍結）
    for (let i = 0; i < 30; i++) { hostLs.tick([]); g1Ls.tick([]); }
    expect(hostLs.getMatch().getPlacement().get('g2')).toBe(3);
    expect(g1Ls.getMatch().getPlacement().get('g2')).toBe(3);
    // 兩端都脫離停滯點續行（同步 loopback 的 tick 順序使兩端有 ±1 幀的良性偏移）
    expect(hostLs.confirmedFrame).toBeGreaterThan(stalled);
    expect(g1Ls.confirmedFrame).toBeGreaterThan(stalled);
    expect(g1Ls.getReplay().forfeits).toEqual(hostLs.getReplay().forfeits);
  });
});
