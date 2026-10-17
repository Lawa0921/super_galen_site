// liquidArt.ts — 液體相關的手繪像素圖（純 Bmp，無 DOM）。只用 pixel.ts 統一色票；光從左上；1px 描邊。
//   · tile：蜂巢殼、酥蜜塊、蜂巢牆
//   · 圖示：空桶 / 水桶 / 熔岩桶 / 蜂蜜桶、吸水海綿、熔殼護符
//   · 液體貼片（liquidTile）：水 / 熔岩 / 蜂蜜 × 填充高度 0..16 × 動畫格 × 種類（水面 / 內部 / 落下的水柱）。
//     不用半透明：水用 Bayer 抖動挖洞（洞裡透出後面的 tile），蜂蜜較密，熔岩不透明；水面一排亮線 + 波浪。
//   · 氣泡（breathBubble）：玩家頭上的呼吸泡泡（滿 / 破）
import { Bmp, INK, bayer, h01, hex, ramp, type RGB } from './pixel';
import { LIQ } from '../engine/liquidKind';

const S = 16;
export const HIVE_PAL = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
export const CRISPY_PAL = ramp('#2a1810', '#623924', '#966139', '#c99660', '#d8ba76', '#f2e2b0', '#fff4c0');
export const HIVE_WALL_PAL = ramp('#0c0a12', '#0c0a12', '#1c1424', '#2a1810', '#2a1810', '#472819', '#472819');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff');
const WATER = ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff');
const LAVA = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const HONEY = ramp('#472819', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff');
const OBS = ramp('#0c0a12', '#18204a', '#2c2450', '#463c78', '#7a5a8c', '#b8788e');
const SPONGE = ramp('#623924', '#b07a4b', '#d8ba76', '#ffd86a', '#fff4c0');

/** 蜂巢格（8×4、隔列錯開 4）：格線深、格心亮，偶有蜜滴；週期 16 → 相鄰 tile 無縫 */
function combCell(x: number, y: number, v: number): { edge: boolean; corner: boolean; cell: number; by: number } {
  const row = Math.floor(y / 4), by = y % 4, off = (row & 1) * 4 + v * 2;
  const bx = ((x + off) % 8 + 8) % 8;
  const cell = Math.floor((x + off) / 8) + row * 5;
  const edge = by === 0 || bx === 0;
  const corner = (by === 1 || by === 3) && (bx === 1 || bx === 7);
  return { edge, corner, cell, by };
}
export function texHive(v: number): Bmp {
  const b = new Bmp(S, S), p = HIVE_PAL, seed = 1201 + v * 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = combCell(x, y, v);
    let col: RGB;
    if (c.edge) col = p[1];
    else if (c.corner) col = p[2];
    else if (c.by === 1) col = h01(c.cell, 1, seed) > 0.7 ? p[5] : p[4];
    else col = h01(c.cell, 2, seed) > 0.5 ? p[3] : p[4];
    b.set(x, y, col);
  }
  return b;
}
export function texCrispy(v: number): Bmp {
  const b = new Bmp(S, S), p = CRISPY_PAL, seed = 1221 + v * 5;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = combCell(x, y, v);
    // 酥脆的焦糖色塊：格線淺褐、格心帶一點焦斑
    let col: RGB = c.edge ? p[2] : c.corner ? p[3] : c.by === 1 ? p[5] : p[4];
    if (!c.edge && h01(x, y, seed) > 0.9) col = p[3];
    b.set(x, y, col);
  }
  return b;
}
export function texHiveWall(v: number): Bmp {
  const b = new Bmp(S, S), p = HIVE_WALL_PAL;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = combCell(x, y, v);
    b.set(x, y, c.edge ? p[1] : c.corner ? p[2] : c.by === 1 ? p[5] : p[3]);
  }
  return b;
}

