// underground.ts — 地下背景（純邏輯 + 純資料 Bmp，無 DOM）：
//   · ugThemeBmp：每種主題一張 64×64 可平鋪的暗紋（全部取自統一色票）：近層有洞口（透出遠層）、遠層是依深度上色的
//     環境色整片；keep < 1 = 1×1 Bayer 挖空（淡入 / 過渡 / 交界抖動用，不用半透明；keep 小的挖空是 keep 大的子集）
//   · ugColumnBands：一欄 tile 從上到下要畫哪些主題、哪個 keep —— 土 / 岩依該欄生態區換成
//     砂岩層理 / 碎冰 / 泥巴垂根，生態區交界兩側幾欄疊上鄰區主題的抖動層；菇林（橢圓）與地城（矩形）
//     不分深度整段覆蓋，外緣 3 圈遞減的抖動邊。土 / 岩 / 深層 / 熔岩之間是 UG_SEAM 高的 7 階抖動過渡帶（沒有硬接縫）。
import { Bmp, bayer, h01, hex, type RGB } from './pixel';

export const UG = { DIRT: 0, ROCK: 1, DEEP: 2, MOLTEN: 3, SAND: 4, ICE: 5, MUD: 6, SPORE: 7, BRICK: 8, COUNT: 9 } as const;
/** keep 階（索引 0..7）：1/8 … 7/8 + 實心 */
export const UG_KEEPS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1] as const;
const FULL = UG_KEEPS.length - 1;
/** 地表淡入的階數（每階 fade / 8 px） */
export const UG_FADE_STEPS = 8;
/** 土 → 岩 → 深層 → 熔岩 分界的過渡帶高度（px，分界上下各一半）：下一層以 1/8 … 7/8 抖動疊上去 */
export const UG_SEAM = 64;
/** 生態區（BIOME id）→ 土 / 岩層主題（森林 = 土 / 岩各自） */
const BIOME_THEME: Record<number, number> = { 1: UG.SAND, 2: UG.ICE, 3: UG.MUD };
/** 交界抖動：距離另一區 d 欄（1..BORDER_R）→ keep 約 (BORDER_R+1−d) / (2(BORDER_R+1))（邊界上約五五開） */
const BORDER_R = 10;
/** 覆蓋區外緣：3 圈、每圈 2 tile */
const RING = 2, RINGS = 3;

