import { Text } from 'pixi.js';
import { type InputAction } from '../engine/game';
import { KEYMAP_1P } from '../input/keymap';
import { InputController } from '../input/InputController';
import { loadHandling } from '../input/handling';
import { PixiStage } from '../render/PixiStage';
import { SoundManager } from '../audio/SoundManager';
import { loadGameTextures } from '../render/assets';
import { getSelectedSkin, resolveSkin } from '../render/skins';
import { setSkinTints } from '../render/layout';
import { FfaBoards } from '../render/FfaBoards';
import { FfaLockstep, INPUT_DELAY, type FfaFrameMsg, type FfaLockstepTransport } from './ffaLockstep';
import type { FfaReplay } from './ffaReplay';
import { FfaHubTransport, FfaSpokeTransport, type RelayChannel } from './ffaTransport';
import {
  MigratingTransport,
  runMigration,
  MAX_MIGRATIONS,
  type MigratableInner,
  type MigSignal,
} from './ffaMigration';
import { createRoom as realCreateRoom, putSlot as realPutSlot, getSlot as realGetSlot, pollSlot as realPollSlot } from './signalClient';
import { buildFfaResultMessage } from './auth';
import { WebRtcTransport } from './webrtcTransport';
import { SILENCE_TIMEOUT_MS, silenceWarningText } from './silence';

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

// ═════════════════════════════════════════════════════════════════════════
// guest-initiated 星狀握手（T11：真實 WebRTC 用此流程）
//
// 拓樸：guest 主動建 offer，host 各自回 answer。每對 host↔guest 各一條 PC。
//   guest：createOffer → claim 最低空 guest-{idx}-offer → 等 host-ack-{idx}(=answer)
//          → acceptAnswer → waitOpen → 透過 channel 收 ffa-init。
//   host ：輪詢 guest-{0..maxGuests-1}-offer → createAnswer → 寫 host-ack-{idx}
//          → waitOpen → 收齊後組裝 playerIds，透過各 channel 廣播 ffa-init。
//
// 與 T9 的 host-initiated 流程（negotiateHostFfa/negotiateJoinFfa）並存、互不干擾。
// host-ack-{i} 在此流程承載「SDP answer」（而非 ffa-init）；ffa-init 改走 data channel。
// ═════════════════════════════════════════════════════════════════════════

