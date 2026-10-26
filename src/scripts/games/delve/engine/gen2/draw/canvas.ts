// canvas.ts — 共用繪製畫布：村落 / 矮人地廳等結構的畫圖碼只透過這個介面讀寫格子，
// 所以同一份畫圖碼舊生成器（legacy/gen/gridCanvas.ts：直接寫 GenGrid）與 gen2（bpCanvas.ts：寫進藍圖）都能用。
// 共用碼的亂數只依賴 RandomLike（legacy Rng 與 gen2 HRng 都符合）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { ChestKind, Drop } from '../../loot';
import type { ItemId } from '../../items';

// next() ∈ [0, 1)、int 是 [lo, hi)、chance(n) 是 1/n
export interface RandomLike { next(): number; int(lo: number, hi: number): number; chance(n: number): boolean }

export interface Canvas {
  inBounds(x: number, y: number): boolean;
  fg(x: number, y: number): number;
  wall(x: number, y: number): number;
  isSolid(x: number, y: number): boolean;
  setFg(x: number, y: number, t: number): void;
  setWall(x: number, y: number, w: number): void;
  clearLiquid(x: number, y: number): void;
  // 整平後的地面（第 x 欄第一個實心格 = y）
  setSurface(x: number, y: number): void;
  // 讀地面（Q7）：最後一次 setSurface 的值，否則天然地表
  surfaceAt(x: number): number;
  // 畫一個箱子（T.CHEST）並登錄它的內容種類；addItem 往 (x, y) 那個箱子再放一件物品
  chest(x: number, y: number, kind: ChestKind): void;
  addItem(x: number, y: number, item: ItemId): void;
  // (x, y) 的陶罐（另外畫）打破時的額外掉落
  potDrop(x: number, y: number, drops: Drop[]): void;
  // 這格恢復天然地層，除非它是有背景牆的實心（舊地城補洞的規則）
  fillNatural(x: number, y: number): void;
}
