// layout.ts — gen2 版面：家鄉 + 每側（東 / 西）海與大陸交替的地塊序列，含地區、島、海面槽位、文化與 tier。
// 純函式式：(seed, origin, locks, latestVer) 決定一切；每側地塊邊界用前綴和惰性延伸並快取，landmassAt 二分搜尋，延伸到 ±X_LIMIT 為止。
// 海與島的 RegionInfo、海面槽位清單由這裡產生（裁決 P12，唯一擁有者）；後續模組只讀不造。
// 版面輸出是凍結對象（M2 起不得改）：新規則寫 if (ver >= N) 分支，ver 取自該地塊的鎖（沒鎖用 latestVer）。
import { hash2, seedInt } from '../noise';
import { X_LIMIT } from '../coords';
import { BIOME } from '../world';
import type { CultureId, RegionInfo, RegionKind, Side } from '../regionInfo';
import type { LockTable } from './locks';
import { poolFor } from './cultures';

export const HOME_X0 = 0, HOME_X1 = 4200, SPAWN_X = 2100, SEA_SLOT_W = 300;
// 海點（島 / 沉船 / 漂流箱）離槽中央的偏移上限：± min(SEA_JITTER, floor(槽寬 / 10))（M2a Task 19：M1 的 ± 槽寬 / 10 可達 30，
// 相鄰兩槽的點最大空隙 357 > 340；收到 20 後海上「任意連續 340 格內至少一個值得停下的東西」嚴格成立，Task 21）
export const SEA_JITTER = 20;
export const seaJitter = (slotW: number): number => Math.min(SEA_JITTER, Math.floor(slotW / 10));
export const VARIANT = { PLAIN: 0, HILLS: 1, HIGH: 2, BEACH: 3, SPAWN: 4, ISLAND: 5, SEA: 6, DUNGEON: 7 } as const;

export interface SideOrigin { x: number; start: 'sea' | 'continent'; seaY: number; shore: number }
export interface LayoutOrigin { home: { x0: number; x1: number } | null; east: SideOrigin; west: SideOrigin }
// 島的種類（M2a Task 20，spec §8）：plain = 只有地形與樹；其他三種有一份表層藍圖（structures/island.ts）
export type IslandType = 'plain' | 'lighthouse' | 'hermit' | 'wreck';
export interface IslandInfo { x0: number; x1: number; slot: number; type: IslandType }
export interface SeaSlot { k: number; x0: number; x1: number; poi: 'island' | 'shipwreck' | 'crate' | 'reef' | 'sea_ruin' }
export interface Landmass {
  side: Side; i: number; kind: 'home' | 'continent' | 'sea';
  x0: number; x1: number; tier: number; culture: CultureId | null; ver: number;
  regions: RegionInfo[]; islands: IslandInfo[]; slots: SeaSlot[];
}

// 新世界：家鄉 [0, 4200)，兩側都從海開始
export function newWorldOrigin(seaY: number, shore: number): LayoutOrigin {
  return { home: { x0: HOME_X0, x1: HOME_X1 }, east: { x: HOME_X1, start: 'sea', seaY, shore }, west: { x: HOME_X0, start: 'sea', seaY, shore } };
}

