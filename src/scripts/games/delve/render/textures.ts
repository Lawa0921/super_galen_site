// textures.ts — 程式手繪的像素材質圖集（啟動時烘焙一次）。
//   · 前景 tile：每個 tile 3 個變體 × 16 種外緣遮罩（圓角外框、左上受光的斜面、草皮頂與側邊）
//   · 背景牆：自有的暗色材質（土牆 = 土塊、石牆 = 卵石 + 灰縫），同樣依遮罩描外框
//   · 材質滲透貼片：石→土、沙→土、石→沙 的抖動過渡（每個邊 × 垂直邊外露狀態）
//   · 草葉（長到上一格的草尖）、挖掘裂痕 4 階段、16×16 道具圖示
import { T, TILES, WALLS } from '../engine/tiles';
import { VANITY_ITEMS, type ItemId } from '../engine/items';
import { fashionIcon } from './fashionIcon';
import { TILE_SIZE } from '../engine/constants';
import { EDGE, FRAME_COLS, MAT, VARIANTS, DECOR_STYLES, frameColumn, type Mat } from './autotile';
import { iconGearShard, iconStardust } from './lootArt';
import { MATERIAL_PAL, PAL2, chestBmp, decorBmp, iconCactus, iconCoins, iconShard, texMaterial, texWall2 } from './decor';
import { Bmp, INK, bayer, css, h01, hex, mix, ramp, shade, toCanvas, type RGB } from './pixel';
import { RUNE_METAL, iconDoor, iconKey, iconLantern, iconMap, iconPlatform } from './dungeonArt';
import {
  crackStone, iconBed, iconCompass, iconDepthMeter, iconJumpBoots, iconMagnet, iconNightAmulet, iconRecall, iconRope, iconSwiftBoots,
} from './exploreArt';
import { combatIcon } from './combatArt';
import { iconBucket, iconMagmaWard, iconSponge } from './liquidArt';
import { LIQ } from '../engine/liquidKind';
import { decorColumns } from './decorPick';
import { FAMILIES, FAMILY_TILES } from './tileFamily';
import { decorBmpAt } from './decorSeason';
import { EXTRA_TILE_PAL, FURNITURE_ICONS, extraDecorBmp, extraTileBmp, furnitureIcon } from './propArt';
import { FISHING_ICONS, fishingIcon } from './fishArt';

const S = TILE_SIZE;
export { VARIANTS };