export interface UgArea { theme: number; round: boolean; x: number; y: number; w: number; h: number; }
/** overlay = 疊在別的帶上；fade = 地表淡入（遠層不畫，避免兩層抖動疊成更密） */
export interface UgBand { theme: number; keep: number; y0: number; y1: number; overlay?: boolean; fade?: boolean; }
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
  const step = c.fade / UG_FADE_STEPS;
  const fadeEnd = Math.min(c.rockY, c.top + c.fade);
  for (let i = 0; i < UG_FADE_STEPS; i++) {
    const a = Math.max(lo, c.top + i * step), b = Math.min(hi, c.rockY, c.top + (i + 1) * step);
    if (b > a) out.push({ theme: upper(bio), keep: Math.min(FULL - 1, i), y0: a, y1: b, fade: true });
  }
  // 各層實心帶；相鄰兩層主題不同時，上一層畫到分界帶底、下一層從分界帶頂以遞增的密度疊上（沒有硬接縫）
  const layers: [number, number, number][] = [[upper(bio), fadeEnd, c.rockY], [lower(bio), c.rockY, c.deepY], [UG.DEEP, c.deepY, c.moltenY], [UG.MOLTEN, c.moltenY, Infinity]];
  for (let i = 0; i < layers.length; i++) {
    while (i + 1 < layers.length && layers[i + 1][0] === layers[i][0]) { layers[i][2] = layers[i + 1][2]; layers.splice(i + 1, 1); }
  }
  const H = UG_SEAM / 2;
  for (let i = 0; i < layers.length; i++) {
    const [theme, y0, y1] = layers[i];
    const start = i === 0 ? y0 : Math.max(fadeEnd, y0 + H);
    const end = i + 1 < layers.length ? layers[i + 1][1] + H : y1;
    push(theme, FULL, start, end);
    if (i > 0) {
      // 過渡帶：分界上下各 H，由疏到密 7 階（不跨進地表淡入區）
      const a0 = Math.max(fadeEnd, y0 - H), a1 = Math.max(a0, y0 + H);
      for (let k = 0; k < FULL; k++) push(theme, k, Math.round(a0 + ((a1 - a0) * k) / FULL), Math.round(a0 + ((a1 - a0) * (k + 1)) / FULL), true);
    }
  }
  // 生態區交界：最近的另一區（左右各找 BORDER_R 欄）
  let nd = 0, nb = bio;
  for (let d = 1; d <= BORDER_R && !nd; d++) {
    for (const x of [c.tx - d, c.tx + d]) {
      if (x < 0 || x >= c.width) continue;
      const b = c.biomeAt(x);
      if (b !== bio) { nd = d; nb = b; break; }
    }
  }
  if (nd) {
    const k = Math.max(0, Math.min(FULL - 1, Math.round(((BORDER_R + 1 - nd) / (2 * (BORDER_R + 1))) * UG_KEEPS.length) - 1));
    if (upper(nb) !== upper(bio)) push(upper(nb), k, fadeEnd, c.rockY + H, true);
    if (lower(nb) !== lower(bio)) push(lower(nb), k, Math.max(fadeEnd, c.rockY - H), c.deepY + H, true);
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
/** 暗紋邊長（px）：256 → 一個畫面裡最多重複一兩次（以前 64 的平鋪感太明顯） */
export const UG_TILE = 256;
const N = UG_TILE;
/** 主題 → 每格屬於哪一塊岩面（Voronoi 類暗紋才有；近層的洞口挑整塊岩面挖空） */
const CELLS = new Map<number, Int16Array>();
/** 可平鋪的值雜訊（格點在 N 上環繞） */
function pnoise(x: number, y: number, cell: number, seed: number): number {
  const g = N / cell, fx = x / cell, fy = y / cell, gx = Math.floor(fx), gy = Math.floor(fy);
  const tx = fx - gx, ty = fy - gy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const w = (v: number): number => ((v % g) + g) % g;
  const a = h01(w(gx), w(gy), seed), b = h01(w(gx + 1), w(gy), seed), c = h01(w(gx), w(gy + 1), seed), d = h01(w(gx + 1), w(gy + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
/** 抖動格點的 Voronoi（可平鋪）：點 i = 格 (i % n, i / n)，只看附近 5×5 格；sy > 1 = 垂直方向壓扁（橫向岩板） */
interface Grid { pts: [number, number][]; n: number; ny: number; }
function pvoronoi(x: number, y: number, g: Grid, sy = 1): { d1: number; d2: number; cx: number; cy: number; i: number } {
  let d1 = 1e9, d2 = 1e9, cx = 0, cy = 0, bi = 0;
  const cw = N / g.n, chh = N / g.ny, gx = Math.floor(x / cw), gy = Math.floor(y / chh);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const ix = gx + dx, iy = gy + dy;
    const wx = ((ix % g.n) + g.n) % g.n, wy = ((iy % g.ny) + g.ny) % g.ny, i = wy * g.n + wx;
    const [px0, py0] = g.pts[i];
    const px = px0 + (ix - wx) * cw, py = py0 + (iy - wy) * chh;
    const d = Math.hypot(x + 0.5 - px, (y + 0.5 - py) * sy);
    if (d < d1) { d2 = d1; d1 = d; cx = px; cy = py; bi = i; } else if (d < d2) d2 = d;
  }
  return { d1, d2, cx, cy, i: bi };
}
function gridPts(n: number, seed: number, ny = n): Grid {
  const s = N / n, t = N / ny, pts: [number, number][] = [];
  for (let gy = 0; gy < ny; gy++) for (let gx = 0; gx < n; gx++) pts.push([(gx + 0.1 + h01(gx, gy, seed) * 0.8) * s, (gy + 0.1 + h01(gx, gy, seed + 1) * 0.8) * t]);
  return { pts, n, ny };
}
const P = (...cs: string[]): RGB[] => cs.map(hex);

/** 岩面紋（大塊岩面 + 縫）：岩層 / 深層 / 熔岩；sy > 1 = 壓扁成橫向的岩板。記下每格的岩面編號（近層洞口用） */
function rockFaces(b: Bmp, pal: RGB[], seed: number, theme: number, n = 16, ny = n, sy = 1): void {
  const pts = gridPts(n, seed, ny), cells = new Int16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = pvoronoi(x, y, pts, sy), e = q.d2 - q.d1;
    let k = 2;
    if (e < 1.2) k = 0;
    else if (e < 3) k = (x - q.cx) + (y - q.cy) * sy < 0 ? 3 : 1;
    // 每塊岩面明暗略有不同（大塊色斑，打散重複感）
    else if (h01(q.i, 5, seed) > 0.72) k = 1;
    cells[y * N + x] = q.i;
    b.set(x, y, pal[k]);
  }
  CELLS.set(theme, cells);
}
/** 土層：一團團壓實的土塊（橫向拉長的雜訊、上緣受光）、灰色碎石、垂下的細根 —— 和岩層的大塊岩板分得開 */
function dirtClods(b: Bmp): void {
  const pal = P('#0c0a12', '#1c1424', '#2a1810', '#472819', '#2c2838');
  const v = (x: number, y: number): number => pnoise(x, y, 32, 39) * 0.3 + pnoise(x, y, 16, 41) * 0.45 + pnoise(x, y, 8, 43) * 0.25;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = v(x, y);
    let c = n > 0.62 ? pal[3] : n > 0.4 ? pal[2] : n > 0.3 ? pal[1] : pal[0];
    if (c === pal[2] && v(x, (y - 1 + N) % N) <= 0.4) c = pal[3];
    b.set(x, y, c);
  }
  for (let k = 0; k < 280; k++) {
    const x = Math.floor(h01(k, 1, 45) * N), y = Math.floor(h01(k, 2, 45) * N);
    b.set(x, y, pal[4]);
    if (k % 3 === 0) b.set((x + 1) % N, y, pal[4]);
    b.set(x, (y + 1) % N, pal[0]);
  }
  for (let r = 0; r < 40; r++) {
    let x = Math.floor(h01(r, 3, 47) * N);
    const y0 = Math.floor(h01(r, 4, 47) * N), len = 8 + Math.floor(h01(r, 5, 47) * 18);
    for (let k = 0; k < len; k++) {
      b.set(((x % N) + N) % N, (y0 + k) % N, pal[0]);
      if (h01(r, k, 49) > 0.7) x += h01(r, k, 51) > 0.5 ? 1 : -1;
    }
  }
}
/** 砂岩層理：高度不一的橫帶（隨 x 緩緩起伏）、帶間暗縫、少數帶頂一道亮線、帶內零星直裂 */
function sandStrata(b: Bmp): void {
  const H0 = [7, 5, 9, 4, 8, 6, 10, 5, 10, 6, 9, 5, 8, 7, 4, 10, 6, 9];
  const H = [...H0, ...H0.slice().reverse()];
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
  const pts = gridPts(12, 61), cells = new Int16Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const q = pvoronoi(x, y, pts), e = q.d2 - q.d1;
    cells[y * N + x] = q.i;
    let c = h01(q.i, 2, 63) > 0.7 ? pal[3] : pal[1];
    if (e < 1.1) c = pal[0];
    else if (e < 1.7 && (x - q.cx) + (y - q.cy) < 0 && h01(q.i, 4, 63) > 0.35) c = pal[2];
    // 冰面裡的細裂（短斜線）
    const d = (((x + y * 2) % 32) + 32) % 32;
    if (d === 0 && pnoise(x, y, 16, 65) > 0.62) c = pal[0];
    if (d === 1 && pnoise(x, y, 16, 65) > 0.7 && e > 3) c = pal[4];
    b.set(x, y, c);
  }
  CELLS.set(UG.ICE, cells);
}
/** 泥巴：暗泥團塊 + 由上往下垂的根（暗綠芯、左側受光） */
function mudRoots(b: Bmp): void {
  const pal = P('#0c0a12', '#1c1424', '#2a1810', '#16301e', '#214528');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = pnoise(x, y, 8, 71);
    b.set(x, y, n > 0.72 ? pal[2] : n < 0.3 ? pal[0] : pal[1]);
  }
  for (let r = 0; r < 32; r++) {
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
  const caps0: [number, number, number][] = [[10, 46, 4], [38, 20, 3], [52, 55, 2], [24, 8, 2], [84, 30, 3], [110, 70, 4], [70, 100, 2], [96, 118, 3], [20, 90, 3]];
  const caps = [...caps0, ...caps0.map(([x, y, r]): [number, number, number] => [(x + 128 + 17) % N, (y + 64) % N, r]), ...caps0.map(([x, y, r]): [number, number, number] => [(x + 61) % N, (y + 150) % N, Math.max(2, r - 1)])];
  for (const [cx, cy, r] of caps) {
    for (let y = cy + 1; y < cy + 5 + r; y++) b.set(cx, y % N, pal[2]);
    for (let dy = -Math.ceil(r * 0.6); dy <= 0; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = dx / r, ny = dy / (r * 0.7 + 0.01);
      if (nx * nx + ny * ny > 1.05) continue;
      b.set((cx + dx + N) % N, (cy + dy + N) % N, dy === 0 ? pal[3] : pal[3]);
    }
    b.set((cx - Math.round(r * 0.4) + N) % N, (cy - Math.max(1, Math.round(r * 0.4)) + N) % N, pal[4]);
  }
  for (let k = 0; k < 140; k++) {
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
    case UG.DIRT: dirtClods(b); break;
    // 岩層：橫向的灰紫大岩板（和土層的暖色土塊分得開）
    case UG.ROCK: rockFaces(b, P('#0c0a12', '#1c1424', '#2c2838', '#2c2450'), 3, theme, 10, 20, 1.9); break;
    case UG.DEEP: rockFaces(b, P('#0c0a12', '#0c0a12', '#18204a', '#1c1424'), 3, theme); break;
    case UG.MOLTEN: rockFaces(b, P('#2a1810', '#472819', '#6c1e14', '#472819'), 3, theme); break;
    case UG.SAND: sandStrata(b); break;
    case UG.ICE: crackedIce(b); break;
    case UG.MUD: mudRoots(b); break;
    case UG.SPORE: sporeGlow(b); break;
    default: brickWall(b);
  }
  BASE.set(theme, b);
  return b;
}
/** 遠層（視差較慢、在洞口後面）的環境色：依深度帶上色（土偏暖、岩偏灰紫、深層偏藍、熔岩偏紅），比近層暗 */
export const FAR_RAMP: Record<number, string[]> = {
  [UG.DIRT]: ['#0c0a12', '#1c1424', '#2a1810'],
  [UG.ROCK]: ['#0c0a12', '#1c1424', '#2c2450'],
  [UG.DEEP]: ['#0c0a12', '#18204a', '#2c4486'],
  [UG.MOLTEN]: ['#1c1424', '#2a1810', '#6c1e14'],
  [UG.SAND]: ['#0c0a12', '#1c1424', '#2a1810'],
  [UG.ICE]: ['#0c0a12', '#1c1424', '#18204a'],
  [UG.MUD]: ['#0c0a12', '#0c0a12', '#16301e'],
  [UG.SPORE]: ['#0c0a12', '#1c1424', '#18204a'],
  [UG.BRICK]: ['#0c0a12', '#0c0a12', '#1c1424'],
};
const lum = (v: number): number => 0.299 * (v & 255) + 0.587 * ((v >>> 8) & 255) + 0.114 * ((v >>> 16) & 255);
/** 遠層：近層暗紋依亮度排名重新上色成 FAR_RAMP（整片不透明） */
function farBase(theme: number): Bmp {
  const src = themeBase(theme), out = new Bmp(N, N);
  let mn = Infinity, mx = -Infinity;
  for (const v of src.px) { const l = lum(v); if (l < mn) mn = l; if (l > mx) mx = l; }
  const pal = (FAR_RAMP[theme] ?? FAR_RAMP[UG.ROCK]).map(hex);
  for (let i = 0; i < src.px.length; i++) {
    const t = mx > mn ? (lum(src.px[i]) - mn) / (mx - mn) : 0;
    out.px[i] = Bmp.pack(pal[Math.min(pal.length - 1, Math.floor(Math.pow(t, 1.4) * pal.length))]);
  }
  return out;
}
/** 近層的洞口：挑出約 HOLE_FRAC 的 Voronoi 岩面整塊挖空（透出後面的遠層，看起來像剝落 / 凹進去的岩塊），
 *  岩縫保留；洞口邊一圈最暗的描邊、上緣再一排暗影（光從上方來，凹處上緣在陰影裡） */
