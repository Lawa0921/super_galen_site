// noise.ts — 世界生成用的確定性值雜訊（只用整數雜湊 + 四則運算，跨引擎位元一致）。
import { xmur3 } from './rng';

/** 字串 / 數字種子 → 32-bit 整數 */
export function seedInt(seed: string | number, name: string): number {
  return xmur3(`${seed}:${name}`)() | 0;
}

/** 格點雜湊 → [0,1) */
export function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 2D 值雜訊（cell 格距、雙線性 + smoothstep），0..1 */
export function vnoise2(x: number, y: number, cell: number, s: number): number {
  const fx = x / cell, fy = y / cell;
  const gx = Math.floor(fx), gy = Math.floor(fy);
  const sx = smooth(fx - gx), sy = smooth(fy - gy);
  const a = hash2(gx, gy, s), b = hash2(gx + 1, gy, s), c = hash2(gx, gy + 1, s), d = hash2(gx + 1, gy + 1, s);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** 1D 值雜訊，0..1 */
export function vnoise1(x: number, cell: number, s: number): number {
  const f = x / cell, g = Math.floor(f), t = smooth(f - g);
  const a = hash2(g, 0, s), b = hash2(g + 1, 0, s);
  return a + (b - a) * t;
}

/** 兩個八度的 2D 雜訊（大塊 + 細節），0..1 */
export function fbm2(x: number, y: number, cell: number, s: number): number {
  return vnoise2(x, y, cell, s) * 0.68 + vnoise2(x, y, cell * 0.4, s + 7) * 0.32;
}

/**
 * 預先算好格點值的 2D 值雜訊場（cellX × cellY 格距，可各向異性）。比逐點 hash 快很多，
 * 用於整片地底的洞穴 / 材料遮罩。座標超出建立範圍時夾到邊界格點。
 */
export class NoiseField {
  private readonly gw: number;
  private readonly gh: number;
  private readonly v: Float32Array;
  private readonly ix: number;
  private readonly iy: number;
  constructor(width: number, height: number, readonly cellX: number, readonly cellY: number, seed: number) {
    this.gw = Math.floor(width / cellX) + 3;
    this.gh = Math.floor(height / cellY) + 3;
    this.v = new Float32Array(this.gw * this.gh);
    for (let gy = 0; gy < this.gh; gy++) for (let gx = 0; gx < this.gw; gx++) this.v[gy * this.gw + gx] = hash2(gx, gy, seed);
    this.ix = 1 / cellX; this.iy = 1 / cellY;
  }
  /** 0..1（x、y ≥ 0；超出建立範圍時夾到邊界格點） */
  at(x: number, y: number): number {
    const fx = x * this.ix, fy = y * this.iy;
    let gx = fx | 0, gy = fy | 0;
    let tx = fx - gx, ty = fy - gy;
    if (gx > this.gw - 2) { gx = this.gw - 2; tx = 1; } else if (gx < 0) { gx = 0; tx = 0; }
    if (gy > this.gh - 2) { gy = this.gh - 2; ty = 1; } else if (gy < 0) { gy = 0; ty = 0; }
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const w = this.gw, i = gy * w + gx, v = this.v;
    const a = v[i], b = v[i + 1], c = v[i + w], d = v[i + w + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  }
}

/** 多個八度的 NoiseField 疊加（權重正規化），0..1 */
export class FbmField {
  private readonly fields: NoiseField[] = [];
  private readonly weights: number[] = [];
  constructor(width: number, height: number, cellX: number, cellY: number, seed: number, octaves = 3, gain = 0.5) {
    let w = 1, sum = 0;
    for (let o = 0; o < octaves; o++) {
      const k = 1 << o;
      this.fields.push(new NoiseField(width, height, Math.max(1, cellX / k), Math.max(1, cellY / k), seed + o * 7919));
      this.weights.push(w); sum += w; w *= gain;
    }
    for (let o = 0; o < octaves; o++) this.weights[o] /= sum;
  }
  at(x: number, y: number): number {
    let s = 0;
    for (let o = 0; o < this.fields.length; o++) s += this.fields[o].at(x, y) * this.weights[o];
    return s;
  }
  /** at(x,y) > thr？低八度先算，剩下八度全加滿也到不了門檻就提早放棄（結果與 at() > thr 完全相同） */
  above(x: number, y: number, thr: number): boolean {
    let s = 0, rest = 1;
    for (let o = 0; o < this.fields.length; o++) {
      rest -= this.weights[o];
      s += this.fields[o].at(x, y) * this.weights[o];
      if (s + rest <= thr) return false;
      if (s > thr) return true;
    }
    return s > thr;
  }
}
