import type { GameState } from '../engine/types';
import type { InputAction } from '../engine/game';
import { bestPlacement, type Placement } from './bot';

export type Difficulty = 'easy' | 'normal' | 'hard';

const INTERVALS: Record<Difficulty, number> = { easy: 420, normal: 200, hard: 80 };

/** 依難度的思考間隔，逐步把當前方塊走到 bestPlacement 目標。 */
export class AiController {
  private intervalMs: number;
  private acc = 0;
  private target: Placement | null = null;
  private targetPieceKey = '';

  constructor(
    private emit: (action: InputAction) => void,
    private getState: () => GameState,
    difficulty: Difficulty,
  ) {
    this.intervalMs = INTERVALS[difficulty];
  }

  /** 前進 dtMs；每隔 intervalMs 走一步（旋轉→平移→硬降）。 */
  update(dtMs: number): void {
    const s = this.getState();
    if (s.status !== 'playing' || !s.active) return;

    // 換了新方塊就重新規劃目標
    const key = `${s.active.type}@${s.next[0] ?? ''}:${s.board.length}`;
    if (this.target === null || key !== this.targetPieceKey) {
      this.target = bestPlacement(s.board, s.active.type);
      this.targetPieceKey = key;
    }

    this.acc += dtMs;
    if (this.acc < this.intervalMs) return;
    this.acc = 0;
    if (!this.target) { this.emit('hardDrop'); return; }

    const a = s.active;
    if (a.rotation !== this.target.rotation) this.emit('rotateCW');
    else if (a.x > this.target.x) this.emit('left');
    else if (a.x < this.target.x) this.emit('right');
    else { this.emit('hardDrop'); this.target = null; }
  }
}
