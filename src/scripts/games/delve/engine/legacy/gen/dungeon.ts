// dungeon.ts — 地城生成（舊生成器的包裝）。
// 規劃與畫圖在 engine/gen2/draw/dungeon.ts（與 gen2 共用）；這裡只把 GenGrid 包成 gridCanvas 交給 generateDungeonOn。
//   · 房間排序距離用舊碼原本的開根號版（rankDist）：平方距離的順序在少數平手處不同，舊世界輸出要逐位元不變。
//   · 天然岩層回填（施工前把預留區裡的天然洞穴補實）走 gridCanvas 的 fillNatural，逐格規則只在 gridCanvas.ts 一份。
import type { GenGrid } from './grid';
import type { ReservedZone, DungeonInfo } from '../../genTypes';
import { generateDungeonOn } from '../../gen2/draw/dungeon';
import { gridCanvas } from './gridCanvas';

export interface DungeonOptions {
  seed: string;
  zone: ReservedZone;
  /** 每欄地表（會被入口塔整平的地方改寫） */
  surface: Int16Array;
  color: { key: string; brick: number; wall: number };
  depthFrac: (x: number, y: number) => number;
  /** (x,y) 的天然岩層（fg tile, 背景牆）：施工前用來把預留區裡的天然洞穴補實 */
  natural?: (x: number, y: number) => [number, number];
}

// 舊碼的房間距離（只用來排序；開根號的捨入決定了平手的情形，所以必須原樣保留）
const legacyRank = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy * 1.6);

export function generateDungeon(world: GenGrid, o: DungeonOptions): DungeonInfo | null {
  const noNatural = (): never => { throw new Error('dungeon: natural fill requested without a natural() callback'); };
  const cv = gridCanvas(world, o.seed, o.depthFrac, o.surface, o.natural ?? noNatural);
  const last = world.width - 1;
  return generateDungeonOn(cv, {
    seed: o.seed, zone: o.zone, height: world.height, color: o.color, natural: o.natural !== undefined, rankDist: legacyRank,
    surfaceAt: (x) => o.surface[Math.max(0, Math.min(last, x))],
  });
}
