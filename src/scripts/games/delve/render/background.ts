// background.ts — 分層視差背景（全部以原生像素烘焙，繪製時整數倍放大）：
//   天空（時段漸層 + 抖動色帶）→ 星星 → 日 / 月 → 飄雲 → 遠山 / 中丘 / 近林剪影（依時段重新上色）
//   以及地下背景（土層 / 岩層兩種暗紋，依深度淡入）。
import { Bmp, bayer, h01, hex, mix, nudge, snap, toCanvas, type RGB } from './pixel';
import { snapPx } from './lowres';
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
      if (slope < -0.6 && depth > 1 && depth < 22) k = 3; // 背光坡：實心暗面（不撒點）
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
      // 受光坡頂一道 2px 實心亮邊；深處一條實心暗帶（不用點狀抖動，剪影更乾淨）
      if (depth < 2) k = slope >= 0 ? 2 : 1;
      if (depth > 36) k = 3;
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

/** 地下背景暗紋（64×64 可平鋪）：大塊岩面 + 縫。keep < 1 時以 2×2 Bayer 挖空（淡入用，不用半透明） */
function caveBackdrop(rock: boolean, keep = 1): HTMLCanvasElement {
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
    if (keep < 1 && bayer(x >> 1, y >> 1) >= keep) continue;
    b.set(x, y, pal[k]);
  }
  return toCanvas(b) as HTMLCanvasElement;
}

export interface BgView {
  /** 低解析緩衝大小（美術 px = 世界 px） */
  viewW: number; viewH: number;
  /** 已對齊整數的鏡頭左上角（世界 px） */
  camX: number; camY: number;
  /** 地平線（世界 px，地表線） */
  horizonY: number;
  time: number;
  dayFrac: number;
}

const BLACK: RGB = [0, 0, 0];

export class Background {
  private mountains: IndexedLayer;
  private hills: IndexedLayer;
  private forest: IndexedLayer;
  private clouds: IndexedLayer[] = [];
  private sun = toCanvas(sunBmp()) as HTMLCanvasElement;
  private moon = toCanvas(moonBmp()) as HTMLCanvasElement;
  /** stars[level-1]：level 1..4 顆數遞增 */
  private stars: HTMLCanvasElement[] = [];
  private skyStrip = document.createElement('canvas');
  private skyKey = '';
  /** 圖樣快取：每幀重建 CanvasPattern 很貴（會複製來源畫布） */
  private skyPat: CanvasPattern | null = null;
  private ugPats: (CanvasPattern | null)[] | null = null;
  readonly dirtCave = caveBackdrop(false);
  readonly rockCave = caveBackdrop(true);
  /** 土層淡入：4 階 Bayer 挖空的同一張紋理 */
  private dirtFade = [0.2, 0.4, 0.6, 0.8].map((k) => caveBackdrop(false, k));
  private cloudSeed: number;

  constructor(seed: number) {
    this.mountains = buildMountains(seed);
    this.hills = buildHills(seed + 1);
    this.forest = buildForest((seed % 1000) / 100 + 1);
    for (let i = 0; i < 5; i++) this.clouds.push(cloudLayer(i));
    for (let l = 1; l <= 4; l++) this.stars.push(toCanvas(starsBmp(seed, l)) as HTMLCanvasElement);
    this.cloudSeed = seed;
  }

