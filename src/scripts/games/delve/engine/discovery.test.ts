// discovery.test.ts — 地區 / 地標（由 worldgen 推導、依種子命名）、首次進入的發現、日誌統計、存檔 JSON
import { describe, it, expect } from 'vitest';
import { buildRegions, Discovery, CATEGORY_LABEL, outerRegions, gen2Regions, NAMES, gen2RegionId, isGen2RegionId, isOuterRegionId, regionFromJSON, toRegionJSON, type RegionSource, type Region } from './discovery';
import { gen2SiteRegionId, isGen2SiteRegionId, siteOfRegionId, encodeStructureId } from './gen2/structId';
import { DelveGame } from './game';
import { Gen2Source } from './gen2';
import { SPAWN_X } from './gen2/layout';
import { CULTURES } from './gen2/cultures';
import { OuterProfile, type CentralFrame } from './legacy/chunkgen';
import { BIOME } from './world';
import { LORE } from './lore';

function source(seed = 's1'): RegionSource {
  const W = 400, H = 300;
  const fill = (v: number): Int16Array => new Int16Array(W).fill(v);
  return {
    seed, width: W, height: H, spawn: { x: 200, y: 59 },
    surface: fill(60),
    layers: { rock: fill(80), deep: fill(150), molten: fill(250) },
    biomes: [{ biome: BIOME.DESERT, x0: 100, x1: 180 }, { biome: BIOME.SNOW, x0: 260, x1: 330 }],
    structures: [
      { kind: 'cabin', x: 220, y: 100, w: 10, h: 7 },
      { kind: 'cabin', x: 300, y: 120, w: 10, h: 7 },
      { kind: 'mushroom_biome', x: 40, y: 160, w: 60, h: 40 },
      { kind: 'cavern', x: 200, y: 180, w: 60, h: 30, flavor: 'crystal' },
      { kind: 'sky_island', x: 150, y: 10, w: 30, h: 15 },
      { kind: 'secret_room', x: 230, y: 90, w: 8, h: 5 },
      { kind: 'mineshaft', x: 240, y: 95, w: 60, h: 6 },
    ],
    dungeon: null,
  };
}
const names = (rs: readonly Region[]): string[] => rs.map((r) => r.name);

describe('buildRegions', () => {
  it('確定性：同種子同結果；不同種子名字可能不同但結構相同', () => {
    const a = buildRegions(source('s1')), b = buildRegions(source('s1')), c = buildRegions(source('other'));
    expect(names(a)).toEqual(names(b));
    expect(a.length).toBe(c.length);
  });
  it('每個地區都有中文名字、名字不重複；出生地森林叫「家鄉林地」', () => {
    const rs = buildRegions(source());
    for (const r of rs) expect(r.name).toMatch(/[一-鿿]/);
    expect(new Set(names(rs)).size).toBe(rs.length);
    const home = rs.find((r) => r.contains(200, 59));
    expect(rs.filter((r) => r.contains(200, 59)).map((r) => r.name)).toContain('家鄉林地');
    expect(home).toBeTruthy();
  });
  it('分類齊全：地域 / 地層 / 洞窟 / 遺跡建築 / 密室', () => {
    const cats = new Set(buildRegions(source()).map((r) => r.cat));
    for (const c of ['land', 'depth', 'cave', 'site', 'secret'] as const) expect(cats.has(c), c).toBe(true);
    for (const c of Object.keys(CATEGORY_LABEL)) expect(CATEGORY_LABEL[c as keyof typeof CATEGORY_LABEL]).toMatch(/[一-鿿]/);
  });
  it('contains：沙漠（地表 + 洞穴層以上）、地層分帶、迷你生態區是橢圓、結構是矩形', () => {
    const rs = buildRegions(source());
    const at = (x: number, y: number): string[] => rs.filter((r) => r.contains(x, y)).map((r) => r.kind);
    expect(at(140, 59)).toContain('desert');
    expect(at(140, 120)).toContain('desert');
    expect(at(140, 160)).not.toContain('desert');
    expect(at(10, 100)).toContain('rock_layer');
    expect(at(10, 200)).toContain('cavern_layer');
    expect(at(10, 280)).toContain('molten');
    expect(at(70, 180)).toContain('mushroom_biome');
    expect(at(41, 161)).not.toContain('mushroom_biome'); // 外接框角落（橢圓外）
    expect(at(225, 103)).toContain('cabin');
  });
});