// ── 色票（由暗到亮；[0] 為該材質的描邊色） ─────────────────
// 全部取自 pixel.ts 的統一色票（[0] = 描邊 / 最暗）
export const PAL = {
  dirt: ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660'),
  grass: ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478'),
  stone: ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8'),
  sand: ramp('#623924', '#966139', '#b07a4b', '#c99660', '#d8ba76', '#f2e2b0', '#fff4c0'),
  planks: ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660'),
  copper: ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#f2b888', '#fff4c0'),
  iron: ramp('#1c1424', '#623924', '#b07a4b', '#d98f66', '#f2b888', '#f2e2b0', '#ffffff'),
  bark: ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b'),
  // 背景牆：比前景暗一到兩階，但面色不再貼近全黑（火把照到時看得出材質）
  dirtWall: ramp('#0c0a12', '#1c1424', '#2a1810', '#472819', '#472819', '#623924', '#623924'),
  stoneWall: ramp('#0c0a12', '#1c1424', '#2c2838', '#2c2838', '#423f54', '#5e5e74', '#5e5e74'),
  torch: ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff'),
  metal: ramp('#1c1424', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff', '#ffffff'),
};

const TILE_PAL: Record<number, RGB[]> = {
  [T.DIRT]: PAL.dirt, [T.GRASS]: PAL.dirt, [T.STONE]: PAL.stone, [T.SAND]: PAL.sand,
  [T.PLANKS]: PAL.planks, [T.COPPER_ORE]: PAL.stone, [T.IRON_ORE]: PAL.stone,
  [T.WOOD]: PAL.bark, [T.LEAVES]: PAL.grass, [T.TORCH]: PAL.torch, [T.WORKBENCH]: PAL.planks,
  [T.CRACKED_STONE]: PAL.stone,
  ...MATERIAL_PAL,
  ...EXTRA_TILE_PAL,
};
const ORE_PAL: Record<number, RGB[]> = {
  [T.COPPER_ORE]: PAL.copper, [T.IRON_ORE]: PAL.iron, [T.SILVER_ORE]: PAL2.silver, [T.GOLD_ORE]: PAL2.gold,
};

// ── 圖集版面 ─────────────────────────────────────────────
const FG_ROW0 = 0;
const WALL_ROW0 = FG_ROW0 + TILES.length;
const BLEND_ROW0 = WALL_ROW0 + WALLS.length;  // 3 列：MAT.DIRT/SAND/STONE
const MISC_ROW = BLEND_ROW0 + 3;              // 裂痕 0..3、草葉 4..6、叢林草葉 7..9
const ICON_ROW = MISC_ROW + 1;
/** 圖示列數（每列 FRAME_COLS 個；依道具數量） */
const ICON_ROWS = 6;
/** 季節草皮：春 / 夏 / 秋 / 冬（雪蓋）各一列，欄位同前景 tile（遮罩 × 變體） */
const GRASS_SEASON_ROW0 = ICON_ROW + ICON_ROWS;
/** 材質家族：FAMILY_TILES 每種 × (FAMILIES − 1) 列（家族 0 用原本的 tile 列） */
const FAMILY_ROW0 = GRASS_SEASON_ROW0 + 4;
const FAMILY_ROW = new Map<number, number>(FAMILY_TILES.map((id, k) => [id, FAMILY_ROW0 + k * (FAMILIES - 1)]));
const ROWS = FAMILY_ROW0 + FAMILY_TILES.length * (FAMILIES - 1);
/** 季節草皮色階（[0] 最暗 → [6] 最亮；frameTile 的草皮用 1..6） */
export const GRASS_SEASON: RGB[][] = [
  ramp('#16301e', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478', '#fff4c0'),   // 春：新綠
  ramp('#0c0a12', '#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50'),   // 夏：濃綠
  ramp('#16301e', '#214528', '#2d672e', '#7c4c2e', '#966139', '#c99660', '#d8ba76'),   // 秋：枯黃
  ramp('#16301e', '#7f9cc4', '#94c8ee', '#cceaf8', '#cceaf8', '#ffffff', '#ffffff'),   // 冬：積雪
];

// ── 小工具 ───────────────────────────────────────────────
/** 平滑值雜訊（cell 格點雜湊 + 雙線性），0..1 */
function vnoise(x: number, y: number, cell: number, seed: number): number {
  const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
  const fx = x / cell - gx, fy = y / cell - gy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = h01(gx, gy, seed), b = h01(gx + 1, gy, seed), c = h01(gx, gy + 1, seed), d = h01(gx + 1, gy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 環繞式 Voronoi：回傳 (最近點索引, d1, d2, 最近點座標) */
function voronoi(x: number, y: number, pts: [number, number][], n = S): { i: number; d1: number; d2: number; cx: number; cy: number } {
  let d1 = 1e9, d2 = 1e9, bi = 0, bx = 0, by = 0;
  for (let k = 0; k < pts.length; k++) {
    for (let oy = -n; oy <= n; oy += n) {
      for (let ox = -n; ox <= n; ox += n) {
        const px = pts[k][0] + ox, py = pts[k][1] + oy;
        const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
        if (d < d1) { d2 = d1; d1 = d; bi = k; bx = px; by = py; } else if (d < d2) d2 = d;
      }
    }
  }
  return { i: bi, d1, d2, cx: bx, cy: by };
}
// ── 前景材質（未加外框） ─────────────────────────────────
function texDirt(v: number, pal = PAL.dirt): Bmp {
  const b = new Bmp(S, S);
  const seed = 11 + v * 17;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = vnoise(x, y, 5, seed);
      b.set(x, y, n > 0.7 ? pal[4] : n < 0.26 ? pal[2] : pal[3]);
    }
  }
  // 土塊：上亮下暗的小凸起
  const clods = 4 + v;
  for (let k = 0; k < clods; k++) {
    const cx = 1 + Math.floor(h01(k, 1, seed) * 13), cy = 1 + Math.floor(h01(k, 2, seed) * 13);
    const w = 2 + Math.floor(h01(k, 3, seed) * 2);
    for (let i = 0; i < w; i++) { b.set(cx + i, cy, pal[5]); b.set(cx + i, cy + 1, pal[2]); }
    b.set(cx - 1, cy + 1, pal[2]);
  }
  // 小石子
  const peb = v === 0 ? 1 : v === 2 ? 2 : 0;
  for (let k = 0; k < peb; k++) {
    const px = 2 + Math.floor(h01(k, 7, seed) * 11), py = 6 + Math.floor(h01(k, 8, seed) * 7);
    const st = PAL.stone;
    b.rect(px, py, 3, 2, st[4]);
    b.set(px, py, st[5]); b.set(px + 1, py, st[6]);
    b.set(px + 2, py + 1, st[3]);
    b.rect(px, py + 2, 3, 1, pal[1]);
    b.set(px + 3, py + 1, pal[1]);
  }
  // 樹根（變體 1）
  if (v === 1) {
    let x = 3, y = 2 + Math.floor(h01(2, 9, seed) * 3);
    for (let i = 0; i < 9; i++) {
      b.set(x, y, pal[5]); b.set(x, y + 1, pal[1]);
      x++; if (h01(i, 10, seed) > 0.55) y++;
      if (y > 13) break;
    }
  }
  return b;
}

/** 刻痕：暗線 + 右下亮唇（左上受光） */
function groove(b: Bmp, pal: RGB[], seed: number, k: number, len: number, dark: number, lite: number): void {
  let x = 1 + Math.floor(h01(k, 1, seed) * 12), y = 1 + Math.floor(h01(k, 2, seed) * 12);
  const dx = h01(k, 3, seed) > 0.5 ? 1 : -1;
  for (let i = 0; i < len; i++) {
    b.set(x, y, pal[dark]);
    if (!b.in(x + 1, y + 1) || b.get(x + 1, y + 1) !== pal[dark]) b.set(x + 1, y + 1, pal[lite]);
    const r = h01(i, k + 4, seed);
    if (r < 0.45) x += dx; else if (r < 0.8) { x += dx; y++; } else y++;
    if (x < 0 || x > 15 || y > 15) break;
  }
}

function texStone(v: number, pal = PAL.stone): Bmp {
  const b = new Bmp(S, S);
  const seed = 41 + v * 23;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const n = vnoise(x + v * 5, y, 6, seed);
      b.set(x, y, n > 0.64 ? pal[4] : n < 0.24 ? pal[2] : pal[3]);
    }
  }
  // 凸起：上緣亮、下緣暗
  const bumps = [[3, 4], [10, 9], [6, 12]][v];
  for (let k = 0; k < 3; k++) {
    const cx = (bumps[0] * (k + 1) * 3 + Math.floor(h01(k, 9, seed) * 6)) % 13 + 1;
    const cy = (bumps[1] + k * 5 + Math.floor(h01(k, 10, seed) * 3)) % 13 + 1;
    const w = 2 + (k % 2);
    for (let i = 0; i < w; i++) { b.set(cx + i, cy, pal[5]); b.set(cx + i, cy + 1, pal[4]); b.set(cx + i, cy + 2, pal[2]); }
  }
  groove(b, pal, seed, 0, 5 + v, 1, 5);
  if (v !== 1) groove(b, pal, seed, 1, 4, 2, 4);
  b.set(Math.floor(h01(1, 5, seed) * 15), Math.floor(h01(1, 6, seed) * 15), pal[6]);
  return b;
}

