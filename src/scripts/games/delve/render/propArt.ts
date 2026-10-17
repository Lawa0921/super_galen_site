// propArt.ts — 新方塊 / 物件的像素圖（純 Bmp，無 DOM）：泉水石 / 熔泉石 / 滲水石（瀑布）。
// textures.ts 的 texTile 找不到材質時會先問 extraTileBmp；裝飾物件問 extraDecorBmp。全部色票色、不透明。
import { Bmp, h01, ramp, type RGB } from './pixel';
import { T } from '../engine/tiles';

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

/** 新的裝飾物件點陣（沒有 → null） */
export function extraDecorBmp(id: number, style: number): Bmp | null {
  void id; void style;
  return null;
}
