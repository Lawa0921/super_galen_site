// dungeonArt.ts — 地城物件與新道具的手繪像素圖（純 Bmp，無 DOM）。只用 pixel.ts 統一色票；光從左上；1px 描邊。
//   · 平台（左端 / 中段 / 右端 / 單塊）、木門（關：上 / 中 / 下；開：側面）、上鎖的鐵門、金寶箱
//   · 鐵鍊、旗幟（上 / 下）、蠟燭、吊燈、書架、骨堆、古碑
//   · 圖示：地城鑰匙、金鑰匙、探險提燈、探險家地圖、木門、平台、符文鎬配色
import { Bmp, INK, hex, ramp, h01, type RGB } from './pixel';

const S = 16;
const WOOD = ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff');
const GOLD = ramp('#2a1810', '#6c1e14', '#a83a10', '#ffa93a', '#ffd86a', '#fff4c0', '#ffffff');
const BONE = ramp('#2c2838', '#707490', '#b4b9c8', '#f2e2b0', '#fff4c0');
const FLAME = ramp('#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
export const RUNE_METAL = ramp('#16301e', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff');

/** 平台：上緣 4px 的木板條；style 0 中段、1 左端、2 右端、3 單塊（兩端都有支架） */
export function platformBmp(style: number): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  b.rect(0, 0, S, 1, w[6]); b.rect(0, 1, S, 2, w[4]); b.rect(0, 3, S, 1, w[1]);
  for (const x of [5, 11]) { b.set(x, 1, w[2]); b.set(x, 2, w[2]); b.set(x + 1, 1, w[5]); }
  b.set(2, 1, w[0]); b.set(13, 2, w[0]); // 釘子
  const leftEnd = style === 1 || style === 3, rightEnd = style === 2 || style === 3;
  // 端點：斜撐
  if (leftEnd) { b.clear(0, 0); for (let i = 0; i < 4; i++) { b.set(1 + i, 4 + i, w[3]); b.set(1 + i, 5 + i, w[1]); } }
  if (rightEnd) { b.clear(15, 0); for (let i = 0; i < 4; i++) { b.set(14 - i, 4 + i, w[3]); b.set(14 - i, 5 + i, w[1]); } }
  return b;
}

/** 木門（關）：直條木板 + 兩道鐵箍 + 門把（中段）。part 0 上、1 中、2 下 */
export function doorClosedBmp(part: number): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  const x0 = 3, x1 = 13;
  for (let y = 0; y < S; y++) {
    for (let x = x0; x < x1; x++) {
      const plank = Math.floor((x - x0) / 3), px = (x - x0) % 3;
      let c = w[plank & 1 ? 3 : 4];
      if (px === 2) c = w[1];
      else if (px === 0) c = w[5];
      b.set(x, y, c);
    }
    b.set(x0 - 1, y, w[2]); b.set(x1, y, w[1]); // 門框
  }
  if (part === 0) { b.rect(x0, 0, x1 - x0, 1, w[6]); b.rect(x0 - 1, 0, x1 - x0 + 2, 1, w[2]); }
  if (part === 2) b.rect(x0 - 1, S - 1, x1 - x0 + 2, 1, w[0]);
  const band = (y: number): void => { b.rect(x0, y, x1 - x0, 2, m[3]); b.rect(x0, y, x1 - x0, 1, m[4]); for (let x = x0 + 1; x < x1; x += 3) b.set(x, y, m[5]); };
  if (part === 0) band(4);
  if (part === 2) band(10);
  if (part === 1) { b.rect(10, 6, 2, 3, m[4]); b.set(10, 6, m[6]); b.set(11, 8, m[2]); }
  return b.outline(INK);
}

/** 木門（開）：門板轉到側面，只剩一條 3px 寬的邊（靠左，鉸鏈側） */
export function doorOpenBmp(part: number): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  for (let y = 0; y < S; y++) { b.set(2, y, w[5]); b.set(3, y, w[3]); b.set(4, y, w[1]); }
  if (part === 0) { b.rect(2, 4, 3, 2, m[3]); b.set(2, 4, m[5]); }
  if (part === 2) { b.rect(2, 10, 3, 2, m[3]); b.set(2, 10, m[5]); }
  return b.outline(INK);
}

