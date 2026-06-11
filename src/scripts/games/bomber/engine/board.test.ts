import { describe, it, expect } from 'vitest';
import { tileAt, isWalkable, breakCrate } from './board';
import type { Grid } from './types';

function grid3(): Grid {
  return [
    ['wall', 'wall', 'wall'],
    ['wall', 'floor', 'crate'],
    ['wall', 'wall', 'wall'],
  ];
}

describe('tileAt', () => {
  it('界外回傳 wall', () => {
    expect(tileAt(grid3(), -1, 0)).toBe('wall');
    expect(tileAt(grid3(), 0, 99)).toBe('wall');
  });
  it('界內回傳該格', () => {
    expect(tileAt(grid3(), 1, 1)).toBe('floor');
    expect(tileAt(grid3(), 2, 1)).toBe('crate');
  });
});

describe('isWalkable', () => {
  it('只有 floor 可走', () => {
    expect(isWalkable(grid3(), 1, 1)).toBe(true);
    expect(isWalkable(grid3(), 0, 0)).toBe(false); // wall
    expect(isWalkable(grid3(), 2, 1)).toBe(false); // crate
  });
});

describe('breakCrate', () => {
  it('把 crate 變成 floor，回傳新 grid 不改原本', () => {
    const g = grid3();
    const next = breakCrate(g, 2, 1);
    expect(next[1][2]).toBe('floor');
    expect(g[1][2]).toBe('crate'); // 原 grid 不變
  });
});
