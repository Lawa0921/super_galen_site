// src/scripts/games/bomber/versus/arenas.test.ts
import { describe, it, expect } from 'vitest';
import { ARENAS, parseArena } from './arenas';
import { GRID_COLS, GRID_ROWS } from '../engine/constants';

describe('arenas', () => {
  it('共 8 張，id 0-7，各有名稱與主題索引', () => {
    expect(ARENAS).toHaveLength(8);
    ARENAS.forEach((a, i) => {
      expect(a.id).toBe(i);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.theme).toBeGreaterThanOrEqual(0);
      expect(a.theme).toBeLessThanOrEqual(7);
    });
  });

  it('模板尺寸正確且外框全牆', () => {
    for (const a of ARENAS) {
      const { grid } = parseArena(a, 2, 1);
      expect(grid).toHaveLength(GRID_ROWS);
      grid.forEach((row) => expect(row).toHaveLength(GRID_COLS));
      for (let x = 0; x < GRID_COLS; x++) {
        expect(grid[0][x]).toBe('wall');
        expect(grid[GRID_ROWS - 1][x]).toBe('wall');
      }
    }
  });

  it('出生點：2 人場給 2 個、4 人場給 4 個，且彼此距離 >= 8（公平）', () => {
    for (const a of ARENAS) {
      for (const n of [2, 3, 4] as const) {
        const { spawns } = parseArena(a, n, 1);
        expect(spawns).toHaveLength(n);
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const d = Math.abs(spawns[i].x - spawns[j].x) + Math.abs(spawns[i].y - spawns[j].y);
          expect(d, `${a.name} spawns ${i},${j}`).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });

  it('出生點四周 1 格淨空（floor，可起步）', () => {
    for (const a of ARENAS) {
      const { grid, spawns } = parseArena(a, 4, 7);
      for (const s of spawns) {
        expect(grid[s.y][s.x]).toBe('floor');
        const neighbors = [grid[s.y][s.x-1], grid[s.y][s.x+1], grid[s.y-1]?.[s.x], grid[s.y+1]?.[s.x]];
        expect(neighbors.filter((t) => t === 'floor').length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('連通性：任一出生點可達其他所有出生點（非牆 flood fill）', () => {
    for (const a of ARENAS) {
      const { grid, spawns } = parseArena(a, 4, 3);
      const seen = new Set([`${spawns[0].x},${spawns[0].y}`]);
      const q = [spawns[0]];
      while (q.length) {
        const c = q.pop()!;
        for (const [dx, dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
          const k = `${c.x+dx},${c.y+dy}`;
          if (!seen.has(k) && grid[c.y+dy]?.[c.x+dx] && grid[c.y+dy][c.x+dx] !== 'wall') {
            seen.add(k); q.push({ x: c.x+dx, y: c.y+dy });
          }
        }
      }
      for (const s of spawns) expect(seen.has(`${s.x},${s.y}`), a.name).toBe(true);
    }
  });

  it('同 seed 同佈局；不同 seed 的 ? 箱可不同', () => {
    const a = ARENAS[0];
    const g1 = parseArena(a, 2, 42).grid.flat().join('');
    const g2 = parseArena(a, 2, 42).grid.flat().join('');
    expect(g1).toBe(g2);
  });
});
