// underground.ts — 地下背景（純邏輯 + 純資料 Bmp，無 DOM）：
//   · ugThemeBmp：每種主題一張 64×64 可平鋪的暗紋（全部取自統一色票）；keep < 1 = 2×2 成簇 Bayer 挖空
//     （淡入 / 交界抖動用，不用半透明；keep 小的挖空是 keep 大的子集）
//   · ugColumnBands：一欄 tile 從上到下要畫哪些主題、哪個 keep —— 土 / 岩依該欄生態區換成
//     砂岩層理 / 碎冰 / 泥巴垂根，生態區交界兩側幾欄疊上鄰區主題的抖動層；菇林（橢圓）與地城（矩形）
//     不分深度整段覆蓋，外緣 3 圈遞減的抖動邊。
import { Bmp, bayer, h01, hex, type RGB } from './pixel';

export const UG = { DIRT: 0, ROCK: 1, DEEP: 2, MOLTEN: 3, SAND: 4, ICE: 5, MUD: 6, SPORE: 7, BRICK: 8, COUNT: 9 } as const;
/** keep 階（索引 0..4）：淡入四階 + 實心 */
export const UG_KEEPS = [0.2, 0.4, 0.6, 0.8, 1] as const;
const FULL = UG_KEEPS.length - 1;
/** 生態區（BIOME id）→ 土 / 岩層主題（森林 = 土 / 岩各自） */
const BIOME_THEME: Record<number, number> = { 1: UG.SAND, 2: UG.ICE, 3: UG.MUD };
/** 交界抖動：距離另一區 ≤ 2 欄 → 0.4、≤ 4 欄 → 0.2 */
const BORDER_R = 4;
/** 覆蓋區外緣：3 圈、每圈 2 tile */
const RING = 2, RINGS = 3;

export interface UgArea { theme: number; round: boolean; x: number; y: number; w: number; h: number; }
export interface UgBand { theme: number; keep: number; y0: number; y1: number; overlay?: boolean; }
export interface UgColumn {
  /** tile 欄 */
  tx: number;
  /** 該欄背景起點（世界 px，地表 + 若干格）與淡入長度（px） */
  top: number; fade: number;
  /** 土→岩、岩→深層、深層→熔岩 的分界（世界 px） */
  rockY: number; deepY: number; moltenY: number;
  /** 畫面上下緣（世界 px） */
  viewTop: number; viewBottom: number;
  tile: number;
  biomeAt: (tx: number) => number;
  width: number;
  areas: readonly UgArea[];
}

/** 結構清單 → 覆蓋區（菇林 = 橢圓孢子林、地城 = 磚牆） */
export function ugAreas(structures: readonly { kind: string; x: number; y: number; w: number; h: number }[]): UgArea[] {
  const out: UgArea[] = [];
  for (const s of structures) {
    if (s.kind === 'mushroom_biome') out.push({ theme: UG.SPORE, round: true, x: s.x, y: s.y, w: s.w, h: s.h });
    else if (s.kind === 'dungeon') out.push({ theme: UG.BRICK, round: false, x: s.x, y: s.y, w: s.w, h: s.h });
  }
  return out;
}

