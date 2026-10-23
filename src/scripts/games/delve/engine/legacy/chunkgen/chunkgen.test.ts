// chunkgen.test.ts — 外圍生成器 v0（B9）：確定性 / 與順序無關、海與中央的接縫、深度層、生態段多樣性、礦與洞穴、禁用 API、效能。
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { OuterGen, OUTER_GEN_VERSION, frameOf, SEA_W, SEG_W, SEG_JITTER, type CentralFrame, type OuterSegment } from './index';
import { ColNoise } from './fill';
import { Column, li } from '../../column';
import { vnoise2, fbm2 } from '../../noise';
import { World, BIOME, LIQ } from '../../world';
import { T } from '../../tiles';
import { CHUNK } from '../../constants';
import { fnv1a } from '../../../net/codec';

const V1_SEA_HASH = 2089571727; // 改動前（biome 仍為 FOREST）取得的 v1 海 / 沙灘欄位元組雜湊
const V1_FILL_HASH = 119539757; // 抽出 engine/genPrims.ts 之前取得的 v1 陸地欄位元組雜湊（地表到熔岩層、兩側、跨多個生態段）
const H = 1200;
const F: CentralFrame = { width: 4200, height: H, edgeL: 330, edgeR: 345, cavernY: 560, moltenY: 1010 };

function filled(gen: OuterGen, cx: number, frame = F): Column {
  const col = new Column(cx, frame.height);
  const a = cx * CHUNK, b = a + CHUNK;
  if (a < Math.min(b, 0)) gen.fill(col, a, Math.min(b, 0));
  const r0 = Math.max(a, frame.width);
  if (r0 < b) gen.fill(col, r0, b);
  return col;
}
const bytes = (c: Column): Uint8Array => new Uint8Array(c.view.buffer);
// 第一個不同的位元組（相同 = -1）：大 TypedArray 的 toEqual 很慢，逐位元組比再只斷言一個數字
function diffAt(a: Uint8Array, b: Uint8Array | undefined): number {
  if (!b || a.length !== b.length) return -2;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return i;
  return -1;
}