// 家鄉版面（相對 home.x0）
const BEACH_W = 70, SPAWN_X0 = 1680, SPAWN_X1 = 2520, DESERT_GAP = 84, DUNGEON_W = 420;
// 大陸
const REGION_MIN = 700, REGION_MAX = 1500, CONT_MIN = 2400, CONT_MAX = 5200;
// 海
const SEA_MIN = 480, SEA_FIRST_MAX = 700, SEA_MAX = 1200;
const ISLAND_MIN = 40, ISLAND_MAX = 160;
// 有建物的島的三種（依雜湊均分）；第一座以外的島有建物的機率
const BUILT_ISLANDS = ['lighthouse', 'hermit', 'wreck'] as const, ISLAND_BUILT_P = 0.4;
// 非島槽的點：依序累加（沉船 30% / 漂流箱 30% / 珊瑚礁 20% / 海底遺跡 20%，Task 20）
const SEA_POI: readonly (readonly [number, Exclude<SeaSlot['poi'], 'island'>])[] = [[0.3, 'shipwreck'], [0.6, 'crate'], [0.8, 'reef'], [1, 'sea_ruin']];
const seaPoi = (h: number): Exclude<SeaSlot['poi'], 'island'> => { for (const [p, t] of SEA_POI) if (h < p) return t; return 'sea_ruin'; };
const BASIC_BIOMES = [BIOME.FOREST, BIOME.DESERT, BIOME.SNOW, BIOME.JUNGLE] as const;
const LAND_VARIANTS = [VARIANT.PLAIN, VARIANT.HILLS, VARIANT.HIGH] as const;
const HOME_VARIANTS = [VARIANT.PLAIN, VARIANT.HILLS] as const;

// h ∈ [0,1) → [lo, hi] 的整數（含兩端）
const pick = (h: number, lo: number, hi: number): number => lo + Math.floor(h * (hi - lo + 1));

interface SideSeeds { sea: number; isle: number; isw: number; iso: number; ity: number; poi: number; cont: number; cut: number; biome: number; variant: number; culture: number }

interface SideState {
  dir: 1 | -1;
  o: SideOrigin;
  s: SideSeeds;
  // edges[0] = 原點；地塊 i 佔 edges[i-1]..edges[i]（東側遞增、西側遞減）
  edges: number[];
  lands: Landmass[];
  seas: number;
  continents: number;
  // 上一片大陸的文化（undefined = 還沒有大陸）
  prevCulture: CultureId | null | undefined;
}

export class Layout {
  private readonly east: SideState;
  private readonly west: SideState;
  private readonly home: Landmass | null;

  constructor(seed: string, readonly origin: LayoutOrigin, private readonly locks: LockTable, private readonly latestVer: number) {
    const seeds = (t: string): SideSeeds => {
      const n = (name: string): number => seedInt(seed, `g2-${t}-${name}`);
      return { sea: n('sea'), isle: n('isle'), isw: n('isw'), iso: n('iso'), ity: n('ity'), poi: n('poi'), cont: n('cont'), cut: n('cut'), biome: n('biome'), variant: n('variant'), culture: n('culture') };
    };
    const side = (dir: 1 | -1, o: SideOrigin, t: string): SideState =>
      ({ dir, o, s: seeds(t), edges: [o.x], lands: [], seas: 0, continents: 0, prevCulture: undefined });
    this.east = side(1, origin.east, 'e');
    this.west = side(-1, origin.west, 'w');
    this.home = origin.home ? this.buildHome(seedInt(seed, 'g2-home'), origin.home.x0, origin.home.x1) : null;
  }

  // null = 不屬 gen2（烘焙世界的舊範圍，或超出 ±X_LIMIT）
  landmassAt(x: number): Landmass | null {
    if (x < -X_LIMIT || x >= X_LIMIT) return null;
    if (x >= this.east.o.x) {
      const st = this.east;
      while (st.edges[st.edges.length - 1] <= x) this.extend(st);
      let lo = 1, hi = st.edges.length - 1; // 最小的 j 使 edges[j] > x
      while (lo < hi) { const mid = (lo + hi) >> 1; if (st.edges[mid] > x) hi = mid; else lo = mid + 1; }
      return st.lands[lo - 1];
    }
    if (x < this.west.o.x) {
      const st = this.west;
      while (st.edges[st.edges.length - 1] > x) this.extend(st);
      let lo = 1, hi = st.edges.length - 1; // 最小的 j 使 edges[j] ≤ x
      while (lo < hi) { const mid = (lo + hi) >> 1; if (st.edges[mid] <= x) hi = mid; else lo = mid + 1; }
      return st.lands[lo - 1];
    }
    const h = this.home;
    return h && x >= h.x0 && x < h.x1 ? h : null;
  }

