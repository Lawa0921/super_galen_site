// buildArt.ts — 建築 / 據點的像素圖（純 Bmp，無 DOM）：
//   · 新的實心方塊（深色 / 淺色木板、紅磚、紅 / 青屋瓦、玻璃）：texture 給 textures.ts 的 frameTile 自動接邊
//   · 人造背景牆（深色 / 淺色木板牆、石磚牆、紅磚牆、玻璃窗、灰泥牆）
//   · 家具 / 裝飾（圍欄 4 種接法、沙發 / 壁爐左右半、層架、吊燈、檯燈、地毯、盆栽、長椅、據點爐心）
//   · 這些道具的 16×16 圖示 + 建築木槌
//   全部色票色、不透明（透明 = 完全不畫）；光從左上，1px 描邊（INK）。
import { Bmp, INK, h01, ramp, type RGB } from './pixel';
import { T, W } from '../engine/tiles';
import type { ItemId } from '../engine/items';

const S = 16;
// ── 色階（[0] 最暗 → 亮） ──
const DARKWOOD = ramp('#0c0a12', '#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139');
const PALEWOOD = ramp('#472819', '#7c4c2e', '#966139', '#b07a4b', '#c99660', '#d8ba76', '#f2e2b0');
const WOOD = ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660');
const BRICK = ramp('#2a1810', '#6c1e14', '#8c2038', '#a83a10', '#c8344c', '#d98f66', '#f2b888');
const ROOFR = ramp('#2a1810', '#6c1e14', '#8c2038', '#c8344c', '#e890b0', '#ffc8dc', '#ffe2cc');
const ROOFS = ramp('#0c0a12', '#18204a', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#c4a0f0');
const GLASS = ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff');
const STONE = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8');
const FIRE = ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff');
const ROSE = ramp('#2c2450', '#7a5a8c', '#b8788e', '#e890b0', '#ffc8dc', '#ffe2cc');
const LEAF = ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478');
const CLAY = ramp('#2a1810', '#6c1e14', '#a83a10', '#d98f66', '#f2b888');
const CREAM = ramp('#966139', '#d8ba76', '#f2e2b0', '#fff4c0', '#ffffff');
const GOLD = ramp('#472819', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8');
const TEAL = ramp('#16301e', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0');
// 牆用暗色階（7 階，[0] = 外框）
const W_DARK = ramp('#0c0a12', '#0c0a12', '#1c1424', '#2a1810', '#2a1810', '#472819', '#472819');
const W_PALE = ramp('#0c0a12', '#2a1810', '#472819', '#623924', '#623924', '#7c4c2e', '#966139');
const W_STONE = ramp('#0c0a12', '#1c1424', '#2c2838', '#2c2838', '#423f54', '#5e5e74', '#5e5e74');
const W_BRICK = ramp('#0c0a12', '#1c1424', '#2a1810', '#6c1e14', '#6c1e14', '#8c2038', '#a83a10');
const W_GLASS = ramp('#0c0a12', '#1c1424', '#18204a', '#2c4486', '#2c4486', '#3e74c4', '#5c9ce0');
const W_PLASTER = ramp('#0c0a12', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8', '#cceaf8');

function outline(b: Bmp): Bmp { return b.outline(INK); }

// ── 實心方塊材質 ─────────────────────────────────────────
/** 橫向木板（4 條、每條 4px；接縫 + 釘） */
function planks(pal: RGB[], v: number, seed: number): Bmp {
  const b = new Bmp(S, S);
  for (let board = 0; board < 4; board++) {
    const y0 = board * 4, joint = (board * 7 + v * 5 + 3) % S, tone = h01(board, v, seed) > 0.5 ? 4 : 3;
    for (let x = 0; x < S; x++) {
      b.set(x, y0, pal[tone + 1]); b.set(x, y0 + 1, pal[tone]); b.set(x, y0 + 2, pal[tone]); b.set(x, y0 + 3, pal[1]);
    }
    for (let k = 0; k < 2; k++) {
      const gx = Math.floor(h01(board, k + 3, seed) * 12), gy = y0 + 1 + (k & 1), len = 3 + Math.floor(h01(board, k + 5, seed) * 4);
      for (let i = 0; i < len; i++) b.set(gx + i, gy, pal[tone - 1]);
    }
    for (let y = y0; y < y0 + 3; y++) { b.set(joint, y, pal[1]); b.set(joint + 1, y, pal[tone + 1]); }
    b.set(joint - 2, y0 + 1, pal[0]); b.set(joint + 3, y0 + 1, pal[0]);
  }
  return b;
}
/** 磚：4px 高的磚列、8px 寬、隔列錯半塊；灰縫 */
function bricks(pal: RGB[], mortar: RGB, mortarDark: RGB, v: number, seed: number, rowH = 4, brickW = 8): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / rowH), by = y % rowH;
    for (let x = 0; x < S; x++) {
      const xx = (x + (row & 1) * (brickW / 2) + v * 3) % S, bx = xx % brickW, brick = Math.floor(xx / brickW);
      const tone = h01(brick, row + v * 5, seed) > 0.6 ? 4 : h01(brick, row, seed + 1) < 0.3 ? 2 : 3;
      let c = pal[tone];
      if (by === rowH - 1) c = mortar;
      else if (bx === brickW - 1) c = mortarDark;
      else if (by === 0 && bx < brickW - 2) c = pal[tone + 1];
      else if (by === rowH - 2 && bx > 0) c = pal[tone - 1];
      b.set(x, y, c);
    }
  }
  return b;
}
/** 屋瓦：魚鱗狀（每列 4px，瓦片下緣圓弧、隔列錯開），上亮下暗 */
function roof(pal: RGB[], v: number): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 4), by = y % 4;
    for (let x = 0; x < S; x++) {
      const xx = (x + (row & 1) * 2 + v) % S, tx = xx % 4;
      // 弧形下緣：中間 2px 比兩邊低一列
      const edge = by === 3 || (by === 2 && (tx === 0 || tx === 3));
      let c = by === 0 ? pal[4] : by === 1 ? pal[3] : pal[3];
      if (tx === 0 && by < 2) c = pal[5];
      if (edge) c = pal[1];
      if (by === 2 && tx === 2) c = pal[2];
      b.set(x, y, c);
    }
  }
  return b;
}
/** 玻璃：大部分透明，左上斜向兩道反光、零星淡藍點 */
function glass(v: number): Bmp {
  const b = new Bmp(S, S);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    const d = x + y;
    if (d === 10 + v || d === 11 + v) b.set(x, y, GLASS[6]);
    else if (d === 14 + v) b.set(x, y, GLASS[5]);
    else if ((x * 3 + y * 5 + v) % 11 === 0) b.set(x, y, GLASS[4]);
  }
  return b;
}

