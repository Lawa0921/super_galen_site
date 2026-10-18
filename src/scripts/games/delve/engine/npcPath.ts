// npcPath.ts — 居民的簡單尋路（純函式，無 DOM）：在「站得住的格」上做 BFS。
//   站得住 (x, y) = 腳踩 y 列：(x, y-2..y) 三格不擋（門算可以過）、腳下 y+1 是實心 / 平台。
//   移動：左右走一格、step-up 一格、跳上兩格（頭上要空）、往下掉最多 MAX_DROP 格。
//   有節點上限（budget），找不到目標就回傳「最接近目標欄」的那條路。呼叫端以 world.rev 快取。
import type { World } from './world';
import { T, isSolidTile } from './tiles';

export const PATH_BUDGET = 3000;
export const MAX_DROP = 5;

export interface PathNode { x: number; y: number; }

const isDoor = (id: number): boolean => id === T.DOOR_CLOSED || id === T.DOOR_OPEN;
/** 這格擋不擋身體（門不擋：居民會開門） */
export function blocks(w: World, x: number, y: number): boolean {
  if (!w.inBounds(x, y)) return y >= 0;
  const id = w.getFg(x, y);
  return isSolidTile(id) && !isDoor(id);
}
/** 腳踩 y 列能不能站在 x 欄 */
export function standable(w: World, x: number, y: number): boolean {
  if (!w.inBounds(x, y + 1)) return false;
  for (let k = 0; k < 3; k++) if (blocks(w, x, y - k)) return false;
  const below = w.getFg(x, y + 1);
  return (isSolidTile(below) && !isDoor(below)) || below === T.PLATFORM;
}

/**
 * 從 (sx, sy)（腳下那列）找到 gx 欄的路；回傳節點清單（含起點、終點）。
 * 到不了 gx → 走到最接近 gx 的可達點。起點站不住（在空中）→ 只回傳起點。
 */
export function findPath(w: World, sx: number, sy: number, gx: number, gy?: number, budget = PATH_BUDGET,
  bounds?: { x0: number; x1: number; y0: number; y1: number }): PathNode[] {
  const start = { x: sx, y: sy };
  if (!standable(w, sx, sy)) return [start];
  const W = w.width, key = (x: number, y: number): number => y * W + x;
  const prev = new Map<number, number>();
  const sk = key(sx, sy);
  prev.set(sk, -1);
  const queue: number[] = [sk];
  let best = sk, bestScore = score(sx, sy);
  function score(x: number, y: number): number { return Math.abs(x - gx) * 4 + (gy === undefined ? 0 : Math.abs(y - gy)); }
  const inB = (x: number, y: number): boolean => !bounds || (x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
  const push = (from: number, x: number, y: number): void => {
    if (!inB(x, y)) return;
    const k = key(x, y);
    if (prev.has(k)) return;
    prev.set(k, from);
    queue.push(k);
  };
  for (let head = 0; head < queue.length && head < budget; head++) {
    const k = queue[head], x = k % W, y = (k - x) / W;
    const sc = score(x, y);
    if (sc < bestScore) { bestScore = sc; best = k; }
    if (sc === 0) break;
    for (const d of [-1, 1]) {
      const nx = x + d;
      if (standable(w, nx, y)) { push(k, nx, y); continue; }
      // step-up 一格 / 跳上兩格：頭上要空
      if (standable(w, nx, y - 1) && !blocks(w, x, y - 3)) { push(k, nx, y - 1); continue; }
      if (standable(w, nx, y - 2) && !blocks(w, x, y - 3) && !blocks(w, x, y - 4)) { push(k, nx, y - 2); continue; }
      // 往下掉：旁邊那欄身體高度都空 → 一路往下找第一個站得住的
      if (blocks(w, nx, y) || blocks(w, nx, y - 1) || blocks(w, nx, y - 2)) continue;
      for (let dy = 1; dy <= MAX_DROP; dy++) {
        if (blocks(w, nx, y + dy)) break;
        if (standable(w, nx, y + dy)) { push(k, nx, y + dy); break; }
      }
    }
  }
  const out: PathNode[] = [];
  for (let k = best; k !== -1; k = prev.get(k) ?? -1) { const x = k % W; out.push({ x, y: (k - x) / W }); }
  return out.reverse();
}

/**
 * 玩家（20px 寬、3 格高）能站的地方：腳踩 (x, y)，x-1..x+1 三欄的 y-2..y 都不是實心（門也不行：會被關在門裡），
 * 腳下 x 是實心 / 平台、而且不是液體裡。從 (cx, cy) 往外一圈圈找，最多 r 格；找不到 → null。
 */
export function findStandSpot(w: World, cx: number, cy: number, r = 8): { x: number; y: number } | null {
  const ok = (x: number, y: number): boolean => {
    if (!w.inBounds(x - 1, y - 2) || !w.inBounds(x + 1, y + 1)) return false;
    for (let dx = -1; dx <= 1; dx++) for (let k = 0; k < 3; k++) {
      if (w.isSolid(x + dx, y - k)) return false;
      if (w.getLiquid(x + dx, y - k) > 128) return false;
    }
    const below = w.getFg(x, y + 1);
    return w.isSolid(x, y + 1) || below === T.PLATFORM;
  };
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const d = dx * dx + dy * dy * 1.5;
    if (d >= bd || !ok(cx + dx, cy + dy)) continue;
    bd = d; best = { x: cx + dx, y: cy + dy };
  }
  return best;
}
