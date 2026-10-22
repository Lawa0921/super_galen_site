// world.ts — tile 世界，儲存單位是區塊欄（engine/column.ts：32 格寬 × height，索引 (y << 5) | (x & 31)）。
// 欄有三種狀態（B2、B7、B8）：常駐（在記憶體、可讀寫）/ 停放（卸載了，但改過的 chunk 六層 payload 留在記憶體）/ 卸載（重算得回來）。
// 中央欄（0 ≤ cx < chunksX：舊生成器的輸出）恆常駐（pinned）。沒常駐的欄讀到 = 實心 STONE、牆 0、沒液體；寫入丟掉。
// 呼叫端一律走與儲存無關的 API（getter / window / forEachChunk / tileXY / readChunk…）；鍵見 engine/coords.ts。
import { CHUNK } from './constants';
import { tileKey, tileXY as keyToXY, chunkKey, chunkXY, chunkOfX, localX, X_LIMIT, type WorldBounds } from './coords';
import type { GenLayers } from './worldgen';
import type { GenGrid } from './gen/grid';
import { Column, COLUMN_LAYERS, variantHash, type ChunkData, type ColumnLayers, type ColumnSource } from './column';
import { SOLID_LUT, PLATFORM_LUT, CLIMB_LUT, T } from './tiles';
import { cloneStack, type Stack } from './inventory';
import { CHEST_SLOTS, type Drop } from './loot';
import { LIQ, LIQ_MAX } from './liquidKind';
import { EditJournal } from './edits';
export { LIQ, LIQ_MAX } from './liquidKind';
export { variantHash } from './column';
export type { ChunkData, ColumnSource, ColumnLayers } from './column';

export type ChestSlots = (Stack | null)[];
/** 生態區（每欄地表所屬；地下的過渡邊界另有起伏） */
export const BIOME = { FOREST: 0, DESERT: 1, SNOW: 2, JUNGLE: 3 } as const;
export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

/** 一個 chunk 的前景 / 背景牆（各 CHUNK*CHUNK，索引 ly*CHUNK + lx；存檔 payload） */
export interface ChunkPayload { fg: Uint8Array; wall: Uint8Array; }
/** flaggedTiles / setFlag 的旗標層 */
export type FlagLayer = 'frozen' | 'half';

/** 矩形批次讀取的扁平暫存（world.window）：索引 (y-y0)*w + (x-x0)；各層長度 ≥ w*h（重用時可能更長） */
export interface TileWindow {
  x0: number; y0: number; w: number; h: number;
  fg: Uint8Array; wall: Uint8Array; liquid: Uint8Array; liquidType: Uint8Array;
  frozen: Uint8Array; half: Uint8Array; variant: Uint8Array;
}

/** World 建構選項：邊界（預設 legacy = [0, width)）與中央以外的欄由誰生成（沒有 = 空氣） */
export interface WorldOptions { bounds?: WorldBounds; source?: ColumnSource | null; }

function allocWindow(n: number): TileWindow {
  return {
    x0: 0, y0: 0, w: 0, h: 0,
    fg: new Uint8Array(n), wall: new Uint8Array(n), liquid: new Uint8Array(n), liquidType: new Uint8Array(n),
    frozen: new Uint8Array(n), half: new Uint8Array(n), variant: new Uint8Array(n),
  };
}

/** 欄寬 / 一個 chunk 在欄內的位元組數 / 欄的層數（模組內的區域常數：熱迴圈不經 import 綁定讀取） */
const CW = CHUNK;
const CK = CHUNK * CHUNK;
const NL = COLUMN_LAYERS;
/** World.fromGen 建構中（中央整欄的 variant 由生成格複製，不必先算雜湊） */
let copyingGrid = false;
/** 上一欄快取的「沒有」值（不會是任何合法的欄號；取 Smi 範圍內的值，欄位維持整數表示） */
const NO_COL = 0x3fffffff;
/** 停放 / readChunk 的六層 */
const CHUNK_LAYERS = ['fg', 'wall', 'liquid', 'liquidType', 'frozen', 'half'] as const;

/** writeChunk 選項 */
export interface WriteChunkOpts { /** 編輯日誌把這個 chunk 標 full（預設 true；讀檔還原傳 false） */ journal?: boolean }

