import type { BomberLockstepTransport, BomberFrameMsg } from './bomberLockstep';

/**
 * Bomber 多人傳輸層（copy-adapt 自 tetris/net/ffaTransport.ts）。
 *
 * 差異：
 *  - 幀訊息型別 → `BomberFrameMsg`（{f,p,a}，a 為 VersusAction[]）。
 *  - 控制訊息前綴 → `'bomber-'`（與 tetris 的 `'ffa-'` 互不干擾，避免跨遊戲誤判）。
 *  - 對外介面相容 `BomberLockstepTransport`（send / onMessage），故 BomberLockstep 可直用；
 *    額外保留 sendControl / onControl / onChannelClose / onClose 等強健性掛點供 T11 lobby/握手使用。
 *
 * 拓樸沿用 ffaTransport：Hub = 房主中繼（星狀中心），Spoke = 來賓（星狀輻條）。
 */

/** 控制訊息前綴：JSON parse 後物件的字串欄位 `t` 以此開頭 → 視為控制訊息。 */
const CONTROL_PREFIX = 'bomber-';

/**
 * 一個 channel 的最小抽象（mock 或真 RTCDataChannel 包裝）。
 * 對應一條「Host ↔ 某 Guest」的單向送出能力 + 開啟狀態。
 */
export interface RelayChannel {
  send(raw: string): void;
  readonly open: boolean;
  /**
   * 可選 close 掛點（模仿 RTCDataChannel.onclose 的可賦值屬性）。
   * Hub/Spoke 建構時若 channel 支援此屬性會掛上處理器；mock 物件可直接設。
   */
  onclose?: (() => void) | null;
}

/**
 * Host 收到「來自 channel fromIdx」的一筆原始訊息 raw 後，轉發給「其餘所有 channel」。
 * fromIdx === null 代表訊息源自 Host 自己（host 的 BomberLockstep send）→ 轉發給全部 channel。
 * channel 未開（open=false）跳過、不丟例外。
 * 純函式：只對傳入 channels 做 send，回傳實際轉發到的 index 陣列。
 */
export function routeFrame(
  fromIdx: number | null,
  raw: string,
  channels: RelayChannel[],
): number[] {
  const routed: number[] = [];
  for (let i = 0; i < channels.length; i++) {
    if (i === fromIdx) continue; // 不回灌來源
    const ch = channels[i];
    if (!ch.open) continue; // 未開跳過、不丟例外
    ch.send(raw);
    routed.push(i);
  }
  return routed;
}

/**
 * 把任意原始訊息解析為 BomberFrameMsg（JSON 字串或已是物件皆容錯）。
 * 解析失敗回傳 null（呼叫端忽略，與 BomberLockstep handleMessage 的字串容錯相容）。
 */
