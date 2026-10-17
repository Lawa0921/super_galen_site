// propArt.ts — 新方塊 / 物件的像素圖（純 Bmp，無 DOM）：泉水石 / 熔泉石 / 滲水石（瀑布）、
// 家具（木桌、木椅 ×2 朝向、燈柱、古畫 ×4、守望者戰利品 立座 / 牆上）與家具類道具圖示。
// textures.ts 的 texTile 找不到材質時會先問 extraTileBmp；裝飾物件問 extraDecorBmp。全部色票色、不透明。
import { Bmp, INK, h01, ramp, type RGB } from './pixel';
import type { ItemId } from '../engine/items';
import { T } from '../engine/tiles';
import { campfireBmp } from './fishArt';

const S = 16;
const STONE = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8');
const MOSS = ramp('#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c');
const WATER = ramp('#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#ffffff');
const BASALT = ramp('#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74');
const LAVA = ramp('#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');

/** 泉水石：濕潤的石塊、青苔、中央一道往外滲水的亮藍裂縫與水珠 */
function texSpring(v: number): Bmp {
  const b = new Bmp(S, S), seed = 2201 + v * 13;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x >> 1, y >> 1, seed);
    let c: RGB = n > 0.7 ? STONE[4] : n < 0.25 ? STONE[2] : STONE[3];
    // 濕的下半部偏藍
    if (y > 9 && ((x + y) & 1) === 0 && n > 0.4) c = WATER[1];
    b.set(x, y, c);
  }
  // 青苔：上緣一圈
  for (let x = 0; x < S; x++) {
    const d = 1 + Math.floor(h01(x, 1, seed) * 3);
    for (let y = 0; y < d; y++) b.set(x, y, MOSS[y === 0 ? 3 : 2 - (x & 1)]);
  }
  // 裂縫：從上往下的鋸齒線，中間是亮水
  let cx = 7 + (v % 2);
  for (let y = 3; y < 15; y++) {
    if (h01(y, 2, seed) > 0.6) cx += h01(y, 3, seed) > 0.5 ? 1 : -1;
    cx = Math.max(4, Math.min(11, cx));
    b.set(cx - 1, y, STONE[1]);
    b.set(cx, y, y % 3 === 0 ? WATER[5] : WATER[3]);
    b.set(cx + 1, y, WATER[2]);
  }
  // 水珠
  for (let k = 0; k < 3; k++) {
    const x = 2 + Math.floor(h01(k, 4, seed) * 12), y = 5 + Math.floor(h01(k, 5, seed) * 9);
    b.set(x, y, WATER[4]); b.set(x, y + 1, WATER[2]);
  }
  return b;
}

/** 熔泉石：玄武岩 + 發光的熔岩裂縫 */
function texLavaSpring(v: number): Bmp {
  const b = new Bmp(S, S), seed = 2231 + v * 17;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x >> 1, y >> 1, seed);
    b.set(x, y, n > 0.72 ? BASALT[3] : n < 0.3 ? BASALT[1] : BASALT[2]);
  }
  const veins: [number, number][] = [[8, 2], [5, 9], [11, 7]];
  for (const [vx, vy] of veins) {
    let x = vx + (v % 2), y = vy;
    for (let k = 0; k < 7; k++) {
      b.set(x, y, k < 2 ? LAVA[4] : LAVA[2]);
      b.set(x + 1, y, LAVA[1]);
      if (k === 1) b.set(x, y + 1, LAVA[5]);
      x += h01(k, vx, seed) > 0.5 ? 1 : -1; y += 1;
      if (y > 14 || x < 1 || x > 14) break;
    }
  }
  return b;
}

/** 滲水石：深藍灰的多孔石，一排排吸水小孔（看得出是「會吸水」的） */
function texDrain(v: number): Bmp {
  const b = new Bmp(S, S), seed = 2261 + v * 7;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = h01(x, y, seed);
    b.set(x, y, n > 0.75 ? STONE[3] : n < 0.3 ? WATER[0] : STONE[2]);
  }
  // 小孔：4×4 格點，錯排
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) {
    const x = gx * 4 + 1 + ((gy + v) & 1) * 2, y = gy * 4 + 1;
    if (x > 14) continue;
    b.set(x, y, STONE[0]); b.set(x + 1, y, STONE[0]);
    b.set(x, y + 1, WATER[1]); b.set(x + 1, y + 1, STONE[1]);
    b.set(x, y - 1, STONE[4]);
  }
  return b;
}

/** 新的實心方塊材質（沒有 → null） */
export function extraTileBmp(id: number, v: number): Bmp | null {
  switch (id) {
    case T.SPRING: return texSpring(v);
    case T.LAVA_SPRING: return texLavaSpring(v);
    case T.DRAIN: return texDrain(v);
    default: return null;
  }
}

/** 新方塊的外框色階（textures 的 frameTile 用） */
export const EXTRA_TILE_PAL: Record<number, RGB[]> = {
  [T.SPRING]: STONE, [T.LAVA_SPRING]: BASALT.concat([STONE[5], STONE[6]]), [T.DRAIN]: STONE,
};