// ── 材質家族（tileFamily：低頻雜訊挑家族，打散大片石 / 土的格狀重複） ─────────
/** 石・層理：橫向的岩層縫（暗線 + 下方亮唇）在格與格之間大致連續，面比較平 */
function texStoneBedded(v: number, pal = PAL.stone): Bmp {
  const b = new Bmp(S, S), seed = 1401 + v * 19;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x + v * 7, y * 2, 7, seed);
    b.set(x, y, n > 0.7 ? pal[4] : n < 0.22 ? pal[2] : pal[3]);
  }
  // 兩條層縫：y 位置在格邊對齊（左右鄰格接得起來），中間緩緩起伏
  const rows = [4 + v, 10 + (v === 2 ? -1 : v)];
  rows.forEach((ry, k) => {
    for (let x = 0; x < S; x++) {
      const y = ry + Math.round(Math.sin((x + k * 5 + v * 3) * 0.45) * 0.8);
      if (h01(x >> 2, k, seed) > 0.82) continue; // 斷續
      b.set(x, y, pal[1]);
      b.set(x, y + 1, pal[5]);
      if (b.get(x, y - 1) === pal[4]) b.set(x, y - 1, pal[3]);
    }
  });
  // 層面上的小凹點
  for (let k = 0; k < 2; k++) {
    const x = 2 + Math.floor(h01(k, 3, seed) * 11), y = 1 + Math.floor(h01(k, 4, seed) * 13);
    b.set(x, y, pal[2]); b.set(x + 1, y, pal[2]); b.set(x, y + 1, pal[4]);
  }
  return b;
}
/** 石・卵石堆：4–6 塊圓鈍的石塊，左上受光、縫用中暗色（不會看起來像磚） */
function texStoneCobble(v: number, pal = PAL.stone): Bmp {
  const b = new Bmp(S, S), seed = 1431 + v * 23;
  const pts: [number, number][] = [];
  const n = 4 + (v === 1 ? 2 : v === 2 ? 1 : 0);
  for (let k = 0; k < n; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const q = voronoi(x, y, pts);
    const e = q.d2 - q.d1, lx = x + 0.5 - q.cx, ly = y + 0.5 - q.cy;
    const tone = h01(q.i, 3, seed) > 0.7 ? 4 : 3;
    let c = pal[tone];
    if (e < 1) c = pal[2];
    else if (e < 2.2) c = lx + ly < 0 ? pal[tone + 1] : pal[tone - 1];
    b.set(x, y, c);
  }
  b.set(Math.floor(h01(5, 5, seed) * 14), Math.floor(h01(5, 6, seed) * 14), pal[6]);
  return b;
}
/** 土・腐植：偏暗的土，細根絲橫穿、零星小石 */
function texDirtLoam(v: number, pal = PAL.dirt): Bmp {
  const b = new Bmp(S, S), seed = 1461 + v * 13;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x, y + v * 4, 4, seed);
    b.set(x, y, n > 0.74 ? pal[4] : n < 0.36 ? pal[2] : pal[3]);
  }
  // 根絲：從左緣走到右緣（亮的根 + 下方暗影），每格 1–2 條
  for (let r = 0; r < 1 + (v & 1); r++) {
    let y = 3 + Math.floor(h01(r, 7, seed) * 9);
    for (let x = 0; x < S; x++) {
      b.set(x, y, pal[5]); b.set(x, y + 1, pal[1]);
      const t = h01(x, r + 8, seed);
      if (t > 0.78 && y < 13) y++; else if (t < 0.16 && y > 2) y--;
    }
  }
  const st = PAL.stone;
  const px = 2 + Math.floor(h01(3, 9, seed) * 11), py = 2 + Math.floor(h01(4, 9, seed) * 11);
  b.set(px, py, st[5]); b.set(px + 1, py, st[4]); b.set(px, py + 1, st[3]); b.set(px + 1, py + 1, pal[1]);
  return b;
}
/** 土・沉積：橫向抹開的淺色土層帶 + 小土塊 */
function texDirtSilt(v: number, pal = PAL.dirt): Bmp {
  const b = new Bmp(S, S), seed = 1491 + v * 11;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = vnoise(x * 0.45 + v * 3, y * 1.6, 4, seed);
    b.set(x, y, n > 0.68 ? pal[5] : n < 0.3 ? pal[3] : pal[4]);
  }
  for (let k = 0; k < 3; k++) {
    const cx = 1 + Math.floor(h01(k, 1, seed) * 12), cy = 1 + Math.floor(h01(k, 2, seed) * 13);
    for (let i = 0; i < 2 + (k & 1); i++) { b.set(cx + i, cy, pal[6]); b.set(cx + i, cy + 1, pal[2]); }
  }
  return b;
}
/** 家族 fam（1..FAMILIES-1）的材質；家族 0 = 原本的 texTile */
function texFamily(id: number, fam: number, v: number): Bmp {
  if (id === T.STONE) return fam === 1 ? texStoneBedded(v) : texStoneCobble(v);
  return fam === 1 ? texDirtLoam(v) : texDirtSilt(v);
}

function texSand(v: number): Bmp {
  const pal = PAL.sand, b = new Bmp(S, S), seed = 101 + v * 7;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const wv = Math.sin((x + v * 5) / 2.6) * 1.2 + Math.sin((x + v * 3) / 5.3) * 0.8;
      const r = ((y + wv + v * 2) % 5 + 5) % 5;
      b.set(x, y, r < 1 ? pal[3] : r < 2 ? pal[5] : pal[4]);
    }
  }
  // 兩顆 2px 砂粒（成簇，不撒單點雜訊）
  for (let k = 0; k < 2; k++) {
    const x = Math.floor(h01(k, 1, seed) * 14), y = Math.floor(h01(k, 2, seed) * S);
    b.set(x, y, pal[k ? 2 : 6]); b.set(x + 1, y, pal[k ? 2 : 6]);
  }
  return b;
}

function texPlanks(v: number): Bmp {
  const pal = PAL.planks, b = new Bmp(S, S), seed = 131 + v * 5;
  for (let board = 0; board < 4; board++) {
    const y0 = board * 4;
    const joint = (board * 7 + v * 5 + 3) % S;
    const tone = h01(board, v, seed) > 0.5 ? 4 : 3;
    for (let x = 0; x < S; x++) {
      b.set(x, y0, pal[tone + 1]);
      b.set(x, y0 + 1, pal[tone]);
      b.set(x, y0 + 2, pal[tone]);
      b.set(x, y0 + 3, pal[1]);
    }
    // 木紋
    for (let k = 0; k < 2; k++) {
      const gx = Math.floor(h01(board, k + 3, seed) * 12), gy = y0 + 1 + (k & 1);
      const len = 3 + Math.floor(h01(board, k + 5, seed) * 4);
      for (let i = 0; i < len; i++) b.set(gx + i, gy, pal[tone - 1]);
    }
    // 接縫 + 釘子
    for (let y = y0; y < y0 + 3; y++) { b.set(joint, y, pal[1]); b.set(joint + 1, y, pal[tone + 1]); }
    b.set(joint - 2, y0 + 1, pal[0]); b.set(joint - 2, y0, pal[5]);
    b.set(joint + 3, y0 + 1, pal[0]); b.set(joint + 3, y0, pal[5]);
  }
  return b;
}

function oreChunk(b: Bmp, x: number, y: number, w: number, h: number, ore: RGB[]): void {
  const m = new Bmp(w + 2, h + 2);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const corner = (i === 0 || i === w - 1) && (j === 0 || j === h - 1) && w > 2 && h > 2;
      if (corner) continue;
      const tl = i + j < (w + h) / 2 - 1;
      m.set(i + 1, j + 1, tl ? ore[4] : ore[3]);
    }
  }
  // 面：左上亮面、右下暗面、亮點
  m.set(2, 1, ore[5]); m.set(1, 2, ore[5]);
  if (w > 2) m.set(w, h, ore[2]);
  if (w > 3) m.set(w - 1, h, ore[2]);
  m.set(2, 2, ore[6]);
  m.outline(ore[0]);
  b.blit(m, x - 1, y - 1);
}

