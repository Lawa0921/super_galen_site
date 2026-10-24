// world.central.test.ts — R4：固定種子的中央區 x∈[0, width) 逐格與舊扁平陣列輸出相同。
//
// CENTRAL_FINGERPRINT / GAME_FINGERPRINT 是在 Task 1 改動 world.ts 之前、用當時的扁平 World 錄下的值。
// **不准為了讓測試過而重錄。** 這條測試失敗代表中央區的生成或儲存讀出變了——去修程式碼，不是改數字。
import { describe, it, expect } from 'vitest';
import { generateWorld, type GenResult } from './legacy/worldgen';
import { DelveGame } from './game';
import type { World } from './world';
import type { GenGrid } from './legacy/gen/grid';

const SEED = 'infinite-1a';

/** FNV-1a 32 bit */
function fnv(bytes: Uint8Array, h = 0x811c9dc5): number {
  for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const hex = (h: number): string => h.toString(16).padStart(8, '0');
const hashBytes = (a: Uint8Array): string => hex(fnv(a));
const hashI16 = (a: Int16Array): string => hex(fnv(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)));
function hashChests(w: World | GenGrid): string {
  const keys = [...w.chests.keys()].sort((a, b) => a - b);
  const json = JSON.stringify(keys.map((k) => [k, w.chests.get(k)]));
  return hex(fnv(new TextEncoder().encode(json)));
}

type Fingerprint = Record<'fg' | 'wall' | 'liquid' | 'liquidType' | 'half' | 'surface' | 'biome' | 'chests', string>;

/** 直接讀扁平陣列（生成器輸出） */
function arrayFingerprint(gen: GenResult): Fingerprint {
  const w = gen.world;
  return {
    fg: hashBytes(w.fg), wall: hashBytes(w.wall), liquid: hashBytes(w.liquid), liquidType: hashBytes(w.liquidType),
    half: hashBytes(w.half), surface: hashI16(w.surface), biome: hashBytes(w.biome), chests: hashChests(w),
  };
}

/** 只經 getter 逐格讀中央區（與儲存方式無關） */
function getterFingerprint(w: World): Fingerprint {
  const W = w.width, H = w.height, n = W * H;
  const fg = new Uint8Array(n), wall = new Uint8Array(n), liquid = new Uint8Array(n), liquidType = new Uint8Array(n), half = new Uint8Array(n);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      fg[i] = w.getFg(x, y);
      wall[i] = w.getWall(x, y);
      liquid[i] = w.getLiquid(x, y);
      liquidType[i] = w.getLiquidType(x, y);
      half[i] = w.isHalf(x, y) ? 1 : 0;
    }
  }
  const surface = new Int16Array(W), biome = new Uint8Array(W);
  for (let x = 0; x < W; x++) { surface[x] = w.surfaceAt(x); biome[x] = w.biomeAt(x); }
  return {
    fg: hashBytes(fg), wall: hashBytes(wall), liquid: hashBytes(liquid), liquidType: hashBytes(liquidType),
    half: hashBytes(half), surface: hashI16(surface), biome: hashBytes(biome), chests: hashChests(w),
  };
}

/** 生成器輸出（seed 'infinite-1a'、預設尺寸）——Task 1 改動前錄下 */
const CENTRAL_FINGERPRINT: Fingerprint = {
  fg: '28b35441', wall: '13e098c5', liquid: '0aae25f5', liquidType: '53989a4b',
  half: '607f23c5', surface: 'd06269be', biome: '98f8495e', chests: 'd57826f8',
};
/** DelveGame 建構完（建構子可能動到格子）經 getter 讀出——Task 1 改動前錄下 */
const GAME_FINGERPRINT: Fingerprint = {
  fg: '28b35441', wall: '13e098c5', liquid: '0aae25f5', liquidType: '53989a4b',
  half: '607f23c5', surface: 'd06269be', biome: '98f8495e', chests: 'd57826f8',
};

describe('R4 中央區逐格不變', () => {
  it('生成器輸出 = CENTRAL_FINGERPRINT；DelveGame 世界經 getter 讀出 = GAME_FINGERPRINT', () => {
    const gen = generateWorld(SEED);
    // (a) 守住舊生成器不被動到（必須在建構 DelveGame 之前算：建構子會改同一個 world）
    expect(arrayFingerprint(gen)).toEqual(CENTRAL_FINGERPRINT);
    const g = new DelveGame({ seed: SEED, gen });
    // (b) Task 5 換儲存後，這條才真正比到新儲存
    expect(getterFingerprint(g.world)).toEqual(GAME_FINGERPRINT);
  }, 60_000);
});
