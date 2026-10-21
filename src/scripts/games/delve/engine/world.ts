// world.ts — 固定大小 tile 世界。每層一個 typed array（row-major：i = y*width + x）。
// 呼叫端請走與儲存無關的 API（getter / window / forEachChunk / tileXY…）：之後儲存會換成區塊欄（engine/coords.ts 的鍵）。
import { CHUNK } from './constants';
import { tileKey, tileXY as keyToXY, chunkKey, chunkXY, chunkOfX, localX } from './coords';
import type { GenLayers } from './worldgen';
import { SOLID_LUT, PLATFORM_LUT, CLIMB_LUT, T } from './tiles';
import type { Stack } from './inventory';
import { CHEST_SLOTS, type Drop } from './loot';
import { LIQ, LIQ_MAX } from './liquidKind';
export { LIQ, LIQ_MAX } from './liquidKind';

export type ChestSlots = (Stack | null)[];
/** 生態區（每欄地表所屬；地下的過渡邊界另有起伏） */
export const BIOME = { FOREST: 0, DESERT: 1, SNOW: 2, JUNGLE: 3 } as const;
export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

/** 矩形批次讀取的扁平暫存（world.window）：索引 (y-y0)*w + (x-x0)；各層長度 ≥ w*h（重用時可能更長） */
export interface TileWindow {
  x0: number; y0: number; w: number; h: number;
  fg: Uint8Array; wall: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array;
  frozen: Uint8Array; half: Uint8Array; variant: Uint8Array;
}

/** 材質變體 0..2（座標雜湊；任何座標都有值，包括世界外） */
export function variantHash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) % 3;
}

function allocWindow(n: number): TileWindow {
  return {
    x0: 0, y0: 0, w: 0, h: 0,
    fg: new Uint8Array(n), wall: new Uint8Array(n), liquid: new Uint8Array(n), liquidType: new Uint8Array(n),
    frozen: new Uint8Array(n), half: new Uint8Array(n), variant: new Uint8Array(n),
  };
}

