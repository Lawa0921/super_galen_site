import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitIceGatherComplete, ICE_GATHER_TIMEOUT_MS, WebRtcTransport } from './webrtcTransport';

// ─────────────────────────────────────────────────────────────────────────
// 背景：正式站 1v1 連線曾耗時 ~70 秒。non-trickle ICE 在出 offer/answer 前
// 等 icegatheringstatechange === 'complete'，但部分網路（STUN 被擋/UDP 受限）
// gathering 永遠不會 complete——loopback/host 候選第一秒就有，剩下全在白等。
// 修法：等待「complete 或 ICE_GATHER_TIMEOUT_MS 逾時」先到者勝，
// 逾時即用當下已蒐集的候選出 SDP。
// ─────────────────────────────────────────────────────────────────────────

type GatheringState = 'new' | 'gathering' | 'complete';

/** 最小 mock：只有 waitIceGatherComplete 需要的介面。 */
function makeMockPc(initial: GatheringState = 'new') {
  const listeners = new Map<string, Set<() => void>>();
  return {
    iceGatheringState: initial as GatheringState,
    addEventListener(type: string, cb: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(cb);
    },
    removeEventListener(type: string, cb: () => void) {
      listeners.get(type)?.delete(cb);
    },
    fire(type: string) {
      for (const cb of listeners.get(type) ?? []) cb();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    },
  };
}

/** 探測 promise 是否已 resolve（flush 微任務後查旗標）。 */
async function isResolved(p: Promise<unknown>): Promise<boolean> {
  let resolved = false;
  void p.then(() => { resolved = true; });
  await vi.advanceTimersByTimeAsync(0);
  return resolved;
}

describe('waitIceGatherComplete', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('逾時常數為 2 秒', () => {
    expect(ICE_GATHER_TIMEOUT_MS).toBe(2000);
  });

  it('已 complete 時立即 resolve', async () => {
    const pc = makeMockPc('complete');
    await expect(waitIceGatherComplete(pc)).resolves.toBeUndefined();
  });

  it('gathering 在逾時前 complete → 立即 resolve 並清掉 listener', async () => {
    const pc = makeMockPc('gathering');
    const p = waitIceGatherComplete(pc);
    expect(await isResolved(p)).toBe(false);

    pc.iceGatheringState = 'complete';
    pc.fire('icegatheringstatechange');
    expect(await isResolved(p)).toBe(true);
    expect(pc.listenerCount('icegatheringstatechange')).toBe(0);
  });

  it('gathering 永不 complete → 恰於 2 秒逾時 resolve（不提早、不懸掛）', async () => {
    const pc = makeMockPc('gathering');
    const p = waitIceGatherComplete(pc);

    await vi.advanceTimersByTimeAsync(ICE_GATHER_TIMEOUT_MS - 1);
    expect(await isResolved(p)).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await isResolved(p)).toBe(true);
    expect(pc.listenerCount('icegatheringstatechange')).toBe(0);
  });

  it('state change 事件觸發但尚未 complete（如 new→gathering）→ 不 resolve', async () => {
    const pc = makeMockPc('new');
    const p = waitIceGatherComplete(pc);
    pc.iceGatheringState = 'gathering';
    pc.fire('icegatheringstatechange');
    expect(await isResolved(p)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 整合面：mock 全域 RTCPeerConnection（gathering 永不 complete、但有候選），
// createOffer / createAnswer 必須在 ~2 秒內 resolve，且 SDP 可用。
// ─────────────────────────────────────────────────────────────────────────

class MockDataChannel {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = 'connecting';
  send(): void { /* noop */ }
  close(): void { /* noop */ }
}

class StuckGatheringPC {
  iceGatheringState: GatheringState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ondatachannel: ((e: { channel: MockDataChannel }) => void) | null = null;
  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  private listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, cb: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
  }
  removeEventListener(type: string, cb: () => void): void {
    this.listeners.get(type)?.delete(cb);
  }
  createDataChannel(): MockDataChannel {
    return new MockDataChannel();
  }
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'v=0 mock-offer' };
  }
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'v=0 mock-answer' };
  }
  async setLocalDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = d;
    // 模擬正式站壞網路：候選第一秒就有（host/loopback），但 gathering 永不 complete。
    this.iceGatheringState = 'gathering';
    this.onicecandidate?.({ candidate: { candidate: 'candidate:host 127.0.0.1' } });
  }
  async setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = d;
  }
  close(): void { /* noop */ }
}

describe('WebRtcTransport：gathering 懸掛時 SDP 產出仍須秒級', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('RTCPeerConnection', StuckGatheringPC);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('createOffer 於 2 秒逾時 resolve，回傳可解析的 SDP', async () => {
    const t = new WebRtcTransport();
    const p = t.createOffer();

    // 逾時前不 resolve（仍在等 gathering complete）…
    await vi.advanceTimersByTimeAsync(ICE_GATHER_TIMEOUT_MS - 1);
    expect(await isResolved(p)).toBe(false);
    // …逾時即用當下候選出 SDP。
    await vi.advanceTimersByTimeAsync(1);
    expect(await isResolved(p)).toBe(true);

    const sdp = JSON.parse(await p) as RTCSessionDescriptionInit;
    expect(sdp.type).toBe('offer');
    expect(sdp.sdp).toContain('mock-offer');
  });

  it('createAnswer 於 2 秒逾時 resolve，回傳可解析的 SDP', async () => {
    const t = new WebRtcTransport();
    const offer = JSON.stringify({ type: 'offer', sdp: 'v=0 remote-offer' });
    const p = t.createAnswer(offer);

    await vi.advanceTimersByTimeAsync(ICE_GATHER_TIMEOUT_MS - 1);
    expect(await isResolved(p)).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await isResolved(p)).toBe(true);

    const sdp = JSON.parse(await p) as RTCSessionDescriptionInit;
    expect(sdp.type).toBe('answer');
    expect(sdp.sdp).toContain('mock-answer');
  });

  it('gathering 正常 complete 時不必等滿 2 秒', async () => {
    const t = new WebRtcTransport();
    const p = t.createOffer();
    await vi.advanceTimersByTimeAsync(0); // 讓 setLocalDescription 完成
    const pc = (t as unknown as { pc: StuckGatheringPC }).pc;
    pc.iceGatheringState = 'complete';
    for (const cb of (pc as unknown as { listeners: Map<string, Set<() => void>> }).listeners.get('icegatheringstatechange') ?? []) cb();
    expect(await isResolved(p)).toBe(true);
  });
});
