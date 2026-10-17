// caves.ts — 洞穴系統（純函式，直接改寫 world.fg；確定性：只用 Rng / 值雜訊 / 四則與 sqrt）。
//   · perlinWorm：方向由 1D 值雜訊驅動的「柏林蟲」隧道，半徑沿途起伏，可分岔
//   · carveNetwork：洞穴層的大型洞窟網路——粗格（2×2 tile）雜訊門檻 → 細胞自動機平滑 → 移除小洞 →
//     以隧道把每個大洞窟接到最近的鄰居（保證連通）→ 雙線性放大回 tile 解析度（邊緣平滑、不是階梯）
//   · carveNoiseTunnels：「義大利麵」雜訊隧道（|n − 0.5| < t 的細帶），由低頻遮罩決定哪裡密、哪裡是實心岩區
//   · carveChamber：巨大的圓頂洞室（雜訊邊界 + 較平的地板）
import type { World } from '../world';
import { Rng } from '../rng';
import { T, SOLID_LUT } from '../tiles';
import { FbmField, NoiseField, vnoise1 } from '../noise';

/** 圓形筆刷挖空：只挖實心格（air / 裝飾不動），可用 keep 保護特定 tile */
export function carveDisc(world: World, cx: number, cy: number, r: number, keep?: (id: number) => boolean): void {
  const { width, height, fg } = world;
  const r2 = r * r;
  const y0 = Math.max(1, Math.floor(cy - r)), y1 = Math.min(height - 2, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy, span = r2 - dy * dy;
    if (span < 0) continue;
    const hw = Math.sqrt(span);
    const x0 = Math.max(0, Math.ceil(cx - hw - 0.5)), x1 = Math.min(width - 1, Math.floor(cx + hw - 0.5));
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      const id = fg[row + x];
      if (SOLID_LUT[id] !== 1) continue;
      if (keep && keep(id)) continue;
      fg[row + x] = T.AIR;
    }
  }
}

export interface WormOptions {
  x: number; y: number;
  /** 步數（每步前進約 0.6 × 半徑） */
  steps: number;
  /** 半徑範圍 */
  r0: number; r1: number;
  /** 每步最大轉向（弧度近似值，小角度） */
  turn: number;
  /** 垂直方向抑制 0..1（越大越水平） */
  flat: number;
  /** 起始方向（省略 = 亂數） */
  dx?: number; dy?: number;
  /** 活動範圍（y） */
  yMin: number; yMax: number;
  /** 每步分岔機率 */
  branch?: number;
  keep?: (id: number) => boolean;
}

/**
 * 柏林蟲：方向向量每步依 1D 值雜訊轉一點（小角度旋轉 + 重新正規化，不用三角函數），
 * 半徑也隨雜訊起伏 → 平滑蜿蜒、寬窄變化的隧道。回傳走過的點（取樣）供呼叫端接洞。
 */
export function perlinWorm(world: World, rng: Rng, o: WormOptions, depth = 0): { x: number; y: number }[] {
  let px = o.x, py = o.y;
  let dx = o.dx ?? rng.range(-1, 1), dy = o.dy ?? rng.range(-0.5, 0.5);
  let len = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= len; dy /= len;
  const sTurn = rng.int(1, 1 << 30), sRad = rng.int(1, 1 << 30);
  const trail: { x: number; y: number }[] = [];
  const W = world.width;
  for (let t = 0; t < o.steps; t++) {
    const a = (vnoise1(t, 26, sTurn) - 0.5) * 2 * o.turn + (vnoise1(t, 7, sTurn + 1) - 0.5) * o.turn * 0.6;
    let nx = dx - a * dy, ny = dy + a * dx;
    ny *= 1 - o.flat * 0.12;
    const r = o.r0 + (o.r1 - o.r0) * vnoise1(t, 34, sRad);
    if (py < o.yMin + r) ny += 0.08; else if (py > o.yMax - r) ny -= 0.08;
    if (px < 8) nx += 0.1; else if (px > W - 8) nx -= 0.1;
    len = Math.sqrt(nx * nx + ny * ny) || 1;
    dx = nx / len; dy = ny / len;
    const stepLen = Math.max(0.8, r * 0.6);
    px += dx * stepLen; py += dy * stepLen;
    carveDisc(world, px, py, r, o.keep);
    if ((t & 7) === 0) trail.push({ x: px, y: py });
    if (depth < 1 && o.branch && rng.next() < o.branch) {
      const side = rng.chance(2) ? 1 : -1;
      perlinWorm(world, rng, {
        ...o, x: px, y: py, steps: Math.floor(o.steps * rng.range(0.25, 0.5)),
        r1: Math.max(o.r0, o.r1 * 0.8), dx: dx - side * dy * 1.2, dy: dy + side * dx * 1.2,
      }, depth + 1);
    }
  }
  return trail;
}

