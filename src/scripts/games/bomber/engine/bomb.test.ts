// bomb.test.ts
import { describe, it, expect } from 'vitest';
import { resolveChain } from './bomb';
import type { Grid, Bomb } from './types';

function openGrid(w = 7, h = 3): Grid {
  const g: Grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(y === 0 || y === h - 1 || x === 0 || x === w - 1 ? 'wall' : 'floor');
    g.push(row as Grid[number]);
  }
  return g;
}

describe('resolveChain', () => {
  it('單顆炸彈：只消耗自己', () => {
    const bombs: Bomb[] = [{ x: 1, y: 1, fuseMs: 0, range: 1 }];
    const r = resolveChain(openGrid(), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(1);
  });
  it('相鄰另一顆在爆風內 -> 連鎖一起爆', () => {
    const bombs: Bomb[] = [
      { x: 1, y: 1, fuseMs: 0, range: 2 },
      { x: 3, y: 1, fuseMs: 1500, range: 1 }, // 還沒到引信，但在第一顆爆風內
    ];
    const r = resolveChain(openGrid(), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(2);
    const keys = new Set(r.cells.map((c) => `${c.x},${c.y}`));
    expect(keys.has('4,1')).toBe(true); // 第二顆的爆風延伸到
  });
  it('範圍外的炸彈不被連鎖', () => {
    const bombs: Bomb[] = [
      { x: 1, y: 1, fuseMs: 0, range: 1 },
      { x: 5, y: 1, fuseMs: 1500, range: 1 },
    ];
    const r = resolveChain(openGrid(9, 3), bombs, [bombs[0]]);
    expect(r.consumed).toHaveLength(1);
  });
  it('兩顆炸彈爆同一箱：brokenCrates 不重複', () => {
    const g = openGrid(9, 3);
    g[1][4] = 'crate';
    const bombs: Bomb[] = [
      { x: 1, y: 1, fuseMs: 0, range: 4 },
      { x: 7, y: 1, fuseMs: 0, range: 4 },
    ];
    const r = resolveChain(g, bombs, [...bombs]);
    const seen = new Set(r.brokenCrates.map((c) => `${c.x},${c.y}`));
    expect(r.brokenCrates).toHaveLength(seen.size);
  });
});