export class World {
  readonly width: number;
  readonly height: number;
  /** 水平邊界種類：legacy = [0, width)（左右實心牆）；infinite = ±X_LIMIT */
  readonly bounds: WorldBounds;
  /** 水平邊界（xMax 不含） */
  readonly xMin: number;
  readonly xMax: number;
  /** 中央區的 chunk 數（舊生成器的輸出：0 ≤ cx < chunksX） */
  readonly chunksX: number;
  readonly chunksY: number;
  /** 中央以外的欄由誰生成（null = 空氣） */
  readonly source: ColumnSource | null;
  /** 地表層 y（worldSurface）：此線以上、無牆、非擋光的格會發天空光 */
  surfaceY = 0;
  /** 中央每欄生成時的地表高度（地形 pass 的第一個實心格 y；之後玩家挖掘不改變）。HUD 深度用。系統走 surfaceAt(x) */
  surface: Int16Array;
  /** 岩層起始 y（泥土層之下；最深的那欄） */
  rockY = 0;
  /** 洞穴層（深層岩、大洞窟網路）起始 y（最淺的那欄） */
  cavernY = 0;
  /** 熔岩深淵起始 y（最淺的那欄） */
  moltenY = 0;
  /** 中央每欄地表的生態區（BIOME）；系統走 biomeAt(x) */
  readonly biome: Uint8Array;
  /** 中央每欄的深度層線（生成器填、DelveGame 建構時再設一次；沒有時 layersAt 用 rockY / cavernY / moltenY）。系統一律走 layersAt(x) */
  layers: GenLayers | null = null;
  /** 箱子內容：key = tile 鍵（world.idx） */
  readonly chests = new Map<number, ChestSlots>();
  /** 生成時指定的陶罐額外掉落（地城鑰匙），key = tile 鍵；由 seed 重算、不存檔 */
  readonly potDrops = new Map<number, Drop[]>();
  /** 已用金鑰匙打開的金寶箱（tile 鍵）——存檔內容 */
  readonly unlocked = new Set<number>();
  /** 累計用掉的鑰匙數（存檔內容） */
  keysUsed = 0;
  /** 需重畫的 chunk（render 用，drainDirty 取走） */
  private readonly dirty = new Set<number>();
  /** 生成後被改過的 chunk（存檔 diff 用；停放中的也在） */
  readonly modifiedChunks = new Set<number>();
  /** 液體有變動、要重畫液體層 / 小地圖的 chunk（drainLiquidDirty 取走；不影響 tile chunk 快取） */
  private readonly liquidDirty = new Set<number>();
  /** 生成後液體被改過的 chunk（存檔用；與 modifiedChunks 分開，流動不會讓 tile 被存） */
  readonly liquidModified = new Set<number>();
  /** 液體有變動的 chunk（網路同步用；drainNetLiquid 取走。與 renderer 的 liquidDirty 互不影響；卸載的欄刪掉） */
  private readonly netLiquid = new Set<number>();
  /** 前景 / 背景牆 / 半格與箱子的編輯日誌（chunk 鍵；touch / touchChest / writeChunk 記。讀檔還原、液體、結冰不記） */
  readonly edits = new EditJournal();
  /** 前景 tile 改變時的通知（液體模擬用來喚醒鄰格）；setFg 之後呼叫 */
  onTileChange: ((x: number, y: number) => void) | null = null;
  /** 前景 / 背景牆每改一格 +1（據點評分等快取用來判斷要不要重算） */
  rev = 0;

  // ── 欄儲存 ──────────────────────────────────────────
  /** 邊界內第一 / 最後一欄（含） */
  private readonly cxLo: number;
  private readonly cxHi: number;
  /** 常駐欄：slots[cx - cxLo]（沒常駐 = null）。點查詢先走上一欄快取，沒中才查這裡（不查 Map） */
  private readonly slots: (Column | null)[];
  /** 常駐欄號（排序後的快取：residentColumns / forEachChunk） */
  private readonly resident = new Set<number>();
  private sortedCols: number[] | null = null;
  /** pin() 的欄（中央欄不在這裡：恆常駐） */
  private readonly pinned = new Set<number>();
  private pinCache: Set<number> | null = null;
  /** 停放中的 chunk：chunk 鍵 → 六層 payload */
  private readonly parked = new Map<number, ChunkData>();
  private loadedEv: number[] = [];
  private unloadedEv: number[] = [];
  /** 載入時由停放蓋回來的 chunk 鍵（drainRestoredChunks 取走：液體要整塊喚醒） */
  private restoredEv: number[] = [];
  /** 上一次用到的欄（點查詢快取） */
  private lcx = NO_COL;
  private lcol: Column | null = null;

  /** 中央欄全部建立（空氣）並常駐；x ≥ width 的格（最後一欄的右半）有 source 時由 source 填 */
  constructor(width: number, height: number, opts: WorldOptions = {}) {
    this.width = width;
    this.height = height;
    this.bounds = opts.bounds ?? 'legacy';
    this.source = opts.source ?? null;
    if (this.bounds === 'infinite') { this.xMin = -X_LIMIT; this.xMax = X_LIMIT; } else { this.xMin = 0; this.xMax = width; }
    this.chunksX = Math.ceil(width / CHUNK);
    this.chunksY = Math.ceil(height / CHUNK);
    this.surface = new Int16Array(width);
    this.biome = new Uint8Array(width);
    this.cxLo = chunkOfX(this.xMin);
    this.cxHi = this.xMax > this.xMin ? chunkOfX(this.xMax - 1) : this.cxLo - 1;
    this.slots = new Array<Column | null>(Math.max(0, this.cxHi - this.cxLo + 1)).fill(null);
    for (let cx = 0; cx < this.chunksX; cx++) {
      if (cx < this.cxLo || cx > this.cxHi) continue;
      this.register(this.build(cx, false, !(copyingGrid && (cx + 1) * CW <= width)));
    }
  }

  /** 舊生成器的扁平格 → 欄儲存的世界：複製中央各層、箱子 / 陶罐 / 金寶箱、每欄陣列、深度層線與修改紀錄 */
  static fromGen(grid: GenGrid, layers: GenLayers, opts: WorldOptions = {}): World {
    // 中央的整欄由下面直接複製（含 variant），建構時不必先算座標雜湊
    copyingGrid = true;
    let w: World;
    try { w = new World(grid.width, grid.height, opts); } finally { copyingGrid = false; }
    const W = grid.width, H = grid.height;
    const src = [grid.fg, grid.wall, grid.liquid, grid.liquidType, grid.frozen, grid.half, grid.variant]
      .map((a) => new DataView(a.buffer, a.byteOffset, a.byteLength));
    for (let cx = 0; cx < w.chunksX; cx++) {
      const col = w.slots[cx - w.cxLo];
      if (!col) continue;
      const x0 = cx * CW, n = Math.min(CW, W - x0), stride = col.fg.length;
      for (let k = 0; k < NL; k++) copyRows(src[k], col.view, x0, k * stride, n, H, W, CW);
    }
    for (const [k, slots] of grid.chests) w.chests.set(k, slots.map((s) => (s ? cloneStack(s) : null)));
    for (const [k, d] of grid.potDrops) w.potDrops.set(k, d.map((q) => ({ ...q })));
    for (const k of grid.unlocked) w.unlocked.add(k);
    w.keysUsed = grid.keysUsed;
    w.surface.set(grid.surface);
    w.biome.set(grid.biome);
    w.surfaceY = grid.surfaceY;
    w.rockY = grid.rockY;
    w.cavernY = grid.cavernY;
    w.moltenY = grid.moltenY;
    w.layers = layers;
    w.rev = grid.rev;
    for (const k of grid.modifiedChunks) w.modifiedChunks.add(k);
    for (const k of grid.liquidModified) w.liquidModified.add(k);
    for (const k of grid.dirty) w.dirty.add(k);
    for (const k of grid.liquidDirty) w.liquidDirty.add(k);
    return w;
  }