// ── 家具 ───────────────────────────────────────────────
const WOOD = ramp('#2a1810', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660');
const GOLD = ramp('#472819', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0');
const IRON = ramp('#1c1424', '#2c2838', '#423f54', '#5e5e74', '#858aa0', '#b4b9c8');
const CYAN = ramp('#18204a', '#1f6474', '#2c8692', '#4aaeb0', '#cceaf8', '#ffffff');
const CANVAS = ramp('#472819', '#c99660', '#d8ba76', '#f2e2b0');
function outline(b: Bmp): Bmp {
  const o = new Bmp(b.w, b.h);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (b.on(x, y)) { o.setRaw(x, y, b.raw(x, y)); continue; }
    if (b.on(x - 1, y) || b.on(x + 1, y) || b.on(x, y - 1) || b.on(x, y + 1)) o.set(x, y, INK);
  }
  return o;
}
/** 木桌：桌面 + 兩支桌腳 + 橫撐（桌面頂在 y=7，上面可以放蠟燭 / 戰利品） */
function table(): Bmp {
  const b = new Bmp(S, S);
  for (let x = 0; x < 16; x++) { b.set(x, 7, x < 2 ? WOOD[5] : WOOD[4]); b.set(x, 8, WOOD[3]); b.set(x, 9, x % 5 === 0 ? WOOD[1] : WOOD[2]); }
  for (const lx of [2, 12]) for (let y = 10; y < 16; y++) { b.set(lx, y, WOOD[3]); b.set(lx + 1, y, WOOD[1]); }
  for (let x = 4; x < 12; x++) b.set(x, 12, WOOD[2]);
  const o = outline(b);
  return o;
}
/** 木椅（dir 1 = 面向右：椅背在左） */
function chair(dir: 1 | -1): Bmp {
  const b = new Bmp(S, S);
  const bx = dir > 0 ? 4 : 11;
  for (let y = 1; y < 16; y++) { b.set(bx, y, WOOD[4]); b.set(bx + (dir > 0 ? 1 : -1), y, y < 9 ? WOOD[2] : WOOD[3]); }
  for (let y = 2; y < 8; y += 2) for (let k = 0; k < 2; k++) b.set(bx + (dir > 0 ? 1 : -1) * (k + 1), y, WOOD[3]);
  // 座面
  const s0 = dir > 0 ? 4 : 5, s1 = dir > 0 ? 11 : 12;
  for (let x = s0; x <= s1; x++) { b.set(x, 9, WOOD[5]); b.set(x, 10, WOOD[3]); }
  const fx = dir > 0 ? 10 : 5;
  for (let y = 11; y < 16; y++) { b.set(fx, y, WOOD[3]); b.set(fx + 1, y, WOOD[1]); }
  return outline(b);
}
/** 燈柱：鐵柱 + 頂上的燈籠（暖光） */
function lampPost(): Bmp {
  const b = new Bmp(S, S);
  for (let y = 6; y < 16; y++) { b.set(7, y, IRON[4]); b.set(8, y, IRON[2]); }
  for (let x = 5; x < 11; x++) b.set(x, 15, IRON[3]);
  // 燈籠
  for (let y = 1; y < 6; y++) for (let x = 5; x < 11; x++) {
    const edge = x === 5 || x === 10 || y === 1 || y === 5;
    b.set(x, y, edge ? IRON[3] : y < 3 ? GOLD[5] : GOLD[4]);
  }
  b.set(7, 0, IRON[4]); b.set(8, 0, IRON[3]);
  b.set(6, 2, ramp('#ffffff')[0]);
  return outline(b);
}
/** 古畫：金框 + 四種畫（山景、海、肖像、夜空），透明背景只有畫框範圍 */
function painting(style: number): Bmp {
  const b = new Bmp(S, S);
  for (let y = 2; y < 14; y++) for (let x = 1; x < 15; x++) {
    const frame = x === 1 || x === 14 || y === 2 || y === 13;
    const inner = x === 2 || x === 13 || y === 3 || y === 12;
    if (frame) { b.set(x, y, (x + y) % 3 === 0 ? GOLD[4] : GOLD[3]); continue; }
    if (inner) { b.set(x, y, GOLD[1]); continue; }
    const u = x - 3, v = y - 4; // 0..9 × 0..7
    let c: RGB;
    switch (style % 4) {
      case 0: { // 山景：天空 + 雪山 + 綠丘
        const ridge = 5 - Math.abs(u - 4) * 0.9, hill = 6 - Math.abs(u - 7) * 0.4;
        c = v > hill ? ramp('#468a34')[0] : v > ridge ? (v < ridge + 1 ? ramp('#ffffff')[0] : ramp('#707490')[0]) : v < 2 ? ramp('#5c9ce0')[0] : ramp('#94c8ee')[0];
        break;
      }
      case 1: { // 海與帆船
        c = v > 4 ? ((u + v) % 3 === 0 ? ramp('#5c9ce0')[0] : ramp('#2c4486')[0]) : v === 4 ? ramp('#cceaf8')[0] : ramp('#f2b888')[0];
        if (u >= 4 && u <= 5 && v >= 1 && v <= 4) c = ramp('#ffffff')[0];
        if (v === 4 && u >= 3 && u <= 6) c = ramp('#7c4c2e')[0];
        if (u === 8 && v === 1) c = ramp('#ffd86a')[0];
        break;
      }
      case 2: { // 肖像：深色背景 + 人像
        c = ramp('#2c2450')[0];
        const dx = u - 4.5, dy = v - 2.5;
        if (dx * dx + dy * dy < 4) c = ramp('#f2b888')[0];
        if (v >= 5 && Math.abs(dx) < 3.5) c = ramp('#a83a10')[0];
        if (v <= 1 && Math.abs(dx) < 2.2) c = ramp('#472819')[0];
        break;
      }
      default: { // 星夜
        c = v < 6 ? ((u * 7 + v * 3) % 11 === 0 ? ramp('#fff4c0')[0] : v < 3 ? ramp('#18204a')[0] : ramp('#2c4486')[0]) : ramp('#16301e')[0];
        if (u === 7 && v === 1) c = ramp('#ffd86a')[0];
        break;
      }
    }
    b.set(x, y, c);
  }
  return outline(b);
}
/** 守望者戰利品：0 = 立座（放地上 / 桌上）、1 = 牆上的木牌 */
function trophy(style: number): Bmp {
  const b = new Bmp(S, S);
  if (style === 0) {
    // 底座
    for (let x = 3; x < 13; x++) { b.set(x, 15, WOOD[1]); b.set(x, 14, WOOD[3]); }
    for (let x = 5; x < 11; x++) b.set(x, 13, WOOD[4]);
    // 燈籠鐵籠（守望者的頭）
    for (let y = 3; y < 13; y++) for (let x = 4; x < 12; x++) {
      const bar = x === 4 || x === 11 || x === 7 || y === 3 || y === 12;
      b.set(x, y, bar ? (x < 6 ? IRON[5] : IRON[3]) : y < 8 ? CYAN[3] : CYAN[2]);
    }
    b.set(6, 5, CYAN[5]); b.set(9, 6, CYAN[4]);
    b.set(7, 1, GOLD[4]); b.set(8, 1, GOLD[4]); b.set(7, 2, GOLD[3]); b.set(8, 2, GOLD[2]);
    return outline(b);
  }
  // 牆上：盾形木牌 + 燈籠頭
  for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) {
    const half = y < 11 ? 6.5 : 6.5 - (y - 10) * 1.5;
    if (Math.abs(x - 7.5) > half) continue;
    b.set(x, y, Math.abs(x - 7.5) > half - 1 ? GOLD[3] : y < 3 ? WOOD[4] : WOOD[3]);
  }
  for (let y = 4; y < 11; y++) for (let x = 5; x < 11; x++) {
    const bar = x === 5 || x === 10 || y === 4 || y === 10;
    b.set(x, y, bar ? IRON[4] : CYAN[3]);
  }
  b.set(7, 6, CYAN[5]); b.set(8, 7, CYAN[4]);
  return outline(b);
}

