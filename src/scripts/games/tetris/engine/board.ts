import type { ActivePiece, Matrix } from './types';
import { BOARD_WIDTH, TOTAL_HEIGHT } from './constants';
import { getCells } from './piece';

/** 建立全空盤面 */
export function createBoard(): Matrix {
  return Array.from({ length: TOTAL_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  );
}

/** 方塊是否能放在盤面（不出界、不重疊） */
export function canPlace(board: Matrix, piece: ActivePiece): boolean {
  for (const { x, y } of getCells(piece)) {
    if (x < 0 || x >= BOARD_WIDTH) return false;
    if (y < 0 || y >= TOTAL_HEIGHT) return false;
    if (board[y][x] !== null) return false;
  }
  return true;
}
