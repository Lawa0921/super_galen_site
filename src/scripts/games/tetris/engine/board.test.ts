import { describe, it, expect } from 'vitest';
import { createBoard, canPlace } from './board';
import { BOARD_WIDTH, TOTAL_HEIGHT } from './constants';
import type { ActivePiece } from './types';

describe('createBoard', () => {
  it('建立 TOTAL_HEIGHT × BOARD_WIDTH 全空盤', () => {
    const b = createBoard();
    expect(b).toHaveLength(TOTAL_HEIGHT);
    expect(b[0]).toHaveLength(BOARD_WIDTH);
    expect(b.every((row) => row.every((c) => c === null))).toBe(true);
  });
});

describe('canPlace', () => {
  it('空盤上方塊可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    expect(canPlace(b, p)).toBe(true);
  });

  it('超出左牆不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: -2, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('超出右牆不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: BOARD_WIDTH - 1, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('超出底部不可放', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: TOTAL_HEIGHT - 1 };
    expect(canPlace(b, p)).toBe(false);
  });

  it('與既有格子重疊不可放', () => {
    const b = createBoard();
    b[1][4] = 'I'; // T R0 在 (3,0) 時佔 (4,0)(3,1)(4,1)(5,1)，與 (4,1) 衝突
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 0 };
    expect(canPlace(b, p)).toBe(false);
  });
});
