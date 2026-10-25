// bpcore.ts — gen2 結構藍圖的基本型別與畫圖工具（blueprint.ts 與 structures/*.ts 共用；本檔不 import 任何結構，
// 所以結構檔先被 import 也沒有循環依賴）。blueprint.ts 會原樣 re-export 這裡的東西。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { ChestKind, Drop } from '../loot';
import type { ItemId } from '../items';
import type { RegionInfo } from '../regionInfo';
import type { GenSite } from '../genTypes';
import { seedInt } from '../noise';
import type { Profile2 } from './profile';
import { shaftX, SHAFT_REACH } from './caves';
import { decodeStructureId } from './structId';

export type BpKind = 'cabin' | 'ruin' | 'shipwreck' | 'crate' | 'lake' | 'cave_lake' | 'lava_pool' | 'dungeon' | 'mineshaft' | 'sky_island' | 'village' | 'hall'
  | 'mushroom_biome' | 'crystal_cave' | 'hive'
  // 家鄉的石碑 / 遺物錨點（M2a Task 14，structures/shrine.ts）
  | 'alcove' | 'molten_shrine' | 'shaft_cache' | 'spawn_tablet';
// 層：表層 / 地下 / 深層 / 空中（浮空島）/ 小點（minor）；結構 id 的 layer 欄位 3 bit（structId.ts）
export const BP_SURFACE = 0, BP_UNDER = 1, BP_DEEP = 2, BP_SKY = 3, BP_MINOR = 4, LAND_SLOT_W = 340, KEEP = -1;
export type Layer = 0 | 1 | 2 | 3 | 4;
// 外框離槽兩端至少 SLOT_PAD 格
export const SLOT_PAD = 8;
// 地下 / 深層 / 小點位的槽寬（表層 / 天空照 LAND_SLOT_W）；每個陸地地區各層各自切槽、各自有 slot 序號（最後一槽吃餘數）
export const SUB_SLOT_W = 170;
export function slotWidth(layer: Layer): number { return layer === BP_SURFACE || layer === BP_SKY ? LAND_SLOT_W : SUB_SLOT_W; }
// 地區在 layer 層的陸地槽數（至少 1；最後一槽吃餘數）與第 q 槽（blueprint.ts 與 anchors.ts 共用）
export const landSlotCount = (r: RegionInfo, layer: Layer): number => Math.max(1, Math.floor((r.x1 - r.x0) / slotWidth(layer)));
export function landSlot(r: RegionInfo, q: number, layer: Layer): { x0: number; x1: number } {
  const sw = slotWidth(layer), x0 = r.x0 + q * sw;
  return { x0, x1: q < landSlotCount(r, layer) - 1 ? x0 + sw : r.x1 };
}
// 家鄉含出生點 ± SPAWN_CLEAR 的槽全空（所有層，含 MINOR，Q16）：槽 [x0, x1) 與 [sp − 80, sp + 80] 相交
export const SPAWN_CLEAR = 80;
// 家鄉村莊的中心離出生點要 > VILLAGE_MIN（anchors.ts 選槽、structures/village.ts 放置共用）
export const VILLAGE_MIN = 200;
export const touchesSpawnClear = (x0: number, x1: number, sp: number): boolean => x0 <= sp + SPAWN_CLEAR && x1 > sp - SPAWN_CLEAR;

// 藍圖放的物件（World 載入欄時登錄，見 column.ts 的 GenExtras）
export interface BpChest { x: number; y: number; kind: ChestKind; extra?: ItemId[] }
export interface BpPot { x: number; y: number; drops: Drop[] }
export interface BpTablet { x: number; y: number; id: number }
export interface BpLandmark { x: number; y: number; tile: number; site: string }
// 地面覆寫：欄 x0 + k 的地面（第一個實心格 y）= tops[k]
export interface BpGround { x0: number; tops: Int16Array }
// 免挖洞箱：箱內的格不挖噪聲洞穴、不當地表入口（礦照常換——礦照 fill.ts 的逐帶宿主表，結構本身之後由 stamp 蓋；主坑道照挖）
export interface BpBox { x: number; y: number; w: number; h: number }