export function buildTileBmp(id: number, v: number): Bmp | null {
  switch (id) {
    case T.DARK_PLANKS: return planks(DARKWOOD, v, 3101);
    case T.PALE_PLANKS: return planks(PALEWOOD, v, 3121);
    case T.RED_BRICK: return bricks(BRICK, STONE[5], STONE[3], v, 3141);
    case T.ROOF_RED: return roof(ROOFR, v);
    case T.ROOF_SLATE: return roof(ROOFS, v);
    case T.GLASS: return glass(v);
    default: return null;
  }
}
/** 新方塊的外框色階（frameTile 用：[0] 外框、[1] 受光外框、[6] 受光高光） */
export const BUILD_TILE_PAL: Record<number, RGB[]> = {
  [T.DARK_PLANKS]: DARKWOOD, [T.PALE_PLANKS]: PALEWOOD, [T.RED_BRICK]: BRICK,
  [T.ROOF_RED]: ROOFR, [T.ROOF_SLATE]: ROOFS, [T.GLASS]: GLASS,
};

// ── 背景牆 ───────────────────────────────────────────────
function plankWall(p: RGB[], v: number, seed: number): Bmp {
  const b = new Bmp(S, S);
  for (let x = 0; x < S; x++) {
    const plank = Math.floor((x + v * 2) / 4), px = ((x + v * 2) % 4 + 4) % 4, tone = h01(plank, 1, seed) > 0.5 ? 4 : 3;
    for (let y = 0; y < S; y++) {
      let c = p[tone];
      if (px === 3) c = p[1];
      else if (px === 0) c = p[tone + 1];
      if (y === (plank * 5 + 3) % S && px !== 3) c = p[2];
      b.set(x, y, c);
    }
  }
  return b;
}
function windowWall(v: number): Bmp {
  const b = new Bmp(S, S), p = W_GLASS, f = W_DARK;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const frame = x === 0 || y === 0 || x === 7 || x === 8 || y === 7 || y === 8 || x === 15 || y === 15;
    if (frame) { b.set(x, y, x === 7 || y === 7 || x === 0 || y === 0 ? f[5] : f[3]); continue; }
    const lx = x % 8, ly = y % 8, d = lx + ly;
    b.set(x, y, d === 4 + (v & 1) || d === 5 + (v & 1) ? p[6] : ly < 3 ? p[5] : p[4]);
  }
  return b;
}
function plaster(v: number): Bmp {
  const b = new Bmp(S, S), p = W_PLASTER, seed = 3301 + v * 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x >> 1, y >> 1, seed);
    b.set(x, y, n > 0.82 ? p[5] : n < 0.12 ? p[3] : p[4]);
  }
  // 細小的裂紋
  for (let k = 0; k < 3; k++) b.set((v * 5 + k * 3 + 4) % S, 6 + k, p[2]);
  return b;
}
export function buildWallBmp(id: number, v: number): { b: Bmp; pal: RGB[] } | null {
  switch (id) {
    case W.DARK_PLANK_WALL: return { b: plankWall(W_DARK, v, 3201), pal: W_DARK };
    case W.PALE_PLANK_WALL: return { b: plankWall(W_PALE, v, 3221), pal: W_PALE };
    case W.STONE_BRICK_WALL: return { b: bricks(W_STONE, W_STONE[1], W_STONE[1], v, 3241, 4, 8), pal: W_STONE };
    case W.RED_BRICK_WALL: return { b: bricks(W_BRICK, W_STONE[2], W_STONE[1], v, 3261), pal: W_BRICK };
    case W.GLASS_WALL: return { b: windowWall(v), pal: W_GLASS };
    case W.PLASTER_WALL: return { b: plaster(v), pal: W_PLASTER };
    default: return null;
  }
}

