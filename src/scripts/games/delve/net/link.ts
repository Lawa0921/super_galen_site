// link.ts — 連線的一個對等端點（三通道）。
// ctrl：可靠有序（JSON 字串）；bulk：可靠有序（二進位）；state：不可靠無序（JSON 字串，舊的就丟）。
// 分片與 bufferedAmount 屬於 M-C 的 RTC 實作；send 接受任意大小。

export type Channel = 'ctrl' | 'bulk' | 'state';
export type Payload = string | Uint8Array;

export interface NetLink {
  readonly open: boolean;
  /** 關閉後靜默丟掉 */
  send(ch: Channel, data: Payload): void;
  onMessage(cb: (ch: Channel, data: Payload) => void): void;
  onClose(cb: (reason: string) => void): void;
  /** 兩端都觸發 onClose（各一次） */
  close(reason?: string): void;
  /** 這個方向還沒送達的位元組數（bulk 背壓；M-C = RTCDataChannel.bufferedAmount） */
  buffered(ch: Channel): number;
}
