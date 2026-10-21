// liquid.test.ts — 液體模擬（活躍格集合、先落後攤平、蒸發、退休、熔岩 / 蜂蜜較慢、反應、預算、喚醒）
import { describe, it, expect } from 'vitest';
import { World, LIQ } from './world';
import { T } from './tiles';
import { LiquidSim, LAVA_EVERY, HONEY_EVERY, RETIRE_AFTER, type LiquidWorld } from './liquid';
import { tileKey, chunkOfX, T_BASE, X_LIMIT } from './coords';

/** w×h 的石箱：外框一圈石頭，內部空氣 */
function box(w: number, h: number): World {
  const wd = new World(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) wd.setFg(x, y, T.STONE);
  }
  return wd;
}
function run(sim: LiquidSim, n: number): void { for (let i = 0; i < n; i++) sim.step(); }
function rowSum(w: World, y: number, x0: number, x1: number): number {
  let s = 0;
  for (let x = x0; x <= x1; x++) s += w.getLiquid(x, y);
  return s;
}

describe('World 液體資料', () => {
  it('setLiquid / getLiquid / 種類；量 0 時種類清成 NONE', () => {
    const w = new World(40, 40);
    expect(w.setLiquid(3, 4, 200, LIQ.WATER)).toBe(true);
    expect(w.getLiquid(3, 4)).toBe(200);
    expect(w.getLiquidType(3, 4)).toBe(LIQ.WATER);
    expect(w.setLiquid(3, 4, 200, LIQ.WATER)).toBe(false);
    w.setLiquid(3, 4, 0, LIQ.WATER);
    expect(w.getLiquidType(3, 4)).toBe(LIQ.NONE);
    expect(w.getLiquid(-1, 0)).toBe(0);
    expect(w.setLiquid(5, 5, 999, LIQ.LAVA)).toBe(true);
    expect(w.getLiquid(5, 5)).toBe(255);
  });
  it('液體變動標記液體 dirty / liquidModified，但不碰 tile 的 dirty（不讓 tile chunk 快取重畫）', () => {
    const w = new World(64, 64);
    w.drainDirty();
    w.setLiquid(40, 3, 100, LIQ.WATER);
    expect(w.drainDirty()).toEqual([]);
    expect(w.modifiedChunks.size).toBe(0);
    expect(w.drainLiquidDirty()).toEqual([w.chunkIndex(1, 0)]);
    expect([...w.liquidModified]).toEqual([w.chunkIndex(1, 0)]);
    expect(w.drainLiquidDirty()).toEqual([]);
  });
  it('setFg 觸發 onTileChange', () => {
    const w = new World(10, 10);
    const got: [number, number][] = [];
    w.onTileChange = (x, y) => got.push([x, y]);
    w.setFg(2, 3, T.STONE);
    w.setFg(2, 3, T.STONE); // 沒變 → 不通知
    expect(got).toEqual([[2, 3]]);
  });
});

