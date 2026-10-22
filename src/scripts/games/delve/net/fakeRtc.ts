// fakeRtc.ts — 信令測試用的假信令與假 peer（同 testRig.ts 性質，不碰真 WebRTC）。
import type { NetLink } from './link';
import type { LoopbackNet } from './loopback';
import type { RtcPeer } from './rtcLink';
import type { Ticker } from './loop';
import type { SignalApi } from './rtcSignal';

const FAKE_ROOMS = ['ABCDE', 'FGHJK', 'MNPQR', 'STUVW', 'XYZ23'];

export class FakeSignal implements SignalApi {
  readonly store = new Map<string, string>();
  readonly calls = { createRoom: 0, put: 0, get: 0 };

  async createRoom(): Promise<string> {
    return FAKE_ROOMS[this.calls.createRoom++ % FAKE_ROOMS.length];
  }
  async put(room: string, slot: string, data: string): Promise<void> {
    this.calls.put++;
    this.store.set(`${room}:${slot}`, data);
  }
  async get(room: string, slot: string): Promise<string | null> {
    this.calls.get++;
    return this.store.get(`${room}:${slot}`) ?? null;
  }
}

/** offer 帶 token；answer 端用 token 配到同一個 net.pair()，offer 端拿 guest 端、answer 端拿 host 端 */
export function fakePeerFactory(net: LoopbackNet): () => RtcPeer {
  const pairs = new Map<string, { host: NetLink; guest: NetLink }>();
  let seq = 0;
  return () => {
    let link: NetLink | null = null;
    return {
      get link(): NetLink {
        if (!link) throw new Error('fake peer: link not ready');
        return link;
      },
      async createOffer() {
        const token = `fake-offer-${seq++}`;
        const p = net.pair();
        pairs.set(token, p);
        link = p.guest;
        return token;
      },
      async createAnswer(offer: string) {
        const p = pairs.get(offer);
        if (!p) throw new Error('fake peer: unknown offer');
        link = p.host;
        return `fake-answer:${offer}`;
      },
      async acceptAnswer() { /* 已在 createOffer 配好 */ },
      async waitOpen() { /* 立即 open */ },
    };
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