describe('chunkgen：外圍生成器 v0', () => {
  it('版本 = 1；frameOf 取中央兩個邊欄地表與 cavernY / moltenY', () => {
    expect(OUTER_GEN_VERSION).toBe(1);
    expect(new OuterGen('s', F).version).toBe(1);
    const surface = new Int16Array(10).fill(300);
    surface[0] = 311; surface[9] = 322;
    expect(frameOf({ width: 10, height: 200, surface, cavernY: 90, moltenY: 170 }))
      .toEqual({ width: 10, height: 200, edgeL: 311, edgeR: 322, cavernY: 90, moltenY: 170 });
  });

  it('ColNoise 與 vnoise2 / fbm2 逐位元相同（沿 y 快取格點只是加速）', () => {
    for (const x of [-1281, -33, 0, 17, 4200, 9999]) {
      const n = new ColNoise(48, 12345), a = new ColNoise(64, 777), b = new ColNoise(64 * 0.4, 777 + 7);
      n.setX(x); a.setX(x); b.setX(x);
      for (let y = 0; y < 400; y += 7) {
        expect(n.at(y)).toBe(vnoise2(x, y, 48, 12345));
        expect(a.at(y) * 0.68 + b.at(y) * 0.32).toBe(fbm2(x, y, 64, 777));
      }
    }
  });

  it('(1) 確定性 / 與順序無關：正序、倒序、交錯、另一個實例，位元組全部相同', () => {
    const cols = [...Array.from({ length: 21 }, (_, i) => -40 + i), ...Array.from({ length: 21 }, (_, i) => 140 + i)];
    const gen = new OuterGen('order-seed', F);
    const ref = new Map(cols.map((cx) => [cx, bytes(filled(gen, cx))]));
    const orders = [
      [...cols].reverse(),
      cols.map((_, i) => cols[(i * 17) % cols.length]), // 42 與 17 互質 → 一個交錯排列
      cols.flatMap((_, i) => (i % 2 ? [] : [cols[i >> 1], cols[cols.length - 1 - (i >> 1)]])),
    ];
    for (const order of orders) {
      expect(new Set(order).size).toBe(cols.length);
      for (const cx of order) expect(diffAt(bytes(filled(gen, cx)), ref.get(cx))).toBe(-1);
    }
    const other = new OuterGen('order-seed', F);
    for (const cx of [...cols].reverse()) expect(diffAt(bytes(filled(other, cx)), ref.get(cx))).toBe(-1);
    // 不同種子 → 不同內容
    expect(diffAt(bytes(filled(new OuterGen('another', F), 150)), ref.get(150))).toBeGreaterThanOrEqual(0);
  });

  it('(1b) 跨欄樹冠：一欄分兩半填 = 整欄一次填（樹根掃 [x0 − 3, x1 + 3)）', () => {
    const gen = new OuterGen('order-seed', F);
    let leaves = 0;
    for (let cx = 147; cx < 175; cx++) {
      const whole = filled(gen, cx);
      const split = new Column(cx, H);
      for (const cut of [5, 16, 27]) {
        const parts = new Column(cx, H);
        gen.fill(parts, cx * CHUNK, cx * CHUNK + cut);
        gen.fill(parts, cx * CHUNK + cut, cx * CHUNK + CHUNK);
        expect(diffAt(bytes(parts), bytes(whole))).toBe(-1);
      }
      gen.fill(split, cx * CHUNK + 16, cx * CHUNK + CHUNK);
      gen.fill(split, cx * CHUNK, cx * CHUNK + 16);
      expect(diffAt(bytes(split), bytes(whole))).toBe(-1);
      for (let i = 0; i < whole.fg.length; i++) if (whole.fg[i] === T.LEAVES) leaves++;
    }
    expect(leaves).toBeGreaterThan(0);
  });

  it('(2) 接縫：中央兩側緊接著海，水面 = 邊欄地表 + 1，水面以下到海床都是水；海寬 = SEA_W', () => {
    const gen = new OuterGen('seam', F), P = gen.profile;
    const check = (x: number, edge: number, side: 1 | -1): void => {
      const z = P.zoneAt(x);
      expect(z.kind).toBe('sea');
      if (z.kind === 'sea') expect(z.side).toBe(side);
      const top = P.waterTopAt(x)!;
      expect(top).toBe(edge + 1);
      const floor = P.surfaceAt(x);
      expect(floor).toBeGreaterThan(top);
      const col = filled(gen, x >> 5);
      for (let y = 0; y < top; y++) expect(col.fg[li(x, y)] + col.liquid[li(x, y)]).toBe(0);
      for (let y = top; y < floor; y++) {
        expect(col.fg[li(x, y)]).toBe(T.AIR);
        expect(col.liquid[li(x, y)]).toBe(255);
        expect(col.liquidType[li(x, y)]).toBe(LIQ.WATER);
      }
      expect(col.fg[li(x, floor)]).toBe(T.SAND);
      expect(col.liquid[li(x, floor)]).toBe(0);
    };
    for (let x = 4200; x <= 4240; x++) check(x, F.edgeR, 1);
    for (let x = -1; x >= -41; x--) check(x, F.edgeL, -1);
    expect(P.zoneAt(0).kind).toBe('central');
    expect(P.zoneAt(4199).kind).toBe('central');
    expect(P.zoneAt(4200 + SEA_W - 1).kind).toBe('sea');
    expect(P.zoneAt(4200 + SEA_W).kind).toBe('land');
    expect(P.zoneAt(-SEA_W).kind).toBe('sea');
    expect(P.zoneAt(-SEA_W - 1).kind).toBe('land');
    const e = P.zoneAt(4200 + 37), w = P.zoneAt(-1 - 37);
    expect(e.kind === 'sea' && e.d).toBe(37);
    expect(w.kind === 'sea' && w.d).toBe(37);
    // 海中央平均深約 SEA_DEPTH；海後是陸地（沒有水）、地表比邊欄高
    let sum = 0;
    for (let x = 4200 + 150; x < 4200 + 330; x++) sum += P.surfaceAt(x) - F.edgeR;
    expect(Math.abs(sum / 180 - 46)).toBeLessThan(9);
    expect(P.waterTopAt(4200 + SEA_W + 100)).toBeNull();
    expect(P.surfaceAt(4200 + SEA_W + 100)).toBeLessThan(F.edgeR);
  });

  it('(3) 深度層：x ∈ [−20000, 20000) 每 97 格，surface < rock < deep < molten < height', () => {
    const P = new OuterGen('layers', F).profile;
    let n = 0;
    for (let x = -20000; x < 20000; x += 97) {
      if (x >= 0 && x < F.width) continue;
      const s = P.surfaceAt(x), L = P.layersAt(x);
      expect(s).toBeGreaterThan(0);
      expect(s).toBeLessThan(L.rock);
      expect(L.rock).toBeLessThan(L.deep);
      expect(L.deep).toBeLessThan(L.molten);
      expect(L.molten).toBeLessThan(H);
      expect(Math.abs(L.deep - F.cavernY)).toBeLessThanOrEqual(16);
      expect(Math.abs(L.molten - F.moltenY)).toBeLessThanOrEqual(12);
      expect(L.rock - s).toBeGreaterThanOrEqual(10);
      expect(L.rock - s).toBeLessThanOrEqual(26);
      n++;
    }
    expect(n).toBeGreaterThan(300);
  });

  it('(4) 多樣性：每側前 8 段四種生態都出現、相鄰段不同、第 0 段森林、culture = null', () => {
    for (const seed of ['div-a', 'div-b', 'div-c', 'div-d', 'div-e', 'div-f']) {
      const P = new OuterGen(seed, F).profile;
      for (const side of [1, -1] as const) {
        const segs: OuterSegment[] = [];
        let x = side === 1 ? F.width + SEA_W : -SEA_W - 1;
        for (let k = 0; k < 8; k++) {
          const s = P.segmentAt(x)!;
          expect(s).not.toBeNull();
          expect(s.k).toBe(k);
          expect(s.side).toBe(side);
          expect(s.culture).toBeNull();
          expect(s.x1 - s.x0).toBeGreaterThanOrEqual(SEG_W - 2 * SEG_JITTER);
          expect(s.x1 - s.x0).toBeLessThanOrEqual(SEG_W + 2 * SEG_JITTER);
          // 段內每一欄都屬於這段、生態一致
          for (const q of [s.x0, (s.x0 + s.x1) >> 1, s.x1 - 1]) {
            expect(P.segmentAt(q)).toEqual(s);
            expect(P.biomeAt(q)).toBe(s.biome);
          }
          segs.push(s);
          x = side === 1 ? s.x1 : s.x0 - 1;
        }
        if (side === 1) expect(segs[0].x0).toBe(F.width + SEA_W);
        else expect(segs[0].x1).toBe(-SEA_W);
        expect(segs[0].biome).toBe(BIOME.FOREST);
        expect(new Set(segs.map((s) => s.biome)).size).toBe(4);
        for (let k = 1; k < 8; k++) expect(segs[k].biome).not.toBe(segs[k - 1].biome);
      }
      expect(P.segmentAt(4200 + 10)).toBeNull();
    }
  });

  it('(5) 內容：陸地每 10 欄裡銅 / 鐵 / 銀 / 金都出現在對的層；岩層空氣 3%–30%；熔岩深淵有熔岩', () => {
    const gen = new OuterGen('content', F), P = gen.profile;
    // 東西兩側前 4 段（四種生態）各取段中央 120 欄
    const xs: number[] = [];
    for (const side of [1, -1] as const) {
      let x = side === 1 ? F.width + SEA_W : -SEA_W - 1;
      for (let k = 0; k < 4; k++) {
        const s = P.segmentAt(x)!, mid = (s.x0 + s.x1) >> 1;
        for (let q = mid - 60; q < mid + 60; q++) xs.push(q);
        x = side === 1 ? s.x1 : s.x0 - 1;
      }
    }
    const cache = new Map<number, Column>();
    const colOf = (x: number): Column => {
      const cx = x >> 5;
      let c = cache.get(cx);
      if (!c) { c = filled(gen, cx); cache.set(cx, c); }
      return c;
    };
    let rockAir = 0, rockAll = 0, lava = 0;
    for (let w = 0; w + 10 <= xs.length; w += 10) {
      const seen = { cu: 0, fe: 0, ag: 0, au: 0 };
      for (let k = w; k < w + 10; k++) {
        const x = xs[k], col = colOf(x), s = P.surfaceAt(x), L = P.layersAt(x);
        const mid = L.rock + ((L.deep - L.rock) >> 1);
        for (let y = 0; y < H; y++) {
          const t = col.fg[li(x, y)];
          if (t === T.COPPER_ORE) { expect(y).toBeGreaterThan(s); expect(y).toBeLessThan(mid); seen.cu++; }
          else if (t === T.IRON_ORE) { expect(y).toBeGreaterThanOrEqual(L.rock); expect(y).toBeLessThan(L.deep); seen.fe++; }
          else if (t === T.SILVER_ORE) { expect(y).toBeGreaterThanOrEqual(mid); expect(y).toBeLessThan(L.molten); seen.ag++; }
          else if (t === T.GOLD_ORE) { expect(y).toBeGreaterThanOrEqual(L.deep); seen.au++; }
          if (y >= L.rock && y < L.deep) { rockAll++; if (t === T.AIR) rockAir++; }
          if (col.liquidType[li(x, y)] === LIQ.LAVA) { expect(y).toBeGreaterThanOrEqual(L.molten + 40); lava++; }
          if (col.liquidType[li(x, y)] === LIQ.WATER) throw new Error(`陸地 x=${x} y=${y} 有水`);
        }
      }
      expect(seen.cu, `x=${xs[w]} 銅`).toBeGreaterThan(0);
      expect(seen.fe, `x=${xs[w]} 鐵`).toBeGreaterThan(0);
      expect(seen.ag, `x=${xs[w]} 銀`).toBeGreaterThan(0);
      expect(seen.au, `x=${xs[w]} 金`).toBeGreaterThan(0);
    }
    const frac = rockAir / rockAll;
    expect(frac).toBeGreaterThanOrEqual(0.03);
    expect(frac).toBeLessThanOrEqual(0.3);
    expect(lava).toBeGreaterThan(0);
  });

  it('(5b) 表層：森林草 + 泥土、沙漠沙 6 格 + 砂岩、雪原雪 5 格、叢林叢林草 + 泥巴；地表下 6 格內除入口外不挖', () => {
    const gen = new OuterGen('content', F), P = gen.profile;
    const expectTop: Record<number, number[]> = {
      [BIOME.FOREST]: [T.GRASS, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT, T.DIRT],
      [BIOME.DESERT]: [T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SAND, T.SANDSTONE],
      [BIOME.SNOW]: [T.SNOW, T.SNOW, T.SNOW, T.SNOW, T.SNOW, T.DIRT],
      [BIOME.JUNGLE]: [T.JUNGLE_GRASS, T.MUD, T.MUD, T.MUD, T.MUD, T.MUD],
    };
    const seen = new Set<number>();
    let x = F.width + SEA_W;
    for (let k = 0; k < 6; k++) {
      const s = P.segmentAt(x)!;
      for (let q = s.x0 + 50; q < s.x0 + 250; q += 7) {
        const col = filled(gen, q >> 5), S = P.surfaceAt(q);
        const want = expectTop[s.biome];
        let carved = false;
        for (let d = 0; d < want.length; d++) {
          const t = col.fg[li(q, S + d)];
          if (t === T.AIR) { carved = true; continue; }
          // 礦可以取代表層下的天然格
          if (t === T.COPPER_ORE) continue;
          expect(t, `biome ${s.biome} x=${q} d=${d}`).toBe(want[d]);
        }
        if (carved) expect(gen.isEntrance(q)).toBe(true);
        seen.add(s.biome);
      }
      x = s.x1;
    }
    expect(seen.size).toBe(4);
  });

  it('(6) 禁用 API：chunkgen 與共用 primitives（engine/genPrims.ts）的原始碼沒有 Math.random / 超越函數 / 次方運算子', () => {
    const engine = join(process.cwd(), 'src', 'scripts', 'games', 'delve', 'engine');
    const dir = join(engine, 'legacy', 'chunkgen');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.sort()).toEqual(['fill.ts', 'index.ts', 'profile.ts']);
    const banned = /Math\.random|Math\.sin|Math\.cos|Math\.pow|Math\.exp|Math\.log|Math\.sqrt|Math\.hypot|\*\*/;
    for (const path of [...files.map((f) => join(dir, f)), join(engine, 'genPrims.ts')]) {
      const src = readFileSync(path, 'utf8');
      expect(banned.exec(src)?.[0] ?? null, path).toBeNull();
    }
  });

  it('(7) 效能：height 1200 的 fill 20 欄中位數 ≤ 8 ms', () => {
    const gen = new OuterGen('perf', F);
    for (let cx = -60; cx < -50; cx++) filled(gen, cx); // 暖機
    const times: number[] = [];
    for (let cx = 160; cx < 180; cx++) {
      const col = new Column(cx, H);
      const t0 = performance.now();
      gen.fill(col, cx * CHUNK, cx * CHUNK + CHUNK);
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    const median = (times[9] + times[10]) / 2;
    expect(median).toBeLessThanOrEqual(8);
  });

  it('World 接上 OuterGen：中央以外的欄、surfaceAt / biomeAt / layersAt 都問生成器', () => {
    const frame: CentralFrame = { width: 100, height: H, edgeL: 330, edgeR: 340, cavernY: 560, moltenY: 1010 };
    const gen = new OuterGen('world', frame);
    const w = new World(100, H, { bounds: 'infinite', source: gen });
    w.ensureColumn(-3);
    const ref = filled(gen, -3, frame);
    for (let x = -96; x < -64; x++) for (let y = 0; y < H; y += 3) expect(w.getFg(x, y)).toBe(ref.fg[li(x, y)]);
    // 中央最後一欄（x 96..127）的 x ≥ 100 也由生成器填
    const ref3 = filled(gen, 3, frame);
    for (let x = 100; x < 128; x++) for (let y = 0; y < H; y += 5) expect(w.getLiquid(x, y)).toBe(ref3.liquid[li(x, y)]);
    expect(w.getLiquid(100, 341)).toBe(255);
    for (const x of [-1, -500, -2000, 100, 700, 5000]) {
      expect(w.surfaceAt(x)).toBe(gen.profile.surfaceAt(x));
      expect(w.biomeAt(x)).toBe(gen.profile.biomeAt(x));
      expect(w.layersAt(x)).toEqual(gen.profile.layersAt(x));
    }
  });

  it('OCEAN 不改變 v1 fill：海與沙灘欄的位元組雜湊固定', () => {
    const gen = new OuterGen('ocean-pin', F);
    let h = 0x811c9dc5;
    for (const cx of [131, 132, 133, 140, 145, 146, 147, -1, -5, -15, -16, -17]) h = fnv1a(bytes(filled(gen, cx)), h);
    expect(h).toBe(V1_SEA_HASH);
  });

  it('抽出共用 primitives 不改變 v1 fill：陸地欄的位元組雜湊固定（裁決 P10）', () => {
    const gen = new OuterGen('land-pin', F);
    let h = 0x811c9dc5;
    // 東：x ≥ 4680 是陸地（cx 150 起）；西：x < −480（cx −16 以下）；各跨 4 個以上生態段
    for (const cx of [150, 151, 165, 180, 200, 215, 240, 270, -20, -21, -35, -50, -70, -90, -110, -140]) h = fnv1a(bytes(filled(gen, cx)), h);
    expect(h).toBe(V1_FILL_HASH);
  });
});