export class World {
  readonly width: number;
  readonly height: number;
  /** 水平邊界（xMax 不含）；扁平世界恆為 0 / width */
  readonly xMin: number;
  readonly xMax: number;
  readonly fg: Uint8Array;
  readonly wall: Uint8Array;
  /** 每格液體量 0..255（0 = 沒有液體） */
  readonly liquid: Uint8Array;
  /** 每格液體種類（LIQ.*，低 2 bit；液體量為 0 時一律 0） */
  readonly liquidType: Uint8Array;
  /** 每格是否結冰（地表水在冬天：碰撞算實心、液體模擬不動它；見 frost.ts） */
  readonly frozen: Uint8Array;
  /** 每格是不是半格方塊（建築木槌；只有下半部實心）——存檔內容（header.halves） */
  readonly half: Uint8Array;
  /** 每格材質變體 0..2（座標雜湊，非存檔內容） */
  readonly variant: Uint8Array;
  readonly chunksX: number;
  readonly chunksY: number;
  /** 地表層 y（worldSurface）：此線以上、無牆、非擋光的格會發天空光 */
  surfaceY = 0;
  /** 每欄生成時的地表高度（地形 pass 的第一個實心格 y；之後玩家挖掘不改變）。HUD 深度用。 */
  surface: Int16Array;
  /** 岩層起始 y（泥土層之下；最深的那欄） */
  rockY = 0;
  /** 洞穴層（深層岩、大洞窟網路）起始 y（最淺的那欄） */
  cavernY = 0;
  /** 熔岩深淵起始 y（最淺的那欄） */
  moltenY = 0;
  /** 每欄地表的生態區（BIOME） */
  readonly biome: Uint8Array;
  /** 每欄的深度層線（生成器填、DelveGame 建構時再設一次；沒有時 layersAt 用 rockY / cavernY / moltenY）。系統一律走 layersAt(x) */
  layers: GenLayers | null = null;
  /** 箱子內容：key = tile index（y*width+x） */
  readonly chests = new Map<number, ChestSlots>();
  /** 生成時指定的陶罐額外掉落（地城鑰匙），key = tile index；由 seed 重算、不存檔 */
  readonly potDrops = new Map<number, Drop[]>();
  /** 已用金鑰匙打開的金寶箱（tile index）——存檔內容 */
  readonly unlocked = new Set<number>();
  /** 累計用掉的鑰匙數（存檔內容） */
  keysUsed = 0;
  /** 需重畫的 chunk（render 用，drainDirty 取走） */
  private readonly dirty = new Set<number>();
  /** 生成後被改過的 chunk（存檔 diff 用） */
  readonly modifiedChunks = new Set<number>();
  /** 液體有變動、要重畫液體層 / 小地圖的 chunk（drainLiquidDirty 取走；不影響 tile chunk 快取） */
  private readonly liquidDirty = new Set<number>();
  /** 生成後液體被改過的 chunk（存檔用；與 modifiedChunks 分開，流動不會讓 tile 被存） */
  readonly liquidModified = new Set<number>();
  /** 前景 tile 改變時的通知（液體模擬用來喚醒鄰格）；setFg 之後呼叫 */
  onTileChange: ((x: number, y: number) => void) | null = null;
  /** 前景 / 背景牆每改一格 +1（據點評分等快取用來判斷要不要重算） */
  rev = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.xMin = 0;
    this.xMax = width;
    const n = width * height;
    this.fg = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidType = new Uint8Array(n);
    this.frozen = new Uint8Array(n);
    this.half = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.surface = new Int16Array(width);
    this.biome = new Uint8Array(width);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) this.variant[y * width + x] = variantHash(x, y);
    }
    this.chunksX = Math.ceil(width / CHUNK);
    this.chunksY = Math.ceil(height / CHUNK);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  /** (x,y) 的 tile 鍵（中央 = y*width + x；見 coords.ts） */
  idx(x: number, y: number): number { return tileKey(this.width, x, y); }
  /** tile 鍵 → 座標 */
  tileXY(k: number): { x: number; y: number } { return keyToXY(this.width, k); }
  /** 第 x 欄的地表高度（越界夾到邊欄）。 */
  surfaceAt(x: number): number {
    if (this.width === 0) return this.surfaceY;
    const cx = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.surface[cx];
  }

  getFg(x: number, y: number): number {
    if (!this.inBounds(x, y)) return T.STONE;
    return this.fg[y * this.width + x];
  }
  getWall(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.wall[y * this.width + x];
  }
  /** 碰撞用：左右與下方邊界視為實心，上方（天空）可穿。 */
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= this.width || y >= this.height) return true;
    if (y < 0) return false;
    const i = y * this.width + x;
    return SOLID_LUT[this.fg[i]] === 1 || this.frozen[i] === 1;
  }

  /** 半格方塊（只有下半部實心；物理 / 繪製用） */
  isHalf(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.half[y * this.width + x] === 1;
  }
  /** 設定 / 取消半格（只對實心方塊）；回傳是否有改變 */
  setHalf(x: number, y: number, on: boolean): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    const v = on && SOLID_LUT[this.fg[i]] === 1 ? 1 : 0;
    if (this.half[i] === v) return false;
    this.half[i] = v;
    this.touch(x, y);
    return true;
  }

  /** 是否結冰（越界 false） */
  isFrozen(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return this.frozen[y * this.width + x] === 1;
  }
  /** 設定 / 取消結冰（霜系統用；不標 dirty——呼叫端自己決定重畫哪些 chunk） */
  setFrozen(x: number, y: number, on: boolean): void {
    if (!this.inBounds(x, y)) return;
    this.frozen[y * this.width + x] = on ? 1 : 0;
  }
  /** (x,y) 的材質變體 0..2（世界外照座標雜湊） */
  variantAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return variantHash(x, y);
    return this.variant[y * this.width + x];
  }
  /** 第 x 欄的深度層線（越界夾到邊欄） */
  layersAt(x: number): { rock: number; deep: number; molten: number } {
    const L = this.layers;
    if (!L || this.width === 0) return { rock: this.rockY, deep: this.cavernY, molten: this.moltenY };
    const cx = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return { rock: L.rock[cx], deep: L.deep[cx], molten: L.molten[cx] };
  }

  /**
   * 把矩形 [x0, x0+w) × [y0, y0+h) 的各層複製進扁平暫存（批次讀取：光照、烘焙、地圖…）。
   * 世界外的格：fg = STONE、其餘 0、variant 照座標雜湊（同 getter）。out 夠大就重用、不配置。
   */
  window(x0: number, y0: number, w: number, h: number, out?: TileWindow): TileWindow {
    const n = w * h;
    const win = out && out.fg.length >= n ? out : allocWindow(n);
    win.x0 = x0; win.y0 = y0; win.w = w; win.h = h;
    const W = this.width;
    const ix0 = Math.max(x0, 0), ix1 = Math.min(x0 + w, W);
    for (let r = 0; r < h; r++) {
      const y = y0 + r, o = r * w;
      if (y < 0 || y >= this.height || ix1 <= ix0) { fillOutside(win, o, x0, y, 0, w); continue; }
      if (ix0 > x0) fillOutside(win, o, x0, y, 0, ix0 - x0);
      const s = y * W + ix0, e = y * W + ix1, d = o + ix0 - x0;
      win.fg.set(this.fg.subarray(s, e), d);
      win.wall.set(this.wall.subarray(s, e), d);
      win.liquid.set(this.liquid.subarray(s, e), d);
      win.liquidType.set(this.liquidType.subarray(s, e), d);
      win.frozen.set(this.frozen.subarray(s, e), d);
      win.half.set(this.half.subarray(s, e), d);
      win.variant.set(this.variant.subarray(s, e), d);
      if (ix1 < x0 + w) fillOutside(win, o, x0, y, ix1 - x0, w);
    }
    return win;
  }

  /** 單向平台（物理用） */
  isPlatform(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return PLATFORM_LUT[this.fg[y * this.width + x]] === 1;
  }

  /** 可攀爬（繩索；物理用） */
  isClimbable(x: number, y: number): boolean {
    if (!this.inBounds(x, y)) return false;
    return CLIMB_LUT[this.fg[y * this.width + x]] === 1;
  }

  setFg(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    const old = this.fg[i];
    if (old === id) return false;
    this.fg[i] = id;
    this.half[i] = 0;
    if (this.frozen[i] && SOLID_LUT[id] === 1) this.frozen[i] = 0;
    if ((old === T.CHEST || old === T.LOCKED_CHEST) && id !== T.CHEST && id !== T.LOCKED_CHEST) this.chests.delete(i);
    if ((id === T.CHEST || id === T.LOCKED_CHEST) && !this.chests.has(i)) this.chests.set(i, new Array<Stack | null>(CHEST_SLOTS).fill(null));
    this.touch(x, y);
    this.onTileChange?.(x, y);
    return true;
  }

  // ── 液體 ─────────────────────────────────────────────
  /** (x,y) 的液體量（越界 0） */
  getLiquid(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.liquid[y * this.width + x];
  }
  /** (x,y) 的液體種類（LIQ.*；越界或沒有液體 = LIQ.NONE） */
  getLiquidType(x: number, y: number): number {
    if (!this.inBounds(x, y)) return LIQ.NONE;
    return this.liquidType[y * this.width + x];
  }
  /** 設定液體（量夾到 0..255；量 0 → 種類清成 NONE）。標記液體 dirty / 已修改 chunk。回傳是否有改變。 */
  setLiquid(x: number, y: number, amount: number, type: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    const a = Math.max(0, Math.min(LIQ_MAX, Math.round(amount)));
    const t = a === 0 ? LIQ.NONE : type;
    if (this.liquid[i] === a && this.liquidType[i] === t) return false;
    this.liquid[i] = a;
    this.liquidType[i] = t;
    this.touchLiquid(i);
    return true;
  }
  /** 直接寫液體（模擬熱路徑用；不夾值、不標 dirty——寫完自己 touchLiquidAt；量 0 時種類請給 LIQ.NONE） */
  setLiquidRaw(x: number, y: number, amount: number, type: number): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    this.liquid[i] = amount;
    this.liquidType[i] = type;
  }
  /** tile 鍵 i 的液體已直接改寫（模擬熱路徑用）：標記 dirty / 已修改 */
  touchLiquid(i: number): void {
    const { x, y } = this.tileXY(i);
    this.touchLiquidAt(x, y);
  }
  /** (x,y) 的液體已直接改寫：標記液體 dirty / 已修改 chunk */
  touchLiquidAt(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const ci = this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
    this.liquidDirty.add(ci);
    this.liquidModified.add(ci);
  }
  /** 取走並清空液體 dirty chunk 清單 */
  drainLiquidDirty(): number[] {
    const out = [...this.liquidDirty];
    this.liquidDirty.clear();
    return out;
  }
  /** 液體總量（測試 / debug） */
  liquidTotal(type?: number): number {
    let s = 0;
    const L = this.liquid, LT = this.liquidType;
    for (let i = 0; i < L.length; i++) if (L[i] && (type === undefined || LT[i] === type)) s += L[i];
    return s;
  }
  /** (x,y) 的 chunk 標為已修改（箱子內容變動等不改 tile 的修改；不需重畫） */
  markModified(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    this.modifiedChunks.add(this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK)));
  }
  /** 第 x 欄地表的生態區 */
  biomeAt(x: number): number {
    if (this.width === 0) return BIOME.FOREST;
    return this.biome[Math.max(0, Math.min(this.width - 1, Math.floor(x)))];
  }
  setWall(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const i = y * this.width + x;
    if (this.wall[i] === id) return false;
    this.wall[i] = id;
    this.touch(x, y);
    return true;
  }

  /** chunk 鍵（中央 = cy*chunksX + cx；見 coords.ts） */
  chunkIndex(cx: number, cy: number): number { return chunkKey(this.chunksX, cx, cy); }
  chunkCoords(ci: number): { cx: number; cy: number } { return chunkXY(this.chunksX, ci); }
  /** 走過每個常駐 chunk（cy 外層、cx 內層；同 markAllDirty 的順序） */
  forEachChunk(fn: (cx: number, cy: number) => void): void {
    for (let cy = 0; cy < this.chunksY; cy++) for (let cx = 0; cx < this.chunksX; cx++) fn(cx, cy);
  }

  /** 取走並清空 dirty chunk 清單。 */
  drainDirty(): number[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }
  /** 全部 chunk 標 dirty（載入/新世界後讓 render 全重畫）。 */
  markAllDirty(): void {
    for (let i = 0; i < this.chunksX * this.chunksY; i++) this.dirty.add(i);
  }

  private touch(x: number, y: number): void {
    this.rev++;
    const cx = chunkOfX(x), cy = Math.floor(y / CHUNK);
    const ci = this.chunkIndex(cx, cy);
    this.modifiedChunks.add(ci);
    this.dirty.add(ci);
    // 接邊依賴 4 鄰：邊緣格變動也要讓鄰 chunk 重畫
    const lx = localX(x), ly = y - cy * CHUNK;
    if (lx === 0 && cx > 0) this.dirty.add(ci - 1);
    if (lx === CHUNK - 1 && cx < this.chunksX - 1) this.dirty.add(ci + 1);
    if (ly === 0 && cy > 0) this.dirty.add(ci - this.chunksX);
    if (ly === CHUNK - 1 && cy < this.chunksY - 1) this.dirty.add(ci + this.chunksX);
    // 內角補點看斜角鄰格：角落格變動也要讓斜對角 chunk 重畫
    const dxc = lx === 0 && cx > 0 ? -1 : lx === CHUNK - 1 && cx < this.chunksX - 1 ? 1 : 0;
    const dyc = ly === 0 && cy > 0 ? -1 : ly === CHUNK - 1 && cy < this.chunksY - 1 ? 1 : 0;
    if (dxc && dyc) this.dirty.add(ci + dxc + dyc * this.chunksX);
  }
}

/** window 的世界外格：fg = STONE、其餘 0、variant 照座標雜湊（列內 [from, to)） */
function fillOutside(win: TileWindow, o: number, x0: number, y: number, from: number, to: number): void {
  win.fg.fill(T.STONE, o + from, o + to);
  win.wall.fill(0, o + from, o + to);
  win.liquid.fill(0, o + from, o + to);
  win.liquidType.fill(0, o + from, o + to);
  win.frozen.fill(0, o + from, o + to);
  win.half.fill(0, o + from, o + to);
  for (let c = from; c < to; c++) win.variant[o + c] = variantHash(x0 + c, y);
}
