// worldgen.layers.test.ts — 深度層、洞穴網路連通、生態區有機形狀（隨深度收窄 / 不到世界底部）、熔岩深淵、確定性
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, type GenResult } from './worldgen';
import { BIOME } from './world';
import { T, W, SOLID_LUT, tileDef } from './tiles';

function hashBytes(...arrs: ArrayLike<number>[]): number {
  let h = 2166136261;
  for (const a of arrs) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

/** y 範圍內的空氣 4 連通區塊大小（區塊不流出範圍） */
function airComponents(r: GenResult, y0: number, y1: number): number[] {
  const w = r.world, WW = w.width;
  const lab = new Uint8Array(WW * w.height);
  const sizes: number[] = [], st: number[] = [];
  for (let y = y0; y < y1; y++) for (let x = 0; x < WW; x++) {
    const i = y * WW + x;
    if (SOLID_LUT[w.fg[i]] || lab[i]) continue;
    let n = 0;
    lab[i] = 1; st.push(i);
    while (st.length) {
      const k = st.pop()!;
      n++;
      const kx = k % WW, ky = (k - kx) / WW;
      const nb = [kx > 0 ? k - 1 : -1, kx < WW - 1 ? k + 1 : -1, ky > y0 ? k - WW : -1, ky < y1 - 1 ? k + WW : -1];
      for (const q of nb) if (q >= 0 && !SOLID_LUT[w.fg[q]] && !lab[q]) { lab[q] = 1; st.push(q); }
    }
    sizes.push(n);
  }
  return sizes;
}

describe('深度層與洞穴系統', { timeout: 180_000 }, () => {
  let a: GenResult;
  beforeAll(() => { a = generateWorld('layers'); }, 180_000);

  it('分界線單調：地表 < 岩層 < 洞穴層 < 熔岩深淵，且各層厚度有起伏', () => {
    const { layers, world } = a;
    let minThick = 1e9, maxThick = 0;
    for (let x = 0; x < world.width; x++) {
      expect(layers.rock[x]).toBeGreaterThan(world.surface[x]);
      expect(layers.deep[x]).toBeGreaterThan(layers.rock[x]);
      expect(layers.molten[x]).toBeGreaterThan(layers.deep[x]);
      expect(layers.molten[x]).toBeLessThan(world.height);
      const t = layers.rock[x] - world.surface[x];
      minThick = Math.min(minThick, t); maxThick = Math.max(maxThick, t);
    }
    expect(maxThick - minThick).toBeGreaterThan(50); // 泥土層有薄有厚
    expect(world.rockY).toBeLessThan(world.cavernY);
    expect(world.cavernY).toBeLessThan(world.moltenY);
    expect(world.moltenY / world.height).toBeGreaterThan(0.75);
    expect(world.cavernY / world.height).toBeGreaterThan(0.35);
  });

  it('各層的主要材料出現在預期深度帶（森林欄）', () => {
    const { world, layers, biomes } = a;
    const inBiome = (x: number): boolean => biomes.some((b) => x > b.x0 - 200 && x < b.x1 + 200);
    const z = a.dungeonZone;
    const count = new Map<string, Map<number, number>>();
    const add = (band: string, t: number): void => {
      let m = count.get(band);
      if (!m) { m = new Map(); count.set(band, m); }
      m.set(t, (m.get(t) ?? 0) + 1);
    };
    for (let x = 0; x < world.width; x += 3) {
      if (inBiome(x) || (x > z.x0 - 30 && x < z.x1 + 30)) continue;
      for (let y = world.surface[x] + 4; y < world.height - 6; y += 2) {
        const t = world.fg[y * world.width + x];
        if (!SOLID_LUT[t]) continue;
        const band = y < layers.rock[x] - 6 ? 'dirt' : y < layers.deep[x] - 20 ? 'rock' : y < layers.molten[x] - 16 ? 'deep' : y > layers.molten[x] + 16 ? 'molten' : 'edge';
        add(band, t);
      }
    }
    const frac = (band: string, ts: number[]): number => {
      const m = count.get(band)!;
      let tot = 0, hit = 0;
      for (const [t, n] of m) { tot += n; if (ts.includes(t)) hit += n; }
      return hit / tot;
    };
    expect(frac('dirt', [T.DIRT, T.GRASS, T.CLAY, T.SAND])).toBeGreaterThan(0.6);
    expect(frac('rock', [T.STONE, T.GRAVEL])).toBeGreaterThan(0.55);
    expect(frac('deep', [T.DEEP_STONE])).toBeGreaterThan(0.5);
    expect(frac('molten', [T.BASALT, T.ASH, T.OBSIDIAN, T.MAGMA_ROCK])).toBeGreaterThan(0.85);
    // 雙向互滲：泥土層裡有石頭團、岩層裡有泥土團
    expect(frac('dirt', [T.STONE])).toBeGreaterThan(0.04);
    expect(frac('rock', [T.DIRT])).toBeGreaterThan(0.04);
    // 洞穴層：花崗岩比岩層多
    expect(frac('deep', [T.GRANITE])).toBeGreaterThan(frac('rock', [T.GRANITE]));
  });

  it('背景牆跟著深度層換：岩層石牆、洞穴層深層岩牆、熔岩深淵玄武岩牆', () => {
    const { world, layers } = a;
    const x = a.spawn.x + 150;
    const wallAt = (y: number): number => world.wall[y * world.width + x];
    const ws = (y0: number, y1: number): Set<number> => { const s = new Set<number>(); for (let y = y0; y < y1; y++) s.add(wallAt(y)); return s; };
    expect(ws(layers.deep[x] + 25, layers.deep[x] + 60).has(W.DEEP_STONE_WALL)).toBe(true);
    expect(ws(layers.molten[x] + 15, layers.molten[x] + 30).has(W.BASALT_WALL)).toBe(true);
  });

  it('洞穴層的大洞窟彼此連通：大於 1500 格的區塊幾乎都是同一張網', () => {
    const { world } = a;
    const sizes = airComponents(a, world.cavernY + 10, world.moltenY - 10);
    const big = sizes.filter((s) => s >= 1500).sort((p, q) => q - p);
    const total = big.reduce((p, q) => p + q, 0);
    expect(big.length).toBeGreaterThanOrEqual(1);
    expect(big[0] / total).toBeGreaterThan(0.85);
    // 洞穴層夠空（是洞窟網路，不是實心岩）但不是全空
    let air = 0, n = 0;
    for (let y = world.cavernY + 10; y < world.moltenY - 10; y += 2) for (let x = 0; x < world.width; x += 2) { n++; if (!SOLID_LUT[world.fg[y * world.width + x]]) air++; }
    expect(air / n).toBeGreaterThan(0.18);
    expect(air / n).toBeLessThan(0.55);
  });

  it('孤立小氣泡很少（地底不是滿地小洞）', () => {
    const { world } = a;
    const sizes = airComponents(a, world.rockY, world.moltenY);
    const tiny = sizes.filter((s) => s < 24).length;
    expect(tiny).toBeLessThan(80);
  });

  it('有長水平廊道與巨大洞室', () => {
    const caverns = a.structures.filter((s) => s.kind === 'cavern');
    expect(caverns.length).toBeGreaterThanOrEqual(4);
    for (const c of caverns) {
      let air = 0;
      for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (!SOLID_LUT[a.world.getFg(x, y)]) air++;
      expect(air, `cavern@${c.x}`).toBeGreaterThan(c.w * c.h * 0.3);
      expect(c.y).toBeGreaterThanOrEqual(a.world.cavernY);
    }
    // 某一列上存在 ≥ 150 格連續的空氣（水平廊道或大洞）
    const { world } = a;
    let best = 0;
    for (let y = world.rockY; y < world.moltenY; y++) {
      let run = 0;
      for (let x = 0; x < world.width; x++) {
        const open = !SOLID_LUT[world.fg[y * world.width + x]] || !SOLID_LUT[world.fg[(y + 1) * world.width + x]] || !SOLID_LUT[world.fg[(y - 1) * world.width + x]];
        run = open ? run + 1 : 0;
        if (run > best) best = run;
      }
    }
    expect(best).toBeGreaterThan(150);
  });

  it('熔岩深淵：開闊帶（無背景牆）、灰燼地板、發光的熔岩石與黑曜石', () => {
    const { world } = a;
    let air = 0, noWall = 0, n = 0;
    const cnt = new Map<number, number>();
    for (let y = world.moltenY + 20; y < world.height - 6; y++) for (let x = 0; x < world.width; x += 2) {
      const i = y * world.width + x, t = world.fg[i];
      n++;
      cnt.set(t, (cnt.get(t) ?? 0) + 1);
      if (!SOLID_LUT[t]) { air++; if (world.wall[i] === W.NONE) noWall++; }
    }
    expect(air / n).toBeGreaterThan(0.15);
    expect(noWall / air).toBeGreaterThan(0.8);
    expect(cnt.get(T.MAGMA_ROCK) ?? 0).toBeGreaterThan(1500);
    expect(cnt.get(T.ASH) ?? 0).toBeGreaterThan(500);
    expect(cnt.get(T.OBSIDIAN) ?? 0).toBeGreaterThan(300);
    expect(tileDef(T.MAGMA_ROCK).light).toBeGreaterThan(0.5);
    // 世界最底下是實心
    for (let x = 0; x < world.width; x += 7) expect(SOLID_LUT[world.fg[(world.height - 1) * world.width + x]]).toBe(1);
  });

  it('礦脈群：成團出現（同種礦的鄰格比例高），並依深度分帶', () => {
    const { world } = a;
    const WW = world.width;
    for (const ore of [T.COPPER_ORE, T.IRON_ORE, T.SILVER_ORE, T.GOLD_ORE]) {
      let n = 0, nb = 0;
      for (let i = WW; i < world.fg.length - WW; i++) {
        if (world.fg[i] !== ore) continue;
        n++;
        const k = (world.fg[i - 1] === ore ? 1 : 0) + (world.fg[i + 1] === ore ? 1 : 0) + (world.fg[i - WW] === ore ? 1 : 0) + (world.fg[i + WW] === ore ? 1 : 0);
        if (k >= 2) nb++;
      }
      expect(n, `ore ${ore}`).toBeGreaterThan(1500);
      expect(nb / n, `ore ${ore} clustered`).toBeGreaterThan(0.6);
    }
  });
});

describe('生態區的有機形狀', { timeout: 180_000 }, () => {
  const seeds = ['shape-a', 'shape-b'];
  const results: GenResult[] = [];
  beforeAll(() => { for (const s of seeds) results.push(generateWorld(s)); }, 180_000);

  /** 某一列上帶該生態區背景牆的格數（= 該深度的寬度） */
  const widthAt = (r: GenResult, walls: number[], y: number): number => {
    let n = 0;
    for (let x = 0; x < r.world.width; x++) if (walls.includes(r.world.wall[y * r.world.width + x])) n++;
    return n;
  };
  const WALLS: Record<number, number[]> = {
    [BIOME.DESERT]: [W.SANDSTONE_WALL], [BIOME.SNOW]: [W.SNOW_WALL, W.ICE_WALL], [BIOME.JUNGLE]: [W.MUD_WALL],
  };

  it('沙漠：地下先變寬（淚滴肩部）再收窄，底部停在洞穴層上段', () => {
    for (const r of results) {
      const seg = r.biomes.find((b) => b.biome === BIOME.DESERT)!;
      const w = r.world, span = w.moltenY - w.cavernY;
      const wide = widthAt(r, WALLS[BIOME.DESERT], w.rockY);
      const narrow = widthAt(r, WALLS[BIOME.DESERT], w.cavernY + Math.floor(span * 0.2));
      expect(wide).toBeGreaterThan((seg.x1 - seg.x0) * 0.95);
      expect(narrow).toBeLessThan(wide * 0.6);
      expect(widthAt(r, WALLS[BIOME.DESERT], w.cavernY + Math.floor(span * 0.45))).toBe(0);
    }
  });
  it('雪原：隨深度收窄成冰洞，不到熔岩深淵', () => {
    for (const r of results) {
      const w = r.world, span = w.moltenY - w.cavernY;
      const top = widthAt(r, WALLS[BIOME.SNOW], w.rockY);
      const mid = widthAt(r, WALLS[BIOME.SNOW], w.cavernY + Math.floor(span * 0.2));
      expect(mid).toBeLessThan(top * 0.9);
      expect(widthAt(r, WALLS[BIOME.SNOW], w.moltenY - 20)).toBe(0);
      // 冰洞：雪原地下有冰與空洞
      const seg = r.biomes.find((b) => b.biome === BIOME.SNOW)!;
      let ice = 0, air = 0;
      for (let y = w.rockY; y < w.cavernY; y++) for (let x = seg.x0 + 40; x < seg.x1 - 40; x++) {
        const t = w.getFg(x, y);
        if (t === T.ICE) ice++; else if (!SOLID_LUT[t]) air++;
      }
      expect(ice).toBeGreaterThan(2000);
      expect(air).toBeGreaterThan(2000);
    }
  });
  it('叢林：中段比地表寬、底部在熔岩深淵上方結束；邊界逐列起伏（不是直線）', () => {
    for (const r of results) {
      const seg = r.biomes.find((b) => b.biome === BIOME.JUNGLE)!;
      const w = r.world, span = w.moltenY - w.cavernY;
      const mid = widthAt(r, WALLS[BIOME.JUNGLE], w.cavernY + Math.floor(span * 0.2));
      expect(mid).toBeGreaterThan((seg.x1 - seg.x0) * 1.1);
      expect(widthAt(r, WALLS[BIOME.JUNGLE], w.moltenY + 10)).toBe(0);
      // 左邊界在不同深度的 x 位置變化大
      const leftEdge = (y: number): number => { for (let x = 0; x < w.width; x++) if (w.wall[y * w.width + x] === W.MUD_WALL) return x; return -1; };
      const xs: number[] = [];
      for (let y = w.rockY; y < w.cavernY + span * 0.6; y += 20) { const e = leftEdge(y); if (e >= 0) xs.push(e); }
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(40);
    }
  });
});

describe('地表', { timeout: 180_000 }, () => {
  it('大山塊（mountains 段）比旁邊高很多；乾湖床、天坑會出現', () => {
    let tallest = 0, beds = 0, sinks = 0;
    for (const sd of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      const r = generateWorld(sd, { width: 2400, height: 700 });
      for (const lf of r.landforms) {
        if (lf.type !== 'mountains') continue;
        let top = 1e9;
        for (let x = lf.x0; x < lf.x1; x++) top = Math.min(top, r.world.surface[x]);
        const edge = Math.min(r.world.surface[lf.x0], r.world.surface[lf.x1 - 1]);
        tallest = Math.max(tallest, edge - top);
      }
      beds += r.structures.filter((s) => s.kind === 'lake_bed').length;
      sinks += r.structures.filter((s) => s.kind === 'sinkhole').length;
    }
    expect(tallest).toBeGreaterThan(35);
    expect(beds).toBeGreaterThanOrEqual(2);
    expect(sinks).toBeGreaterThanOrEqual(2);
  });
});

describe('確定性', { timeout: 180_000 }, () => {
  it('同 seed 全尺寸兩次生成位元相同（fg / wall / 分界線 / 箱子）', () => {
    const x = generateWorld('det'), y = generateWorld('det');
    expect(hashBytes(x.world.fg, x.world.wall)).toBe(hashBytes(y.world.fg, y.world.wall));
    expect(hashBytes(x.layers.rock, x.layers.deep, x.layers.molten)).toBe(hashBytes(y.layers.rock, y.layers.deep, y.layers.molten));
    expect(JSON.stringify([...x.world.chests])).toBe(JSON.stringify([...y.world.chests]));
    expect(JSON.stringify(x.structures)).toBe(JSON.stringify(y.structures));
    expect(x.dungeon).toBeTruthy();
    expect(JSON.stringify(x.dungeon)).toBe(JSON.stringify(y.dungeon));
  });
});
