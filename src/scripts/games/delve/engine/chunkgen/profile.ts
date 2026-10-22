// profile.ts — 外圍生成器 v0 的「每欄」側寫（B9）：區域（中央 / 海 / 陸地生態段）、地表、水面、生態、深度層線。
// 全部是 (seed, x) 的純函式：只用 engine/noise.ts 的整數雜湊 + 四則運算（不用亂數、不用超越函數），
// 任一欄的結果與先問哪一欄無關。注意：本資料夾的檔案（測試以外）不得出現連續兩個星號（測試會 grep），註解一律用 //。
import { seedInt, hash2, vnoise1 } from '../noise';
import { BIOME, type BiomeId } from '../world';
import type { ColumnLayers } from '../column';

// 海寬 / 生態段寬 / 段寬抖動 / 海床平均深 / 海床靠岸斜坡寬
export const SEA_W = 480, SEG_W = 900, SEG_JITTER = 120, SEA_DEPTH = 46, SHORE_RAMP = 100;
// 陸地離海這麼多格內是沙灘斜坡；生態段界這麼多格內地表起伏線性混合
export const BEACH_W = 40;
export const BLEND_W = 40;
// 各生態的地表起伏振幅（格）
const RELIEF: Record<number, number> = { [BIOME.FOREST]: 14, [BIOME.DESERT]: 8, [BIOME.SNOW]: 28, [BIOME.JUNGLE]: 12 };

// 中央區（舊生成器）的框：外圍以它的兩個邊欄地表與深度層基準接上
export interface CentralFrame {
  width: number; height: number;
  edgeL: number; // surface[0]
  edgeR: number; // surface[width-1]
  cavernY: number; moltenY: number;
}

export function frameOf(src: { width: number; height: number; surface: Int16Array; cavernY: number; moltenY: number }): CentralFrame {
  return {
    width: src.width, height: src.height,
    edgeL: src.surface[0], edgeR: src.surface[src.width - 1],
    cavernY: src.cavernY, moltenY: src.moltenY,
  };
}

// 生態段：side 1 = 東（x ≥ width）、-1 = 西（x < 0）；k = 海後第幾段；[x0, x1) 是世界座標（x0 < x1）
export interface OuterSegment { side: 1 | -1; k: number; x0: number; x1: number; biome: BiomeId; culture: string | null; }
// d = 離中央邊欄的距離（東：x − width；西：−1 − x）
export type OuterZone = { kind: 'central' } | { kind: 'sea'; side: 1 | -1; d: number } | { kind: 'land'; side: 1 | -1; d: number; seg: OuterSegment };

// fill 用的一欄資訊（內部；公開 API 都從這裡導出）
export interface ColumnInfo {
  // 0 = 中央、1 = 海、2 = 沙灘（陸地離海 BEACH_W 格內）、3 = 陸地
  kind: 0 | 1 | 2 | 3;
  side: 1 | -1;
  surface: number;
  waterTop: number; // 沒有水 = -1
  biome: BiomeId;
  rock: number; deep: number; molten: number;
}

export const ZONE_CENTRAL = 0, ZONE_SEA = 1, ZONE_BEACH = 2, ZONE_LAND = 3;

// 0..3 的 24 種排列（字典序；前 6 種以 0 = 森林開頭）
const PERMS: number[][] = (() => {
  const out: number[][] = [];
  for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) for (let d = 0; d < 4; d++) {
    if (a === b || a === c || a === d || b === c || b === d || c === d) continue;
    out.push([a, b, c, d]);
  }
  return out;
})();

export class OuterProfile {
  readonly seed: string;
  readonly frame: CentralFrame;
  private readonly sSeg: number;
  private readonly sBiome: number;
  private readonly sRelief: number;
  private readonly sFloor: number;
  private readonly sLayers: number;

  constructor(seed: string, frame: CentralFrame) {
    this.seed = seed;
    this.frame = frame;
    this.sSeg = seedInt(seed, 'outer-seg');
    this.sBiome = seedInt(seed, 'outer-biome');
    this.sRelief = seedInt(seed, 'outer-relief');
    this.sFloor = seedInt(seed, 'outer-floor');
    this.sLayers = seedInt(seed, 'outer-layers');
  }

  // ── 生態段 ────────────────────────────────────────────
  // 第 k 段的起點（離海後的距離 e；b(0) = 0，之後每段 SEG_W ± SEG_JITTER）
  private bound(side: number, k: number): number {
    if (k <= 0) return 0;
    const j = Math.floor((hash2(k, side, this.sSeg) * 2 - 1) * SEG_JITTER);
    return k * SEG_W + j;
  }
  // 海後距離 e（≥ 0）所在的段號
  private segIndex(side: number, e: number): number {
    let k = Math.floor(e / SEG_W);
    if (k > 0 && e < this.bound(side, k)) k--;
    else if (e >= this.bound(side, k + 1)) k++;
    return k;
  }
  // 第 j 組四段（未修正前）的排列：第 0 組固定森林開頭
  private rawPerm(side: number, j: number): number[] {
    const h = hash2(j, side, this.sBiome);
    return j === 0 ? PERMS[Math.floor(h * 6)] : PERMS[Math.floor(h * 24)];
  }
  // 第 k 段的生態：每 4 段是四種生態的一個排列（所以任 4 個對齊的段四種都有）；
  // 組的開頭若與上一組的結尾相同就與第二個交換（交換不動結尾 → 只看上一組的原始排列，不用遞迴）
  biomeOfSeg(side: number, k: number): BiomeId {
    const j = k >> 2, i = k & 3;
    const p = this.rawPerm(side, j);
    if (j > 0 && p[0] === this.rawPerm(side, j - 1)[3] && i < 2) return p[1 - i] as BiomeId;
    return p[i] as BiomeId;
  }
  private makeSeg(side: 1 | -1, k: number): OuterSegment {
    const { width } = this.frame;
    const b0 = this.bound(side, k), b1 = this.bound(side, k + 1);
    const biome = this.biomeOfSeg(side, k);
    if (side === 1) return { side, k, x0: width + SEA_W + b0, x1: width + SEA_W + b1, biome, culture: null };
    return { side, k, x0: -SEA_W - b1, x1: -SEA_W - b0, biome, culture: null };
  }

