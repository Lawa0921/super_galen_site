import type { ActivePiece, Matrix, TSpinType } from './types';
import { BOARD_WIDTH, TOTAL_HEIGHT, LINE_SCORES, TSPIN_SCORES, B2B_MULTIPLIER, COMBO_BASE } from './constants';

export interface ClearScoreInput {
  count: number;       // 消除行數 0..4
  tSpin: TSpinType;    // none / mini / full
  level: number;       // 當前等級（≥1）
  b2b: boolean;        // 本次是否觸發 back-to-back 加成
}

/** 計算單次落地的得分（不含 combo；combo 由 game.ts 另計） */
export function scoreClear({ count, tSpin, level, b2b }: ClearScoreInput): number {
  let base: number;
  if (tSpin === 'full') base = TSPIN_SCORES.full[count] ?? 0;
  else if (tSpin === 'mini') base = TSPIN_SCORES.mini[Math.min(count, 2)] ?? 0;
  else base = LINE_SCORES[count] ?? 0;

  let total = base * level;
  if (b2b && (count === 4 || tSpin !== 'none')) total = Math.floor(total * B2B_MULTIPLIER);
  return total;
}

/** combo 加分：COMBO_BASE × combo × level（combo<=0 不加） */
export function scoreCombo(combo: number, level: number): number {
  return combo > 0 ? COMBO_BASE * combo * level : 0;
}

/** 該次消行是否屬於「困難消除」（用於 back-to-back 判定） */
export function isDifficultClear(count: number, tSpin: TSpinType): boolean {
  return count === 4 || tSpin !== 'none';
}

const CORNERS = [
  { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 2 }, { x: 2, y: 2 },
];

function occupied(board: Matrix, x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= TOTAL_HEIGHT) return true; // 出界視為佔據
  return board[y][x] !== null;
}

/**
 * 3-corner T-spin 偵測。需：方塊為 T 且最後一步為旋轉。
 * 中心位於 box 的 (1,1)。四角佔據數 ≥3 為 T-spin。
 * （簡化：≥3 角即判 full；本階段不細分 mini/full 的面向規則，Phase 後續可細化。）
 */
export function detectTSpin(board: Matrix, piece: ActivePiece, lastMoveWasRotation: boolean): TSpinType {
  if (piece.type !== 'T' || !lastMoveWasRotation) return 'none';
  let filled = 0;
  for (const c of CORNERS) {
    if (occupied(board, piece.x + c.x, piece.y + c.y)) filled++;
  }
  return filled >= 3 ? 'full' : 'none';
}