const NO_HOLES = new Set<number>([UG.BRICK, UG.SPORE]);
const HOLE_FRAC = 0.22;
function nearBase(theme: number): Bmp {
  const src = themeBase(theme);
  if (NO_HOLES.has(theme)) return src;
  const out = src.clone(), open = new Uint8Array(N * N), cells = CELLS.get(theme);
  if (cells) {
    // Voronoi 類：挑整塊岩面挖空（依雜湊排序挑，比例接近 HOLE_FRAC）；岩縫（最暗色）保留
    let n = 0;
    for (const c of cells) if (c + 1 > n) n = c + 1;
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => h01(p, 9, 17 + theme) - h01(q, 9, 17 + theme));
    const pick = new Uint8Array(n);
    for (const i of order.slice(0, Math.max(1, Math.round(n * HOLE_FRAC * 1.6)))) pick[i] = 1;
    const crack = Bmp.pack(hex('#0c0a12'));
    for (let i = 0; i < N * N; i++) if (pick[cells[i]] && src.px[i] !== crack) open[i] = 1;
  } else {
    // 雜訊類（土 / 砂 / 泥）：圓圓的洞穴團塊，門檻取分位數
    const nz = new Float32Array(N * N), seed = 101 + theme * 7;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) nz[y * N + x] = pnoise(x, y, 32, seed) * 0.6 + pnoise(x, y, 16, seed + 3) * 0.3 + pnoise(x, y, 8, seed + 5) * 0.1;
    const th = Float32Array.from(nz).sort()[Math.floor(N * N * (1 - HOLE_FRAC))];
    for (let i = 0; i < N * N; i++) open[i] = nz[i] > th ? 1 : 0;
  }
  const rim = hex('#0c0a12');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (open[i]) { out.px[i] = 0; continue; }
    const o = (dx: number, dy: number): number => open[((y + dy + N) % N) * N + ((x + dx + N) % N)];
    if (o(1, 0) || o(-1, 0) || o(0, 1) || o(0, -1)) out.set(x, y, rim);
  }
  // 凹處上緣的陰影：洞口最上面一排（貼著岩面下緣）畫成描邊色
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (open[i] && !open[((y - 1 + N) % N) * N + x]) out.set(x, y, rim);
  }
  return out;
}
export type UgLayer = 'near' | 'far' | 'flat';
const CACHE: Record<UgLayer, Map<number, Bmp>> = { near: new Map(), far: new Map(), flat: new Map() };
/**
 * 主題暗紋：near = 有洞口的近層、far = 依深度上色的遠層（整片）、flat = 沒有洞口的近層（地表淡入用：那裡沒有遠層墊底）。
 * keep < 1 = 1×1 Bayer 挖空（keep 小的是 keep 大的子集）
 */
