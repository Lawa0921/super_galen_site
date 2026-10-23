// aimRay.ts — 格子射線（Amanatides–Woo）：從 (ox, oy) 朝 (dx, dy) 逐格走，方向挖掘用（game.mineTarget）。
// 座標單位 = tile（px / TILE_SIZE）。純函式、不配置陣列：每走到一格就呼叫 visit，回傳 true 就停。
// 格角規則：射線正好穿過格角（往 x、往 y 的邊界同一個 t）時，兩個側鄰格都要走到——先水平那格、再垂直那格，
// 最後才是對角那格。所以兩塊只在格角相接的方塊中間鑽不過去（總會先碰到其中一塊），而且順序固定（房主 / 客人算的一樣）。

/** 兩個邊界的 t 差在這之內就當成正好穿過格角（浮點誤差） */
const CORNER_EPS = 1e-9;
/** 最多走幾格（防呆：maxT 給錯也不會跑不完） */
const MAX_STEPS = 4096;

/**
 * 從 (ox, oy) 朝方向 (dx, dy)（不必是單位向量）走，依序 visit 經過的每一格（含起點那格），
 * 直到 visit 回傳 true，或下一格的進入距離超過 maxT（tile）。方向是零向量 → 一格都不走。
 */
export function marchTiles(ox: number, oy: number, dx: number, dy: number, maxT: number, visit: (x: number, y: number) => boolean): void {
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return;
  const ux = dx / len, uy = dy / len;
  let x = Math.floor(ox), y = Math.floor(oy);
  if (visit(x, y)) return;
  const sx = ux > 0 ? 1 : ux < 0 ? -1 : 0, sy = uy > 0 ? 1 : uy < 0 ? -1 : 0;
  // 跨一整格要走的距離；下一條 x / y 邊界在多遠
  const stepX = sx !== 0 ? 1 / Math.abs(ux) : Infinity, stepY = sy !== 0 ? 1 / Math.abs(uy) : Infinity;
  let tx = sx > 0 ? (x + 1 - ox) / ux : sx < 0 ? (x - ox) / ux : Infinity;
  let ty = sy > 0 ? (y + 1 - oy) / uy : sy < 0 ? (y - oy) / uy : Infinity;
  for (let n = 0; n < MAX_STEPS; n++) {
    if (Math.min(tx, ty) > maxT) return;
    if (Math.abs(tx - ty) <= CORNER_EPS) {
      // 正好穿過格角：先水平側、再垂直側，最後對角那格
      if (visit(x + sx, y) || visit(x, y + sy)) return;
      x += sx; y += sy; tx += stepX; ty += stepY;
    } else if (tx < ty) { x += sx; tx += stepX; }
    else { y += sy; ty += stepY; }
    if (visit(x, y)) return;
  }
}
