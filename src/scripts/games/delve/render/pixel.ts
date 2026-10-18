// pixel.ts — 像素美術的共用工具（純資料，無 DOM 依賴；toCanvas 除外）：
// RGB 色票、色階、座標雜湊、RGBA 點陣 Bmp（畫點/矩形/圓/線/自動描邊/鏡像），以及 RotSprite 風格的
// 最近鄰旋轉（scale2x ×3 → 旋轉取樣 → 縮回），讓旋轉後的像素圖仍保持單像素筆觸、不糊。

export type RGB = [number, number, number];

export function hex(c: string): RGB {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function shade(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}
export function mix(a: RGB, b: RGB, t: number): RGB {
  return [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;
}
export function css(c: RGB, a = 1): string {
  return a >= 1 ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}
/** 色階：由暗到亮的 hex 陣列 */
export function ramp(...cs: string[]): RGB[] { return cs.map(hex); }

/** 座標雜湊 → 0..1 */
export function h01(x: number, y: number, s: number): number {
  let h = Math.imul(x + 374761393 * s, 668265263) ^ Math.imul(y + 1442695041, 2246822519);
  h = Math.imul(h ^ (h >>> 15), 3266489917);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

/** 4×4 Bayer 門檻 0..1 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number { return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }

/** 全域描邊色（帶紫的近黑） */
export const INK: RGB = hex('#1c1424');

// ── 統一色票（57 色）：所有 tile / 精靈 / 背景 / 天空最後都吸附到這裡 ──────────
export const PALETTE_HEX = [
  // 冷灰（描邊、石頭、金屬、雲影）
  '#0c0a12', '#1c1424', '#2c2838', '#423f54', '#5e5e74', '#707490', '#858aa0', '#b4b9c8', '#ffffff',
  // 棕（土、木、樹皮、靴、頭髮）
  '#2a1810', '#472819', '#623924', '#7c4c2e', '#966139', '#b07a4b', '#c99660',
  // 沙
  '#d8ba76', '#f2e2b0',
  // 草綠
  '#16301e', '#214528', '#2d672e', '#468a34', '#67ab3c', '#93cc50', '#c2e478',
  // 霧綠（遠景、深色樹）
  '#3f7468', '#6a9c88', '#a2c8b0',
  // 青（上衣）
  '#1f6474', '#2c8692', '#4aaeb0',
  // 天空
  '#18204a', '#2c4486', '#3e74c4', '#5c9ce0', '#94c8ee', '#cceaf8', '#7f9cc4',
  // 靛 / 紫（夜、黃昏、褲子）
  '#2c2450', '#463c78', '#7a5a8c', '#b8788e',
  // 紫（史詩裝備：外框 / 名稱 / 光柱）
  '#9a6ee0',
  // 暖（火、銅、日）
  '#6c1e14', '#a83a10', '#e8701c', '#ffa93a', '#ffd86a', '#fff4c0',
  // 膚
  '#d98f66', '#f2b888',
  // 角色外觀（日系配色）：櫻粉 / 淡粉（髮色、腮紅）、緋紅 / 深緋（髮色、緋袴、領巾）、白皙膚色、淡紫（紫藤髮的亮部）
  '#e890b0', '#ffc8dc', '#c8344c', '#8c2038', '#ffe2cc', '#c4a0f0',
] as const;
export const PALETTE: RGB[] = PALETTE_HEX.map(hex);

export function luma(c: RGB): number { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }
/** redmean 加權距離平方（比純 RGB 更接近人眼） */
function dist2(a: RGB, b: RGB): number {
  const rm = (a[0] + b[0]) / 2, dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}
const SNAP_CACHE = new Map<number, RGB>();
const PAL_SET = new Set(PALETTE.map((c) => (c[0] << 16) | (c[1] << 8) | c[2]));
export function inPalette(c: RGB): boolean { return PAL_SET.has((c[0] << 16) | (c[1] << 8) | c[2]); }
/** 最近的色票色 */
export function snap(c: RGB): RGB {
  const key = (c[0] << 16) | (c[1] << 8) | c[2];
  let r = SNAP_CACHE.get(key);
  if (!r) {
    let best = PALETTE[0], bd = Infinity;
    for (const p of PALETTE) { const d = dist2(c, p); if (d < bd) { bd = d; best = p; } }
    r = best;
    SNAP_CACHE.set(key, r);
  }
  return r;
}
/**
 * 色票上往暗（dir<0）或往亮（dir>0）的最近一階：優先挑亮度差 ≥ NUDGE_MIN 的顏色（避免挑到只是換色相的灰），
 * 沒有就退而求其次；完全沒有更暗 / 更亮就回傳自己。
 */
const NUDGE_MIN = 15;
export function nudge(c: RGB, dir: number): RGB {
  const s = snap(c), ls = luma(s);
  const pick = (minStep: number): RGB | null => {
    let best: RGB | null = null, bd = Infinity;
    for (const p of PALETTE) {
      const step = (luma(p) - ls) * (dir < 0 ? -1 : 1);
      if (step <= 0 || step < minStep) continue;
      const d = dist2(s, p);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  return pick(NUDGE_MIN) ?? pick(0) ?? s;
}
/** 把點陣吸附到色票：不透明像素換成最近色，任何 alpha>0 一律變成完全不透明 */
export function snapBmp(b: Bmp): Bmp {
  const px = b.px;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    if (!(v >>> 24)) { px[i] = 0; continue; }
    px[i] = Bmp.pack(snap(Bmp.unpack(v)));
  }
  return b;
}

/** RGBA 點陣（每像素一個 uint32，0 = 透明）。 */
export class Bmp {
  readonly px: Uint32Array;
  constructor(readonly w: number, readonly h: number) { this.px = new Uint32Array(w * h); }
  static pack(c: RGB, a = 255): number { return ((a << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0; }
  static unpack(v: number): RGB { return [v & 255, (v >>> 8) & 255, (v >>> 16) & 255]; }
  in(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  set(x: number, y: number, c: RGB, a = 255): void {
    x |= 0; y |= 0;
    if (this.in(x, y)) this.px[y * this.w + x] = Bmp.pack(c, a);
  }
  raw(x: number, y: number): number { return this.in(x, y) ? this.px[y * this.w + x] : 0; }
  setRaw(x: number, y: number, v: number): void { if (this.in(x, y)) this.px[y * this.w + x] = v; }
  get(x: number, y: number): RGB { return Bmp.unpack(this.raw(x, y)); }
  alpha(x: number, y: number): number { return this.raw(x, y) >>> 24; }
  on(x: number, y: number): boolean { return this.alpha(x, y) > 0; }
  clear(x: number, y: number): void { if (this.in(x, y)) this.px[y * this.w + x] = 0; }
  rect(x: number, y: number, w: number, h: number, c: RGB, a = 255): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, c, a);
  }
  /** 實心橢圓（像素中心判定） */
  disc(cx: number, cy: number, rx: number, ry: number, c: RGB): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
  }
  /** Bresenham 線 */
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** 用字元格繪製：pal 把字元對應到顏色，'.' / 空白 = 跳過 */
  grid(rows: readonly string[], pal: Record<string, RGB>, ox = 0, oy = 0, flip = false): void {
    for (let y = 0; y < rows.length; y++) {
      const r = rows[y];
      for (let x = 0; x < r.length; x++) {
        const ch = r[x];
        if (ch === '.' || ch === ' ') continue;
        const c = pal[ch];
        if (c) this.set(ox + (flip ? r.length - 1 - x : x), oy + y, c);
      }
    }
  }
  /** 外描邊：與不透明像素 4 鄰相接的透明像素填 color（或以鄰色壓暗的 sel-out） */
  outline(color: RGB | null = INK, selOut = 0): Bmp {
    const src = this.px.slice();
    const at = (x: number, y: number): number => (x >= 0 && y >= 0 && x < this.w && y < this.h ? src[y * this.w + x] : 0);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (at(x, y) !== 0) continue;
        const n = at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1);
        if (!n) continue;
        const c = color ?? shade(Bmp.unpack(n), 0.45);
        this.set(x, y, selOut > 0 ? mix(c, shade(Bmp.unpack(n), 0.5), selOut) : c);
      }
    }
    return this;
  }
  /** 把 o 疊上來（o 的不透明像素覆蓋） */
  blit(o: Bmp, dx: number, dy: number, flip = false): void {
    for (let y = 0; y < o.h; y++) {
      for (let x = 0; x < o.w; x++) {
        const v = o.px[y * o.w + x];
        if (v >>> 24) this.setRaw(dx + (flip ? o.w - 1 - x : x), dy + y, v);
      }
    }
  }
  clone(): Bmp { const b = new Bmp(this.w, this.h); b.px.set(this.px); return b; }
  /** 每個不透明像素套用 f */
  map(f: (c: RGB, x: number, y: number) => RGB): void {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = this.px[y * this.w + x];
        if (v >>> 24) this.px[y * this.w + x] = Bmp.pack(f(Bmp.unpack(v), x, y), v >>> 24);
      }
    }
  }
}

