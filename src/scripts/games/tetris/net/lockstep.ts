import { TetrisMatch, type Side } from '../engine/match';
import type { InputAction } from '../engine/game';
import type { Transport } from './transport';

const SIM_DT = 1000 / 60;
const INPUT_DELAY = 3; // 幀

interface FrameMsg { f: number; s: Side; a: InputAction[] }

export interface LockstepOptions {
  seed: number;
  localSide: Side;
  transport: Transport;
}

export class Lockstep {
  readonly match: TetrisMatch;
  private localSide: Side;
  private transport: Transport;
  private simFrame = 0;       // 下一個要模擬的幀
  private sendFrame = 0;      // 下一個要送出的本地輸入幀
  private pending: InputAction[] = []; // 本地累積、尚未送出的輸入
  private inbox: Record<Side, Map<number, InputAction[]>> = { A: new Map(), B: new Map() };

  constructor(opts: LockstepOptions) {
    this.match = new TetrisMatch({ seed: opts.seed });
    this.localSide = opts.localSide;
    this.transport = opts.transport;
    // 預填 frame 0..INPUT_DELAY-1 為空陣列（兩側），否則開局永遠卡在 simFrame 0
    for (let f = 0; f < INPUT_DELAY; f++) {
      this.inbox.A.set(f, []);
      this.inbox.B.set(f, []);
    }
    this.transport.onMessage((raw) => {
      const m = JSON.parse(raw) as FrameMsg;
      this.inbox[m.s].set(m.f, m.a);
    });
  }

  get confirmedFrame(): number { return this.simFrame; }

  /** 累積一個本地輸入（會在下次 tick 隨該幀送出）。 */
  pressLocal(action: InputAction): void { this.pending.push(action); }

  /** 每模擬幀呼叫一次：盡量前進模擬 + 送本地輸入。
   *  drain-before-send 確保同一 tick 迴圈中先消化上一輪已到達的輸入，
   *  再廣播本輪輸入；避免 loopback（同步傳遞）造成兩端 confirmedFrame 偏移。
   */
  tick(): void {
    // 1) 盡量前進：需同時有 A、B 對 simFrame 的輸入
    while (this.inbox.A.has(this.simFrame) && this.inbox.B.has(this.simFrame)) {
      const aIn = this.inbox.A.get(this.simFrame)!;
      const bIn = this.inbox.B.get(this.simFrame)!;
      for (const act of aIn) this.match.input('A', act);
      for (const act of bIn) this.match.input('B', act);
      this.match.step(SIM_DT);
      this.inbox.A.delete(this.simFrame);
      this.inbox.B.delete(this.simFrame);
      this.simFrame++;
    }

    // 2) 送出本地這一幀的輸入（排程到 sendFrame + INPUT_DELAY）
    const targetFrame = this.sendFrame + INPUT_DELAY;
    const actions = this.pending;
    this.pending = [];
    this.inbox[this.localSide].set(targetFrame, actions); // 本地也存
    this.transport.send(JSON.stringify({ f: targetFrame, s: this.localSide, a: actions } as FrameMsg));
    this.sendFrame++;
  }
}
