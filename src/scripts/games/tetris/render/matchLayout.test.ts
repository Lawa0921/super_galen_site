import { describe, it, expect } from 'vitest';
import { computeMatchLayout, HOLD_W_CELLS } from './matchLayout';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';
import type { Point } from './layout';

interface Rect { x: number; y: number; w: number; h: number }

/** 兩矩形是否重疊（嚴格相交，邊貼齊不算重疊）。 */
function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
const boardRect = (o: Point, cs: number): Rect => ({ x: o.x, y: o.y, w: cs * BOARD_WIDTH, h: cs * VISIBLE_HEIGHT });
/** HOLD 框 AABB：寬 = HOLD_W_CELLS 格；高保守取滿盤高（鐵則：水平就要完全分離）。 */
const holdRect = (a: Point, cs: number): Rect => ({ x: a.x, y: a.y, w: cs * HOLD_W_CELLS, h: cs * VISIBLE_HEIGHT });

describe('computeMatchLayout：本機側 HOLD 拆到盤左（G2）', () => {
  it('localSide=A（預設）：a.holdAnchor 在 A 盤左、與兩盤/計量條不相交、不出畫面；NEXT 留盤右；對手側無 holdAnchor', () => {
    for (const [w, h] of [[1280, 720], [1024, 600], [1600, 900]] as const) {
      const lay = computeMatchLayout(w, h);
      const cs = lay.cellSize;
      expect(lay.a.holdAnchor, `${w}x${h}: 本機側應有 holdAnchor`).toBeDefined();
      const hr = holdRect(lay.a.holdAnchor!, cs);
      expect(hr.x, `${w}x${h}: HOLD 不可出畫面`).toBeGreaterThanOrEqual(0);
      expect(hr.x + hr.w, `${w}x${h}: HOLD 整塊應在 A 盤左`).toBeLessThanOrEqual(lay.a.origin.x);
      expect(overlaps(hr, boardRect(lay.a.origin, cs)), `${w}x${h}: HOLD 與 A 盤重疊`).toBe(false);
      expect(overlaps(hr, boardRect(lay.b.origin, cs)), `${w}x${h}: HOLD 與 B 盤重疊`).toBe(false);
      expect(overlaps(hr, lay.meter), `${w}x${h}: HOLD 與計量條重疊`).toBe(false);
      // NEXT/分數欄留在盤右
      expect(lay.a.hudAnchor.x).toBeGreaterThanOrEqual(lay.a.origin.x + cs * BOARD_WIDTH);
      // 對手側維持單欄堆疊現狀
      expect(lay.b.holdAnchor).toBeUndefined();
    }
  });

  it('localSide=B：b.holdAnchor 在 B 盤左、NEXT 欄在 B 盤右且不出畫面；A 側維持現狀', () => {
    const stageW = 1280;
    const lay = computeMatchLayout(stageW, 720, 'B');
    const cs = lay.cellSize;
    expect(lay.b.holdAnchor).toBeDefined();
    const hr = holdRect(lay.b.holdAnchor!, cs);
    expect(hr.x + hr.w, 'HOLD 整塊應在 B 盤左').toBeLessThanOrEqual(lay.b.origin.x);
    expect(overlaps(hr, boardRect(lay.a.origin, cs)), 'HOLD 與 A 盤重疊').toBe(false);
    expect(overlaps(hr, boardRect(lay.b.origin, cs)), 'HOLD 與 B 盤重疊').toBe(false);
    expect(overlaps(hr, lay.meter), 'HOLD 與計量條重疊').toBe(false);
    expect(lay.b.hudAnchor.x, 'NEXT 留 B 盤右').toBeGreaterThanOrEqual(lay.b.origin.x + cs * BOARD_WIDTH);
    expect(lay.b.hudAnchor.x + cs * HOLD_W_CELLS, 'NEXT 欄不可出畫面').toBeLessThanOrEqual(stageW);
    expect(lay.a.holdAnchor).toBeUndefined();
  });
});
