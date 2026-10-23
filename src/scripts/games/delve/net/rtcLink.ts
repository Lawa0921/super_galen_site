// rtcLink.ts — NetLink 的 WebRTC 實作：三條 negotiated DataChannel（ctrl / bulk / state）。
// 非 trickle ICE：offer/answer 流程同 tetris WebRtcTransport，signaling 只需交換兩段 SDP。
import type { Channel, NetLink, Payload } from './link';
import { RTC_CONFIG, waitIceGatherComplete } from '../../tetris/net/webrtcTransport';

export const CHANNEL_IDS = { ctrl: 0, bulk: 1, state: 2 } as const;
/** 可靠通道單片 payload 上限（另加 1 byte flags）。 */
export const FRAG_BYTES = 16 * 1024;
/** state 單則上限，超過靜默丟掉（不可靠通道不分片）。 */
export const STATE_MAX_BYTES = 16 * 1024;
/** 可靠通道重組後單則上限；還沒等到 FINAL 就超過 → 整條 link 以 failed 關掉（不讓對端塞爆記憶體）。 */
export const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

const FLAG_FINAL = 1;
const FLAG_TEXT = 2;
const CHANNELS: Channel[] = ['ctrl', 'bulk', 'state'];

export interface RtcPeer {
  readonly link: NetLink;
  createOffer(): Promise<string>;
  createAnswer(offer: string): Promise<string>;
  acceptAnswer(answer: string): Promise<void>;
  /** 三條都 open 才 resolve；逾時 reject 'rtc open timeout' */
  waitOpen(timeoutMs?: number): Promise<void>;
}

