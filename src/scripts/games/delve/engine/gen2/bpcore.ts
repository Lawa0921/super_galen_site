// bpcore.ts — gen2 結構藍圖的基本型別與畫圖工具（blueprint.ts 與 structures/*.ts 共用；本檔不 import 任何結構，
// 所以結構檔先被 import 也沒有循環依賴）。blueprint.ts 會原樣 re-export 這裡的東西。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import type { ChestKind } from '../loot';
import type { RegionInfo } from '../regionInfo';
import type { Profile2 } from './profile';

export type BpKind = 'cabin' | 'ruin' | 'shipwreck' | 'crate' | 'lake' | 'cave_lake' | 'lava_pool';
// 層：表層 / 地下 / 深層 / 空中（浮空島）/ 小點（minor）；結構 id 的 layer 欄位 3 bit（structId.ts）
export const BP_SURFACE = 0, BP_UNDER = 1, BP_DEEP = 2, BP_SKY = 3, BP_MINOR = 4, LAND_SLOT_W = 340, KEEP = -1;
export type Layer = 0 | 1 | 2 | 3 | 4;
// 外框離槽兩端至少 SLOT_PAD 格
export const SLOT_PAD = 8;

export interface Blueprint {
  id: number; kind: BpKind; layer: Layer; x: number; y: number; w: number; h: number;
  // 每格 5 個數：x, y, fg|KEEP, wall|KEEP, liq|KEEP（liq = amount << 8 | type）；依序蓋
  cells: Int32Array;
  chests: { x: number; y: number; kind: ChestKind }[];
}

// 建一份藍圖的上下文：s = 結構雜湊種子、id = structureId、槽的範圍、所屬地區、側寫、該地塊的版面版本
export interface BpCtx { seed: string; s: number; id: number; slotX0: number; slotX1: number; region: RegionInfo; profile: Profile2; ver: number }

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

// 外框 x：依序試槽內 3 個候選中心（置中、−槽寬 / 4、+槽寬 / 4），外框要在 [slotX0 + 8, slotX1 − 8) 內，再過 ok（結構自己的條件）。
// force：ok 全不過時用第一個放得下的候選（都放不下就夾進槽裡）；不 force 時沒有就回 null。
// 主坑道：含 shaftX 的槽不放表層 / 地下藍圖；坑道離 shaftX 最多 SHAFT_REACH（19）格、而候選外框離槽邊至少 槽寬 / 4 − 外框半寬（≥ 85 − 38），
// 所以鄰槽的結構碰不到坑道（blueprint.test 釘住）
export function placeX(c: BpCtx, w: number, force: boolean, ok: (x: number) => boolean): number | null {
  const sw = c.slotX1 - c.slotX0, mid = c.slotX0 + (sw >> 1), q = Math.floor(sw / 4);
  const fits = (x: number): boolean => x >= c.slotX0 + SLOT_PAD && x + w <= c.slotX1 - SLOT_PAD;
  let first: number | null = null;
  for (const m of [mid, mid - q, mid + q]) {
    const x = m - (w >> 1);
    if (!fits(x)) continue;
    if (ok(x)) return x;
    if (first === null) first = x;
  }
  if (!force) return null;
  return first ?? Math.max(c.slotX0 + SLOT_PAD, Math.min(mid - (w >> 1), c.slotX1 - SLOT_PAD - w));
}
