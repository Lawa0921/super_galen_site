// background.ts — 分層視差背景（全部以原生像素烘焙，繪製時整數倍放大）：
//   天空（時段漸層 + 抖動色帶）→ 星星 → 日 / 月 → 飄雲 → 遠山 / 中丘 / 近林剪影（依時段重新上色）
//   生態區交界：每層依鏡頭位置連續混合（bgBlend），以一道 1×1 Bayer 抖動帶的垂直分界抹過，遠層換得慢、近層快；天色也依區傾向。
//   以及地下背景（依深度 / 生態區換主題、兩層視差洞壁、抖動過渡，見 underground.ts）。
import { Bmp, bayer, h01, hex, mix, nudge, snap, toCanvas, type RGB } from './pixel';
import { BAND_SLICES, BiomeField, LAYER_HALF, SKY_HALF, WIPE_BAND, WIPE_LEVELS, levelMask, wipeFront } from './bgBlend';
import { snapPx } from './lowres';
import { dayness as dayAmount, skyColors, type SkyColors } from './scene';
import { bgSeasonDark, bgSeasonDay, bgSeasonLite } from './seasonLook';
import { boltBmp, moonPhaseBmp } from './seasonArt';
import type { Season } from '../engine/calendar';
import { UG_KEEPS, smoothTops, ugAreas, ugColumnBands, ugThemeBmp, type UgArea, type UgBand, type UgLayer } from './underground';

const STRIP_W = 640;

/** 各階遮罩的 4×4 位元（Bayer 門檻 < 該階覆蓋率） */
const LEVEL_BITS: Uint8Array[] = [];
function levelMaskBits(l: number): Uint8Array {
  return (LEVEL_BITS[l] ??= Uint8Array.from(levelMask(l, 4, 4).px, (v) => (v ? 1 : 0)));
}
/**
 * 剪影下方的填色不是一片平的：往下 DEEP_H px 依色票一階一階變暗（1×1 Bayer 過渡）到 DEEP_END，
 * 這樣挖開的豎井 / 湖底看到的遠景會沉進黑暗，接上洞穴背景時不會是「亮綠色 → 黑」的粗網點。
 */
const DEEP_H = 96;
const DEEP_END: RGB = hex('#0c0a12');
/** 抖動版圖集裡，每份圖層下面接著幾列「填色」的抖動版（= 漸暗段；再往下兩區都是 DEEP_END，不用混） */
const FILL_ROWS = DEEP_H;
/** 填色的漸暗色（第 y 列、x 欄；圖層座標）：c0 → c1 → c2 → DEEP_END，各段之間 8 列 Bayer 過渡 */
function deepRamp(base: RGB): RGB[] {
  const c1 = nudge(base, -1), c2 = nudge(c1, -1);
  return [base, c1, c2, DEEP_END];
}
const DEEP_STOPS = [0, 20, 44, 68];
function deepColor(ramp: RGB[], x: number, y: number): RGB {
  let k = 0;
  while (k + 1 < DEEP_STOPS.length && y >= DEEP_STOPS[k + 1]) k++;
  const into = y - DEEP_STOPS[k], next = DEEP_STOPS[k + 1];
  // 每段最後 12 列漸漸換成下一階
  if (next !== undefined && into >= next - DEEP_STOPS[k] - 12) {
    const t = (into - (next - DEEP_STOPS[k] - 12) + 0.5) / 12;
    if (bayer(x, y) < t) return ramp[k + 1];
  }
  return ramp[k];
}
/** 漸暗填色的寬畫布（DEEP_GRAD_W × DEEP_H，用到才建；依基色快取） */
const DEEP_GRAD_W = 1024;
const DEEP_GRADS = new Map<string, HTMLCanvasElement>();
function deepGrad(base: RGB): HTMLCanvasElement {
  const key = base.join();
  let c = DEEP_GRADS.get(key);
  if (!c) {
    const ramp = deepRamp(base), b = new Bmp(DEEP_GRAD_W, DEEP_H);
    for (let y = 0; y < DEEP_H; y++) for (let x = 0; x < DEEP_GRAD_W; x++) b.set(x, y, deepColor(ramp, x, y));
    c = toCanvas(b) as HTMLCanvasElement;
    if (DEEP_GRADS.size > 24) DEEP_GRADS.clear();
    DEEP_GRADS.set(key, c);
  }
  return c;
}
/** 漸暗段裡的 Bayer 過渡列（[起, 迄)）；其餘是平色，用 fillRect（比整片貼圖便宜） */
const DEEP_MIX: [number, number][] = DEEP_STOPS.slice(1).map((y) => [y - 12, y]);
/** 在 [x0, x1) × [bottomY, Hh) 畫漸暗填色；off = 圖層的水平偏移（抖動跟著圖層捲動） */
function deepFill(ctx: CanvasRenderingContext2D, base: RGB, x0: number, x1: number, bottomY: number, Hh: number, off: number): void {
  if (bottomY >= Hh || x1 <= x0) return;
  const ramp = deepRamp(base);
  // 平色段：c0 [0, 8)、c1 [20, 32)、c2 [44, 56)、DEEP_END [68, ∞)
  let y = 0;
  for (let k = 0; k < ramp.length; k++) {
    const end = k < DEEP_MIX.length ? DEEP_MIX[k][0] : Infinity;
    const a = Math.max(0, bottomY + y), b = Math.min(Hh, bottomY + end);
    if (b > a) { ctx.fillStyle = `rgb(${ramp[k].join(',')})`; ctx.fillRect(x0, a, x1 - x0, b - a); }
    if (k < DEEP_MIX.length) y = DEEP_MIX[k][1];
  }
  const g = deepGrad(base), ph = (((x0 - off) % 4) + 4) % 4;
  for (const [m0, m1] of DEEP_MIX) {
    const a = Math.max(m0, -bottomY), b = Math.min(m1, Hh - bottomY);
    if (b <= a) continue;
    for (let x = x0; x < x1; x += DEEP_GRAD_W - 4) {
      const w = Math.min(DEEP_GRAD_W - 4, x1 - x);
      ctx.drawImage(g, ph, a, w, b - a, x, bottomY + a, w, b - a);
    }
  }
}
/** 抖動版圖集只留最近用到的幾張（每張數 MB） */
const LV_KEEP = 4;
const LV_LRU: { release(): void }[] = [];

