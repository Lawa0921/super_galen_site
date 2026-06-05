import { describe, it, expect } from 'vitest';
import { evaluateBoard, scoreBoard, dropPlacement, bestPlacement } from './bot';
import { createBoard } from '../engine/board';
import { canPlace } from '../engine/board';
import { getCells, spawnPiece } from '../engine/piece';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';
import type { PieceType } from '../engine/types';

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

describe('dropPlacement', () => {
  it('在空盤直落 O 到底，回傳鎖定後盤面與 0 消行', () => {
    const res = dropPlacement(createBoard(), 'O', 0, 4);
    expect(res).not.toBeNull();
    expect(res!.lines).toBe(0);
    // O 落到最底兩列
    expect(res!.board[TOTAL_HEIGHT - 1][4]).toBe('O');
    expect(res!.board[TOTAL_HEIGHT - 1][5]).toBe('O');
  });
  it('越界的 x 回傳 null', () => {
    expect(dropPlacement(createBoard(), 'O', 0, -5)).toBeNull();
    expect(dropPlacement(createBoard(), 'O', 0, BOARD_WIDTH)).toBeNull();
  });
});

describe('bestPlacement', () => {
  it('對每種方塊在空盤都回傳一個合法落點', () => {
    const types: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (const t of types) {
      const p = bestPlacement(createBoard(), t);
      expect(p).not.toBeNull();
      // 該落點以 spawn 旋轉/欄位放在頂端應可放
      expect(canPlace(createBoard(), { type: t, rotation: p!.rotation, x: p!.x, y: 0 })).toBe(true);
    }
  });

  it('能消行時會選擇消行的落點', () => {
    // 底列只缺第 0 欄；直立 I 落在第 0 欄可消 1 行
    const b = createBoard();
    const last = TOTAL_HEIGHT - 1;
    for (let x = 1; x < BOARD_WIDTH; x++) b[last][x] = 'G';
    const p = bestPlacement(b, 'I');
    expect(p).not.toBeNull();
    const res = dropPlacement(b, 'I', p!.rotation, p!.x);
    expect(res!.lines).toBeGreaterThanOrEqual(1);
  });

  it('同盤面同方塊回傳相同落點（確定性）', () => {
    const b = createBoard();
    expect(bestPlacement(b, 'T')).toEqual(bestPlacement(b, 'T'));
  });
});
