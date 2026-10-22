// waystoneArt.ts — 傳送碑的手繪像素圖（純 Bmp，無 DOM）。光從左上；1px 描邊；只用 pixel.ts 統一色票。
//   · waystoneBmp(unlocked)：2×3 格（32×48 px）的立石：上窄下寬、圓頂、底座石板 + 苔；碑面中央一列三個刻符。
//     未解鎖 = 刻痕（深槽 + 下緣亮邊）；解鎖 = 刻符填上青色。
//   · waystoneGlyphBmp(phase)：只有刻符的發光層（畫在光照之後，夜裡也看得到）；兩個亮度相位做呼吸閃爍。
import { Bmp, INK, h01, ramp, type RGB } from './pixel';

/** 碑圖寬 / 高（px）= footprint 2×3 格 */
export const STONE_PX = 32;
export const STONE_PY = 48;
/** 底座往地面裡埋幾 px（站立 tile 的底 = 地表頂；埋一點看起來是立在土裡） */
export const STONE_SINK = 2;

/** 冷灰石：由暗到亮 */
const STONE = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8');
const MOSS = ramp('#16301e', '#2d672e', '#468a34', '#67ab3c');
/** 刻符的光：外圈 / 內芯 / 最亮 */
const GLOW = ramp('#2c8692', '#4aaeb0', '#cceaf8', '#ffffff');

/** 三個刻符（5×5；'#' = 刻痕） */
const RUNES: readonly (readonly string[])[] = [
  ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
  ['.###.', '#...#', '#.#.#', '#...#', '.###.'],
  ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
];
/** 刻符左上角（bmp 座標） */
const RUNE_X = 14, RUNE_Y = [11, 19, 27];

/** 碑身第 y 列的半寬（px；中心在 x = 16）；不是碑身 → 0 */
function halfWidth(y: number): number {
  if (y < 1) return 0;
  if (y === 1) return 4;
  if (y === 2) return 6;
  if (y === 3) return 7;
  if (y <= 41) return 8 + Math.floor(((y - 4) * 3) / 38);
  if (y <= 44) return 13;
  if (y <= 47) return 15;
  return 0;
}
const inBody = (x: number, y: number): boolean => Math.abs(x + 0.5 - 16) <= halfWidth(y);

/** 每個刻符的每個刻痕像素（bmp 座標） */
function runePixels(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  RUNES.forEach((r, i) => {
    for (let ry = 0; ry < r.length; ry++) for (let rx = 0; rx < r[ry].length; rx++) {
      if (r[ry][rx] === '#') out.push({ x: RUNE_X + rx - 1, y: RUNE_Y[i] + ry });
    }
  });
  return out;
}

export function waystoneBmp(unlocked: boolean): Bmp {
  const b = new Bmp(STONE_PX, STONE_PY), s = STONE;
  for (let y = 0; y < STONE_PY; y++) {
    const hw = halfWidth(y);
    if (!hw) continue;
    for (let x = 0; x < STONE_PX; x++) {
      if (!inBody(x, y)) continue;
      // 光從左上：左緣亮、右緣暗；頂端一圈高光；石面雜點 ±1 階
      const t = (x + 0.5 - 16) / hw;
      let tone = t < -0.62 ? 5 : t < 0.1 ? 4 : t < 0.6 ? 3 : 2;
      if (y <= 2 || (y === 3 && t < 0.3)) tone = Math.min(6, tone + 1);
      const n = h01(x, y, 71);
      if (n < 0.1) tone--; else if (n > 0.93) tone++;
      // 底座石板：比碑身暗一階，上緣一列亮邊
      if (y >= 42) tone = y === 42 ? 4 : y >= 45 ? 2 : 3;
      b.set(x, y, s[Math.max(1, Math.min(6, tone))]);
    }
  }
  // 碑身與底座的接縫
  for (let x = 4; x < 28; x++) if (inBody(x, 41)) b.set(x, 41, s[1]);
  // 裂紋（右上斜下、左下一小段）
  b.line(21, 6, 23, 10, s[1]); b.set(23, 11, s[2]);
  b.line(9, 33, 10, 37, s[2]);
  // 苔：底座與碑腳的幾簇
  for (const [x, y, c] of [[5, 41, 2], [6, 41, 1], [6, 40, 2], [7, 40, 3], [25, 41, 1], [24, 41, 2], [10, 43, 2], [11, 43, 1], [20, 44, 1], [21, 43, 2]] as const) {
    b.set(x, y, MOSS[c]);
  }
  // 刻符：未解鎖 = 深槽 + 下方一格亮邊；解鎖 = 青色（芯更亮）
  const px = runePixels();
  const has = new Set(px.map((p) => p.y * STONE_PX + p.x));
  for (const p of px) {
    if (unlocked) {
      const core = has.has(p.y * STONE_PX + p.x - 1) && has.has(p.y * STONE_PX + p.x + 1);
      b.set(p.x, p.y, core ? GLOW[2] : GLOW[1]);
    } else {
      b.set(p.x, p.y, s[1]);
      if (!has.has((p.y + 1) * STONE_PX + p.x)) b.set(p.x, p.y + 1, s[5]);
    }
  }
  // 刻符外框（細的豎線，碑面像有一塊磨平的板）
  const frame: RGB = unlocked ? GLOW[0] : s[2];
  for (let y = 9; y <= 33; y++) { b.set(11, y, frame); b.set(20, y, frame); }
  return b.outline(INK);
}

/** 刻符的發光層（同 waystoneBmp 的座標；phase 0 / 1 = 暗 / 亮） */
export function waystoneGlyphBmp(phase: 0 | 1): Bmp {
  const b = new Bmp(STONE_PX, STONE_PY);
  const px = runePixels();
  const has = new Set(px.map((p) => p.y * STONE_PX + p.x));
  for (const p of px) {
    const core = has.has(p.y * STONE_PX + p.x - 1) && has.has(p.y * STONE_PX + p.x + 1);
    b.set(p.x, p.y, phase ? (core ? GLOW[3] : GLOW[2]) : (core ? GLOW[2] : GLOW[1]));
  }
  return b;
}