  inBounds(x: number, y: number): boolean {
    return x >= this.xMin && y >= 0 && x < this.xMax && y < this.height;
  }
  /** (x,y) 的 tile 鍵（中央 = y*width + x；見 coords.ts） */
  idx(x: number, y: number): number { return tileKey(this.width, x, y); }
  /** tile 鍵 → 座標 */
  tileXY(k: number): { x: number; y: number } { return keyToXY(this.width, k); }

  // ── 欄：常駐 / 停放 / 卸載 ─────────────────────────────
  /** 第 cx 欄（常駐才回；上一欄快取：命中只要一次整數比較）。呼叫端已確認 cx 在邊界內 */
  private col(cx: number): Column | null {
    if (cx === this.lcx) return this.lcol;
    const c = this.slots[cx - this.cxLo];
    if (!c) return null;
    this.lcx = cx;
    this.lcol = c;
    return c;
  }
  /** x 所在的欄（常駐才回；邊界外 null） */
  columnAt(x: number): Column | null {
    if (x < this.xMin || x >= this.xMax) return null;
    return this.col(x >> 5);
  }
  isResident(cx: number): boolean {
    return cx >= this.cxLo && cx <= this.cxHi && this.slots[cx - this.cxLo] !== null;
  }
  /** 常駐欄號（升冪） */
  residentColumns(): number[] {
    if (!this.sortedCols) this.sortedCols = [...this.resident].sort((a, b) => a - b);
    return this.sortedCols.slice();
  }
  /** 常駐欄號的集合（唯讀、不複製；串流規劃用） */
  residentSet(): ReadonlySet<number> { return this.resident; }
  /** 中央欄或 pin() 過的欄：不卸載 */
  isPinned(cx: number): boolean {
    return (cx >= 0 && cx < this.chunksX) || this.pinned.has(cx);
  }
  /** 不卸載的欄（中央欄 + pin() 過的）；快取，pin / unpin 時重建 */
  pinnedSet(): ReadonlySet<number> {
    if (!this.pinCache) {
      const s = new Set<number>(this.pinned);
      for (let cx = Math.max(0, this.cxLo); cx < this.chunksX && cx <= this.cxHi; cx++) s.add(cx);
      this.pinCache = s;
    }
    return this.pinCache;
  }
  pin(cx: number): void { this.pinned.add(cx); this.pinCache = null; }
  unpin(cx: number): void { this.pinned.delete(cx); this.pinCache = null; }