describe('Discovery', () => {
  it('第一次進入才算發現；之後不再觸發', () => {
    const d = new Discovery(buildRegions(source()));
    const first = d.visit(225, 103);
    expect(first.map((r) => r.kind)).toEqual(expect.arrayContaining(['cabin', 'rock_layer']));
    expect(d.visit(225, 104)).toEqual([]);
    expect(d.isFound(first[0].id)).toBe(true);
  });
  it('統計：每類 已發現 / 總數、碑文、珍寶、完成度、最深紀錄、移動距離', () => {
    const d = new Discovery(buildRegions(source()), { loreTotal: 4, treasureItems: ['jump_boots', 'magnet'] });
    d.visit(225, 103);
    d.readLore(2); d.readLore(2); d.readLore(3);
    d.gainTreasure('magnet');
    d.track(100, 0, 5); d.track(116, 0, 40); d.track(116, 0, 12);
    const s = d.stats();
    const site = s.cats.find((c) => c.cat === 'site')!;
    expect(site.total).toBe(4); // 2 小屋 + 浮空島 + 礦坑
    expect(site.found).toBe(1);
    expect(s.lore).toEqual({ found: 2, total: 4 });
    expect(s.treasures).toEqual({ found: 1, total: 2 });
    expect(s.depthRecord).toBe(40);
    expect(s.distance).toBeCloseTo(1, 5); // (116-100)/16 格
    const totalAll = s.cats.reduce((a, c) => a + c.total, 0) + 4 + 2;
    const foundAll = s.cats.reduce((a, c) => a + c.found, 0) + 2 + 1;
    expect(s.completion).toBeCloseTo(foundAll / totalAll, 6);
  });
  it('readLore 回傳是否第一次讀到；碑文至少 12 篇', () => {
    const d = new Discovery(buildRegions(source()));
    expect(d.readLore(0)).toBe(true);
    expect(d.readLore(0)).toBe(false);
    expect(LORE.length).toBeGreaterThanOrEqual(12);
    expect(LORE.length).toBeLessThanOrEqual(16);
  });
  it('toJSON / fromJSON 往返；不合法的 id 忽略', () => {
    const rs = buildRegions(source());
    const d = new Discovery(rs, { loreTotal: 14, treasureItems: ['magnet'] });
    d.visit(225, 103); d.readLore(5); d.gainTreasure('magnet'); d.track(0, 0, 30); d.track(40, 0, 30);
    const j = JSON.parse(JSON.stringify(d.toJSON()));
    const e = new Discovery(rs, { loreTotal: 14, treasureItems: ['magnet'] });
    e.load({ ...j, regions: [...j.regions, 9999, -1, 'x'], lore: [...j.lore, 99] });
    expect(e.toJSON()).toEqual(d.toJSON());
  });
});

describe('Discovery 格網（負 x）', () => {
  const rect = (id: number, x: number, y: number, w: number, h: number): Region => ({
    id, cat: 'land', kind: `r${id}`, name: `地區${id}`, x, y, w, h, ax: x, ay: y,
    contains: (px, py) => px >= x && px < x + w && py >= y && py < y + h,
  });
  it('x ∈ [−200, −100) 的地區與 x ∈ [0, 64) 的地區各自只在自己那裡', () => {
    const d = new Discovery([rect(0, -200, 0, 100, 40), rect(1, 0, 0, 64, 40)]);
    expect(d.regionsAt(-150, 10).map((r) => r.id)).toEqual([0]);
    expect(d.regionsAt(10, 10).map((r) => r.id)).toEqual([1]);
  });
  it('負 gx 的格不會撞到別列（地區自己的 contains 全收也只出現在自己的格）', () => {
    // 舊鍵 gy*4096 + gx：(gx −3, gy 1) 與 (gx 4093, gy 0) 同一個鍵
    const everywhere: Region = { ...rect(0, -200, 64, 100, 64), contains: () => true };
    const d = new Discovery([everywhere]);
    expect(d.regionsAt(-150, 100).map((r) => r.id)).toEqual([0]);
    expect(d.regionsAt(4093 * 64 + 10, 10)).toEqual([]);
    expect(d.regionsAt(4094 * 64 + 10, 10)).toEqual([]);
  });
});