/** 以索引圖存的剪影層：重新上色只要重填 ImageData */
class IndexedLayer {
  readonly idx: Uint8Array;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;
  private key = '';
  private tops: Int16Array | null = null;
  /** 分界帶用的抖動版（WIPE_LEVELS 階，用到才烘；色票換了重烘） */
  private lv = document.createElement('canvas');
  private lvKey = '';
  /** 剪影下方填色（= 色票索引 1） */
  private fill: RGB = [0, 0, 0];
  /** 最前面的近景層：剪影下方填色往下漸暗（豎井 / 湖底看得到的就是它）；遠 / 中層填色多半被前一層蓋住，用平色省一次大圖貼 */
  deep = false;
  release(): void { this.lv.width = 0; this.lv.height = 0; this.lvKey = ''; }
  constructor(readonly w: number, readonly h: number) {
    this.idx = new Uint8Array(w * h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }
  /** 每欄第一個不透明像素的列（整欄透明 = h）；剪影建好後不變，算一次快取 */
  topRow(x: number): number {
    if (!this.tops) {
      const t = new Int16Array(this.w).fill(this.h);
      for (let xx = 0; xx < this.w; xx++) for (let y = 0; y < this.h; y++) if (this.idx[y * this.w + xx]) { t[xx] = y; break; }
      this.tops = t;
    }
    return this.tops[((x % this.w) + this.w) % this.w];
  }
  /**
   * 各階抖動版的圖集（同一張畫布、往下疊 WIPE_LEVELS 份：第 l 份 = 圖層像素依 1×1 Bayer（圖層座標）挖空）。
   * 色票換了之後第一次用到才重烘；同一張來源畫布 → 分界帶的幾次 drawImage 可以合批。
   */
  levels(): HTMLCanvasElement {
    if (this.lvKey !== this.key && this.img) {
      this.lvKey = this.key;
      const at = LV_LRU.indexOf(this);
      if (at >= 0) LV_LRU.splice(at, 1);
      LV_LRU.push(this);
      while (LV_LRU.length > LV_KEEP) LV_LRU.shift()?.release();
      const src = new Uint32Array(this.img.data.buffer), W = this.w, H = this.h, R = H + FILL_ROWS;
      const ramp = deepRamp(this.fill), fillRow: Uint32Array[] = [], flat = Bmp.pack(this.fill);
      for (let y = 0; y < FILL_ROWS; y++) { const r = new Uint32Array(4); for (let q = 0; q < 4; q++) r[q] = this.deep ? Bmp.pack(deepColor(ramp, q, y)) : flat; fillRow.push(r); }
      const c = this.lv;
      if (c.width !== W || c.height !== R * WIPE_LEVELS) { c.width = W; c.height = R * WIPE_LEVELS; }
      const x = c.getContext('2d');
      if (x) {
        const img = x.createImageData(W, R * WIPE_LEVELS), out = new Uint32Array(img.data.buffer);
        for (let k = 0; k < WIPE_LEVELS; k++) {
          const m = levelMaskBits(k), o0 = k * W * R;
          for (let y = 0; y < R; y++) {
            const row = (y & 3) * 4, o = y * W;
            for (let xx = 0; xx < W; xx++) if (m[row + (xx & 3)]) out[o0 + o + xx] = y < H ? src[o + xx] : fillRow[y - H][xx & 3];
          }
        }
        x.putImageData(img, 0, 0);
      }
    }
    return this.lv;
  }
  /** pal[0] 不用（透明）；key 相同就不重畫 */
  paint(pal: RGB[], key: string): void {
    if (key === this.key || !this.ctx) return;
    this.key = key;
    if (!this.img) this.img = this.ctx.createImageData(this.w, this.h);
    this.fill = snap(pal[1]);
    const d = this.img.data, n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const k = this.idx[i], o = i * 4;
      if (!k) { d[o + 3] = 0; continue; }
      const c = snap(pal[k]);
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}

/** 可無縫平鋪的高度函數（週期 = STRIP_W） */
function wave(x: number, terms: [number, number, number][]): number {
  let s = 0;
  for (const [k, amp, ph] of terms) s += Math.sin(((x * k) / STRIP_W) * Math.PI * 2 + ph) * amp;
  return s;
}

/** 遠山：尖峰山脊（|sin| 反轉疊加）+ 積雪（snowAt 越小雪越多）+ 左側受光 */
function buildMountains(seed: number, snowAt = 92): IndexedLayer {
  const H = 150, L = new IndexedLayer(STRIP_W, H);
  const p = (i: number): number => h01(i, 0, seed) * 6.28;
  const peak = (x: number, k: number, ph: number, sharp: number): number =>
    Math.pow(1 - Math.abs(Math.sin((x * k * Math.PI) / STRIP_W + ph)), sharp);
  const hs = new Float32Array(STRIP_W + 2);
  for (let x = -1; x <= STRIP_W; x++) {
    const v = peak(x, 2, p(1), 1.6) * 0.55 + peak(x, 5, p(2), 2.2) * 0.28 + peak(x, 11, p(3), 2) * 0.1 + 0.5 * 0.14;
    hs[x + 1] = 22 + v * 118;
  }
  const height = (x: number): number => hs[Math.max(0, Math.min(STRIP_W + 1, x + 1))];
  for (let x = 0; x < STRIP_W; x++) {
    const hx = height(x), top = Math.round(H - hx);
    const slope = height(x + 1) - height(x - 1);
    const sb = (hx - snowAt) / 3.2, snow = sb > 0 ? sb + (h01(x >> 1, 1, seed) - 0.5) * 2 : 0;
    for (let y = Math.max(0, top); y < H; y++) {
      const depth = y - top;
      let k = slope > 0.15 ? 2 : 1;                        // 朝左（受光）的坡 / 背光坡
      if (slope < -0.6 && depth > 1 && depth < 22) k = 3; // 背光坡：實心暗面（不撒點）
      if (depth > 34) k = 1;
      if (depth < snow) k = slope > 0.15 ? 5 : 4;          // 雪
      L.idx[y * STRIP_W + x] = k;
    }
  }
  return L;
}

/** 中丘：圓緩丘陵 + 稀疏樹叢鼓包（snowy：丘頂一層雪，索引 4 / 5） */
function buildHills(seed: number, snowy = false): IndexedLayer {
  const H = 110, L = new IndexedLayer(STRIP_W, H);
  const p = (i: number): number => h01(i, 3, seed) * 6.28;
  const height = (x: number): number => {
    let v = 40 + wave(x, [[2, 18, p(1)], [5, 9, p(2)], [11, 3, p(3)]]);
    const bump = (Math.floor(x / 9) * 9) + 4;
    if (h01(Math.floor(x / 9), 4, seed) > 0.55) v += Math.max(0, 5 - Math.abs(x - bump) * 1.1);
    return Math.round(v);
  };
  for (let x = 0; x < STRIP_W; x++) {
    const top = H - height(x);
    const slope = height(x + 1) - height(x - 1);
    for (let y = Math.max(0, top); y < H; y++) {
      const depth = y - top;
      let k = 1;
      // 受光坡頂一道 2px 實心亮邊；深處一條實心暗帶（不用點狀抖動，剪影更乾淨）
      if (depth < 2) k = slope >= 0 ? 2 : 1;
      if (depth > 36) k = 3;
      if (snowy && depth < 4 + (h01(x >> 2, 9, seed) > 0.5 ? 2 : 0)) k = slope >= 0 ? 5 : 4;
      L.idx[y * STRIP_W + x] = k;
    }
  }
  return L;
}

// ── 生態區專屬剪影 ───────────────────────────────────────
/** 沙漠遠景：平頂方山（階梯狀崖壁、層理暗線）+ 低矮沙地 */
function buildMesas(seed: number): IndexedLayer {
  const H = 150, L = new IndexedLayer(STRIP_W, H);
  const top = new Int16Array(STRIP_W).fill(H - 22);
  for (let x = 0; x < STRIP_W; x++) top[x] = Math.round(H - 22 - wave(x, [[3, 4, seed], [7, 2, seed * 2]]));
  let x = Math.floor(h01(0, 1, seed) * 40), i = 0;
  while (x < STRIP_W) {
    const w = 60 + Math.floor(h01(i, 2, seed) * 90), hgt = 50 + Math.floor(h01(i, 3, seed) * 50);
    for (let k = 0; k < w; k++) {
      const d = Math.min(k, w - 1 - k);
      const lift = d >= 14 ? 1 : d >= 9 ? 0.8 : d >= 4 ? 0.55 : 0.25; // 階梯狀崖壁
      const xx = (x + k) % STRIP_W;
      top[xx] = Math.min(top[xx], Math.round(H - 22 - hgt * lift));
    }
    x += w + 30 + Math.floor(h01(i, 4, seed) * 80); i++;
  }
  for (let x2 = 0; x2 < STRIP_W; x2++) {
    const lt = top[(x2 + STRIP_W - 1) % STRIP_W], rt = top[(x2 + 1) % STRIP_W];
    for (let y = top[x2]; y < H; y++) {
      const depth = y - top[x2];
      let k = 1;
      if (depth < 2 || (lt > top[x2] + 1 && depth < 30)) k = 2;        // 頂面 / 左側受光崖壁
      if (rt > top[x2] + 1 && depth < 30) k = 3;                          // 右側背光
      if (y < H - 24 && (y + Math.floor(h01(x2 >> 4, 5, seed) * 3)) % 13 === 0 && depth > 3) k = 3; // 層理
      L.idx[y * STRIP_W + x2] = k;
    }
  }
  return L;
}
/** 沙丘：長而平滑的浪形，迎風面亮、背風面暗 */
function buildDunes(seed: number, H: number, amp: number, base: number): IndexedLayer {
  const L = new IndexedLayer(STRIP_W, H);
  const p = (i: number): number => h01(i, 6, seed) * 6.28;
  const height = (x: number): number => base + wave(x, [[2, amp, p(1)], [5, amp * 0.45, p(2)], [9, amp * 0.15, p(3)]]);
  for (let x = 0; x < STRIP_W; x++) {
    const top = Math.round(H - height(x)), slope = height(x + 1) - height(x - 1);
    for (let y = Math.max(0, top); y < H; y++) {
      const depth = y - top;
      let k = 1;
      if (depth < 3 && slope > -0.05) k = 2;
      else if (slope < -0.35 && depth < 14) k = 3;
      L.idx[y * STRIP_W + x] = k;
    }
  }
  return L;
}
/** 沙漠近景：矮沙丘 + 仙人掌剪影 */
function buildDesertNear(seed: number): IndexedLayer {
  const L = buildDunes(seed, 96, 6, 18);
  const set = (x: number, y: number, k: number): void => {
    const xx = ((x % STRIP_W) + STRIP_W) % STRIP_W;
    if (y >= 0 && y < L.h) L.idx[y * STRIP_W + xx] = k;
  };
  let x = 10, i = 0;
  while (x < STRIP_W) {
    let gy = 0;
    while (gy < L.h && !L.idx[gy * STRIP_W + x]) gy++;
    const th = 16 + Math.floor(h01(i, 7, seed) * 18);
    for (let dy = 0; dy < th; dy++) for (let dx = -2; dx <= 1; dx++) set(x + dx, gy - dy + 2, dx === -2 ? 2 : 1);
    const arm = (dir: number, ay: number, ah: number): void => {
      for (let k = 1; k <= 5; k++) { set(x + dir * (k + 1), gy - ay, 1); set(x + dir * (k + 1), gy - ay - 1, 1); }
      for (let k = 0; k < ah; k++) for (let dx = 0; dx < 3; dx++) set(x + dir * (6 + dx), gy - ay - k, dx === 0 && dir < 0 ? 2 : 1);
    };
    if (h01(i, 8, seed) > 0.3) arm(-1, Math.floor(th * 0.45), 8);
    if (h01(i, 9, seed) > 0.4) arm(1, Math.floor(th * 0.6), 6);
    x += 40 + Math.floor(h01(i, 10, seed) * 70); i++;
  }
  return L;
}
/** 雪原近景：成排松樹剪影，每層樹冠上緣積雪（索引 4 / 5） */
function buildPines(seed: number): IndexedLayer {
  const H = 96, L = new IndexedLayer(STRIP_W, H);
  const base = new Int16Array(STRIP_W);
  for (let x = 0; x < STRIP_W; x++) base[x] = Math.round(16 + wave(x, [[3, 4, seed], [7, 2, seed * 3]]));
  const set = (x: number, y: number, k: number, force = false): void => {
    const xx = ((x % STRIP_W) + STRIP_W) % STRIP_W;
    if (y >= 0 && y < H && (force || L.idx[y * STRIP_W + xx] < k)) L.idx[y * STRIP_W + xx] = k;
  };
  for (let x = 0; x < STRIP_W; x++) for (let y = H - base[x]; y < H; y++) set(x, y, y - (H - base[x]) < 3 ? 5 : 1);
  let x = 0, i = 0;
  while (x < STRIP_W) {
    const gy = H - base[x], th = 30 + Math.floor(h01(i, 6, seed) * 34), tw = 7 + Math.floor(h01(i, 7, seed) * 5);
    const tiers = 3 + Math.floor(th / 16);
    for (let dy = 0; dy < th; dy++) {
      const layer = (dy * tiers / th) % 1;
      const half = Math.round(tw * (dy / th) * (0.55 + layer * 0.6));
      for (let dx = -half; dx <= half; dx++) {
        const snowEdge = layer < 0.2 && dx <= 0;
        set(x + dx, gy - th + dy, snowEdge ? 4 : dx < -half + 2 && layer > 0.5 ? 2 : 1, true);
      }
    }
    set(x, gy - th - 1, 5, true);
    for (let dy = 0; dy < 4; dy++) set(x, gy - dy, 1, true);
    x += 8 + Math.floor(h01(i, 9, seed) * 13); i++;
  }
  return L;
}
/** 叢林遠景：霧中的石灰岩峰林（高聳圓頂柱） */
function buildKarst(seed: number): IndexedLayer {
  const H = 150, L = new IndexedLayer(STRIP_W, H);
  const top = new Float32Array(STRIP_W).fill(H - 18);
  let x = 0, i = 0;
  while (x < STRIP_W + 40) {
    const w = 26 + h01(i, 2, seed) * 40, hgt = 60 + h01(i, 3, seed) * 75;
    for (let k = -w / 2; k <= w / 2; k++) {
      const t = (2 * k) / w;
      const cap = Math.sqrt(Math.max(0, 1 - t * t * t * t));
      const xx = ((Math.round(x + k) % STRIP_W) + STRIP_W) % STRIP_W;
      top[xx] = Math.min(top[xx], H - 18 - hgt * cap);
    }
    x += w * 0.7 + h01(i, 4, seed) * 30; i++;
  }
  for (let x2 = 0; x2 < STRIP_W; x2++) {
    const t0 = Math.round(top[x2]), slope = top[(x2 + 1) % STRIP_W] - top[(x2 + STRIP_W - 1) % STRIP_W];
    for (let y = Math.max(0, t0); y < H; y++) {
      const depth = y - t0;
      let k = 1;
      if (slope > 0.4 && depth < 40) k = 2;
      if (slope < -0.6 && depth < 30) k = 3;
      if (depth < 2) k = 2;
      L.idx[y * STRIP_W + x2] = k;
    }
  }
  return L;
}
/** 叢林中景：一團團鼓起的樹冠丘 */
function buildCanopy(seed: number): IndexedLayer {
  const H = 110, L = new IndexedLayer(STRIP_W, H);
  const hgt = new Float32Array(STRIP_W).fill(30);
  let x = 0, i = 0;
  while (x < STRIP_W + 30) {
    const r = 10 + h01(i, 2, seed) * 16, cy = 32 + h01(i, 3, seed) * 26;
    for (let k = -r; k <= r; k++) {
      const xx = ((Math.round(x + k) % STRIP_W) + STRIP_W) % STRIP_W;
      hgt[xx] = Math.max(hgt[xx], cy + Math.sqrt(Math.max(0, r * r - k * k)) * 0.8);
    }
    x += r * 1.2 + h01(i, 4, seed) * 8; i++;
  }
  for (let x2 = 0; x2 < STRIP_W; x2++) {
    const t0 = Math.round(H - hgt[x2]), slope = hgt[(x2 + 1) % STRIP_W] - hgt[(x2 + STRIP_W - 1) % STRIP_W];
    for (let y = Math.max(0, t0); y < H; y++) {
      const depth = y - t0;
      let k = 1;
      if (depth < 3 && slope >= -0.2) k = 2;
      if (depth > 40) k = 3;
      L.idx[y * STRIP_W + x2] = k;
    }
  }
  return L;
}
/** 叢林近景：高大樹幹 + 寬樹冠 + 垂下的藤蔓 */
function buildJungleNear(seed: number): IndexedLayer {
  const H = 96, L = new IndexedLayer(STRIP_W, H);
  const set = (x: number, y: number, k: number): void => {
    const xx = ((x % STRIP_W) + STRIP_W) % STRIP_W;
    if (y >= 0 && y < H && L.idx[y * STRIP_W + xx] < k) L.idx[y * STRIP_W + xx] = k;
  };
  for (let x = 0; x < STRIP_W; x++) for (let y = H - Math.round(14 + wave(x, [[4, 3, seed]])); y < H; y++) set(x, y, 1);
  let x = 0, i = 0;
  while (x < STRIP_W) {
    const th = 46 + Math.floor(h01(i, 2, seed) * 30), cw = 18 + Math.floor(h01(i, 3, seed) * 14), chh = 9 + Math.floor(h01(i, 4, seed) * 5);
    const gy = H - 14, cy = gy - th;
    for (let dy = 0; dy < th; dy++) for (let dx = -1; dx <= 1; dx++) set(x + dx, gy - dy, 1);
    for (let dy = -chh; dy <= chh; dy++) for (let dx = -cw; dx <= cw; dx++) {
      const nx = dx / cw, ny = dy / chh;
      if (nx * nx + ny * ny <= 1 + (h01((x + dx) >> 2, dy >> 1, seed) - 0.5) * 0.3) set(x + dx, cy + dy, nx + ny < -0.6 ? 2 : 1);
    }
    for (let v = 0; v < 4; v++) {
      const vx = x - cw + 4 + Math.floor(h01(i, 10 + v, seed) * (cw * 2 - 8)), len = 6 + Math.floor(h01(i, 20 + v, seed) * 18);
      for (let k = 0; k < len; k++) set(vx + ((k >> 3) & 1), cy + chh - 2 + k, 1);
    }
    x += cw + 12 + Math.floor(h01(i, 5, seed) * 30); i++;
  }
  return L;
}

/** 生態區背景色（白天的遠 / 中 / 近三層基色；全部取自色票） */
const BIOME_DAY: Record<number, [string, string, string]> = {
  1: ['#d98f66', '#c99660', '#966139'],
  2: ['#b4b9c8', '#858aa0', '#3f7468'],
  3: ['#6a9c88', '#3f7468', '#214528'],
};
/** 生態區背景的受光色 */
const BIOME_LITE: Record<number, [string, string, string]> = {
  1: ['#f2b888', '#d8ba76', '#b07a4b'],
  2: ['#cceaf8', '#b4b9c8', '#6a9c88'],
  3: ['#a2c8b0', '#6a9c88', '#2d672e'],
};
/** 生態區背景的暗面色（取代 nudge，避免跳到別的色相） */
const BIOME_DARK: Record<number, [string, string, string]> = {
  1: ['#b07a4b', '#966139', '#7c4c2e'],
  2: ['#858aa0', '#5e5e74', '#16301e'],
  3: ['#3f7468', '#214528', '#16301e'],
};
/** 近林：針葉 / 圓頂樹剪影 */
function buildForest(seed: number): IndexedLayer {
  const H = 96, L = new IndexedLayer(STRIP_W, H);
  const base = new Int16Array(STRIP_W);
  for (let x = 0; x < STRIP_W; x++) base[x] = Math.round(18 + wave(x, [[3, 5, seed], [8, 2, seed * 2]]));
  const set = (x: number, y: number, k: number): void => {
    const xx = ((x % STRIP_W) + STRIP_W) % STRIP_W;
    if (y >= 0 && y < H && L.idx[y * STRIP_W + xx] < k) L.idx[y * STRIP_W + xx] = k;
  };
  for (let x = 0; x < STRIP_W; x++) for (let y = H - base[x]; y < H; y++) set(x, y, 1);
  let x = 0, i = 0;
  while (x < STRIP_W) {
    const r = h01(i, 5, seed);
    const gy = H - base[x];
    if (r < 0.55) {
      // 針葉樹：層疊三角
      const th = 26 + Math.floor(h01(i, 6, seed) * 26), tw = 6 + Math.floor(h01(i, 7, seed) * 4);
      for (let dy = 0; dy < th; dy++) {
        const layer = (dy % 8) / 8;
        const half = Math.round((tw * (dy / th)) * (0.65 + layer * 0.5));
        for (let dx = -half; dx <= half; dx++) set(x + dx, gy - th + dy, dx < -half + 2 && layer > 0.5 ? 2 : 1);
      }
      for (let dy = 0; dy < 4; dy++) set(x, gy - dy, 1);
    } else {
      // 闊葉樹：三團交疊的樹冠
      const rr = 6 + Math.floor(h01(i, 8, seed) * 5), cy = gy - rr - 7;
      const lobes: [number, number, number][] = [[0, -rr * 0.55, rr * 0.75], [-rr * 0.55, 0, rr * 0.7], [rr * 0.6, rr * 0.05, rr * 0.72], [0, rr * 0.15, rr * 0.8]];
      for (const [lx, ly, lr] of lobes) {
        for (let dy = -Math.ceil(lr); dy <= lr; dy++) for (let dx = -Math.ceil(lr); dx <= lr; dx++) {
          if (dx * dx + dy * dy <= lr * lr) set(Math.round(x + lx + dx), Math.round(cy + ly + dy), dx + dy < -lr * 0.7 ? 2 : 1);
        }
      }
      for (let dy = 0; dy < 8; dy++) { set(x, gy - dy, 1); set(x + 1, gy - dy, 1); }
    }
    x += 9 + Math.floor(h01(i, 9, seed) * 14);
    i++;
  }
  return L;
}

function sunBmp(): Bmp {
  const R = 22, b = new Bmp(R * 2, R * 2), core = hex('#fff4c0'), mid = hex('#ffd86a'), rim = hex('#ffa93a'), halo = hex('#fff4c0');
  for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
    // 實心日輪 + 不透明的抖動光環（沒有半透明）
    if (d < 13) b.set(x, y, d < 10 ? core : mid);
    else if (d < 14) b.set(x, y, rim);
    // 外圈一道 1px 的斷續光環
    else if (d >= 16 && d < 17 && bayer(x, y) > 0.5) b.set(x, y, halo);
  }
  return b;
}
function moonBmp(): Bmp {
  const N = 32, b = new Bmp(N, N), lit = hex('#f2f4fa'), mid = hex('#cfd5e4'), dark = hex('#a3abc2'), glow = hex('#7f9cc4');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (d > 10) { if (d < 13 && bayer(x, y) > 0.875) b.set(x, y, glow); continue; }
    const c = d > 9 ? mid : lit;
    b.set(x, y, c);
  }
  // 環形山
  for (const [cx, cy, r] of [[12, 13, 2.2], [19, 18, 2.8], [14, 21, 1.5], [20, 11, 1.4]] as [number, number, number][]) {
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const d = Math.hypot(x, y);
      if (d <= r) b.set(cx + x, cy + y, d > r - 1 && x + y > 0 ? lit : x + y < 0 ? dark : mid);
    }
  }
  return b;
}
/** 星空（不透明）：level 0..3，每顆星有自己的出現門檻 → 黎明 / 黃昏時星星一顆顆消失，而不是整片變淡 */
function starsBmp(seed: number, level: number): Bmp {
  const W = 320, H = 180, b = new Bmp(W, H), w = hex('#ffffff'), bl = hex('#94c8ee'), y = hex('#fff4c0'), dim = hex('#7f9cc4');
  for (let i = 0; i < 70; i++) {
    const th = h01(i, 4, seed);
    if (th * 4 >= level) continue;
    const x = Math.floor(h01(i, 1, seed) * W), yy = Math.floor(h01(i, 2, seed) * H);
    const r = h01(i, 3, seed), c = th > 0.6 ? dim : r > 0.66 ? w : r > 0.33 ? bl : y;
    b.set(x, yy, c);
    if (r > 0.93) { b.set(x - 1, yy, dim); b.set(x + 1, yy, dim); b.set(x, yy - 1, dim); b.set(x, yy + 1, dim); }
  }
  return b;
}
/** 雲：平底、蓬鬆頂；索引 1 = 暗底、2 = 中、3 = 亮頂 */
function cloudLayer(i: number): IndexedLayer {
  const W = 56 + (i % 3) * 18, H = 22 + (i % 2) * 6, L = new IndexedLayer(W, H);
  const puffs: [number, number, number][] = [];
  const n = 3 + (i % 3);
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const px = 9 + t * (W - 18);
    const r = 5 + (1 - Math.abs(t - 0.5) * 2) * (H * 0.36) + h01(k, i, 77) * 4;
    puffs.push([px, H - 5 - r * 0.55, r]);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (y > H - 5) continue;
    let best = -1, by = 0;
    for (const [px, py, r] of puffs) {
      const d = Math.hypot(x + 0.5 - px, (y + 0.5 - py) * 1.15) / r;
      if (d <= 1 && (best < 0 || d < best)) { best = d; by = (y + 0.5 - py) / r; }
    }
    if (best < 0) continue;
    let k = by < -0.35 ? 3 : by > 0.35 ? 1 : 2;
    if (y >= H - 7) k = 1;
    L.idx[y * W + x] = k;
  }
  return L;
}

