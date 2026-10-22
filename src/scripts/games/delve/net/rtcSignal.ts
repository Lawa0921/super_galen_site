// rtcSignal.ts — 房號信令：客人先出 offer 寫進槽位，房主輪詢接起來回 answer（客人發起的星狀）。
// 走站內既有 /api/signal 槽位 API（tetris signalClient），用 DELVE_NS 與其他遊戲房號隔離。
import type { NetLink } from './link';
import type { RtcPeer } from './rtcLink';
import { createRoom, getSlot, putSlot, type Slot } from '../../tetris/net/signalClient';
import { newId } from '../save/character';

export const DELVE_NS = 'delve:';
export const JOIN_SLOTS = 4;            // 用 guest-0..3-offer / host-ack-0..3
export const HOST_POLL_MS = 3000;
export const JOIN_IDLE_MS = 600_000;    // 開放加入後 10 分鐘沒有新客人 → 自動停止加入（R7）
export const ACK_POLL_MS = 1200;
export const ACK_TIMEOUT_MS = 30_000;
export const ROOM_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{5}$/;

export interface SignalApi {
  createRoom(): Promise<string>;
  put(room: string, slot: string, data: string): Promise<void>;
  get(room: string, slot: string): Promise<string | null>;
}

export const realSignalApi: SignalApi = {
  createRoom: () => createRoom(),
  put: (room, slot, data) => putSlot(room, slot as Slot, data, DELVE_NS),
  get: (room, slot) => getSlot(room, slot as Slot, DELVE_NS),
};

export function normalizeRoom(raw: string): string | null {
  const r = raw.trim().toUpperCase();
  return ROOM_RE.test(r) ? r : null;
}

export type JoinErrorCode = 'full' | 'noHost' | 'rtc' | 'badRoom';
export const JOIN_ERROR_TEXT: Record<JoinErrorCode, string> = {
  full: '房間已滿',
  noHost: '找不到這個房號，或主機沒有開放加入',
  rtc: '連線失敗，可能是網路環境不支援直連（NAT）',
  badRoom: '房號是 5 個英數字',
};

export class JoinError extends Error {
  constructor(readonly code: JoinErrorCode) {
    super(JOIN_ERROR_TEXT[code]);
    this.name = 'JoinError';
  }
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
  private running = false;
  private seen = new Set<string>();
  private pending = new Set<RtcPeer>();

  constructor(
    private readonly api: SignalApi,
    private readonly makePeer: () => RtcPeer,
    private readonly onLink: (link: NetLink) => void,
  ) {}

  get room(): string | null { return this.roomCode; }
  get joining(): boolean { return this.isJoining; }

  async open(nowMs: number, room?: string): Promise<string> {
    const code = room ?? (await this.api.createRoom());
    this.roomCode = code;
    this.isJoining = true;
    this.lastJoinAt = nowMs;
    this.lastPollAt = -Infinity;
    return code;
  }

  /** 每幀呼叫；沒到期或上一輪還在跑就什麼都不做 */
  poll(nowMs: number): void {
    if (!this.roomCode) return;
    if (this.isJoining && nowMs - this.lastJoinAt > JOIN_IDLE_MS) this.isJoining = false;
    if (!this.isJoining || this.running) return;
    if (nowMs - this.lastPollAt < HOST_POLL_MS) return;
    this.lastPollAt = nowMs;
    this.running = true;
    void this.pass(this.roomCode, nowMs)
      .catch(() => { /* 下一輪再試 */ })
      .finally(() => { this.running = false; });
  }

  reopen(nowMs: number): void {
    if (!this.roomCode) return;
    this.isJoining = true;
    this.lastJoinAt = nowMs;
    this.lastPollAt = -Infinity;
  }

  close(): void {
    this.roomCode = null;
    this.isJoining = false;
    for (const p of this.pending) { try { p.link.close(); } catch { /* 已關 */ } }
    this.pending.clear();
  }

  // 一輪只負責讀槽與清墓碑；客人的握手不 await，免得慢客人卡住輪詢。
  private async pass(room: string, nowMs: number): Promise<void> {
    const raws = await Promise.all(
      Array.from({ length: JOIN_SLOTS }, (_, i) => this.api.get(room, offerSlot(i)).catch(() => null)),
    );
    for (let i = 0; i < JOIN_SLOTS; i++) {
      const o = parseSlot(raws[i], 'offer');
      if (!o || this.seen.has(o.id)) continue;
      this.seen.add(o.id);
      try { await this.api.put(room, offerSlot(i), ''); } catch { /* 靠 seen 擋重複 */ }
      void this.handleGuest(room, i, o.id, o.v, nowMs);
    }
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

  // 依序找空槽；寫入後讀回確認沒被別的客人同時搶走
  let slot = -1;
  try {
    for (let i = 0; i < JOIN_SLOTS && slot < 0; i++) {
      if (await api.get(room, offerSlot(i))) continue;
      await api.put(room, offerSlot(i), payload);
      if (parseSlot(await api.get(room, offerSlot(i)), 'offer')?.id === id) slot = i;
    }
  } catch { return fail('noHost'); }
  if (slot < 0) return fail('full');

  const start = now();
  let answer: string | null = null;
  for (;;) {
    try {
      const a = parseSlot(await api.get(room, ackSlot(slot)), 'answer');
      if (a && a.id === id) { answer = a.v; break; }   // id 不同＝殘留的別人 ack，忽略
    } catch { /* 網路抖動，撐到逾時 */ }
    if (now() - start >= ACK_TIMEOUT_MS) break;
    await sleep(ACK_POLL_MS);
  }
  if (answer === null) {
    try { await api.put(room, offerSlot(slot), ''); } catch { /* 盡力 */ }
    return fail('noHost');
  }

  try {
    await api.put(room, ackSlot(slot), '');
    await peer.acceptAnswer(answer);
    await peer.waitOpen(20000);
  } catch { return fail('rtc'); }
  return peer.link;
}
