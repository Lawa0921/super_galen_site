import type { GameState } from '../engine/types';
import type { InputAction } from '../engine/game';
import { BOARD_WIDTH } from '../engine/constants';
import { decide, dropPlacement, type Placement } from './bot';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'insane';

/**
 * 每塊的思考延遲（毫秒）——難度主要分層。
 * 重平衡（玩家回饋：舊 hard 80ms+零失誤 ≈ 3 行/秒，人類不可能贏）：
 * easy/normal/hard 全面放慢到人類節奏，原 hard 參數整組保留為 insane 神級超級模式。
 */
const THINK_MS: Record<Difficulty, number> = { easy: 900, normal: 650, hard: 480, insane: 80 };
/** 失誤率：以此機率把目標落點偏移一欄（insane = 0，真的神） */
const MISTAKE_RATE: Record<Difficulty, number> = { easy: 0.20, normal: 0.10, hard: 0.04, insane: 0 };

/**
 * AI 控制器：每塊先「思考」THINK_MS，再一口氣執行決策序列
 * （hold? → 旋轉 → 平移 → 硬降）。一次出完避免高等級重力跑贏逐步走子
 * 而亂放疊死；難度由思考延遲＋失誤率分層。
 */
export class AiController {
  private intervalMs: number; // 思考延遲（保留欄位名供測試/相容）
  private mistakeRate: number;
  private acc = 0;
  private seenKey = '';

  constructor(
    private emit: (action: InputAction) => void,
    private getState: () => GameState,
    difficulty: Difficulty,
    private rng: () => number = Math.random,
  ) {
    this.intervalMs = THINK_MS[difficulty];
    this.mistakeRate = MISTAKE_RATE[difficulty];
  }

  /** 局面識別 key：換塊 / hold / 消行 / 垃圾進場都會改變 → 重新思考 */
  private stateKey(s: GameState): string {
    let filled = 0;
    for (const row of s.board) for (const c of row) if (c !== null) filled++;
    return `${s.active?.type}|${s.hold ?? ''}|${s.next.join('')}|${filled}`;
  }

  /** 前進 dtMs；同一局面累積到思考延遲後，一次執行整套輸入序列。 */
  update(dtMs: number): void {
    const s = this.getState();
    if (s.status !== 'playing' || !s.active) return;

    const key = this.stateKey(s);
    if (key !== this.seenKey) {
      this.seenKey = key;
      this.acc = 0;
    }

    this.acc += dtMs;
    if (this.acc < this.intervalMs) return;
    this.acc = 0;
    this.executeTurn(s);
  }

  /** 規劃並一口氣出完：hold?（每塊限一次）→ 旋轉 → 平移 → 硬降。 */
  private executeTurn(s: GameState): void {
    const d = decide({
      board: s.board,
      current: s.active!.type,
      hold: s.hold,
      next: s.next[0] ?? null,
      canHold: s.canHold,
    });
    if (!d) {
      this.emit('hardDrop');
      return;
    }

    let target: Placement = d.placement;

    // 失誤：偏移一欄（仍須是合法落點，否則維持原目標）
    if (this.mistakeRate > 0 && this.rng() < this.mistakeRate) {
      const type = d.useHold ? (s.hold ?? s.next[0] ?? s.active!.type) : s.active!.type;
      const dir = this.rng() < 0.5 ? -1 : 1;
      if (dropPlacement(s.board, type, target.rotation, target.x + dir)) {
        target = { rotation: target.rotation, x: target.x + dir };
      }
    }

    if (d.useHold) this.emit('hold'); // 引擎同步換塊（空 hold = 直接抽 next）

    for (let i = 0; i < target.rotation; i++) this.emit('rotateCW');

    // 旋轉可能踢牆改 x → 讀回實際位置再平移
    let active = this.getState().active;
    let guard = 0;
    while (active && active.x !== target.x && guard++ < BOARD_WIDTH + 4) {
      this.emit(active.x > target.x ? 'left' : 'right');
      const after = this.getState().active;
      if (after && after.x === active.x) break; // 被擋住：就地落下
      active = after;
    }

    this.emit('hardDrop');
  }
}
