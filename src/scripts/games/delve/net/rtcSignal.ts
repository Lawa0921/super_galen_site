// rtcSignal.ts — 房號信令：客人先出 offer 寫進槽位，房主輪詢接起來回 answer（客人發起的星狀）。
// 走站內既有 /api/signal 槽位 API（tetris signalClient），用 DELVE_NS 與其他遊戲房號隔離。
import type { NetLink } from './link';
import type { RtcPeer } from './rtcLink';
import { createRoom, getSlot, getSlots, putSlot, type Slot } from '../../tetris/net/signalClient';
import { newId } from '../save/character';

export const DELVE_NS = 'delve:';
export const JOIN_SLOTS = 4;            // 用 guest-0..3-offer / host-ack-0..3
/** 房主掃 offer 槽的基本間隔；有新客人 / reopen / 握手結束就回到它 */
export const HOST_POLL_MS = 3000;
/** 閒置退讓：每一輪沒看到新 offer，間隔 ×1.5 … */
export const HOST_POLL_BACKOFF = 1.5;
/**
 * … 封頂 10 秒（3000 → 4500 → 6750 → 10000）。最壞情況：客人剛好在房主掃完後才寫 offer，
 * 要多等 ≤ 10 秒房主才看到（之後回到 3 秒），再加一輪 ACK_POLL_MS ≈ 11.2 秒；
 * 就算那一輪又卡死被放棄（要等 max(HOST_PASS_TIMEOUT_MS, 間隔) 才重掃）也 ≈ 10 + 10 + 1.2 = 21.2 秒，
 * 都在 ACK_TIMEOUT_MS（30 秒）內，所以 ACK_TIMEOUT_MS 不必調。（退讓前分別是 4.2 / 13.2 秒）
 */
export const HOST_POLL_MAX_MS = 10_000;
export const JOIN_IDLE_MS = 600_000;    // 開放加入後 10 分鐘沒有新客人 → 自動停止加入（R7）
/** 一輪掃描卡住超過這麼久就放棄（防 fetch 永遠不回） */
export const HOST_PASS_TIMEOUT_MS = HOST_POLL_MS * 3;
export const ACK_POLL_MS = 1200;
export const ACK_TIMEOUT_MS = 30_000;
export const ROOM_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/;

export interface SignalApi {
  createRoom(): Promise<string>;
  put(room: string, slot: string, data: string): Promise<void>;
  get(room: string, slot: string): Promise<string | null>;
  /** 一次讀多個槽（回傳順序同 slots）：房主一輪掃描 = 1 個請求 / 1 個 Upstash 指令。沒有就逐槽 get */
  getMany?(room: string, slots: string[]): Promise<(string | null)[]>;
}

export const realSignalApi: SignalApi = {
  createRoom: () => createRoom(),
  put: (room, slot, data) => putSlot(room, slot as Slot, data, DELVE_NS),
  get: (room, slot) => getSlot(room, slot as Slot, DELVE_NS),
  getMany: async (room, slots) => {
    const data = await getSlots(room, slots as Slot[], DELVE_NS);
    return slots.map((s) => data[s] ?? null);
  },
};

export function normalizeRoom(raw: string): string | null {
  const r = raw.trim().toUpperCase();
  return ROOM_RE.test(r) ? r : null;
}

/** service = 信令 API 本身壞了（網路錯誤 / 非 2xx）；noHost = API 通、但沒有房主回應 */
export type JoinErrorCode = 'full' | 'noHost' | 'rtc' | 'badRoom' | 'service';
export const JOIN_ERROR_TEXT: Record<JoinErrorCode, string> = {
  full: '房間已滿',
  noHost: '找不到這個房號，或主機沒有開放加入',
  service: '連線服務暫時無法使用，請稍後再試',
  rtc: '連線失敗，可能是網路環境不支援直連（NAT）',
  badRoom: '房號是 5 個英數字',
};

export class JoinError extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(JOIN_ERROR_TEXT[code]);
    this.name = 'JoinError';
  }
}

/** 房主「開放加入」失敗時給 UI 的文字：JoinError 用對應文案（如 service），其他錯誤帶前綴 */
export function hostOpenErrorText(e: unknown): string {
  if (e instanceof JoinError) return JOIN_ERROR_TEXT[e.code];
  return `開放加入失敗：${e instanceof Error ? e.message : String(e)}`;
}

const offerSlot = (i: number) => `guest-${i}-offer`;
const ackSlot = (i: number) => `host-ack-${i}`;

/** 解析槽位內容；空槽（null / ''）或壞 JSON → null */
function parseSlot(raw: string | null, key: 'offer' | 'answer'): { id: string; v: string } | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const v = o[key];
    if (typeof o.id !== 'string' || typeof v !== 'string') return null;
    return { id: o.id, v };
  } catch {
    return null;
  }
}

