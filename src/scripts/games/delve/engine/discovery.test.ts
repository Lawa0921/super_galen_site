// discovery.test.ts — 地區 / 地標（由 worldgen 推導、依種子命名）、首次進入的發現、日誌統計、存檔 JSON
import { describe, it, expect } from 'vitest';
import { buildRegions, Discovery, CATEGORY_LABEL, ROOM_NAMES, GEN2_ROOM_NAMES, GEN2_NAMES_EXTRA, gen2NameList, outerRegions, gen2Regions, gen2RegionById, gen2HomeRegions, NAMES, gen2RegionId, isGen2RegionId, isOuterRegionId, regionFromJSON, toRegionJSON, type RegionSource, type Region, type JournalStats } from './discovery';
import { gen2SiteRegionId, isGen2SiteRegionId, siteOfRegionId, encodeStructureId } from './gen2/structId';
import { DelveGame } from './game';
import { Gen2Source } from './gen2';
import { homeContent } from './gen2/home';
import { slotOf, partsOf, type Blueprint } from './gen2/blueprint';
import { FILL_REACH } from './gen2/fill';
import { SPAWN_X } from './gen2/layout';
import { CULTURES } from './gen2/cultures';
import { LockTable } from './gen2/locks';
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
  it('open：讀檔保留還沒登錄的地標鍵；knowLandmark 之後才領得到', () => {
    const d = new Discovery([], { open: true });
    d.load({ regions: [], lore: [], treasures: [], depthRecord: 0, distance: 0, landmarks: [99_000_123] });
    expect([...d.landmarks]).toEqual([99_000_123]);
    expect(d.claimLandmark(99_000_123)).toBe(false); // 領過了
    expect(d.claimLandmark(5)).toBe(false);
    d.knowLandmark(5);
    expect(d.claimLandmark(5)).toBe(true);
    expect(d.claimLandmark(5)).toBe(false);
    expect(d.toJSON().landmarks).toEqual([5, 99_000_123]);
    const closed = new Discovery([]);
    closed.load({ regions: [], lore: [], treasures: [], depthRecord: 0, distance: 0, landmarks: [99_000_123] });
    expect(closed.landmarks.size).toBe(0);
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
      // 地塊地區（cat land）走 gen2RegionId，結構地區（site / cave / secret / dungeon——荒野大陸的小地城在 y 300 查得到，Task 18）走 gen2SiteRegionId
      expect(r.cat === 'land' ? isGen2RegionId(r.id) : isGen2SiteRegionId(r.id), `${r.cat} ${r.id}`).toBe(true); expect(isOuterRegionId(r.id)).toBe(false);
      if (seen.has(r.id)) expect(seen.get(r.id)).toBe(r.name); else seen.set(r.id, r.name);
    }
    for (let x = -30_000; x < 30_000; x += 977) expect(q2(x, 300).map((r) => [r.id, r.name])).toEqual(q(x, 300).map((r) => [r.id, r.name]));
    expect(q(SPAWN_X, 300)[0].name).toBe('家鄉林地'); expect(q(5, 300)[0].name).toBe('西岸沙灘');
    // 結構地區：在每份小屋 / 遺跡 / 沉船藍圖主體（部件 0；沒有部件 = 外框，Task 15）的中心查，id = gen2SiteRegionId(藍圖 id, 0)、反查得回藍圖、不在地塊地區範圍
    const bps = src.blueprints.overlapping(-30_000, 30_000).filter((b) => b.kind === 'cabin' || b.kind === 'ruin' || b.kind === 'shipwreck');
    expect(new Set(bps.map((b) => b.kind)).size).toBe(3);
    const siteIds = new Set<number>();
    for (const b of bps) {
      const p = partsOf(b)[0];
      const r = q(p.x + (p.w >> 1), p.y + (p.h >> 1)).find((g) => g.cat === 'site' && g.x === p.x && g.y === p.y && g.w === p.w && g.h === p.h)!;
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
  // v0 只有荒野（Task 18，Q14）：用鎖表鎖一片霧竹大陸（既有機制，存檔裡已存的文化照舊尊重）
  it('霧竹大陸的地區名用霧竹命名池（鎖表鎖住的霧竹大陸）', () => {
    const locks = new LockTable(); locks.lock(1, 2, { ver: 0, culture: 'mistbamboo' });
    const ms = new Gen2Source('rg', { locks }), mq = gen2Regions('rg', ms), m = ms.layout.landmass(1, 2);
    expect(m.culture).toBe('mistbamboo');
    for (const r of m.regions) { const n = mq(r.x0 + 5, 300).at(-1)!.name; expect(CULTURES.mistbamboo.suffixes.some((s) => n.endsWith(s))).toBe(true); }
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

// ── Task 15：gen2 地區涵蓋所有結構種類、已知地區表、id 反查 ──
/** OuterProfile('od') 下 outerRegions 回非空的一點（東境第一段陸地，OUTER_BEFORE[1]） */
const OUTER_PT: [number, number] = [4800, 300];
const totals = (s: JournalStats): [string, number][] => s.cats.map((c) => [c.cat, c.total]);
/** 地區去掉 contains（函式不能 deep-equal） */
const plain = (r: Region): Omit<Region, 'contains'> => { const { contains: _c, ...rest } = r; return rest; };
/** 會立地區的 gen2 藍圖種類（新錨點 alcove / molten_shrine / shaft_cache / spawn_tablet、箱子、熔岩池不立；荒野大陸的小地城 / 隱士小屋 Task 18 起立） */
const SITE_BP = new Set(['cabin', 'ruin', 'shipwreck', 'mineshaft', 'sky_island', 'lake', 'village', 'hall', 'dungeon', 'mushroom_biome', 'crystal_cave', 'hive', 'cave_lake', 'keep', 'hermit_hut']);

describe('gen2 地區：所有結構種類、已知地區表、id 反查', () => {
  const src = new Gen2Source('rg2'), q = gen2Regions('rg2', src), byId = gen2RegionById('rg2', src);
  it('所有 gen2 種類都有地區、id 唯一、可反查回同名同範圍', () => {
    const kinds = new Set<string>(), seen = new Map<number, string>();
    const check = (x: number, y: number): void => {
      for (const r of q(x, y)) {
        kinds.add(r.kind);
        if (seen.has(r.id)) expect(seen.get(r.id)).toBe(r.name); else seen.set(r.id, r.name);
        expect(byId(r.id)).toMatchObject({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h });
      }
    };
    for (let x = -20_000; x < 20_000; x += 7) for (const y of [300, 420, 700, 900]) check(x, y);
    // 固定 y 的格點掃不到淺的遺跡 / 村莊（y 約 302–337）與小密室：另外在每份藍圖主體、礦坑密室、地城房間的中心查（取自藍圖本身，不經地區程式）
    const mid = (b: { x: number; y: number; w: number; h: number }): void => check(b.x + (b.w >> 1), b.y + (b.h >> 1));
    for (const b of src.blueprints.overlapping(-20_000, 20_000)) {
      mid(partsOf(b)[0]);
      if (b.secret) mid(b.secret);
      if (b.site?.kind === 'dungeon') for (const r of b.site.info.rooms) mid(r);
    }
    for (const k of ['cabin', 'ruin', 'mineshaft', 'secret_room', 'sky_island', 'village', 'dwarf_hall', 'dungeon', 'mushroom_biome', 'crystal_cave', 'underground_lake']) expect(kinds, k).toContain(k);
    for (const k of ['shipwreck', 'pond', 'hive', 'dungeon_entry', 'hermit']) expect(kinds, k).toContain(k);
  }, 120_000);
  it('每份立地區的藍圖在主體中心與左右兩端查得到自己的地區；新錨點 / 箱子 / 熔岩池不立地區、查詢不丟錯', () => {
    const skipped = new Set<string>();
    for (const b of src.blueprints.overlapping(-20_000, 20_000)) {
      const own = (x: number, y: number): Region | undefined => q(x, y).find((r) => r.id === gen2SiteRegionId(b.id, 0));
      if (!SITE_BP.has(b.kind)) {
        skipped.add(b.kind);
        expect(byId(gen2SiteRegionId(b.id, 0)), b.kind).toBeNull();
        for (let x = b.x; x < b.x + b.w; x++) expect(q(x, b.y + (b.h >> 1)).every((r) => !isGen2SiteRegionId(r.id) || siteOfRegionId(r.id).sid !== b.id)).toBe(true);
        continue;
      }
      const r0 = byId(gen2SiteRegionId(b.id, 0))!;
      expect(r0, `${b.kind} ${b.id}`).not.toBeNull();
      const cy = r0.y + (r0.h >> 1);
      for (const x of [r0.x, r0.x + (r0.w >> 1), r0.x + r0.w - 1]) expect(own(x, cy), `${b.kind} ${b.id} @ ${x},${cy}`).toMatchObject(plain(r0));
    }
    for (const k of ['alcove', 'molten_shrine', 'shaft_cache', 'spawn_tablet']) expect(skipped, k).toContain(k);
  }, 60_000);
  it('外框伸出自己槽的結構（槽外 < FILL_REACH 欄）在槽外也查得到、反查相同（overlapping 多查 FILL_REACH）', () => {
    // 目前立地區的種類外框都在自己的槽內（8 個種子 ±30,000 實測 0 份），所以把一份小屋移到槽外，用 BlueprintIndex 的語意
    // （查詢範圍要碰到藍圖的槽、且碰到外框才回）包一個假的 blueprints：只查那一欄碰不到它的槽，多查 FILL_REACH 才碰得到
    const real = src.blueprints.overlapping(-20_000, 20_000).find((b) => b.kind === 'cabin' && !b.parts)!;
    const sl = slotOf(real.id, src.layout), moved: Blueprint = { ...real, x: sl.x1 + FILL_REACH - 1 - real.w };
    const overlapping = (x0: number, x1: number): Blueprint[] => (x0 < sl.x1 && x1 > sl.x0 && moved.x < x1 && moved.x + moved.w > x0 ? [moved] : []);
    const fake = Object.create(src, { blueprints: { value: { overlapping, groundAt: (x: number) => src.blueprints.groundAt(x), homePlans: () => [] } } }) as Gen2Source;
    const fq = gen2Regions('rg2', fake), fid = gen2RegionById('rg2', fake), x = moved.x + moved.w - 1, y = moved.y + (moved.h >> 1);
    expect(x).toBeGreaterThanOrEqual(sl.x1);
    expect(overlapping(x, x + 1)).toEqual([]);
    const r = fq(x, y).find((g) => g.id === gen2SiteRegionId(real.id, 0));
    expect(r).toMatchObject({ kind: 'cabin', cat: 'site', x: moved.x, y: moved.y, w: moved.w, h: moved.h });
    expect(plain(fid(r!.id)!)).toEqual(plain(r!));
  });
  it('密室（礦坑 part 1）與地城房間（part 1..）有自己的地區、在礦坑 / 地城之前回', () => {
    const shaft = src.blueprints.homePlans().find((b) => b.kind === 'mineshaft' && b.secret)!;
    const s = shaft.secret!, sec = q(s.x + (s.w >> 1), s.y + (s.h >> 1));
    expect(sec[0]).toMatchObject({ id: gen2SiteRegionId(shaft.id, 1), kind: 'secret_room', cat: 'secret', x: s.x, y: s.y, w: s.w, h: s.h });
    expect(sec.map((r) => r.id)).toContain(gen2SiteRegionId(shaft.id, 0));
    const dun = src.blueprints.homePlans().find((b) => b.kind === 'dungeon')!;
    const info = homeContent(src).dungeon!, entry = info.rooms[info.entryRoom];
    const at = q(entry.x + (entry.w >> 1), entry.y + (entry.h >> 1));
    expect(at[0]).toMatchObject({ kind: 'dungeon_entry', cat: 'dungeon', x: entry.x, y: entry.y, w: entry.w, h: entry.h });
    expect(siteOfRegionId(at[0].id)).toMatchObject({ sid: dun.id });
    expect(siteOfRegionId(at[0].id).part).toBeGreaterThan(0);
    expect(at.find((r) => r.kind === 'dungeon')).toMatchObject({ id: gen2SiteRegionId(dun.id, 0), cat: 'dungeon', ...info.bbox });
  });
  it('反查：不存在的 id → null（地塊地區 sub ≠ 0、沒有的地區 index、沒有的槽、範圍外）', () => {
    expect(byId(gen2RegionId(1, 2, 0, 1))).toBeNull();
    expect(byId(gen2RegionId(1, 2, 63, 0))).toBeNull();
    expect(byId(gen2SiteRegionId(encodeStructureId(1, 2, 31, 31, 0), 0))).toBeNull();
    expect(byId(5)).toBeNull(); expect(byId(-1)).toBeNull(); expect(byId(2 ** 40)).toBeNull();
  });
  it('Discovery（gen2，trackOuter）：visit 之後 listKnown 有它；讀檔後 listKnown 與各類別總數完全相同', () => {
    const d = new Discovery([], { open: true, trackOuter: true }); d.setOuter(q); d.setResolver(byId);
    const r = q(SPAWN_X, 300).at(-1)!; d.visit(SPAWN_X, 300);
    expect(d.listKnown().map((k) => k.id)).toContain(r.id);
    const j = d.toJSON(), d2 = new Discovery([], { open: true, trackOuter: true }); d2.setResolver(byId); d2.load(j);
    expect(d2.region(r.id)!.name).toBe(r.name);
    expect(d2.listKnown().map((k) => k.id)).toEqual(d.listKnown().map((k) => k.id));
    expect(d2.stats()).toEqual(d.stats());
  });
  it('know：同 id 不重複；region 依序查中央 → 已知表 → resolver；resolver 查到的不進已知表', () => {
    const home = gen2HomeRegions('rg2', src), d = new Discovery([], { open: true, trackOuter: true });
    d.know(home); d.know(home.slice(0, 3));
    expect(d.listKnown().map((r) => r.id)).toEqual(home.map((r) => r.id));
    expect(d.region(home[0].id)).toBe(home[0]);
    const far = q(-15_000, 300).at(-1)!;
    expect(d.region(far.id)).toBeNull();
    d.setResolver(byId);
    expect(d.region(far.id)).toMatchObject({ id: far.id, name: far.name });
    expect(d.listKnown()).toHaveLength(home.length);
    // 已知表內的類別總數 = stats 的總數
    const site = d.stats().cats.find((c) => c.cat === 'site')!;
    expect(site.total).toBe(home.filter((r) => r.cat === 'site').length);
  });
  it('trackOuter 邊界：舊形狀存檔（沒有 known、found 裡有外圍地區）visit 後補進已知表；known 裡反查不到的 id 丟掉、不丟錯', () => {
    const far = q(-15_000, 300).at(-1)!, home = gen2HomeRegions('rg2', src), homeIds = home.map((r) => r.id);
    const mk = (): Discovery => { const d = new Discovery([], { open: true, trackOuter: true }); d.setOuter(q); d.setResolver(byId); d.know(home); return d; };
    expect(homeIds).not.toContain(far.id);
    // 舊形狀（Task 15 之前的 gen2 存檔）：外圍地區已經 found、但沒有 known 欄位
    const d = mk();
    d.load({ regions: [far.id], lore: [], treasures: [], depthRecord: 0, distance: 0 });
    expect(d.isFound(far.id)).toBe(true);
    expect(d.listKnown().map((r) => r.id)).not.toContain(far.id);
    expect(d.visit(-15_000, 300).map((r) => r.id)).not.toContain(far.id); // 已經 found：不再跳發現
    expect(d.listKnown().map((r) => r.id)).toContain(far.id);
    expect(d.toJSON().known).toEqual([far.id]);
    // known 裡有反查不到的 id（沒有的地區 index、解不開的槽、非 gen2 id、壞值）：丟掉、不丟錯，反查得到的照常加回
    const noRegion = gen2RegionId(1, 2, 63, 0), noSlot = gen2SiteRegionId(encodeStructureId(1, 2, 31, 31, 0), 0);
    expect(byId(noRegion)).toBeNull(); expect(byId(noSlot)).toBeNull();
    const d2 = mk();
    expect(() => d2.load({ regions: [], lore: [], treasures: [], depthRecord: 0, distance: 0, known: [noRegion, noSlot, far.id, 7, -1, 'x'] } as never)).not.toThrow();
    expect(d2.listKnown().map((r) => r.id)).toEqual([...homeIds, far.id].sort((a, b) => a - b));
    expect(d2.toJSON().known).toEqual([far.id]);
  });
  it('舊世界（沒有 trackOuter）：visit v1 外圍地區不改 listKnown 與日誌總數，讀檔前後相同（Q12）', () => {
    const regs = buildRegions(source()), f = outerRegions('od', profile), d = new Discovery(regs); d.setOuter(f); const before = d.stats();
    const [ox, oy] = OUTER_PT; expect(f(ox, oy).length).toBeGreaterThan(0); d.visit(ox, oy);
    expect(d.listKnown()).toHaveLength(regs.length); expect(totals(d.stats())).toEqual(totals(before));
    expect(d.toJSON()).not.toHaveProperty('known');
    const d2 = new Discovery(regs); d2.setOuter(f); d2.load(d.toJSON()); expect(totals(d2.stats())).toEqual(totals(before));
  });
  it('主機 / 客人：兩個獨立 Gen2Source 建出的家鄉已知表 deep-equal；gen2RegionById 與 gen2Regions 對同種子一致', () => {
    const other = new Gen2Source('rg2'), a = gen2HomeRegions('rg2', src), b = gen2HomeRegions('rg2', other);
    expect(a.length).toBeGreaterThan(20);
    expect(b.map(plain)).toEqual(a.map(plain));
    const byId2 = gen2RegionById('rg2', other);
    for (const r of a) {
      expect(plain(byId2(r.id)!)).toEqual(plain(r));
      const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
      expect(byId2(r.id)!.contains(cx, cy)).toBe(r.contains(cx, cy));
    }
  });
  it('gen2 遊戲開局：家鄉每座村莊 / 地廳 / 地城都在 listKnown，日誌 site 類別總數 ≥ 村莊數 + 地廳數', () => {
    const g = new DelveGame({ seed: 'rg2', worldGen: { kind: 'gen2' } }), hc = homeContent(new Gen2Source('rg2'));
    const k = g.discovery.listKnown(), n = (kind: string): number => k.filter((r) => r.kind === kind).length;
    expect(hc.villages.length).toBeGreaterThan(0);
    expect(n('village')).toBe(hc.villages.length);
    expect(hc.halls.length).toBeGreaterThan(0);
    expect(n('dwarf_hall')).toBe(hc.halls.length);
    expect(n('dungeon')).toBe(1);
    expect(g.discovery.stats().cats.find((c) => c.cat === 'site')!.total).toBeGreaterThanOrEqual(hc.villages.length + hc.halls.length);
    expect(k.map((r) => r.id)).toEqual(gen2HomeRegions('rg2', new Gen2Source('rg2')).map((r) => r.id));
  }, 60_000);
});

// ── Task 17b：gen2 名字唯一（家鄉同 kind、同一座地城的房間）、三條路一致、村莊走近就發現 ──
/** 同一組（key）裡不同 id 卻同名的組 → 「組鍵|名字×id 數」 */
const dupGroups = (rs: readonly Region[], key: (r: Region) => string): string[] => {
  const by = new Map<string, Set<number>>();
  for (const r of rs) {
    const k = `${key(r)}|${r.name}`;
    let s = by.get(k);
    if (!s) { s = new Set(); by.set(k, s); }
    s.add(r.id);
  }
  return [...by].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}×${s.size}`);
};
/** 一座地城（藍圖 id）的房間地區：part 1.. 連號，反查到 null 為止 */
const roomsOf = (byId: (id: number) => Region | null, sid: number): Region[] => {
  const out: Region[] = [];
  for (let p = 1; p < 64; p++) { const r = byId(gen2SiteRegionId(sid, p)); if (!r) break; out.push(r); }
  return out;
};
/** gen2 地塊地區的固定名字（不從名單挑） */
const FIXED_NAMES = new Set(['西岸沙灘', '東岸沙灘', '家鄉林地']);
/** 同 Task 16 量測用的 50 個種子 */
const DUP_SEEDS = Array.from({ length: 50 }, (_, i) => `dup-${i}`);

describe('gen2 名字唯一、三條路一致、村莊走近就發現（Task 17b）', () => {
  it('50 個種子：家鄉同 kind（也同 cat）沒有同名；家鄉地城的房間沒有同名', () => {
    const byKind: string[] = [], byCat: string[] = [], rooms: string[] = [], suffixed: string[] = [];
    for (const seed of DUP_SEEDS) {
      const src = new Gen2Source(seed), home = gen2HomeRegions(seed, src), byId = gen2RegionById(seed, src);
      // 後綴（「…二」）= 名字不在該 kind 的 gen2 名單裡（固定名字除外）；補了 gen2 名單之後 50 個種子一次都不該用到
      for (const r of home) { const l = gen2NameList(r.kind); if (l && !FIXED_NAMES.has(r.name) && !l.includes(r.name)) suffixed.push(`${seed} ${r.kind} ${r.name}`); }
      byKind.push(...dupGroups(home, (r) => r.kind).map((g) => `${seed} ${g}`));
      byCat.push(...dupGroups(home, (r) => r.cat).map((g) => `${seed} ${g}`));
      const dun = src.blueprints.homePlans().filter((b) => b.kind === 'dungeon');
      expect(dun.length, seed).toBe(1);
      for (const d of dun) {
        const rs = roomsOf(byId, d.id);
        expect(rs.length, seed).toBeGreaterThan(3);
        // 房間地區也都在家鄉已知表裡（同一份）
        for (const r of rs) expect(home.find((h) => h.id === r.id)?.name).toBe(r.name);
        rooms.push(...dupGroups(rs, () => 'room').map((g) => `${seed} ${g}`));
      }
    }
    expect.soft(byKind.length, `同 kind 同名 ${byKind.length} 組：${byKind.slice(0, 12).join('、')}`).toBe(0);
    expect.soft(byCat.length, `同 cat 同名 ${byCat.length} 組：${byCat.slice(0, 12).join('、')}`).toBe(0);
    expect.soft(suffixed.length, `用到後綴 ${suffixed.length} 次：${suffixed.slice(0, 12).join('、')}`).toBe(0);
    expect(rooms.length, `同地城房間同名 ${rooms.length} 組：${rooms.slice(0, 12).join('、')}`).toBe(0);
  }, 300_000);
  it('gen2 名單：各房間種類的名單（ROOM_NAMES + gen2 補充）兩兩不重疊（「整座地城唯一」的前提）、ROOM_NAMES 是 gen2 名單的開頭；補充名字不在任何 NAMES 名單裡、自己不重複', () => {
    const kinds = Object.keys(GEN2_ROOM_NAMES) as (keyof typeof GEN2_ROOM_NAMES)[];
    expect(kinds.sort()).toEqual((Object.keys(ROOM_NAMES) as string[]).sort());
    const seen = new Map<string, string>();
    for (const k of kinds) {
      const l = GEN2_ROOM_NAMES[k]!;
      expect(l.slice(0, ROOM_NAMES[k]!.length), k).toEqual(ROOM_NAMES[k]);
      expect(gen2NameList(`dungeon_${k}`), k).toEqual(l);
      for (const n of l) { expect(seen.get(n), `${k} ${n}`).toBeUndefined(); seen.set(n, k); }
    }
    const all = new Set(Object.values(NAMES).flat());
    for (const [k, extra] of Object.entries(GEN2_NAMES_EXTRA)) {
      expect(new Set(extra).size, k).toBe(extra!.length);
      for (const n of extra!) { expect(all.has(n), `${k} ${n}`).toBe(false); expect(seen.has(n), `${k} ${n}`).toBe(false); }
      expect(gen2NameList(k), k).toEqual([...NAMES[k], ...extra!]);
    }
    // 沒補的 kind 就是原名單；不是 gen2 會用名單的 kind → null
    expect(gen2NameList('cabin')).toEqual(NAMES.cabin);
    expect(gen2NameList('no_such_kind')).toBeNull();
  });
  it('家鄉地城（overlapping ±20,000 掃到的地城；目前 gen2 只有家鄉有地城，外圍地城的整合測試在 Task 18）的房間沒有同名', () => {
    for (const seed of ['rg2', 'dup-7']) {
      const src = new Gen2Source(seed), byId = gen2RegionById(seed, src);
      const dun = src.blueprints.overlapping(-20_000, 20_000).filter((b) => b.kind === 'dungeon');
      expect(dun.length).toBeGreaterThan(0);
      for (const d of dun) expect(dupGroups(roomsOf(byId, d.id), () => 'room'), `${seed} ${d.id}`).toEqual([]);
    }
  }, 120_000);
  it('同一 id 三條路同名、兩實例同名、與查詢順序無關（家鄉全部 + 外圍抽樣 ≥ 200 個 id）', () => {
    let outerN = 0;
    for (const seed of ['rg2', 'dup-3', 'dup-17']) {
      const a = new Gen2Source(seed), b = new Gen2Source(seed);
      const qa = gen2Regions(seed, a), ia = gen2RegionById(seed, a);
      const h = a.layout.origin.home!;
      // 實例 a：先在家鄉逐點查（家鄉名字表在查詢裡第一次建）、再掃外圍、最後才 gen2HomeRegions；實例 b：先 gen2HomeRegions
      const firstA = new Map<number, string>();
      for (let x = h.x0; x < h.x1; x += 97) for (const y of [300, 420, 700]) for (const r of qa(x, y)) if (!firstA.has(r.id)) firstA.set(r.id, r.name);
      const outer = new Map<number, { x: number; y: number; name: string }>();
      for (let x = -25_000; x < 25_000; x += 41) {
        if (x >= h.x0 - 64 && x < h.x1 + 64) continue;
        for (const y of [300, 420, 700, 900]) for (const r of qa(x, y)) if (!outer.has(r.id)) outer.set(r.id, { x, y, name: r.name });
      }
      const homeB = gen2HomeRegions(seed, b), qb = gen2Regions(seed, b), ib = gen2RegionById(seed, b);
      const homeA = gen2HomeRegions(seed, a);
      expect(homeA.map(plain)).toEqual(homeB.map(plain));
      for (const [id, name] of firstA) expect(homeA.find((r) => r.id === id)?.name, `${seed} ${id}`).toBe(name);
      for (const r of homeA) {
        expect(ia(r.id)?.name).toBe(r.name); expect(ib(r.id)?.name).toBe(r.name);
        expect(qa(r.ax, r.ay).find((g) => g.id === r.id)?.name, `${seed} ${r.kind} ${r.id}`).toBe(r.name);
        expect(qb(r.ax, r.ay).find((g) => g.id === r.id)?.name, `${seed} ${r.kind} ${r.id}`).toBe(r.name);
      }
      for (const [id, o] of outer) {
        expect(ia(id)?.name, `${seed} ${id}`).toBe(o.name); expect(ib(id)?.name, `${seed} ${id}`).toBe(o.name);
        expect(qb(o.x, o.y).find((g) => g.id === id)?.name).toBe(o.name);
      }
      outerN += outer.size;
    }
    expect(outerN).toBeGreaterThanOrEqual(200);
  }, 300_000);
  it('gen2 村莊：主體外左右 ≤ 22 格、上方 ≤ 10 格 visit 就發現，以外不會；地圖錨點仍在主體中心、外擴區的 HUD 地名是村名（同舊世界）', () => {
    let n = 0;
    for (const seed of ['rg2', 'dup-1', 'dup-2']) {
      const src = new Gen2Source(seed), q = gen2Regions(seed, src), home = gen2HomeRegions(seed, src);
      for (const b of src.blueprints.homePlans().filter((p) => p.kind === 'village')) {
        const body = partsOf(b)[0], id = gen2SiteRegionId(b.id, 0), r = home.find((g) => g.id === id)!;
        expect(r).toMatchObject({ kind: 'village', x: body.x - 22, y: body.y - 10, w: body.w + 44, h: body.h + 10, ax: body.x + (body.w >> 1), ay: body.y + (body.h >> 1) });
        const mk = (): Discovery => { const d = new Discovery([], { open: true, trackOuter: true }); d.setOuter(q); d.know(home); return d; };
        const hit = (x: number, y: number): boolean => mk().visit(x, y).some((g) => g.id === id);
        const gy = body.y + body.h - 1, cx = body.x + (body.w >> 1);
        expect(hit(body.x - 22, gy), `${seed} 左外擴`).toBe(true);
        expect(hit(body.x + body.w + 21, gy), `${seed} 右外擴`).toBe(true);
        expect(hit(cx, body.y - 10), `${seed} 上外擴`).toBe(true);
        expect(hit(body.x - 23, gy), `${seed} 左外擴之外`).toBe(false);
        expect(hit(body.x + body.w + 22, gy), `${seed} 右外擴之外`).toBe(false);
        expect(hit(cx, body.y - 11), `${seed} 上外擴之外`).toBe(false);
        expect(hit(cx, body.y + body.h), `${seed} 下方不外擴`).toBe(false);
        const d = mk(); d.visit(body.x - 22, gy);
        expect(d.areaAt(body.x - 22, gy)?.id).toBe(id);
        expect(gen2RegionById(seed, src)(id)).toMatchObject(plain(r));
        n++;
      }
    }
    expect(n).toBeGreaterThan(3);
  }, 120_000);
  it('舊世界村莊的地區 = 結構框左右各外擴 22 格、上方 10 格，錨點在結構中心（基準：gen2 比照的就是這個）', () => {
    const s = source();
    const rs = buildRegions({ ...s, structures: [...s.structures, { kind: 'village', x: 100, y: 30, w: 70, h: 30 }] });
    expect(rs.find((r) => r.kind === 'village')).toMatchObject({ x: 78, y: 20, w: 114, h: 40, ax: 135, ay: 45 });
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
