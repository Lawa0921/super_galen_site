// decor.ts — 第二批手繪像素美術（純資料 Bmp，無 DOM）：
//   · 新材料 16×16 材質（銀 / 金礦、黏土、碎石、花崗岩、大理石、砂岩、雪、冰、泥巴、石磚）
//   · 新背景牆（木板牆、砂岩牆、雪牆、冰牆、泥巴牆）
//   · 裝飾物件（花、草、蘑菇、石頭、灌木、南瓜、仙人掌、枯枝、雪灌木、蕨、藤蔓、螢光菇、水晶、鐘乳石 / 石筍、蜘蛛網、
//     陶罐、箱子、木樑），每種多個 style
//   · 新道具圖示（硬幣、水晶碎片、仙人掌、蘑菇…）
// 全部只用 pixel.ts 統一色票上的顏色；光從左上來；成簇不撒點；描邊 1px（植物用自身最暗色描邊）。
import { T } from '../engine/tiles';
import { CACTUS_STYLE } from './autotile';
import { Bmp, INK, h01, hex, ramp, type RGB } from './pixel';
import {
  platformBmp, doorClosedBmp, doorOpenBmp, doorLockedBmp, lockedChestBmp, chainBmp, bannerBmp, candleBmp, lanternBmp,
  bookshelfBmp, bonesBmp, loreTabletBmp,
} from './dungeonArt';

const S = 16;

// ── 色票（[0] = 描邊 / 最暗） ─────────────────────────────
export const PAL2 = {
  silver: ramp('#1c1424', '#423f54', '#858aa0', '#b4b9c8', '#cceaf8', '#ffffff', '#ffffff'),
  gold: ramp('#2a1810', '#6c1e14', '#a83a10', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff'),
  clay: ramp('#2a1810', '#472819', '#6c1e14', '#a83a10', '#b8788e', '#d98f66', '#f2b888'),
  gravel: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  granite: ramp('#0c0a12', '#18204a', '#2c2450', '#463c78', '#5e5e74', '#7a5a8c', '#b4b9c8'),
  marble: ramp('#2c2838', '#707490', '#858aa0', '#b4b9c8', '#cceaf8', '#ffffff', '#ffffff'),
  sandstone: ramp('#2a1810', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660', '#d8ba76'),
  snow: ramp('#2c4486', '#7f9cc4', '#94c8ee', '#b4b9c8', '#cceaf8', '#ffffff', '#ffffff'),
  ice: ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff'),
  mud: ramp('#0c0a12', '#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139'),
  mushroomGrass: ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff'),
  jungleGrass: ramp('#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478', '#fff4c0'),
  stone: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  wood: ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660'),
  leaf: ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
  // 背景牆（暗）
  plankWall: ramp('#0c0a12', '#1c1424', '#2a1810', '#2a1810', '#472819', '#472819', '#623924'),
  sandWall: ramp('#0c0a12', '#1c1424', '#2a1810', '#472819', '#472819', '#623924', '#623924'),
  snowWall: ramp('#0c0a12', '#18204a', '#2c2838', '#423f54', '#423f54', '#5e5e74', '#5e5e74'),
  iceWall: ramp('#0c0a12', '#18204a', '#18204a', '#2c4486', '#2c4486', '#3e74c4', '#3e74c4'),
  mudWall: ramp('#0c0a12', '#0c0a12', '#16301e', '#1c1424', '#214528', '#2a1810', '#2a1810'),
  // 深度層
  deep: ramp('#0c0a12', '#1c1424', '#2c2838', '#2c2450', '#423f54', '#463c78', '#707490'),
  basalt: ramp('#0c0a12', '#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490'),
  ash: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  obsidian: ramp('#0c0a12', '#0c0a12', '#18204a', '#2c2450', '#463c78', '#7a5a8c', '#b8788e'),
  magma: ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0'),
  deepWall: ramp('#0c0a12', '#0c0a12', '#18204a', '#1c1424', '#1c1424', '#2c2450', '#2c2450'),
  basaltWall: ramp('#0c0a12', '#0c0a12', '#1c1424', '#2a1810', '#2a1810', '#472819', '#472819'),
  // 地城三色（磚 / 牆）
  brickBlue: ramp('#0c0a12', '#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8'),
  brickGreen: ramp('#0c0a12', '#16301e', '#214528', '#3f7468', '#6a9c88', '#a2c8b0', '#cceaf8'),
  brickPink: ramp('#1c1424', '#2c2450', '#463c78', '#7a5a8c', '#b8788e', '#f2b888', '#f2e2b0'),
  wallBlue: ramp('#0c0a12', '#0c0a12', '#18204a', '#18204a', '#2c4486', '#2c4486', '#3e74c4'),
  wallGreen: ramp('#0c0a12', '#0c0a12', '#16301e', '#16301e', '#214528', '#214528', '#3f7468'),
  wallPink: ramp('#0c0a12', '#0c0a12', '#1c1424', '#2c2450', '#2c2450', '#463c78', '#463c78'),
};
export const BRICK_PAL: Record<number, RGB[]> = {
  [T.DUNGEON_BRICK_BLUE]: PAL2.brickBlue, [T.DUNGEON_BRICK_GREEN]: PAL2.brickGreen, [T.DUNGEON_BRICK_PINK]: PAL2.brickPink,
};

/** 平滑值雜訊（同 textures.vnoise） */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h01(gx, gy, seed), b = h01(gx + 1, gy, seed), c = h01(gx, gy + 1, seed), d = h01(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** 環繞式 Voronoi：最近點索引、d1、d2、最近點座標 */
function voronoi(x: number, y: number, pts: [number, number][]): { i: number; d1: number; d2: number; cx: number; cy: number } {
  let d1 = 1e9, d2 = 1e9, bi = 0, bx = 0, by = 0;
  for (let k = 0; k < pts.length; k++) {
    for (let oy = -S; oy <= S; oy += S) for (let ox = -S; ox <= S; ox += S) {
      const px = pts[k][0] + ox, py = pts[k][1] + oy;
      const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
      if (d < d1) { d2 = d1; d1 = d; bi = k; bx = px; by = py; } else if (d < d2) d2 = d;
    }
  }
  return { i: bi, d1, d2, cx: bx, cy: by };
}
/** 三階雜訊底色：n > hi → pal[a+1]、n < lo → pal[a-1]、其他 pal[a] */
function base3(b: Bmp, pal: RGB[], a: number, cell: number, seed: number, lo = 0.3, hi = 0.68, ox = 0): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x + ox, y, cell, seed);
    b.set(x, y, n > hi ? pal[a + 1] : n < lo ? pal[a - 1] : pal[a]);
  }
}
/** 小凸塊：上亮下暗（受光左上） */
function lump(b: Bmp, x: number, y: number, w: number, lite: RGB, dark: RGB): void {
  for (let i = 0; i < w; i++) { b.set(x + i, y, lite); b.set(x + i, y + 1, dark); }
}