describe('LiquidSim', () => {
  it('往下流：空中的一格水落到地板', () => {
    const w = box(10, 20);
    const sim = new LiquidSim(w);
    w.setLiquid(5, 2, 255, LIQ.WATER);
    sim.add(5, 2);
    run(sim, 60);
    expect(w.getLiquid(5, 2)).toBe(0);
    expect(rowSum(w, 18, 1, 8)).toBeGreaterThan(200);
  });

  it('質量守恆（容許蒸發誤差）：一大團水倒進盆子', () => {
    const w = box(30, 20);
    const sim = new LiquidSim(w);
    for (let y = 2; y < 8; y++) { w.setLiquid(4, y, 255, LIQ.WATER); sim.add(4, y); }
    const before = w.liquidTotal();
    run(sim, 600);
    const after = w.liquidTotal();
    expect(Math.abs(after - before)).toBeLessThanOrEqual(before * 0.02);
  });

  it('在盆子裡攤平：底列各格量差很小', () => {
    const w = box(12, 12);
    const sim = new LiquidSim(w);
    // 10 格寬的底，倒 5 格滿水 → 每格約 127
    for (let y = 2; y < 7; y++) { w.setLiquid(2, y, 255, LIQ.WATER); sim.add(2, y); }
    run(sim, 900);
    const row = [];
    for (let x = 1; x <= 10; x++) row.push(w.getLiquid(x, 10));
    expect(Math.max(...row) - Math.min(...row)).toBeLessThanOrEqual(4);
    expect(Math.min(...row)).toBeGreaterThan(110);
  });

  it('被擋住就停：封閉箱子裡的水不外漏、最後全部退休（活躍格歸零）', () => {
    const w = box(8, 8);
    const sim = new LiquidSim(w);
    for (let x = 1; x < 7; x++) { w.setLiquid(x, 6, 255, LIQ.WATER); sim.add(x, 6); }
    run(sim, 30);
    expect(sim.activeCount).toBe(0);
    for (let x = 1; x < 7; x++) expect(w.getLiquid(x, 6)).toBe(255);
    expect(w.liquidTotal()).toBe(6 * 255);
  });

  it('沒變化的格在 RETIRE_AFTER 次更新後退休', () => {
    const w = box(6, 6);
    const sim = new LiquidSim(w);
    w.setLiquid(2, 4, 255, LIQ.WATER); w.setLiquid(3, 4, 255, LIQ.WATER);
    w.setLiquid(1, 4, 255, LIQ.WATER); w.setLiquid(4, 4, 255, LIQ.WATER);
    for (let x = 1; x <= 4; x++) sim.add(x, 4);
    run(sim, RETIRE_AFTER - 1);
    expect(sim.activeCount).toBeGreaterThan(0);
    run(sim, 3);
    expect(sim.activeCount).toBe(0);
  });

  it('薄膜蒸發：平地上量 < 3 的一小滴會消失', () => {
    const w = box(10, 6);
    const sim = new LiquidSim(w);
    w.setLiquid(5, 4, 2, LIQ.WATER);
    sim.add(5, 4);
    run(sim, 40);
    expect(w.liquidTotal()).toBe(0);
  });

  it('挖開水壩 → 喚醒、水流到另一邊', () => {
    const w = box(20, 10);
    for (let y = 1; y < 9; y++) w.setFg(8, y, T.STONE); // 水壩
    const sim = new LiquidSim(w);
    for (let y = 4; y < 9; y++) for (let x = 1; x < 8; x++) { w.setLiquid(x, y, 255, LIQ.WATER); sim.add(x, y); }
    run(sim, 40);
    expect(sim.activeCount).toBe(0);
    expect(rowSum(w, 8, 9, 18)).toBe(0);
    w.setFg(8, 8, T.AIR); w.setFg(8, 7, T.AIR); // 挖掉壩底兩格
    expect(sim.activeCount).toBeGreaterThan(0);
    run(sim, 900);
    expect(rowSum(w, 8, 9, 18)).toBeGreaterThan(9 * 100);
  });

  it('確定性：同樣的輸入 → 同樣的結果', () => {
    const make = (): World => {
      const w = box(24, 16);
      const sim = new LiquidSim(w);
      for (let y = 2; y < 9; y++) { w.setLiquid(5, y, 255, LIQ.WATER); sim.add(5, y); }
      for (let y = 2; y < 5; y++) { w.setLiquid(15, y, 200, LIQ.HONEY); sim.add(15, y); }
      run(sim, 333);
      return w;
    };
    const a = make(), b = make();
    const wa = a.window(0, 0, a.width, a.height), wb = b.window(0, 0, b.width, b.height);
    expect(Buffer.from(wa.liquid).equals(Buffer.from(wb.liquid))).toBe(true);
    expect(Buffer.from(wa.liquidType).equals(Buffer.from(wb.liquidType))).toBe(true);
  });

  it('熔岩只在每 LAVA_EVERY 刻更新、蜂蜜更慢（HONEY_EVERY）', () => {
    expect(HONEY_EVERY).toBeGreaterThan(LAVA_EVERY);
    expect(LAVA_EVERY).toBeGreaterThan(1);
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    sim.step(); // tick 0 已過：下一個熔岩刻是 LAVA_EVERY
    w.setLiquid(3, 2, 255, LIQ.LAVA); sim.add(3, 2);
    w.setLiquid(6, 2, 255, LIQ.HONEY); sim.add(6, 2);
    const lavaMoves: number[] = [];
    for (let k = 0; k < HONEY_EVERY * 2; k++) {
      const pre = sim.tick, before = w.getLiquid(3, 2);
      sim.step();
      if (w.getLiquid(3, 2) !== before) lavaMoves.push(pre);
    }
    expect(lavaMoves.length).toBeGreaterThan(0);
    for (const t of lavaMoves) expect(t % LAVA_EVERY).toBe(0);
    expect(lavaMoves[0]).toBe(LAVA_EVERY);
    // 蜂蜜也會往下，但花的刻數比水多
    run(sim, HONEY_EVERY * 20);
    expect(w.getLiquid(6, 2)).toBe(0); // 蜂蜜離開了原位（往下落，碰到熔岩可能變酥蜜塊）
  });

  it('水碰熔岩 → 熔岩那側變黑曜石（並回報反應事件）', () => {
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    w.setLiquid(4, 8, 255, LIQ.LAVA); sim.add(4, 8);
    w.setLiquid(4, 3, 255, LIQ.WATER); sim.add(4, 3);
    run(sim, 120);
    expect(w.getFg(4, 8)).toBe(T.OBSIDIAN);
    expect(w.getLiquidType(4, 8)).toBe(LIQ.NONE);
    const ev = sim.drainEvents();
    expect(ev.some((e) => e.kind === 'obsidian' && e.x === 4 && e.y === 8)).toBe(true);
  });

  it('反應發生在非空氣格（箱子等）→ 只冒煙、不放方塊，箱子與內容保留', () => {
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    w.setFg(4, 8, T.CHEST);
    w.chests.get(w.idx(4, 8))![0] = { item: 'gold_bar', count: 5 };
    w.setLiquid(4, 8, 255, LIQ.LAVA); sim.add(4, 8);
    w.setLiquid(5, 8, 255, LIQ.WATER); sim.add(5, 8);
    run(sim, 30);
    expect(w.getFg(4, 8)).toBe(T.CHEST);
    expect(w.chests.get(w.idx(4, 8))![0]).toEqual({ item: 'gold_bar', count: 5 });
    expect(sim.drainEvents().some((e) => e.kind === 'steam')).toBe(true);
    // 倒熔岩桶到放著箱子的水格 → 拒絕
    w.setLiquid(4, 8, 255, LIQ.WATER);
    expect(sim.pour(4, 8, LIQ.LAVA, 255)).toBe(false);
    expect(w.getFg(4, 8)).toBe(T.CHEST);
  });

  it('blocked 回呼（有人站著）→ 反應只冒煙，不把方塊放進身體裡', () => {
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    sim.blocked = (x, y) => x === 4 && y === 8;
    w.setLiquid(4, 8, 255, LIQ.LAVA); sim.add(4, 8);
    w.setLiquid(5, 8, 255, LIQ.WATER); sim.add(5, 8);
    run(sim, 30);
    expect(w.getFg(4, 8)).toBe(T.AIR);
    expect(sim.pour(4, 8, LIQ.LAVA, 255) && w.getFg(4, 8) === T.OBSIDIAN).toBe(false);
  });

  it('蜂蜜碰熔岩 → 酥蜜塊', () => {
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    w.setLiquid(4, 8, 255, LIQ.LAVA); sim.add(4, 8);
    w.setLiquid(4, 6, 255, LIQ.HONEY); sim.add(4, 6);
    run(sim, 400);
    expect(w.getFg(4, 8)).toBe(T.CRISPY_HONEY);
  });

  it('水和蜂蜜不相溶：水停在蜂蜜上面、蜂蜜量不變', () => {
    const w = box(3, 10); // 內部只有 1 欄
    const sim = new LiquidSim(w);
    w.setLiquid(1, 8, 255, LIQ.HONEY); sim.add(1, 8);
    w.setLiquid(1, 3, 255, LIQ.WATER); sim.add(1, 3);
    run(sim, 200);
    expect(w.getLiquidType(1, 8)).toBe(LIQ.HONEY);
    expect(w.getLiquid(1, 8)).toBe(255);
    expect(w.getLiquidType(1, 7)).toBe(LIQ.WATER);
    expect(w.getLiquid(1, 7)).toBe(255);
  });

  it('實心方塊放進液體格 → 那格的液體消失', () => {
    const w = box(10, 6);
    const sim = new LiquidSim(w);
    for (let x = 1; x < 9; x++) { w.setLiquid(x, 4, 255, LIQ.WATER); sim.add(x, 4); }
    run(sim, 20);
    w.setFg(5, 4, T.STONE);
    run(sim, 20);
    expect(w.getLiquid(5, 4)).toBe(0);
  });

  it('每刻處理格數受 budget 限制（大洪水不會卡住一幀）', () => {
    const w = box(200, 40);
    const sim = new LiquidSim(w, { budget: 100 });
    for (let y = 2; y < 12; y++) for (let x = 1; x < 199; x++) { w.setLiquid(x, y, 255, LIQ.WATER); sim.add(x, y); }
    sim.step();
    expect(sim.stats.processed).toBeLessThanOrEqual(100);
    expect(sim.activeCount).toBeGreaterThan(1000);
  });

  it('活躍格有上限：超過時排進溢出區，之後會補回來', () => {
    const w = box(120, 30);
    const sim = new LiquidSim(w, { cap: 256 });
    for (let y = 2; y < 10; y++) for (let x = 1; x < 119; x++) { w.setLiquid(x, y, 255, LIQ.WATER); sim.add(x, y); }
    expect(sim.queuedCount).toBeLessThanOrEqual(256);
    expect(sim.activeCount).toBeGreaterThan(256);
    run(sim, 2000);
    // 最後還是會落到底、攤平
    expect(rowSum(w, 28, 1, 118)).toBeGreaterThan(118 * 200);
  });

  it('settle：快速把一池水靜置（忽略熔岩 / 蜂蜜延遲），回傳刻數', () => {
    const w = box(40, 20);
    const sim = new LiquidSim(w);
    for (let y = 3; y < 9; y++) for (let x = 3; x < 12; x++) { w.setLiquid(x, y, 255, LIQ.WATER); sim.add(x, y); }
    for (let y = 3; y < 6; y++) { w.setLiquid(30, y, 255, LIQ.LAVA); sim.add(30, y); }
    const r = sim.settle(4000);
    expect(r.ticks).toBeGreaterThan(0);
    expect(sim.activeCount).toBe(0);
    expect(w.getLiquid(30, 3)).toBe(0); // 熔岩也落下了
  });

  it('世界最左 / 最右欄（xMin = 0、沒有外牆）：不會繞到上一列 / 下一列的另一端，邊界外視為實心', () => {
    const W = 10, H = 8;
    const w = new World(W, H);
    expect(w.xMin).toBe(0);
    for (let x = 0; x < W; x++) w.setFg(x, H - 1, T.STONE);
    const sim = new LiquidSim(w);
    expect(sim.pour(0, H - 2, LIQ.WATER, 255)).toBe(true);
    expect(sim.pour(-1, H - 2, LIQ.WATER, 255)).toBe(false);
    run(sim, 200);
    expect(w.liquidTotal()).toBe(255); // 沒有流出世界、也沒有憑空變多
    expect(w.getLiquid(W - 1, H - 3)).toBe(0); // 舊 i − 1 的陷阱：上一列最右邊
    for (let x = 0; x < W; x++) expect(w.getLiquid(x, H - 2)).toBeGreaterThan(0);
    // 最右欄同理：不會繞到下一列最左邊
    const w2 = new World(W, H);
    for (let x = 0; x < W; x++) w2.setFg(x, H - 1, T.STONE);
    const sim2 = new LiquidSim(w2);
    sim2.pour(W - 1, H - 3, LIQ.WATER, 255);
    run(sim2, 200);
    expect(w2.liquidTotal()).toBe(255);
    expect(w2.getLiquid(0, H - 2) + w2.getLiquid(0, H - 3)).toBeGreaterThan(0); // 攤到最左欄（同一列往左走過去的）
    expect(sim2.activeCount).toBe(0);
  });

  it('滲水石在最左欄：不會吸到上一列最右邊那格的液體', () => {
    const W = 12, H = 10;
    const w = new World(W, H);
    for (let x = 0; x < W; x++) { w.setFg(x, 5, T.STONE); w.setFg(x, H - 1, T.STONE); }
    w.setFg(0, 5, T.DRAIN);
    w.setFg(W - 2, 4, T.STONE);
    w.setLiquid(W - 1, 4, 200, LIQ.WATER); // 上一列最右邊（舊 d − 1），被石頭圍住、不會自己流到滲水石
    const sim = new LiquidSim(w);
    sim.setSprings([{ x: 6, y: 8, type: LIQ.WATER, box: { x0: 0, y0: 0, x1: W, y1: H }, cap: 0, drains: [{ x: 0, y: 5 }] }]);
    for (let k = 0; k < 5; k++) sim.step();
    expect(sim.springStats().drained).toBe(0);
    expect(w.getLiquid(W - 1, 4)).toBe(200);
  });

  it('forgetColumn(cx)：那欄的格離開佇列、旗標清掉；喚醒後重新排入', () => {
    const w = box(80, 10);
    const sim = new LiquidSim(w, { cap: 4 });
    for (const x of [3, 5, 40, 45, 70]) { w.setLiquid(x, 4, 255, LIQ.WATER); sim.add(x, 4); }
    expect(sim.activeCount).toBe(5); // 4 在佇列、1 在溢出區
    sim.forgetColumn(1); // x 32..63
    expect(sim.activeCount).toBe(3);
    sim.wakeRect(32, 0, 64, 10);
    expect(sim.activeCount).toBe(5);
    sim.add(40, 4); // 已排入 → 不重複
    expect(sim.activeCount).toBe(5);
  });

  it('外圍座標的 tile 鍵：佇列鍵就地解碼回原座標（不呼叫 world.tileXY），forgetColumn 也認得', () => {
    // 稀疏的無限世界替身：寬 4200 的鍵、x ∈ [−X_LIMIT, X_LIMIT)、y ≥ 12 是石頭
    const H = 40, WD = 4200;
    const fg = new Map<number, number>(), liq = new Map<number, number>(), lt = new Map<number, number>();
    const inB = (x: number, y: number): boolean => x >= -X_LIMIT && x < X_LIMIT && y >= 0 && y < H;
    const stub: LiquidWorld = {
      width: WD, height: H, chunksX: Math.ceil(WD / 32), xMin: -X_LIMIT, xMax: X_LIMIT, onTileChange: null,
      inBounds: inB, idx: (x, y) => tileKey(WD, x, y),
      tileXY: () => { throw new Error('tileXY 不該被呼叫（會配置物件）'); },
      window: () => { throw new Error('unused'); },
      getFg: (x, y) => (!inB(x, y) || y >= 12 ? T.STONE : fg.get(tileKey(WD, x, y)) ?? T.AIR),
      getLiquid: (x, y) => (inB(x, y) ? liq.get(tileKey(WD, x, y)) ?? 0 : 0),
      getLiquidType: (x, y) => (inB(x, y) ? lt.get(tileKey(WD, x, y)) ?? LIQ.NONE : LIQ.NONE),
      isFrozen: () => false,
      isSolid: (x, y) => stub.getFg(x, y) !== T.AIR,
      setLiquidRaw: (x, y, a, t) => { if (inB(x, y)) { liq.set(tileKey(WD, x, y), a); lt.set(tileKey(WD, x, y), t); } },
      setLiquid: (x, y, a, t) => { stub.setLiquidRaw(x, y, a, a === 0 ? LIQ.NONE : t); return true; },
      touchLiquidAt: () => {},
      setFg: (x, y, id) => { fg.set(tileKey(WD, x, y), id); return true; },
    };
    const xs = [-1, -40, WD, 5000, X_LIMIT - 1, -(X_LIMIT - 1)];
    const sim = new LiquidSim(stub);
    for (const x of xs) { expect(tileKey(WD, x, 10)).toBeGreaterThanOrEqual(T_BASE); stub.setLiquid(x, 10, 255, LIQ.WATER); sim.add(x, 10); }
    expect(sim.activeCount).toBe(xs.length);
    sim.step(); // 每格往下落一格：解碼錯了就會去更新別的（沒有水的）格
    for (const x of xs) {
      expect(stub.getLiquid(x, 10)).toBe(0);
      expect(stub.getLiquid(x, 11)).toBe(255);
    }
    const before = sim.activeCount;
    expect(before).toBeGreaterThan(0);
    sim.forgetColumn(chunkOfX(5000));
    sim.forgetColumn(chunkOfX(-(X_LIMIT - 1)));
    sim.wakeRect(5000, 11, 5001, 12); // 那欄的旗標已清 → 可以重新排入
    expect(sim.activeCount).toBe(before - 1);
  });

  it('pour / take：倒水、舀水', () => {
    const w = box(10, 10);
    const sim = new LiquidSim(w);
    expect(sim.pour(4, 4, LIQ.WATER, 255)).toBe(true);
    expect(w.getLiquid(4, 4)).toBe(255);
    expect(sim.activeCount).toBeGreaterThan(0);
    expect(sim.pour(0, 0, LIQ.WATER, 255)).toBe(false); // 實心
    const got = sim.take(4, 4, 255);
    expect(got).toEqual({ type: LIQ.WATER, amount: 255 });
    expect(w.getLiquid(4, 4)).toBe(0);
    // 把水倒在熔岩上 → 立刻變黑曜石
    w.setLiquid(6, 8, 255, LIQ.LAVA);
    expect(sim.pour(6, 8, LIQ.WATER, 255)).toBe(true);
    expect(w.getFg(6, 8)).toBe(T.OBSIDIAN);
  });
});

describe('無限世界的喚醒（Task 8）', () => {
  it('wakeAll 只掃常駐的欄；wakeSeam 只喚醒接縫兩側各一格', () => {
    const w = new World(64, 40, { bounds: 'infinite' });
    w.ensureColumn(-1); w.ensureColumn(5);
    for (const x of [-20, 10, 170]) w.setLiquid(x, 10, 100, LIQ.WATER);
    const sim = new LiquidSim(w);
    const t0 = performance.now();
    sim.wakeAll();
    expect(performance.now() - t0).toBeLessThan(500);
    expect(sim.activeCount).toBe(3);
    const s2 = new LiquidSim(w);
    for (let y = 0; y < 40; y++) for (const x of [30, 31, 32, 33, 34]) w.setLiquid(x, y, 50, LIQ.WATER);
    s2.wakeSeam(32, 5, 10);
    // x 31、32 × 列 5..9
    expect(s2.activeCount).toBe(10);
  });
});
