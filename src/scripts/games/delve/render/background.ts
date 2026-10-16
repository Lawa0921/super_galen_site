// background.ts — 分層視差背景（全部以原生像素烘焙，繪製時整數倍放大）：
//   天空（時段漸層 + 抖動色帶）→ 星星 → 日 / 月 → 飄雲 → 遠山 / 中丘 / 近林剪影（依時段重新上色）
//   以及地下背景（土層 / 岩層兩種暗紋，依深度淡入）。
import { Bmp, bayer, h01, hex, mix, shade, toCanvas, type RGB } from './pixel';
import { skyColors, type SkyColors } from './scene';

const STRIP_W = 640;

/** 以索引圖存的剪影層：重新上色只要重填 ImageData */
class IndexedLayer {
  readonly idx: Uint8Array;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: ImageData | null = null;
  private key = '';
  constructor(readonly w: number, readonly h: number) {
    this.idx = new Uint8Array(w * h);
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
  }
  /** pal[0] 不用（透明）；key 相同就不重畫 */
  paint(pal: RGB[], key: string): void {
    if (key === this.key || !this.ctx) return;
    this.key = key;
    if (!this.img) this.img = this.ctx.createImageData(this.w, this.h);
    const d = this.img.data, n = this.w * this.h;
    for (let i = 0; i < n; i++) {
      const k = this.idx[i], o = i * 4;
      if (!k) { d[o + 3] = 0; continue; }
      const c = pal[k];
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

/** 遠山：尖峰山脊（|sin| 反轉疊加）+ 只有最高峰積雪 + 左側受光 */
function buildMountains(seed: number): IndexedLayer {
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
    const sb = (hx - 92) / 3.2, snow = sb > 0 ? sb + (h01(x >> 1, 1, seed) - 0.5) * 2 : 0;
    for (let y = Math.max(0, top); y < H; y++) {
      const depth = y - top;
      let k = slope > 0.15 ? 2 : 1;                        // 朝左（受光）的坡 / 背光坡
      if (slope < -0.6 && depth > 1 && depth < 26 && bayer(x, y) > 0.55) k = 3; // 背光坡加深（抖動）
      if (depth > 34) k = 1;
      if (depth < snow) k = slope > 0.15 ? 5 : 4;          // 雪
      L.idx[y * STRIP_W + x] = k;
    }
  }
  return L;
}

/** 中丘：圓緩丘陵 + 稀疏樹叢鼓包 */
function buildHills(seed: number): IndexedLayer {
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
      if (depth < 2) k = slope >= 0 ? 2 : 1;
      else if (depth < 8 && slope > 0 && bayer(x, y) > 0.4) k = 2;
      if (depth > 30 && bayer(x, y) > 0.5) k = 3;
      L.idx[y * STRIP_W + x] = k;
    }
  }
  return L;
}

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
  const R = 26, b = new Bmp(R * 2, R * 2), core = hex('#fffbe4'), mid = hex('#ffec9a'), rim = hex('#ffd462');
  for (let y = 0; y < R * 2; y++) for (let x = 0; x < R * 2; x++) {
    const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
    if (d < 13) b.set(x, y, d < 10 ? core : mid);
    else if (d < 14) b.set(x, y, rim);
    else if (d < 18) b.set(x, y, mid, 70);
    else if (d < 22 && bayer(x, y) > 0.5) b.set(x, y, mid, 50);
    else if (d < R && bayer(x, y) > 0.85) b.set(x, y, mid, 40);
  }
  return b;
}
function moonBmp(): Bmp {
  const N = 32, b = new Bmp(N, N), lit = hex('#f2f4fa'), mid = hex('#cfd5e4'), dark = hex('#a3abc2'), glow = hex('#c8d4ff');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
    if (d > 10) { if (d < 14 && bayer(x, y) > 0.7) b.set(x, y, glow, 40); continue; }
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
function starsBmp(seed: number): Bmp {
  const W = 320, H = 180, b = new Bmp(W, H), w = hex('#ffffff'), bl = hex('#c8d8ff'), y = hex('#fff0c0');
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(h01(i, 1, seed) * W), yy = Math.floor(h01(i, 2, seed) * H);
    const r = h01(i, 3, seed), c = r > 0.66 ? w : r > 0.33 ? bl : y;
    b.set(x, yy, c, 120 + Math.floor(h01(i, 4, seed) * 135));
    if (r > 0.93) { b.set(x - 1, yy, c, 110); b.set(x + 1, yy, c, 110); b.set(x, yy - 1, c, 110); b.set(x, yy + 1, c, 110); }
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

/** 地下背景暗紋（64×64 可平鋪）：大塊岩面 + 縫 */
function caveBackdrop(rock: boolean): HTMLCanvasElement {
  const N = 64, b = new Bmp(N, N);
  const pal = rock
    ? [hex('#0b0b11'), hex('#121219'), hex('#181821'), hex('#1e1e29')]
    : [hex('#0e0907'), hex('#160e0a'), hex('#1d140e'), hex('#241a12')];
  const pts: [number, number][] = [];
  for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) pts.push([(gx + 0.2 + h01(gx, gy, rock ? 3 : 4) * 0.6) * 16, (gy + 0.2 + h01(gx, gy, rock ? 5 : 6) * 0.6) * 16]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0;
    for (const [px0, py0] of pts) for (let oy = -N; oy <= N; oy += N) for (let ox = -N; ox <= N; ox += N) {
      const d = Math.hypot(x + 0.5 - px0 - ox, y + 0.5 - py0 - oy);
      if (d < d1) { d2 = d1; d1 = d; cx = px0 + ox; cy = py0 + oy; } else if (d < d2) d2 = d;
    }
    const e = d2 - d1;
    let k = 2;
    if (e < 1.2) k = 0;
    else if (e < 3) k = (x - cx) + (y - cy) < 0 ? 3 : 1;
    b.set(x, y, pal[k]);
  }
  return toCanvas(b) as HTMLCanvasElement;
}

export interface BgView {
  /** CSS px 視窗大小 */
  viewW: number; viewH: number;
  /** 每個美術像素佔多少裝置像素 */
  unit: number; dpr: number;
  camX: number; camY: number;
  /** 世界視窗大小（美術像素） */
  vw: number; vh: number;
  /** 地平線（世界 px，地表線） */
  horizonY: number;
  time: number;
  dayFrac: number;
}

export class Background {
  private mountains: IndexedLayer;
  private hills: IndexedLayer;
  private forest: IndexedLayer;
  private clouds: IndexedLayer[] = [];
  private sun = toCanvas(sunBmp()) as HTMLCanvasElement;
  private moon = toCanvas(moonBmp()) as HTMLCanvasElement;
  private stars: HTMLCanvasElement;
  private skyStrip = document.createElement('canvas');
  private skyKey = '';
  readonly dirtCave = caveBackdrop(false);
  readonly rockCave = caveBackdrop(true);
  private cloudSeed: number;

  constructor(seed: number) {
    this.mountains = buildMountains(seed);
    this.hills = buildHills(seed + 1);
    this.forest = buildForest((seed % 1000) / 100 + 1);
    for (let i = 0; i < 5; i++) this.clouds.push(cloudLayer(i));
    this.stars = toCanvas(starsBmp(seed)) as HTMLCanvasElement;
    this.cloudSeed = seed;
  }

  /** 螢幕座標（裝置 px）繪製天空與遠景；呼叫前 transform 為 identity */
  draw(ctx: CanvasRenderingContext2D, v: BgView): void {
    const sky = skyColors(v.dayFrac);
    const u = v.unit;
    const W = Math.ceil(v.viewW * v.dpr), Hh = Math.ceil(v.viewH * v.dpr);
    this.drawSky(ctx, sky, u, W, Hh, v);
    ctx.imageSmoothingEnabled = false;
    // 星星
    if (sky.stars > 0.01) {
      ctx.globalAlpha = sky.stars;
      const sw = this.stars.width * u, sh = this.stars.height * u;
      const ox = -((v.camX * 0.02 * u) % sw);
      for (let y = 0; y < Hh * 0.75; y += sh) for (let x = ox - sw; x < W; x += sw) ctx.drawImage(this.stars, Math.round(x), Math.round(y), sw, sh);
      ctx.globalAlpha = 1;
    }
    // 日 / 月
    const d = v.dayFrac;
    const sunUp = d > 0.2 && d < 0.8;
    const arc = sunUp ? (d - 0.2) / 0.6 : ((d + 0.2) % 1) / 0.4;
    const a = Math.min(1, Math.max(0, arc));
    const bx = W * (0.1 + 0.8 * a), by = Hh * (0.46 - 0.34 * Math.sin(Math.PI * a));
    const img = sunUp ? this.sun : this.moon;
    ctx.drawImage(img, Math.round(bx - (img.width * u) / 2), Math.round(by - (img.height * u) / 2), img.width * u, img.height * u);
    // 雲
    const ckey = sky.cloud.join(',');
    const cpal: RGB[] = [[0, 0, 0], shade(sky.cloud, 0.78), shade(sky.cloud, 0.9), mix(sky.cloud, [255, 255, 255], 0.35)];
    const span = W / u + 240;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.paint(cpal.map((q) => mix(q, sky.top, 0.12)) as RGB[], ckey);
      const speed = 3 + i * 1.3;
      const base = h01(i, 1, this.cloudSeed) * span;
      const cx = (((base + v.time * speed - v.camX * 0.04) % span) + span) % span - 120;
      const cy = 18 + h01(i, 2, this.cloudSeed) * (Hh / u) * 0.28 + i * 7;
      ctx.globalAlpha = 0.92 - sky.stars * 0.45;
      ctx.drawImage(c.canvas, Math.round(cx * u), Math.round(cy * u), c.w * u, c.h * u);
    }
    ctx.globalAlpha = 1;
    // 三層視差剪影
    const midY = v.camY + v.vh / 2;
    const layerY = (f: number, lift: number): number => (v.vh / 2 + (v.horizonY - midY) * f - lift) * u;
    const L = sky.layers;
    const tint = (c: RGB, k: number): RGB => shade(c, k);
    const k3 = `${L[0].join()}|${L[1].join()}|${L[2].join()}`;
    this.mountains.paint([[0, 0, 0], L[0], mix(L[0], sky.bottom, 0.32), tint(L[0], 0.88), mix(L[0], [255, 255, 255], 0.55), mix(L[0], [255, 255, 255], 0.75)], 'm' + k3);
    this.hills.paint([[0, 0, 0], L[1], mix(L[1], sky.bottom, 0.25), tint(L[1], 0.9)], 'h' + k3);
    this.forest.paint([[0, 0, 0], L[2], mix(L[2], sky.bottom, 0.18)], 'f' + k3);
    this.layer(ctx, this.mountains, 0.12, layerY(0.22, 30), L[0], u, W, Hh, v);
    this.layer(ctx, this.hills, 0.28, layerY(0.42, 22), L[1], u, W, Hh, v);
    this.layer(ctx, this.forest, 0.5, layerY(0.62, -14), L[2], u, W, Hh, v);
  }

  private drawSky(ctx: CanvasRenderingContext2D, sky: SkyColors, u: number, W: number, Hh: number, v: BgView): void {
    // 12 段色帶 + 段間 2px 抖動，烘成 4 px 寬的條帶後橫向重複
    const rows = Math.max(1, Math.ceil(Hh / u));
    const key = `${sky.top.join()}|${sky.bottom.join()}|${rows}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const b = new Bmp(4, rows), bands = 12;
      for (let y = 0; y < rows; y++) {
        const t = Math.pow(y / Math.max(1, rows - 1), 1.25) * bands;
        for (let x = 0; x < 4; x++) {
          const f = t - Math.floor(t);
          const band = Math.floor(t) + (f > 0.8 && bayer(x, y) < (f - 0.8) * 5 ? 1 : 0);
          b.set(x, y, mix(sky.top, sky.bottom, Math.min(bands, band) / bands));
        }
      }
      this.skyStrip = toCanvas(b) as HTMLCanvasElement;
    }
    const pat = ctx.createPattern(this.skyStrip, 'repeat-x');
    ctx.imageSmoothingEnabled = false;
    if (pat) {
      ctx.save();
      ctx.scale(u, u);
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W / u + 1, rows);
      ctx.restore();
    } else {
      ctx.fillStyle = `rgb(${sky.top.join(',')})`;
      ctx.fillRect(0, 0, W, Hh);
    }
    void v;
  }

  private layer(ctx: CanvasRenderingContext2D, L: IndexedLayer, factor: number, bottomY: number, fill: RGB, u: number, W: number, Hh: number, v: BgView): void {
    const top = Math.round(bottomY - L.h * u);
    if (top > Hh) return;
    const sw = L.w * u;
    const off = -(((v.camX * factor * u) % sw) + sw) % sw;
    for (let x = off; x < W; x += sw) ctx.drawImage(L.canvas, Math.round(x), top, sw, L.h * u);
    const b = Math.round(bottomY);
    if (b < Hh) { ctx.fillStyle = `rgb(${fill.join(',')})`; ctx.fillRect(0, b, W, Hh - b); }
  }

  /** 世界座標下畫地下背景（呼叫端已設好世界 transform）：y0 起淡入，cavernY 起換岩層紋 */
  drawUnderground(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number, y0: number, cavernY: number): void {
    const bottom = camY + vh + 1;
    if (bottom <= y0) return;
    const fade = 64;
    const drawBand = (img: HTMLCanvasElement, from: number, to: number, alpha: number): void => {
      const a = Math.max(from, camY), b2 = Math.min(to, bottom);
      if (b2 <= a) return;
      const pat = ctx.createPattern(img, 'repeat');
      if (!pat) return;
      // 視差 0.5：圖樣隨鏡頭半速移動
      pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(camX * 0.5), Math.round(camY * 0.5)]));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pat;
      ctx.fillRect(Math.floor(camX), a, vw + 2, b2 - a);
    };
    for (let i = 0; i < 4; i++) drawBand(this.dirtCave, y0 + (i * fade) / 4, y0 + ((i + 1) * fade) / 4, (i + 1) / 5);
    drawBand(this.dirtCave, y0 + fade, cavernY, 1);
    drawBand(this.rockCave, cavernY, Infinity, 1);
    ctx.globalAlpha = 1;
  }
}