  // 某側第 i 片地塊（i 從 1 起）
  landmass(side: 1 | -1, i: number): Landmass {
    if (!Number.isInteger(i) || i < 1) throw new RangeError(`landmass index ${i}`);
    const st = side === 1 ? this.east : this.west;
    while (st.lands.length < i) this.extend(st);
    return st.lands[i - 1];
  }

  regionAt(x: number): RegionInfo | null {
    const m = this.landmassAt(x);
    if (!m) return null;
    if (m.kind === 'sea') {
      for (let j = 1; j < m.regions.length; j++) { const r = m.regions[j]; if (x >= r.x0 && x < r.x1) return r; }
      return m.regions[0];
    }
    for (const r of m.regions) if (x >= r.x0 && x < r.x1) return r;
    return null;
  }

  // ── 延伸 ──

  private extend(st: SideState): void {
    const i = st.lands.length + 1;
    const odd = i % 2 === 1;
    const isSea = st.o.start === 'sea' ? odd : !odd;
    const lock = this.locks.get(st.dir, i);
    const ver = lock ? lock.ver : this.latestVer;
    const m = isSea ? this.buildSea(st, i, ver) : this.buildContinent(st, i, ver, lock ? lock.culture : undefined);
    st.lands.push(m);
    st.edges.push(st.dir === 1 ? m.x1 : m.x0);
  }

  // 寬 w 的地塊從目前邊緣往外放
  private span(st: SideState, w: number): { x0: number; x1: number } {
    const e = st.edges[st.edges.length - 1];
    return st.dir === 1 ? { x0: e, x1: e + w } : { x0: e - w, x1: e };
  }

  private buildSea(st: SideState, i: number, ver: number): Landmass {
    // ver 0 的規則
    const s = st.s, k = ++st.seas;
    const w = pick(hash2(i, 0, s.sea), SEA_MIN, k === 1 ? SEA_FIRST_MAX : Math.min(SEA_MAX, SEA_FIRST_MAX + 100 * (k - 1)));
    const { x0, x1 } = this.span(st, w);
    const tier = st.continents + 1;

    // 槽位：ceil(w / 300) 個，均分（每槽 ceil(w / n)，最後一槽吃餘數）；非島槽的點依 hash2(i, q, poi) 擲 SEA_POI（Task 20）
    const n = Math.floor((w + SEA_SLOT_W - 1) / SEA_SLOT_W), base = Math.floor((w + n - 1) / n);
    const slots: SeaSlot[] = [];
    for (let q = 0; q < n; q++) {
      const a = x0 + q * base;
      slots.push({ k: q, x0: a, x1: q < n - 1 ? a + base : x1, poi: seaPoi(hash2(i, q, s.poi)) });
    }

    // 島：1–min(3, n) 座，各佔不同槽（部分 Fisher–Yates），依槽序排
    const count = pick(hash2(i, 1, s.sea), 1, Math.min(3, n));
    const order = slots.map((_, q) => q);
    for (let j = 0; j < count; j++) {
      const r = j + Math.floor(hash2(i, j, s.isle) * (n - j));
      const t = order[j]; order[j] = order[r]; order[r] = t;
    }
    // 種類（Task 20，spec §8）：依槽序的第一座島一定有建物（三種依 hash2(i, q, ity) 均分），其餘 ISLAND_BUILT_P 有建物（同一個雜湊值）、其他 plain
    const chosen = order.slice(0, count).sort((a, b) => a - b);
    const islands: IslandInfo[] = chosen.map((q, j) => {
      const sl = slots[q], sw = sl.x1 - sl.x0, d = seaJitter(sw);
      const iw = pick(hash2(i, q, s.isw), ISLAND_MIN, Math.min(ISLAND_MAX, sw - 80));
      const c = sl.x0 + (sw >> 1) + pick(hash2(i, q, s.iso), -d, d);
      sl.poi = 'island';
      const a = c - (iw >> 1), h = hash2(i, q, s.ity);
      const type: IslandType = j === 0 ? BUILT_ISLANDS[Math.floor(h * 3)] : h < ISLAND_BUILT_P ? BUILT_ISLANDS[Math.min(2, Math.floor((h * 3) / ISLAND_BUILT_P))] : 'plain';
      return { x0: a, x1: a + iw, slot: q, type };
    });

    const reg = (kind: RegionKind, variant: number, biome: number, index: number, a: number, b: number): RegionInfo =>
      ({ landmass: i, side: st.dir, tier, kind, culture: null, variant, biome, index, x0: a, x1: b });
    const regions = [reg('sea', VARIANT.SEA, BIOME.OCEAN, 0, x0, x1), ...islands.map((d, j) => reg('island', VARIANT.ISLAND, BIOME.FOREST, j + 1, d.x0, d.x1))];
    return { side: st.dir, i, kind: 'sea', x0, x1, tier, culture: null, ver, regions, islands, slots };
  }

