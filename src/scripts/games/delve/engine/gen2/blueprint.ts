// blueprint.ts — gen2 結構藍圖與槽位格（spec §4.3「結構以地區內的槽位格決定位置」）。
// 每個陸地地區（home / wild / culture，沙灘除外）每一層各自切槽：表層 / 天空寬 LAND_SLOT_W（340）、地下 / 深層 / 小點位寬 SUB_SLOT_W（170）
// （bpcore.slotWidth；最後一槽吃餘數，各層有自己的 slot 序號；170 的槽界一定包含 340 的槽界），每層每槽至多一份藍圖；
// 藍圖只由 (seed, 地區, 槽, 層) 與 Profile2 的地表 / 層線算出（局部可算），外框在 [槽 x0 + 8, 槽 x1 − 8) 內（wholeRegion 的錨點例外：
// 外框在地區 [r.x0, r.x1) 內，Q2），solid / ground 在外框內，所以 fill 一段 [x0, x1) 只要看與它相交的槽（加上相交地區的 wholeRegion 錨點），
// 任何一段都蓋得出同一份藍圖與自己相交的部分。
// 海槽（P12 / spec §8）：structureId / slotOf 認得海槽（region = 0、slot = SeaSlot.k、表層）；每個海槽恰有一個點：
// SeaSlot.poi = 'island' 的槽沒有藍圖（島地形由 Profile2 + fill 負責）、'shipwreck' / 'crate' 各一份表層藍圖（ctx 的槽 = 海槽、region = 海本身）。
// 島地區不進陸地槽位格。
// 保證槽（P11）：每片非家鄉的大陸至少一間小屋、一座遺跡（見 BlueprintIndex.guard）。
// 錨點（anchors.ts，M2a Task 7）：有錨點的 (地區, 層, 槽) 不擲機率、用登錄的錨點建構器（沒登錄 = 空著）；錨點優先於保證槽（Q15）。
// 錨點可以在含主坑道的槽（找不到不含坑道的槽時），建構器收到的 slotX0 / slotX1 是避開坑道帶後較大的一側（anchors.anchorSpan），
// 所以外框照舊離坑道觸及範圍 ≥ 1；「含坑道的槽沒有非 DEEP 藍圖」只對機率 / 保證藍圖成立。
// 家鄉地城區只有 dungeon 錨點（wholeRegion：外框佔滿整個地區，任何與地區相交的查詢都找得到它），其他層 / 槽全空。
// 快取（Q9）：家鄉地塊的藍圖存在釘選表（永不淘汰，家鄉地城這種大藍圖只建一次）；外圍地塊照舊 LRU CACHE_MAX 份。
// 液體藍圖（湖 / 地下湖 / 熔岩池，structures/lakes.ts）讓位：另一層與它的外框相交的那幾槽的藍圖外框與它相交、且那份不是液體或層比它淺 → 這份不放
// （fill 依 (layer, id) 序蓋，後蓋的結構會切開液體；依「原始」擲出的結果判，沒有循環）。
// 跨層不重疊（Q10，M2a Task 9）：同一地區、不同層的兩份非液體藍圖外框不得相交；相交時依 crossYields 丟掉一份：
// 錨點（2）> 保證槽（1，P11）> 機率擲出（0）；同級丟較深的（SURFACE < UNDER < DEEP；SKY / MINOR 同級一律讓位）。
// 比對的是其他層的「原始」藍圖（同 yieldLiquid，不遞迴）；錨點彼此由錨點規則保證不相交（settlements.test 釘住），真的相交 → RangeError（不默默少放）。
// 地面覆寫（groundAt，Q4）：SURFACE 層藍圖的 ground 蓋過 profile 的地表；Gen2Source.surfaceAt 與 BpCtx.groundAt 都是它。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { hash2, seedInt } from '../noise';
import { X_LIMIT } from '../coords';
import { li, type Column } from '../column';
import type { RegionInfo } from '../regionInfo';
import { HOME_X0, SPAWN_X, VARIANT, type Landmass, type Layout, type SeaSlot } from './layout';
import { ANCHOR_MAX_W, anchorBuild, anchorSpan, continentAnchors, homeAnchors, registerAnchorBuild, type Anchor } from './anchors';
import type { Profile2 } from './profile';
import { shaftX } from './caves';
import { buildCabin } from './structures/cabin';
import { buildRuin } from './structures/ruin';
import { buildLake, buildCaveLake, buildLavaPool } from './structures/lakes';
import { buildShipwreck } from './structures/shipwreck';
import { buildCrate } from './structures/crate';
import { buildDungeonBp } from './structures/dungeon';
import { buildVillageBp } from './structures/village';
import { buildHallBp } from './structures/hall';
import { BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, KEEP, SLOT_PAD, slotWidth, landSlot, landSlotCount, touchesSpawnClear, type Blueprint, type BpCtx, type BpKind, type Layer } from './bpcore';
import { encodeStructureId, decodeStructureId } from './structId';