function texOre(id: number, v: number): Bmp {
  const b = texStone(v);
  const ore = ORE_PAL[id] ?? PAL.iron;
  const seed = 201 + id * 13 + v * 7;
  const spots: [number, number, number, number][] = [
    [[2, 2, 5, 4], [10, 4, 4, 4], [4, 10, 5, 4]],
    [[2, 4, 4, 4], [9, 1, 5, 4], [9, 10, 5, 4], [2, 11, 3, 3]],
    [[1, 7, 5, 5], [8, 2, 5, 4], [10, 11, 4, 3]],
  ][v] as [number, number, number, number][];
  for (const [x, y, w, h] of spots) oreChunk(b, x + Math.floor(h01(x, y, seed) * 2), y, w, h, ore);
  return b;
}

function texWorkbench(): Bmp {
  const p = PAL.planks, m = PAL.metal, b = new Bmp(S, S);
  // 桌面
  b.rect(0, 6, 16, 3, p[4]);
  b.rect(0, 6, 16, 1, p[6]);
  b.rect(0, 8, 16, 1, p[2]);
  b.set(5, 7, p[3]); b.set(11, 7, p[3]);
  // 桌腳 + 橫撐
  b.rect(1, 9, 3, 7, p[3]); b.rect(1, 9, 1, 7, p[5]);
  b.rect(12, 9, 3, 7, p[3]); b.rect(12, 9, 1, 7, p[5]);
  b.rect(4, 12, 8, 2, p[2]); b.rect(4, 12, 8, 1, p[4]);
  // 鋸子
  b.rect(2, 4, 6, 2, m[4]); b.rect(2, 5, 6, 1, m[2]);
  for (let i = 2; i < 8; i += 2) b.set(i, 5, m[1]);
  b.rect(8, 3, 2, 3, p[2]); b.set(8, 3, p[4]);
  // 鐵鎚
  b.rect(11, 1, 4, 2, m[3]); b.set(11, 1, m[5]);
  b.rect(12, 3, 1, 3, p[5]); b.set(13, 3, p[2]);
  b.outline(INK);
  // 描邊把桌腳間的空隙也描了：清掉桌腳之間不該有的描邊（保留輪廓即可）
  return b;
}

function texTile(id: number, v: number): Bmp {
  switch (id) {
    case T.DIRT: case T.GRASS: return texDirt(v);
    case T.STONE: return texStone(v);
    case T.CRACKED_STONE: return crackStone(texStone(v), PAL.stone, v);
    case T.SAND: return texSand(v);
    case T.PLANKS: return texPlanks(v);
    case T.COPPER_ORE: case T.IRON_ORE: case T.SILVER_ORE: case T.GOLD_ORE: return texOre(id, v);
    case T.WORKBENCH: return texWorkbench();
    default: return texMaterial(id, v) ?? extraTileBmp(id, v) ?? new Bmp(S, S); // 空氣 / 樹幹 / 樹葉 / 火把：動態繪製
  }
}

// ── 外框 ───────────────────────────────────────────────
interface Dist { d: number; light: boolean; side: 'top' | 'left' | 'right' | 'bottom' | 'corner'; }
/** 外緣距離：d<0 = 圓角切掉、0 = 外框、1.. 往內；light = 受光面（上 / 左） */
function edgeDist(x: number, y: number, mask: number, w = S, h = S): Dist {
  let d = 99, light = false, side: Dist['side'] = 'top';
  const up = mask & EDGE.UP, rt = mask & EDGE.RIGHT, dn = mask & EDGE.DOWN, lf = mask & EDGE.LEFT;
  const consider = (v: number, l: boolean, s: Dist['side']): void => { if (v < d) { d = v; light = l; side = s; } };
  if (up) consider(y, true, 'top');
  if (lf) consider(x, true, 'left');
  if (dn) consider(h - 1 - y, false, 'bottom');
  if (rt) consider(w - 1 - x, false, 'right');
  const R = 3;
  const cx = (ax: number, ay: number, l: boolean): void => {
    if (ax < R && ay < R) { const v = ax + ay - 2; if (v < d) { d = v; light = l; side = 'corner'; } }
  };
  if (up && lf) cx(x, y, true);
  if (up && rt) cx(w - 1 - x, y, y <= w - 1 - x);
  if (dn && lf) cx(x, h - 1 - y, x <= h - 1 - y);
  if (dn && rt) cx(w - 1 - x, h - 1 - y, false);
  return { d, light, side };
}

/** 草皮每欄厚度 */
function grassDepth(x: number, v: number): number {
  const pat = [[4, 5, 5, 4, 3, 4, 5, 4, 4, 5, 4, 3, 4, 4, 5, 4], [4, 4, 5, 5, 4, 3, 4, 5, 5, 4, 4, 5, 4, 3, 4, 5], [5, 4, 4, 3, 4, 5, 5, 4, 3, 4, 5, 5, 4, 4, 5, 4]][v % 3];
  return pat[x & 15];
}

function frameTile(src: Bmp, mask: number, pal: RGB[], opts: { grass?: boolean; v?: number; ink0?: RGB; gpal?: RGB[] } = {}): Bmp {
  const b = src.clone();
  const w = b.w, h = b.h, v = opts.v ?? 0;
  const G = opts.gpal ?? PAL.grass;
  const grassTop = Boolean(opts.grass) && (mask & EDGE.UP) !== 0;
  const dropL = 4 + v, dropR = 5 - (v % 2);
  if (grassTop) {
    for (let x = 0; x < w; x++) {
      const gd = grassDepth(x, v);
      for (let y = 0; y < gd; y++) {
        let c = y === 0 ? G[5] : y === 1 ? G[4] : y === gd - 1 ? G[2] : G[3];
        if (y === 1 && h01(x, v, 7) > 0.8) c = G[6];
        if (y === 2 && h01(x, v, 9) > 0.75) c = G[2];
        b.set(x, y, c);
      }
      b.set(x, gd, pal[1]); // 草皮下緣的陰影
    }
  }
  const inGrass = (x: number, y: number): boolean => grassTop && (
    y < grassDepth(x, v) ||
    ((mask & EDGE.LEFT) !== 0 && x <= 1 && y < grassDepth(0, v) + dropL - x * 2) ||
    ((mask & EDGE.RIGHT) !== 0 && x >= w - 2 && y < grassDepth(w - 1, v) + dropR - (w - 1 - x) * 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const e = edgeDist(x, y, mask, w, h);
      if (e.d >= 3) continue;
      if (e.d < 0) { b.clear(x, y); continue; }
      const c = b.get(x, y);
      if (inGrass(x, y)) {
        if (e.side === 'top') continue;
        if (e.d === 0) b.set(x, y, G[1]);
        else if (e.d === 1) b.set(x, y, e.light ? G[5] : G[2]);
        continue;
      }
      if (e.d === 0) b.set(x, y, e.light ? (opts.ink0 ?? pal[1]) : pal[0]);
      else if (e.d === 1) b.set(x, y, e.light ? mix(c, pal[6], 0.55) : mix(c, pal[1], 0.55));
      else if (!e.light) b.set(x, y, mix(c, pal[2], 0.3));
    }
  }
  return b;
}

