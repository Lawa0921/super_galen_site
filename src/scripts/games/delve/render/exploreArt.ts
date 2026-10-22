// exploreArt.ts — 探索系統的手繪像素圖（純 Bmp，無 DOM）。只用 pixel.ts 統一色票；光從左上；1px 描邊。
//   · tile：繩索（中段 / 底端 / 頂端繩結）、床頭、床尾、裂紋石的裂縫（疊在石頭材質上）
//   · 圖示：繩索、床、傳送石、指南針、深度計、跳躍靴、疾行靴、夜視護符、磁石
import { Bmp, INK, hex, ramp, type RGB } from './pixel';

const S = 16;
const ROPE = ramp('#2a1810', '#623924', '#966139', '#c99660', '#d8ba76', '#f2e2b0');
const WOOD = ramp('#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660');
const RED = ramp('#2a1810', '#6c1e14', '#a83a10', '#e8701c', '#ffa93a');
const CLOTH = ramp('#707490', '#b4b9c8', '#f2e2b0', '#fff4c0', '#ffffff');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8', '#ffffff');
const BRASS = ramp('#2a1810', '#623924', '#b07a4b', '#ffa93a', '#ffd86a', '#fff4c0');
const CYAN = ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#a2c8b0', '#cceaf8', '#ffffff');
const LEATHER = ramp('#1c1424', '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139');
const GREEN = ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478');

/** 兩股絞繩（x=7..8），每 4 列一個斜紋 */
function ropeStrand(b: Bmp, y0: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    const ph = y & 3;
    b.set(7, y, ph === 0 ? ROPE[1] : ph === 1 ? ROPE[4] : ROPE[3]);
    b.set(8, y, ph === 2 ? ROPE[1] : ph === 3 ? ROPE[3] : ROPE[2]);
  }
}
/** 繩索 tile：style 0 中段、1 底端（散開的繩尾）、2 頂端（綁在釘上的繩結）、3 頂 + 底（單格） */
export function ropeBmp(style: number): Bmp {
  const b = new Bmp(S, S);
  const top = style === 2 || style === 3, bottom = style === 1 || style === 3;
  ropeStrand(b, top ? 4 : 0, bottom ? 11 : S);
  if (top) {
    // 鐵釘 + 繩結
    b.rect(5, 0, 6, 2, IRON[3]); b.rect(5, 0, 6, 1, IRON[5]); b.set(10, 1, IRON[1]);
    b.rect(6, 2, 4, 3, ROPE[3]); b.rect(6, 2, 4, 1, ROPE[4]); b.set(9, 4, ROPE[1]); b.set(6, 4, ROPE[2]);
  }
  if (bottom) {
    b.rect(6, 11, 4, 2, ROPE[3]); b.set(6, 11, ROPE[4]); b.set(9, 12, ROPE[1]); // 收尾結
    b.set(6, 13, ROPE[3]); b.set(7, 14, ROPE[2]); b.set(8, 13, ROPE[4]); b.set(9, 14, ROPE[3]); b.set(10, 13, ROPE[2]);
  }
  return b.outline(INK);
}

/** 床頭：左側高床頭板 + 枕頭 + 紅毯 */
export function bedHeadBmp(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  // 床頭板（x 1..3，y 3..15），頂端圓角
  b.rect(1, 4, 3, 12, w[4]); b.rect(1, 4, 1, 12, w[5]); b.rect(3, 4, 1, 12, w[2]);
  b.rect(2, 3, 1, 1, w[5]); b.set(1, 3, w[4]); b.set(3, 3, w[3]);
  b.set(2, 6, w[1]); b.set(2, 9, w[1]); // 釘
  // 床架
  b.rect(4, 12, 12, 2, w[3]); b.rect(4, 12, 12, 1, w[4]); b.rect(4, 13, 12, 1, w[1]);
  b.rect(4, 14, 1, 2, w[2]);
  // 床墊 + 枕頭 + 毯子
  b.rect(4, 10, 12, 2, CLOTH[2]); b.rect(4, 10, 12, 1, CLOTH[3]);
  b.rect(4, 7, 5, 3, CLOTH[3]); b.rect(4, 7, 5, 1, CLOTH[4]); b.set(8, 9, CLOTH[1]); b.set(4, 9, CLOTH[1]);
  b.rect(9, 8, 7, 3, RED[2]); b.rect(9, 8, 7, 1, RED[3]); b.set(9, 8, RED[4]);
  for (let x = 11; x < 16; x += 3) b.set(x, 9, RED[1]);
  return b.outline(INK);
}
/** 床尾：毯子延續 + 右側矮床尾板 */
export function bedFootBmp(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  b.rect(0, 12, 12, 2, w[3]); b.rect(0, 12, 12, 1, w[4]); b.rect(0, 13, 12, 1, w[1]);
  b.rect(0, 10, 12, 2, CLOTH[2]); b.rect(0, 10, 12, 1, CLOTH[3]);
  b.rect(0, 8, 12, 3, RED[2]); b.rect(0, 8, 12, 1, RED[3]);
  for (let x = 2; x < 12; x += 3) b.set(x, 9, RED[1]);
  b.rect(0, 11, 11, 1, RED[1]); // 毯子垂邊陰影
  // 床尾板（x 12..14，y 6..15）
  b.rect(12, 7, 3, 9, w[4]); b.rect(12, 7, 1, 9, w[5]); b.rect(14, 7, 1, 9, w[2]);
  b.rect(13, 6, 1, 1, w[5]); b.set(12, 6, w[4]); b.set(14, 6, w[3]);
  b.rect(11, 14, 1, 2, w[2]);
  return b.outline(INK);
}

