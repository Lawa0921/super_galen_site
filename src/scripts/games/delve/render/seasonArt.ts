// seasonArt.ts — 季節 / 天氣的像素美術（啟動時烘焙一次，全部吸附統一色票、沒有半透明）：
//   · 植物圖集：草葉 / 花 / 高草 × 四季 × 3 個擺動影格（風吹時頂端往左 / 右錯 1–2 px）
//   · 冰面 tile（結冰的湖面）、8 個月相、抖動遮罩（睡覺淡出、霧）、閃電
import { T } from '../engine/tiles';
import { TILE_SIZE } from '../engine/constants';
import { Bmp, bayer, h01, hex, ramp, toCanvas, type RGB } from './pixel';
import { PAL2, decorBmp } from './decor';
import { GRASS_SEASON } from './textures';
import { DECOR_STYLES } from './autotile';

const S = TILE_SIZE;
/** 擺動影格：0 = 左、1 = 正、2 = 右 */
export const SWAY_FRAMES = 3;
const FLOWER_STYLES = DECOR_STYLES[T.FLOWER] ?? 12;
const TALL_STYLES = DECOR_STYLES[T.TALL_GRASS] ?? 4;
/** 每季一個區塊：草葉 3 + 花 FLOWER_STYLES + 高草 TALL_STYLES 欄 × 3 擺動列 */
const COLS = 3 + FLOWER_STYLES + TALL_STYLES;

/** 把 src 的每列依高度水平錯位（越上面錯越多）：sway −1 / 0 / 1，strong = 高草（頂端錯 2 px） */
function shear(src: Bmp, sway: number, strong: boolean): Bmp {
  if (!sway) return src.clone();
  const o = new Bmp(src.w, src.h);
  for (let y = 0; y < src.h; y++) {
    const k = strong ? (y < 6 ? 2 : y < 11 ? 1 : 0) : (y < 10 ? 1 : 0);
    for (let x = 0; x < src.w; x++) { const v = src.raw(x, y); if (v >>> 24) o.setRaw(x + sway * k, y, v); }
  }
  return o;
}
/** 依色階索引換色：from[i] → to[i] */
function recolor(b: Bmp, from: RGB[], to: RGB[]): Bmp {
  const key = (c: RGB): number => (c[0] << 16) | (c[1] << 8) | c[2];
  const m = new Map<number, RGB>();
  from.forEach((c, i) => m.set(key(c), to[Math.min(i, to.length - 1)]));
  b.map((c) => m.get(key(c)) ?? c);
  return b;
}

const SNOW = hex('#ffffff'), SNOW2 = hex('#cceaf8');
const DRY = ramp('#2a1810', '#472819', '#7c4c2e', '#966139', '#b07a4b', '#c99660', '#d8ba76');
const WINTER_STALK = ramp('#1c1424', '#2a1810', '#472819', '#7c4c2e', '#966139', '#b07a4b', '#c99660');