/** 上鎖的門：厚鐵門 + 鉚釘 + 中段金色大鎖 */
export function doorLockedBmp(part: number): Bmp {
  const b = new Bmp(S, S), m = IRON;
  const x0 = 3, x1 = 13;
  for (let y = 0; y < S; y++) {
    for (let x = x0; x < x1; x++) b.set(x, y, (x - x0) < 2 ? m[4] : (x1 - x) < 2 ? m[2] : m[3]);
    b.set(x0 - 1, y, m[1]); b.set(x1, y, m[1]);
  }
  if (part === 0) b.rect(x0, 0, x1 - x0, 1, m[5]);
  for (let y = 2; y < S; y += 5) for (const x of [x0 + 1, x1 - 2]) { b.set(x, y, m[5]); b.set(x, y + 1, m[1]); }
  if (part === 1) {
    const g = GOLD;
    b.rect(6, 3, 4, 2, g[2]); b.set(6, 3, g[4]); b.set(9, 3, g[4]); b.rect(7, 2, 2, 1, g[3]); // 鎖環
    b.rect(5, 5, 6, 6, g[3]); b.rect(5, 5, 6, 1, g[5]); b.rect(5, 5, 1, 6, g[4]); b.rect(5, 10, 6, 1, g[1]);
    b.rect(7, 7, 2, 2, INK); b.set(7, 9, INK);
  }
  if (part === 2) b.rect(x0 - 1, S - 1, x1 - x0 + 2, 1, m[0]);
  return b.outline(INK);
}

/** 金寶箱：金色圓頂箱 + 鐵角 + 大鎖孔 */
export function lockedChestBmp(): Bmp {
  const b = new Bmp(S, S), g = GOLD, m = IRON;
  b.rect(1, 5, 14, 4, g[4]); b.rect(2, 4, 12, 1, g[5]); b.rect(1, 5, 14, 1, g[5]);
  b.rect(1, 8, 14, 1, g[2]);
  b.rect(1, 9, 14, 7, g[3]); b.rect(1, 9, 14, 1, g[1]); b.rect(1, 10, 1, 6, g[4]);
  for (let x = 4; x < 13; x += 4) b.rect(x, 11, 1, 4, g[2]);
  for (const x of [1, 14]) { b.rect(x, 4, 1, 12, m[3]); b.set(x, 5, m[5]); }
  b.rect(6, 7, 4, 5, m[4]); b.rect(6, 7, 4, 1, m[5]); b.rect(7, 9, 2, 2, INK); b.set(7, 11, INK);
  b.set(3, 6, g[6]); b.set(12, 13, g[1]);
  b.rect(1, 15, 14, 1, g[1]);
  return b.outline(INK);
}

/** 鐵鍊：交錯的直環 / 側環 */
export function chainBmp(style: number): Bmp {
  const b = new Bmp(S, S), m = IRON, o = style & 1 ? 4 : 0;
  for (let k = 0; k < 2; k++) {
    const y = (k * 8 + o) % 16;
    b.rect(7, y, 1, 5, m[4]); b.rect(9, y, 1, 5, m[2]); b.set(8, y, m[5]); b.set(8, y + 4, m[1]); // 直環（中空）
    b.rect(8, y + 5, 1, 3, m[3]); b.set(8, y + 5, m[5]); // 側環
  }
  return b.outline(INK);
}

/** 旗幟：style 0 上（橫桿 + 布頂 + 徽記）、1 下（布尾 V 形缺口）；c 為布色組 */
export function bannerBmp(style: number): Bmp {
  const b = new Bmp(S, S);
  const cloth = style >= 2 ? ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0') : ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a');
  const g = GOLD, part = style & 1;
  const x0 = 3, x1 = 13;
  if (part === 0) {
    b.rect(1, 0, 14, 2, WOOD[4]); b.rect(1, 0, 14, 1, WOOD[6]); b.set(0, 0, g[4]); b.set(15, 0, g[4]);
    for (let y = 2; y < S; y++) for (let x = x0; x < x1; x++) b.set(x, y, x === x0 ? cloth[3] : x === x1 - 1 ? cloth[0] : cloth[2]);
    b.rect(x0, 3, x1 - x0, 1, g[3]);
    // 徽記：金色菱形
    for (let dy = -2; dy <= 2; dy++) { const hw = 2 - Math.abs(dy); b.rect(8 - hw, 10 + dy, hw * 2 + 1, 1, dy < 0 ? g[4] : g[3]); }
    b.set(8, 10, g[6]);
  } else {
    for (let y = 0; y < 13; y++) for (let x = x0; x < x1; x++) {
      const notch = y > 8 && Math.abs(x + 0.5 - 8) < (y - 8) * 1.3;
      if (notch) continue;
      b.set(x, y, x === x0 ? cloth[3] : x === x1 - 1 ? cloth[0] : cloth[2]);
    }
    b.rect(x0, 2, x1 - x0, 1, g[3]);
  }
  return b.outline(INK);
}

