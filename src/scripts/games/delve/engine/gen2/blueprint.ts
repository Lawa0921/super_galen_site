// blueprint.ts — gen2 結構藍圖與槽位格（spec §4.3「結構以地區內的槽位格決定位置」）。
// 每個陸地地區（home / wild / culture，沙灘除外）每一層各自切槽：表層 / 天空寬 LAND_SLOT_W（340）、地下 / 深層 / 小點位寬 SUB_SLOT_W（170）
// （bpcore.slotWidth；最後一槽吃餘數，各層有自己的 slot 序號；170 的槽界一定包含 340 的槽界），每層每槽至多一份藍圖；
// 藍圖只由 (seed, 地區, 槽, 層) 與 Profile2 的地表 / 層線算出（局部可算），外框在 [槽 x0 + 8, 槽 x1 − 8) 內（wholeRegion 的錨點例外，Q2），
// 所以 fill 一段 [x0, x1) 只要看與它相交的槽，任何一段都蓋得出同一份藍圖與自己相交的部分。
// 海槽（P12 / spec §8）：structureId / slotOf 認得海槽（region = 0、slot = SeaSlot.k、表層）；每個海槽恰有一個點：
// SeaSlot.poi = 'island' 的槽沒有藍圖（島地形由 Profile2 + fill 負責）、'shipwreck' / 'crate' 各一份表層藍圖（ctx 的槽 = 海槽、region = 海本身）。
// 島地區不進陸地槽位格。
// 保證槽（P11）：每片非家鄉的大陸至少一間小屋、一座遺跡（見 BlueprintIndex.guard）。
// 液體藍圖（湖 / 地下湖 / 熔岩池，structures/lakes.ts）讓位：另一層與它的外框相交的那幾槽的藍圖外框與它相交、且那份不是液體或層比它淺 → 這份不放
// （fill 依 (layer, id) 序蓋，後蓋的結構會切開液體；依「原始」擲出的結果判，沒有循環）。
// 地面覆寫（groundAt，Q4）：SURFACE 層藍圖的 ground 蓋過 profile 的地表；Gen2Source.surfaceAt 與 BpCtx.groundAt 都是它。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2, seedInt } from '../noise';
import { X_LIMIT } from '../coords';
import { li, type Column } from '../column';
import type { RegionInfo } from '../regionInfo';
import { HOME_X0, SPAWN_X, VARIANT, type Landmass, type Layout, type SeaSlot } from './layout';
import type { Profile2 } from './profile';
import { shaftX } from './caves';
import { buildCabin } from './structures/cabin';
import { buildRuin } from './structures/ruin';
import { buildLake, buildCaveLake, buildLavaPool } from './structures/lakes';
import { buildShipwreck } from './structures/shipwreck';
import { buildCrate } from './structures/crate';
import { BP_SURFACE, BP_UNDER, BP_DEEP, KEEP, slotWidth, type Blueprint, type BpCtx, type BpKind, type Layer } from './bpcore';
import { encodeStructureId, decodeStructureId } from './structId';

export {
  BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, LAND_SLOT_W, SUB_SLOT_W, KEEP, SLOT_PAD, BpGrid, placeX, slotWidth, emptyObjects,
  type BpKind, type Blueprint, type BpCtx, type Layer, type BpChest, type BpPot, type BpTablet, type BpLandmark, type BpGround, type BpBox,
} from './bpcore';

// ── structureId：位元配置見 structId.ts（i 13 | side 2 | region 5 | slot 5 | layer 3 bit，hash2 吃得下的 int32）──
// 陸地：region = 地區 index、slot = 該層的陸地槽序號；海（P12）：region = 0（海本身）、slot = SeaSlot.k、layer = BP_SURFACE
export const structureId = encodeStructureId;