// ── 家具 / 裝飾 ──────────────────────────────────────────
/** 圍欄：style 位元 1 = 左邊接、2 = 右邊接；中間一根柱子、兩道橫木 */
function fence(style: number): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  const l = (style & 1) !== 0, r = (style & 2) !== 0;
  const x0 = l ? 0 : 6, x1 = r ? 15 : 9;
  for (const ry of [6, 11]) for (let x = x0; x <= x1; x++) { b.set(x, ry, w[5]); b.set(x, ry + 1, w[3]); }
  for (let y = 3; y < 16; y++) { b.set(6, y, w[5]); b.set(7, y, w[4]); b.set(8, y, w[4]); b.set(9, y, w[2]); }
  b.set(7, 2, w[5]); b.set(8, 2, w[4]); // 尖頂
  return outline(b);
}
/** 沙發（32×16 的左 / 右半）：靠背、坐墊、扶手、木腳 */
function sofaFull(): Bmp {
  const b = new Bmp(32, S), c = ROSE, w = WOOD;
  b.rect(2, 4, 28, 6, c[2]); b.rect(2, 4, 28, 1, c[3]); // 靠背
  for (let x = 6; x < 28; x += 8) for (let y = 5; y < 9; y++) b.set(x, y, c[1]); // 釦眼縫線
  b.rect(1, 9, 30, 4, c[3]); b.rect(1, 9, 30, 1, c[4]); b.rect(1, 12, 30, 1, c[1]); // 坐墊
  b.set(15, 10, c[2]); b.set(16, 10, c[2]); b.set(15, 11, c[2]); b.set(16, 11, c[2]);
  b.rect(0, 6, 3, 7, c[2]); b.rect(0, 6, 3, 1, c[4]); b.rect(29, 6, 3, 7, c[1]); b.rect(29, 6, 3, 1, c[3]); // 扶手
  b.rect(1, 13, 30, 1, c[0]);
  for (const lx of [2, 28]) { b.rect(lx, 14, 2, 2, w[2]); b.set(lx, 14, w[4]); }
  return outline(b);
}
/** 壁爐（32×16）：石磚爐身、木製爐台、拱形爐口裡的柴火與火焰 */
function fireplaceFull(flick: number): Bmp {
  const b = new Bmp(32, S), s = STONE, w = WOOD, f = FIRE;
  b.rect(0, 1, 32, 2, w[4]); b.rect(0, 1, 32, 1, w[6]); b.rect(0, 3, 32, 1, w[1]); // 爐台
  for (let y = 4; y < 16; y++) for (let x = 1; x < 31; x++) {
    const row = Math.floor((y - 4) / 3), by = (y - 4) % 3, xx = (x + (row & 1) * 3) % 6;
    b.set(x, y, by === 2 || xx === 5 ? s[2] : h01(Math.floor((x + (row & 1) * 3) / 6), row, 3401) > 0.5 ? s[5] : s[4]);
  }
  // 爐口（拱形）
  for (let y = 7; y < 16; y++) for (let x = 6; x < 26; x++) {
    const dx = (x - 15.5) / 10, top = 7 + Math.round(dx * dx * 3);
    if (y >= top) b.set(x, y, y === top ? s[1] : s[0]);
  }
  // 柴火
  b.rect(9, 14, 14, 2, w[2]); b.rect(9, 14, 14, 1, w[4]); b.set(12, 13, w[3]); b.set(19, 13, w[3]);
  // 火焰（三束，flick 換形狀）
  const flames: [number, number][] = [[12, 4], [16, 6], [20, 4]];
  flames.forEach(([cx, hgt], k) => {
    const hh = hgt + ((flick + k) % 2);
    for (let i = 0; i < hh; i++) {
      const y = 13 - i, half = Math.max(0, Math.round((hh - i) / 2.2));
      for (let dx = -half; dx <= half; dx++) b.set(cx + dx + ((i + flick) % 3 === 0 ? 1 : 0), y, i > hh - 2 ? f[2] : Math.abs(dx) < half ? f[4] : f[3]);
    }
    b.set(cx, 12, f[5]);
  });
  return outline(b);
}
function half(full: Bmp, right: boolean): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) b.setRaw(x, y, full.raw(x + (right ? S : 0), y));
  return b;
}
/** 層架（掛牆）：木板 + 兩個三角托架 + 書 / 罐子 */
function shelf(style: number): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  b.rect(1, 9, 14, 2, w[4]); b.rect(1, 9, 14, 1, w[6]); b.rect(1, 11, 14, 1, w[1]);
  for (const bx of [3, 12]) { for (let k = 0; k < 3; k++) b.set(bx, 12 + k, w[2]); b.set(bx + (bx > 8 ? -1 : 1), 12, w[2]); }
  if (style % 2 === 0) {
    const books: [number, number, RGB[]][] = [[2, 6, ROSE], [4, 5, TEAL], [6, 7, ROOFS], [8, 5, BRICK]];
    for (const [x, h, c] of books) { b.rect(x, 9 - h, 2, h, c[3]); b.rect(x, 9 - h, 1, h, c[4]); b.set(x + 1, 9 - h, c[2]); }
    b.disc(12.5, 7, 2, 2, CLAY[3]); b.rect(11, 5, 3, 1, CLAY[2]); b.set(11, 6, CLAY[4]);
  } else {
    b.disc(4, 7, 2.2, 2.2, GLASS[4]); b.set(3, 6, GLASS[6]); b.rect(3, 4, 2, 1, w[3]);
    b.rect(8, 5, 5, 4, CREAM[1]); b.rect(8, 5, 5, 1, CREAM[3]); b.set(10, 7, BRICK[3]);
  }
  return outline(b);
}
/** 吊燈：吊鏈 + 金色環臂 + 三根蠟燭與火光 */
function chandelier(): Bmp {
  const b = new Bmp(S, S), g = GOLD;
  for (let y = 0; y < 4; y++) b.set(7 + (y & 1), y, IRON[4]);
  b.rect(2, 9, 12, 1, g[3]); b.rect(3, 10, 10, 1, g[2]); b.rect(6, 11, 4, 2, g[3]); b.set(7, 13, g[4]);
  b.rect(7, 4, 2, 5, g[3]); b.set(7, 4, g[4]);
  for (const cx of [2, 7, 12]) {
    b.rect(cx, 6, 2, 3, CREAM[3]); b.set(cx, 6, CREAM[4]);
    b.set(cx, 5, FIRE[4]); b.set(cx + 1, 5, FIRE[3]); b.set(cx, 4, FIRE[5]);
  }
  return outline(b);
}
/** 檯燈：底座 + 燈柱 + 奶油色燈罩（內側亮） */
function tableLamp(): Bmp {
  const b = new Bmp(S, S);
  b.rect(5, 14, 6, 2, WOOD[3]); b.rect(5, 14, 6, 1, WOOD[5]);
  b.rect(7, 9, 2, 5, GOLD[3]); b.set(7, 9, GOLD[4]);
  for (let y = 3; y < 9; y++) {
    const half = 2 + Math.round((y - 3) * 0.6);
    for (let x = 8 - half; x < 8 + half; x++) b.set(x, y, y === 8 ? FIRE[4] : x < 8 - half + 2 ? CREAM[4] : CREAM[2]);
  }
  b.set(7, 2, CREAM[1]); b.set(8, 2, CREAM[1]);
  return outline(b);
}
/** 地毯：紅底金邊、中間菱形花紋、兩端流蘇 */
function rug(style: number): Bmp {
  const b = new Bmp(S, S), r = style % 2 === 0 ? BRICK : ROOFS;
  for (let y = 12; y < 16; y++) for (let x = 0; x < S; x++) {
    let c = r[3];
    if (y === 12 || y === 15) c = GOLD[3];
    else if ((x + y) % 6 === 0 || (x - y + 18) % 6 === 0) c = GOLD[4];
    else if (y === 13) c = r[4];
    b.set(x, y, c);
  }
  return b;
}
/** 盆栽：陶盆 + 三種植物（圓葉、尖葉、開花） */
function pottedPlant(style: number): Bmp {
  const b = new Bmp(S, S), c = CLAY, l = LEAF;
  b.rect(4, 10, 8, 1, c[4]); b.rect(4, 11, 8, 1, c[3]);
  for (let y = 12; y < 16; y++) { const in0 = y - 12 > 1 ? 1 : 0; b.rect(5 + in0, y, 6 - in0 * 2, 1, c[3]); b.set(5 + in0, y, c[4]); b.set(10 - in0, y, c[2]); }
  b.rect(5, 10, 6, 1, WOOD[1]);
  const s = style % 3;
  if (s === 0) {
    b.disc(8, 6, 4, 3.5, l[3]); b.disc(6.5, 5, 2, 2, l[4]); b.disc(10, 7, 2, 1.6, l[2]); b.set(6, 4, l[5]);
    b.rect(7, 8, 1, 2, l[1]);
  } else if (s === 1) {
    for (const [dx, h] of [[-3, 6], [-1, 8], [1, 9], [3, 6]] as [number, number][]) for (let i = 0; i < h; i++) b.set(8 + dx + (i > h / 2 ? Math.sign(dx) : 0), 9 - i, i > h - 3 ? l[5] : l[3]);
  } else {
    b.disc(8, 6, 3.5, 3, l[2]); b.disc(7, 5, 2, 1.6, l[3]);
    for (const [fx, fy] of [[6, 4], [10, 5], [8, 7]]) { b.set(fx, fy, ROSE[4]); b.set(fx + 1, fy, ROSE[3]); b.set(fx, fy + 1, ROSE[3]); b.set(fx + 1, fy + 1, FIRE[4]); }
  }
  return outline(b);
}
/** 長椅：三條靠背板 + 坐板 + 兩支腳 */
function bench(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  for (const y of [4, 7]) { b.rect(0, y, 16, 2, w[4]); b.rect(0, y, 16, 1, w[6]); }
  for (const x of [2, 13]) for (let y = 4; y < 10; y++) b.set(x, y, w[2]);
  b.rect(0, 10, 16, 2, w[5]); b.rect(0, 10, 16, 1, w[6]); b.rect(0, 12, 16, 1, w[2]);
  for (const x of [2, 12]) { b.rect(x, 13, 2, 3, w[3]); b.set(x, 13, w[5]); }
  return outline(b);
}
/** 據點爐心：石砌火盆（金色符紋）上燃著大火，flick 換火形 */
function hearth(flick: number): Bmp {
  const b = new Bmp(S, S), s = STONE, f = FIRE;
  // 盆身
  for (let y = 9; y < 16; y++) {
    const half = y < 11 ? 7 : y < 14 ? 6 : 5;
    for (let x = 8 - half; x < 8 + half; x++) b.set(x, y, y === 9 ? s[6] : x < 8 - half + 2 ? s[5] : x > 8 + half - 3 ? s[3] : s[4]);
  }
  b.rect(1, 10, 14, 1, s[2]);
  for (const [x, y] of [[4, 12], [8, 13], [11, 12]]) { b.set(x, y, GOLD[4]); b.set(x + 1, y, GOLD[3]); } // 符紋
  // 火焰
  for (let i = 0; i < 9; i++) {
    const y = 9 - i, w0 = Math.max(0, Math.round((9 - i) / 2.1));
    const sway = ((i + flick) % 4 === 0 ? 1 : 0) - ((i + flick) % 5 === 0 ? 1 : 0);
    for (let dx = -w0; dx <= w0; dx++) b.set(8 + dx + sway, y, i > 6 ? f[2] : Math.abs(dx) < w0 - 1 ? f[5] : Math.abs(dx) < w0 ? f[4] : f[3]);
  }
  b.set(8, 7, f[6]);
  return outline(b);
}