  /** 讓第 cx 欄常駐：生成（source；沒有 source = 空氣）再蓋上停放的 chunk。中央欄恆常駐。邊界外丟 RangeError */
  ensureColumn(cx: number): Column {
    this.checkCx(cx);
    const have = this.slots[cx - this.cxLo];
    if (have) return have;
    const col = this.build(cx, true);
    this.register(col);
    this.loadedEv.push(cx);
    for (let cy = 0; cy < this.chunksY; cy++) this.dirty.add(this.chunkIndex(cx, cy));
    // 接縫：常駐的左右鄰欄邊上的 chunk 也重畫（之前那一側讀到的是「沒載入 = 石頭」）
    for (const n of [cx - 1, cx + 1]) {
      if (!this.isResident(n)) continue;
      for (let cy = 0; cy < this.chunksY; cy++) this.dirty.add(this.chunkIndex(n, cy));
    }
    return col;
  }
  /** 卸載第 cx 欄：pinned 的拒絕（回 false）；有改過的 chunk（modifiedChunks ∪ liquidModified）→ 停放 */
  unloadColumn(cx: number): boolean {
    if (this.isPinned(cx) || !this.isResident(cx)) return false;
    const col = this.slots[cx - this.cxLo]!;
    for (let cy = 0; cy < this.chunksY; cy++) {
      const k = this.chunkIndex(cx, cy);
      if (this.modifiedChunks.has(k) || this.liquidModified.has(k)) this.parked.set(k, extractChunk(col, cy));
      // 沒常駐的 chunk 不重畫（renderer 不烘焙卸載的欄）
      this.dirty.delete(k);
      this.liquidDirty.delete(k);
      this.netLiquid.delete(k);
    }
    this.slots[cx - this.cxLo] = null;
    this.resident.delete(cx);
    this.sortedCols = null;
    if (this.lcx === cx) { this.lcx = NO_COL; this.lcol = null; }
    this.unloadedEv.push(cx);
    return true;
  }
  /** 第 cx 欄的內容：常駐就回常駐的；否則暫時生成 + 蓋上停放的、不註冊（地圖用；回傳的欄別拿來寫） */
  peekColumn(cx: number): Column {
    this.checkCx(cx);
    return this.slots[cx - this.cxLo] ?? this.build(cx, false);
  }
  /**
   * (x,y) 的前景，但不載入任何欄（唯讀查詢用，例如重生點）：常駐讀常駐、停放讀停放、都不是就暫時生成那一欄（peekColumn，不註冊）。
   * 世界外同 getFg（STONE）
   */
  peekFg(x: number, y: number): number {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return T.STONE;
    const cx = x >> 5;
    if (this.isResident(cx)) return this.getFg(x, y);
    const p = this.parked.get(this.chunkIndex(cx, y >> 5));
    if (p) return p.fg[((y & 31) << 5) | (x & 31)];
    return this.peekColumn(cx).fg[(y << 5) | (x & 31)];
  }
  /** (cx, cy) chunk 的六層（常駐或停放；複本）。都不是 → null（網路層 / 存檔用） */
  readChunk(cx: number, cy: number): ChunkData | null {
    if (cy < 0 || cy >= this.chunksY) return null;
    const col = this.isResident(cx) ? this.slots[cx - this.cxLo]! : null;
    if (col) return extractChunk(col, cy);
    const p = this.parked.get(this.chunkIndex(cx, cy));
    if (!p) return null;
    return {
      fg: p.fg.slice(), wall: p.wall.slice(), liquid: p.liquid.slice(), liquidType: p.liquidType.slice(),
      frozen: p.frozen.slice(), half: p.half.slice(),
    };
  }
  /**
   * 覆寫 (cx, cy) chunk 的六層並標為已修改（欄沒常駐就先 ensure；邊界外的格丟掉）。
   * opts.journal = 編輯日誌把這個 chunk 標 full（預設 true；讀檔還原傳 false：還原不進日誌）
   */
  writeChunk(cx: number, cy: number, d: ChunkData, opts: WriteChunkOpts = {}): void {
    const journal = opts.journal ?? true;
    if (cy < 0 || cy >= this.chunksY || cx < this.cxLo || cx > this.cxHi) return;
    const col = this.ensureColumn(cx);
    const o = cy * CK, n = Math.min(CK, col.fg.length - o);
    for (const L of CHUNK_LAYERS) col[L].set(d[L].subarray(0, n), o);
    this.clearOutside(col, cy);
    const k = this.chunkIndex(cx, cy);
    this.parked.delete(k);
    this.modifiedChunks.add(k);
    this.liquidModified.add(k);
    this.dirty.add(k);
    this.liquidDirty.add(k);
    this.netLiquid.add(k);
    if (journal) this.edits.markFull(k);
    if (cx > this.cxLo) this.dirty.add(this.chunkIndex(cx - 1, cy));
    if (cx < this.cxHi) this.dirty.add(this.chunkIndex(cx + 1, cy));
    if (cy > 0) this.dirty.add(this.chunkIndex(cx, cy - 1));
    if (cy < this.chunksY - 1) this.dirty.add(this.chunkIndex(cx, cy + 1));
    this.rev++;
  }
  /** 停放中的 chunk 鍵 */
  parkedChunks(): number[] { return [...this.parked.keys()]; }
  /**
   * 直接停放 (cx, cy) chunk 的六層（讀檔用：離所有 actor 都遠的外圍欄不必生成、不常駐；之後載入時才蓋回來）。
   * 欄常駐中 / 邊界外 → 不做（回 false）。不標修改——呼叫端依存檔內容自己加 modifiedChunks / liquidModified。
   */
  parkChunk(cx: number, cy: number, d: ChunkData): boolean {
    if (cy < 0 || cy >= this.chunksY || cx < this.cxLo || cx > this.cxHi || this.isResident(cx)) return false;
    this.parked.set(this.chunkIndex(cx, cy), d);
    return true;
  }
  /** 取走並清空「載入時由停放蓋回來的 chunk」 */
  drainRestoredChunks(): number[] {
    const out = this.restoredEv;
    this.restoredEv = [];
    return out;
  }
  /** 取走並清空「載入 / 卸載了哪些欄」（建構時的中央欄不算） */
  drainColumnEvents(): { loaded: number[]; unloaded: number[] } {
    const out = { loaded: this.loadedEv, unloaded: this.unloadedEv };
    this.loadedEv = [];
    this.unloadedEv = [];
    return out;
  }

