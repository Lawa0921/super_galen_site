// world.ts — 固定大小 tile 世界。每層一個 typed array（row-major：i = y*width + x）。
import { CHUNK } from './constants';
import { SOLID_LUT, PLATFORM_LUT, CLIMB_LUT, T } from './tiles';
import type { Stack } from './inventory';
import { CHEST_SLOTS, type Drop } from './loot';
import { LIQ, LIQ_MAX } from './liquidKind';
export { LIQ, LIQ_MAX } from './liquidKind';

export type ChestSlots = (Stack | null)[];
/** 生態區（每欄地表所屬；地下的過渡邊界另有起伏） */
export const BIOME = { FOREST: 0, DESERT: 1, SNOW: 2, JUNGLE: 3 } as const;
export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

export class World {
  readonly width: number;
  readonly height: number;
  readonly fg: Uint8Array;
  readonly wall: Uint8Array;
  /** 每格液體量 0..255（0 = 沒有液體） */
  readonly liquid: Uint8Array;
  /** 每格液體種類（LIQ.*，低 2 bit；液體量為 0 時一律 0） */
  readonly liquidType: Uint8Array;
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

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const n = width * height;
    this.fg = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    this.liquid = new Uint8Array(n);
    this.liquidType = new Uint8Array(n);
    this.variant = new Uint8Array(n);
    this.surface = new Int16Array(width);
    this.biome = new Uint8Array(width);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        this.variant[y * width + x] = ((h ^ (h >>> 16)) >>> 0) % 3;
      }
    }
    this.chunksX = Math.ceil(width / CHUNK);
    this.chunksY = Math.ceil(height / CHUNK);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }
  idx(x: number, y: number): number { return y * this.width + x; }
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
    return SOLID_LUT[this.fg[y * this.width + x]] === 1;
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
  /** tile index i 的液體已直接改寫（模擬熱路徑用）：標記 dirty / 已修改 */
  touchLiquid(i: number): void {
    const x = i % this.width, y = (i - x) / this.width;
    const ci = this.chunkIndex(Math.floor(x / CHUNK), Math.floor(y / CHUNK));
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
    this.modifiedChunks.add(this.chunkIndex(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
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

  chunkIndex(cx: number, cy: number): number { return cy * this.chunksX + cx; }
  chunkCoords(ci: number): { cx: number; cy: number } {
    return { cx: ci % this.chunksX, cy: Math.floor(ci / this.chunksX) };
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
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const ci = this.chunkIndex(cx, cy);
    this.modifiedChunks.add(ci);
    this.dirty.add(ci);
    // 接邊依賴 4 鄰：邊緣格變動也要讓鄰 chunk 重畫
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
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
