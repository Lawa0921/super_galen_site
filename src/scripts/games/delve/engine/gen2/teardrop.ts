// teardrop.ts — gen2 的地下生態淚滴（M2a Task 12 修正 1 / 2；舊生成器 legacy/worldgen.ts「生態區轉換」，改成逐欄局部判斷）：
// 叢林、沙漠、雪原的陸地地區（home / culture / wild）各往下長一個「淚滴」；淚滴裡的格子換成該生態的地下材質（fill.ts 決定）。
//   · 列 y ∈ [max(1, top − 2), 底)，top = 地區內最高的地表（profile）、depth = max(10, 底 − top)、t = (y − top) / depth；
//     底：沙漠 DEEP_TOP + 0.3 × SPAN、雪原 DEEP_TOP + 0.45 × SPAN、叢林 MOLTEN_TOP − 28（DEEP_TOP / MOLTEN_TOP = 洞穴層 / 熔岩線的最高處，SPAN = 兩者之差）；
//   · 半寬 hw = (寬 / 2) × prof(t) × (1 ± 0.11 雜訊)；prof：
//       沙漠 t < 0.3 時 1 → 1.42、之後 1.42 × max(0, 1 − 0.62u − 0.38u²)（u = (t − 0.3) / 0.7，往下收成尖底）；
//       雪原 1 − 0.7 t√t，t > 0.88 再乘 √(1 − (t − 0.88) / 0.12)（往下逐漸收窄）；
//       叢林 1 + 2t(1 − t)，t > 0.84 再乘 √(1 − (t − 0.84) / 0.16)（中段鼓到 1.5 倍）；
//   · 中心 = 地區中點 + 傾斜（± 寬 × 0.35（叢林）/ 0.15（其他），越深越大）；左右邊各加擺動（± 23 + ± 7，乘 f = clamp((y − top) / 40, 0.35, 1)）；
//   · 每格的 x 再加邊緣抖動 ± J × f（edge 雜訊）後落在 [xl, xr) 內 = 在淚滴裡；inner = 離邊的距離 / 18（夾到 1）。
// 每個地區的每列邊界只由 (seed, 地區, y) 決定（算一次、快取），加上每格的抖動雜訊 → 每一格只由 (seed, x, y) 決定，與分段無關。
// 舊生成器的 FbmField(cellX, cellY, 2 八度, gain 0.5) 這裡是兩層沿 y 取樣的值雜訊（(cellX, cellY) 與 (cellX / 2, cellY / 2)，權重 2/3、1/3），
// 格距同舊生成器：edge 13 × 13、mat 15 × 15、caveA 26 × 30、caveB 14 × 48。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //；√ 用牛頓法（只用四則運算）。
import { hash2, seedInt, vnoise1 } from '../noise';
import { BIOME } from '../world';
import type { RegionInfo } from '../regionInfo';
import type { Layout } from './layout';
import { CAVERN_BASE, MOLTEN_BASE, type Profile2 } from './profile';

// 洞穴層 / 熔岩線的最高處（Profile2 的層線：CAVERN_BASE ± 16、MOLTEN_BASE ± 12）
const DEEP_TOP = CAVERN_BASE - 16, MOLTEN_TOP = MOLTEN_BASE - 12, SPAN = MOLTEN_TOP - DEEP_TOP;
// 各生態淚滴的底
export const TEAR_BOTTOM: Readonly<Record<number, number>> = {
  [BIOME.DESERT]: DEEP_TOP + Math.floor(SPAN * 0.3),
  [BIOME.SNOW]: DEEP_TOP + Math.floor(SPAN * 0.45),
  [BIOME.JUNGLE]: MOLTEN_TOP - 28,
};
// 邊緣抖動 ± TEAR_J 格；inner 的距離尺度
export const TEAR_J = 14;
const INNER_D = 18;
// 快取的地區數上限
const CACHE_MAX = 64;

// 一個地區的淚滴：生態、地區種子 s0、top / depth（算 t）、列 [y0, y1) 的左右邊 xl / xr 與 f；整個淚滴（含抖動）的 x 範圍 [xmin, xmax)
export interface Teardrop {
  biome: number; s0: number; top: number; depth: number;
  y0: number; y1: number; xl: Float64Array; xr: Float64Array; f: Float64Array; xmin: number; xmax: number;
}
const NONE: readonly Teardrop[] = [];

