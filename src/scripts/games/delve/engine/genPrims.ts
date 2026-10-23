// genPrims.ts — v1 外圍生成器（legacy/chunkgen）與 gen2 共用的生成 primitives（裁決 P10：只有一份，兩邊都 import）。
// 全部是 (x, seed, …) 的純函式：只用 engine/noise.ts 的整數雜湊 + 四則運算（不用亂數、不用超越函數）。
// v1 的輸出以 legacy/chunkgen/chunkgen.test.ts 的 V1_SEA_HASH / V1_FILL_HASH 釘住：改這裡的數值就會改到舊世界。
// 本檔不得出現連續兩個星號（測試會 grep），註解一律用 //。
import { vnoise1 } from './noise';
import { BIOME } from './world';
import type { ColumnLayers } from './column';

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