export class RoomHost {
  private roomCode: string | null = null;
  private isJoining = false;
  private lastJoinAt = 0;
  private lastPollAt = -Infinity;
  private interval = HOST_POLL_MS;   // 目前的掃描間隔（閒置退讓）
  private down = false;              // 最近一輪讀槽整個失敗（信令服務掛了）
  private running = false;
  private passStartedAt = 0;
  private passGen = 0;   // 被放棄或 close 的舊一輪靠世代號自覺退出
  private seen = new Set<string>();
  private pending = new Set<RtcPeer>();

  constructor(
    private readonly api: SignalApi,
    private readonly makePeer: () => RtcPeer,
    private readonly onLink: (link: NetLink) => void,
  ) {}

  get room(): string | null { return this.roomCode; }
  get joining(): boolean { return this.isJoining; }
  /** 目前的掃描間隔（HOST_POLL_MS 起跳、閒置退讓到 HOST_POLL_MAX_MS） */
  get pollIntervalMs(): number { return this.interval; }
  /** 最近一輪讀 offer 槽整個失敗（API 錯誤）：房號在、但客人進不來，UI 要講實話 */
  get serviceDown(): boolean { return this.down; }

  /** 拿房號失敗（信令 API 掛了 / 網路）→ JoinError('service') */
  async open(nowMs: number, room?: string): Promise<string> {
    let code: string;
    try { code = room ?? (await this.api.createRoom()); } catch (e) {
      throw Object.assign(new JoinError('service'), { cause: e });
    }
    this.roomCode = code;
    this.isJoining = true;
    this.lastJoinAt = nowMs;
    this.lastPollAt = -Infinity;
    this.interval = HOST_POLL_MS;
    this.down = false;
    return code;
  }

  /** 每幀呼叫；沒到期或上一輪還在跑就什麼都不做 */
  poll(nowMs: number): void {
    if (!this.roomCode) return;
    if (this.isJoining && nowMs - this.lastJoinAt > JOIN_IDLE_MS) this.isJoining = false;
    if (!this.isJoining) return;
    if (this.running) {
      if (nowMs - this.passStartedAt < HOST_PASS_TIMEOUT_MS) return;
      this.passGen++;   // 放棄卡住的那一輪（不靠計時器，由 poll 驅動）
    }
    if (nowMs - this.lastPollAt < this.interval) return;
    this.lastPollAt = nowMs;
    this.passStartedAt = nowMs;
    this.running = true;
    const gen = this.passGen;
    void this.pass(this.roomCode, nowMs, gen)
      .catch(() => { /* 下一輪再試 */ })
      .finally(() => { if (gen === this.passGen) this.running = false; });
  }

  reopen(nowMs: number): void {
    if (!this.roomCode) return;
    this.isJoining = true;
    this.lastJoinAt = nowMs;
    this.lastPollAt = -Infinity;
    this.interval = HOST_POLL_MS;
    this.down = false;
  }

  /** 停止加入（不收新客人）：停掉輪詢、放棄進行中的那一輪；房號與已在握手 / 已連上的客人不動，reopen 可再開 */
  stopJoin(): void {
    this.passGen++;
    this.running = false;
    this.isJoining = false;
  }

  close(): void {
    this.passGen++;
    this.running = false;
    this.roomCode = null;
    this.isJoining = false;
    for (const p of this.pending) { try { p.link.close(); } catch { /* 已關 */ } }
    this.pending.clear();
  }

  // 一輪只負責讀槽與清墓碑；客人的握手不 await，免得慢客人卡住輪詢。
  private async pass(room: string, nowMs: number, gen: number): Promise<void> {
    const { raws, ok } = await this.readOffers(room);
    if (gen === this.passGen && this.roomCode === room) this.down = !ok;
    let fresh = false;
    for (let i = 0; i < JOIN_SLOTS; i++) {
      if (gen !== this.passGen || this.roomCode !== room) return;   // 已 close 或被放棄
      const o = parseSlot(raws[i], 'offer');
      if (!o || this.seen.has(o.id)) continue;
      this.seen.add(o.id);
      fresh = true;
      try { await this.api.put(room, offerSlot(i), ''); } catch { /* 靠 seen 擋重複 */ }
      if (this.roomCode !== room) return;   // 已標記 seen 並清槽的客人一定要接；只有 close 才放棄
      void this.handleGuest(room, i, o.id, o.v, nowMs);
    }
    if (gen !== this.passGen || this.roomCode !== room) return;
    // 有新客人 → 回到基本間隔（後面可能還有人）；空的一輪 → 退讓
    this.interval = fresh ? HOST_POLL_MS : Math.min(this.interval * HOST_POLL_BACKOFF, HOST_POLL_MAX_MS);
  }