export {
  BP_SURFACE, BP_UNDER, BP_DEEP, BP_SKY, BP_MINOR, LAND_SLOT_W, SUB_SLOT_W, KEEP, SLOT_PAD, SPAWN_CLEAR, BpGrid, placeX, slotWidth, landSlot, landSlotCount, emptyObjects,
  type BpKind, type Blueprint, type BpCtx, type Layer, type BpChest, type BpPot, type BpTablet, type BpLandmark, type BpGround, type BpBox,
} from './bpcore';

// ── structureId：位元配置見 structId.ts（i 13 | side 2 | region 5 | slot 5 | layer 3 bit，hash2 吃得下的 int32）──
// 陸地：region = 地區 index、slot = 該層的陸地槽序號；海（P12）：region = 0（海本身）、slot = SeaSlot.k、layer = BP_SURFACE
export const structureId = encodeStructureId;

// 陸地地區：home / wild / culture（海與島不進陸地槽位格，P12）
const isLand = (r: RegionInfo): boolean => r.kind === 'home' || r.kind === 'wild' || r.kind === 'culture';
// 放藍圖的地區：陸地、非沙灘（家鄉兩端的沙灘不放，spec §4.4；與主坑道 / 保證槽的沙灘豁免一致）。家鄉地城區有槽，但只放 dungeon 錨點
const hasSlots = (r: RegionInfo): boolean => isLand(r) && r.variant !== VARIANT.BEACH;
// 槽序號用 bpcore.landSlotCount / landSlot（anchors.ts 共用）
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

// 把藍圖與 [x0, x1) 相交的格依序蓋進 col（col 是 [x0, x1) 所在的那一欄）；有 colIndex 的大藍圖只掃 [x0, x1) 涉及的欄
export function stamp(col: Column, bp: Blueprint, x0: number, x1: number): void {
  if (bp.x >= x1 || bp.x + bp.w <= x0) return;
  const ci = bp.colIndex;
  if (!ci) { stampRange(col, bp.cells, 0, bp.cells.length, x0, x1); return; }
  for (let c = x0 >> 5; c <= (x1 - 1) >> 5; c++) { const r = ci.get(c); if (r) stampRange(col, bp.cells, r[0], r[1], x0, x1); }
}
function stampRange(col: Column, c: Int32Array, a: number, z: number, x0: number, x1: number): void {
  const H = col.height, fg = col.fg, wall = col.wall, liq = col.liquid, lt = col.liquidType;
  for (let k = a; k < z; k += 5) {
    const x = c[k], y = c[k + 1];
    if (x < x0 || x >= x1 || y < 0 || y >= H) continue;
    const i = li(x, y), f = c[k + 2], w = c[k + 3], q = c[k + 4];
    if (f !== KEEP) fg[i] = f;
    if (w !== KEEP) wall[i] = w;
    if (q !== KEEP) { liq[i] = q >> 8; lt[i] = q & 255; }
  }
}

