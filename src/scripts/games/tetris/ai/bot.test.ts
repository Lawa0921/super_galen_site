import { describe, it, expect } from 'vitest';
import { evaluateBoard, scoreBoard } from './bot';
import { createBoard } from '../engine/board';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';

describe('evaluateBoard', () => {
  it('空盤：高度/洞/崎嶇/消行皆 0', () => {
    const f = evaluateBoard(createBoard());
    expect(f).toEqual({ aggregateHeight: 0, holes: 0, bumpiness: 0, completeLines: 0 });
  });

  it('單欄疊兩格 → 高度2、崎嶇2（與相鄰兩側各差2，但只算相鄰對）', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last][0] = 'I';
    b[last - 1][0] = 'I';
    const f = evaluateBoard(b);
    expect(f.aggregateHeight).toBe(2);
    // 欄0高2、欄1高0 → |2-0|=2；其餘相鄰皆0
    expect(f.bumpiness).toBe(2);
    expect(f.holes).toBe(0);
  });

  it('頂端有格、其下為空 → 算一個洞', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    b[last - 1][3] = 'I'; // 上方有方塊
    // (last,3) 為空 → 洞 1
    expect(evaluateBoard(b).holes).toBe(1);
  });

  it('填滿底列 → completeLines 1', () => {
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 0; x < BOARD_WIDTH; x++) b[last][x] = 'I';
    expect(evaluateBoard(b).completeLines).toBe(1);
  });
});

describe('scoreBoard', () => {
  it('消行越多分越高', () => {
    const b = createBoard();
    expect(scoreBoard(b, 4)).toBeGreaterThan(scoreBoard(b, 0));
  });
  it('有洞分數較低', () => {
    const flat = createBoard();
    const holed = createBoard();
    const last = TOTAL_HEIGHT - 1;
    holed[last - 1][3] = 'I'; // 製造一個洞 + 高度
    expect(scoreBoard(holed, 0)).toBeLessThan(scoreBoard(flat, 0));
  });
});
