// boatArt.ts — 小木船的手繪像素圖（純 Bmp，無 DOM）。光從左上；1px 描邊；只用 pixel.ts 統一色票。
//   · boatBmp：船上玩家腳下的船身（側面，寬 BOAT_PX；船頭朝右，畫的時候依面向鏡像）
//   · iconBoat：道具圖示（16×16）
import { Bmp, INK, h01, ramp } from './pixel';

const S = 16;
/** 兩色木紋：亮板（船舷）/ 暗板（船腹），由暗到亮 */
const WOOD = ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660', '#d8ba76');

/** 船身寬（含描邊，px） */
export const BOAT_PX = 28;
/** 船身高（含描邊，px） */
export const BOAT_PY = 10;
/** 船舷頂端（第一列木頭）在 bmp 裡的 y；畫的時候把這列放在玩家腳底上方 BOAT_RAIL_ABOVE px */
export const BOAT_RAIL_Y = 2;
/** 船舷頂比玩家腳底高幾 px（腳底 = 水線 + 吃水 4 → 船舷在水面上 3 px、龍骨在水面下 3 px） */
export const BOAT_RAIL_ABOVE = 7;

/**
 * 一塊船板：第 y 列、x0..x1，tone 決定亮 / 暗兩色；木紋（深一階的短線）依座標雜湊。
 */
function plank(b: Bmp, y: number, x0: number, x1: number, tone: number, seed: number): void {
  for (let x = x0; x <= x1; x++) b.set(x, y, WOOD[tone]);
  for (let k = 0; k < 3; k++) {
    const gx = x0 + 1 + Math.floor(h01(y, k, seed) * Math.max(1, x1 - x0 - 4));
    const len = 2 + Math.floor(h01(k, y, seed + 7) * 3);
    for (let i = 0; i < len && gx + i < x1; i++) b.set(gx + i, y, WOOD[tone - 1]);
  }
}

/** 船身（BOAT_PX × BOAT_PY；船頭朝右、比船尾翹一點） */
export function boatBmp(): Bmp {
  const b = new Bmp(BOAT_PX, BOAT_PY), w = WOOD, y0 = BOAT_RAIL_Y;
  // 船舷（亮）：頂端高光一列
  for (let x = 1; x <= 26; x++) b.set(x, y0, w[7]);
  plank(b, y0 + 1, 1, 26, 5, 11);
  // 船腹（暗 / 亮交錯的兩色板，越往下越窄）
  plank(b, y0 + 2, 2, 25, 3, 12);
  plank(b, y0 + 3, 3, 25, 4, 13);
  plank(b, y0 + 4, 4, 24, 3, 14);
  plank(b, y0 + 5, 6, 23, 2, 15);
  // 龍骨
  for (let x = 8; x <= 21; x++) b.set(x, y0 + 6, w[1]);
  // 船頭（右）翹起 + 船尾（左）短柱
  b.set(26, y0 - 1, w[6]); b.set(25, y0 - 1, w[6]);
  b.set(1, y0 - 1, w[5]);
  // 接縫 + 釘子
  for (const x of [9, 18]) { b.set(x, y0 + 1, w[2]); b.set(x, y0 + 2, w[1]); b.set(x, y0 + 3, w[2]); b.set(x + 1, y0 + 1, w[6]); }
  // 光從左上：船頭側面稍暗
  b.set(25, y0 + 2, w[2]); b.set(24, y0 + 4, w[1]);
  return b.outline(INK);
}

/** 道具圖示：側面的小木船（船頭翹起）+ 斜靠的一支槳 */
export function iconBoat(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  // 槳（從左上斜到船裡；槳葉在上）
  b.line(4, 3, 9, 9, w[4]);
  b.rect(2, 1, 2, 3, w[6]); b.set(4, 2, w[5]); b.set(2, 3, w[4]);
  // 船舷 + 翹起的船頭（右）/ 船尾（左）
  for (let x = 1; x <= 14; x++) b.set(x, 9, w[7]);
  b.set(14, 7, w[6]); b.set(14, 8, w[7]); b.set(13, 8, w[6]); b.set(1, 8, w[5]);
  plank(b, 10, 1, 14, 5, 21);
  plank(b, 11, 2, 13, 3, 22);
  plank(b, 12, 3, 12, 4, 23);
  for (let x = 5; x <= 10; x++) b.set(x, 13, w[1]);
  // 接縫
  b.set(8, 10, w[2]); b.set(8, 11, w[1]); b.set(9, 10, w[6]);
  return b.outline(INK);
}
