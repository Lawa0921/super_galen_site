// rtcLink.test.ts — RtcLink 用 MockPc/MockDc 對接測試（不需真瀏覽器）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createRtcPeer, FRAG_BYTES, STATE_MAX_BYTES, type RtcPeer } from './rtcLink';

class MockDc {
  binaryType = 'blob';
  readyState = 'connecting';
  bufferedAmount = 0;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  peer: MockDc | null = null;
  sent: unknown[] = [];
  constructor(readonly id: number, readonly opts: Record<string, unknown>) {}
  send(d: unknown): void {
    this.sent.push(d);
    const p = this.peer;
    if (!p) return;
    const copy = typeof d === 'string' ? d : (d as Uint8Array).slice().buffer;
    queueMicrotask(() => p.onmessage?.({ data: copy }));
  }
  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }
  close(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    const p = this.peer;
    queueMicrotask(() => { this.onclose?.(); });
    if (p) queueMicrotask(() => p.close());
  }
}

class MockPc {
  connectionState = 'new';
  iceGatheringState = 'complete';
  localDescription: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  dcs = new Map<number, MockDc>();
  createDataChannel(_label: string, opts: { id: number }): MockDc {
    const dc = new MockDc(opts.id, opts);
    this.dcs.set(opts.id, dc);
    return dc;
  }
  async createOffer() { return { type: 'offer', sdp: 'o' }; }
  async createAnswer() { return { type: 'answer', sdp: 'a' }; }
  async setLocalDescription(d: unknown) { this.localDescription = d; }
  async setRemoteDescription() { /* noop */ }
  addEventListener() { /* noop */ }
  removeEventListener() { /* noop */ }
  close(): void {
    this.connectionState = 'closed';
    for (const dc of this.dcs.values()) dc.close();
  }
}

function make(): { peer: RtcPeer; pc: MockPc } {
  let pc!: MockPc;
  const peer = createRtcPeer(() => (pc = new MockPc()) as unknown as RTCPeerConnection);
  return { peer, pc };
}

/** 兩端同 id 的 channel 接起來，並於 microtask 模擬 open。 */
function linkPair(a: MockPc, b: MockPc): void {
  for (const [id, da] of a.dcs) {
    const db = b.dcs.get(id)!;
    da.peer = db;
    db.peer = da;
    queueMicrotask(() => { da.open(); db.open(); });
  }
}

