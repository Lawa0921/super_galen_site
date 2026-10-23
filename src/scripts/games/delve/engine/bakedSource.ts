// bakedSource.ts — 烘焙過的舊世界（Task 16）的 ColumnSource：一個 World（central: 'source'）的每一欄由這裡分三段回答。
//   · 中央 [0, width)：fill 不寫任何格（中央的每個 chunk 都是存檔裡的「已修改 chunk」，停放 / 讀檔一定整塊蓋上）；
//     每欄資料（地表 / 生態 / 層線）讀 LegacyMeta（= 舊生成器的輸出），地區 = 家鄉後備值（同舊世界的 World.regionAt）。
//   · 舊外圍 [west.x, 0) ∪ [width, east.x)：v1 OuterGen 即時生成（spec §5 決定 3：不存成 chunk；v1 本來就是純 (seed, x, y)）。
//   · 其他：Gen2Source，版面原點 = bake.east / bake.west（沒有 gen2 家鄉；兩側第一片地塊貼著接縫，Profile2 的接縫規則 P13）。
//   · 接縫封口：v1 與 gen2 的地下（洞穴、熔岩層）各算各的，接縫兩側的液體不會剛好對上。緊貼接縫的那一欄 gen2
//     （west.x − 1、east.x）裡，凡是與 v1 內側那一欄的同列格「兩格都不是實心、至少一格有液體、又不是同種滿格」的格，改成石頭、
//     清掉液體：接縫上不會有液體牆（流進另一側的空氣），v1 那一側一格都不改（舊範圍與舊世界逐格相同）。
import { Column, li, type ColumnLayers, type ColumnSource, type GenChest } from './column';
import { T, SOLID_LUT } from './tiles';
import { LIQ_MAX } from './liquidKind';
import type { RegionInfo } from './regionInfo';
import { OuterGen } from './legacy/chunkgen';
import { Gen2Source, GEN2_VERSION } from './gen2';
import type { LockTable } from './gen2/locks';
import type { LegacyMeta } from '../save/legacyMeta';
import type { BakeInfo } from '../save/bake';

const Z_CENTRAL = 0, Z_V1 = 1, Z_GEN2 = 2;

export class BakedSource implements ColumnSource {
  readonly version: number = GEN2_VERSION;
  readonly gen2: Gen2Source;
  readonly v1: OuterGen;
  /** 中央寬 / 舊範圍 [lo, hi)（lo = bake.west.x ≤ 0、hi = bake.east.x ≥ width） */
  private readonly W: number;
  private readonly lo: number;
  private readonly hi: number;
  /** v1 內側那一欄（西 = lo、東 = hi − 1）的整欄格子（封口用；第一次用到時生成） */
  private readonly inner = new Map<number, Column>();

  constructor(seed: string, readonly meta: LegacyMeta, readonly bake: BakeInfo, locks: LockTable, recordLocks: boolean) {
    this.W = meta.frame.width;
    this.lo = bake.west.x;
    this.hi = bake.east.x;
    if (!(this.lo <= 0 && this.hi >= this.W)) throw new RangeError(`baked source: legacy range [${this.lo}, ${this.hi}) must cover [0, ${this.W})`);
    this.v1 = new OuterGen(seed, bake.frame);
    this.gen2 = new Gen2Source(seed, { origin: { home: null, east: bake.east, west: bake.west }, locks, recordLocks });
  }

  /** 第 x 欄由誰回答 */
  private zone(x: number): 0 | 1 | 2 {
    if (x >= 0 && x < this.W) return Z_CENTRAL;
    return x >= this.lo && x < this.hi ? Z_V1 : Z_GEN2;
  }
  /** x 是否在舊範圍內（中央或舊外圍；地區查詢 / 傳送碑用） */
  inLegacy(x: number): boolean { return x >= this.lo && x < this.hi; }