// ── 背景牆 ─────────────────────────────────────────────
function texWall(id: number, v: number): Bmp {
  const b = new Bmp(S, S);
  if (id === 1) {
    // 土牆：柔和的土塊（比前景土暗、對比低）
    const pal = PAL.dirtWall, seed = 301 + v * 11;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = vnoise(x + v * 7, y, 5, seed);
      b.set(x, y, n > 0.66 ? pal[4] : n < 0.3 ? pal[2] : pal[3]);
    }
    for (let k = 0; k < 4; k++) {
      const cx = 1 + Math.floor(h01(k, 1, seed) * 12), cy = 1 + Math.floor(h01(k, 2, seed) * 12);
      b.set(cx, cy, pal[5]); b.set(cx + 1, cy, pal[5]); b.set(cx, cy + 1, pal[1]); b.set(cx + 1, cy + 1, pal[1]);
    }
  } else if (id === 2) {
    // 石牆：大塊碎石 + 深灰縫（每格 3–4 塊、不對齊格線）
    const pal = PAL.stoneWall, seed = 401 + v * 13;
    const pts: [number, number][] = [];
    const n = 3 + (v === 1 ? 1 : 0);
    for (let k = 0; k < n; k++) pts.push([h01(k, 1, seed) * S, h01(k, 2, seed) * S]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const q = voronoi(x, y, pts);
      const e = q.d2 - q.d1;
      let c = pal[h01(q.i, 3, seed) > 0.5 ? 4 : 3];
      if (e < 1.1) c = pal[0];
      else if (e < 2.2) c = (x + 0.5 - q.cx) + (y + 0.5 - q.cy) < 0 ? pal[5] : pal[2];
      b.set(x, y, c);
    }
  }
  return b;
}

function frameWall(src: Bmp, mask: number, pal: RGB[]): Bmp {
  const b = src.clone();
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const e = edgeDist(x, y, mask);
      if (e.d >= 2) continue;
      if (e.d < 0) { b.clear(x, y); continue; }
      b.set(x, y, e.d === 0 ? pal[0] : mix(b.get(x, y), pal[0], 0.5));
    }
  }
  return b;
}

// ── 材質滲透貼片 ───────────────────────────────────────
const SIDES = [EDGE.UP, EDGE.RIGHT, EDGE.DOWN, EDGE.LEFT] as const;
/** perp 位元：對 UP/DOWN 而言 bit0 = LEFT、bit1 = RIGHT；對 LEFT/RIGHT 而言 bit0 = UP、bit1 = DOWN */
export function perpMask(side: number, mask: number): number {
  if (side === EDGE.UP || side === EDGE.DOWN) return (mask & EDGE.LEFT ? 1 : 0) | (mask & EDGE.RIGHT ? 2 : 0);
  return (mask & EDGE.UP ? 1 : 0) | (mask & EDGE.DOWN ? 2 : 0);
}
function blendStamp(mat: Mat, sideIdx: number, perp: number): Bmp {
  const src = mat === MAT.STONE ? texStone(0) : mat === MAT.SAND ? texSand(0) : texDirt(0);
  const side = SIDES[sideIdx];
  const vertical = side === EDGE.UP || side === EDGE.DOWN;
  let pmask = 0;
  if (vertical) pmask = (perp & 1 ? EDGE.LEFT : 0) | (perp & 2 ? EDGE.RIGHT : 0);
  else pmask = (perp & 1 ? EDGE.UP : 0) | (perp & 2 ? EDGE.DOWN : 0);
  const b = new Bmp(S, S);
  const cover = [0.85, 0.6, 0.34, 0.14];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const along = vertical ? x : y;
      let t = side === EDGE.UP ? y : side === EDGE.DOWN ? S - 1 - y : side === EDGE.LEFT ? x : S - 1 - x;
      t -= Math.floor(vnoise(along, 0, 4, 900 + sideIdx) * 2.4) - 1;
      if (t < 0) t = 0;
      if (t >= cover.length) continue;
      if (pmask && edgeDist(x, y, pmask).d < 2) continue;
      if (bayer(x, y) < cover[t]) b.setRaw(x, y, src.raw(x, y));
    }
  }
  return b;
}

// ── 草葉（畫在草地上方那格的底部） ──────────────────────
function grassBlades(v: number, jungle = false): Bmp {
  const G = jungle ? PAL2.jungleGrass : PAL.grass, b = new Bmp(S, S);
  for (let x = 0; x < S; x++) {
    const r = h01(x, v + (jungle ? 7 : 0), 501);
    const hgt = jungle ? (r > 0.75 ? 4 : r > 0.45 ? 3 : r > 0.2 ? 2 : 0) : r > 0.82 ? 3 : r > 0.5 ? 2 : r > 0.25 ? 1 : 0;
    for (let k = 0; k < hgt; k++) {
      const y = S - 1 - k;
      b.set(x, y, k === hgt - 1 ? G[5] : G[4]);
    }
  }
  if (jungle) return b;
  if (v === 2) { b.set(11, 13, G[3]); b.set(11, 12, G[3]); b.set(11, 11, hex('#f2d04a')); b.set(10, 11, hex('#f6e48a')); }
  if (v === 1) { b.set(4, 13, G[3]); b.set(4, 12, hex('#e8789e')); b.set(5, 12, hex('#f4a8c0')); }
  return b;
}