  private checkCx(cx: number): void {
    if (!(cx >= this.cxLo && cx <= this.cxHi)) throw new RangeError(`column ${cx} outside world bounds`);
  }
  private register(col: Column): void {
    this.slots[col.cx - this.cxLo] = col;
    this.resident.add(col.cx);
    this.sortedCols = null;
  }
  /** 生成第 cx 欄：source 填中央以外、邊界內的格；再蓋上停放的 chunk（consume = 用完從停放清單拿掉） */
  private build(cx: number, consume: boolean, hashVariant = true): Column {
    const col = new Column(cx, this.height, hashVariant);
    const src = this.source;
    if (src) {
      const x0 = Math.max(cx * CHUNK, this.xMin), x1 = Math.min(cx * CHUNK + CHUNK, this.xMax);
      // 中央區 [0, width) 由舊生成器負責：只填它左右兩邊
      if (x0 < Math.min(x1, 0)) src.fill(col, x0, Math.min(x1, 0));
      const r0 = Math.max(x0, this.width);
      if (r0 < x1) src.fill(col, r0, x1);
    }
    if (this.parked.size) {
      for (let cy = 0; cy < this.chunksY; cy++) {
        const k = this.chunkIndex(cx, cy), p = this.parked.get(k);
        if (!p) continue;
        const o = cy * CK, n = Math.min(CK, col.fg.length - o);
        for (const L of CHUNK_LAYERS) col[L].set(p[L].subarray(0, n), o);
        if (consume) { this.parked.delete(k); this.restoredEv.push(k); }
      }
    }
    return col;
  }
  /** 欄 col 的第 cy 個 chunk 裡、水平邊界外的格清成 0（legacy 世界最後一欄的右半） */
  private clearOutside(col: Column, cy: number): void {
    const x0 = col.cx * CHUNK;
    const a = Math.max(0, this.xMin - x0), b = Math.min(CHUNK, this.xMax - x0);
    if (a <= 0 && b >= CHUNK) return;
    const y1 = Math.min(cy * CHUNK + CHUNK, this.height);
    for (let y = cy * CHUNK; y < y1; y++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        if (lx >= a && lx < b) continue;
        const i = (y << 5) | lx;
        for (const L of CHUNK_LAYERS) col[L][i] = 0;
      }
    }
  }

  // ── 每欄資料（中央讀陣列；中央以外有 source 時問 source） ──
  /** 第 x 欄的地表高度（中央以外：有 source 問 source，否則夾到邊欄）。 */
  surfaceAt(x: number): number {
    if (this.width === 0) return this.surfaceY;
    const fx = Math.floor(x);
    if (this.source !== null && (fx < 0 || fx >= this.width)) return this.source.surfaceAt(fx);
    return this.surface[Math.max(0, Math.min(this.width - 1, fx))];
  }
  /** 第 x 欄地表的生態區 */
  biomeAt(x: number): number {
    if (this.width === 0) return BIOME.FOREST;
    const fx = Math.floor(x);
    if (this.source !== null && (fx < 0 || fx >= this.width)) return this.source.biomeAt(fx);
    return this.biome[Math.max(0, Math.min(this.width - 1, fx))];
  }
  /** 第 x 欄的深度層線（中央以外：有 source 問 source，否則夾到邊欄） */
  layersAt(x: number): ColumnLayers {
    const fx = Math.floor(x);
    if (this.source !== null && this.width > 0 && (fx < 0 || fx >= this.width)) return this.source.layersAt(fx);
    const L = this.layers;
    if (!L || this.width === 0) return { rock: this.rockY, deep: this.cavernY, molten: this.moltenY };
    const cx = Math.max(0, Math.min(this.width - 1, fx));
    return { rock: L.rock[cx], deep: L.deep[cx], molten: L.molten[cx] };
  }

  // ── 點查詢 ────────────────────────────────────────────
  getFg(x: number, y: number): number {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return T.STONE;
    const c = this.col(x >> 5);
    return c === null ? T.STONE : c.fg[(y << 5) | (x & 31)];
  }
  getWall(x: number, y: number): number {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return 0;
    const c = this.col(x >> 5);
    return c === null ? 0 : c.wall[(y << 5) | (x & 31)];
  }
  /** 碰撞用：左右與下方邊界、沒常駐的欄視為實心，上方（天空）可穿。 */
  isSolid(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax || y >= this.height) return true;
    const c = this.col(x >> 5);
    if (c === null) return true;
    if (y < 0) return false;
    const i = (y << 5) | (x & 31);
    return SOLID_LUT[c.fg[i]] === 1 || c.frozen[i] === 1;
  }

  /** 半格方塊（只有下半部實心；物理 / 繪製用） */
  isHalf(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return false;
    const c = this.col(x >> 5);
    return c !== null && c.half[(y << 5) | (x & 31)] === 1;
  }
  /** 設定 / 取消半格（只對實心方塊）；回傳是否有改變 */
  setHalf(x: number, y: number, on: boolean): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.col(x >> 5);
    if (c === null) return false;
    const i = (y << 5) | (x & 31);
    const v = on && SOLID_LUT[c.fg[i]] === 1 ? 1 : 0;
    if (c.half[i] === v) return false;
    c.half[i] = v;
    this.touch(x, y);
    return true;
  }

  /** 是否結冰（越界 / 沒常駐 false） */
  isFrozen(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return false;
    const c = this.col(x >> 5);
    return c !== null && c.frozen[(y << 5) | (x & 31)] === 1;
  }
  /** 設定 / 取消結冰（霜系統用；不標 dirty——呼叫端自己決定重畫哪些 chunk） */
  setFrozen(x: number, y: number, on: boolean): void {
    if (!this.inBounds(x, y)) return;
    const c = this.col(x >> 5);
    if (c !== null) c.frozen[(y << 5) | (x & 31)] = on ? 1 : 0;
  }
  /** (x,y) 的材質變體 0..2（世界外 / 沒常駐照座標雜湊——同一個雜湊） */
  variantAt(x: number, y: number): number {
    if (!this.inBounds(x, y)) return variantHash(x, y);
    const c = this.col(x >> 5);
    return c === null ? variantHash(x, y) : c.variant[(y << 5) | (x & 31)];
  }

  /**
   * 把矩形 [x0, x0+w) × [y0, y0+h) 的各層複製進扁平暫存（批次讀取：光照、烘焙、地圖…）。
   * 逐欄逐列 set(subarray) 複製列段。世界外 / 沒常駐的格：fg = STONE、其餘 0、variant 照座標雜湊（同 getter）。out 夠大就重用、不配置。
   */
  window(x0: number, y0: number, w: number, h: number, out?: TileWindow): TileWindow {
    const n = w * h;
    const win = out && out.fg.length >= n ? out : allocWindow(n);
    win.x0 = x0; win.y0 = y0; win.w = w; win.h = h;
    const ya = Math.max(y0, 0), yb = Math.min(y0 + h, this.height);
    // 世界上下以外的列
    for (let r = 0; r < h; r++) {
      const y = y0 + r;
      if (y < ya || y >= yb) fillOutside(win, r * w, x0, y, 0, w);
    }
    if (ya >= yb) return win;
    const ex = x0 + w, xMin = this.xMin, xMax = this.xMax;
    const dviews = windowViews(win);
    let sx = x0;
    while (sx < ex) {
      // 列段 [sx, se)：同一欄、同一邊（世界內 / 外）
      const cx = sx >> 5;
      let se = Math.min(ex, (cx + 1) << 5);
      const inside = sx >= xMin && sx < xMax;
      if (sx < xMin && se > xMin) se = xMin;
      if (inside && se > xMax) se = xMax;
      const c = inside ? this.col(cx) : null;
      const from = sx - x0, len = se - sx;
      if (c === null) {
        for (let y = ya; y < yb; y++) fillOutside(win, (y - y0) * w, x0, y, from, from + len);
      } else {
        // 列段很短（≤ 32 bytes）：逐段 set(subarray) 的呼叫成本比複製本身高，改用 DataView 4 bytes 一次（不對齊也可以）
        const sv = c.view, stride = c.fg.length, s0 = (ya << 5) | (sx & 31), d0 = (ya - y0) * w + from, rows = yb - ya;
        if (len === CW && w === CW) {
          // 整欄寬、window 也是 32 寬（chunk 烘焙）：來源與目的都連續，一層一次 set
          const L = [c.fg, c.wall, c.liquid, c.liquidType, c.frozen, c.half, c.variant];
          const D = [win.fg, win.wall, win.liquid, win.liquidType, win.frozen, win.half, win.variant];
          for (let k = 0; k < NL; k++) D[k].set(L[k].subarray(s0, s0 + rows * CW), d0);
        } else for (let k = 0; k < NL; k++) {
          if (len === CW) copyRows32(sv, dviews[k], k * stride + s0, d0, rows, w);
          else copyRows(sv, dviews[k], k * stride + s0, d0, len, rows, CW, w);
        }
      }
      sx = se;
    }
    return win;
  }

  // ── chunk payload（存檔讀寫） ─────────────────────────
  /** (cx, cy) chunk 的前景 / 背景牆（常駐或停放；世界外 / 都不是的格補 0）。 */
  readChunkPayload(cx: number, cy: number): ChunkPayload {
    const fg = new Uint8Array(CK), wall = new Uint8Array(CK);
    if (cy < 0 || cy >= this.chunksY) return { fg, wall };
    const col = this.isResident(cx) ? this.slots[cx - this.cxLo]! : null;
    if (col) {
      const o = cy * CK, e = Math.min(o + CK, col.fg.length);
      fg.set(col.fg.subarray(o, e));
      wall.set(col.wall.subarray(o, e));
      return { fg, wall };
    }
    const p = this.parked.get(this.chunkIndex(cx, cy));
    if (p) { fg.set(p.fg); wall.set(p.wall); }
    return { fg, wall };
  }
  /**
   * 直接覆寫 (cx, cy) chunk 的前景 / 背景牆並標為已修改（不經 setFg：不逐格 touch、不動箱子 / 半格 / 結冰）。
   * maxX（不含）之後的格不寫（省略 = 整塊）；世界外的格丟掉；欄沒常駐就先 ensure。
   */
  writeChunkPayload(cx: number, cy: number, p: ChunkPayload, maxX?: number): void {
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const ax = Math.max(x0, this.xMin), bx = Math.min(x0 + CHUNK, this.xMax, maxX ?? Infinity), by = Math.min(y0 + CHUNK, this.height);
    if (bx > ax && y0 < this.height && y0 + CHUNK > 0) {
      const col = this.ensureColumn(cx);
      const lx = ax - x0, n = bx - ax;
      for (let y = Math.max(y0, 0); y < by; y++) {
        const s = (y - y0) * CHUNK + lx, d = (y << 5) | lx;
        col.fg.set(p.fg.subarray(s, s + n), d);
        col.wall.set(p.wall.subarray(s, s + n), d);
      }
    }
    this.modifiedChunks.add(this.chunkIndex(cx, cy));
  }
  /** (cx, cy) chunk 的液體量 / 種類寫進 out[offset .. offset + CHUNK*CHUNK)（索引 ly*CHUNK + lx；世界外、量 0 的種類補 0） */
  readChunkLiquids(cx: number, cy: number, outAmount: Uint8Array, outType: Uint8Array, offset: number): void {
    outAmount.fill(0, offset, offset + CK); outType.fill(0, offset, offset + CK);
    if (cy < 0 || cy >= this.chunksY) return;
    let L: Uint8Array, LT: Uint8Array, base: number;
    const col = this.isResident(cx) ? this.slots[cx - this.cxLo]! : null;
    if (col) { L = col.liquid; LT = col.liquidType; base = cy * CK; } else {
      const p = this.parked.get(this.chunkIndex(cx, cy));
      if (!p) return;
      L = p.liquid; LT = p.liquidType; base = 0;
    }
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    const ax = Math.max(x0, this.xMin), bx = Math.min(x0 + CHUNK, this.xMax), rows = Math.min(CHUNK, this.height - y0);
    for (let ly = 0; ly < rows; ly++) {
      for (let x = ax; x < bx; x++) {
        const lx = x - x0, i = base + ly * CHUNK + lx, a = L[i], o = offset + ly * CHUNK + lx;
        outAmount[o] = a; outType[o] = a ? LT[i] : 0;
      }
    }
  }
  /** 旗標層（結冰 / 半格）為 1 的所有 tile 鍵（常駐 + 停放），升冪（存檔差分編碼用） */
  flaggedTiles(layer: FlagLayer): number[] {
    const out: number[] = [];
    const H = this.height;
    const scan = (F: Uint8Array, cx: number, from: number, to: number): void => {
      const x0 = cx * CHUNK;
      for (let i = from; i < to; i++) {
        if (!F[i]) continue;
        const y = i >> 5, x = x0 + (i & 31);
        if (y < H && x >= this.xMin && x < this.xMax) out.push(this.idx(x, y));
      }
    };
    for (const cx of this.residentColumns()) scan(this.slots[cx - this.cxLo]![layer], cx, 0, CHUNK * H);
    for (const [k, p] of this.parked) {
      const { cx, cy } = this.chunkCoords(k);
      if (this.isResident(cx)) continue;
      // 停放 payload 的索引 ly*32 + lx = 欄內索引 − cy*1024
      const F = p[layer], x0 = cx * CHUNK;
      for (let j = 0; j < CK; j++) {
        if (!F[j]) continue;
        const y = cy * CHUNK + (j >> 5), x = x0 + (j & 31);
        if (y < H && x >= this.xMin && x < this.xMax) out.push(this.idx(x, y));
      }
    }
    return out.sort((a, b) => a - b);
  }
  /** 直接設定旗標層的一格（讀檔還原用；不夾值、不 touch；世界外 / 沒常駐忽略） */
  setFlag(layer: FlagLayer, x: number, y: number, on: boolean): void {
    if (!this.inBounds(x, y)) return;
    const c = this.col(x >> 5);
    if (c !== null) c[layer][(y << 5) | (x & 31)] = on ? 1 : 0;
  }

  /** 單向平台（物理用） */
  isPlatform(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return false;
    const c = this.col(x >> 5);
    return c !== null && PLATFORM_LUT[c.fg[(y << 5) | (x & 31)]] === 1;
  }

  /** 可攀爬（繩索；物理用） */
  isClimbable(x: number, y: number): boolean {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return false;
    const c = this.col(x >> 5);
    return c !== null && CLIMB_LUT[c.fg[(y << 5) | (x & 31)]] === 1;
  }

  setFg(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.col(x >> 5);
    if (c === null) return false;
    const i = (y << 5) | (x & 31);
    const old = c.fg[i];
    if (old === id) return false;
    c.fg[i] = id;
    c.half[i] = 0;
    if (c.frozen[i] && SOLID_LUT[id] === 1) c.frozen[i] = 0;
    const isChest = id === T.CHEST || id === T.LOCKED_CHEST;
    if ((old === T.CHEST || old === T.LOCKED_CHEST) && !isChest) this.chests.delete(this.idx(x, y));
    if (isChest) {
      const k = this.idx(x, y);
      if (!this.chests.has(k)) this.chests.set(k, new Array<Stack | null>(CHEST_SLOTS).fill(null));
    }
    this.touch(x, y);
    this.onTileChange?.(x, y);
    return true;
  }

  // ── 液體 ─────────────────────────────────────────────
  /** (x,y) 的液體量（越界 / 沒常駐 0） */
  getLiquid(x: number, y: number): number {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return 0;
    const c = this.col(x >> 5);
    return c === null ? 0 : c.liquid[(y << 5) | (x & 31)];
  }
  /** (x,y) 的液體種類（LIQ.*；越界 / 沒常駐 / 沒有液體 = LIQ.NONE） */
  getLiquidType(x: number, y: number): number {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return LIQ.NONE;
    const c = this.col(x >> 5);
    return c === null ? LIQ.NONE : c.liquidType[(y << 5) | (x & 31)];
  }
  /** 設定液體（量夾到 0..255；量 0 → 種類清成 NONE）。標記液體 dirty / 已修改 chunk。回傳是否有改變。 */
  setLiquid(x: number, y: number, amount: number, type: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.col(x >> 5);
    if (c === null) return false;
    const i = (y << 5) | (x & 31);
    const a = Math.max(0, Math.min(LIQ_MAX, Math.round(amount)));
    const t = a === 0 ? LIQ.NONE : type;
    if (c.liquid[i] === a && c.liquidType[i] === t) return false;
    c.liquid[i] = a;
    c.liquidType[i] = t;
    this.touchLiquidAt(x, y);
    return true;
  }
  /** 直接寫液體（模擬熱路徑用；不夾值、不標 dirty——寫完自己 touchLiquidAt；量 0 時種類請給 LIQ.NONE） */
  setLiquidRaw(x: number, y: number, amount: number, type: number): void {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return;
    const c = this.col(x >> 5);
    if (c === null) return;
    const i = (y << 5) | (x & 31);
    c.liquid[i] = amount;
    c.liquidType[i] = type;
  }
  /** tile 鍵 i 的液體已直接改寫（模擬熱路徑用）：標記 dirty / 已修改 */
  touchLiquid(i: number): void {
    const { x, y } = this.tileXY(i);
    this.touchLiquidAt(x, y);
  }
  /** (x,y) 的液體已直接改寫：標記液體 dirty / 已修改 chunk（沒常駐的欄寫不進去，不標） */
  touchLiquidAt(x: number, y: number): void {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return;
    if (this.col(x >> 5) === null) return;
    const ci = this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
    this.liquidDirty.add(ci);
    this.liquidModified.add(ci);
    this.netLiquid.add(ci);
  }
  /** (x,y) 的液體層要重畫（不標已修改：外圍的結冰由日期重算，不必存 / 停放） */
  markLiquidDirty(x: number, y: number): void {
    if (x < this.xMin || x >= this.xMax || y < 0 || y >= this.height) return;
    if (this.col(x >> 5) === null) return;
    const ci = this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
    this.liquidDirty.add(ci);
    this.netLiquid.add(ci);
  }
  /** 取走並清空液體 dirty chunk 清單 */
  drainLiquidDirty(): number[] {
    const out = [...this.liquidDirty];
    this.liquidDirty.clear();
    return out;
  }
  /** 取走並清空網路用的液體 dirty chunk 清單（不影響 drainLiquidDirty） */
  drainNetLiquid(): number[] {
    const out = [...this.netLiquid];
    this.netLiquid.clear();
    return out;
  }
  /** 液體總量（常駐欄；測試 / debug） */
  liquidTotal(type?: number): number {
    let s = 0;
    for (const cx of this.resident) {
      const c = this.slots[cx - this.cxLo]!, L = c.liquid, LT = c.liquidType;
      for (let i = 0; i < L.length; i++) if (L[i] && (type === undefined || LT[i] === type)) s += L[i];
    }
    return s;
  }
  /** (x,y) 的 chunk 標為已修改（箱子內容變動等不改 tile 的修改；不需重畫） */
  markModified(x: number, y: number): void {
    if (!this.inBounds(x, y) || this.col(x >> 5) === null) return;
    this.modifiedChunks.add(this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK)));
  }
  /** (x,y) 的箱子內容 / 解鎖變了：markModified 再記一筆箱子項目（tile 鍵）。沒常駐 = 什麼都不做 */
  touchChest(x: number, y: number): void {
    if (!this.inBounds(x, y) || this.col(x >> 5) === null) return;
    const ci = this.chunkIndex(chunkOfX(x), Math.floor(y / CHUNK));
    this.modifiedChunks.add(ci);
    this.edits.chest(ci, this.idx(x, y));
  }
  setWall(x: number, y: number, id: number): boolean {
    if (!this.inBounds(x, y)) return false;
    const c = this.col(x >> 5);
    if (c === null) return false;
    const i = (y << 5) | (x & 31);
    if (c.wall[i] === id) return false;
    c.wall[i] = id;
    this.touch(x, y);
    return true;
  }

  /** chunk 鍵（中央 = cy*chunksX + cx；見 coords.ts） */
  chunkIndex(cx: number, cy: number): number { return chunkKey(this.chunksX, cx, cy); }
  chunkCoords(ci: number): { cx: number; cy: number } { return chunkXY(this.chunksX, ci); }
  /** 走過每個常駐 chunk（cy 外層、cx 內層（升冪）；同 markAllDirty 的順序） */
  forEachChunk(fn: (cx: number, cy: number) => void): void {
    const cols = this.residentColumns();
    for (let cy = 0; cy < this.chunksY; cy++) for (const cx of cols) fn(cx, cy);
  }

  /** 取走並清空 dirty chunk 清單。 */
  drainDirty(): number[] {
    const out = [...this.dirty];
    this.dirty.clear();
    return out;
  }
  /** 常駐的 chunk 全部標 dirty（載入/新世界後讓 render 全重畫）。 */
  markAllDirty(): void {
    this.forEachChunk((cx, cy) => this.dirty.add(this.chunkIndex(cx, cy)));
  }

  private touch(x: number, y: number): void {
    this.rev++;
    const cx = chunkOfX(x), cy = Math.floor(y / CHUNK);
    const ci = this.chunkIndex(cx, cy);
    this.modifiedChunks.add(ci);
    this.dirty.add(ci);
    // 接邊依賴 4 鄰：邊緣格變動也要讓鄰 chunk 重畫（鄰欄夾在邊界內；有界世界與扁平時代相同）
    const lx = localX(x), ly = y - cy * CHUNK;
    const left = lx === 0 && cx > this.cxLo, right = lx === CHUNK - 1 && cx < this.cxHi;
    const up = ly === 0 && cy > 0, down = ly === CHUNK - 1 && cy < this.chunksY - 1;
    if (left) this.dirty.add(this.chunkIndex(cx - 1, cy));
    if (right) this.dirty.add(this.chunkIndex(cx + 1, cy));
    if (up) this.dirty.add(this.chunkIndex(cx, cy - 1));
    if (down) this.dirty.add(this.chunkIndex(cx, cy + 1));
    // 內角補點看斜角鄰格：角落格變動也要讓斜對角 chunk 重畫
    const dxc = left ? -1 : right ? 1 : 0;
    const dyc = up ? -1 : down ? 1 : 0;
    if (dxc && dyc) this.dirty.add(this.chunkIndex(cx + dxc, cy + dyc));
    // 編輯日誌：改完之後的狀態（呼叫端剛寫過這一欄，col 走上一欄快取）
    const c = this.col(cx)!, i = (y << 5) | lx;
    this.edits.record(ci, x, y, c.fg[i], c.wall[i], c.half[i]);
  }
}