  // [x0, x1) 依區段切開：gen2 | v1 | 中央（不寫）| v1 | gen2
  fill(col: Column, x0: number, x1: number): void {
    const part = (a: number, b: number, f: (a: number, b: number) => void): void => {
      const s = Math.max(x0, a), e = Math.min(x1, b);
      if (s < e) f(s, e);
    };
    part(-Infinity, this.lo, (a, b) => this.gen2.fill(col, a, b));
    part(this.lo, 0, (a, b) => this.v1.fill(col, a, b));
    part(this.W, this.hi, (a, b) => this.v1.fill(col, a, b));
    part(this.hi, Infinity, (a, b) => this.gen2.fill(col, a, b));
    if (x0 <= this.lo - 1 && this.lo - 1 < x1) this.seal(col, this.lo - 1, this.lo);
    if (x0 <= this.hi && this.hi < x1) this.seal(col, this.hi, this.hi - 1);
  }

  /** 接縫封口（見檔頭）：gen2 的第 gx 欄（在 col 裡）對 v1 的第 vx 欄 */
  private seal(col: Column, gx: number, vx: number): void {
    let v = this.inner.get(vx);
    if (!v) {
      v = new Column(vx >> 5, col.height, false);
      this.v1.fill(v, vx, vx + 1);
      this.inner.set(vx, v);
    }
    for (let y = 0; y < col.height; y++) {
      const i = li(gx, y), j = li(vx, y);
      if (SOLID_LUT[col.fg[i]] === 1 || SOLID_LUT[v.fg[j]] === 1) continue;
      const a = col.liquid[i], b = v.liquid[j];
      if (a === 0 && b === 0) continue;
      if (a === LIQ_MAX && b === LIQ_MAX && col.liquidType[i] === v.liquidType[j]) continue;
      col.fg[i] = T.STONE;
      col.liquid[i] = 0;
      col.liquidType[i] = 0;
    }
  }

  surfaceAt(x: number): number {
    const z = this.zone(x);
    return z === Z_CENTRAL ? this.meta.surface[x] : z === Z_V1 ? this.v1.surfaceAt(x) : this.gen2.surfaceAt(x);
  }
  biomeAt(x: number): number {
    const z = this.zone(x);
    return z === Z_CENTRAL ? this.meta.biome[x] : z === Z_V1 ? this.v1.biomeAt(x) : this.gen2.biomeAt(x);
  }
  layersAt(x: number): ColumnLayers {
    const z = this.zone(x), L = this.meta.layers;
    if (z === Z_CENTRAL) return { rock: L.rock[x], deep: L.deep[x], molten: L.molten[x] };
    return z === Z_V1 ? this.v1.layersAt(x) : this.gen2.layersAt(x);
  }
  // 中央（舊生成器的地形）沒有海面；舊世界的地平線在中央同樣只看地表
  waterTopAt(x: number): number | null {
    const z = this.zone(x);
    return z === Z_CENTRAL ? null : z === Z_V1 ? this.v1.waterTopAt(x) : this.gen2.waterTopAt(x);
  }
  regionAt(x: number): RegionInfo {
    const z = this.zone(x);
    if (z === Z_CENTRAL) {
      return { landmass: 0, side: 0, tier: 0, kind: 'home', culture: null, variant: 0, biome: this.meta.biome[x], index: 0, x0: 0, x1: this.W };
    }
    return z === Z_V1 ? this.v1.regionAt(x) : this.gen2.regionAt(x);
  }
  // 生成物件只有 gen2 段有（中央的箱子在存檔裡、v1 不放箱子）
  objectsIn(x0: number, x1: number): GenChest[] {
    const out: GenChest[] = [];
    if (x0 < this.lo) out.push(...this.gen2.objectsIn(x0, Math.min(x1, this.lo)));
    if (x1 > this.hi) out.push(...this.gen2.objectsIn(Math.max(x0, this.hi), x1));
    return out;
  }
}
