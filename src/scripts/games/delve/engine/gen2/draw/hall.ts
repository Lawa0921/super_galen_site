// hall.ts — 矮人地廳的畫圖（舊生成器 legacy/gen/settlements.ts 搬過來，舊生成器與 gen2 共用；選址留在呼叫端）：
// 拱頂石廳（鑿石磚外殼、鑿刻石牆背景）、橫貫大廳的礦車軌道與兩側鑿出的軌道隧道、矮人熔爐 + 鐵砧、
// 軌道上一台滿載的礦車、天花板旗幟與鐵鍊吊燈、兩端火盆、後牆火把、入口旗幟、長桌（平台）+ 蠟燭。
// 隧道長度由呼叫端決定（tunnelLen(side) = 從隧道口 x0 − 3 / x1 + 3 往外鑿幾欄；legacy 照舊逐欄掃到洞穴為止，gen2 給固定長度）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import type { HallInfo } from '../../genTypes';
import type { Canvas, RandomLike } from './canvas';

// 大廳室內高（y0 = floorY − HALL_IH）
export const HALL_IH = 11;

// x0 = 大廳左端內部欄、hw = 內部寬（x1 = x0 + hw − 1）、floorY = 地板列（第一個實心列）。
// 外殼佔 [x0 − 2, x1 + 2] × [y0 − 3, floorY + 2]；隧道佔 x0 − 3 往左 / x1 + 3 往右各 tunnelLen 欄、列 floorY − 5 .. floorY。
// ctx.ver 0 的地廳不抽亂數（rng 保留給之後的變化）
export function drawHall(cv: Canvas, o: { x0: number; hw: number; floorY: number }, _rng: RandomLike, tunnelLen: (side: -1 | 1) => number): HallInfo {
  const { x0, hw, floorY } = o, x1 = x0 + hw - 1, cx = (x0 + x1) >> 1, y0 = floorY - HALL_IH;
  // ── 外殼 + 拱頂室內 ──
  const half = Math.max(1, (x1 - x0) >> 1);
  const archAt = (x: number): number => { const d = x - cx; return Math.trunc((3 * d * d) / (half * half)); }; // 中間高、兩側低 3 格
  for (let x = x0 - 2; x <= x1 + 2; x++) {
    for (let y = y0 - 3; y <= floorY + 2; y++) { cv.setFg(x, y, T.DWARF_BRICK); cv.setWall(x, y, W.DWARF_WALL); cv.clearLiquid(x, y); }
  }
  for (let x = x0; x <= x1; x++) for (let y = y0 + archAt(x); y < floorY; y++) cv.setFg(x, y, T.AIR);
  // ── 軌道（橫貫大廳）+ 兩側鑿出的軌道隧道 ──
  for (let x = x0; x <= x1; x++) cv.setFg(x, floorY - 1, T.RAIL);
  const tunnels: { x0: number; x1: number }[] = [];
  for (const dir of [-1, 1] as const) {
    const sx = dir < 0 ? x0 - 3 : x1 + 3, n = tunnelLen(dir);
    for (let k = 0; k < n; k++) {
      const x = sx + dir * k;
      for (let y = floorY - 4; y < floorY; y++) { cv.setFg(x, y, T.AIR); cv.clearLiquid(x, y); }
      if (!cv.isSolid(x, floorY)) cv.setFg(x, floorY, T.DWARF_BRICK);
      cv.setFg(x, floorY - 1, T.RAIL);
      if (!cv.isSolid(x, floorY - 5)) cv.setFg(x, floorY - 5, T.DWARF_BRICK);
      // 隧道裡每 5 格一支火把（貼著天花板）：遠遠就看得到一條亮著的坑道
      if (k % 5 === 2) cv.setFg(x, floorY - 4, T.TORCH);
    }
    const last = n > 0 ? sx + dir * (n - 1) : sx;
    tunnels.push({ x0: Math.min(sx, last), x1: Math.max(sx, last) });
    // 隧道口的門框
    for (let y = floorY - 4; y < floorY; y++) { cv.setFg(dir < 0 ? x0 - 1 : x1 + 1, y, T.AIR); cv.setFg(dir < 0 ? x0 - 2 : x1 + 2, y, T.AIR); }
    cv.setFg(dir < 0 ? x0 - 1 : x1 + 1, floorY - 1, T.RAIL); cv.setFg(dir < 0 ? x0 - 2 : x1 + 2, floorY - 1, T.RAIL);
  }
  // ── 擺設 ──
  const fy = floorY - 1;
  const forge = { x: x0 + 5, y: fy };
  cv.setFg(forge.x, fy, T.DWARF_FORGE);
  cv.setFg(forge.x + 2, fy, T.ANVIL);
  cv.setFg(forge.x + 3, fy, T.BARREL);
  // 礦車停在軌道上（點陣自己畫了軌道，直接取代那格軌道）
  const cart = { x: x1 - 8, y: fy };
  cv.setFg(cart.x, fy, T.ORE_CART);
  // 天花板：每 10 格一組旗幟（兩格長）+ 鐵鍊吊燈
  for (let x = x0 + 12; x < x1 - 10; x += 10) {
    const top = y0 + archAt(x);
    cv.setFg(x, top, T.BANNER); cv.setFg(x, top + 1, T.BANNER);
    const t2 = y0 + archAt(x + 5);
    cv.setFg(x + 5, t2, T.CHAIN); cv.setFg(x + 5, t2 + 1, T.LANTERN);
  }
  // 火盆：放在大廳兩端的石台（地板上加一層鑿石磚台階）
  for (const bx of [x0 + 1, x1 - 1]) { cv.setFg(bx, fy, T.DWARF_BRICK); cv.setFg(bx, fy - 1, T.BRAZIER); }
  // 後牆火把（每 6 格，鑿刻石牆上）+ 入口門框上的旗幟：大廳在預設縮放下也夠亮、入口一眼認得出來
  for (let x = x0 + 3; x < x1 - 2; x += 6) if (cv.fg(x, fy - 3) === T.AIR) cv.setFg(x, fy - 3, T.TORCH);
  for (const dx of [x0 - 2, x1 + 2]) { cv.setFg(dx, floorY - 4, T.BANNER); cv.setFg(dx, floorY - 3, T.BANNER); }
  // 長桌 + 長椅（軌道之上一格高的平台當「宴會桌」：平台站得上去、不擋路）
  const tx = cx - 4;
  for (let x = tx; x < tx + 8; x++) cv.setFg(x, fy - 3, T.PLATFORM);
  cv.setFg(tx + 1, fy - 4, T.CANDLE); cv.setFg(tx + 6, fy - 4, T.CANDLE);
  return { x0, x1, y0, floorY, forge, cart, tunnels };
}
