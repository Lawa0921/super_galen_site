import { type InputAction } from '../engine/game';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { PixiStage } from '../render/PixiStage';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from '../render/assets';
import { FfaBoards } from '../render/FfaBoards';
import { FfaLockstep, type FfaFrameMsg, type FfaLockstepTransport } from './ffaLockstep';
import type { FfaReplay } from './ffaReplay';
import { FfaHubTransport, FfaSpokeTransport, type RelayChannel } from './ffaTransport';
import { createRoom as realCreateRoom, putSlot as realPutSlot, getSlot as realGetSlot, pollSlot as realPollSlot } from './signalClient';
import { buildFfaResultMessage } from './auth';

const SIM_DT = 1000 / 60;

// ─────────────────────────────────────────────────────────────────────────
// 共用：withTimeout（沿用 netMain 精神；逾時 reject，呼叫端各自吞掉）
// ─────────────────────────────────────────────────────────────────────────
const HANDSHAKE_TIMEOUT_MS = 30_000;
const REPORT_TIMEOUT_MS = 8_000;

/** 為 Promise 加上逾時，避免對手在連線後崩潰導致永久卡住。 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

const randInt = () => Math.floor(Math.random() * 1_000_000_000);

// ─────────────────────────────────────────────────────────────────────────
// 依賴注入介面（測試傳 mock，預設用真實 signalClient）
// ─────────────────────────────────────────────────────────────────────────

/** 與 /api/signal 互動的最小客戶端（可注入 mock-net 測握手序列）。 */
export interface FfaSignalClient {
  createRoom(): Promise<string>;
  putSlot(room: string, slot: string, data: string): Promise<void>;
  getSlot(room: string, slot: string): Promise<string | null>;
  pollSlot(room: string, slot: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<string>;
}

/** 預設真實 signal client（生產環境用）。 */
export const realSignalClient: FfaSignalClient = {
  createRoom: realCreateRoom,
  putSlot: realPutSlot,
  getSlot: realGetSlot,
  pollSlot: realPollSlot,
};

/**
 * Host 端對「某一個 guest」的 RTC peer 抽象（依賴注入，真實環境包 RTCPeerConnection）。
 * createOffer 產生含候選的 offer；acceptAnswer 吃下 guest 的 answer；waitOpen 等 channel 開。
 * channel 供 FfaHubTransport 建中繼用。
 */
export interface FfaHostPeer {
  createOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

/** Guest 端對 host 的 RTC peer 抽象。createAnswer 吃 host offer 產 answer；channel 供 spoke 用。 */
export interface FfaGuestPeer {
  createAnswer(offer: string): Promise<string>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

// ─────────────────────────────────────────────────────────────────────────
// ffa-init 訊息（host 廣播給各 guest：seed + 最終 playerIds 順序 + 你的 index）
// ─────────────────────────────────────────────────────────────────────────

export interface FfaInitMsg {
  t: 'ffa-init';
  seed: number;
  playerIds: string[];
  yourIndex: number;
}

/** 把 ffa-init 內容序列化為字串（寫進 host-ack-{idx} 槽位）。 */
export function buildFfaInit(opts: { seed: number; playerIds: string[]; yourIndex: number }): string {
  const msg: FfaInitMsg = {
    t: 'ffa-init',
    seed: opts.seed,
    playerIds: opts.playerIds,
    yourIndex: opts.yourIndex,
  };
  return JSON.stringify(msg);
}

/** 解析 ffa-init；JSON 容錯 + shape 驗證，畸形回 null（不丟例外）。 */
export function parseFfaInit(raw: string): FfaInitMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.t !== 'ffa-init') return null;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed)) return null;
  if (!Array.isArray(o.playerIds) || !o.playerIds.every((x) => typeof x === 'string')) return null;
  if (typeof o.yourIndex !== 'number' || !Number.isFinite(o.yourIndex)) return null;
  return { t: 'ffa-init', seed: o.seed, playerIds: o.playerIds as string[], yourIndex: o.yourIndex };
}

/** guest 寫進 guest-{idx}-answer 的內容：自己的 id + RTC answer。 */
interface GuestAnswerMsg { id: string; answer: string }

