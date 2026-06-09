import { describe, it, expect } from 'vitest';
import { computeFfaLayout, PLAYER_TINTS, type FfaSlotLayout } from './ffaLayout';
import { BOARD_WIDTH, VISIBLE_HEIGHT } from '../engine/constants';

/** slot 的可見遊玩矩形（AABB）：origin 左上 + cellSize×(10×20)。 */
function rectOf(s: FfaSlotLayout) {
  return {
    x: s.origin.x,
    y: s.origin.y,
    w: s.cellSize * BOARD_WIDTH,
    h: s.cellSize * VISIBLE_HEIGHT,
  };
}

/** 兩矩形是否重疊（嚴格相交，邊貼齊不算重疊）。 */
function overlaps(a: ReturnType<typeof rectOf>, b: ReturnType<typeof rectOf>): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 對所有 slot 兩兩檢查不重疊。 */
function assertNoOverlap(slots: FfaSlotLayout[]): void {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const ra = rectOf(slots[i]);
      const rb = rectOf(slots[j]);
      expect(
        overlaps(ra, rb),
        `slot ${slots[i].id} (${JSON.stringify(ra)}) 與 slot ${slots[j].id} (${JSON.stringify(rb)}) 重疊`,
      ).toBe(false);
    }
  }
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `p${i}`);
}

describe('computeFfaLayout', () => {
  it('N=2：兩盤、不重疊、分居兩側；恰一個 isLocal=true 且為 localId（與 1v1 一致量級）', () => {
    const lay = computeFfaLayout(['p0', 'p1'], 'p1', 1280, 720);
    expect(lay.slots).toHaveLength(2);
    assertNoOverlap(lay.slots);

    const locals = lay.slots.filter((s) => s.isLocal);
    expect(locals).toHaveLength(1);
    expect(locals[0].id).toBe('p1');

    // 各盤 cellSize > 0
    for (const s of lay.slots) expect(s.cellSize).toBeGreaterThan(0);

    // 兩盤分居左右（一個在左半、一個在右半）— 與 1v1 對稱雙盤量級一致
    const [a, b] = lay.slots;
    const centers = [a, b].map((s) => s.origin.x + (s.cellSize * BOARD_WIDTH) / 2).sort((x, y) => x - y);
    expect(centers[0]).toBeLessThan(1280 / 2);
    expect(centers[1]).toBeGreaterThan(1280 / 2);

    // 與 computeMatchLayout 同量級的格大小（1v1 退化路徑）
    expect(a.cellSize).toBe(b.cellSize);
    expect(a.cellSize).toBeGreaterThanOrEqual(20);
  });

  it('N=4：四盤、兩兩矩形不重疊、cellSize>0、恰一 isLocal', () => {
    const lay = computeFfaLayout(ids(4), 'p2', 1280, 720);
    expect(lay.slots).toHaveLength(4);
    assertNoOverlap(lay.slots);
    for (const s of lay.slots) expect(s.cellSize).toBeGreaterThan(0);
    expect(lay.slots.filter((s) => s.isLocal)).toHaveLength(1);
    expect(lay.slots.find((s) => s.isLocal)?.id).toBe('p2');
  });

  it('N=8：八盤、全部互不重疊、cellSize>0、恰一 isLocal=true 且 == localId', () => {
    const lay = computeFfaLayout(ids(8), 'p5', 1600, 900);
    expect(lay.slots).toHaveLength(8);
    assertNoOverlap(lay.slots);
    for (const s of lay.slots) expect(s.cellSize).toBeGreaterThan(0);
    const locals = lay.slots.filter((s) => s.isLocal);
    expect(locals).toHaveLength(1);
    expect(locals[0].id).toBe('p5');
  });

  it('slots 依 playerIds 原始順序排列', () => {
    const order = ['z', 'a', 'm', 'q'];
    const lay = computeFfaLayout(order, 'm', 1280, 720);
    expect(lay.slots.map((s) => s.id)).toEqual(order);
  });

  it('本機盤 cellSize >= 對手盤 cellSize（本機較大或等大）', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const lay = computeFfaLayout(ids(n), 'p0', 1600, 900);
      const local = lay.slots.find((s) => s.isLocal)!;
      const oppMax = Math.max(...lay.slots.filter((s) => !s.isLocal).map((s) => s.cellSize), 0);
      expect(local.cellSize, `N=${n} 本機盤應 >= 對手盤`).toBeGreaterThanOrEqual(oppMax);
    }
  });

  it('localId 不在 playerIds → 預設使用第 0 個玩家為本機', () => {
    const lay = computeFfaLayout(ids(4), 'not-here', 1280, 720);
    const locals = lay.slots.filter((s) => s.isLocal);
    expect(locals).toHaveLength(1);
    expect(locals[0].id).toBe('p0');
  });

  it('空 playerIds → throw', () => {
    expect(() => computeFfaLayout([], 'p0', 1280, 720)).toThrow();
  });
});

describe('Pixi 渲染類別 import smoke（型別/匯出存在；像素渲染留 T11 e2e）', () => {
  it('StandingsPanel / FfaBoards 可被 import 且為可建構類別', async () => {
    const { StandingsPanel } = await import('./StandingsPanel');
    const { FfaBoards } = await import('./FfaBoards');
    expect(typeof StandingsPanel).toBe('function');
    expect(typeof FfaBoards).toBe('function');
    // 建構子均需 N 個參數（Pixi layer/stage），確認簽章存在
    expect(StandingsPanel.length).toBeGreaterThanOrEqual(2);
    expect(FfaBoards.length).toBeGreaterThanOrEqual(4);
  });
});

describe('PLAYER_TINTS', () => {
  it('長度為 8、皆為合法色值（0..0xffffff）', () => {
    expect(PLAYER_TINTS).toHaveLength(8);
    for (const c of PLAYER_TINTS) {
      expect(typeof c).toBe('number');
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
    // 8 色互異
    expect(new Set(PLAYER_TINTS).size).toBe(8);
  });
});