/** 草葉（長在草地上方那格的底部）：各季節的長度、花色（春天花最多、冬天沒有） */
function blades(v: number, season: number): Bmp {
  const G = GRASS_SEASON[season], b = new Bmp(S, S);
  if (season === 3) {
    // 冬：積雪下只露出零星的枯草尖
    for (let x = 0; x < S; x++) if (h01(x, v, 777) > 0.86) b.set(x, S - 1, WINTER_STALK[4]);
    return b;
  }
  for (let x = 0; x < S; x++) {
    const r = h01(x, v, 501);
    const hgt = (season === 1 ? (r > 0.78 ? 4 : r > 0.48 ? 3 : r > 0.22 ? 2 : 0) : r > 0.82 ? 3 : r > 0.5 ? 2 : r > 0.25 ? 1 : 0);
    for (let k = 0; k < hgt; k++) b.set(x, S - 1 - k, k === hgt - 1 ? G[5] : G[4]);
  }
  const flower = (x: number, c1: string, c2: string): void => { b.set(x, 13, G[3]); b.set(x, 12, G[3]); b.set(x, 11, hex(c1)); b.set(x - 1, 11, hex(c2)); };
  if (season === 0) {
    // 春：每個變體都有花（白 / 粉 / 黃）
    if (v === 0) { flower(6, '#ffffff', '#cceaf8'); flower(13, '#f2b888', '#b8788e'); }
    if (v === 1) { flower(4, '#b8788e', '#f2b888'); flower(10, '#ffd86a', '#fff4c0'); }
    if (v === 2) { flower(11, '#ffd86a', '#fff4c0'); flower(3, '#cceaf8', '#ffffff'); }
  } else if (season === 1) {
    if (v === 2) flower(11, '#ffd86a', '#fff4c0');
    if (v === 1) flower(4, '#b8788e', '#f2b888');
  } else if (v === 2) flower(11, '#e8701c', '#ffa93a'); // 秋：零星的橙色小花
  return b;
}
/** 花（裝飾 tile）：春夏盛開、秋天一半凋謝（花頭變褐）、冬天只剩積雪的枯莖 */
function flowerSeason(style: number, season: number): Bmp {
  const base = decorBmp(T.FLOWER, style);
  const G = GRASS_SEASON[season];
  if (season === 3) {
    const b = new Bmp(S, S);
    const xs = style >= 6 ? [5, 11] : [8];
    for (const x of xs) {
      for (let y = 11; y <= 15; y++) b.set(x, y, WINTER_STALK[y > 13 ? 2 : 3]);
      b.set(x, 10, SNOW); b.set(x - 1, 11, SNOW2); b.set(x + 1, 11, SNOW2);
    }
    return b;
  }
  recolor(base, PAL2.leaf, season === 2 ? DRY : G);
  if (season === 2 && style % 2 === 0) {
    // 凋謝：花瓣換成褐色、往下垂一格
    const wilt = new Bmp(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = base.raw(x, y);
      if (!(v >>> 24)) continue;
      const c = Bmp.unpack(v);
      const isStem = DRY.some((d) => d[0] === c[0] && d[1] === c[1] && d[2] === c[2]) || (c[0] === 0x16 && c[1] === 0x30);
      wilt.set(x, isStem ? y : Math.min(15, y + 1), isStem ? c : (y & 1 ? DRY[2] : DRY[3]));
    }
    return wilt;
  }
  return base;
}
/** 高草：依季節換色（秋天枯黃、冬天乾草 + 雪尖） */
function tallSeason(style: number, season: number): Bmp {
  const b = decorBmp(T.TALL_GRASS, style);
  if (season === 3) {
    recolor(b, PAL2.leaf, WINTER_STALK);
    const src = b.clone();
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (src.on(x, y) && !src.on(x, y - 1) && h01(x, y, 91) > 0.35) b.set(x, y, SNOW);
    return b;
  }
  return recolor(b, PAL2.leaf, season === 2 ? DRY : GRASS_SEASON[season]);
}

export interface FloraSrc { sx: number; sy: number; }
export class FloraAtlas {
  readonly canvas: HTMLCanvasElement;
  constructor() {
    const b = new Bmp(COLS * S, 4 * SWAY_FRAMES * S);
    const put = (src: Bmp, col: number, season: number, sway: number, strong: boolean): void => {
      b.blit(shear(src, sway - 1, strong), col * S, (season * SWAY_FRAMES + sway) * S);
    };
    for (let season = 0; season < 4; season++) {
      for (let sw = 0; sw < SWAY_FRAMES; sw++) {
        for (let v = 0; v < 3; v++) put(blades(v, season), v, season, sw, false);
        for (let f = 0; f < FLOWER_STYLES; f++) put(flowerSeason(f, season), 3 + f, season, sw, false);
        for (let t = 0; t < TALL_STYLES; t++) put(tallSeason(t, season), 3 + FLOWER_STYLES + t, season, sw, true);
      }
    }
    this.canvas = toCanvas(b) as HTMLCanvasElement;
  }
  private at(col: number, season: number, sway: number): FloraSrc { return { sx: col * S, sy: ((season & 3) * SWAY_FRAMES + sway) * S }; }
  /** sway：−1 / 0 / 1 */
  blades(season: number, v: number, sway: number): FloraSrc { return this.at(v % 3, season, sway + 1); }
  flower(season: number, style: number, sway: number): FloraSrc { return this.at(3 + (style % FLOWER_STYLES), season, sway + 1); }
  tallGrass(season: number, style: number, sway: number): FloraSrc { return this.at(3 + FLOWER_STYLES + (style % TALL_STYLES), season, sway + 1); }
}

