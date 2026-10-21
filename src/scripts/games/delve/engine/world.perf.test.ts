// world.perf.test.ts — R5 效能預算：與儲存無關的 World 存取不可以比舊扁平實作慢太多。
// P1 / P2 是和舊的扁平實作（現在是生成器用的 GenGrid）比比值（與機器快慢無關）；
// P3 / P4 是 Task 1 量出的基準 max(2 × 單跑, 2 × 全套並行) 往上取整 ms 寫死的上限（量到的數字記在 Task 1 的 commit 訊息）。
// 慢機器可用 DELVE_SKIP_PERF=1 跳過整組。
import { describe, it, expect, beforeAll } from 'vitest';
import { World, LIQ, type TileWindow } from './world';
import { T } from './tiles';
import type { GenGrid } from './gen/grid';
import { LightEngine } from './lighting';
import { LiquidSim } from './liquid';
import { LIQ_MAX } from './liquidKind';
import { generateWorld, type GenResult } from './worldgen';

const SKIP = typeof process !== 'undefined' && process.env.DELVE_SKIP_PERF === '1';

/** P3：LightEngine.compute 130×75 視窗、預設 margin，20 次中位數的上限（ms） */
const P3_CEILING_MS = 17;
/** P4：120×60 的湖放水後 step() 600 刻的上限（ms） */
const P4_CEILING_MS = 1806;

const median = (a: number[]): number => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const now = (): number => performance.now();

describe.skipIf(SKIP)('World 效能（R5）', () => {
  let gen: GenResult;
  /** 區塊欄儲存的世界（受測）與舊扁平格（參考）：同一份生成結果 */
  let world: World, ref: GenGrid;
  beforeAll(() => { gen = generateWorld('infinite-1a'); ref = gen.world; world = World.fromGen(gen.world, gen.layers); }, 60_000);

  it('P1 點查詢：96×96 隨機漫步 2,000,000 次 isSolid + getFg，比值 ≤ 2.0', () => {
    const w = world;
    const N = 2_000_000, X0 = 2000, Y0 = gen.world.surfaceAt(2000) - 20;
    const xs = new Int32Array(N), ys = new Int32Array(N);
    let s = 4242, x = 48, y = 48;
    for (let i = 0; i < N; i++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      x = Math.max(0, Math.min(95, x + ((s >>> 8) % 3) - 1));
      y = Math.max(0, Math.min(95, y + ((s >>> 16) % 3) - 1));
      xs[i] = X0 + x; ys[i] = Y0 + y;
    }
    let sink = 0;
    const runWorld = (): number => {
      const t = now();
      for (let i = 0; i < N; i++) { if (w.isSolid(xs[i], ys[i])) sink++; sink += w.getFg(xs[i], ys[i]); }
      return now() - t;
    };
    const runRef = (): number => {
      const t = now();
      for (let i = 0; i < N; i++) { if (ref.isSolid(xs[i], ys[i])) sink++; sink += ref.getFg(xs[i], ys[i]); }
      return now() - t;
    };
    runWorld(); runRef(); // 暖機
    const a: number[] = [], b: number[] = [];
    for (let k = 0; k < 5; k++) { a.push(runWorld()); b.push(runRef()); }
    expect(sink).toBeGreaterThan(0);
    const ratio = median(a) / median(b);
    console.log(`[perf] P1 world ${median(a).toFixed(2)} ms / ref ${median(b).toFixed(2)} ms = ${ratio.toFixed(2)}`);
    expect(ratio).toBeLessThanOrEqual(2.0);
  });

  it('P2 批次讀取：window(…, 200, 140) 500 次 vs 扁平格逐列 set(subarray)，比值 ≤ 2.5', () => {
    const w = world;
    const X0 = 1800, Y0 = Math.max(0, gen.world.surfaceAt(1800) - 60), N = 500;
    let win: TileWindow = w.window(X0, Y0, 200, 140);
    let refOut: TileWindow = ref.window(X0, Y0, 200, 140);
    const runWorld = (): number => {
      const t = now();
      for (let k = 0; k < N; k++) win = w.window(X0 + (k & 7), Y0, 200, 140, win);
      return now() - t;
    };
    const runRef = (): number => {
      const t = now();
      for (let k = 0; k < N; k++) refOut = ref.window(X0 + (k & 7), Y0, 200, 140, refOut);
      return now() - t;
    };
    runWorld(); runRef();
    const a: number[] = [], b: number[] = [];
    for (let k = 0; k < 5; k++) { a.push(runWorld()); b.push(runRef()); }
    expect(win.fg.subarray(0, 200 * 140)).toEqual(refOut.fg.subarray(0, 200 * 140));
    const ratio = median(a) / median(b);
    console.log(`[perf] P2 world ${median(a).toFixed(2)} ms / ref ${median(b).toFixed(2)} ms = ${ratio.toFixed(2)}`);
    expect(ratio).toBeLessThanOrEqual(2.5);
  });

  it(`P3 光照：LightEngine.compute 地表附近 130×75、預設 margin，20 次中位數 ≤ ${P3_CEILING_MS} ms`, () => {
    const w = world, eng = new LightEngine();
    const cx = gen.spawn.x, view = { x: cx - 65, y: w.surfaceAt(cx) - 37, w: 130, h: 75 };
    for (let k = 0; k < 3; k++) eng.compute(w, view, { sky: 1 }); // 暖機
    const ts: number[] = [];
    for (let k = 0; k < 20; k++) { const t = now(); eng.compute(w, view, { sky: 1 }); ts.push(now() - t); }
    console.log(`[perf] P3 light median ${median(ts).toFixed(2)} ms`);
    expect(median(ts)).toBeLessThanOrEqual(P3_CEILING_MS);
  });

  it(`P4 液體：120×60 的湖挖掉一側堤後 step() 600 刻 ≤ ${P4_CEILING_MS} ms`, () => {
    const run = (): number => {
      // 湖 x 10..129、y 20..79；左牆 x 9、堤 x 130、湖底 y 80；堤外是 x 131..298 的空盆地
      const W = 300, H = 90, LX0 = 10, LX1 = 129, LY0 = 20, LY1 = 79, DAM = 130, FLOOR = 80;
      const w = new World(W, H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const solid = y >= FLOOR || x < LX0 || x === DAM || x >= W - 1;
        if (solid) w.setFg(x, y, T.STONE);
      }
      const sim = new LiquidSim(w);
      for (let y = LY0; y <= LY1; y++) for (let x = LX0; x <= LX1; x++) w.setLiquid(x, y, LIQ_MAX, LIQ.WATER);
      sim.wakeAll();
      sim.settle(500);
      for (let y = 0; y < FLOOR; y++) w.setFg(DAM, y, T.AIR); // 放水
      const t = now();
      for (let k = 0; k < 600; k++) sim.step();
      const ms = now() - t;
      expect(w.getLiquid(DAM + 20, FLOOR - 1)).toBeGreaterThan(0); // 真的流出去了
      return ms;
    };
    run(); // 暖機
    const ts = [run(), run(), run()];
    console.log(`[perf] P4 liquid median ${median(ts).toFixed(2)} ms`);
    expect(median(ts)).toBeLessThanOrEqual(P4_CEILING_MS);
  }, 30_000); // 4 次（含暖機）在全套並行時可能超過預設的 5 秒；上限由 P4_CEILING_MS 把關
});
