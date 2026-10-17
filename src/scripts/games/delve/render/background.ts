// background.ts — 分層視差背景（全部以原生像素烘焙，繪製時整數倍放大）：
//   天空（時段漸層 + 抖動色帶）→ 星星 → 日 / 月 → 飄雲 → 遠山 / 中丘 / 近林剪影（依時段重新上色）
//   以及地下背景（土層 / 岩層兩種暗紋，依深度淡入）。
import { Bmp, bayer, h01, hex, mix, nudge, snap, toCanvas, type RGB } from './pixel';
import { snapPx } from './lowres';
import { dayness as dayAmount, skyColors, type SkyColors } from './scene';
import { bgSeasonDark, bgSeasonDay, bgSeasonLite } from './seasonLook';
import { boltBmp, moonPhaseBmp } from './seasonArt';
import type { Season } from '../engine/calendar';

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
/** 2×2 成簇的 Bayer 遮罩（過渡時把另一區的剪影以 25% / 50% 密度疊上，不用半透明） */
function maskedLayer(src: IndexedLayer, t: number): IndexedLayer {
  const L = new IndexedLayer(src.w, src.h);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
    const i = y * src.w + x;
    if (src.idx[i] && bayer(x >> 1, y >> 1) < t) L.idx[i] = src.idx[i];
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
type BackdropKind = boolean | 'deep' | 'molten';
const BACKDROP_PAL: Record<string, string[]> = {
  rock: ['#0b0b11', '#121219', '#181821', '#1e1e29'],
  dirt: ['#0e0907', '#160e0a', '#1d140e', '#241a12'],
  // 洞穴層：偏藍紫的深色岩面；熔岩深淵：暗紅褐（遠處熔岩的反光）
  deep: ['#0c0a12', '#0c0a12', '#18204a', '#1c1424'],
  molten: ['#2a1810', '#472819', '#6c1e14', '#472819'],
};
function caveBackdrop(kind: BackdropKind, keep = 1): HTMLCanvasElement {
  const N = 64, b = new Bmp(N, N);
  const rock = kind !== false;
  const pal = BACKDROP_PAL[kind === true ? 'rock' : kind === false ? 'dirt' : kind].map(hex);
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
  /** 生態區過渡：a = 本區、b = 鄰區、t = 鄰區比例（0 / 0.25 / 0.5） */
  biome?: { a: number; b: number; t: number };
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

export class Background {
  /** 每個生態區的遠 / 中 / 近三層剪影 */
  private sets: IndexedLayer[][] = [];
  private masked = new Map<string, IndexedLayer>();
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
  private ugPats: (CanvasPattern | null)[] | null = null;
  readonly dirtCave = caveBackdrop(false);
  readonly rockCave = caveBackdrop(true);
  readonly deepCave = caveBackdrop('deep');
  readonly moltenCave = caveBackdrop('molten');
  /** 土層淡入：4 階 Bayer 挖空的同一張紋理 */
  private dirtFade = [0.2, 0.4, 0.6, 0.8].map((k) => caveBackdrop(false, k));
  private cloudSeed: number;

  constructor(seed: number) {
    this.sets[0] = [buildMountains(seed), buildHills(seed + 1), buildForest((seed % 1000) / 100 + 1)];
    this.sets[1] = [buildMesas(seed + 2), buildDunes(seed + 3, 110, 14, 40), buildDesertNear(seed + 4)];
    this.sets[2] = [buildMountains(seed + 5, 48), buildHills(seed + 6, true), buildPines(seed + 7)];
    this.sets[3] = [buildKarst(seed + 8), buildCanopy(seed + 9), buildJungleNear(seed + 10)];
    this.winterSet = [buildMountains(seed, 60), buildHills(seed + 1, true), this.sets[0][2]];
    for (let i = 0; i < 5; i++) this.clouds.push(cloudLayer(i));
    for (let l = 1; l <= 4; l++) this.stars.push(toCanvas(starsBmp(seed, l)) as HTMLCanvasElement);
    this.cloudSeed = seed;
  }

  /** 在低解析緩衝（identity transform，1 單位 = 1 美術 px）畫天空與遠景 */
  draw(ctx: CanvasRenderingContext2D, v: BgView): void {
    const sr = v.sunrise ?? 0.25, ss = v.sunset ?? 0.75, tw = v.twilight ?? 0.05;
    const wx = v.weather ?? { kind: 'clear', intensity: 0, flash: 0, wind: 0 };
    const sky = skyColors(v.dayFrac, sr, ss, tw, wx);
    const cover = (CLOUD_COVER[wx.kind] ?? 0) * wx.intensity, haze = (HAZE[wx.kind] ?? 0) * wx.intensity;
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
    // 日 / 月：太陽沿弧線從日出走到日落（日出前 / 日落後一個曙暮光內還在地平線附近），月亮從日落走到隔天日出
    const d = v.dayFrac;
    const sunUp = d > sr - tw && d < ss + tw;
    const nightLen = 1 - (ss - sr);
    const a = sunUp ? (d - sr) / (ss - sr) : (((d - ss) % 1) + 1) % 1 / nightLen;
    const aa = Math.max(-0.1, Math.min(1.1, a));
    const bx = W * (0.1 + 0.8 * Math.max(0, Math.min(1, aa))), by = Hh * (0.46 - 0.38 * Math.sin(Math.PI * aa));
    const img = sunUp ? this.sun : this.moons[(v.moon ?? 4) & 7] ?? this.moon;
    // 厚雲 / 雨雪：看不到日月
    if (cover < 0.7) ctx.drawImage(img, snapPx(bx - img.width / 2), snapPx(by - img.height / 2));
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
    const k3 = `${L[0].join()}|${L[1].join()}|${L[2].join()}|${bottom.join()}`;
    void k3;
    // 生態區：白天往該區基色靠（夜裡仍是時段色），兩區之間依 t 分階混色
    const bm = v.biome ?? { a: 0, b: 0, t: 0 };
    const dayness = dayAmount(v.dayFrac, sr, ss, tw);
    // 陰天時生態區 / 季節的色調變淡（往灰色天光靠）
    const w = (0.12 + 0.78 * dayness) * (1 - 0.45 * cover);
    // 森林（生態區 0）的季節色：上一季 → 這一季分階混合
    const sb = v.season;
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
    const tint = (biome: number, k: number): RGB => {
      const day = col(BIOME_DAY, bgSeasonDay, biome, k);
      return day ? snap(mix(L[k], day, w)) : L[k];
    };
    const light = (biome: number, k: number, base: RGB): RGB => {
      const c = col(BIOME_LITE, bgSeasonLite, biome, k);
      return c ? snap(mix(lite(base, bottom), c, w)) : lite(base, bottom);
    };
    const shade = (biome: number, k: number): RGB => {
      const dark = col(BIOME_DARK, bgSeasonDark, biome, k);
      return dark ? snap(mix(nudge(L[k], -1), dark, w)) : nudge(L[k], -1);
    };
    // 霧 / 雨：遠的層整層換成霧灰（分階，不做中間色 → 不會吸附到怪色）；遠山門檻低、中丘高、近林不變
    const FOG: [string, string, string][] = [['#b4b9c8', '#cceaf8', '#858aa0'], ['#858aa0', '#b4b9c8', '#707490']];
    const fogAt = [0.3, 0.55];
    const fogged = (c: RGB, k: number, role = 0): RGB => {
      if (k > 1 || haze < fogAt[k]) return c;
      return snap(mix(L[k], hex(FOG[k][role]), 0.2 + 0.8 * dayness));
    };
    const winter = sb ? (sb.season === 3 ? sb.t >= 0.5 : sb.prev === 3 && sb.t < 0.5) : false;
    const factors: [number, number][] = [[0.12, layerY(0.22, 30)], [0.28, layerY(0.42, 22)], [0.5, layerY(0.62, -14)]];
    for (let k = 0; k < 3; k++) {
      const base = fogged(bm.t > 0 ? snap(mix(tint(bm.a, k), tint(bm.b, k), bm.t)) : tint(bm.a, k), k);
      const dk = fogged(bm.t > 0 ? snap(mix(shade(bm.a, k), shade(bm.b, k), bm.t)) : shade(bm.a, k), k, 2);
      const white: RGB = [255, 255, 255];
      const snowA = snap(mix(base, white, 0.25 + 0.45 * dayness)), snowB = snap(mix(base, white, 0.35 + 0.65 * dayness));
      const lt = fogged(bm.t > 0 ? snap(mix(light(bm.a, k, base), light(bm.b, k, base), bm.t)) : light(bm.a, k, base), k, 1);
      const pal: RGB[] = [BLACK, base, lt === base ? nudge(base, 1) : lt, dk === base ? nudge(base, -1) : dk, snowA === base ? nudge(base, 1) : snowA, snowB];
      const key = pal.map((c) => c.join()).join('|');
      const A = (bm.a === 0 && winter ? this.winterSet[k] : this.sets[bm.a]?.[k]) ?? this.sets[0][k];
      A.paint(pal, key);
      this.layer(ctx, A, factors[k][0], factors[k][1], base, W, Hh, v);
      if (bm.t > 0 && bm.b !== bm.a) {
        const mk = `${bm.b}:${k}:${bm.t}`;
        let B = this.masked.get(mk);
        if (!B) { B = maskedLayer(this.sets[bm.b]?.[k] ?? this.sets[0][k], bm.t); this.masked.set(mk, B); }
        B.paint(pal, key);
        this.layer(ctx, B, factors[k][0], factors[k][1], base, W, Hh, v, false);
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
    if (doFill && bottomY < Hh) { ctx.fillStyle = `rgb(${fill.join(',')})`; ctx.fillRect(0, bottomY, W, Hh - bottomY); }
  }

  /**
   * 世界座標下畫地下背景（呼叫端已設好世界 transform）。逐 tile 欄從「該欄地表 + depth」開始，
   * 前 64 px 用 4 階 Bayer 挖空淡入（不用半透明），cavernY 起換岩層紋。
   */
  drawUnderground(ctx: CanvasRenderingContext2D, camX: number, camY: number, vw: number, vh: number,
    colTop: (tx: number) => number, tile: number, cavernY: number, deepY = Infinity, moltenY = Infinity): void {
    const bottom = camY + vh + 1;
    const fade = 64, step = fade / 4;
    if (!this.ugPats) this.ugPats = [...this.dirtFade, this.dirtCave, this.rockCave, this.deepCave, this.moltenCave].map((img) => ctx.createPattern(img, 'repeat'));
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
      band(5, x, Math.max(y0, cavernY), deepY);
      band(6, x, Math.max(y0, deepY), moltenY);
      band(7, x, Math.max(y0, moltenY), Infinity);
    }
  }
}