/** scale2x（EPX）：保持像素圖輪廓的 2 倍放大 */
export function scale2x(b: Bmp): Bmp {
  const o = new Bmp(b.w * 2, b.h * 2);
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const P = b.raw(x, y), A = b.raw(x, y - 1), B = b.raw(x + 1, y), C = b.raw(x - 1, y), D = b.raw(x, y + 1);
      let e0 = P, e1 = P, e2 = P, e3 = P;
      if (C === A && C !== D && A !== B) e0 = A;
      if (A === B && A !== C && B !== D) e1 = B;
      if (D === C && D !== B && C !== A) e2 = C;
      if (B === D && B !== A && D !== C) e3 = D;
      const ox = x * 2, oy = y * 2;
      o.setRaw(ox, oy, e0); o.setRaw(ox + 1, oy, e1); o.setRaw(ox, oy + 1, e2); o.setRaw(ox + 1, oy + 1, e3);
    }
  }
  return o;
}

/** RotSprite 風格旋轉的預處理（8 倍放大），可重複用於多個角度 */
export function rotPrep(b: Bmp): Bmp { return scale2x(scale2x(scale2x(b))); }

/**
 * 以 (px,py)（原圖座標）為軸旋轉 rad（畫布座標系，順時針為正），輸出 size×size、軸心在 (size/2,size/2)。
 * big = rotPrep(原圖)。
 */