  private buildContinent(st: SideState, i: number, ver: number, locked: CultureId | null | undefined): Landmass {
    // ver 0 的規則
    const s = st.s, c = ++st.continents;
    const n = pick(hash2(i, 0, s.cont), 2, 4);
    const total = pick(hash2(i, 1, s.cont), Math.max(CONT_MIN, REGION_MIN * n), Math.min(CONT_MAX, REGION_MAX * n));
    const { x0, x1 } = this.span(st, total);

    // 文化：鎖表存的照舊；其餘從文化池挑（M2a Task 18 刪掉「第一片東 / 西大陸恰一片霧竹」的規則，Q14：v0 的池只有荒野）
    let culture: CultureId | null;
    if (locked !== undefined) culture = locked;
    else {
      const pool = poolFor(ver), cand = pool.filter((p) => p !== st.prevCulture);
      culture = cand.length ? cand[Math.floor(hash2(i, 0, s.culture) * cand.length)] : pool[0];
    }
    st.prevCulture = culture;

    const kind: RegionKind = culture ? 'culture' : 'wild';
    const regions: RegionInfo[] = [];
    let a = x0, rest = total, bi = -1;
    for (let k = 0; k < n; k++) {
      const left = n - k - 1;
      const w = left === 0 ? rest
        : pick(hash2(i, k, s.cut), Math.max(REGION_MIN, rest - REGION_MAX * left), Math.min(REGION_MAX, rest - REGION_MIN * left));
      const hb = hash2(i, k, s.biome);
      bi = bi < 0 ? Math.floor(hb * 4) : (bi + 1 + Math.floor(hb * 3)) % 4;
      const variant = LAND_VARIANTS[Math.floor(hash2(i, k, s.variant) * 3)];
      regions.push({ landmass: i, side: st.dir, tier: c, kind, culture, variant, biome: BASIC_BIOMES[bi], index: k, x0: a, x1: a + w });
      a += w; rest -= w;
    }
    return { side: st.dir, i, kind: 'continent', x0, x1, tier: c, culture, ver, regions, islands: [], slots: [] };
  }

  // ── 家鄉 ──