/** 兩點之間挖一條微彎的隧道（側向偏移由雜訊決定） */
export function carveLink(world: World, ax: number, ay: number, bx: number, by: number, r: number, seed: number, keep?: (id: number) => boolean): void {
  const ddx = bx - ax, ddy = by - ay;
  const L = Math.sqrt(ddx * ddx + ddy * ddy);
  if (L < 1) return;
  const ux = ddx / L, uy = ddy / L;
  const n = Math.ceil(L / Math.max(0.8, r * 0.6));
  const amp = Math.min(14, L * 0.12);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // 兩端偏移歸零（sin 形以 4t(1−t) 近似）
    const off = (vnoise1(i, 18, seed) - 0.5) * 2 * amp * 4 * t * (1 - t);
    carveDisc(world, ax + ddx * t - uy * off, ay + ddy * t + ux * off, r, keep);
  }
}

export interface NetworkOptions {
  /** 帶狀範圍（tile y） */
  yTop: number; yBot: number;
  /** 開口門檻（越低越空） */
  threshold: number;
  seed: number;
  rng: Rng;
  /** 粗格上小於此面積（粗格數）的洞窟填回 */
  minCells: number;
  keep?: (id: number) => boolean;
  /** 不挖的 x 範圍（地城預留區等） */
  skipX?: (x: number) => boolean;
}
export interface NetworkResult {
  /** 保留下來的大洞窟（tile 座標的外接框 + 面積 tile 數） */
  caverns: { x0: number; y0: number; x1: number; y1: number; area: number; cx: number; cy: number }[];
}

/**
 * 洞穴層的大洞窟網路。粗格 2×2：雜訊（水平拉長）+ 少量亂數 → 4-5 細胞自動機 3 輪 → 4 連通標記，
 * 移除小洞窟 → 依 x 排序，每個洞窟以隧道接到「已處理洞窟中最近的那個」→ 全部連成一張網。
 */