// 陸地地區：home / wild / culture（海與島不進陸地槽位格，P12）
const isLand = (r: RegionInfo): boolean => r.kind === 'home' || r.kind === 'wild' || r.kind === 'culture';
// 放藍圖的地區：陸地、非沙灘（家鄉兩端的沙灘留給 M2 的地城，spec §4.4；與主坑道 / 保證槽的沙灘豁免一致）
const hasSlots = (r: RegionInfo): boolean => isLand(r) && r.variant !== VARIANT.BEACH;
// 地區在 layer 層的陸地槽數（至少 1；最後一槽吃餘數）與第 q 槽
export const landSlotCount = (r: RegionInfo, layer: Layer): number => Math.max(1, Math.floor((r.x1 - r.x0) / slotWidth(layer)));
export function landSlot(r: RegionInfo, q: number, layer: Layer): { x0: number; x1: number } {
  const sw = slotWidth(layer), x0 = r.x0 + q * sw;
  return { x0, x1: q < landSlotCount(r, layer) - 1 ? x0 + sw : r.x1 };
}
// 地區 r 在 layer 層與 [x0, x1) 相交的槽 [q0, q1]（沒有相交 → q0 > q1）
function slotsIn(r: RegionInfo, layer: Layer, x0: number, x1: number): [number, number] {
  const n = landSlotCount(r, layer), sw = slotWidth(layer);
  const a = Math.max(x0, r.x0), z = Math.min(x1, r.x1);
  if (a >= z) return [1, 0];
  return [Math.min(n - 1, Math.floor((a - r.x0) / sw)), Math.min(n - 1, Math.floor((z - 1 - r.x0) / sw))];
}

function homeOf(layout: Layout): Landmass {
  const h = layout.origin.home, m = h ? layout.landmassAt(h.x0) : null;
  if (!m || m.kind !== 'home') throw new RangeError('gen2: no home landmass');
  return m;
}

// structureId 的反查：陸地槽（依 id 的層取槽寬）與海槽都認得；不存在的槽丟 RangeError
export function slotOf(id: number, layout: Layout): { x0: number; x1: number; region: RegionInfo; layer: Layer } {
  const { side, i, region, slot, layer } = decodeStructureId(id);
  if ((side === 0) !== (i === 0)) throw new RangeError(`structure id ${id}: side ${side} landmass ${i}`);
  const m = side === 0 ? homeOf(layout) : layout.landmass(side, i);
  if (m.kind === 'sea') {
    const s = m.slots[slot];
    if (region !== 0 || layer !== BP_SURFACE || !s) throw new RangeError(`structure id ${id}: no sea slot`);
    return { x0: s.x0, x1: s.x1, region: m.regions[0], layer };
  }
  const r = m.regions[region];
  if (!r || slot >= landSlotCount(r, layer)) throw new RangeError(`structure id ${id}: no land slot`);
  return { ...landSlot(r, slot, layer), region: r, layer };
}