  // 兩端各 70 格海灘；出生森林 [1680, 2520)；h(9) < 0.5 的那一側（西 / 東）海灘內側是 420 寬的地城區（FOREST、VARIANT.DUNGEON，[70, 490) 或 [3710, 4130)）；
  // 一側外圍雪原（420–546）、另一側叢林（504–630），緊貼海灘（地城側緊貼地城區）往內排；
  // 沙漠（315–420）隨機在一側，與該側外圍、與出生森林之間都至少 84 格森林（家鄉除海灘外每個地區 ≥ 84 寬）；
  // 擲到地城側但放不下（外圍寬 + 84 + 沙漠寬 + 84 > 1680 − 70 − 420）就改放另一側；其餘補森林（PLAIN / HILLS）。
  private buildHome(hs: number, hx0: number, hx1: number): Landmass {
    const h = (k: number): number => hash2(0, k, hs);
    const hv = (k: number): number => HOME_VARIANTS[Math.floor(h(k) * 2)];
    const snowWest = h(0) < 0.5;
    const snowW = pick(h(1), 420, 546), jungleW = pick(h(2), 504, 630);
    const wo = snowWest ? snowW : jungleW, eo = snowWest ? jungleW : snowW;
    const dungeonWest = h(9) < 0.5, dw = pick(h(4), 315, 420);
    const bW = hx0 + BEACH_W, bE = hx1 - BEACH_W;
    // 外圍生態的內側起點（地城側再往內 420）
    const wIn = bW + (dungeonWest ? DUNGEON_W : 0), eIn = bE - (dungeonWest ? 0 : DUNGEON_W);
    let desertWest = h(3) < 0.5;
    if (desertWest === dungeonWest && (desertWest ? wo : eo) + DESERT_GAP + dw + DESERT_GAP > SPAWN_X0 - BEACH_W - DUNGEON_W) desertWest = !desertWest;

    type Seg = [x0: number, x1: number, biome: number, variant: number];
    const fixed: Seg[] = [
      [hx0, bW, BIOME.FOREST, VARIANT.BEACH],
      dungeonWest ? [bW, wIn, BIOME.FOREST, VARIANT.DUNGEON] : [eIn, bE, BIOME.FOREST, VARIANT.DUNGEON],
      [wIn, wIn + wo, snowWest ? BIOME.SNOW : BIOME.JUNGLE, hv(6)],
      [hx0 + SPAWN_X0, hx0 + SPAWN_X1, BIOME.FOREST, VARIANT.SPAWN],
      [eIn - eo, eIn, snowWest ? BIOME.JUNGLE : BIOME.SNOW, hv(7)],
      [bE, hx1, BIOME.FOREST, VARIANT.BEACH],
    ];
    if (desertWest) {
      const d0 = pick(h(5), wIn + wo + DESERT_GAP, hx0 + SPAWN_X0 - dw - DESERT_GAP);
      fixed.push([d0, d0 + dw, BIOME.DESERT, hv(8)]);
    } else {
      const d1 = pick(h(5), hx0 + SPAWN_X1 + dw + DESERT_GAP, eIn - eo - DESERT_GAP);
      fixed.push([d1 - dw, d1, BIOME.DESERT, hv(8)]);
    }
    fixed.sort((p, q) => p[0] - q[0]);

    const segs: Seg[] = [];
    let a = hx0;
    for (const f of fixed) {
      if (f[0] > a) segs.push([a, f[0], BIOME.FOREST, hv(20 + segs.length)]);
      segs.push(f); a = f[1];
    }
    const regions: RegionInfo[] = segs.map(([x0, x1, biome, variant], index) =>
      ({ landmass: 0, side: 0, tier: 0, kind: 'home', culture: null, variant, biome, index, x0, x1 }));
    const lock = this.locks.get(0, 0);
    return { side: 0, i: 0, kind: 'home', x0: hx0, x1: hx1, tier: 0, culture: null, ver: lock ? lock.ver : this.latestVer, regions, islands: [], slots: [] };
  }
}

// 家鄉的地城區（VARIANT.DUNGEON；每個家鄉恰一個）
export function homeDungeonRegion(m: Landmass): RegionInfo {
  const r = m.kind === 'home' ? m.regions.find((q) => q.variant === VARIANT.DUNGEON) : undefined;
  if (!r) throw new RangeError(`gen2: landmass ${m.side}:${m.i} has no home dungeon zone`);
  return r;
}
