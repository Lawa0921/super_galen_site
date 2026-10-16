// textures.ts — 程式產生的像素材質圖集（一次產生）。每個 tile 3 個變體（world.variant），
// 另含背景牆、道具圖示（鎬、木材）、挖掘裂痕 4 階段。
import { T, TILES, WALLS } from '../engine/tiles';
import type { ItemId } from '../engine/items';
import { ITEMS } from '../engine/items';
import { TILE_SIZE } from '../engine/constants';

const S = TILE_SIZE;
export const VARIANTS = 3;
const WALL_ROW0 = TILES.length;            // 牆列起點
const ICON_ROW = WALL_ROW0 + WALLS.length; // 道具圖示列
const CRACK_ROW = ICON_ROW + 1;            // 裂痕列
const ROWS = CRACK_ROW + 1;
const COLS = 4;

type RGB = [number, number, number];

function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}
/** 座標雜湊 → 0..1 */
function h01(x: number, y: number, s: number): number {
  let h = Math.imul(x + 374761393 * s, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 3266489917);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

class Px {
  readonly img: ImageData;
  constructor(readonly w = S, readonly h = S) { this.img = new ImageData(w, h); }
  set(x: number, y: number, c: RGB, a = 255): void {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4, d = this.img.data;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
  }
  get(x: number, y: number): RGB {
    const i = (y * this.w + x) * 4, d = this.img.data;
    return [d[i], d[i + 1], d[i + 2]];
  }
  alpha(x: number, y: number): number { return this.img.data[(y * this.w + x) * 4 + 3]; }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
}

/** 基礎雜訊上色：2×2 塊狀 + 單像素細噪，像素風。 */
function noiseFill(p: Px, base: RGB, seed: number, amp = 0.12): void {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const blk = h01(x >> 1, y >> 1, seed) - 0.5;
      const fine = h01(x, y, seed + 7) - 0.5;
      p.set(x, y, shade(base, 1 + blk * amp * 1.6 + fine * amp * 0.6));
    }
  }
}
function specks(p: Px, seed: number, n: number, c: RGB, size = 1): void {
  for (let k = 0; k < n; k++) {
    const x = Math.floor(h01(k, 1, seed) * (S - size)), y = Math.floor(h01(k, 2, seed) * (S - size));
    p.rect(x, y, size, size, c);
  }
}