// ── 材料 ───────────────────────────────────────────────
function texClay(v: number): Bmp {
  const p = PAL2.clay, b = new Bmp(S, S), seed = 601 + v * 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // 橫向抹開的黏土層
    const n = vnoise(x * 0.5 + v * 3, y * 1.4, 4, seed);
    b.set(x, y, n > 0.66 ? p[4] : n < 0.3 ? p[2] : p[3]);
  }
  for (let k = 0; k < 3; k++) {
    const x = Math.floor(h01(k, 1, seed) * 11) + 1, y = Math.floor(h01(k, 2, seed) * 12) + 1;
    lump(b, x, y, 3 + (k & 1), p[5], p[2]);
  }
  return b;
}
function texGravel(v: number): Bmp {
  const p = PAL2.gravel, b = new Bmp(S, S), seed = 621 + v * 11;
  const pts: [number, number][] = [];
  for (let k = 0; k < 8; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = voronoi(x, y, pts);
    const e = q.d2 - q.d1;
    if (e < 1) { b.set(x, y, p[1]); continue; }
    const tone = 3 + Math.floor(h01(q.i, 3, seed) * 3) - 1; // 2..4
    const lit = (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < -1.2;
    const dark = (x + 0.5 - q.cx) + (y + 0.5 - q.cy) > 1.6;
    b.set(x, y, p[Math.max(2, Math.min(6, tone + (lit ? 2 : dark ? -1 : 0)))]);
  }
  return b;
}
function texGranite(v: number): Bmp {
  const p = PAL2.granite, b = new Bmp(S, S), seed = 641 + v * 5;
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = voronoi(x, y, pts);
    const e = q.d2 - q.d1;
    let c = p[h01(q.i, 4, seed) > 0.5 ? 3 : 2];
    if (e < 1.1) c = p[1];
    else if (e < 2.2 && (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < 0) c = p[4];
    b.set(x, y, c);
  }
  // 雲母亮片（2px 一組）
  for (let k = 0; k < 2; k++) {
    const x = 2 + Math.floor(h01(k, 7, seed) * 11), y = 2 + Math.floor(h01(k, 8, seed) * 11);
    b.set(x, y, p[6]); b.set(x + 1, y, p[5]);
  }
  return b;
}
function texMarble(v: number): Bmp {
  const p = PAL2.marble, b = new Bmp(S, S), seed = 661 + v * 13;
  base3(b, p, 4, 7, seed, 0.28, 0.7);
  // 紋理：一條斜向漫遊的灰脈 + 旁邊淡脈
  let x = Math.floor(h01(0, 1, seed) * 8), y = 0;
  for (let i = 0; i < 22 && y < S; i++) {
    b.set(x, y, p[2]); b.set(x + 1, y, p[3]);
    const r = h01(i, 3, seed);
    if (r < 0.5) y++; else if (r < 0.85) { x++; y++; } else x++;
    if (x > 14) x = 14;
  }
  if (v !== 1) {
    let x2 = 9 + Math.floor(h01(1, 1, seed) * 5), y2 = 4;
    for (let i = 0; i < 8; i++) { b.set(x2, y2, p[3]); y2++; if (h01(i, 5, seed) > 0.5) x2--; }
  }
  return b;
}
function texSandstone(v: number): Bmp {
  const p = PAL2.sandstone, b = new Bmp(S, S), seed = 681 + v * 3;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wv = Math.floor(vnoise(x + v * 7, 0, 6, seed) * 3);
    const r = ((y + wv + v) % 5 + 5) % 5;
    // 層理：亮帶 / 中帶 / 底部暗線
    const c = r === 0 ? p[5] : r === 4 ? p[2] : vnoise(x, y, 4, seed + 3) > 0.7 ? p[4] : p[3];
    b.set(x, y, c);
  }
  return b;
}
function texSnow(v: number): Bmp {
  const p = PAL2.snow, b = new Bmp(S, S), seed = 701 + v * 9;
  base3(b, p, 4, 6, seed, 0.3, 0.66);
  // 雪堆的陰影弧（下方淡藍）
  for (let k = 0; k < 2; k++) {
    const x0 = Math.floor(h01(k, 1, seed) * 10), y0 = 4 + Math.floor(h01(k, 2, seed) * 9);
    for (let i = 0; i < 5; i++) b.set(x0 + i, y0 + (i === 0 || i === 4 ? 0 : 1), p[2]);
    for (let i = 1; i < 4; i++) b.set(x0 + i, y0, p[5]);
  }
  return b;
}
function texIce(v: number): Bmp {
  const p = PAL2.ice, b = new Bmp(S, S), seed = 721 + v * 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x, y, 6, seed);
    let c = n > 0.62 ? p[4] : n < 0.3 ? p[2] : p[3];
    // 斜向光帶（左上受光）
    const d = ((x - y + v * 5) % 12 + 12) % 12;
    if (d === 0 || d === 1) c = p[5];
    if (d === 2 && n > 0.4) c = p[6];
    b.set(x, y, c);
  }
  // 冰裂
  let x = 3 + v * 3, y = 9;
  for (let i = 0; i < 5; i++) { b.set(x, y, p[1]); x++; if (i & 1) y--; }
  return b;
}
function texMud(v: number): Bmp {
  const p = PAL2.mud, b = new Bmp(S, S), seed = 741 + v * 17;
  base3(b, p, 3, 5, seed, 0.3, 0.7);
  for (let k = 0; k < 3; k++) {
    const x = 1 + Math.floor(h01(k, 1, seed) * 12), y = 1 + Math.floor(h01(k, 2, seed) * 12);
    lump(b, x, y, 2 + (k & 1), p[5], p[2]);
  }
  // 苔斑（成簇的暗綠，讓泥巴和泥土一眼分得出來）
  for (let k = 0; k < 3; k++) {
    const mx = 1 + Math.floor(h01(k, 5, seed) * 12), my = 1 + Math.floor(h01(k, 6, seed) * 12);
    b.set(mx, my, hex('#2d672e')); b.set(mx + 1, my, hex('#214528')); b.set(mx, my + 1, hex('#214528'));
    if (k === 0) b.set(mx + 1, my - 1, hex('#468a34'));
  }
  return b;
}
function texBrick(v: number): Bmp {
  const p = PAL2.stone, b = new Bmp(S, S), seed = 761 + v * 3;
  for (let row = 0; row < 4; row++) {
    const y0 = row * 4, off = (row & 1) * 4 + v;
    for (let x = 0; x < S; x++) {
      const bx = ((x + off) % 8 + 8) % 8;
      const brick = Math.floor((x + off) / 8);
      const tone = h01(brick, row, seed) > 0.5 ? 4 : 3;
      for (let k = 0; k < 4; k++) {
        const y = y0 + k;
        let c = p[tone];
        if (k === 3 || bx === 7) c = p[1];          // 灰縫
        else if (k === 0) c = p[tone + 1];           // 上緣亮
        else if (bx === 0) c = p[tone + 1];          // 左緣亮
        else if (k === 2 && bx === 6) c = p[tone - 1];
        b.set(x, y, c);
      }
    }
  }
  return b;
}

