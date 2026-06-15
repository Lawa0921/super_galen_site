import type { CharacterId } from '../engine/types';
import {
  createRoom as realCreateRoom,
  putSlot as realPutSlot,
  getSlot as realGetSlot,
  pollSlot as realPollSlot,
} from '../../tetris/net/signalClient';
import { WebRtcTransport } from '../../tetris/net/webrtcTransport';
import {
  BomberHubTransport,
  BomberSpokeTransport,
  type RelayChannel,
} from './bomberTransport';

/**
 * Bomber room-code 連線編排（copy-adapt 自 tetris/net/ffaNetMain.ts 的 room-code 路徑）。
 *
 * 拓樸：星狀（host 為 hub，guest 為 spoke），guest-initiated 握手——
 *   guest：createOffer → claim 最低空 guest-{idx}-offer（夾帶自己的 character）→
 *          等 host-ack-{idx}(=answer) → acceptAnswer → waitOpen → 透過 data channel 收 bomber-init。
 *   host ：輪詢 guest-{0..maxGuests-1}-offer → createAnswer → 寫 host-ack-{idx} → waitOpen
 *          → 收齊（或房主按開始）後組裝 playerIds + characters，透過各 channel 廣播 bomber-init。
 *
 * 與 ffaNetMain 的主要差異：
 *  1. bomber-init 多帶 `arenaId` 與「每人 character」（players:[{id,character}]）——
 *     bomber 的 VersusMatch 需要每位玩家的角色與場地，且兩者皆 host 單一來源、廣播給全員（決定性）。
 *  2. 所有 signalClient 呼叫帶 `bomber:` namespace（房號不與 tetris 相撞）。
 *  3. 控制前綴 `bomber-`（與 bomberTransport 一致）。
 *  4. 不在此跑 Pixi 主迴圈——而是回傳「ready-to-run」結果（transport + roster + seed + arenaId
 *     + characters + localId + guestIds），由 Task 11b 自行建構並擁有 BomberLockstep。
 *
 * 刻意排除（v1 out of scope，未從 ffa 移植）：
 *  - 快速配對 / 隊列（queueClient）。
 *  - Host migration（ffaMigration）。本版策略：斷線者即視為死亡——由 game-loop 層處理
 *    （BomberLockstep 已對已淘汰玩家自動補空輸入；transport 的 `bomber-leave` / channel close
 *     會觸發 onChannelClose / onClose，game 層據此把該玩家標記淘汰）。
 *    下方「MIGRATION SEAM」註解標出未來若要做 host 遷移的接點。
 */

// ─────────────────────────────────────────────────────────────────────────
// 常數 / 工具
// ─────────────────────────────────────────────────────────────────────────

/** signalClient namespace 前綴：bomber 房號加此前綴，與 tetris 房號隔離（不相撞）。 */
export const BOMBER_NS = 'bomber:';

// 控制/init 訊息前綴沿用 bomberTransport 的 'bomber-'（buildBomberInit 的 t 即 'bomber-init'，
// 故會被 BomberHub/Spoke 的 parseControl 視為控制訊息而非幀；解析時改走 onControl 路徑）。

const HANDSHAKE_TIMEOUT_MS = 30_000;
/** lobby 等待房主開始可較久（房主可慢慢等人）。 */
const LOBBY_DEADLINE_MS = HANDSHAKE_TIMEOUT_MS * 4;

/** bomber 對戰人數：2-4 人 → host 之外最多 3 名 guest。 */
const MAX_GUEST_SLOTS = 3;

/** 為 Promise 加上逾時，避免對手在連線後崩潰導致永久卡住（沿用 ffaNetMain.withTimeout）。 */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 依賴注入：signal client + RTC peer 抽象（測試傳 mock，預設真實 signalClient / WebRTC）
// ─────────────────────────────────────────────────────────────────────────

