// worldgen.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { generateWorld, tileRunner, type GenResult } from './worldgen';
import { World, BIOME } from './world';
import { Rng } from './rng';
import { T, W, isSolidTile, tileDef, floorOk, ceilOk, isChestTile } from './tiles';
import { WORLD_W, WORLD_H, PLAYER_H, TILE_SIZE } from './constants';

function hashBytes(...arrs: Uint8Array[]): number {
  let h = 2166136261;
  for (const a of arrs) for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 16777619);
  return h >>> 0;
}

describe('tileRunner', () => {
  it('在空白世界灑出菱形塊、尺寸隨步數收斂', () => {
    const w = new World(64, 64);
    tileRunner(w, new Rng(1), 32, 32, 8, 6, T.STONE, { addTile: true });
    let n = 0;
    for (let i = 0; i < w.fg.length; i++) if (w.fg[i] === T.STONE) n++;
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThan(64 * 64 / 4);
    expect(w.modifiedChunks.size).toBe(0); // 生成階段不算玩家修改
  });
  it('type=-1 挖成空氣', () => {
    const w = new World(64, 64);
    w.fg.fill(T.STONE);
    tileRunner(w, new Rng(2), 32, 32, 10, 10, -1);
    expect(w.fg[w.idx(32, 32)]).toBe(T.AIR);
  });
});