/** 冰面（結冰的湖面那格）：top = 上方不是冰（畫亮邊與積雪）；3 個變體的裂紋 */
export function iceBmp(v: number, top: boolean): Bmp {
  const b = new Bmp(S, S);
  const body = hex('#94c8ee'), lite = hex('#cceaf8'), deep = hex('#5c9ce0'), crack = hex('#3e74c4');
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let c = y < 5 ? lite : y > 11 ? deep : body;
    if (y >= 5 && y <= 11 && bayer(x, y) < (y - 5) / 12) c = deep;
    b.set(x, y, c);
  }
  // 裂紋（每變體不同的斜線）
  const lines: [number, number, number, number][][] = [[[2, 6, 7, 10], [7, 10, 10, 9]], [[9, 5, 13, 11], [13, 11, 15, 12]], [[0, 9, 4, 7], [11, 13, 14, 8]]];
  for (const [x0, y0, x1, y1] of lines[v % 3]) b.line(x0, y0, x1, y1, crack);
  // 反光
  b.set(3 + v * 4, 6, hex('#ffffff')); b.set(4 + v * 4, 6, hex('#ffffff')); b.set(4 + v * 4, 7, lite);
  if (top) {
    for (let x = 0; x < S; x++) {
      b.set(x, 0, hex('#ffffff'));
      if (h01(x, v, 3) > 0.45) b.set(x, 1, hex('#ffffff'));
    }
  }
  return b;
}

/** 月相 phase 0..7（0 新月、4 滿月）：亮面右側漸盈、左側漸虧；暗面以夜空暗紫畫出輪廓 */
export function moonPhaseBmp(phase: number): Bmp {
  const N = 32, R = 10, b = new Bmp(N, N);
  const lit = hex('#f2f4fa'), mid = hex('#cfd5e4'), dark = hex('#a3abc2'), glow = hex('#7f9cc4'), shadow = hex('#2c2450'), rim = hex('#463c78');
  const phi = (phase / 8) * Math.PI * 2;
  const craters: [number, number, number][] = [[12, 13, 2.2], [19, 18, 2.8], [14, 21, 1.5], [20, 11, 1.4]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - 16, dy = y + 0.5 - 16, d = Math.hypot(dx, dy);
    if (d > R) {
      if (phase >= 3 && phase <= 5 && d < 13 && bayer(x, y) > 0.875) b.set(x, y, glow);
      continue;
    }
    const u = dx / R, v = dy / R, edge = Math.sqrt(Math.max(0, 1 - v * v));
    const on = phi <= Math.PI ? u > Math.cos(phi) * edge : u < -Math.cos(phi) * edge;
    if (!on) { b.set(x, y, d > R - 1 ? rim : shadow); continue; }
    let c = d > R - 1 ? mid : lit;
    for (const [cx, cy, r] of craters) {
      const cd = Math.hypot(x - cx, y - cy);
      if (cd <= r) c = cd > r - 1 && x - cx + y - cy > 0 ? lit : x - cx + y - cy < 0 ? dark : mid;
    }
    b.set(x, y, c);
  }
  return b;
}

/** 抖動遮罩（4×4 Bayer，2×2 成簇）：level 0..1 的格子塗 color，其餘透明 */
export function ditherBmp(level: number, color: string, size = 16): Bmp {
  const b = new Bmp(size, size), c = hex(color);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (bayer(x >> 1, y >> 1) < level) b.set(x, y, c);
  return b;
}

