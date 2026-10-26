// skyIsland.ts — 浮空島的畫圖（舊生成器 legacy/worldgen.ts 搬過來，舊生成器與 gen2 共用；選址、島高與佔位檢查留在呼叫端）：
// 透鏡形島身（草 / 泥土 / 石）、小木屋（木板殼 + 屋脊 + 兩側門口 + 'sky' 箱 + 火把）、一棵樹、花草，
// 島底垂一條繩梯，下端離地 3 格（跳一下抓得到）。亂數抽取順序與舊生成器相同。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W } from '../../tiles';
import { vnoise1 } from '../../noise';
import type { Canvas, RandomLike } from './canvas';

// 小木屋高（屋頂列 top − SKY_HH，屋脊再上一列）
export const SKY_HH = 6;

// x0 = 島左端欄、iw = 島寬、top = 島面（草）列、thick = 島身厚度參數、noiseSeed = 島底起伏的雜訊種子。
// groundBelow(x, fromY) = 從 fromY 往下第一個不是空氣的格的 y——那格必須是實心地面，否則回負數（這欄不放繩梯，換下一欄）。
// 繩梯：依序試 4 欄，島底到地面至少 8 格才放；都不行 rope = null
export function drawSkyIsland(
  cv: Canvas,
  o: { x0: number; iw: number; top: number; thick: number; noiseSeed: number },
  rng: RandomLike,
  groundBelow: (x: number, fromY: number) => number,
): { chest: { x: number; y: number }; rope: { x: number; y0: number; y1: number } | null } {
  const { x0, iw, top, thick, noiseSeed } = o, hh = SKY_HH;
  for (let x = x0; x < x0 + iw; x++) {
    const t = ((x - x0) + 0.5) / iw * 2 - 1;
    const edge = Math.min(x - x0, x0 + iw - 1 - x);
    const y0 = top + (edge < 2 ? 2 - edge : 0);
    const th = Math.max(2, Math.round(2 + thick * (1 - t * t) + (vnoise1(x, 4, noiseSeed) - 0.5) * 3));
    for (let y = y0; y < top + th; y++) cv.setFg(x, y, y === y0 ? T.GRASS : y < y0 + 4 ? T.DIRT : T.STONE);
  }
  // 小木屋
  const hw = rng.int(8, 11), hx = x0 + Math.floor((iw - hw) / 2);
  for (let x = hx; x < hx + hw; x++) {
    cv.setFg(x, top, T.PLANKS);
    for (let y = top - hh; y < top; y++) {
      const shell = y === top - hh || x === hx || x === hx + hw - 1;
      cv.setFg(x, y, shell ? T.PLANKS : T.AIR);
      cv.setWall(x, y, W.PLANK_WALL);
    }
  }
  for (let x = hx + 1; x < hx + hw - 1; x++) cv.setFg(x, top - hh - 1, T.PLANKS); // 屋脊
  for (const dx of [hx, hx + hw - 1]) for (let y = top - 3; y < top; y++) cv.setFg(dx, y, T.AIR);
  const chest = { x: hx + 2, y: top - 1 };
  cv.chest(chest.x, chest.y, 'sky');
  cv.setFg(hx + hw - 2, top - hh + 1, T.TORCH);
  // 樹 + 花草
  const tx = x0 + 3;
  if (cv.fg(tx, top) === T.GRASS && tx < hx - 2) {
    const th = rng.int(5, 8);
    for (let dy = 1; dy <= th; dy++) cv.setFg(tx, top - dy, T.WOOD);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= 2 && cv.fg(tx + dx, top - th + dy) === T.AIR) cv.setFg(tx + dx, top - th + dy, T.LEAVES);
    }
  }
  for (let x = x0 + 1; x < x0 + iw - 1; x++) {
    if (x >= hx - 1 && x <= hx + hw) continue;
    let gy = top;
    while (gy < top + 3 && cv.fg(x, gy) !== T.GRASS) gy++;
    if (cv.fg(x, gy) === T.GRASS && cv.fg(x, gy - 1) === T.AIR) {
      const r = rng.next();
      if (r < 0.3) cv.setFg(x, gy - 1, T.TALL_GRASS); else if (r < 0.42) cv.setFg(x, gy - 1, T.FLOWER);
    }
  }
  // v6：島底垂下一條繩梯，下端離地 2–3 格（跳一下抓得到）——不必自己蓋塔也上得去
  let rope: { x: number; y0: number; y1: number } | null = null;
  for (const rx of [x0 + iw - 5, x0 + 4, x0 + iw - 8, x0 + 7]) {
    let by = top;
    while (cv.inBounds(rx, by + 1) && cv.isSolid(rx, by + 1)) by++;
    const gy = groundBelow(rx, by + 1);
    if (gy < 0 || gy - by < 8) continue; // 下面是樹葉 / 樹幹（groundBelow < 0）或太近 → 換一欄
    const end = gy - 3;
    for (let y = by + 1; y <= end; y++) cv.setFg(rx, y, T.ROPE);
    rope = { x: rx, y0: by + 1, y1: end };
    break;
  }
  return { chest, rope };
}