/**
 * 裂紋石：在石頭材質上疊一條從上緣貫穿到下緣的鋸齒裂縫（最暗色 + 右下亮唇）與兩條短分岔。
 * 和一般石頭的刻痕（較淺的暗線、不會貫穿）只有細微差別——仔細看才看得出來。
 */
export function crackStone(src: Bmp, pal: RGB[], v: number): Bmp {
  const b = src.clone();
  const xs = [[6, 7, 7, 8, 8, 7, 7, 8, 9, 9, 8, 8, 9, 9, 10, 10], [9, 9, 8, 8, 7, 7, 8, 8, 7, 6, 6, 7, 7, 8, 8, 9], [5, 6, 6, 7, 8, 8, 9, 9, 8, 8, 9, 10, 10, 9, 9, 10]][v % 3];
  for (let y = 0; y < S; y++) {
    const x = xs[y];
    b.set(x, y, pal[0]);
    if (y < S - 1 && xs[y + 1] !== x) b.set(Math.max(x, xs[y + 1]), y, pal[0]);
    b.set(x + 1, y, pal[5]);
  }
  // 分岔
  const by = [4, 9, 6][v % 3], bx = xs[by];
  for (let k = 1; k <= 3; k++) { b.set(bx - k, by + k, pal[0]); b.set(bx - k + 1, by + k, pal[4]); }
  const cy = [11, 3, 12][v % 3], cx = xs[cy];
  for (let k = 1; k <= 2; k++) { b.set(cx + k + 1, cy + k, pal[0]); b.set(cx + k + 1, cy + k + 1, pal[5]); }
  return b;
}