/** 蠟燭：style 0 單根、1 三根一組（燭台） */
export function candleBmp(style: number): Bmp {
  const b = new Bmp(S, S), wax = ramp('#b4b9c8', '#f2e2b0', '#fff4c0', '#ffffff');
  const one = (x: number, h: number): void => {
    b.rect(x, 15 - h, 2, h, wax[1]); b.rect(x, 15 - h, 1, h, wax[3]);
    b.set(x, 14 - h, FLAME[1]); b.set(x + 1, 14 - h, FLAME[3]); b.set(x, 13 - h, FLAME[3]); b.set(x, 12 - h, FLAME[4]);
  };
  if (style === 0) { one(7, 5); b.rect(5, 15, 6, 1, IRON[3]); b.set(5, 14, IRON[4]); b.set(10, 14, IRON[2]); }
  else { one(3, 4); one(7, 7); one(11, 3); b.rect(2, 15, 12, 1, GOLD[2]); b.rect(2, 15, 12, 1, GOLD[3]); }
  return b.outline(INK);
}

/** 吊燈：上方短鏈 + 金屬燈罩 + 發亮的燈芯 */
export function lanternBmp(): Bmp {
  const b = new Bmp(S, S), m = IRON;
  b.rect(8, 0, 1, 3, m[3]);
  b.rect(5, 3, 7, 2, m[3]); b.rect(5, 3, 7, 1, m[5]);
  b.rect(5, 5, 7, 7, FLAME[3]); b.rect(6, 6, 5, 5, FLAME[4]); b.rect(7, 7, 3, 3, FLAME[4]); b.set(8, 8, hex('#ffffff'));
  for (const x of [5, 11]) b.rect(x, 5, 1, 7, m[2]);
  b.rect(8, 5, 1, 7, m[2]);
  b.rect(5, 12, 7, 2, m[3]); b.rect(6, 14, 5, 1, m[2]);
  return b.outline(INK);
}

/** 書架：木框 + 兩層彩色書背（style 決定書色排列）；底層有踢腳板 */
export function bookshelfBmp(style: number): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  const books: RGB[] = [hex('#a83a10'), hex('#2c4486'), hex('#3f7468'), hex('#7a5a8c'), hex('#b07a4b'), hex('#ffa93a')];
  b.rect(0, 0, 16, 16, w[2]);
  b.rect(0, 0, 16, 1, w[5]); b.rect(0, 0, 1, 16, w[4]); b.rect(15, 0, 1, 16, w[1]);
  b.rect(1, 7, 14, 1, w[4]); b.rect(1, 15, 14, 1, w[1]);
  for (const sy of [1, 8]) {
    let x = 1;
    let k = style * 3 + sy;
    while (x < 15) {
      const bw = 1 + (h01(k, sy, 5) > 0.6 ? 1 : 0);
      const tall = 4 + Math.floor(h01(k, sy, 9) * 3);
      if (h01(k, sy, 3) > 0.86) { x += 1; k++; continue; } // 空位
      const c = books[Math.floor(h01(k, sy, 7) * books.length)];
      for (let i = 0; i < bw && x + i < 15; i++) {
        b.rect(x + i, sy + 6 - tall, 1, tall, c);
        b.set(x + i, sy + 6 - tall, hex('#f2e2b0'));
      }
      x += bw; k++;
    }
  }
  return b.outline(INK);
}

/** 骨堆：style 0 頭骨 + 骨頭、1 散落的骨頭、2 一小疊頭骨 */
export function bonesBmp(style: number): Bmp {
  const b = new Bmp(S, S), c = BONE;
  const bone = (x0: number, y0: number, x1: number, y1: number): void => {
    b.line(x0, y0, x1, y1, c[3]);
    for (const [x, y] of [[x0, y0], [x1, y1]]) { b.set(x - 1, y, c[4]); b.set(x, y - 1, c[4]); b.set(x + 1, y + 1, c[2]); }
  };
  const skull = (x: number, y: number): void => {
    b.disc(x, y, 3, 2.6, c[3]); b.rect(x - 2, y + 1, 4, 2, c[3]); b.set(x - 2, y - 2, c[4]);
    b.set(x - 2, y, INK); b.set(x - 1, y, INK); b.set(x + 1, y, INK);
    b.set(x - 1, y + 2, c[1]); b.set(x + 1, y + 2, c[1]);
  };
  if (style === 0) { bone(2, 14, 10, 12); bone(5, 15, 13, 14); skull(9, 11); }
  else if (style === 1) { bone(1, 15, 7, 13); bone(8, 14, 14, 15); bone(4, 12, 9, 15); }
  else { skull(5, 12); skull(11, 12); skull(8, 8); }
  return b.outline(INK);
}

