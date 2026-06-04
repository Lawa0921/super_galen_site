import { describe, it, expect } from 'vitest';
import { getCells, spawnPiece } from './piece';
import { SPAWN } from './constants';

describe('getCells', () => {
  it('回傳 4 個絕對座標（box 原點 + 相對 cell）', () => {
    const cells = getCells({ type: 'O', rotation: 0, x: 4, y: 0 });
    expect(cells).toHaveLength(4);
    // O 在 (0,0)(1,0)(0,1)(1,1)，原點 (4,0) → (4,0)(5,0)(4,1)(5,1)
    expect(cells).toEqual([
      { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 4, y: 1 }, { x: 5, y: 1 },
    ]);
  });

  it('T 方塊 spawn 態座標正確', () => {
    const cells = getCells({ type: 'T', rotation: 0, x: 3, y: 0 });
    // T R0: (1,0)(0,1)(1,1)(2,1) + (3,0) → (4,0)(3,1)(4,1)(5,1)
    expect(cells).toEqual([
      { x: 4, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 1 }, { x: 5, y: 1 },
    ]);
  });
});

describe('spawnPiece', () => {
  it('以該方塊的 SPAWN 位置與 rotation 0 建立', () => {
    const p = spawnPiece('L');
    expect(p).toEqual({ type: 'L', rotation: 0, x: SPAWN.L.x, y: SPAWN.L.y });
  });
});
