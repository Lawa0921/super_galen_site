import { describe, it, expect } from 'vitest';
import { evaluateBoard, scoreDrop, dropPlacement, bestPlacement, decide } from './bot';
import { createBoard, canPlace } from '../engine/board';
import { BOARD_WIDTH, TOTAL_HEIGHT } from '../engine/constants';
import type { Matrix, PieceType } from '../engine/types';

const LAST = TOTAL_HEIGHT - 1;

/** 底部 depth 列填滿、只留 wellCol 一欄空（深井盤面）。 */
function boardWithWell(depth: number, wellCol: number): Matrix {
  const b = createBoard();
  for (let y = TOTAL_HEIGHT - depth; y < TOTAL_HEIGHT; y++) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      if (x !== wellCol) b[y][x] = 'G';
    }
  }
  return b;
}

describe('evaluateBoard（Dellacherie 特徵）', () => {
  it('空盤：row transitions = 2×高度、col transitions = 寬度、洞/井 0', () => {
    const f = evaluateBoard(createBoard());
    // 每空列撞左右牆各一次；每空欄到底床一次
    expect(f).toEqual({
      rowTransitions: 2 * TOTAL_HEIGHT,
      colTransitions: BOARD_WIDTH,
      holes: 0,
      wells: 0,
    });
  });

  it('被蓋住的空格算洞，且增加 column transitions', () => {
    const b = createBoard();
    b[LAST - 1][3] = 'I'; // 其下 (LAST,3) 為空 → 洞
    const f = evaluateBoard(b);
    expect(f.holes).toBe(1);
    // 欄3：空→填(+1)→空(+1)→底床(+1) = 3；其他欄各 1
    expect(f.colTransitions).toBe(BOARD_WIDTH - 1 + 3);
  });

  it('棋盤格列的 row transitions 高於實心列', () => {
    const solid = createBoard();
    const checker = createBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) {
      solid[LAST][x] = 'G';
      if (x % 2 === 0) checker[LAST][x] = 'G';
    }
    expect(evaluateBoard(checker).rowTransitions)
      .toBeGreaterThan(evaluateBoard(solid).rowTransitions);
  });

  it('兩側填滿夾一欄深 3 的井 → cumulative wells = 3+2+1 = 6', () => {
    const b = createBoard();
    for (let y = LAST - 2; y <= LAST; y++) {
      b[y][0] = 'G';
      b[y][2] = 'G';
    }
    expect(evaluateBoard(b).wells).toBe(6);
    expect(evaluateBoard(b).holes).toBe(0);
  });
});

describe('dropPlacement', () => {
  it('在空盤直落 O 到底：0 消行、landingHeight 0.5、eroded 0', () => {
    const res = dropPlacement(createBoard(), 'O', 0, 4);
    expect(res).not.toBeNull();
    expect(res!.lines).toBe(0);
    expect(res!.board[LAST][4]).toBe('O');
    expect(res!.board[LAST][5]).toBe('O');
    // O 佔最底兩列，中心高度 (0+1)/2
    expect(res!.landingHeight).toBeCloseTo(0.5);
    expect(res!.erodedCells).toBe(0);
  });

  it('越界的 x 回傳 null', () => {
    expect(dropPlacement(createBoard(), 'O', 0, -5)).toBeNull();
    expect(dropPlacement(createBoard(), 'O', 0, BOARD_WIDTH)).toBeNull();
  });

  it('消行時回報 erodedCells = 消行數 × 本塊被消格數', () => {
    // 底列只缺 x=4,5；O 落下 → 消 1 行、O 有 2 格在該行 → eroded = 2
    const b = createBoard();
    for (let x = 0; x < BOARD_WIDTH; x++) if (x !== 4 && x !== 5) b[LAST][x] = 'G';
    const res = dropPlacement(b, 'O', 0, 4);
    expect(res!.lines).toBe(1);
    expect(res!.erodedCells).toBe(2);
  });
});