// ── 深度層材料 ───────────────────────────────────────────
/** 深層岩：比石頭暗、偏藍紫，帶斜向層理與少量亮點 */
function texDeep(v: number): Bmp {
  const p = PAL2.deep, b = new Bmp(S, S), seed = 1001 + v * 11;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x + v * 5, y, 6, seed);
    const band = ((x + y * 2 + Math.floor(vnoise(x, y, 8, seed + 1) * 4) + v * 3) % 9 + 9) % 9;
    let c = n > 0.64 ? p[4] : n < 0.28 ? p[2] : p[3];
    if (band === 0) c = p[2];
    else if (band === 1 && n > 0.4) c = p[5];
    b.set(x, y, c);
  }
  for (let k = 0; k < 2; k++) {
    const x = 2 + Math.floor(h01(k, 1, seed) * 11), y = 2 + Math.floor(h01(k, 2, seed) * 11);
    lump(b, x, y, 2 + k, p[5], p[1]);
  }
  b.set(Math.floor(h01(3, 3, seed) * 14), Math.floor(h01(3, 4, seed) * 14), p[6]);
  return b;
}
/** 玄武岩：直立柱狀節理（每 5 px 一根柱，柱頂亮、柱縫暗，柱間上下錯開） */
function texBasalt(v: number): Bmp {
  const p = PAL2.basalt, b = new Bmp(S, S), seed = 1021 + v * 7;
  for (let x = 0; x < S; x++) {
    const col = Math.floor((x + v * 2) / 5), cx = ((x + v * 2) % 5 + 5) % 5;
    const off = Math.floor(h01(col, 1, seed) * 8);
    const tone = h01(col, 2, seed) > 0.5 ? 3 : 4;
    for (let y = 0; y < S; y++) {
      const yy = (y + off) % 8;
      let c = p[tone];
      if (cx === 4) c = p[1];
      else if (cx === 0) c = p[tone + 1];
      if (yy === 0 && cx !== 4) c = p[1];
      else if (yy === 1 && cx !== 4) c = p[tone + 2 > 6 ? 6 : tone + 2];
      b.set(x, y, c);
    }
  }
  return b;
}
/** 灰燼：柔軟顆粒，成簇的亮 / 暗小團 */
function texAsh(v: number): Bmp {
  const p = PAL2.ash, b = new Bmp(S, S), seed = 1041 + v * 13;
  base3(b, p, 3, 4, seed, 0.32, 0.66, v * 3);
  for (let k = 0; k < 5; k++) {
    const x = Math.floor(h01(k, 1, seed) * 14), y = Math.floor(h01(k, 2, seed) * 14);
    b.set(x, y, k & 1 ? p[5] : p[1]); b.set(x + 1, y, k & 1 ? p[4] : p[2]);
  }
  return b;
}
/** 黑曜石：玻璃質的暗紫，帶銳利的斜向高光與貝殼狀斷口 */
function texObsidian(v: number): Bmp {
  const p = PAL2.obsidian, b = new Bmp(S, S), seed = 1061 + v * 5;
  const pts: [number, number][] = [];
  for (let k = 0; k < 4; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = voronoi(x, y, pts);
    const e = q.d2 - q.d1;
    let c = p[h01(q.i, 3, seed) > 0.5 ? 3 : 2];
    if (e < 1) c = p[1];
    else if (e < 2 && (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < 0) c = p[4];
    b.set(x, y, c);
  }
  for (let i = 0; i < 5; i++) { const x = 3 + v * 3 + i, y = 9 - i; b.set(x, y, p[5]); if (i === 2) b.set(x, y - 1, p[6]); }
  return b;
}
/** 熔岩石：暗色岩殼碎片之間透出發亮的熔岩縫（縫越寬越亮） */
function texMagma(v: number): Bmp {
  const p = PAL2.magma, cr = PAL2.basalt, b = new Bmp(S, S), seed = 1081 + v * 9;
  const pts: [number, number][] = [];
  for (let k = 0; k < 5; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = voronoi(x, y, pts);
    const e = q.d2 - q.d1;
    let c: RGB;
    if (e < 0.9) c = p[5];
    else if (e < 1.8) c = p[4];
    else if (e < 2.6) c = p[2];
    else c = (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < -1.5 ? cr[4] : h01(q.i, 3, seed) > 0.5 ? cr[3] : cr[2];
    b.set(x, y, c);
  }
  return b;
}
/** 地城磚：大塊（8×4）磚、深色縫、左上倒角亮邊，部分磚角缺損 */
function texDungeonBrick(v: number, p: RGB[]): Bmp {
  const b = new Bmp(S, S), seed = 1101 + v * 3;
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 4), by = y % 4, off = (row & 1) * 4 + v * 2;
    for (let x = 0; x < S; x++) {
      const bx = ((x + off) % 8 + 8) % 8, brick = Math.floor((x + off) / 8) + row * 7;
      const tone = h01(brick, row, seed) > 0.55 ? 4 : 3;
      let c = p[tone];
      if (by === 3 || bx === 7) c = p[1];
      else if (by === 0 || bx === 0) c = p[tone + 1];
      else if (by === 2 && bx >= 5) c = p[tone - 1];
      if (by === 0 && bx === 0 && h01(brick, 9, seed) > 0.6) c = p[1]; // 缺角
      b.set(x, y, c);
    }
  }
  return b;
}
/** 地城牆：同一磚紋的暗色版 */
function texDungeonWall(v: number, p: RGB[]): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / 4), by = y % 4, off = (row & 1) * 4 + v * 2;
    for (let x = 0; x < S; x++) {
      const bx = ((x + off) % 8 + 8) % 8;
      b.set(x, y, by === 3 || bx === 7 ? p[1] : by === 0 ? p[4] : p[3]);
    }
  }
  return b;
}