/** 每欄生態區的來源：at(x) = 第 x 欄的生態區；[xMin, xMax) = 世界水平範圍 */
export interface BiomeSource { at(x: number): number; readonly xMin: number; readonly xMax: number; }

export interface BgView {
  /** 低解析緩衝大小（美術 px = 世界 px） */
  viewW: number; viewH: number;
  /** 沒有 biomes 時整片遠景用的生態區（標題背景：不混色）；b / t 已不使用 */
  biome?: { a: number; b: number; t: number };
  /** 每欄的生態區（world.biomeAt，可快取）：有給 → 依鏡頭中心 centerTile 做連續的分層混合。物件不變 → 權重場不重建 */
  biomes?: BiomeSource;
  /** 鏡頭中心的世界 x（格，可帶小數） */
  centerTile?: number;
  /** 已對齊整數的鏡頭左上角（世界 px） */
  camX: number; camY: number;
  /** 地平線（世界 px，地表線） */
  horizonY: number;
  time: number;
  dayFrac: number;
  /** 今天的日出 / 日落 / 曙暮光（曆法；省略 = 0.25 / 0.75 / 0.05） */
  sunrise?: number; sunset?: number; twilight?: number;
  /** 月相 0..7 */
  moon?: number;
  /** 季節混合（calendar.seasonBlend）：森林剪影的季節色 */
  season?: { season: Season; prev: Season; t: number };
  /** 天氣（玩家所在處）：雲量 / 灰化 / 閃電閃光 / 風 */
  weather?: { kind: string; intensity: number; flash: number; wind: number };
  /** 正在打的閃電（螢幕 x，美術 px） */
  bolt?: { x: number; seed: number } | null;
}
/** 天氣的雲量（0..1，滿強度）：決定多畫幾朵雲、遮住日月、遠景起霧 */
const CLOUD_COVER: Record<string, number> = { clear: 0, cloudy: 0.65, rain: 0.9, storm: 1, snow: 0.8, fog: 0.5 };
/** 起霧（遠景往天色靠）：霧最濃、雨雪次之 */
const HAZE: Record<string, number> = { clear: 0, cloudy: 0.1, rain: 0.35, storm: 0.4, snow: 0.35, fog: 0.75 };

