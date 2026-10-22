// mapPages.test.ts — 地圖頁（B12）：只替含已探索 chunk 的頁建 canvas、沒常駐的欄每幀限量 peek、LRU 上限、探索範圍與拖曳夾限
import { describe, it, expect, vi } from 'vitest';
import { MapPages, pageKey, clampView, PAGE_CHUNKS, PAGE_PX, MAX_PAGES, PEEK_PER_FRAME } from './mapPages';
import { buildMapLut } from './mapModel';
import { World } from '../engine/world';
import { ExploredMap } from '../engine/explore';
import { li, type Column, type ColumnSource, type ColumnLayers } from '../engine/column';
import { T } from '../engine/tiles';
import { CHUNK } from '../engine/constants';
import { X_LIMIT } from '../engine/coords';

/** 測試用來源：y ≥ 40 是泥土（和「沒載入 = 石頭」分得出來），以上是空氣 */
class Src implements ColumnSource {
  readonly version = 1;
  fill(col: Column, x0: number, x1: number): void {
    for (let y = 40; y < col.height; y++) for (let x = x0; x < x1; x++) col.fg[li(x, y)] = T.DIRT;
  }
  surfaceAt(): number { return 40; }
  biomeAt(): number { return 0; }
  layersAt(): ColumnLayers { return { rock: 60, deep: 70, molten: 90 }; }
}

interface Put { x: number; y: number; px: Uint32Array }
/** 假 canvas：記下每次 putImageData 的內容（複本）與 drawImage 次數 */
function stubCanvas(puts: Put[], draws: unknown[]): (w: number, h: number) => HTMLCanvasElement {
  return (w, h) => {
    const ctx = {
      fillStyle: '',
      imageSmoothingEnabled: false,
      fillRect: () => undefined,
      createImageData: (iw: number, ih: number) => ({ width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) }),
      putImageData: (img: ImageData, x: number, y: number) => { puts.push({ x, y, px: Uint32Array.from(new Uint32Array(img.data.buffer)) }); },
      drawImage: (...a: unknown[]) => { draws.push(a); },
    };
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };
}

const H = 100;
function setup(): { world: World; explored: ExploredMap; puts: Put[]; draws: unknown[]; make: () => MapPages } {
  const world = new World(64, H, { bounds: 'infinite', source: new Src() });
  world.surfaceY = 40;
  const explored = new ExploredMap(64, H, undefined, world);
  const puts: Put[] = [], draws: unknown[] = [];
  return { world, explored, puts, draws, make: () => new MapPages({ world, explored }, stubCanvas(puts, draws)) };
}
const revealRow = (ex: ExploredMap, x0: number, x1: number, y: number): void => { for (let x = x0; x < x1; x++) ex.reveal(x, y); };
const drain = (p: MapPages): number => { let n = 0; for (let k = 0; k < 500 && p.pendingCount() > 0; k++) { p.update(); n++; } return n; };

describe('pageKey', () => {
  it('floor(cx / 8), floor(cy / 8) 打包；負座標正確', () => {
    expect(PAGE_PX).toBe(PAGE_CHUNKS * CHUNK);
    expect(pageKey(0, 0)).toBe(pageKey(7, 7));
    expect(pageKey(8, 0)).not.toBe(pageKey(7, 0));
    expect(pageKey(0, 8)).not.toBe(pageKey(0, 7));
    expect(pageKey(-1, 0)).toBe(pageKey(-8, 0));
    expect(pageKey(-1, 0)).not.toBe(pageKey(0, 0));
    expect(pageKey(-9, 0)).not.toBe(pageKey(-8, 0));
    const seen = new Set<number>();
    for (let px = -40; px <= 40; px++) for (let py = 0; py < 5; py++) seen.add(pageKey(px * 8, py * 8));
    expect(seen.size).toBe(81 * 5);
    // 硬邊界上的 chunk 也有合法、不撞的鍵
    const L = (X_LIMIT - 1) >> 5;
    expect(pageKey(L, 0)).not.toBe(pageKey(-L - 1, 0));
  });
});