/** 與 /api/signal 互動的最小客戶端（可注入 mock 測握手序列；真實環境包 bomber: ns）。 */
export interface BomberSignalClient {
  createRoom(): Promise<string>;
  putSlot(room: string, slot: string, data: string): Promise<void>;
  getSlot(room: string, slot: string): Promise<string | null>;
  pollSlot(room: string, slot: string, opts?: { timeoutMs?: number; intervalMs?: number }): Promise<string>;
}

/**
 * 預設真實 signal client：對每個呼叫帶入 `bomber:` namespace（房號不與 tetris 相撞）。
 * 顯示給使用者的房號仍是 createRoom() 回傳的乾淨 5 碼；前綴只作用在 store key 層。
 */
export const realSignalClient: BomberSignalClient = {
  createRoom: realCreateRoom,
  putSlot: (room, slot, data) => realPutSlot(room, slot, data, BOMBER_NS),
  getSlot: (room, slot) => realGetSlot(room, slot, BOMBER_NS),
  pollSlot: (room, slot, opts) => realPollSlot(room, slot, opts ?? {}, BOMBER_NS),
};

/** Host 端對某 guest 的 RTC peer（guest-initiated：host 收 offer 回 answer）。 */
export interface BomberHostAnswerPeer {
  createAnswer(offer: string): Promise<string>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

/** Guest 端對 host 的 RTC peer（guest-initiated：guest 建 offer 收 answer）。 */
export interface BomberGuestOfferPeer {
  createOffer(): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  waitOpen(): Promise<void>;
  channel: RelayChannel & { onmessage?: ((raw: string) => void) | null };
}

// ─────────────────────────────────────────────────────────────────────────
// bomber-init 訊息（host 廣播給各 guest：seed + arenaId + 最終 players(id+character) + yourIndex）
// ─────────────────────────────────────────────────────────────────────────

export interface BomberInitMsg {
  t: 'bomber-init';
  seed: number;
  arenaId: number;
  /** host 在前、guest 依 slot index 升序。index 即 BomberLockstep playerIds 的順序。 */
  players: Array<{ id: string; character: CharacterId }>;
  yourIndex: number;
}

/** 把 bomber-init 內容序列化為字串（透過 data channel 廣播）。 */
export function buildBomberInit(opts: {
  seed: number;
  arenaId: number;
  players: Array<{ id: string; character: CharacterId }>;
  yourIndex: number;
}): string {
  const msg: BomberInitMsg = {
    t: 'bomber-init',
    seed: opts.seed,
    arenaId: opts.arenaId,
    players: opts.players.map((p) => ({ id: p.id, character: p.character })),
    yourIndex: opts.yourIndex,
  };
  return JSON.stringify(msg);
}

/** 解析 bomber-init；JSON 容錯 + shape 驗證，畸形回 null（不丟例外）。 */
export function parseBomberInit(raw: string): BomberInitMsg | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== 'object') return null;
  const o = m as Record<string, unknown>;
  if (o.t !== 'bomber-init') return null;
  if (typeof o.seed !== 'number' || !Number.isFinite(o.seed)) return null;
  if (typeof o.arenaId !== 'number' || !Number.isFinite(o.arenaId)) return null;
  if (typeof o.yourIndex !== 'number' || !Number.isFinite(o.yourIndex)) return null;
  if (!Array.isArray(o.players)) return null;
  const players: Array<{ id: string; character: CharacterId }> = [];
  for (const p of o.players) {
    if (!p || typeof p !== 'object') return null;
    const pp = p as Record<string, unknown>;
    if (typeof pp.id !== 'string') return null;
    if (typeof pp.character !== 'string') return null;
    players.push({ id: pp.id, character: pp.character as CharacterId });
  }
  return { t: 'bomber-init', seed: o.seed, arenaId: o.arenaId, players, yourIndex: o.yourIndex };
}

/** guest 寫進 guest-{idx}-offer 的內容：自己的 id + RTC offer + 選擇的 character。 */
interface GuestOfferMsg { id: string; offer: string; character?: CharacterId }