// ── 外圍地區（裁決 P2：outerRegions 回傳陣列；Task 14 在這之上加 gen2Regions） ──
const OUTER_FRAME: CentralFrame = { width: 4200, height: 1200, edgeL: 300, edgeR: 310, cavernY: 600, moltenY: 1000 };
const profile = new OuterProfile('od', OUTER_FRAME);
/** 改寫前（outerRegions 回傳單一 Region | null）錄下：單一 Region → [[id, name]]、null → [] */
const OUTER_BEFORE: [number, string][][] = [
  [[1073741824, '東方大海']], [[1073741826, '東境・晨霧林地']], [[1073741828, '東境・白寂雪原']],
  [[1073741825, '西方大海']], [[1073741827, '西境・松鼠丘陵']],
];

describe('outerRegions（陣列）', () => {
  it('outerRegions 包成陣列後 id / 名字不變', () => {
    const f = outerRegions('od', profile);
    expect([4210, 4800, 6000, -10, -900].map((x) => f(x, 300).map((r) => [r.id, r.name]))).toEqual(OUTER_BEFORE);
    const d = new Discovery([]);
    d.setOuter(f);
    expect(d.visit(4800, 300).map((r) => r.id)).toEqual(OUTER_BEFORE[1].map(([id]) => id));
    // 中央 / 洞穴層線以下 → 空陣列；再走一次不重複發現
    expect(f(2100, 300)).toEqual([]);
    expect(f(4800, 1100)).toEqual([]);
    expect(d.visit(4800, 300)).toEqual([]);
  });
});

// ── gen2 地區的發現與命名 ──
describe('gen2Regions', () => {
  const src = new Gen2Source('rg'), q = gen2Regions('rg', src), q2 = gen2Regions('rg', new Gen2Source('rg'));
  // 依 x 排序第一份整個外框都在地區範圍內（b.y + b.h ≤ min deep）的小屋（深層小屋在 deep 以下、只會回 1 個 region）
  const shallowCabin = (g: Gen2Source): { x: number; y: number } => {
    const bs = g.blueprints.overlapping(-40_000, 40_000).filter((b) => b.kind === 'cabin').sort((a, b) => a.x - b.x);
    const b = bs.find((c) => { let m = Infinity; for (let x = c.x; x < c.x + c.w; x++) m = Math.min(m, g.layersAt(x).deep); return c.y + c.h <= m; })!;
    return { x: b.x, y: b.y };
  };
  it('gen2 地區 id 唯一、在 gen2 範圍內、跨實例穩定；名字確定；結構地區 id = gen2SiteRegionId(藍圖 id, 0)', () => {
    const seen = new Map<number, string>();
    for (let x = -30_000; x < 30_000; x += 53) for (const r of q(x, 300)) {
      expect(r.cat === 'site' ? isGen2SiteRegionId(r.id) : isGen2RegionId(r.id), `${r.cat} ${r.id}`).toBe(true); expect(isOuterRegionId(r.id)).toBe(false);
      if (seen.has(r.id)) expect(seen.get(r.id)).toBe(r.name); else seen.set(r.id, r.name);
    }
    for (let x = -30_000; x < 30_000; x += 977) expect(q2(x, 300).map((r) => [r.id, r.name])).toEqual(q(x, 300).map((r) => [r.id, r.name]));
    expect(q(SPAWN_X, 300)[0].name).toBe('家鄉林地'); expect(q(5, 300)[0].name).toBe('西岸沙灘');
    // 結構地區：在每份小屋 / 遺跡 / 沉船藍圖的中心查，id = gen2SiteRegionId(藍圖 id, 0)、反查得回藍圖、不在地塊地區範圍
    const bps = src.blueprints.overlapping(-30_000, 30_000).filter((b) => b.kind === 'cabin' || b.kind === 'ruin' || b.kind === 'shipwreck');
    expect(new Set(bps.map((b) => b.kind)).size).toBe(3);
    const siteIds = new Set<number>();
    for (const b of bps) {
      const r = q(b.x + (b.w >> 1), b.y + (b.h >> 1)).find((g) => g.cat === 'site' && g.x === b.x && g.y === b.y && g.w === b.w && g.h === b.h)!;
      expect(r.id).toBe(gen2SiteRegionId(b.id, 0)); expect(r.kind).toBe(b.kind);
      expect(siteOfRegionId(r.id)).toEqual({ sid: b.id, part: 0 }); expect(isGen2RegionId(r.id)).toBe(false);
      siteIds.add(r.id);
    }
    expect(siteIds.size).toBe(bps.length);
  }, 60_000);
  it('在淺層小屋裡 visit：先回小屋、再回所在地區；再 visit 不重複', () => {
    const cab = shallowCabin(src), d = new Discovery([]); d.setOuter(q);
    const got = d.visit(cab.x + 1, cab.y + 1);
    expect(got).toHaveLength(2); expect(got[0].kind).toBe('cabin'); expect(got[1].cat).toBe('land');
    expect(d.visit(cab.x + 1, cab.y + 1)).toEqual([]);
  });
  it('load 接受 gen2 地區 / 結構地區 id、丟掉範圍外的 id', () => {
    const site = gen2SiteRegionId(encodeStructureId(1, 8191, 31, 31, 4), 63);
    const d = new Discovery([]); d.load({ regions: [gen2RegionId(1, 2, 0, 0), site, 2 ** 33 - 1, 2 ** 33 + 2 ** 34, 2 ** 36] } as never);
    expect([...d.found]).toEqual([gen2RegionId(1, 2, 0, 0), site]);
  });
  it('霧竹大陸的地區名用霧竹命名池', () => {
    const m = [src.layout.landmass(1, 2), src.layout.landmass(-1, 2)].find((l) => l.culture === 'mistbamboo')!;
    for (const r of m.regions) { const n = q(r.x0 + 5, 300).at(-1)!.name; expect(CULTURES.mistbamboo.suffixes.some((s) => n.endsWith(s))).toBe(true); }
  });
  it('海與島的名字', () => {
    expect(q(4300, 300).at(-1)!.name).toBe('東方大海'); 
    // 西側第一道海：避開島的一欄（seed 'rg' 的 x = -300 落在島上）
    const w = src.layout.landmass(-1, 1), wx = w.x1 - 3;
    expect(w.islands.some((i) => wx >= i.x0 && wx < i.x1)).toBe(false);
    expect(q(wx, 300).at(-1)!.name).toBe('西方大海');
    const d = src.layout.landmass(1, 1).islands[0];
    expect(NAMES.island).toContain(q((d.x0 + d.x1) >> 1, 300).at(-1)!.name);
  });
});