export function ugThemeBmp(theme: number, keep: number, kind: UgLayer = 'near'): Bmp {
  const cache = CACHE[kind];
  let src = cache.get(theme);
  if (!src) { src = kind === 'far' ? farBase(theme) : kind === 'near' ? nearBase(theme) : themeBase(theme); cache.set(theme, src); }
  if (keep >= 1) return src.clone();
  const b = new Bmp(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (bayer(x, y) < keep) b.setRaw(x, y, src.raw(x, y));
  return b;
}

/** 欄頂平滑的半寬（欄）與最多往上提幾格 */
export const UG_SMOOTH_R = 6;
const UG_SMOOTH_UP = 3;
/**
 * 每欄背景起點（世界 px）的平滑版：±UG_SMOOTH_R 欄平均，但最多比原本高 UG_SMOOTH_UP 格（不會冒到地面上）。
 * 地表忽高忽低時，相鄰欄的淡入不會錯開好幾格 → 水裡 / 洞裡看不到一道道垂直的硬邊。回傳 tx0..tx1 的值。
 */
export function smoothTops(raw: (tx: number) => number, tx0: number, tx1: number, tile: number, r = UG_SMOOTH_R): Float64Array {
  const n = tx1 - tx0 + 1, src = new Float64Array(n + 2 * r);
  for (let i = 0; i < src.length; i++) src[i] = raw(tx0 - r + i);
  const out = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < 2 * r + 1; i++) sum += src[i];
  for (let i = 0; i < n; i++) {
    if (i > 0) sum += src[i + 2 * r] - src[i - 1];
    out[i] = Math.max(sum / (2 * r + 1), src[i + r] - UG_SMOOTH_UP * tile);
  }
  return out;
}