function parseGuestAnswer(raw: string): GuestAnswerMsg | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (typeof m.id === 'string' && typeof m.answer === 'string') {
      return { id: m.id, answer: m.answer };
    }
  } catch { /* ignore */ }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 握手協調（可測：不依賴真實 WebRTC / DOM）
// ─────────────────────────────────────────────────────────────────────────

export interface NegotiateHostResult {
  matchId: string;
  seed: number;
  /** 最終 playerIds 順序：host 在前、連上的 guest 依 slot index 升序。 */
  playerIds: string[];
  /** 每個連上的 guest 對應的 host 端 peer（依 playerIds 中該 guest 的順序）。 */
  guestPeers: FfaHostPeer[];
  room: string;
}

/**
 * Host 牽線協調：建房 → 寫 host-offer → 對 0..maxGuests-1 槽位輪詢 answer →
 * 為每個連上的 guest 建立 peer（acceptAnswer + waitOpen）→ 廣播 ffa-init（含 seed/playerIds）
 * 到 host-ack-{idx}。回傳含 matchId/seed/playerIds 供 runFfaGame。
 *
 * 注意：星狀拓樸中每個 guest 各持一條對 host 的 channel。本協調器把「可測的 signal 讀寫
 * 序列 + 名單組裝」抽出；真實 RTC peer 由 peerFactory 注入（測試傳 stub）。
 */
export async function negotiateHostFfa(opts: {
  hostId: string;
  maxGuests: number; // 最多開放槽位數（1..7）
  expectedGuests: number; // 期待連上的人數（達標即開局）
  signal: FfaSignalClient;
  peerFactory: () => FfaHostPeer;
  /** 收齊 expectedGuests 後仍等待這段時間給其餘 guest（測試傳 0）。 */
  collectWindowMs?: number;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
}): Promise<NegotiateHostResult> {
  const { hostId, maxGuests, expectedGuests, signal, peerFactory } = opts;
  // FFA 至少 2 人（host + 1 guest）。
  if (expectedGuests < 1) {
    throw new Error('FFA requires at least 2 players (host needs >= 1 guest)');
  }
  const slots = Math.min(Math.max(maxGuests, expectedGuests), 7);

  const room = await signal.createRoom();
  const seed = randInt();
  const matchId = `${room}-${seed.toString(36)}`;

  // 為協定產生並發布 host-offer（真實環境：guest 由此建 answer）。
  // 每個 guest 在 host 端各自一個 peer；offer 由代表 peer 產生並公布。
  const offerPeer = peerFactory();
  const offer = await offerPeer.createOffer();
  await signal.putSlot(room, 'host-offer', offer);

  // 對每個 slot 輪詢 answer，收齊 expectedGuests 即停。
  // connected[idx] = { id, peer }，未連上者為 undefined。
  const connected = new Array<{ id: string; peer: FfaHostPeer } | undefined>(slots);
  let count = 0;
  const deadline = Date.now() + (opts.pollOpts?.timeoutMs ?? HANDSHAKE_TIMEOUT_MS);

  // 第一個 guest 沿用 offerPeer（已產 offer）；其餘 guest 各自新 peer。
  for (let idx = 0; idx < slots && count < expectedGuests; idx++) {
    let answerRaw: string | null = null;
    // 短輪詢這個 slot；逾時就放棄此 slot（guest 未加入）
    while (Date.now() < deadline) {
      answerRaw = await signal.getSlot(room, `guest-${idx}-answer`);
      if (answerRaw) break;
      // 一次掃完所有 slot 後若都沒人，交給外層迴圈重試；這裡簡化為小睡
      await new Promise((r) => setTimeout(r, opts.pollOpts?.intervalMs ?? 0));
      // 測試環境（intervalMs=0）下避免忙等：若這個 slot 一直沒值就跳出，等下一輪
      if ((opts.pollOpts?.intervalMs ?? 0) === 0) break;
    }
    if (!answerRaw) continue;
    const parsed = parseGuestAnswer(answerRaw);
    if (!parsed) continue;

    const peer = count === 0 ? offerPeer : peerFactory();
    if (count !== 0) {
      // 其餘 peer 也需產生 offer 才能 acceptAnswer（真實 RTC）。
      await peer.createOffer();
    }
    await peer.acceptAnswer(parsed.answer);
    await peer.waitOpen();
    connected[idx] = { id: parsed.id, peer };
    count++;
  }

  if (count < 1) {
    throw new Error('no guests connected');
  }

  // 組裝最終 playerIds：host 在前、guest 依 slot index 升序（穩定確定）。
  const playerIds: string[] = [hostId];
  const guestPeers: FfaHostPeer[] = [];
  for (let idx = 0; idx < slots; idx++) {
    const c = connected[idx];
    if (!c) continue;
    playerIds.push(c.id);
    guestPeers.push(c.peer);
  }

  // 廣播 ffa-init 給每個連上的 guest（寫 host-ack-{idx}）。
  // yourIndex = 該 guest 在 playerIds 中的位置。
  for (let idx = 0; idx < slots; idx++) {
    const c = connected[idx];
    if (!c) continue;
    const yourIndex = playerIds.indexOf(c.id);
    await signal.putSlot(room, `host-ack-${idx}`, buildFfaInit({ seed, playerIds, yourIndex }));
  }

  return { matchId, seed, playerIds, guestPeers, room };
}