function paintTile(id: number, v: number): Px {
  const p = new Px();
  const def = TILES[id];
  const base = hex(def.color);
  const seed = id * 31 + v * 7 + 1;
  switch (id) {
    case T.AIR: break;
    case T.DIRT:
      noiseFill(p, base, seed, 0.14);
      specks(p, seed + 3, 4, shade(base, 0.7), 2);
      specks(p, seed + 5, 3, shade(base, 1.18), 1);
      break;
    case T.GRASS: {
      noiseFill(p, hex(TILES[T.DIRT].color), seed, 0.14);
      specks(p, seed + 3, 3, shade(hex(TILES[T.DIRT].color), 0.7), 2);
      for (let x = 0; x < S; x++) {
        const depth = 3 + Math.floor(h01(x, v, seed) * 3);
        for (let y = 0; y < depth; y++) {
          const k = y === 0 ? 1.22 : y === depth - 1 ? 0.78 : 1 + (h01(x, y, seed + 9) - 0.5) * 0.18;
          p.set(x, y, shade(base, k));
        }
      }
      break;
    }
    case T.STONE: {
      noiseFill(p, base, seed, 0.1);
      // 裂縫與高光
      const cy = 4 + Math.floor(h01(v, 0, seed) * 8);
      for (let x = 2; x < 12; x++) p.set(x, cy + ((x >> 2) % 2), shade(base, 0.72));
      specks(p, seed + 4, 4, shade(base, 1.2), 1);
      specks(p, seed + 6, 2, shade(base, 0.8), 2);
      break;
    }
    case T.SAND:
      noiseFill(p, base, seed, 0.06);
      specks(p, seed + 2, 8, shade(base, 0.86), 1);
      specks(p, seed + 3, 5, shade(base, 1.1), 1);
      break;
    case T.WOOD: {
      // 樹幹：中央 10px，縱向樹皮紋
      for (let y = 0; y < S; y++) {
        for (let x = 3; x < 13; x++) {
          const stripe = (x + (v === 1 ? 1 : 0)) % 3 === 0 ? 0.74 : 1;
          const edge = x === 3 || x === 12 ? 0.68 : 1;
          p.set(x, y, shade(base, stripe * edge * (1 + (h01(x, y, seed) - 0.5) * 0.12)));
        }
      }
      if (v === 2) { p.rect(6, 6, 3, 3, shade(base, 0.6)); p.set(7, 7, shade(base, 0.9)); }
      break;
    }
    case T.LEAVES: {
      // 茂密葉叢：底色雜訊 + 亮暗葉團，邊角少量鏤空
      noiseFill(p, shade(base, 0.92), seed, 0.18);
      for (let k = 0; k < 6; k++) {
        const cx = 1 + Math.floor(h01(k, 3, seed) * 14), cy = 1 + Math.floor(h01(k, 4, seed) * 14);
        const light = h01(k, 5, seed) > 0.45;
        const c = light ? shade(base, 1.22) : shade(base, 0.7);
        p.rect(cx - 1, cy - 1, 3, 2, c);
        p.set(cx, cy + 1, light ? shade(base, 1.4) : shade(base, 0.6));
      }
      for (let k = 0; k < 10; k++) {
        const e = Math.floor(h01(k, 6, seed) * 4), t = Math.floor(h01(k, 7, seed) * S);
        const [x, y] = e === 0 ? [t, 0] : e === 1 ? [t, S - 1] : e === 2 ? [0, t] : [S - 1, t];
        p.set(x, y, [0, 0, 0], 0);
      }
      break;
    }
    case T.PLANKS: {
      for (let y = 0; y < S; y++) {
        const board = y >> 2;
        const tone = 1 + (h01(board, v, seed) - 0.5) * 0.16;
        for (let x = 0; x < S; x++) {
          let k = tone * (1 + (h01(x >> 2, y, seed + 2) - 0.5) * 0.08);
          if (y % 4 === 3) k = 0.62;
          const seam = (board % 2 === 0 ? 5 : 11) + v;
          if (x === seam % S && y % 4 !== 3) k = 0.7;
          p.set(x, y, shade(base, k));
        }
      }
      break;
    }
    case T.COPPER_ORE:
    case T.IRON_ORE: {
      const stone = hex(TILES[T.STONE].color);
      noiseFill(p, stone, seed, 0.1);
      const n = 4 + v;
      for (let k = 0; k < n; k++) {
        const x = 1 + Math.floor(h01(k, 7, seed) * 12), y = 1 + Math.floor(h01(k, 8, seed) * 12);
        p.rect(x, y, 2, 2, base);
        p.set(x, y, shade(base, 1.3));
        p.set(x + 1, y + 1, shade(base, 0.7));
        if (h01(k, 9, seed) > 0.5) p.set(x + 2, y + 1, shade(base, 0.9));
      }
      break;
    }
    case T.TORCH: {
      const stick: RGB = [110, 72, 40];
      p.rect(7, 8, 2, 8, stick);
      p.set(7, 8, shade(stick, 1.3));
      const outer: RGB = [230, 110, 30], mid: RGB = [255, 190, 60], core: RGB = [255, 248, 210];
      p.rect(6, 4, 4, 4, outer);
      p.rect(7, 2 + (v === 1 ? 1 : 0), 2, 2, outer);
      p.rect(7, 4, 2, 3, mid);
      p.set(7, 5, core); p.set(8, 6, core);
      break;
    }
    case T.WORKBENCH: {
      p.rect(0, 6, 16, 3, base);
      p.rect(0, 6, 16, 1, shade(base, 1.25));
      p.rect(0, 8, 16, 1, shade(base, 0.7));
      p.rect(1, 9, 2, 7, shade(base, 0.8));
      p.rect(13, 9, 2, 7, shade(base, 0.8));
      p.rect(3, 12, 10, 1, shade(base, 0.7));
      // 檯面上的小鋸子
      p.rect(9, 4, 5, 2, [170, 170, 178]);
      p.rect(8, 4, 1, 2, [90, 60, 30]);
      break;
    }
    default:
      noiseFill(p, base, seed, 0.1);
  }
  return p;
}

function paintWall(id: number, v: number): Px {
  const p = new Px();
  if (id === 0) return p;
  const base = shade(hex(WALLS[id].color), 0.95);
  noiseFill(p, base, 900 + id * 13 + v, 0.16);
  if (id === 2) {
    // 石牆：粗略磚縫
    for (let x = 0; x < S; x++) { p.set(x, 7, shade(base, 0.7)); p.set(x, 15, shade(base, 0.7)); }
    for (let y = 0; y < 7; y++) p.set((5 + v * 3) % S, y, shade(base, 0.7));
    for (let y = 8; y < 15; y++) p.set((12 + v * 3) % S, y, shade(base, 0.7));
  } else {
    specks(p, 950 + v, 5, shade(base, 0.7), 2);
  }
  return p;
}