/** 古碑：圓頂石碑 + 刻紋符號（佔位物件） */
export function loreTabletBmp(): Bmp {
  const b = new Bmp(S, S), s = ramp('#1c1424', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8');
  b.disc(8, 5, 5, 4, s[3]);
  b.rect(3, 5, 10, 9, s[3]); b.rect(3, 5, 1, 9, s[4]); b.rect(12, 5, 1, 9, s[2]);
  b.rect(2, 14, 12, 2, s[2]); b.rect(2, 14, 12, 1, s[4]);
  // 刻紋（暗線 + 下方亮唇）
  const glyph = (x: number, y: number, k: number): void => {
    const pat = [[0, 0, 2, 0, 1, 1], [0, 0, 0, 2, 2, 2], [1, 0, 0, 1, 2, 2], [0, 1, 2, 1, 1, 0]][k % 4];
    for (let i = 0; i < pat.length; i += 2) { b.set(x + pat[i], y + pat[i + 1], s[1]); b.set(x + pat[i] + 1, y + pat[i + 1] + 1, s[4]); }
  };
  glyph(5, 4, 0); glyph(9, 4, 1); glyph(5, 8, 2); glyph(9, 8, 3); glyph(7, 11, 1);
  b.set(8, 1, hex('#4aaeb0')); b.set(7, 2, hex('#a2c8b0')); // 符文微光
  return b.outline(INK);
}

// ── 道具圖示 ─────────────────────────────────────────────
export function iconKey(golden: boolean): Bmp {
  const b = new Bmp(S, S), c = golden ? GOLD : IRON;
  b.disc(5, 5, 3.6, 3.6, c[3]); b.disc(5, 5, 1.6, 1.6, INK);
  b.set(3, 3, c[5]); b.set(4, 2, c[5]);
  for (let i = 0; i < 8; i++) { b.set(7 + i, 7 + i, c[4]); b.set(7 + i, 8 + i, c[2]); }
  b.rect(11, 13, 2, 1, c[3]); b.rect(13, 11, 1, 2, c[3]); b.set(12, 14, c[2]);
  if (golden) b.set(5, 3, c[6]);
  return b.outline(INK);
}
export function iconLantern(): Bmp {
  const b = new Bmp(S, S), m = IRON;
  b.rect(6, 1, 4, 1, m[4]); b.set(5, 2, m[4]); b.set(10, 2, m[4]);
  b.rect(4, 3, 8, 2, m[3]); b.rect(4, 3, 8, 1, m[5]);
  b.rect(4, 5, 8, 7, FLAME[3]); b.rect(5, 6, 6, 5, FLAME[4]); b.rect(7, 7, 2, 3, hex('#ffffff'));
  for (const x of [4, 11]) b.rect(x, 5, 1, 7, m[2]);
  b.rect(3, 12, 10, 2, m[3]); b.rect(3, 12, 10, 1, m[4]);
  return b.outline(INK);
}
export function iconMap(): Bmp {
  const b = new Bmp(S, S), p = ramp('#966139', '#c99660', '#d8ba76', '#f2e2b0');
  b.rect(2, 3, 12, 10, p[3]);
  b.rect(2, 3, 4, 10, p[2]); b.rect(10, 3, 4, 10, p[2]); // 摺痕
  b.rect(2, 12, 12, 1, p[1]);
  b.line(3, 10, 6, 6, hex('#a83a10')); b.line(6, 6, 9, 8, hex('#a83a10')); b.line(9, 8, 12, 5, hex('#a83a10'));
  b.set(12, 5, hex('#6c1e14')); b.set(11, 4, hex('#6c1e14')); b.set(13, 6, hex('#6c1e14')); b.set(11, 6, hex('#6c1e14')); b.set(13, 4, hex('#6c1e14'));
  b.disc(4.5, 5, 1.2, 1.2, hex('#2c8692'));
  return b.outline(INK);
}
export function iconDoor(): Bmp {
  const b = new Bmp(S, S), w = WOOD, m = IRON;
  for (let y = 1; y < 15; y++) for (let x = 4; x < 12; x++) b.set(x, y, (x - 4) % 3 === 2 ? w[1] : (x - 4) % 3 === 0 ? w[5] : w[3]);
  b.rect(4, 1, 8, 1, w[6]);
  b.rect(4, 4, 8, 1, m[4]); b.rect(4, 11, 8, 1, m[4]);
  b.rect(9, 7, 2, 2, m[5]);
  return b.outline(INK);
}
export function iconPlatform(): Bmp {
  const b = new Bmp(S, S);
  b.blit(platformBmp(3), 0, 5);
  return b.outline(INK);
}