describe('MapPages', () => {
  it('只揭露 x ∈ [−400, −300) 與 [100, 200) → 只建兩頁；exploredExtent = { x0: −400, x1: 200 }', () => {
    const s = setup();
    revealRow(s.explored, -400, -300, 45);
    const p = s.make();
    revealRow(s.explored, 100, 200, 45);
    drain(p);
    expect(p.pageKeys().sort((a, b) => a - b)).toEqual([pageKey(-13, 1), pageKey(3, 1)].sort((a, b) => a - b));
    expect(pageKey(-13, 1)).toBe(pageKey(-10, 1));
    expect(p.exploredExtent()).toEqual({ x0: -400, x1: 200 });
  });

  it('沒有任何探索 → 沒有頁、extent 為 null', () => {
    const s = setup(), p = s.make();
    p.update();
    expect(p.pageKeys()).toEqual([]);
    expect(p.exploredExtent()).toBeNull();
  });

  it('沒常駐的欄：每次 update 最多 PEEK_PER_FRAME 欄被 peek、多幀後全部畫完；residentColumns 不變、畫的是生成內容', () => {
    const s = setup();
    const before = s.world.residentColumns();
    const p = s.make();
    const spy = vi.spyOn(s.world, 'peekColumn');
    revealRow(s.explored, 320, 512, 45); // cx 10..15，全部沒常駐
    s.explored.reveal(330, 35);
    p.update();
    expect(new Set(spy.mock.calls.map((c) => c[0])).size).toBeLessThanOrEqual(PEEK_PER_FRAME);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(PEEK_PER_FRAME);
    expect(p.pendingCount()).toBeGreaterThan(0);
    const frames = drain(p);
    expect(frames).toBeGreaterThanOrEqual(2);
    expect(p.pendingCount()).toBe(0);
    expect(new Set(spy.mock.calls.map((c) => c[0]))).toEqual(new Set([10, 11, 12, 13, 14, 15]));
    expect(spy.mock.calls.length).toBe(6);
    expect(s.world.residentColumns()).toEqual(before);
    // chunk (10, 1) 在第 1 頁（page x = 1）的 (64, 32)：y = 45 是泥土（生成內容，不是「沒載入 = 石頭」）、y = 35 是天空
    const lut = buildMapLut();
    const put = s.puts.filter((q) => q.x === (10 - 8) * CHUNK && q.y === CHUNK).pop()!;
    expect(put).toBeDefined();
    expect([lut.fg[T.DIRT], lut.fgDark[T.DIRT]]).toContain(put.px[(45 - 32) * CHUNK + 0]);
    expect(put.px[(35 - 32) * CHUNK + 10]).toBe(lut.sky);
    expect(put.px[(50 - 32) * CHUNK + 0]).toBe(lut.fog);
  });

  it('挖一格（已探索的 chunk）→ markWorld 後那頁 version 增加；沒探索的 chunk 不排程', () => {
    const s = setup();
    revealRow(s.explored, 0, 20, 45);
    const p = s.make();
    drain(p);
    const pk = pageKey(0, 1), v0 = p.pageVersion(pk)!, g0 = p.version;
    expect(v0).toBeGreaterThan(0);
    s.world.setFg(10, 45, T.AIR);
    p.markWorld([s.world.chunkIndex(0, 1)]);
    p.update();
    expect(p.pageVersion(pk)).toBeGreaterThan(v0);
    expect(p.version).toBeGreaterThan(g0);
    p.markWorld([s.world.chunkIndex(1, 2)]);
    expect(p.pendingCount()).toBe(0);
  });

  it('MAX_PAGES + 10 頁 → 只保留 MAX_PAGES（LRU）；被淘汰的頁再畫到時重建', () => {
    const s = setup();
    for (let k = 0; k < MAX_PAGES + 10; k++) s.explored.reveal(k * PAGE_PX + 5, 45);
    const p = s.make();
    drain(p);
    expect(p.pageKeys().length).toBe(MAX_PAGES);
    // 最早建的頁被淘汰；畫到那裡 → 重建、排程重畫
    const first = pageKey(0, 1);
    expect(p.pageKeys()).not.toContain(first);
    const ctx = stubCanvas([], [])(10, 10).getContext('2d') as CanvasRenderingContext2D;
    p.draw(ctx, { cx: 5, cy: 45, scale: 1 }, 100, 100);
    expect(p.pageKeys()).toContain(first);
    expect(p.pendingCount()).toBeGreaterThan(0);
  });

  it('draw：只畫存在的頁（其餘留背景）', () => {
    const s = setup();
    revealRow(s.explored, -400, -300, 45);
    revealRow(s.explored, 100, 200, 45);
    const p = s.make();
    drain(p);
    const draws: unknown[] = [];
    const ctx = stubCanvas([], draws)(10, 10).getContext('2d') as CanvasRenderingContext2D;
    // 可見 x ∈ [−500, 300)：頁 −2、−1、0、1，只有 −2 與 0 存在
    p.draw(ctx, { cx: -100, cy: 50, scale: 1 }, 800, 100);
    expect(draws.length).toBe(2);
  });
});

describe('clampView（探索範圍）', () => {
  const ext = { x0: -400, x1: 200 };
  it('中心不離開探索範圍；範圍內不動；上下夾在 [0, height]', () => {
    expect(clampView({ cx: -5000, cy: 50, scale: 2 }, ext, 1200, 800, 600).cx).toBe(-400);
    expect(clampView({ cx: 9999, cy: 50, scale: 2 }, ext, 1200, 800, 600).cx).toBe(200);
    expect(clampView({ cx: -100, cy: 500, scale: 2 }, ext, 1200, 800, 600)).toEqual({ cx: -100, cy: 500, scale: 2 });
    const c = clampView({ cx: 0, cy: 9999, scale: 2 }, ext, 1200, 800, 600);
    expect(c.cy).toBeLessThanOrEqual(1200);
    expect(clampView({ cx: 0, cy: -500, scale: 2 }, ext, 1200, 800, 600).cy).toBeGreaterThanOrEqual(0);
  });
  it('extent 為 null → 不動水平（維持置中在玩家）；不會拖過 ±X_LIMIT', () => {
    expect(clampView({ cx: 1234.5, cy: 50, scale: 2 }, null, 1200, 800, 600).cx).toBe(1234.5);
    expect(clampView({ cx: 5e6, cy: 50, scale: 2 }, null, 1200, 800, 600).cx).toBe(X_LIMIT);
    expect(clampView({ cx: -5e6, cy: 50, scale: 2 }, null, 1200, 800, 600).cx).toBe(-X_LIMIT);
    expect(clampView({ cx: 2e6, cy: 50, scale: 2 }, { x0: X_LIMIT - 10, x1: X_LIMIT }, 1200, 800, 600).cx).toBeLessThanOrEqual(X_LIMIT);
  });
});