function paintPick(head: RGB): Px {
  const p = new Px();
  const handle: RGB = [120, 80, 44];
  for (let i = 0; i < 11; i++) p.set(3 + i, 14 - i, i % 3 === 0 ? shade(handle, 0.8) : handle); // 斜柄
  for (let i = 0; i < 11; i++) p.set(4 + i, 13 - i, shade(handle, 0.7));
  // 鎬頭：弧形
  const pts: [number, number][] = [[4, 2], [5, 2], [6, 2], [7, 2], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7], [13, 8], [13, 9], [13, 10]];
  for (const [x, y] of pts) { p.set(x, y, head); p.set(x, y + 1, shade(head, 0.75)); }
  p.set(4, 2, shade(head, 1.3)); p.set(13, 10, shade(head, 1.3));
  return p;
}

function paintLog(): Px {
  const p = new Px();
  const bark = hex(TILES[T.WOOD].color), inner: RGB = [214, 168, 110];
  p.rect(2, 4, 12, 8, bark);
  for (let x = 2; x < 14; x += 3) p.rect(x, 4, 1, 8, shade(bark, 0.75));
  p.rect(11, 4, 4, 8, inner);
  p.rect(12, 6, 2, 4, shade(inner, 0.8));
  p.rect(2, 4, 12, 1, shade(bark, 1.2));
  return p;
}

function paintCrack(stage: number): Px {
  const p = new Px();
  const c: RGB = [20, 14, 10];
  const lines: [number, number, number, number][] = [
    [8, 8, 3, 3], [8, 8, 13, 5], [8, 8, 5, 13], [8, 8, 12, 12],
    [3, 3, 1, 7], [13, 5, 15, 2], [5, 13, 2, 15], [12, 12, 15, 14],
  ];
  const n = 2 + stage * 2;
  for (let k = 0; k < n && k < lines.length; k++) {
    const [x0, y0, x1, y1] = lines[k];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= steps; i++) {
      p.set(Math.round(x0 + ((x1 - x0) * i) / steps), Math.round(y0 + ((y1 - y0) * i) / steps), c, 200);
    }
  }
  return p;
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  /** 前景 tile (id, variant) 的圖集左上角 */
  tile(id: number, variant: number): { sx: number; sy: number };
  wall(id: number, variant: number): { sx: number; sy: number };
  crack(stage: number): { sx: number; sy: number };
  /** 道具圖示來源（方塊用 tile 變體 0） */
  icon(item: ItemId): { sx: number; sy: number };
  /** 平均色（粒子用） */
  tileColor(id: number): string;
}

export function buildAtlas(): Atlas {
  const canvas = document.createElement('canvas');
  canvas.width = COLS * S;
  canvas.height = ROWS * S;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d context unavailable');
  const put = (p: Px, col: number, row: number): void => ctx.putImageData(p.img, col * S, row * S);
  for (const t of TILES) for (let v = 0; v < VARIANTS; v++) put(paintTile(t.id, v), v, t.id);
  for (const w of WALLS) for (let v = 0; v < VARIANTS; v++) put(paintWall(w.id, v), v, WALL_ROW0 + w.id);
  put(paintPick([176, 140, 92]), 0, ICON_ROW);
  put(paintPick([214, 124, 64]), 1, ICON_ROW);
  put(paintPick([196, 200, 210]), 2, ICON_ROW);
  put(paintLog(), 3, ICON_ROW);
  for (let s = 0; s < 4; s++) put(paintCrack(s), s, CRACK_ROW);

  const ICONS: Partial<Record<ItemId, [number, number]>> = {
    wood_pickaxe: [0, ICON_ROW], copper_pickaxe: [1, ICON_ROW], iron_pickaxe: [2, ICON_ROW], wood: [3, ICON_ROW],
  };
  const colors = TILES.map((t) => t.color);
  return {
    canvas,
    tile: (id, v) => ({ sx: (v % VARIANTS) * S, sy: id * S }),
    wall: (id, v) => ({ sx: (v % VARIANTS) * S, sy: (WALL_ROW0 + id) * S }),
    crack: (s) => ({ sx: Math.max(0, Math.min(3, s)) * S, sy: CRACK_ROW * S }),
    icon: (item) => {
      const fixed = ICONS[item];
      if (fixed) return { sx: fixed[0] * S, sy: fixed[1] * S };
      const place = ITEMS[item].place ?? T.DIRT;
      return { sx: 0, sy: place * S };
    },
    tileColor: (id) => colors[id] ?? '#888888',
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

export { mix, hex, shade };