// ── 錨點建構器（家鄉地城：wholeRegion，Q2；村莊 / 地廳：M2a Task 9）──
registerAnchorBuild('dungeon', buildDungeonBp);
registerAnchorBuild('village', buildVillageBp);
registerAnchorBuild('hall', buildHallBp);

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
// 跨層不重疊（Q10）：非液體藍圖 b（等級 bRank）讓位給另一層的非液體藍圖 o（等級 oRank）？等級：2 錨點、1 保證槽、0 機率擲出。
// 外框不相交、同層、任一份是液體（液體走 liquidYields）→ false；等級低的讓；同級時 SKY / MINOR 一律讓位（它們依 SURFACE 地面擺放，Q4），
// 否則較深的讓（SURFACE < UNDER < DEEP）
const sideLayer = (l: Layer): boolean => l === BP_SKY || l === BP_MINOR;
export function crossYields(b: Blueprint, bRank: 0 | 1 | 2, o: Blueprint, oRank: 0 | 1 | 2): boolean {
  if (b.layer === o.layer || LIQUID.has(b.kind) || LIQUID.has(o.kind) || !boxesMeet(b, o)) return false;
  if (bRank !== oRank) return bRank < oRank;
  if (sideLayer(b.layer)) return true;
  if (sideLayer(o.layer)) return false;
  return b.layer > o.layer;
}
// 家鄉含出生點 ± SPAWN_CLEAR 的槽全空（bpcore.touchesSpawnClear）
const CACHE_MAX = 256;
// 地面覆寫的快取：一段 GROUND_SEG 欄
const GROUND_SEG = 32, NO_GROUND = -32768;

interface Pick { r: RegionInfo; q: number; bp: Blueprint }
interface Guard { cabin: Pick; ruin: Pick }
// 一片地塊的錨點：list = anchorsOf 的結果；at = structureId → 錨點；whole = wholeRegion 的錨點
interface AnchorTable { list: readonly Anchor[]; at: Map<number, Anchor>; whole: readonly Anchor[]; rank: Map<Anchor, number> }
export interface BlueprintIndexOptions {
  // 測試接縫：額外的錨點（併進 anchorsOf 的結果；正式碼不傳）
  extraAnchors?: (m: Landmass) => readonly Anchor[];
}

export class BlueprintIndex {
  private readonly s: number;
  private readonly sRoll: number;
  private readonly sShaft: number;
  private readonly spawnX: number | null;
  // id → 藍圖（null = 這槽這層空著）；外圍（家鄉以外）LRU CACHE_MAX 份。raw = 讓位前（原始擲出）的結果
  private readonly cache = new Map<number, Blueprint | null>();
  private readonly rawCache = new Map<number, Blueprint | null>();
  // 家鄉地塊的藍圖（Q9）：釘選、永不淘汰（家鄉地城等大藍圖只建一次；家鄉的槽數有限）。pinnedRaw = 讓位前的結果
  private readonly pinned = new Map<number, Blueprint | null>();
  private readonly pinnedRaw = new Map<number, Blueprint | null>();
  // 大陸 → 保證槽（Landmass 是 Layout 快取的同一個物件）
  private readonly guards = new Map<Landmass, Guard>();
  // 地塊 → 錨點
  private readonly anchors = new Map<Landmass, AnchorTable>();
  // 段號（floor(x / 32)）→ 那 32 欄的地面（groundAt）
  private readonly grounds = new Map<number, Int16Array>();
  private readonly groundFn = (x: number): number => this.groundAt(x);
  // groundAt 正在算一段（重入 = Q4 的循環，丟錯）
  private groundBusy = false;

  constructor(private readonly seed: string, private readonly layout: Layout, private readonly profile: Profile2, private readonly opts: BlueprintIndexOptions = {}) {
    this.s = seedInt(seed, 'g2-bp');
    this.sRoll = seedInt(seed, 'g2-bp-roll');
    this.sShaft = seedInt(seed, 'g2-shaft');
    const home = layout.origin.home;
    this.spawnX = home ? home.x0 + SPAWN_X - HOME_X0 : null;
  }

