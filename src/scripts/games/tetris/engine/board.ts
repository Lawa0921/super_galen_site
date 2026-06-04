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

/** 把方塊鎖進盤面，回傳新盤面（不修改輸入） */
export function lockPiece(board: Matrix, piece: ActivePiece): Matrix {
  const next = board.map((row) => [...row]);
  for (const { x, y } of getCells(piece)) {
    if (y >= 0 && y < TOTAL_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
      next[y][x] = piece.type;
    }
  }
  return next;
}

/** 消除填滿的列，上方往下補，回傳新盤面與被清列索引 */
export function clearLines(board: Matrix): { board: Matrix; rows: number[] } {
  const rows: number[] = [];
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    if (board[y].every((c) => c !== null)) rows.push(y);
  }
  if (rows.length === 0) return { board, rows };

  const kept = board.filter((_, y) => !rows.includes(y));
  const empty: Matrix = Array.from({ length: rows.length }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null),
  );
  return { board: [...empty, ...kept], rows };
}
