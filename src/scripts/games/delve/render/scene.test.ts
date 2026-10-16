// scene.test.ts — 樹木掃描（樹幹 / 樹冠半徑 / 變體）與天空時段調色。
import { describe, it, expect } from 'vitest';
import { scanTrees, treeVariant, skyColors } from './scene';
import { T } from '../engine/tiles';

function fakeWorld(rows: string[]): (x: number, y: number) => number {
  const map: Record<string, number> = { '.': T.AIR, '|': T.WOOD, '*': T.LEAVES, '#': T.GRASS, 's': T.STONE };
  return (x, y) => (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length ? T.AIR : map[rows[y][x]]);
}

describe('scanTrees', () => {
  const rows = [
    '.......',
    '...*...',
    '..***..',
    '.**|**.',
    '..*|*..',
    '...|...',
    '...|..|',
    '#######',
  ];
  const get = fakeWorld(rows);
  it('找到樹基、樹頂、樹冠半徑、是否著地', () => {
    const trees = scanTrees(get, 0, 0, 7, 8);
    const t = trees.find((q) => q.x === 3)!;
    expect(t).toBeTruthy();
    expect(t.baseY).toBe(6);
    expect(t.topY).toBe(3);
    expect(t.leafR).toBe(2);
    expect(t.grounded).toBe(true);
  });
  it('沒有樹葉的樹樁 leafR = 0', () => {
    const t = scanTrees(get, 0, 0, 7, 8).find((q) => q.x === 6)!;
    expect(t.leafR).toBe(0);
    expect(t.topY).toBe(6);
  });
  it('樹基在掃描範圍下方但樹幹伸進範圍時也找得到', () => {
    const trees = scanTrees(get, 0, 0, 7, 4);
    expect(trees.some((q) => q.x === 3)).toBe(true);
  });
  it('懸空樹幹（下面不是實心）grounded = false', () => {
    const g2 = fakeWorld(['.|.', '.|.', '...']);
    expect(scanTrees(g2, 0, 0, 3, 3)[0].grounded).toBe(false);
  });
});

describe('treeVariant', () => {
  it('依 x 決定、穩定、三種都有', () => {
    const vs = new Set<number>();
    for (let x = 0; x < 60; x++) { const v = treeVariant(x); expect(v).toBe(treeVariant(x)); vs.add(v); }
    expect([...vs].sort()).toEqual([0, 1, 2]);
  });
});

describe('skyColors', () => {
  const lum = (c: number[]): number => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  it('正午比午夜亮，星星只在夜裡', () => {
    const noon = skyColors(0.5), night = skyColors(0);
    expect(lum(noon.top)).toBeGreaterThan(lum(night.top) + 60);
    expect(night.stars).toBeGreaterThan(0.9);
    expect(noon.stars).toBe(0);
  });
  it('黃昏地平線偏暖（紅 > 藍）', () => {
    const dusk = skyColors(0.77);
    expect(dusk.bottom[0]).toBeGreaterThan(dusk.bottom[2]);
  });
  it('一天首尾相接、連續（小步長不跳色）', () => {
    expect(skyColors(0).top).toEqual(skyColors(1).top);
    for (let d = 0; d < 1; d += 0.01) {
      const a = skyColors(d).top, b = skyColors(d + 0.01).top;
      expect(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])).toBeLessThan(60);
    }
  });
  it('三層山景色調都有回傳', () => {
    const c = skyColors(0.3);
    expect(c.layers).toHaveLength(3);
    for (const l of c.layers) expect(l).toHaveLength(3);
  });
});