/** 閃電：從天頂到地平線的鋸齒（1 px 白芯 + 兩側淡藍），seed 決定形狀；回傳 canvas 與根部 x */
export function boltBmp(seed: number, h: number): { b: Bmp; ox: number } {
  const W = 48, b = new Bmp(W, h), core = hex('#ffffff'), side = hex('#cceaf8'), far = hex('#94c8ee');
  const path = (x0: number, y0: number, len: number, k: number, branch: boolean): void => {
    let x = x0;
    for (let y = y0; y < Math.min(h, y0 + len); y++) {
      if (y % 4 === 0) x += Math.round((h01(y, k, seed) - 0.5) * 6);
      x = Math.max(1, Math.min(W - 2, x));
      b.set(x, y, core);
      if (!branch) { b.set(x - 1, y, side); b.set(x + 1, y, h01(y, k + 1, seed) > 0.5 ? side : far); }
      if (!branch && y > y0 + 12 && h01(y, k + 9, seed) > 0.985) path(x, y, 10 + Math.floor(h01(y, k, seed) * 18), k + 17, true);
    }
  };
  path(W / 2, 0, h, 1, false);
  return { b, ox: W / 2 };
}

/** 天氣小圖示（12×12）：晴 / 陰 / 雨 / 雷雨 / 雪 / 霧 */
export function weatherIconBmp(kind: string): Bmp {
  const b = new Bmp(12, 12);
  const sun = hex('#ffd86a'), sunC = hex('#fff4c0'), rim = hex('#e8701c');
  const cl = hex('#cceaf8'), cm = hex('#b4b9c8'), cd = hex('#707490'), ink = hex('#1c1424');
  const cloud = (dark: boolean): void => {
    const top = dark ? cd : cl, mid = dark ? hex('#5e5e74') : cm;
    b.disc(4.5, 5.5, 2.6, 2.4, top); b.disc(7.5, 4.5, 2.9, 2.7, top); b.rect(2, 5, 8, 3, mid); b.rect(2, 5, 8, 1, top);
  };
  switch (kind) {
    case 'clear':
      b.disc(6, 6, 3.2, 3.2, sun); b.disc(5.4, 5.4, 1.6, 1.6, sunC);
      for (const [x, y] of [[6, 0], [6, 11], [0, 6], [11, 6], [2, 2], [9, 2], [2, 9], [9, 9]] as [number, number][]) b.set(x, y, rim);
      break;
    case 'cloudy': b.disc(8, 3.5, 2.4, 2.4, sun); cloud(false); break;
    case 'rain': cloud(true); for (const x of [3, 6, 9]) { b.set(x, 9, hex('#5c9ce0')); b.set(x - 1, 10, hex('#94c8ee')); } break;
    case 'storm':
      cloud(true);
      b.set(6, 8, sun); b.set(5, 9, sun); b.set(6, 9, sun); b.set(6, 10, sun); b.set(5, 11, sunC);
      b.set(3, 9, hex('#5c9ce0')); b.set(9, 9, hex('#5c9ce0'));
      break;
    case 'night':
      b.disc(6, 6, 4, 4, hex('#f2f4fa')); b.disc(8, 4.6, 3.4, 3.4, hex('#18204a'));
      b.px.forEach((v, i) => { if ((v & 0xffffff) === ((0x4a << 16) | (0x20 << 8) | 0x18)) b.px[i] = 0; });
      b.set(10, 9, hex('#fff4c0')); b.set(2, 2, hex('#cceaf8'));
      break;
    case 'snow': cloud(false); for (const [x, y] of [[3, 9], [6, 10], [9, 9], [4, 11], [8, 11]] as [number, number][]) b.set(x, y, hex('#ffffff')); break;
    default: // fog
      for (let y = 2; y < 11; y += 3) for (let x = 1; x < 11; x++) if ((x + y) % 5 !== 0) b.set(x, y, y === 5 ? cm : cl);
  }
  return b.outline(ink);
}