describe('BIOME.OCEAN（v1 海區）', () => {
  it('海區欄的 biome = OCEAN，陸地段不是', () => {
    const gen = new OuterGen('ocean-biome', F);
    expect(BIOME.OCEAN).toBe(4);
    expect(gen.profile.biomeAt(4200 + 10)).toBe(BIOME.OCEAN);
    expect(gen.profile.biomeAt(-10)).toBe(BIOME.OCEAN);
    expect(gen.profile.biomeAt(4200 + SEA_W + 50)).not.toBe(BIOME.OCEAN);
  });
});

describe('OuterGen.regionAt（v1 地區）', () => {
  it('海 = landmass 1 / sea / OCEAN；陸地段 k = landmass 2 / wild / 段的生態與範圍；variant 0、culture null', () => {
    const gen = new OuterGen('region', F), P = gen.profile;
    expect(gen.regionAt(4210)).toMatchObject({ kind: 'sea', side: 1, biome: BIOME.OCEAN, x0: 4200, x1: 4200 + SEA_W });
    expect(gen.regionAt(4210)).toEqual({ landmass: 1, side: 1, tier: 0, kind: 'sea', culture: null, variant: 0, biome: BIOME.OCEAN, index: 0, x0: 4200, x1: 4200 + SEA_W });
    expect(gen.regionAt(-1)).toEqual({ landmass: 1, side: -1, tier: 0, kind: 'sea', culture: null, variant: 0, biome: BIOME.OCEAN, index: 0, x0: -SEA_W, x1: 0 });
    expect(gen.regionAt(-1 - SEA_W - 5)).toMatchObject({ kind: 'wild', side: -1, index: 0 });
    for (const x of [-1 - SEA_W - 5, -SEA_W - 2000, 4200 + SEA_W, 4200 + SEA_W + 3000]) {
      const s = P.segmentAt(x)!;
      expect(gen.regionAt(x)).toEqual({ landmass: 2, side: s.side, tier: 0, kind: 'wild', culture: null, variant: 0, biome: s.biome, index: s.k, x0: s.x0, x1: s.x1 });
      expect(x >= s.x0 && x < s.x1).toBe(true);
    }
    expect(gen.regionAt(4200 + SEA_W + 3000).index).toBeGreaterThan(0);
  });
});