  /**
   * 讀全部 offer 槽：有 getMany 就一次讀完（失敗 = 整輪空），否則逐槽 get（單槽失敗當空槽）。
   * ok = 至少讀成功一次（false = 信令服務整個掛了）。
   */
  private async readOffers(room: string): Promise<{ raws: (string | null)[]; ok: boolean }> {
    const slots = Array.from({ length: JOIN_SLOTS }, (_, i) => offerSlot(i));
    if (this.api.getMany) {
      try { return { raws: await this.api.getMany(room, slots), ok: true }; } catch { return { raws: slots.map(() => null), ok: false }; }
    }
    let ok = false;
    const raws = await Promise.all(slots.map((s) => this.api.get(room, s).then((v) => { ok = true; return v; }, () => null)));
    return { raws, ok };
  }

  private async handleGuest(room: string, i: number, id: string, offer: string, nowMs: number): Promise<void> {
    let peer: RtcPeer | null = null;
    try {
      peer = this.makePeer();
      this.pending.add(peer);
      const answer = await peer.createAnswer(offer);
      await this.api.put(room, ackSlot(i), JSON.stringify({ id, answer }));
      await peer.waitOpen();
      this.pending.delete(peer);
      if (this.roomCode !== room) { peer.link.close(); return; }
      this.lastJoinAt = Math.max(this.lastJoinAt, nowMs);
      this.onLink(peer.link);
    } catch {
      if (peer) {
        this.pending.delete(peer);
        try { peer.link.close(); } catch { /* 已關 */ }
      }
    }
    if (this.roomCode === room) this.interval = HOST_POLL_MS;   // 握手結束：可能有下一位在等，回到基本間隔
    // 握手結束（成功或失敗）才清 ack：槽位此後可被下一位客人重用。只清自己寫的那份。
    try {
      if (parseSlot(await this.api.get(room, ackSlot(i)), 'answer')?.id === id) await this.api.put(room, ackSlot(i), '');
    } catch { /* 盡力 */ }
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function joinRoom(
  api: SignalApi,
  makePeer: () => RtcPeer,
  rawRoom: string,
  opts: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): Promise<NetLink> {
  const room = normalizeRoom(rawRoom);
  if (!room) throw new JoinError('badRoom');
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? Date.now;

  const id = newId();
  const peer = makePeer();
  const fail = (code: JoinErrorCode): never => {
    try { peer.link.close(); } catch { /* 已關或未就緒 */ }
    throw new JoinError(code);
  };

  let offer: string;
  try { offer = await peer.createOffer(); } catch { return fail('rtc'); }
  const payload = JSON.stringify({ id, offer });

  // 依序找空槽：offer 槽空，且 host-ack 槽也空或壞掉（還有上一位客人的 ack 在用就不能搶）。
  // 寫入後讀回只能縮小兩位客人同時寫同一槽的空窗，沒有伺服器端 CAS 就無法完全消除。
  let slot = -1;
  try {
    for (let i = 0; i < JOIN_SLOTS && slot < 0; i++) {
      if (await api.get(room, offerSlot(i))) continue;
      if (parseSlot(await api.get(room, ackSlot(i)), 'answer')) continue;
      await api.put(room, offerSlot(i), payload);
      if (parseSlot(await api.get(room, offerSlot(i)), 'offer')?.id === id) slot = i;
    }
  } catch { return fail('service'); }   // 掃槽只打信令 API：丟錯 = 服務本身壞了，不是房號錯
  if (slot < 0) return fail('full');

  const start = now();
  let answer: string | null = null;
  let reached = false;   // 等 ack 期間至少讀成功一次（API 通）
  for (;;) {
    try {
      const a = parseSlot(await api.get(room, ackSlot(slot)), 'answer');
      reached = true;
      if (a && a.id === id) { answer = a.v; break; }   // id 不同＝殘留的別人 ack，忽略
    } catch { /* 網路抖動，撐到逾時 */ }
    if (now() - start >= ACK_TIMEOUT_MS) break;
    await sleep(ACK_POLL_MS);
  }
  if (answer === null) {
    // 只清自己的 offer（槽位可能已被別人占走）
    try {
      if (parseSlot(await api.get(room, offerSlot(slot)), 'offer')?.id === id) await api.put(room, offerSlot(slot), '');
    } catch { /* 盡力 */ }
    return fail(reached ? 'noHost' : 'service');   // 每一次都讀失敗 = 服務壞了，不能怪房號
  }

  // 清 ack 純屬盡力：失敗不能讓好好的握手變成 NAT 錯誤；只清仍屬於自己的那份
  try {
    if (parseSlot(await api.get(room, ackSlot(slot)), 'answer')?.id === id) await api.put(room, ackSlot(slot), '');
  } catch { /* 盡力 */ }
  try {
    await peer.acceptAnswer(answer);
    await peer.waitOpen(20000);
  } catch { return fail('rtc'); }
  return peer.link;
}
