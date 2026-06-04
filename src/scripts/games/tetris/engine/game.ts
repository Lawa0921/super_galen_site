import type { ActivePiece, GameEvent, GameState, PieceType } from './types';
import { createBag, type Bag } from './bag';
import { spawnPiece, tryRotate, type PlaceTest } from './piece';
import { canPlace, createBoard, lockPiece, clearLines, insertGarbage } from './board';
import { detectTSpin, scoreClear, scoreCombo, isDifficultClear } from './scoring';
import {
  NEXT_QUEUE_SIZE, GRAVITY_MS, LOCK_DELAY_MS, LOCK_RESET_LIMIT,
  LINES_PER_LEVEL, SOFT_DROP_POINTS, HARD_DROP_POINTS, BOARD_WIDTH,
} from './constants';
import type { Matrix } from './types';

export type InputAction =
  | 'left' | 'right' | 'rotateCW' | 'rotateCCW' | 'softDrop' | 'hardDrop' | 'hold';

export interface GameOptions { seed?: number; startLevel?: number; }

export class TetrisGame {
  private board: Matrix = createBoard();
  private bag: Bag;
  private active: ActivePiece | null = null;
  private holdType: PieceType | null = null;
  private canHoldNow = true;
  private score = 0;
  private lines = 0;
  private level: number;
  private combo = -1;
  private backToBack = false;
  private status: 'playing' | 'topout' = 'playing';
  private lastMoveWasRotation = false;

  // 計時
  private gravityAcc = 0;
  private lockTimer = 0;
  private locking = false;
  private lockResets = 0;

  private events: GameEvent[] = [];

  constructor(opts: GameOptions = {}) {
    this.bag = createBag(opts.seed ?? 1);
    this.level = opts.startLevel ?? 1;
    this.spawn();
  }

  private placeTest: PlaceTest = (cand) => canPlace(this.board, cand);

  private spawn(): void {
    const type = this.bag.next();
    const piece = spawnPiece(type);
    if (!canPlace(this.board, piece)) {
      this.active = null;
      this.status = 'topout';
      this.events.push({ kind: 'topout' });
      return;
    }
    this.active = piece;
    this.canHoldNow = true;
    this.lastMoveWasRotation = false;
    this.locking = false;
    this.lockTimer = 0;
    this.lockResets = 0;
    this.events.push({ kind: 'spawn', type });
  }

  private tryMove(dx: number, dy: number): boolean {
    if (!this.active) return false;
    const cand: ActivePiece = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (canPlace(this.board, cand)) {
      this.active = cand;
      this.lastMoveWasRotation = false;
      this.onSuccessfulShift();
      return true;
    }
    return false;
  }

  /** 移動/旋轉成功後，若處於 lock delay 中且未超過 reset 上限，重置 lock 計時 */
  private onSuccessfulShift(): void {
    if (this.locking && this.lockResets < LOCK_RESET_LIMIT) {
      this.lockTimer = 0;
      this.lockResets++;
    }
  }

  input(action: InputAction): void {
    if (this.status !== 'playing' || !this.active) return;
    switch (action) {
      case 'left': this.tryMove(-1, 0); break;
      case 'right': this.tryMove(1, 0); break;
      case 'softDrop':
        if (this.tryMove(0, 1)) this.score += SOFT_DROP_POINTS;
        break;
      case 'rotateCW': this.rotate(1); break;
      case 'rotateCCW': this.rotate(-1); break;
      case 'hardDrop': this.hardDrop(); break;
      case 'hold': this.hold(); break;
    }
  }

  private rotate(dir: 1 | -1): void {
    if (!this.active) return;
    const result = tryRotate(this.active, dir, this.placeTest);
    if (result) {
      this.active = result;
      this.lastMoveWasRotation = true;
      this.onSuccessfulShift();
    }
  }

  getState(): GameState {
    return {
      board: this.board.map((r) => [...r]),
      active: this.active ? { ...this.active } : null,
      hold: this.holdType,
      canHold: this.canHoldNow,
      next: this.bag.peek(NEXT_QUEUE_SIZE),
      score: this.score,
      lines: this.lines,
      level: this.level,
      combo: this.combo,
      backToBack: this.backToBack,
      status: this.status,
    };
  }