export function texMaterial(id: number, v: number): Bmp | null {
  switch (id) {
    case T.DEEP_STONE: return texDeep(v);
    case T.BASALT: return texBasalt(v);
    case T.ASH: return texAsh(v);
    case T.OBSIDIAN: return texObsidian(v);
    case T.MAGMA_ROCK: return texMagma(v);
    case T.DUNGEON_BRICK_BLUE: case T.DUNGEON_BRICK_GREEN: case T.DUNGEON_BRICK_PINK: return texDungeonBrick(v, BRICK_PAL[id]);
    case T.CLAY: return texClay(v);
    case T.GRAVEL: return texGravel(v);
    case T.GRANITE: return texGranite(v);
    case T.MARBLE: return texMarble(v);
    case T.SANDSTONE: return texSandstone(v);
    case T.SNOW: return texSnow(v);
    case T.ICE: return texIce(v);
    case T.MUD: case T.JUNGLE_GRASS: case T.MUSHROOM_GRASS: return texMud(v);
    case T.STONE_BRICK: return texBrick(v);
    default: return null;
  }
}
export const MATERIAL_PAL: Record<number, RGB[]> = {
  [T.SILVER_ORE]: PAL2.stone, [T.GOLD_ORE]: PAL2.stone, [T.CLAY]: PAL2.clay, [T.GRAVEL]: PAL2.gravel,
  [T.GRANITE]: PAL2.granite, [T.MARBLE]: PAL2.marble, [T.SANDSTONE]: PAL2.sandstone, [T.SNOW]: PAL2.snow,
  [T.ICE]: PAL2.ice, [T.MUD]: PAL2.mud, [T.JUNGLE_GRASS]: PAL2.mud, [T.MUSHROOM_GRASS]: PAL2.mud, [T.STONE_BRICK]: PAL2.stone,
  [T.DEEP_STONE]: PAL2.deep, [T.BASALT]: PAL2.basalt, [T.ASH]: PAL2.ash, [T.OBSIDIAN]: PAL2.obsidian, [T.MAGMA_ROCK]: PAL2.magma,
  [T.DUNGEON_BRICK_BLUE]: PAL2.brickBlue, [T.DUNGEON_BRICK_GREEN]: PAL2.brickGreen, [T.DUNGEON_BRICK_PINK]: PAL2.brickPink,
};

// ── 背景牆 ─────────────────────────────────────────────
export function texWall2(id: number, v: number): { b: Bmp; pal: RGB[] } | null {
  const b = new Bmp(S, S);
  switch (id) {
    case 3: { // 木板牆：直條木板
      const p = PAL2.plankWall, seed = 801 + v;
      for (let x = 0; x < S; x++) {
        const plank = Math.floor((x + v * 2) / 5), px = ((x + v * 2) % 5 + 5) % 5;
        const tone = h01(plank, 1, seed) > 0.5 ? 4 : 3;
        for (let y = 0; y < S; y++) {
          let c = p[tone];
          if (px === 4) c = p[1];
          else if (px === 0) c = p[tone + 2 > 6 ? 6 : tone + 2];
          if (y === (plank * 7 + 5) % S && px !== 4) c = p[1];
          b.set(x, y, c);
        }
      }
      return { b, pal: p };
    }
    case 4: { // 砂岩牆：暗色層理
      const p = PAL2.sandWall, seed = 821 + v;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const r = ((y + Math.floor(vnoise(x, 0, 6, seed) * 2) + v) % 4 + 4) % 4;
        b.set(x, y, r === 0 ? p[5] : r === 3 ? p[1] : p[3]);
      }
      return { b, pal: p };
    }
    case 5: case 6: case 7: { // 雪牆 / 冰牆 / 泥巴牆：柔和團塊
      const p = id === 5 ? PAL2.snowWall : id === 6 ? PAL2.iceWall : PAL2.mudWall, seed = 841 + id * 13 + v * 7;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const n = vnoise(x + v * 5, y, 5, seed);
        b.set(x, y, n > 0.66 ? p[5] : n < 0.3 ? p[2] : p[3]);
      }
      if (id === 6) for (let i = 0; i < 4; i++) b.set((v * 4 + i + 3) % S, 3 + i, p[6]);
      if (id === 7) { b.set(4 + v * 3, 6, hex('#214528')); b.set(5 + v * 3, 6, hex('#214528')); }
      return { b, pal: p };
    }
    case 8: case 9: { // 深層岩牆 / 玄武岩牆：大塊暗岩面
      const p = id === 8 ? PAL2.deepWall : PAL2.basaltWall, seed = 861 + id * 7 + v * 5;
      const pts: [number, number][] = [];
      for (let k = 0; k < 3; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const q = voronoi(x, y, pts), e = q.d2 - q.d1;
        b.set(x, y, e < 1.1 ? p[1] : e < 2.2 && (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < 0 ? p[5] : h01(q.i, 3, seed) > 0.5 ? p[4] : p[3]);
      }
      return { b, pal: p };
    }
    case 10: case 11: case 12: {
      const p = id === 10 ? PAL2.wallBlue : id === 11 ? PAL2.wallGreen : PAL2.wallPink;
      return { b: texDungeonWall(v, p), pal: p };
    }
    default: return null;
  }
}

