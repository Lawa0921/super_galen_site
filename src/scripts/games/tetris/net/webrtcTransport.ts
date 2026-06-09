import type { Transport } from './transport';

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

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

  private waitIceComplete(): Promise<void> {
    if (this.pc.iceGatheringState === 'complete') return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', done);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', done);
      // 安全逾時（部分網路 gathering 不會「complete」）
      setTimeout(() => {
        this.pc.removeEventListener('icegatheringstatechange', done);
        resolve();
      }, 4000);
    });
  }

  /** Host：建立 datachannel 並產生含候選的 offer。 */
  async createOffer(): Promise<string> {
    this.dc = this.pc.createDataChannel('game', { ordered: true });
    this.wire(this.dc);
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this.waitIceComplete();
    return JSON.stringify(this.pc.localDescription);
  }

  /** Guest：吃下 offer 並產生含候選的 answer。 */
  async createAnswer(offerStr: string): Promise<string> {
    await this.pc.setRemoteDescription(JSON.parse(offerStr) as RTCSessionDescriptionInit);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this.waitIceComplete();
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