// ── 圖示 ───────────────────────────────────────────────
/** 鐵桶（提把 + 桶身），fill = 桶口液體色階（null = 空桶） */
function pail(fill: RGB[] | null): Bmp {
  const b = new Bmp(S, S);
  // 提把
  for (let x = 4; x <= 11; x++) b.set(x, 2, IRON[4]);
  b.set(3, 3, IRON[4]); b.set(12, 3, IRON[3]); b.set(3, 4, IRON[3]); b.set(12, 4, IRON[3]);
  // 桶身：上寬下窄
  for (let y = 5; y < 15; y++) {
    const inset = Math.floor((y - 5) / 4);
    const x0 = 3 + inset, x1 = 12 - inset;
    for (let x = x0; x <= x1; x++) {
      let c = x === x0 ? IRON[5] : x === x1 ? IRON[2] : x < x0 + 3 ? IRON[4] : IRON[3];
      if (y === 8 || y === 12) c = IRON[2];
      b.set(x, y, c);
    }
  }
  // 桶口
  for (let x = 3; x <= 12; x++) b.set(x, 5, fill ? (x < 6 ? fill[5] : x > 10 ? fill[3] : fill[4]) : IRON[1]);
  if (fill) { b.set(5, 4, fill[5]); b.set(9, 4, fill[4]); }
  return b.outline(INK);
}
export function iconBucket(liquid: number): Bmp {
  return pail(liquid === LIQ.WATER ? WATER : liquid === LIQ.LAVA ? LAVA : liquid === LIQ.HONEY ? HONEY : null);
}
/** 吸水海綿：多孔的黃色方塊 */
export function iconSponge(): Bmp {
  const b = new Bmp(S, S), p = SPONGE;
  for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
    let c = x < 4 || y < 5 ? p[3] : x > 11 || y > 11 ? p[1] : p[2];
    if (h01(x, y, 77) > 0.78 && x > 2 && y > 3 && x < 13 && y < 13) c = p[0];
    b.set(x, y, c);
  }
  b.set(3, 4, p[4]); b.set(4, 3, p[4]);
  return b.outline(INK);
}
/** 熔殼護符：黑曜石框 + 中間一顆熔岩色寶石、上方小環 */
export function iconMagmaWard(): Bmp {
  const b = new Bmp(S, S);
  b.disc(8, 2.5, 1.6, 1.6, OBS[4]);
  b.set(8, 2, OBS[0]);
  b.disc(8, 9, 6, 5.6, OBS[2]);
  b.disc(8, 9, 4.8, 4.4, OBS[1]);
  for (const [x, y] of [[4, 6], [5, 5], [6, 4]] as const) b.set(x, y, OBS[5]);
  b.disc(8, 9.2, 3.2, 3, LAVA[3]);
  b.disc(7.4, 8.6, 1.8, 1.6, LAVA[5]);
  b.set(7, 8, LAVA[6]);
  b.set(10, 11, LAVA[2]); b.set(9, 12, LAVA[2]);
  return b.outline(INK);
}

// ── 液體貼片 ─────────────────────────────────────────────
export type LiquidPiece = 'surface' | 'body' | 'fall';
export const LIQUID_FRAMES = 4;
/** 液體貼片：type（LIQ.*）、h = 填充高度 1..16（美術 px）、frame 0..3、piece */
export function liquidTile(type: number, h: number, frame: number, piece: LiquidPiece): Bmp {
  const b = new Bmp(S, S);
  const top = piece === 'surface' ? S - h : 0;
  // 水面波浪：週期 16 px（相鄰 tile 接得起來），每格動畫往右移 4 px；只影響水面那一排上下 1 px
  const wave = (x: number): number => {
    const ph = (x + frame * 4) & 15;
    return ph < 4 ? 0 : ph < 8 ? 1 : ph < 12 ? 0 : -1;
  };
  for (let x = 0; x < S; x++) {
    const sTop = piece === 'surface' ? Math.max(0, Math.min(S - 1, top + (h >= 3 ? wave(x) : 0))) : 0;
    for (let y = sTop; y < S; y++) {
      const d = y - sTop; // 距水面幾 px
      const c = pixelOf(type, x, y, d, frame, piece);
      if (c) b.set(x, y, c);
    }
  }
  return b;
}

