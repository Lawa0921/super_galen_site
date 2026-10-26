// dungeon.rank.test.ts — 地城搬到 engine/gen2/draw/dungeon.ts 後，舊生成器的房間排序仍用舊碼的開根號距離（rankDist）。
// 這 4 個合成案例是「開根號 vs 平方距離」排序不同的地方（1,800 個合成地城裡找到的全部）：
// 期望值是搬移前舊碼（legacy/gen/dungeon.ts @ 31f7c6c76）在同樣輸入下的指紋；預設平方距離在這裡必須不同（證明案例有鑑別力）。
import { describe, it, expect } from 'vitest';
import { GenGrid } from './grid';
import { gridCanvas } from './gridCanvas';
import { generateDungeon } from './dungeon';
import { generateDungeonOn } from '../../gen2/draw/dungeon';
import { DUNGEON_COLORS, T, W } from '../../tiles';
import type { DungeonInfo } from '../../genTypes';

// 平坦（帶 0..6 格起伏）的石層世界，預留區 x ∈ [20, 20 + wz)
function synth(seed: string, wz: number, rough: number) {
  const width = wz + 40, height = 1200, g = new GenGrid(width, height), surface = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    surface[x] = 300 + ((x * rough) % 7);
    for (let y = surface[x]; y < height; y++) { g.fg[y * width + x] = T.STONE; g.wall[y * width + x] = W.STONE_WALL; }
  }
  const zone = { x0: 20, x1: 20 + wz, y0: 290, y1: 700 + (seed.length * 37) % 300, side: 'left' as const };
  const natural = (): [number, number] => [T.STONE, W.STONE_WALL];
  return { g, surface, zone, natural };
}
const fnv = (h: number, a: ArrayLike<number>): number => { for (let i = 0; i < a.length; i++) { h ^= a[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const fingerprint = (g: GenGrid, d: DungeonInfo): number => {
  const s = JSON.stringify([d.edges, d.doors, d.keys, [...g.chests], [...g.potDrops]]);
  return fnv(fnv(fnv(2166136261, g.fg), g.wall), Array.from(s, (c) => c.charCodeAt(0)));
};

const CASES = [
  { seed: 'exp-62', wz: 560, rough: 2, old: 1159535844 },
  { seed: 'exp-282', wz: 300, rough: 2, old: 1293297837 },
  { seed: 'exp-385', wz: 300, rough: 0, old: 3777687240 },
  { seed: 'exp-419', wz: 420, rough: 4, old: 240091494 },
];

describe('舊生成器地城的房間排序', () => {
  it('開根號與平方排序不同的 4 個案例：legacy 路徑 = 搬移前舊碼的指紋；預設平方距離 ≠ 舊碼', () => {
    for (const c of CASES) {
      const a = synth(c.seed, c.wz, c.rough);
      const d = generateDungeon(a.g, { seed: c.seed, zone: a.zone, surface: a.surface, color: DUNGEON_COLORS[0], depthFrac: () => 0.5, natural: a.natural })!;
      expect(fingerprint(a.g, d), c.seed).toBe(c.old);
      const b = synth(c.seed, c.wz, c.rough), last = b.g.width - 1;
      const cv = gridCanvas(b.g, c.seed, () => 0.5, b.surface, b.natural);
      const e = generateDungeonOn(cv, { seed: c.seed, zone: b.zone, height: b.g.height, color: DUNGEON_COLORS[0], natural: true, surfaceAt: (x) => b.surface[Math.max(0, Math.min(last, x))] })!;
      expect(fingerprint(b.g, e), c.seed).not.toBe(c.old);
    }
  }, 60_000);
});
