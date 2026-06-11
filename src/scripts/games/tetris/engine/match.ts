import { TetrisGame, type InputAction } from './game';
import type { ActivePiece, TSpinType } from './types';
import { computeAttack, cancelGarbage } from './attack';
import { createRng } from './rng';
import { BOARD_WIDTH } from './constants';

export type Side = 'A' | 'B';
export type MatchPhase = 'intro' | 'playing' | 'result';

export type MatchEvent =
  | { kind: 'lock'; side: Side; piece: ActivePiece }
  | { kind: 'lineClear'; side: Side; rows: number[]; count: number; tSpin: TSpinType; combo: number; b2b: boolean }
  | { kind: 'attack'; from: Side; amount: number }
  | { kind: 'garbageIn'; side: Side; amount: number }
  | { kind: 'shieldBlock'; side: Side; amount: number } // 道具護盾抵擋（僅 amount>0 時發出）
  | { kind: 'ko'; winner: Side };

export interface MatchOptions { seed?: number; }

export class TetrisMatch {
  readonly a: TetrisGame;
  readonly b: TetrisGame;
  phase: MatchPhase = 'playing';
  winner: Side | null = null;

  private incoming: Record<Side, number> = { A: 0, B: 0 };
  /** 道具護盾（default-inactive：0 = 原路徑） */
  private shield: Record<Side, number> = { A: 0, B: 0 };
  private holeRng: () => number;
  private events: MatchEvent[] = [];

  constructor(opts: MatchOptions = {}) {
    const seed = opts.seed ?? 1;
    this.a = new TetrisGame({ seed });
    this.b = new TetrisGame({ seed });
    this.holeRng = createRng((seed ^ 0x9e3779b9) >>> 0); // 垃圾洞獨立但可重現
  }

  input(side: Side, action: InputAction): void {
    if (this.phase !== 'playing') return;
    (side === 'A' ? this.a : this.b).input(action);
  }

  pendingGarbage(side: Side): number {
    return this.incoming[side];
  }

  /** 道具：加護盾（先進先抵，傾倒垃圾前消減）。非正數忽略。 */
  addShield(side: Side, n: number): void {
    if (!Number.isFinite(n) || n <= 0) return;
    this.shield[side] += Math.floor(n);
  }

  drainEvents(): MatchEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private holeCol(): number {
    return Math.floor(this.holeRng() * BOARD_WIDTH);
  }

  private game(side: Side): TetrisGame {
    return side === 'A' ? this.a : this.b;
  }

  /** 處理某側本幀事件：攻擊路由（Task 2）+ 垃圾傾倒/KO（Task 3）。 */
  private process(side: Side): void {
    if (this.phase !== 'playing') return;
    const opp: Side = side === 'A' ? 'B' : 'A';
    const game = this.game(side);
    const evs = game.drainEvents();
    let lockOpen = false; // 有一個尚未結算傾倒的 lock
    let lockCleared = false; // 該 lock 是否消行

    const resolveLock = (): void => {
      if (lockOpen && !lockCleared && this.phase === 'playing' && this.incoming[side] > 0) {
        let amount = this.incoming[side];
        this.incoming[side] = 0;
        // 護盾先抵（shield=0 時 blocked=0，走原路徑，holeRng 消耗不變）
        const blocked = Math.min(this.shield[side], amount);
        if (blocked > 0) {
          this.shield[side] -= blocked;
          amount -= blocked;
          this.events.push({ kind: 'shieldBlock', side, amount: blocked });
        }
        if (amount > 0) {
          game.receiveGarbage(amount, this.holeCol());
          this.events.push({ kind: 'garbageIn', side, amount });
        }
      }
      lockOpen = false;
      lockCleared = false;
    };

    for (const ev of evs) {
      if (ev.kind === 'lock') {
        resolveLock(); // 結算前一個 lock（僅在單 step 多次鎖定時才會發生）
        this.events.push({ kind: 'lock', side, piece: ev.piece });
        lockOpen = true;
        lockCleared = false;
      } else if (ev.kind === 'lineClear') {
        lockCleared = true;
        this.events.push({ kind: 'lineClear', side, rows: ev.rows, count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const out = computeAttack({ count: ev.count, tSpin: ev.tSpin, combo: ev.combo, b2b: ev.b2b });
        const res = cancelGarbage(this.incoming[side], out);
        this.incoming[side] = res.incoming;
        if (res.sent > 0) {
          this.incoming[opp] += res.sent;
          this.events.push({ kind: 'attack', from: side, amount: res.sent });
        }
      } else if (ev.kind === 'topout') {
        lockOpen = false; // 頂出不傾倒
        this.phase = 'result';
        this.winner = opp;
        this.events.push({ kind: 'ko', winner: opp });
      }
    }
    resolveLock(); // 結算最後一個 lock
  }

  step(dtMs: number): void {
    if (this.phase !== 'playing') return;
    this.a.step(dtMs);
    this.b.step(dtMs);
    this.process('A');
    this.process('B');
  }
}