const SOFA = sofaFull();
const FIREPLACES = [0, 1, 2].map((k) => fireplaceFull(k));

/** 裝飾 tile 的點陣（沒有 → null）；style = autotile.decorStyle 的欄 */
export function buildDecorBmp(id: number, style: number): Bmp | null {
  switch (id) {
    case T.FENCE: return fence(style & 3);
    case T.SOFA_L: return half(SOFA, false);
    case T.SOFA_R: return half(SOFA, true);
    case T.FIREPLACE_L: return half(FIREPLACES[style % 3], false);
    case T.FIREPLACE_R: return half(FIREPLACES[style % 3], true);
    case T.SHELF: return shelf(style);
    case T.CHANDELIER: return chandelier();
    case T.TABLE_LAMP: return tableLamp();
    case T.RUG: return rug(style);
    case T.POTTED_PLANT: return pottedPlant(style);
    case T.BENCH: return bench();
    case T.HEARTH: return hearth(style % 3);
    default: return null;
  }
}
/** 每種新裝飾在圖集裡的欄數 */
export const BUILD_DECOR_STYLES: Record<number, number> = {
  [T.FENCE]: 4, [T.SOFA_L]: 1, [T.SOFA_R]: 1, [T.FIREPLACE_L]: 3, [T.FIREPLACE_R]: 3, [T.SHELF]: 2, [T.CHANDELIER]: 1,
  [T.TABLE_LAMP]: 1, [T.RUG]: 2, [T.POTTED_PLANT]: 3, [T.BENCH]: 1, [T.HEARTH]: 3,
};

