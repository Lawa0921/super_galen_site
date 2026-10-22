// loopback.ts — 決定性的記憶體內網路：虛擬時鐘、延遲、丟包、亂序，供測試與離線對戰用。
// 不用 Date.now / performance.now / Math.random；亂數一律走 Rng(seed)。
import { Rng } from '../engine/rng';
import type { Channel, NetLink, Payload } from './link';

export interface LoopbackOptions {
  /** 預設 'loopback' */
  seed?: string;
  /** 單程延遲均勻分布，預設 [0, 0] */
  latencyMs?: [number, number];
  /** 0..1：state 丟包率；ctrl / bulk 以同機率多等 retransmitMs（可靠通道不丟） */
  loss?: number;
  /** 預設 200 */
  retransmitMs?: number;
  /** state 每則各自抽延遲（會亂序）；預設 true。ctrl / bulk 永遠有序 */
  reorder?: boolean;
}

type Side = 0 | 1; // 0 = host，1 = guest

interface Pair {
  id: number;
  closed: boolean;
  ends: [End, End];
  /** 每個「方向 + 通道」上一則的 deliverAt（可靠有序用） */
  last: Map<string, number>;
}

interface Msg {
  at: number;
  seq: number;
  pair: Pair;
  to: Side;
  ch: Channel;
  data: Payload;
  size: number;
}

const sizeOf = (d: Payload): number => (typeof d === 'string' ? d.length : d.length);

class End implements NetLink {
  open = true;
  msgCbs: Array<(ch: Channel, d: Payload) => void> = [];
  closeCbs: Array<(reason: string) => void> = [];
  buf: Record<Channel, number> = { ctrl: 0, bulk: 0, state: 0 };
  constructor(private net: LoopbackNet, readonly pair: Pair, readonly side: Side) {}
  send(ch: Channel, data: Payload): void {
    if (!this.open) return;
    this.net._send(this, ch, data);
  }
  onMessage(cb: (ch: Channel, d: Payload) => void): void { this.msgCbs.push(cb); }
  onClose(cb: (reason: string) => void): void { this.closeCbs.push(cb); }
  close(reason = 'closed'): void { this.net._close(this.pair, reason, false); }
  buffered(ch: Channel): number { return this.buf[ch]; }
}

export class LoopbackNet {
  private clock = 0;
  private rng: Rng;
  private lat: [number, number];
  private loss: number;
  private retransmitMs: number;
  private reorder: boolean;
  private queue: Msg[] = [];
  private seqNo = 0;
  private pairNo = 0;
  private st = { sent: 0, dropped: 0, delivered: 0 };

  constructor(opts: LoopbackOptions = {}) {
    this.rng = new Rng(opts.seed ?? 'loopback');
    this.lat = opts.latencyMs ?? [0, 0];
    this.loss = opts.loss ?? 0;
    this.retransmitMs = opts.retransmitMs ?? 200;
    this.reorder = opts.reorder ?? true;
  }

  /** 虛擬時鐘（ms） */
  get now(): number { return this.clock; }

  pair(): { host: NetLink; guest: NetLink } {
    const p: Pair = { id: this.pairNo++, closed: false, ends: [null as unknown as End, null as unknown as End], last: new Map() };
    p.ends = [new End(this, p, 0), new End(this, p, 1)];
    return { host: p.ends[0], guest: p.ends[1] };
  }

  /** 時鐘前進並送達到期訊息（送達時間升冪；同時間依送出順序） */
  advance(ms: number): void {
    const target = this.clock + ms;
    while (this.queue.length > 0 && this.queue[0].at <= target) this.deliverHead();
    this.clock = target;
  }

  /** 送達全部在途訊息，時鐘跳到最後一筆 */
  flush(): void {
    while (this.queue.length > 0) this.deliverHead();
  }

  /** 斷網：在途全丟，兩端 onClose */
  sever(link: NetLink, reason = 'severed'): void {
    this._close((link as End).pair, reason, true);
  }

  stats(): { sent: number; dropped: number; delivered: number } {
    return { ...this.st };
  }

  private deliverHead(): void {
    const m = this.queue.shift()!;
    if (m.at > this.clock) this.clock = m.at;
    const to = m.pair.ends[m.to];
    const from = m.pair.ends[m.to === 0 ? 1 : 0];
    from.buf[m.ch] -= m.size;
    if (!to.open) { this.st.dropped++; return; }
    this.st.delivered++;
    for (const cb of to.msgCbs.slice()) cb(m.ch, m.data);
  }

  /** @internal */
  _send(from: End, ch: Channel, data: Payload): void {
    this.st.sent++;
    const copy = typeof data === 'string' ? data : data.slice();
    const [lo, hi] = this.lat;
    const delay = lo + this.rng.next() * (hi - lo);
    const lost = this.loss > 0 && this.rng.next() < this.loss;
    if (ch === 'state' && lost) { this.st.dropped++; return; }
    let at = this.clock + delay + (ch !== 'state' && lost ? this.retransmitMs : 0);
    const to: Side = from.side === 0 ? 1 : 0;
    if (ch !== 'state' || !this.reorder) {
      const key = `${from.side}:${ch}`;
      at = Math.max(from.pair.last.get(key) ?? 0, at);
      from.pair.last.set(key, at);
    }
    const size = sizeOf(copy);
    from.buf[ch] += size;
    const msg: Msg = { at, seq: this.seqNo++, pair: from.pair, to, ch, data: copy, size };
    // 依 (at, seq) 排序插入；seq 遞增，所以插在最後一個 at <= 自己的後面
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].at > at) i--;
    this.queue.splice(i, 0, msg);
  }

  /** @internal */
  _close(pair: Pair, reason: string, _sever: boolean): void {
    if (pair.closed) return;
    pair.closed = true;
    const keep: Msg[] = [];
    for (const m of this.queue) {
      if (m.pair === pair) {
        pair.ends[m.to === 0 ? 1 : 0].buf[m.ch] -= m.size;
        this.st.dropped++;
      } else keep.push(m);
    }
    this.queue = keep;
    for (const e of pair.ends) e.open = false;
    for (const e of pair.ends) for (const cb of e.closeCbs.slice()) cb(reason);
  }
}
