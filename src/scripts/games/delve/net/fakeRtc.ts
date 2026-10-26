// fakeRtc.ts — 信令測試用的假信令與假 peer（同 testRig.ts 性質，不碰真 WebRTC）。
import type { NetLink } from './link';
import type { LoopbackNet } from './loopback';
import type { RtcPeer } from './rtcLink';
import type { Ticker } from './loop';
import type { SignalApi } from './rtcSignal';

const FAKE_ROOMS = ['ABCDE', 'FGHJK', 'MNPQR', 'STUVW', 'XYZ23'];

export class FakeSignal implements SignalApi {
  readonly store = new Map<string, string>();
  readonly calls = { createRoom: 0, put: 0, get: 0, getMany: 0 };
  /** 非 null 時 get 會卡到它 resolve（模擬卡住的 fetch） */
  hold: Promise<void> | null = null;

  async createRoom(): Promise<string> {
    return FAKE_ROOMS[this.calls.createRoom++ % FAKE_ROOMS.length];
  }
  async put(room: string, slot: string, data: string): Promise<void> {
    this.calls.put++;
    this.store.set(`${room}:${slot}`, data);
  }
  async get(room: string, slot: string): Promise<string | null> {
    this.calls.get++;
    if (this.hold) await this.hold;
    return this.store.get(`${room}:${slot}`) ?? null;
  }
}

/** 有批次讀（getMany）的假信令：對應 realSignalApi 的 GET ?slots= */
export class FakeBatchSignal extends FakeSignal {
  /** 每次 getMany 讀了哪些槽 */
  readonly manySlots: string[][] = [];

  async getMany(room: string, slots: string[]): Promise<(string | null)[]> {
    this.calls.getMany++;
    this.manySlots.push([...slots]);
    if (this.hold) await this.hold;
    return slots.map((s) => this.store.get(`${room}:${s}`) ?? null);
  }
}

/**
 * offer 帶 token；answer 端用 token 配到同一個 net.pair()，offer 端拿 guest 端、answer 端拿 host 端。
 * acceptAnswer 只接受自己 token 對應的 answer；answer 端的 waitOpen 等客人 acceptAnswer 後才 resolve。
 */
export function fakePeerFactory(net: LoopbackNet, onPeer?: (p: RtcPeer) => void): () => RtcPeer {
  interface Sess { host: NetLink; guest: NetLink; accepted: Promise<void>; accept: () => void }
  const sessions = new Map<string, Sess>();
  let seq = 0;
  return () => {
    let link: NetLink | null = null;
    let token = '';
    const peer: RtcPeer = {
      get link(): NetLink {
        if (!link) throw new Error('fake peer: link not ready');
        return link;
      },
      async createOffer() {
        token = `fake-offer-${seq++}`;
        const p = net.pair();
        let accept!: () => void;
        const accepted = new Promise<void>((r) => { accept = r; });
        sessions.set(token, { ...p, accepted, accept });
        link = p.guest;
        return token;
      },
      async createAnswer(offer: string) {
        const s = sessions.get(offer);
        if (!s) throw new Error('fake peer: unknown offer');
        token = offer;
        link = s.host;
        return `fake-answer:${offer}`;
      },
      async acceptAnswer(answer: string) {
        if (answer !== `fake-answer:${token}`) throw new Error('fake peer: wrong answer');
        sessions.get(token)?.accept();
      },
      async waitOpen() {
        // 客人端（createOffer 的一方）立即 open；房主端等客人收下 answer
        const s = sessions.get(token);
        if (s && link === s.host) await s.accepted;
      },
    };
    onPeer?.(peer);
    return peer;
  };
}

export function manualTicker(): Ticker & { fire(nowMs: number): void } {
  let cb: ((nowMs: number) => void) | null = null;
  return {
    start(c) { cb = c; },
    stop() { cb = null; },
    fire(nowMs) { cb?.(nowMs); },
  };
}