const BLACK: RGB = [0, 0, 0];
/** 地表淡入高度（px） */
const UG_FADE = 96;
/** 「地下背景蓋滿畫面」判定的餘裕（px）：鏡頭一幀內移動不會超過它 */
const UG_COVER_M = 160;

/** 一層遠景的規劃：左 / 右區與各自的剪影、分界線螢幕 x（Infinity = 全左、-Infinity = 全右） */
interface LayerPlan { left: number; right: number; L: IndexedLayer; R: IndexedLayer; front: number; }

/** 各生態區白天的天色傾向（頂 / 底）：沙漠偏暖白、雪原偏冷亮、叢林偏濕綠；森林不改 */
const SKY_TINT: Record<number, [string, string]> = {
  1: ['#5c9ce0', '#f2e2b0'],
  2: ['#94c8ee', '#cceaf8'],
  3: ['#3e74c4', '#a2c8b0'],
};
/** 天色依生態區權重往該區傾向靠（amt = 白天程度；夜裡不變）。回傳新物件，顏色未吸附（drawSky 會吸附） */
export function tintSky(sky: SkyColors, weights: readonly number[], amt: number): SkyColors {
  if (amt <= 0) return sky;
  const acc = (i: 0 | 1, own: RGB): RGB => {
    const o: RGB = [0, 0, 0];
    let tot = 0;
    weights.forEach((wt, b) => {
      if (wt <= 0) return;
      const t = SKY_TINT[b];
      const c = t ? hex(t[i]) : own;
      for (let j = 0; j < 3; j++) o[j] += c[j] * wt;
      tot += wt;
    });
    return tot > 0 ? (o.map((x) => x / tot) as RGB) : own;
  };
  return { ...sky, top: mix(sky.top, acc(0, sky.top), 0.22 * amt), bottom: mix(sky.bottom, acc(1, sky.bottom), 0.38 * amt) };
}

