// bpCanvas.ts — gen2 的繪製畫布：在藍圖外框內畫（BpGrid，畫出外框丟 RangeError），最後 toBlueprint 輸出藍圖。
// 讀 = 畫過的格，否則天然地層（地表 = profile 的地表；y < 地表 空氣、< rock 泥土、< deep 石、< molten 深層岩、其下玄武岩；
// 背景牆從地表下 3 格起照同一分層，同 fill.ts 的 WALL_FROM）——只是畫圖時的近似（生態表層由 fill.ts 決定），不是成品。
// 契約：回退讀取假設天然格是實心、沒有洞穴（不知道 fill.ts 的噪聲洞穴 / 地表入口）。畫圖碼「讀到實心就不畫」的格（KEEP）在成品裡
// 照 fill 的結果，可能是洞——所以建構器必須用 solid（fillNatural）蓋住所有依賴實心的格（地城塔的整平帶、村莊每欄到 max(地面 + 6, 原地表 + 3)、
// 地廳隧道的地板 floorY 與頂 floorY − 5；structures/dungeon.ts、village.ts、hall.ts），並有成品裡真的是實心的測試（settlements.test / dungeon.test）。
// setSurface 記進藍圖的 ground（只有 SURFACE 層的藍圖該有 ground，Q4，由呼叫端負責）；fillNatural 只把座標併進 solid 箱
// （fill.ts 在箱內只填天然材質、不挖洞）；chest 畫 T.CHEST 並記 BpChest、addItem 推進該箱的 extra。
// 不 import blueprint.ts（只依賴 bpcore.ts 與葉模組）。
// 本資料夾的非測試檔不得出現連續兩個星號、亂數與超越函數（測試會 grep），註解一律用 //。
import { T, W, SOLID_LUT } from '../../tiles';
import type { ChestKind, Drop } from '../../loot';
import type { ItemId } from '../../items';
import type { GenSite } from '../../genTypes';
import type { Profile2 } from '../profile';
import { BpGrid, KEEP, type Blueprint, type BpBox, type BpChest, type BpKind, type BpLandmark, type BpPot, type BpTablet, type Layer } from '../bpcore';
import type { Canvas } from './canvas';

// 天然背景牆從地表下這麼多格起（同 fill.ts）
const WALL_FROM = 3;

export interface BpCanvasExtra {
  landmarks?: BpLandmark[];
  tablets?: BpTablet[];
  site?: GenSite | null;
  floors?: { x: number; y: number }[];
}

export class BpCanvas implements Canvas {
  private readonly g: BpGrid;
  // 外框各欄 setSurface 的值（KEEP = 沒設過）
  private readonly tops: Int32Array;
  private readonly chests: BpChest[] = [];
  private readonly pots: BpPot[] = [];
  private solid: BpBox | null = null;

  constructor(private readonly box: BpBox, private readonly profile: Profile2) {
    this.g = new BpGrid(box.x, box.y, box.w, box.h);
    this.tops = new Int32Array(box.w).fill(KEEP);
  }

  inBounds(x: number, y: number): boolean {
    const b = this.box;
    return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  }

  fg(x: number, y: number): number {
    const t = this.g.getFg(x, y);
    if (t !== KEEP) return t;
    const I = this.profile.info(x);
    if (y < I.surface) return T.AIR;
    if (y < I.rock) return T.DIRT;
    if (y < I.deep) return T.STONE;
    if (y < I.molten) return T.DEEP_STONE;
    return T.BASALT;
  }

  wall(x: number, y: number): number {
    const w = this.g.getWall(x, y);
    if (w !== KEEP) return w;
    const I = this.profile.info(x);
    if (y < I.surface + WALL_FROM) return W.NONE;
    if (y < I.rock) return W.DIRT_WALL;
    if (y < I.deep) return W.STONE_WALL;
    if (y < I.molten) return W.DEEP_STONE_WALL;
    return W.BASALT_WALL;
  }

  isSolid(x: number, y: number): boolean { return SOLID_LUT[this.fg(x, y)] === 1; }
  setFg(x: number, y: number, t: number): void { this.g.fg(x, y, t); }
  setWall(x: number, y: number, w: number): void { this.g.wall(x, y, w); }
  clearLiquid(x: number, y: number): void { this.g.liq(x, y, 0); }

  setSurface(x: number, y: number): void { this.tops[this.col(x)] = y; }
  surfaceAt(x: number): number {
    const k = x - this.box.x, v = k >= 0 && k < this.box.w ? this.tops[k] : KEEP;
    return v !== KEEP ? v : this.profile.surfaceAt(x);
  }

  chest(x: number, y: number, kind: ChestKind): void {
    this.g.fg(x, y, T.CHEST);
    const i = this.chests.findIndex((c) => c.x === x && c.y === y);
    const c: BpChest = { x, y, kind };
    if (i >= 0) this.chests[i] = c; else this.chests.push(c);
  }
  addItem(x: number, y: number, item: ItemId): void {
    const c = this.chests.find((q) => q.x === x && q.y === y);
    if (!c) throw new Error(`BpCanvas.addItem: no chest at (${x}, ${y})`);
    (c.extra ??= []).push(item);
  }
  potDrop(x: number, y: number, drops: Drop[]): void {
    this.check(x, y);
    this.pots.push({ x, y, drops: drops.map((d) => ({ ...d })) });
  }

  fillNatural(x: number, y: number): void {
    this.check(x, y);
    const s = this.solid;
    if (!s) { this.solid = { x, y, w: 1, h: 1 }; return; }
    const x0 = Math.min(s.x, x), y0 = Math.min(s.y, y), x1 = Math.max(s.x + s.w, x + 1), y1 = Math.max(s.y + s.h, y + 1);
    this.solid = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ground = setSurface 過的最左到最右欄（中間沒設過的欄取 profile 地表）；沒設過 = null
  toBlueprint(id: number, kind: BpKind, layer: Layer, extra: BpCanvasExtra = {}): Blueprint {
    const b = this.box;
    let lo = -1, hi = -1;
    for (let k = 0; k < b.w; k++) if (this.tops[k] !== KEEP) { if (lo < 0) lo = k; hi = k; }
    let ground: Blueprint['ground'] = null;
    if (lo >= 0) {
      const tops = new Int16Array(hi - lo + 1);
      for (let k = lo; k <= hi; k++) tops[k - lo] = this.surfaceAt(b.x + k);
      ground = { x0: b.x + lo, tops };
    }
    return {
      id, kind, layer, x: b.x, y: b.y, w: b.w, h: b.h, cells: this.g.cells(),
      chests: this.chests.map((c) => (c.extra ? { ...c, extra: [...c.extra] } : { ...c })),
      pots: this.pots.map((p) => ({ x: p.x, y: p.y, drops: p.drops.map((d) => ({ ...d })) })),
      tablets: extra.tablets ?? [], landmarks: extra.landmarks ?? [], floors: extra.floors ?? [],
      ground, solid: this.solid ? { ...this.solid } : null, site: extra.site ?? null, wholeRegion: false,
    };
  }

  // 外框外丟 RangeError（同 BpGrid）
  private check(x: number, y: number): void {
    if (!this.inBounds(x, y)) throw new RangeError(`blueprint cell (${x}, ${y}) outside its box`);
  }
  private col(x: number): number {
    const k = x - this.box.x;
    if (k < 0 || k >= this.box.w) throw new RangeError(`blueprint column ${x} outside its box`);
    return k;
  }
}