/** 新的裝飾物件點陣（沒有 → null） */
export function extraDecorBmp(id: number, style: number): Bmp | null {
  switch (id) {
    case T.CAMPFIRE: return campfireBmp(style % 3);
    case T.TABLE: return table();
    case T.CHAIR: return chair(style % 2 === 0 ? 1 : -1);
    case T.LANTERN_POST: return lampPost();
    case T.PAINTING: return painting(style);
    case T.TROPHY: return trophy(style % 2);
    default: return null;
  }
}

/** 家具類道具的圖示（不是 → null）；decor = 既有裝飾的點陣（書架 / 旗幟 / 蠟燭） */
export function furnitureIcon(item: ItemId, decor: (id: number, style: number) => Bmp): Bmp | null {
  switch (item) {
    case 'table': return table();
    case 'chair': return chair(1);
    case 'lantern_post': return lampPost();
    case 'painting': return painting(0);
    case 'bookshelf': return decor(T.BOOKSHELF, 0);
    case 'banner': return decor(T.BANNER, 0);
    case 'candle': return decor(T.CANDLE, 0);
    case 'plank_wall': {
      const b = new Bmp(S, S);
      for (let y = 1; y < 15; y++) for (let x = 1; x < 15; x++) b.set(x, y, (y - 1) % 4 === 3 ? WOOD[0] : x === 1 || (y - 1) % 4 === 0 ? WOOD[2] : WOOD[1]);
      return outline(b);
    }
    default: return null;
  }
}
export const FURNITURE_ICONS: readonly ItemId[] = ['table', 'chair', 'lantern_post', 'painting', 'bookshelf', 'banner', 'candle', 'plank_wall'];
