import { describe, it, expect } from 'vitest';
import { scoreClear, detectTSpin } from './scoring';
import { createBoard } from './board';
import { TOTAL_HEIGHT, BOARD_WIDTH } from './constants';
import type { ActivePiece } from './types';

describe('scoreClear', () => {
  it('一般消行：single/double/triple/tetris × 等級', () => {
    expect(scoreClear({ count: 1, tSpin: 'none', level: 1, b2b: false })).toBe(100);
    expect(scoreClear({ count: 2, tSpin: 'none', level: 1, b2b: false })).toBe(300);
    expect(scoreClear({ count: 3, tSpin: 'none', level: 2, b2b: false })).toBe(1000); // 500*2
    expect(scoreClear({ count: 4, tSpin: 'none', level: 1, b2b: false })).toBe(800);
  });

  it('T-spin full single/double 計分', () => {
    expect(scoreClear({ count: 1, tSpin: 'full', level: 1, b2b: false })).toBe(800);
    expect(scoreClear({ count: 2, tSpin: 'full', level: 1, b2b: false })).toBe(1200);
  });

  it('back-to-back 套用 1.5 倍（無條件捨去）', () => {
    // tetris 800 ×1.5 = 1200
    expect(scoreClear({ count: 4, tSpin: 'none', level: 1, b2b: true })).toBe(1200);
  });

  it('0 行（落地未消）得 0 分', () => {
    expect(scoreClear({ count: 0, tSpin: 'none', level: 5, b2b: false })).toBe(0);
  });
});

describe('detectTSpin', () => {
  it('非 T 方塊一律 none', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'L', rotation: 0, x: 3, y: TOTAL_HEIGHT - 2 };
    expect(detectTSpin(b, p, true)).toBe('none');
  });

  it('最後一步非旋轉時為 none', () => {
    const b = createBoard();
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: TOTAL_HEIGHT - 2 };
    expect(detectTSpin(b, p, false)).toBe('none');
  });

  it('四角有 3 個被佔/出界 → 至少 mini 或 full（非 none）', () => {
    const b = createBoard();
    // 把 T 放在左邊：左兩角靠左牆出界(各算1)，右下角放一格 → 共 3 角
    const p: ActivePiece = { type: 'T', rotation: 2, x: -1, y: TOTAL_HEIGHT - 3 };
    // 四角檢查點為 x∈{-1,1}, y∈{H-3,H-1}；右下角 (1, H-1) 放一格湊到第 3 角
    b[TOTAL_HEIGHT - 1][1] = 'I';
    const result = detectTSpin(b, p, true);
    expect(result).not.toBe('none');
  });
});
