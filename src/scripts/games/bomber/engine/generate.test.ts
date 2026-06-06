import { describe, it, expect } from 'vitest';
import { generateFloor } from './generate';
import { GRID_COLS, GRID_ROWS, SPAWN, BASE_ENEMY_COUNT } from './constants';
import { tileAt } from './board';

describe('generateFloor', () => {
  it('外框皆為 wall', () => {
    const { grid } = generateFloor(1, 1);
    for (let x = 0; x < GRID_COLS; x++) { expect(grid[0][x]).toBe('wall'); expect(grid[GRID_ROWS - 1][x]).toBe('wall'); }
    for (let y = 0; y < GRID_ROWS; y++) { expect(grid[y][0]).toBe('wall'); expect(grid[y][GRID_COLS - 1]).toBe('wall'); }
  });
  it('內側偶數座標為不可炸柱子', () => {
    const { grid } = generateFloor(1, 1);
    for (let y = 2; y < GRID_ROWS - 1; y += 2)
      for (let x = 2; x < GRID_COLS - 1; x += 2) expect(grid[y][x]).toBe('wall');
  });
  it('出生點與其兩鄰格淨空（可走）', () => {
    const { grid } = generateFloor(1, 1);
    expect(tileAt(grid, SPAWN.x, SPAWN.y)).toBe('floor');
    expect(tileAt(grid, SPAWN.x + 1, SPAWN.y)).toBe('floor');
    expect(tileAt(grid, SPAWN.x, SPAWN.y + 1)).toBe('floor');
  });
  it('同 seed/floor 完全可重現', () => {
    expect(JSON.stringify(generateFloor(123, 2))).toEqual(JSON.stringify(generateFloor(123, 2)));
  });
  it('第 1 層敵人數 = BASE_ENEMY_COUNT，且都站在 floor 上、不在出生格', () => {
    const { grid, enemies } = generateFloor(1, 1);
    expect(enemies).toHaveLength(BASE_ENEMY_COUNT);
    for (const e of enemies) {
      expect(grid[e.y][e.x]).toBe('floor');
      expect(e.x === SPAWN.x && e.y === SPAWN.y).toBe(false);
    }
  });
  it('深層敵人更多（floor 5 > floor 1）', () => {
    expect(generateFloor(1, 5).enemies.length).toBeGreaterThan(generateFloor(1, 1).enemies.length);
  });
  it('exit 落在可走的 floor 格', () => {
    const { grid, exit } = generateFloor(1, 1);
    expect(grid[exit.y][exit.x]).toBe('floor');
  });
});