// ── 道具圖示 ─────────────────────────────────────────────
/** 一捲繩索 */
export function iconRope(): Bmp {
  const b = new Bmp(S, S), r = ROPE;
  for (let k = 0; k < 3; k++) {
    const rx = 6 - k * 1.2, ry = 5.2 - k * 1.2;
    for (let a = 0; a < 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      const x = Math.round(8 + Math.cos(t) * rx), y = Math.round(8 + Math.sin(t) * ry);
      b.set(x, y, Math.sin(t) < -0.3 ? r[4] : Math.sin(t) > 0.4 ? r[1] : r[3]);
    }
  }
  b.rect(7, 7, 2, 2, r[2]);
  // 垂下的繩頭
  b.set(13, 9, r[3]); b.set(14, 10, r[3]); b.set(14, 11, r[2]); b.set(13, 12, r[3]); b.set(14, 13, r[4]);
  return b.outline(INK);
}
export function iconBed(): Bmp {
  const b = new Bmp(S, S), w = WOOD;
  b.rect(1, 4, 2, 10, w[4]); b.rect(1, 4, 1, 10, w[5]);
  b.rect(13, 7, 2, 7, w[4]); b.rect(13, 7, 1, 7, w[5]);
  b.rect(3, 11, 10, 2, w[3]); b.rect(3, 12, 10, 1, w[1]);
  b.rect(3, 9, 10, 2, CLOTH[2]);
  b.rect(3, 7, 3, 2, CLOTH[4]);
  b.rect(6, 7, 7, 3, RED[2]); b.rect(6, 7, 7, 1, RED[3]);
  return b.outline(INK);
}
/** 傳送石：刻著螺旋符文的青色圓石，中心微光 */
export function iconRecall(): Bmp {
  const b = new Bmp(S, S), s = ramp('#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8');
  b.disc(8, 8.5, 6, 6, s[2]);
  b.disc(7, 7.5, 4.6, 4.6, s[3]);
  b.set(4, 5, s[4]); b.set(5, 4, s[4]); b.set(6, 4, s[4]);
  const spiral: [number, number][] = [[8, 8], [9, 8], [9, 9], [8, 10], [7, 10], [6, 9], [6, 8], [6, 7], [7, 6], [8, 6], [9, 6], [10, 7], [11, 8], [11, 9], [11, 10]];
  spiral.forEach(([x, y], i) => b.set(x, y, i < 4 ? CYAN[6] : i < 9 ? CYAN[4] : CYAN[3]));
  b.set(8, 8, hex('#ffffff'));
  return b.outline(INK);
}
/** 指南針：黃銅外殼 + 紅藍指針 */
export function iconCompass(): Bmp {
  const b = new Bmp(S, S);
  b.disc(8, 8.5, 6.5, 6.5, BRASS[2]);
  b.disc(8, 8.5, 5.5, 5.5, BRASS[3]);
  b.disc(8, 8.5, 4.4, 4.4, CLOTH[3]);
  b.rect(7, 1, 2, 2, BRASS[4]); // 吊環
  for (const [x, y] of [[8, 4], [8, 13], [4, 8], [12, 8]] as const) b.set(x, y, IRON[2]);
  b.line(8, 8, 10, 5, RED[2]); b.set(10, 5, RED[3]); b.set(9, 6, RED[3]);
  b.line(8, 9, 6, 12, hex('#2c4486')); b.set(6, 12, hex('#3e74c4'));
  b.set(8, 8, IRON[1]);
  b.set(5, 5, BRASS[5]);
  return b.outline(INK);
}
/** 深度計：鐵框長方錶面 + 往下的刻度與指示 */
export function iconDepthMeter(): Bmp {
  const b = new Bmp(S, S);
  b.rect(3, 1, 10, 14, IRON[3]); b.rect(3, 1, 10, 1, IRON[5]); b.rect(3, 1, 1, 14, IRON[4]); b.rect(12, 1, 1, 14, IRON[1]);
  b.rect(5, 3, 6, 10, hex('#18204a'));
  for (let y = 4; y < 12; y += 2) b.rect(5, y, y % 4 === 0 ? 3 : 2, 1, CYAN[4]);
  b.rect(8, 9, 3, 2, BRASS[4]); b.set(8, 9, BRASS[5]); // 指示
  b.set(9, 11, BRASS[3]); b.set(9, 12, BRASS[2]);
  b.rect(6, 13, 4, 1, IRON[2]);
  return b.outline(INK);
}
/** 靴子（共用）：col = 主色階、wing = 有沒有小翅膀、spring = 鞋跟彈簧 */
function boot(col: RGB[], opts: { wing?: boolean; spring?: boolean }): Bmp {
  const b = new Bmp(S, S);
  b.rect(5, 2, 5, 8, col[3]); b.rect(5, 2, 1, 8, col[4]); b.rect(9, 2, 1, 8, col[2]);
  b.rect(5, 2, 5, 1, col[4]);
  b.rect(4, 10, 9, 3, col[3]); b.rect(4, 10, 9, 1, col[4]); b.rect(10, 11, 3, 2, col[2]);
  b.rect(4, 13, 9, 1, LEATHER[1]);
  b.rect(5, 4, 5, 1, BRASS[3]); // 綁帶
  if (opts.wing) {
    b.set(10, 3, CLOTH[4]); b.set(11, 2, CLOTH[4]); b.set(12, 2, CLOTH[3]); b.set(11, 4, CLOTH[3]); b.set(12, 3, CLOTH[2]); b.set(13, 3, CLOTH[2]);
  }
  if (opts.spring) {
    for (let x = 5; x <= 9; x++) b.set(x, 14, (x & 1) === 1 ? IRON[5] : IRON[3]);
    b.set(5, 15, IRON[3]); b.set(9, 15, IRON[3]); b.set(7, 15, IRON[4]);
  }
  return b.outline(INK);
}
export function iconJumpBoots(): Bmp { return boot(GREEN, { spring: true }); }
export function iconSwiftBoots(): Bmp { return boot(ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee'), { wing: true }); }
/** 夜視護符：鍊子 + 黃銅框 + 貓頭鷹眼（兩顆發光的青色眼） */
export function iconNightAmulet(): Bmp {
  const b = new Bmp(S, S);
  for (let i = 0; i < 5; i++) { b.set(3 + i, 1 + (i >> 1), BRASS[i & 1 ? 4 : 2]); b.set(12 - i, 1 + (i >> 1), BRASS[i & 1 ? 4 : 2]); }
  b.disc(8, 9.5, 5.5, 4.8, BRASS[3]);
  b.disc(8, 9.5, 4.4, 3.8, hex('#2c2450'));
  b.disc(6, 9, 1.6, 1.6, CYAN[4]); b.disc(10, 9, 1.6, 1.6, CYAN[4]);
  b.set(6, 9, CYAN[6]); b.set(10, 9, CYAN[6]);
  b.set(8, 11, BRASS[4]); b.set(5, 6, BRASS[5]);
  return b.outline(INK);
}
/** 磁石：紅色 U 形磁鐵、銀色兩極 + 小火花 */
export function iconMagnet(): Bmp {
  const b = new Bmp(S, S);
  for (let y = 3; y < 9; y++) { b.rect(3, y, 3, 1, RED[2]); b.rect(10, y, 3, 1, RED[2]); b.set(3, y, RED[3]); b.set(12, y, RED[1]); }
  for (let y = 8; y < 15; y++) for (let x = 2; x < 14; x++) {
    const d = Math.hypot(x - 7.5, (y - 8.5) * 1.1);
    if (d >= 2.4 && d <= 5.4) b.set(x, y, d > 4.6 ? RED[1] : d < 3.2 ? RED[3] : RED[2]);
  }
  b.rect(3, 1, 3, 2, IRON[5]); b.rect(10, 1, 3, 2, IRON[4]); b.set(3, 1, IRON[6]);
  b.set(1, 0, CYAN[6]); b.set(0, 1, CYAN[5]); b.set(14, 0, CYAN[6]); b.set(15, 1, CYAN[5]);
  return b.outline(INK);
}
