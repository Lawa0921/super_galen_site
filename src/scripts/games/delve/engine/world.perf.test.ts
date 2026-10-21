// world.perf.test.ts — R5 效能預算：與儲存無關的 World 存取不可以比舊扁平實作慢太多。
// P1 / P2 是和測試檔內一份「舊 World 扁平實作」比比值（與機器快慢無關）；
// P3 / P4 是 Task 1 量出的基準 × 2（往上取整 ms）寫死的上限（量到的數字記在 Task 1 的 commit 訊息）。
// 慢機器可用 DELVE_SKIP_PERF=1 跳過整組。
import { describe, it, expect, beforeAll } from 'vitest';
import { World, LIQ, type TileWindow } from './world';
import { T, SOLID_LUT } from './tiles';
import { LightEngine } from './lighting';
import { LiquidSim } from './liquid';
import { LIQ_MAX } from './liquidKind';
import { generateWorld, type GenResult } from './worldgen';

const SKIP = typeof process !== 'undefined' && process.env.DELVE_SKIP_PERF === '1';

/** P3：LightEngine.compute 130×75 視窗、預設 margin，20 次中位數的上限（ms） */
const P3_CEILING_MS = 7;
/** P4：120×60 的湖放水後 step() 600 刻的上限（ms） */
const P4_CEILING_MS = 1688;

const median = (a: number[]): number => { const s = [...a].sort((p, q) => p - q); return s[s.length >> 1]; };
const now = (): number => performance.now();

/** 舊 World 的扁平實作（Task 1 之前的 isSolid / getFg / 批次讀取），比較用 */
class FlatRef {
  readonly fg: Uint8Array; readonly wall: Uint8Array; readonly liquid: Uint8Array; readonly liquidType: Uint8Array;
  readonly frozen: Uint8Array; readonly half: Uint8Array; readonly variant: Uint8Array;
  constructor(readonly width: number, readonly height: number, src: World) {
    this.fg = src.fg.slice(); this.wall = src.wall.slice(); this.liquid = src.liquid.slice(); this.liquidType = src.liquidType.slice();
    this.frozen = src.frozen.slice(); this.half = src.half.slice(); this.variant = src.variant.slice();
  }
  inBounds(x: number, y: number): boolean { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  getFg(x: number, y: number): number {
    if (!this.inBounds(x, y)) return T.STONE;
    return this.fg[y * this.width + x];
  }
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y >= this.height) return true;
    if (y < 0) return false;
    const i = y * this.width + x;
    return SOLID_LUT[this.fg[i]] === 1 || this.frozen[i] === 1;
  }
  /** 逐列 set(subarray)（矩形完全在界內） */
  copyRect(x0: number, y0: number, w: number, h: number, out: TileWindow): void {
    const W = this.width;
    for (let r = 0; r < h; r++) {
      const s = (y0 + r) * W + x0, e = s + w, d = r * w;
      out.fg.set(this.fg.subarray(s, e), d);
      out.wall.set(this.wall.subarray(s, e), d);
      out.liquid.set(this.liquid.subarray(s, e), d);
      out.liquidType.set(this.liquidType.subarray(s, e), d);
      out.frozen.set(this.frozen.subarray(s, e), d);
      out.half.set(this.half.subarray(s, e), d);
      out.variant.set(this.variant.subarray(s, e), d);
    }
  }
}

describe.skipIf(SKIP)('World 效能（R5）', () => {
  let gen: GenResult;
  beforeAll(() => { gen = generateWorld('infinite-1a'); }, 60_000);

  it('P1 點查詢：96×96 隨機漫步 2,000,000 次 isSolid + getFg，比值 ≤ 2.0', () => {
    const w = gen.world, ref = new FlatRef(w.width, w.height, w);
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

  it('P2 批次讀取：window(…, 200, 140) 500 次 vs 逐列 set(subarray)，比值 ≤ 2.5', () => {
    const w = gen.world, ref = new FlatRef(w.width, w.height, w);
    const X0 = 1800, Y0 = Math.max(0, gen.world.surfaceAt(1800) - 60), N = 500;
    let win: TileWindow = w.window(X0, Y0, 200, 140);
    const refOut = w.window(0, 0, 200, 140);
    const runWorld = (): number => {
      const t = now();
      for (let k = 0; k < N; k++) win = w.window(X0 + (k & 7), Y0, 200, 140, win);
      return now() - t;
    };
    const runRef = (): number => {
      const t = now();
      for (let k = 0; k < N; k++) ref.copyRect(X0 + (k & 7), Y0, 200, 140, refOut);
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
    const w = gen.world, eng = new LightEngine();
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
        if (solid) w.fg[w.idx(x, y)] = T.STONE;
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
  });
});
