import type { Transport } from './transport';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

/**
 * ICE 蒐集等待上限。non-trickle ICE 出 offer/answer 前要等候選蒐集，但部分網路
 * （STUN 被擋、UDP 受限）`icegatheringstatechange` 永遠不會走到 'complete'——
 * 正式站曾因此連線拖到 ~70 秒。host/loopback 候選第一秒就有，2 秒已綽綽有餘；
 * 逾時即用當下已蒐集的候選出 SDP。
 */
export const ICE_GATHER_TIMEOUT_MS = 2000;

/** waitIceGatherComplete 需要的最小 RTCPeerConnection 形狀（測試可傳 mock）。 */
export interface IceGatheringSource {
  readonly iceGatheringState: RTCIceGatheringState | string;
  addEventListener(type: 'icegatheringstatechange', cb: () => void): void;
  removeEventListener(type: 'icegatheringstatechange', cb: () => void): void;
}

/**
 * 等 ICE 蒐集 'complete' 或逾時，先到者勝。1v1（WebRtcTransport 直用）與
 * FFA（ffaNetMain 的 real*PeerFactory 包同一個 transport）共用此 helper。
 */
export function waitIceGatherComplete(
  pc: IceGatheringSource,
  timeoutMs: number = ICE_GATHER_TIMEOUT_MS,
): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', done);
    };
    pc.addEventListener('icegatheringstatechange', done);
  });
}

/**
 * RTCDataChannel 實作的 Transport。採 non-trickle ICE：
 * 等 ICE 候選蒐集完成後才回傳 SDP（候選內嵌於 SDP），signaling 只需交換 offer/answer。
 */
export class WebRtcTransport implements Transport {
  private pc: RTCPeerConnection;
  private dc: RTCDataChannel | null = null;
  private msgCb: ((d: string) => void) | null = null;
  private openCb: (() => void) | null = null;
  private closeCb: (() => void) | null = null;

  constructor() {
    this.pc = new RTCPeerConnection(RTC_CONFIG);
    // Guest 端：對方建立的 datachannel 由此收到
    this.pc.ondatachannel = (e) => {
      this.dc = e.channel;
      this.wire(this.dc);
    };
  }

  private wire(dc: RTCDataChannel): void {
    dc.onmessage = (e) => {
      if (typeof e.data === 'string') this.msgCb?.(e.data);
    };
    dc.onopen = () => this.openCb?.();
    dc.onclose = () => this.closeCb?.();
  }

  /** Host：建立 datachannel 並產生含候選的 offer。 */
  async createOffer(): Promise<string> {
    this.dc = this.pc.createDataChannel('game', { ordered: true });
    this.wire(this.dc);
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIceGatherComplete(this.pc);
    return JSON.stringify(this.pc.localDescription);
  }

  /** Guest：吃下 offer 並產生含候選的 answer。 */
  async createAnswer(offerStr: string): Promise<string> {
    await this.pc.setRemoteDescription(JSON.parse(offerStr) as RTCSessionDescriptionInit);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIceGatherComplete(this.pc);
    return JSON.stringify(this.pc.localDescription);
  }

  /** Host：吃下 answer，完成握手。 */
  async acceptAnswer(answerStr: string): Promise<void> {
    await this.pc.setRemoteDescription(JSON.parse(answerStr) as RTCSessionDescriptionInit);
  }

  /** 等 datachannel 開啟。 */
  waitOpen(timeoutMs = 20000): Promise<void> {
    if (this.dc && this.dc.readyState === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const prev = this.openCb;
      this.openCb = () => {
        prev?.();
        resolve();
      };
      setTimeout(() => reject(new Error('datachannel open timeout')), timeoutMs);
    });
  }

  onClose(cb: () => void): void {
    this.closeCb = cb;
  }

  /** datachannel 是否已開（供 FFA RelayChannel 卡接判斷 open）。 */
  get isOpen(): boolean {
    return this.dc?.readyState === 'open';
  }

  // ---- Transport 介面 ----
  send(data: string): void {
    if (this.dc?.readyState === 'open') this.dc.send(data);
  }
  onMessage(cb: (d: string) => void): void {
    this.msgCb = cb;
  }
  close(): void {
    this.dc?.close();
    this.pc.close();
  }
}
