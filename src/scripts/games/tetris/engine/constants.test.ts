import { describe, it, expect } from 'vitest';
import {
  BOARD_WIDTH, VISIBLE_HEIGHT, BUFFER_ROWS, TOTAL_HEIGHT,
  PIECE_TYPES, SHAPES, SPAWN, KICKS_JLSTZ, KICKS_I,
} from './constants';

describe('constants', () => {
  it('盤面尺寸正確', () => {
    expect(BOARD_WIDTH).toBe(10);
    expect(VISIBLE_HEIGHT).toBe(20);
    expect(BUFFER_ROWS).toBe(2);
    expect(TOTAL_HEIGHT).toBe(22);
  });

  it('七種方塊都有 4 個旋轉態、每態 4 個 cell', () => {
    expect(PIECE_TYPES).toHaveLength(7);
    for (const type of PIECE_TYPES) {
      for (let r = 0 as 0 | 1 | 2 | 3; r < 4; r++) {
        expect(SHAPES[type][r as 0 | 1 | 2 | 3]).toHaveLength(4);
      }
    }
  });

  it('每個方塊都有 spawn 位置', () => {
    for (const type of PIECE_TYPES) {
      expect(SPAWN[type]).toHaveProperty('x');
      expect(SPAWN[type]).toHaveProperty('y');
    }
  });

  it('踢牆表 8 種轉換、每種 5 個候選 offset', () => {
    const keys = ['0>1', '1>0', '1>2', '2>1', '2>3', '3>2', '3>0', '0>3'];
    for (const k of keys) {
      expect(KICKS_JLSTZ[k]).toHaveLength(5);
      expect(KICKS_I[k]).toHaveLength(5);
    }
  });
});
