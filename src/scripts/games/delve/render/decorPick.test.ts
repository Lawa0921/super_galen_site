// decorPick.test.ts — 圖集裝飾欄位：蜘蛛網的角落 / 變體、季節植物的季節欄位。
import { describe, it, expect } from 'vitest';
import { T } from '../engine/tiles';
import { DAYS_PER_SEASON } from '../engine/calendar';
import { DECOR_STYLES, FRAME_COLS, decorStyle } from './autotile';
import {
  COBWEB_CORNER, COBWEB_VARIANTS, SEASONAL_DECOR, cobwebCorner, decorColumns, decorStyleAt, seasonalColumn,
} from './decorPick';

/** 鄰格：key 'dx,dy' → tile；沒列到的 = 空氣 */
const at = (m: Record<string, number>) => (dx: number, dy: number): number => m[`${dx},${dy}`] ?? T.AIR;

describe('cobwebCorner', () => {
  it('天花板 + 牆 → 掛在那個上角', () => {
    expect(cobwebCorner(at({ '0,-1': T.STONE, '-1,0': T.STONE }), 0)).toBe(COBWEB_CORNER.TL);
    expect(cobwebCorner(at({ '0,-1': T.STONE, '1,0': T.STONE }), 0)).toBe(COBWEB_CORNER.TR);
  });
  it('地板 + 牆 → 下角', () => {
    expect(cobwebCorner(at({ '0,1': T.STONE, '-1,0': T.STONE }), 0)).toBe(COBWEB_CORNER.BL);
    expect(cobwebCorner(at({ '0,1': T.STONE, '1,0': T.STONE }), 0)).toBe(COBWEB_CORNER.BR);
  });
  it('只有一面牆 → 掛在牆的上角；只有天花板 → 依雜湊挑左右上角', () => {
    expect(cobwebCorner(at({ '-1,0': T.STONE }), 3)).toBe(COBWEB_CORNER.TL);
    expect(cobwebCorner(at({ '1,0': T.STONE }), 3)).toBe(COBWEB_CORNER.TR);
    const up = [0, 1, 2, 3].map((h) => cobwebCorner(at({ '0,-1': T.STONE }), h));
    expect(new Set(up)).toEqual(new Set([COBWEB_CORNER.TL, COBWEB_CORNER.TR]));
  });
});

describe('decorStyleAt', () => {
  const day = 0;
  it('蜘蛛網：欄位 = 角落 + 4 × 變體，與 decorStyle 的舊欄位相容（左牆 → 0、右牆 → 1 的同一角）', () => {
    const n = at({ '-1,0': T.STONE, '0,-1': T.STONE });
    const c = decorStyleAt(T.COBWEB, 5, 9, n, day, 0);
    expect(c % 4).toBe(COBWEB_CORNER.TL);
    expect(Math.floor(c / 4)).toBeLessThan(COBWEB_VARIANTS);
    expect(decorStyle(T.COBWEB, 5, 9, n) % 4).toBe(COBWEB_CORNER.TL);
    // 不同座標會挑到不同變體
    const vs = new Set<number>();
    for (let x = 0; x < 40; x++) vs.add(Math.floor(decorStyleAt(T.COBWEB, x, 3, n, day, 0) / 4));
    expect(vs.size).toBe(COBWEB_VARIANTS);
  });
  it('季節植物：地表附近 → 欄位 = style + 季節 × styles；同一格每季不同', () => {
    for (const id of SEASONAL_DECOR) {
      const styles = DECOR_STYLES[id];
      const cols = new Set<number>();
      // 每季過渡完之後（第 6 天）
      for (let s = 0; s < 4; s++) {
        const c = decorStyleAt(id, 12, 50, at({ '0,1': T.GRASS }), s * DAYS_PER_SEASON + 5, 50);
        expect(c % styles).toBe(decorStyle(id, 12, 50, at({ '0,1': T.GRASS })));
        cols.add(Math.floor(c / styles));
      }
      expect(cols.size, `${id}`).toBe(4);
    }
  });
  it('深處（地表以下很多格）的季節植物不換季：固定用夏天欄', () => {
    const c = decorStyleAt(T.FERN, 12, 200, at({}), 3 * DAYS_PER_SEASON + 5, 50);
    expect(Math.floor(c / DECOR_STYLES[T.FERN])).toBe(1);
  });
  it('其他裝飾 = decorStyle 原值', () => {
    expect(decorStyleAt(T.CRYSTAL, 5, 5, at({ '0,1': T.STONE }), 0, 0)).toBe(decorStyle(T.CRYSTAL, 5, 5, at({ '0,1': T.STONE })));
  });
});

describe('decorColumns / seasonalColumn', () => {
  it('每種裝飾的欄數 ≤ 圖集寬', () => {
    for (const k of Object.keys(DECOR_STYLES)) expect(decorColumns(Number(k))).toBeLessThanOrEqual(FRAME_COLS);
    expect(decorColumns(T.COBWEB)).toBe(4 * COBWEB_VARIANTS);
    expect(decorColumns(T.BUSH)).toBe(4 * DECOR_STYLES[T.BUSH]);
    expect(decorColumns(T.CHEST)).toBe(DECOR_STYLES[T.CHEST]);
  });
  it('seasonalColumn 拆回 (style, season)', () => {
    const c = seasonalColumn(T.CACTUS, 3, 2);
    expect(c).toBe(3 + 2 * DECOR_STYLES[T.CACTUS]);
  });
});