export function carveNetwork(world: World, o: NetworkOptions): NetworkResult {
  const W = world.width;
  const cw = Math.ceil(W / 2), y0 = Math.max(1, o.yTop), y1 = Math.min(world.height - 2, o.yBot);
  const ch = Math.ceil((y1 - y0) / 2);
  if (ch <= 2 || cw <= 2) return { caverns: [] };
  const n = cw * ch;
  let g = new Uint8Array(n), h = new Uint8Array(n);
  const base = new FbmField(W, world.height, 64, 30, o.seed, 3, 0.55);
  const region = new NoiseField(W, world.height, 420, 260, o.seed + 31);
  const rng = o.rng;
  for (let cy = 0; cy < ch; cy++) {
    const ty = y0 + cy * 2 + 1;
    const vt = Math.min(1, (ty - y0) / 50, (y1 - ty) / 40);
    for (let cx = 0; cx < cw; cx++) {
      const tx = cx * 2 + 1;
      if (o.skipX && o.skipX(tx)) continue;
      const v = base.at(tx, ty) + (region.at(tx, ty) - 0.5) * 0.32 + (rng.next() - 0.5) * 0.16 - (1 - Math.max(0, vt)) * 0.3;
      g[cy * cw + cx] = v > o.threshold ? 1 : 0;
    }
  }
  // 4-5 規則：3×3 內「牆」≥5 → 牆（越界視為牆）
  for (let it = 0; it < 3; it++) {
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        let walls = 0;
        for (let oy = -1; oy <= 1; oy++) {
          const yy = cy + oy;
          if (yy < 0 || yy >= ch) { walls += 3; continue; }
          const row = yy * cw;
          for (let ox = -1; ox <= 1; ox++) {
            const xx = cx + ox;
            if (xx < 0 || xx >= cw || g[row + xx] === 0) walls++;
          }
        }
        h[cy * cw + cx] = walls >= 5 ? 0 : 1;
      }
    }
    const t = g; g = h; h = t;
  }
  // 連通標記
  const label = new Int32Array(n).fill(-1);
  const comps: { cells: number[]; sx: number; sy: number }[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!g[i] || label[i] >= 0) continue;
    const id = comps.length, cells: number[] = [];
    let sx = 0, sy = 0;
    label[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      cells.push(k);
      const kx = k % cw, ky = (k - kx) / cw;
      sx += kx; sy += ky;
      if (kx > 0 && g[k - 1] && label[k - 1] < 0) { label[k - 1] = id; stack.push(k - 1); }
      if (kx < cw - 1 && g[k + 1] && label[k + 1] < 0) { label[k + 1] = id; stack.push(k + 1); }
      if (ky > 0 && g[k - cw] && label[k - cw] < 0) { label[k - cw] = id; stack.push(k - cw); }
      if (ky < ch - 1 && g[k + cw] && label[k + cw] < 0) { label[k + cw] = id; stack.push(k + cw); }
    }
    comps.push({ cells, sx: sx / cells.length, sy: sy / cells.length });
  }
  const big = comps.filter((c) => c.cells.length >= o.minCells);
  for (const c of comps) if (c.cells.length < o.minCells) for (const k of c.cells) g[k] = 0;
  // 放大：雙線性取樣粗格 + 細雜訊抖動 → 平滑邊緣
  const jit = new NoiseField(W, world.height, 5, 5, o.seed + 77);
  const fg = world.fg, keep = o.keep;
  for (let ty = y0; ty < y0 + ch * 2 && ty < y1; ty++) {
    const fy = (ty - y0) / 2 - 0.25;
    const gy = Math.max(0, Math.min(ch - 2, Math.floor(fy))), wy = Math.max(0, Math.min(1, fy - gy));
    const row = ty * W;
    for (let tx = 0; tx < W; tx++) {
      const fx = tx / 2 - 0.25;
      const gx = Math.max(0, Math.min(cw - 2, Math.floor(fx))), wx = Math.max(0, Math.min(1, fx - gx));
      const i = gy * cw + gx;
      const a = g[i], b = g[i + 1], c = g[i + cw], d = g[i + cw + 1];
      const sum = a + b + c + d;
      if (sum === 0) continue;
      // 四角全開 → 必開（抖動最多 ±0.25）；只有邊緣才需要抖動雜訊
      if (sum < 4) {
        const v = a + (b - a) * wx + (c - a) * wy + (a - b - c + d) * wx * wy + (jit.at(tx, ty) - 0.5) * 0.5;
        if (v <= 0.5) continue;
      }
      const id = fg[row + tx];
      if (SOLID_LUT[id] !== 1 || (keep && keep(id))) continue;
      fg[row + tx] = T.AIR;
    }
  }
  // 依 x 排序，各自接到已處理中最近的洞窟
  big.sort((p, q) => p.sx - q.sx);
  const nearestCell = (c: { cells: number[] }, tx: number, ty: number): [number, number] => {
    let best = c.cells[0], bd = Infinity;
    for (let k = 0; k < c.cells.length; k += 3) {
      const cell = c.cells[k], x = cell % cw, y = (cell - x) / cw;
      const d = (x - tx) * (x - tx) + (y - ty) * (y - ty);
      if (d < bd) { bd = d; best = cell; }
    }
    const x = best % cw;
    return [x, (best - x) / cw];
  };
  for (let i = 1; i < big.length; i++) {
    let bj = 0, bd = Infinity;
    for (let j = Math.max(0, i - 6); j < i; j++) {
      const ex = big[i].sx - big[j].sx, ey = big[i].sy - big[j].sy;
      const d = ex * ex + ey * ey * 4;
      if (d < bd) { bd = d; bj = j; }
    }
    const [ax, ay] = nearestCell(big[i], big[bj].sx, big[bj].sy);
    const [bx, by] = nearestCell(big[bj], ax, ay);
    carveLink(world, ax * 2 + 1, y0 + ay * 2 + 1, bx * 2 + 1, y0 + by * 2 + 1, rng.range(1.8, 3), o.seed + i * 13, keep);
  }
  const caverns = big.map((c) => {
    let mx0 = cw, my0 = ch, mx1 = 0, my1 = 0;
    for (const k of c.cells) { const x = k % cw, y = (k - x) / cw; if (x < mx0) mx0 = x; if (x > mx1) mx1 = x; if (y < my0) my0 = y; if (y > my1) my1 = y; }
    return { x0: mx0 * 2, y0: y0 + my0 * 2, x1: mx1 * 2 + 2, y1: y0 + my1 * 2 + 2, area: c.cells.length * 4, cx: c.sx * 2 + 1, cy: y0 + c.sy * 2 + 1 };
  });
  return { caverns };
}