  // ── 區域 ─────────────────────────────────────────────
  zoneAt(x: number): OuterZone {
    const { width } = this.frame;
    if (x >= 0 && x < width) return { kind: 'central' };
    const side: 1 | -1 = x >= width ? 1 : -1;
    const d = side === 1 ? x - width : -1 - x;
    if (d < SEA_W) return { kind: 'sea', side, d };
    return { kind: 'land', side, d, seg: this.makeSeg(side, this.segIndex(side, d - SEA_W)) };
  }
  segmentAt(x: number): OuterSegment | null {
    const z = this.zoneAt(x);
    return z.kind === 'land' ? z.seg : null;
  }

  // ── 地表 ─────────────────────────────────────────────
  // 陸地生態段裡的地表（不含沙灘斜坡）：edge − 6 − 起伏；段界 BLEND_W 格內振幅線性混合
  private landSurface(x: number, side: number, e: number, k: number): number {
    const edge = side === 1 ? this.frame.edgeR : this.frame.edgeL;
    let amp = RELIEF[this.biomeOfSeg(side, k)];
    const b0 = this.bound(side, k), b1 = this.bound(side, k + 1);
    if (k > 0 && e - b0 < BLEND_W) {
      const w = 0.5 + (e - b0) / (2 * BLEND_W);
      amp = amp * w + RELIEF[this.biomeOfSeg(side, k - 1)] * (1 - w);
    } else if (b1 - e <= BLEND_W) {
      const w = 0.5 + (b1 - e) / (2 * BLEND_W);
      amp = amp * w + RELIEF[this.biomeOfSeg(side, k + 1)] * (1 - w);
    }
    const n = vnoise1(x, 64, this.sRelief) * 0.65 + vnoise1(x, 17, this.sRelief + 1) * 0.35;
    return edge - 6 - Math.round(amp * n);
  }

  // 一欄的全部側寫（fill 用；公開 API 都從這裡導出）
  info(x: number): ColumnInfo {
    const { width, height } = this.frame;
    if (x >= 0 && x < width) {
      return { kind: ZONE_CENTRAL, side: 1, surface: 0, waterTop: -1, biome: BIOME.FOREST, rock: 0, deep: 0, molten: 0 };
    }
    const side: 1 | -1 = x >= width ? 1 : -1;
    const d = side === 1 ? x - width : -1 - x;
    const edge = side === 1 ? this.frame.edgeR : this.frame.edgeL;
    let kind: 1 | 2 | 3, surface: number, waterTop = -1;
    let biome: BiomeId = BIOME.FOREST;
    if (d < SEA_W) {
      kind = ZONE_SEA;
      const depth = SEA_DEPTH + Math.round((vnoise1(x, 37, this.sFloor) - 0.5) * 16);
      const ramp = Math.min(1, (d + 1) / SHORE_RAMP, (SEA_W - d) / SHORE_RAMP);
      surface = edge + Math.max(2, Math.round(depth * ramp));
      waterTop = edge + 1;
    } else {
      const e = d - SEA_W, k = this.segIndex(side, e);
      biome = this.biomeOfSeg(side, k);
      const land = this.landSurface(x, side, e, k);
      if (e < BEACH_W) {
        kind = ZONE_BEACH;
        surface = edge + 1 + Math.round((land - edge - 1) * e / BEACH_W);
      } else {
        kind = ZONE_LAND;
        surface = land;
      }
    }
    surface = Math.max(1, Math.min(height - 4, surface));
    const L = this.sLayers;
    let molten = this.frame.moltenY + Math.round((vnoise1(x, 45, L + 2) - 0.5) * 24);
    let deep = this.frame.cavernY + Math.round((vnoise1(x, 55, L + 1) - 0.5) * 32);
    let rock = surface + 18 + Math.round((vnoise1(x, 37, L) - 0.5) * 16);
    deep = Math.max(deep, rock + 10);
    molten = Math.min(height - 1, Math.max(molten, deep + 10));
    deep = Math.min(deep, molten - 1);
    rock = Math.max(surface + 1, Math.min(rock, deep - 1));
    return { kind, side, surface, waterTop, biome, rock, deep, molten };
  }

  surfaceAt(x: number): number { return this.info(x).surface; }
  waterTopAt(x: number): number | null {
    const w = this.info(x).waterTop;
    return w < 0 ? null : w;
  }
  biomeAt(x: number): BiomeId { return this.info(x).biome; }
  layersAt(x: number): ColumnLayers {
    const i = this.info(x);
    return { rock: i.rock, deep: i.deep, molten: i.molten };
  }
}