export function ugColumnBands(c: UgColumn): UgBand[] {
  const out: UgBand[] = [];
  const lo = Math.max(c.top, c.viewTop), hi = c.viewBottom;
  const push = (theme: number, keep: number, y0: number, y1: number, overlay = false): void => {
    const a = Math.max(y0, lo), b = Math.min(y1, hi);
    if (b > a) out.push(overlay ? { theme, keep, y0: a, y1: b, overlay } : { theme, keep, y0: a, y1: b });
  };
  const bio = c.biomeAt(c.tx);
  const upper = (b: number): number => BIOME_THEME[b] ?? UG.DIRT;
  const lower = (b: number): number => BIOME_THEME[b] ?? UG.ROCK;
  const step = c.fade / 4;
  const fadeEnd = Math.min(c.rockY, c.top + c.fade);
  for (let i = 0; i < 4; i++) push(upper(bio), i, c.top + i * step, Math.min(c.rockY, c.top + (i + 1) * step));
  push(upper(bio), FULL, fadeEnd, c.rockY);
  push(lower(bio), FULL, Math.max(c.top, c.rockY), c.deepY);
  push(UG.DEEP, FULL, Math.max(c.top, c.deepY), c.moltenY);
  push(UG.MOLTEN, FULL, Math.max(c.top, c.moltenY), Infinity);
  // 生態區交界：最近的另一區（左右各找 BORDER_R 欄）
  let nd = 0, nb = bio;
  for (let d = 1; d <= BORDER_R && !nd; d++) {
    for (const x of [c.tx - d, c.tx + d]) {
      if (x < 0 || x >= c.width) continue;
      const b = c.biomeAt(x);
      if (b !== bio) { nd = d; nb = b; break; }
    }
  }
  if (nd && upper(nb) !== upper(bio)) {
    const k = nd <= 2 ? 1 : 0;
    push(upper(nb), k, fadeEnd, c.rockY, true);
    push(lower(nb), k, Math.max(c.top, c.rockY), c.deepY, true);
  }
  // 覆蓋區
  const T = c.tile, cx = c.tx + 0.5;
  for (const a of c.areas) {
    if (cx < a.x - RING * RINGS || cx > a.x + a.w + RING * RINGS) continue;
    if (a.round) {
      const ex = a.x + a.w / 2, ey = a.y + a.h / 2, rx = a.w / 2, ry = a.h / 2;
      // 橢圓邊界以 2 欄為一階取樣：相鄰兩欄的色帶相同 → 呼叫端可合併成一個寬矩形（少一半 fillRect）
      const sx = Math.floor(c.tx / 2) * 2 + 1;
      const half = (k: number): number => {
        const rxk = rx + k * RING, ryk = ry + k * RING, t = (sx - ex) / rxk;
        return t * t >= 1 ? 0 : ryk * Math.sqrt(1 - t * t);
      };
      const h0 = half(0);
      if (h0 > 0) push(a.theme, FULL, (ey - h0) * T, (ey + h0) * T, true);
      for (let k = 1; k <= RINGS; k++) {
        const hk = half(k), hp = half(k - 1);
        if (hk <= 0) continue;
        push(a.theme, FULL - 1 - k, (ey - hk) * T, (ey - hp) * T, true);
        push(a.theme, FULL - 1 - k, (ey + hp) * T, (ey + hk) * T, true);
      }
    } else {
      const out0 = Math.max(a.x - cx, cx - (a.x + a.w), 0);
      const ring = out0 > 0 ? Math.ceil(out0 / RING) : 0;
      if (ring === 0) {
        push(a.theme, FULL, a.y * T, (a.y + a.h) * T, true);
        for (let k = 1; k <= RINGS; k++) {
          push(a.theme, FULL - 1 - k, (a.y - k * RING) * T, (a.y - (k - 1) * RING) * T, true);
          push(a.theme, FULL - 1 - k, (a.y + a.h + (k - 1) * RING) * T, (a.y + a.h + k * RING) * T, true);
        }
      } else if (ring <= RINGS) {
        push(a.theme, FULL - 1 - ring, (a.y - ring * RING) * T, (a.y + a.h + ring * RING) * T, true);
      }
    }
  }
  // 被後面實心覆蓋層整段蓋住的帶不用畫（菇林 / 地城裡少畫一半的 fillRect）
  for (let i = out.length - 1; i >= 0; i--) {
    const q = out[i];
    if (q.keep !== FULL || !q.overlay) continue;
    for (let j = i - 1; j >= 0; j--) if (out[j].y0 >= q.y0 && out[j].y1 <= q.y1) { out.splice(j, 1); i--; }
  }
  return out;
}

