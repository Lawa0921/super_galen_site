import { describe, it, expect, afterEach } from 'vitest';
import { cellToPixel, pieceTint, setSkinTints, chooseLayout, GARBAGE_TINT } from './layout';
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

describe('setSkinTints（皮膚調色覆蓋）', () => {
  afterEach(() => setSkinTints(null)); // 隔離：每例後還原預設

  it('覆蓋指定 piece、其餘維持預設', () => {
    const defaultO = pieceTint('O');
    setSkinTints({ I: 0x123456 });
    expect(pieceTint('I')).toBe(0x123456);
    expect(pieceTint('O')).toBe(defaultO);
  });

  it('setSkinTints(null) 還原所有預設', () => {
    const defaultI = pieceTint('I');
    setSkinTints({ I: 0x123456, T: 0xabcdef });
    expect(pieceTint('T')).toBe(0xabcdef);
    setSkinTints(null);
    expect(pieceTint('I')).toBe(defaultI);
  });
});

describe('chooseLayout', () => {
  it('寬螢幕用 symmetric、窄螢幕用 focus', () => {
    expect(chooseLayout(1280)).toBe('symmetric');
    expect(chooseLayout(700)).toBe('focus');
  });
});
