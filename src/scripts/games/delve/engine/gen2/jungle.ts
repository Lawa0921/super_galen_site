// jungle.ts — gen2 地下叢林（M2a Task 12 修正 1；舊生成器 legacy/worldgen.ts「生態區轉換」的叢林淚滴，改成逐欄局部判斷）。
// 每個叢林地區（home / culture / wild 的陸地地區，biome = 叢林）往下長一個「淚滴」：
//   · 列 y ∈ [max(1, top − 2), JUNGLE_BOTTOM)，top = 地區內最高的地表（profile）、depth = max(10, JUNGLE_BOTTOM − top)、t = (y − top) / depth；
//   · 半寬 hw = (寬 / 2) × prof(t) × (1 ± 0.11 雜訊)，prof(t) = 1 + 2t(1 − t)（中段鼓到 1.5 倍），t > 0.84 收成 √(1 − (t − 0.84) / 0.16)；
//   · 中心 = 地區中點 + 傾斜（± 0.35 × 寬，越深越大）；左右邊各加擺動（± 23 + ± 7，乘 f = clamp((y − top) / 40, 0.35, 1)）；
//   · 每格的 x 再加邊緣抖動 ± J × f（2 層值雜訊）後落在 [xl, xr) 內 = 在淚滴裡；inner = 離邊的距離 / 18（夾到 1）。
// 這些都只由 (seed, 地區, y) 決定（每個地區的每列邊界算一次、快取），加上每格的抖動雜訊 → 每一格只由 (seed, x, y) 決定，與分段無關。
// 淚滴裡要做什麼（泥巴、牆、叢林洞穴）由 fill.ts 決定；數值同舊生成器：
//   泥巴：石 / 深層岩在 matNoise > 0.47 的格；叢林洞穴：岩層以下 caveNoise > 0.685 − 0.035 × inner。
// 舊生成器的 FbmField(cell, 2 八度, gain 0.5) 這裡用兩個 ColNoise（cell、cell / 2，權重 2/3、1/3）沿 y 取樣；洞穴的 26 × 30 各向異性改成 28。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //；√ 用牛頓法（只用四則運算）。
import { seedInt, vnoise1 } from '../noise';
import { BIOME } from '../world';
import { ColNoise } from '../genPrims';
import type { RegionInfo } from '../regionInfo';
import type { Layout } from './layout';
import { MOLTEN_BASE, type Profile2 } from './profile';

// 淚滴底：舊生成器 moltenTop − 28（moltenTop = 熔岩線最高處）；gen2 的熔岩線 = MOLTEN_BASE ± 12
export const JUNGLE_BOTTOM = MOLTEN_BASE - 12 - 28;
// 邊緣抖動 ± JUNGLE_J 格；inner 的距離尺度
export const JUNGLE_J = 14;
const INNER_D = 18;
// 快取的地區數上限
const CACHE_MAX = 64;

// 一個地區的淚滴：列 [y0, y1) 的左右邊 xl / xr 與 f；整個淚滴（含抖動）的 x 範圍 [xmin, xmax)
export interface Teardrop { y0: number; y1: number; xl: Float64Array; xr: Float64Array; f: Float64Array; xmin: number; xmax: number }
const NONE: readonly Teardrop[] = [];

// √g，g ∈ [0, 1]（牛頓法固定 10 次；g 很小時誤差無所謂：那幾列的寬度 < 2 會被略過）
function root(g: number): number {
  if (g <= 0) return 0;
  let s = g < 0.25 ? 0.5 : 1;
  for (let k = 0; k < 10; k++) s = 0.5 * (s + g / s);
  return s;
}
const prof = (t: number): number => {
  const p = 1 + 2 * t * (1 - t);
  return t > 0.84 ? p * root(Math.max(0, 1 - (t - 0.84) / 0.16)) : p;
};
// 2 八度（cell、cell / 2，權重 2/3、1/3）
export class Fbm2 {
  private readonly a: ColNoise;
  private readonly b: ColNoise;
  constructor(cell: number, s: number) { this.a = new ColNoise(cell, s); this.b = new ColNoise(cell / 2, s + 7919); }
  setX(x: number): void { this.a.setX(x); this.b.setX(x); }
  at(y: number): number { return (this.a.at(y) * 2 + this.b.at(y)) / 3; }
}