// Task 16：烘焙世界把舊地區清單存成 RegionJSON（形狀取代 contains 函式），讀回後 contains 要逐格相同
describe('RegionJSON', { timeout: 120_000 }, () => {
  const L = new DelveGame({ seed: 'fixture-v11' });
  it('Region 經 RegionJSON 往返後 contains 相同', () => {
    expect(L.regions.length).toBeGreaterThan(30);
    expect(new Set(L.regions.map((r) => toRegionJSON(r).shape.t))).toEqual(new Set(['rect', 'ellipse', 'cols']));
    for (const r of L.regions) {
      const q = regionFromJSON(JSON.parse(JSON.stringify(toRegionJSON(r))), L.layers!, 1200);
      for (let x = 0; x < 4200; x += 13) for (let y = 0; y < 1200; y += 13) if (q.contains(x, y) !== r.contains(x, y)) throw new Error(`${r.id} @ ${x},${y}`);
      expect([q.id, q.name, q.x, q.y, q.w, q.h]).toEqual([r.id, r.name, r.x, r.y, r.w, r.h]);
      expect([q.cat, q.kind, q.ax, q.ay]).toEqual([r.cat, r.kind, r.ax, r.ay]);
    }
  });
  it('壞的 RegionJSON 丟 RangeError', () => {
    const j = toRegionJSON(L.regions[0]);
    for (const bad of [null, { ...j, shape: { t: 'blob' } }, { ...j, name: 3 }, { ...j, cat: 'x' }, { ...j, shape: { t: 'cols', top: 'zero', bot: 'zero' } }]) {
      expect(() => regionFromJSON(bad, L.layers!, 1200)).toThrow(RangeError);
    }
  });
});
