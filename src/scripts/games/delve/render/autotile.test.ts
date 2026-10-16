// autotile.test.ts — 鄰格遮罩 → 框線影格、內角、材質混合、草邊。
import { describe, it, expect } from 'vitest';
import {
  EDGE, CORNER, edgeMask, innerCornerMask, blendMat, blendOverlay, frameColumn, FRAME_COLS, MAT,
  grassEdges, isOpen,
} from './autotile';
import { T } from '../engine/tiles';

/** 3×3 鄰域工具：rows 由上到下，'#' = 實心石、'.' = 空氣 */
function hood(rows: string[]): (dx: number, dy: number) => number {
  return (dx, dy) => (rows[dy + 1][dx + 1] === '#' ? T.STONE : T.AIR);
}

describe('isOpen', () => {
  it('非實心格（空氣、火把、樹幹、樹葉、工作台）都算開口', () => {
    for (const t of [T.AIR, T.TORCH, T.WOOD, T.LEAVES, T.WORKBENCH]) expect(isOpen(t)).toBe(true);
    for (const t of [T.DIRT, T.GRASS, T.STONE, T.SAND, T.PLANKS, T.COPPER_ORE, T.IRON_ORE]) expect(isOpen(t)).toBe(false);
  });
});

describe('edgeMask', () => {
  it('四面被包住 = 0', () => {
    expect(edgeMask(hood(['###', '###', '###']))).toBe(0);
  });
  it('只有上方開口 = UP', () => {
    expect(edgeMask(hood(['...', '###', '###']))).toBe(EDGE.UP);
  });
  it('左上外角 = UP|LEFT', () => {
    expect(edgeMask(hood(['...', '.##', '.##']))).toBe(EDGE.UP | EDGE.LEFT);
  });
  it('孤立方塊 = 15，斜角不影響', () => {
    expect(edgeMask(hood(['#.#', '.#.', '#.#']))).toBe(15);
  });
  it('每種 4 鄰組合都對應唯一 0..15', () => {
    const seen = new Set<number>();
    for (let m = 0; m < 16; m++) {
      const rows = ['.' + (m & 1 ? '.' : '#') + '.', (m & 8 ? '.' : '#') + '#' + (m & 2 ? '.' : '#'), '.' + (m & 4 ? '.' : '#') + '.'];
      seen.add(edgeMask(hood(rows)));
    }
    expect(seen.size).toBe(16);
  });
});

describe('innerCornerMask', () => {
  it('上與左都是實心但左上斜角是空 → TL 內角', () => {
    expect(innerCornerMask(hood(['.##', '###', '###']))).toBe(CORNER.TL);
  });
  it('四個斜角都空、四邊實心 → 四個內角', () => {
    expect(innerCornerMask(hood(['.#.', '###', '.#.']))).toBe(CORNER.TL | CORNER.TR | CORNER.BR | CORNER.BL);
  });
  it('其中一邊開口時不算內角（那是外緣）', () => {
    expect(innerCornerMask(hood(['...', '###', '###']))).toBe(0);
    expect(innerCornerMask(hood(['.#.', '.##', '###']))).toBe(CORNER.TR);
  });
});

describe('材質混合', () => {
  it('材質分類', () => {
    expect(blendMat(T.DIRT)).toBe(MAT.DIRT);
    expect(blendMat(T.GRASS)).toBe(MAT.DIRT);
    expect(blendMat(T.STONE)).toBe(MAT.STONE);
    expect(blendMat(T.COPPER_ORE)).toBe(MAT.STONE);
    expect(blendMat(T.IRON_ORE)).toBe(MAT.STONE);
    expect(blendMat(T.SAND)).toBe(MAT.SAND);
    expect(blendMat(T.PLANKS)).toBe(MAT.NONE);
    expect(blendMat(T.AIR)).toBe(MAT.NONE);
  });
  it('石頭滲入泥土，反之不會', () => {
    expect(blendOverlay(T.DIRT, T.STONE)).toBe(MAT.STONE);
    expect(blendOverlay(T.STONE, T.DIRT)).toBe(MAT.NONE);
  });
  it('沙滲入泥土；石頭滲入沙', () => {
    expect(blendOverlay(T.DIRT, T.SAND)).toBe(MAT.SAND);
    expect(blendOverlay(T.SAND, T.STONE)).toBe(MAT.STONE);
  });
  it('同材質、木板、空氣都不混', () => {
    expect(blendOverlay(T.STONE, T.IRON_ORE)).toBe(MAT.NONE);
    expect(blendOverlay(T.DIRT, T.GRASS)).toBe(MAT.NONE);
    expect(blendOverlay(T.PLANKS, T.STONE)).toBe(MAT.NONE);
    expect(blendOverlay(T.DIRT, T.PLANKS)).toBe(MAT.NONE);
    expect(blendOverlay(T.DIRT, T.AIR)).toBe(MAT.NONE);
  });
});

describe('frameColumn', () => {
  it('mask × 變體 → 唯一欄位', () => {
    const cols = new Set<number>();
    for (let m = 0; m < 16; m++) for (let v = 0; v < 3; v++) cols.add(frameColumn(m, v));
    expect(cols.size).toBe(48);
    expect(Math.max(...cols)).toBe(FRAME_COLS - 1);
    expect(frameColumn(0, 0)).toBe(0);
  });
});

describe('grassEdges', () => {
  it('草地上方開口才長草；側邊開口時草蓋到側面', () => {
    expect(grassEdges(T.GRASS, EDGE.UP)).toEqual({ top: true, left: false, right: false });
    expect(grassEdges(T.GRASS, EDGE.UP | EDGE.LEFT)).toEqual({ top: true, left: true, right: false });
    expect(grassEdges(T.GRASS, EDGE.RIGHT)).toEqual({ top: false, left: false, right: false });
    expect(grassEdges(T.DIRT, EDGE.UP)).toEqual({ top: false, left: false, right: false });
  });
});
