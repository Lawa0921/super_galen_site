import type { Matrix } from '../engine/types';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';

export interface BoardFeatures {
  aggregateHeight: number;
  holes: number;
  bumpiness: number;
  completeLines: number;
}

// El-Tetris 權重
const W_HEIGHT = -0.510066;
const W_LINES = 0.760666;
const W_HOLES = -0.35663;
const W_BUMP = -0.184483;

/** 每欄高度（TOTAL_HEIGHT - 最高填滿列索引；空欄=0）。 */
function columnHeights(board: Matrix): number[] {
  const heights = new Array(BOARD_WIDTH).fill(0);
  for (let x = 0; x < BOARD_WIDTH; x++) {
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] !== null) {
        heights[x] = TOTAL_HEIGHT - y;
        break;
      }
    }
  }
  return heights;
}

export function evaluateBoard(board: Matrix): BoardFeatures {
  const heights = columnHeights(board);
  const aggregateHeight = heights.reduce((a, h) => a + h, 0);

  let bumpiness = 0;
  for (let x = 0; x < BOARD_WIDTH - 1; x++) bumpiness += Math.abs(heights[x] - heights[x + 1]);

  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    const top = TOTAL_HEIGHT - heights[x];
    for (let y = top + 1; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] === null) holes++;
    }
  }

  let completeLines = 0;
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    if (board[y].every((c) => c !== null)) completeLines++;
  }

  return { aggregateHeight, holes, bumpiness, completeLines };
}

/** 盤面評分（lines 為本次落子消除的行數，分開傳入）。越高越好。 */
export function scoreBoard(board: Matrix, lines: number): number {
  const f = evaluateBoard(board);
  return W_LINES * lines + W_HEIGHT * f.aggregateHeight + W_HOLES * f.holes + W_BUMP * f.bumpiness;
}