/** 欄 col 的第 cy 個 chunk 六層（複本；最後一列 chunk 超出 height 的部分補 0） */
function extractChunk(col: Column, cy: number): ChunkData {
  const o = cy * CK, e = Math.min(o + CK, col.fg.length);
  const take = (a: Uint8Array): Uint8Array => { const b = new Uint8Array(CK); b.set(a.subarray(o, e)); return b; };
  return {
    fg: take(col.fg), wall: take(col.wall), liquid: take(col.liquid), liquidType: take(col.liquidType),
    frozen: take(col.frozen), half: take(col.half),
  };
}

/** window 各層的 DataView（同一個 out 重用時沿用；層的 buffer 換了就重建） */
const winViews = new WeakMap<TileWindow, { fg: Uint8Array; views: DataView[] }>();
function windowViews(win: TileWindow): DataView[] {
  const hit = winViews.get(win);
  if (hit && hit.fg === win.fg) return hit.views;
  const views = [win.fg, win.wall, win.liquid, win.liquidType, win.frozen, win.half, win.variant]
    .map((a) => new DataView(a.buffer, a.byteOffset, a.byteLength));
  winViews.set(win, { fg: win.fg, views });
  return views;
}
/** rows 列、每列 len bytes：來源列距 ss、目的列距 ds（DataView 4 bytes 一次，不對齊也可以） */
function copyRows(src: DataView, dst: DataView, s: number, d: number, len: number, rows: number, ss: number, ds: number): void {
  const n4 = len & ~3;
  for (let r = 0; r < rows; r++, s += ss, d += ds) {
    let k = 0;
    for (; k < n4; k += 4) dst.setUint32(d + k, src.getUint32(s + k, true), true);
    for (; k < len; k++) dst.setUint8(d + k, src.getUint8(s + k));
  }
}
/** 欄 → window 的整欄寬（32 bytes）版：展開成 8 次 4 bytes（來源列距 32、目的列距 w） */
function copyRows32(src: DataView, dst: DataView, s: number, d: number, rows: number, w: number): void {
  for (let r = 0; r < rows; r++, s += CW, d += w) {
    dst.setUint32(d, src.getUint32(s, true), true); dst.setUint32(d + 4, src.getUint32(s + 4, true), true);
    dst.setUint32(d + 8, src.getUint32(s + 8, true), true); dst.setUint32(d + 12, src.getUint32(s + 12, true), true);
    dst.setUint32(d + 16, src.getUint32(s + 16, true), true); dst.setUint32(d + 20, src.getUint32(s + 20, true), true);
    dst.setUint32(d + 24, src.getUint32(s + 24, true), true); dst.setUint32(d + 28, src.getUint32(s + 28, true), true);
  }
}

/** window 的世界外 / 沒常駐的格：fg = STONE、其餘 0、variant 照座標雜湊（列內 [from, to)） */
function fillOutside(win: TileWindow, o: number, x0: number, y: number, from: number, to: number): void {
  win.fg.fill(T.STONE, o + from, o + to);
  win.wall.fill(0, o + from, o + to);
  win.liquid.fill(0, o + from, o + to);
  win.liquidType.fill(0, o + from, o + to);
  win.frozen.fill(0, o + from, o + to);
  win.half.fill(0, o + from, o + to);
  for (let c = from; c < to; c++) win.variant[o + c] = variantHash(x0 + c, y);
}