  /** 取出並清空累積事件 */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private ghostDropDistance(): number {
    if (!this.active) return 0;
    let dist = 0;
    while (canPlace(this.board, { ...this.active, y: this.active.y + dist + 1 })) dist++;
    return dist;
  }

  private hardDrop(): void {
    if (!this.active) return;
    const dist = this.ghostDropDistance();
    this.active = { ...this.active, y: this.active.y + dist };
    this.score += dist * HARD_DROP_POINTS;
    this.lockAndResolve();
  }

  private lockAndResolve(): void {
    if (!this.active) return;
    const piece = this.active;
    const tSpin = detectTSpin(this.board, piece, this.lastMoveWasRotation);
    this.board = lockPiece(this.board, piece);
    this.events.push({ kind: 'lock' });

    const { board: cleared, rows } = clearLines(this.board);
    this.board = cleared;
    const count = rows.length;

    if (count > 0) {
      this.combo += 1;
      const difficult = isDifficultClear(count, tSpin);
      const applyB2B = difficult && this.backToBack;
      this.score += scoreClear({ count, tSpin, level: this.level, b2b: applyB2B });
      this.score += scoreCombo(this.combo, this.level);
      this.lines += count;
      this.level = Math.floor(this.lines / LINES_PER_LEVEL) + 1;
      this.backToBack = difficult;
      this.events.push({ kind: 'lineClear', rows, count, tSpin, b2b: applyB2B, combo: this.combo });
    } else {
      this.combo = -1;
    }

    this.active = null;
    this.spawn();
  }

  /** 測試輔助：填滿最底列只留 1 欄，放一個能填那欄的方塊並硬降。 */
  debugFillRowExceptOneAndDrop(): void {
    const lastY = this.board.length - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) this.board[lastY][x] = 'G';
    this.board[lastY][0] = null; // 留第 0 欄
    this.board[lastY - 1][0] = null;
    this.board[lastY - 2][0] = null;
    this.board[lastY - 3][0] = null;
    // 用 I 方塊直立填第 0 欄
    this.active = { type: 'I', rotation: 1, x: -2, y: lastY - 3 };
    // I R1 的 cell 在 box x=2 那一直行；x=-2 → 絕對 x=0
    this.hardDrop();
  }

  private hold(): void {
    if (!this.active || !this.canHoldNow) return;
    const current = this.active.type;
    this.events.push({ kind: 'hold' });
    if (this.holdType === null) {
      this.holdType = current;
      this.active = null;
      this.spawn();              // spawn() 會把 canHoldNow 設回 true…
    } else {
      const swap = this.holdType;
      this.holdType = current;
      this.active = spawnPiece(swap);
      this.lastMoveWasRotation = false;
      this.locking = false;
      this.lockTimer = 0;
      this.lockResets = 0;
    }
    this.canHoldNow = false;     // …因此務必在 spawn 之後再鎖定 hold
  }

  /** 前進 dtMs 毫秒：處理重力下落與 lock delay。 */
  step(dtMs: number): void {
    if (this.status !== 'playing' || !this.active) return;
    const interval = GRAVITY_MS[Math.min(this.level - 1, GRAVITY_MS.length - 1)];

    this.gravityAcc += dtMs;
    while (this.gravityAcc >= interval) {
      this.gravityAcc -= interval;
      if (canPlace(this.board, { ...this.active, y: this.active.y + 1 })) {
        this.active = { ...this.active, y: this.active.y + 1 };
        this.lastMoveWasRotation = false;
        this.locking = false;
        this.lockTimer = 0;
      } else {
        this.locking = true;
        break;
      }
    }

    if (this.locking) {
      this.lockTimer += dtMs;
      if (this.lockTimer >= LOCK_DELAY_MS) {
        this.lockAndResolve();
      }
    }
  }

  /** 外部（對戰）注入垃圾行：底部加 count 列、holeCol 留洞。 */
  receiveGarbage(count: number, holeCol: number): void {
    this.board = insertGarbage(this.board, count, holeCol);
    // 若活動方塊因上推而與既有格重疊，嘗試上移修正
    if (this.active && !canPlace(this.board, this.active)) {
      for (let dy = 1; dy <= count; dy++) {
        const lifted = { ...this.active, y: this.active.y - dy };
        if (canPlace(this.board, lifted)) { this.active = lifted; break; }
      }
    }
  }
}