/** 單一像素顏色（null = 透明，透出後面的 tile） */
function pixelOf(type: number, x: number, y: number, d: number, frame: number, piece: LiquidPiece): RGB | null {
  const surf = piece === 'surface';
  const t = bayer(x, y);
  if (type === LIQ.LAVA) {
    // 熔岩：不透明。水面亮殼 → 橘 → 深紅，內部有緩慢移動的亮紋
    if (surf && d === 0) return LAVA[6 - ((x + frame) & 1)];
    if (surf && d === 1) return LAVA[5];
    const flow = piece === 'fall' ? (y + frame * 4) & 15 : (x * 3 + y * 5 + frame * 2) & 15;
    const n = h01(x, y, 31 + (piece === 'fall' ? 0 : frame >> 1));
    if (flow < 2 || n > 0.93) return LAVA[4];
    if (n > 0.55) return LAVA[3];
    return (x + y) & 1 ? LAVA[2] : LAVA[3];
  }
  if (type === LIQ.HONEY) {
    // 蜂蜜：3/4 抖動（只有 Bayer 最高那一階挖洞），琥珀色；水面亮
    if (surf && d === 0) return HONEY[5];
    if (surf && d === 1) return HONEY[4];
    if (t > 0.75) return null;
    if (piece === 'fall' && ((y + frame * 2) & 7) === 0) return HONEY[5];
    // 琥珀：亮黃斑點（蜂蜜的光澤）+ 橘，最暗只到深橘
    if (surf && d < 4) return t < 0.4 ? HONEY[4] : HONEY[3];
    return t < 0.12 ? HONEY[4] : t < 0.45 ? HONEY[3] : HONEY[2];
  }
  // 水：水面亮線 + 第二排淺藍，往下越深越密：上 4 px 50% 棋盤，之後 Bayer 5/8
  if (surf && d === 0) return ((x + frame) & 3) === 0 ? WATER[6] : WATER[5];
  if (surf && d === 1) return (x + y) & 1 ? WATER[4] : null;
  if (piece === 'fall') {
    // 落下的水柱：直條紋往下流
    const streak = (y - frame * 2) & 7;
    if ((x & 3) === 1 && streak < 3) return WATER[5];
    return (x + y) & 1 ? WATER[3] : t < 0.4 ? WATER[2] : null;
  }
  const dense = surf ? (d < 5 ? 0.5 : 0.625) : 0.625;
  if (t >= dense) return null;
  return t < 0.12 ? WATER[3] : t < 0.4 ? WATER[2] : WATER[1];
}

/**
 * 某格液體用哪種貼片：下面還能流（落下中）→ 落下的水柱；上方沒有液體 → 水面
 * （高度 = 量 / 255 × 16，至少 1 px）；其他 → 滿格內部。
 */
export function liquidPiece(amount: number, above: boolean, belowOpen: boolean): { piece: LiquidPiece; h: number } {
  if (belowOpen) return { piece: 'fall', h: S }; // 落下中：畫成連續的水柱（不畫一格一格的水面）
  if (!above) return { piece: 'surface', h: Math.max(1, Math.min(S, Math.round((amount / 255) * S))) };
  return { piece: 'body', h: S };
}

/** 液體在小地圖 / 世界總覽上的顏色 */
export const LIQUID_MAP_COLOR: Record<number, string> = {
  [LIQ.WATER]: '#3e74c4', [LIQ.LAVA]: '#e8701c', [LIQ.HONEY]: '#ffa93a',
};

// ── 呼吸泡泡（7×7）：滿 = 淺藍圓 + 亮點；破 = 只剩小碎點 ────────────────
export function breathBubble(full: boolean): Bmp {
  const b = new Bmp(7, 7);
  if (full) {
    b.disc(3.5, 3.5, 2.6, 2.6, WATER[4]);
    b.disc(3.5, 3.5, 1.6, 1.6, WATER[3]);
    b.set(2, 2, WATER[6]); b.set(3, 2, WATER[5]);
    return b.outline(INK);
  }
  b.set(1, 3, WATER[4]); b.set(5, 2, WATER[4]); b.set(3, 5, WATER[3]);
  return b;
}

export { hex };
