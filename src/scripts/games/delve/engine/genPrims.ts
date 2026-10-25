// genPrims.ts — v1 外圍生成器（legacy/chunkgen）與 gen2 共用的生成 primitives（裁決 P10：只有一份，兩邊都 import）：
// 地表起伏 / 海床 / 層線、沿 y 取樣的值雜訊（ColNoise）、洞穴與入口與礦的噪聲取樣、樹 / 仙人掌繪製。
// 材質表與「哪個噪聲值換成哪種礦、能替換哪些格」是各生成器自己的規則，不放這裡。
// 全部是 (x, seed, …) 的純函式：只用 engine/noise.ts 的整數雜湊 + 四則運算（不用亂數、不用超越函數）。
// v1 的輸出以 legacy/chunkgen/chunkgen.test.ts 的 V1_SEA_HASH / V1_FILL_HASH 釘住：改這裡的數值就會改到舊世界。
// 本檔不得出現連續兩個星號（測試會 grep），註解一律用 //。
import { hash2, vnoise1 } from './noise';
import { T } from './tiles';
import { BIOME } from './world';
import { li, type Column, type ColumnLayers } from './column';

// 各基本生態的地表起伏振幅（格）
export const BIOME_RELIEF: Readonly<Record<number, number>> = { [BIOME.FOREST]: 14, [BIOME.DESERT]: 8, [BIOME.SNOW]: 28, [BIOME.JUNGLE]: 12 };

// 地表起伏雜訊（大起伏 64 格 + 細節 17 格兩層），0..1；seed 與 seed + 1 各用一層
export function reliefNoise(x: number, seed: number): number {
  return vnoise1(x, 64, seed) * 0.65 + vnoise1(x, 17, seed + 1) * 0.35;
}

// 海床深度（水面下的格數）：mean ± 8
export function seabedDepth(x: number, mean: number, seed: number): number {
  return mean + Math.round((vnoise1(x, 37, seed) - 0.5) * 16);
}

// 一欄的深度層線：rock = surface + 18 ± 8、deep = cavernY ± 16、molten = moltenY ± 12，
// 再夾住順序 surface < rock < deep < molten ≤ height − 1。seed、seed + 1、seed + 2 各用一條。
export function layerLines(x: number, surface: number, height: number, seed: number, cavernY: number, moltenY: number): ColumnLayers {
  let molten = moltenY + Math.round((vnoise1(x, 45, seed + 2) - 0.5) * 24);
  let deep = cavernY + Math.round((vnoise1(x, 55, seed + 1) - 0.5) * 32);
  let rock = surface + 18 + Math.round((vnoise1(x, 37, seed) - 0.5) * 16);
  deep = Math.max(deep, rock + 10);
  molten = Math.min(height - 1, Math.max(molten, deep + 10));
  deep = Math.min(deep, molten - 1);
  rock = Math.max(surface + 1, Math.min(rock, deep - 1));
  return { rock, deep, molten };
}

// ── 沿 y 取樣的值雜訊 ──────────────────────────────────────

const smooth = (t: number): number => t * t * (3 - 2 * t);