// ── 主題暗紋 ─────────────────────────────────────────────
const N = 64;
/** 可平鋪的值雜訊（格點在 N 上環繞） */
function pnoise(x: number, y: number, cell: number, seed: number): number {
  const g = N / cell, fx = x / cell, fy = y / cell, gx = Math.floor(fx), gy = Math.floor(fy);
  const tx = fx - gx, ty = fy - gy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (v: number): number => ((v % g) + g) % g;
  const a = h01(w(gx), w(gy), seed), b = h01(w(gx + 1), w(gy), seed), c = h01(w(gx), w(gy + 1), seed), d = h01(w(gx + 1), w(gy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** 可平鋪的 Voronoi：最近點、次近點距離、最近點座標 */
function pvoronoi(x: number, y: number, pts: readonly [number, number][]): { d1: number; d2: number; cx: number; cy: number; i: number } {
  let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0, bi = 0;
  pts.forEach(([px, py], i) => {
    for (let oy = -N; oy <= N; oy += N) for (let ox = -N; ox <= N; ox += N) {
      const d = Math.hypot(x + 0.5 - px - ox, y + 0.5 - py - oy);
      if (d < d1) { d2 = d1; d1 = d; cx = px + ox; cy = py + oy; bi = i; } else if (d < d2) d2 = d;
    }
  });
  return { d1, d2, cx, cy, i: bi };
}
function gridPts(n: number, seed: number): [number, number][] {
  const s = N / n, pts: [number, number][] = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) pts.push([(gx + 0.2 + h01(gx, gy, seed) * 0.6) * s, (gy + 0.2 + h01(gx, gy, seed + 1) * 0.6) * s]);
  return pts;
}
const P = (...cs: string[]): RGB[] => cs.map(hex);

/** 原本的岩面紋（大塊岩面 + 縫）：土 / 岩 / 深層 / 熔岩 */
function rockFaces(b: Bmp, pal: RGB[], seed: number): void {
  const pts = gridPts(4, seed);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = pvoronoi(x, y, pts), e = q.d2 - q.d1;
    let k = 2;
    if (e < 1.2) k = 0;
    else if (e < 3) k = (x - q.cx) + (y - q.cy) < 0 ? 3 : 1;
    b.set(x, y, pal[k]);
  }
}
/** 砂岩層理：高度不一的橫帶（隨 x 緩緩起伏）、帶間暗縫、少數帶頂一道亮線、帶內零星直裂 */
function sandStrata(b: Bmp): void {
  const H = [7, 5, 9, 4, 8, 6, 10, 5, 10];
  const pal = P('#0c0a12', '#1c1424', '#2a1810', '#472819');
  const edges: number[] = [];
  let acc = 0;
  for (const h of H) { edges.push(acc); acc += h; }
  for (let x = 0; x < N; x++) {
    const off = Math.sin((x / N) * Math.PI * 2) * 2.5 + Math.sin((x / N) * Math.PI * 4 + 1.3) * 0.7;
    for (let y = 0; y < N; y++) {
      const yy = (((y + Math.round(off)) % N) + N) % N;
      let band = 0;
      while (band + 1 < edges.length && edges[band + 1] <= yy) band++;
      const iy = yy - edges[band];
      let c = band % 3 === 1 ? pal[2] : pal[1];
      if (iy === 0) c = pal[0];
      else if (iy === 1 && band % 3 === 1) c = pal[3];
      else if (pnoise(x, yy, 8, 51) > 0.72) c = band % 3 === 1 ? pal[1] : pal[2];
      // 直裂：每帶 1–2 條
      const jx = Math.floor(h01(band, 3, 53) * N), jx2 = Math.floor(h01(band, 4, 53) * N);
      if (iy > 0 && (x === jx || (H[band] > 6 && x === jx2))) c = pal[0];
      b.set(x, y, c);
    }
  }
}
/** 碎冰：大塊冰面、暗裂縫、左上一道冷藍受光邊、零星斜向冰光 */
function crackedIce(b: Bmp): void {
  const pal = P('#0c0a12', '#18204a', '#2c4486', '#1c1424', '#2c4486');
  const pts = gridPts(3, 61);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = pvoronoi(x, y, pts), e = q.d2 - q.d1;
    let c = h01(q.i, 2, 63) > 0.7 ? pal[3] : pal[1];
    if (e < 1.1) c = pal[0];
    else if (e < 1.7 && (x - q.cx) + (y - q.cy) < 0 && h01(q.i, 4, 63) > 0.35) c = pal[2];
    // 冰面裡的細裂（短斜線）
    const d = (((x + y * 2) % 23) + 23) % 23;
    if (d === 0 && pnoise(x, y, 16, 65) > 0.62) c = pal[0];
    if (d === 1 && pnoise(x, y, 16, 65) > 0.7 && e > 3) c = pal[4];
    b.set(x, y, c);
  }
}
/** 泥巴：暗泥團塊 + 由上往下垂的根（暗綠芯、左側受光） */
function mudRoots(b: Bmp): void {
  const pal = P('#0c0a12', '#1c1424', '#2a1810', '#16301e', '#214528');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = pnoise(x, y, 8, 71);
    b.set(x, y, n > 0.72 ? pal[2] : n < 0.3 ? pal[0] : pal[1]);
  }
  for (let r = 0; r < 7; r++) {
    let x = Math.floor(h01(r, 1, 73) * N);
    const y0 = Math.floor(h01(r, 2, 73) * N), len = 14 + Math.floor(h01(r, 3, 73) * 26);
    for (let k = 0; k < len; k++) {
      const y = (y0 + k) % N, xx = ((x % N) + N) % N;
      b.set(xx, y, pal[3]);
      if (k < len - 4) b.set((xx + 1) % N, y, pal[k % 9 < 5 ? 4 : 3]);
      if (h01(r, k, 75) > 0.82) x += h01(r, k, 77) > 0.5 ? 1 : -1;
      // 細鬚
      if (k > 4 && k % 7 === 3) { const s = h01(r, k, 79) > 0.5 ? 1 : -1; b.set((xx + 2 * s + N) % N, (y + 1) % N, pal[3]); b.set((xx + 3 * s + N) % N, (y + 2) % N, pal[3]); }
    }
  }
}
/** 孢子林：深藍底、暗斑、幾朵隱約發光的菇（帽 + 一點亮光）與零星孢子 */
function sporeGlow(b: Bmp): void {
  const pal = P('#0c0a12', '#18204a', '#1c1424', '#1f6474', '#2c8692', '#4aaeb0');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = pnoise(x, y, 16, 81);
    b.set(x, y, n < 0.36 ? pal[2] : pal[1]);
  }
  const caps: [number, number, number][] = [[10, 46, 4], [38, 20, 3], [52, 55, 2], [24, 8, 2]];
  for (const [cx, cy, r] of caps) {
    for (let y = cy + 1; y < cy + 5 + r; y++) b.set(cx, y % N, pal[2]);
    for (let dy = -Math.ceil(r * 0.6); dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = dx / r, ny = dy / (r * 0.7 + 0.01);
      if (nx * nx + ny * ny > 1.05) continue;
      b.set((cx + dx + N) % N, (cy + dy + N) % N, dy === 0 ? pal[3] : pal[3]);
    }
    b.set((cx - Math.round(r * 0.4) + N) % N, (cy - Math.max(1, Math.round(r * 0.4)) + N) % N, pal[4]);
  }
  for (let k = 0; k < 14; k++) {
    const x = Math.floor(h01(k, 1, 83) * N), y = Math.floor(h01(k, 2, 83) * N);
    b.set(x, y, k % 5 === 0 ? pal[5] : pal[3]);
  }
}
/** 地城磚：8 px 高的磚列（16 px 寬、隔列錯半塊），兩種暗磚面、黑縫、上緣一道受光 */
function brickWall(b: Bmp): void {
  const pal = P('#0c0a12', '#1c1424', '#2c2450', '#2c2838', '#2c2838');
  for (let y = 0; y < N; y++) {
    const row = Math.floor(y / 8), by = y % 8;
    for (let x = 0; x < N; x++) {
      const xx = (x + (row & 1) * 8) % N, bx = xx % 16, brick = Math.floor(xx / 16);
      const face = h01(brick, row, 91) > 0.5 ? pal[2] : pal[1];
      let c = face;
      if (by === 7 || bx === 15) c = pal[0];
      else if (by === 0) c = face === pal[2] ? pal[4] : pal[3];
      else if (by === 6 || bx === 14) c = face === pal[2] ? pal[1] : pal[0];
      if (by > 1 && by < 6 && h01(xx >> 1, y >> 1, 93) > 0.93) c = pal[0]; // 剝落
      b.set(x, y, c);
    }
  }
}