  /** 在低解析緩衝（identity transform，1 單位 = 1 美術 px）畫天空與遠景 */
  draw(ctx: CanvasRenderingContext2D, v: BgView): void {
    const sky = skyColors(v.dayFrac);
    const W = v.viewW, Hh = v.viewH;
    ctx.imageSmoothingEnabled = false;
    this.drawSky(ctx, sky, W, Hh);
    // 星星：依亮度挑 1..4 層（每顆星不透明，只有出現 / 不出現）
    const sl = Math.round(sky.stars * 4);
    if (sl > 0) {
      const st = this.stars[sl - 1];
      const sw = st.width, sh = st.height;
      const ox = -(((snapPx(v.camX * 0.02) % sw) + sw) % sw);
      for (let y = 0; y < Hh * 0.75; y += sh) for (let x = ox; x < W; x += sw) ctx.drawImage(st, x, y);
    }
    // 日 / 月
    const d = v.dayFrac;
    const sunUp = d > 0.2 && d < 0.8;
    const arc = sunUp ? (d - 0.2) / 0.6 : ((d + 0.2) % 1) / 0.4;
    const a = Math.min(1, Math.max(0, arc));
    const bx = W * (0.1 + 0.8 * a), by = Hh * (0.46 - 0.34 * Math.sin(Math.PI * a));
    const img = sunUp ? this.sun : this.moon;
    ctx.drawImage(img, snapPx(bx - img.width / 2), snapPx(by - img.height / 2));
    // 雲：色票上的三階（暗底 / 中 / 亮頂），完全不透明
    const base = snap(sky.cloud);
    const cpal: RGB[] = [BLACK, nudge(base, -1), base, nudge(base, 1)];
    const ckey = cpal.map((c) => c.join()).join('|');
    const span = W + 240;
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      c.paint(cpal, ckey);
      const speed = 3 + i * 1.3;
      const b0 = h01(i, 1, this.cloudSeed) * span;
      const cx = (((b0 + v.time * speed - v.camX * 0.04) % span) + span) % span - 120;
      const cy = 18 + h01(i, 2, this.cloudSeed) * Hh * 0.28 + i * 7;
      ctx.drawImage(c.canvas, snapPx(cx), snapPx(cy));
    }
    // 三層視差剪影（每層色票：基色 + 色票上相鄰的亮 / 暗階）
    const midY = v.camY + (v.viewH / 2);
    const layerY = (f: number, lift: number): number => snapPx((v.viewH / 2) + (v.horizonY - midY) * f - lift);
    const L = sky.layers.map(snap) as [RGB, RGB, RGB];
    const bottom = snap(sky.bottom);
    const lite = (c: RGB, toward: RGB): RGB => { const m = snap(mix(c, toward, 0.4)); return m === c ? nudge(c, 1) : m; };
    const k3 = `${L[0].join()}|${L[1].join()}|${L[2].join()}|${bottom.join()}`;
    const snowA = nudge(nudge(L[0], 1), 1), snowB = snap([255, 255, 255]);
    this.mountains.paint([BLACK, L[0], lite(L[0], bottom), nudge(L[0], -1), snowA, snowB], 'm' + k3);
    this.hills.paint([BLACK, L[1], lite(L[1], bottom), nudge(L[1], -1)], 'h' + k3);
    this.forest.paint([BLACK, L[2], lite(L[2], bottom)], 'f' + k3);
    this.layer(ctx, this.mountains, 0.12, layerY(0.22, 30), L[0], W, Hh, v);
    this.layer(ctx, this.hills, 0.28, layerY(0.42, 22), L[1], W, Hh, v);
    this.layer(ctx, this.forest, 0.5, layerY(0.62, -14), L[2], W, Hh, v);
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

  private layer(ctx: CanvasRenderingContext2D, L: IndexedLayer, factor: number, bottomY: number, fill: RGB, W: number, Hh: number, v: BgView): void {
    const top = bottomY - L.h;
    if (top > Hh) return;
    const sw = L.w;
    const off = -(((snapPx(v.camX * factor) % sw) + sw) % sw);
    for (let x = off; x < W; x += sw) ctx.drawImage(L.canvas, x, top);
    if (bottomY < Hh) { ctx.fillStyle = `rgb(${fill.join(',')})`; ctx.fillRect(0, bottomY, W, Hh - bottomY); }
  }

  /**
   * 世界座標下畫地下背景（呼叫端已設好世界 transform）。逐 tile 欄從「該欄地表 + depth」開始，
   * 前 64 px 用 4 階 Bayer 挖空淡入（不用半透明），cavernY 起換岩層紋。
   */
  drawUnderground(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number,
    colTop: (tx: number) => number, tile: number, cavernY: number): void {
    const bottom = camY + vh + 1;
    const fade = 64, step = fade / 4;
    if (!this.ugPats) this.ugPats = [...this.dirtFade, this.dirtCave, this.rockCave].map((img) => ctx.createPattern(img, 'repeat'));
    const pats = this.ugPats;
    // 視差 0.5：圖樣隨鏡頭半速移動（對齊整數美術 px）
    const m = new DOMMatrix([1, 0, 0, 1, snapPx(camX * 0.5), snapPx(camY * 0.5)]);
    for (const p of pats) p?.setTransform(m);
    const band = (pi: number, x: number, from: number, to: number): void => {
      const a = Math.max(from, camY), b2 = Math.min(to, bottom);
      const p = pats[pi];
      if (b2 <= a || !p) return;
      ctx.fillStyle = p;
      ctx.fillRect(x, a, tile, b2 - a);
    };
    const tx0 = Math.floor(camX / tile), tx1 = Math.ceil((camX + vw) / tile);
    for (let tx = tx0; tx <= tx1; tx++) {
      const y0 = snapPx(colTop(tx)), x = tx * tile;
      if (y0 >= bottom) continue;
      for (let i = 0; i < 4; i++) band(i, x, y0 + i * step, Math.min(cavernY, y0 + (i + 1) * step));
      band(4, x, y0 + fade, cavernY);
      band(5, x, Math.max(y0, cavernY), Infinity);
    }
  }
}
