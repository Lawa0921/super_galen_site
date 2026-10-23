// profile.ts — gen2 每欄側寫：一欄是海 / 沙灘 / 陸地 / 島、地表、水面、生態、深度層線、所屬地區。
// 地塊與地區由 Layout 決定（唯一擁有者）；這裡只把它們變成每欄的高度。全部是 (seed, layout, x) 的純函式，
// 只用 engine/noise.ts 的整數雜湊 + 四則運算，結果與先問哪一欄無關（32 欄一段快取只是加速）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { seedInt, vnoise1 } from '../noise';
import { BIOME } from '../world';
import type { ColumnLayers } from '../column';
import type { RegionInfo } from '../regionInfo';
import { HOME_X0, SPAWN_X, VARIANT, type Landmass, type Layout, type SideOrigin } from './layout';

export const SEA_Y = 341, CAVERN_BASE = 560, MOLTEN_BASE = 1010, LAVA_Y = MOLTEN_BASE + 40;
export const BLEND_W = 40, SHORE_RAMP = 100, BEACH_W = 40, SEA_DEPTH = 46, ISLAND_RAMP = 20, SPAWN_FLAT = 60, SPAWN_RAMP = 40;

// 各 variant 的起伏倍率（裁決 P3：Layout 會產生的每個 variant 都有值；島與海走專用規則，0 只是讓查表不會 undefined）
export const AMP: Readonly<Record<number, number>> = {
  [VARIANT.PLAIN]: 0.5, [VARIANT.HILLS]: 1, [VARIANT.HIGH]: 1.8,
  [VARIANT.SPAWN]: 0.5, [VARIANT.BEACH]: 0.3, [VARIANT.ISLAND]: 0, [VARIANT.SEA]: 0,
};

export const COL_SEA = 0, COL_BEACH = 1, COL_LAND = 2, COL_ISLAND = 3;

export interface ColInfo2 {
  kind: 0 | 1 | 2 | 3;
  surface: number;
  // 沒有水 = -1
  waterTop: number;
  biome: number;
  rock: number; deep: number; molten: number;
  region: RegionInfo;
}

// 各生態的地表起伏振幅（格，同 v1）
const RELIEF: Readonly<Record<number, number>> = { [BIOME.FOREST]: 14, [BIOME.DESERT]: 8, [BIOME.SNOW]: 28, [BIOME.JUNGLE]: 12 };
// 陸地基準 = seaY − LAND_DROP
const LAND_DROP = 7;
// 島台地 = seaY − (PLAT_MIN..PLAT_MAX)
const PLAT_MIN = 3, PLAT_MAX = 10;
// 海床最淺 = 水面下 MIN_WATER 格
const MIN_WATER = 2;

const SEG_BITS = 5, SEG = 1 << SEG_BITS, SEG_MASK = SEG - 1, SEG_MAX = 64;
// 一段的 Int16 欄位：surface / waterTop / rock / deep / molten；Uint8 欄位：kind / biome
const F_SURF = 0, F_WATER = 1, F_ROCK = 2, F_DEEP = 3, F_MOLT = 4, N_I16 = 5;
const F_KIND = 0, F_BIOME = 1, N_U8 = 2;

interface Seg { i16: Int16Array; u8: Uint8Array; region: (RegionInfo | null)[] }

export class Profile2 {
  private readonly sRelief: number;
  private readonly sFloor: number;
  private readonly sPlat: number;
  private readonly sLayers: number;
  // 烘焙世界（沒有 gen2 家鄉）：兩側第一片地塊貼著 v1 的接縫（P13）
  private readonly baked: boolean;
  private readonly spawnX: number | null;
  private readonly cache = new Map<number, Seg>();

  constructor(seed: string, private readonly layout: Layout, private readonly height: number) {
    this.sRelief = seedInt(seed, 'g2-relief');
    this.sFloor = seedInt(seed, 'g2-floor');
    this.sPlat = seedInt(seed, 'g2-plateau');
    this.sLayers = seedInt(seed, 'g2-layers');
    const home = layout.origin.home;
    this.baked = home === null;
    this.spawnX = home ? home.x0 + SPAWN_X - HOME_X0 : null;
  }

  // gen2 範圍外丟 RangeError
  info(x: number): ColInfo2 {
    const s = this.seg(x), j = x & SEG_MASK, region = s.region[j];
    if (!region) throw new RangeError(`gen2 profile: x ${x} is outside gen2`);
    const a = j * N_I16, b = j * N_U8;
    return {
      kind: s.u8[b + F_KIND] as 0 | 1 | 2 | 3,
      surface: s.i16[a + F_SURF], waterTop: s.i16[a + F_WATER], biome: s.u8[b + F_BIOME],
      rock: s.i16[a + F_ROCK], deep: s.i16[a + F_DEEP], molten: s.i16[a + F_MOLT],
      region,
    };
  }

