import { describe, it, expect } from 'vitest';
import { cellToPixel, pieceTint, chooseLayout, GARBAGE_TINT } from './layout';
import { BUFFER_ROWS } from '../engine/constants';

describe('cellToPixel', () => {
  it('把盤面格 (x,y) 換成像素左上角，並扣掉緩衝列', () => {
    // origin (100,50), cellSize 30；可見列從 BUFFER_ROWS 起算
    const p = cellToPixel(0, BUFFER_ROWS, 30, { x: 100, y: 50 });
    expect(p).toEqual({ x: 100, y: 50 }); // 第一個可見列對齊 origin.y
    const p2 = cellToPixel(2, BUFFER_ROWS + 1, 30, { x: 100, y: 50 });
    expect(p2).toEqual({ x: 160, y: 80 });
  });
});

describe('pieceTint', () => {
  it('七種方塊各有固定顏色，且為數字色碼', () => {
    for (const t of ['I','O','T','S','Z','J','L'] as const) {
      expect(typeof pieceTint(t)).toBe('number');
    }
    expect(pieceTint('I')).not.toBe(pieceTint('O'));
    expect(GARBAGE_TINT).toBeTypeOf('number');
  });
});

describe('chooseLayout', () => {
  it('寬螢幕用 symmetric、窄螢幕用 focus', () => {
    expect(chooseLayout(1280)).toBe('symmetric');
    expect(chooseLayout(700)).toBe('focus');
  });
});