/** 每欄的 [top, bottom) 帶狀範圍 → 陣列 + 全域最小 / 最大列（給 row-major 掃描用） */
function bandRows(world: World, top: (x: number) => number, bottom: (x: number) => number): { t0: Int32Array; t1: Int32Array; lo: number; hi: number } {
  const W = world.width, t0 = new Int32Array(W), t1 = new Int32Array(W);
  let lo = world.height, hi = 0;
  for (let x = 0; x < W; x++) {
    t0[x] = Math.max(1, Math.floor(top(x))); t1[x] = Math.min(world.height - 1, Math.floor(bottom(x)));
    if (t0[x] < lo) lo = t0[x];
    if (t1[x] > hi) hi = t1[x];
  }
  return { t0, t1, lo, hi };
}

export interface TunnelOptions {
  /** 每欄的帶狀範圍 */
  top: (x: number) => number;
  bottom: (x: number) => number;
  seed: number;
  /** 隧道半寬（雜訊單位），會乘上遮罩與深度係數 */
  width: number;
  keep?: (id: number) => boolean;
  skipX?: (x: number) => boolean;
}

/** 義大利麵隧道：兩組拉長的雜訊各取 |n − 0.5| < t 的細帶（交會處自然成網），低頻遮罩讓有些區域密、有些是實心岩 */
export function carveNoiseTunnels(world: World, o: TunnelOptions): void {
  const W = world.width, H = world.height, fg = world.fg;
  const n1 = new FbmField(W, H, 78, 34, o.seed, 2, 0.45);
  const n2 = new FbmField(W, H, 40, 60, o.seed + 5, 2, 0.45);
  const mask = new NoiseField(W, H, 300, 180, o.seed + 9);
  const band = bandRows(world, o.top, (x) => Math.min(H - 2, o.bottom(x)));
  for (let y = band.lo; y < band.hi; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const t0 = band.t0[x], t1 = band.t1[x];
      if (y < t0 || y >= t1) continue;
      if (o.skipX && o.skipX(x)) continue;
      const i = row + x, id = fg[i];
      if (SOLID_LUT[id] !== 1 || (o.keep && o.keep(id))) continue;
      const m = (mask.at(x, y) - 0.3) * 2.2;
      if (m <= 0) continue;
      const fade = Math.min(1, (y - t0) / 14, (t1 - y) / 10);
      const t = o.width * Math.min(1.2, m) * fade * (0.8 + 0.4 * (y / H));
      if (Math.abs(n1.at(x, y) - 0.5) < t || Math.abs(n2.at(x, y) - 0.5) < t * 0.8) fg[i] = T.AIR;
    }
  }
}

/** 巨大圓頂洞室：橢圓 + 雜訊邊界，下半部較平（地板），回傳實際挖空的 tile 數 */
export function carveChamber(world: World, cx: number, cy: number, rx: number, ry: number, seed: number, keep?: (id: number) => boolean): number {
  const W = world.width, fg = world.fg;
  const bx = Math.max(1, Math.floor(cx - rx * 1.3)), by = Math.max(1, Math.floor(cy - ry * 1.3));
  const ex = Math.min(W - 2, Math.ceil(cx + rx * 1.3)), ey = Math.min(world.height - 3, Math.ceil(cy + ry * 1.3));
  if (ex < bx || ey < by) return 0;
  // 雜訊場只建在外接框內（局部座標），避免每個洞室都配置整個世界大小的格點
  const edge = new FbmField(ex - bx + 2, ey - by + 2, 16, 12, seed, 2, 0.5);
  const floorN = vnoise1(cx, 9, seed);
  let n = 0;
  for (let y = by; y <= ey; y++) {
    const dy = (y - cy) / ry;
    for (let x = bx; x <= ex; x++) {
      const dx = (x - cx) / rx;
      const e = (edge.at(x - bx, y - by) - 0.5) * 0.7;
      if (dx * dx + dy * dy > 1 + e) continue;
      // 地板：下方保留實心，形成較平的洞底（少量起伏）
      if (dy > 0.5 + (vnoise1(x, 11, seed + 3) - 0.5) * 0.18 + (floorN - 0.5) * 0.1) continue;
      const i = y * W + x, id = fg[i];
      if (SOLID_LUT[id] !== 1 || (keep && keep(id))) continue;
      fg[i] = T.AIR; n++;
    }
  }
  return n;
}