  surfaceAt(x: number): number { return this.info(x).surface; }
  waterTopAt(x: number): number | null {
    const w = this.info(x).waterTop;
    return w < 0 ? null : w;
  }
  biomeAt(x: number): number { return this.info(x).biome; }
  layersAt(x: number): ColumnLayers {
    const i = this.info(x);
    return { rock: i.rock, deep: i.deep, molten: i.molten };
  }
  // 範圍外回 null
  regionAt(x: number): RegionInfo | null { return this.seg(x).region[x & SEG_MASK]; }

  // ── 快取 ──

  private seg(x: number): Seg {
    const key = x >> SEG_BITS;
    let s = this.cache.get(key);
    if (!s) {
      s = this.build(key << SEG_BITS);
      if (this.cache.size >= SEG_MAX) this.cache.clear();
      this.cache.set(key, s);
    }
    return s;
  }

  private build(x0: number): Seg {
    const s: Seg = { i16: new Int16Array(SEG * N_I16), u8: new Uint8Array(SEG * N_U8), region: new Array<RegionInfo | null>(SEG).fill(null) };
    for (let j = 0; j < SEG; j++) {
      const x = x0 + j, m = this.layout.landmassAt(x);
      if (!m) continue;
      const r = this.layout.regionAt(x);
      if (!r) continue;
      const o = this.originOf(x, m);
      const c = m.kind === 'sea' ? this.seaColumn(x, m, r, o) : this.landColumn(x, m, r, o);
      const surface = Math.max(1, Math.min(this.height - 4, c.surface));
      const lay = this.layers(x, surface);
      const a = j * N_I16, b = j * N_U8;
      s.i16[a + F_SURF] = surface;
      s.i16[a + F_WATER] = c.kind === COL_SEA ? o.seaY : -1;
      s.i16[a + F_ROCK] = lay.rock; s.i16[a + F_DEEP] = lay.deep; s.i16[a + F_MOLT] = lay.molten;
      s.u8[b + F_KIND] = c.kind;
      s.u8[b + F_BIOME] = c.kind === COL_SEA ? BIOME.OCEAN : r.biome;
      s.region[j] = r;
    }
    return s;
  }

  // 水面 / 岸高取該側的 SideOrigin；家鄉取較近的一側（新世界兩側都是 SEA_Y）
  private originOf(x: number, m: Landmass): SideOrigin {
    const o = this.layout.origin;
    if (m.side === 1) return o.east;
    if (m.side === -1) return o.west;
    return 2 * x < m.x0 + m.x1 ? o.west : o.east;
  }

  // ── 陸地（家鄉 / 大陸）──

  // 地區的起伏振幅與基準
  private amp(r: RegionInfo): number { return RELIEF[r.biome] * AMP[r.variant]; }
  // ver 0 每個地區的基準都是 seaY − LAND_DROP（內插保留給之後的 variant）
  private base(_r: RegionInfo, seaY: number): number { return seaY - LAND_DROP; }

  // 陸地地表（未取整的基準 b 與起伏 a·n）：地區交界 BLEND_W 內振幅與基準線性內插；出生點 ±SPAWN_FLAT 振幅 0、再 SPAWN_RAMP 格線性升回
  private landShape(x: number, m: Landmass, r: RegionInfo, seaY: number): { b: number; rel: number } {
    let a = this.amp(r), b = this.base(r, seaY);
    const k = r.index, regs = m.regions;
    const dl = x - r.x0, dr = r.x1 - x;
    if (k > 0 && dl < BLEND_W) {
      const q = regs[k - 1], w = 0.5 + dl / (2 * BLEND_W);
      a = a * w + this.amp(q) * (1 - w); b = b * w + this.base(q, seaY) * (1 - w);
    } else if (k < regs.length - 1 && dr <= BLEND_W) {
      const q = regs[k + 1], w = 0.5 + dr / (2 * BLEND_W);
      a = a * w + this.amp(q) * (1 - w); b = b * w + this.base(q, seaY) * (1 - w);
    }
    if (m.kind === 'home' && this.spawnX !== null) {
      const d = Math.abs(x - this.spawnX) - SPAWN_FLAT;
      if (d <= 0) a = 0;
      else if (d < SPAWN_RAMP) a = a * d / SPAWN_RAMP;
    }
    const n = vnoise1(x, 64, this.sRelief) * 0.65 + vnoise1(x, 17, this.sRelief + 1) * 0.35;
    return { b, rel: a * n };
  }

