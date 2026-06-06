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

import { lockPiece, clearLines } from './board';

describe('lockPiece', () => {
  it('回傳新盤面並把方塊格子寫成其顏色（不改原盤）', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'O', rotation: 0, x: 4, y: 0 };
    const next = lockPiece(b, p);
    expect(next[0][4]).toBe('O');
    expect(next[0][5]).toBe('O');
    expect(next[1][4]).toBe('O');
    expect(next[1][5]).toBe('O');
    expect(b[0][4]).toBe(null); // 原盤不變（immutable）
  });
});

describe('clearLines', () => {
  it('清掉填滿的列、上方下移、回傳被清列索引', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) b[last][x] = 'I'; // 填滿最底列
    b[last - 1][0] = 'T'; // 上方留一格

    const { board: cleared, rows } = clearLines(b);
    expect(rows).toEqual([last]);
    expect(cleared[last][0]).toBe('T'); // 原本上方那格掉到最底
    expect(cleared[last].slice(1).every((c) => c === null)).toBe(true);
  });

  it('沒有滿列時回傳空陣列且盤面不變', () => {
    const b = createBoard();
    b[TOTAL_HEIGHT - 1][0] = 'I';
    const { rows } = clearLines(b);
    expect(rows).toEqual([]);
  });

  it('一次清除多列', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) {
      b[last][x] = 'I';
      b[last - 1][x] = 'I';
    }
    const { rows } = clearLines(b);
    expect(rows.sort((a, c) => a - c)).toEqual([last - 1, last]);
  });
});

import { insertGarbage } from './board';

describe('insertGarbage', () => {
  it('從底部插入 n 列垃圾、原內容上移、垃圾列含一個洞', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last][3] = 'T'; // 底部放一格做位移標記

    const next = insertGarbage(b, 2, 4); // 插 2 列、洞在第 4 欄
    // 原底列內容被往上推 2 列
    expect(next[last - 2][3]).toBe('T');
    // 新底 2 列為垃圾，洞欄為 null、其餘為 'G'
    for (const y of [last, last - 1]) {
      expect(next[y][4]).toBe(null);
      expect(next[y][0]).toBe('G');
      expect(next[y].filter((c) => c === 'G')).toHaveLength(BOARD_WIDTH - 1);
    }
  });

  it('插入 0 列時盤面不變', () => {
    const b = createBoard();
    b[TOTAL_HEIGHT - 1][0] = 'I';
    const next = insertGarbage(b, 0, 2);
    expect(next[TOTAL_HEIGHT - 1][0]).toBe('I');
  });
});