// 箱子內容的深度：(y − 地表) / (世界高 − 地表)，夾在 [0, 1]
export function depthFrac(p: Profile2, x: number, y: number): number {
  const s = p.surfaceAt(x), v = (y - s) / (p.height - s);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// 把藍圖與 [x0, x1) 相交的格依序蓋進 col（col 是 [x0, x1) 所在的那一欄）
export function stamp(col: Column, bp: Blueprint, x0: number, x1: number): void {
  if (bp.x >= x1 || bp.x + bp.w <= x0) return;
  const c = bp.cells, H = col.height, fg = col.fg, wall = col.wall, liq = col.liquid, lt = col.liquidType;
  for (let k = 0; k < c.length; k += 5) {
    const x = c[k], y = c[k + 1];
    if (x < x0 || x >= x1 || y < 0 || y >= H) continue;
    const i = li(x, y), f = c[k + 2], w = c[k + 3], q = c[k + 4];
    if (f !== KEEP) fg[i] = f;
    if (w !== KEEP) wall[i] = w;
    if (q !== KEEP) { liq[i] = q >> 8; lt[i] = q & 255; }
  }
}

// ── 槽位表 ──

type Build = (c: BpCtx, o?: { force?: boolean }) => Blueprint | null;
// 有槽位表的層
type RolledLayer = 0 | 1 | 2;
// 各層的機率（依序累加；擲 hash2(id, 0, sRoll)）：表層（340 格槽）遺跡 0.3、湖 0.15；地下層（170 格槽）小屋 0.35、地下湖 0.12；
// 深層（170 格槽）熔岩池 0.2
const ROLL: readonly (readonly { p: number; build: Build }[])[] = [
  [{ p: 0.3, build: buildRuin }, { p: 0.15, build: buildLake }],
  [{ p: 0.35, build: buildCabin }, { p: 0.12, build: buildCaveLake }],
  [{ p: 0.2, build: buildLavaPool }],
];
// 海槽的點（island 沒有藍圖）
type SeaPoi = Exclude<SeaSlot['poi'], 'island'>;
const SEA_BUILD: Readonly<Record<SeaPoi, (c: BpCtx) => Blueprint>> = { shipwreck: buildShipwreck, crate: buildCrate };
const LIQUID: ReadonlySet<BpKind> = new Set<BpKind>(['lake', 'cave_lake', 'lava_pool']);
const LAYERS: readonly RolledLayer[] = [BP_SURFACE, BP_UNDER, BP_DEEP];
const boxesMeet = (a: Blueprint, b: Blueprint): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// 液體藍圖 b 讓位給另一層的 o：外框相交，且 o 不是液體、或 o 的層比 b 淺（先蓋）。非液體藍圖從不讓位
// （幾何上很少相交：400 個種子沒有發生；這裡保證後蓋的結構不會切開液體）
export function liquidYields(b: Blueprint, o: Blueprint): boolean {
  return LIQUID.has(b.kind) && o.layer !== b.layer && boxesMeet(b, o) && (!LIQUID.has(o.kind) || o.layer < b.layer);
}
// 家鄉含出生點 ± SPAWN_CLEAR 的槽全空
const SPAWN_CLEAR = 80;
const CACHE_MAX = 256;
// 地面覆寫的快取：一段 GROUND_SEG 欄
const GROUND_SEG = 32, NO_GROUND = -32768;

interface Pick { r: RegionInfo; q: number; bp: Blueprint }
interface Guard { cabin: Pick; ruin: Pick }

export class BlueprintIndex {
  private readonly s: number;
  private readonly sRoll: number;
  private readonly sShaft: number;
  private readonly spawnX: number | null;
  // id → 藍圖（null = 這槽這層空著）；LRU CACHE_MAX 份。raw = 讓位前（原始擲出）的結果
  private readonly cache = new Map<number, Blueprint | null>();
  private readonly rawCache = new Map<number, Blueprint | null>();
  // 大陸 → 保證槽（Landmass 是 Layout 快取的同一個物件）
  private readonly guards = new Map<Landmass, Guard>();
  // 段號（floor(x / 32)）→ 那 32 欄的地面（groundAt）
  private readonly grounds = new Map<number, Int16Array>();
  private readonly groundFn = (x: number): number => this.groundAt(x);

  constructor(private readonly seed: string, private readonly layout: Layout, private readonly profile: Profile2) {
    this.s = seedInt(seed, 'g2-bp');
    this.sRoll = seedInt(seed, 'g2-bp-roll');
    this.sShaft = seedInt(seed, 'g2-shaft');
    const home = layout.origin.home;
    this.spawnX = home ? home.x0 + SPAWN_X - HOME_X0 : null;
  }

  // 外框與 [x0, x1) 相交的藍圖，依 (layer, id) 排序；layers = 只要這幾層（預設全部）
  overlapping(x0: number, x1: number, layers: readonly Layer[] = LAYERS): Blueprint[] {
    const out: Blueprint[] = [];
    const land = LAYERS.filter((l) => layers.includes(l));
    const end = Math.min(x1, X_LIMIT);
    for (let x = Math.max(x0, -X_LIMIT); x < end;) {
      const m = this.layout.landmassAt(x);
      if (!m) {
        // 烘焙世界的舊範圍 [west.x, east.x) 不屬 gen2
        const e = this.layout.origin.east.x;
        if (x < e) { x = e; continue; }
        break;
      }
      if (m.kind === 'sea') {
        if (layers.includes(BP_SURFACE)) for (const s of m.slots) {
          if (s.poi === 'island' || s.x1 <= x0 || s.x0 >= x1) continue;
          const b = this.seaPoint(m, s, s.poi);
          if (b.x < x1 && b.x + b.w > x0) out.push(b);
        }
      } else {
        for (const r of m.regions) {
          if (r.x1 <= x0 || r.x0 >= x1 || !hasSlots(r)) continue;
          for (const layer of land) {
            const [q0, q1] = slotsIn(r, layer, x0, x1);
            for (let q = q0; q <= q1; q++) {
              const b = this.get(m, r, q, layer);
              if (b && b.x < x1 && b.x + b.w > x0) out.push(b);
            }
          }
        }
      }
      x = m.x1;
    }
    return out.sort((a, b) => a.layer - b.layer || a.id - b.id);
  }

  // 地面（Q4）：profile.surfaceAt(x)，被與 x 相交、有 ground 且涵蓋 x 的 SURFACE 層藍圖覆寫（依 id 序、後者優先）。
  // 只看 SURFACE 層（SURFACE / UNDER / DEEP 的建構器讀 profile、不讀這裡），所以 SKY / MINOR 的建構器呼叫它沒有循環。
  // 32 欄一段快取覆寫值（NO_GROUND = 沒有覆寫；段內可能有不屬 gen2 的欄，所以側寫的地表只對 x 本身問）
  groundAt(x: number): number {
    const seg = Math.floor(x / GROUND_SEG), a = seg * GROUND_SEG;
    let g = this.grounds.get(seg);
    if (!g) {
      g = new Int16Array(GROUND_SEG).fill(NO_GROUND);
      for (const b of this.overlapping(a, a + GROUND_SEG, [BP_SURFACE])) {
        const gr = b.ground;
        if (!gr) continue;
        for (let k = 0; k < gr.tops.length; k++) { const gx = gr.x0 + k; if (gx >= a && gx < a + GROUND_SEG) g[gx - a] = gr.tops[k]; }
      }
      if (this.grounds.size >= CACHE_MAX) this.grounds.delete(this.grounds.keys().next().value!);
      this.grounds.set(seg, g);
    }
    const v = g[x - a];
    return v === NO_GROUND ? this.profile.surfaceAt(x) : v;
  }

  // 海槽的點（沉船 / 漂流箱）：ver 0 的規則（build 收到該海的 ctx.ver）
  private seaPoint(m: Landmass, s: SeaSlot, poi: SeaPoi): Blueprint {
    const id = structureId(m.side, m.i, 0, s.k, BP_SURFACE), build = SEA_BUILD[poi];
    return lru(this.cache, id, () => build({ seed: this.seed, s: this.s, id, slotX0: s.x0, slotX1: s.x1, region: m.regions[0], profile: this.profile, ver: m.ver, groundAt: this.groundFn }))!;
  }

  private get(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): Blueprint | null {
    const id = structureId(m.side, m.i, r.index, q, layer);
    return lru(this.cache, id, () => this.yieldLiquid(m, r, this.raw(m, r, q, layer)));
  }

  private raw(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): Blueprint | null {
    const id = structureId(m.side, m.i, r.index, q, layer);
    return lru(this.rawCache, id, () => this.build(m, r, q, layer, id));
  }

  // 液體藍圖 b 讓位（liquidYields）給另一層與它的外框相交的那幾槽的原始藍圖 → null（各層槽寬不同，不是「同一個 slot 序號」）
  private yieldLiquid(m: Landmass, r: RegionInfo, b: Blueprint | null): Blueprint | null {
    if (!b || !LIQUID.has(b.kind)) return b;
    for (const layer of LAYERS) {
      if (layer === b.layer) continue;
      const [q0, q1] = slotsIn(r, layer, b.x, b.x + b.w);
      for (let q = q0; q <= q1; q++) {
        const o = this.raw(m, r, q, layer);
        if (o && liquidYields(b, o)) return null;
      }
    }
    return b;
  }

  private ctx(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): BpCtx {
    const id = structureId(m.side, m.i, r.index, q, layer), sl = landSlot(r, q, layer);
    return { seed: this.seed, s: this.s, id, slotX0: sl.x0, slotX1: sl.x1, region: r, profile: this.profile, ver: m.ver, groundAt: this.groundFn };
  }

  // 該層第 q 槽含主坑道的 x
  private shaftIn(r: RegionInfo, q: number, layer: Layer): boolean {
    const sx = shaftX(this.sShaft, r), sl = landSlot(r, q, layer);
    return Number.isFinite(sx) && sx >= sl.x0 && sx < sl.x1;
  }

  // ver 0 的規則（每個槽位表項目的 build 收到該地塊的 ctx.ver）
  private build(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer, id: number): Blueprint | null {
    const sl = landSlot(r, q, layer);
    if (m.kind === 'home' && this.spawnX !== null && sl.x0 <= this.spawnX + SPAWN_CLEAR && sl.x1 > this.spawnX - SPAWN_CLEAR) return null;
    if (layer !== BP_DEEP && this.shaftIn(r, q, layer)) return null;
    if (m.kind === 'continent') {
      const g = this.guard(m);
      if (layer === BP_UNDER && g.cabin.r === r && g.cabin.q === q) return g.cabin.bp;
      if (layer === BP_SURFACE && g.ruin.r === r && g.ruin.q === q) return g.ruin.bp;
    }
    const u = hash2(id, 0, this.sRoll);
    let acc = 0;
    for (const e of ROLL[layer]) {
      acc += e.p;
      if (u < acc) return e.build(this.ctx(m, r, q, layer));
    }
    return null;
  }

  // 保證槽（P11）：大陸在該層的合格槽（非沙灘地區、不含主坑道；小屋看地下層的 170 格槽、遺跡看表層的 340 格槽）依 x 排序，
  // 起點 g = floor(hash2(side, i, s) × 該層合格槽數)；小屋 = 從 g 往後（繞回）第一個 buildCabin 不回 null 的槽、
  // 遺跡 = 從 g + 1 往後第一個 buildRuin 不回 null 的槽；全部失敗就從同一個起點依序 force（force 也會因坑道避讓帶回 null，Q3）。
  // 保證槽的那一層不再擲機率
  private guard(m: Landmass): Guard {
    let g = this.guards.get(m);
    if (g) return g;
    const h = hash2(m.side, m.i, this.s);
    const find = (off: number, layer: 0 | 1, build: Build): Pick => {
      const ok: { r: RegionInfo; q: number }[] = [];
      for (const r of m.regions) {
        if (!hasSlots(r)) continue;
        for (let q = 0; q < landSlotCount(r, layer); q++) if (!this.shaftIn(r, q, layer)) ok.push({ r, q });
      }
      // 大陸 ≥ 2400 寬、地區 ≥ 700 寬：每個地區每層 ≥ 2 槽、至多 1 槽有坑道，不會沒有合格槽；真的發生就是版面壞了（P11 不能默默失效）
      const n = ok.length;
      if (n === 0) throw new RangeError(`gen2: continent ${m.side}:${m.i} has no eligible blueprint slot`);
      const start = Math.floor(h * n) + off;
      for (const force of [false, true]) {
        for (let k = 0; k < n; k++) {
          const e = ok[(start + k) % n], bp = build(this.ctx(m, e.r, e.q, layer), { force });
          if (bp) return { ...e, bp };
        }
      }
      throw new RangeError(`gen2: continent ${m.side}:${m.i} has no slot for its guaranteed ${layer === BP_UNDER ? 'cabin' : 'ruin'}`);
    };
    g = { cabin: find(0, BP_UNDER, buildCabin), ruin: find(1, BP_SURFACE, buildRuin) };
    if (this.guards.size >= CACHE_MAX) this.guards.clear();
    this.guards.set(m, g);
    return g;
  }
}

// LRU：命中移到最新；未命中 make() 後放入，超過 CACHE_MAX 丟最舊
function lru<V>(cache: Map<number, V>, id: number, make: () => V): V {
  const hit = cache.get(id);
  if (hit !== undefined) { cache.delete(id); cache.set(id, hit); return hit; }
  const v = make();
  cache.set(id, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return v;
}
