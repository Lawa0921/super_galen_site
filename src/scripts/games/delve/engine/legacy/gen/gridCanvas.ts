// gen/gridCanvas.ts — 舊生成器的繪製畫布：共用畫圖碼（engine/gen2/draw/）透過它直接讀寫扁平 GenGrid。
// 語意與舊生成器各 pass 內的 put / putWall / solid 相同：世界外的寫入丟掉、讀 fg 得 T.STONE、讀牆得 0、算實心；
// 不經 GenGrid.setFg（不 touch、不動半格 / 結冰，與舊碼直接寫陣列一樣）。
//   · chest = 畫 T.CHEST + world.chests.set(i, chestLoot(...))；addItem = 舊 addTo（第一個空格，滿了蓋最後一格；沒有箱子就不放）
//   · setSurface 寫 surface[x] 與 world.surface[x]；surfaceAt 讀 surface[x]
//   · fillNatural = 舊地城補洞的單格規則（有背景牆的實心不動，其餘換成 natural(x, y) 的天然材質）
import type { GenGrid } from './grid';
import { T, SOLID_LUT } from '../../tiles';
import { chestLoot, type ChestKind, type Drop } from '../../loot';
import type { ItemId } from '../../items';
import type { Canvas } from '../../gen2/draw/canvas';

export function gridCanvas(
  world: GenGrid,
  seed: string,
  depthFrac: (x: number, y: number) => number,
  surface: Int16Array,
  natural: (x: number, y: number) => readonly [fg: number, wall: number],
): Canvas {
  const { width, height, fg, wall } = world, WW = width;
  const inB = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height;
  return {
    inBounds: inB,
    fg: (x, y) => (inB(x, y) ? fg[y * WW + x] : T.STONE),
    wall: (x, y) => (inB(x, y) ? wall[y * WW + x] : 0),
    isSolid: (x, y) => !inB(x, y) || SOLID_LUT[fg[y * WW + x]] === 1,
    setFg: (x, y, t) => { if (inB(x, y)) fg[y * WW + x] = t; },
    setWall: (x, y, w) => { if (inB(x, y)) wall[y * WW + x] = w; },
    clearLiquid: (x, y) => { if (inB(x, y)) world.liquid[y * WW + x] = 0; },
    setSurface: (x, y) => { if (x >= 0 && x < width) { surface[x] = y; world.surface[x] = y; } },
    surfaceAt: (x) => surface[x],
    chest: (x: number, y: number, kind: ChestKind) => {
      if (!inB(x, y)) return;
      fg[y * WW + x] = T.CHEST;
      world.chests.set(y * WW + x, chestLoot(seed, x, y, kind, depthFrac(x, y)));
    },
    addItem: (x: number, y: number, item: ItemId) => {
      const slots = inB(x, y) ? world.chests.get(y * WW + x) : undefined;
      if (!slots) return;
      const k = slots.findIndex((s) => s === null);
      slots[k >= 0 ? k : slots.length - 1] = { item, count: 1 };
    },
    potDrop: (x: number, y: number, drops: Drop[]) => { if (inB(x, y)) world.potDrops.set(y * WW + x, drops); },
    fillNatural: (x, y) => {
      if (!inB(x, y)) return;
      const i = y * WW + x;
      if (SOLID_LUT[fg[i]] === 1 && wall[i] !== 0) return;
      const [t, wl] = natural(x, y);
      fg[i] = t; wall[i] = wl;
    },
  };
}