/** Host 端對某 guest 的 RTC peer（guest-initiated：host 收 offer 回 answer）。 */
export interface FfaHostAnswerPeer {
  createAnswer(offer: string): Promise<string>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

/** Guest 端對 host 的 RTC peer（guest-initiated：guest 建 offer 收 answer）。 */
export interface FfaGuestOfferPeer {
  createOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

/** guest 寫進 guest-{idx}-offer 的內容：自己的 id + RTC offer。 */
interface GuestOfferMsg { id: string; offer: string }

function parseGuestOffer(raw: string): GuestOfferMsg | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (typeof m.id === 'string' && typeof m.offer === 'string') {
      return { id: m.id, offer: m.offer };
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * Guest 認領最低未占用的 guest-{idx}-offer 槽位（寫入自己的 id+offer）。
 *
 * 已知限制（誠實揭露）：claim 為「讀-改-寫」非原子操作，兩名 guest 幾乎同時
 * claim 同一空槽時可能 race（後者覆蓋前者）。e2e 以「依序加入」規避；生產環境
 * 可接受小機率重連。回傳認領到的 slot index。
 */
export async function claimGuestSlot(
  signal: FfaSignalClient,
  room: string,
  guestId: string,
  offer: string,
  maxGuests: number,
): Promise<number> {
  const slots = Math.min(Math.max(maxGuests, 1), 7);
  for (let idx = 0; idx < slots; idx++) {
    const existing = await signal.getSlot(room, `guest-${idx}-offer`);
    if (existing) continue; // 已被占用，試下一個
    await signal.putSlot(room, `guest-${idx}-offer`, JSON.stringify({ id: guestId, offer } as GuestOfferMsg));
    return idx;
  }
  throw new Error('lobby full: no free guest slot');
}

export interface NegotiateHostGuestInitResult {
  matchId: string;
  seed: number;
  /** host 在前、連上的 guest 依 slot index 升序。 */
  playerIds: string[];
  /** 每個連上 guest 的 host 端 peer（依 playerIds 中該 guest 的順序）。 */
  guestPeers: FfaHostAnswerPeer[];
  room: string;
}

/**
 * Host 牽線（guest-initiated）：建房 → 輪詢 guest-{i}-offer → 對每個 offer
 * createAnswer 並寫 host-ack-{i} → waitOpen → 收齊 expectedGuests → 組裝 playerIds。
 *
 * isCancelled 可選：每輪檢查，外部按「取消」時提早結束（回已連上的）。
 * onGuest 可選：每連上一名 guest 回呼一次（UI 更新 lobby 人數）。
 */
export async function negotiateHostFfaGuestInit(opts: {
  hostId: string;
  maxGuests: number;
  expectedGuests: number;
  signal: FfaSignalClient;
  peerFactory: () => FfaHostAnswerPeer;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
  isCancelled?: () => boolean;
  onGuest?: (connectedCount: number) => void;
}): Promise<NegotiateHostGuestInitResult> {
  const { hostId, maxGuests, expectedGuests, signal, peerFactory } = opts;
  if (expectedGuests < 1) {
    throw new Error('FFA requires at least 2 players (host needs >= 1 guest)');
  }
  const slots = Math.min(Math.max(maxGuests, expectedGuests), 7);

  const room = await signal.createRoom();
  const seed = randInt();
  const matchId = `${room}-${seed.toString(36)}`;

  const connected = new Array<{ id: string; peer: FfaHostAnswerPeer } | undefined>(slots);
  let count = 0;
  const timeoutMs = opts.pollOpts?.timeoutMs ?? HANDSHAKE_TIMEOUT_MS;
  const intervalMs = opts.pollOpts?.intervalMs ?? 600;
  const deadline = Date.now() + timeoutMs;

  // 反覆掃所有 slot，發現未處理的 offer 就回 answer 並連線，直到收齊或逾時。
  while (count < expectedGuests && Date.now() < deadline) {
    if (opts.isCancelled?.()) break;
    let progressed = false;
    for (let idx = 0; idx < slots; idx++) {
      if (connected[idx]) continue;
      const raw = await signal.getSlot(room, `guest-${idx}-offer`);
      if (!raw) continue;
      const parsed = parseGuestOffer(raw);
      if (!parsed) continue;

      const peer = peerFactory();
      const answer = await peer.createAnswer(parsed.offer);
      await signal.putSlot(room, `host-ack-${idx}`, answer);
      await peer.waitOpen();
      connected[idx] = { id: parsed.id, peer };
      count++;
      progressed = true;
      opts.onGuest?.(count);
      if (count >= expectedGuests) break;
    }
    if (count >= expectedGuests) break;
    if (!progressed) {
      if (intervalMs === 0) break; // 測試模式：不忙等
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  if (count < 1) {
    throw new Error('no guests connected');
  }

  const playerIds: string[] = [hostId];
  const guestPeers: FfaHostAnswerPeer[] = [];
  for (let idx = 0; idx < slots; idx++) {
    const c = connected[idx];
    if (!c) continue;
    playerIds.push(c.id);
    guestPeers.push(c.peer);
  }

  return { matchId, seed, playerIds, guestPeers, room };
}

export interface NegotiateJoinGuestInitResult {
  localId: string;
  slotIndex: number;
  peer: FfaGuestOfferPeer;
  room: string;
}

/**
 * Guest 牽線（guest-initiated）：createOffer → claim 最低空 guest-{idx}-offer →
 * 等 host-ack-{idx}(=answer) → acceptAnswer → waitOpen。
 * seed/playerIds 不在此取得 —— 由 host 開局後透過 data channel 廣播 ffa-init。
 */
export async function negotiateJoinFfaGuestInit(opts: {
  room: string;
  guestId: string;
  signal: FfaSignalClient;
  peerFactory: () => FfaGuestOfferPeer;
  maxGuests?: number;
  /** 指定槽位（快速配對：依 roster 序位分槽）→ 直接寫該槽，免並發 claim race。 */
  fixedSlot?: number;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
}): Promise<NegotiateJoinGuestInitResult> {
  const { room, guestId, signal, peerFactory } = opts;
  const peer = peerFactory();
  const offer = await peer.createOffer();
  let slotIndex: number;
  if (opts.fixedSlot !== undefined) {
    slotIndex = opts.fixedSlot;
    await signal.putSlot(room, `guest-${slotIndex}-offer`, JSON.stringify({ id: guestId, offer } as GuestOfferMsg));
  } else {
    slotIndex = await claimGuestSlot(signal, room, guestId, offer, opts.maxGuests ?? 7);
  }

  const answer = await signal.pollSlot(room, `host-ack-${slotIndex}`, opts.pollOpts);
  await peer.acceptAnswer(answer);
  await peer.waitOpen();

  return { localId: guestId, slotIndex, peer, room };
}

// ─────────────────────────────────────────────────────────────────────────
// RelayChannel 卡接：把 WebRtcTransport（send/onMessage/isOpen）包成 RelayChannel
// ─────────────────────────────────────────────────────────────────────────

/** WebRtcTransport 對外需要的最小形狀（供 wrapChannel；真實環境傳 WebRtcTransport 實例）。 */
export interface ChannelBacking {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  readonly isOpen: boolean;
  /** 可選：底層 channel 關閉通知（WebRtcTransport.onClose）→ 中離 close 快速路徑。 */
  onClose?(cb: () => void): void;
}

/**
 * 把一個 ChannelBacking（如 WebRtcTransport）包成 RelayChannel：
 *  - send(raw) → backing.send(raw)
 *  - open → backing.isOpen
 *  - onmessage setter → 掛到 backing.onMessage（FfaHub/Spoke 會設定此 setter）
 *  - onclose 可賦值屬性 → 由 backing.onClose 觸發（FfaHub/Spoke 以 `'onclose' in ch`
 *    判斷支援與否並掛上 close 處理 → 真 WebRTC 中離的秒級偵測路徑）
 *
 * 鐵則：onmessage 設定前到達的訊息進暫存佇列，設定當下立刻回放（保序）。
 * 避免 channel 開啟與設定 onmessage 之間的空檔丟失早到的 ffa-init / 對手幀。
 */
export function wrapChannel(
  backing: ChannelBacking,
): RelayChannel & { onmessage: ((raw: string) => void) | null; onclose: (() => void) | null } {
  let cb: ((raw: string) => void) | null = null;
  const queue: string[] = [];
  backing.onMessage((d) => {
    if (cb) cb(d);
    else queue.push(d);
  });
  const wrapped = {
    send: (raw: string) => backing.send(raw),
    get open() { return backing.isOpen; },
    get onmessage() { return cb; },
    set onmessage(fn: ((raw: string) => void) | null) {
      cb = fn;
      if (fn) while (queue.length) fn(queue.shift()!);
    },
    onclose: null as (() => void) | null,
  };
  backing.onClose?.(() => wrapped.onclose?.());
  return wrapped;
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

/**
 * 在 underlying transport 的收訊路徑插入一個 tap（觀測不消費）。
 * host 端用來記錄每 guest 的最後中繼幀（FfaForfeitController.noteFrame），
 * 不影響訊息往 lockstep 的轉發。
 */
export function tapFrames(
  underlying: FfaLockstepTransport,
  tap: (m: FfaFrameMsg) => void,
): FfaLockstepTransport {
  return {
    send: (m) => underlying.send(m),
    onMessage: (cb) => underlying.onMessage((m) => { tap(m); cb(m); }),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 中離續行（Stage A）：host 偵測 → 廣播 ffa-forfeit → 各端 scheduleForfeit
// ─────────────────────────────────────────────────────────────────────────

/** host 判定 guest 靜默逾時的窗口（無任何訊息即視同中離）。常數集中於 silence.ts。 */
export { SILENCE_TIMEOUT_MS, SILENCE_WARN_MS } from './silence';
/** host 端靜默檢查週期。 */
const SILENCE_CHECK_INTERVAL_MS = 1_000;

/**
 * 純函式：回傳「now - lastMsgAt 嚴格大於 timeoutMs」的玩家 id（靜默逾時）。
 *
 * 簡化規則（刻意，不附加「其他頻道同期活躍」前提）：guest 靜默逾時即宣告。
 * 理由：若是全域網路問題，host 自己也會被各 guest 透過 host 頻道 close 判離，
 * 對局同樣中止——誤宣告的代價可接受；逾時值集中常數（SILENCE_TIMEOUT_MS）可調。
 * N=2（僅一名 guest）情境因此不需要「另一頻道活躍」的特例。
 */
export function checkSilence(
  lastMsgAt: Map<string, number>,
  now: number,
  timeoutMs: number,
): string[] {
  const out: string[] = [];
  for (const [id, at] of lastMsgAt) {
    if (now - at > timeoutMs) out.push(id);
  }
  return out;
}

/** 驗證控制訊息為合法 ffa-forfeit：p ∈ playerIds、f 有限非負數。畸形回 null。 */
export function parseFfaForfeit(
  msg: Record<string, unknown>,
  playerIds: string[],
): { p: string; f: number } | null {
  if (msg.t !== 'ffa-forfeit') return null;
  if (typeof msg.p !== 'string' || !playerIds.includes(msg.p)) return null;
  if (typeof msg.f !== 'number' || !Number.isFinite(msg.f) || msg.f < 0) return null;
  return { p: msg.p, f: msg.f };
}

/**
 * Host 端中離宣告控制器（純邏輯，可注入 now 單測）。
 *
 * 職責：
 *  - noteFrame：記錄每 guest 最後中繼幀（max f）與最後活動時間。
 *  - declareForfeit：對未處理過的 guest 廣播 {t:'ffa-forfeit', p, f}；
 *    F = max(lastFrame+1, INPUT_DELAY) ＝「所有端必然停滯的那一幀」：
 *    缺 p 輸入時任何端都無法推進超過該幀，故 F 必可達（不死鎖）且
 *    各端套用幀一致（確定性）。注意 F 不得取 confirmedFrame+1 ——
 *    停滯後（confirmedFrame 已追平 lastFrame+1）宣告會得到不可達幀 → 全員凍結。
 *    廣播走 hub.sendControl（會回灌自身 onControl）→ 排程統一由 onControl 路徑做，
 *    host 不在此重複 scheduleForfeit。
 *  - checkSilenceNow：靜默逾時偵測（規則見 checkSilence 註解）。
 */
export class FfaForfeitController {
  private lastFrame = new Map<string, number>();
  private lastMsgAt = new Map<string, number>();
  private declared = new Set<string>();
  private readonly guestIds: string[];
  private readonly now: () => number;
  private readonly timeoutMs: number;

  constructor(private opts: {
    /** channels[i] ↔ guestIds[i]（playerIds 去掉 host、依 slot 升序）。 */
    guestIds: string[];
    sendControl: (msg: Record<string, unknown>) => void;
    now?: () => number;
    timeoutMs?: number;
  }) {
    this.guestIds = [...opts.guestIds];
    this.now = opts.now ?? Date.now;
    this.timeoutMs = opts.timeoutMs ?? SILENCE_TIMEOUT_MS;
    // 從建構當下起算：從未送過訊息的 guest 也會在 timeout 後被判離。
    const t0 = this.now();
    for (const id of this.guestIds) this.lastMsgAt.set(id, t0);
  }

  /** host 上層收到中繼幀時呼叫：更新該 guest 的最後幀號與活動時間。 */
  noteFrame(msg: FfaFrameMsg): void {
    if (!this.guestIds.includes(msg.p)) return; // 只追蹤 guest（host 自己的回灌幀略過）
    if (this.declared.has(msg.p)) return;
    this.lastFrame.set(msg.p, Math.max(this.lastFrame.get(msg.p) ?? 0, msg.f));
    this.lastMsgAt.set(msg.p, this.now());
  }

  /** 宣告 guest p 中離：計算 F 並廣播；同 p 只宣告一次；未知 p 忽略。 */
  declareForfeit(p: string): void {
    if (this.declared.has(p)) return;
    if (!this.guestIds.includes(p)) return;
    this.declared.add(p);
    this.lastMsgAt.delete(p); // 已宣告者不再做靜默檢查
    // F = 全員停滯點：p 的最後輸入幀 +1；從未送幀則為 INPUT_DELAY（預填 0..delay-1 之後）。
    const f = Math.max((this.lastFrame.get(p) ?? 0) + 1, INPUT_DELAY);
    this.opts.sendControl({ t: 'ffa-forfeit', p, f });
  }

  /** channel idx 關閉（close 事件或 ffa-leave 快速路徑）→ 宣告對應 guest。 */
  onChannelClose(idx: number): void {
    const p = this.guestIds[idx];
    if (p) this.declareForfeit(p);
  }

  /** 未宣告 guest 中最長的靜默毫秒數（無追蹤對象回 0）；供畫面倒數警示。 */
  maxSilenceMs(now: number = this.now()): number {
    let max = 0;
    for (const at of this.lastMsgAt.values()) max = Math.max(max, now - at);
    return max;
  }

  /** 靜默逾時檢查：超時的 guest 全部宣告；回傳本次被宣告的 id（供測試觀測）。 */
  checkSilenceNow(): string[] {
    const ids = checkSilence(this.lastMsgAt, this.now(), this.timeoutMs);
    for (const id of ids) this.declareForfeit(id);
    return ids;
  }
}

/** 排程棄權所需的 lockstep 最小形狀（FfaLockstep 子集；mock 友善）。 */
export interface ForfeitLockstep {
  scheduleForfeit(p: string, f: number): void;
}

/** 控制通道能力（FfaHubTransport / FfaSpokeTransport 的可選方法集合）。 */
export interface FfaControlHooks {
  sendControl?(msg: Record<string, unknown>): void;
  onControl?(cb: (msg: Record<string, unknown>) => void): void;
  /** hub（host）限定：某 guest channel 關閉。 */
  onChannelClose?(cb: (idx: number) => void): void;
  /** spoke（guest）限定：host channel 關閉。 */
  onClose?(cb: () => void): void;
}

/**
 * 中離續行接線（host + guest 共用入口）：
 *  - 所有端：transport.onControl 收 ffa-forfeit（shape 驗證）→ lockstep.scheduleForfeit。
 *  - guest 端：傳 onHostClose 時掛 transport.onClose（Stage A：host 離線＝對局中止）。
 *  - host 端：傳 guestIds 時建 FfaForfeitController——掛 onChannelClose 偵測
 *    （含 ffa-leave 快速路徑）＋啟動靜默逾時定時器。回傳 controller
 *    （供呼叫端把中繼幀 tap 進 noteFrame）；非 host 回 null。
 */
export function wireFfaForfeit(opts: {
  lockstep: ForfeitLockstep;
  playerIds: string[];
  transport: FfaLockstepTransport & FfaControlHooks;
  /** host 端傳入（channels[i] ↔ guestIds[i]）；guest 端省略。 */
  guestIds?: string[];
  /** guest 端：host 頻道關閉回呼。 */
  onHostClose?: () => void;
  now?: () => number;
  timeoutMs?: number;
  /** 測試注入（避免真定時器）；預設 setInterval。 */
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
}): FfaForfeitController | null {
  const t = opts.transport;

  // 所有端：收 host 廣播的 ffa-forfeit → 確定性排程（畸形忽略）。
  t.onControl?.((msg) => {
    const ff = parseFfaForfeit(msg, opts.playerIds);
    if (ff) opts.lockstep.scheduleForfeit(ff.p, ff.f);
  });

  // guest 端：host 頻道 close → Stage A 中止路徑。
  if (opts.onHostClose) t.onClose?.(opts.onHostClose);

  // host 端：偵測 + 廣播。
  if (!opts.guestIds || !t.sendControl) return null;
  const sendControl = t.sendControl.bind(t);
  const ctl = new FfaForfeitController({
    guestIds: opts.guestIds,
    sendControl,
    now: opts.now,
    timeoutMs: opts.timeoutMs,
  });
  t.onChannelClose?.((idx) => ctl.onChannelClose(idx));
  const setIntervalFn = opts.setIntervalFn
    ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  setIntervalFn(() => ctl.checkSilenceNow(), SILENCE_CHECK_INTERVAL_MS);
  return ctl;
}

/**
 * Guest 端 host 頻道靜默兜底偵測（Stage B：host-down 不只靠 spoke.onClose，
 * 也對 host 頻道做同款 lastMsgAt 檢查——host 對局中每 tick 都會中繼幀，
 * 靜默超過 timeoutMs ＝ host 死，觸發遷移）。
 *
 * - noteActivity()：收到任何中繼幀時呼叫（所有幀都經 host 中繼 → 任何來訊＝host 活著）。
 * - check()：定時呼叫；isActive() 為 false（遷移中/已中止/對局已結束/自己已是 host）時
 *   不計靜默並把基準重置到 now（恢復後重新起算，避免凍結期被誤判）。
 * - 觸發後基準亦重置（onHostDown 由呼叫端做重入防護，這裡避免每秒重複轟炸）。
 * - silentMs()：目前靜默毫秒數（非 active 回 0）——供畫面倒數警示（與 host 端
 *   FfaForfeitController.maxSilenceMs 同款，文案共用 silenceWarningText）。
 */
export function createGuestHostWatch(opts: {
  onHostDown: () => void;
  isActive: () => boolean;
  now?: () => number;
  timeoutMs?: number;
}): { noteActivity(): void; check(): void; silentMs(): number } {
  const now = opts.now ?? Date.now;
  const timeoutMs = opts.timeoutMs ?? SILENCE_TIMEOUT_MS;
  let last = now();
  return {
    noteActivity(): void {
      last = now();
    },
    check(): void {
      if (!opts.isActive()) {
        last = now();
        return;
      }
      if (now() - last > timeoutMs) {
        last = now();
        opts.onHostDown();
      }
    },
    silentMs(): number {
      if (!opts.isActive()) return 0;
      return now() - last;
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

/** Host migration（Stage B）所需的外部依賴；不傳＝維持 Stage A 行為（host 離線即中止）。 */
export interface FfaMigrationOpts {
  /** signaling client（putSlot/getSlot 子集即可）。 */
  signal: MigSignal;
  /** 原房號（mig{g}- 槽位沿用同一 room）。 */
  room: string;
  /** 測試注入；預設真實 WebRTC 工廠。 */
  hostPeerFactory?: () => FfaHostAnswerPeer;
  guestPeerFactory?: () => FfaGuestOfferPeer;
}

export interface RunFfaOpts {
  canvas: HTMLCanvasElement;
  playerIds: string[];
  localId: string;
  seed: number;
  matchId: string;
  transport: FfaLockstepTransport;
  signMessage?: (msg: string) => Promise<string>;
  /** host 端傳入（channels[i] ↔ guestIds[i]）→ 啟動中離偵測＋廣播。 */
  guestIds?: string[];
  /** 對手斷線回呼（可選；UI 可掛 DISCONNECTED 橫幅）。 */
  onDisconnect?: () => void;
  /** guest 端傳入 → host 離線時啟動遷移續行（Stage B）；省略＝Stage A 中止。 */
  migration?: FfaMigrationOpts;
  fetchFn?: typeof fetch;
}

/** runFfaGame 對外控制握把（ESC 離開對戰用）。 */
export interface FfaGameHandle {
  /**
   * 主動離開對戰：guest 先送 ffa-leave（host 快速判敗、其餘續行）再由呼叫端關閉/導頁；
   * host 離開＝Stage A 全局中止（不送訊息，guest 由 host 頻道 close 偵測）。
   */
  leaveMatch(): void;
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
export function runFfaGame(opts: RunFfaOpts): FfaGameHandle {
  const { canvas, playerIds, localId, seed, matchId, signMessage } = opts;
  const realTransport = opts.transport as FfaLockstepTransport & FfaControlHooks;

  // Stage B：lockstep 永遠透過 MigratingTransport facade 收發 ——
  // host migration 成功時 swap 內層（spoke→新 spoke / spoke→hub），lockstep 不動。
  const facade = new MigratingTransport(realTransport as unknown as MigratableInner);

  // 立即接管 transport：建 lockstep 前進來的幀先進暫存佇列。
  // tap：host 端餵 FfaForfeitController.noteFrame（中離 F 計算）；
  //      guest 端餵 hostWatch.noteActivity（任何中繼幀＝host 活著）。
  let forfeitCtl: FfaForfeitController | null = null;
  let hostWatch: { noteActivity(): void; check(): void; silentMs(): number } | null = null;
  const wrapped = takeoverTransport(
    tapFrames(facade, (m) => { forfeitCtl?.noteFrame(m); hostWatch?.noteActivity(); }),
  );
  const lockstep = new FfaLockstep({ playerIds, localId, seed, transport: wrapped });

  // ── 中離 / 遷移狀態 ────────────────────────────────────────────────────
  let disconnected = false; // 對局中止（Stage A 降級路徑）
  let migrating = false;    // 遷移中（凍結 tick、顯示橫幅）
  let migrationGen = 0;
  let migrationState: 'idle' | 'migrating' | 'done' | 'failed' = 'idle';
  let currentHostId = playerIds[0];
  let isHostNow = !!opts.guestIds;
  /** host-down 來源世代戳：遷移成功後舊 spoke 的殘留 close 事件一律忽略。 */
  let closeEpoch = 0;

  // 橫幅文字（Pixi stage 可能尚未就緒 → 先記住、就緒時套用）。
  let bannerText: string | null = null;
  let applyBanner: (text: string | null) => void = () => {};
  const setBanner = (text: string | null): void => {
    bannerText = text;
    applyBanner(text);
  };

  function abortMatch(): void {
    if (disconnected) return;
    disconnected = true;
    setBanner('HOST 離線\n對局中止');
    opts.onDisconnect?.();
  }

  /** 綁定當前 epoch 的 host-down 回呼（舊拓樸殘留事件不觸發新一輪遷移）。 */
  const makeHostDownCb = (): (() => void) => {
    const epoch = closeEpoch;
    return () => {
      if (epoch !== closeEpoch) return;
      void handleHostDown();
    };
  };

  /**
   * forfeit 接線（初次 + 升格 host 後重掛）：
   * 控制訊息走 facade（swap 後仍生效）；close 偵測掛在「當前真實拓樸」上。
   */
  const wireForfeit = (
    closeSource: FfaControlHooks,
    guestIds?: string[],
    onHostClose?: () => void,
  ): FfaForfeitController | null => wireFfaForfeit({
    lockstep,
    playerIds,
    transport: {
      send: (m) => facade.send(m),
      onMessage: () => {}, // 幀收訊已由 lockstep 持有（wireFfaForfeit 不用 onMessage）
      sendControl: (m) => facade.sendControl(m),
      onControl: (cb) => facade.onControl(cb),
      onChannelClose: closeSource.onChannelClose?.bind(closeSource),
      onClose: closeSource.onClose?.bind(closeSource),
    } as FfaLockstepTransport & FfaControlHooks,
    guestIds,
    onHostClose,
  });

  /**
   * Host 離線（spoke close 或靜默兜底）→ Stage B：啟動遷移續行；
   * 無遷移依賴 / 超過 MAX_MIGRATIONS / 遷移失敗 → 降級為 Stage A 中止。
   */
  async function handleHostDown(): Promise<void> {
    if (disconnected || migrating || isHostNow) return;
    if (lockstep.getMatch().phase !== 'playing') return; // 已分出勝負：結果已定，不需遷移
    const mig = opts.migration;
    // 協定規約：已知自己已定名次者「不參與」遷移（不寫 offer）。
    // 否則其低 index offer 會讓真候選誤讓位 → 全員 join → 選舉死鎖。
    // 代價：被淘汰者在 host 死後無法續看（自身名次已定，誠實降級）。
    if (lockstep.getMatch().getPlacement().has(localId)) {
      abortMatch();
      return;
    }
    if (!mig || migrationGen >= MAX_MIGRATIONS) {
      abortMatch();
      return;
    }
    migrating = true;
    migrationGen++;
    migrationState = 'migrating';
    setBanner('HOST 離線\n重新連線中…');
    try {
      const placedIds = [...lockstep.getMatch().getPlacement().keys()];
      const res = await runMigration({
        signal: mig.signal,
        room: mig.room,
        gen: migrationGen,
        playerIds,
        hostId: currentHostId,
        selfId: localId,
        placedIds,
        lockstep,
        transport: facade,
        hostPeerFactory: mig.hostPeerFactory ?? realHostAnswerPeerFactory,
        guestPeerFactory: mig.guestPeerFactory ?? realGuestOfferPeerFactory,
      });
      currentHostId = res.hostId;
      closeEpoch++; // 舊 spoke 殘留 close 從此失效
      if (res.role === 'host') {
        // 升格新 host：對新拓樸啟動 Stage A 偵測（channel close / ffa-leave / 靜默）。
        isHostNow = true;
        forfeitCtl = wireForfeit(res.hub, res.guestIds);
      } else {
        // 仍是 guest：對新 spoke 重掛 host-down 偵測（gen+1 備用）。
        res.spoke.onClose(makeHostDownCb());
        hostWatch?.noteActivity();
      }
      migrationState = 'done';
      migrating = false;
      setBanner(null);
    } catch {
      migrationState = 'failed';
      migrating = false;
      abortMatch();
    }
  }

  // 中離續行接線：所有端收 ffa-forfeit → scheduleForfeit；
  // host（有 guestIds）另啟偵測（channel close / ffa-leave / 靜默逾時）；
  // guest 掛 host-down（close 快速路徑 + 靜默兜底定時器）。
  forfeitCtl = wireForfeit(realTransport, opts.guestIds, makeHostDownCb());
  if (!opts.guestIds) {
    hostWatch = createGuestHostWatch({
      onHostDown: () => { void handleHostDown(); },
      isActive: () =>
        !disconnected && !migrating && !isHostNow && lockstep.getMatch().phase === 'playing',
    });
    setInterval(() => hostWatch?.check(), SILENCE_CHECK_INTERVAL_MS);
  }

  // 暫存本幀本地輸入（InputController 透過 emit 累加）。
  let pendingActions: InputAction[] = [];
  const input = new InputController((a) => pendingActions.push(a), loadHandling());

  void PixiStage.create(canvas).then(async (stage) => {
    // 皮膚只影響本地渲染（貼圖/調色），不進鎖步協定。
    const skin = resolveSkin(getSelectedSkin(localId), Number.POSITIVE_INFINITY);
    const tex = await loadGameTextures(skin.id);
    setSkinTints(skin.tints ?? null);
    stage.setBackground(tex.bg);
    try { await document.fonts.load('14px "Press Start 2P"'); await document.fonts.ready; } catch { /* fallback */ }

    const boards = new FfaBoards(stage, playerIds, localId, tex);
    const sound = new SoundManager();

    // 中央橫幅（host 離線：遷移中「重新連線中…」/ 降級「對局中止」）。
    const banner = new Text({
      text: '',
      style: { fontFamily: '"Press Start 2P", monospace', fontSize: 22, fill: 0xffffff, align: 'center' },
    });
    banner.anchor.set(0.5);
    banner.visible = false;
    stage.hudLayer.addChild(banner);
    applyBanner = (text: string | null): void => {
      banner.text = text ?? '';
      banner.visible = text !== null;
    };
    applyBanner(bannerText); // stage 就緒前已設定的文字（中止/遷移中）補套用

    // 靜默倒數警示（host 看 guests / guest 看 host：靜默超過 SILENCE_WARN_MS 即顯示，恢復送訊即消失）。
    const silenceWarn = new Text({
      text: '',
      style: { fontFamily: '"Press Start 2P", monospace', fontSize: 13, fill: 0xffd23f, align: 'center' },
    });
    silenceWarn.anchor.set(0.5);
    silenceWarn.visible = false;
    stage.hudLayer.addChild(silenceWarn);

    function relayout(): void {
      stage.layoutBackground();
      boards.relayout(stage.width, stage.height);
      banner.position.set(stage.width / 2, stage.height / 2);
      silenceWarn.position.set(stage.width / 2, Math.max(28, stage.height * 0.12));
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

    const standings: string[] = [];

    const tick = (ticker: { deltaMS: number }) => {
      const dt = ticker.deltaMS;
      const match = lockstep.getMatch();

      if (match.phase === 'playing' && !disconnected && !migrating) {
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

      // 靜默倒數警示：host 看 guests（forfeitCtl.maxSilenceMs），guest 看 host
      // （hostWatch.silentMs——Stage B 靜默兜底同一份計時），文案共用 silenceWarningText。
      // 遷移中不顯示（橫幅「重新連線中…」接手）；升格 host 後 forfeitCtl 優先。
      const silentMs = forfeitCtl ? forfeitCtl.maxSilenceMs() : (hostWatch?.silentMs() ?? 0);
      const warnMsg = (match.phase === 'playing' && !disconnected && !migrating)
        ? silenceWarningText(silentMs)
        : null;
      silenceWarn.visible = warnMsg !== null;
      if (warnMsg !== null) silenceWarn.text = warnMsg;

      if (disconnected && !resultReported) {
        // 降級中止（遷移失敗 / 無遷移依賴 / 超過 MAX_MIGRATIONS）：不計分。
        // 橫幅文字由 abortMatch() 經 setBanner 設定。
        resultReported = true;
      } else if (match.phase === 'result' && !resultReported) {
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
      get silenceWarning() { return silenceWarn.visible ? silenceWarn.text : ''; },
      migration: {
        get gen() { return migrationGen; },
        get state() { return migrationState; },
      },
    };
  });

  return {
    leaveMatch(): void {
      // guest：先送 ffa-leave（host 快速路徑立即判敗、其餘端續行）；
      // host（含遷移升格的新 host）：離開＝交給其餘端的偵測/遷移處理，不送訊息。
      // 走 facade → 遷移後仍送往「當前」host。
      if (!isHostNow) {
        facade.sendControl({ t: 'ffa-leave' });
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 真實環境組裝：hostFfaGame / joinFfaGame（牽線 → transport → runFfaGame）
// ─────────────────────────────────────────────────────────────────────────

export interface FfaNetStatus {
  phase: 'creating' | 'waiting' | 'lobby' | 'connecting' | 'connected' | 'error';
  room?: string;
  message?: string;
  /** 目前已連上的 guest 數（host lobby 顯示「已加入 / 目標」）。 */
  connected?: number;
}
export type FfaStatusCb = (s: FfaNetStatus) => void;

export interface FfaIdentity {
  id: string;
  ranked: boolean;
  signMessage?: (msg: string) => Promise<string>;
}

/** 真實環境的 host 端 peer 工廠：每 guest 一條 WebRtcTransport，包成 FfaHostAnswerPeer。 */
export function realHostAnswerPeerFactory(): FfaHostAnswerPeer {
  const transport = new WebRtcTransport();
  const channel = wrapChannel(transport);
  return {
    createAnswer: (offer: string) => transport.createAnswer(offer),
    waitOpen: () => transport.waitOpen(),
    channel,
  };
}

/** 真實環境的 guest 端 peer 工廠：一條對 host 的 WebRtcTransport，包成 FfaGuestOfferPeer。 */
export function realGuestOfferPeerFactory(): FfaGuestOfferPeer {
  const transport = new WebRtcTransport();
  const channel = wrapChannel(transport);
  return {
    createOffer: () => transport.createOffer(),
    acceptAnswer: (answer: string) => transport.acceptAnswer(answer),
    waitOpen: () => transport.waitOpen(),
    channel,
  };
}

/**
 * Host（guest-initiated 真實 WebRTC）：
 *  1. 建房，回報 room（lobby 顯示房號）。
 *  2. 背景接受 guest（claim guest-{i}-offer → answer → waitOpen），每連上一名回報人數。
 *  3. 等 waitStart()（lobby「開始」按鈕）resolve。
 *  4. 組裝 playerIds，透過各 channel 廣播 ffa-init，建 FfaHubTransport → runFfaGame。
 *
 * peerFactory 預設真實 WebRtcTransport；測試可注入 stub。
 */
export async function hostFfaGame(opts: {
  canvas: HTMLCanvasElement;
  identity: FfaIdentity;
  maxGuests: number;
  /** lobby「開始」訊號：resolve 後 host 停止收人並開局（autoStart 隊列局可不傳）。 */
  waitStart?: () => Promise<void>;
  /** 人到齊（maxGuests 全連上）即自動開局，不等 waitStart（快速配對用；lobby 不顯示開始鈕）。 */
  autoStart?: boolean;
  /** 指定房號（快速配對：隊列已先發房號給全員）；未給則 signal.createRoom()。 */
  room?: string;
  onStatus: FfaStatusCb;
  /** 對局握把回呼（ESC「離開對戰」用 leaveMatch）。 */
  onHandle?: (h: FfaGameHandle) => void;
  peerFactory?: () => FfaHostAnswerPeer;
  signal?: FfaSignalClient;
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  const peerFactory = opts.peerFactory ?? realHostAnswerPeerFactory;
  const slots = Math.min(Math.max(opts.maxGuests, 1), 7);
  try {
    opts.onStatus({ phase: 'creating' });
    const room = opts.room ?? (await signal.createRoom());
    const seed = randInt();
    const matchId = `${room}-${seed.toString(36)}`;
    opts.onStatus({ phase: 'lobby', room, connected: 0 });

    // 背景持續接受 guest，直到 start 訊號（即使收滿仍等房主按開始；autoStart 則滿員即開）。
    const connected = new Array<{ id: string; peer: FfaHostAnswerPeer } | undefined>(slots);
    let count = 0;
    let started = false;
    if (opts.waitStart) void opts.waitStart().then(() => { started = true; });

    const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS * 4; // lobby 可等久一點
    while (!started && Date.now() < deadline) {
      let progressed = false;
      for (let idx = 0; idx < slots; idx++) {
        if (connected[idx]) continue;
        const raw = await signal.getSlot(room, `guest-${idx}-offer`);
        if (!raw) continue;
        const parsed = parseGuestOffer(raw);
        if (!parsed) continue;
        const peer = peerFactory();
        const answer = await peer.createAnswer(parsed.offer);
        await signal.putSlot(room, `host-ack-${idx}`, answer);
        await peer.waitOpen();
        connected[idx] = { id: parsed.id, peer };
        count++;
        progressed = true;
        opts.onStatus({ phase: 'lobby', room, connected: count });
        if (opts.autoStart && count >= slots) started = true; // 隊列局：人到齊自動開始
        if (started || count >= slots) break;
      }
      if (started) break;
      if (!progressed) await new Promise((r) => setTimeout(r, 500));
    }

    if (count < 1) throw new Error('no guests connected');

    // 組裝 playerIds（host 在前、guest 依 slot index 升序）。
    const playerIds: string[] = [opts.identity.id];
    const channels: Array<RelayChannel & { onmessage?: ((raw: string) => void) | null }> = [];
    for (let idx = 0; idx < slots; idx++) {
      const c = connected[idx];
      if (!c) continue;
      playerIds.push(c.id);
      channels.push(c.peer.channel);
    }

    // 透過各 channel 廣播 ffa-init（seed + 最終 playerIds + 該 guest 的 index）。
    // channels[i] 對應 playerIds[i+1]（host 在 index 0），故 yourIndex = i+1。
    for (let i = 0; i < channels.length; i++) {
      channels[i].send(buildFfaInit({ seed, playerIds, yourIndex: i + 1 }));
    }

    opts.onStatus({ phase: 'connected', room, connected: count });

    const transport = new FfaHubTransport(channels);
    const handle = runFfaGame({
      canvas: opts.canvas,
      playerIds,
      localId: opts.identity.id,
      seed,
      matchId,
      transport,
      // channels[i] ↔ playerIds[i+1]（host 在 0）→ guestIds 啟動中離偵測。
      guestIds: playerIds.slice(1),
      signMessage: opts.identity.ranked ? opts.identity.signMessage : undefined,
    });
    opts.onHandle?.(handle);
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Guest（guest-initiated 真實 WebRTC）：
 *  1. createOffer → claim guest-{idx}-offer → 等 host-ack-{idx}(=answer) → acceptAnswer → waitOpen。
 *  2. 透過 data channel 等 host 廣播的 ffa-init（取 seed/playerIds/yourIndex）。
 *  3. 建 FfaSpokeTransport → runFfaGame。
 */
export async function joinFfaGame(opts: {
  canvas: HTMLCanvasElement;
  room: string;
  identity: FfaIdentity;
  onStatus: FfaStatusCb;
  /** 對局握把回呼（ESC「離開對戰」用 leaveMatch）。 */
  onHandle?: (h: FfaGameHandle) => void;
  maxGuests?: number;
  /** 指定槽位（快速配對：依 roster 序位分槽，免並發 claim race）。 */
  fixedSlot?: number;
  peerFactory?: () => FfaGuestOfferPeer;
  signal?: FfaSignalClient;
  /** ffa-init 等待逾時（預設沿用握手逾時）。 */
  initTimeoutMs?: number;
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  const peerFactory = opts.peerFactory ?? realGuestOfferPeerFactory;
  try {
    opts.onStatus({ phase: 'connecting', room: opts.room });
    const result = await negotiateJoinFfaGuestInit({
      room: opts.room,
      guestId: opts.identity.id,
      signal,
      peerFactory,
      maxGuests: opts.maxGuests ?? 7,
      fixedSlot: opts.fixedSlot,
    });
    opts.onStatus({ phase: 'lobby', room: opts.room });

    // channel 開後，先攔截 ffa-init（host 開局時第一筆廣播）。
    // ffa-init 之後到達的對手幀先暫存，交給 FfaSpokeTransport 前回放，避免開局丟幀。
    const ch = result.peer.channel;
    const earlyFrames: string[] = [];
    const initRaw = await withTimeout(
      new Promise<string>((resolve) => {
        let gotInit = false;
        ch.onmessage = (raw: string) => {
          if (!gotInit) {
            const init = parseFfaInit(raw);
            if (init) { gotInit = true; resolve(raw); return; }
            return; // ffa-init 前的雜訊忽略（理論上不會有）
          }
          earlyFrames.push(raw); // ffa-init 後、接管前的對手幀先暫存
        };
      }),
      opts.initTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
      'ffa-init',
    );
    const init = parseFfaInit(initRaw)!;
    const seed = init.seed;
    const matchId = `${opts.room}-${seed.toString(36)}`;

    opts.onStatus({ phase: 'connected', room: opts.room });

    // FfaSpokeTransport 建構時會覆寫 ch.onmessage（接管收幀）；此後幀進 lockstep。
    const transport = new FfaSpokeTransport(ch);
    // 回放 ffa-init 之後、接管之前暫存的對手幀（保序）。
    for (const raw of earlyFrames) ch.onmessage?.(raw);
    const handle = runFfaGame({
      canvas: opts.canvas,
      playerIds: init.playerIds,
      localId: opts.identity.id,
      seed,
      matchId,
      transport,
      signMessage: opts.identity.ranked ? opts.identity.signMessage : undefined,
      // Stage B：host 離線 → 用同一 room 的 mig{g}- 槽位遷移續行（真實 RTC 工廠為預設）。
      migration: { signal, room: opts.room },
    });
    opts.onHandle?.(handle);
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}