  // 外框與 [x0, x1) 相交的藍圖，依 (layer, id) 排序；layers = 只要這幾層（預設全部）。
  // 一般藍圖的外框在自己的槽裡，看相交的槽就夠；wholeRegion 錨點的外框跨整個地區，地區相交就另外看它的槽（不重複）
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
        const whole = this.anchorTable(m).whole;
        for (const r of m.regions) {
          if (r.x1 <= x0 || r.x0 >= x1 || !hasSlots(r)) continue;
          for (const layer of land) {
            const [q0, q1] = slotsIn(r, layer, x0, x1);
            for (let q = q0; q <= q1; q++) {
              const b = this.get(m, r, q, layer);
              if (b && b.x < x1 && b.x + b.w > x0) out.push(b);
            }
            for (const a of whole) {
              if (a.region !== r || a.layer !== layer || (a.slot >= q0 && a.slot <= q1)) continue;
              const b = this.get(m, r, a.slot, layer);
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
  // 32 欄一段快取覆寫值（NO_GROUND = 沒有覆寫；段內可能有不屬 gen2 的欄，所以側寫的地表只對 x 本身問）。
  // 算一段時（建 SURFACE 層藍圖）又被呼叫 = 有 SURFACE 層建構器讀了 groundAt，Q4 的無循環規則被破壞 → 丟錯（不是無窮遞迴）
  groundAt(x: number): number {
    if (this.groundBusy) throw new Error(`gen2: groundAt re-entered at x ${x} (a SURFACE-layer builder must read c.profile, not c.groundAt; Q4)`);
    const seg = Math.floor(x / GROUND_SEG), a = seg * GROUND_SEG;
    let g = this.grounds.get(seg);
    if (!g) {
      g = new Int16Array(GROUND_SEG).fill(NO_GROUND);
      this.groundBusy = true;
      try {
        for (const b of this.overlapping(a, a + GROUND_SEG, [BP_SURFACE])) {
          const gr = b.ground;
          if (!gr) continue;
          for (let k = 0; k < gr.tops.length; k++) { const gx = gr.x0 + k; if (gx >= a && gx < a + GROUND_SEG) g[gx - a] = gr.tops[k]; }
        }
      } finally { this.groundBusy = false; }
      if (this.grounds.size >= CACHE_MAX) this.grounds.delete(this.grounds.keys().next().value!);
      this.grounds.set(seg, g);
    }
    const v = g[x - a];
    return v === NO_GROUND ? this.profile.surfaceAt(x) : v;
  }

  // 地塊的錨點（家鄉：homeAnchors；大陸：continentAnchors；海：沒有）+ 測試接縫 extraAnchors；依地塊快取
  anchorsOf(m: Landmass): readonly Anchor[] { return this.anchorTable(m).list; }

  // 地塊 m 的錨點 a 的（讓位後的）藍圖；沒登錄建構器 / 被讓位 → null。SKY / MINOR 層還沒有藍圖（Task 10 / 19）→ null
  anchorBlueprint(m: Landmass, a: Anchor): Blueprint | null {
    return a.layer === BP_SURFACE || a.layer === BP_UNDER || a.layer === BP_DEEP ? this.get(m, a.region, a.slot, a.layer) : null;
  }

  private anchorTable(m: Landmass): AnchorTable {
    let t = this.anchors.get(m);
    if (t) return t;
    const own = m.kind === 'home' ? homeAnchors(this.seed, m, this.profile) : m.kind === 'continent' ? continentAnchors(this.seed, m, this.profile) : [];
    const list = [...own, ...(this.opts.extraAnchors?.(m) ?? [])], at = new Map<number, Anchor>();
    for (const a of list) {
      const id = structureId(m.side, m.i, a.region.index, a.slot, a.layer);
      if (at.has(id)) throw new RangeError(`gen2: two anchors in slot ${id} (${at.get(id)!.kind}, ${a.kind})`);
      at.set(id, a);
    }
    // 家鄉錨點的名次（BpCtx.rank）：同種裡可用範圍中點離出生點由近到遠，平手取 x 小的
    const rank = new Map<Anchor, number>();
    if (m.kind === 'home' && this.spawnX !== null) {
      const sp = this.spawnX, mid = (a: Anchor): number => { const q = anchorSpan(this.seed, a); return (q.x0 + q.x1) / 2; };
      for (const k of new Set(list.map((a) => a.kind))) {
        const same = list.filter((a) => a.kind === k).sort((p, q) => Math.abs(mid(p) - sp) - Math.abs(mid(q) - sp) || mid(p) - mid(q));
        same.forEach((a, i) => rank.set(a, i));
      }
    }
    t = { list, at, whole: list.filter((a) => a.wholeRegion), rank };
    if (this.anchors.size >= CACHE_MAX) this.anchors.clear();
    this.anchors.set(m, t);
    return t;
  }

  // 海槽的點（沉船 / 漂流箱）：ver 0 的規則（build 收到該海的 ctx.ver）
  private seaPoint(m: Landmass, s: SeaSlot, poi: SeaPoi): Blueprint {
    const id = structureId(m.side, m.i, 0, s.k, BP_SURFACE), build = SEA_BUILD[poi];
    return lru(this.cache, id, () => build({ seed: this.seed, s: this.s, id, slotX0: s.x0, slotX1: s.x1, region: m.regions[0], profile: this.profile, ver: m.ver, groundAt: this.groundFn }))!;
  }

  // 家鄉地塊走釘選表（Q9），外圍走 LRU。讓位：液體 → yieldLiquid、非液體 → yieldCross（都只看其他層的原始藍圖）
  private get(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): Blueprint | null {
    const id = structureId(m.side, m.i, r.index, q, layer), make = (): Blueprint | null => {
      const b = this.raw(m, r, q, layer);
      return !b ? null : LIQUID.has(b.kind) ? this.yieldLiquid(m, r, b) : this.yieldCross(m, r, b, this.rank(m, r, q, layer));
    };
    return m.kind === 'home' ? memo(this.pinned, id, make) : lru(this.cache, id, make);
  }

  // 第 q 槽的原始藍圖的等級（crossYields）：2 錨點、1 大陸的保證槽、0 機率擲出
  private rank(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): 0 | 1 | 2 {
    if (this.anchorTable(m).at.has(structureId(m.side, m.i, r.index, q, layer))) return 2;
    if (m.kind !== 'continent') return 0;
    const g = this.guard(m), p = layer === BP_UNDER ? g.cabin : layer === BP_SURFACE ? g.ruin : null;
    return p !== null && p.r === r && p.q === q ? 1 : 0;
  }

  // 非液體藍圖 b（等級 rank）讓位（crossYields）給同地區另一層與它的外框相交的那幾槽（含該層的 wholeRegion 錨點）的原始藍圖 → null
  private yieldCross(m: Landmass, r: RegionInfo, b: Blueprint, rank: 0 | 1 | 2): Blueprint | null {
    const whole = this.anchorTable(m).whole;
    for (const layer of LAYERS) {
      if (layer === b.layer) continue;
      const [q0, q1] = slotsIn(r, layer, b.x, b.x + b.w), qs: number[] = [];
      for (let q = q0; q <= q1; q++) qs.push(q);
      for (const a of whole) if (a.region === r && a.layer === layer && (a.slot < q0 || a.slot > q1)) qs.push(a.slot);
      for (const q of qs) {
        const o = this.raw(m, r, q, layer), oRank = this.rank(m, r, q, layer);
        if (!o || !crossYields(b, rank, o, oRank)) continue;
        // 錨點彼此必須由錨點規則保證不相交：同級相交時不默默丟掉較深的錨點
        if (rank === 2 && oRank === 2) throw new RangeError(`gen2: anchors ${b.kind} [${b.x}, ${b.x + b.w}) × [${b.y}, ${b.y + b.h}) and ${o.kind} overlap across layers`);
        return null;
      }
    }
    return b;
  }

  private raw(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer): Blueprint | null {
    const id = structureId(m.side, m.i, r.index, q, layer), make = (): Blueprint | null => this.build(m, r, q, layer, id);
    return m.kind === 'home' ? memo(this.pinnedRaw, id, make) : lru(this.rawCache, id, make);
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
    return { seed: this.seed, s: this.s, id, slotX0: sl.x0, slotX1: sl.x1, region: r, profile: this.profile, ver: m.ver, groundAt: this.groundFn,
      spawnX: m.kind === 'home' && this.spawnX !== null ? this.spawnX : undefined };
  }

  // 該層第 q 槽含主坑道的 x
  private shaftIn(r: RegionInfo, q: number, layer: Layer): boolean {
    const sx = shaftX(this.sShaft, r), sl = landSlot(r, q, layer);
    return Number.isFinite(sx) && sx >= sl.x0 && sx < sl.x1;
  }

  // ver 0 的規則（每個槽位表項目的 build 收到該地塊的 ctx.ver）
  // 錨點先：有錨點 → 錨點建構器（沒登錄 → null），不擲機率；家鄉地城區沒有錨點的槽全空
  private build(m: Landmass, r: RegionInfo, q: number, layer: RolledLayer, id: number): Blueprint | null {
    const a = this.anchorTable(m).at.get(id);
    if (a) {
      // 建構器的 slotX0 / slotX1 = 錨點的可用範圍（含坑道的槽 → 避開坑道帶後較大的一側；wholeRegion → 整個地區）
      const f = anchorBuild(a.kind), sp = anchorSpan(this.seed, a);
      if (!f) return null;
      const bp = f({ ...this.ctx(m, r, q, layer), slotX0: sp.x0, slotX1: sp.x1, rank: this.anchorTable(m).rank.get(a) });
      // 執行期檢查（非 wholeRegion、非 shaft_cache）：外框寬 ≤ ANCHOR_MAX_W、外框在 [span.x0 + SLOT_PAD, span.x1 − SLOT_PAD) 內（不會蓋到坑道帶）
      if (!a.wholeRegion && a.kind !== 'shaft_cache') {
        const max = ANCHOR_MAX_W[a.kind];
        if (max !== undefined && bp.w > max) throw new RangeError(`gen2: anchor ${a.kind} box ${bp.w} wider than ${max}`);
        if (bp.x < sp.x0 + SLOT_PAD || bp.x + bp.w > sp.x1 - SLOT_PAD) throw new RangeError(`gen2: anchor ${a.kind} box [${bp.x}, ${bp.x + bp.w}) outside its span [${sp.x0}, ${sp.x1}) ± ${SLOT_PAD}`);
      }
      return bp;
    }
    if (r.variant === VARIANT.DUNGEON) return null;
    const sl = landSlot(r, q, layer);
    if (m.kind === 'home' && this.spawnX !== null && touchesSpawnClear(sl.x0, sl.x1, this.spawnX)) return null;
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

  // 保證槽（P11）：大陸在該層的合格槽（非沙灘地區、不含主坑道、不是錨點槽（Q15）；小屋看地下層的 170 格槽、遺跡看表層的 340 格槽）依 x 排序，
  // 起點 g = floor(hash2(side, i, s) × 該層合格槽數)；小屋 = 從 g 往後（繞回）第一個 buildCabin 不回 null 的槽、
  // 遺跡 = 從 g + 1 往後第一個 buildRuin 不回 null 的槽；全部失敗就從同一個起點依序 force（force 也會因坑道避讓帶回 null，Q3）。
  // 保證槽的那一層不再擲機率
  private guard(m: Landmass): Guard {
    let g = this.guards.get(m);
    if (g) return g;
    const h = hash2(m.side, m.i, this.s), anchored = this.anchorTable(m).at;
    const find = (off: number, layer: 0 | 1, build: Build): Pick => {
      const ok: { r: RegionInfo; q: number }[] = [];
      for (const r of m.regions) {
        if (!hasSlots(r)) continue;
        for (let q = 0; q < landSlotCount(r, layer); q++) {
          if (!this.shaftIn(r, q, layer) && !anchored.has(structureId(m.side, m.i, r.index, q, layer))) ok.push({ r, q });
        }
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

// 釘選表：未命中 make() 後放入，永不淘汰
function memo<V>(cache: Map<number, V>, id: number, make: () => V): V {
  if (cache.has(id)) return cache.get(id)!;
  const v = make();
  cache.set(id, v);
  return v;
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
