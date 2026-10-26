// chart.ts — 隱士 chart 服務（gen2 M2a Task 20）的候選挑選（純函式；game.ts 的 chartTarget 用）：
// 下一片大陸的錨點大東西地區裡，名字非空、地圖錨點在世界內（x ∈ [−X_LIMIT, X_LIMIT)，同 coords.ts 的水平硬邊界）、skip 沒排除的，
// 挑離隱士（hx）最近的（平手取 x 小的）；沒有 → null。
import { X_LIMIT } from './coords';
import type { Region } from './discovery';

export function chartPick(regions: readonly Region[], hx: number, skip: (r: Region) => boolean): Region | null {
  let best: Region | null = null;
  for (const r of regions) {
    if (!r.name || r.ax < -X_LIMIT || r.ax >= X_LIMIT || skip(r)) continue;
    if (!best || Math.abs(r.ax - hx) < Math.abs(best.ax - hx) || (Math.abs(r.ax - hx) === Math.abs(best.ax - hx) && r.ax < best.ax)) best = r;
  }
  return best;
}