export interface Blueprint {
  id: number; kind: BpKind; layer: Layer; x: number; y: number; w: number; h: number;
  // 每格 5 個數：x, y, fg|KEEP, wall|KEEP, liq|KEEP（liq = amount << 8 | type）；依序蓋
  cells: Int32Array;
  chests: BpChest[];
  pots: BpPot[];
  tablets: BpTablet[];
  landmarks: BpLandmark[];
  // 站得住的格（給石碑用，M2a Task 14 的 lore.homeDecor）：那格與頭頂那格是空氣、腳下實心（成品裡也是：腳下是藍圖畫的實心格，
  // 或在 solid 部件內的天然格）、不在液體裡；建構器自己算（地標 / 箱子那格不算）
  floors: { x: number; y: number }[];
  // 地面覆寫（只有 SURFACE 層的藍圖有，Q4）
  ground: BpGround | null;
  solid: BpBox | null;
  // 聚落 / 地城的描述（錨點 = 外框 x）
  site: GenSite | null;
  // true = 佔滿整個地區的錨點（家鄉地城）：外框只需在地區 [r.x0, r.x1) 內，豁免 SLOT_PAD 槽邊距（Q2）
  wholeRegion: boolean;
  // 部件（Task 11 修正 2，控制者裁決 A）：藍圖實際佔的範圍 = 這幾塊的聯集（都在外框內）。沒有 = 整個外框。
  // 跨層讓位（crossYields / liquidYields）與錨點跨層相交的 RangeError 用部件判定（partsMeet）；外框照舊用在索引、分段填、ANCHOR_MAX_W、可用範圍。
  // 契約：部件外的格藍圖一律不寫（cells / ground / 物件都在部件內），fill 的免挖洞箱也只算 solid 與部件相交的部分（solidParts）
  parts?: BpBox[];
  // 大藍圖（家鄉地城）：cells 依 (x >> 5, y, x) 排序，欄號（x >> 5）→ 該欄的格在 cells 的 [起, 訖)（以 Int32 為單位）；
  // stamp 有它就只掃該欄的範圍（同一藍圖每格只出現一次，排序不改蓋出來的結果）
  colIndex?: Map<number, [number, number]>;
  // 變體（石室 alcove：'snow' / 'desert'，Task 14；lore.homeDecor 依它放第 10 / 11 塊石碑）
  variant?: string;
  // 礦坑的密室室內（Task 14：密室的石碑只放在這裡面的 floors；坑道的石碑放在外面的 floors）
  secret?: BpBox;
}

// 依列序（y, x）的 cells → 依 (x >> 5, y, x) 排序的 cells 與 colIndex（每欄內保持原本的列序）
export function indexColumns(cells: Int32Array): { cells: Int32Array; colIndex: Map<number, [number, number]> } {
  const count = new Map<number, number>();
  for (let k = 0; k < cells.length; k += 5) { const c = cells[k] >> 5; count.set(c, (count.get(c) ?? 0) + 5); }
  const cols = [...count.keys()].sort((a, b) => a - b), colIndex = new Map<number, [number, number]>(), next = new Map<number, number>();
  let at = 0;
  for (const c of cols) { const n = count.get(c)!; colIndex.set(c, [at, at + n]); next.set(c, at); at += n; }
  const out = new Int32Array(cells.length);
  for (let k = 0; k < cells.length; k += 5) {
    const c = cells[k] >> 5, i = next.get(c)!;
    out.set(cells.subarray(k, k + 5), i);
    next.set(c, i + 5);
  }
  return { cells: out, colIndex };
}