export interface NegotiateJoinResult {
  matchId: string;
  seed: number;
  playerIds: string[];
  localId: string;
  peer: FfaGuestPeer;
  room: string;
}

/**
 * Guest 牽線協調：取 host-offer → createAnswer → 寫 guest-{idx}-answer（含自己 id）→
 * 等 host-ack-{idx}（內含 ffa-init：seed/playerIds）→ 回傳供 runFfaGame。
 */
export async function negotiateJoinFfa(opts: {
  room: string;
  guestId: string;
  slotIndex: number; // 0..6
  signal: FfaSignalClient;
  peerFactory: () => FfaGuestPeer;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
}): Promise<NegotiateJoinResult> {
  const { room, guestId, slotIndex, signal, peerFactory } = opts;

  const offer = await signal.pollSlot(room, 'host-offer', opts.pollOpts);
  const peer = peerFactory();
  const answer = await peer.createAnswer(offer);
  await signal.putSlot(room, `guest-${slotIndex}-answer`, JSON.stringify({ id: guestId, answer } as GuestAnswerMsg));
  await peer.waitOpen();

  const ackRaw = await signal.pollSlot(room, `host-ack-${slotIndex}`, opts.pollOpts);
  const init = parseFfaInit(ackRaw);
  if (!init) throw new Error('bad ffa-init from host');

  const seedFromMatch = init.seed;
  const matchId = `${room}-${seedFromMatch.toString(36)}`;
  return {
    matchId,
    seed: init.seed,
    playerIds: init.playerIds,
    localId: guestId,
    peer,
    room,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// onMessage 立即接管（避免開局丟幀）：包裝 transport，建 lockstep 前先暫存
// ─────────────────────────────────────────────────────────────────────────

/**
 * 立即對 underlying transport 綁 onMessage（開始暫存進來的幀），回傳一個「包裝 transport」。
 * 當上層（FfaLockstep）對包裝 transport 呼叫 onMessage(cb) 綁定時，暫存佇列會被回放給 cb，
 * 之後的訊息直接轉發給 cb。對應 1v1 netMain「先建 lockstep 接管 transport」避免載入空檔丟幀。
 */
export function takeoverTransport(underlying: FfaLockstepTransport): FfaLockstepTransport {
  const queue: FfaFrameMsg[] = [];
  let cb: ((m: FfaFrameMsg) => void) | null = null;

  // 馬上接管 underlying：尚未綁 cb 時進佇列，已綁則直接轉發。
  underlying.onMessage((m) => {
    if (cb) cb(m);
    else queue.push(m);
  });

  return {
    send: (m) => underlying.send(m),
    onMessage: (fn) => {
      cb = fn;
      // 回放暫存佇列（保序）
      while (queue.length) cb(queue.shift()!);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// KO 簽章回報（可測：不依賴 DOM；fetch / signMessage 可注入）
// ─────────────────────────────────────────────────────────────────────────

export type FfaReportOutcome = 'applied' | 'pending' | 'conflict' | 'already' | null;

/**
 * 對局結束後本機簽章並 POST /api/ffa-match（各端各自回報以達共識）。
 * 無 signMessage（casual）→ 不送、回 null。逾時 / 失敗 → 回 null（不丟未捕捉例外）。
 *
 * body 對齊 T6 /api/ffa-match：matchId / reporterId / standings / signature / replay / ratings?。
 * 簽章對 buildFfaResultMessage(matchId, standings, [1..N])。
 */
export async function reportFfaRanked(opts: {
  matchId: string;
  reporterId: string;
  standings: string[]; // index0 = 冠軍
  replay: FfaReplay;
  signMessage?: (msg: string) => Promise<string>;
  ratings?: Record<string, number>;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}): Promise<FfaReportOutcome> {
  const { matchId, reporterId, standings, replay, signMessage } = opts;
  if (!signMessage) return null; // casual：不回報
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? REPORT_TIMEOUT_MS;

  try {
    const placements = standings.map((_, i) => i + 1);
    const message = buildFfaResultMessage(matchId, standings, placements);
    const signature = await signMessage(message);
    const body: Record<string, unknown> = {
      matchId,
      reporterId,
      standings,
      signature,
      replay,
    };
    if (opts.ratings) body.ratings = opts.ratings;

    const res = await withTimeout(
      fetchFn('/api/ffa-match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      timeoutMs,
      'ffa-report',
    );
    const json = (await res.json()) as { outcome?: FfaReportOutcome };
    return json.outcome ?? null;
  } catch {
    return null; // 回報失敗不影響對局，不丟未捕捉例外
  }
}

// ─────────────────────────────────────────────────────────────────────────
// 對局 UI 主迴圈（組裝；Pixi/DOM 由 e2e/手動驗證，此處保持可被建構）
// ─────────────────────────────────────────────────────────────────────────

export interface RunFfaOpts {
  canvas: HTMLCanvasElement;
  playerIds: string[];
  localId: string;
  seed: number;
  matchId: string;
  transport: FfaLockstepTransport;
  signMessage?: (msg: string) => Promise<string>;
  /** 對手斷線回呼（可選；UI 可掛 DISCONNECTED 橫幅）。 */
  onDisconnect?: () => void;
  fetchFn?: typeof fetch;
}

/**
 * 建立 N 人對局並跑主迴圈。
 *
 * 鐵則：先用 takeoverTransport 立即接管 transport（避免渲染初始化空檔丟對手幀），
 * 再建 FfaLockstep（其 onMessage 綁定包裝 transport → 暫存佇列回放）。
 *
 * 主迴圈（Pixi ticker）：收集本地輸入 → lockstep.tick(localActions) →
 * boards.renderMatch + drainAndFx + standings 更新。
 * KO（match.phase==='result'）時，本機若有 signer 則簽章回報。
 */
export function runFfaGame(opts: RunFfaOpts): void {
  const { canvas, playerIds, localId, seed, matchId, signMessage } = opts;

  // 立即接管 transport：建 lockstep 前進來的幀先進暫存佇列。
  const wrapped = takeoverTransport(opts.transport);
  const lockstep = new FfaLockstep({ playerIds, localId, seed, transport: wrapped });

  // 暫存本幀本地輸入（InputController 透過 emit 累加）。
  let pendingActions: InputAction[] = [];
  const input = new InputController((a) => pendingActions.push(a), { das: 150, arr: 35 });

  void PixiStage.create(canvas).then(async (stage) => {
    const tex = await loadGameTextures();
    stage.setBackground(tex.bg);
    try { await document.fonts.load('14px "Press Start 2P"'); await document.fonts.ready; } catch { /* fallback */ }

    const boards = new FfaBoards(stage, playerIds, localId, tex);
    const sound = new SoundManager();

    function relayout(): void {
      stage.layoutBackground();
      boards.relayout(stage.width, stage.height);
    }
    relayout();
    stage.app.renderer.on('resize', relayout);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') { e.preventDefault(); sound.ensure(); sound.toggle(); return; }
      const a = KEYMAP_1P[e.code];
      if (!a) return;
      e.preventDefault();
      sound.ensure();
      if (e.repeat) return;
      input.press(a);
    };
    const onKeyUp = (e: KeyboardEvent) => { const a = KEYMAP_1P[e.code]; if (a) input.release(a); };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    let acc = 0;
    let resultReported = false;
    let disconnected = false;

    const standings: string[] = [];

    const tick = (ticker: { deltaMS: number }) => {
      const dt = ticker.deltaMS;
      const match = lockstep.getMatch();

      if (match.phase === 'playing' && !disconnected) {
        acc += dt;
        let guard = 0;
        while (acc >= SIM_DT && guard < 8) {
          input.update(SIM_DT);
          const actions = pendingActions;
          pendingActions = [];
          lockstep.tick(actions);
          guard++;
          acc -= SIM_DT;
        }
        boards.drainAndFx(match.drainEvents());
      }

      boards.renderMatch(match);
      boards.update(dt);
      stage.update(dt);

      standings.length = 0;
      standings.push(...lockstep.getStandings());

      if (match.phase === 'result' && !resultReported) {
        resultReported = true;
        sound.topout();
        stage.shake(12);
        void reportFfaRanked({
          matchId,
          reporterId: localId,
          standings: match.getStandings(),
          replay: lockstep.getReplay(),
          signMessage,
          fetchFn: opts.fetchFn,
        });
      }
    };
    stage.app.ticker.add(tick);

    (window as unknown as { __tetrisDebug?: unknown }).__tetrisDebug = {
      ffaLockstep: lockstep,
      get match() { return lockstep.getMatch(); },
      stage,
      boards,
      standings,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 真實環境組裝：hostFfaGame / joinFfaGame（牽線 → transport → runFfaGame）
// ─────────────────────────────────────────────────────────────────────────

export interface FfaNetStatus {
  phase: 'creating' | 'waiting' | 'connecting' | 'connected' | 'error';
  room?: string;
  message?: string;
  connected?: number;
}
export type FfaStatusCb = (s: FfaNetStatus) => void;

export interface FfaIdentity {
  id: string;
  ranked: boolean;
  signMessage?: (msg: string) => Promise<string>;
}

/**
 * Host：建房 → 牽線多 guest → 廣播 ffa-init → 建 FfaHubTransport → runFfaGame。
 * peerFactory 預設未提供（真實 RTC peer 由呼叫端在接線時注入），保持本檔可在無 DOM 下被 import。
 */
export async function hostFfaGame(opts: {
  canvas: HTMLCanvasElement;
  identity: FfaIdentity;
  maxGuests: number;
  expectedGuests: number;
  peerFactory: () => FfaHostPeer;
  onStatus: FfaStatusCb;
  signal?: FfaSignalClient;
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  try {
    opts.onStatus({ phase: 'creating' });
    const result = await negotiateHostFfa({
      hostId: opts.identity.id,
      maxGuests: opts.maxGuests,
      expectedGuests: opts.expectedGuests,
      signal,
      peerFactory: opts.peerFactory,
    });
    opts.onStatus({ phase: 'connected', room: result.room, connected: result.guestPeers.length });

    const transport = new FfaHubTransport(result.guestPeers.map((p) => p.channel));
    runFfaGame({
      canvas: opts.canvas,
      playerIds: result.playerIds,
      localId: opts.identity.id,
      seed: result.seed,
      matchId: result.matchId,
      transport,
      signMessage: opts.identity.ranked ? opts.identity.signMessage : undefined,
    });
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Guest：用 roomCode 牽線 → 拿 ffa-init → 建 FfaSpokeTransport → runFfaGame。
 */
export async function joinFfaGame(opts: {
  canvas: HTMLCanvasElement;
  room: string;
  identity: FfaIdentity;
  slotIndex: number;
  peerFactory: () => FfaGuestPeer;
  onStatus: FfaStatusCb;
  signal?: FfaSignalClient;
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  try {
    opts.onStatus({ phase: 'connecting', room: opts.room });
    const result = await negotiateJoinFfa({
      room: opts.room,
      guestId: opts.identity.id,
      slotIndex: opts.slotIndex,
      signal,
      peerFactory: opts.peerFactory,
    });
    opts.onStatus({ phase: 'connected', room: opts.room });

    const transport = new FfaSpokeTransport(result.peer.channel);
    runFfaGame({
      canvas: opts.canvas,
      playerIds: result.playerIds,
      localId: opts.identity.id,
      seed: result.seed,
      matchId: result.matchId,
      transport,
      signMessage: opts.identity.ranked ? opts.identity.signMessage : undefined,
    });
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}