// ── 圖示 ─────────────────────────────────────────────────
/** 方塊圖示：材質中間 12×12 + 外框 */
function blockIcon(tex: Bmp, pal: RGB[]): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
    const v = tex.raw(x + 2, y + 2);
    const edge = x === 0 || y === 0 || x === 11 || y === 11;
    if (edge) b.set(x + 2, y + 2, x === 0 || y === 0 ? pal[5] : pal[1]);
    else if (v >>> 24) b.setRaw(x + 2, y + 2, v);
    else b.set(x + 2, y + 2, pal[2]);
  }
  return outline(b);
}
/** 牆圖示：斜切的一塊牆（看得出是背景牆） */
function wallIcon(w: { b: Bmp; pal: RGB[] }): Bmp {
  const b = new Bmp(S, S);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) {
    if (x + y < 6 || x + y > 22) continue;
    b.setRaw(x, y, w.b.raw(x, y));
  }
  return outline(b);
}
/** 32 寬的家具縮成圖示（每 2×2 取左上） */
function shrink(full: Bmp): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < 8; y++) for (let x = 0; x < S; x++) b.setRaw(x, y + 6, full.raw(x * 2, y * 2 + 1));
  return b;
}
/** 建築木槌：木柄 + 大木槌頭 */
function hammerIcon(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  for (let i = 0; i < 9; i++) { b.set(3 + i, 13 - i, w[4]); b.set(4 + i, 13 - i, w[2]); }
  for (let y = 1; y < 8; y++) for (let x = 7; x < 15; x++) {
    const dx = x - 11 + y - 4, dy = y - 4 - (x - 11);
    if (Math.abs(dx) <= 3 && Math.abs(dy) <= 2) b.set(x, y, dy < 0 ? PALEWOOD[5] : dx > 1 ? PALEWOOD[2] : PALEWOOD[4]);
  }
  b.set(4, 12, IRON[4]);
  return outline(b);
}