export function rotate(big: Bmp, px: number, py: number, rad: number, size: number): Bmp {
  const o = new Bmp(size, size);
  const cos = Math.cos(rad), sin = Math.sin(rad), K = 8, half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half, dy = y + 0.5 - half;
      // 反旋轉回原圖座標
      const sx = (dx * cos + dy * sin + px) * K, sy = (-dx * sin + dy * cos + py) * K;
      const v = big.raw(Math.floor(sx), Math.floor(sy));
      if (v >>> 24) o.setRaw(x, y, v);
    }
  }
  return o;
}

/** Bmp → canvas（瀏覽器端）。預設先吸附到統一色票（raw = true 則原樣輸出，例如加色光暈）。 */
export function toCanvas(b: Bmp, into?: { ctx: CanvasRenderingContext2D; x: number; y: number } | null, raw = false): HTMLCanvasElement | null {
  if (!raw) b = snapBmp(b.clone());
  const bytes = new Uint8ClampedArray(b.w * b.h * 4);
  bytes.set(new Uint8Array(b.px.buffer, b.px.byteOffset, b.px.byteLength));
  const img = new ImageData(bytes, b.w, b.h);
  if (into) { into.ctx.putImageData(img, into.x, into.y); return null; }
  const c = document.createElement('canvas');
  c.width = b.w; c.height = b.h;
  const ctx = c.getContext('2d');
  if (ctx) ctx.putImageData(img, 0, 0);
  return c;
}
