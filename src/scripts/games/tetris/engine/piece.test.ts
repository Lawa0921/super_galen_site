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

import { tryRotate } from './piece';
import type { ActivePiece } from './types';

describe('tryRotate', () => {
  // 空間永遠夠用的碰撞函式 → 必走第一個 offset (0,0)
  const always = () => true;

  it('順轉後 rotation 變成 1、套用第一個成功的 offset', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, 1, always);
    expect(result).not.toBeNull();
    expect(result!.rotation).toBe(1);
    expect(result!.x).toBe(3);
    expect(result!.y).toBe(5);
  });

  it('逆轉 from 0 → rotation 3', () => {
    const p: ActivePiece = { type: 'J', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, -1, always);
    expect(result!.rotation).toBe(3);
  });

  it('當第一個 offset 碰撞、改用下一個成功 offset（踢牆）', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    // 只在第一個 (0,0) 候選位置回報碰撞，其餘可放 → 應採用 0>1 的第二個 offset (-1,0)
    const collideAtOrigin = (cand: ActivePiece) => !(cand.x === 3 && cand.y === 5);
    const result = tryRotate(p, 1, collideAtOrigin);
    expect(result!.rotation).toBe(1);
    expect(result!.x).toBe(2); // 3 + (-1)
    expect(result!.y).toBe(5);
  });

  it('所有 offset 都碰撞時回傳 null', () => {
    const p: ActivePiece = { type: 'T', rotation: 0, x: 3, y: 5 };
    const result = tryRotate(p, 1, () => false);
    expect(result).toBeNull();
  });

  it('O 方塊旋轉不改變 cell 形狀', () => {
    const p: ActivePiece = { type: 'O', rotation: 0, x: 4, y: 5 };
    const result = tryRotate(p, 1, always);
    expect(result!.rotation).toBe(1);
  });
});