export function buildIcon(item: ItemId): Bmp | null {
  const tileIcon = (id: number): Bmp => blockIcon(buildTileBmp(id, 0) ?? new Bmp(S, S), BUILD_TILE_PAL[id]);
  const wall = (id: number): Bmp => wallIcon(buildWallBmp(id, 0)!);
  switch (item) {
    case 'dark_planks': return tileIcon(T.DARK_PLANKS);
    case 'pale_planks': return tileIcon(T.PALE_PLANKS);
    case 'red_brick': return tileIcon(T.RED_BRICK);
    case 'roof_red': return tileIcon(T.ROOF_RED);
    case 'roof_slate': return tileIcon(T.ROOF_SLATE);
    case 'glass': { const b = tileIcon(T.GLASS); return b; }
    case 'fence': return fence(3);
    case 'wood_beam': {
      const b = new Bmp(S, S);
      for (let y = 1; y < 15; y++) { b.rect(6, y, 4, 1, WOOD[4]); b.set(6, y, WOOD[6]); b.set(9, y, WOOD[2]); if (y % 5 === 2) b.rect(7, y, 2, 1, WOOD[2]); }
      return outline(b);
    }
    case 'dark_plank_wall': return wall(W.DARK_PLANK_WALL);
    case 'pale_plank_wall': return wall(W.PALE_PLANK_WALL);
    case 'stone_brick_wall': return wall(W.STONE_BRICK_WALL);
    case 'red_brick_wall': return wall(W.RED_BRICK_WALL);
    case 'glass_wall': return wall(W.GLASS_WALL);
    case 'plaster_wall': return wall(W.PLASTER_WALL);
    case 'sofa': return shrink(SOFA);
    case 'fireplace': return shrink(FIREPLACES[0]);
    case 'shelf': return shelf(0);
    case 'chandelier': return chandelier();
    case 'table_lamp': return tableLamp();
    case 'rug': { const b = new Bmp(S, S); b.blit(rug(0), 0, -6); return b; }
    case 'potted_plant': return pottedPlant(0);
    case 'bench': return bench();
    case 'hearth': return hearth(0);
    case 'builder_hammer': return hammerIcon();
    default: return null;
  }
}
export const BUILD_ICONS: readonly ItemId[] = [
  'dark_planks', 'pale_planks', 'red_brick', 'roof_red', 'roof_slate', 'glass', 'fence', 'wood_beam',
  'dark_plank_wall', 'pale_plank_wall', 'stone_brick_wall', 'red_brick_wall', 'glass_wall', 'plaster_wall',
  'sofa', 'fireplace', 'shelf', 'chandelier', 'table_lamp', 'rug', 'potted_plant', 'bench', 'hearth', 'builder_hammer',
];
