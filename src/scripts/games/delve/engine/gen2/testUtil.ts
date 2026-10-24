// testUtil.ts — gen2 測試共用（只給 *.test.ts 用，不進遊戲路徑）：填一欄、位元組、source 模式的 World、
// 取樣陸地地區、空氣 BFS、靜態液體不變量。本資料夾的非測試檔會被 grep 禁用 API，這裡一樣遵守。
import { Column, type ColumnSource } from '../column';
import { CHUNK, WORLD_H } from '../constants';
import { World, LIQ } from '../world';
import { T, isSolidTile } from '../tiles';
import { LIQ_MAX } from '../liquidKind';
import type { RegionInfo } from '../regionInfo';
import type { Gen2Source } from './index';

// 第 cx 欄整欄（32 格）由 src 填
export function fillCol(src: ColumnSource, cx: number): Column {
  const col = new Column(cx, WORLD_H);
  src.fill(col, cx * CHUNK, cx * CHUNK + CHUNK);
  return col;
}

// 一欄七層的全部位元組
export const bytes = (c: Column): Uint8Array => new Uint8Array(c.view.buffer);

// 4200 × 1200、infinite、每一欄都問 src
export function worldOf(src: ColumnSource): World {
  return new World(4200, WORLD_H, { bounds: 'infinite', source: src, central: 'source' });
}

// 讓涵蓋 world x ∈ [x0, x1) 的欄都常駐
export function loadColumns(w: World, x0: number, x1: number): void {
  for (let cx = x0 >> 5; cx <= (x1 - 1) >> 5; cx++) w.ensureColumn(cx);
}

// 陸地地區（home / culture / wild）：家鄉的全部地區（home = true）+ 每側前 perSide 片大陸的全部地區
export function sampleRegions(src: Gen2Source, o: { home: boolean; perSide: number }): RegionInfo[] {
  const out: RegionInfo[] = [];
  if (o.home) {
    const h = src.layout.landmassAt(2100);
    if (!h || h.kind !== 'home') throw new Error('no gen2 home');
    out.push(...h.regions);
  }
  for (const side of [1, -1] as const) {
    let n = 0;
    for (let i = 1; n < o.perSide; i++) {
      const m = src.layout.landmass(side, i);
      if (m.kind !== 'continent') continue;
      out.push(...m.regions);
      n++;
    }
  }
  return out;
}

// 第 x 欄由上往下第一個實心格的 y（skip(y) = true 的格不算；整欄都不是 = 世界高）
export function firstSolid(w: World, x: number, skip?: (y: number) => boolean): number {
  for (let y = 0; y < w.height; y++) if (isSolidTile(w.getFg(x, y)) && !skip?.(y)) return y;
  return w.height;
}

// 從 (x, y) 走 4 鄰的空氣格（沒有液體）、x ∈ [xLo, xHi]，走得到任一 y ≥ deepAt(x) 的格 = true
export function bfsReachesDepth(w: World, x: number, y: number, deepAt: (x: number) => number, xLo: number, xHi: number): boolean {
  const H = w.height, wd = xHi - xLo + 1;
  const open = (px: number, py: number): boolean => w.getFg(px, py) === T.AIR && w.getLiquid(px, py) === 0;
  if (!open(x, y)) return false;
  const deep: number[] = [];
  for (let px = xLo; px <= xHi; px++) deep.push(deepAt(px));
  const seen = new Uint8Array(wd * H);
  const q: number[] = [x, y];
  seen[(y * wd) + x - xLo] = 1;
  for (let h = 0; h < q.length; h += 2) {
    const px = q[h], py = q[h + 1];
    if (py >= deep[px - xLo]) return true;
    for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
      if (nx < xLo || nx > xHi || ny < 0 || ny >= H) continue;
      const k = ny * wd + nx - xLo;
      if (seen[k] || !open(nx, ny)) continue;
      seen[k] = 1;
      q.push(nx, ny);
    }
  }
  return false;
}

// 靜態液體不變量：x ∈ [x0, x1) 的每個水 / 熔岩格都是滿格、不在實心格裡，下方與左右是實心或同種滿格液體（世界底下算實心）。回違規格。
// 液體可以泡著非實心物件（箱子、木樑；liquid.ts 只擋實心格），所以沉船裡泡水的箱子 / 桅杆也算靜止。
export function liquidInvariant(w: World, x0: number, x1: number): { x: number; y: number }[] {
  const bad: { x: number; y: number }[] = [];
  const H = w.height;
  const holds = (x: number, y: number, type: number): boolean =>
    y >= H || isSolidTile(w.getFg(x, y)) || (w.getLiquid(x, y) === LIQ_MAX && w.getLiquidType(x, y) === type);
  for (let x = x0; x < x1; x++) {
    for (let y = 0; y < H; y++) {
      if (w.getLiquid(x, y) === 0) continue;
      const type = w.getLiquidType(x, y);
      const ok = (type === LIQ.WATER || type === LIQ.LAVA) && w.getLiquid(x, y) === LIQ_MAX && !isSolidTile(w.getFg(x, y))
        && holds(x, y + 1, type) && holds(x - 1, y, type) && holds(x + 1, y, type);
      if (!ok) bad.push({ x, y });
    }
  }
  return bad;
}

// 測試檔共用的小工具
export const range = (a: number, b: number): number[] => Array.from({ length: b - a }, (_, k) => a + k);
export const SEEDS5 = ['s-a', 's-b', 's-c', 's-d', 's-e'];