export function createRtcPeer(makePc?: () => RTCPeerConnection): RtcPeer {
  const pc = makePc ? makePc() : new RTCPeerConnection(RTC_CONFIG);
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const dcs = {} as Record<Channel, RTCDataChannel>;
  const msgCbs: Array<(ch: Channel, d: Payload) => void> = [];
  const closeCbs: Array<(reason: string) => void> = [];
  const openWaiters = new Set<() => void>();
  let closed = false;

  const allOpen = () => CHANNELS.every((c) => dcs[c].readyState === 'open');

  // 收尾：所有 channel 與 pc 一律關掉（冪等；任何關閉路徑都會走到，避免漏 pc）。
  let tornDown = false;
  function teardown(): void {
    if (tornDown) return;
    tornDown = true;
    for (const c of CHANNELS) { try { dcs[c].close(); } catch { /* 已關 */ } }
    try { pc.close(); } catch { /* 已關 */ }
  }

  // 回呼只觸發一次；單一 callback 丟錯不影響其餘與收尾。
  function fireClose(reason: string): void {
    if (closed) return;
    closed = true;
    for (const w of [...openWaiters]) { try { w(); } catch { /* ignore */ } }
    for (const cb of closeCbs) { try { cb(reason); } catch { /* ignore */ } }
    teardown();
  }

  // 可靠通道重組：同通道有序，片段依序累積到 FINAL；累積量超過 MAX_MESSAGE_BYTES → 關掉 link。
  function onFrame(ch: Channel, buf: Uint8Array, acc: { parts: Uint8Array[]; bytes: number }): void {
    if (buf.byteLength < 1) return;
    const flags = buf[0];
    acc.parts.push(buf.subarray(1));
    acc.bytes += buf.byteLength - 1;
    if (acc.bytes > MAX_MESSAGE_BYTES) {
      acc.parts.length = 0;
      acc.bytes = 0;
      fireClose('failed');
      return;
    }
    if (!(flags & FLAG_FINAL)) return;
    const out = new Uint8Array(acc.bytes);
    let off = 0;
    for (const p of acc.parts) { out.set(p, off); off += p.byteLength; }
    acc.parts.length = 0;
    acc.bytes = 0;
    const data: Payload = flags & FLAG_TEXT ? dec.decode(out) : out;
    for (const cb of msgCbs) cb(ch, data);
  }

  for (const ch of CHANNELS) {
    const dc = pc.createDataChannel(ch, ch === 'state'
      ? { negotiated: true, id: CHANNEL_IDS[ch], ordered: false, maxRetransmits: 0 }
      : { negotiated: true, id: CHANNEL_IDS[ch], ordered: true });
    dc.binaryType = 'arraybuffer';
    dcs[ch] = dc;
    const acc = { parts: [] as Uint8Array[], bytes: 0 };
    dc.onmessage = (e) => {
      if (closed) return;
      if (ch === 'state') {
        if (typeof e.data === 'string') for (const cb of msgCbs) cb(ch, e.data);
        return;
      }
      if (e.data instanceof ArrayBuffer) onFrame(ch, new Uint8Array(e.data), acc);
      else if (ArrayBuffer.isView(e.data)) onFrame(ch, new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), acc);
    };
    dc.onopen = () => { if (allOpen()) for (const w of [...openWaiters]) w(); };
    dc.onclose = () => fireClose('closed');
    dc.onerror = () => fireClose('closed');
  }

  // 'disconnected' 可能自己恢復，不算關閉。
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') fireClose('failed');
    else if (pc.connectionState === 'closed') fireClose('closed');
  };

  const link: NetLink = {
    get open() { return !closed && allOpen(); },
    send(ch, data) {
      if (closed) return;
      const dc = dcs[ch];
      if (dc.readyState !== 'open') return;
      if (ch === 'state') {
        if (typeof data !== 'string' || data.length > STATE_MAX_BYTES) return;
        if (enc.encode(data).byteLength > STATE_MAX_BYTES) return;
        try { dc.send(data); } catch { /* 不可靠通道：丟包即可 */ }
        return;
      }
      try {
        const text = typeof data === 'string';
        const bytes = text ? enc.encode(data) : data;
        let off = 0;
        do {
          const end = Math.min(off + FRAG_BYTES, bytes.byteLength);
          const final = end >= bytes.byteLength;
          const frame = new Uint8Array(1 + end - off);
          frame[0] = (final ? FLAG_FINAL : 0) | (text ? FLAG_TEXT : 0);
          frame.set(bytes.subarray(off, end), 1);
          dc.send(frame);
          off = end;
        } while (off < bytes.byteLength);
      } catch {
        // 可靠通道送不出去（佇列滿／正在關閉）：不能靜默丟訊息或留下半截片段，整條 link 關掉
        fireClose('failed');
      }
    },
    onMessage(cb) { msgCbs.push(cb); },
    onClose(cb) { closeCbs.push(cb); },
    close(reason = 'closed') {
      fireClose(reason);
      teardown(); // 對端先關時 fireClose 已 no-op，這裡仍確保 pc 被關
    },
    buffered(ch) { return dcs[ch].bufferedAmount; },
  };

  return {
    link,
    async createOffer() {
      await pc.setLocalDescription(await pc.createOffer());
      await waitIceGatherComplete(pc);
      return JSON.stringify(pc.localDescription);
    },
    async createAnswer(offer) {
      await pc.setRemoteDescription(JSON.parse(offer) as RTCSessionDescriptionInit);
      await pc.setLocalDescription(await pc.createAnswer());
      await waitIceGatherComplete(pc);
      return JSON.stringify(pc.localDescription);
    },
    async acceptAnswer(answer) {
      await pc.setRemoteDescription(JSON.parse(answer) as RTCSessionDescriptionInit);
    },
    waitOpen(timeoutMs = 20000) {
      if (closed) return Promise.reject(new Error('rtc closed'));
      if (allOpen()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          openWaiters.delete(finish);
          if (closed) reject(new Error('rtc closed'));
          else resolve();
        };
        const timer = setTimeout(() => {
          openWaiters.delete(finish);
          reject(new Error('rtc open timeout'));
        }, timeoutMs);
        openWaiters.add(finish);
      });
    },
  };
}