// ── 裂痕 ───────────────────────────────────────────────
function crack(stage: number): Bmp {
  const b = new Bmp(S, S);
  const lines: [number, number, number, number][] = [
    [8, 8, 4, 4], [8, 8, 12, 6], [8, 8, 6, 12], [8, 8, 13, 12],
    [4, 4, 1, 6], [12, 6, 15, 3], [6, 12, 3, 15], [13, 12, 15, 15], [4, 4, 5, 1], [12, 6, 11, 1],
  ];
  const n = 2 + stage * 2 + (stage === 3 ? 2 : 0);
  // 不透明的 1px 暗線 + 右下 1px 深色陰影（不用半透明）
  const dark = INK, lip = hex('#0c0a12');
  for (let k = 0; k < n && k < lines.length; k++) {
    const [x0, y0, x1, y1] = lines[k];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / steps), y = Math.round(y0 + ((y1 - y0) * i) / steps);
      if (stage >= 2 && !b.on(x + 1, y + 1) && (i & 1)) b.set(x + 1, y + 1, lip);
      b.set(x, y, dark);
    }
  }
  return b;
}

// ── 道具圖示（16×16） ─────────────────────────────────
const PICK = [
  '................',
  '....xxxxx.......',
  '..xxHHHhhxx.....',
  '.xHHhxxxhhdx....',
  '.xHxx..xWxhdx...',
  '.xx...xWwxxhdx..',
  '......xWwx.xhdx.',
  '.....xWwx..xhdx.',
  '....xWwx...xhdx.',
  '...xWwx.....xdx.',
  '..xWwx......xx..',
  '.xWwx...........',
  'xWwx............',
  'xwx.............',
  '.x..............',
  '................',
];
function iconPick(metal: RGB[]): Bmp {
  const b = new Bmp(S, S), w = PAL.bark;
  b.grid(PICK, { x: INK, H: metal[5], h: metal[3], d: metal[1], W: w[5], w: w[3] });
  b.set(5, 2, metal[6]);
  return b;
}
const TORCH_ICON = [
  '................',
  '.......x........',
  '......xox.......',
  '......xoox......',
  '.....xoyox......',
  '.....xyCyox.....',
  '.....xoyyox.....',
  '......xccx......',
  '......xLwx......',
  '......xLwx......',
  '......xLwx......',
  '......xLwx......',
  '......xLwx......',
  '......xLwx......',
  '.......xx.......',
  '................',
];
function iconTorch(): Bmp {
  const b = new Bmp(S, S), t = PAL.torch, w = PAL.bark;
  b.grid(TORCH_ICON, { x: INK, o: t[2], y: t[4], C: t[5], c: hex('#6a4a30'), w: w[3], L: w[5] });
  return b;
}
function iconLog(): Bmp {
  const b = new Bmp(S, S), w = PAL.bark;
  const ring = [hex('#e2bf88'), hex('#c89a64'), hex('#a77a4a')];
  b.rect(1, 5, 11, 7, w[3]);
  b.rect(1, 5, 11, 1, w[5]);
  b.rect(1, 6, 11, 1, w[4]);
  b.rect(1, 10, 11, 1, w[2]);
  b.rect(1, 11, 11, 1, w[1]);
  for (const x of [3, 6, 9]) { b.set(x, 7, w[2]); b.set(x + 1, 8, w[2]); b.set(x, 9, w[2]); }
  b.disc(12.5, 8.5, 3, 3.6, ring[1]);
  b.disc(12.5, 8.5, 2, 2.4, ring[0]);
  b.set(12, 8, ring[2]); b.set(13, 9, ring[2]);
  b.outline(INK);
  return b;
}
function iconPlanks(): Bmp {
  const b = new Bmp(S, S), p = PAL.planks;
  const plank = (x: number, y: number, w: number): void => {
    b.rect(x, y, w, 4, p[4]);
    b.rect(x, y, w, 1, p[6]);
    b.rect(x, y + 3, w, 1, p[2]);
    b.rect(x + 2, y + 2, 4, 1, p[3]);
    b.set(x + w - 2, y + 1, p[1]);
  };
  plank(3, 3, 12); plank(1, 7, 12); plank(2, 11, 12);
  b.outline(INK);
  return b;
}
function iconOre(ore: RGB[]): Bmp {
  const b = new Bmp(S, S), st = PAL.stone;
  b.disc(8, 9, 6.5, 5.2, st[4]);
  b.disc(7, 8, 5, 3.8, st[5]);
  b.disc(9, 10.5, 5, 3, st[3]);
  oreChunk(b, 4, 6, 3, 3, ore);
  oreChunk(b, 9, 5, 3, 3, ore);
  oreChunk(b, 7, 10, 4, 3, ore);
  b.outline(INK);
  return b;
}
function iconBlock(tex: Bmp, pal: RGB[], grass = false): Bmp {
  const n = 12, src = new Bmp(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) src.setRaw(x, y, tex.raw(x + 2, y + 2));
  const f = frameTile(src, 15, pal, { grass });
  const b = new Bmp(S, S);
  b.blit(f, 2, 2);
  b.outline(INK);
  return b;
}