export class Background {
  /** 每個生態區的遠 / 中 / 近三層剪影 */
  private sets: IndexedLayer[][] = [];
  private field: BiomeField | null = null;
  private fieldSrc: BiomeSource | null = null;
  private clouds: IndexedLayer[] = [];
  private sun = toCanvas(sunBmp()) as HTMLCanvasElement;
  private moon = toCanvas(moonBmp()) as HTMLCanvasElement;
  /** 8 個月相 */
  private moons = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => toCanvas(moonPhaseBmp(k)) as HTMLCanvasElement);
  /** 冬天的森林遠景：積雪的遠山 + 雪丘（近林照舊、靠色調上雪） */
  private winterSet: IndexedLayer[] = [];
  private bolts = new Map<string, { c: HTMLCanvasElement; ox: number }>();
  /** 雲的累積位移（依風向；跟時間脫鉤，換風向不會跳） */
  private cloudOff = 0;
  private lastTime = -1;
  /** stars[level-1]：level 1..4 顆數遞增 */
  private stars: HTMLCanvasElement[] = [];
  private skyStrip = document.createElement('canvas');
  private skyKey = '';
  /** 圖樣快取：每幀重建 CanvasPattern 很貴（會複製來源畫布） */
  private skyPat: CanvasPattern | null = null;
  /** 地下背景：主題 × keep 階的圖樣（用到才建） */
  private ugPats = new Map<number, CanvasPattern | null>();
  private ugAreaSrc: readonly unknown[] | null = null;
  private ugAreaList: UgArea[] = [];
  private ugRuns: { x: number; w: number; bands: UgBand[] }[] = [];
  /** 上一幀地下背景整片蓋住畫面時的鏡頭（draw 可整段跳過）；null = 沒蓋滿 */
  private ugCover: { x: number; y: number; w: number; h: number } | null = null;
  private cloudSeed: number;

  constructor(seed: number) {
    this.sets[0] = [buildMountains(seed), buildHills(seed + 1), buildForest((seed % 1000) / 100 + 1)];
    this.sets[1] = [buildMesas(seed + 2), buildDunes(seed + 3, 110, 14, 40), buildDesertNear(seed + 4)];
    this.sets[2] = [buildMountains(seed + 5, 48), buildHills(seed + 6, true), buildPines(seed + 7)];
    this.sets[3] = [buildKarst(seed + 8), buildCanopy(seed + 9), buildJungleNear(seed + 10)];
    for (const set of this.sets) set[2].deep = true;
    this.winterSet = [buildMountains(seed, 60), buildHills(seed + 1, true), this.sets[0][2]];
    for (let i = 0; i < 5; i++) this.clouds.push(cloudLayer(i));
    for (let l = 1; l <= 4; l++) this.stars.push(toCanvas(starsBmp(seed, l)) as HTMLCanvasElement);
    this.cloudSeed = seed;
  }

  /** 生態區權重場（來源換了才重建） */
  private fieldFor(src: BiomeSource | undefined): BiomeField | null {
    if (!src) return null;
    if (src !== this.fieldSrc) { this.fieldSrc = src; this.field = new BiomeField((x) => src.at(x), src.xMin, src.xMax); }
    return this.field;
  }

  /** 每層：左區 / 右區的剪影、分界線（螢幕 x；±Infinity = 整層同一區） */
  private plan(v: BgView, winter: boolean): LayerPlan[] {
    const bm = v.biome ?? { a: 0, b: 0, t: 0 };
    const field = this.fieldFor(v.biomes);
    const set = (biome: number, k: number): IndexedLayer =>
      (biome === 0 && winter ? this.winterSet[k] : this.sets[biome]?.[k]) ?? this.sets[0][k];
    const out: LayerPlan[] = [];
    for (let k = 0; k < 3; k++) {
      const p = field ? field.pair(v.centerTile ?? 0, LAYER_HALF[k]) : { left: bm.a, right: bm.a, u: 0 };
      const front = p.left === p.right || p.u <= 0 ? Infinity : p.u >= 1 ? -Infinity : Math.round(wipeFront(p.u, v.viewW));
      out.push({ left: p.left, right: p.right, L: set(p.left, k), R: set(p.right, k), front });
    }
    return out;
  }

  /** 在低解析緩衝（identity transform，1 單位 = 1 美術 px）畫天空與遠景 */
  draw(ctx: CanvasRenderingContext2D, v: BgView): void {
    // 深入地下：上一幀的地下背景（含四周 UG_COVER_M px 的餘裕）整片蓋住畫面 → 天空 / 遠景都看不到，整段跳過
    const cv = this.ugCover;
    if (cv && Math.abs(v.camX - cv.x) < UG_COVER_M && Math.abs(v.camY - cv.y) < UG_COVER_M && v.viewW === cv.w && v.viewH === cv.h) return;
    const sr = v.sunrise ?? 0.25, ss = v.sunset ?? 0.75, tw = v.twilight ?? 0.05;
    const wx = v.weather ?? { kind: 'clear', intensity: 0, flash: 0, wind: 0 };
    const sky0 = skyColors(v.dayFrac, sr, ss, tw, wx);
    const cover = (CLOUD_COVER[wx.kind] ?? 0) * wx.intensity, haze = (HAZE[wx.kind] ?? 0) * wx.intensity;
    const W = v.viewW, Hh = v.viewH;
    const dayness = dayAmount(v.dayFrac, sr, ss, tw);
    const sb = v.season;
    const winter = sb ? (sb.season === 3 ? sb.t >= 0.5 : sb.prev === 3 && sb.t < 0.5) : false;
    const plan = this.plan(v, winter);
    // 天空色調：依鏡頭附近（SKY_HALF 格）各區的比例，白天往該區的天色靠（連續權重 → 吸附色票後一階一階地換）
    const field = this.fieldFor(v.biomes);
    const bm = v.biome ?? { a: 0, b: 0, t: 0 };
    const sw = field ? field.weights(v.centerTile ?? 0, SKY_HALF) : [0, 1, 2, 3].map((b) => (b === bm.a ? 1 : 0));
    const sky = tintSky(sky0, sw, dayness * (1 - 0.6 * cover));
    ctx.imageSmoothingEnabled = false;
    this.drawSky(ctx, sky, W, Hh);
    // 星星：依亮度挑 1..4 層（每顆星不透明，只有出現 / 不出現）
    const sl = Math.round(sky.stars * 4);
    if (sl > 0) {
      const st = this.stars[sl - 1];
      const stw = st.width, sth = st.height;
      const ox = -(((snapPx(v.camX * 0.02) % stw) + stw) % stw);
      for (let y = 0; y < Hh * 0.75; y += sth) for (let x = ox; x < W; x += stw) ctx.drawImage(st, x, y);
    }
    // 日 / 月：太陽沿弧線從日出走到日落（日出前 / 日落後一個曙暮光內還在地平線附近），月亮從日落走到隔天日出
    const d = v.dayFrac;
    const sunUp = d > sr - tw && d < ss + tw;
    const nightLen = 1 - (ss - sr);
    const a = sunUp ? (d - sr) / (ss - sr) : (((d - ss) % 1) + 1) % 1 / nightLen;
    const aa = Math.max(-0.1, Math.min(1.1, a));
    const bx = W * (0.1 + 0.8 * Math.max(0, Math.min(1, aa))), by = Hh * (0.46 - 0.38 * Math.sin(Math.PI * aa));
    const img = sunUp ? this.sun : this.moons[(v.moon ?? 4) & 7] ?? this.moon;
    // 日 / 月不躲在山後：日出 / 日落（含曙暮光）時若弧線低於這一帶剪影的稜線，抬到稜線上方（日輪 + 光環整個露出）
    const ridge = this.ridgeY(v, plan, Math.round(bx - 15), Math.round(bx + 15));
    const lift = Math.min(by, ridge - (sunUp ? 18 : 12));
    const sy = Math.max(img.height / 2 - 4, lift);
    // 厚雲 / 雨雪：看不到日月
    if (cover < 0.7) ctx.drawImage(img, snapPx(bx - img.width / 2), snapPx(sy - img.height / 2));
    // 閃電：天頂到地平線的鋸齒（在遠景後面）
    if (v.bolt && wx.flash > 0) {
      const bh = Math.max(40, Math.min(Hh, Math.round(Hh * 0.62)));
      const key = `${v.bolt.seed}:${bh}`;
      let bc = this.bolts.get(key);
      if (!bc) {
        const bb = boltBmp(v.bolt.seed, bh);
        bc = { c: toCanvas(bb.b) as HTMLCanvasElement, ox: bb.ox };
        if (this.bolts.size > 8) this.bolts.clear();
        this.bolts.set(key, bc);
      }
      ctx.drawImage(bc.c, snapPx(v.bolt.x - bc.ox), 0);
    }
    // 雲：色票上的三階（暗底 / 中 / 亮頂），完全不透明；陰雨天多畫幾朵、隨風飄
    const dtc = this.lastTime < 0 ? 0 : Math.max(0, Math.min(0.25, v.time - this.lastTime));
    this.lastTime = v.time;
    this.cloudOff += dtc * (1 + Math.abs(wx.wind) * 6) * (wx.wind < -0.05 ? -1 : 1);
    const base = snap(sky.cloud);
    const cpal: RGB[] = [BLACK, nudge(base, -1), base, nudge(base, 1)];
    const ckey = cpal.map((c) => c.join()).join('|');
    const span = W + 240;
    const n = this.clouds.length + Math.round(cover * 11);
    for (let i = 0; i < n; i++) {
      const c = this.clouds[i % this.clouds.length];
      c.paint(cpal, ckey);
      const speed = 3 + (i % 7) * 1.3;
      const b0 = h01(i, 1, this.cloudSeed) * span;
      const cx = (((b0 + this.cloudOff * speed - v.camX * 0.04) % span) + span) % span - 120;
      const cy = (i < this.clouds.length ? 18 + h01(i, 2, this.cloudSeed) * Hh * 0.28 + i * 7 : 4 + h01(i, 3, this.cloudSeed) * Hh * 0.22);
      ctx.drawImage(c.canvas, snapPx(cx), snapPx(cy));
    }
    // 三層視差剪影（每層色票：基色 + 色票上相鄰的亮 / 暗階）
    const midY = v.camY + (v.viewH / 2);
    const layerY = (f: number, lift: number): number => snapPx((v.viewH / 2) + (v.horizonY - midY) * f - lift);
    const L = sky.layers.map(snap) as [RGB, RGB, RGB];
    const bottom = snap(sky.bottom);
    const lite = (c: RGB, toward: RGB): RGB => { const m = snap(mix(c, toward, 0.4)); return m === c ? nudge(c, 1) : m; };
    // 陰天時生態區 / 季節的色調變淡（往灰色天光靠）
    const w = (0.12 + 0.78 * dayness) * (1 - 0.45 * cover);
    // 森林（生態區 0）的季節色：上一季 → 這一季分階混合
    const seasonCol = (pick: (s: Season) => readonly string[], k: number): string | RGB => {
      if (!sb) return pick(1 as Season)[k];
      const c0 = hex(pick(sb.prev)[k]), c1 = hex(pick(sb.season)[k]);
      return sb.t >= 1 ? c1 : snap(mix(c0, c1, sb.t));
    };
    const col = (tbl: Record<number, [string, string, string]>, seasonal: (s: Season) => readonly string[], biome: number, k: number): RGB | null => {
      if (biome === 0) { const c = seasonCol(seasonal, k); return typeof c === 'string' ? hex(c) : c; }
      const t = tbl[biome];
      return t ? hex(t[k]) : null;
    };
    // 霧 / 雨：遠的層整層換成霧灰（分階，不做中間色 → 不會吸附到怪色）；遠山門檻低、中丘高、近林不變
    const FOG: [string, string, string][] = [['#b4b9c8', '#cceaf8', '#858aa0'], ['#858aa0', '#b4b9c8', '#707490']];
    const fogAt = [0.3, 0.55];
    const fogged = (c: RGB, k: number, role = 0): RGB => {
      if (k > 1 || haze < fogAt[k]) return c;
      return snap(mix(L[k], hex(FOG[k][role]), 0.2 + 0.8 * dayness));
    };
    const white: RGB = [255, 255, 255];
    /** 某區某層的色票（索引 0 透明、1 基色、2 受光、3 暗面、4/5 雪） */
    const palette = (biome: number, k: number): { pal: RGB[]; key: string; base: RGB } => {
      const day = col(BIOME_DAY, bgSeasonDay, biome, k);
      const base0 = day ? snap(mix(L[k], day, w)) : L[k];
      const base = fogged(base0, k);
      const dark = col(BIOME_DARK, bgSeasonDark, biome, k);
      const dk = fogged(dark ? snap(mix(nudge(L[k], -1), dark, w)) : nudge(L[k], -1), k, 2);
      const lc = col(BIOME_LITE, bgSeasonLite, biome, k);
      const lt = fogged(lc ? snap(mix(lite(base0, bottom), lc, w)) : lite(base0, bottom), k, 1);
      const snowA = snap(mix(base, white, 0.25 + 0.45 * dayness)), snowB = snap(mix(base, white, 0.35 + 0.65 * dayness));
      const pal: RGB[] = [BLACK, base, lt === base ? nudge(base, 1) : lt, dk === base ? nudge(base, -1) : dk, snowA === base ? nudge(base, 1) : snowA, snowB];
      return { pal, key: pal.map((c) => c.join()).join('|'), base };
    };
    const factors: [number, number][] = [[0.12, layerY(0.22, 30)], [0.28, layerY(0.42, 22)], [0.5, layerY(0.62, -14)]];
    for (let k = 0; k < 3; k++) {
      const p = plan[k], [f, by0] = factors[k];
      const A = palette(p.left, k);
      p.L.paint(A.pal, A.key);
      if (p.front === Infinity) { this.layer(ctx, p.L, f, by0, A.base, W, Hh, v); continue; }
      const B = palette(p.right, k);
      p.R.paint(B.pal, B.key);
      if (p.front === -Infinity) { this.layer(ctx, p.R, f, by0, B.base, W, Hh, v); continue; }
      // 垂直抹過：分界線左邊畫左區、右邊畫右區，中間 WIPE_BAND px 用 1×1 Bayer（圖樣錨定在右區圖層上）
      const bx0 = p.front - WIPE_BAND / 2, bx1 = bx0 + WIPE_BAND;
      const fx = Math.max(0, Math.min(W, p.front));
      this.span(ctx, p.L, f, by0, A.base, 0, Math.min(W, bx1), Hh, v, 0, fx);
      this.span(ctx, p.R, f, by0, B.base, Math.max(0, bx1), W, Hh, v, fx, W);
      if (bx1 > 0 && bx0 < W) this.band(ctx, p.R, f, by0, bx0, Hh, v);
    }
  }

  /** 遠 / 中 / 近三層剪影在螢幕欄 x0..x1 之間的最高稜線（螢幕 y，美術 px） */
  private ridgeY(v: BgView, plan: LayerPlan[], x0: number, x1: number): number {
    const midY = v.camY + v.viewH / 2;
    const layerY = (f: number, lift: number): number => snapPx(v.viewH / 2 + (v.horizonY - midY) * f - lift);
    const factors: [number, number][] = [[0.12, layerY(0.22, 30)], [0.28, layerY(0.42, 22)], [0.5, layerY(0.62, -14)]];
    let best = Infinity;
    for (let k = 0; k < 3; k++) {
      const p = plan[k];
      for (const L of p.front === Infinity ? [p.L] : p.front === -Infinity ? [p.R] : [p.L, p.R]) {
        const sw = L.w, off = -(((snapPx(v.camX * factors[k][0]) % sw) + sw) % sw);
        const top = factors[k][1] - L.h;
        for (let x = x0; x <= x1; x++) best = Math.min(best, top + L.topRow(x - off));
      }
    }
    return best;
  }

  /** 只在螢幕欄 [x0, x1) 畫一層（含下方填色）：直接取來源子矩形，不用 clip */
  private span(ctx: CanvasRenderingContext2D, L: IndexedLayer, factor: number, bottomY: number, fill: RGB, x0: number, x1: number, Hh: number, v: BgView,
    f0 = x0, f1 = x1): void {
    if (x1 <= x0) return;
    const top = bottomY - L.h;
    if (top > Hh) return;
    const sw = L.w;
    const off = -(((snapPx(v.camX * factor) % sw) + sw) % sw);
    for (let x = off; x < x1; x += sw) {
      const a = Math.max(x, x0), b = Math.min(x + sw, x1);
      if (b > a) ctx.drawImage(L.canvas, a - x, 0, b - a, L.h, a, top, b - a, L.h);
    }
    if (L.deep) deepFill(ctx, fill, x0, x1, bottomY, Hh, off);
    else if (bottomY < Hh && f1 > f0) { ctx.fillStyle = `rgb(${fill.join(',')})`; ctx.fillRect(f0, bottomY, f1 - f0, Hh - bottomY); }
  }

  /** 分界帶：WIPE_LEVELS 段細長切片，每段畫右區圖層「該階抖動版」的同一位置（圖層座標對齊 → 抖動黏在圖層上） */
  private band(ctx: CanvasRenderingContext2D, R: IndexedLayer, factor: number, bottomY: number, bx0: number, Hh: number, v: BgView): void {
    const top = bottomY - R.h;
    if (top > Hh) return;
    const sw = R.w, off = -(((snapPx(v.camX * factor) % sw) + sw) % sw);
    const atlas = R.levels();
    for (const sl of BAND_SLICES) {
      const x0 = Math.max(0, bx0 + sl.x0), x1 = Math.min(v.viewW, bx0 + sl.x1);
      if (x1 <= x0) continue;
      const sy = sl.level * (R.h + FILL_ROWS);
      for (let x = off; x < x1; x += sw) {
        const a = Math.max(x, x0), b = Math.min(x + sw, x1);
        if (b > a) ctx.drawImage(atlas, a - x, sy, b - a, R.h, a, top, b - a, R.h);
      }
      // 剪影下方的填色：圖集裡同一階的填色列（每次最多 FILL_ROWS 列）
      // 近景層的漸暗填色：只有 FILL_ROWS 列（再往下兩區都是 DEEP_END，不用混）。
      // 遠 / 中層的填色幾乎都被前一層蓋住 → 在分界線直接切開（span 那邊），省掉一大串小貼圖
      if (!R.deep) continue;
      const g0 = Math.max(0, -bottomY), g1 = Math.min(FILL_ROWS, Hh - bottomY);
      if (g1 <= g0) continue;
      for (let x = off; x < x1; x += sw) {
        const a = Math.max(x, x0), b = Math.min(x + sw, x1);
        if (b > a) ctx.drawImage(atlas, a - x, sy + R.h + g0, b - a, g1 - g0, a, bottomY + g0, b - a, g1 - g0);
      }
    }
  }

  private drawSky(ctx: CanvasRenderingContext2D, sky: SkyColors, W: number, Hh: number): void {
    // 12 段色帶，每段吸附到色票；相鄰色不同時段間以 2 列 Bayer 抖動銜接。烘成 4 px 寬的條帶後橫向重複
    const rows = Math.max(1, Hh);
    const bands = 12;
    const cols: RGB[] = [];
    for (let k = 0; k <= bands; k++) cols.push(snap(mix(sky.top, sky.bottom, k / bands)));
    const key = `${cols.map((c) => c.join()).join('|')}|${rows}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const b = new Bmp(4, rows);
      for (let y = 0; y < rows; y++) {
        const t = Math.pow(y / Math.max(1, rows - 1), 1.25) * bands;
        for (let x = 0; x < 4; x++) {
          const f = t - Math.floor(t);
          const band = Math.floor(t) + (f > 0.8 && bayer(x, y) < (f - 0.8) * 5 ? 1 : 0);
          b.set(x, y, cols[Math.min(bands, band)]);
        }
      }
      this.skyStrip = toCanvas(b) as HTMLCanvasElement;
      this.skyPat = null;
    }
    if (!this.skyPat) this.skyPat = ctx.createPattern(this.skyStrip, 'repeat-x');
    const pat = this.skyPat;
    if (pat) {
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, rows);
    } else {
      ctx.fillStyle = `rgb(${cols[0].join(',')})`;
      ctx.fillRect(0, 0, W, Hh);
    }
  }

  private layer(ctx: CanvasRenderingContext2D, L: IndexedLayer, factor: number, bottomY: number, fill: RGB, W: number, Hh: number, v: BgView, doFill = true): void {
    const top = bottomY - L.h;
    if (top > Hh) return;
    const sw = L.w;
    const off = -(((snapPx(v.camX * factor) % sw) + sw) % sw);
    for (let x = off; x < W; x += sw) ctx.drawImage(L.canvas, x, top);
    if (doFill && L.deep) deepFill(ctx, fill, 0, W, bottomY, Hh, off);
    else if (doFill && bottomY < Hh) { ctx.fillStyle = `rgb(${fill.join(',')})`; ctx.fillRect(0, bottomY, W, Hh - bottomY); }
  }

  /**
   * 世界座標下畫地下背景（呼叫端已設好世界 transform）。逐 tile 欄依 underground.ugColumnBands 的規劃畫：
   * 從「該欄地表 + depth」開始 96 px 的 8 階 Bayer 淡入、土 / 岩層依該欄生態區換主題（交界抖動）、層與層之間 64 px 的抖動過渡帶、
   * 兩層視差（遠層環境色 1/4 速、近層有洞口 1/2 速）、
   * 深層 / 熔岩照舊，菇林與地城整段覆蓋。zones 省略 = 全部當森林、沒有覆蓋區。
   * zones.biomeAt 每幀每個畫面欄會問好幾次（交界找鄰欄）→ 呼叫端傳有快取的函式；[xMin, xMax) = 世界水平範圍。
   */
  drawUnderground(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number,
    colTop: (tx: number) => number, tile: number, cavernY: number, deepY = Infinity, moltenY = Infinity,
    zones?: { biomeAt?: (tx: number) => number; xMin?: number; xMax?: number; structures?: readonly { kind: string; x: number; y: number; w: number; h: number }[] }): void {
    const bottom = camY + vh + 1;
    // 兩層視差：遠層（環境色、整片）0.75 → 畫面上移動 1/4 速；近層（有洞口）0.5 → 1/2 速。
    // 圖樣原點用 translate 移（不必每幀對每個圖樣 setTransform）；對齊整數美術 px
    const nx = snapPx(camX * 0.5), ny = snapPx(camY * 0.5);
    const fx = snapPx(camX * 0.75), fy = snapPx(camY * 0.75);
    const pat = (theme: number, keep: number, kind: UgLayer): CanvasPattern | null => {
      const key = (theme * UG_KEEPS.length + keep) * 3 + (kind === 'far' ? 1 : kind === 'flat' ? 2 : 0);
      let p = this.ugPats.get(key);
      if (p === undefined) {
        const c = toCanvas(ugThemeBmp(theme, UG_KEEPS[keep], kind)) as HTMLCanvasElement;
        p = ctx.createPattern(c, 'repeat');
        this.ugPats.set(key, p);
      }
      return p;
    };
    const biomeAt = zones?.biomeAt ?? ((): number => 0);
    const xMin = zones?.xMin ?? -Infinity, xMax = zones?.xMax ?? Infinity;
    if (zones?.structures !== this.ugAreaSrc) { this.ugAreaSrc = zones?.structures ?? null; this.ugAreaList = ugAreas(zones?.structures ?? []); }
    const tx0 = Math.floor(camX / tile), tx1 = Math.ceil((camX + vw) / tile);
    const vx0 = camX / tile, vy0 = camY / tile, vx1 = (camX + vw) / tile, vy1 = bottom / tile;
    const areas = this.ugAreaList.filter((a) => a.x - 8 < vx1 && a.x + a.w + 8 > vx0 && a.y - 8 < vy1 && a.y + a.h + 8 > vy0);
    // 相鄰欄的色帶完全一樣（深處 / 同一區）→ 合併成一個寬矩形；先排好所有 run，再分遠 / 近兩趟畫
    const runs = this.ugRuns;
    runs.length = 0;
    // 這一幀（加上四周 UG_COVER_M 的餘裕）每一欄都已經過了地表淡入 → 下一幀的天空 / 遠景可以不畫
    // 欄頂平滑（地表高低差在水裡 / 洞裡不會變成垂直硬邊）；畫面外再多算 UG_COVER_M 給「蓋滿」判定用
    const cx0 = Math.floor((camX - UG_COVER_M) / tile), cx1 = Math.ceil((camX + vw + UG_COVER_M) / tile);
    const tops = smoothTops(colTop, cx0, cx1, tile);
    let covered = true;
    for (let i = 0; i < tops.length && covered; i++) if (tops[i] + UG_FADE > camY - UG_COVER_M) covered = false;
    this.ugCover = covered ? { x: camX, y: camY, w: vw, h: vh } : null;
    const same = (a: UgBand[], b: UgBand[]): boolean => a.length === b.length && a.every((q, i) => q.theme === b[i].theme && q.keep === b[i].keep && q.y0 === b[i].y0 && q.y1 === b[i].y1);
    for (let tx = tx0; tx <= tx1; tx++) {
      const y0 = snapPx(tops[tx - cx0]), x = tx * tile;
      if (y0 >= bottom) continue;
      const bands = ugColumnBands({
        tx, top: y0, fade: UG_FADE, rockY: cavernY, deepY, moltenY, viewTop: camY, viewBottom: bottom, tile, biomeAt, xMin, xMax, areas,
      });
      const last = runs[runs.length - 1];
      if (last && last.x + last.w === x && same(last.bands, bands)) { last.w += tile; continue; }
      runs.push({ x, w: tile, bands });
    }
    const pass = (far: boolean, ox: number, oy: number): void => {
      // 遠層圖樣再錯開半塊多：近 / 遠兩層的接縫不會對齊（重複感更低）
      if (far) { ox += 53; oy += 37; }
      ctx.save();
      ctx.translate(ox, oy);
      for (const r of runs) for (const b of r.bands) {
        if (far && b.fade) continue;
        const p = pat(b.theme, b.keep, far ? 'far' : b.fade ? 'flat' : 'near');
        if (!p) continue;
        ctx.fillStyle = p;
        ctx.fillRect(r.x - ox, b.y0 - oy, r.w, b.y1 - b.y0);
      }
      ctx.restore();
    };
    pass(true, fx, fy);
    pass(false, nx, ny);
  }
}