// vnoise2(x, y, cell, s) 固定 x、沿 y 取樣：與 noise.ts 的 vnoise2 逐位元相同（同樣的運算順序），只是格點雜湊在同一格內重用
export class ColNoise {
  private fx = 0; private gx = 0; private sx = 0;
  private gy = 0x7fffffff;
  private a = 0; private b = 0; private c = 0; private d = 0;
  constructor(readonly cell: number, readonly s: number) {}
  setX(x: number): void {
    this.fx = x / this.cell;
    this.gx = Math.floor(this.fx);
    this.sx = smooth(this.fx - this.gx);
    this.gy = 0x7fffffff;
  }
  at(y: number): number {
    const fy = y / this.cell, gy = Math.floor(fy);
    if (gy !== this.gy) {
      const gx = this.gx, s = this.s;
      this.gy = gy;
      this.a = hash2(gx, gy, s); this.b = hash2(gx + 1, gy, s);
      this.c = hash2(gx, gy + 1, s); this.d = hash2(gx + 1, gy + 1, s);
    }
    const sx = this.sx, sy = smooth(fy - gy), a = this.a, b = this.b, c = this.c, d = this.d;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
}

// ── 洞穴取樣 ───────────────────────────────────────────

// 義大利麵洞穴：|vnoise2(x, y, 48) − 0.5| < SPAG_THR（越深越寬，到熔岩線加 SPAG_GROW）
const SPAG_CELL = 48, SPAG_THR = 0.035, SPAG_GROW = 0.015;
// 洞穴層大洞窟：fbm2(x, y, 64) > CAVERN_THR
const CAVERN_CELL = 64, CAVERN_THR = 0.68;
// 地表入口：vnoise1(x, 40) > ENTRANCE_THR 的欄，義大利麵從地表就開始挖
const ENTRANCE_CELL = 40, ENTRANCE_THR = 0.85;
// 一般欄地表下這麼多格內不挖（入口欄除外）
export const NO_DIG = 6;

export function spagNoise(s: number): ColNoise { return new ColNoise(SPAG_CELL, s); }
// k = 深度比例（岩層頂 0 → 熔岩線 1）
export function spagHit(n: ColNoise, y: number, k: number): boolean {
  const v = n.at(y) - 0.5, t = SPAG_THR + SPAG_GROW * k;
  return v < t && v > -t;
}

// fbm2(x, y, cell, s) = vnoise2(cell, s) × 0.68 + vnoise2(cell × 0.4, s + 7) × 0.32（兩層各自沿 y 快取）
export class CavernNoise {
  private readonly a: ColNoise;
  private readonly b: ColNoise;
  constructor(s: number) { this.a = new ColNoise(CAVERN_CELL, s); this.b = new ColNoise(CAVERN_CELL * 0.4, s + 7); }
  setX(x: number): void { this.a.setX(x); this.b.setX(x); }
  at(y: number): number { return this.a.at(y) * 0.68 + this.b.at(y) * 0.32; }
}
export function cavernHit(n: CavernNoise, y: number): boolean { return n.at(y) > CAVERN_THR; }

export function entranceHit(x: number, s: number): boolean { return vnoise1(x, ENTRANCE_CELL, s) > ENTRANCE_THR; }

// ── 礦噪聲 ─────────────────────────────────────────────
// 每種礦一個 vnoise2(x, y, 6) 場；值 > 門檻的格可以換成該礦（深度帶與能替換哪些格由各生成器自己決定）
const ORE_CELL = 6;
export const ORE_THR = { CU: 0.76, FE: 0.83, AG: 0.86, AU: 0.88 } as const;
export function oreNoise(s: number): ColNoise { return new ColNoise(ORE_CELL, s); }

// ── 團塊噪聲（gen2 M2a Task 12：花崗岩 / 大理石、熔岩帶；v1 不用）─────────────
// vnoise2(x, y, cell) 的三次方（只用乘法）：0..1，高值只剩格點雜湊大的地方 → 稀疏的團塊（團塊大小約 cell / 2）。
// 單層值雜訊直接比門檻 0.72 約 17% 的格都會過（舊生成器的花崗岩約佔該深度帶的 1%）；三次方後 > 0.55 約 7.6%、> 0.72 約 2.5%、
// > 0.74 約 2.1%、(0.8, 0.86] 約 0.6%、> 0.86 約 0.5%（8000 × 400 格實測，與 cell 無關）。沿 y 取樣同 ColNoise（格點雜湊在同一格內重用）
export const BLOB_CELL = 48;
class BlobNoise extends ColNoise {
  override at(y: number): number { const v = super.at(y); return v * v * v; }
}
export function blobNoise(s: number, cell: number = BLOB_CELL): ColNoise { return new BlobNoise(cell, s); }

// ── 樹 / 仙人掌 ─────────────────────────────────────────
// 樹根：hash2(x, 0) < 機率、而且是左右各 TREE_REACH 格內最小的（→ 樹根間距 ≥ 4）；樹冠半徑 ≤ 3
const TREE_REACH = 3;
const P_TREE_FOREST = 0.3, P_TREE_JUNGLE = 0.45, P_CACTUS = 0.25;

// 可以長植物的欄：地表與生態（沙漠長仙人掌、森林 / 叢林長樹、其他不長）；不能長 = null
export interface PlantSite { surface: number; biome: number }

// 樹根：hash2(x, 0) < p 而且是左右 TREE_REACH 格內最小（同值時 x 小的贏）→ 間距 ≥ TREE_REACH + 1
function isRoot(x: number, s: number, p: number): boolean {
  const h = hash2(x, 0, s);
  if (h >= p) return false;
  for (let dx = -TREE_REACH; dx <= TREE_REACH; dx++) {
    if (dx === 0) continue;
    const o = hash2(x + dx, 0, s);
    if (o < h || (o === h && dx < 0)) return false;
  }
  return true;
}

// 仙人掌：根欄地表上 2..5 格（只蓋空氣）
function plantCactus(col: Column, rx: number, ground: number, s: number): void {
  const fg = col.fg, liq = col.liquid;
  const hc = 2 + Math.floor(hash2(rx, 1, s) * 4);
  for (let k = 1; k <= hc; k++) {
    const y = ground - k;
    if (y < 1) break;
    const i = li(rx, y);
    if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.CACTUS;
  }
}

// 樹：回樹冠 [top, r]（樹太高頂到天 = null）；樹根在 [x0, x1) 才畫樹幹（只蓋空氣）
function plantTree(col: Column, x0: number, x1: number, rx: number, ground: number, jungle: boolean, s: number): [number, number] | null {
  const fg = col.fg, liq = col.liquid, H = col.height;
  const hh = hash2(rx, 1, s), hr = hash2(rx, 2, s);
  const h = jungle ? 9 + Math.floor(hh * 7) : 5 + Math.floor(hh * 7);
  const r = 2 + Math.floor(hr * 2);
  const top = ground - h;
  if (top - r - 1 < 1) return null;
  if (rx >= x0 && rx < x1) {
    for (let y = top; y < ground && y < H; y++) {
      const i = li(rx, y);
      if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.WOOD;
    }
  }
  return [top, r];
}

// 菱形樹冠，只畫進 [x0, x1)、只蓋空氣
function drawCanopy(col: Column, x0: number, x1: number, rx: number, top: number, r: number): void {
  const fg = col.fg, liq = col.liquid, H = col.height;
  for (let dx = -r; dx <= r; dx++) {
    const xx = rx + dx;
    if (xx < x0 || xx >= x1) continue;
    const ax = dx < 0 ? -dx : dx;
    for (let dy = -r; dy <= r; dy++) {
      const ay = dy < 0 ? -dy : dy;
      if (ax + ay > r) continue;
      const yy = top + dy;
      if (yy < 0 || yy >= H) continue;
      const i = li(xx, yy);
      if (fg[i] === T.AIR && liq[i] === 0) fg[i] = T.LEAVES;
    }
  }
}

// 樹 / 仙人掌：掃 [x0 − 3, x1 + 3) 的樹根，只畫進 [x0, x1)；先畫全部樹幹與仙人掌、再畫樹冠（樹冠只蓋空氣）
// → 一欄分幾段填結果都一樣。site(x) 決定哪些欄能長（呼叫端的規則：陸地欄、非入口…）
export function growPlants(col: Column, x0: number, x1: number, site: (x: number) => PlantSite | null, sTree: number, sCactus: number): void {
  const crowns: number[] = [];
  for (let rx = x0 - TREE_REACH; rx < x1 + TREE_REACH; rx++) {
    const p = site(rx);
    if (!p) continue;
    if (p.biome === BIOME.DESERT) {
      if (rx >= x0 && rx < x1 && isRoot(rx, sCactus, P_CACTUS)) plantCactus(col, rx, p.surface, sCactus);
      continue;
    }
    if (p.biome !== BIOME.FOREST && p.biome !== BIOME.JUNGLE) continue;
    const jungle = p.biome === BIOME.JUNGLE;
    if (!isRoot(rx, sTree, jungle ? P_TREE_JUNGLE : P_TREE_FOREST)) continue;
    const c = plantTree(col, x0, x1, rx, p.surface, jungle, sTree);
    if (c) crowns.push(rx, c[0], c[1]);
  }
  for (let n = 0; n < crowns.length; n += 3) drawCanopy(col, x0, x1, crowns[n], crowns[n + 1], crowns[n + 2]);
}