describe('scoreDrop', () => {
  it('消行的落法分數高於不消行', () => {
    const b = boardWithWell(1, 0);
    const clearing = dropPlacement(b, 'I', 1, -2)!; // 直立 I 填井 → 消 1 行
    const flat = dropPlacement(b, 'I', 0, 3)!;      // 平放疊上面 → 蓋洞
    expect(clearing.lines).toBe(1);
    expect(flat.lines).toBe(0);
    expect(scoreDrop(clearing)).toBeGreaterThan(scoreDrop(flat));
  });

  it('落點越高分數越低（landing height 懲罰）', () => {
    const empty = createBoard();
    const tall = createBoard();
    for (let y = LAST - 9; y <= LAST; y++) for (let x = 0; x < 4; x++) tall[y][x] = 'G';
    const low = dropPlacement(empty, 'O', 0, 0)!;
    const high = dropPlacement(tall, 'O', 0, 0)!;
    // 疊高處的盤面分數本來就差，至少 landingHeight 特徵要反映高度
    expect(high.landingHeight).toBeGreaterThan(low.landingHeight);
    expect(scoreDrop(high)).toBeLessThan(scoreDrop(low));
  });

  it('製造洞的盤面分數較低', () => {
    const flatBoard = createBoard();
    const holed = createBoard();
    holed[LAST - 1][3] = 'I'; // 一個洞
    const mk = (board: Matrix) => ({ board, lines: 0, landingHeight: 0, erodedCells: 0 });
    expect(scoreDrop(mk(holed))).toBeLessThan(scoreDrop(mk(flatBoard)));
  });
});

describe('bestPlacement', () => {
  it('對每種方塊在空盤都回傳一個合法落點', () => {
    const types: PieceType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (const t of types) {
      const p = bestPlacement(createBoard(), t);
      expect(p).not.toBeNull();
      expect(canPlace(createBoard(), { type: t, rotation: p!.rotation, x: p!.x, y: 0 })).toBe(true);
    }
  });

  it('能消行時會選擇消行的落點', () => {
    const b = boardWithWell(1, 0);
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

describe('decide（hold 意識決策）', () => {
  it('當前 S 很爛、hold 有 I 且有深井 → 選 hold 並用 I 清 4 行', () => {
    const b = boardWithWell(4, 0);
    const d = decide({ board: b, current: 'S', hold: 'I', next: 'T', canHold: true });
    expect(d).not.toBeNull();
    expect(d!.useHold).toBe(true);
    const res = dropPlacement(b, 'I', d!.placement.rotation, d!.placement.x);
    expect(res!.lines).toBe(4);
  });

  it('hold 為空時偷看 next：next 的 I 較優 → hold 建倉換 I', () => {
    const b = boardWithWell(4, 0);
    const d = decide({ board: b, current: 'S', hold: null, next: 'I', canHold: true });
    expect(d!.useHold).toBe(true);
    const res = dropPlacement(b, 'I', d!.placement.rotation, d!.placement.x);
    expect(res!.lines).toBe(4);
  });

  it('canHold = false（本塊已 hold 過）絕不再 hold', () => {
    const b = boardWithWell(4, 0);
    const d = decide({ board: b, current: 'S', hold: 'I', next: 'I', canHold: false });
    expect(d!.useHold).toBe(false);
  });

  it('hold 與當前同型 → 不做無謂 hold', () => {
    const b = boardWithWell(4, 0);
    const d = decide({ board: b, current: 'I', hold: 'I', next: 'T', canHold: true });
    expect(d!.useHold).toBe(false);
  });

  it('當前塊已較優（I vs hold 的 S）→ 不 hold', () => {
    const b = boardWithWell(4, 0);
    const d = decide({ board: b, current: 'I', hold: 'S', next: 'T', canHold: true });
    expect(d!.useHold).toBe(false);
    const res = dropPlacement(b, 'I', d!.placement.rotation, d!.placement.x);
    expect(res!.lines).toBe(4);
  });

  it('決策確定性：同輸入同輸出', () => {
    const b = boardWithWell(2, 5);
    const input = { board: b, current: 'T' as PieceType, hold: 'L' as PieceType, next: 'J' as PieceType, canHold: true };
    expect(decide(input)).toEqual(decide(input));
  });
});