export class JungleField {
  private readonly s: number;
  private readonly edge: Fbm2;
  readonly mat: Fbm2;
  readonly cave: Fbm2;
  private readonly cache = new Map<RegionInfo, Teardrop>();
  private x = Number.NaN;

  constructor(seed: string, private readonly layout: Layout, private readonly profile: Profile2) {
    this.s = seedInt(seed, 'g2-jungle');
    this.edge = new Fbm2(13, seedInt(seed, 'g2-jungle-edge'));
    this.mat = new Fbm2(15, seedInt(seed, 'g2-jungle-mat'));
    this.cave = new Fbm2(28, seedInt(seed, 'g2-jungle-cave'));
  }

  // 第 x 欄碰得到的淚滴（通常沒有或一個）；同時把三個雜訊 setX(x)
  at(x: number): readonly Teardrop[] {
    const m = this.layout.landmassAt(x);
    if (!m) return NONE;
    let out: Teardrop[] | null = null;
    for (const r of m.regions) {
      if (r.biome !== BIOME.JUNGLE || (r.kind !== 'home' && r.kind !== 'culture' && r.kind !== 'wild')) continue;
      const td = this.teardrop(r);
      if (x >= td.xmin && x < td.xmax) (out ??= []).push(td);
    }
    if (out && x !== this.x) { this.edge.setX(x); this.mat.setX(x); this.cave.setX(x); this.x = x; }
    return out ?? NONE;
  }

  // (x, y) 在淚滴裡的 inner（0..1；不在 = −1）。x 必須是上一次 at(x) 的 x
  inner(tds: readonly Teardrop[], x: number, y: number): number {
    let best = -1;
    for (const td of tds) {
      if (y < td.y0 || y >= td.y1) continue;
      const k = y - td.y0, xl = td.xl[k], xr = td.xr[k];
      if (x < xl - JUNGLE_J || x >= xr + JUNGLE_J) continue;
      const jx = x + (this.edge.at(y) - 0.5) * 2 * JUNGLE_J * td.f[k];
      if (jx < xl || jx >= xr) continue;
      const v = Math.min(1, Math.min(jx - xl, xr - jx) / INNER_D);
      if (v > best) best = v;
    }
    return best;
  }

  private teardrop(r: RegionInfo): Teardrop {
    let td = this.cache.get(r);
    if (td) return td;
    const p = this.profile, w = r.x1 - r.x0, mid = (r.x0 + r.x1) / 2;
    const s0 = (this.s ^ Math.imul(r.landmass * 2 + (r.side === -1 ? 1 : 0) + 1, 0x9e3779b1) ^ Math.imul(r.index + 1, 0x85ebca6b)) | 0;
    let top = p.height;
    for (let x = r.x0; x < r.x1; x++) top = Math.min(top, p.surfaceAt(x));
    const depth = Math.max(10, JUNGLE_BOTTOM - top), y0 = Math.max(1, top - 2), y1 = Math.max(y0, Math.min(p.height - 1, JUNGLE_BOTTOM));
    const n = y1 - y0, xl = new Float64Array(n), xr = new Float64Array(n), f = new Float64Array(n);
    let xmin = Infinity, xmax = -Infinity;
    for (let k = 0; k < n; k++) {
      const y = y0 + k, t = (y - top) / depth;
      const fk = Math.max(0.35, Math.min(1, (y - top) / 40));
      const lean = (vnoise1(y, 230, s0 + 40) - 0.5) * w * 0.7 * Math.min(1, t * 2.5);
      const wob = (q: number): number => ((vnoise1(y, 80, s0 + q) - 0.5) * 46 + (vnoise1(y, 19, s0 + q + 9) - 0.5) * 14) * fk;
      const hw = (w / 2) * prof(Math.max(0, t)) * (1 + (vnoise1(y, 64, s0 + 20) - 0.5) * 0.22);
      const c = mid + lean, l = c - hw + wob(2), rr = c + hw + wob(3);
      f[k] = fk;
      // 太窄的列（舊生成器 xr − xl < 2 略過）：左右邊設成空範圍
      if (rr - l < 2) { xl[k] = Infinity; xr[k] = -Infinity; continue; }
      xl[k] = l; xr[k] = rr;
      xmin = Math.min(xmin, Math.floor(l - JUNGLE_J)); xmax = Math.max(xmax, Math.ceil(rr + JUNGLE_J));
    }
    td = { y0, y1, xl, xr, f, xmin, xmax };
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
    this.cache.set(r, td);
    return td;
  }
}
