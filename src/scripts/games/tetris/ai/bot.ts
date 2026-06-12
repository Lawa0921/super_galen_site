import type { ActivePiece, Matrix, PieceType, Rotation } from '../engine/types';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';
import { canPlace, lockPiece, clearLines } from '../engine/board';
import { getCells } from '../engine/piece';

/** Dellacherie 盤面特徵（消行後的盤面）。 */
export interface BoardFeatures {
  rowTransitions: number;
  colTransitions: number;
  holes: number;
  wells: number; // cumulative wells（每井 1+2+…+深度）
}

// Dellacherie 成熟權重（Thiery & Scherrer 文獻常用組）
const W_LANDING = -4.500158825;
const W_ERODED = 3.4181268;
const W_ROW_T = -3.2178882;
const W_COL_T = -9.348695;
const W_HOLES = -7.899265;
const W_WELLS = -3.3855972;

export function evaluateBoard(board: Matrix): BoardFeatures {
  // Row transitions：左右牆視為填滿，每列水平掃描 filled↔empty 變化數
  let rowTransitions = 0;
  for (let y = 0; y < TOTAL_HEIGHT; y++) {
    let prev = true; // 左牆
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const filled = board[y][x] !== null;
      if (filled !== prev) rowTransitions++;
      prev = filled;
    }
    if (!prev) rowTransitions++; // 右牆
  }

  // Column transitions：頂上視為空、底床視為填滿
  let colTransitions = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let prev = false; // 盤頂上方
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      const filled = board[y][x] !== null;
      if (filled !== prev) colTransitions++;
      prev = filled;
    }
    if (!prev) colTransitions++; // 底床
  }

  // Holes：欄內上方有填格的空格數
  let holes = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    let covered = false;
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] !== null) covered = true;
      else if (covered) holes++;
    }
  }

  // Cumulative wells：左右皆填滿（牆算填滿）的空格，往下累計連續空深（1+2+…+d）
  let wells = 0;
  for (let x = 0; x < BOARD_WIDTH; x++) {
    for (let y = 0; y < TOTAL_HEIGHT; y++) {
      if (board[y][x] !== null) continue;
      const leftFilled = x === 0 || board[y][x - 1] !== null;
      const rightFilled = x === BOARD_WIDTH - 1 || board[y][x + 1] !== null;
      if (leftFilled && rightFilled) {
        for (let k = y; k < TOTAL_HEIGHT && board[k][x] === null; k++) wells++;
      }
    }
  }

  return { rowTransitions, colTransitions, holes, wells };
}

export interface Placement { rotation: Rotation; x: number; }

export interface DropResult {
  board: Matrix;        // 消行後盤面
  lines: number;        // 消除行數
  landingHeight: number; // 落點高度（方塊中心離底床的高度，消行前）
  erodedCells: number;  // 消行數 ×（本塊位於被消行內的格數）
}

/** 把 (type,rotation,x) 從頂端直落到底、鎖定、消行。無法放置回傳 null。 */
export function dropPlacement(
  board: Matrix,
  type: PieceType,
  rotation: Rotation,
  x: number,
): DropResult | null {
  let piece: ActivePiece = { type, rotation, x, y: 0 };
  if (!canPlace(board, piece)) return null;
  while (canPlace(board, { ...piece, y: piece.y + 1 })) piece = { ...piece, y: piece.y + 1 };

  const cells = getCells(piece);
  let minY = TOTAL_HEIGHT;
  let maxY = -1;
  for (const c of cells) {
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }
  const landingHeight = TOTAL_HEIGHT - 1 - (minY + maxY) / 2;

  const locked = lockPiece(board, piece);
  const { board: cleared, rows } = clearLines(locked);
  const lines = rows.length;
  const pieceCellsErased = cells.reduce((n, c) => n + (rows.includes(c.y) ? 1 : 0), 0);
  return { board: cleared, lines, landingHeight, erodedCells: lines * pieceCellsErased };
}

/** Dellacherie 落子評分。越高越好。 */
export function scoreDrop(r: DropResult): number {
  const f = evaluateBoard(r.board);
  return (
    W_LANDING * r.landingHeight +
    W_ERODED * r.erodedCells +
    W_ROW_T * f.rowTransitions +
    W_COL_T * f.colTransitions +
    W_HOLES * f.holes +
    W_WELLS * f.wells
  );
}

export interface ScoredPlacement { placement: Placement; score: number; }

/** 枚舉所有旋轉 × 欄位的直落落點，回傳最高分落點與分數。確定性 tie-break（先 rotation、後 x）。 */
export function bestPlacementScored(board: Matrix, type: PieceType): ScoredPlacement | null {
  let best: ScoredPlacement | null = null;
  for (let rotation = 0 as Rotation; rotation < 4; rotation = (rotation + 1) as Rotation) {
    for (let x = -2; x <= BOARD_WIDTH; x++) {
      const res = dropPlacement(board, type, rotation, x);
      if (!res) continue;
      const score = scoreDrop(res);
      if (!best || score > best.score) best = { placement: { rotation, x }, score };
    }
  }
  return best;
}

/** 相容介面：只回傳最佳落點。 */
export function bestPlacement(board: Matrix, type: PieceType): Placement | null {
  return bestPlacementScored(board, type)?.placement ?? null;
}

export interface DecideInput {
  board: Matrix;
  current: PieceType;
  hold: PieceType | null;   // hold 槽現有方塊（null = 空）
  next: PieceType | null;   // next[0]（hold 為空時 hold 會換到這塊）
  canHold: boolean;         // 本塊是否還能 hold（每塊限一次）
}

export interface Decision {
  useHold: boolean;
  placement: Placement; // useHold 時為換出方塊（hold 或 next）的落點
}

/**
 * hold 意識決策：同時評估「當前塊最佳落點」與「hold 換塊後（hold 有塊=swap、
 * 空=用 next[0]）最佳落點」，hold 路徑嚴格較優才換（平手留在當前塊，避免無謂 hold）。
 */
export function decide(input: DecideInput): Decision | null {
  const cur = bestPlacementScored(input.board, input.current);

  let alt: ScoredPlacement | null = null;
  if (input.canHold) {
    const altType = input.hold ?? input.next;
    if (altType && altType !== input.current) {
      alt = bestPlacementScored(input.board, altType);
    }
  }

  if (alt && (!cur || alt.score > cur.score)) return { useHold: true, placement: alt.placement };
  return cur ? { useHold: false, placement: cur.placement } : null;
}