function parseFrame(raw: unknown): BomberFrameMsg | null {
  let m: unknown = raw;
  if (typeof raw === 'string') {
    try {
      m = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== 'object') return null;
  return m as BomberFrameMsg;
}

/**
 * 控制訊息判別：JSON parse 後物件有字串欄位 `t` 且以 'bomber-' 開頭 → 控制訊息
 * （BomberFrameMsg 是 {f,p,a} 無 t，不會誤判；tetris 的 'ffa-*' 控制訊息前綴不符，亦不誤判）。
 * parse 失敗 / 無 t / t 非字串 / 前綴不符 → 回傳 null（呼叫端走幀訊息既有容錯路徑）。
 */
function parseControl(raw: unknown): Record<string, unknown> | null {
  let m: unknown = raw;
  if (typeof raw === 'string') {
    try {
      m = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!m || typeof m !== 'object') return null;
  const t = (m as Record<string, unknown>).t;
  if (typeof t !== 'string' || !t.startsWith(CONTROL_PREFIX)) return null;
  return m as Record<string, unknown>;
}

/**
 * Host 端 relay transport（星狀中心）。
 *
 * 拓樸：Host 對每個 Guest 各持一條 channel（channels[i] 對應 guest i）。
 *  - 收到某 guest channel 的訊息：轉發給「其餘所有 guest」（routeFrame），
 *    並把 parse 後的 msg 丟給本端上層 onMessage cb（host 的 BomberLockstep 也要看到全員的幀）。
 *  - send（host 自己的幀）：routeFrame(null, ...) 廣播給全部 guest，
 *    並回灌自己上層 cb（讓 host lockstep 收到自己的幀；inbox 寫入冪等故安全）。
 *
 * Host 只是純 relay，不是遊戲權威；路由邏輯抽在 routeFrame 純函式中。
 */
export class BomberHubTransport implements BomberLockstepTransport {
  private readonly channels: RelayChannel[];
  private cb: ((msg: BomberFrameMsg) => void) | null = null;
  private controlCb: ((msg: Record<string, unknown>) => void) | null = null;
  private channelCloseCb: ((idx: number) => void) | null = null;

  /**
   * @param channels N-1 條 channel（對應各 guest）。
   *   每條若帶 `onmessage` setter（mock 或 RTCDataChannel 包裝），會被掛上收訊轉發邏輯；
   *   若支援 `onclose` 也會掛上 close 處理（觸發 onChannelClose 回呼帶 idx）。
   */
  constructor(channels: Array<RelayChannel & { onmessage?: ((raw: string) => void) | null }>) {
    this.channels = channels;
    channels.forEach((ch, idx) => {
      // 為每條 guest channel 安裝收訊處理：轉發其餘 guest + 回灌本端上層
      ch.onmessage = (raw: string) => this.handleGuestMessage(idx, raw);
      // channel 關閉 → 觸發 channelClose 回呼（帶該 idx）
      if ('onclose' in ch) ch.onclose = () => this.channelCloseCb?.(idx);
    });
  }

  /**
   * 收到 guest idx 的一筆原始訊息：
   *  - 控制訊息 'bomber-leave' → 觸發 channelClose 回呼（快速路徑），不 relay 不上拋。
   *  - 其他 'bomber-*' 控制訊息 → relay 給其餘 guest + 觸發自身 onControl。
   *  - 幀訊息 → relay 給其餘 guest，再丟給本端上層（既有行為）。
   */
  private handleGuestMessage(fromIdx: number, raw: string): void {
    const ctrl = parseControl(raw);
    if (ctrl) {
      if (ctrl.t === 'bomber-leave') {
        this.channelCloseCb?.(fromIdx);
        return; // 不 relay、不上拋
      }
      routeFrame(fromIdx, raw, this.channels);
      this.controlCb?.(ctrl);
      return;
    }
    routeFrame(fromIdx, raw, this.channels);
    const msg = parseFrame(raw);
    if (msg) this.cb?.(msg);
  }

  /** host 自己的幀：廣播給全部 guest，並回灌自己上層（自身可見）。 */
  send(msg: BomberFrameMsg): void {
    routeFrame(null, JSON.stringify(msg), this.channels);
    this.cb?.(msg);
  }

  /** host 自己的控制訊息：廣播給全部 guest，並回灌自身 onControl（自身可見）。 */
  sendControl(msg: Record<string, unknown>): void {
    routeFrame(null, JSON.stringify(msg), this.channels);
    this.controlCb?.(msg);
  }

  onMessage(cb: (msg: BomberFrameMsg) => void): void {
    this.cb = cb;
  }

  onControl(cb: (msg: Record<string, unknown>) => void): void {
    this.controlCb = cb;
  }

  /** 登記 channel 關閉回呼（來源：channel onclose 或 guest 的 bomber-leave 快速路徑）。 */
  onChannelClose(cb: (idx: number) => void): void {
    this.channelCloseCb = cb;
  }
}

/**
 * Guest 端 transport（星狀輻條）。
 *
 * 只連 Host 一條 channel：
 *  - send：JSON 編碼後送給 host（host 會 relay 給其餘）；channel 未開不丟例外。
 *  - 收訊（channel.onmessage）：parse 後丟給上層 onMessage cb。
 */
export class BomberSpokeTransport implements BomberLockstepTransport {
  private readonly channel: RelayChannel;
  private cb: ((msg: BomberFrameMsg) => void) | null = null;
  private controlCb: ((msg: Record<string, unknown>) => void) | null = null;
  private closeCb: (() => void) | null = null;

  /**
   * @param channel 對 Host 的單一 channel；若帶 `onmessage` setter 會被掛上收訊處理
   *   （控制訊息 → onControl、幀 → onMessage）；若支援 `onclose` 也會掛上 close 處理。
   */
  constructor(channel: RelayChannel & { onmessage?: ((raw: string) => void) | null }) {
    this.channel = channel;
    channel.onmessage = (raw: string) => {
      const ctrl = parseControl(raw);
      if (ctrl) {
        this.controlCb?.(ctrl);
        return;
      }
      const msg = parseFrame(raw);
      if (msg) this.cb?.(msg);
    };
    if ('onclose' in channel) channel.onclose = () => this.closeCb?.();
  }

  send(msg: BomberFrameMsg): void {
    if (!this.channel.open) return; // 未開不送、不丟例外
    this.channel.send(JSON.stringify(msg));
  }

  /** 控制訊息送給 host（host 會分流處理/relay）；channel 未開不送、不丟例外。 */
  sendControl(msg: Record<string, unknown>): void {
    if (!this.channel.open) return;
    this.channel.send(JSON.stringify(msg));
  }

  onMessage(cb: (msg: BomberFrameMsg) => void): void {
    this.cb = cb;
  }

  onControl(cb: (msg: Record<string, unknown>) => void): void {
    this.controlCb = cb;
  }

  /** 登記 host 頻道關閉回呼。 */
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }
}