// ── 裝飾物件 ───────────────────────────────────────────
const FLOWER_COLS: [string, string, string][] = [
  // 暗、主色、亮
  ['#6c1e14', '#a83a10', '#e8701c'],   // 紅
  ['#7a5a8c', '#b8788e', '#f2b888'],   // 粉
  ['#a83a10', '#ffa93a', '#ffd86a'],   // 橙黃
  ['#2c4486', '#5c9ce0', '#94c8ee'],   // 藍
  ['#858aa0', '#cceaf8', '#ffffff'],   // 白
  ['#2c2450', '#7a5a8c', '#b8788e'],   // 紫
];
const G = PAL2.leaf;

function flower(style: number): Bmp {
  const b = new Bmp(S, S);
  const [d, m, l] = FLOWER_COLS[style % 6].map(hex);
  const two = style >= 6;
  const heads: [number, number, number][] = two ? [[5, 8, 15], [11, 6, 15]] : [[8, 5, 15]];
  for (const [hx, hy, base] of heads) {
    for (let y = hy + 1; y <= base; y++) b.set(hx, y, y > base - 3 ? G[2] : G[3]);
    // 葉子
    b.set(hx - 1, hy + 5, G[4]); b.set(hx - 2, hy + 4, G[4]); b.set(hx + 1, hy + 7, G[3]); b.set(hx + 2, hy + 6, G[3]);
    // 花：十字花瓣 + 中心
    b.set(hx - 1, hy, m); b.set(hx + 1, hy, d); b.set(hx, hy - 1, l); b.set(hx, hy + 1, d);
    b.set(hx - 1, hy - 1, l);
    b.set(hx, hy, hex('#ffd86a'));
  }
  return b.outline(hex('#16301e'));
}
function tallGrass(style: number): Bmp {
  const b = new Bmp(S, S), seed = 901 + style * 7;
  const n = 5 + style;
  for (let k = 0; k < n; k++) {
    const x0 = 1 + Math.floor(h01(k, 1, seed) * 14);
    const hgt = 4 + Math.floor(h01(k, 2, seed) * 8);
    const lean = h01(k, 3, seed) > 0.5 ? 1 : -1;
    for (let i = 0; i < hgt; i++) {
      const x = x0 + (i > hgt * 0.6 ? lean : 0), y = 15 - i;
      b.set(x, y, i === hgt - 1 ? G[5] : i > hgt * 0.5 ? G[4] : G[3]);
    }
  }
  return b.outline(G[1]);
}
function mushroom(style: number): Bmp {
  const b = new Bmp(S, S);
  const cap = style === 0 ? ramp('#6c1e14', '#a83a10', '#e8701c') : ramp('#472819', '#7c4c2e', '#b07a4b');
  b.rect(7, 11, 3, 5, hex('#f2e2b0')); b.rect(9, 11, 1, 5, hex('#d8ba76'));
  for (let y = 0; y < 4; y++) {
    const w = [4, 8, 10, 10][y], x0 = 8.5 - w / 2;
    for (let x = 0; x < w; x++) b.set(x0 + x, 7 + y, y === 3 ? cap[0] : x < w / 2 - 1 ? cap[2] : cap[1]);
  }
  b.rect(5, 10, 8, 1, cap[0]);
  if (style === 0) { b.set(6, 8, hex('#ffffff')); b.set(9, 8, hex('#ffffff')); b.set(11, 9, hex('#fff4c0')); }
  else b.set(7, 8, cap[2]);
  return b.outline(INK);
}
function smallRock(style: number): Bmp {
  const b = new Bmp(S, S), p = PAL2.stone;
  const stones: [number, number, number, number][] = [
    [[6, 12.5, 4, 3]], [[5, 13, 3.4, 2.4], [10.5, 13.2, 2.6, 2.2]], [[8, 12, 5, 3.6], [3.5, 14, 2, 1.6]],
  ][style % 3] as [number, number, number, number][];
  for (const [cx, cy, rx, ry] of stones) {
    b.disc(cx, cy, rx, ry, p[4]);
    b.disc(cx - rx * 0.3, cy - ry * 0.35, rx * 0.55, ry * 0.45, p[5]);
    b.set(Math.round(cx - rx * 0.4), Math.round(cy - ry * 0.5), p[6]);
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (b.on(x, 15)) b.set(x, 15, p[2]);
  }
  return b.outline(INK);
}
function bush(style: number): Bmp {
  const b = new Bmp(S, S), seed = 941 + style;
  const blobs: [number, number, number][] = [[5, 10, 4.2], [10.5, 9.5, 4.6], [8, 7, 4]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let best = -1;
    for (let k = 0; k < blobs.length; k++) {
      const [cx, cy, r] = blobs[k];
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r + (h01(x >> 1, y >> 1, seed) - 0.5) * 0.25;
      if (d <= 1 && (best < 0 || k > best)) best = k;
    }
    if (best < 0 || y > 15) continue;
    const [cx, cy, r] = blobs[best];
    const v = 0.55 - ((x + 0.5 - cx) * 0.6 + (y + 0.5 - cy) * 0.8) / r * 0.45;
    b.set(x, y, v > 0.82 ? G[5] : v > 0.6 ? G[4] : v > 0.38 ? G[3] : G[2]);
  }
  if (style === 2) for (const [x, y] of [[5, 9], [11, 8], [8, 12]]) { b.set(x, y, hex('#a83a10')); b.set(x - 1, y - 1, hex('#e8701c')); }
  if (style === 1) for (const [x, y] of [[6, 6], [12, 9]]) b.set(x, y, hex('#fff4c0'));
  return b.outline(G[0]);
}
function pumpkin(style: number): Bmp {
  const b = new Bmp(S, S);
  const p = ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a');
  const rx = style ? 5 : 6.2, ry = style ? 3.8 : 4.4, cx = 8, cy = 15.5 - ry;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
    if (nx * nx + ny * ny > 1) continue;
    const rib = Math.abs(((x + 0.5 - cx) / rx) * 2.5);
    const ribEdge = Math.abs(rib - Math.round(rib)) < 0.18 && Math.abs(nx) < 0.9;
    let k = nx + ny * 0.8 < -0.4 ? 3 : nx + ny * 0.8 > 0.55 ? 1 : 2;
    if (ribEdge) k = Math.max(0, k - 1);
    if (nx < -0.2 && ny < -0.4) k = 4;
    b.set(x, y, p[k]);
  }
  const top = Math.round(cy - ry);
  b.rect(7, top - 2, 2, 3, hex('#623924')); b.set(7, top - 2, hex('#966139'));
  b.set(9, top - 1, G[4]); b.set(10, top - 1, G[3]); b.set(10, top - 2, G[4]);
  return b.outline(INK);
}
function cactus(style: number): Bmp {
  const b = new Bmp(S, S);
  const c = ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50');
  const body = (x0: number, x1: number, y0: number, y1: number, roundTop: boolean): void => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (roundTop && y === y0 && (x === x0 || x === x1)) continue;
      const u = (x - x0) / Math.max(1, x1 - x0);
      b.set(x, y, u < 0.25 ? c[4] : u > 0.8 ? c[2] : (x - x0) % 2 === 1 ? c[3] : c[3]);
    }
    for (let y = y0 + 1; y <= y1; y += 3) { b.set(x0 + 2, y, c[2]); } // 稜線暗點
  };
  const top = style === CACTUS_STYLE.TOP || style === CACTUS_STYLE.SINGLE;
  body(4, 11, top ? 2 : 0, 15, top);
  if (top) { b.set(5, 2, c[5]); b.set(6, 2, c[5]); b.set(7, 1, c[4]); b.set(8, 1, c[3]); }
  if (style === CACTUS_STYLE.ARM_L || style === CACTUS_STYLE.SINGLE) { body(1, 3, 8, 10, false); body(0, 2, 3, 8, true); }
  if (style === CACTUS_STYLE.ARM_R) { body(12, 14, 7, 9, false); body(13, 15, 1, 7, true); }
  b.outline(c[0]);
  // 刺：外側亮點
  for (const [x, y] of [[4, 4], [11, 9], [4, 12], [11, 2]] as [number, number][]) if (!b.on(x, y)) b.set(x, y, hex('#f2e2b0'));
  if (style === CACTUS_STYLE.BASE || style === CACTUS_STYLE.SINGLE) { b.set(4, 15, hex('#d8ba76')); b.set(11, 15, hex('#d8ba76')); }
  return b;
}
function deadBush(style: number): Bmp {
  const b = new Bmp(S, S), w = PAL2.wood, seed = 981 + style * 3;
  const tips: [number, number][] = [[3, 6], [6, 3], [10, 4], [13, 7], [8, 2]];
  const n = 3 + style;
  for (let k = 0; k < n; k++) {
    const [tx, ty] = tips[(k + style) % tips.length];
    b.line(8, 15, tx, ty + Math.floor(h01(k, 1, seed) * 3), k & 1 ? w[3] : w[4]);
  }
  b.line(8, 15, 8, 10, w[2]);
  return b.outline(w[0]);
}
function snowShrub(style: number): Bmp {
  const b = bush(style === 2 ? 0 : style);
  const s = PAL2.snow;
  b.map((c) => {
    // 換成暗綠針葉色
    const l = c[0] + c[1] + c[2];
    return l < 120 ? hex('#16301e') : l < 220 ? hex('#214528') : l < 320 ? hex('#3f7468') : hex('#6a9c88');
  });
  // 積雪：每欄最上面 2–3 px（白 → 淡藍陰影），描邊那 1px 也蓋成雪的暗面
  for (let x = 0; x < S; x++) {
    for (let y = 0; y < S; y++) {
      if (!b.on(x, y)) continue;
      const depth = 2 + (h01(x, style, 991) > 0.5 ? 1 : 0);
      b.set(x, y, s[1]);
      for (let k = 1; k <= depth && b.on(x, y + k); k++) b.set(x, y + k, k === depth ? s[3] : s[5]);
      break;
    }
  }
  return b;
}
function fern(style: number): Bmp {
  const b = new Bmp(S, S), J = PAL2.jungleGrass;
  const fronds: [number, number][] = [[-6, 6], [-3, 2], [1, 1], [5, 3], [7, 8]];
  fronds.forEach(([dx, dy], k) => {
    if ((k + style) % 4 === 3) return;
    const tx = 8 + dx, ty = dy + style;
    b.line(8, 15, tx, ty, J[2]);
    // 小羽葉
    const steps = Math.max(Math.abs(tx - 8), Math.abs(ty - 15));
    for (let i = 2; i < steps; i += 2) {
      const x = Math.round(8 + ((tx - 8) * i) / steps), y = Math.round(15 + ((ty - 15) * i) / steps);
      b.set(x - 1, y, J[4]); b.set(x + 1, y - 1, J[3]);
    }
    b.set(tx, ty, J[5]);
  });
  return b.outline(J[0]);
}
function vine(style: number): Bmp {
  const b = new Bmp(S, S), J = PAL2.jungleGrass;
  const end = style === 1;
  const len = end ? 11 : 16;
  for (let y = 0; y < len; y++) {
    const x = 7 + (Math.floor((y + style * 3) / 4) % 2);
    b.set(x, y, J[2]); b.set(x + 1, y, J[1]);
  }
  for (let y = 1; y < len - 1; y += 4) {
    const left = ((y >> 2) + style) % 2 === 0;
    const x = left ? 5 : 10;
    b.set(x, y, J[4]); b.set(x + 1, y, J[3]); b.set(x, y + 1, J[3]);
    if (left) b.set(x - 1, y + 1, J[5]); else b.set(x + 1, y + 1, J[2]);
  }
  if (end) { b.set(7, len, J[3]); b.set(8, len + 1, J[4]); }
  return b.outline(J[0]);
}
function glowMushroom(style: number): Bmp {
  const b = new Bmp(S, S);
  const c = ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff');
  const caps: [number, number, number][] = [[[6, 7, 3], [11, 10, 2]], [[8, 5, 3.5]], [[4, 9, 2], [9, 6, 3], [13, 11, 1.5]]][style % 3] as [number, number, number][];
  for (const [cx, cy, r] of caps) {
    for (let y = cy + 1; y < 16; y++) { b.set(cx, y, c[4]); if (r > 2.5) b.set(cx - 1, y, c[5]); }
  }
  for (const [cx, cy, r] of caps) {
    for (let y = Math.floor(cy - r * 0.6); y <= cy + 0.5; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const nx = (x + 0.5 - cx) / r, ny = (y + 0.5 - cy) / (r * 0.7);
      if (nx * nx + ny * ny > 1.05) continue;
      b.set(x, y, ny > 0.35 ? c[2] : nx < -0.1 && ny < -0.1 ? c[6] : c[3]);
    }
    b.set(Math.round(cx - r * 0.4), Math.round(cy - r * 0.3), c[6]);
  }
  return b.outline(c[0]);
}
function crystalFloor(style: number): Bmp {
  const b = new Bmp(S, S);
  const pink = style % 2 === 0;
  const c = pink ? ramp('#2c2450', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0') : ramp('#18204a', '#2c8692', '#4aaeb0', '#a2c8b0', '#ffffff');
  const prisms: [number, number, number, number][] = [[8, 2, 3, -0.15], [4, 7, 2, -0.5], [12, 6, 2, 0.45]];
  const n = 2 + (style % 3 === 2 ? 1 : 0) + (style === 1 ? 1 : 0);
  prisms.slice(0, Math.min(3, n)).forEach(([bx, tipY, hw, lean]) => {
    for (let y = tipY; y < 16; y++) {
      const t = (y - tipY) / (16 - tipY);
      const half = Math.max(0, Math.round(hw * Math.min(1, t * 2.2)));
      const cxp = bx + lean * (15 - y) * 0.6;
      for (let x = Math.round(cxp - half); x <= Math.round(cxp + half); x++) {
        const left = x < cxp;
        b.set(x, y, y < tipY + 2 ? c[4] : left ? c[3] : x === Math.round(cxp + half) ? c[1] : c[2]);
      }
    }
  });
  return b.outline(c[0]);
}
function transform(src: Bmp, f: (x: number, y: number) => [number, number]): Bmp {
  const b = new Bmp(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const [sx, sy] = f(x, y); b.setRaw(x, y, src.raw(sx, sy)); }
  return b;
}
function crystal(style: number): Bmp {
  if (style < 3) return crystalFloor(style);
  if (style < 6) return transform(crystalFloor(style - 3), (x, y) => [x, 15 - y]);        // 天花板：上下翻
  if (style === 6) return transform(crystalFloor(1), (x, y) => [y, x]);                  // 左牆：轉向右長
  return transform(crystalFloor(0), (x, y) => [y, 15 - x]);                              // 右牆
}
function stalactite(style: number): Bmp {
  const b = new Bmp(S, S);
  const icy = style >= 3;
  const c = icy ? ramp('#18204a', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff') : ramp('#1c1424', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8');
  const v = style % 3;
  const spikes: [number, number, number][] = [[[8, 13, 3.5]], [[6, 11, 3], [11, 7, 2]], [[9, 14, 4], [4, 6, 1.6]]][v] as [number, number, number][];
  for (const [cx, len, hw] of spikes) {
    for (let y = 0; y < len; y++) {
      const half = hw * (1 - y / len);
      for (let x = Math.round(cx - half); x <= Math.round(cx + half - 0.01); x++) {
        const u = (x - (cx - half)) / Math.max(0.5, half * 2);
        b.set(x, y, u < 0.3 ? c[4] : u > 0.75 ? c[2] : c[3]);
      }
    }
    if (icy) b.set(Math.round(cx - hw * 0.3), 1, c[5]);
  }
  return b.outline(c[0]);
}
function stalagmite(style: number): Bmp { return transform(stalactite(style), (x, y) => [x, 15 - y]); }
function cobweb(style: number): Bmp {
  const b = new Bmp(S, S);
  const w = hex('#b4b9c8'), hi = hex('#ffffff');
  // 角落（左上）放射線 + 同心弧，再依 style 翻成右上
  for (const [ex, ey] of [[15, 2], [13, 9], [8, 13], [2, 15]] as [number, number][]) b.line(0, 0, ex, ey, w);
  for (const r of [5, 9, 13]) {
    for (let a = 0; a <= 16; a++) {
      const t = a / 16;
      const x = Math.round(r * (1 - t) * (1 - t * 0.2)), y = Math.round(r * t * (1 - (1 - t) * 0.2));
      if (h01(a, r, 12) > 0.25) b.set(x, y, a % 5 === 0 ? hi : w);
    }
  }
  return style === 1 ? transform(b, (x, y) => [15 - x, y]) : b;
}
function pot(style: number): Bmp {
  const b = new Bmp(S, S);
  const c = [
    ramp('#2a1810', '#6c1e14', '#a83a10', '#d98f66', '#f2b888'),
    ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee'),
    ramp('#2a1810', '#472819', '#7c4c2e', '#b07a4b', '#c99660'),
  ][style % 3];
  // 瓶身輪廓：半寬 by 列
  const half = [0, 0, 0, 0, 2, 2, 3, 4, 5, 5, 5, 5, 5, 4, 4, 3];
  for (let y = 4; y < 16; y++) {
    const hw = half[y];
    for (let x = 8 - hw; x < 8 + hw; x++) {
      const u = (x - (8 - hw)) / (hw * 2);
      let k = u < 0.3 ? 3 : u > 0.75 ? 1 : 2;
      if (y === 4) k = 4;
      if (y === 9 || y === 10) k = k === 1 ? 0 : 4; // 腰帶紋
      b.set(x, y, c[k]);
    }
  }
  b.rect(5, 3, 6, 1, c[3]); b.set(5, 3, c[4]);
  b.set(6, 7, c[4]); b.set(6, 8, c[4]);
  return b.outline(INK);
}
export function chestBmp(): Bmp {
  const b = new Bmp(S, S), w = PAL2.wood, m = ramp('#1c1424', '#423f54', '#858aa0', '#b4b9c8');
  // 蓋（圓頂）
  b.rect(2, 5, 12, 4, w[4]); b.rect(3, 4, 10, 1, w[5]); b.rect(2, 5, 12, 1, w[5]);
  b.rect(2, 8, 12, 1, w[2]);
  // 箱身
  b.rect(2, 9, 12, 7, w[3]); b.rect(2, 9, 12, 1, w[1]);
  b.rect(2, 10, 1, 6, w[4]);
  for (let x = 4; x < 13; x += 4) b.rect(x, 11, 1, 4, w[2]);
  // 鐵條 + 鎖
  for (const x of [3, 12]) { b.rect(x, 4, 1, 12, m[2]); b.set(x, 5, m[3]); b.set(x, 9, m[1]); }
  b.rect(7, 8, 2, 3, hex('#ffd86a')); b.set(7, 8, hex('#fff4c0')); b.set(8, 10, hex('#a83a10'));
  b.rect(2, 15, 12, 1, w[1]);
  return b.outline(INK);
}
function beam(): Bmp {
  const b = new Bmp(S, S), w = PAL2.wood;
  for (let y = 0; y < S; y++) {
    b.set(5, y, INK); b.set(10, y, INK);
    b.set(6, y, w[5]); b.set(7, y, w[4]); b.set(8, y, w[3]); b.set(9, y, w[2]);
    if ((y + 3) % 7 === 0) b.set(7, y, w[2]);
    if ((y + 5) % 9 === 0) b.set(8, y, w[1]);
  }
  return b;
}

/** 裝飾 tile 的某個 style（16×16，透明背景） */
export function decorBmp(id: number, style: number): Bmp {
  switch (id) {
    case T.FLOWER: return flower(style);
    case T.TALL_GRASS: return tallGrass(style);
    case T.MUSHROOM: return mushroom(style);
    case T.SMALL_ROCK: return smallRock(style);
    case T.BUSH: return bush(style);
    case T.PUMPKIN: return pumpkin(style);
    case T.CACTUS: return cactus(style);
    case T.DEAD_BUSH: return deadBush(style);
    case T.SNOW_SHRUB: return snowShrub(style);
    case T.FERN: return fern(style);
    case T.VINE: return vine(style);
    case T.GLOW_MUSHROOM: return glowMushroom(style);
    case T.CRYSTAL: return crystal(style);
    case T.STALACTITE: return stalactite(style);
    case T.STALAGMITE: return stalagmite(style);
    case T.COBWEB: return cobweb(style);
    case T.POT: return pot(style);
    case T.CHEST: return chestBmp();
    case T.BEAM: return beam();
    case T.PLATFORM: return platformBmp(style);
    case T.DOOR_CLOSED: return doorClosedBmp(style);
    case T.DOOR_OPEN: return doorOpenBmp(style);
    case T.DOOR_LOCKED: return doorLockedBmp(style);
    case T.LOCKED_CHEST: return lockedChestBmp();
    case T.CHAIN: return chainBmp(style);
    case T.BANNER: return bannerBmp(style);
    case T.CANDLE: return candleBmp(style);
    case T.LANTERN: return lanternBmp();
    case T.BOOKSHELF: return bookshelfBmp(style);
    case T.BONES: return bonesBmp(style);
    case T.LORE_TABLET: return loreTabletBmp();
    default: return new Bmp(S, S);
  }
}

// ── 道具圖示 ───────────────────────────────────────────
export function iconCoins(silver: boolean): Bmp {
  const b = new Bmp(S, S);
  const c = silver ? ramp('#1c1424', '#423f54', '#858aa0', '#b4b9c8', '#ffffff') : ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a');
  const coin = (cx: number, cy: number): void => {
    b.disc(cx, cy, 4, 3, c[2]);
    b.disc(cx - 0.6, cy - 0.6, 3, 2.1, c[3]);
    b.rect(Math.round(cx - 1), Math.round(cy - 1), 2, 1, c[4]);
    b.rect(Math.round(cx - 3), Math.round(cy + 2), 7, 1, c[1]);
  };
  coin(6, 11); coin(10, 9); coin(7, 6);
  return b.outline(INK);
}
export function iconShard(): Bmp {
  const b = new Bmp(S, S), c = ramp('#2c2450', '#7a5a8c', '#b8788e', '#f2b888', '#fff4c0');
  for (let i = 0; i < 10; i++) {
    const x = 4 + i, y = 13 - i;
    b.set(x, y, c[2]); b.set(x - 1, y, c[3]); b.set(x + 1, y, c[1]); b.set(x, y + 1, c[2]);
    if (i < 8) b.set(x - 1, y + 1, c[3]);
  }
  b.set(13, 3, c[4]); b.set(5, 12, c[4]);
  return b.outline(INK);
}
export function iconCactus(): Bmp {
  const b = cactus(CACTUS_STYLE.SINGLE);
  return b;
}
