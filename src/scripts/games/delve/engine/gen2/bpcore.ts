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

export type BpKind = 'cabin' | 'ruin' | 'shipwreck' | 'crate' | 'lake' | 'cave_lake' | 'lava_pool';
// 層：表層 / 地下 / 深層 / 空中（浮空島）/ 小點（minor）；結構 id 的 layer 欄位 3 bit（structId.ts）
export const BP_SURFACE = 0, BP_UNDER = 1, BP_DEEP = 2, BP_SKY = 3, BP_MINOR = 4, LAND_SLOT_W = 340, KEEP = -1;
export type Layer = 0 | 1 | 2 | 3 | 4;
// 外框離槽兩端至少 SLOT_PAD 格
export const SLOT_PAD = 8;
// 地下 / 深層 / 小點位的槽寬（表層 / 天空照 LAND_SLOT_W）；每個陸地地區各層各自切槽、各自有 slot 序號（最後一槽吃餘數）
export const SUB_SLOT_W = 170;
export function slotWidth(layer: Layer): number { return layer === BP_SURFACE || layer === BP_SKY ? LAND_SLOT_W : SUB_SLOT_W; }

// 藍圖放的物件（World 載入欄時登錄，見 column.ts 的 GenExtras）
export interface BpChest { x: number; y: number; kind: ChestKind; extra?: ItemId[] }
export interface BpPot { x: number; y: number; drops: Drop[] }
export interface BpTablet { x: number; y: number; id: number }
export interface BpLandmark { x: number; y: number; tile: number; site: string }
// 地面覆寫：欄 x0 + k 的地面（第一個實心格 y）= tops[k]
export interface BpGround { x0: number; tops: Int16Array }
// 免挖洞箱：箱內的格不挖噪聲洞穴、不當入口、不換礦（只填天然材質；主坑道照挖）
export interface BpBox { x: number; y: number; w: number; h: number }

export interface Blueprint {
  id: number; kind: BpKind; layer: Layer; x: number; y: number; w: number; h: number;
  // 每格 5 個數：x, y, fg|KEEP, wall|KEEP, liq|KEEP（liq = amount << 8 | type）；依序蓋
  cells: Int32Array;
  chests: BpChest[];
  pots: BpPot[];
  tablets: BpTablet[];
  landmarks: BpLandmark[];
  // 站得住的格（空氣、腳下實心）：給石碑 / 地標用
  floors: { x: number; y: number }[];
  // 地面覆寫（只有 SURFACE 層的藍圖有，Q4）
  ground: BpGround | null;
  solid: BpBox | null;
  // 聚落 / 地城的描述（錨點 = 外框 x）
  site: GenSite | null;
  // true = 佔滿整個地區的錨點（家鄉地城）：外框只需在地區 [r.x0, r.x1) 內，豁免 SLOT_PAD 槽邊距（Q2）
  wholeRegion: boolean;
}

// 沒有物件的藍圖的新欄位
export const emptyObjects = (): Pick<Blueprint, 'pots' | 'tablets' | 'landmarks' | 'floors' | 'ground' | 'solid' | 'site' | 'wholeRegion'> =>
  ({ pots: [], tablets: [], landmarks: [], floors: [], ground: null, solid: null, site: null, wholeRegion: false });

// 建一份藍圖的上下文：s = 結構雜湊種子、id = structureId、槽的範圍、所屬地區、側寫、該地塊的版面版本；
// groundAt(x) = profile.surfaceAt(x) 被與 x 相交、有 ground 的 SURFACE 層藍圖覆寫（Q4）——只有 SKY / MINOR 層的建構器可以呼叫
// （SURFACE / UNDER / DEEP 的建構器讀 c.profile），所以沒有循環
export interface BpCtx {
  seed: string; s: number; id: number; slotX0: number; slotX1: number; region: RegionInfo; profile: Profile2; ver: number;
  groundAt(x: number): number;
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
export function placeX(c: BpCtx, w: number, force: boolean, ok: (x: number) => boolean): number | null {
  const sw = c.slotX1 - c.slotX0, mid = c.slotX0 + (sw >> 1), q = Math.floor(sw / 4);
  const layer = decodeStructureId(c.id).layer;
  const sx = layer === BP_UNDER || layer === BP_DEEP ? shaftX(seedInt(c.seed, 'g2-shaft'), c.region) : NaN;
  const clear = (x: number): boolean => !Number.isFinite(sx) || x + w <= sx - SHAFT_REACH - 1 || x >= sx + SHAFT_REACH + 2;
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