const BASE = new Map<number, Bmp>();
function themeBase(theme: number): Bmp {
  let b = BASE.get(theme);
  if (b) return b;
  b = new Bmp(N, N);
  switch (theme) {
    case UG.DIRT: rockFaces(b, P('#0c0a12', '#1c1424', '#1c1424', '#2a1810'), 4); break;
    case UG.ROCK: rockFaces(b, P('#0c0a12', '#0c0a12', '#1c1424', '#1c1424'), 3); break;
    case UG.DEEP: rockFaces(b, P('#0c0a12', '#0c0a12', '#18204a', '#1c1424'), 3); break;
    case UG.MOLTEN: rockFaces(b, P('#2a1810', '#472819', '#6c1e14', '#472819'), 3); break;
    case UG.SAND: sandStrata(b); break;
    case UG.ICE: crackedIce(b); break;
    case UG.MUD: mudRoots(b); break;
    case UG.SPORE: sporeGlow(b); break;
    default: brickWall(b);
  }
  BASE.set(theme, b);
  return b;
}
/** 主題暗紋；keep < 1 = 2×2 成簇的 Bayer 挖空 */
export function ugThemeBmp(theme: number, keep: number): Bmp {
  const src = themeBase(theme);
  if (keep >= 1) return src.clone();
  const b = new Bmp(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (bayer(x >> 1, y >> 1) < keep) b.setRaw(x, y, src.raw(x, y));
  return b;
}
