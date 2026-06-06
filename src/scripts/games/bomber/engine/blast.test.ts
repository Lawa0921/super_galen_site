// blast.test.ts
import { describe, it, expect } from 'vitest';
import { computeBlast } from './blast';
import type { Grid } from './types';

// 全 floor 內側、外圈 wall（預設 5×5）
function openGrid(w = 5, h = 5): Grid {
  const g: Grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 'wall' : 'floor');
    g.push(row as Grid[number]);
  }
  return g;
}

describe('computeBlast', () => {
  it('range 1 在中央產生十字 5 格', () => {
    const { cells } = computeBlast(openGrid(), 2, 2, 1);
    const keys = cells.map((c) => `${c.x},${c.y}`).sort();
    expect(keys).toEqual(['1,2', '2,1', '2,2', '2,3', '3,2'].sort());
  });
  it('爆風被 wall 擋住、不覆蓋 wall', () => {
    const { cells } = computeBlast(openGrid(), 1, 1, 3); // 左/上都是外框 wall
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('0,1')).toBe(false); // wall 不覆蓋
    expect(keys.has('1,0')).toBe(false);
    expect(keys.has('2,1')).toBe(true);  // 往右可達
  });
  it('遇 crate 炸掉第一個後停住、不穿過', () => {
    // 使用 7×5 網格，(4,2) 為 floor，確保測試能偵測「穿過 crate」的 bug
    const g = openGrid(7, 5);
    g[2][3] = 'crate'; // 中心 (2,2) 右邊一格放箱
    const { cells, brokenCrates } = computeBlast(g, 2, 2, 3);
    const keys = new Set(cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('3,2')).toBe(true);           // 箱本身被涵蓋（會碎）
    expect(brokenCrates).toContainEqual({ x: 3, y: 2 });
    expect(keys.has('4,2')).toBe(false);          // 爆風不穿過 crate，不應到達 (4,2)
  });
});