function parseGuestOffer(raw: string): GuestOfferMsg | null {
  try {
    const m = JSON.parse(raw) as Record<string, unknown>;
    if (typeof m.id === 'string' && typeof m.offer === 'string') {
      const character = typeof m.character === 'string' ? (m.character as CharacterId) : undefined;
      return { id: m.id, offer: m.offer, character };
    }
  } catch { /* ignore */ }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// 握手協調（可測：不依賴真實 WebRTC / DOM）
// ─────────────────────────────────────────────────────────────────────────

/**
 * Guest 認領最低未占用的 guest-{idx}-offer 槽位（寫入自己的 id+offer+character）。
 *
 * 已知限制（誠實揭露，沿用 ffaNetMain.claimGuestSlot）：claim 為「讀-改-寫」非原子操作，
 * 兩名 guest 幾乎同時 claim 同一空槽時可能 race（後者覆蓋前者）。e2e 以「依序加入」規避；
 * 生產環境可接受小機率重連。回傳認領到的 slot index。
 */
export async function claimBomberGuestSlot(
  signal: BomberSignalClient,
  room: string,
  guestId: string,
  offer: string,
  maxGuests: number,
  character?: CharacterId,
): Promise<number> {
  const slots = Math.min(Math.max(maxGuests, 1), MAX_GUEST_SLOTS);
  for (let idx = 0; idx < slots; idx++) {
    const existing = await signal.getSlot(room, `guest-${idx}-offer`);
    if (existing) continue; // 已被占用，試下一個
    const payload: GuestOfferMsg = { id: guestId, offer, character };
    await signal.putSlot(room, `guest-${idx}-offer`, JSON.stringify(payload));
    return idx;
  }
  throw new Error('lobby full: no free guest slot');
}

export interface NegotiateHostResult {
  /** host 在前、連上的 guest 依 slot index 升序。 */
  playerIds: string[];
  /** 每位玩家的角色（playerId → CharacterId）；host 的角色由呼叫端帶入。 */
  characters: Record<string, CharacterId>;
  /** 每位連上 guest 的 host 端 peer（依 playerIds 中該 guest 的順序）。 */
  guestPeers: BomberHostAnswerPeer[];
  room: string;
}

/**
 * Host 牽線（guest-initiated）：輪詢 guest-{i}-offer → 對每個 offer createAnswer 並寫
 * host-ack-{i} → waitOpen → 收齊 expectedGuests（或取消）→ 組裝 playerIds + characters。
 *
 * isCancelled 可選：每輪檢查，外部按「開始」或逾時時提早結束（回已連上的）。
 * onGuest 可選：每連上一名 guest 回呼一次（UI 更新 lobby 人數）。
 * hostCharacter：host 自己的角色（寫進 characters[hostId]）。
 */
export async function negotiateHostBomberGuestInit(opts: {
  hostId: string;
  hostCharacter?: CharacterId;
  maxGuests: number;
  expectedGuests: number;
  room: string;
  signal: BomberSignalClient;
  peerFactory: () => BomberHostAnswerPeer;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
  isCancelled?: () => boolean;
  onGuest?: (connectedCount: number) => void;
}): Promise<NegotiateHostResult> {
  const { hostId, maxGuests, expectedGuests, room, signal, peerFactory } = opts;
  if (expectedGuests < 1) {
    throw new Error('bomber versus requires at least 2 players (host needs >= 1 guest)');
  }
  const slots = Math.min(Math.max(maxGuests, expectedGuests), MAX_GUEST_SLOTS);

  const connected = new Array<{ id: string; peer: BomberHostAnswerPeer; character?: CharacterId } | undefined>(slots);
  let count = 0;
  const timeoutMs = opts.pollOpts?.timeoutMs ?? HANDSHAKE_TIMEOUT_MS;
  const intervalMs = opts.pollOpts?.intervalMs ?? 600;
  const deadline = Date.now() + timeoutMs;

  // 反覆掃所有 slot，發現未處理的 offer 就回 answer 並連線，直到收齊或逾時/取消。
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
      connected[idx] = { id: parsed.id, peer, character: parsed.character };
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
  const characters: Record<string, CharacterId> = {};
  if (opts.hostCharacter) characters[hostId] = opts.hostCharacter;
  const guestPeers: BomberHostAnswerPeer[] = [];
  for (let idx = 0; idx < slots; idx++) {
    const c = connected[idx];
    if (!c) continue;
    playerIds.push(c.id);
    if (c.character) characters[c.id] = c.character;
    guestPeers.push(c.peer);
  }

  return { playerIds, characters, guestPeers, room };
}

export interface NegotiateJoinResult {
  localId: string;
  slotIndex: number;
  peer: BomberGuestOfferPeer;
  room: string;
}

/**
 * Guest 牽線（guest-initiated）：createOffer → claim 最低空 guest-{idx}-offer（夾帶 character）→
 * 等 host-ack-{idx}(=answer) → acceptAnswer → waitOpen。
 * seed/arenaId/players 不在此取得——由 host 開局後透過 data channel 廣播 bomber-init。
 */
export async function negotiateJoinBomberGuestInit(opts: {
  room: string;
  guestId: string;
  character?: CharacterId;
  signal: BomberSignalClient;
  peerFactory: () => BomberGuestOfferPeer;
  maxGuests?: number;
  /** 指定槽位（免並發 claim race）；未給則掃最低空槽。 */
  fixedSlot?: number;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
}): Promise<NegotiateJoinResult> {
  const { room, guestId, signal, peerFactory } = opts;
  const peer = peerFactory();
  const offer = await peer.createOffer();
  let slotIndex: number;
  if (opts.fixedSlot !== undefined) {
    slotIndex = opts.fixedSlot;
    const payload: GuestOfferMsg = { id: guestId, offer, character: opts.character };
    await signal.putSlot(room, `guest-${slotIndex}-offer`, JSON.stringify(payload));
  } else {
    slotIndex = await claimBomberGuestSlot(signal, room, guestId, offer, opts.maxGuests ?? MAX_GUEST_SLOTS, opts.character);
  }

  const answer = await signal.pollSlot(room, `host-ack-${slotIndex}`, opts.pollOpts);
  await peer.acceptAnswer(answer);
  await peer.waitOpen();

  return { localId: guestId, slotIndex, peer, room };
}

// ─────────────────────────────────────────────────────────────────────────
// RelayChannel 卡接：把 WebRtcTransport（send/onMessage/isOpen[/onClose]）包成 RelayChannel
// （沿用 ffaNetMain.wrapChannel：onmessage 設定前到達的訊息進暫存佇列，設定當下回放保序）
// ─────────────────────────────────────────────────────────────────────────

/** WebRtcTransport 對外需要的最小形狀（供 wrapChannel；真實環境傳 WebRtcTransport 實例）。 */
export interface ChannelBacking {
  send(data: string): void;
  onMessage(cb: (data: string) => void): void;
  readonly isOpen: boolean;
  /** 可選：底層 channel 關閉通知（→ 中離 close 快速路徑）。 */
  onClose?(cb: () => void): void;
}

/**
 * 把一個 ChannelBacking（如 WebRtcTransport）包成 RelayChannel：
 *  - send(raw) → backing.send(raw)
 *  - open → backing.isOpen
 *  - onmessage setter → 掛到 backing.onMessage（Hub/Spoke 會設定此 setter）
 *  - onclose 可賦值屬性 → 由 backing.onClose 觸發
 *
 * 鐵則：onmessage 設定前到達的訊息進暫存佇列，設定當下立刻回放（保序）——
 * 避免 channel 開啟與設定 onmessage 之間的空檔丟失早到的 bomber-init / 對手幀。
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
// 真實環境 RTC peer 工廠（包 WebRtcTransport；測試注入 stub 取代）
// ─────────────────────────────────────────────────────────────────────────

/** 真實環境的 host 端 peer 工廠：每 guest 一條 WebRtcTransport，包成 BomberHostAnswerPeer。 */
export function realHostAnswerPeerFactory(): BomberHostAnswerPeer {
  const transport = new WebRtcTransport();
  const channel = wrapChannel(transport);
  return {
    createAnswer: (offer: string) => transport.createAnswer(offer),
    waitOpen: () => transport.waitOpen(),
    channel,
  };
}

/** 真實環境的 guest 端 peer 工廠：一條對 host 的 WebRtcTransport，包成 BomberGuestOfferPeer。 */
export function realGuestOfferPeerFactory(): BomberGuestOfferPeer {
  const transport = new WebRtcTransport();
  const channel = wrapChannel(transport);
  return {
    createOffer: () => transport.createOffer(),
    acceptAnswer: (answer: string) => transport.acceptAnswer(answer),
    waitOpen: () => transport.waitOpen(),
    channel,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 高階入口：hostBomberGame / joinBomberGame
// （回傳「ready-to-run」結果，由 Task 11b 自行建構並擁有 BomberLockstep）
// ─────────────────────────────────────────────────────────────────────────

export interface BomberNetStatus {
  phase: 'creating' | 'lobby' | 'connecting' | 'connected' | 'error';
  room?: string;
  message?: string;
  /** 目前已連上的 guest 數（host lobby 顯示「已加入 / 目標」）。 */
  connected?: number;
}
export type BomberStatusCb = (s: BomberNetStatus) => void;

export interface BomberIdentity {
  id: string;
  character: CharacterId;
}

/**
 * 連線完成、可開跑的結果。Task 11b 用此建構 BomberLockstep：
 *   new BomberLockstep({ playerIds, localId, seed, arenaId, characters, transport })
 * 並接上 transport 的 onChannelClose（host）/ onClose（guest）把斷線玩家標記淘汰。
 */
export interface BomberReady {
  /** 星狀 transport：host 為 BomberHubTransport、guest 為 BomberSpokeTransport。 */
  transport: BomberHubTransport | BomberSpokeTransport;
  /** host 在前、guest 依 slot index 升序。 */
  playerIds: string[];
  /** 每位玩家的角色（playerId → CharacterId）。 */
  characters: Record<string, CharacterId>;
  seed: number;
  arenaId: number;
  localId: string;
  /** host 端：channels[i] ↔ guestIds[i]（playerIds 去掉 host）；guest 端為 undefined。 */
  guestIds?: string[];
  /** 房號（顯示用 / 後續清理）。 */
  room: string;
  /** 本端角色（host 才有 guestIds）。 */
  role: 'host' | 'guest';
}

/**
 * Host（guest-initiated 真實 WebRTC）：
 *  1. 建房（或用指定 room），回報 room（lobby 顯示房號）。
 *  2. 背景接受 guest（輪詢 guest-{i}-offer → answer → waitOpen），每連上一名回報人數。
 *  3. 等 waitStart()（lobby「開始」按鈕）resolve；或滿員（autoStart 不適用 v1，預留）。
 *  4. 組裝 playerIds + characters，透過各 channel 廣播 bomber-init，建 BomberHubTransport。
 *  5. 呼叫 onReady(BomberReady)——不在此跑遊戲迴圈（交給 Task 11b）。
 *
 * peerFactory 預設真實 WebRtcTransport；signal 預設帶 bomber: ns 的 realSignalClient；測試可注入。
 */
export async function hostBomberGame(opts: {
  identity: BomberIdentity;
  arenaId: number;
  /** 開放的 guest 槽位數（1..3 → 2..4 人）。 */
  maxGuests: number;
  /** 對局 seed（host 單一來源；Task 11b 通常從 BomberLobby.buildStartPayload 取得後傳入）。 */
  seed: number;
  /** lobby「開始」訊號：resolve 後 host 停止收人並開局。未傳＝收滿 maxGuests 即開。 */
  waitStart?: () => Promise<void>;
  /** 指定房號；未給則 signal.createRoom()（lobby 顯示此房號）。 */
  room?: string;
  onStatus: BomberStatusCb;
  /** 連線完成回呼：交付 ready-to-run 結果（Task 11b 建 BomberLockstep）。 */
  onReady?: (r: BomberReady) => void;
  peerFactory?: () => BomberHostAnswerPeer;
  signal?: BomberSignalClient;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  const peerFactory = opts.peerFactory ?? realHostAnswerPeerFactory;
  const slots = Math.min(Math.max(opts.maxGuests, 1), MAX_GUEST_SLOTS);
  try {
    opts.onStatus({ phase: 'creating' });
    const room = opts.room ?? (await signal.createRoom());
    opts.onStatus({ phase: 'lobby', room, connected: 0 });

    // 背景持續接受 guest，直到 start 訊號或收滿（未傳 waitStart 則收滿即開）。
    const connected = new Array<{ id: string; peer: BomberHostAnswerPeer; character?: CharacterId } | undefined>(slots);
    let count = 0;
    let started = false;
    if (opts.waitStart) void opts.waitStart().then(() => { started = true; });

    const intervalMs = opts.pollOpts?.intervalMs ?? 500;
    const deadline = Date.now() + (opts.pollOpts?.timeoutMs ?? LOBBY_DEADLINE_MS);
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
        connected[idx] = { id: parsed.id, peer, character: parsed.character };
        count++;
        progressed = true;
        opts.onStatus({ phase: 'lobby', room, connected: count });
        // 未提供 waitStart：收滿 maxGuests 即自動開局。
        if (!opts.waitStart && count >= slots) started = true;
        if (started || count >= slots) break;
      }
      if (started) break;
      if (count >= slots) break;
      if (!progressed) {
        if (intervalMs === 0) break; // 測試模式：不忙等
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }

    if (count < 1) throw new Error('no guests connected');

    // 組裝 playerIds（host 在前、guest 依 slot index 升序）+ characters + channels。
    const playerIds: string[] = [opts.identity.id];
    const characters: Record<string, CharacterId> = { [opts.identity.id]: opts.identity.character };
    const channels: Array<RelayChannel & { onmessage?: ((raw: string) => void) | null }> = [];
    for (let idx = 0; idx < slots; idx++) {
      const c = connected[idx];
      if (!c) continue;
      playerIds.push(c.id);
      // guest 若夾帶 character 用之；否則退回 host identity 的預設（誠實：host 不臆測，但需 fallback）。
      characters[c.id] = c.character ?? opts.identity.character;
      channels.push(c.peer.channel);
    }

    // 透過各 channel 廣播 bomber-init（seed + arenaId + 最終 players(id+character) + 該 guest 的 index）。
    // channels[i] 對應 playerIds[i+1]（host 在 index 0），故 yourIndex = i+1。
    const players = playerIds.map((id) => ({ id, character: characters[id] }));
    for (let i = 0; i < channels.length; i++) {
      channels[i].send(buildBomberInit({ seed: opts.seed, arenaId: opts.arenaId, players, yourIndex: i + 1 }));
    }

    opts.onStatus({ phase: 'connected', room, connected: count });

    const transport = new BomberHubTransport(channels);
    // MIGRATION SEAM：v1 不做 host migration。若日後支援，這裡是「把 transport 包進
    // MigratingTransport facade、並在 host-down 時 swap 內層」的接點（參照 ffaNetMain.runFfaGame）。
    opts.onReady?.({
      transport,
      playerIds,
      characters,
      seed: opts.seed,
      arenaId: opts.arenaId,
      localId: opts.identity.id,
      // channels[i] ↔ playerIds[i+1]（host 在 0）→ guestIds 供 Task 11b 啟動斷線→淘汰偵測。
      guestIds: playerIds.slice(1),
      room,
      role: 'host',
    });
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Guest（guest-initiated 真實 WebRTC）：
 *  1. createOffer → claim guest-{idx}-offer（夾帶 character）→ 等 host-ack-{idx}(=answer)
 *     → acceptAnswer → waitOpen。
 *  2. 透過 data channel 等 host 廣播的 bomber-init（取 seed/arenaId/players/yourIndex）。
 *  3. 建 BomberSpokeTransport → 呼叫 onReady（Task 11b 建 BomberLockstep）。
 */
export async function joinBomberGame(opts: {
  room: string;
  identity: BomberIdentity;
  onStatus: BomberStatusCb;
  onReady?: (r: BomberReady) => void;
  maxGuests?: number;
  /** 指定槽位（免並發 claim race）。 */
  fixedSlot?: number;
  peerFactory?: () => BomberGuestOfferPeer;
  signal?: BomberSignalClient;
  pollOpts?: { timeoutMs?: number; intervalMs?: number };
  /** bomber-init 等待逾時（預設沿用握手逾時）。 */
  initTimeoutMs?: number;
}): Promise<void> {
  const signal = opts.signal ?? realSignalClient;
  const peerFactory = opts.peerFactory ?? realGuestOfferPeerFactory;
  try {
    opts.onStatus({ phase: 'connecting', room: opts.room });
    const result = await negotiateJoinBomberGuestInit({
      room: opts.room,
      guestId: opts.identity.id,
      character: opts.identity.character,
      signal,
      peerFactory,
      maxGuests: opts.maxGuests ?? MAX_GUEST_SLOTS,
      fixedSlot: opts.fixedSlot,
      pollOpts: opts.pollOpts,
    });
    opts.onStatus({ phase: 'lobby', room: opts.room });

    // channel 開後，先攔截 bomber-init（host 開局時第一筆廣播）。
    // bomber-init 之後到達的對手幀先暫存，交給 BomberSpokeTransport 前回放，避免開局丟幀。
    const ch = result.peer.channel;
    const earlyFrames: string[] = [];
    const initRaw = await withTimeout(
      new Promise<string>((resolve) => {
        let gotInit = false;
        ch.onmessage = (raw: string) => {
          if (!gotInit) {
            const init = parseBomberInit(raw);
            if (init) { gotInit = true; resolve(raw); return; }
            return; // bomber-init 前的雜訊忽略（理論上不會有）
          }
          earlyFrames.push(raw); // bomber-init 後、接管前的對手幀先暫存
        };
      }),
      opts.initTimeoutMs ?? HANDSHAKE_TIMEOUT_MS,
      'bomber-init',
    );
    const init = parseBomberInit(initRaw)!;

    const playerIds = init.players.map((p) => p.id);
    const characters: Record<string, CharacterId> = {};
    for (const p of init.players) characters[p.id] = p.character;

    opts.onStatus({ phase: 'connected', room: opts.room });

    // BomberSpokeTransport 建構時會覆寫 ch.onmessage（接管收幀）；此後幀進 lockstep。
    const transport = new BomberSpokeTransport(ch);
    // 回放 bomber-init 之後、接管之前暫存的對手幀（保序）。
    for (const raw of earlyFrames) ch.onmessage?.(raw);

    // MIGRATION SEAM：v1 guest 端不做 host migration。host 斷線 → BomberSpokeTransport.onClose
    // 觸發，由 Task 11b 把對局判為中止（或將 host 標記淘汰）。日後若支援遷移，這裡是
    // 「傳入 migration 依賴（同 room 的 mig{g}- 槽位）」的接點（參照 ffaNetMain.joinFfaGame）。
    opts.onReady?.({
      transport,
      playerIds,
      characters,
      seed: init.seed,
      arenaId: init.arenaId,
      localId: opts.identity.id,
      room: opts.room,
      role: 'guest',
    });
  } catch (e) {
    opts.onStatus({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
  }
}