// 藍圖佔的範圍（部件；沒有部件 = 整個外框）
export const partsOf = (b: Blueprint): readonly BpBox[] => b.parts ?? [{ x: b.x, y: b.y, w: b.w, h: b.h }];
const boxMeet = (a: BpBox, b: BpBox): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// 兩份藍圖的部件有相交的（沒有部件的藍圖就是整個外框，與原本的外框判定相同）
export function partsMeet(a: Blueprint, b: Blueprint): boolean {
  if (!boxMeet(a, b)) return false;
  for (const p of partsOf(a)) for (const q of partsOf(b)) if (boxMeet(p, q)) return true;
  return false;
}
// 盒子與一組盒子有相交的
export const boxHits = (a: BpBox, list: readonly BpBox[]): boolean => list.some((q) => boxMeet(a, q));
// 免挖洞箱只算與部件相交的部分（沒有部件 = solid 本身）
export function solidParts(b: Blueprint): BpBox[] {
  const s = b.solid;
  if (!s) return [];
  if (!b.parts) return [s];
  const out: BpBox[] = [];
  for (const p of b.parts) {
    const x0 = Math.max(s.x, p.x), y0 = Math.max(s.y, p.y), x1 = Math.min(s.x + s.w, p.x + p.w), y1 = Math.min(s.y + s.h, p.y + p.h);
    if (x1 > x0 && y1 > y0) out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  return out;
}

// 沒有物件的藍圖的新欄位
export const emptyObjects = (): Pick<Blueprint, 'pots' | 'tablets' | 'landmarks' | 'floors' | 'ground' | 'solid' | 'site' | 'wholeRegion'> =>
  ({ pots: [], tablets: [], landmarks: [], floors: [], ground: null, solid: null, site: null, wholeRegion: false });

// 建一份藍圖的上下文：s = 結構雜湊種子、id = structureId、槽的範圍、所屬地區、側寫、該地塊的版面版本；
// groundAt(x) = profile.surfaceAt(x) 被與 x 相交、有 ground 的 SURFACE 層藍圖覆寫（Q4）——只有 SKY / MINOR 層的建構器可以呼叫
// （SURFACE / UNDER / DEEP 的建構器讀 c.profile），所以沒有循環（BlueprintIndex.groundAt 重入會丟錯）。
// 錨點建構器的 slotX0 / slotX1 是錨點的可用範圍（anchors.anchorSpan：含坑道的槽只給避開坑道帶後較大的一側；wholeRegion 給整個地區）。
// rank：家鄉錨點在同種錨點裡的名次（可用範圍中點離出生點由近到遠，平手取 x 小的；0 = 最近）；外圍錨點與非錨點 = undefined。
// spawnX：家鄉地塊的出生點 x（BlueprintIndex 與 anchors.ts 同一個來源：home.x0 + SPAWN_X − HOME_X0）；外圍地塊 = undefined
export interface BpCtx {
  seed: string; s: number; id: number; slotX0: number; slotX1: number; region: RegionInfo; profile: Profile2; ver: number;
  groundAt(x: number): number;
  rank?: number;
  spawnX?: number;
  // 家鄉錨點的禁區（BlueprintIndex.surfaceBan）：通到外面的豎井 / 小點位的外框不得與它相交；其他藍圖 = undefined。
  //   UNDER / DEEP（Task 11 修正 2）：同一片家鄉表層錨點（村莊 / 遺跡）的範圍——有建構器的用實際藍圖的部件，沒有的用預測的 x 範圍 × 整個世界高；
  //     Task 14 加上空島錨點的可用範圍 × 天空到地表（空島的建構器讀 groundAt，這裡不能建它）；DEEP 另外加上地下層錨點的部件（熔岩祭壇往上的豎井）。
  //   MINOR（Task 14，出生點石碑）：同一個地區其他各層（SURFACE / UNDER / DEEP / SKY）與這一槽相交的原始藍圖的部件（MINOR 一律讓位，錨點讓位 = RangeError）
  surfaceBan?: readonly BpBox[];
}

// 外框內的暫存格（三層各一，初值 KEEP）：結構先在這裡畫（可以讀自己畫過的格），最後依列序輸出 cells
export class BpGrid {
  private readonly f: Int32Array;
  private readonly wl: Int32Array;
  private readonly lq: Int32Array;
  constructor(readonly x: number, readonly y: number, readonly w: number, readonly h: number) {
    const n = w * h;
    this.f = new Int32Array(n).fill(KEEP); this.wl = new Int32Array(n).fill(KEEP); this.lq = new Int32Array(n).fill(KEEP);
  }
  private at(x: number, y: number): number {
    const dx = x - this.x, dy = y - this.y;
    if (dx < 0 || dx >= this.w || dy < 0 || dy >= this.h) throw new RangeError(`blueprint cell (${x}, ${y}) outside its box`);
    return dy * this.w + dx;
  }
  fg(x: number, y: number, t: number): void { this.f[this.at(x, y)] = t; }
  wall(x: number, y: number, t: number): void { this.wl[this.at(x, y)] = t; }
  liq(x: number, y: number, v: number): void { this.lq[this.at(x, y)] = v; }
  getFg(x: number, y: number): number { return this.f[this.at(x, y)]; }
  getWall(x: number, y: number): number { return this.wl[this.at(x, y)]; }
  getLiq(x: number, y: number): number { return this.lq[this.at(x, y)]; }
  // 有任何一層不是 KEEP 的格，依列序
  cells(): Int32Array {
    const out: number[] = [];
    for (let dy = 0; dy < this.h; dy++) for (let dx = 0; dx < this.w; dx++) {
      const i = dy * this.w + dx;
      if (this.f[i] !== KEEP || this.wl[i] !== KEEP || this.lq[i] !== KEEP) out.push(this.x + dx, this.y + dy, this.f[i], this.wl[i], this.lq[i]);
    }
    return Int32Array.from(out);
  }
}

// 外框 x：依序試槽內 3 個候選中心（置中、−槽寬 / 4、+槽寬 / 4），外框要在 [slotX0 + 8, slotX1 − 8) 內、不壓到坑道避讓帶，再過 ok（結構自己的條件）。
// force：ok 全不過時用第一個放得下的候選（都放不下就夾進槽裡）；不 force 時沒有就回 null。
// 主坑道：含 shaftX 的槽不放表層 / 地下藍圖（BlueprintIndex）。表層槽 340 寬：坑道離 shaftX 最多 SHAFT_REACH（19）格、
// 候選外框離槽邊至少 槽寬 / 4 − 外框半寬，鄰槽的表層結構碰不到坑道。地下 / 深層槽只有 170 寬，這個論證不成立，
// 所以 UNDER / DEEP 的外框（含 force、含夾進槽裡的位置）必須在避讓帶 [sx − SHAFT_REACH − 1, sx + SHAFT_REACH + 2) 之外（Q3 / Q3b：
// 涵蓋 [sx − SHAFT_HALF − 4, sx + SHAFT_HALF + 4] 與坑道底的圓室），放不下就回 null（blueprint.test / objects.test 釘住）
// 主坑道避讓帶 [l, r)（placeX 與錨點的可用範圍 anchors.anchorSpan 共用）：外框 [x, x + w) 要 x + w ≤ l 或 x ≥ r
export function shaftBand(sx: number): { l: number; r: number } { return { l: sx - SHAFT_REACH - 1, r: sx + SHAFT_REACH + 2 }; }

// x 區間 [x0, x1)
export interface Span { x0: number; x1: number }
// 槽 sl 扣掉坑道帶（sx 不是有限數 = 沒有坑道）與 avoid 的各區間後最寬的一段（平手取左邊的；全被扣光 = 槽左端、寬 0）；shaft = 槽含 sx。
// 錨點的可用範圍（anchors.anchorSpan）與家鄉含坑道槽的機率礦坑（BlueprintIndex）共用
export function bandFreeSpan(sl: Span, sx: number, avoid: readonly Span[] = []): { x0: number; x1: number; shaft: boolean } {
  const shaft = Number.isFinite(sx) && sx >= sl.x0 && sx < sl.x1, cut: Span[] = [...avoid];
  if (Number.isFinite(sx)) { const { l, r } = shaftBand(sx); cut.push({ x0: l, x1: r }); }
  let pieces: Span[] = [{ x0: sl.x0, x1: sl.x1 }];
  for (const c of cut) pieces = pieces.flatMap((p) => (c.x1 <= p.x0 || c.x0 >= p.x1 ? [p] : [{ x0: p.x0, x1: c.x0 }, { x0: c.x1, x1: p.x1 }].filter((q) => q.x1 > q.x0)));
  let best: Span = { x0: sl.x0, x1: sl.x0 };
  for (const p of pieces.sort((a, b) => a.x0 - b.x0)) if (p.x1 - p.x0 > best.x1 - best.x0) best = p;
  return { x0: best.x0, x1: best.x1, shaft };
}

// 外框 [x, x + w) 往兩側延伸時的界線 [lo, hi)：槽（c.slotX0 / slotX1）兩端各留 SLOT_PAD；UNDER / DEEP 另外不越過主坑道避讓帶（同 placeX）
export function clearRange(c: BpCtx, x: number, w: number): Span {
  let lo = c.slotX0 + SLOT_PAD, hi = c.slotX1 - SLOT_PAD;
  const layer = decodeStructureId(c.id).layer;
  const sx = layer === BP_UNDER || layer === BP_DEEP ? shaftX(seedInt(c.seed, 'g2-shaft'), c.region) : NaN;
  if (Number.isFinite(sx)) { const { l, r } = shaftBand(sx); if (x + w <= l) hi = Math.min(hi, l); else if (x >= r) lo = Math.max(lo, r); }
  return { x0: lo, x1: hi };
}

// 置中、但中心離 avoid 要 > minD 的外框 x（村莊：家鄉的錨點建構器與 anchors.ts 的選槽共用）：外框 [x, x + w) 在 [x0 + SLOT_PAD, x1 − SLOT_PAD) 內，
// 中心 = x + ((w − 1) >> 1)。先置中（x0 + ((x1 − x0) >> 1) − (w >> 1)）；中心離 avoid ≤ minD → 往遠離 avoid 的方向移到剛好 > minD；
// 放不下 → null。avoid 不是有限數 = 不限制（只置中，放不下也是 null）
export function centerAway(x0: number, x1: number, w: number, avoid: number, minD: number): number | null {
  const lo = x0 + SLOT_PAD, hi = x1 - SLOT_PAD - w, half = (w - 1) >> 1;
  if (hi < lo) return null;
  const x = x0 + ((x1 - x0) >> 1) - (w >> 1), c = x + half;
  if (!Number.isFinite(avoid) || Math.abs(c - avoid) > minD) return x >= lo && x <= hi ? x : null;
  const moved = c >= avoid ? avoid + minD + 1 - half : avoid - minD - 1 - half;
  return moved >= lo && moved <= hi ? moved : null;
}

export function placeX(c: BpCtx, w: number, force: boolean, ok: (x: number) => boolean): number | null {
  const sw = c.slotX1 - c.slotX0, mid = c.slotX0 + (sw >> 1), q = Math.floor(sw / 4);
  const layer = decodeStructureId(c.id).layer;
  const sx = layer === BP_UNDER || layer === BP_DEEP ? shaftX(seedInt(c.seed, 'g2-shaft'), c.region) : NaN;
  const band = shaftBand(sx), clear = (x: number): boolean => !Number.isFinite(sx) || x + w <= band.l || x >= band.r;
  const fits = (x: number): boolean => x >= c.slotX0 + SLOT_PAD && x + w <= c.slotX1 - SLOT_PAD && clear(x);
  let first: number | null = null;
  for (const m of [mid, mid - q, mid + q]) {
    const x = m - (w >> 1);
    if (!fits(x)) continue;
    if (ok(x)) return x;
    if (first === null) first = x;
  }
  if (!force) return null;
  if (first !== null) return first;
  const x = Math.max(c.slotX0 + SLOT_PAD, Math.min(mid - (w >> 1), c.slotX1 - SLOT_PAD - w));
  return clear(x) ? x : null;
}