describe('generateWorld', () => {
  let a: GenResult;
  let genMs = 0;
  beforeAll(() => { const t0 = performance.now(); a = generateWorld('alpha'); genMs = performance.now() - t0; });

  it('預設尺寸 4200×1200', () => {
    expect(WORLD_W).toBe(4200);
    expect(WORLD_H).toBe(1200);
    expect(a.world.width).toBe(WORLD_W);
    expect(a.world.height).toBe(WORLD_H);
  });
  it('效能：4200×1200 生成 < 1.5 秒（node；量本執行緒的 CPU 時間並取較快者，平行測試搶 CPU 時牆鐘時間會失真）', () => {
    // 本執行緒的 CPU 時間（被其他 process 搶走 CPU 的時間不算）；舊版 Node 沒有 threadCpuUsage 時退回整個 process
    type Cpu = { user: number; system: number };
    const pr = (globalThis as unknown as { process: { cpuUsage(p?: Cpu): Cpu; threadCpuUsage?(p?: Cpu): Cpu } }).process;
    const usage = (p?: Cpu): Cpu => (pr.threadCpuUsage ? pr.threadCpuUsage(p) : pr.cpuUsage(p));
    const c0 = usage(), t0 = performance.now();
    generateWorld('alpha-2');
    const wall = performance.now() - t0, c = usage(c0), cpu = (c.user + c.system) / 1000;
    const best = Math.min(genMs, wall, cpu);
    console.log(`[delve] worldgen 4200x1200: wall ${Math.min(genMs, wall).toFixed(0)} ms, cpu ${cpu.toFixed(0)} ms`);
    expect(best).toBeLessThan(1500);
  });
  it('同 seed → 位元相同（含箱子）；不同 seed → 不同', () => {
    const o = { width: 1200, height: 400 };
    const x = generateWorld('alpha', o), b = generateWorld('alpha', o), c = generateWorld('beta', o);
    expect(hashBytes(b.world.fg, b.world.wall)).toBe(hashBytes(x.world.fg, x.world.wall));
    expect(b.spawn).toEqual(x.spawn);
    expect(JSON.stringify([...b.world.chests])).toBe(JSON.stringify([...x.world.chests]));
    expect(hashBytes(c.world.fg, c.world.wall)).not.toBe(hashBytes(x.world.fg, x.world.wall));
  });
  it('出生點：森林、靠中央；腳下是實心地面、身體所在格為空', () => {
    const { world, spawn } = a;
    expect(isSolidTile(world.getFg(spawn.x, spawn.y + 1))).toBe(true);
    const bodyTiles = Math.ceil(PLAYER_H / TILE_SIZE);
    for (let dy = 0; dy < bodyTiles; dy++) {
      for (let dx = -1; dx <= 1; dx++) expect(isSolidTile(world.getFg(spawn.x + dx, spawn.y - dy))).toBe(false);
    }
    expect(spawn.x).toBeGreaterThan(WORLD_W * 0.45);
    expect(spawn.x).toBeLessThan(WORLD_W * 0.55);
    expect(world.biomeAt(spawn.x)).toBe(BIOME.FOREST);
  });
  it('四個生態區都有，左右分布；每區地表是該區材料', () => {
    const { world, biomes } = a;
    const kinds = new Set(biomes.map((b) => b.biome));
    for (const b of [BIOME.DESERT, BIOME.SNOW, BIOME.JUNGLE]) expect(kinds.has(b)).toBe(true);
    const top: Record<number, number[]> = {
      [BIOME.DESERT]: [T.SAND], [BIOME.SNOW]: [T.SNOW, T.ICE], [BIOME.JUNGLE]: [T.JUNGLE_GRASS, T.MUD],
    };
    for (const seg of biomes) {
      let ok = 0, n = 0;
      for (let x = seg.x0 + 20; x < seg.x1 - 20; x++) {
        n++;
        expect(world.biomeAt(x)).toBe(seg.biome);
        if (top[seg.biome].includes(world.getFg(x, a.surface[x]))) ok++;
      }
      expect(ok / n, `biome ${seg.biome}`).toBeGreaterThan(0.85);
      expect(seg.x1 - seg.x0).toBeGreaterThan(WORLD_W * 0.06);
      // 不覆蓋出生帶
      expect(seg.x1 < WORLD_W * 0.42 || seg.x0 > WORLD_W * 0.58).toBe(true);
    }
  });
  it('生態區地下有自己的背景牆', () => {
    const { world, biomes } = a;
    const want: Record<number, number[]> = {
      [BIOME.DESERT]: [W.SANDSTONE_WALL], [BIOME.SNOW]: [W.SNOW_WALL, W.ICE_WALL], [BIOME.JUNGLE]: [W.MUD_WALL],
    };
    for (const seg of biomes) {
      const x = Math.floor((seg.x0 + seg.x1) / 2);
      let ok = 0, n = 0;
      for (let y = a.surface[x] + 10; y < a.surface[x] + 80; y++) { n++; if (want[seg.biome].includes(world.getWall(x, y))) ok++; }
      expect(ok / n, `biome ${seg.biome}`).toBeGreaterThan(0.6);
    }
  });
  it('新材料：銀、金（金比銀深）、黏土、碎石、花崗岩、大理石、砂岩、冰、泥巴', () => {
    const { world } = a;
    const cnt = new Map<number, number>(), sumY = new Map<number, number>();
    for (let i = 0; i < world.fg.length; i++) {
      const t = world.fg[i];
      cnt.set(t, (cnt.get(t) ?? 0) + 1);
      sumY.set(t, (sumY.get(t) ?? 0) + Math.floor(i / world.width));
    }
    for (const t of [T.SILVER_ORE, T.GOLD_ORE, T.CLAY, T.GRAVEL, T.GRANITE, T.MARBLE, T.SANDSTONE, T.ICE, T.MUD, T.SNOW, T.JUNGLE_GRASS]) {
      expect(cnt.get(t) ?? 0, `tile ${t}`).toBeGreaterThan(300);
    }
    const avg = (t: number): number => (sumY.get(t) ?? 0) / (cnt.get(t) ?? 1);
    expect(avg(T.GOLD_ORE)).toBeGreaterThan(avg(T.SILVER_ORE));
    expect(avg(T.SILVER_ORE)).toBeGreaterThan(avg(T.COPPER_ORE));
    expect(cnt.get(T.STONE) ?? 0).toBeGreaterThan(500000);
  });
  it('裝飾物件全都有生成，並且都有正確支撐', () => {
    const { world } = a;
    const decor = [T.FLOWER, T.TALL_GRASS, T.MUSHROOM, T.SMALL_ROCK, T.BUSH, T.PUMPKIN, T.CACTUS, T.DEAD_BUSH,
      T.SNOW_SHRUB, T.FERN, T.VINE, T.GLOW_MUSHROOM, T.CRYSTAL, T.STALACTITE, T.STALAGMITE, T.COBWEB, T.POT, T.BEAM, T.CHEST];
    const cnt = new Map<number, number>();
    const WW = world.width;
    const bad: string[] = [];
    for (let i = WW; i < world.fg.length - WW; i++) {
      const t = world.fg[i];
      cnt.set(t, (cnt.get(t) ?? 0) + 1);
      const sup = tileDef(t).support;
      const below = world.fg[i + WW], above = world.fg[i - WW];
      if (sup === 'floor' && !floorOk(t, below)) bad.push(`floor ${t} @${i % WW},${Math.floor(i / WW)}`);
      if (sup === 'ceiling' && !ceilOk(t, above)) bad.push(`ceil ${t} @${i % WW},${Math.floor(i / WW)}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    for (const t of decor) expect(cnt.get(t) ?? 0, `decor ${t}`).toBeGreaterThan(t === T.PUMPKIN || t === T.CHEST ? 5 : 30);
  });
  it('結構：地下小屋（工作台 + 箱子 + 火把）、礦坑（木樑 + 火把）、地表遺跡、大洞窟', () => {
    const { world, structures } = a;
    const kind = (k: string): typeof structures => structures.filter((s) => s.kind === k);
    expect(kind('cabin').length).toBeGreaterThanOrEqual(8);
    expect(kind('mineshaft').length).toBeGreaterThanOrEqual(4);
    expect(kind('ruin').length).toBeGreaterThanOrEqual(1);
    expect(kind('cavern').length).toBeGreaterThanOrEqual(5);
    const inRect = (s: { x: number; y: number; w: number; h: number }, t: number): number => {
      let n = 0;
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) if (world.getFg(x, y) === t) n++;
      return n;
    };
    for (const c of kind('cabin')) {
      expect(inRect(c, T.WORKBENCH)).toBe(1);
      expect(inRect(c, T.CHEST)).toBe(1);
      expect(inRect(c, T.TORCH)).toBeGreaterThanOrEqual(1);
      expect(inRect(c, T.PLANKS)).toBeGreaterThan(10);
    }
    for (const m of kind('mineshaft')) expect(inRect(m, T.BEAM)).toBeGreaterThan(4);
    for (const r of kind('ruin')) expect(inRect(r, T.STONE_BRICK)).toBeGreaterThan(10);
  });
  it('每個箱子都有對應內容、非空', () => {
    const { world } = a;
    let n = 0;
    for (let i = 0; i < world.fg.length; i++) {
      if (!isChestTile(world.fg[i])) continue;
      n++;
      const c = world.chests.get(i);
      expect(c).toBeDefined();
      expect(c!.some((s) => s !== null)).toBe(true);
    }
    expect(n).toBe(world.chests.size);
    expect(n).toBeGreaterThan(8);
  });
  it('洞穴、地表以上無牆', () => {
    const { world } = a;
    let air = 0, total = 0;
    for (let y = world.surfaceY + 20; y < world.height - 5; y += 3) {
      for (let x = 0; x < world.width; x += 3) { total++; if (world.fg[world.idx(x, y)] === T.AIR) air++; }
    }
    expect(air / total).toBeGreaterThan(0.03);
    expect(air / total).toBeLessThan(0.5);
    for (let x = 0; x < world.width; x++) {
      expect(world.fg[world.idx(x, 0)]).toBe(T.AIR);
      expect(world.wall[world.idx(x, 0)]).toBe(W.NONE);
    }
    expect(world.surfaceY).toBeGreaterThan(50);
    expect(world.surfaceY).toBeLessThan(world.height / 2);
  });
  it('地形起伏：地表高度有足夠變化（山、谷、懸崖）', () => {
    let maxStep = 0, lo = 1e9, hi = 0;
    for (let x = 1; x < a.surface.length; x++) {
      maxStep = Math.max(maxStep, Math.abs(a.world.surface[x] - a.world.surface[x - 1]));
      lo = Math.min(lo, a.world.surface[x]); hi = Math.max(hi, a.world.surface[x]);
    }
    expect(maxStep).toBeGreaterThanOrEqual(4);
    expect(hi - lo).toBeGreaterThan(60);
  });
  it('有樹（森林 / 雪地松樹 / 叢林大樹）', () => {
    const { world, biomes } = a;
    const trunkIn = (x0: number, x1: number): number => {
      let n = 0;
      for (let x = x0; x < x1; x++) for (let y = 1; y < world.surfaceY + 40; y++) if (world.getFg(x, y) === T.WOOD && world.getFg(x, y + 1) !== T.WOOD) n++;
      return n;
    };
    expect(trunkIn(Math.floor(WORLD_W * 0.42), Math.floor(WORLD_W * 0.58))).toBeGreaterThan(10);
    for (const s of biomes) if (s.biome === BIOME.SNOW || s.biome === BIOME.JUNGLE) expect(trunkIn(s.x0, s.x1)).toBeGreaterThan(10);
  });
  it('生成後 modifiedChunks 為空', () => {
    expect(a.world.modifiedChunks.size).toBe(0);
  });
  it('可指定較小尺寸（不丟例外、出生點站得住）', () => {
    for (const [w, h] of [[200, 120], [160, 100], [96, 64]]) {
      const r = generateWorld('small', { width: w, height: h });
      expect(r.world.width).toBe(w);
      expect(isSolidTile(r.world.getFg(r.spawn.x, r.spawn.y + 1))).toBe(true);
    }
  });
});

describe('地形種類與迷你生態區', () => {
  let a: GenResult;
  beforeAll(() => { a = generateWorld('landforms'); });
  const LF_BY_BIOME: Record<number, string[]> = {
    [BIOME.FOREST]: ['plains', 'hills', 'mountains', 'valley', 'reserved'],
    [BIOME.DESERT]: ['dunes', 'mesa'],
    [BIOME.SNOW]: ['mountains', 'hills', 'frozen_lake'],
    [BIOME.JUNGLE]: ['hills', 'swamp'],
  };
  it('地形分段覆蓋整個世界、類型符合所在生態區、種類夠多', () => {
    const { landforms, world } = a;
    expect(landforms[0].x0).toBe(0);
    expect(landforms[landforms.length - 1].x1).toBe(world.width);
    for (let k = 1; k < landforms.length; k++) expect(landforms[k].x0).toBe(landforms[k - 1].x1);
    for (const lf of landforms) {
      const mid = Math.floor((lf.x0 + lf.x1) / 2);
      expect(LF_BY_BIOME[world.biomeAt(mid)], `${lf.type} @${mid}`).toContain(lf.type);
    }
    expect(new Set(landforms.map((l) => l.type)).size).toBeGreaterThanOrEqual(5);
    // 出生點在平原
    const sp = landforms.find((l) => a.spawn.x >= l.x0 && a.spawn.x < l.x1)!;
    expect(sp.type).toBe('plains');
  });
  it('各種地形都會在某些 seed 出現', () => {
    const seen = new Set<string>();
    for (const sd of ['landforms', 'b', 'c', 'd', 'e', 'f']) for (const l of generateWorld(sd, { width: 2400, height: 700 }).landforms) seen.add(l.type);
    for (const t of ['plains', 'hills', 'mountains', 'valley', 'dunes', 'mesa', 'frozen_lake', 'swamp']) expect(seen.has(t), t).toBe(true);
  });
  it('結冰湖：湖面是平的冰', () => {
    const r = generateWorld('lake-hunt', { width: 2400, height: 700 });
    for (const lake of r.structures.filter((s) => s.kind === 'frozen_lake')) {
      let ice = 0;
      const ys = new Set<number>();
      for (let x = lake.x; x < lake.x + lake.w; x++) {
        if (r.world.getFg(x, r.surface[x]) === T.ICE) { ice++; ys.add(r.surface[x]); }
      }
      expect(ice).toBeGreaterThan(lake.w * 0.6);
      expect(ys.size).toBeLessThanOrEqual(3);
    }
  });
  it('垂直裂谷：從地表一路通到很深', () => {
    const ch = a.structures.filter((s) => s.kind === 'chasm');
    expect(ch.length).toBeGreaterThanOrEqual(2);
    for (const c of ch) expect(c.h).toBeGreaterThan(60);
  });
  it('地表峽谷、地表洞口', () => {
    expect(a.structures.filter((s) => s.kind === 'ravine').length + a.structures.filter((s) => s.kind === 'chasm').length).toBeGreaterThanOrEqual(3);
  });
  it('世界兩端是沙灘', () => {
    const { world } = a;
    for (const x of [3, 10, world.width - 4, world.width - 11]) expect(world.getFg(x, a.surface[x])).toBe(T.SAND);
  });
  it('預留地城區：靠近一側邊緣、不與生態區或結構重疊', () => {
    const z = a.dungeonZone, W_ = a.world.width;
    expect(z.x1 - z.x0).toBeGreaterThan(W_ * 0.04);
    expect(z.x0 < W_ * 0.12 || z.x1 > W_ * 0.88).toBe(true);
    expect(z.y1).toBeGreaterThan(z.y0 + 100);
    for (const b of a.biomes) expect(b.x1 <= z.x0 || b.x0 >= z.x1).toBe(true);
    for (const s of a.structures) {
      if (s.kind === 'cavern' || s.kind === 'chasm' || s.kind === 'ravine' || s.kind === 'frozen_lake' || s.kind === 'dungeon') continue;
      expect(s.x + s.w <= z.x0 || s.x >= z.x1 || s.y + s.h <= z.y0 || s.y >= z.y1, `${s.kind}@${s.x}`).toBe(true);
    }
  });
  it('螢光菇生態區：蘑菇草 + 大量螢光菇', () => {
    const m = a.structures.filter((s) => s.kind === 'mushroom_biome');
    expect(m.length).toBeGreaterThanOrEqual(1);
    for (const r of m) {
      let grass = 0, glow = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const t = a.world.getFg(x, y);
        if (t === T.MUSHROOM_GRASS) grass++;
        if (t === T.GLOW_MUSHROOM) glow++;
      }
      expect(grass).toBeGreaterThan(150);
      expect(glow).toBeGreaterThan(40);
    }
  });
  it('水晶洞：大理石殼 + 大量水晶', () => {
    const c = a.structures.filter((s) => s.kind === 'crystal_cave');
    expect(c.length).toBeGreaterThanOrEqual(1);
    for (const r of c) {
      let cr = 0, mb = 0;
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
        const t = a.world.getFg(x, y);
        if (t === T.CRYSTAL) cr++;
        if (t === T.MARBLE) mb++;
      }
      expect(cr).toBeGreaterThan(30);
      expect(mb).toBeGreaterThan(200);
    }
  });
  it('浮空島：地表上空、有小屋與箱子', () => {
    const isl = a.structures.filter((s) => s.kind === 'sky_island');
    expect(isl.length).toBeGreaterThanOrEqual(2);
    for (const s of isl) {
      expect(s.chest).toBeDefined();
      expect(a.world.getFg(s.chest!.x, s.chest!.y)).toBe(T.CHEST);
      for (let x = s.x; x < s.x + s.w; x++) expect(s.y + s.h).toBeLessThan(a.world.surface[x] - 20);
      let planks = 0, grass = 0;
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) {
        if (a.world.getFg(x, y) === T.PLANKS) planks++;
        if (a.world.getFg(x, y) === T.GRASS) grass++;
      }
      expect(planks).toBeGreaterThan(10);
      expect(grass).toBeGreaterThan(10);
    }
  });
});