// √g，g ∈ [0, 1]（牛頓法固定 10 次；g 很小時誤差無所謂：那幾列的寬度很小）
function root(g: number): number {
  if (g <= 0) return 0;
  let s = g < 0.25 ? 0.5 : 1;
  for (let k = 0; k < 10; k++) s = 0.5 * (s + g / s);
  return s;
}
function prof(b: number, t: number): number {
  if (b === BIOME.DESERT) {
    if (t < 0.3) return 1 + 0.42 * (t / 0.3);
    const u = (t - 0.3) / 0.7;
    return 1.42 * Math.max(0, 1 - 0.62 * u - 0.38 * u * u);
  }
  if (b === BIOME.SNOW) {
    const p = 1 - 0.7 * t * root(t);
    return t > 0.88 ? p * root(Math.max(0, 1 - (t - 0.88) / 0.12)) : p;
  }
  const p = 1 + 2 * t * (1 - t);
  return t > 0.84 ? p * root(Math.max(0, 1 - (t - 0.84) / 0.16)) : p;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
// 固定 x、沿 y 取樣的各向異性值雜訊（格距 cx × cy；同 noise.ts 的 vnoise2 公式，格點雜湊在同一格內重用）
class AxNoise {
  private gx = 0; private sx = 0;
  private gy = 0x7fffffff;
  private a = 0; private b = 0; private c = 0; private d = 0;
  constructor(private readonly cx: number, private readonly cy: number, private readonly s: number) {}
  setX(x: number): void { const fx = x / this.cx; this.gx = Math.floor(fx); this.sx = smooth(fx - this.gx); this.gy = 0x7fffffff; }
  at(y: number): number {
    const fy = y / this.cy, gy = Math.floor(fy);
    if (gy !== this.gy) {
      const gx = this.gx, s = this.s;
      this.gy = gy;
      this.a = hash2(gx, gy, s); this.b = hash2(gx + 1, gy, s); this.c = hash2(gx, gy + 1, s); this.d = hash2(gx + 1, gy + 1, s);
    }
    const sx = this.sx, sy = smooth(fy - gy), a = this.a, b = this.b, c = this.c, d = this.d;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}
// 2 八度：(cx, cy) 權重 2/3、(cx / 2, cy / 2) 權重 1/3（舊生成器 FbmField 的 2 八度、gain 0.5）
export class Fbm2 {
  private readonly a: AxNoise;
  private readonly b: AxNoise;
  constructor(cx: number, cy: number, s: number) { this.a = new AxNoise(cx, cy, s); this.b = new AxNoise(cx / 2, cy / 2, s + 7919); }
  setX(x: number): void { this.a.setX(x); this.b.setX(x); }
  at(y: number): number { return (this.a.at(y) * 2 + this.b.at(y)) / 3; }
}

export class TeardropField {
  private readonly s: number;
  private readonly edge: Fbm2;
  readonly mat: Fbm2;
  readonly caveA: Fbm2;
  readonly caveB: Fbm2;
  private readonly cache = new Map<RegionInfo, Teardrop>();
  private x = Number.NaN;
  // 上一次 hit() 的 inner
  inner = -1;

  constructor(seed: string, private readonly layout: Layout, private readonly profile: Profile2) {
    this.s = seedInt(seed, 'g2-tear');
    this.edge = new Fbm2(13, 13, seedInt(seed, 'g2-tear-edge'));
    this.mat = new Fbm2(15, 15, seedInt(seed, 'g2-tear-mat'));
    this.caveA = new Fbm2(26, 30, seedInt(seed, 'g2-tear-cave-a'));
    this.caveB = new Fbm2(14, 48, seedInt(seed, 'g2-tear-cave-b'));
  }

  // 第 x 欄碰得到的淚滴（通常沒有或一個）；有的話同時把雜訊 setX(x)
  at(x: number): readonly Teardrop[] {
    const m = this.layout.landmassAt(x);
    if (!m) return NONE;
    let out: Teardrop[] | null = null;
    for (const r of m.regions) {
      if (TEAR_BOTTOM[r.biome] === undefined || (r.kind !== 'home' && r.kind !== 'culture' && r.kind !== 'wild')) continue;
      const td = this.teardrop(r);
      if (x >= td.xmin && x < td.xmax) (out ??= []).push(td);
    }
    if (out && x !== this.x) { this.edge.setX(x); this.mat.setX(x); this.caveA.setX(x); this.caveB.setX(x); this.x = x; }
    return out ?? NONE;
  }

  // (x, y) 落在哪個淚滴裡（重疊時取 inner 大的、同值取前面的；不在 = null），inner 寫進 this.inner。x 必須是上一次 at(x) 的 x
  hit(tds: readonly Teardrop[], x: number, y: number): Teardrop | null {
    let best: Teardrop | null = null, bi = -1;
    for (const td of tds) {
      if (y < td.y0 || y >= td.y1) continue;
      const k = y - td.y0, xl = td.xl[k], xr = td.xr[k];
      if (x < xl - TEAR_J || x >= xr + TEAR_J) continue;
      // 離兩邊都超過 J + INNER_D（再留 1 格餘裕）：抖動 |≤ J| 後仍在裡面、inner 一定是 1，不必取樣（結果相同）
      let v = 1;
      if (x - xl < TEAR_J + INNER_D + 1 || xr - x < TEAR_J + INNER_D + 1) {
        const jx = x + (this.edge.at(y) - 0.5) * 2 * TEAR_J * td.f[k];
        if (jx < xl || jx >= xr) continue;
        v = Math.min(1, Math.min(jx - xl, xr - jx) / INNER_D);
      }
      if (v > bi) { bi = v; best = td; }
    }
    this.inner = bi;
    return best;
  }

  private teardrop(r: RegionInfo): Teardrop {
    let td = this.cache.get(r);
    if (td) return td;
    const p = this.profile, b = r.biome, w = r.x1 - r.x0, mid = (r.x0 + r.x1) / 2, bottom = TEAR_BOTTOM[b];
    const s0 = (this.s ^ Math.imul(r.landmass * 2 + (r.side === -1 ? 1 : 0) + 1, 0x9e3779b1) ^ Math.imul(r.index + 1, 0x85ebca6b)) | 0;
    const leanK = b === BIOME.JUNGLE ? 0.7 : 0.3;
    let top = p.height;
    for (let x = r.x0; x < r.x1; x++) top = Math.min(top, p.surfaceAt(x));
    const depth = Math.max(10, bottom - top), y0 = Math.max(1, top - 2), y1 = Math.max(y0, Math.min(p.height - 1, bottom));
    const n = y1 - y0, xl = new Float64Array(n), xr = new Float64Array(n), f = new Float64Array(n);
    let xmin = Infinity, xmax = -Infinity;
    for (let k = 0; k < n; k++) {
      const y = y0 + k, t = (y - top) / depth;
      const fk = Math.max(0.35, Math.min(1, (y - top) / 40));
      const lean = (vnoise1(y, 230, s0 + 40) - 0.5) * w * leanK * Math.min(1, t * 2.5);
      const wob = (q: number): number => ((vnoise1(y, 80, s0 + q) - 0.5) * 46 + (vnoise1(y, 19, s0 + q + 9) - 0.5) * 14) * fk;
      const hw = (w / 2) * prof(b, Math.max(0, t)) * (1 + (vnoise1(y, 64, s0 + 20) - 0.5) * 0.22);
      const c = mid + lean, l = c - hw + wob(2), rr = c + hw + wob(3);
      f[k] = fk;
      // 太窄的列（舊生成器 xr − xl < 2 略過）：左右邊設成空範圍
      if (rr - l < 2) { xl[k] = Infinity; xr[k] = -Infinity; continue; }
      xl[k] = l; xr[k] = rr;
      xmin = Math.min(xmin, Math.floor(l - TEAR_J)); xmax = Math.max(xmax, Math.ceil(rr + TEAR_J));
    }
    td = { biome: b, s0, top, depth, y0, y1, xl, xr, f, xmin, xmax };
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(r, td);
    return td;
  }
}