/** 有機團塊：橢圓 + 雜訊邊界，把 only(id) 為真的格換成 type（花崗岩 / 大理石岩體用） */
export function paintBlob(world: World, cx: number, cy: number, rx: number, ry: number, type: number, seed: number, only: (id: number) => boolean): void {
  const W = world.width, fg = world.fg;
  const bx = Math.max(0, Math.floor(cx - rx * 1.4)), by = Math.max(1, Math.floor(cy - ry * 1.4));
  const ex = Math.min(W - 1, Math.ceil(cx + rx * 1.4)), ey = Math.min(world.height - 2, Math.ceil(cy + ry * 1.4));
  if (ex < bx || ey < by) return;
  const edge = new NoiseField(ex - bx + 2, ey - by + 2, 9, 9, seed);
  const edge2 = new NoiseField(ex - bx + 2, ey - by + 2, 26, 20, seed + 1);
  for (let y = by; y <= ey; y++) {
    const dy = (y - cy) / ry;
    for (let x = bx; x <= ex; x++) {
      const dx = (x - cx) / rx;
      if (dx * dx + dy * dy > 1 + (edge.at(x - bx, y - by) - 0.5) * 0.5 + (edge2.at(x - bx, y - by) - 0.5) * 0.9) continue;
      const i = y * W + x;
      if (only(fg[i])) fg[i] = type;
    }
  }
}

/** 雜訊團塊材料：在 [top(x), bottom(x)) 帶狀範圍內 field > threshold 的格把 from(id) 換成 type */
export function noisePockets(world: World, field: FbmField | NoiseField, threshold: number,
  top: (x: number) => number, bottom: (x: number) => number, from: (id: number) => boolean, type: number): void {
  const W = world.width, fg = world.fg;
  const { t0, t1, lo, hi } = bandRows(world, top, bottom);
  const fbm = field instanceof FbmField ? field : null;
  // 逐列（row-major）掃描：fg 與雜訊格點都是連續記憶體
  for (let y = lo; y < hi; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (y < t0[x] || y >= t1[x]) continue;
      const i = row + x;
      if (!from(fg[i])) continue;
      if (fbm ? fbm.above(x, y, threshold) : field.at(x, y) > threshold) fg[i] = type;
    }
  }
}

/**
 * 填掉孤立的小氣泡：y0(x) 以下、4 連通的空氣區塊面積 < maxSize 的，用鄰近的實心 tile 填回。
 * 回傳填掉的區塊數。
 */
export function fillTinyPockets(world: World, y0: (x: number) => number, maxSize: number): number {
  const W = world.width, H = world.height, fg = world.fg, N = W * H;
  const lab = new Int32Array(N);
  for (let x = 0; x < W; x++) {
    const top = Math.max(1, Math.floor(y0(x)));
    for (let y = 0; y < top; y++) lab[y * W + x] = -1; // 範圍外
  }
  const stack: number[] = [], cells: number[] = [];
  let filled = 0, id = 0;
  for (let i = W; i < N - W; i++) {
    if (lab[i] !== 0 || SOLID_LUT[fg[i]] === 1) continue;
    id++;
    cells.length = 0;
    let n = 0, open = false, solidPick: number = T.STONE;
    lab[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop()!;
      n++;
      if (n <= maxSize) cells.push(k);
      const kx = k % W;
      for (let d = 0; d < 4; d++) {
        const q = d === 0 ? (kx > 0 ? k - 1 : -1) : d === 1 ? (kx < W - 1 ? k + 1 : -1) : d === 2 ? k - W : k + W;
        if (q < 0 || q >= N) { open = true; continue; }
        if (SOLID_LUT[fg[q]] === 1) { solidPick = fg[q]; continue; }
        if (lab[q] === -1) { open = true; continue; }
        if (lab[q] !== 0) continue;
        lab[q] = id; stack.push(q);
      }
    }
    if (!open && n < maxSize) {
      for (const k of cells) fg[k] = solidPick;
      filled++;
    }
  }
  return filled;
}