function pair() {
  const A = make();
  const B = make();
  linkPair(A.pc, B.pc);
  return { A, B };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

afterEach(() => { vi.useRealTimers(); });

describe('RtcLink', () => {
  it('以 negotiated 固定 id 開三條 channel，state 不可靠無序', () => {
    const { pc } = make();
    expect(pc.dcs.get(0)!.opts).toMatchObject({ negotiated: true, ordered: true });
    expect(pc.dcs.get(1)!.opts).toMatchObject({ negotiated: true, ordered: true });
    expect(pc.dcs.get(2)!.opts).toMatchObject({ negotiated: true, ordered: false, maxRetransmits: 0 });
    for (const dc of pc.dcs.values()) expect(dc.binaryType).toBe('arraybuffer');
  });

  it('ctrl 100 KB 字串分片後完整收到', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const got: unknown[] = [];
    B.peer.link.onMessage((ch, d) => got.push([ch, d]));
    const s = 'é'.repeat(50 * 1024) + 'x'.repeat(1000); // 多位元組字元，壓過分片邊界
    A.peer.link.send('ctrl', s);
    await flush();
    expect(got).toEqual([['ctrl', s]]);
    const frames = A.pc.dcs.get(0)!.sent as Uint8Array[];
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames) expect(f.byteLength).toBeLessThanOrEqual(FRAG_BYTES + 1);
  });

  it('空 payload 也會送達', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const got: unknown[] = [];
    B.peer.link.onMessage((ch, d) => got.push([ch, d]));
    A.peer.link.send('ctrl', '');
    A.peer.link.send('bulk', new Uint8Array(0));
    await flush();
    expect(got).toEqual([['ctrl', ''], ['bulk', new Uint8Array(0)]]);
  });

  it('bulk 70 KB 位元組逐位元相等', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const bytes = new Uint8Array(70 * 1024);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 255;
    const got: Array<[string, Uint8Array]> = [];
    B.peer.link.onMessage((ch, d) => got.push([ch, d as Uint8Array]));
    A.peer.link.send('bulk', bytes);
    A.peer.link.send('bulk', new Uint8Array([1, 2, 3]));
    await flush();
    expect(got.length).toBe(2);
    expect(got[0][1]).toBeInstanceOf(Uint8Array);
    expect(Array.from(got[0][1])).toEqual(Array.from(bytes));
    expect(Array.from(got[1][1])).toEqual([1, 2, 3]);
  });

  it('state 小訊息直接送；超過 16 KB 丟掉', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const got: unknown[] = [];
    B.peer.link.onMessage((ch, d) => got.push([ch, d]));
    A.peer.link.send('state', '{"a":1}');
    A.peer.link.send('state', 'x'.repeat(STATE_MAX_BYTES + 1));
    await flush();
    expect(got).toEqual([['state', '{"a":1}']]);
    expect(A.pc.dcs.get(2)!.sent).toEqual(['{"a":1}']);
  });

  it('buffered 回傳 bufferedAmount', () => {
    const { A } = pair();
    A.pc.dcs.get(1)!.bufferedAmount = 1234;
    expect(A.peer.link.buffered('bulk')).toBe(1234);
    expect(A.peer.link.buffered('ctrl')).toBe(0);
  });

  it('遠端關閉 → onClose 一次；本地 close 也只一次且帶 reason', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const a: string[] = [];
    const b: string[] = [];
    A.peer.link.onClose((r) => a.push(r));
    B.peer.link.onClose((r) => b.push(r));
    A.peer.link.close('bye');
    await flush();
    expect(a).toEqual(['bye']);
    expect(b).toEqual(['closed']);
    A.peer.link.close('again');
    await flush();
    expect(a).toEqual(['bye']);
    expect(b).toEqual(['closed']);
    expect(A.peer.link.open).toBe(false);
  });

  it('connectionState disconnected 不關；failed 關且 reason=failed', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    const a: string[] = [];
    A.peer.link.onClose((r) => a.push(r));
    A.pc.connectionState = 'disconnected';
    A.pc.onconnectionstatechange?.();
    expect(a).toEqual([]);
    expect(A.peer.link.open).toBe(true);
    A.pc.connectionState = 'failed';
    A.pc.onconnectionstatechange?.();
    expect(a).toEqual(['failed']);
    A.pc.onconnectionstatechange?.();
    expect(a).toEqual(['failed']);
  });

  it('waitOpen 逾時 reject 且不留計時器', async () => {
    vi.useFakeTimers();
    const { peer } = make();
    const p = peer.waitOpen(5000);
    const assertion = expect(p).rejects.toThrow('rtc open timeout');
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waitOpen 成功後不留計時器', async () => {
    vi.useFakeTimers();
    const { A, B } = pair();
    const p = Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('關閉後 send 靜默', async () => {
    const { A, B } = pair();
    await Promise.all([A.peer.waitOpen(), B.peer.waitOpen()]);
    A.peer.link.close();
    const before = A.pc.dcs.get(0)!.sent.length;
    expect(() => A.peer.link.send('ctrl', 'hi')).not.toThrow();
    A.peer.link.send('state', 'x');
    A.peer.link.send('bulk', new Uint8Array(3));
    expect(A.pc.dcs.get(0)!.sent.length).toBe(before);
    expect(A.pc.dcs.get(2)!.sent.length).toBe(0);
  });

  it('offer/answer 回傳 JSON 字串', async () => {
    const { A, B } = pair();
    const offer = await A.peer.createOffer();
    expect(JSON.parse(offer)).toMatchObject({ type: 'offer' });
    const answer = await B.peer.createAnswer(offer);
    expect(JSON.parse(answer)).toMatchObject({ type: 'answer' });
    await A.peer.acceptAnswer(answer);
  });
});
