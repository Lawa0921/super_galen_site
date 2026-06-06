import { describe, it, expect } from 'vitest';
import {
  GRID_COLS, GRID_ROWS, SPAWN, BOMB_FUSE_MS, BLAST_TTL_MS,
  BASE_FIRE, BASE_BOMBS, MAX_FIRE, MAX_BOMBS, SPEED_MS, START_LIVES, INVULN_MS,
} from './constants';

describe('constants', () => {
  it('使用奇數格寬高，讓柱子陣列成立', () => {
    expect(GRID_COLS % 2).toBe(1);
    expect(GRID_ROWS % 2).toBe(1);
  });
  it('出生點在左上內側 (1,1)', () => {
    expect(SPAWN).toEqual({ x: 1, y: 1 });
  });
  it('速度表由慢到快、至少 1 階', () => {
    expect(SPEED_MS.length).toBeGreaterThan(0);
    for (let i = 1; i < SPEED_MS.length; i++) expect(SPEED_MS[i]).toBeLessThan(SPEED_MS[i - 1]);
  });
  it('火力與炸彈有合理上下限', () => {
    expect(BASE_FIRE).toBe(1);
    expect(BASE_BOMBS).toBe(1);
    expect(MAX_FIRE).toBeGreaterThan(BASE_FIRE);
    expect(MAX_BOMBS).toBeGreaterThan(BASE_BOMBS);
  });
  it('引信、爆風、命數、無敵時間皆為正', () => {
    for (const v of [BOMB_FUSE_MS, BLAST_TTL_MS, START_LIVES, INVULN_MS]) expect(v).toBeGreaterThan(0);
  });
});
