// streaming.ts — 每個 actor 周圍的載入區（B7）。純函式：DelveGame.updateLoadedArea 每刻呼叫，依計畫 ensure / 預生成 / 卸載。
//   · 每個 actor（活著或死亡等待重生）左右各 LOAD_COLS 欄同步載入（192 格 > DESPAWN.x 110）；
//   · PREFETCH_COLS 內、還沒常駐的欄每刻最多預先生成 1 欄（離任一 actor 最近的那欄；同距離取較小的 cx）；
//   · 每 UNLOAD_EVERY 刻檢查一次：離「所有」actor 都超過 UNLOAD_COLS 欄、沒 pin 的常駐欄卸載。
// 全部是 chunk 欄（cx）；夾在 bounds 內。不碰任何 RNG。
import { chunkOfX } from './coords';

export const LOAD_COLS = 6, PREFETCH_COLS = 8, UNLOAD_COLS = 11, UNLOAD_EVERY = 60;

export interface StreamPlan { load: number[]; prefetch: number | null; unload: number[]; }

/** load / unload 升冪；prefetch = 最近的一欄（沒有 = null）。沒有 actor → 什麼都不做 */
export function planStreaming(actorTileXs: readonly number[], resident: ReadonlySet<number>, pinned: ReadonlySet<number>,
  bounds: { xMin: number; xMax: number }, tick: number): StreamPlan {
  const plan: StreamPlan = { load: [], prefetch: null, unload: [] };
  if (actorTileXs.length === 0 || bounds.xMax <= bounds.xMin) return plan;
  const lo = chunkOfX(bounds.xMin), hi = chunkOfX(bounds.xMax - 1);
  const acx = actorTileXs.map((x) => chunkOfX(Math.floor(x)));
  const load = new Set<number>();
  for (const a of acx) {
    for (let c = Math.max(lo, a - LOAD_COLS); c <= Math.min(hi, a + LOAD_COLS); c++) if (!resident.has(c)) load.add(c);
  }
  plan.load = [...load].sort((p, q) => p - q);
  let best: number | null = null, bestD = Infinity;
  for (const a of acx) {
    for (let d = LOAD_COLS + 1; d <= PREFETCH_COLS && d <= bestD; d++) {
      for (const c of [a - d, a + d]) {
        if (c < lo || c > hi || resident.has(c) || load.has(c)) continue;
        if (d < bestD || (best !== null && c < best)) { best = c; bestD = d; }
      }
    }
  }
  plan.prefetch = best;
  if (tick % UNLOAD_EVERY === 0) {
    for (const c of resident) {
      if (pinned.has(c)) continue;
      if (acx.every((a) => Math.abs(c - a) > UNLOAD_COLS)) plan.unload.push(c);
    }
    plan.unload.sort((p, q) => p - q);
  }
  return plan;
}