/** 道具 → 圖示欄位 */
const ICON_ORDER: ItemId[] = [
  'dirt', 'stone', 'sand', 'wood', 'planks', 'copper_ore', 'iron_ore', 'torch', 'workbench',
  'wood_pickaxe', 'copper_pickaxe', 'iron_pickaxe',
  'silver_ore', 'gold_ore', 'clay', 'gravel', 'granite', 'marble', 'sandstone', 'snow', 'ice', 'mud', 'stone_brick',
  'chest', 'pumpkin', 'glow_mushroom', 'mushroom', 'crystal', 'cactus', 'copper_coin', 'silver_coin',
  'silver_pickaxe', 'gold_pickaxe',
  'deep_stone', 'basalt', 'ash', 'obsidian', 'magma_rock', 'dungeon_brick_blue', 'dungeon_brick_green', 'dungeon_brick_pink',
  'platform', 'wooden_door', 'dungeon_key', 'golden_key', 'lantern', 'rune_pickaxe', 'explorer_map',
  'rope', 'bed', 'recall_stone', 'compass', 'depth_meter', 'jump_boots', 'swift_boots', 'night_amulet', 'magnet',
  // 戰鬥
  'gel', 'bone', 'feather', 'fang', 'chitin', 'stinger', 'spore', 'ember',
  'copper_bar', 'iron_bar', 'silver_bar', 'gold_bar', 'molten_bar', 'furnace', 'anvil',
  'wood_sword', 'copper_sword', 'iron_sword', 'gold_sword', 'iron_spear', 'bone_greatsword', 'lumen_blade',
  'wood_bow', 'silver_bow', 'throwing_knife', 'wood_boomerang', 'crystal_staff', 'wooden_arrow', 'flaming_arrow',
  'wood_helmet', 'wood_chestplate', 'wood_greaves', 'copper_helmet', 'copper_chestplate', 'copper_greaves',
  'iron_helmet', 'iron_chestplate', 'iron_greaves', 'gold_helmet', 'gold_chestplate', 'gold_greaves',
  'bone_helmet', 'bone_chestplate', 'bone_greaves', 'molten_helmet', 'molten_chestplate', 'molten_greaves',
  'life_core', 'healing_potion', 'wick_offering', 'chitin_buckler', 'fang_charm', 'feather_charm', 'warden_heart', 'warden_trophy',
  // 液體
  'hive', 'crispy_honey', 'bucket', 'water_bucket', 'lava_bucket', 'honey_bucket', 'sponge', 'magma_ward',
  // 釣魚
  ...FISHING_ICONS,
  // 家具
  ...FURNITURE_ICONS,
  // 裝備材料
  'gear_shard', 'stardust',
  // 時裝（圖示 = 紙娃娃上的那一件）
  ...VANITY_ITEMS,
];
export { ICON_ORDER };
export const PICK_METAL: Record<string, RGB[]> = {
  wood_pickaxe: ramp('#2a1810', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660', '#d8ba76'),
  copper_pickaxe: PAL.copper,
  iron_pickaxe: PAL.metal,
  silver_pickaxe: PAL2.silver,
  gold_pickaxe: PAL2.gold,
  rune_pickaxe: RUNE_METAL,
};
/** 方塊道具 → 圖示用的 (tile id) */
const BLOCK_ICON: Partial<Record<ItemId, number>> = {
  clay: T.CLAY, gravel: T.GRAVEL, granite: T.GRANITE, marble: T.MARBLE, sandstone: T.SANDSTONE,
  snow: T.SNOW, ice: T.ICE, mud: T.MUD, stone_brick: T.STONE_BRICK,
  deep_stone: T.DEEP_STONE, basalt: T.BASALT, ash: T.ASH, obsidian: T.OBSIDIAN, magma_rock: T.MAGMA_ROCK,
  dungeon_brick_blue: T.DUNGEON_BRICK_BLUE, dungeon_brick_green: T.DUNGEON_BRICK_GREEN, dungeon_brick_pink: T.DUNGEON_BRICK_PINK,
  hive: T.HIVE, crispy_honey: T.CRISPY_HONEY,
};
export function paintIcon(item: ItemId): Bmp {
  const ci = combatIcon(item) ?? fishingIcon(item) ?? furnitureIcon(item, decorBmp) ?? fashionIcon(item);
  if (ci) return ci;
  switch (item) {
    case 'bucket': return iconBucket(LIQ.NONE);
    case 'water_bucket': return iconBucket(LIQ.WATER);
    case 'lava_bucket': return iconBucket(LIQ.LAVA);
    case 'honey_bucket': return iconBucket(LIQ.HONEY);
    case 'gear_shard': return iconGearShard();
    case 'stardust': return iconStardust();
    case 'sponge': return iconSponge();
    case 'magma_ward': return iconMagmaWard();
    case 'platform': return iconPlatform();
    case 'wooden_door': return iconDoor();
    case 'dungeon_key': return iconKey(false);
    case 'golden_key': return iconKey(true);
    case 'lantern': return iconLantern();
    case 'explorer_map': return iconMap();
    case 'rope': return iconRope();
    case 'bed': return iconBed();
    case 'recall_stone': return iconRecall();
    case 'compass': return iconCompass();
    case 'depth_meter': return iconDepthMeter();
    case 'jump_boots': return iconJumpBoots();
    case 'swift_boots': return iconSwiftBoots();
    case 'night_amulet': return iconNightAmulet();
    case 'magnet': return iconMagnet();
    case 'dirt': return iconBlock(texDirt(0), PAL.dirt);
    case 'stone': return iconBlock(texStone(0), PAL.stone);
    case 'sand': return iconBlock(texSand(0), PAL.sand);
    case 'wood': return iconLog();
    case 'planks': return iconPlanks();
    case 'copper_ore': return iconOre(PAL.copper);
    case 'iron_ore': return iconOre(PAL.iron);
    case 'torch': return iconTorch();
    case 'workbench': return texWorkbench();
    case 'silver_ore': return iconOre(PAL2.silver);
    case 'gold_ore': return iconOre(PAL2.gold);
    case 'chest': return chestBmp();
    case 'pumpkin': return decorBmp(T.PUMPKIN, 0);
    case 'glow_mushroom': return decorBmp(T.GLOW_MUSHROOM, 0);
    case 'mushroom': return decorBmp(T.MUSHROOM, 0);
    case 'crystal': return iconShard();
    case 'cactus': return iconCactus();
    case 'copper_coin': return iconCoins(false);
    case 'silver_coin': return iconCoins(true);
    default: {
      const tile = BLOCK_ICON[item];
      if (tile !== undefined) return iconBlock(texMaterial(tile, 0) ?? new Bmp(S, S), TILE_PAL[tile] ?? PAL.stone);
      return iconPick(PICK_METAL[item] ?? PAL.metal);
    }
  }
}

// ── 圖集 ───────────────────────────────────────────────
export interface Src { sx: number; sy: number; }
export interface Atlas {
  canvas: HTMLCanvasElement;
  /** 前景 tile (id, variant, 外緣遮罩) */
  tile(id: number, variant: number, mask: number): Src;
  wall(id: number, variant: number, mask: number): Src;
  /** 材質滲透貼片：mat 滲入、sideIdx 0..3 = 上右下左、perp 見 perpMask */
  blend(mat: Mat, sideIdx: number, perp: number): Src;
  blades(variant: number, jungle?: boolean): Src;
  /** 季節草皮（season 0..3）：取代一般草地 tile */
  grass(season: number, variant: number, mask: number): Src;
  /** 裝飾物件 (id, style) */
  decor(id: number, style: number): Src;
  crack(stage: number): Src;
  icon(item: ItemId): Src;
  /** 粒子用代表色 */
  tileColor(id: number): string;
  /** 內角補點色 */
  tileInk(id: number): string;
  /** 圖示點陣（手持物件用） */
  iconBmp(item: ItemId): Bmp;
}

export function buildAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_COLS * S;
  canvas.height = ROWS * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const put = (b: Bmp, col: number, row: number): void => { toCanvas(b, { ctx, x: col * S, y: row * S }); };

  for (const t of TILES) {
    const pal = TILE_PAL[t.id] ?? PAL.stone;
    const styles = t.id === T.WORKBENCH ? 0 : DECOR_STYLES[t.id];
    if (styles) {
      // 裝飾物件：一列 = 各欄（蜘蛛網角落 × 變體、季節植物 style × 季節；見 decorPick），不足 FRAME_COLS 就循環
      const bm: Bmp[] = [];
      const cols = t.id === T.WORKBENCH ? styles : Math.min(FRAME_COLS, decorColumns(t.id));
      for (let s = 0; s < cols; s++) bm.push(extraDecorBmp(t.id, s) ?? decorBmpAt(t.id, s));
      for (let c = 0; c < FRAME_COLS; c++) put(bm[c % bm.length], c, FG_ROW0 + t.id);
      continue;
    }
    for (let v = 0; v < VARIANTS; v++) {
      const tex = texTile(t.id, v);
      const frameable = t.solid;
      const jungle = t.id === T.JUNGLE_GRASS, mush = t.id === T.MUSHROOM_GRASS;
      const gpal = jungle ? PAL2.jungleGrass : mush ? PAL2.mushroomGrass : undefined;
      for (let m = 0; m < 16; m++) {
        const b = frameable ? frameTile(tex, m, pal, { grass: t.id === T.GRASS || jungle || mush, v, gpal }) : tex;
        put(b, frameColumn(m, v), FG_ROW0 + t.id);
      }
    }
  }
  for (const w of WALLS) {
    if (w.id === 0) continue;
    for (let v = 0; v < VARIANTS; v++) {
      const extra = w.id > 2 ? texWall2(w.id, v) : null;
      const pal = extra ? extra.pal : w.id === 1 ? PAL.dirtWall : PAL.stoneWall;
      const tex = extra ? extra.b : texWall(w.id, v);
      for (let m = 0; m < 16; m++) put(frameWall(tex, m, pal), frameColumn(m, v), WALL_ROW0 + w.id);
    }
  }
  for (let mat = 1; mat <= 3; mat++) {
    for (let s = 0; s < 4; s++) for (let p = 0; p < 4; p++) put(blendStamp(mat as Mat, s, p), s * 4 + p, BLEND_ROW0 + mat - 1);
  }
  for (let season = 0; season < 4; season++) {
    for (let v = 0; v < VARIANTS; v++) {
      const tex = texTile(T.GRASS, v);
      for (let m = 0; m < 16; m++) put(frameTile(tex, m, PAL.dirt, { grass: true, v, gpal: GRASS_SEASON[season] }), frameColumn(m, v), GRASS_SEASON_ROW0 + season);
    }
  }
  for (const [id, row0] of FAMILY_ROW) {
    const pal = TILE_PAL[id] ?? PAL.stone;
    for (let fam = 1; fam < FAMILIES; fam++) for (let v = 0; v < VARIANTS; v++) {
      const tex = texFamily(id, fam, v);
      for (let m = 0; m < 16; m++) put(frameTile(tex, m, pal, { v }), frameColumn(m, v), row0 + fam - 1);
    }
  }
  for (let s = 0; s < 4; s++) put(crack(s), s, MISC_ROW);
  for (let v = 0; v < 3; v++) put(grassBlades(v), 4 + v, MISC_ROW);
  for (let v = 0; v < 3; v++) put(grassBlades(v, true), 7 + v, MISC_ROW);
  const iconBmps = new Map<ItemId, Bmp>();
  ICON_ORDER.forEach((item, i) => { const b = paintIcon(item); iconBmps.set(item, b); put(b, i % FRAME_COLS, ICON_ROW + Math.floor(i / FRAME_COLS)); });

  const colors: string[] = TILES.map((t) => {
    const pal = TILE_PAL[t.id];
    if (ORE_PAL[t.id]) return css(ORE_PAL[t.id][4]);
    if (t.id === T.LEAVES) return css(PAL.grass[3]);
    return pal ? css(pal[4]) : t.color;
  });
  const inks: string[] = TILES.map((t) => css((TILE_PAL[t.id] ?? PAL.stone)[0]));
  return {
    canvas,
    tile: (id, v, mask) => {
      // v ≥ VARIANTS：材質家族（tileFamily.tileVariant）
      const fam = Math.floor(v / VARIANTS), row = fam > 0 ? FAMILY_ROW.get(id) : undefined;
      return { sx: frameColumn(mask, v) * S, sy: (row !== undefined && fam < FAMILIES ? row + fam - 1 : FG_ROW0 + id) * S };
    },
    wall: (id, v, mask) => ({ sx: frameColumn(mask, v) * S, sy: (WALL_ROW0 + id) * S }),
    blend: (mat, s, p) => ({ sx: (s * 4 + p) * S, sy: (BLEND_ROW0 + mat - 1) * S }),
    blades: (v, jungle) => ({ sx: ((jungle ? 7 : 4) + (v % 3)) * S, sy: MISC_ROW * S }),
    grass: (season, v, mask) => ({ sx: frameColumn(mask, v) * S, sy: (GRASS_SEASON_ROW0 + (season & 3)) * S }),
    decor: (id, style) => ({ sx: (style % FRAME_COLS) * S, sy: (FG_ROW0 + id) * S }),
    crack: (s) => ({ sx: Math.max(0, Math.min(3, s)) * S, sy: MISC_ROW * S }),
    icon: (item) => {
      const i = Math.max(0, ICON_ORDER.indexOf(item));
      return { sx: (i % FRAME_COLS) * S, sy: (ICON_ROW + Math.floor(i / FRAME_COLS)) * S };
    },
    tileColor: (id) => colors[id] ?? '#888888',
    tileInk: (id) => inks[id] ?? '#1c1424',
    iconBmp: (item) => iconBmps.get(item) ?? new Bmp(S, S),
  };
}

/** 把道具圖示畫進 HUD 小 canvas（整數倍放大、不平滑）。 */
export function drawIcon(atlas: Atlas, ctx: CanvasRenderingContext2D, item: ItemId | null, size: number): void {
  ctx.clearRect(0, 0, size, size);
  if (!item) return;
  const { sx, sy } = atlas.icon(item);
  ctx.imageSmoothingEnabled = false;
  const k = Math.max(1, Math.floor(size / S));
  const d = S * k, o = Math.floor((size - d) / 2);
  ctx.drawImage(atlas.canvas, sx, sy, S, S, o, o, d, d);
}
/** 不在圖集裡的圖示（例如帶自己顏色的時裝）畫進格子：縮放規則同 drawIcon */
export function drawBmpIcon(ctx: CanvasRenderingContext2D, b: Bmp, size: number): void {
  ctx.clearRect(0, 0, size, size);
  const c = toCanvas(b);
  if (!c) return;
  ctx.imageSmoothingEnabled = false;
  const k = Math.max(1, Math.floor(size / S));
  const d = S * k, o = Math.floor((size - d) / 2);
  ctx.drawImage(c, 0, 0, b.w, b.h, o, o, d, d);
}

export { mix, hex, shade };
