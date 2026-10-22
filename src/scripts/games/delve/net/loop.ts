// loop.ts — 連線時的計時器驅動迴圈（C18）：房主／客人的模擬不跟 rAF，分頁在背景被節流也不掉速。
// 計時器可注入（Ticker）；M-B3 附 setInterval 版，M-C 換成 Worker 計時器並實測。
import { FixedStepper } from '../render/model';
import { FIXED_DT } from '../engine/constants';

export interface Ticker { start(cb: (nowMs: number) => void, everyMs: number): void; stop(): void }

/** 真實時間的計時器：setInterval + performance.now。net/ 內唯一允許碰時鐘的地方（決定性規則的例外）。 */
export function intervalTicker(): Ticker {
  let id: ReturnType<typeof setInterval> | null = null;
  return {
    start(cb, everyMs) {
      if (id !== null) clearInterval(id);
      id = setInterval(() => cb(performance.now()), everyMs);
    },
    stop() {
      if (id !== null) clearInterval(id);
      id = null;
    },
  };
}

/** 計時器被節流到 1 秒一次時，一次最多補 1 秒（60 步），不掉速 */
export const HOST_MAX_FRAME_S = 1.0;
export const LOOP_EVERY_MS = 1000 / 60;

export class NetLoop {
  private readonly stepper = new FixedStepper(FIXED_DT, HOST_MAX_FRAME_S);
  private last: number | null = null;
  private on = false;

  /** run = host.frame 或 guest.frame */
  constructor(private readonly ticker: Ticker, private readonly run: (nowMs: number, steps: number) => void) {}

  get running(): boolean { return this.on; }

  start(): void {
    if (this.on) return;
    this.on = true;
    this.last = null;
    this.ticker.start((nowMs) => this.tick(nowMs), LOOP_EVERY_MS);
  }

  stop(): void {
    if (!this.on) return;
    this.on = false;
    this.ticker.stop();
  }

  private tick(nowMs: number): void {
    if (!this.on) return;
    // 第一次觸發只當基準（沒有「上一次」可比），0 步
    const dt = this.last === null ? 0 : (nowMs - this.last) / 1000;
    this.last = nowMs;
    this.run(nowMs, this.stepper.advance(dt));
  }
}