  private landColumn(x: number, m: Landmass, r: RegionInfo, o: SideOrigin): { kind: 0 | 1 | 2 | 3; surface: number } {
    const seaY = o.seaY, { b, rel } = this.landShape(x, m, r, seaY);
    const land = Math.round(b) - Math.round(rel), real = b - rel;
    let e = Math.min(x - m.x0, m.x1 - 1 - x);
    // 烘焙世界、第一片大陸緊貼 v1 的海（P13）：SHORE_RAMP 內從 v1 海床 shore 爬到陸地地表（水面下的欄延續 v1 的海），再 BEACH_W 格沙灘
    if (this.baked && m.kind === 'continent' && m.i === 1 && o.start === 'continent') {
      const inner = m.side === 1 ? x - m.x0 : m.x1 - 1 - x;
      if (inner < SHORE_RAMP) return this.shore(Math.round(o.shore + (real - o.shore) * (inner + 1) / SHORE_RAMP), seaY, COL_BEACH);
      if (inner < SHORE_RAMP + BEACH_W) return { kind: COL_BEACH, surface: land };
      e = m.side === 1 ? m.x1 - 1 - x : x - m.x0;
    }
    // 陸地離水 BEACH_W 格內是沙灘：從水面線性爬到陸地地表
    if (e < BEACH_W) return { kind: COL_BEACH, surface: Math.round(seaY + (real - seaY) * e / BEACH_W) };
    return { kind: COL_LAND, surface: land };
  }

  // ── 海 ──

  // 海床 = seaY + SEA_DEPTH ± 8；離岸 SHORE_RAMP 內（離島 ISLAND_RAMP 內）線性爬升到岸邊；島 = 台地 seaY − (3..10)、兩側 ISLAND_RAMP 斜到海床。
  // 各個岸的斜坡各算一個高度取最淺的（連續、相鄰差不超過各斜坡自己的坡度）。
  private seaColumn(x: number, m: Landmass, r: RegionInfo, o: SideOrigin): { kind: 0 | 1 | 2 | 3; surface: number } {
    const seaY = o.seaY;
    const depth = SEA_DEPTH + Math.round((vnoise1(x, 37, this.sFloor) - 0.5) * 16);
    const ramp = (d: number, w: number): number => seaY + Math.max(MIN_WATER, Math.round(depth * Math.min(1, (d + 1) / w)));
    const d0 = x - m.x0, d1 = m.x1 - 1 - x;
    const dIn = m.side === 1 ? d0 : d1, dOut = m.side === 1 ? d1 : d0;
    let s = ramp(dOut, SHORE_RAMP);
    // 烘焙世界的第一道海（P13）：內側從 v1 陸地的地表 shore 斜下到海床
    if (this.baked && m.i === 1 && o.start === 'sea') s = Math.min(s, Math.round(o.shore + (seaY + depth - o.shore) * Math.min(1, (dIn + 1) / SHORE_RAMP)));
    else s = Math.min(s, ramp(dIn, SHORE_RAMP));
    for (const isl of m.islands) {
      if (x >= isl.x0 && x < isl.x1) {
        const t = Math.min(1, (x - isl.x0 + 1) / ISLAND_RAMP, (isl.x1 - x) / ISLAND_RAMP);
        const plat = seaY - PLAT_MIN - Math.round((PLAT_MAX - PLAT_MIN) * vnoise1(x, 29, this.sPlat));
        const edge = seaY + MIN_WATER;
        s = Math.min(s, Math.round(edge + (plat - edge) * t));
      } else {
        const d = x < isl.x0 ? isl.x0 - 1 - x : x - isl.x1;
        if (d < ISLAND_RAMP) s = Math.min(s, ramp(d, ISLAND_RAMP));
      }
    }
    return this.shore(s, seaY, r.kind === 'island' ? COL_ISLAND : COL_BEACH);
  }

  // 岸邊的分類：水深 ≥ MIN_WATER 是海；更淺就是乾地（島欄在水面上至少 1 格、其餘乾地最低到水面）
  private shore(s: number, seaY: number, dry: 1 | 3): { kind: 0 | 1 | 2 | 3; surface: number } {
    if (s >= seaY + MIN_WATER) return { kind: COL_SEA, surface: s };
    return { kind: dry, surface: Math.min(s, dry === COL_ISLAND ? seaY - 1 : seaY) };
  }

  // ── 層線（比照 v1：rock = surface + 18 ± 8、deep = CAVERN_BASE ± 16、molten = MOLTEN_BASE ± 12，夾住順序）──

  private layers(x: number, surface: number): ColumnLayers {
    const L = this.sLayers, height = this.height;
    let molten = MOLTEN_BASE + Math.round((vnoise1(x, 45, L + 2) - 0.5) * 24);
    let deep = CAVERN_BASE + Math.round((vnoise1(x, 55, L + 1) - 0.5) * 32);
    let rock = surface + 18 + Math.round((vnoise1(x, 37, L) - 0.5) * 16);
    deep = Math.max(deep, rock + 10);
    molten = Math.min(height - 1, Math.max(molten, deep + 10));
    deep = Math.min(deep, molten - 1);
    rock = Math.max(surface + 1, Math.min(rock, deep - 1));
    return { rock, deep, molten };
  }
}
